"use client";

import { useActionState } from "react";
import { createClassAction, enrollInClassAction, type ClassActionState } from "@/app/auth/actions";

type OrganizationOption = {
  id: string;
  name: string;
};

export function ClassCreationForm({ organizations }: { organizations: OrganizationOption[] }) {
  const [state, action, pending] = useActionState<ClassActionState, FormData>(createClassAction, {});

  return (
    <section className="panel workspace-panel">
      <h2>Create a class</h2>
      <p>Class enrollment codes are shown only once. Share them privately with enrolled organization students.</p>
      <form action={action} className="auth-form">
        <label>Organization<select name="organization_id" required defaultValue=""><option value="" disabled>Select an organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
        <label>Class name<input name="name" required maxLength={160} /></label>
        <label>Subject<input name="subject" required maxLength={100} /></label>
        <label>Academic period<input name="academic_period" maxLength={80} placeholder="e.g. 2026–2027" /></label>
        <button className="button button-primary" disabled={pending}>{pending ? "Creating…" : "Create class"}</button>
      </form>
      {state.error && <p className="auth-error" role="alert">{state.error}</p>}
      {state.enrollmentCode && <label className="invite-link-field">One-time enrollment code<input readOnly value={state.enrollmentCode} onFocus={(event) => event.currentTarget.select()} /></label>}
    </section>
  );
}

export function ClassEnrollmentForm() {
  return (
    <section className="panel workspace-panel">
      <h2>Join a class</h2>
      <p>Enter an enrollment code shared by your teacher. The code expires after 30 days.</p>
      <form action={enrollInClassAction} className="auth-form">
        <label>Enrollment code<input name="enrollment_code" required minLength={20} maxLength={30} autoComplete="off" /></label>
        <button className="button button-primary">Join class</button>
      </form>
    </section>
  );
}
