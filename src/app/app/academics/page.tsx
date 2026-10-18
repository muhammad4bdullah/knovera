import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCurriculumAction,
  createOutcomeAction,
  createPaperAction,
  createQuestionAction,
  importSyllabusCsvAction,
  publishPaperAction,
  reviewQuestionAction,
  saveAnswerKeyAction,
} from "./actions";
import { signOutAction } from "@/app/auth/actions";

type Props = {
  searchParams: Promise<{ organization?: string; error?: string; compareFrom?: string; compareTo?: string }>;
};

export const instant = false;

const errors: Record<string, string> = {
  curriculum: "Could not create the curriculum. Check your role and the database policies.",
  outcome: "Could not save the learning outcome. Check its fields and curriculum.",
  question: "Could not save the question. Check its outcome, fields and staff role.",
  "answer-key": "The question was saved, but its answer key was not. Contact an administrator before using that question.",
  "outcome-import": "The outcome CSV could not be imported. Check the required headers, row values, duplicate codes, and file size (maximum 1 MB).",
  review: "The question could not be reviewed. It may already have changed.",
  paper: "The paper was not completed. Check that selected questions are reviewed and their marks match the target.",
  publish: "The paper version could not be published. Check the database validation message and try again.",
};

type SnapshotQuestion = {
  question_id: string;
  title: string;
  prompt: string;
  marks: number;
};

type OutcomeRecord = {
  code: string;
  subject: string;
  topic: string;
  statement: string;
  description: string;
};

type OutcomeChange = {
  status: "added" | "removed" | "changed";
  code: string;
  before?: OutcomeRecord;
  after?: OutcomeRecord;
  fields: (keyof OutcomeRecord)[];
};

function compareOutcomes(previous: OutcomeRecord[], current: OutcomeRecord[]): OutcomeChange[] {
  const previousByCode = new Map(previous.map((outcome) => [outcome.code.toUpperCase(), outcome]));
  const currentByCode = new Map(current.map((outcome) => [outcome.code.toUpperCase(), outcome]));
  const changes: OutcomeChange[] = [];

  for (const [code, outcome] of currentByCode) {
    const before = previousByCode.get(code);
    if (!before) {
      changes.push({ status: "added", code, after: outcome, fields: [] });
      continue;
    }
    const fields: (keyof OutcomeRecord)[] = (["subject", "topic", "statement", "description"] as const)
      .filter((field) => before[field] !== outcome[field]);
    if (fields.length) changes.push({ status: "changed", code, before, after: outcome, fields });
    previousByCode.delete(code);
  }
  for (const [code, outcome] of previousByCode) {
    changes.push({ status: "removed", code, before: outcome, fields: [] });
  }
  return changes.sort((left, right) => left.code.localeCompare(right.code));
}

function isSnapshotQuestion(value: unknown): value is SnapshotQuestion {
  if (typeof value !== "object" || value === null) return false;
  const question = value as Record<string, unknown>;
  return typeof question.question_id === "string"
    && typeof question.title === "string"
    && typeof question.prompt === "string"
    && typeof question.marks === "number";
}

export default async function AcademicsPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <SetupRequired />;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return <main className="auth-page"><section className="auth-card"><h1>Sign in required</h1><Link href="/login">Sign in</Link></section></main>;

  const { data: memberships, error: membershipError } = await supabase.from("organization_memberships")
    .select("organization_id, role").eq("user_id", user.id).is("removed_at", null);
  if (membershipError) return <LoadError message={membershipError.message} />;
  const organizationIds = (memberships ?? []).map((membership) => membership.organization_id);
  const organizationsResult = organizationIds.length
    ? await supabase.from("organizations").select("id, name").in("id", organizationIds).order("created_at")
    : { data: [], error: null };
  if (organizationsResult.error) return <LoadError message={organizationsResult.error.message} />;
  const organizations = organizationsResult.data ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === query.organization) ?? organizations[0];
  const role = memberships?.find((membership) => membership.organization_id === selectedOrganization?.id)?.role;
  const canManageCurriculum = ["owner", "administrator", "academic_coordinator"].includes(role ?? "");
  const canManageQuestions = ["owner", "administrator", "academic_coordinator", "teacher"].includes(role ?? "");
  const organizationId = selectedOrganization?.id;

  const [curriculaResult, outcomesResult, questionsResult, papersResult] = organizationId
    ? await Promise.all([
      supabase.from("curricula").select("id, title, version_label").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      supabase.from("learning_outcomes").select("id, curriculum_id, code, subject, topic, statement, description").eq("organization_id", organizationId).order("code"),
      canManageQuestions
        ? supabase.from("questions").select("id, outcome_id, title, question_type, difficulty, marks, prompt, review_status, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      canManageQuestions
        ? supabase.from("papers").select("id, title, subject, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    : [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
  const dataError = curriculaResult.error ?? outcomesResult.error ?? questionsResult.error ?? papersResult.error;
  if (dataError) return <LoadError message={dataError.message} />;
  const curricula = curriculaResult.data ?? [];
  const outcomes = outcomesResult.data ?? [];
  const sourceCurriculum = curricula.find((curriculum) => curriculum.id === query.compareFrom);
  const targetCurriculum = curricula.find((curriculum) => curriculum.id === query.compareTo);
  const syllabusChanges = sourceCurriculum && targetCurriculum && sourceCurriculum.id !== targetCurriculum.id
    ? compareOutcomes(
      outcomes.filter((outcome) => outcome.curriculum_id === sourceCurriculum.id),
      outcomes.filter((outcome) => outcome.curriculum_id === targetCurriculum.id),
    )
    : null;
  const questions = questionsResult.data ?? [];
  const papers = papersResult.data ?? [];
  const questionIds = questions.map((question) => question.id);
  const paperIds = papers.map((paper) => paper.id);
  const [keysResult, versionsResult] = organizationId && canManageQuestions
    ? await Promise.all([
      questionIds.length
        ? supabase.from("question_answer_keys").select("question_id, answer_text").eq("organization_id", organizationId).in("question_id", questionIds)
        : Promise.resolve({ data: [], error: null }),
      paperIds.length
        ? supabase.from("paper_versions").select("id, paper_id, version_number, status, target_marks, question_snapshot, published_at").eq("organization_id", organizationId).in("paper_id", paperIds).order("version_number", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (keysResult.error || versionsResult.error) return <LoadError message={keysResult.error?.message ?? versionsResult.error?.message ?? "Academic data could not be loaded."} />;

  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const keyByQuestion = new Map((keysResult.data ?? []).map((key) => [key.question_id, key.answer_text]));
  const versionsByPaper = new Map<string, typeof versionsResult.data>();
  for (const version of versionsResult.data ?? []) {
    versionsByPaper.set(version.paper_id, [...(versionsByPaper.get(version.paper_id) ?? []), version]);
  }

  return (
    <main className="workspace-home">
      <header className="workspace-home-header"><Link className="auth-brand" href="/app"><span className="brand-mark">k</span><span>knovera</span></Link><div><span>{user.email}</span><form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form></div></header>
      <section className="workspace-home-main">
        <p className="eyebrow">SYLLABUSGRAPH · PAPERFORGE</p>
        <h1>Academic workspace</h1>
        <p className="page-subtitle">Curricula, outcomes, questions, answer keys, and published paper snapshots are stored in your organization database. Access is enforced by Supabase row-level security.</p>
        <nav className="workflow-links"><Link href="/app">Organizations</Link><Link href="/app/classes">Classes</Link><Link href="/app/assignments">Assignments</Link><Link href="/app/projects">Projects</Link><Link href={`/app/reports${organizationId ? `?organization=${organizationId}` : ""}`}>Reports</Link></nav>
        {organizations.length > 1 && <form method="get" className="organization-select-form"><label>Organization<select name="organization" defaultValue={organizationId}>{organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}</select></label><button className="button button-outline button-small">Switch organization</button></form>}
        {!selectedOrganization && <section className="panel workspace-panel"><h2>Create an organization first</h2><p>Your curriculum and assessment records are grouped by organization. Create one or accept an invitation to continue.</p><Link className="button button-primary" href="/app">Go to organizations</Link></section>}
        {selectedOrganization && <p className="workflow-meta">Workspace: <strong>{selectedOrganization.name}</strong> · role: {role}</p>}
        {query.error && errors[query.error] && <p className="auth-error" role="alert">{errors[query.error]}</p>}
        {selectedOrganization && !canManageQuestions && <p className="callout callout-warning">Your organization role can view curriculum outcomes but cannot create curriculum, questions, or papers. Ask an owner or academic coordinator for the appropriate access.</p>}
        {selectedOrganization && canManageCurriculum && <section className="panel workspace-panel">
          <h2>Curriculum and outcomes</h2>
          <p>Create one or more organization curricula, then add their learning outcomes.</p>
          <form action={createCurriculumAction} className="auth-form workflow-form"><input type="hidden" name="organization_id" value={organizationId} /><label>Curriculum title<input name="title" required maxLength={200} placeholder="e.g. National Science Curriculum" /></label><label>Version<input name="version" maxLength={80} defaultValue="1" /></label><button className="button button-primary">Create curriculum</button></form>
          {curricula.map((curriculum) => <div className="curriculum-workflow" key={curriculum.id}>
            <h3>{curriculum.title} <span className="workflow-meta">Version {curriculum.version_label}</span></h3>
            <details className="workflow-details">
              <summary>Import outcomes from CSV</summary>
              <p className="workflow-meta">CSV header: <code>code,subject,topic,statement,description</code>. Description is optional. Up to 500 outcomes and 1 MB per file. Import is atomic; duplicate codes are rejected.</p>
              <form action={importSyllabusCsvAction} className="auth-form workflow-form">
                <input type="hidden" name="organization_id" value={organizationId} />
                <input type="hidden" name="curriculum_id" value={curriculum.id} />
                <label>Outcome CSV<input name="outcomes_csv" type="file" required accept=".csv,text/csv" /></label>
                <button className="button button-outline">Import CSV outcomes</button>
              </form>
            </details>
            <form action={createOutcomeAction} className="auth-form workflow-form">
              <input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="curriculum_id" value={curriculum.id} />
              <div className="form-row"><label>Outcome code<input name="code" required maxLength={40} /></label><label>Subject<input name="subject" required maxLength={120} /></label></div>
              <label>Topic<input name="topic" required maxLength={160} /></label><label>Learning statement<input name="statement" required maxLength={2000} /></label>
              <label>Description<textarea name="description" maxLength={4000} rows={2} /></label><button className="button button-outline">Add outcome</button>
            </form>
          </div>)}
          <div className="workflow-list">{outcomes.map((outcome) => <article className="workflow-card" key={outcome.id}><div className="workflow-card-heading"><div><span className="code-pill">{outcome.code}</span><h2>{outcome.statement}</h2></div><span className="status status-blue">{outcome.subject}</span></div><p className="workflow-meta">{outcome.topic}{outcome.description ? ` · ${outcome.description}` : ""}</p></article>)}</div>
          {outcomes.length === 0 && curricula.length > 0 && <p className="empty-workflow">Add the first outcome to this curriculum.</p>}
        </section>}
        {selectedOrganization && <section className="panel workspace-panel">
          <h2>SyllabusShift</h2>
          <p>Compare two saved curriculum versions by stable outcome code. This structured comparison does not extract or interpret uploaded documents.</p>
          {curricula.length < 2 ? <p className="empty-workflow">Create at least two curriculum versions to compare them.</p> : <form method="get" className="auth-form workflow-form">
            <input type="hidden" name="organization" value={organizationId} />
            <label>Previous version<select name="compareFrom" required defaultValue={query.compareFrom ?? ""}><option value="" disabled>Select the previous curriculum</option>{curricula.map((curriculum) => <option key={curriculum.id} value={curriculum.id}>{curriculum.title} · {curriculum.version_label}</option>)}</select></label>
            <label>New version<select name="compareTo" required defaultValue={query.compareTo ?? ""}><option value="" disabled>Select the new curriculum</option>{curricula.map((curriculum) => <option key={curriculum.id} value={curriculum.id}>{curriculum.title} · {curriculum.version_label}</option>)}</select></label>
            <button className="button button-outline">Compare versions</button>
          </form>}
          {sourceCurriculum && targetCurriculum && sourceCurriculum.id === targetCurriculum.id && <p className="auth-error" role="alert">Choose two different curriculum records to compare.</p>}
          {syllabusChanges && sourceCurriculum && targetCurriculum && <div className="curriculum-diff">
            <p className="workflow-meta"><strong>{sourceCurriculum.title} · {sourceCurriculum.version_label}</strong> compared with <strong>{targetCurriculum.title} · {targetCurriculum.version_label}</strong></p>
            <p className="workflow-meta">{syllabusChanges.filter((change) => change.status === "added").length} added · {syllabusChanges.filter((change) => change.status === "removed").length} removed · {syllabusChanges.filter((change) => change.status === "changed").length} changed</p>
            {syllabusChanges.map((change) => <article className="submission-summary" key={`${change.status}-${change.code}`}>
              <strong>{change.code} · {change.status}</strong>
              {change.status === "added" && <p>{change.after?.statement}</p>}
              {change.status === "removed" && <p>{change.before?.statement}</p>}
              {change.status === "changed" && <div>{change.fields.map((field) => <p key={field}><strong>{field}:</strong> {change.before?.[field]} =&gt; {change.after?.[field]}</p>)}</div>}
            </article>)}
            {syllabusChanges.length === 0 && <p className="callout">No outcome changes were found.</p>}
          </div>}
        </section>}
        {selectedOrganization && canManageQuestions && <section className="panel workspace-panel">
          <h2>Question bank</h2>
          <p>Answer keys are stored separately from question prompts and only staff roles can read them.</p>
          {outcomes.length === 0 ? <p className="empty-workflow">Add a curriculum outcome before creating questions.</p> : <form action={createQuestionAction} className="auth-form workflow-form">
            <input type="hidden" name="organization_id" value={organizationId} />
            <label>Learning outcome<select name="outcome_id" required defaultValue=""><option value="" disabled>Select outcome</option>{outcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.statement}</option>)}</select></label>
            <label>Question title<input name="title" required maxLength={160} /></label>
            <div className="form-row"><label>Type<select name="question_type"><option value="short_answer">Short answer</option><option value="multiple_choice">Multiple choice</option><option value="multiple_select">Multiple select</option><option value="true_false">True or false</option><option value="long_answer">Long answer</option><option value="structured">Structured</option></select></label><label>Difficulty<select name="difficulty"><option value="introductory">Introductory</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><label>Marks<input name="marks" type="number" required min={1} max={1000} defaultValue={1} /></label></div>
            <label>Student-facing prompt<textarea name="prompt" required maxLength={20000} rows={3} /></label><label>Answer key / marking notes<textarea name="answer" required maxLength={20000} rows={3} /></label>
            <button className="button button-primary">Save question draft</button>
          </form>}
          <div className="workflow-list">{questions.map((question) => <article className="workflow-card" key={question.id}><div className="workflow-card-heading"><div><span className="eyebrow">{outcomeById.get(question.outcome_id)?.code ?? "Outcome"} · {question.question_type.replaceAll("_", " ")}</span><h2>{question.title}</h2></div><span className={`status ${question.review_status === "reviewed" ? "status-green" : "status-amber"}`}>{question.review_status}</span></div><p className="workflow-description">{question.prompt}</p><p className="workflow-meta">{question.marks} marks · {question.difficulty}</p><details><summary>Staff-only answer key</summary><form action={saveAnswerKeyAction} className="auth-form workflow-form"><input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="question_id" value={question.id} /><label>Answer / marking notes<textarea name="answer" required maxLength={20000} rows={3} defaultValue={keyByQuestion.get(question.id) ?? ""} /></label><button className="button button-outline button-small">Save answer key</button></form></details>{question.review_status === "draft" && <form action={reviewQuestionAction}><input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="question_id" value={question.id} /><button className="button button-outline button-small">Mark reviewed</button></form>}</article>)}</div>
          {questions.length === 0 && <p className="empty-workflow">No questions yet.</p>}
        </section>}
        {selectedOrganization && canManageQuestions && <section className="panel workspace-panel">
          <h2>PaperForge</h2>
          <p>Create a frozen draft from reviewed questions, then publish it. Published versions are immutable and the stored snapshot excludes answer keys.</p>
          {questions.filter((question) => question.review_status === "reviewed").length === 0 ? <p className="empty-workflow">Review at least one question before building a paper.</p> : <form action={createPaperAction} className="auth-form workflow-form">
            <input type="hidden" name="organization_id" value={organizationId} />
            <label>Paper title<input name="title" required maxLength={200} /></label>
            <label>Target marks<input name="target_marks" type="number" required min={1} max={100000} /></label>
            <fieldset className="question-picker"><legend>Select reviewed questions (their marks must equal the target)</legend>{questions.filter((question) => question.review_status === "reviewed").map((question) => <label className="picker-option" key={question.id}><input type="checkbox" name="question_ids" value={question.id} /><span><strong>{question.title}</strong><small>{question.marks} marks · {outcomeById.get(question.outcome_id)?.code}</small></span></label>)}</fieldset>
            <button className="button button-primary">Create paper draft</button>
          </form>}
          <div className="workflow-list">{papers.map((paper) => <article className="workflow-card" key={paper.id}><div className="workflow-card-heading"><div><span className="eyebrow">{paper.subject}</span><h2>{paper.title}</h2></div></div>{(versionsByPaper.get(paper.id) ?? []).map((version) => {
            const rawSnapshot: unknown = version.question_snapshot;
            const snapshot = Array.isArray(rawSnapshot) ? rawSnapshot.filter(isSnapshotQuestion) : [];
            return <section className="submission-summary" key={version.id}><div className="workflow-card-heading"><strong>Version {version.version_number} · {version.target_marks} marks</strong><span className={`status ${version.status === "published" ? "status-green" : "status-amber"}`}>{version.status}</span></div>{snapshot.map((question, index) => <p key={`${version.id}-${question.question_id}`}>{index + 1}. {question.title} — {question.marks} marks<br />{question.prompt}</p>)}{version.status === "draft" && <form action={publishPaperAction}><input type="hidden" name="organization_id" value={organizationId} /><input type="hidden" name="version_id" value={version.id} /><button className="button button-outline button-small">Publish immutable version</button></form>}{version.status === "published" && <div className="auth-actions"><Link className="button button-outline button-small" href={`/app/academics/papers/${version.id}`}>Student paper / PDF</Link><Link className="button button-outline button-small" href={`/app/academics/papers/${version.id}?answers=1`}>Answer key / PDF</Link></div>}</section>;
          })}</article>)}</div>
          {papers.length === 0 && <p className="empty-workflow">No papers created for this organization.</p>}
        </section>}
      </section>
    </main>
  );
}

function SetupRequired() {
  return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><p>Configure the project URL and public key, then restart the app.</p></section></main>;
}

function LoadError({ message }: { message: string }) {
  console.error("Academic workspace lookup failed.", message);
  return <main className="auth-page"><section className="auth-card"><h1>Could not load the academic workspace</h1><p>Check that both migrations are applied and that your organization role permits access.</p><Link href="/app">Return to organizations</Link></section></main>;
}
