// Browser CRUD uses real RPCs in rolled-back transactions. Prior successful test
// writes are replayed inside each transaction; no fixture actions persist.
import assert from "node:assert/strict";
import fs from "node:fs";
import WebSocket from "ws";
const company="381b3b4f-0fbd-4f30-bafe-450baa410a04";
const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"};
async function sql(query){
  const r=await fetch("https://api.supabase.com/v1/projects/bdidrcyufazskpuwmfca/database/query",
    {method:"POST",headers,body:JSON.stringify({query})});
  if(!r.ok)throw Error(await r.text());
  return r.json();
}
const profiles=await sql(`select id,role,company_id,vessel_id,position,onboard_access_enabled,onboard_status,
 read_only_after_disembarkation from profiles where company_id='${company}' and coalesce(is_active,true)
 and not coalesce(is_disabled,false) and (role::text in('company_admin','company_superintendent') or
 (role::text='vessel' and vessel_id is not null and coalesce(onboard_access_enabled,true)
 and coalesce(onboard_status,'')<>'inactive')) order by role::text`);
const office=profiles.find(p=>["company_admin","company_superintendent"].includes(p.role));
const vessel=profiles.find(p=>p.role==="vessel");
assert.ok(office&&vessel);
let profile=office;
const allowed=new Set(["csvb_fleet_vetting_experience_context","csvb_fleet_vetting_experience_counts",
  "csvb_fve_prevention_history","csvb_fve_prevention_context","csvb_fve_prevention_action_save",
  "csvb_fve_prevention_action_issue","csvb_questions_master_for_me","csvb_pgno_master_for_question_for_me",
  "csvb_expected_evidence_for_question_for_me","csvb_sire_question_references_for_question",
  "csvb_my_effective_app_permissions","csvb_my_company_modules"]);
const writes=new Set(["csvb_fve_prevention_action_save","csvb_fve_prevention_action_issue"]);
const journal=[],aliases=new Map(),stableIds=new Map(),calls=[];
const quote=v=>v==null?"null":Array.isArray(v)?`array[${v.map(quote).join(",")}]::uuid[]`:
  typeof v==="number"?String(v):"'"+String(v).replaceAll("'","''")+"'";
function statement(entry,index){
  const args=Object.entries(entry.args).map(([key,value])=>{
    assert.match(key,/^p_[a-z_]+$/);
    const alias=key==="p_action_id"?aliases.get(value):undefined;
    return key+"=>"+(alias===undefined?quote(value):`(select (data->>'id')::uuid from fve_browser_results where slot=${alias})`);
  }).join(",");
  const fn=`public.${entry.name}(${args})`;
  const json=entry.name.startsWith("csvb_fve_")||entry.name.startsWith("csvb_fleet_vetting_experience_");
  return `reset role;
    select set_config('request.jwt.claim.sub','${entry.actor}',true);
    select set_config('request.jwt.claims','${JSON.stringify({sub:entry.actor,role:"authenticated"})}',true);
    set local role authenticated;
    insert into fve_browser_results select ${index},${json?fn:`(select coalesce(jsonb_agg(t),'[]'::jsonb) from ${fn} t)`};`;
}
function rememberIds(value){
  if(!value||typeof value!=="object")return;
  if(value.id&&value.source_observation_item_id){
    const index=journal.findIndex(e=>e.name==="csvb_fve_prevention_action_save"&&!e.args.p_action_id
      &&e.args.p_source_observation_item_id===value.source_observation_item_id);
    if(index>=0){
      aliases.set(value.id,index);
      // Real persisted IDs are stable; replay-generated UUIDs must look stable
      // to the browser too, without persisting any action fixtures.
      const stable=stableIds.get(value.source_observation_item_id)||value.id;
      stableIds.set(value.source_observation_item_id,stable);
      aliases.set(stable,index);
      value.id=stable;
    }
  }
  if(Array.isArray(value))value.forEach(rememberIds);
  else Object.values(value).forEach(v=>{if(v&&typeof v==="object")rememberIds(v)});
}
async function rpc(name,args){
  const entry={name,args,actor:profile.id};calls.push(entry);
  if(!allowed.has(name))return{data:[],error:null};
  try{
    const index=journal.length;
    const data=(await sql(`begin;
      create temp table fve_browser_results(slot int primary key,data jsonb);
      grant select,insert on fve_browser_results to authenticated;
      ${[...journal,entry].map(statement).join("\n")}
      select data from fve_browser_results where slot=${index}; rollback;`))[0].data;
    if(writes.has(name))journal.push(entry);
    rememberIds(data);entry.result=data;
    return{data,error:null};
  }catch(error){return{data:null,error:{message:error.message}}}
}
const page=await(await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.once("open",r));
let seq=0;const pending=new Map(),errors=[];let confirmations=0;
const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
ws.on("message",async raw=>{
  const m=JSON.parse(raw);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}
  if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);
  if(m.method==="Page.javascriptDialogOpening"){confirmations++;await cdp("Page.handleJavaScriptDialog",{accept:true})}
  if(m.method!=="Fetch.requestPaused")return;
  const {requestId,request}=m.params;const path=new URL(request.url).pathname;
  let body,type="application/javascript";
  if(path.endsWith("/auth.js")){
    body=`(()=>{const profile=${JSON.stringify(profile)};const bundle={profile,session:{user:{id:profile.id}},user:{id:profile.id}};
      const client={rpc:async(name,args={})=>(await fetch('/__fve_phase2_rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})})).json()};
      window.AUTH={ROLES:{SUPER_ADMIN:'super_admin',COMPANY_ADMIN:'company_admin',COMPANY_SUPERINTENDENT:'company_superintendent',VESSEL:'vessel',INSPECTOR:'inspector'},
      ensureSupabase:()=>client,getSessionUserProfile:async()=>bundle,requireAuth:async()=>bundle,setupAuthButtons:async()=>bundle};})();`;
  }else if(path==="/__fve_phase2_rpc"){const {name,args}=JSON.parse(request.postData);body=JSON.stringify(await rpc(name,args));type="application/json"}
  try{
    if(body!==undefined)await cdp("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:type}],body:Buffer.from(body).toString("base64")});
    else await cdp("Fetch.continueRequest",{requestId});
  }catch(e){if(!e.message.includes("Invalid InterceptionId"))throw e}
});
await cdp("Page.enable");await cdp("Runtime.enable");await cdp("Network.enable");
await cdp("Network.setBypassServiceWorker",{bypass:true});await cdp("Network.setCacheDisabled",{cacheDisabled:true});
await cdp("Fetch.enable",{patterns:[{urlPattern:"*auth.js*"},{urlPattern:"*__fve_phase2_rpc*"}]});
const evaluate=async expression=>{
  const r=await cdp("Runtime.evaluate",{expression,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
};
async function until(expression,label){
  for(let i=0;i<250;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100))}
  throw Error(label+": "+await evaluate("document.querySelector('.fpa-inline-message:not([hidden])')?.textContent || document.getElementById('fleetDataStatus')?.textContent"));
}
async function load(){
  await cdp("Page.navigate",{url:`https://${process.env.REPLIT_DEV_DOMAIN}/sire-fleet-vetting-experience.html`});
  await until("!!document.querySelector('.qitem [class*=badge]')","question badges");
  await evaluate("[...document.querySelectorAll('.qitem')].find(x=>x.querySelector('[class*=badge]')).click()");
  await until("document.querySelectorAll('.fleet-record').length>1","source observations");
}
const button=id=>`[data-testid="${id}"]`;
const click=async id=>evaluate(`document.querySelector('${button(id)}').click()`);
await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await load();
const beforeCount=await evaluate("document.getElementById('fleetRecurrence').textContent");
await click("prevention-create");
await until("!!document.getElementById('fpaInstruction')","office editor");
fs.writeFileSync("/tmp/fve-prevention-office.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
await evaluate("document.getElementById('fpaInstruction').value='Draft awareness instruction';document.getElementById('fpaTargetSelected').click()");
await evaluate(`const target=[...document.querySelectorAll('.fpa-vessel-list input')].find(x=>x.value!=='${vessel.vessel_id}');target.checked=true`);
const initialSaves=calls.filter(c=>writes.has(c.name)).length;
await evaluate("document.querySelector('[data-testid=prevention-save-draft]').click();document.querySelector('[data-testid=prevention-save-draft]').click()");
await until("document.querySelector('.fpa-overlay').hidden && !!document.querySelector('.fpa-summary')","saved Draft");
assert.equal(calls.filter(c=>writes.has(c.name)).length-initialSaves,1,"Double click must not create twice");
assert.ok(await evaluate("document.querySelector('.fpa-summary').textContent.includes('Draft')"));
profile=vessel;await load();
assert.equal(await evaluate("document.querySelectorAll('.fpa-summary').length"),0,"Draft hidden");
assert.equal(await evaluate("document.querySelectorAll('[data-testid=prevention-create], [data-testid=prevention-edit]').length"),0);
profile=office;await load();
await click("prevention-edit");
await until("!!document.getElementById('fpaInstruction')","Draft reopen");
assert.equal(await evaluate("document.getElementById('fpaInstruction').value"),"Draft awareness instruction");
await evaluate("document.getElementById('fpaInstruction').value='Issued to selected other vessel';document.getElementById('fpaDueDate').value='2026-12-30'");
await click("prevention-save-and-issue");
await until("document.querySelector('.fpa-overlay').hidden && document.querySelector('.fpa-summary').textContent.includes('Issued')","issue selected action");
assert.equal(confirmations,1);
await click("prevention-edit");
await until("!!document.querySelector('[data-testid=prevention-save-changes]')","Issued editor");
assert.equal(await evaluate("document.getElementById('fpaTargetAll').disabled && document.getElementById('fpaTargetSelected').disabled"),true);
await evaluate("document.getElementById('fpaInstruction').value='Logged update to selected other vessel'");
await click("prevention-save-changes");
await until("document.querySelector('.fpa-overlay').hidden","issued edit save");
await click("prevention-create");
await until("!!document.getElementById('fpaInstruction')","second action editor");
assert.equal(await evaluate("document.getElementById('fpaTargetAll').checked"),true);
await evaluate("document.getElementById('fpaInstruction').value='Issued to all fleet vessels'");
await click("prevention-save-and-issue");
await until("document.querySelector('.fpa-overlay').hidden && document.querySelectorAll('.fpa-summary').length===2","all-fleet issue");
assert.equal(confirmations,2);
assert.equal(await evaluate("document.getElementById('fleetRecurrence').textContent"),beforeCount);
profile=vessel;await load();
assert.equal(await evaluate("document.querySelectorAll('.fpa-summary').length"),1,"Only targeted Issued action");
assert.equal(await evaluate("document.querySelector('.fpa-summary').textContent.includes('Issued to all fleet vessels')"),true);
assert.equal(await evaluate("document.querySelector('#fleetRecords').textContent.includes('Logged update to selected other vessel')"),false);
assert.equal(await evaluate("document.querySelectorAll('[data-testid=prevention-edit], [data-testid=prevention-create]').length"),0);
await evaluate("document.querySelector('.fpa-summary').open=true");
assert.equal(await evaluate("document.querySelector('.fpa-summary .fpa-instruction').textContent"),"Issued to all fleet vessels");
assert.equal(await evaluate("document.querySelectorAll('.fpa-section textarea, .fpa-section input[type=file]').length"),0);
await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
await evaluate("document.querySelector('.fpa-summary').scrollIntoView({block:'center'})");
fs.writeFileSync("/tmp/fve-prevention-vessel.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
assert.equal(errors.length,0);
console.log("PASS: office Draft/save/edit/issue, selected/all targets, issued edits, double-click guard, confirmation, vessel Draft/untargeted isolation, read-only issued view, unchanged counts, mobile layout.");
console.log("All test writes rolled back; no fixture actions persisted.");
await cdp("Page.close");ws.close();
