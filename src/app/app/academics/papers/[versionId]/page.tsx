import Link from "next/link";
import { notFound } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { PrintButton } from "@/components/print-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ versionId: string }>;
  searchParams: Promise<{ answers?: string }>;
};

type SnapshotQuestion = {
  question_id: string;
  title: string;
  prompt: string;
  marks: number;
};

function isSnapshotQuestion(value: unknown): value is SnapshotQuestion {
  if (typeof value !== "object" || value === null) return false;
  const question = value as Record<string, unknown>;
  return typeof question.question_id === "string"
    && typeof question.title === "string"
    && typeof question.prompt === "string"
    && typeof question.marks === "number";
}

export const instant = false;

export default async function PaperPrintPage({ params, searchParams }: Props) {
  const { versionId } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) return <RouteMessage title="Supabase setup required" message="Configure the project URL and public key, then restart the app." />;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return <main className="auth-page"><section className="auth-card"><h1>Sign in required</h1><Link href="/login">Sign in</Link></section></main>;

  const { data: version, error: versionError } = await supabase.from("paper_versions")
    .select("id, paper_id, organization_id, version_number, status, target_marks, question_snapshot, published_at")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) {
    console.error("Paper version lookup failed.", versionError.message);
    return <RouteMessage title="Could not load this paper" message="Check your organization role and database migrations." />;
  }
  if (!version || version.status !== "published") notFound();

  const snapshotValue: unknown = version.question_snapshot;
  if (!Array.isArray(snapshotValue) || snapshotValue.length === 0 || !snapshotValue.every(isSnapshotQuestion)) {
    return <RouteMessage title="Paper snapshot unavailable" message="This published version does not contain a valid student-safe question snapshot." />;
  }
  const questions = snapshotValue;
  const paperResult = await supabase.from("papers")
    .select("title, subject")
    .eq("id", version.paper_id)
    .eq("organization_id", version.organization_id)
    .maybeSingle();
  if (paperResult.error || !paperResult.data) {
    if (paperResult.error) console.error("Paper title lookup failed.", paperResult.error.message);
    return <RouteMessage title="Could not load this paper" message="The paper record is unavailable to your account." />;
  }

  const showAnswers = query.answers === "1";
  const answerResult = showAnswers
    ? await supabase.from("paper_version_answer_keys")
      .select("question_id, answer_text")
      .eq("paper_version_id", version.id)
      .eq("organization_id", version.organization_id)
    : { data: [], error: null };
  if (answerResult.error) {
    console.error("Frozen paper answer keys could not be loaded.", answerResult.error.message);
    return <RouteMessage title="Could not load the answer key" message="Check your staff access and the database migration status." />;
  }
  const answerByQuestion = new Map((answerResult.data ?? []).map((answer) => [answer.question_id, answer.answer_text]));
  if (showAnswers && questions.some((question) => !answerByQuestion.has(question.question_id))) {
    return <RouteMessage title="Answer key snapshot incomplete" message="One or more question answers are missing from this immutable paper version. Do not use this copy for marking." />;
  }

  return (
    <main className="paper-print-page">
      <header className="workspace-home-header paper-print-controls">
        <Link href="/app/academics">Return to academic workspace</Link>
        <div>
          <span>{user.email}</span>
          <form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form>
        </div>
      </header>
      <section className="paper-print-controls workspace-home-main">
        <div className="auth-actions">
          <PrintButton />
          <Link className="button button-outline" href={`/app/academics/papers/${version.id}${showAnswers ? "" : "?answers=1"}`}>
            {showAnswers ? "Open student paper" : "Open answer key"}
          </Link>
        </div>
        <p className="workflow-meta">Published version {version.version_number} · {version.target_marks} marks · {questions.length} questions</p>
      </section>
      <article id="paper-print-area" className="print-document">
        <header className="print-header">
          <div className="print-brand">knovera <span>· {showAnswers ? "STAFF ANSWER KEY" : "STUDENT PAPER"}</span></div>
          <h1>{paperResult.data.title}</h1>
          <p>{paperResult.data.subject} · Version {version.version_number} · {version.target_marks} marks</p>
          {!showAnswers && <div className="student-fields"><span>Name</span><i /><span>Class</span><i /><span>Date</span><i /></div>}
        </header>
        {questions.map((question, index) => <section className="print-question" key={question.question_id}>
          <div><strong>{index + 1}. {question.title}</strong><strong>{question.marks} marks</strong></div>
          <p>{question.prompt}</p>
          {showAnswers && <p><strong>Answer / marking notes:</strong> {answerByQuestion.get(question.question_id)}</p>}
          {!showAnswers && <div className="print-answer-lines">{Array.from({ length: Math.min(8, Math.max(2, question.marks)) }, (_, line) => <i key={line} />)}</div>}
        </section>)}
        <footer className="print-footer">{showAnswers ? "Confidential — staff marking copy" : "End of paper"}</footer>
      </article>
    </main>
  );
}

function RouteMessage({ title, message }: { title: string; message: string }) {
  return <main className="auth-page"><section className="auth-card"><h1>{title}</h1><p>{message}</p><Link href="/app/academics">Return to academic workspace</Link></section></main>;
}
