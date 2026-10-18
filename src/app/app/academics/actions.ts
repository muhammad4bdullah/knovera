"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSyllabusCsv } from "@/lib/syllabus-csv";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function back(organizationId: string, error?: string) {
  const query = new URLSearchParams();
  if (validId(organizationId)) query.set("organization", organizationId);
  if (error) query.set("error", error);
  return `/app/academics${query.size ? `?${query.toString()}` : ""}`;
}

async function staffClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login?setup=supabase");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return { supabase, user };
}

export async function createCurriculumAction(formData: FormData) {
  const { supabase, user } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const title = field(formData, "title");
  const version = field(formData, "version");
  if (!validId(organizationId) || title.length < 1 || title.length > 200 || version.length > 80) {
    redirect(back(organizationId, "curriculum"));
  }
  const { error } = await supabase.from("curricula").insert({
    organization_id: organizationId,
    title,
    version_label: version || "1",
    created_by: user.id,
  });
  if (error) {
    console.error("Curriculum creation failed.", error.message);
    redirect(back(organizationId, "curriculum"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function createOutcomeAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const curriculumId = field(formData, "curriculum_id");
  const code = field(formData, "code").toUpperCase();
  const subject = field(formData, "subject");
  const topic = field(formData, "topic");
  const statement = field(formData, "statement");
  const description = field(formData, "description");
  if (
    !validId(organizationId) || !validId(curriculumId) ||
    code.length < 1 || code.length > 40 || subject.length < 1 || subject.length > 120 ||
    topic.length < 1 || topic.length > 160 || statement.length < 1 || statement.length > 2000 ||
    description.length > 4000
  ) redirect(back(organizationId, "outcome"));

  const { error } = await supabase.from("learning_outcomes").insert({
    organization_id: organizationId,
    curriculum_id: curriculumId,
    code,
    subject,
    topic,
    statement,
    description,
  });
  if (error) {
    console.error("Learning outcome creation failed.", error.message);
    redirect(back(organizationId, "outcome"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function importSyllabusCsvAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const curriculumId = field(formData, "curriculum_id");
  const upload = formData.get("outcomes_csv");
  if (
    !validId(organizationId)
    || !validId(curriculumId)
    || !(upload instanceof File)
    || upload.size < 1
    || upload.size > 1024 * 1024
    || (upload.type && !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(upload.type))
  ) redirect(back(organizationId, "outcome-import"));

  let outcomes;
  try {
    outcomes = parseSyllabusCsv(await upload.text());
  } catch {
    redirect(back(organizationId, "outcome-import"));
  }

  const { error } = await supabase.from("learning_outcomes").insert(
    outcomes.map((outcome) => ({
      organization_id: organizationId,
      curriculum_id: curriculumId,
      ...outcome,
    })),
  );
  if (error) {
    console.error("Syllabus CSV import failed.", error.message);
    redirect(back(organizationId, "outcome-import"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function createQuestionAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const outcomeId = field(formData, "outcome_id");
  const title = field(formData, "title");
  const questionType = field(formData, "question_type");
  const difficulty = field(formData, "difficulty");
  const marks = Number(field(formData, "marks"));
  const prompt = field(formData, "prompt");
  const answer = field(formData, "answer");
  const questionTypes = ["multiple_choice", "multiple_select", "true_false", "short_answer", "long_answer", "structured"];
  const difficulties = ["introductory", "intermediate", "advanced"];
  if (
    !validId(organizationId) || !validId(outcomeId) ||
    title.length < 1 || title.length > 160 ||
    !questionTypes.includes(questionType) || !difficulties.includes(difficulty) ||
    !Number.isInteger(marks) || marks < 1 || marks > 1000 ||
    prompt.length < 1 || prompt.length > 20000 || answer.length < 1 || answer.length > 20000
  ) redirect(back(organizationId, "question"));

  const { error } = await supabase.rpc("create_question_with_answer_key", {
    target_organization_id: organizationId,
    target_outcome_id: outcomeId,
    question_title: title,
    question_type: questionType,
    question_difficulty: difficulty,
    question_marks: marks,
    question_prompt: prompt,
    question_answer: answer,
  });
  if (error) {
    console.error("Atomic question and answer-key creation failed.", error.message);
    redirect(back(organizationId, "question"));
  }

  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function reviewQuestionAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const questionId = field(formData, "question_id");
  if (!validId(organizationId) || !validId(questionId)) redirect(back(organizationId, "question"));
  const { data: answerKey, error: answerKeyError } = await supabase.from("question_answer_keys")
    .select("question_id")
    .eq("organization_id", organizationId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (answerKeyError || !answerKey) {
    if (answerKeyError) console.error("Question answer key check failed.", answerKeyError.message);
    redirect(back(organizationId, "answer-key"));
  }
  const { data, error } = await supabase.from("questions")
    .update({ review_status: "reviewed" })
    .eq("id", questionId)
    .eq("organization_id", organizationId)
    .eq("review_status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Question review failed.", error.message);
    redirect(back(organizationId, "review"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function saveAnswerKeyAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const questionId = field(formData, "question_id");
  const answer = field(formData, "answer");
  if (!validId(organizationId) || !validId(questionId) || answer.length < 1 || answer.length > 20000) {
    redirect(back(organizationId, "answer-key"));
  }
  const { error } = await supabase.from("question_answer_keys").upsert({
    organization_id: organizationId,
    question_id: questionId,
    answer_text: answer,
  }, { onConflict: "question_id,organization_id" });
  if (error) {
    console.error("Question answer key save failed.", error.message);
    redirect(back(organizationId, "answer-key"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function createPaperAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const title = field(formData, "title");
  const targetMarks = Number(field(formData, "target_marks"));
  const questionIds = [...new Set(formData.getAll("question_ids").map(String))];
  if (
    !validId(organizationId) || title.length < 1 || title.length > 200 ||
    !Number.isInteger(targetMarks) || targetMarks < 1 || targetMarks > 100000 ||
    questionIds.length === 0 || questionIds.some((id) => !validId(id))
  ) redirect(back(organizationId, "paper"));

  const { error } = await supabase.rpc("create_paper_with_draft_version", {
    target_organization_id: organizationId,
    paper_title: title,
    target_marks: targetMarks,
    selected_question_ids: questionIds,
  });
  if (error) {
    console.error("Atomic paper draft creation failed.", error.message);
    redirect(back(organizationId, "paper"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}

export async function publishPaperAction(formData: FormData) {
  const { supabase } = await staffClient();
  const organizationId = field(formData, "organization_id");
  const versionId = field(formData, "version_id");
  if (!validId(organizationId) || !validId(versionId)) redirect(back(organizationId, "paper"));
  const { data, error } = await supabase.from("paper_versions")
    .update({ status: "published" })
    .eq("id", versionId)
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("Paper publication failed.", error.message);
    redirect(back(organizationId, "publish"));
  }
  revalidatePath("/app/academics");
  redirect(back(organizationId));
}
