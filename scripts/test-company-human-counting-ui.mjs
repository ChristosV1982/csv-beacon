import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {markHumanPolicyStaleness} from "../public/csvb-human-policy-staleness.mjs";
const context = vm.createContext({window: {}, console});
vm.runInContext(fs.readFileSync("public/csvb-observation-counts.js", "utf8"), context);
const counts = context.window.CSVB_OBSERVATION_COUNTS;
const rows = [
  {id:"human-negative",observation_type:"negative",effective_observation_count:2},
  {id:"hardware-negative",observation_type:"negative",effective_observation_count:1},
  {id:"human-positive",observation_type:"positive",effective_observation_count:2},
  {id:"human-largely",observation_type:"largely",effective_observation_count:2},
];
test("effective counts never duplicate finding rows; third-party prose stays weight one", () => {
  assert.equal(counts.sum(rows), 7);
  assert.equal(rows.length, 4);
  assert.equal(counts.weight({source_kind:"third_party",soc:"PIF 1 | PIF 2"}),1);
  assert.equal(counts.unique([rows[0], rows[0], rows[1]], row=>row.id),3);
});
test("server metadata loads once, paginates, preserves audit rows and decorates by physical ID", async () => {
  let calls = 0;
  const sb = {rpc(name,args) {
    assert.equal(name,"csvb_human_counting_items_for_me");
    assert.equal(args.p_report_ids,null);
    calls++;
    return {range: async () => ({data:[{
      observation_item_id:"item",effective_observation_count:2,
      human_pif_count:2,retained_pifs:["1. A","2. B"],policy_revision:1,
    }],error:null})};
  }};
  await counts.load(sb);
  await counts.load(sb);
  assert.equal(calls,1);
  assert.equal(counts.attach({source_observation_item_id:"item",source_family:"vetting"}).effective_observation_count,2);
  assert.equal(counts.weight(counts.attach({source_observation_id:"item",record_source:"audit_internal_master"})),1);
  assert.equal(counts.keyTotal(new Set(["vetting:item","vetting:other"])),3);
});
test("Stats type/group/month aggregates use effective counts, not entity counts", () => {
  const source = fs.readFileSync("public/post_inspection_stats.js","utf8");
  const fragment = source.slice(source.indexOf("function typeCountsFromRows("),
    source.indexOf("function buttonHtml("));
  // Only evaluate the two pure aggregate functions, ending before unrelated DOM helpers.
  const groupEnd = fragment.indexOf("\nfunction ", fragment.indexOf("function groupTypeSplitRows(")+10);
  const pure = groupEnd<0 ? fragment : fragment.slice(0,groupEnd);
  vm.runInContext(pure,context);
  context.observationWeight = counts.weight;
  context.normalizeType = value=>value;
  context.reportKey = row=>row.id.startsWith("human")?"report-a":"report-b";
  context.avg = (a,b)=>b?a/b:0;
  context.rows = rows;
  const result = vm.runInContext("typeCountsFromRows(rows)",context);
  assert.equal(result.negative,3); assert.equal(result.positive,2);
  assert.equal(result.largely,2); assert.equal(result.total,7);
  const grouped = vm.runInContext("groupTypeSplitRows(rows, ()=>'one')",context);
  assert.equal(grouped[0].inspections,2);
  assert.equal(grouped[0].total,7);
});
test("M-SCAT unique observation measures do not weight assignment/source/entity counts", () => {
  const records = [{source_family:"vetting",source_observation_item_id:"item"},
    {source_family:"vetting",source_observation_item_id:"item"}];
  assert.equal(records.length,2); // two selections, unchanged
  assert.equal(counts.keyTotal(new Set(records.map(row=>`${row.source_family}:${row.source_observation_item_id}`))),2);
});
test("risk UI uses recorded policy staleness and per-PIF factors without recalculating snapshots", async () => {
  const sb = {rpc: async (name,args) => {
    if(name==="csvb_human_policy_snapshot_status_for_me")
      return {data:[{report_id:"report",risk_snapshot_id:"snapshot",profile_version_id:"version",is_stale:true}],error:null};
    assert.equal(name,"csvb_human_pif_risk_factors_for_report");
    assert.equal(args.p_report_id,"report");
    return {data:[{observation_item_id:"item",inspection_score_id:"snapshot",
      factors_json:{pif_weighted_noc_repetition_score:23}}],error:null};
  }};
  const [row]=await markHumanPolicyStaleness(sb,[{
    observation_item_id:"item",risk_snapshot_id:"snapshot",profile_version_id:"version",
  }],"report");
  assert.equal(row.human_policy_stale,true);
  assert.equal(row.human_pif_factors.pif_weighted_noc_repetition_score,23);
});
