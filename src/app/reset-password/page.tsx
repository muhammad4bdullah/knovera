import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePasswordAction } from "@/app/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<{ error?: string; setup?: string }> };

export const instant = false;

export default async function ResetPasswordPage({ searchParams }: Props) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <main className="auth-page"><section className="auth-card"><h1>Supabase setup required</h1><Link href="/login">Sign in</Link></section></main>;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    console.error("Password reset session lookup failed.", userError.message);
    return <main className="auth-page"><section className="auth-card"><h1>Could not verify the recovery link</h1><Link href="/forgot-password">Request another recovery link</Link></section></main>;
  }
  if (!user) redirect("/forgot-password?error=session");

  const error = query.error === "invalid"
    ? "Use a password with at least 12 characters."
    : query.error === "update"
      ? "The password could not be changed. Request a fresh recovery link."
      : "";
  return <main className="auth-page"><section className="auth-card"><Link className="auth-brand" href="/"><span className="brand-mark">k</span><span>knovera</span></Link><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Choose a new password</h1>{error && <p className="auth-error" role="alert">{error}</p>}<form action={updatePasswordAction} className="auth-form"><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><small>Use at least 12 characters.</small></label><button className="button button-primary button-wide">Update password</button></form></section></main>;
}
