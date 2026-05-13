/* scripts/build-risq-v32-import-sql-chunks.mjs */
/*
  C.S.V. BEACON - RISQ 3.2 chunked SQL importer builder

  Reads:
    data/risq-v32-preview.json

  Writes:
    data/risq-import-sql-chunks/*.sql

  Purpose:
    Supabase SQL Editor may reject one very large import file.
    This script creates smaller SQL chunks.

  Safety:
    - Creates import SQL for risq_* tables only.
    - Does NOT connect to Supabase.
    - Does NOT touch SIRE tables.
*/

import fs from "node:fs";
import path from "node:path";

const INPUT = "./data/risq-v32-preview.json";
const OUT_DIR = "./data/risq-import-sql-chunks";
const MAX_PAYLOAD_CHARS = 140000;

if (!fs.existsSync(INPUT)) {
  console.error(`ERROR: Missing ${INPUT}. Run extract:risq-preview first.`);
  process.exit(1);
}

const p = JSON.parse(fs.readFileSync(INPUT, "utf8"));

function clean(value) {
  return String(value ?? "").trim();
}

function sortValueFromInternal(no) {
  const s = clean(no);
  const m = s.match(/^(\d{2})([A-Z])\.(\d{3})(?:\.(\d{3}))?$/);
  if (!m) return 999999999;

  const sectionNo = Number(m[1]);
  const letterNo = m[2].charCodeAt(0) - 64;
  const qNo = Number(m[3]);
  const subNo = m[4] ? Number(m[4]) : 0;

  return sectionNo * 1000000 + letterNo * 100000 + qNo * 100 + subNo;
}

function pickDollarTag(text, base = "RISQDATA") {
  for (let i = 1; i <= 50; i += 1) {
    const tag = `${base}${i}`;
    if (!text.includes(`$${tag}$`)) return tag;
  }
  return `${base}_UNLIKELY_20260513`;
}

function asDollarJson(obj, base) {
  const txt = JSON.stringify(obj);
  const tag = pickDollarTag(txt, base);
  return `$${tag}$${txt}$${tag}$::jsonb`;
}

function writeSql(name, sql) {
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, sql, "utf8");
  return file;
}

function sectionRows() {
  return (p.sections || []).map((s, index) => ({
    section_code: clean(s.section_code),
    section_number: Number(s.section_number),
    section_letter: clean(s.section_letter || "A"),
    section_title: clean(s.section_title),
    source_page: s.source_page ?? null,
    sort_order: Number(s.section_number) * 100 + (clean(s.section_letter || "A").charCodeAt(0) - 64) + index / 1000
  }));
}

function headerRows() {
  return (p.header_fields || []).map((q, index) => {
    const removed = q.is_removed_question === true || /this question has been removed/i.test(q.question_text || "");

    return {
      printed_field_no: clean(q.printed_question_no),
      internal_field_no: clean(q.internal_question_no),
      field_sort_key: sortValueFromInternal(q.internal_question_no) + index / 1000,
      field_label: clean(q.question_text),
      field_type: removed ? "removed" : "header_field",
      inspection_marker: clean(q.inspection_marker),
      is_removed_field: removed,
      is_active: !removed,
      source_page_start: q.source_page_start ?? null,
      source_page_end: q.source_page_end ?? null,
      raw_source_text: clean(q.raw_source_text),
      remarks: ""
    };
  });
}

function questionRows() {
  return (p.questions || []).map((q, index) => {
    const removed = q.is_removed_question === true || /this question has been removed/i.test(q.question_text || "");
    const guide = clean(q.guide_to_inspection);

    return {
      section_code: clean(q.section_code),
      section_number: Number(q.section_number),
      section_letter: clean(q.section_letter || "A"),
      section_title: clean(q.section_title),

      printed_question_no: clean(q.printed_question_no),
      internal_question_no: clean(q.internal_question_no),
      question_sort_key: sortValueFromInternal(q.internal_question_no) + index / 1000,

      question_text: clean(q.question_text),
      guide_to_inspection: guide,

      answer_type: removed ? "removed" : clean(q.answer_type || "yes_no_na_nv"),
      answer_options: removed ? [] : (Array.isArray(q.answer_options) && q.answer_options.length ? q.answer_options : ["YES", "NO", "N/A", "N/V"]),
      answer_options_inferred: q.answer_options_inferred === true,

      inspection_marker: clean(q.inspection_marker),

      is_removed_question: removed,
      is_active: !removed,

      guide_status: removed ? "removed" : guide ? "provided" : "not_provided",

      source_page_start: q.source_page_start ?? null,
      source_page_end: q.source_page_end ?? null,
      raw_source_text: clean(q.raw_source_text),

      metadata: {
        question_set_code: q.question_set_code || "RISQ_3_2",
        provider: q.provider || "RightShip",
        extracted_from_preview: true
      }
    };
  });
}

function chunkByJsonSize(rows) {
  const chunks = [];
  let current = [];

  for (const row of rows) {
    const tentative = [...current, row];
    const size = JSON.stringify(tentative).length;

    if (current.length && size > MAX_PAYLOAD_CHARS) {
      chunks.push(current);
      current = [row];
    } else {
      current = tentative;
    }
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function sqlSectionsAndHeaders(sections, headers) {
  const payload = asDollarJson({ sections, header_fields: headers }, "RISQCORE");

  return `-- ============================================================
-- RISQ-05F-00
-- Sections + Chapter 1 Header Fields
-- RISQ-only import. SIRE untouched.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _risq_core_payload (
  payload jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _risq_core_payload(payload)
VALUES (${payload});

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.risq_question_sets WHERE question_set_code = 'RISQ_3_2'
  ) THEN
    RAISE EXCEPTION 'RISQ_3_2 question set does not exist. Run RISQ-04A first.';
  END IF;
END $$;

WITH qs AS (
  SELECT id AS question_set_id FROM public.risq_question_sets WHERE question_set_code = 'RISQ_3_2' LIMIT 1
),
input_rows AS (
  SELECT *
  FROM _risq_core_payload p
  CROSS JOIN LATERAL jsonb_to_recordset(p.payload->'sections') AS r(
    section_code text,
    section_number integer,
    section_letter text,
    section_title text,
    source_page integer,
    sort_order numeric
  )
)
INSERT INTO public.risq_sections (
  question_set_id,
  section_code,
  section_number,
  section_letter,
  section_title,
  source_page,
  sort_order,
  is_active,
  created_by,
  updated_by
)
SELECT
  qs.question_set_id,
  i.section_code,
  i.section_number,
  i.section_letter,
  i.section_title,
  i.source_page,
  i.sort_order,
  true,
  auth.uid(),
  auth.uid()
FROM input_rows i
CROSS JOIN qs
ON CONFLICT (question_set_id, section_code)
DO UPDATE SET
  section_number = EXCLUDED.section_number,
  section_letter = EXCLUDED.section_letter,
  section_title = EXCLUDED.section_title,
  source_page = EXCLUDED.source_page,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_by = auth.uid();

WITH qs AS (
  SELECT id AS question_set_id FROM public.risq_question_sets WHERE question_set_code = 'RISQ_3_2' LIMIT 1
),
input_rows AS (
  SELECT *
  FROM _risq_core_payload p
  CROSS JOIN LATERAL jsonb_to_recordset(p.payload->'header_fields') AS r(
    printed_field_no text,
    internal_field_no text,
    field_sort_key numeric,
    field_label text,
    field_type text,
    inspection_marker text,
    is_removed_field boolean,
    is_active boolean,
    source_page_start integer,
    source_page_end integer,
    raw_source_text text,
    remarks text
  )
)
INSERT INTO public.risq_inspection_header_fields (
  question_set_id,
  printed_field_no,
  internal_field_no,
  field_sort_key,
  field_label,
  field_type,
  inspection_marker,
  is_removed_field,
  is_active,
  source_page_start,
  source_page_end,
  raw_source_text,
  remarks,
  created_by,
  updated_by
)
SELECT
  qs.question_set_id,
  i.printed_field_no,
  i.internal_field_no,
  i.field_sort_key,
  i.field_label,
  i.field_type,
  i.inspection_marker,
  i.is_removed_field,
  i.is_active,
  i.source_page_start,
  i.source_page_end,
  i.raw_source_text,
  i.remarks,
  auth.uid(),
  auth.uid()
FROM input_rows i
CROSS JOIN qs
ON CONFLICT (question_set_id, internal_field_no)
DO UPDATE SET
  printed_field_no = EXCLUDED.printed_field_no,
  field_sort_key = EXCLUDED.field_sort_key,
  field_label = EXCLUDED.field_label,
  field_type = EXCLUDED.field_type,
  inspection_marker = EXCLUDED.inspection_marker,
  is_removed_field = EXCLUDED.is_removed_field,
  is_active = EXCLUDED.is_active,
  source_page_start = EXCLUDED.source_page_start,
  source_page_end = EXCLUDED.source_page_end,
  raw_source_text = EXCLUDED.raw_source_text,
  updated_by = auth.uid();

COMMIT;

SELECT
  'RISQ sections and header fields imported.' AS result,
  (SELECT COUNT(*) FROM public.risq_sections s JOIN public.risq_question_sets qs ON qs.id = s.question_set_id WHERE qs.question_set_code = 'RISQ_3_2') AS sections_count,
  (SELECT COUNT(*) FROM public.risq_inspection_header_fields h JOIN public.risq_question_sets qs ON qs.id = h.question_set_id WHERE qs.question_set_code = 'RISQ_3_2') AS header_fields_count;
`;
}

function sqlQuestionsChunk(rows, index, total) {
  const payload = asDollarJson({ questions: rows }, `RISQQ${index}`);
  const first = rows[0]?.internal_question_no || "";
  const last = rows[rows.length - 1]?.internal_question_no || "";

  return `-- ============================================================
-- RISQ-05F-Q${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}
-- Questions chunk ${index} of ${total}
-- Range: ${first} to ${last}
-- RISQ-only import. SIRE untouched.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _risq_questions_payload (
  payload jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _risq_questions_payload(payload)
VALUES (${payload});

WITH qs AS (
  SELECT id AS question_set_id FROM public.risq_question_sets WHERE question_set_code = 'RISQ_3_2' LIMIT 1
),
input_rows AS (
  SELECT *
  FROM _risq_questions_payload p
  CROSS JOIN LATERAL jsonb_to_recordset(p.payload->'questions') AS r(
    section_code text,
    section_number integer,
    section_letter text,
    section_title text,
    printed_question_no text,
    internal_question_no text,
    question_sort_key numeric,
    question_text text,
    guide_to_inspection text,
    answer_type text,
    answer_options jsonb,
    answer_options_inferred boolean,
    inspection_marker text,
    is_removed_question boolean,
    is_active boolean,
    guide_status text,
    source_page_start integer,
    source_page_end integer,
    raw_source_text text,
    metadata jsonb
  )
),
section_lookup AS (
  SELECT s.id AS section_id, s.question_set_id, s.section_code
  FROM public.risq_sections s
  JOIN qs ON qs.question_set_id = s.question_set_id
)
INSERT INTO public.risq_questions (
  question_set_id,
  section_id,
  section_code,
  section_number,
  section_letter,
  section_title,
  printed_question_no,
  internal_question_no,
  question_sort_key,
  question_text,
  guide_to_inspection,
  answer_type,
  answer_options,
  answer_options_inferred,
  inspection_marker,
  is_removed_question,
  is_active,
  guide_status,
  source_page_start,
  source_page_end,
  raw_source_text,
  source_hash,
  metadata,
  created_by,
  updated_by
)
SELECT
  qs.question_set_id,
  sl.section_id,
  i.section_code,
  i.section_number,
  i.section_letter,
  i.section_title,
  i.printed_question_no,
  i.internal_question_no,
  i.question_sort_key,
  i.question_text,
  i.guide_to_inspection,
  i.answer_type,
  i.answer_options,
  COALESCE(i.answer_options_inferred, false),
  COALESCE(i.inspection_marker, ''),
  COALESCE(i.is_removed_question, false),
  COALESCE(i.is_active, true),
  i.guide_status,
  i.source_page_start,
  i.source_page_end,
  i.raw_source_text,
  md5(COALESCE(i.question_text, '') || '|' || COALESCE(i.guide_to_inspection, '') || '|' || COALESCE(i.raw_source_text, '')),
  COALESCE(i.metadata, '{}'::jsonb),
  auth.uid(),
  auth.uid()
FROM input_rows i
CROSS JOIN qs
JOIN section_lookup sl
  ON sl.question_set_id = qs.question_set_id
 AND sl.section_code = i.section_code
ON CONFLICT (question_set_id, internal_question_no)
DO UPDATE SET
  section_id = EXCLUDED.section_id,
  section_code = EXCLUDED.section_code,
  section_number = EXCLUDED.section_number,
  section_letter = EXCLUDED.section_letter,
  section_title = EXCLUDED.section_title,
  printed_question_no = EXCLUDED.printed_question_no,
  question_sort_key = EXCLUDED.question_sort_key,
  question_text = EXCLUDED.question_text,
  guide_to_inspection = EXCLUDED.guide_to_inspection,
  answer_type = EXCLUDED.answer_type,
  answer_options = EXCLUDED.answer_options,
  answer_options_inferred = EXCLUDED.answer_options_inferred,
  inspection_marker = EXCLUDED.inspection_marker,
  is_removed_question = EXCLUDED.is_removed_question,
  is_active = EXCLUDED.is_active,
  guide_status = EXCLUDED.guide_status,
  source_page_start = EXCLUDED.source_page_start,
  source_page_end = EXCLUDED.source_page_end,
  raw_source_text = EXCLUDED.raw_source_text,
  source_hash = EXCLUDED.source_hash,
  metadata = EXCLUDED.metadata,
  updated_by = auth.uid();

COMMIT;

SELECT
  'RISQ question chunk ${index}/${total} imported.' AS result,
  '${first}' AS chunk_first_question,
  '${last}' AS chunk_last_question,
  (SELECT COUNT(*) FROM public.risq_questions q JOIN public.risq_question_sets qs ON qs.id = q.question_set_id WHERE qs.question_set_code = 'RISQ_3_2') AS total_questions_imported_so_far;
`;
}

function sqlMappings() {
  return `-- ============================================================
-- RISQ-05F-98
-- Create blank global eSMS mapping rows
-- Preserves existing mappings.
-- ============================================================

BEGIN;

WITH qs AS (
  SELECT id AS question_set_id
  FROM public.risq_question_sets
  WHERE question_set_code = 'RISQ_3_2'
  LIMIT 1
)
INSERT INTO public.risq_question_internal_mappings (
  question_id,
  company_id,
  esms_references,
  esms_forms,
  remarks,
  is_active,
  created_by,
  updated_by
)
SELECT
  q.id,
  NULL,
  '',
  '',
  '',
  true,
  auth.uid(),
  auth.uid()
FROM public.risq_questions q
JOIN qs
  ON qs.question_set_id = q.question_set_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.risq_question_internal_mappings m
  WHERE m.question_id = q.id
    AND m.company_id IS NULL
);

COMMIT;

SELECT
  'RISQ blank global eSMS mappings created/preserved.' AS result,
  COUNT(*) AS global_mapping_rows_count
FROM public.risq_question_internal_mappings m
JOIN public.risq_questions q ON q.id = m.question_id
JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
WHERE qs.question_set_code = 'RISQ_3_2'
  AND m.company_id IS NULL;
`;
}

function sqlVerify() {
  return `-- ============================================================
-- RISQ-05F-99
-- Final RISQ import verification
-- ============================================================

SELECT
  'RISQ-05F final verification.' AS result,
  (
    SELECT COUNT(*)
    FROM public.risq_sections s
    JOIN public.risq_question_sets qs ON qs.id = s.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
  ) AS sections_count,
  (
    SELECT COUNT(*)
    FROM public.risq_inspection_header_fields h
    JOIN public.risq_question_sets qs ON qs.id = h.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
  ) AS header_fields_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
  ) AS questions_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.is_removed_question = false
  ) AS active_questions_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.is_removed_question = true
  ) AS removed_questions_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.answer_options_inferred = true
  ) AS inferred_answer_options_count,
  (
    SELECT COUNT(*)
    FROM public.risq_questions q
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND q.guide_status = 'not_provided'
      AND q.is_removed_question = false
  ) AS active_questions_without_guide_count,
  (
    SELECT COUNT(*)
    FROM public.risq_question_internal_mappings m
    JOIN public.risq_questions q ON q.id = m.question_id
    JOIN public.risq_question_sets qs ON qs.id = q.question_set_id
    WHERE qs.question_set_code = 'RISQ_3_2'
      AND m.company_id IS NULL
  ) AS global_mapping_rows_count;
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith(".sql")) fs.unlinkSync(path.join(OUT_DIR, f));
}

const sections = sectionRows();
const headers = headerRows();
const questions = questionRows();
const questionChunks = chunkByJsonSize(questions);

const files = [];

files.push(writeSql("00_sections_and_header_fields.sql", sqlSectionsAndHeaders(sections, headers)));

questionChunks.forEach((chunk, idx) => {
  const n = idx + 1;
  files.push(writeSql(
    `q${String(n).padStart(2, "0")}_questions.sql`,
    sqlQuestionsChunk(chunk, n, questionChunks.length)
  ));
});

files.push(writeSql("98_global_mappings.sql", sqlMappings()));
files.push(writeSql("99_verify.sql", sqlVerify()));

const manifest = {
  generated_at: new Date().toISOString(),
  input: INPUT,
  output_dir: OUT_DIR,
  max_payload_chars: MAX_PAYLOAD_CHARS,
  sections: sections.length,
  header_fields: headers.length,
  questions: questions.length,
  active_questions: questions.filter(q => !q.is_removed_question).length,
  removed_questions: questions.filter(q => q.is_removed_question).length,
  question_chunks: questionChunks.length,
  files: files.map(f => path.basename(f))
};

fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log("RISQ chunked SQL import files generated.");
console.log(JSON.stringify(manifest, null, 2));
