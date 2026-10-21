import assert from "node:assert/strict";
import test from "node:test";
import { parseOperatorCommentSections } from "./operator_comments_parser.mjs";

const boundary = (line) =>
  /^(Human|Process|Hardware|Photo|Photograph)\b/i.test(
    typeof line === "string" ? line.trim() : String(line?.text || "").trim(),
  ) ||
  /^\d{1,2}(?:\.\d{1,2}){1,4}\b/.test(
    typeof line === "string" ? line.trim() : String(line?.text || "").trim(),
  ) ||
  /^Inspection Summary$/i.test(
    typeof line === "string" ? line.trim() : String(line?.text || "").trim(),
  );

test("parses the four multiline OCIMF response fields and optional byline", () => {
  const lines = [
    { text: "Operator Comments", page: 18 },
    { text: "14/10/2026 09:42:16 by Master Example", page: 18 },
    { text: "Immediate Cause", page: 18 },
    { text: "• First immediate-cause line", page: 18 },
    { text: "  continued on a second line", page: 18 },
    { text: "Root Cause:", page: 18 },
    { text: "Root cause text", page: 18 },
    { text: "Corrective Action", page: 19 },
    { text: "Corrective action text", page: 19 },
    { text: "Preventative Action", page: 19 },
    { text: "Preventative action text", page: 19 },
    { text: "Human: Largely as expected", page: 19 },
    { text: "This belongs to the next response block", page: 19 },
  ];

  const [entry] = parseOperatorCommentSections(lines, { isBoundary: boundary });
  assert.equal(entry.page, 18);
  assert.equal(entry.timestamp, "14/10/2026 09:42:16");
  assert.equal(entry.byline, "Master Example");
  assert.equal(entry.immediate_cause, "• First immediate-cause line\ncontinued on a second line");
  assert.equal(entry.root_cause, "Root cause text");
  assert.equal(entry.corrective_action, "Corrective action text");
  assert.equal(entry.preventative_action, "Preventative action text");
  assert.equal(entry.preventative_action.includes("next response"), false);
});

test("stops Preventative Action at the next question or report section boundary", () => {
  const lines = [
    "Operator Comments",
    "Immediate Cause",
    "cause",
    "Root Cause",
    "root",
    "Corrective Action",
    "correct",
    "Preventative Action",
    "preventative",
    "05.08.02 Pumps",
    "later question content",
  ];
  const [entry] = parseOperatorCommentSections(lines, { isBoundary: boundary });
  assert.equal(entry.preventative_action, "preventative");
});

test("captures separate timestamp/byline lines without storing metadata in responses", () => {
  const [entry] = parseOperatorCommentSections([
    "Operator Comments", "14/10/2026 09:42:16", "by Operator Example",
    "Immediate Cause: Example cause", "Root Cause", "Example root",
    "Corrective Action", "Example correction", "Preventative Action", "Example prevention",
    "Operator Attachments", "Do not include attachment details",
  ]);
  assert.equal(entry.timestamp, "14/10/2026 09:42:16");
  assert.equal(entry.byline, "Operator Example");
  assert.equal(entry.immediate_cause, "Example cause");
  assert.equal(entry.preventative_action, "Example prevention");
});
