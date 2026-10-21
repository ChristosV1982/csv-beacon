import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { parseOperatorCommentSections } from "../supabase/functions/import-post-inspection-pdf/operator_comments_parser.mjs";
import { contentFingerprint, prepareCommentRounds, classifyMatchedRounds, parseOcimfTimestamp } from "../public/post_inspection_comment_rounds.mjs";
import { sortCommentRounds } from "../public/post_inspection_comment_round_history.mjs";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const row = { id: "item-1", immediate_cause: null, root_cause: null, corrective_action: null, preventative_action: null };
const section = (day, text = "Original") => [
  "Operator Comments", `${day}/10/2026 09:42:16 by Operator Example`,
  "Immediate Cause", `${text} cause`, "Root Cause", `${text} root`,
  "Corrective Action", `${text} correction`, "Preventative Action", `${text} prevention`,
];
const fromPdf = (lines) => parseOperatorCommentSections(lines).map((r, n) => ({
  ...r, comment_timestamp: r.timestamp, comment_byline: r.byline, comment_source_order: n,
}));
async function classify(entries, current = row, history = [], status = "matched") {
  const prepared = await prepareCommentRounds(entries, [current], history);
  return classifyMatchedRounds(prepared.entries.map((entry) => ({
    entry, row: status === "matched" ? current : null, matchStatus: status,
  })), prepared);
}
const receipt = async (entry, kind = "initial") => ({
  ...entry, id: "receipt-1", observation_item_id: row.id, round_kind: kind,
  ocimf_author_raw: entry.comment_byline, ocimf_timestamp_raw: entry.comment_timestamp,
  content_fingerprint: await contentFingerprint(entry),
});

test("one initial block fills blank main responses once", async () => {
  const entries = fromPdf(section("01"));
  const [result] = await classify(entries);
  assert.equal(result.classification, "Initial response");
  assert.equal(result.action, "initial");
});
test("initial plus later section creates main response and a separate subsequent round", async () => {
  const entries = fromPdf([...section("01"), ...section("05", "Follow-up")]);
  const result = await classify(entries);
  assert.deepEqual(result.map((r) => r.classification), ["Initial response", "New subsequent comment"]);
  assert.deepEqual(result.map((r) => r.action), ["initial", "subsequent"]);
  assert.equal(entries[0].preventative_action, "Original prevention");
});
test("three cumulative rounds retain separate values, chronology and PDF order", async () => {
  const entries = fromPdf([...section("01"), ...section("05", "Second"), ...section("10", "Third")]);
  const result = await classify(entries);
  assert.equal(entries.length, 3);
  assert.deepEqual(result.map((r) => r.action), ["initial", "subsequent", "subsequent"]);
  assert.equal(entries[1].preventative_action, "Second prevention");
  assert.equal(entries[2].comment_timestamp, "10/10/2026 09:42:16");
  const reverse = await classify([...entries].reverse());
  assert.equal(reverse.find((r) => r.action === "initial").entry.immediate_cause, "Original cause");
});
test("new timestamp/byline without repeated Operator Comments marker starts another round", () => {
  const entries = fromPdf([...section("01"),
    "05/10/2026 09:42:16", "by Other Operator",
    "Immediate Cause", "Second cause", "Root Cause", "Second root",
    "Corrective Action", "Second correction", "Preventative Action", "Second prevention"]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].preventative_action, "Original prevention");
  assert.equal(entries[1].comment_timestamp, "05/10/2026 09:42:16");
  assert.equal(entries[1].comment_byline, "Other Operator");
});
test("exact cumulative re-import skips all previously imported content", async () => {
  const entries = fromPdf([...section("01"), ...section("05", "Second"), ...section("10", "Third")]);
  const saved = { ...row, ...entries[0] };
  const history = await Promise.all(entries.map((e, n) => receipt(e, n ? "subsequent" : "initial")));
  const result = await classify(entries, saved, history);
  assert.deepEqual(result.map((r) => r.classification), Array(3).fill("Already imported"));
  assert.equal(result.some((r) => r.action), false);
});
test("same author/timestamp with changed content is an explicit revision, never a main overwrite", async () => {
  const [initial] = fromPdf(section("01"));
  const [changed] = fromPdf(section("01", "Changed"));
  const [result] = await classify([changed], { ...row, ...initial }, [await receipt(initial)]);
  assert.equal(result.classification, "Possible revision");
  assert.equal(result.revision, true);
  assert.equal(result.action, "subsequent");
  assert.equal(result.supersedes_id, "receipt-1");
});
test("multiple same-observation new blocks with equal metadata flag later one as revision", async () => {
  const entries = fromPdf([...section("01"), ...section("01", "Changed")]);
  const result = await classify(entries);
  assert.equal(result[1].classification, "Possible revision");
});
test("ambiguous finding match does not generate a write", async () => {
  const [result] = await classify(fromPdf(section("01")), row, [], "ambiguous");
  assert.equal(result.classification, "Ambiguous");
  assert.equal(result.action, null);
});
test("existing main responses are preserved; matching PDF records provenance only", async () => {
  const [initial] = fromPdf(section("01"));
  const saved = { ...row, ...initial };
  const result = await classify([initial, ...fromPdf(section("05", "Later"))], saved);
  assert.equal(result[0].classification, "Already imported");
  assert.equal(result[0].action, "initial_receipt");
  assert.equal(result[1].action, "subsequent");
});
test("content deduplication is independent of whitespace and PDF metadata", async () => {
  assert.equal(await contentFingerprint({ immediate_cause: "One \n TWO" }),
    await contentFingerprint({ immediate_cause: " one two ", comment_timestamp: "changed" }));
  assert.notEqual(await contentFingerprint({ immediate_cause: "a", root_cause: "b" }),
    await contentFingerprint({ immediate_cause: "ab" }));
});
test("timestamp parsing rejects invalid dates and does not invent timezone", () => {
  assert.equal(parseOcimfTimestamp("31/02/2026 12:00:00"), null);
  assert.equal(parseOcimfTimestamp("01/10/2026 25:00:00"), null);
  assert.equal(parseOcimfTimestamp("01/10/2026 09:42:16"), "2026-10-01T09:42:16");
  assert.equal(parseOcimfTimestamp("1 October 2026 09:42"), null);
});
test("history uses OCIMF chronology when reliable, import/source order otherwise", () => {
  const a = { id: "a", ocimf_timestamp: "2026-10-01T09:00:00", imported_at: "2026-10-21T09:00:00Z", source_order: 0 };
  const b = { id: "b", ocimf_timestamp: "2026-10-02T09:00:00", imported_at: "2026-10-20T09:00:00Z", source_order: 1 };
  assert.deepEqual(sortCommentRounds([b, a]).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(sortCommentRounds([{ ...a, ocimf_timestamp: null }, b]).map((r) => r.id), ["b", "a"]);
});
