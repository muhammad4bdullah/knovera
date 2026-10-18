import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ organization?: string }> };

export const instant = false;

export default async function ReportsPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><p>Configure the project URL and public key, then restart the app.</p></section></main>;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return <main className="auth-page"><section className="auth-card"><h1>Sign in required</h1><Link href="/login">Sign in</Link></section></main>;

  const { data: memberships, error: membershipError } = await supabase.from("organization_memberships")
    .select("organization_id, role").eq("user_id", user.id).is("removed_at", null);
  if (membershipError) return <ReportsError message={membershipError.message} />;
  const orgIds = (memberships ?? []).map((membership) => membership.organization_id);
  const organizationsResult = orgIds.length
    ? await supabase.from("organizations").select("id, name").in("id", orgIds)
    : { data: [], error: null };
  if (organizationsResult.error) return <ReportsError message={organizationsResult.error.message} />;
  const organizations = organizationsResult.data ?? [];
  const organization = organizations.find((item) => item.id === query.organization) ?? organizations[0];
  const organizationId = organization?.id;
  const organizationRole = (memberships ?? []).find((item) => item.organization_id === organizationId)?.role ?? "";
  const isOrganizationManager = ["owner", "administrator", "academic_coordinator"].includes(organizationRole);
  const [classesResult, classMembershipResult] = organizationId
    ? await Promise.all([
      supabase.from("classrooms").select("id, name, subject").eq("organization_id", organizationId).is("archived_at", null),
      supabase.from("class_memberships").select("classroom_id, role").eq("user_id", user.id).is("removed_at", null),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const dataError = classesResult.error ?? classMembershipResult.error;
  if (dataError) return <ReportsError message={dataError.message} />;

  const classes = classesResult.data ?? [];
  const visibleClassIds = new Set(classes.map((classroom) => classroom.id));
  const classRoles = new Map((classMembershipResult.data ?? [])
    .filter((membership) => visibleClassIds.has(membership.classroom_id))
    .map((membership) => [membership.classroom_id, membership.role]));
  const managedClassIds = classes.filter((classroom) =>
    isOrganizationManager || classRoles.get(classroom.id) === "teacher",
  ).map((classroom) => classroom.id);
  const isStaffReport = isOrganizationManager || managedClassIds.length > 0;
  const [assignmentsResult, assignmentSubmissionsResult, assignmentReviewsResult, projectsResult, projectSubmissionsResult] =
    organizationId
      ? await Promise.all([
        supabase.from("assignments").select("id, classroom_id, status, target_marks").eq("organization_id", organizationId),
        supabase.from("assignment_submissions").select("id, assignment_id, classroom_id, student_id, status").eq("organization_id", organizationId),
        supabase.from("assignment_submission_reviews").select("submission_id, mark_awarded").eq("organization_id", organizationId),
        supabase.from("projects").select("id, classroom_id, status").eq("organization_id", organizationId),
        supabase.from("project_submissions").select("id, project_id, student_id, status").eq("organization_id", organizationId),
      ])
      : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  const workflowError = assignmentsResult.error ?? assignmentSubmissionsResult.error ?? assignmentReviewsResult.error
    ?? projectsResult.error ?? projectSubmissionsResult.error;
  if (workflowError) return <ReportsError message={workflowError.message} />;

  const assignments = assignmentsResult.data ?? [];
  const assignmentSubmissions = assignmentSubmissionsResult.data ?? [];
  const assignmentReviews = assignmentReviewsResult.data ?? [];
  const projects = projectsResult.data ?? [];
  const projectSubmissions = projectSubmissionsResult.data ?? [];
  const availableAssignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const availableProjectIds = new Set(projects.map((project) => project.id));
  const scopedAssignmentSubmissions = assignmentSubmissions.filter((submission) =>
    availableAssignmentIds.has(submission.assignment_id)
    && (isStaffReport ? managedClassIds.includes(submission.classroom_id) : submission.student_id === user.id),
  );
  const scopedProjectSubmissions = projectSubmissions.filter((submission) =>
    availableProjectIds.has(submission.project_id)
    && (isStaffReport
      ? managedClassIds.some((classId) => projects.some((project) => project.id === submission.project_id && project.classroom_id === classId))
      : submission.student_id === user.id),
  );
  const submissionIds = new Set(scopedAssignmentSubmissions.map((submission) => submission.id));
  const releasedReviews = assignmentReviews.filter((review) => submissionIds.has(review.submission_id));
  const scoredReviews = releasedReviews.filter((review) => review.mark_awarded !== null);
  const averageMark = scoredReviews.length
    ? scoredReviews.reduce((sum, review) => sum + review.mark_awarded, 0) / scoredReviews.length
    : null;
  const averagePercent = averageMark === null
    ? null
    : (() => {
      const markByAssignmentId = new Map(assignments.map((assignment) => [assignment.id, assignment.target_marks]));
      const scored = scoredReviews.flatMap((review) => {
        const submission = scopedAssignmentSubmissions.find((item) => item.id === review.submission_id);
        const maximum = submission ? markByAssignmentId.get(submission.assignment_id) : null;
        return maximum ? [review.mark_awarded / maximum * 100] : [];
      });
      return scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;
    })();
  const studentAssignmentCount = assignmentSubmissions.filter((submission) =>
    submission.student_id === user.id && availableAssignmentIds.has(submission.assignment_id),
  ).length;
  const studentProjectCount = projectSubmissions.filter((submission) =>
    submission.student_id === user.id && availableProjectIds.has(submission.project_id),
  ).length;
  const classSummaries = classes.filter((classroom) => managedClassIds.includes(classroom.id)).map((classroom) => {
    const classAssignments = assignments.filter((assignment) => assignment.classroom_id === classroom.id);
    const classSubmissions = scopedAssignmentSubmissions.filter((submission) => classAssignments.some((assignment) => assignment.id === submission.assignment_id));
    const classProjects = projects.filter((project) => project.classroom_id === classroom.id);
    const classProjectIds = new Set(classProjects.map((project) => project.id));
    return {
      ...classroom,
      publishedAssignments: classAssignments.filter((assignment) => assignment.status === "published").length,
      pendingReviews: classSubmissions.filter((submission) => submission.status === "submitted").length,
      projectSubmissions: scopedProjectSubmissions.filter((submission) => classProjectIds.has(submission.project_id)).length,
      assignmentCount: classAssignments.length,
    };
  });

  return (
    <main className="workspace-home">
      <header className="workspace-home-header"><Link className="auth-brand" href="/app"><span className="brand-mark">k</span><span>knovera</span></Link><div><span>{user.email}</span><form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form></div></header>
      <section className="workspace-home-main">
        <p className="eyebrow">ACADEMY HUB · REPORTS</p>
        <h1>Learning reports</h1>
        <p className="page-subtitle">A live summary of records you are authorized to see. Learner views contain only that learner’s submissions and released marks.</p>
        <nav className="workflow-links"><Link href="/app">Organizations</Link><Link href={`/app/classes${organizationId ? `?organization=${organizationId}` : ""}`}>Classes</Link><Link href={`/app/assignments${organizationId ? `?organization=${organizationId}` : ""}`}>Assignments</Link><Link href={`/app/projects${organizationId ? `?organization=${organizationId}` : ""}`}>Projects</Link><Link href={`/app/academics${organizationId ? `?organization=${organizationId}` : ""}`}>Academic workspace</Link></nav>
        {organizations.length > 1 && <form method="get" className="organization-select-form"><label>Active organization<select name="organization" defaultValue={organizationId}>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="button button-outline button-small">Switch organization</button></form>}
        {!organization && <p className="empty-workflow">Join an organization to see learning reports.</p>}
        {organization && <section className="panel workspace-panel">
          <h2>{organization.name}</h2>
          <div className="metric-grid">
            <Metric label={isStaffReport ? "Classes you manage" : "Your classes"} value={isStaffReport ? managedClassIds.length : classRoles.size} />
            <Metric label={isStaffReport ? "Published assignments" : "Your assignment submissions"} value={isStaffReport ? assignments.filter((assignment) => managedClassIds.includes(assignment.classroom_id) && assignment.status === "published").length : studentAssignmentCount} />
            <Metric label={isStaffReport ? "Awaiting review" : "Your project submissions"} value={isStaffReport ? scopedAssignmentSubmissions.filter((submission) => submission.status === "submitted").length : studentProjectCount} />
            <Metric label="Average released assignment score" value={averagePercent === null ? "—" : `${averagePercent.toFixed(1)}%`} />
          </div>
          {isStaffReport && <><h2>Class activity</h2><div className="workflow-list">{classSummaries.map((summary) => <article className="workflow-card" key={summary.id}><div className="workflow-card-heading"><div><span className="eyebrow">{summary.subject}</span><h2>{summary.name}</h2></div></div><p className="workflow-meta">{summary.assignmentCount} assignments · {summary.publishedAssignments} published · {summary.pendingReviews} awaiting review · {summary.projectSubmissions} project submissions</p></article>)}</div>{classSummaries.length === 0 && <p className="empty-workflow">No classes are available for reporting.</p>}</>}
          {!isStaffReport && <div className="callout">Only your released assignment marks are included in the average. Unreleased grades and other learners’ records are excluded.</div>}
        </section>}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></article>;
}

function ReportsError({ message }: { message: string }) {
  console.error("Learning reports lookup failed.", message);
  return <main className="auth-page"><section className="auth-card"><h1>Could not load reports</h1><p>Check that the Supabase migrations are applied and your organization membership is active.</p><Link href="/app">Return to organizations</Link></section></main>;
}
