import Link from "next/link";
import {
  createOrganizationAction,
  createOrganizationRelationshipAction,
  respondToOrganizationRelationshipAction,
  revokeInvitationAction,
  signOutAction,
} from "@/app/auth/actions";
import { InvitationForm } from "@/components/invitation-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ error?: string; revoked?: string; organization?: string; relationship?: string }>;
};

export const instant = false;

const errors: Record<string, string> = {
  organization: "Organization could not be saved. Check the name and your database configuration.",
  invitation: "The invitation could not be changed. Check your role and organization permissions.",
  relationship: "The organization relationship could not be changed. Confirm both organizations and owner permissions.",
  signout: "Sign-out did not complete. Please try again.",
};

export default async function OrganizationHome({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><p>Add your project URL and public key to the local environment file, then restart the app.</p></section></main>;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return <main className="auth-page"><section className="auth-card"><h1>Sign in required</h1><Link href="/login">Sign in</Link></section></main>;

  const { data: memberships, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .is("removed_at", null);
  if (error) {
    console.error("Organization membership lookup failed.", error.message);
    return <main className="auth-page"><section className="auth-card"><h1>Could not load your organizations</h1><p>Check that the migrations have been applied to this Supabase project.</p><form action={signOutAction}><button className="button button-outline">Sign out</button></form></section></main>;
  }

  const organizationIds = (memberships ?? []).map((membership) => membership.organization_id);
  const organizationResult = organizationIds.length
    ? await supabase.from("organizations").select("id, name, organization_type, created_at").in("id", organizationIds).order("created_at")
    : { data: [], error: null };
  if (organizationResult.error) {
    console.error("Organization lookup failed.", organizationResult.error.message);
    return <main className="auth-page"><section className="auth-card"><h1>Could not load your organizations</h1><p>Check your database policies and migrations.</p></section></main>;
  }

  const organizations = organizationResult.data ?? [];
  const roleByOrganization = new Map((memberships ?? []).map((membership) => [membership.organization_id, membership.role]));
  const selectedOrganization = organizations.find((organization) => organization.id === query.organization) ?? organizations[0];
  const canInvite = selectedOrganization && ["owner", "administrator"].includes(roleByOrganization.get(selectedOrganization.id) ?? "");
  const invitationResult = canInvite
    ? await supabase.from("organization_invitations")
      .select("id, email, role, expires_at, accepted_at, revoked_at")
      .eq("organization_id", selectedOrganization.id)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (invitationResult.error) {
    console.error("Organization invitation lookup failed.", invitationResult.error.message);
  }
  const canManageSelectedOrganization = selectedOrganization && ["owner", "administrator"].includes(roleByOrganization.get(selectedOrganization.id) ?? "");
  const subscriptionResult = canManageSelectedOrganization
    ? await supabase.from("organization_subscriptions")
      .select("organization_id, plan_type, currency, monthly_amount, status")
      .eq("organization_id", selectedOrganization.id)
      .maybeSingle()
    : { data: null, error: null };
  if (subscriptionResult.error) {
    console.error("Organization subscription lookup failed.", subscriptionResult.error.message);
  }
  const organizationRelationshipsResult = organizationIds.length
    ? await supabase.from("organization_relationships")
      .select("id, source_organization_id, target_organization_id, relationship_type, status, requested_by, responded_by, created_at")
      .or(`source_organization_id.in.(${organizationIds.join(",")}),target_organization_id.in.(${organizationIds.join(",")})`)
      .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (organizationRelationshipsResult.error) {
    console.error("Organization relationship lookup failed.", organizationRelationshipsResult.error.message);
  }
  const relationshipOrganizationIds = [...new Set((organizationRelationshipsResult.data ?? [])
    .flatMap((relationship) => [relationship.source_organization_id, relationship.target_organization_id]))];
  const relationshipOrganizationsResult = relationshipOrganizationIds.length
    ? await supabase.from("organizations").select("id, name").in("id", relationshipOrganizationIds)
    : { data: [], error: null };
  const relationshipOrganizationNames = new Map(
    (relationshipOrganizationsResult.data ?? []).map((organization) => [organization.id, organization.name]),
  );
  const ownedOrganizations = organizations.filter((organization) => roleByOrganization.get(organization.id) === "owner");

  return (
    <main className="workspace-home">
      <header className="workspace-home-header"><Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link><div><span>{user.user_metadata?.name ?? user.email}</span><form action={signOutAction}><button className="button button-outline button-small">Sign out</button></form></div></header>
      <section className="workspace-home-main">
        <p className="eyebrow">ACADEMY HUB · AUTHENTICATED</p>
        <h1>Your organizations</h1>
        <p className="page-subtitle">Organization membership and roles are read from Supabase and protected by row-level security.</p>
        {query.error && errors[query.error] && <p className="auth-error" role="alert">{errors[query.error]}</p>}
        {query.revoked && <p className="callout">Invitation revoked.</p>}
        {query.relationship && <p className="callout">Organization relationship request updated.</p>}
        {organizations.length > 1 && <form method="get" className="organization-select-form"><label>Active organization<select name="organization" defaultValue={selectedOrganization?.id}>{organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name} · {roleByOrganization.get(organization.id)}</option>)}</select></label><button className="button button-outline button-small">Switch organization</button></form>}
        <div className="organization-grid">{organizations.map((organization) => <article className="panel organization-card" key={organization.id}><span className="org-avatar">{organization.name.slice(0, 1).toUpperCase()}</span><div><h2>{organization.name}</h2><p>{organization.organization_type.replaceAll("_", " ")} · <strong>{roleByOrganization.get(organization.id)}</strong></p><span className="organization-id">Organization ID: {organization.id}</span></div></article>)}</div>
        <section className="panel workspace-panel"><h2>{organizations.length ? "Create another organization" : "Create your organization"}</h2><p>Institutes and academies remain separate organizations with separate records and subscriptions. A teacher workspace has no configured price or payment flow.</p><form action={createOrganizationAction} className="auth-form"><label>Organization name<input name="name" required minLength={2} maxLength={160} placeholder="e.g. Northstar Academy" /></label><label>Organization type<select name="organization_type" required><option value="institute">Institute</option><option value="academy">Academy</option><option value="teacher_workspace">Independent teacher workspace</option></select></label><button className="button button-primary">Create organization</button></form></section>
        {selectedOrganization && <section className="panel workspace-panel"><h2>Subscription status</h2>{subscriptionResult.error ? <p className="auth-error">Subscription status could not be loaded.</p> : subscriptionResult.data ? <><p>{subscriptionResult.data.plan_type === "institute" ? "Institute" : "Academy"} plan · PKR {subscriptionResult.data.monthly_amount.toLocaleString()} per month · <strong>{subscriptionResult.data.status.replaceAll("_", " ")}</strong></p><p className="form-note">A database record tracks this organization’s required plan, but billing is not connected. No payment has been taken and paid access is not enabled.</p></> : <p>{selectedOrganization.organization_type === "teacher_workspace" ? "Independent teacher plan pricing is undecided. No subscription or charge has been created." : "No institute or academy subscription record is visible to this account."}</p>}</section>}
        {selectedOrganization && canInvite && <section className="panel workspace-panel"><h2>Invite a staff member or learner</h2><p>Create a seven-day, single-use invitation link. The invitee must sign in using the invited email address.</p><InvitationForm organizationId={selectedOrganization.id} isOwner={roleByOrganization.get(selectedOrganization.id) === "owner"} /><p className="form-note">Knovera does not send email yet. Share the link only with the invited person.</p></section>}
        {selectedOrganization && canInvite && <section className="panel workspace-panel"><h2>Recent invitations</h2>{invitationResult.error ? <p className="auth-error">Invitations could not be loaded. Check your organization permissions.</p> : invitationResult.data?.length ? <div className="workflow-list">{invitationResult.data.map((invitation) => {
          const active = !invitation.accepted_at && !invitation.revoked_at && new Date(invitation.expires_at) > new Date();
          return <article className="workflow-card invitation-card" key={invitation.id}><div><strong>{invitation.email}</strong><span className="workflow-meta">{invitation.role} · expires {new Date(invitation.expires_at).toLocaleDateString()}</span></div><span className={`status ${invitation.accepted_at ? "status-green" : active ? "status-amber" : ""}`}>{invitation.accepted_at ? "accepted" : invitation.revoked_at ? "revoked" : active ? "pending" : "expired"}</span>{active && <form action={revokeInvitationAction}><input type="hidden" name="invitation_id" value={invitation.id} /><button className="button button-outline button-small">Revoke</button></form>}</article>;
        })}</div> : <p>No invitations yet.</p>}</section>}
        {ownedOrganizations.length > 0 && <section className="panel workspace-panel"><h2>Organization relationships</h2><p>Relationships are metadata only. Accepting a request does not grant either organization access to the other’s students, classes, curriculum, or billing.</p><form action={createOrganizationRelationshipAction} className="auth-form workflow-form"><label>Your organization<select name="source_organization_id" defaultValue={ownedOrganizations.some((organization) => organization.id === selectedOrganization?.id) ? selectedOrganization?.id : ownedOrganizations[0].id} required>{ownedOrganizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label><label>Other organization ID<input name="target_organization_id" required pattern="[0-9a-fA-F-]{36}" placeholder="Ask that organization’s owner for its ID" /></label><label>Relationship type<select name="relationship_type"><option value="parent">Parent organization</option><option value="affiliate">Affiliate</option><option value="partner">Partner</option><option value="other">Other</option></select></label><button className="button button-outline">Request relationship</button></form>{organizationRelationshipsResult.error ? <p className="auth-error">Relationship records could not be loaded.</p> : <div className="workflow-list">{(organizationRelationshipsResult.data ?? []).map((relationship) => { const isTargetOwner = roleByOrganization.get(relationship.target_organization_id) === "owner"; return <article className="workflow-card invitation-card" key={relationship.id}><div><strong>{relationshipOrganizationNames.get(relationship.source_organization_id) ?? relationship.source_organization_id} ↔ {relationshipOrganizationNames.get(relationship.target_organization_id) ?? relationship.target_organization_id}</strong><span className="workflow-meta">{relationship.relationship_type} · {relationship.status}</span></div><span className={`status ${relationship.status === "active" ? "status-green" : "status-amber"}`}>{relationship.status}</span>{relationship.status === "pending" && isTargetOwner && <div className="relationship-actions"><form action={respondToOrganizationRelationshipAction}><input type="hidden" name="relationship_id" value={relationship.id} /><input type="hidden" name="organization_id" value={selectedOrganization?.id ?? ""} /><input type="hidden" name="accept" value="true" /><button className="button button-outline button-small">Accept</button></form><form action={respondToOrganizationRelationshipAction}><input type="hidden" name="relationship_id" value={relationship.id} /><input type="hidden" name="organization_id" value={selectedOrganization?.id ?? ""} /><input type="hidden" name="accept" value="false" /><button className="button button-quiet button-small">Decline</button></form></div>}</article>; })}</div>}</section>}
        <nav className="workflow-links"><Link href="/app/academics">Academic workspace</Link><Link href="/app/classes">Classes</Link><Link href="/app/assignments">Assignments</Link><Link href="/app/projects">Projects</Link><Link href={`/app/reports${selectedOrganization ? `?organization=${selectedOrganization.id}` : ""}`}>Reports</Link></nav>
        <div className="callout callout-warning"><span className="callout-mark">!</span><span>The authenticated workflows are separate from the original curriculum and paper demo, which still uses browser storage. Do not enter student or confidential assessment data in that demo.</span></div>
      </section>
    </main>
  );
}
