import Link from "next/link";
import { ClassCreationForm, ClassEnrollmentForm } from "@/components/class-workflow-forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assignClassMemberAction, removeClassMemberAction, signOutAction } from "@/app/auth/actions";

type Props = { searchParams: Promise<{ error?: string; enrolled?: string; organization?: string }> };

export const instant = false;

export default async function ClassesPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><p>Configure the project URL and public key, then restart the app.</p></section></main>;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return <main className="auth-page"><section className="auth-card"><h1>Sign in required</h1><Link href="/login">Sign in</Link></section></main>;

  const { data: memberships, error: membershipError } = await supabase.from("organization_memberships")
    .select("organization_id, role").eq("user_id", user.id).is("removed_at", null);
  if (membershipError) {
    console.error("Class organization lookup failed.", membershipError.message);
    return <WorkflowError />;
  }
  const organizationsResult = memberships?.length
    ? await supabase.from("organizations").select("id, name").in("id", memberships.map((membership) => membership.organization_id))
    : { data: [], error: null };
  if (organizationsResult.error) return <WorkflowError />;
  const organizations = organizationsResult.data ?? [];
  const selectedOrganization = organizations.find((organization) => organization.id === query.organization) ?? organizations[0];
  const orgIds = selectedOrganization ? [selectedOrganization.id] : [];
  const classroomsResult = orgIds.length
    ? await supabase.from("classrooms").select("id, organization_id, name, subject, academic_period, created_at").in("organization_id", orgIds).is("archived_at", null).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (classroomsResult.error) {
    console.error("Class workspace lookup failed.", classroomsResult.error.message);
    return <WorkflowError />;
  }

  const classrooms = classroomsResult.data ?? [];
  const classIds = classrooms.map((classroom) => classroom.id);
  const classMembershipResult = classIds.length
    ? await supabase.from("class_memberships").select("id, classroom_id, user_id, role").in("classroom_id", classIds).is("removed_at", null)
    : { data: [], error: null };
  if (classMembershipResult.error) {
    console.error("Class membership lookup failed.", classMembershipResult.error.message);
    return <WorkflowError />;
  }
  const membersByClass = new Map<string, number>();
  for (const membership of classMembershipResult.data ?? []) {
    membersByClass.set(membership.classroom_id, (membersByClass.get(membership.classroom_id) ?? 0) + 1);
  }
  const roleByOrganization = new Map((memberships ?? []).map((membership) => [membership.organization_id, membership.role]));
  const canManageRosters = ["owner", "administrator", "academic_coordinator"].includes(
    roleByOrganization.get(selectedOrganization?.id ?? "") ?? "",
  );
  const organizationRosterResult = selectedOrganization && canManageRosters
    ? await supabase.from("organization_memberships").select("user_id, role").eq("organization_id", selectedOrganization.id).is("removed_at", null)
    : { data: [], error: null };
  if (organizationRosterResult.error) {
    console.error("Organization roster lookup failed.", organizationRosterResult.error.message);
    return <WorkflowError />;
  }
  const profileIds = [...new Set([
    ...(classMembershipResult.data ?? []).map((membership) => membership.user_id),
    ...(organizationRosterResult.data ?? []).map((membership) => membership.user_id),
  ])];
  const profilesResult = profileIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    console.error("Class roster profile lookup failed.", profilesResult.error.message);
    return <WorkflowError />;
  }
  const profileNames = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
  const canCreate = organizations.filter((organization) => organization.id === selectedOrganization?.id).filter((organization) =>
    ["owner", "administrator", "academic_coordinator"].includes(roleByOrganization.get(organization.id) ?? ""),
  );
  const canEnroll = (memberships ?? []).some((membership) =>
    membership.organization_id === selectedOrganization?.id && membership.role === "student",
  );
  const canViewMemberCounts = (classroomId: string, organizationId: string) =>
    ["owner", "administrator", "academic_coordinator"].includes(roleByOrganization.get(organizationId) ?? "")
    || (classMembershipResult.data ?? []).some((membership) =>
      membership.classroom_id === classroomId && membership.user_id === user.id && membership.role === "teacher",
    );

  return (
    <main className="workspace-home">
      <header className="workspace-home-header"><Link className="auth-brand" href="/app"><span className="brand-mark">k</span><span>knovera</span></Link><div><span>{user.email}</span><form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form></div></header>
      <section className="workspace-home-main">
        <p className="eyebrow">ACADEMY HUB · CLASSES</p>
        <h1>Classes</h1>
        <p className="page-subtitle">Classes and enrollments are stored in Supabase and access is limited by organization and class role.</p>
        {query.error && <p className="auth-error" role="alert">The class action could not be completed. Check the code, your organization role, and the database policies.</p>}
        {query.enrolled && <p className="callout">Class enrollment or roster change completed.</p>}
        <nav className="workflow-links"><Link href="/app">Organizations</Link><Link href={`/app/academics${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Academic workspace</Link><Link href={`/app/assignments${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Assignments</Link><Link href={`/app/projects${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Projects</Link><Link href={`/app/reports${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Reports</Link></nav>
        {organizations.length > 1 && <form method="get" className="organization-select-form"><label>Active organization<select name="organization" defaultValue={selectedOrganization?.id}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {roleByOrganization.get(organization.id)}</option>)}</select></label><button className="button button-outline button-small">Switch organization</button></form>}
        {classrooms.length ? <div className="organization-grid">{classrooms.map((classroom) => {
          const classMembers = (classMembershipResult.data ?? []).filter((membership) => membership.classroom_id === classroom.id);
          const enrolledUserIds = new Set(classMembers.map((membership) => membership.user_id));
          const candidates = (organizationRosterResult.data ?? []).filter((membership) => !enrolledUserIds.has(membership.user_id));
          const canManageClassRoster = canManageRosters && classroom.organization_id === selectedOrganization?.id;
          return <article className="panel organization-card" key={classroom.id}>
            <span className="org-avatar">{classroom.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <h2>{classroom.name}</h2>
              <p>{classroom.subject}{classroom.academic_period ? ` · ${classroom.academic_period}` : ""}</p>
              <span className="organization-id">{canViewMemberCounts(classroom.id, classroom.organization_id) ? `${membersByClass.get(classroom.id) ?? 0} active members · ` : ""}{roleByOrganization.get(classroom.organization_id)}</span>
              {canViewMemberCounts(classroom.id, classroom.organization_id) && <div className="submission-list">
                <h3>Class roster</h3>
                {classMembers.map((member) => <div className="submission-summary" key={member.id}>
                  <span>{profileNames.get(member.user_id) || `Member ${member.user_id.slice(0, 8)}`} · {member.role}</span>
                  {canManageClassRoster && <form action={removeClassMemberAction}><input type="hidden" name="membership_id" value={member.id} /><button className="button button-outline button-small">Remove</button></form>}
                </div>)}
                {canManageClassRoster && (candidates.length ? <form action={assignClassMemberAction} className="auth-form workflow-form">
                  <input type="hidden" name="organization_id" value={classroom.organization_id} />
                  <input type="hidden" name="classroom_id" value={classroom.id} />
                  <label>Organization member<select name="user_id" required defaultValue=""><option value="" disabled>Select a member</option>{candidates.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{profileNames.get(candidate.user_id) || `Member ${candidate.user_id.slice(0, 8)}`} · {candidate.role}</option>)}</select></label>
                  <label>Class role<select name="role" required defaultValue=""><option value="" disabled>Select a role</option><option value="teacher">Teacher</option><option value="student">Student</option><option value="observer">Observer</option></select></label>
                  <button className="button button-outline button-small">Add to class</button>
                </form> : <p className="workflow-meta">All active organization members are already in this class.</p>)}
              </div>}
            </div>
          </article>;
        })}</div> : <p className="empty-workflow">No classes are available to this account yet.</p>}
        {canCreate.length > 0 && <ClassCreationForm organizations={canCreate} />}
        {canEnroll && <ClassEnrollmentForm />}
      </section>
    </main>
  );
}

function WorkflowError() {
  return <main className="auth-page"><section className="auth-card"><h1>Could not load classes</h1><p>Check that both Supabase migrations have been applied and that database policies are active.</p><Link href="/app">Return to organizations</Link></section></main>;
}
