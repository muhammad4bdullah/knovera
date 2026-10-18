import Link from "next/link";
import { requestPasswordResetAction } from "@/app/auth/actions";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

type Props = { searchParams: Promise<{ error?: string; setup?: string; sent?: string }> };

export const instant = false;

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const query = await searchParams;
  const configured = Boolean(getSupabasePublicConfig());
  const error = query.setup
    ? "Connect Supabase before requesting account recovery."
    : query.error === "invalid"
      ? "Enter a valid email address."
      : query.error === "session"
        ? "The recovery link is missing or expired. Request a new one."
        : query.error === "request"
          ? "The recovery email could not be requested. Try again later."
          : "";
  return <main className="auth-page"><section className="auth-card"><Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Reset your password</h1><p className="auth-description">We&apos;ll send a secure recovery link to the account email.</p>{query.sent && <div className="validation-success" role="status">If the account exists, check the inbox for a recovery link.</div>}{error && <p className="auth-error" role="alert">{error}</p>}<form action={requestPasswordResetAction} className="auth-form"><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><button className="button button-primary button-wide" disabled={!configured}>Send recovery link</button></form><p className="auth-switch"><Link href="/login">Back to sign in</Link></p></section></main>;
}
