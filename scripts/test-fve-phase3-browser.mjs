import assert from "node:assert/strict";
import fs from "node:fs";
import WebSocket from "ws";
export async function browserPhase3(f){
 const page=await(await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
 let sequence=0,actor=f.office;const pending=new Map(),errors=[],calls=[];
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 ws.on("message",async raw=>{
  const m=JSON.parse(raw);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
  if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);
  if(m.method==="Network.requestWillBeSent"&&m.params.request.url.includes("/rest/v1/rpc/"))calls.push(m.params.request.url.split("/").pop());
  if(m.method==="Page.javascriptDialogOpening")await cdp("Page.handleJavaScriptDialog",{accept:true});
  if(m.method!=="Fetch.requestPaused")return;
  const {requestId,request}=m.params;
  try{
   // Only inject the disposable user's real session. Every application RPC
   // and Storage request goes to Supabase with an actual authenticated JWT.
   const bundle={profile:actor.profile,session:actor.session,user:actor.session.user};
   const body=`(()=>{const bundle=${JSON.stringify(bundle)};
    const client=window.supabase.createClient(${JSON.stringify(f.base)},${JSON.stringify(f.anon)},
     {global:{headers:{Authorization:'Bearer '+bundle.session.access_token}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    window.AUTH={ROLES:{SUPER_ADMIN:'super_admin',COMPANY_ADMIN:'company_admin',COMPANY_SUPERINTENDENT:'company_superintendent',VESSEL:'vessel',INSPECTOR:'inspector'},
     ensureSupabase:()=>client,getSessionUserProfile:async()=>bundle,requireAuth:async()=>bundle,setupAuthButtons:async()=>bundle};})();`;
   if(new URL(request.url).pathname.endsWith("/auth.js"))await cdp("Fetch.fulfillRequest",{requestId,responseCode:200,
     responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from(body).toString("base64")});
   else await cdp("Fetch.continueRequest",{requestId});
  }catch(e){if(!e.message.includes("Invalid InterceptionId"))errors.push(e.message);}
 });
 async function evaluate(expression){
  const r=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
 }
 async function until(expression,label){
  for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}
  throw Error(label+": "+await evaluate("document.querySelector('.fvr-overlay:not([hidden])')?.textContent || document.querySelector('.fpa-overlay:not([hidden])')?.textContent || document.getElementById('fleetDataStatus')?.textContent"));
 }
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const set=(selector,value)=>evaluate(`{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));}`);
 const textButton=text=>evaluate(`[...document.querySelectorAll('.fvr-overlay:not([hidden]) button')].find(x=>x.textContent===${JSON.stringify(text)}).click()`);
 const modal=".fvr-overlay:not([hidden])";
 async function load(who){
  actor=who;
  await cdp("Page.navigate",{url:`https://${process.env.REPLIT_DEV_DOMAIN}/sire-fleet-vetting-experience.html?phase3-review`});
  await until("!!document.querySelector('.qitem [class*=badge]')","badges");
  await set("#fleetRange","all");
  const q=f.sources[0].question_no.split(".").map(x=>String(+x)).join(".");
  await evaluate(`[...document.querySelectorAll('.qitem')].find(x=>x.textContent.match(/\\d+\\.\\d+\\.\\d+/)?.[0].split('.').map(Number).join('.')===${JSON.stringify(q)}).click()`);
  await until("document.querySelectorAll('.fleet-record').length>=3","records");
 }
 async function openForTarget(id){
  await evaluate(`document.querySelector('[data-testid="workflow-target/open"][data-target-id="${id}"]')?.click() ||
   [...document.querySelectorAll('[data-testid="workflow-target/open"]')].find(b=>b.textContent.includes(${JSON.stringify(f.vessels.find(v=>v.id===id)?.name||id)}))?.click()`);
 }
 async function openActionTarget(actionId,vesselId){
  // Summary structure follows physical observation/action, not row position.
  const index=await evaluate(`(()=>{const sections=[...document.querySelectorAll('.fpa-section')];
    return sections.findIndex(s=>s.textContent.includes(${JSON.stringify(`[${f.tag}] Preview all vessels`)}));})()`);
  assert.ok(index>=0);
  const name=f.vessels.find(v=>v.id===vesselId).name;
  await evaluate(`[...document.querySelectorAll('.fpa-section')][${index}].querySelector('.fvr-target-picker > summary')?.click()`);
  await evaluate(`[...document.querySelectorAll('.fpa-section')][${index}].querySelectorAll('[data-testid="workflow-target/open"]').forEach(b=>{if(b.textContent.includes(${JSON.stringify(name)}))b.click()})`);
  await until(`!!document.querySelector('${modal} .fvr-status')`,"workflow dialog");
 }
 const status=label=>until(`document.querySelector('${modal} .fvr-workflow-meta .fvr-status')?.textContent===${JSON.stringify(label)}`,"status "+label);
 try{
  await cdp("Page.enable");await cdp("Runtime.enable");await cdp("Network.enable");
  await cdp("Network.setCacheDisabled",{cacheDisabled:true});
  await cdp("Fetch.enable",{patterns:[{urlPattern:"*auth.js*"}]});
  await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const selected=await f.rpc(f.office,"csvb_fve_prevention_action_save",{p_company_id:f.company,p_source_observation_item_id:f.sources[1].id,
    p_instruction:`[${f.tag}] Selected vessel A only`,p_target_mode:"selected",p_vessel_ids:[f.a.profile.vessel_id]});
  await f.rpc(f.office,"csvb_fve_prevention_action_issue",{p_company_id:f.company,p_action_id:selected.id,p_expected_revision:1});
  await load(f.office);
  await click('[data-testid="prevention-create"]');
  await until("!!document.getElementById('fpaInstruction')","office create");
  await set("#fpaInstruction",`[${f.tag}] Preview all vessels`);
  await set("#fpaDueDate","2020-01-01");
  await click('[data-testid="prevention-save-and-issue"]');
  await until("document.querySelector('.fpa-overlay')?.hidden===true","office issue");
  const [actionRow]=await f.sql(`select id from fve_prevention_actions where created_by=${f.quote(f.office.id)}::uuid
    and preventative_actions_required_by_vessel=${f.quote(`[${f.tag}] Preview all vessels`)}`);
  const all=await f.rpc(f.office,"csvb_fve_prevention_action_get",{p_company_id:f.company,p_action_id:actionRow.id});
  assert.equal(all.status,"issued");assert.ok(all.workflow_summary.targets.length>=3);
  await load(f.b);assert.equal(await evaluate("document.querySelector('#fleetRecords').textContent.includes('Selected vessel A only')"),false);
  assert.equal(await evaluate("document.querySelector('#fleetRecords').textContent.includes('Preview all vessels')"),true);
  await load(f.a);await openActionTarget(all.id,f.a.profile.vessel_id);
  assert.equal(await evaluate(`document.querySelector('${modal}').textContent.includes('Overdue')`),true);
  await textButton("Compose vessel response");
  await until(`!!document.querySelector('${modal} [data-testid="response-text"]')`,"composer");
  await set(`${modal} [data-testid="response-text"]`,"Preview response one");
  await click(`${modal} [data-testid="response-submit"]`);
  await status("Response Submitted");
  await load(f.office);await openActionTarget(all.id,f.a.profile.vessel_id);
  await textButton("Start review");await status("Office Review");
  await set(`${modal} [data-testid="review-comment"]`,"Please attach objective evidence.");
  await click(`${modal} [data-testid="review-return"]`);await status("Returned to Vessel");
  await load(f.a);await openActionTarget(all.id,f.a.profile.vessel_id);
  await textButton("Compose vessel response");
  await until(`!!document.querySelector('${modal} [data-testid="response-text"]')`,"second composer");
  await set(`${modal} [data-testid="response-text"]`,"Preview response two retained while uploading");
  async function files(count,size,prefix){
   await evaluate(`{const dt=new DataTransfer();for(let i=0;i<${count};i++){
    const bytes=new Uint8Array(${size});bytes.set(new TextEncoder().encode('%PDF-1.4\\n%%EOF'));
    dt.items.add(new File([bytes],${JSON.stringify(prefix)}+i+'.pdf',{type:'application/pdf'}));}
    const n=document.querySelector('${modal} [data-testid="evidence-file"]');n.files=dt.files;n.dispatchEvent(new Event('change',{bubbles:true}));}`);
  }
  await files(1,10485761,"too-large");
  await until(`document.querySelector('${modal} .fvr-message')?.textContent.includes('10 MB')`,"UI size rejection");
  await files(5,128,"proof");
  await until(`document.querySelector('${modal} .fvr-quota')?.textContent.includes('5 of 5') &&
    !document.querySelector('${modal} [data-testid="response-submit"]').disabled`,"five actual browser uploads");
  assert.equal(await evaluate(`document.querySelector('${modal} [data-testid="response-text"]').value`),"Preview response two retained while uploading");
  await files(1,128,"sixth");
  await until(`document.querySelector('${modal} .fvr-message')?.textContent.includes('five')`,"UI sixth rejection");
  await textButton("Close and keep draft");
  await textButton("Continue response draft");
  await until(`!!document.querySelector('${modal} [data-testid="response-text"]')`,"reopened draft");
  assert.equal(await evaluate(`document.querySelector('${modal} [data-testid="response-text"]').value`),"Preview response two retained while uploading");
  await click(`${modal} [data-testid="response-submit"]`);await status("Response Submitted");
  const target=all.workflow_summary.targets.find(t=>t.vessel_id===f.a.profile.vessel_id);
  const w=await f.rpc(f.a,"csvb_fve_target_workflow",{p_company_id:f.company,p_target_id:target.id});
  assert.equal(w.responses.length,2);assert.equal(w.responses[1].evidence.length,5);
  w.responses[1].evidence.forEach(e=>f.paths.push(e.storage_path));
  await load(f.office);await openActionTarget(all.id,f.a.profile.vessel_id);
  await textButton("Start review");await status("Office Review");
  fs.writeFileSync("/tmp/fve-phase3-office.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
  await click(`${modal} [data-testid="review-close"]`);await status("Closed");
  await load(f.a);await openActionTarget(all.id,f.a.profile.vessel_id);await status("Closed");
  assert.equal(await evaluate(`document.querySelectorAll('${modal} [data-testid="response-text"],${modal} [data-testid="response-submit"]').length`),0);
  await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
  fs.writeFileSync("/tmp/fve-phase3-vessel-mobile.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
  assert.deepEqual(errors,[]);
  assert.ok(calls.includes("csvb_fve_response_submit"));
  console.log("PASS Preview: office All-vessel issue; A/B visibility; selected-target privacy; text submission; return; five real uploads with text retained; client limits; draft reopen; version 2; office close; immutable closed history; mobile.");
 }finally{await cdp("Page.close");ws.close();}
}
