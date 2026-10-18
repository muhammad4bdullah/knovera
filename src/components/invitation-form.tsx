"use client";

import { useActionState } from "react";
import { createInvitationAction, type InvitationActionState } from "@/app/auth/actions";

export function InvitationForm({
  organizationId,
  isOwner,
}: {
  organizationId: string;
  isOwner: boolean;
}) {
  const [state, action, pending] = useActionState<InvitationActionState, FormData>(createInvitationAction, {});

  return (
    <>
      <form action={action} className="auth-form">
        <input type="hidden" name="organization_id" value={organizationId} />
        <label>Email address<input name="email" type="email" required maxLength={254} /></label>
        <label>Organization role<select name="role"><option value="teacher">Teacher</option><option value="academic_coordinator">Academic coordinator</option><option value="student">Student</option><option value="observer">Observer</option>{isOwner && <option value="administrator">Administrator</option>}</select></label>
        <button className="button button-primary" disabled={pending}>{pending ? "Creating…" : "Create invitation link"}</button>
      </form>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}
      {state.inviteUrl && <label className="invite-link-field">Single-use invitation link<input readOnly value={state.inviteUrl} onFocus={(event) => event.currentTarget.select()} /></label>}
    </>
  );
}
