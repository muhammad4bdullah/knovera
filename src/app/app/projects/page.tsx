import Link from "next/link";
import {
  createProjectAction,
  createRubricAction,
  evaluateProjectSubmissionWithRubricAction,
  evaluateProjectSubmissionAction,
  publishProjectAction,
  signOutAction,
  submitProjectAction,
  uploadProjectEvidenceAction,
} from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ error?: string; created?: string; published?: string; submitted?: string; uploaded?: string; evaluated?: string; rubric?: string; organization?: string }> };

export const instant = false;

export default async function ProjectsPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><p>Configure the project URL and public key, then restart the app.</p></section></main>;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return <main className="auth-page"><section className="auth-card"><h1>Sign in required</h1><Link href="/login">Sign in</Link></section></main>;

  const { data: orgMemberships, error: orgError } = await supabase.from("organization_memberships")
    .select("organization_id, role").eq("user_id", user.id).is("removed_at", null);
  if (orgError) return <WorkflowError message={orgError.message} />;
  const organizationsResult = orgMemberships?.length
    ? await supabase.from("organizations").select("id, name").in("id", orgMemberships.map((membership) => membership.organization_id))
    : { data: [], error: null };
  if (organizationsResult.error) return <WorkflowError message={organizationsResult.error.message} />;
  const organizations = organizationsResult.data ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === query.organization) ?? organizations[0];
  const orgIds = selectedOrganization ? [selectedOrganization.id] : [];
  const classesResult = orgIds.length
    ? await supabase.from("classrooms").select("id, organization_id, name, subject").in("organization_id", orgIds).is("archived_at", null)
    : { data: [], error: null };
  const projectsResult = orgIds.length
    ? await supabase.from("projects").select("id, organization_id, classroom_id, title, description, due_at, status, rubric_id, created_at").in("organization_id", orgIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  const rubricsResult = orgIds.length
    ? await supabase.from("rubrics").select("id, organization_id, title").in("organization_id", orgIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  const rubricIds = (rubricsResult.data ?? []).map((rubric) => rubric.id);
  const rubricCriteriaResult = rubricIds.length
    ? await supabase.from("rubric_criteria").select("id, organization_id, rubric_id, title, description, max_points, position").in("rubric_id", rubricIds).order("position")
    : { data: [], error: null };
  const classMembershipsResult = orgIds.length
    ? await supabase.from("class_memberships").select("classroom_id, role").eq("user_id", user.id).is("removed_at", null)
    : { data: [], error: null };
  const submissionsResult = orgIds.length
    ? await supabase.from("project_submissions").select("id, project_id, organization_id, student_id, evidence_text, status, feedback, submitted_at").in("organization_id", orgIds).order("submitted_at", { ascending: false })
    : { data: [], error: null };
  const rubricEvaluationsResult = orgIds.length
    ? await supabase.from("rubric_evaluations").select("project_submission_id, criterion_id, points, feedback").in("organization_id", orgIds)
    : { data: [], error: null };
  const readError = classesResult.error ?? projectsResult.error ?? rubricsResult.error ?? rubricCriteriaResult.error
    ?? classMembershipsResult.error ?? submissionsResult.error ?? rubricEvaluationsResult.error;
  if (readError) return <WorkflowError message={readError.message} />;

  const classes = classesResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const rubrics = rubricsResult.data ?? [];
  const rubricCriteria = rubricCriteriaResult.data ?? [];
  const classRoles = new Map((classMembershipsResult.data ?? []).map((membership) => [membership.classroom_id, membership.role]));
  const orgRoles = new Map((orgMemberships ?? []).map((membership) => [membership.organization_id, membership.role]));
  const classById = new Map(classes.map((classroom) => [classroom.id, classroom]));
  const submissions = submissionsResult.data ?? [];
  const evaluationsBySubmission = new Map<string, typeof rubricEvaluationsResult.data>();
  for (const evaluation of rubricEvaluationsResult.data ?? []) {
    const evaluations = evaluationsBySubmission.get(evaluation.project_submission_id) ?? [];
    evaluations.push(evaluation);
    evaluationsBySubmission.set(evaluation.project_submission_id, evaluations);
  }
  const canManage = (project: (typeof projects)[number]) =>
    ["owner", "administrator", "academic_coordinator"].includes(orgRoles.get(project.organization_id) ?? "")
    || (project.classroom_id !== null && classRoles.get(project.classroom_id) === "teacher");
  const canCreate = classes.some((classroom) => ["owner", "administrator", "academic_coordinator"].includes(orgRoles.get(classroom.organization_id) ?? "") || classRoles.get(classroom.id) === "teacher");
  const visibleFileTargets = projects.flatMap((project) => {
    if (!project.classroom_id || (!canManage(project) && classRoles.get(project.classroom_id) !== "student")) return [];
    const studentIds = canManage(project)
      ? submissions.filter((submission) => submission.project_id === project.id).map((submission) => submission.student_id)
      : [user.id];
    return [...new Set(studentIds)].map((studentId) => ({
      key: `${project.id}:${studentId}`,
      path: `${project.organization_id}/${project.classroom_id}/${studentId}/${project.id}`,
    }));
  });
  const fileListings = await Promise.all(visibleFileTargets.map(async ({ key, path }) => {
    const { data: files, error } = await supabase.storage.from("student-evidence").list(path, {
      limit: 50,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return { key, error: error.message, files: [] };
    const filePaths = (files ?? []).filter((file) => file.id).map((file) => `${path}/${file.name}`);
    if (!filePaths.length) return { key, error: null, files: [] };
    const { data: signedFiles, error: signedError } = await supabase.storage.from("student-evidence")
      .createSignedUrls(filePaths, 300);
    return {
      key,
      error: signedError?.message ?? null,
      files: (signedFiles ?? []).flatMap((file) => file.signedUrl ? [{ name: file.path?.split("/").at(-1) ?? "Evidence file", url: file.signedUrl }] : []),
    };
  }));
  const fileListingError = fileListings.find((listing) => listing.error)?.error;
  if (fileListingError) return <WorkflowError message={fileListingError} />;
  const projectFiles = new Map(fileListings.map((listing) => [listing.key, listing.files]));
  const errors: Record<string, string> = {
    project: "The project action failed. Check your class role and project fields.",
    submission: "Your evidence could not be submitted. Confirm the project is open and try again.",
    upload: "The file could not be uploaded. Use a PDF, plain text, JPEG, or PNG file no larger than 15 MB, and confirm the project is open.",
    evaluation: "The evaluation could not be saved. Confirm the submission is still awaiting review.",
    rubric: "The rubric could not be saved. Add one to ten valid criteria and try again.",
  };

  return (
    <main className="workspace-home">
      <header className="workspace-home-header"><Link className="auth-brand" href="/app"><span className="brand-mark">k</span><span>knovera</span></Link><div><span>{user.email}</span><form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form></div></header>
      <section className="workspace-home-main">
        <p className="eyebrow">LEARNING WORKFLOWS</p>
        <h1>Projects</h1>
        <p className="page-subtitle">Project descriptions, text and file evidence, and criterion-based rubric scores are stored in Supabase.</p>
        <nav className="workflow-links"><Link href="/app">Organizations</Link><Link href={`/app/academics${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Academic workspace</Link><Link href={`/app/classes${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Classes</Link><Link href={`/app/assignments${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Assignments</Link><Link href={`/app/reports${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Reports</Link></nav>
        {organizations.length > 1 && <form method="get" className="organization-select-form"><label>Active organization<select name="organization" defaultValue={selectedOrganization?.id}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><button className="button button-outline button-small">Switch organization</button></form>}
        {query.error && errors[query.error] && <p className="auth-error" role="alert">{errors[query.error]}</p>}
        {(query.created || query.published || query.submitted || query.uploaded || query.evaluated || query.rubric) && <p className="callout">Project changes saved.</p>}
        {canCreate && <section className="panel workspace-panel">
          <h2>Create a project rubric</h2>
          <p>Add one criterion per line using <code>Title | maximum points | optional guidance</code>. You can add up to ten criteria.</p>
          <form action={createRubricAction} className="auth-form workflow-form">
            <input type="hidden" name="organization_id" value={selectedOrganization?.id ?? ""} />
            <label>Rubric title<input name="title" required maxLength={200} /></label>
            <label>Criteria<textarea name="criteria" required maxLength={25000} rows={5} placeholder={"Research | 10 | Use reliable sources\nCommunication | 5 | Explain the result clearly"} /></label>
            <button className="button button-outline">Save rubric</button>
          </form>
        </section>}
        {canCreate && <section className="panel workspace-panel">
          <h2>Create project</h2>
          <form action={createProjectAction} className="auth-form workflow-form">
            <label>Class<select name="classroom_id" required defaultValue=""><option value="" disabled>Select a class</option>{classes.filter((classroom) => ["owner", "administrator", "academic_coordinator"].includes(orgRoles.get(classroom.organization_id) ?? "") || classRoles.get(classroom.id) === "teacher").map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.subject}</option>)}</select></label>
            <label>Title<input name="title" required maxLength={200} /></label>
            <label>Description<textarea name="description" maxLength={10000} rows={4} /></label>
            <label>Due date<input name="due_at" type="date" /></label>
            <label>Scoring rubric<select name="rubric_id" defaultValue=""><option value="">No rubric</option>{rubrics.filter((rubric) => rubric.organization_id === selectedOrganization?.id).map((rubric) => <option key={rubric.id} value={rubric.id}>{rubric.title}</option>)}</select></label>
            <button className="button button-primary">Save draft</button>
          </form>
        </section>}
        <div className="workflow-list">{projects.filter((project) => canManage(project) || project.status !== "draft").map((project) => {
          const classroom = project.classroom_id ? classById.get(project.classroom_id) : undefined;
          const projectRubric = rubrics.find((rubric) => rubric.id === project.rubric_id);
          const projectCriteria = rubricCriteria.filter((criterion) => criterion.rubric_id === project.rubric_id);
          const canSubmit = project.classroom_id !== null && classRoles.get(project.classroom_id) === "student" && project.status === "published";
          const ownSubmission = submissions.find((submission) => submission.project_id === project.id && submission.student_id === user.id);
          return <article className="panel workflow-card" key={project.id}>
            <div className="workflow-card-heading"><div><span className="eyebrow">{classroom?.name ?? "Project"}{classroom ? ` · ${classroom.subject}` : ""}</span><h2>{project.title}</h2></div><span className={`status ${project.status === "published" ? "status-green" : "status-amber"}`}>{project.status}</span></div>
            {project.description && <p className="workflow-description">{project.description}</p>}
            <p className="workflow-meta">{project.due_at ? `Due ${new Date(project.due_at).toLocaleDateString()}` : "No deadline"}</p>
            {projectRubric && <p className="workflow-meta">Rubric: {projectRubric.title} · {projectCriteria.reduce((total, criterion) => total + criterion.max_points, 0)} total points</p>}
            {canManage(project) && project.status === "draft" && <form action={publishProjectAction}><input type="hidden" name="project_id" value={project.id} /><button className="button button-outline button-small">Publish project</button></form>}
            {canSubmit && <><form action={uploadProjectEvidenceAction} className="auth-form workflow-form"><input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="organization_id" value={project.organization_id} /><label>Attach evidence file<input name="evidence_file" type="file" required accept=".pdf,.txt,.jpg,.jpeg,.png,application/pdf,text/plain,image/jpeg,image/png" /></label><p className="workflow-meta">PDF, plain text, JPEG, or PNG · max 15 MB per file</p><button className="button button-outline">Upload evidence file</button></form><form action={submitProjectAction} className="auth-form workflow-form"><input type="hidden" name="project_id" value={project.id} /><input type="hidden" name="organization_id" value={project.organization_id} /><label>Your evidence<textarea name="evidence_text" required maxLength={20000} rows={4} /></label><button className="button button-primary">Submit evidence</button></form></>}
            {canSubmit && !ownSubmission && (projectFiles.get(`${project.id}:${user.id}`) ?? []).length > 0 && <div className="submission-summary"><strong>Uploaded evidence files</strong>{projectFiles.get(`${project.id}:${user.id}`)?.map((file) => <p key={file.url}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></p>)}</div>}
            {ownSubmission && <div className="submission-summary"><strong>Your submission: {ownSubmission.status}</strong><p>{ownSubmission.evidence_text}</p>{ownSubmission.feedback && <p>Teacher feedback: {ownSubmission.feedback}</p>}{(projectFiles.get(`${project.id}:${ownSubmission.student_id}`) ?? []).map((file) => <p key={file.url}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></p>)}{(evaluationsBySubmission.get(ownSubmission.id) ?? []).map((evaluation) => {
              const criterion = projectCriteria.find((item) => item.id === evaluation.criterion_id);
              return <p key={evaluation.criterion_id}>{criterion?.title ?? "Criterion"}: {evaluation.points}/{criterion?.max_points ?? "?"}{evaluation.feedback ? ` · ${evaluation.feedback}` : ""}</p>;
            })}</div>}
            {canManage(project) && submissions.filter((submission) => submission.project_id === project.id).map((submission) => <div className="submission-summary" key={submission.id}><strong>Submission · {submission.status}</strong><p>{submission.evidence_text}</p>{(projectFiles.get(`${project.id}:${submission.student_id}`) ?? []).map((file) => <p key={file.url}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></p>)}{(evaluationsBySubmission.get(submission.id) ?? []).map((evaluation) => {
              const criterion = projectCriteria.find((item) => item.id === evaluation.criterion_id);
              return <p key={evaluation.criterion_id}>{criterion?.title ?? "Criterion"}: {evaluation.points}/{criterion?.max_points ?? "?"}{evaluation.feedback ? ` · ${evaluation.feedback}` : ""}</p>;
            })}{["submitted", "under_review"].includes(submission.status) && (projectRubric ? <form action={evaluateProjectSubmissionWithRubricAction} className="auth-form workflow-form">
              <input type="hidden" name="submission_id" value={submission.id} />
              {projectCriteria.map((criterion) => <fieldset className="workflow-fieldset" key={criterion.id}><legend>{criterion.title} · max {criterion.max_points}</legend>{criterion.description && <p>{criterion.description}</p>}<label>Points<input name={`score_${criterion.id}`} type="number" required min={0} max={criterion.max_points} /></label><label>Criterion feedback<textarea name={`feedback_${criterion.id}`} maxLength={2000} rows={2} /></label></fieldset>)}
              <label>Overall feedback<textarea name="feedback" maxLength={10000} rows={2} /></label>
              <button className="button button-outline button-small">Save rubric evaluation</button>
            </form> : <form action={evaluateProjectSubmissionAction} className="auth-form workflow-form"><input type="hidden" name="submission_id" value={submission.id} /><label>Feedback<textarea name="feedback" maxLength={10000} rows={2} /></label><button className="button button-outline button-small">Save evaluation</button></form>)}</div>)}
          </article>;
        })}</div>
        {projects.length === 0 && <p className="empty-workflow">No projects have been created for your classes yet.</p>}
      </section>
    </main>
  );
}

function WorkflowError({ message }: { message: string }) {
  console.error("Project workspace lookup failed.", message);
  return <main className="auth-page"><section className="auth-card"><h1>Could not load projects</h1><p>Check that the Supabase migrations have been applied and that your organization membership is active.</p><Link href="/app">Return to organizations</Link></section></main>;
}
