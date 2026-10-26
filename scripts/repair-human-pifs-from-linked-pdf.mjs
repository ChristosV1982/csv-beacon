// Administrative, explicitly scoped repair. Default is a read-only review.
// Usage: node scripts/repair-human-pifs-from-linked-pdf.mjs [--apply-reviewed]
// Uses the local Edge parser verbatim; never uploads/replaces a PDF or refreshes risk.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { loadHumanPifParser } from "./human-pif-parser-harness.mjs";
import { planHumanPifRepairs, applyHumanPifRepairs } from "../public/post_inspection_human_pif_repair.mjs";

const reportId = "96395949-e5ca-4eae-97c8-1656f1f2503b";
const sb = createClient("https://bdidrcyufazskpuwmfca.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } });
async function read(table, columns = "*") {
  const { data, error } = await sb.from(table).select(columns).eq("report_id", reportId).order("id");
  if (error) throw error;
  return data;
}
const { data: report, error } = await sb.from("post_inspection_reports").select("*").eq("id", reportId).single();
if (error) throw error;
assert.equal(report.report_ref, "LRHL-5256-7865-7911");
assert.ok(report.pdf_storage_path);
const { data: pdf, error: pdfError } = await sb.storage.from("inspection-reports").download(report.pdf_storage_path);
if (pdfError) throw pdfError;
const parser = loadHumanPifParser(pdfjsLib);
const { pages } = await parser.extractPdfTextData(new Uint8Array(await pdf.arrayBuffer()));
const { observations } = parser.extractFindingsFromPages(pages);
const before = await read("post_inspection_observation_items");
const plans = planHumanPifRepairs(observations, before);
console.log(JSON.stringify(plans.map(({ entry, row, current, proposed, status }) => ({
  question: entry.question_base, type: entry.obs_type, context: entry.source_excerpt,
  id: row?.id, current, proposed, status,
})), null, 2));

for (const [qno, role, type, codes] of [
  ["5.6.1", "Senior Deck Officer", "negative", [1, 2]],
  ["5.9.1", "Senior Deck Officer", "negative", [1, 9]],
  ["5.9.1", "Senior Engineer Officer", "negative", [1, 9]],
  ["6.2.1", "Senior Deck Officer", "negative", [1, 9]],
  ["10.2.1", "Senior Engineer Officer", "negative", [1, 2]],
  ["10.2.1", "Junior Deck Officer", "positive", [1, 2]],
]) {
  const matching = plans.filter(({ entry }) => entry.question_base === qno &&
    entry.obs_type === type && entry.source_excerpt.includes(`Human ${role}:`));
  assert.equal(matching.length, 1, `Unique PDF finding: ${qno} ${role} ${type}`);
  const plan = matching[0];
  assert.ok(plan.row, `Unique existing finding: ${qno} ${role}`);
  assert.deepEqual(plan.proposed.map((pif) => Number(pif.match(/^\d+/)?.[0])), codes);
}
assert.equal(observations.filter((row) => row.designation === "Human").length,
  before.filter((row) => row.designation === "Human").length, "Human finding count unchanged");
console.log("All six requested source-PDF cases passed; stored Human findings:", plans.length);
if (!process.argv.includes("--apply-reviewed")) {
  console.log("READ-ONLY REVIEW: no database writes performed.");
} else {
  const riskBefore = await read("risk_observation_scores");
  const inspectionRiskBefore = await read("risk_inspection_scores");
  const selected = plans.filter((plan) => plan.status === "Ready");
  const result = await applyHumanPifRepairs(sb, reportId, selected);
  console.log("Repair result:", JSON.stringify(result));
  assert.equal(result.failed, 0);
  const after = await read("post_inspection_observation_items");
  assert.equal(after.length, before.length);
  const stripPifUpdate = ({ classification_coding, updated_at, ...rest }) => rest;
  assert.deepEqual(after.map(stripPifUpdate), before.map(stripPifUpdate),
    "All observation fields except PIF classification/update timestamp preserved");
  const { data: reportAfter, error: reportError } = await sb.from("post_inspection_reports").select("*").eq("id", reportId).single();
  if (reportError) throw reportError;
  assert.deepEqual(reportAfter, report, "Report header and linked PDF unchanged");
  assert.deepEqual(await read("risk_observation_scores"), riskBefore, "Observation risk snapshots unchanged");
  assert.deepEqual(await read("risk_inspection_scores"), inspectionRiskBefore, "Report risk snapshots unchanged");
  console.log("VERIFIED: row IDs/counts, finding fields, report header/PDF and risk snapshots preserved.");
}
