import Link from "next/link";
import { signUpAction } from "@/app/auth/actions";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type Props = {
  searchParams: Promise<{ error?: string; setup?: string; next?: string; "check-email"?: string }>;
};

export const instant = false;

export default async function SignupPage({ searchParams }: Props) {
  const query = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const error = query.setup
    ? "Connect a Supabase project before creating accounts."
    : query.error === "invalid"
      ? "Check your name, email and password. Passwords must be at least 12 characters."
      : query.error === "signup"
        ? "Account creation did not complete. Check your email or contact your administrator."
        : "";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link>
        <p className="eyebrow">GET STARTED</p>
        <h1>Create your account</h1>
        <p className="auth-description">Create one personal account. An institute, academy, or independent teacher can then create its workspace. Teachers and students should sign up with the email address their organization invited.</p>
        {!configured && <div className="callout callout-warning"><span className="callout-mark">!</span><span>Supabase is not configured. You can still explore the clearly labeled sample demo from the home page.</span></div>}
        {query["check-email"] && <div className="validation-success" role="status">Check your inbox and verify your email before signing in.</div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form action={signUpAction} className="auth-form">
          <input type="hidden" name="next" value={query.next ?? "/app"} />
          <label>Your name<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={12} aria-describedby="password-hint" /><small id="password-hint">Use at least 12 characters.</small></label>
          <button className="button button-primary button-wide" disabled={!configured}>Create account</button>
        </form>
        <p className="auth-switch">Already have an account? <Link href={`/login${query.next ? `?next=${encodeURIComponent(query.next)}` : ""}`}>Sign in</Link></p>
      </section>
      <p className="auth-disclaimer">Use a development Supabase project until migrations and organization access are reviewed.</p>
    </main>
  );
}
