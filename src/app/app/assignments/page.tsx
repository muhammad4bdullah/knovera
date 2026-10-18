import Link from "next/link";
import {
  createAssignmentAction,
  publishAssignmentAction,
  releaseAssignmentAnswersAction,
  returnAssignmentSubmissionAction,
  reviewAssignmentSubmissionAction,
  signOutAction,
  submitAssignmentAction,
} from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ error?: string; created?: string; published?: string; submitted?: string; reviewed?: string; returned?: string; released?: string; organization?: string }> };

export const instant = false;

export default async function AssignmentsPage({ searchParams }: Props) {
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
  const assignmentsResult = orgIds.length
    ? await supabase.from("assignments").select("id, organization_id, classroom_id, title, instructions, due_at, target_marks, status, answer_release_at, created_at").in("organization_id", orgIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  const classMembershipsResult = orgIds.length
    ? await supabase.from("class_memberships").select("classroom_id, role").eq("user_id", user.id).is("removed_at", null)
    : { data: [], error: null };
  const submissionsResult = orgIds.length
    ? await supabase.from("assignment_submissions").select("id, assignment_id, classroom_id, student_id, response_data, status, submitted_at").in("organization_id", orgIds).order("submitted_at", { ascending: false })
    : { data: [], error: null };
  const reviewsResult = orgIds.length
    ? await supabase.from("assignment_submission_reviews").select("submission_id, mark_awarded, teacher_feedback").in("organization_id", orgIds)
    : { data: [], error: null };
  const readError = classesResult.error ?? assignmentsResult.error ?? classMembershipsResult.error ?? submissionsResult.error ?? reviewsResult.error;
  if (readError) return <WorkflowError message={readError.message} />;

  const classes = classesResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const classRoles = new Map((classMembershipsResult.data ?? []).map((membership) => [membership.classroom_id, membership.role]));
  const orgRoles = new Map((orgMemberships ?? []).map((membership) => [membership.organization_id, membership.role]));
  const classById = new Map(classes.map((classroom) => [classroom.id, classroom]));
  const submissions = submissionsResult.data ?? [];
  const reviewsBySubmission = new Map((reviewsResult.data ?? []).map((review) => [review.submission_id, review]));
  const canManage = (assignment: (typeof assignments)[number]) =>
    ["owner", "administrator", "academic_coordinator"].includes(orgRoles.get(assignment.organization_id) ?? "")
    || classRoles.get(assignment.classroom_id) === "teacher";
  const errors: Record<string, string> = {
    assignment: "The assignment action failed. Check your class role and assignment fields.",
    submission: "The submission could not be saved. Confirm the assignment is open and try again.",
    review: "The review could not be saved. Confirm the submission is still awaiting review.",
  };

  return (
    <main className="workspace-home">
      <header className="workspace-home-header"><Link className="auth-brand" href="/app"><span className="brand-mark">k</span><span>knovera</span></Link><div><span>{user.email}</span><form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form></div></header>
      <section className="workspace-home-main">
        <p className="eyebrow">LEARNING WORKFLOWS</p>
        <h1>Assignments</h1>
        <p className="page-subtitle">Assignments and text responses use Supabase row-level security. Uploaded files, automated marking, and email delivery are not included.</p>
        <nav className="workflow-links"><Link href="/app">Organizations</Link><Link href={`/app/academics${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Academic workspace</Link><Link href={`/app/classes${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Classes</Link><Link href={`/app/projects${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Projects</Link><Link href={`/app/reports${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Reports</Link></nav>
        {organizations.length > 1 && <form method="get" className="organization-select-form"><label>Active organization<select name="organization" defaultValue={selectedOrganization?.id}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><button className="button button-outline button-small">Switch organization</button></form>}
        {query.error && errors[query.error] && <p className="auth-error" role="alert">{errors[query.error]}</p>}
        {(query.created || query.published || query.submitted || query.reviewed || query.returned || query.released) && <p className="callout">Assignment changes saved.</p>}
        {classes.length === 0 && <p className="empty-workflow">Create or join a class before using assignments.</p>}
        {classes.some((classroom) => ["owner", "administrator", "academic_coordinator"].includes(orgRoles.get(classroom.organization_id) ?? "") || classRoles.get(classroom.id) === "teacher") && <section className="panel workspace-panel">
          <h2>Create assignment</h2>
          <form action={createAssignmentAction} className="auth-form workflow-form">
            <label>Class<select name="classroom_id" required defaultValue=""><option value="" disabled>Select a class</option>{classes.filter((classroom) => ["owner", "administrator", "academic_coordinator"].includes(orgRoles.get(classroom.organization_id) ?? "") || classRoles.get(classroom.id) === "teacher").map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} · {classroom.subject}</option>)}</select></label>
            <label>Title<input name="title" required maxLength={200} /></label>
            <label>Instructions<textarea name="instructions" maxLength={10000} rows={4} /></label>
            <label>Due date<input name="due_at" type="date" /></label>
            <label>Maximum marks<input name="target_marks" type="number" min={1} max={10000} /></label>
            <button className="button button-primary">Save draft</button>
          </form>
        </section>}
        <div className="workflow-list">{assignments.filter((assignment) => canManage(assignment) || assignment.status !== "draft").map((assignment) => {
          const classroom = classById.get(assignment.classroom_id);
          const ownSubmission = submissions.find((submission) => submission.assignment_id === assignment.id && submission.student_id === user.id);
          const canSubmit = classRoles.get(assignment.classroom_id) === "student" && assignment.status === "published";
          return <article className="panel workflow-card" key={assignment.id}>
            <div className="workflow-card-heading"><div><span className="eyebrow">{classroom?.name ?? "Class"} · {classroom?.subject ?? ""}</span><h2>{assignment.title}</h2></div><span className={`status ${assignment.status === "published" ? "status-green" : "status-amber"}`}>{assignment.status}</span></div>
            {assignment.instructions && <p className="workflow-description">{assignment.instructions}</p>}
            <p className="workflow-meta">{assignment.target_marks ? `${assignment.target_marks} marks · ` : ""}{assignment.due_at ? `Due ${new Date(assignment.due_at).toLocaleDateString()}` : "No deadline"}</p>
            {canManage(assignment) && assignment.status === "draft" && <form action={publishAssignmentAction}><input type="hidden" name="assignment_id" value={assignment.id} /><button className="button button-outline button-small">Publish assignment</button></form>}
            {canManage(assignment) && assignment.answer_release_at && <p className="workflow-meta">Student marks and feedback released {new Date(assignment.answer_release_at).toLocaleString()}</p>}
            {canManage(assignment) && !assignment.answer_release_at && assignment.status !== "draft" && <form action={releaseAssignmentAnswersAction}><input type="hidden" name="assignment_id" value={assignment.id} /><button className="button button-outline button-small">Release marks and feedback to students</button></form>}
            {canSubmit && (!ownSubmission || ownSubmission.status === "returned") && <form action={submitAssignmentAction} className="auth-form workflow-form"><input type="hidden" name="assignment_id" value={assignment.id} /><input type="hidden" name="classroom_id" value={assignment.classroom_id} /><input type="hidden" name="organization_id" value={assignment.organization_id} /><label>Your response<textarea name="response" required maxLength={10000} rows={4} defaultValue={answerText(ownSubmission?.response_data)} /></label><button className="button button-primary">{ownSubmission ? "Resubmit response" : "Submit response"}</button></form>}
            {ownSubmission && <div className="submission-summary"><strong>Your submission: {ownSubmission.status}</strong>{reviewsBySubmission.get(ownSubmission.id)?.mark_awarded !== null && reviewsBySubmission.get(ownSubmission.id)?.mark_awarded !== undefined && <span> · {reviewsBySubmission.get(ownSubmission.id)?.mark_awarded}{assignment.target_marks ? `/${assignment.target_marks}` : ""}</span>}{reviewsBySubmission.get(ownSubmission.id)?.teacher_feedback && <p>{reviewsBySubmission.get(ownSubmission.id)?.teacher_feedback}</p>}{!canManage(assignment) && answerText(ownSubmission.response_data) && <p>{answerText(ownSubmission.response_data)}</p>}</div>}
            {canManage(assignment) && submissions.filter((submission) => submission.assignment_id === assignment.id).map((submission) => {
              const review = reviewsBySubmission.get(submission.id);
              return <div className="submission-summary" key={submission.id}><strong>Submission · {submission.status}</strong><p>{answerText(submission.response_data)}</p>{review && <p>{review.mark_awarded ?? "Unmarked"}{review.teacher_feedback ? ` · ${review.teacher_feedback}` : ""}</p>}{["submitted", "returned"].includes(submission.status) && <><form action={reviewAssignmentSubmissionAction} className="auth-form workflow-form"><input type="hidden" name="submission_id" value={submission.id} /><label>Mark awarded<input name="mark_awarded" type="number" min={0} max={assignment.target_marks ?? undefined} /></label><label>Feedback<textarea name="teacher_feedback" maxLength={5000} rows={2} /></label><button className="button button-outline button-small">Save review</button></form>{submission.status === "submitted" && <form action={returnAssignmentSubmissionAction}><input type="hidden" name="submission_id" value={submission.id} /><button className="button button-outline button-small">Return for revision</button></form>}</>}</div>;
            })}
          </article>;
        })}</div>
        {assignments.length === 0 && <p className="empty-workflow">No assignments have been created for your classes yet.</p>}
      </section>
    </main>
  );
}

function answerText(response: unknown): string {
  if (typeof response !== "object" || response === null || !("answer_text" in response)) return "";
  return typeof response.answer_text === "string" ? response.answer_text : "";
}

function WorkflowError({ message }: { message: string }) {
  console.error("Assignment workspace lookup failed.", message);
  return <main className="auth-page"><section className="auth-card"><h1>Could not load assignments</h1><p>Check that the Supabase migrations have been applied and that your organization membership is active.</p><Link href="/app">Return to organizations</Link></section></main>;
}
