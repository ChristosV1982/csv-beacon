const fs = require("fs");

const file = "public/q-company.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/q-company.js not found.");
  process.exit(1);
}

const s = fs.readFileSync(file, "utf8");

function findBlockEnd(str, start) {
  const open = str.indexOf("{", start);
  if (open < 0) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }

      if (ch === "\\") {
        escape = true;
        continue;
      }

      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function printFunction(name, asyncFn = true) {
  const marker = (asyncFn ? "async function " : "function ") + name + "(";
  const start = s.indexOf(marker);

  console.log("\n==================================================");
  console.log(marker);
  console.log("==================================================");

  if (start < 0) {
    console.log("NOT FOUND");
    return;
  }

  const before = s.slice(0, start);
  const startLine = before.split(/\r?\n/).length;
  const end = findBlockEnd(s, start);

  if (end < 0) {
    console.log("FOUND BUT COULD NOT FIND END");
    return;
  }

  const body = s.slice(start, end);
  body.split(/\r?\n/).forEach((line, idx) => {
    console.log(String(startLine + idx).padStart(5, " ") + ": " + line);
  });
}

console.log("FILE:", file);
console.log("LENGTH:", s.length);
console.log("");

const checks = [
  "QuestionSource",
  "loadQuestionLibrary",
  "loadLibrary",
  "ALL_QUESTIONS",
  "allQuestions",
  "QUESTIONS",
  "FILTERED",
  "FILTERED_QUESTIONS",
  "SELECTED_SET",
  "selectedQuestions",
  "vesselSelect",
  "company_id",
  "csvb_effective_question_library_for_company",
  "csvb_effective_question_library_for_vessel",
  "create_questionnaire_from_template"
];

for (const c of checks) {
  console.log(c.padEnd(48), s.includes(c) ? "YES" : "NO");
}

console.log("\nQUERY / QUESTION SOURCE LINES:");
s.split(/\r?\n/).forEach((line, idx) => {
  const l = line.trim();

  if (
    l.includes("QuestionSource") ||
    l.includes("loadQuestionLibrary") ||
    l.includes("ALL_QUESTIONS") ||
    l.includes("allQuestions") ||
    l.includes("QUESTIONS") ||
    l.includes("FILTERED") ||
    l.includes("SELECTED_SET") ||
    l.includes("vesselSelect") ||
    l.includes("create_questionnaire_from_template") ||
    l.includes(".from(") ||
    l.includes(".rpc(") ||
    l.includes("insert(")
  ) {
    console.log(String(idx + 1).padStart(5, " ") + ": " + line.slice(0, 260));
  }
});

[
  ["loadVessels", true],
  ["loadQuestionnaires", true],
  ["loadTemplates", true],
  ["loadTemplateCounts", true],
  ["renderVesselSelect", false],
  ["applyFilters", false],
  ["renderSelectedSummary", false],
  ["selectAllFiltered", false],
  ["clearSelected", false],
  ["refreshAll", true],
  ["createQuestionnaireFromTemplateFlow", true],
  ["createQuestionnaireByCompile", true],
  ["compileTemplateQuestions", true],
  ["init", true]
].forEach(([name, asyncFn]) => printFunction(name, asyncFn));
