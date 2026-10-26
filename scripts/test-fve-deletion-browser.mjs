import assert from "node:assert/strict";
import fs from "node:fs";
import WebSocket from "ws";
export async function browserDelete(f){
 const page=await(await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let seq=0,actor=f.office;const pending=new Map(),errors=[],dialogs=[];
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.on("message",async raw=>{
  const m=JSON.parse(raw);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
  if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);
  if(m.method==="Page.javascriptDialogOpening"){dialogs.push(m.params.message);await cdp("Page.handleJavaScriptDialog",{accept:true});}
  if(m.method!=="Fetch.requestPaused")return;
  const {requestId,request}=m.params;
  try{
   if(!new URL(request.url).pathname.endsWith("/auth.js")){await cdp("Fetch.continueRequest",{requestId});return;}
   const bundle={profile:actor.profile,session:actor.session,user:actor.session.user};
   const body=`(()=>{const bundle=${JSON.stringify(bundle)};
    const client=window.supabase.createClient(${JSON.stringify(f.base)},${JSON.stringify(f.anon)},
     {global:{headers:{Authorization:'Bearer '+bundle.session.access_token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    window.AUTH={ROLES:{SUPER_ADMIN:'super_admin',COMPANY_ADMIN:'company_admin',COMPANY_SUPERINTENDENT:'company_superintendent',VESSEL:'vessel',INSPECTOR:'inspector'},
     ensureSupabase:()=>client,getSessionUserProfile:async()=>bundle,requireAuth:async()=>bundle,setupAuthButtons:async()=>bundle};})();`;
   await cdp("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from(body).toString("base64")});
  }catch(e){if(!e.message.includes("Invalid InterceptionId"))errors.push(e.message);}
 });
 async function evaluate(expression){
  const r=await cdp("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;
 }
 async function until(expression,label){
  for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}
  throw Error(label+": "+await evaluate("document.querySelector('.fvr-overlay:not([hidden]),.fpa-overlay:not([hidden])')?.textContent || document.getElementById('fleetDataStatus')?.textContent"));
 }
 const fm=".fvr-overlay:not([hidden])",pm=".fpa-overlay:not([hidden])";
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const set=(selector,value)=>evaluate(`{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));}`);
 const button=(scope,label)=>evaluate(`[...document.querySelectorAll(${JSON.stringify(scope+" button")})].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
 async function load(who){
  actor=who;await cdp("Page.navigate",{url:`https://${process.env.REPLIT_DEV_DOMAIN}/sire-fleet-vetting-experience.html?delete-review`});
  await until("!!document.querySelector('.qitem [class*=badge]')","question badges");
  await set("#fleetRange","all");
  const q=f.sources[0].question_no.split(".").map(Number).join(".");
  await evaluate(`[...document.querySelectorAll('.qitem')].find(x=>x.textContent.match(/\\d+\\.\\d+\\.\\d+/)?.[0].split('.').map(Number).join('.')===${JSON.stringify(q)}).click()`);
  await until("document.querySelectorAll('.fleet-record').length>=3","source cards");
 }
 async function openSection(label,selector){
  await until(`[...document.querySelectorAll('.fpa-section')].some(s=>s.textContent.includes(${JSON.stringify(label)}))`,"action "+label);
  await evaluate(`[...document.querySelectorAll('.fpa-section')].find(s=>s.textContent.includes(${JSON.stringify(label)})).querySelector(${JSON.stringify(selector)}).click()`);
 }
 const status=label=>until(`document.querySelector('${fm} .fvr-workflow-meta .fvr-status')?.textContent===${JSON.stringify(label)}`,"status "+label);
 async function newAction(source,label,issued=false){
  let a=await f.rpc(f.office,"csvb_fve_prevention_action_save",{p_company_id:f.company,p_source_observation_item_id:source.id,
   p_instruction:`[${f.tag}] ${label}`,p_target_mode:"selected",p_vessel_ids:[f.a.profile.vessel_id]});
  if(issued)a=await f.rpc(f.office,"csvb_fve_prevention_action_issue",{p_company_id:f.company,p_action_id:a.id,p_expected_revision:a.revision});
  return a;
 }
 async function draftFile(a,label){
  const w=await f.rpc(f.a,"csvb_fve_response_draft",{p_company_id:f.company,p_target_id:a.workflow_summary.targets[0].id});
  const r=w.draft.id;
  await f.rpc(f.a,"csvb_fve_response_draft_text_save",{p_company_id:f.company,p_response_id:r,p_response_text:label});
  const e=await f.rpc(f.a,"csvb_fve_evidence_reserve",{p_company_id:f.company,p_response_id:r,p_filename:label+".pdf",p_mime_type:"application/pdf",p_size_bytes:128});
  assert.equal((await f.upload(f.a,e,Buffer.alloc(128,32))).ok,true);
  return r;
 }
 try{
  await cdp("Page.enable");await cdp("Runtime.enable");await cdp("Network.enable");await cdp("Network.setCacheDisabled",{cacheDisabled:true});
  await cdp("Fetch.enable",{patterns:[{urlPattern:"*auth.js*"}]});
  await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const clean=await newAction(f.sources[0],"Clean Draft");
  const issued=await newAction(f.sources[1],"Clean Issued",true);await draftFile(issued,"office-purge-temporary-file");
  const response=await newAction(f.sources[2],"Retained workflow",true);await draftFile(response,"vessel-delete-temporary-file");
  await load(f.office);
  for(const label of ["Clean Draft","Clean Issued"]){
   await openSection(label,'[data-testid="prevention-edit"]');
   await until(`!!document.querySelector('${pm} [data-testid="prevention-delete"]:not(:disabled)')`,"Delete Action enabled");
   await click(`${pm} [data-testid="prevention-delete"]`);
   await until(`!document.querySelector('${pm}')`,"action editor closes");
   await until(`![...document.querySelectorAll('.fpa-section')].some(s=>s.textContent.includes(${JSON.stringify(label)}))`,"action removed");
  }
  assert.ok(dialogs.some(x=>x.includes("issued tasks and targets")));
  await load(f.a);await openSection("Retained workflow",'[data-testid="workflow-target/open"]');await status("Pending");
  await button(fm,"Continue response draft");
  await until(`!!document.querySelector('${fm} [data-testid="response-delete-draft"]')`,"Delete Draft Response visible");
  await click(`${fm} [data-testid="response-delete-draft"]`);
  await until(`![...document.querySelectorAll('${fm} button')].some(b=>b.textContent==='Continue response draft') && !![...document.querySelectorAll('${fm} button')].find(b=>b.textContent==='Compose vessel response')`,"draft deleted");
  await button(fm,"Compose vessel response");await until(`!!document.querySelector('${fm} [data-testid="response-text"]')`,"response composer");
  await set(`${fm} [data-testid="response-text"]`,"Preserve submitted response one");
  await click(`${fm} [data-testid="response-submit"]`);await status("Response Submitted");
  assert.equal(await evaluate(`!!document.querySelector('${fm} [data-testid="response-delete-draft"]')`),false);
  await load(f.office);await openSection("Retained workflow",'[data-testid="prevention-edit"]');
  await until(`!!document.querySelector('${pm} [data-testid="prevention-delete"]:disabled')`,"historical action blocked");
  assert.match(await evaluate(`document.querySelector('${pm}').textContent`),/response.audit history/);
  fs.writeFileSync("/tmp/fve-delete-office-blocked.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
  await button(pm,"Close");await openSection("Retained workflow",'[data-testid="workflow-target/open"]');await status("Response Submitted");
  await button(fm,"Start review");await status("Office Review");
  await set(`${fm} [data-testid="review-comment"]`,"Keep this return message");
  await click(`${fm} [data-testid="review-return"]`);await status("Returned to Vessel");
  const before=await f.rpc(f.a,"csvb_fve_target_workflow",{p_company_id:f.company,p_target_id:response.workflow_summary.targets[0].id});
  await load(f.a);await openSection("Retained workflow",'[data-testid="workflow-target/open"]');await status("Returned to Vessel");
  await button(fm,"Compose vessel response");await until(`!!document.querySelector('${fm} [data-testid="response-text"]')`,"second draft");
  await set(`${fm} [data-testid="response-text"]`,"Delete unsubmitted response two only");
  fs.writeFileSync("/tmp/fve-delete-draft-evidence.pdf",Buffer.alloc(128,32));
  const {root}=await cdp("DOM.getDocument");
  const {nodeId}=await cdp("DOM.querySelector",{nodeId:root.nodeId,selector:`${fm} [data-testid="evidence-file"]`});
  await cdp("DOM.setFileInputFiles",{nodeId,files:["/tmp/fve-delete-draft-evidence.pdf"]});
  await until(`!!document.querySelector('${fm} [data-testid="evidence-remove"]')`,"second draft uploaded");
  await click(`${fm} [data-testid="response-delete-draft"]`);
  await until(`!![...document.querySelectorAll('${fm} button')].find(b=>b.textContent==='Compose vessel response')`,"second draft deleted");
  const after=await f.rpc(f.a,"csvb_fve_target_workflow",{p_company_id:f.company,p_target_id:response.workflow_summary.targets[0].id});
  assert.deepEqual(after.responses,before.responses);assert.deepEqual(after.events,before.events);assert.equal(after.target.status,"returned");assert.equal(after.draft,null);
  fs.writeFileSync("/tmp/fve-delete-vessel-history.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
  assert.deepEqual(errors,[]);
  console.log("PASS Preview: clean Draft and Issued Delete Action; real private file cleanup; submitted action disabled with reason; own draft/evidence deletion; no submitted delete; returned draft #2 deletion retains #1/return history.");
 }finally{await cdp("Page.close");ws.close();}
}
