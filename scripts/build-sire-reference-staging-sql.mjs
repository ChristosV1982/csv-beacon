// scripts/build-sire-reference-staging-sql.mjs
// C.S.V. BEACON — Build SQL to stage SIRE Applicable Publications / Industry Guidance preview rows.
// Output SQL inserts into sire_reference_extraction_staging only.
// Does not connect to Supabase. Does not import into final reference tables.

import fs from "node:fs";
import path from "node:path";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function sqlText(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sqlInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.trunc(n)) : "NULL";
}

function sqlNumeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(4) : "NULL";
}

function normalizeRows(rows) {
  return rows
    .filter((r) => r && r.question_number && r.reference_type)
    .map((r, idx) => ({
      row_no: idx + 1,
      question_number: String(r.question_number || "").trim(),
      normalized_question_number: String(r.normalized_question_number || "").trim(),
      reference_type: String(r.reference_type || "").trim(),
      sort_order: Number(r.sort_order || 1),
      extracted_title: String(r.extracted_title || "").trim(),
      extracted_section: String(r.extracted_section || "").trim(),
      extracted_subsection: String(r.extracted_subsection || "").trim(),
      extracted_content: String(r.extracted_content || "").trim(),
      raw_text: String(r.raw_text || "").trim(),
      normalized_key: String(r.normalized_key || "").trim(),
      source_page_start: r.source_page_start || null,
      source_page_end: r.source_page_end || null,
      confidence_score: r.confidence_score || "0.8500",
      extraction_notes: String(r.extraction_notes || "Preview extraction. Manual review required before final import.").trim()
    }));
}

function main() {
  const input = arg("input", "");
  const out = arg("out", "");
  const batchId = arg("batch-id", "");
  const sourceDocument = arg(
    "source-document",
    "SIRE 2.0 Question Library - Part 1+2 - Chapters 1 to 12 - Version 1.0_COMPLETE.pdf"
  );

  if (!input) throw new Error("Missing --input path.");
  if (!out) throw new Error("Missing --out path.");
  if (!batchId) throw new Error("Missing --batch-id UUID.");
  if (!fs.existsSync(input)) throw new Error(`Input JSON not found: ${input}`);

  const rows = normalizeRows(JSON.parse(fs.readFileSync(input, "utf8")));

  if (!rows.length) throw new Error("No rows found in input JSON.");

  const values = rows.map((r) => `(
    ${sqlInt(r.row_no)},
    ${sqlText(r.question_number)},
    ${sqlText(r.normalized_question_number)},
    ${sqlText(r.reference_type)},
    ${sqlInt(r.sort_order)},
    ${sqlText(r.extracted_title)},
    ${sqlText(r.extracted_section)},
    ${sqlText(r.extracted_subsection)},
    ${sqlText(r.extracted_content)},
    ${sqlText(r.raw_text)},
    ${sqlText(r.normalized_key)},
    ${sqlText(sourceDocument)},
    ${sqlInt(r.source_page_start)},
    ${sqlInt(r.source_page_end)},
    ${sqlText(`preview row ${r.row_no} / ${r.reference_type} / ${r.question_number}`)},
    ${sqlNumeric(r.confidence_score)},
    ${sqlText(r.extraction_notes)}
  )`).join(",\n");

  const sql = `/* ============================================================
   C.S.V. BEACON / SIRE 2.0 QUESTIONS EDITOR
   GENERATED STAGING SQL

   Purpose:
   - Insert reviewed preview rows into sire_reference_extraction_staging only.
   - Exact question matching is performed through csvb_sire_match_question_number().
   - Rows are marked needs_review.
   - Final tables are NOT touched.

   Safety:
   - INSERT only into public.sire_reference_extraction_staging.
   - No UPDATE to questions_master.
   - No UPDATE to pgno_master.
   - No UPDATE to expected_evidence_master.
   - No INSERT into final reference tables.
   - No RISQ / PLA / MAI changes.

   Generated from:
   ${input}
============================================================ */

WITH preview_rows AS (
  SELECT *
  FROM (
    VALUES
${values}
  ) AS v(
    row_no,
    extracted_question_number,
    normalized_question_number_from_preview,
    reference_type,
    sort_order,
    extracted_title,
    extracted_section,
    extracted_subsection,
    extracted_content,
    raw_text,
    normalized_key,
    source_document,
    source_page_start,
    source_page_end,
    source_locator,
    confidence_score,
    extraction_notes
  )
),

matched_rows AS (
  SELECT
    pr.*,
    m.question_id AS matched_question_id,
    m.normalized_question_number AS matched_question_number,
    m.match_status,
    m.match_count
  FROM preview_rows pr
  LEFT JOIN LATERAL public.csvb_sire_match_question_number(pr.extracted_question_number) m
    ON true
),

inserted AS (
  INSERT INTO public.sire_reference_extraction_staging (
    import_batch_id,
    extracted_question_number,
    matched_question_id,
    question_number_snapshot,
    match_status,
    review_status,
    reference_type,
    sort_order,
    extracted_title,
    extracted_section,
    extracted_subsection,
    extracted_content,
    raw_text,
    normalized_key,
    source_document,
    source_page_start,
    source_page_end,
    source_locator,
    confidence_score,
    extraction_notes
  )
  SELECT
    ${sqlText(batchId)}::uuid AS import_batch_id,
    mr.extracted_question_number,
    mr.matched_question_id,
    mr.matched_question_number,
    mr.match_status,
    'needs_review' AS review_status,
    mr.reference_type,
    mr.sort_order,
    mr.extracted_title,
    NULLIF(mr.extracted_section, ''),
    NULLIF(mr.extracted_subsection, ''),
    COALESCE(mr.extracted_content, ''),
    COALESCE(NULLIF(mr.raw_text, ''), NULLIF(mr.extracted_content, ''), mr.extracted_title, ''),
    NULLIF(mr.normalized_key, ''),
    mr.source_document,
    mr.source_page_start,
    mr.source_page_end,
    mr.source_locator,
    mr.confidence_score,
    mr.extraction_notes
  FROM matched_rows mr
  WHERE mr.match_status = 'matched'
    AND mr.match_count = 1
    AND mr.matched_question_id IS NOT NULL
    AND mr.reference_type IN ('applicable_publication', 'industry_guidance')
    AND (
      length(trim(coalesce(mr.extracted_title, ''))) > 0
      OR length(trim(coalesce(mr.extracted_content, ''))) > 0
      OR length(trim(coalesce(mr.raw_text, ''))) > 0
    )
  ON CONFLICT DO NOTHING
  RETURNING
    id,
    extracted_question_number,
    question_number_snapshot,
    reference_type,
    sort_order
)

SELECT
  '01_PREVIEW_ROWS_TOTAL' AS section,
  count(*)::text AS detail_1,
  NULL::text AS detail_2,
  NULL::text AS detail_3
FROM preview_rows

UNION ALL

SELECT
  '02_MATCHED_ROWS' AS section,
  count(*)::text AS detail_1,
  count(*) FILTER (WHERE reference_type = 'applicable_publication')::text AS detail_2,
  count(*) FILTER (WHERE reference_type = 'industry_guidance')::text AS detail_3
FROM matched_rows
WHERE match_status = 'matched'
  AND match_count = 1
  AND matched_question_id IS NOT NULL

UNION ALL

SELECT
  '03_NOT_MATCHED_OR_AMBIGUOUS_ROWS' AS section,
  count(*)::text AS detail_1,
  string_agg(DISTINCT extracted_question_number, ', ' ORDER BY extracted_question_number)::text AS detail_2,
  NULL::text AS detail_3
FROM matched_rows
WHERE match_status <> 'matched'
   OR match_count <> 1
   OR matched_question_id IS NULL

UNION ALL

SELECT
  '04_INSERTED_STAGING_ROWS' AS section,
  count(*)::text AS detail_1,
  count(*) FILTER (WHERE reference_type = 'applicable_publication')::text AS detail_2,
  count(*) FILTER (WHERE reference_type = 'industry_guidance')::text AS detail_3
FROM inserted

UNION ALL

SELECT
  '05_INSERTED_QUESTIONS' AS section,
  count(DISTINCT question_number_snapshot)::text AS detail_1,
  string_agg(DISTINCT question_number_snapshot, ', ' ORDER BY question_number_snapshot)::text AS detail_2,
  NULL::text AS detail_3
FROM inserted;
`;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, sql, "utf8");

  console.log(`Input rows: ${rows.length}`);
  console.log(`Generated SQL: ${out}`);
}

main();
