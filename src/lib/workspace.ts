export type Outcome = {
  id: string;
  code: string;
  subject: string;
  topic: string;
  title: string;
  description: string;
};

export type Question = {
  id: string;
  title: string;
  type: string;
  subject: string;
  outcomeId: string;
  difficulty: "Introductory" | "Intermediate" | "Advanced";
  marks: number;
  prompt: string;
  answer: string;
  status: "Reviewed" | "Draft";
};

export type Paper = {
  id: string;
  title: string;
  subject: string;
  questionIds: string[];
  targetMarks: number;
  publishedAt?: string;
  snapshot?: Question[];
};

export type Assignment = {
  id: string;
  title: string;
  className: string;
  dueDate: string;
  submissions: number;
  students: number;
  status: "Published" | "Draft";
};

export type Project = {
  id: string;
  title: string;
  subject: string;
  outcomes: string[];
  stage: "Planning" | "In progress" | "Review";
  dueDate: string;
};

export type WorkspaceData = {
  version: 1;
  outcomes: Outcome[];
  questions: Question[];
  papers: Paper[];
  assignments: Assignment[];
  projects: Project[];
};

export const STORAGE_KEY = "knovera.workspace.v1";

export const initialWorkspace: WorkspaceData = {
  version: 1,
  outcomes: [
    {
      id: "out-phy-1",
      code: "PHY-1.1",
      subject: "Physics",
      topic: "Forces and motion",
      title: "Describe motion using distance, displacement, speed and velocity",
      description: "Select and use appropriate quantities and units to describe motion.",
    },
    {
      id: "out-phy-2",
      code: "PHY-1.2",
      subject: "Physics",
      topic: "Forces and motion",
      title: "Interpret distance–time and velocity–time graphs",
      description: "Explain gradients and areas in motion graphs.",
    },
    {
      id: "out-phy-3",
      code: "PHY-1.3",
      subject: "Physics",
      topic: "Forces and motion",
      title: "Apply Newton's laws to explain changes in motion",
      description: "Relate resultant force, mass and acceleration in familiar contexts.",
    },
    {
      id: "out-phy-4",
      code: "PHY-2.1",
      subject: "Physics",
      topic: "Energy",
      title: "Apply conservation of energy to everyday systems",
      description: "Identify useful and dissipated energy transfers.",
    },
    {
      id: "out-bio-1",
      code: "BIO-1.1",
      subject: "Biology",
      topic: "Cell biology",
      title: "Explain how cell structures support their functions",
      description: "Compare key structures in plant and animal cells.",
    },
    {
      id: "out-bio-2",
      code: "BIO-1.2",
      subject: "Biology",
      topic: "Cell biology",
      title: "Use a microscope to observe and measure cells",
      description: "Prepare a specimen and calculate magnification.",
    },
    {
      id: "out-math-1",
      code: "MAT-2.1",
      subject: "Mathematics",
      topic: "Algebra",
      title: "Solve linear equations and show a clear method",
      description: "Use inverse operations and check solutions.",
    },
  ],
  questions: [
    {
      id: "q-101",
      title: "Journey to school",
      type: "Structured",
      subject: "Physics",
      outcomeId: "out-phy-1",
      difficulty: "Introductory",
      marks: 4,
      prompt: "A student walks 600 m in 8 minutes. Calculate their average speed in m/s.",
      answer: "8 minutes = 480 s. Average speed = 600 ÷ 480 = 1.25 m/s.",
      status: "Reviewed",
    },
    {
      id: "q-102",
      title: "Reading a velocity–time graph",
      type: "Short answer",
      subject: "Physics",
      outcomeId: "out-phy-2",
      difficulty: "Intermediate",
      marks: 5,
      prompt: "A vehicle accelerates uniformly from 4 m/s to 16 m/s in 6 s. Find its acceleration and displacement.",
      answer: "Acceleration = (16 − 4) ÷ 6 = 2 m/s². Displacement = average velocity × time = 10 × 6 = 60 m.",
      status: "Reviewed",
    },
    {
      id: "q-103",
      title: "Resultant force",
      type: "Multiple choice",
      subject: "Physics",
      outcomeId: "out-phy-3",
      difficulty: "Intermediate",
      marks: 2,
      prompt: "A 2 kg object accelerates at 3 m/s². What is the resultant force?",
      answer: "6 N (F = ma).",
      status: "Reviewed",
    },
    {
      id: "q-104",
      title: "Energy transfer in a lamp",
      type: "Long answer",
      subject: "Physics",
      outcomeId: "out-phy-4",
      difficulty: "Advanced",
      marks: 6,
      prompt: "Describe the energy transfers in an electric lamp and explain why it is not perfectly efficient.",
      answer: "Electrical energy is transferred to light and thermal energy. Some energy is dissipated to the surroundings as heating, so not all input energy becomes useful light.",
      status: "Reviewed",
    },
    {
      id: "q-105",
      title: "Cell structures",
      type: "Multiple choice",
      subject: "Biology",
      outcomeId: "out-bio-1",
      difficulty: "Introductory",
      marks: 1,
      prompt: "Which structure controls the movement of substances into and out of a cell?",
      answer: "The cell membrane.",
      status: "Reviewed",
    },
    {
      id: "q-106",
      title: "Solving for x",
      type: "Short answer",
      subject: "Mathematics",
      outcomeId: "out-math-1",
      difficulty: "Introductory",
      marks: 3,
      prompt: "Solve 3x + 5 = 20. Show your working.",
      answer: "3x = 15, so x = 5.",
      status: "Reviewed",
    },
  ],
  papers: [
    {
      id: "paper-demo-1",
      title: "Year 10 Physics · Forces checkpoint",
      subject: "Physics",
      questionIds: ["q-101", "q-102", "q-103"],
      targetMarks: 11,
      publishedAt: "2026-10-14T09:00:00.000Z",
      snapshot: undefined,
    },
  ],
  assignments: [
    {
      id: "assignment-demo-1",
      title: "Motion graphs practice",
      className: "Year 10 Physics",
      dueDate: "2026-10-22",
      submissions: 18,
      students: 24,
      status: "Published",
    },
    {
      id: "assignment-demo-2",
      title: "Cell structures review",
      className: "Year 9 Biology",
      dueDate: "2026-10-25",
      submissions: 21,
      students: 26,
      status: "Published",
    },
    {
      id: "assignment-demo-3",
      title: "Energy transfer investigation",
      className: "Year 10 Physics",
      dueDate: "2026-10-29",
      submissions: 0,
      students: 24,
      status: "Draft",
    },
  ],
  projects: [
    {
      id: "project-demo-1",
      title: "Design a low-energy classroom",
      subject: "Physics",
      outcomes: ["out-phy-4"],
      stage: "In progress",
      dueDate: "2026-11-03",
    },
    {
      id: "project-demo-2",
      title: "Microscope field guide",
      subject: "Biology",
      outcomes: ["out-bio-1", "out-bio-2"],
      stage: "Review",
      dueDate: "2026-10-24",
    },
  ],
};

export function sumQuestionMarks(questions: Question[]) {
  return questions.reduce((total, question) => total + question.marks, 0);
}

export function validatePaperComposition(questions: Question[], targetMarks: number) {
  const total = sumQuestionMarks(questions);
  const issues: string[] = [];
  if (questions.length === 0) issues.push("Add at least one question.");
  if (!Number.isInteger(targetMarks) || targetMarks < 1) {
    issues.push("Enter a valid target mark total.");
  } else if (total !== targetMarks) {
    issues.push(`Question marks total ${total}, but the paper target is ${targetMarks}.`);
  }
  return { total, issues };
}

export function calculateOutcomeCoverage(outcomes: Outcome[], questions: Question[]) {
  const mappedIds = new Set(questions.map((question) => question.outcomeId));
  const mapped = outcomes.filter((outcome) => mappedIds.has(outcome.id)).length;
  return {
    mapped,
    total: outcomes.length,
    unlinked: outcomes.filter((outcome) => !mappedIds.has(outcome.id)),
    percentage: outcomes.length ? Math.round((mapped / outcomes.length) * 100) : 0,
  };
}

export function isWorkspaceData(value: unknown): value is WorkspaceData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<WorkspaceData>;
  const hasText = (entry: unknown) => typeof entry === "string";
  const isOutcome = (entry: unknown): entry is Outcome => {
    if (!entry || typeof entry !== "object") return false;
    const outcome = entry as Partial<Outcome>;
    return [outcome.id, outcome.code, outcome.subject, outcome.topic, outcome.title, outcome.description].every(hasText);
  };
  const isQuestion = (entry: unknown): entry is Question => {
    if (!entry || typeof entry !== "object") return false;
    const question = entry as Partial<Question>;
    return (
      [question.id, question.title, question.type, question.subject, question.outcomeId, question.prompt, question.answer].every(hasText) &&
      ["Introductory", "Intermediate", "Advanced"].includes(question.difficulty ?? "") &&
      ["Reviewed", "Draft"].includes(question.status ?? "") &&
      Number.isInteger(question.marks) &&
      Number(question.marks) > 0
    );
  };
  const isPaper = (entry: unknown): entry is Paper => {
    if (!entry || typeof entry !== "object") return false;
    const paper = entry as Partial<Paper>;
    return (
      hasText(paper.id) &&
      hasText(paper.title) &&
      hasText(paper.subject) &&
      Array.isArray(paper.questionIds) &&
      paper.questionIds.every(hasText) &&
      Number.isInteger(paper.targetMarks) &&
      Number(paper.targetMarks) > 0 &&
      (paper.publishedAt === undefined || hasText(paper.publishedAt)) &&
      (paper.snapshot === undefined || (Array.isArray(paper.snapshot) && paper.snapshot.every(isQuestion)))
    );
  };
  const isAssignment = (entry: unknown): entry is Assignment => {
    if (!entry || typeof entry !== "object") return false;
    const assignment = entry as Partial<Assignment>;
    return (
      [assignment.id, assignment.title, assignment.className, assignment.dueDate].every(hasText) &&
      Number.isInteger(assignment.submissions) &&
      Number(assignment.submissions) >= 0 &&
      Number.isInteger(assignment.students) &&
      Number(assignment.students) >= 0 &&
      ["Published", "Draft"].includes(assignment.status ?? "")
    );
  };
  const isProject = (entry: unknown): entry is Project => {
    if (!entry || typeof entry !== "object") return false;
    const project = entry as Partial<Project>;
    return (
      [project.id, project.title, project.subject, project.dueDate].every(hasText) &&
      Array.isArray(project.outcomes) &&
      project.outcomes.every(hasText) &&
      ["Planning", "In progress", "Review"].includes(project.stage ?? "")
    );
  };
  return (
    data.version === 1 &&
    Array.isArray(data.outcomes) &&
    data.outcomes.every(isOutcome) &&
    Array.isArray(data.questions) &&
    data.questions.every(isQuestion) &&
    Array.isArray(data.papers) &&
    data.papers.every(isPaper) &&
    Array.isArray(data.assignments) &&
    data.assignments.every(isAssignment) &&
    Array.isArray(data.projects) &&
    data.projects.every(isProject)
  );
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
}

export function makeId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}
