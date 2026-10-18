import Link from "next/link";
import { signInAction } from "@/app/auth/actions";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type Props = {
  searchParams: Promise<{ error?: string; setup?: string; next?: string }>;
};

export const instant = false;

const loginErrors: Record<string, string> = {
  invalid: "Enter a valid email address and password.",
  credentials: "Email or password was not accepted.",
  callback: "That sign-in link could not be verified. Please try again.",
  signout: "Sign-out did not complete. Please try again.",
};

export default async function LoginPage({ searchParams }: Props) {
  const query = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const error = query.setup
    ? "Connect a Supabase project before using account sign-in."
    : loginErrors[query.error ?? ""];

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Sign in to your workspace</h1>
        <p className="auth-description">Sign in with the email address connected to your institute, academy, teacher, or student account.</p>
        {!configured && <div className="callout callout-warning"><span className="callout-mark">!</span><span>Supabase is not configured yet. The public browser demo is still available at the home page.</span></div>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form action={signInAction} className="auth-form">
          <input type="hidden" name="next" value={query.next ?? "/app"} />
          <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <div className="auth-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
          <button className="button button-primary button-wide" disabled={!configured}>Sign in</button>
        </form>
        <p className="auth-switch">New to Knovera? <Link href={`/signup${query.next ? `?next=${encodeURIComponent(query.next)}` : ""}`}>Create an account</Link></p>
      </section>
      <p className="auth-disclaimer">Knovera is being prepared for institutional use. Do not enter real learner information until your administrator has configured and reviewed access controls.</p>
    </main>
  );
}
