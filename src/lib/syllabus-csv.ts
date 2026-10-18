export type ImportedOutcome = {
  code: string;
  subject: string;
  topic: string;
  statement: string;
  description: string;
};

const requiredHeaders = ["code", "subject", "topic", "statement"];

export function parseSyllabusCsv(input: string): ImportedOutcome[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        afterQuote = true;
      } else {
        value += character;
      }
      continue;
    }

    if (afterQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new Error("Unexpected content after a quoted CSV field.");
    }
    if (character === '"') {
      if (value.length !== 0 || afterQuote) throw new Error("A quote appeared inside an unquoted CSV field.");
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
      afterQuote = false;
    } else if (character === "\r" || character === "\n") {
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
      afterQuote = false;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("A quoted CSV field was not closed.");
  if (value.length > 0 || row.length > 0 || afterQuote) {
    row.push(value);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }

  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one outcome.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const hasDescription = headers.length === 5 && headers[4] === "description";
  if (
    (headers.length !== 4 && !hasDescription)
    || requiredHeaders.some((header, index) => headers[index] !== header)
  ) {
    throw new Error("Use CSV columns code, subject, topic, statement, and optional description, in that order.");
  }
  if (rows.length - 1 > 500) throw new Error("Import no more than 500 outcomes at a time.");

  const seenCodes = new Set<string>();
  return rows.slice(1).map((cells, index) => {
    const lineNumber = index + 2;
    if (cells.length !== headers.length) throw new Error(`CSV row ${lineNumber} has the wrong number of columns.`);
    const [rawCode, rawSubject, rawTopic, rawStatement, rawDescription = ""] = cells.map((cell) => cell.trim());
    const outcome = {
      code: rawCode.toUpperCase(),
      subject: rawSubject,
      topic: rawTopic,
      statement: rawStatement,
      description: rawDescription,
    };
    if (
      outcome.code.length < 1 || outcome.code.length > 40
      || outcome.subject.length < 1 || outcome.subject.length > 120
      || outcome.topic.length < 1 || outcome.topic.length > 160
      || outcome.statement.length < 1 || outcome.statement.length > 2000
      || outcome.description.length > 4000
    ) {
      throw new Error(`CSV row ${lineNumber} has missing or oversized outcome fields.`);
    }
    if (seenCodes.has(outcome.code)) throw new Error(`Outcome code ${outcome.code} appears more than once in the import.`);
    seenCodes.add(outcome.code);
    return outcome;
  });
}
