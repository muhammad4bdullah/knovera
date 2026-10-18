import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOutcomeCoverage,
  initialWorkspace,
  isWorkspaceData,
  sumQuestionMarks,
  validatePaperComposition,
} from "../src/lib/workspace.ts";
import { parseSyllabusCsv } from "../src/lib/syllabus-csv.ts";

test("paper mark totals use the marks stored on the selected questions", () => {
  const questions = initialWorkspace.questions.slice(0, 3);
  assert.equal(sumQuestionMarks(questions), 11);
  assert.deepEqual(validatePaperComposition(questions, 11), {
    total: 11,
    issues: [],
  });
});

test("paper validation explains empty and mismatched papers", () => {
  assert.deepEqual(validatePaperComposition([], 10), {
    total: 0,
    issues: ["Add at least one question.", "Question marks total 0, but the paper target is 10."],
  });
  assert.deepEqual(validatePaperComposition(initialWorkspace.questions.slice(0, 1), 6), {
    total: 4,
    issues: ["Question marks total 4, but the paper target is 6."],
  });
  assert.match(validatePaperComposition(initialWorkspace.questions.slice(0, 1), 1.5).issues[0], /valid target/);
});

test("coverage counts outcomes with one or more mapped questions", () => {
  const coverage = calculateOutcomeCoverage(initialWorkspace.outcomes, initialWorkspace.questions);
  assert.equal(coverage.mapped, 6);
  assert.equal(coverage.total, 7);
  assert.equal(coverage.percentage, 86);
  assert.deepEqual(coverage.unlinked.map((outcome) => outcome.code), ["BIO-1.2"]);
});

test("coverage safely represents an empty curriculum", () => {
  assert.deepEqual(calculateOutcomeCoverage([], []), {
    mapped: 0,
    total: 0,
    unlinked: [],
    percentage: 0,
  });
});

test("workspace data rejects unknown or incomplete stored formats", () => {
  assert.equal(isWorkspaceData(initialWorkspace), true);
  assert.equal(isWorkspaceData({ ...initialWorkspace, version: 2 }), false);
  assert.equal(isWorkspaceData({ version: 1, outcomes: [] }), false);
  const invalidQuestion = JSON.parse(JSON.stringify(initialWorkspace));
  invalidQuestion.questions[0].marks = 0;
  assert.equal(isWorkspaceData(invalidQuestion), false);
});

test("syllabus CSV import parses quoted cells and optional descriptions", () => {
  assert.deepEqual(
    parseSyllabusCsv('code,subject,topic,statement,description\r\nBIO-1,Biology,"Cells, tissues","Explain ""cell theory""","Line one, line two"'),
    [{
      code: "BIO-1",
      subject: "Biology",
      topic: "Cells, tissues",
      statement: 'Explain "cell theory"',
      description: "Line one, line two",
    }],
  );
  assert.deepEqual(parseSyllabusCsv("code,subject,topic,statement\nM-1,Math,Algebra,Factor expressions"), [{
    code: "M-1",
    subject: "Math",
    topic: "Algebra",
    statement: "Factor expressions",
    description: "",
  }]);
});

test("syllabus CSV import rejects malformed headers, fields, and duplicate codes", () => {
  assert.throws(() => parseSyllabusCsv("code,topic,subject,statement\nA-1,Cells,Biology,Explain cells"), /columns/);
  assert.throws(() => parseSyllabusCsv('code,subject,topic,statement\nA-1,Biology,Cells,"Not closed'), /not closed/);
  assert.throws(() => parseSyllabusCsv("code,subject,topic,statement\nA-1,Biology,Cells,One\na-1,Biology,Cells,Two"), /more than once/);
});
