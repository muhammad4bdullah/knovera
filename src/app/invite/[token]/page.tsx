import { createHash } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptInvitationAction } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ token: string }> };

export const instant = false;

export default async function InvitationPage({ params }: Props) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><p>Configure Supabase before accepting organization invitations.</p><Link href="/login">Go to sign in</Link></section></main>;
  }

  const [{ data: { user }, error: userError }, invitationResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("preview_organization_invitation", {
      invitation_token_hash: createHash("sha256").update(token).digest("hex"),
    }),
  ]);
  if (userError) {
    console.error("Invitation authentication check failed.", userError.message);
    return <main className="auth-page"><section className="auth-card"><h1>Could not check sign-in</h1><p>Please reload and try again.</p></section></main>;
  }
  const { data: invitations, error } = invitationResult;
  if (error) {
    console.error("Invitation lookup failed.", error.message);
    return <main className="auth-page"><section className="auth-card"><h1>Could not check invitation</h1><p>Please retry later or ask the organization administrator to send a new invitation.</p></section></main>;
  }
  const invitation = invitations?.[0];
  if (!invitation || invitation.revoked_at || invitation.accepted_at || new Date(invitation.expires_at) <= new Date()) {
    return <main className="auth-page"><section className="auth-card"><h1>Invitation is no longer valid</h1><p>Ask the organization administrator for a new invitation.</p><Link href="/">Return to Knovera</Link></section></main>;
  }

  if (!user) {
    const path = `/invite/${token}`;
    return <main className="auth-page"><section className="auth-card"><Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link><p className="eyebrow">ORGANIZATION INVITATION</p><h1>Join {invitation.organization_name}</h1><p className="auth-description">You have been invited as {invitation.invitation_role} using {invitation.invitation_email}. Sign in or create an account using that email address to accept.</p><div className="auth-actions"><Link className="button button-primary" href={`/login?next=${encodeURIComponent(path)}`}>Sign in to accept</Link><Link className="button button-outline" href={`/signup?next=${encodeURIComponent(path)}`}>Create account</Link></div></section></main>;
  }

  if (user.email?.toLowerCase() !== invitation.invitation_email.toLowerCase()) {
    return <main className="auth-page"><section className="auth-card"><h1>Use the invited email</h1><p>This invitation was sent to {invitation.invitation_email}. Sign out and sign in with that address to accept it.</p><Link href="/app">Go to your workspace</Link></section></main>;
  }

  return <main className="auth-page"><section className="auth-card"><Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link><p className="eyebrow">ORGANIZATION INVITATION</p><h1>Join {invitation.organization_name}</h1><p className="auth-description">Accept this invitation as {invitation.invitation_role}. It expires {new Date(invitation.invitation_expires_at).toLocaleDateString()}.</p><form action={acceptInvitationAction}><input type="hidden" name="token" value={token} /><button className="button button-primary button-wide">Accept invitation</button></form></section></main>;
}
