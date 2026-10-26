import assert from "node:assert/strict";
import {fixtures} from "./lib/fve-live-fixtures.mjs";
const f=await fixtures();
const {rpc,office,a,b,company}=f;
try{
 if(!process.argv.includes("--browser-only")){
 async function action(source,issued){
  let x=await rpc(office,"csvb_fve_prevention_action_save",{p_company_id:company,p_source_observation_item_id:source.id,
    p_instruction:`[${f.tag}] Deletion verification`,p_target_mode:"selected",p_vessel_ids:[a.profile.vessel_id]});
  if(issued)x=await rpc(office,"csvb_fve_prevention_action_issue",{p_company_id:company,p_action_id:x.id,p_expected_revision:x.revision});
  return x;
 }
 async function prepare(actor,kind,id,extra={}){
  return rpc(actor,"csvb_fve_cleanup_prepare",{p_company_id:company,p_kind:kind,p_object_id:id,...extra});
 }
 async function finish(actor,op){
  if(op.storage_paths.length){
   const r=await fetch(f.base+"/storage/v1/object/fve-response-evidence",{method:"DELETE",headers:actor.headers,body:JSON.stringify({prefixes:op.storage_paths})});
   if(!r.ok)throw Error("Temporary evidence removal HTTP "+r.status);
  }
  return rpc(actor,"csvb_fve_cleanup_finish",{p_company_id:company,p_cleanup_id:op.id});
 }
 async function draftWithFile(x,label){
  const target=x.workflow_summary.targets[0],w=await rpc(a,"csvb_fve_response_draft",{p_company_id:company,p_target_id:target.id});
  const r=w.draft.id;
  await rpc(a,"csvb_fve_response_draft_text_save",{p_company_id:company,p_response_id:r,p_response_text:label});
  const e=await rpc(a,"csvb_fve_evidence_reserve",{p_company_id:company,p_response_id:r,p_filename:label+".pdf",p_mime_type:"application/pdf",p_size_bytes:128});
  const upload=await f.upload(a,e,Buffer.alloc(128,32));
  assert.equal(upload.ok,true);
  return{target,response:r,evidence:e};
 }
 let x=await action(f.sources[0],false);
 let op=await prepare(office,"action",x.id,{p_expected_revision:x.revision});
 assert.equal((await finish(office,op)).deleted,true);
 assert.equal((await prepare(office,"action",x.id,{p_expected_revision:x.revision})).status,"completed");
 x=await action(f.sources[0],true);
 let d=await draftWithFile(x,"temporary-action-evidence");
 await assert.rejects(prepare(office,"action",x.id,{p_expected_revision:x.revision}),/Confirm/);
 op=await prepare(office,"action",x.id,{p_confirm_issued:true,p_expected_revision:x.revision});
 await assert.rejects(rpc(office,"csvb_fve_cleanup_finish",{p_company_id:company,p_cleanup_id:op.id}),/cleanup is incomplete/);
 await assert.rejects(rpc(a,"csvb_fve_response_submit",{p_company_id:company,p_response_id:d.response,p_response_text:"Stale submit"}),/Deletion is in progress/);
 await assert.rejects(rpc(b,"csvb_fve_cleanup_finish",{p_company_id:company,p_cleanup_id:op.id}),/not accessible/);
 assert.equal((await finish(office,op)).deleted,true,"Office can purge unsubmitted evidence from clean Issued action");
 x=await action(f.sources[1],true);
 d=await draftWithFile(x,"temporary-vessel-draft");
 await assert.rejects(prepare(office,"draft",d.response),/onboard/);
 await assert.rejects(prepare(b,"draft",d.response),/assigned vessel/);
 op=await prepare(a,"draft",d.response);
 assert.equal((await finish(a,op)).deleted,true);
 assert.equal((await rpc(a,"csvb_fve_target_workflow",{p_company_id:company,p_target_id:d.target.id})).draft,null);
 d=await draftWithFile(x,"submitted-evidence");
 let w=await rpc(a,"csvb_fve_response_submit",{p_company_id:company,p_response_id:d.response,p_response_text:"Preserve submitted response one"});
 const first=structuredClone(w.responses[0]);
 await assert.rejects(prepare(office,"action",x.id,{p_confirm_issued:true,p_expected_revision:x.revision}),/response.audit history/);
 await assert.rejects(prepare(a,"draft",d.response),/Submitted response history/);
 const removed=await fetch(f.base+"/storage/v1/object/fve-response-evidence",{method:"DELETE",headers:a.headers,body:JSON.stringify({prefixes:[d.evidence.storage_path]})});
 // Storage may return 200/[] for denied delete. Verify the actual object survives.
 assert.ok([200,400,403].includes(removed.status));
 const [object]=await f.sql(`select count(*)::int n from storage.objects where bucket_id='fve-response-evidence' and name=${f.quote(d.evidence.storage_path)}`);
 assert.equal(object.n,1);
 await rpc(office,"csvb_fve_target_review",{p_company_id:company,p_target_id:d.target.id,p_decision:"start_review",p_expected_response_id:d.response});
 w=await rpc(office,"csvb_fve_target_review",{p_company_id:company,p_target_id:d.target.id,p_decision:"return",p_comment:"Retain this return",p_expected_response_id:d.response});
 const events=structuredClone(w.events);
 const second=await draftWithFile(x,"returned-draft-two");
 op=await prepare(a,"draft",second.response);await finish(a,op);
 w=await rpc(a,"csvb_fve_target_workflow",{p_company_id:company,p_target_id:d.target.id});
 assert.deepEqual(w.responses[0],first);assert.deepEqual(w.events,events);assert.equal(w.target.status,"returned");assert.equal(w.draft,null);
 console.log("PASS authenticated deletion: clean Draft; clean Issued with uploaded vessel evidence; cleanup retry/freeze; wrong-role/vessel denial; submitted action/evidence protection; returned draft #2 deletion retains response #1/history.");
 }
 if(process.argv.includes("--browser")||process.argv.includes("--browser-only")){
  const {browserDelete}=await import("./test-fve-deletion-browser.mjs");await browserDelete(f);
 }
 for(const source of f.sources){
  const [row]=await f.sql(`select to_jsonb(i) original from post_inspection_observation_items i where id=${f.quote(source.id)}::uuid`);
  assert.deepEqual(row.original,source.original);
 }
 console.log("PASS: source observations unchanged.");
}catch(error){console.error("Deletion verification failure:",error.message);throw error;}
finally{await f.cleanup();}
