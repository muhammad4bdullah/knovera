"use server";

import { randomBytes, randomUUID, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

function deadline(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T23:59:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date.toISOString();
}

export type ClassActionState = {
  error?: string;
  enrollmentCode?: string;
};

export type InvitationActionState = {
  error?: string;
  inviteUrl?: string;
};

export async function signInAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");

  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const next = safeNext(field(formData, "next"));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    redirect("/login?error=invalid");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=credentials");
  redirect(next);
}

export async function signUpAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/signup?setup=supabase");

  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const next = safeNext(field(formData, "next"));

  if (
    name.length < 2 ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12
  ) {
    redirect("/signup?error=invalid");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: new URL(`/auth/callback?next=${encodeURIComponent(next)}`, siteUrl).toString(),
    },
  });

  if (error) redirect("/signup?error=signup");
  if (!data.session) redirect(`/signup?check-email=1&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { error } = await supabase.auth.signOut();
  if (error) redirect("/app?error=signout");
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/forgot-password?setup=supabase");
  const email = field(formData, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/forgot-password?error=invalid");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/auth/callback?next=/reset-password", siteUrl).toString(),
  });
  if (error) {
    console.error("Password reset request failed.", error.message);
    redirect("/forgot-password?error=request");
  }
  redirect("/forgot-password?sent=1");
}

export async function updatePasswordAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/reset-password?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/forgot-password?error=session");

  const password = field(formData, "password");
  if (password.length < 12 || password.length > 128) {
    redirect("/reset-password?error=invalid");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("Password update failed.", error.message);
    redirect("/reset-password?error=update");
  }
  redirect("/app");
}

export async function createOrganizationAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const name = field(formData, "name");
  const organizationType = field(formData, "organization_type");
  if (
    name.length < 2 ||
    name.length > 160 ||
    !["institute", "academy", "teacher_workspace"].includes(organizationType)
  ) redirect("/app?error=organization");

  const { error } = await supabase.from("organizations").insert({
    name,
    organization_type: organizationType,
    owner_user_id: user.id,
  });
  if (error) {
    console.error("Organization creation failed.", error.message);
    redirect("/app?error=organization");
  }

  revalidatePath("/app");
  redirect("/app");
}

export async function createOrganizationRelationshipAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const sourceOrganizationId = field(formData, "source_organization_id");
  const targetOrganizationId = field(formData, "target_organization_id");
  const relationshipType = field(formData, "relationship_type");
  if (
    !/^[0-9a-f-]{36}$/i.test(sourceOrganizationId) ||
    !/^[0-9a-f-]{36}$/i.test(targetOrganizationId) ||
    sourceOrganizationId === targetOrganizationId ||
    !["parent", "affiliate", "partner", "other"].includes(relationshipType)
  ) redirect("/app?error=relationship");

  const { error } = await supabase.from("organization_relationships").insert({
    source_organization_id: sourceOrganizationId,
    target_organization_id: targetOrganizationId,
    relationship_type: relationshipType,
    requested_by: user.id,
  });
  if (error) {
    console.error("Organization relationship request failed.", error.message);
    redirect("/app?error=relationship");
  }
  revalidatePath("/app");
  redirect(`/app?organization=${encodeURIComponent(sourceOrganizationId)}&relationship=requested`);
}

export async function respondToOrganizationRelationshipAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const relationshipId = field(formData, "relationship_id");
  const organizationId = field(formData, "organization_id");
  const accept = field(formData, "accept") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(relationshipId) || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    redirect("/app?error=relationship");
  }

  const { error } = await supabase.rpc("respond_to_organization_relationship", {
    relationship_id: relationshipId,
    accept_request: accept,
  });
  if (error) {
    console.error("Organization relationship response failed.", error.message);
    redirect(`/app?organization=${encodeURIComponent(organizationId)}&error=relationship`);
  }
  revalidatePath("/app");
  redirect(`/app?organization=${encodeURIComponent(organizationId)}&relationship=updated`);
}

export async function createInvitationAction(
  _previousState: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };

  const organizationId = field(formData, "organization_id");
  const email = field(formData, "email").toLowerCase();
  const role = field(formData, "role");
  const allowedRoles = ["administrator", "academic_coordinator", "teacher", "student", "observer"];
  if (!organizationId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !allowedRoles.includes(role)) {
    return { error: "Enter a valid email address and organization role." };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (membershipError || !membership) return { error: "You cannot create an invitation for this organization." };
  if (!["owner", "administrator"].includes(membership.role) || (role === "administrator" && membership.role !== "owner")) {
    return { error: "Your organization role cannot create this invitation." };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.from("organization_invitations").insert({
    organization_id: organizationId,
    email,
    role,
    token_hash: tokenHash,
    invited_by: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) {
    console.error("Invitation creation failed.", error.message);
    return { error: "The invitation could not be created. Check the database permissions and try again." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const inviteUrl = new URL(`/invite/${token}`, siteUrl).toString();
  revalidatePath("/app");
  return { inviteUrl };
}

export async function acceptInvitationAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const token = field(formData, "token");
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) redirect("/invite/error");

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { error } = await supabase.rpc("accept_organization_invitation", {
    invitation_token_hash: tokenHash,
  });
  if (error) {
    console.error("Invitation acceptance failed.", error.message);
    redirect("/invite/error");
  }
  revalidatePath("/app");
  redirect("/app");
}

export async function revokeInvitationAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const invitationId = field(formData, "invitation_id");
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) redirect("/app?error=invitation");
  const { error } = await supabase.rpc("revoke_organization_invitation", {
    invitation_id: invitationId,
  });
  if (error) {
    console.error("Invitation revocation failed.", error.message);
    redirect("/app?error=invitation");
  }
  revalidatePath("/app");
  redirect("/app?revoked=1");
}

export async function createClassAction(
  _previousState: ClassActionState,
  formData: FormData,
): Promise<ClassActionState> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const organizationId = field(formData, "organization_id");
  const name = field(formData, "name");
  const subject = field(formData, "subject");
  const academicPeriod = field(formData, "academic_period");
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || name.length < 1 || name.length > 160 || subject.length < 1 || subject.length > 100) {
    return { error: "Enter a valid organization, class name, and subject." };
  }

  const enrollmentCode = randomBytes(16).toString("base64url");
  const enrollmentCodeHash = createHash("sha256").update(enrollmentCode).digest("hex");
  const { error } = await supabase.from("classrooms").insert({
    organization_id: organizationId,
    name,
    subject,
    academic_period: academicPeriod.slice(0, 80),
    enrollment_code_hash: enrollmentCodeHash,
    enrollment_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: user.id,
  });
  if (error) {
    console.error("Class creation failed.", error.message);
    return { error: "Class could not be created. Check your organization role and database permissions." };
  }
  revalidatePath("/app/classes");
  return { enrollmentCode };
}

export async function assignClassMemberAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const organizationId = field(formData, "organization_id");
  const classroomId = field(formData, "classroom_id");
  const userId = field(formData, "user_id");
  const role = field(formData, "role");
  if (
    !/^[0-9a-f-]{36}$/i.test(organizationId) ||
    !/^[0-9a-f-]{36}$/i.test(classroomId) ||
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    !["teacher", "student", "observer"].includes(role)
  ) redirect("/app/classes?error=membership");

  const { error } = await supabase.from("class_memberships").upsert({
    organization_id: organizationId,
    classroom_id: classroomId,
    user_id: userId,
    role,
    removed_at: null,
  }, { onConflict: "classroom_id,user_id" });
  if (error) {
    console.error("Class enrollment failed.", error.message);
    redirect("/app/classes?error=membership");
  }
  revalidatePath("/app/classes");
  redirect("/app/classes?enrolled=1");
}

export async function removeClassMemberAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const membershipId = field(formData, "membership_id");
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) redirect("/app/classes?error=membership");

  const { data, error } = await supabase.from("class_memberships")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", membershipId)
    .is("removed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Class membership removal failed.", error.message);
    redirect("/app/classes?error=membership");
  }
  revalidatePath("/app/classes");
  redirect("/app/classes?enrolled=1");
}

export async function enrollInClassAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const code = field(formData, "enrollment_code");
  if (!/^[A-Za-z0-9_-]{20,30}$/.test(code)) redirect("/app/classes?error=code");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const { error } = await supabase.rpc("enroll_in_class", {
    enrollment_code_hash: codeHash,
  });
  if (error) {
    console.error("Class enrollment by code failed.", error.message);
    redirect("/app/classes?error=code");
  }
  revalidatePath("/app/classes");
  redirect("/app/classes?enrolled=1");
}

export async function createAssignmentAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const classroomId = field(formData, "classroom_id");
  const title = field(formData, "title");
  const instructions = field(formData, "instructions");
  const dueDate = field(formData, "due_at");
  const dueAt = deadline(dueDate);
  const rawMarks = field(formData, "target_marks");
  const targetMarks = rawMarks ? Number(rawMarks) : null;
  if (!/^[0-9a-f-]{36}$/i.test(classroomId) || title.length < 1 || title.length > 200 || instructions.length > 10000 || dueAt === undefined || (targetMarks !== null && (!Number.isInteger(targetMarks) || targetMarks < 1 || targetMarks > 10000))) {
    redirect("/app/assignments?error=assignment");
  }
  const { data: classroom, error: classError } = await supabase
    .from("classrooms")
    .select("id, organization_id")
    .eq("id", classroomId)
    .maybeSingle();
  if (classError || !classroom) redirect("/app/assignments?error=assignment");

  const { error } = await supabase.from("assignments").insert({
    organization_id: classroom.organization_id,
    classroom_id: classroom.id,
    title,
    instructions,
    due_at: dueAt,
    target_marks: targetMarks,
    status: "draft",
    created_by: user.id,
  });
  if (error) {
    console.error("Assignment creation failed.", error.message);
    redirect("/app/assignments?error=assignment");
  }
  revalidatePath("/app/assignments");
  redirect("/app/assignments?created=1");
}

export async function publishAssignmentAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const assignmentId = field(formData, "assignment_id");
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) redirect("/app/assignments?error=assignment");
  const { data, error } = await supabase.from("assignments")
    .update({ status: "published" })
    .eq("id", assignmentId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Assignment publication failed.", error.message);
    redirect("/app/assignments?error=assignment");
  }
  revalidatePath("/app/assignments");
  redirect("/app/assignments?published=1");
}

export async function releaseAssignmentAnswersAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const assignmentId = field(formData, "assignment_id");
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId)) redirect("/app/assignments?error=assignment");
  const { data, error } = await supabase.from("assignments")
    .update({ answer_release_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .is("answer_release_at", null)
    .neq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Assignment answer release failed.", error.message);
    redirect("/app/assignments?error=assignment");
  }
  revalidatePath("/app/assignments");
  redirect("/app/assignments?released=1");
}

export async function submitAssignmentAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const assignmentId = field(formData, "assignment_id");
  const classroomId = field(formData, "classroom_id");
  const organizationId = field(formData, "organization_id");
  const response = field(formData, "response");
  if (!/^[0-9a-f-]{36}$/i.test(assignmentId) || !/^[0-9a-f-]{36}$/i.test(classroomId) || !/^[0-9a-f-]{36}$/i.test(organizationId) || response.length > 10000) {
    redirect("/app/assignments?error=submission");
  }
  const { data: existing, error: existingError } = await supabase.from("assignment_submissions")
    .select("id, status")
    .eq("assignment_id", assignmentId)
    .eq("student_id", user.id)
    .maybeSingle();
  if (existingError) {
    console.error("Assignment submission lookup failed.", existingError.message);
    redirect("/app/assignments?error=submission");
  }
  if (existing && !["draft", "returned"].includes(existing.status)) {
    redirect("/app/assignments?error=submission");
  }

  const responseData = { answer_text: response };
  if (existing?.status === "returned") {
    const { data, error } = await supabase.from("assignment_submissions")
      .update({ response_data: responseData, status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", "returned")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Assignment revision submission failed.", error.message);
      redirect("/app/assignments?error=submission");
    }
  } else {
    if (existing) {
      const { error: saveError } = await supabase.from("assignment_submissions")
        .update({ response_data: responseData })
        .eq("id", existing.id)
        .eq("status", "draft");
      if (saveError) {
        console.error("Assignment draft save failed.", saveError.message);
        redirect("/app/assignments?error=submission");
      }
    } else {
      const { error: saveError } = await supabase.from("assignment_submissions").insert({
        assignment_id: assignmentId,
        classroom_id: classroomId,
        organization_id: organizationId,
        student_id: user.id,
        response_data: responseData,
        status: "draft",
      });
      if (saveError) {
        console.error("Assignment draft save failed.", saveError.message);
        redirect("/app/assignments?error=submission");
      }
    }
    const { data, error } = await supabase.from("assignment_submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("assignment_id", assignmentId)
      .eq("student_id", user.id)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Assignment submission failed.", error.message);
      redirect("/app/assignments?error=submission");
    }
  }
  revalidatePath("/app/assignments");
  redirect("/app/assignments?submitted=1");
}

export async function reviewAssignmentSubmissionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const submissionId = field(formData, "submission_id");
  const rawMark = field(formData, "mark_awarded");
  const feedback = field(formData, "teacher_feedback");
  const mark = rawMark === "" ? null : Number(rawMark);
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || (mark !== null && (!Number.isInteger(mark) || mark < 0)) || feedback.length > 5000) {
    redirect("/app/assignments?error=review");
  }
  const { error } = await supabase.rpc("review_assignment_submission", {
    target_submission_id: submissionId,
    awarded_mark: mark,
    feedback_text: feedback,
  });
  if (error) {
    if (error) console.error("Assignment review failed.", error.message);
    redirect("/app/assignments?error=review");
  }
  revalidatePath("/app/assignments");
  redirect("/app/assignments?reviewed=1");
}

export async function returnAssignmentSubmissionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const submissionId = field(formData, "submission_id");
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) redirect("/app/assignments?error=review");
  const { data, error } = await supabase.from("assignment_submissions")
    .update({ status: "returned" })
    .eq("id", submissionId)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Assignment return failed.", error.message);
    redirect("/app/assignments?error=review");
  }
  revalidatePath("/app/assignments");
  redirect("/app/assignments?returned=1");
}

export async function createProjectAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const classroomId = field(formData, "classroom_id");
  const rubricId = field(formData, "rubric_id");
  const title = field(formData, "title");
  const description = field(formData, "description");
  const dueDate = field(formData, "due_at");
  const dueAt = deadline(dueDate);
  if (
    !/^[0-9a-f-]{36}$/i.test(classroomId)
    || (rubricId && !/^[0-9a-f-]{36}$/i.test(rubricId))
    || title.length < 1
    || title.length > 200
    || description.length > 10000
    || dueAt === undefined
  ) {
    redirect("/app/projects?error=project");
  }
  const { data: classroom, error: classError } = await supabase
    .from("classrooms")
    .select("id, organization_id")
    .eq("id", classroomId)
    .maybeSingle();
  if (classError || !classroom) redirect("/app/projects?error=project");
  const { error } = await supabase.from("projects").insert({
    organization_id: classroom.organization_id,
    classroom_id: classroom.id,
    title,
    description,
    due_at: dueAt,
    rubric_id: rubricId || null,
    status: "draft",
    created_by: user.id,
  });
  if (error) {
    console.error("Project creation failed.", error.message);
    redirect("/app/projects?error=project");
  }
  revalidatePath("/app/projects");
  redirect("/app/projects?created=1");
}

export async function createRubricAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const organizationId = field(formData, "organization_id");
  const title = field(formData, "title").trim();
  const lines = field(formData, "criteria").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^[0-9a-f-]{36}$/i.test(organizationId) || title.length < 1 || title.length > 200 || lines.length < 1 || lines.length > 10) {
    redirect("/app/projects?error=rubric");
  }
  const criteria = lines.map((line) => {
    const [criterionTitle = "", rawPoints = "", ...description] = line.split("|");
    return {
      title: criterionTitle.trim(),
      max_points: Number(rawPoints.trim()),
      description: description.join("|").trim(),
    };
  });
  if (criteria.some((criterion) =>
    criterion.title.length < 1
    || criterion.title.length > 200
    || !Number.isInteger(criterion.max_points)
    || criterion.max_points < 1
    || criterion.max_points > 1000
    || criterion.description.length > 2000,
  )) {
    redirect("/app/projects?error=rubric");
  }
  const { error } = await supabase.rpc("create_rubric_with_criteria", {
    target_organization_id: organizationId,
    rubric_title: title,
    criterion_list: criteria,
  });
  if (error) {
    console.error("Rubric creation failed.", error.message);
    redirect("/app/projects?error=rubric");
  }
  revalidatePath("/app/projects");
  redirect("/app/projects?rubric=created");
}

export async function submitProjectAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const projectId = field(formData, "project_id");
  const organizationId = field(formData, "organization_id");
  const evidenceText = field(formData, "evidence_text");
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[0-9a-f-]{36}$/i.test(organizationId) || evidenceText.length > 20000) {
    redirect("/app/projects?error=submission");
  }
  const { data: previous, error: previousError } = await supabase
    .from("project_submissions")
    .select("submission_version")
    .eq("project_id", projectId)
    .eq("student_id", user.id)
    .order("submission_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) {
    console.error("Project submission lookup failed.", previousError.message);
    redirect("/app/projects?error=submission");
  }
  const { error } = await supabase.from("project_submissions").insert({
    organization_id: organizationId,
    project_id: projectId,
    student_id: user.id,
    submission_version: (previous?.submission_version ?? 0) + 1,
    evidence_text: evidenceText,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Project submission failed.", error.message);
    redirect("/app/projects?error=submission");
  }
  revalidatePath("/app/projects");
  redirect("/app/projects?submitted=1");
}

export async function uploadProjectEvidenceAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const projectId = field(formData, "project_id");
  const organizationId = field(formData, "organization_id");
  const file = formData.get("evidence_file");
  const mimeExtensions: Record<string, string> = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "image/jpeg": "jpg",
    "image/png": "png",
  };
  if (
    !/^[0-9a-f-]{36}$/i.test(projectId)
    || !/^[0-9a-f-]{36}$/i.test(organizationId)
    || !(file instanceof File)
    || file.size < 1
    || file.size > 15 * 1024 * 1024
    || !mimeExtensions[file.type]
  ) {
    redirect("/app/projects?error=upload");
  }

  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id, organization_id, classroom_id, status")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .eq("status", "published")
    .maybeSingle();
  if (projectError || !project || !project.classroom_id) {
    if (projectError) console.error("Project evidence lookup failed.", projectError.message);
    redirect("/app/projects?error=upload");
  }

  const { data: membership, error: membershipError } = await supabase.from("class_memberships")
    .select("role")
    .eq("classroom_id", project.classroom_id)
    .eq("user_id", user.id)
    .eq("role", "student")
    .is("removed_at", null)
    .maybeSingle();
  if (membershipError || !membership) {
    if (membershipError) console.error("Project evidence membership check failed.", membershipError.message);
    redirect("/app/projects?error=upload");
  }

  const storagePath = `${organizationId}/${project.classroom_id}/${user.id}/${project.id}/${randomUUID()}.${mimeExtensions[file.type]}`;
  const { error: uploadError } = await supabase.storage.from("student-evidence").upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("Project evidence upload failed.", uploadError.message);
    redirect("/app/projects?error=upload");
  }

  revalidatePath("/app/projects");
  redirect(`/app/projects?organization=${encodeURIComponent(organizationId)}&uploaded=1`);
}

export async function evaluateProjectSubmissionAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const submissionId = field(formData, "submission_id");
  const feedback = field(formData, "feedback");
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || feedback.length > 10000) {
    redirect("/app/projects?error=evaluation");
  }
  const { data, error } = await supabase.from("project_submissions").update({
    status: "evaluated",
    feedback,
    evaluated_by: user.id,
    evaluated_at: new Date().toISOString(),
  }).eq("id", submissionId).in("status", ["submitted", "under_review"]).select("id").maybeSingle();
  if (error || !data) {
    if (error) console.error("Project evaluation failed.", error.message);
    redirect("/app/projects?error=evaluation");
  }
  revalidatePath("/app/projects");
  redirect("/app/projects?evaluated=1");
}

export async function evaluateProjectSubmissionWithRubricAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");
  const submissionId = field(formData, "submission_id");
  const overallFeedback = field(formData, "feedback");
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || overallFeedback.length > 10000) {
    redirect("/app/projects?error=evaluation");
  }
  const { data: submission, error: submissionError } = await supabase.from("project_submissions")
    .select("id, organization_id, project_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError || !submission) {
    if (submissionError) console.error("Rubric evaluation lookup failed.", submissionError.message);
    redirect("/app/projects?error=evaluation");
  }
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("rubric_id")
    .eq("id", submission.project_id)
    .eq("organization_id", submission.organization_id)
    .maybeSingle();
  if (projectError || !project?.rubric_id) {
    if (projectError) console.error("Project rubric lookup failed.", projectError.message);
    redirect("/app/projects?error=evaluation");
  }
  const { data: criteria, error: criteriaError } = await supabase.from("rubric_criteria")
    .select("id, max_points")
    .eq("rubric_id", project.rubric_id)
    .eq("organization_id", submission.organization_id)
    .order("position");
  if (criteriaError || !criteria?.length) {
    if (criteriaError) console.error("Rubric criteria lookup failed.", criteriaError.message);
    redirect("/app/projects?error=evaluation");
  }
  const criterionScores = criteria.map((criterion) => {
    const rawPoints = field(formData, `score_${criterion.id}`);
    return {
      criterion_id: criterion.id,
      points: rawPoints ? Number(rawPoints) : Number.NaN,
      feedback: field(formData, `feedback_${criterion.id}`),
    };
  });
  if (criterionScores.some((score, index) =>
    !Number.isInteger(score.points)
    || score.points < 0
    || score.points > criteria[index].max_points
    || score.feedback.length > 2000,
  )) {
    redirect("/app/projects?error=evaluation");
  }
  const { error } = await supabase.rpc("evaluate_project_submission_with_rubric", {
    target_submission_id: submissionId,
    criterion_scores: criterionScores,
    overall_feedback: overallFeedback,
  });
  if (error) {
    console.error("Rubric evaluation failed.", error.message);
    redirect("/app/projects?error=evaluation");
  }
  revalidatePath("/app/projects");
  redirect("/app/projects?evaluated=1");
}

export async function publishProjectAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const projectId = field(formData, "project_id");
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) redirect("/app/projects?error=project");
  const { data, error } = await supabase.from("projects")
    .update({ status: "published" })
    .eq("id", projectId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Project publication failed.", error.message);
    redirect("/app/projects?error=project");
  }
  revalidatePath("/app/projects");
  redirect("/app/projects?published=1");
}
