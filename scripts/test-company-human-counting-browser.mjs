// Disposable synthetic UI state only. No real sign-in or backend writes.
import assert from "node:assert/strict";
import WebSocket from "ws";
import fs from "node:fs";
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const page = await (await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve=>socket.once("open",resolve));
let id=0;
let runEntry = false;
const pending=new Map();
const calls=(method,params={})=>new Promise((resolve,reject)=>{
  const key=++id; pending.set(key,{resolve,reject}); socket.send(JSON.stringify({id:key,method,params}));
});
socket.on("message",async raw=>{
  const message=JSON.parse(raw);
  if(message.id){const job=pending.get(message.id); if(job){pending.delete(message.id);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);} }
  if(message.method==="Fetch.requestPaused"){
    const {requestId,request}=message.params;
    const url=new URL(request.url);
    if(/\/(?:auth|csvb-module-guard)\.js$/.test(url.pathname) ||
      (!runEntry && url.pathname.endsWith("/post_inspection.js"))){
      await calls("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from("").toString("base64")});
    }else await calls("Fetch.continueRequest",{requestId});
  }
});
const evaluate=async expression=>{
  const result=await calls("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
};
await calls("Page.enable");
await calls("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await calls("Network.enable");
await calls("Network.setCacheDisabled",{cacheDisabled:true});
await calls("Network.setBypassServiceWorker",{bypass:true});
await calls("Fetch.enable",{patterns:[{urlPattern:"*",resourceType:"Script"}]});
await calls("Page.navigate",{url:`${base}/post_inspection.html`});
for(let n=0;n<80;n++){
  if(await evaluate("!!document.getElementById('humanCountingPolicyHost')"))break;
  await new Promise(resolve=>setTimeout(resolve,100));
}
await evaluate(`(async()=>{
 const {mountHumanCountingPanel}=await import('/csvb-human-counting-panel.mjs?v=20261026_entry_integration_v2');
 window.panelMount=mountHumanCountingPanel;
 window.testPolicy={company_id:'test-company',company_name:'Synthetic Testing Company',human_counting_mode:'per_finding',policy_revision:0,can_edit:true,companies:[{id:'test-company',name:'Synthetic Testing Company'}]};
 localStorage.setItem('csvb_superuser_company_view_id','test-company');
 window.testSaves=[];
 window.panelSb={rpc:async(name,args)=>{
   if(name==='csvb_human_counting_policy_save'){
     testSaves.push(args); testPolicy={...testPolicy,human_counting_mode:args.p_mode,policy_revision:testPolicy.policy_revision+1};
   }
   return {data:name==='csvb_human_counting_policy_for_me' && !args.p_company_id
     ? {company_id:null,can_edit:false,companies:testPolicy.companies}:testPolicy,error:null};
 }};
 await mountHumanCountingPanel({supabase:panelSb,host:document.getElementById('humanCountingPolicyHost'),
   initialCompanyId:localStorage.getItem('csvb_superuser_company_view_id'),onSaved:async()=>{}});
})()`);
assert.match(await evaluate("document.getElementById('humanCountingPolicyHost').innerText"),/Human observation counting/);
assert.equal(await evaluate("document.querySelector('input[value=per_finding]').checked"),true);
assert.equal(await evaluate("document.querySelector('#humanCountingPolicyHost select').value"),"test-company");
await evaluate("document.querySelector('input[value=per_pif]').click()");
await evaluate("[...document.getElementById('humanCountingPolicyHost').querySelectorAll('button')].find(b=>b.textContent==='Save').click()");
for(let n=0;n<30;n++){
  if(await evaluate("testSaves.length===1 && testPolicy.policy_revision===1"))break;
  await new Promise(resolve=>setTimeout(resolve,50));
}
assert.equal(await evaluate("testSaves[0].p_company_id"),"test-company");
assert.equal(await evaluate("testSaves[0].p_mode"),"per_pif");
assert.match(await evaluate("document.getElementById('humanCountingPolicyHost').innerText"),/Revision 1/);
await evaluate("document.querySelector('input[value=per_finding]').click()");
await evaluate("[...document.getElementById('humanCountingPolicyHost').querySelectorAll('button')].find(b=>b.textContent==='Save').click()");
await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(await evaluate("testPolicy.human_counting_mode"),"per_finding");
await evaluate(`(async()=>{
 testPolicy={...testPolicy,can_edit:false};
 document.getElementById('humanCountingPolicyHost').replaceChildren();
 await panelMount({supabase:panelSb,host:document.getElementById('humanCountingPolicyHost'),initialCompanyId:'test-company'});
})()`);
assert.equal(await evaluate("[...document.querySelectorAll('#humanCountingPolicyHost input')].every(i=>i.disabled)"),true);
assert.equal(await evaluate("[...document.querySelectorAll('#humanCountingPolicyHost button')].some(b=>b.textContent==='Save'&&!b.disabled)"),false);
await evaluate(`(async()=>{
 document.getElementById('humanCountingPolicyHost').replaceChildren();
 window.ownReads=[];
 await panelMount({supabase:{rpc:async(name,args)=>{
   ownReads.push(args.p_company_id);
   return {data:{company_id:'own-company',company_name:'Own Company',human_counting_mode:'per_finding',
     policy_revision:0,can_edit:false,companies:[]},error:null};
 }},host:document.getElementById('humanCountingPolicyHost'),initialCompanyId:'foreign-stale-company'});
})()`);
assert.deepEqual(await evaluate("ownReads"),[null]);
assert.match(await evaluate("document.getElementById('humanCountingPolicyHost').innerText"),/Own Company/);
assert.equal(await evaluate("document.querySelector('#humanCountingPolicyHost select').parentElement.hidden"),true);
const shot=await calls("Page.captureScreenshot",{format:"jpeg",quality:80});
fs.writeFileSync("/tmp/csvb-human-counting-panel.jpg",Buffer.from(shot.data,"base64"));
await calls("Emulation.setDeviceMetricsOverride",{width:402,height:874,deviceScaleFactor:1,mobile:true});
assert.equal(await evaluate("document.getElementById('humanCountingPolicyHost').scrollWidth<=window.innerWidth"),true);
console.log("PASS: served Entry panel inherits dashboard company; Save works from revision 0 in both directions; non-superuser own company ignores stale simulation; read-only and mobile controls; no backend writes.");
// Exercise the actual Entry module, not only its isolated panel. The role and
// RPC fixtures live solely in this disposable browser, never application code.
runEntry = true;
await calls("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await calls("Page.addScriptToEvaluateOnNewDocument",{source:`(() => {
 const company='381b3b4f-0fbd-4f30-bafe-450baa410a04';
 localStorage.setItem('csvb_superuser_company_view_id',company);
 window.CSVB_MODULE_GUARD={allowed:true};
 window.entryFixture={stores:0,alerts:[],failRead:false,mode:'per_finding',revision:0};
 window.confirm=()=>true;window.alert=text=>entryFixture.alerts.push(text);
 const companies=[{id:company,name:'C.S.V. BEACON Internal / Testing Company'}];
 const policy=()=>({company_id:company,company_name:companies[0].name,companies,
   can_edit:true,human_counting_mode:entryFixture.mode,policy_revision:entryFixture.revision});
 const sb={rpc(name,args={}){
   let data=[],error=null;
   if(name==='csvb_post_inspection_reports_for_me_v2')data=[{id:'report',report_ref:'LRHL-5256-7865-7911',
     vessel_name:'Verification vessel',inspection_date:'2026-10-08'}];
   else if(name==='csvb_human_counting_policy_for_me')data=args.p_company_id?policy():{company_id:null,can_edit:false,companies};
   else if(name==='csvb_human_counting_policy_save'){
     entryFixture.mode=args.p_mode;entryFixture.revision++;data=policy();
   }else if(name==='csvb_post_inspection_selectable_risk_profiles_for_me')
     data=[{profile_id:'profile',profile_name:'Verification profile',show_in_post_inspection:true}];
   else if(name==='csvb_post_inspection_all_profile_risk_scores_for_me_adjusted'){
     if(entryFixture.failRead)error={message:'Synthetic display-read failure'};
     else data=[{report_id:'report',risk_snapshot_id:'snapshot',profile_id:'profile',
       profile_version_id:'version',profile_name:'Verification profile',inspection_risk_score:69,
       risk_per_examined_question:0.6832,eligible_risk_observations:7}];
   }else if(name==='csvb_human_policy_snapshot_status_for_me')
     data=[{report_id:'report',risk_snapshot_id:'snapshot',profile_version_id:'version',is_stale:false}];
   else if(name==='csvb_store_post_inspection_risk_snapshots_all_profiles'){
     entryFixture.stores++;data={ok:true};
   }else if(name!=='csvb_human_counting_items_for_me')throw Error('Unexpected fixture RPC '+name);
   const result=Promise.resolve({data,error});result.range=()=>result;return result;
 }};
 window.AUTH={ROLES:{SUPER_ADMIN:'super_admin',COMPANY_ADMIN:'company_admin',COMPANY_SUPERINTENDENT:'company_superintendent'},
   requireAuth:async()=>({profile:{role:'super_admin'}}),ensureSupabase:()=>sb,
   fillUserBadge:()=>{},logoutAndGoLogin:()=>{}};
})();`});
await calls("Page.navigate",{url:`${base}/post_inspection.html`});
for(let n=0;n<120;n++){
 if(await evaluate("!!document.getElementById('refreshAllRisksBtn')"))break;
 await new Promise(resolve=>setTimeout(resolve,100));
}
assert.equal(await evaluate("document.querySelector('#humanCountingPolicyHost select')?.value"),"381b3b4f-0fbd-4f30-bafe-450baa410a04");
assert.equal(await evaluate("document.body.innerText.includes('69.0')"),true);
await evaluate("document.querySelector('input[value=per_pif]').click()");
assert.equal(await evaluate("document.querySelector('#humanCountingPolicyHost .csvb-human-counting__button--primary').disabled"),false);
await evaluate("document.querySelector('#humanCountingPolicyHost .csvb-human-counting__button--primary').click()");
await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(await evaluate("entryFixture.revision"),1);
await evaluate("document.getElementById('refreshAllRisksBtn').click()");
await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(await evaluate("entryFixture.stores"),1);
assert.match(await evaluate("entryFixture.alerts.at(-1)"),/Risk refresh completed/);
await evaluate("entryFixture.failRead=true;document.getElementById('refreshAllRisksBtn').click()");
await new Promise(resolve=>setTimeout(resolve,100));
assert.match(await evaluate("entryFixture.alerts.at(-1)"),/reloading the displayed risk scores failed/);
assert.equal(await evaluate("!!document.getElementById('riskDisplayError')"),true);
console.log("PASS: full served Entry module inherits company, enables/saves changed mode, renders risk values, refreshes once per report, and distinguishes stored snapshots from display-reload failure (synthetic browser role/RPC fixtures).");
await calls("Page.close");
socket.close();
