import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync("public/post_inspection.js","utf8");
function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
test("dashboard company is read only after guard readiness and only for real platform roles",async()=>{
 const window={CSVB_MODULE_GUARD:{allowed:true}};
 let reads=0;
 const context=vm.createContext({window,Date,Promise,setTimeout,localStorage:{getItem:key=>{
   reads++;assert.equal(key,"csvb_superuser_company_view_id");return "company";
 }}});
 vm.runInContext(extract("async function inheritedHumanPolicyCompany(","async function init()"),context);
 assert.equal(await context.inheritedHumanPolicyCompany({profile:{role:"super_admin"}}),"company");
 assert.equal(await context.inheritedHumanPolicyCompany({profile:{role:"company_admin"}}),null);
 assert.equal(reads,1);
 window.CSVB_MODULE_GUARD={allowed:false};
 await assert.rejects(context.inheritedHumanPolicyCompany({profile:{role:"super_admin"}}),/not granted/);
 assert.equal(reads,1);
});
test("risk reader throws on backend failure and preserves the last successful score map",async()=>{
 const previous=new Map([["report",[{inspection_risk_score:69}]]]);
 const context=vm.createContext({window:{},Map,Error,Set,localStorage:{getItem:()=>null},
   RISK_INCLUDE_LAE_KEY:"lae",largelyAePercentValue:()=>50,el:()=>null,
   state:{riskScoresByReport:previous,supabase:{rpc:async()=>({error:{message:"x.effective_count missing"}})}},
 });
 vm.runInContext(extract("async function loadCurrentRiskScoresForStoredReports()","function showRiskDisplayError("),context);
 await assert.rejects(context.loadCurrentRiskScoresForStoredReports(),/Stored risk scores could not be loaded/);
 assert.equal(context.state.riskScoresByReport,previous);
});
test("successful writes followed by failed display reload never produce a full-success message",async()=>{
 const alerts=[],button={textContent:"Refresh All Risks",disabled:false};
 const context=vm.createContext({Map,Set,String,console:{warn(){},error(){}},
   confirm:()=>true,alert:text=>alerts.push(text),el:()=>button,showRiskDisplayError:()=>{},
   state:{reports:[{id:"report",report_ref:"fixture"}],supabase:{rpc:async()=>({data:{ok:true},error:null})}},
   loadCurrentRiskScoresForStoredReports:async()=>{throw Error("Display RPC failed")},
 });
 vm.runInContext(extract("async function refreshAllRisksForStoredReports()","function selectedProfileAverageBoxesHtml()"),context);
 await context.refreshAllRisksForStoredReports();
 assert.equal(alerts.length,1);
 assert.match(alerts[0],/1 succeeded, 0 failed/);
 assert.match(alerts[0],/reloading the displayed risk scores failed/);
 assert.doesNotMatch(alerts[0],/Risk refresh completed/);
 assert.equal(button.disabled,false);
});
