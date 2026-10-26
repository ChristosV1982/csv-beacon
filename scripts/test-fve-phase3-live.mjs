import assert from "node:assert/strict";
import {fixtures} from "./lib/fve-live-fixtures.mjs";
const f=await fixtures();
const {rpc,office,a,b,c,company}=f;
try{
 if(process.argv.includes("--browser-only")){
  const {browserPhase3}=await import("./test-fve-phase3-browser.mjs");
  await browserPhase3(f,{});
 }else{
 async function create(source,mode,targets){
  const draft=await rpc(office,"csvb_fve_prevention_action_save",{p_company_id:company,p_source_observation_item_id:source.id,
    p_instruction:`[${f.tag}] Verification instruction`,p_target_mode:mode,p_vessel_ids:targets,p_due_date:"2020-01-01"});
  return rpc(office,"csvb_fve_prevention_action_issue",{p_company_id:company,p_action_id:draft.id,p_expected_revision:draft.revision});
 }
 const all=await create(f.sources[0],"all",[]);
 const selected=await create(f.sources[1],"selected",[a.profile.vessel_id,b.profile.vessel_id]);
 const target=all.workflow_summary.targets.find(t=>t.vessel_id===a.profile.vessel_id);
 assert.equal(target.overdue,true);
 const bTarget=all.workflow_summary.targets.find(t=>t.vessel_id===b.profile.vessel_id);
 await rpc(b,"csvb_fve_target_workflow",{p_company_id:company,p_target_id:bTarget.id});
 await assert.rejects(rpc(c,"csvb_fve_target_workflow",{p_company_id:company,p_target_id:selected.workflow_summary.targets[0].id}),/assigned vessel/);
 let w=await rpc(a,"csvb_fve_response_draft",{p_company_id:company,p_target_id:target.id});
 let response=w.draft.id;
 // Actual parallel REST calls contend on the same response row.
 let outcomes=await Promise.allSettled(Array.from({length:6},(_,i)=>rpc(a,"csvb_fve_evidence_reserve",{
  p_company_id:company,p_response_id:response,p_filename:`concurrent${i}.pdf`,p_mime_type:"application/pdf",p_size_bytes:1024})));
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,5);
 for(const x of outcomes)if(x.status==="fulfilled")await rpc(a,"csvb_fve_evidence_cancel",{p_company_id:company,p_evidence_id:x.value.id});
 outcomes=await Promise.allSettled([1,2].map(i=>rpc(a,"csvb_fve_evidence_reserve",{
  p_company_id:company,p_response_id:response,p_filename:`combined${i}.pdf`,p_mime_type:"application/pdf",p_size_bytes:6291456})));
 assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
 for(const x of outcomes)if(x.status==="fulfilled")await rpc(a,"csvb_fve_evidence_cancel",{p_company_id:company,p_evidence_id:x.value.id});
 w=await rpc(a,"csvb_fve_response_submit",{p_company_id:company,p_response_id:response,p_response_text:"Initial text-only response"});
 const first=structuredClone(w.responses[0]);
 await rpc(office,"csvb_fve_target_review",{p_company_id:company,p_target_id:target.id,p_decision:"start_review",p_expected_response_id:response});
 await rpc(office,"csvb_fve_target_review",{p_company_id:company,p_target_id:target.id,p_decision:"return",
  p_comment:"Please supply objective evidence",p_expected_response_id:response});
 w=await rpc(a,"csvb_fve_response_draft",{p_company_id:company,p_target_id:target.id});response=w.draft.id;
 const bad=await rpc(a,"csvb_fve_evidence_reserve",{p_company_id:company,p_response_id:response,
  p_filename:"underdeclared.pdf",p_mime_type:"application/pdf",p_size_bytes:1});
 let upload=await f.upload(a,bad,Buffer.alloc(1024,32));
 assert.equal(upload.ok,false,"Actual Storage size must match reservation");
 await rpc(a,"csvb_fve_evidence_cancel",{p_company_id:company,p_evidence_id:bad.id});
 const pdf=Buffer.alloc(2*1024*1024,32);
 Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").copy(pdf);
 let last;
 for(let i=1;i<=5;i++){
  last=await rpc(a,"csvb_fve_evidence_reserve",{p_company_id:company,p_response_id:response,p_filename:`objective${i}.pdf`,
   p_mime_type:"application/pdf",p_size_bytes:pdf.length});
  upload=await f.upload(a,last,pdf);
  if(!upload.ok)throw Error(`Actual private Storage upload HTTP ${upload.status}: ${await upload.text()}`);
 }
 await assert.rejects(rpc(a,"csvb_fve_evidence_reserve",{p_company_id:company,p_response_id:response,p_filename:"sixth.pdf",
  p_mime_type:"application/pdf",p_size_bytes:1}),/5 active/);
 w=await rpc(a,"csvb_fve_response_submit",{p_company_id:company,p_response_id:response,p_response_text:"Second response with five evidence files"});
 assert.deepEqual(w.responses[0],first);
 assert.equal(w.responses[1].evidence.length,5);
 async function sign(actor){
  return fetch(f.base+"/storage/v1/object/sign/fve-response-evidence/"+last.storage_path,
   {method:"POST",headers:actor.headers,body:JSON.stringify({expiresIn:120})});
 }
 let signed=await sign(a);assert.equal(signed.ok,true);
 const signedUrl=(await signed.json()).signedURL;
 assert.equal((await fetch(f.base+"/storage/v1"+signedUrl)).status,200);
 assert.equal((await sign(office)).ok,true);
 assert.equal((await sign(b)).ok,false,"Other vessel cannot sign own evidence");
 assert.equal((await fetch(f.base+"/storage/v1/object/public/fve-response-evidence/"+last.storage_path)).ok,false);
 await rpc(office,"csvb_fve_target_review",{p_company_id:company,p_target_id:target.id,p_decision:"start_review",p_expected_response_id:response});
 w=await rpc(office,"csvb_fve_target_review",{p_company_id:company,p_target_id:target.id,p_decision:"close",
  p_comment:"Accepted",p_expected_response_id:response});
 assert.equal(w.target.status,"closed");
 await assert.rejects(rpc(a,"csvb_fve_response_draft",{p_company_id:company,p_target_id:target.id}),/not awaiting/);
 console.log("PASS: real authenticated JWTs; parallel quota enforcement; private 5-file/10MB upload; signed downloads; other-vessel denial; immutable versions; return/close.");
 if(process.argv.includes("--browser")){
  const {browserPhase3}=await import("./test-fve-phase3-browser.mjs");
  await browserPhase3(f,{all,selected});
 }
 }
 for(const source of f.sources){
  const [row]=await f.sql(`select to_jsonb(i) original from post_inspection_observation_items i where id=${f.quote(source.id)}::uuid`);
  assert.deepEqual(row.original,source.original);
 }
 console.log("PASS: original source observations unchanged.");
}catch(error){console.error("Verification failure:",error.message);throw error;}
finally{await f.cleanup();}
