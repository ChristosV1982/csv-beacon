/* scripts/extract-risq-v32-preview.mjs */
/*
  C.S.V. BEACON - RISQ 3.2 PDF extraction preview

  Purpose:
    - Read RISQ 3.2 PDF
    - Extract sections, Chapter 1 header/particular fields, and operational questions from Chapter 2 onward
    - Generate preview JSON/CSV only
    - No database writes
    - No SIRE 2.0 table changes

  Internal RISQ numbering:
    Printed Section 4, Q4.21 -> 04A.021
    Printed Section 7B, Q7.1 -> 07B.001
    Printed sub-question 1.17.1 -> 01A.017.001
*/

import fs from "node:fs";
import path from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const INPUT = process.argv[2];

if (!INPUT) {
  console.error("ERROR: Missing PDF input path.");
  console.error("Usage: node scripts/extract-risq-v32-preview.mjs ./data/Rightship_inspection_questionnaire_v_32_c.pdf");
  process.exit(1);
}

if (!fs.existsSync(INPUT)) {
  console.error(`ERROR: Input file not found: ${INPUT}`);
  process.exit(1);
}

const OUT_JSON = "./data/risq-v32-preview.json";
const OUT_CSV = "./data/risq-v32-preview.csv";
const OUT_DIAG = "./data/risq-v32-extraction-diagnostics.json";

const START_PAGE = 14;
const END_PAGE_EXCLUSIVE = 235;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\uFFFE/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseLine(line) {
  const s = cleanText(line);
  if (!s) return true;
  if (/^\d+\s*\|\s*www\.rightship\.com$/i.test(s)) return true;
  if (s === "RightShip Inspection") return true;
  if (s === "Ship Questionnaire (RISQ)") return true;
  if (s === "V/03.2") return true;
  return false;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function sectionCode(section) {
  return `${String(section.section_number).padStart(2, "0")}${section.section_letter}`;
}

function internalQuestionNo(section, printedQuestionNo) {
  const parts = String(printedQuestionNo || "").split(".");
  if (parts.length < 2) return "";

  const base = sectionCode(section);
  const q = String(Number(parts[1])).padStart(3, "0");

  if (parts.length >= 3) {
    const sub = String(Number(parts[2])).padStart(3, "0");
    return `${base}.${q}.${sub}`;
  }

  return `${base}.${q}`;
}

function extractInspectionMarker(questionText) {
  const text = cleanText(questionText);
  const matches = [...text.matchAll(/\((V\s*&\s*M|M\s*&\s*V|V|M)\)/gi)];

  if (!matches.length) {
    return {
      marker: "",
      cleanedText: text
    };
  }

  const raw = matches[matches.length - 1][1]
    .toUpperCase()
    .replace(/\s+/g, "");

  const marker = raw === "M&V" || raw === "V&M"
    ? "V & M"
    : raw;

  const cleanedText = text
    .replace(/\s*\((?:V\s*&\s*M|M\s*&\s*V|V|M)\)\s*\??\s*$/i, "")
    .trim();

  return { marker, cleanedText };
}

function finalizeQuestion(q, target) {
  if (!q) return;

  let questionText = cleanText(q._questionLines.join(" "));
  questionText = questionText
    .replace(/\bYes\b\s+\bNo\b\s+\bN\/A\b\s+\bN\/V\b/gi, "")
    .trim();

  const markerInfo = extractInspectionMarker(questionText);

  const guide = q._guideLines
    .map(cleanText)
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

    const removed = /this question has been removed/i.test(markerInfo.cleanedText);

  let answerType = q._hasAnswers
    ? "yes_no_na_nv"
    : q.section_number === 1
      ? "header_field"
      : removed
        ? "removed"
        : "yes_no_na_nv";

  const answerOptionsInferred =
    q.section_number !== 1 &&
    removed === false &&
    q._hasAnswers === false &&
    answerType === "yes_no_na_nv";

  const final = {
    question_set_code: "RISQ_3_2",
    question_set_name: "RightShip Inspection Ship Questionnaire",
    question_set_version: "3.2",
    provider: "RightShip",

    section_code: q.section_code,
    section_number: q.section_number,
    section_letter: q.section_letter,
    section_title: q.section_title,

    printed_question_no: q.printed_question_no,
    internal_question_no: q.internal_question_no,

    question_text: markerInfo.cleanedText,
    guide_to_inspection: guide,

    answer_type: answerType,
    answer_options: answerType === "yes_no_na_nv" ? ["YES", "NO", "N/A", "N/V"] : [],
    answer_options_inferred: answerOptionsInferred,
    inspection_marker: markerInfo.marker,

    is_removed_question: removed,

    source_page_start: q.source_page_start,
    source_page_end: q._lastPage,

    raw_source_text: [
      q._questionLines.join("\n"),
      q._guideLines.length ? "\nGuide to Inspection\n" + q._guideLines.join("\n") : ""
    ].join("").trim(),

    esms_references: "",
    esms_forms: "",
    remarks: ""
  };

  target.push(final);
}

async function extractPageLines(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  const content = await page.getTextContent();

  const rows = [];

  for (const item of content.items || []) {
    const text = cleanText(item.str);
    if (!text) continue;

    const t = item.transform || [0, 0, 0, 0, 0, 0];
    const x = Number(t[4] || 0);
    const y = Number(t[5] || 0);

    let row = rows.find((r) => Math.abs(r.y - y) <= 2.2);

    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }

    row.items.push({ x, text });
  }

  rows.sort((a, b) => b.y - a.y);

  const lines = rows.map((row) => {
    row.items.sort((a, b) => a.x - b.x);
    return cleanText(row.items.map((i) => i.text).join(" "));
  });

  return lines.filter((line) => !isNoiseLine(line));
}

const sectionRe = /^Section\s+(\d{1,2})([A-Z])?\s*:\s*(.+?)\s*$/i;
const qExactRe = /^(\d{1,2}\.\d{1,3}(?:\.\d{1,3})?)\s*$/;
const qInlineRe = /^(\d{1,2}\.\d{1,3}(?:\.\d{1,3})?)\s+(.+)$/;

const pdfBytes = new Uint8Array(fs.readFileSync(INPUT));

const loadingTask = pdfjsLib.getDocument({
  data: pdfBytes,
  disableWorker: true,
  useSystemFonts: true
});

const pdf = await loadingTask.promise;

console.log("C.S.V. BEACON - RISQ 3.2 Extraction Preview");
console.log(`Input: ${INPUT}`);
console.log(`Pages: ${pdf.numPages}`);
console.log("No database writes will be performed.");

const sections = [];
const headerFields = [];
const questions = [];
const warnings = [];

let currentSection = null;
let currentQuestion = null;
let inGuide = false;

for (let pageNo = START_PAGE; pageNo <= Math.min(pdf.numPages, END_PAGE_EXCLUSIVE - 1); pageNo += 1) {
  const lines = await extractPageLines(pdf, pageNo);

  for (const line of lines) {
    const sectionMatch = line.match(sectionRe);

    if (sectionMatch) {
      finalizeQuestion(currentQuestion, currentQuestion?.section_number === 1 ? headerFields : questions);
      currentQuestion = null;
      inGuide = false;

      const sectionNumber = Number(sectionMatch[1]);
      const sectionLetter = (sectionMatch[2] || "A").toUpperCase();
      const sectionTitle = cleanText(sectionMatch[3]);

      currentSection = {
        section_code: `${String(sectionNumber).padStart(2, "0")}${sectionLetter}`,
        section_number: sectionNumber,
        section_letter: sectionLetter,
        section_title: sectionTitle,
        source_page: pageNo
      };

      sections.push(currentSection);
      continue;
    }

    if (!currentSection) continue;

    let printedQuestionNo = "";
    let rest = "";

    const exact = line.match(qExactRe);
    if (exact && Number(exact[1].split(".")[0]) === currentSection.section_number) {
      printedQuestionNo = exact[1];
    } else {
      const inline = line.match(qInlineRe);
      if (inline && Number(inline[1].split(".")[0]) === currentSection.section_number) {
        printedQuestionNo = inline[1];
        rest = cleanText(inline[2]);
      }
    }

    if (printedQuestionNo) {
      finalizeQuestion(currentQuestion, currentQuestion?.section_number === 1 ? headerFields : questions);

      currentQuestion = {
        section_code: currentSection.section_code,
        section_number: currentSection.section_number,
        section_letter: currentSection.section_letter,
        section_title: currentSection.section_title,
        printed_question_no: printedQuestionNo,
        internal_question_no: internalQuestionNo(currentSection, printedQuestionNo),
        source_page_start: pageNo,
        _lastPage: pageNo,
        _questionLines: [],
        _guideLines: [],
        _hasAnswers: false
      };

      if (rest) currentQuestion._questionLines.push(rest);

      inGuide = false;
      continue;
    }

    if (!currentQuestion) continue;

    currentQuestion._lastPage = pageNo;

    if (
      /^(Yes|No|N\/A|N\/V)$/i.test(line) ||
      /\bYes\b\s+\bNo\b\s+\bN\/A\b\s+\bN\/V\b/i.test(line)
    ) {
      currentQuestion._hasAnswers = true;
      continue;
    }

    if (line.toLowerCase() === "guide to inspection") {
      inGuide = true;
      continue;
    }

    if (inGuide) {
      currentQuestion._guideLines.push(line);
    } else {
      currentQuestion._questionLines.push(line);
    }
  }
}

finalizeQuestion(currentQuestion, currentQuestion?.section_number === 1 ? headerFields : questions);

const bySection = {};
for (const q of questions) {
  bySection[q.section_code] = (bySection[q.section_code] || 0) + 1;
}

for (const q of questions) {
  if (!q.is_removed_question && !q.question_text) {
    warnings.push({
      type: "empty_question_text",
      internal_question_no: q.internal_question_no,
      printed_question_no: q.printed_question_no,
      page: q.source_page_start
    });
  }

  if (!q.is_removed_question && q.answer_type !== "yes_no_na_nv") {
    warnings.push({
      type: "non_standard_answer_type",
      internal_question_no: q.internal_question_no,
      printed_question_no: q.printed_question_no,
      answer_type: q.answer_type,
      page: q.source_page_start
    });
  }

  if (q.answer_options_inferred === true) {
    warnings.push({
      type: "answer_options_inferred",
      internal_question_no: q.internal_question_no,
      printed_question_no: q.printed_question_no,
      page: q.source_page_start,
      note: "YES/NO/N/A/N/V line was not visibly extracted; answer model inferred from RISQ rules."
    });
  }
}

const preview = {
  generated_at: new Date().toISOString(),
  source_pdf: INPUT,
  extraction_scope: {
    start_page: START_PAGE,
    end_page_exclusive: END_PAGE_EXCLUSIVE,
    chapter_1_treatment: "header_fields_not_operational_questions",
    operational_questions_start_from_chapter: 2
  },
  numbering_rule: {
    format: "NNL.QQQ",
    no_letter_sections_default_to: "A",
    examples: [
      { printed_context: "Section 4, Q4.21", internal_question_no: "04A.021" },
      { printed_context: "Section 7B, Q7.1", internal_question_no: "07B.001" },
      { printed_context: "Section 1, Q1.17.1", internal_question_no: "01A.017.001" }
    ]
  },
  summary: {
    sections_detected: sections.length,
    header_fields_detected: headerFields.length,
    operational_questions_detected: questions.length,
    removed_operational_questions: questions.filter((q) => q.is_removed_question).length,
    by_section: bySection,
    warnings_count: warnings.length
  },
  sections,
  header_fields: headerFields,
  questions,
  warnings
};

fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

fs.writeFileSync(OUT_JSON, JSON.stringify(preview, null, 2), "utf8");

const csvHeaders = [
  "question_set_code",
  "question_set_version",
  "section_code",
  "section_title",
  "printed_question_no",
  "internal_question_no",
  "question_text",
  "answer_type",
  "answer_options_inferred",
  "inspection_marker",
  "is_removed_question",
  "source_page_start",
  "source_page_end",
  "guide_to_inspection",
  "esms_references",
  "esms_forms",
  "remarks"
];

const csvLines = [
  csvHeaders.map(csvCell).join(","),
  ...questions.map((q) => csvHeaders.map((h) => csvCell(q[h])).join(","))
];

fs.writeFileSync(OUT_CSV, csvLines.join("\n"), "utf8");

const diagnostics = {
  generated_at: preview.generated_at,
  source_pdf: INPUT,
  summary: preview.summary,
  first_5_operational_questions: questions.slice(0, 5).map((q) => ({
    internal_question_no: q.internal_question_no,
    printed_question_no: q.printed_question_no,
    section_code: q.section_code,
    section_title: q.section_title,
    question_text: q.question_text,
    answer_type: q.answer_type,
    inspection_marker: q.inspection_marker,
    guide_length: q.guide_to_inspection.length,
    page_start: q.source_page_start,
    page_end: q.source_page_end
  })),
  first_5_header_fields: headerFields.slice(0, 5).map((q) => ({
    internal_question_no: q.internal_question_no,
    printed_question_no: q.printed_question_no,
    question_text: q.question_text,
    answer_type: q.answer_type,
    page_start: q.source_page_start,
    page_end: q.source_page_end
  })),
  warnings
};

fs.writeFileSync(OUT_DIAG, JSON.stringify(diagnostics, null, 2), "utf8");

console.log("\nRISQ extraction preview completed.");
console.log(`JSON: ${OUT_JSON}`);
console.log(`CSV: ${OUT_CSV}`);
console.log(`Diagnostics: ${OUT_DIAG}`);
console.log("\nSummary:");
console.log(JSON.stringify(preview.summary, null, 2));
