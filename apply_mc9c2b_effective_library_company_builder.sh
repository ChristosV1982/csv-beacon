#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc9c2b_effective_library_company_builder

for f in \
  public/q-company.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc9c2b_effective_library_company_builder/$(basename "$f")
  fi
done

node <<'NODE'
const fs = require("fs");

const file = "public/q-company.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/q-company.js not found.");
  process.exit(1);
}

let s = fs.readFileSync(file, "utf8");

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

function replaceAsyncFunction(name, replacement) {
  const marker = `async function ${name}(`;
  const start = s.indexOf(marker);

  if (start < 0) {
    throw new Error(`Async function not found: ${name}`);
  }

  const end = findBlockEnd(s, start);

  if (end < 0) {
    throw new Error(`Could not find end of async function: ${name}`);
  }

  s = s.slice(0, start) + replacement + s.slice(end);
}

/* ------------------------------------------------------------
   1. Add effective-library helpers
------------------------------------------------------------ */

if (!s.includes("MC-9C2B Effective Company Question Library Helpers")) {
  const helper = `

/* ======================== MC-9C2B Effective Company Question Library Helpers ======================== */

const MC9C2B_BUILD = "MC9C2B-2026-04-30";

function mc9SafeArray(v) {
  return Array.isArray(v) ? v : [];
}

function mc9Text(v) {
  return v === null || v === undefined ? "" : String(v);
}

function mc9QuestionNumber(row) {
  const full = mc9Text(row?.number_full).trim();
  if (full) return full;

  const base = mc9Text(row?.number_base).trim();
  const suffix = mc9Text(row?.number_suffix).trim();

  if (!base) return "";
  return suffix ? base + "-" + suffix : base;
}

function mc9NormalizePgnoRows(rows) {
  return mc9SafeArray(rows)
    .map((r, idx) => ({
      seq: Number(r?.seq || idx + 1),
      pgno_code: mc9Text(r?.pgno_code || ""),
      pgno_text: mc9Text(r?.pgno_text || r?.text || ""),
      text: mc9Text(r?.pgno_text || r?.text || ""),
      remarks: mc9Text(r?.remarks || "")
    }))
    .filter((r) => r.text.trim());
}

function mc9NormalizeEvidenceRows(rows) {
  return mc9SafeArray(rows)
    .map((r, idx) => ({
      seq: Number(r?.seq || idx + 1),
      evidence_text: mc9Text(r?.evidence_text || r?.text || ""),
      text: mc9Text(r?.evidence_text || r?.text || ""),
      esms_references: mc9Text(r?.esms_references || ""),
      esms_forms: mc9Text(r?.esms_forms || ""),
      remarks: mc9Text(r?.remarks || "")
    }))
    .filter((r) => r.text.trim());
}

function mc9EffectiveRowToQuestion(row) {
  const payload = row?.effective_payload && typeof row.effective_payload === "object"
    ? JSON.parse(JSON.stringify(row.effective_payload))
    : {};

  const qno = mc9QuestionNumber(row);
  const numberBase = mc9Text(row?.number_base).trim();
  const numberSuffix = mc9Text(row?.number_suffix).trim();
  const sourceType = mc9Text(row?.source_type || "SIRE").trim() || "SIRE";

  const pgnoRows = mc9NormalizePgnoRows(row?.effective_pgno);
  const eeRows = mc9NormalizeEvidenceRows(row?.effective_expected_evidence);

  const pgnoTextRows = pgnoRows.map((x) => x.text).filter(Boolean);
  const eeTextRows = eeRows.map((x) => x.text).filter(Boolean);

  const questionText =
    mc9Text(payload.question || payload.Question || payload.short_text || payload.ShortText || payload.text || "").trim();

  const shortText =
    mc9Text(payload.short_text || payload.ShortText || payload.shortText || questionText || "").trim();

  const merged = {
    ...payload,

    id: row.question_id,
    question_id: row.question_id,
    db_question_id: row.question_id,
    master_question_id: row.question_id,

    question_no: qno,
    question_number: qno,
    number_full: qno,
    Number: qno,
    Question_No: qno,
    questionNo: qno,

    number_base: numberBase,
    number_suffix: numberSuffix,

    source_type: sourceType,
    is_custom: !!row.is_custom,
    status: row.status,
    version: row.version,
    tags: row.tags || [],

    company_id: row.company_id,
    company_name: row.company_name || "",

    override_id: row.override_id || null,
    override_status: row.override_status || null,
    override_version: row.override_version || null,

    can_view: row.can_view,
    can_review: row.can_review,
    can_edit_override: row.can_edit_override,

    short_text: shortText,
    ShortText: shortText,
    question: questionText,
    Question: questionText,

    potential_grounds_for_negative_observations: pgnoTextRows,
    Potential_Grounds_for_Negative_Observations: pgnoTextRows,
    PGNO: pgnoTextRows,
    pgno_rows: pgnoRows,
    effective_pgno: pgnoRows,

    expected_evidence: eeTextRows,
    Expected_Evidence: eeTextRows,
    expected_evidence_rows: eeRows,
    effective_expected_evidence: eeRows,

    __effective_company_library: true,
    __mc9c2b_build: MC9C2B_BUILD
  };

  return merged;
}

function mc9RefreshFilterValuesFromLibrary() {
  const chapters = [...new Set(LIB.map(getChapter).filter(Boolean).map(String))].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const qtypes = [...new Set(LIB.map(getQType).filter(Boolean).map(String))].sort();

  FILTERS.chapters.values = chapters;
  FILTERS.qtype.values = qtypes;

  renderFilterBar();
  applyFilters();
  renderSelectedSummary();
}

async function loadEffectiveLibraryForSelectedVessel() {
  const vesselId = el("vesselSelect")?.value || VESSELS[0]?.id || "";

  if (!vesselId) {
    LIB = [];
    LIB_BY_NO = new Map();
    FILTERED = [];
    SELECTED_SET = new Set();

    const lockLine = el("libraryLockLine");
    if (lockLine) {
      lockLine.textContent = "Effective question library: no vessel selected.";
    }

    mc9RefreshFilterValuesFromLibrary();
    return;
  }

  setSubLine("Loading assigned/effective question library for selected vessel...");

  const { data, error } = await supabaseClient.rpc("csvb_effective_question_library_for_vessel", {
    p_vessel_id: vesselId
  });

  if (error) {
    throw new Error("Effective question library load failed: " + error.message);
  }

  LIB = (data || []).map(mc9EffectiveRowToQuestion);
  LIB_BY_NO = new Map();

  for (const q of LIB) {
    const qno = getQno(q);
    if (qno) LIB_BY_NO.set(String(qno), q);
  }

  const validQuestionNos = new Set(Array.from(LIB_BY_NO.keys()));
  SELECTED_SET = new Set(
    Array.from(SELECTED_SET || []).filter((qno) => validQuestionNos.has(String(qno)))
  );

  const vesselName = (VESSELS || []).find((v) => String(v.id) === String(vesselId))?.name || "selected vessel";
  const lockLine = el("libraryLockLine");

  if (lockLine) {
    lockLine.textContent =
      "Effective assigned question library loaded for " +
      vesselName +
      ": " +
      LIB.length +
      " question(s).";
  }

  window.CSVB_EFFECTIVE_LIBRARY = {
    build: MC9C2B_BUILD,
    vessel_id: vesselId,
    question_count: LIB.length,
    sample: LIB.slice(0, 3)
  };

  mc9RefreshFilterValuesFromLibrary();
  setSubLine("Ready.");
}

`;

  const marker = "let SELECTED_SET = new Set(); // question_no strings";
  if (!s.includes(marker)) {
    throw new Error("Could not find SELECTED_SET declaration.");
  }

  s = s.replace(marker, marker + "\n" + helper);
}

/* ------------------------------------------------------------
   2. Replace refreshAll so it loads effective assigned library
------------------------------------------------------------ */

replaceAsyncFunction("refreshAll", `async function refreshAll() {
  VESSELS = await loadVessels();
  renderVesselSelect();

  await loadEffectiveLibraryForSelectedVessel();

  ALL_Q = await loadQuestionnaires();
  renderQuestionnairesTable();

  await refreshTemplates();
}`);

/* ------------------------------------------------------------
   3. Add vessel-change reload handler
------------------------------------------------------------ */

if (!s.includes("MC-9C2B vessel change effective library reload")) {
  s = s.replace(
    'el("refreshBtn")?.addEventListener("click", refreshAll);',
    `el("refreshBtn")?.addEventListener("click", refreshAll);

  // MC-9C2B vessel change effective library reload
  el("vesselSelect")?.addEventListener("change", async () => {
    clearWarn();

    try {
      SELECTED_SET = new Set();
      await loadEffectiveLibraryForSelectedVessel();
    } catch (e) {
      showWarn(String(e?.message || e));
      setSubLine("Error loading effective library.");
    }
  });`
  );
}

/* ------------------------------------------------------------
   4. Make initial label clear
------------------------------------------------------------ */

s = s.replace(
  'if (lockLine) lockLine.textContent = `Library locked to: ${LOCKED_LIBRARY_JSON}`;',
  'if (lockLine) lockLine.textContent = "Question source: assigned/effective company library.";'
);

/* ------------------------------------------------------------
   5. Leave old JSON fallback in place, but mark it as fallback only
------------------------------------------------------------ */

s = s.replace(
  'setSubLine("Loading question library...");',
  'setSubLine("Loading fallback question library; effective library will replace it after vessel load...");'
);

fs.writeFileSync(file, s, "utf8");

/* ------------------------------------------------------------
   6. Service worker cache bump
------------------------------------------------------------ */

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v25-mc9c2b-effective-library-company-builder";'
    );
  }

  fs.writeFileSync(sw, x, "utf8");
}

fs.writeFileSync(
  "public/MC9C2B_EFFECTIVE_LIBRARY_COMPANY_BUILDER_APPLIED.txt",
  "MC-9C2B applied: Company Builder now loads assigned/effective question library by selected vessel. No SQL/auth/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-9C2B Company Builder effective library patch applied.");
NODE

echo "DONE: MC-9C2B completed."
echo "Next: open Company Builder and hard refresh with Ctrl + Shift + R."
