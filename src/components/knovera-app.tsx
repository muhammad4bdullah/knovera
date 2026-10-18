"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  calculateOutcomeCoverage,
  formatDate,
  initialWorkspace,
  isWorkspaceData,
  makeId,
  STORAGE_KEY,
  sumQuestionMarks,
  type Assignment,
  type Outcome,
  type Paper,
  type Project,
  type Question,
  type WorkspaceData,
  validatePaperComposition,
} from "@/lib/workspace";

type PageKey =
  | "overview"
  | "curriculum"
  | "questions"
  | "papers"
  | "learn"
  | "skills"
  | "shift"
  | "reports"
  | "settings";
type ModalKey = "outcome" | "question" | "paper" | "assignment" | "project" | null;
type PrintMode = "student" | "answers";

const navigation: { label: string; key: PageKey; icon: string; group: string }[] = [
  { label: "Overview", key: "overview", icon: "grid", group: "Workspace" },
  { label: "SyllabusGraph", key: "curriculum", icon: "book", group: "Workspace" },
  { label: "Question bank", key: "questions", icon: "layers", group: "Assessment" },
  { label: "PaperForge", key: "papers", icon: "file", group: "Assessment" },
  { label: "LearnSpace", key: "learn", icon: "graduation", group: "Learning" },
  { label: "SkillProof", key: "skills", icon: "spark", group: "Learning" },
  { label: "SyllabusShift", key: "shift", icon: "refresh", group: "Learning" },
  { label: "Reports", key: "reports", icon: "chart", group: "Insights" },
  { label: "Settings", key: "settings", icon: "settings", group: "Manage" },
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 4.5v17M8 6h8M8 10h8",
    layers: "m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8",
    graduation: "m2 10 10-6 10 6-10 6-10-6zM6 12v5c3.5 3 8.5 3 12 0v-5M22 10v6",
    spark: "m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l1.1 2.9L23 19l-2.9 1.1L19 23l-1.1-2.9L15 19l2.9-1.1L19 15z",
    refresh: "M20 7v5h-5M4 17v-5h5M5.6 9A7 7 0 0 1 18 6.5L20 12M4 12l2 5.5A7 7 0 0 0 18.4 15",
    chart: "M3 3v18h18M8 15l4-4 4 3 5-7",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.6 2.7-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.1l-.1-.2a1.7 1.7 0 0 0-1.4-1l-.2.1-2.7-1.6.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1v-3.1l.2-.1a1.7 1.7 0 0 0 1-1.4l-.1-.2 1.6-2.7.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.1l.1.2a1.7 1.7 0 0 0 1.4 1l.2-.1 2.7 1.6-.1.2a1.7 1.7 0 0 0 .3 1.9l.1.1v3.1l-.2.1a1.7 1.7 0 0 0-1 1.4z",
    search: "m20 20-4.4-4.4M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
    plus: "M12 5v14M5 12h14",
    arrow: "M5 12h14M13 6l6 6-6 6",
    check: "m5 12 4 4L19 6",
    close: "m18 6-12 12M6 6l12 12",
    dots: "M5 12h.01M12 12h.01M19 12h.01",
    clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    users: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    filter: "M4 7h16M7 12h10M10 17h4",
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}

function useWorkspace() {
  const [data, setData] = useState<WorkspaceData>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed: unknown = JSON.parse(saved);
          if (!isWorkspaceData(parsed)) {
            throw new Error("The saved workspace has an unsupported format.");
          }
          setData(parsed);
        }
      } catch (error) {
        setStorageError(
          error instanceof Error
            ? error.message
            : "The saved workspace could not be read.",
        );
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function save(next: WorkspaceData) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError("");
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? `Changes are visible, but this browser could not save them: ${error.message}`
          : "Changes are visible, but this browser could not save them.",
      );
    }
    setData(next);
  }

  function reset() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setStorageError("");
    } catch {
      setStorageError("The browser could not clear its saved workspace.");
    }
    setData(initialWorkspace);
  }

  return { data, save, reset, ready, storageError };
}

function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "blue" }) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name="layers" size={22} /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: string;
  accent: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${accent}`}><Icon name={icon} size={18} /></span>
        <span className="metric-hint">{hint}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </article>
  );
}

function Modal({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  close: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [close]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section ref={panelRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-subtitle">
        <header className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            <p id="modal-subtitle">{subtitle}</p>
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label="Close dialog"><Icon name="close" /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export default function KnoveraApp() {
  const { data, save, reset, ready, storageError } = useWorkspace();
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [modal, setModal] = useState<ModalKey>(null);
  const [modalError, setModalError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [activePaperId, setActivePaperId] = useState("");
  const [printMode, setPrintMode] = useState<PrintMode>("student");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [questionFilter, setQuestionFilter] = useState("All types");
  const [paperSelection, setPaperSelection] = useState<string[]>([]);
  const [paperTarget, setPaperTarget] = useState(0);

  const activePaper = data.papers.find((paper) => paper.id === activePaperId);
  const activeQuestions = activePaper
    ? activePaper.snapshot ?? activePaper.questionIds.map((id) => data.questions.find((question) => question.id === id)).filter((question): question is Question => Boolean(question))
    : [];
  const coverageMetrics = calculateOutcomeCoverage(data.outcomes, data.questions);
  const outcomesCovered = coverageMetrics.mapped;
  const pendingAssignments = data.assignments.filter((item) => item.status === "Published").length;
  const reviewProjects = data.projects.filter((project) => project.stage === "Review").length;
  const outcomeById = useMemo(
    () => new Map(data.outcomes.map((outcome) => [outcome.id, outcome])),
    [data.outcomes],
  );

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function openModal(key: Exclude<ModalKey, null>) {
    setModalError("");
    setPaperSelection([]);
    setPaperTarget(0);
    setModal(key);
  }

  const closeModal = useCallback(() => {
    setModal(null);
    setModalError("");
  }, []);

  function handleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const value = (key: string) => String(values.get(key) ?? "").trim();

    if (modal === "outcome") {
      const code = value("code").toUpperCase();
      const title = value("title");
      const subject = value("subject");
      const topic = value("topic");
      if (data.outcomes.some((outcome) => outcome.code.toLowerCase() === code.toLowerCase())) {
        setModalError("That outcome code is already in use.");
        return;
      }
      const outcome: Outcome = {
        id: makeId("out"),
        code,
        title,
        subject,
        topic,
        description: value("description"),
      };
      save({ ...data, outcomes: [outcome, ...data.outcomes] });
      closeModal();
      notify("Learning outcome added to this workspace.");
      return;
    }

    if (modal === "question") {
      const outcomeId = value("outcomeId");
      const marks = Number(value("marks"));
      if (!outcomeById.has(outcomeId)) {
        setModalError("Choose an outcome from this curriculum.");
        return;
      }
      if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
        setModalError("Marks must be a whole number between 1 and 100.");
        return;
      }
      const question: Question = {
        id: makeId("q"),
        title: value("title"),
        type: value("type"),
        subject: outcomeById.get(outcomeId)?.subject ?? "General",
        outcomeId,
        difficulty: value("difficulty") as Question["difficulty"],
        marks,
        prompt: value("prompt"),
        answer: value("answer"),
        status: "Draft",
      };
      save({ ...data, questions: [question, ...data.questions] });
      closeModal();
      notify("Question saved as a draft.");
      return;
    }

    if (modal === "paper") {
      const selectedIds = values.getAll("questionIds").map(String);
      const targetMarks = Number(value("targetMarks"));
      const questions = selectedIds
        .map((id) => data.questions.find((question) => question.id === id))
        .filter((question): question is Question => Boolean(question));
      const total = questions.reduce((sum, question) => sum + question.marks, 0);
      if (questions.length === 0) {
        setModalError("Select at least one question to build a paper.");
        return;
      }
      if (!Number.isInteger(targetMarks) || targetMarks < 1) {
        setModalError("Enter a valid target mark total.");
        return;
      }
      const subjects = new Set(questions.map((question) => question.subject));
      const paper: Paper = {
        id: makeId("paper"),
        title: value("title"),
        subject: subjects.size === 1 ? questions[0].subject : "Mixed subjects",
        questionIds: selectedIds,
        targetMarks,
      };
      save({ ...data, papers: [paper, ...data.papers] });
      closeModal();
      setActivePaperId(paper.id);
      notify(`Draft saved · ${total} marks selected.`);
      return;
    }

    if (modal === "assignment") {
      const assignment: Assignment = {
        id: makeId("assignment"),
        title: value("title"),
        className: value("className"),
        dueDate: value("dueDate"),
        submissions: 0,
        students: 0,
        status: "Draft",
      };
      save({ ...data, assignments: [assignment, ...data.assignments] });
      closeModal();
      notify("Assignment saved as a draft.");
      return;
    }

    if (modal === "project") {
      const selectedOutcomeIds = values.getAll("outcomes").map(String);
      const project: Project = {
        id: makeId("project"),
        title: value("title"),
        subject: value("subject"),
        outcomes: selectedOutcomeIds,
        stage: "Planning",
        dueDate: value("dueDate"),
      };
      save({ ...data, projects: [project, ...data.projects] });
      closeModal();
      notify("Project added to SkillProof.");
    }
  }

  function validatePaper(paper: Paper) {
    const questions = paper.snapshot ?? paper.questionIds
      .map((id) => data.questions.find((question) => question.id === id))
      .filter((question): question is Question => Boolean(question));
    const { total, issues } = validatePaperComposition(questions, paper.targetMarks);
    const unmapped = questions.filter((question) => !outcomeById.has(question.outcomeId)).length;
    if (unmapped > 0) issues.push(`${unmapped} question${unmapped === 1 ? "" : "s"} reference an outcome that is no longer available.`);
    if (questions.some((question) => question.status !== "Reviewed") && paper.publishedAt) {
      issues.push("Published paper contains a question that is not reviewed.");
    }
    return { questions, total, issues };
  }

  function togglePaperQuestion(questionId: string, checked: boolean) {
    const next = checked
      ? [...paperSelection, questionId]
      : paperSelection.filter((id) => id !== questionId);
    setPaperSelection(next);
    setPaperTarget(sumQuestionMarks(
      data.questions.filter((question) => next.includes(question.id)),
    ));
  }

  function publishPaper(paper: Paper) {
    const result = validatePaper(paper);
    if (result.issues.length) {
      notify(result.issues[0]);
      return;
    }
    const published: Paper = {
      ...paper,
      publishedAt: paper.publishedAt ?? new Date().toISOString(),
      snapshot: result.questions.map((question) => ({ ...question })),
    };
    save({
      ...data,
      papers: data.papers.map((item) => item.id === paper.id ? published : item),
    });
    notify("Paper version published and frozen.");
  }

  function printPaper(mode: PrintMode) {
    setPrintMode(mode);
    window.setTimeout(() => window.print(), 80);
  }

  function changeAssignmentStatus(assignment: Assignment) {
    const nextStatus = assignment.status === "Draft" ? "Published" : "Draft";
    save({
      ...data,
      assignments: data.assignments.map((item) =>
        item.id === assignment.id ? { ...item, status: nextStatus } : item,
      ),
    });
    notify(nextStatus === "Published" ? "Assignment published." : "Assignment moved back to draft.");
  }

  function moveProjectStage(project: Project) {
    const stages: Project["stage"][] = ["Planning", "In progress", "Review"];
    const next = stages[(stages.indexOf(project.stage) + 1) % stages.length];
    save({
      ...data,
      projects: data.projects.map((item) =>
        item.id === project.id ? { ...item, stage: next } : item,
      ),
    });
    notify(`Project moved to ${next.toLowerCase()}.`);
  }

  function reviewQuestion(question: Question) {
    save({
      ...data,
      questions: data.questions.map((item) =>
        item.id === question.id ? { ...item, status: "Reviewed" } : item,
      ),
    });
    notify("Question reviewed and available to PaperForge.");
  }

  function renderModal() {
    if (!modal) return null;
    const details: Record<Exclude<ModalKey, null>, { title: string; subtitle: string }> = {
      outcome: { title: "Add learning outcome", subtitle: "Create a curriculum outcome that questions and resources can map to." },
      question: { title: "Create question", subtitle: "Questions are saved as drafts and must be reviewed before publishing." },
      paper: { title: "Build an examination paper", subtitle: "Choose questions and set the mark total that the paper should contain." },
      assignment: { title: "Create assignment", subtitle: "Start with a draft. Publish it when your class and instructions are ready." },
      project: { title: "Create a practical project", subtitle: "Connect project evidence to the learning outcomes it demonstrates." },
    };
    const formId = "create-record-form";
    return (
      <Modal title={details[modal].title} subtitle={details[modal].subtitle} close={closeModal}>
        <form className="form-stack" id={formId} onSubmit={handleForm}>
          {modal === "outcome" && <>
            <div className="form-row">
              <label>Outcome code<input name="code" required maxLength={24} placeholder="e.g. PHY-2.4" /></label>
              <label>Subject<input name="subject" required maxLength={60} placeholder="e.g. Physics" /></label>
            </div>
            <label>Topic<input name="topic" required maxLength={100} placeholder="e.g. Electricity" /></label>
            <label>Outcome statement<input name="title" required maxLength={180} placeholder="What should learners be able to do?" /></label>
            <label>Description <span className="optional">(optional)</span><textarea name="description" rows={3} maxLength={500} placeholder="Add context, source or guidance." /></label>
          </>}
          {modal === "question" && <>
            <label>Question title<input name="title" required maxLength={100} placeholder="Internal question label" /></label>
            <div className="form-row">
              <label>Question type<select name="type" defaultValue="Short answer">{["Multiple choice", "Multiple select", "True or false", "Short answer", "Long answer", "Structured"].map((type) => <option key={type}>{type}</option>)}</select></label>
              <label>Difficulty<select name="difficulty" defaultValue="Intermediate"><option>Introductory</option><option>Intermediate</option><option>Advanced</option></select></label>
            </div>
            <div className="form-row">
              <label>Learning outcome<select name="outcomeId" required defaultValue=""><option value="" disabled>Select an outcome</option>{data.outcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.code} · {outcome.topic}</option>)}</select></label>
              <label>Maximum marks<input name="marks" type="number" required min={1} max={100} defaultValue={3} /></label>
            </div>
            <label>Question prompt<textarea name="prompt" required rows={3} maxLength={2000} placeholder="Write the student-facing question." /></label>
            <label>Answer key / marking notes<textarea name="answer" required rows={3} maxLength={2000} placeholder="This remains separate from the student paper." /></label>
          </>}
          {modal === "paper" && <>
            <label>Paper title<input name="title" required maxLength={120} placeholder="e.g. Year 10 Physics · Unit 2" /></label>
            <label>Target marks<input name="targetMarks" type="number" min={1} step={1} required value={paperTarget || ""} onChange={(event) => setPaperTarget(Number(event.target.value))} /></label>
            <fieldset className="question-picker">
              <legend>Select reviewed questions</legend>
              {data.questions.filter((question) => question.status === "Reviewed").map((question) => (
                <label className="picker-option" key={question.id}>
                  <input type="checkbox" name="questionIds" value={question.id} checked={paperSelection.includes(question.id)} onChange={(event) => togglePaperQuestion(question.id, event.target.checked)} />
                  <span><strong>{question.title}</strong><small>{question.subject} · {question.marks} marks · {question.outcomeId}</small></span>
                </label>
              ))}
            </fieldset>
            <p className="form-note">Selected questions: {sumQuestionMarks(data.questions.filter((question) => paperSelection.includes(question.id)))} marks. Adjust the target above to check mark validation.</p>
          </>}
          {modal === "assignment" && <>
            <label>Assignment title<input name="title" required maxLength={120} placeholder="e.g. Forces revision set" /></label>
            <div className="form-row">
              <label>Class<input name="className" required maxLength={80} placeholder="e.g. Year 10 Physics" /></label>
              <label>Due date<input name="dueDate" type="date" required /></label>
            </div>
            <div className="callout callout-subtle">Class enrollment, student submissions and grading need a configured institution database. This browser demo does not send or assign work to real students.</div>
          </>}
          {modal === "project" && <>
            <label>Project name<input name="title" required maxLength={120} placeholder="e.g. Build a working model" /></label>
            <div className="form-row">
              <label>Subject<input name="subject" required maxLength={60} placeholder="e.g. Physics" /></label>
              <label>Due date<input name="dueDate" type="date" required /></label>
            </div>
            <fieldset className="question-picker">
              <legend>Map to learning outcomes</legend>
              {data.outcomes.map((outcome) => (
                <label className="picker-option" key={outcome.id}>
                  <input type="checkbox" name="outcomes" value={outcome.id} />
                  <span><strong>{outcome.code} · {outcome.topic}</strong><small>{outcome.title}</small></span>
                </label>
              ))}
            </fieldset>
          </>}
          {modalError && <p className="form-error" role="alert">{modalError}</p>}
          <footer className="modal-actions">
            <button className="button button-quiet" type="button" onClick={closeModal}>Cancel</button>
            <button className="button button-primary" type="submit"><Icon name="check" size={16} /> Save draft</button>
          </footer>
        </form>
      </Modal>
    );
  }

  const filteredQuestions = data.questions.filter((question) => {
    const matchesSearch = `${question.title} ${question.subject} ${question.outcomeId}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = questionFilter === "All types" || question.type === questionFilter;
    return matchesSearch && matchesType;
  });

  function renderPage() {
    if (activePaper) {
      const validation = validatePaper(activePaper);
      const questionList = activePaper.snapshot ?? activePaper.questionIds
        .map((id) => data.questions.find((question) => question.id === id))
        .filter((question): question is Question => Boolean(question));
      return (
        <div className="page-content">
          <button className="back-link" onClick={() => setActivePaperId("")}>← Back to PaperForge</button>
          <div className="page-heading page-heading-row">
            <div><p className="eyebrow">PAPER WORKSPACE</p><h1>{activePaper.title}</h1><p className="page-subtitle">{activePaper.subject} · {questionList.length} questions · {validation.total} marks</p></div>
            {activePaper.publishedAt ? <Status tone="green">Published version</Status> : <Status tone="amber">Draft</Status>}
          </div>
          <div className="paper-layout">
            <section className="panel paper-main">
              <SectionTitle title="Student paper preview" description="This view excludes answer keys and marking notes." />
              {questionList.map((question, index) => (
                <article className="exam-question" key={`${question.id}-${index}`}>
                  <div className="exam-question-head"><strong>Question {index + 1}</strong><span>{question.marks} marks</span></div>
                  <h3>{question.title}</h3>
                  <p>{question.prompt}</p>
                  <div className="answer-lines" aria-hidden="true"><span /><span /><span /></div>
                </article>
              ))}
              {questionList.length === 0 && <EmptyState title="No questions in this paper" detail="Return to the paper builder and add at least one reviewed question." />}
            </section>
            <aside className="paper-side">
              <section className="panel">
                <h3>Paper validation</h3>
                <p className="panel-caption">A paper can be published when its questions match the target and are linked to outcomes.</p>
                <div className="validation-line"><span>Mark total</span><strong>{validation.total} / {activePaper.targetMarks}</strong></div>
                <div className="validation-line"><span>Outcome mapped</span><strong>{validation.questions.filter((question) => outcomeById.has(question.outcomeId)).length} / {validation.questions.length}</strong></div>
                {validation.issues.length > 0 ? <div className="validation-alert"><strong>Needs attention</strong><ul>{validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : <div className="validation-success"><Icon name="check" size={15} /> All checks passed.</div>}
                {!activePaper.publishedAt && <button className="button button-primary button-wide" disabled={validation.issues.length > 0} onClick={() => publishPaper(activePaper)}>Publish paper version</button>}
              </section>
              <section className="panel export-panel">
                <h3>Export paper</h3>
                <p className="panel-caption">Print or save a PDF using your browser. Answer keys are exported separately.</p>
                <button className="button button-outline button-wide" onClick={() => printPaper("student")}><Icon name="download" size={16} /> Student paper</button>
                <button className="button button-outline button-wide" onClick={() => printPaper("answers")}><Icon name="file" size={16} /> Separate answer key</button>
              </section>
            </aside>
          </div>
        </div>
      );
    }

    if (activePage === "overview") {
      const recentPaper = data.papers[0];
      const subjectCounts = data.outcomes.reduce<Record<string, number>>((counts, outcome) => {
        counts[outcome.subject] = (counts[outcome.subject] ?? 0) + 1;
        return counts;
      }, {});
      return (
        <div className="page-content">
          <div className="welcome-banner">
            <div className="welcome-copy">
              <p className="eyebrow">SUNDAY, OCTOBER 18, 2026 <span className="eyebrow-dot" /></p>
              <h1>Your learning ecosystem,<br /><span>connected.</span></h1>
              <p>Curriculum, assessments and student learning — in one clear view.</p>
              <button className="button button-light" onClick={() => setActivePage("curriculum")}>Explore your curriculum <Icon name="arrow" size={16} /></button>
            </div>
            <div className="welcome-art" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" />
              <div className="orbit-node orbit-node-one"><Icon name="book" size={18} /></div>
              <div className="orbit-node orbit-node-two"><Icon name="file" size={17} /></div>
              <div className="orbit-node orbit-node-three"><Icon name="graduation" size={18} /></div>
              <div className="orbit-core"><span>K</span></div>
            </div>
          </div>

          <div className="demo-banner"><span className="demo-dot" /><strong>Sample workspace</strong><span>Example records only · changes are saved in this browser</span></div>

          <div className="metric-grid">
            <MetricCard label="Learning outcomes" value={data.outcomes.length} hint={`${outcomesCovered} with questions`} icon="book" accent="lavender" />
            <MetricCard label="Reviewed questions" value={data.questions.filter((item) => item.status === "Reviewed").length} hint={`${data.questions.filter((item) => item.status === "Draft").length} drafts`} icon="layers" accent="mint" />
            <MetricCard label="Papers created" value={data.papers.length} hint={`${data.papers.filter((item) => Boolean(item.publishedAt)).length} published`} icon="file" accent="peach" />
          </div>

          <div className="dashboard-grid">
            <section className="panel curriculum-panel">
              <div className="panel-heading">
                <div><p className="eyebrow">SYLLABUSGRAPH</p><h2>Curriculum coverage</h2></div>
                <button className="text-button" onClick={() => setActivePage("reports")}>View report <Icon name="arrow" size={14} /></button>
              </div>
              <div className="coverage-summary"><div className="coverage-ring" style={{ "--coverage": `${coverageMetrics.percentage}%` } as CSSProperties}><div><strong>{coverageMetrics.percentage}%</strong><span>mapped</span></div></div><p>of outcomes have at least one question mapped. Coverage measures content mapping, not student mastery.</p></div>
              <div className="subject-bars">{Object.entries(subjectCounts).map(([subject, count]) => {
                const covered = data.outcomes.filter((outcome) => outcome.subject === subject && data.questions.some((question) => question.outcomeId === outcome.id)).length;
                return <div className="subject-bar" key={subject}><div className="subject-bar-label"><span>{subject}</span><span>{covered} of {count}</span></div><div className="bar-track"><span style={{ width: `${count ? covered / count * 100 : 0}%` }} /></div></div>;
              })}</div>
            </section>
            <section className="panel activity-panel">
              <div className="panel-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>Pick up where you left off</h2></div></div>
              <button className="action-row" onClick={() => setActivePage("papers")}><span className="action-icon action-icon-blue"><Icon name="file" /></span><span><strong>{recentPaper?.title ?? "Start your first paper"}</strong><small>{recentPaper ? `${recentPaper.targetMarks} marks · ${recentPaper.publishedAt ? "Published" : "Draft"}` : "PaperForge"}</small></span><Icon name="arrow" size={16} /></button>
              <button className="action-row" onClick={() => setActivePage("questions")}><span className="action-icon action-icon-green"><Icon name="layers" /></span><span><strong>Question bank</strong><small>{data.questions.length} questions · {data.outcomes.length - outcomesCovered} outcomes still uncovered</small></span><Icon name="arrow" size={16} /></button>
              <button className="action-row" onClick={() => setActivePage("learn")}><span className="action-icon action-icon-amber"><Icon name="graduation" /></span><span><strong>Assignments</strong><small>{pendingAssignments} published in this sample workspace</small></span><Icon name="arrow" size={16} /></button>
              <div className="activity-foot"><span className="status-dot" /> Progress is calculated from saved workspace records.</div>
            </section>
          </div>

          <div className="module-row">
            <div><h2>One connected learning journey</h2><p>Each module builds on the same curriculum and learning outcomes.</p></div>
            <div className="module-shortcuts">
              {[
                { label: "SyllabusGraph", key: "curriculum" as PageKey, icon: "book", color: "shortcut-purple" },
                { label: "PaperForge", key: "papers" as PageKey, icon: "file", color: "shortcut-blue" },
                { label: "LearnSpace", key: "learn" as PageKey, icon: "graduation", color: "shortcut-green" },
                { label: "SkillProof", key: "skills" as PageKey, icon: "spark", color: "shortcut-orange" },
              ].map((item) => <button className={`module-shortcut ${item.color}`} key={item.label} onClick={() => setActivePage(item.key)}><Icon name={item.icon} size={19} /><span>{item.label}</span><Icon name="arrow" size={14} /></button>)}
            </div>
          </div>
        </div>
      );
    }

    if (activePage === "curriculum") {
      const outcomes = data.outcomes.filter((outcome) => `${outcome.code} ${outcome.subject} ${outcome.topic} ${outcome.title}`.toLowerCase().includes(search.toLowerCase()));
      const grouped = outcomes.reduce<Record<string, Outcome[]>>((groups, outcome) => {
        groups[outcome.subject] = [...(groups[outcome.subject] ?? []), outcome];
        return groups;
      }, {});
      return <div className="page-content">
        <div className="page-heading page-heading-row"><div><p className="eyebrow">SYLLABUSGRAPH · VERSION 1</p><h1>Curriculum outcomes</h1><p className="page-subtitle">One shared source for your questions, papers and learning activities.</p></div><button className="button button-primary" onClick={() => openModal("outcome")}><Icon name="plus" size={16} /> Add outcome</button></div>
        <div className="callout"><span className="callout-mark">i</span><span><strong>Sample curriculum.</strong> These illustrative outcomes are stored in this browser. Imported or AI-extracted content is not connected in this demo.</span></div>
        <div className="toolbar"><div className="search-field"><Icon name="search" size={16} /><input aria-label="Search learning outcomes" placeholder="Search code, subject or topic…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span className="toolbar-count">{outcomes.length} outcomes</span></div>
        {Object.entries(grouped).map(([subject, subjectOutcomes]) => <section className="panel table-panel" key={subject}>
          <div className="table-section-heading"><div className="subject-monogram">{subject.slice(0, 2).toUpperCase()}</div><div><h2>{subject}</h2><span>{subjectOutcomes.length} learning outcomes</span></div><span className="table-section-tag">{new Set(subjectOutcomes.map((outcome) => outcome.topic)).size} topics</span></div>
          <div className="outcome-list">{subjectOutcomes.map((outcome) => {
            const linked = data.questions.filter((question) => question.outcomeId === outcome.id).length;
            return <article className="outcome-row" key={outcome.id}><div className="outcome-code">{outcome.code}</div><div className="outcome-main"><h3>{outcome.title}</h3><p>{outcome.topic}{outcome.description && ` · ${outcome.description}`}</p></div><div className="outcome-linked"><span>{linked}</span><small>questions</small></div><Status tone={linked ? "green" : "amber"}>{linked ? "Mapped" : "Uncovered"}</Status></article>;
          })}</div>
        </section>)}
        {outcomes.length === 0 && <EmptyState title="No outcomes match this search" detail="Try another outcome code, subject or topic." />}
      </div>;
    }

    if (activePage === "questions") {
      const types = ["All types", ...Array.from(new Set(data.questions.map((question) => question.type)))];
      return <div className="page-content">
        <div className="page-heading page-heading-row"><div><p className="eyebrow">PAPERFORGE · QUESTION BANK</p><h1>Questions that know where they belong.</h1><p className="page-subtitle">Every question can map to an outcome, making coverage visible before you publish.</p></div><button className="button button-primary" onClick={() => openModal("question")}><Icon name="plus" size={16} /> New question</button></div>
        <div className="metric-strip"><span><strong>{data.questions.length}</strong> questions</span><span><strong>{data.questions.filter((item) => item.status === "Reviewed").length}</strong> reviewed</span><span><strong>{data.questions.filter((item) => item.status === "Draft").length}</strong> drafts to review</span></div>
        <div className="toolbar"><div className="search-field"><Icon name="search" size={16} /><input aria-label="Search questions" placeholder="Search questions or outcomes…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><label className="select-filter"><Icon name="filter" size={15} /><select aria-label="Filter by question type" value={questionFilter} onChange={(event) => setQuestionFilter(event.target.value)}>{types.map((type) => <option key={type}>{type}</option>)}</select></label></div>
        <section className="panel table-panel">
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Question</th><th>Type</th><th>Outcome</th><th>Difficulty</th><th>Marks</th><th>Review</th></tr></thead><tbody>
            {filteredQuestions.map((question) => <tr key={question.id}><td><div className="question-title-cell"><strong>{question.title}</strong><span>{question.subject} · {question.id}</span></div></td><td>{question.type}</td><td><span className="code-pill">{outcomeById.get(question.outcomeId)?.code ?? "—"}</span></td><td>{question.difficulty}</td><td>{question.marks}</td><td>{question.status === "Reviewed" ? <Status tone="green">Reviewed</Status> : <button className="text-button" onClick={() => reviewQuestion(question)}>Review & approve <Icon name="arrow" size={13} /></button>}</td></tr>)}
          </tbody></table></div>
          {filteredQuestions.length === 0 && <EmptyState title="No questions found" detail="Adjust the search or add a question to the bank." />}
        </section>
        <div className="callout callout-subtle"><Icon name="check" size={16} /><span><strong>Question security.</strong> Answer keys stay in this private workspace and are excluded from student paper previews.</span></div>
      </div>;
    }

    if (activePage === "papers") {
      return <div className="page-content">
        <div className="page-heading page-heading-row"><div><p className="eyebrow">PAPERFORGE</p><h1>Examinations, built with purpose.</h1><p className="page-subtitle">Select reviewed questions, validate marks and publish a reproducible version.</p></div><button className="button button-primary" onClick={() => openModal("paper")}><Icon name="plus" size={16} /> Build paper</button></div>
        <div className="workflow-steps"><div className="workflow-step workflow-done"><span>1</span><div><strong>Choose questions</strong><small>Outcome-aligned bank</small></div></div><div className="workflow-connector" /><div className="workflow-step workflow-done"><span>2</span><div><strong>Validate marks</strong><small>Totals and coverage</small></div></div><div className="workflow-connector" /><div className="workflow-step"><span>3</span><div><strong>Publish & export</strong><small>Separate student paper</small></div></div></div>
        <SectionTitle title="Your papers" description={`${data.papers.length} paper${data.papers.length === 1 ? "" : "s"} in this browser workspace`} />
        <div className="paper-card-grid">{data.papers.map((paper) => {
          const validation = validatePaper(paper);
          const questionCount = paper.snapshot?.length ?? paper.questionIds.length;
          return <button className="paper-card panel" key={paper.id} onClick={() => setActivePaperId(paper.id)}>
            <div className="paper-card-top"><span className="paper-card-icon"><Icon name="file" size={20} /></span><Status tone={paper.publishedAt ? "green" : "amber"}>{paper.publishedAt ? "Published" : "Draft"}</Status></div>
            <h3>{paper.title}</h3><p>{paper.subject}</p>
            <div className="paper-card-meta"><span>{questionCount} questions</span><span>{paper.targetMarks} marks</span></div>
            <div className={`paper-card-validation ${validation.issues.length ? "validation-pending" : ""}`}><span className="status-dot" />{validation.issues.length ? validation.issues[0] : "Ready to review"}</div>
            <span className="paper-card-link">Open paper <Icon name="arrow" size={14} /></span>
          </button>;
        })}</div>
        {data.papers.length === 0 && <EmptyState title="Your first paper starts here" detail="Build an examination from reviewed, outcome-mapped questions." action={<button className="button button-primary" onClick={() => openModal("paper")}>Build a paper</button>} />}
        <div className="callout callout-subtle"><Icon name="download" size={16} /><span>Exports use your browser&apos;s print dialog so you can save student papers and answer keys as separate PDFs. No file is uploaded.</span></div>
      </div>;
    }

    if (activePage === "learn") {
      return <div className="page-content">
        <div className="page-heading page-heading-row"><div><p className="eyebrow">LEARNSPACE</p><h1>Bring learning into focus.</h1><p className="page-subtitle">Assignments remain connected to the shared curriculum.</p></div><button className="button button-primary" onClick={() => openModal("assignment")}><Icon name="plus" size={16} /> Create assignment</button></div>
        <div className="callout callout-subtle"><span className="callout-mark">i</span><span>Assignment records are local examples. Real student enrollment, submissions, feedback and access controls require a configured secure server.</span></div>
        <div className="metric-grid compact-grid"><MetricCard label="Assignments" value={data.assignments.length} hint="Saved in this browser" icon="file" accent="lavender" /><MetricCard label="Published" value={data.assignments.filter((item) => item.status === "Published").length} hint="Local demo state only" icon="check" accent="mint" /><MetricCard label="Submissions" value={data.assignments.reduce((sum, item) => sum + item.submissions, 0)} hint="Sample records" icon="users" accent="peach" /></div>
        <section className="panel table-panel"><SectionTitle title="Class assignments" description="Drafts can be published or returned to draft in this browser." /><div className="assignment-list">
          {data.assignments.map((assignment) => <article className="assignment-row" key={assignment.id}><span className="assignment-icon"><Icon name="file" size={18} /></span><div className="assignment-detail"><h3>{assignment.title}</h3><p>{assignment.className} <span>·</span> Due {formatDate(assignment.dueDate)}</p></div><div className="assignment-submissions"><strong>{assignment.submissions} / {assignment.students}</strong><span>submissions</span></div><Status tone={assignment.status === "Published" ? "green" : "amber"}>{assignment.status}</Status><button className="button button-small button-outline" onClick={() => changeAssignmentStatus(assignment)}>{assignment.status === "Draft" ? "Publish" : "Move to draft"}</button></article>)}
          {data.assignments.length === 0 && <EmptyState title="No assignments yet" detail="Create a draft assignment to start planning classwork." />}
        </div></section>
      </div>;
    }

    if (activePage === "skills") {
      return <div className="page-content">
        <div className="page-heading page-heading-row"><div><p className="eyebrow">SKILLPROOF</p><h1>Make understanding visible.</h1><p className="page-subtitle">Track practical projects alongside conventional assessment.</p></div><button className="button button-primary" onClick={() => openModal("project")}><Icon name="plus" size={16} /> New project</button></div>
        <div className="callout callout-subtle"><span className="callout-mark">i</span><span>Project stages are planning records only. Private student submissions, rubrics, portfolios and sharing controls are not enabled in this browser demo.</span></div>
        <div className="project-grid">{data.projects.map((project) => <article className="panel project-card" key={project.id}>
          <div className="project-card-head"><span className={`project-symbol ${project.subject === "Physics" ? "symbol-blue" : "symbol-green"}`}><Icon name="spark" size={20} /></span><Status tone={project.stage === "Review" ? "amber" : project.stage === "In progress" ? "blue" : "neutral"}>{project.stage}</Status></div>
          <p className="eyebrow">{project.subject.toUpperCase()} · PROJECT</p><h3>{project.title}</h3><p className="project-due"><Icon name="clock" size={14} /> Due {formatDate(project.dueDate)}</p>
          <div className="mapped-outcomes"><span>Mapped outcomes</span><div>{project.outcomes.length ? project.outcomes.map((id) => <span className="code-pill" key={id}>{outcomeById.get(id)?.code ?? "Unknown"}</span>) : <small>No outcomes mapped</small>}</div></div>
          <button className="button button-outline button-wide" onClick={() => moveProjectStage(project)}>Move to next stage</button>
        </article>)}</div>
        {data.projects.length === 0 && <EmptyState title="No projects in SkillProof" detail="Create a project and map it to curriculum outcomes." action={<button className="button button-primary" onClick={() => openModal("project")}>Create project</button>} />}
      </div>;
    }

    if (activePage === "shift") {
      const priorOutcomes = [
        { code: "PHY-1.1", title: "Describe distance, displacement, speed and velocity" },
        { code: "PHY-1.2", title: "Interpret distance–time and velocity–time graphs" },
        { code: "PHY-1.3", title: "Explain motion using forces and Newton's laws" },
        { code: "PHY-2.1", title: "Describe energy transfers in common systems" },
        { code: "BIO-1.1", title: "Identify structures in animal and plant cells" },
        { code: "MAT-2.1", title: "Solve linear equations" },
      ];
      const changes = priorOutcomes.flatMap((previous) => {
        const current = data.outcomes.find((outcome) => outcome.code === previous.code);
        if (!current) return [{ code: previous.code, before: previous.title, after: "Outcome not found in current workspace", kind: "Removed" }];
        if (current.title !== previous.title) return [{ code: current.code, before: previous.title, after: current.title, kind: "Modified" }];
        return [];
      });
      const additions = data.outcomes.filter((outcome) => !priorOutcomes.some((previous) => previous.code === outcome.code)).map((outcome) => ({ code: outcome.code, before: "—", after: outcome.title, kind: "Added" }));
      const allChanges = [...changes, ...additions];
      return <div className="page-content">
        <div className="page-heading page-heading-row"><div><p className="eyebrow">SYLLABUSSHIFT · REVIEW WORKSPACE</p><h1>See what changed. Decide what matters.</h1><p className="page-subtitle">Compare outcome codes and trace affected question mappings before you update materials.</p></div><Status tone="amber">Review required</Status></div>
        <div className="callout"><span className="callout-mark">i</span><span>This demonstration compares the current browser workspace against an illustrative prior version. It is not an uploaded or authoritative curriculum comparison.</span></div>
        <div className="shift-summary"><article><span className="shift-number">{allChanges.filter((item) => item.kind === "Added").length}</span><span>Added</span></article><article><span className="shift-number">{allChanges.filter((item) => item.kind === "Modified").length}</span><span>Modified</span></article><article><span className="shift-number">{allChanges.filter((item) => item.kind === "Removed").length}</span><span>Removed</span></article><article><span className="shift-number">{data.questions.filter((question) => allChanges.some((change) => change.code === outcomeById.get(question.outcomeId)?.code)).length}</span><span>Questions affected</span></article></div>
        <section className="panel table-panel"><SectionTitle title="Outcome comparison" description="Matched by stable outcome code; wording changes are flagged for human review." /><div className="change-list">{allChanges.length ? allChanges.map((change) => <article className="change-row" key={`${change.code}-${change.kind}`}><Status tone={change.kind === "Added" ? "blue" : change.kind === "Removed" ? "amber" : "neutral"}>{change.kind}</Status><strong className="change-code">{change.code}</strong><div className="change-before">{change.before}</div><Icon name="arrow" size={15} /><div className="change-after">{change.after}</div><span className="affected-count">{data.questions.filter((question) => outcomeById.get(question.outcomeId)?.code === change.code).length} questions</span></article>) : <EmptyState title="No differences in this workspace" detail="Add an outcome or edit an existing statement to see what would need review." />}</div></section>
      </div>;
    }

    if (activePage === "reports") {
      const unlinked = data.outcomes.filter((outcome) => !data.questions.some((question) => question.outcomeId === outcome.id));
      const mapped = data.outcomes.length - unlinked.length;
      const published = data.papers.filter((paper) => Boolean(paper.publishedAt)).length;
      const coverage = data.outcomes.length ? Math.round(mapped / data.outcomes.length * 100) : 0;
      return <div className="page-content">
        <div className="page-heading"><p className="eyebrow">INSIGHTS · FROM SAVED RECORDS</p><h1>Evidence, not guesswork.</h1><p className="page-subtitle">Workspace summaries use actual sample records and local changes—not live institution data.</p></div>
        <div className="metric-grid"><MetricCard label="Outcome coverage" value={`${coverage}%`} hint={`${mapped} mapped of ${data.outcomes.length}`} icon="book" accent="lavender" /><MetricCard label="Published papers" value={published} hint={`${data.papers.length - published} drafts`} icon="file" accent="mint" /><MetricCard label="Open project reviews" value={reviewProjects} hint={`${data.projects.length} projects total`} icon="spark" accent="peach" /></div>
        <div className="dashboard-grid">
          <section className="panel"><SectionTitle title="Outcome coverage" description="Outcomes with at least one mapped question." />{data.outcomes.length ? <div className="report-bars">{Array.from(new Set(data.outcomes.map((outcome) => outcome.subject))).map((subject) => { const list = data.outcomes.filter((outcome) => outcome.subject === subject); const count = list.filter((outcome) => data.questions.some((question) => question.outcomeId === outcome.id)).length; return <div className="report-bar" key={subject}><div><strong>{subject}</strong><span>{count}/{list.length} outcomes</span></div><div className="bar-track"><span style={{ width: `${list.length ? count / list.length * 100 : 0}%` }} /></div></div>; })}</div> : <EmptyState title="No curriculum data yet" detail="Add outcomes to calculate coverage." />}</section>
          <section className="panel"><SectionTitle title="Outcomes to look at" description="These outcomes do not yet have a question mapped." />{unlinked.length ? <div className="unlinked-list">{unlinked.map((outcome) => <div className="unlinked-row" key={outcome.id}><span className="code-pill">{outcome.code}</span><span>{outcome.topic}</span><button className="text-button" onClick={() => setActivePage("questions")}>Add question <Icon name="arrow" size={13} /></button></div>)}</div> : <div className="validation-success"><Icon name="check" size={15} />Every outcome has at least one mapped question.</div>}</section>
        </div>
        <p className="report-disclaimer">Content coverage is not evidence of student mastery. Assessment results and student-level progress are not available in this local demonstration.</p>
      </div>;
    }

    return <div className="page-content">
      <div className="page-heading"><p className="eyebrow">ACADEMY HUB · LOCAL DEMO</p><h1>Organization context</h1><p className="page-subtitle">This sample workspace is stored only in your current browser profile.</p></div>
      <section className="panel settings-panel">
        <div className="settings-avatar">N</div><div><h2>Northstar Academy</h2><p>Sample organization · English · UTC−05:00</p><Status tone="amber">Local demonstration</Status></div>
      </section>
      <section className="panel settings-panel-content"><SectionTitle title="What this workspace can do" /><ul className="settings-list"><li>Save outcomes, questions, paper drafts, assignments and project records in browser storage.</li><li>Publish a frozen question snapshot and print student papers and answer keys separately.</li><li>Calculate coverage from current outcome-to-question mappings.</li></ul><div className="callout callout-warning"><span className="callout-mark">!</span><span>This browser demo has no authentication, server database, tenant isolation or access control. Do not enter real student information or confidential assessment material.</span></div><button className="button button-danger" onClick={() => { if (window.confirm("Reset this browser workspace to the original sample records?")) { reset(); notify("Sample workspace reset."); } }}>Reset sample workspace</button></section>
      <section className="panel settings-panel-content"><SectionTitle title="Separate authenticated workspace" description="Supabase organization, class, assignment and project workflows live outside this browser-only demo." /><p className="page-subtitle">Configure your own development Supabase project using the setup guide before opening the authenticated workspace.</p><Link className="button button-outline" href="/app">Open account workspace</Link></section>
      <section className="panel settings-panel-content"><SectionTitle title="Future integrations" description="These features are not part of the current implementation." /><div className="integration-row"><span className="integration-mark">AI</span><div><strong>AI provider</strong><small>No AI-generated curriculum or assessment content is created in this demo.</small></div><Status>Optional</Status></div><div className="integration-row"><span className="integration-mark">₿</span><div><strong>Billing provider</strong><small>No subscriptions or payment flows are active.</small></div><Status>Not configured</Status></div></section>
    </div>;
  }

  const printQuestions = activeQuestions;
  const printTitle = activePaper?.title ?? "Examination paper";

  return (
    <>
      <div className="app-shell">
        <aside className={`sidebar ${navOpen ? "sidebar-open" : ""}`}>
          <div className="brand-row"><span className="brand-mark">k</span><span className="brand-name">knovera</span><button className="sidebar-close icon-button" aria-label="Close navigation" onClick={() => setNavOpen(false)}><Icon name="close" /></button></div>
          <button className="organization-switcher" onClick={() => setActivePage("settings")}><span className="org-avatar">N</span><span className="org-details"><strong>Northstar Academy</strong><small>Sample organization</small></span><span className="org-caret">⌄</span></button>
          <div className="demo-auth-links">
            <Link className="button button-outline" href="/login">Sign in</Link>
            <Link className="button button-primary" href="/signup">Create account</Link>
          </div>
          <nav className="sidebar-nav" aria-label="Main navigation">
            {["Workspace", "Assessment", "Learning", "Insights", "Manage"].map((group) => <div className="nav-group" key={group}><p className="nav-group-label">{group}</p>{navigation.filter((item) => item.group === group).map((item) => <button key={item.key} className={`nav-link ${activePage === item.key && !activePaper ? "nav-link-active" : ""}`} onClick={() => { setActivePage(item.key); setActivePaperId(""); setNavOpen(false); }}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.key === "papers" && data.papers.length > 0 && <span className="nav-count">{data.papers.length}</span>}</button>)}</div>)}
          </nav>
          <div className="sidebar-bottom">
            <Link className="sidebar-help" href="/app"><span className="help-icon">↗</span><div><strong>Connected workspace</strong><small>Sign in with your organization</small></div><Icon name="arrow" size={14} /></Link>
            <div className="sidebar-help"><span className="help-icon">?</span><div><strong>Getting started</strong><small>Build your first paper</small></div><Icon name="arrow" size={14} /></div>
            <div className="user-profile"><span className="user-avatar">AM</span><span><strong>Alex Morgan</strong><small>Academy administrator · demo</small></span><button aria-label="Open settings" onClick={() => setActivePage("settings")}><Icon name="dots" size={18} /></button></div>
          </div>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setNavOpen(true)}><span className="hamburger" /></button>
            <div className="breadcrumbs"><span>Northstar Academy</span><span className="breadcrumb-divider">/</span><strong>{activePaper ? "PaperForge" : navigation.find((item) => item.key === activePage)?.label}</strong></div>
            <div className="topbar-actions">
              <label className="global-search"><Icon name="search" size={16} /><input aria-label="Search workspace" placeholder="Search outcomes, questions…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></label>
              <div className="notification-wrap"><button className={`icon-button notification-button ${notificationsOpen ? "icon-button-active" : ""}`} aria-label="Workspace notices" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(!notificationsOpen)}><Icon name="bell" size={18} />{pendingAssignments > 0 && <span className="notification-dot" />}</button>{notificationsOpen && <div className="notification-popover"><strong>Workspace notices</strong><p>{pendingAssignments ? `${pendingAssignments} published assignment${pendingAssignments === 1 ? "" : "s"} in the sample workspace.` : "No active assignment records."}</p><span>Sample data only</span></div>}</div>
              <span className="topbar-avatar" aria-label="Alex Morgan">AM</span>
            </div>
          </header>
          <div className="content-scroll">
            {storageError && <div className="storage-alert" role="alert">{storageError} <button onClick={reset}>Reset sample data</button></div>}
            {!ready && <div className="loading-line" aria-label="Loading saved workspace" />}
            {renderPage()}
            <footer className="app-footer"><span>© 2026 Knovera</span><span><span className="footer-dot" /> Sample data · Saved in this browser</span><button onClick={() => setActivePage("settings")}>Privacy & setup</button></footer>
          </div>
        </main>
      </div>

      {modal && renderModal()}
      {toast && <div className="toast-message" role="status"><Icon name="check" size={16} />{toast}</div>}
      {activePaper && <div id="print-area" className={printMode === "answers" ? "print-answers" : "print-student"}>
        <div className="print-document">
          <header className="print-header"><div className="print-brand">knovera <span>· Northstar Academy</span></div><h1>{printMode === "answers" ? "Answer key" : printTitle}</h1><p>{activePaper.subject} · {activePaper.targetMarks} marks</p>{printMode === "student" && <div className="student-fields"><span>Name:</span><i /><span>Class:</span><i /></div>}</header>
          {printQuestions.map((question, index) => <article className="print-question" key={`${question.id}-${index}`}><div><strong>{index + 1}. {question.title}</strong><span>[{question.marks} marks]</span></div><p>{printMode === "answers" ? question.answer : question.prompt}</p>{printMode === "student" && <div className="print-answer-lines"><i /><i /><i /></div>}</article>)}
          <footer className="print-footer">{printMode === "answers" ? "Confidential · For teacher use" : "Please check that you have answered every question."}</footer>
        </div>
      </div>}
    </>
  );
}
