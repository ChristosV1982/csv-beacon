import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { matchOperatorCommentToRows } from "../public/post_inspection_operator_comments.mjs";
import { parseOperatorCommentSections } from "../supabase/functions/import-post-inspection-pdf/operator_comments_parser.mjs";

const row = (id, soc, noc, finding) => ({
  id, question_no: "05.08.01", designation: "Hardware",
  obs_type: "negative", observation_type: "negative_observation",
  classification_coding: soc, nature_of_concern: noc,
  observation_text: finding, source_excerpt: "Hardware negative",
});
const entry = {
  question_base: "5.8.1", designation: "Hardware",
  parser_identity_status: "unique_finding_identity",
  classification_coding: "Electric Cable Installation",
  nature_of_concern: "Maintenance task available – records incompatible with condition seen",
  observation_text: "It was observed that one earth cable was parted off.",
  source_excerpt: "Hardware negative",
};
const correct = row("cable", entry.classification_coding, entry.nature_of_concern, entry.observation_text);
const other = row("lighting", "Lighting - Deck", "Sudden failure", "Two deck lights were not functioning.");

test("canonical question and finding identity separate same-question Hardware findings", () => {
  const result = matchOperatorCommentToRows(entry, [other, correct]);
  assert.equal(result.status, "matched");
  assert.equal(result.row.id, "cable");
});

test("duplicate identities remain ambiguous rather than choosing the first row", () => {
  const result = matchOperatorCommentToRows(entry, [correct, { ...correct, id: "duplicate" }]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.row, null);
});

test("question and designation alone never match conflicting finding text", () => {
  const result = matchOperatorCommentToRows(entry, [{ ...correct, observation_text: "A different finding." }]);
  assert.equal(result.status, "unmatched");
});

test("positive and parser-unresolved findings cannot be automatically selected", () => {
  assert.equal(matchOperatorCommentToRows(entry, [{ ...correct, obs_type: "positive" }]).status, "unmatched");
  assert.equal(matchOperatorCommentToRows({ ...entry, parser_identity_status: "missing_finding_identity" }, [correct]).status, "unmatched");
});

test("full response-block parser preserves two Hardware comment owners across a page break", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/import-post-inspection-pdf/index.ts", import.meta.url), "utf8",
  ).split("Deno.serve(")[0]
    .replace(/^import .*$/gm, "").replace(/^export const /gm, "const ");
  const context = { parseOperatorCommentSections };
  vm.runInNewContext(source +
    "\nthis.parsers={extractOperatorCommentsFromPages,extractFindingsFromPages};", context);
  const firstNoc = "Sudden failure – maintenance tasks available and up to date";
  const secondNoc = entry.nature_of_concern;
  const pages = [
    `5.8.1. Were electrical systems maintained?
Hardware Observable or detectable deficiency.
Lighting - Deck: ${firstNoc}
It was observed that two deck lights were not functioning.
Operator Comments
14/10/2026 09:42:16 by Operator Example
Immediate Cause
Lighting cause
Root Cause
Lighting root
Corrective Action
Lighting correction
Preventative Action
Lighting prevention`,
    `continued across the page
Electric Cable Installation: ${secondNoc}
${entry.observation_text}
Operator Comments
Immediate Cause
Cable cause
Root Cause
Cable root
Corrective Action
Cable correction
Preventative Action
Cable prevention
Human Largely as expected.
1. Example human factor
Separate human finding.`,
  ];
  const taxonomy = { Hardware: [firstNoc, secondNoc], Process: [] };
  const comments = context.parsers.extractOperatorCommentsFromPages(pages, taxonomy);
  assert.equal(comments.length, 2);
  assert.equal(comments[0].classification_coding, "Lighting - Deck");
  assert.equal(comments[0].preventative_action, "Lighting prevention\ncontinued across the page");
  assert.equal(comments[1].classification_coding, "Electric Cable Installation");
  assert.equal(comments[1].immediate_cause, "Cable cause");
  assert.equal(comments[1].preventative_action, "Cable prevention");
  assert.equal(comments[1].response_type, "negative");
  assert.equal(comments[1].observation_text, entry.observation_text);
  const initialPages = [
    `5.8.1. Were electrical systems maintained?
Hardware Observable or detectable deficiency.
Lighting - Deck: ${firstNoc}
It was observed that two deck lights were not functioning.
Electric Cable Installation: ${secondNoc}
${entry.observation_text}
Human Largely as expected.
1. Example human factor
Separate human finding.`,
  ];
  const findings = context.parsers.extractFindingsFromPages(initialPages, taxonomy).observations;
  assert.equal(findings.filter((item) => item.designation === "Hardware").length, 2);
  assert.equal(findings.some((item) => String(item.observation_text).includes("Operator Comments")), false);
});

test("full comments extractor keeps cumulative rounds on one finding, including across pages", () => {
  const source = fs.readFileSync(
    new URL("../supabase/functions/import-post-inspection-pdf/index.ts", import.meta.url), "utf8",
  ).split("Deno.serve(")[0]
    .replace(/^import .*$/gm, "").replace(/^export const /gm, "const ");
  const context = { parseOperatorCommentSections };
  vm.runInNewContext(source + "\nthis.extract=extractOperatorCommentsFromPages;", context);
  const noc = "Sudden failure – maintenance tasks available and up to date";
  const comments = (day, text, marker = true) => `${marker ? "Operator Comments\n" : ""}${day}/10/2026 09:42:16 by Operator Example
Immediate Cause
${text} cause
Root Cause
${text} root
Corrective Action
${text} correction
Preventative Action
${text} prevention`;
  const pages = [
    `5.8.1. Were electrical systems maintained?
Hardware Observable or detectable deficiency.
Lighting - Deck: ${noc}
It was observed that two deck lights were not functioning.
${comments("01", "Original")}`,
    `${comments("05", "Second")}
${comments("10", "Third", false)}
Human Largely as expected.
1. Example human factor
Separate human finding.`,
  ];
  const result = context.extract(pages, { Hardware: [noc], Process: [] });
  assert.equal(result.length, 3);
  assert.deepEqual(Array.from(result, (r) => r.classification_coding), Array(3).fill("Lighting - Deck"));
  assert.deepEqual(Array.from(result, (r) => r.preventative_action),
    ["Original prevention", "Second prevention", "Third prevention"]);
  assert.deepEqual(Array.from(result, (r) => r.comment_source_order), [0, 1, 2]);
  assert.equal(result[1].comments_page_hint, 2);
  assert.equal(result[2].comment_timestamp, "10/10/2026 09:42:16");
  assert.equal(result[2].observation_text, result[0].observation_text);
});
