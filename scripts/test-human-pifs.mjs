import test from "node:test";
import assert from "node:assert/strict";
import { loadHumanPifParser } from "./human-pif-parser-harness.mjs";
import { humanPifsFromItem, renderHumanPifList } from "../public/csvb-human-pifs.mjs";
import { planHumanPifRepairs, applyHumanPifRepairs } from "../public/post_inspection_human_pif_repair.mjs";

const parser = loadHumanPifParser();
const pif1 = "1. Recognition of Safety criticality of the task or associated steps";
const pif2 = "2. Custom and practice surrounding use of procedures";
const pif9 = "9. Opportunity to learn or practice";
function block(lines, extra = {}) {
  return {
    designation: "Human", response_type: "negative", rank: "Senior Deck Officer",
    nature_of_concern: "Not as expected.", question_base: "5.6.1",
    lines: ["Human Senior Deck Officer: Not as expected.", ...lines].map((text) => ({ text })),
    ...extra,
  };
}
test("multiple PIFs stay in order on one finding and duplicates are removed", () => {
  const result = parser.parseResponseBlock(block(["Finding text.", pif1, pif2, pif1]));
  assert.equal(result.classification_coding, `${pif1} | ${pif2}`);
  assert.equal(result.observation_text, "Finding text.");
  assert.equal(result.nature_of_concern, "Not as expected.");
});
test("wrapped PIFs retain complete text without consuming following finding prose", () => {
  const result = parser.parseResponseBlock(block([
    "1. Recognition of Safety criticality of the", "task or associated steps",
    pif9, "Supporting observation text remains intact.",
  ]));
  assert.equal(result.classification_coding, `${pif1} | ${pif9}`);
  assert.equal(result.observation_text, "Supporting observation text remains intact.");
});
test("positive and largely Human findings also retain multiple PIFs", () => {
  for (const response_type of ["positive", "largely"]) {
    const result = parser.parseResponseBlock(block(["Finding.", pif1, pif2], { response_type }));
    assert.equal(result.classification_coding, `${pif1} | ${pif2}`);
    assert.equal(result.obs_type, response_type);
  }
});
test("unknown wrapped PIF fragments are retained without swallowing a new observation sentence", () => {
  const result = parser.parseResponseBlock(block([
    "Finding.", "11. Future influencing factor with", "a wrapped continuation",
    "The supporting observation remains separate.",
  ]));
  assert.equal(result.classification_coding, "11. Future influencing factor with a wrapped continuation");
  assert.equal(result.observation_text, "Finding. The supporting observation remains separate.");
});
test("Human PIF collection stops before Operator Comments", () => {
  const result = parser.parseResponseBlock(block(["Finding.", pif1, "Operator Comments", "Immediate Cause", pif9]));
  assert.equal(result.classification_coding, pif1);
  assert.equal(result.observation_text, "Finding.");
});
test("chapter, question and subsequent designation boundaries cannot become PIFs", () => {
  for (const boundary of ["7. Maritime Security", "6.2.1. Next question?", "Human Rating: Not as expected.", "Process As expected."]) {
    const result = parser.parseResponseBlock(block(["Finding.", pif1, boundary, pif9]));
    assert.equal(result.classification_coding, pif1, boundary);
    assert.equal(result.observation_text, "Finding.");
  }
});
test("separate Human blocks across a page break remain distinct observations", () => {
  const result = parser.extractFindingsFromPages([
    `5.9.1. Were lifting procedures understood?\nHuman Senior Deck Officer: Not as expected.\nFirst finding.\n${pif1}`,
    `${pif9}\nHuman Senior Engineer Officer: Not as expected.\nSecond finding.\n${pif1}\n${pif9}\n6.2.1. Were bilge procedures understood?\nHuman Senior Deck Officer: Not as expected.\nThird finding.\n${pif1}\n${pif9}`,
  ]);
  assert.equal(result.observations.length, 3);
  assert.equal(result.observations[0].classification_coding, `${pif1} | ${pif9}`);
  assert.equal(result.observations[1].classification_coding, `${pif1} | ${pif9}`);
  assert.equal(result.observations[2].question_base, "6.2.1");
});
test("unknown raw PIFs remain visible and escaped; response phrases are excluded", () => {
  const row = { classification_coding: `${pif1} | 11. Future <PIF>`, nature_of_concern: "Not as expected." };
  assert.deepEqual(humanPifsFromItem(row), [pif1, "11. Future <PIF>"]);
  assert.match(renderHumanPifList(row), /Future &lt;PIF&gt;/);
  assert.doesNotMatch(renderHumanPifList(row), /Not as expected/);
});
const extracted = { ...parser.parseResponseBlock(block(["Finding text.", pif1, pif2])), page_hint: 22 };
const stored = {
  ...extracted, id: "item-1", report_id: "report-1", question_no: "05.06.01",
  obs_type: "negative", observation_type: "negative_observation",
  classification_coding: pif1, updated_at: "2026-10-26T00:00:00Z",
};
test("repair matches canonical question/type/rank/text and retains unknown manual values", () => {
  const [plan] = planHumanPifRepairs([extracted], [{ ...stored, classification_coding: `${pif1} | 11. Manual PIF` }]);
  assert.equal(plan.status, "Ready");
  assert.deepEqual(plan.proposed, [pif1, pif2, "11. Manual PIF"]);
});
test("repair skips ambiguous, changed text, wrong rank/type and repeated source matches", () => {
  assert.equal(planHumanPifRepairs([extracted], [stored, { ...stored, id: "item-2" }])[0].status, "Ambiguous");
  for (const patch of [
    { observation_text: "Different finding." }, { source_excerpt: "Human Rating: Not as expected." },
    { obs_type: "positive", observation_type: "positive_observation" },
  ]) assert.equal(planHumanPifRepairs([extracted], [{ ...stored, ...patch }])[0].status, "Unmatched");
  assert.match(planHumanPifRepairs([extracted, extracted], [stored])[0].status, /^Ambiguous/);
});
test("repair writes only classification and scopes report/item/current value; no risk RPC", async () => {
  const calls = [];
  const query = {
    update(payload) { calls.push(["update", payload]); return this; },
    eq(...args) { calls.push(["eq", ...args]); return this; },
    select() { return Promise.resolve({ data: [{ id: stored.id }], error: null }); },
  };
  const result = await applyHumanPifRepairs({ from: (table) => {
    assert.equal(table, "post_inspection_observation_items"); return query;
  } }, "report-1", planHumanPifRepairs([extracted], [stored]));
  assert.equal(result.applied, 1);
  assert.deepEqual(calls.find(([type]) => type === "update")[1], { classification_coding: `${pif1} | ${pif2}` });
  assert.ok(calls.some((args) => args[1] === "report_id" && args[2] === "report-1"));
  assert.ok(calls.some((args) => args[1] === "updated_at"));
});
