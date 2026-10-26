// Disposable browser identity fixture. RPCs use real, READ ONLY testing-project
// transactions with existing profiles; no passwords/tokens enter the browser.
import assert from "node:assert/strict";
import fs from "node:fs";
import WebSocket from "ws";
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const company = "381b3b4f-0fbd-4f30-bafe-450baa410a04";
async function sql(query) {
  const response = await fetch("https://api.supabase.com/v1/projects/bdidrcyufazskpuwmfca/database/query", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json" }, body: JSON.stringify({ query })
  });
  if (!response.ok) throw Error((await response.text()).slice(0, 600));
  return response.json();
}
const profiles = (await sql(`begin read only;
 select id,role,position,company_id,vessel_id,onboard_access_enabled,onboard_status,
 read_only_after_disembarkation from profiles
 where coalesce(is_active,true) and not coalesce(is_disabled,false) and
 (role::text='super_admin' or (role::text='vessel' and company_id='${company}' and vessel_id is not null
 and coalesce(onboard_access_enabled,true) and coalesce(onboard_status,'')<>'inactive'))
 order by created_at; commit;`));
let profile = profiles.find(p => p.role === "super_admin");
assert.ok(profile);
const allowedRpc = new Set([
  "csvb_fleet_vetting_experience_context", "csvb_fleet_vetting_experience_counts",
  "csvb_fleet_vetting_experience_history", "csvb_questions_master_for_me",
  "csvb_fve_prevention_history", "csvb_fve_prevention_context",
  "csvb_pgno_master_for_question_for_me", "csvb_expected_evidence_for_question_for_me",
  "csvb_sire_question_references_for_question", "csvb_my_effective_app_permissions",
  "csvb_my_company_modules", "csvb_admin_list_company_modules", "csvb_admin_list_companies",
  "csvb_dashboard_list_platform_areas"
]);
const quote = value => value == null ? "null" : typeof value === "number" ? String(value) :
  "'" + String(value).replaceAll("'", "''") + "'";
const rpcCalls = [];
async function rpc(name, args = {}) {
  const call = { name, args };
  rpcCalls.push(call);
  if (!allowedRpc.has(name)) return { data: [], error: null };
  const named = Object.entries(args).map(([key, value]) => {
    assert.match(key, /^p_[a-z_]+$/);
    return `${key} => ${quote(value)}`;
  }).join(",");
  const jsonResult = name.startsWith("csvb_fleet_vetting_experience_") || name.startsWith("csvb_fve_");
  const query = `begin read only;
    select set_config('request.jwt.claim.sub','${profile.id}',true);
    select set_config('request.jwt.claims','${JSON.stringify({sub:profile.id,role:"authenticated"})}',true);
    set local role authenticated;
    ${jsonResult ? `select public.${name}(${named}) data` :
      `select coalesce(jsonb_agg(t),'[]'::jsonb) data from public.${name}(${named}) t`};
    rollback;`;
  try {
    const data = (await sql(query))[0].data;
    call.data = data;
    return { data, error: null };
  }
  catch (error) { return { data: null, error: { message: error.message } }; }
}
const page = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", {method:"PUT"})).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let serial = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((resolve,reject) => {
  const id = ++serial; pending.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}));
});
const errors = [];
socket.on("message", async raw => {
  const message = JSON.parse(raw);
  if (message.id) {
    const task = pending.get(message.id);
    if (task) { pending.delete(message.id); message.error ? task.reject(Error(JSON.stringify(message.error))) : task.resolve(message.result); }
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  const {requestId,request} = message.params;
  const url = new URL(request.url);
  let body;
  let type = "application/javascript";
  if (url.pathname.endsWith("/auth.js")) {
    body = `(()=>{const profile=${JSON.stringify(profile)};
      const bundle={profile,session:{user:{id:profile.id}},user:{id:profile.id}};
      const client={rpc:async(name,args={})=>{
        const r=await fetch('/__fleet_browser_rpc',{method:'POST',
          headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});
        const text=await r.text();
        try{return JSON.parse(text)}catch(e){throw Error('Test bridge '+name+' '+r.status+' '+r.url+': '+text.slice(0,90))}
      }};
      window.AUTH={ROLES:{SUPER_ADMIN:'super_admin',COMPANY_ADMIN:'company_admin',
        COMPANY_SUPERINTENDENT:'company_superintendent',VESSEL:'vessel',INSPECTOR:'inspector'},
        ensureSupabase:()=>client,getSessionUserProfile:async()=>bundle,
        setupAuthButtons:async()=>bundle,requireAuth:async()=>bundle};
      localStorage.setItem('csvb_superuser_company_view_id','${company}');
      localStorage.setItem('csvb_superuser_company_view_name','C.S.V. BEACON Internal / Testing Company');
    })();`;
  } else if (url.pathname === "/__fleet_browser_rpc") {
    const {name,args} = JSON.parse(request.postData);
    body = JSON.stringify(await rpc(name,args)); type = "application/json";
  }
  try {
    if (body !== undefined) await cdp("Fetch.fulfillRequest",{requestId,responseCode:200,
      responseHeaders:[{name:"Content-Type",value:type}],body:Buffer.from(body).toString("base64")});
    else await cdp("Fetch.continueRequest",{requestId});
  } catch (error) {
    // A navigation may cancel an intercepted request before the DB read returns.
    if (!error.message.includes("Invalid InterceptionId")) throw error;
  }
});
await cdp("Page.enable"); await cdp("Runtime.enable"); await cdp("Network.enable");
await cdp("Network.setBypassServiceWorker",{bypass:true});
await cdp("Network.setCacheDisabled",{cacheDisabled:true});
await cdp("Fetch.enable",{patterns:[{urlPattern:"*auth.js*"},{urlPattern:"*__fleet_browser_rpc*"}]});
const evaluate = async expression => {
  const result = await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
async function until(expression, label) {
  for (let n=0;n<200;n++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error(`Timed out: ${label}\n`+await evaluate("document.body.innerText.slice(0,3500)"));
}
await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
let before="";
if(!process.argv.includes("--dashboard-only")){
await cdp("Page.navigate",{url:base+"/sire-fleet-vetting-experience.html"});
await until("!!document.querySelector('.fleet-question-badge') || !!document.querySelector('.q-history-badge') || !!document.querySelector('.qitem [class*=badge]')","badges loaded");
assert.equal(await evaluate("document.getElementById('fleetRange').value"),"6");
assert.ok(rpcCalls.filter(r=>r.name==="csvb_fleet_vetting_experience_counts").length<=2,"No count fanout");
assert.ok(rpcCalls.filter(r=>r.name==="csvb_pgno_master_for_question_for_me").length<=2,"No PGNO startup fanout");
assert.equal(await evaluate("[...document.querySelectorAll('#viewPanel details.coll')].some(x=>x.open)"),false);
await evaluate("[...document.querySelectorAll('.qitem')].find(x=>x.querySelector('[class*=badge]')).click()");
await until("document.querySelectorAll('.fleet-record').length>0","populated question");
assert.equal(await evaluate("document.getElementById('fleetOnlyObservedToggle').checked"),false);
assert.equal(await evaluate("document.getElementById('showFullQuestionToggle').closest('.row').nextElementSibling.querySelector('input').id"),"fleetOnlyObservedToggle");
const fullQuestionCount=await evaluate("document.querySelectorAll('.qitem').length");
const originalSelected=await evaluate("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected().id");
const toggleRpcStart=rpcCalls.length;
await evaluate("document.getElementById('fleetOnlyObservedToggle').click()");
assert.equal(await evaluate("[...document.querySelectorAll('.qitem')].every(x=>!!x.querySelector('[class*=badge]'))"),true);
assert.ok(await evaluate("document.querySelectorAll('.qitem').length")<fullQuestionCount);
assert.equal(await evaluate("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected().id"),originalSelected);
await evaluate("document.getElementById('fleetOnlyObservedToggle').click()");
assert.equal(await evaluate("document.querySelectorAll('.qitem').length"),fullQuestionCount);
assert.equal(rpcCalls.length,toggleRpcStart,"Keeping a visible selection must cause no requests");
const unobservedId=await evaluate("document.querySelector('.qitem:not(:has([class*=badge]))').dataset.qid");
await evaluate("document.querySelector('.qitem:not(:has([class*=badge]))').click()");
await until("document.getElementById('fleetResultCount').textContent==='0 records'","unobserved selection");
assert.equal(await evaluate("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected().id"),unobservedId);
const replacementStart=rpcCalls.length;
await evaluate("document.getElementById('fleetOnlyObservedToggle').click()");
await until("document.querySelector('.qitem.active [class*=badge]') && document.querySelectorAll('.fleet-record').length>0","automatic first matching selection");
assert.equal(await evaluate("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected().id===document.querySelector('.qitem').dataset.qid"),true);
assert.equal(rpcCalls.slice(replacementStart).filter(r=>r.name.endsWith("_counts")).length,0,"Toggle reuses badge counts");
assert.equal(rpcCalls.slice(replacementStart).filter(r=>r.name.endsWith("_history")).length,1,"Only selected replacement history is loaded");
before = await evaluate("document.getElementById('fleetRecurrence').textContent");
const preservedId=await evaluate("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected().id");
await evaluate("document.getElementById('fleetRange').value='12';document.getElementById('fleetRange').dispatchEvent(new Event('change'))");
await until("document.getElementById('fleetDataStatus').innerText.includes('Filters applied') && !!document.querySelector('.qitem [class*=badge]')","history change");
await new Promise(resolve=>setTimeout(resolve,700));
assert.equal(await evaluate("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected().id"),preservedId,"Selection survives pending counts when still visible");
await evaluate("(document.querySelectorAll('.qitem')[1] || document.querySelector('.qitem')).click()");
await until("!!document.getElementById('fleetFrom').value","question navigation");
assert.equal(await evaluate("document.getElementById('fleetRange').value"),"12");
assert.equal(await evaluate("document.getElementById('fleetOnlyObservedToggle').checked"),true,"Toggle survives question navigation");
await evaluate("document.getElementById('fleetCategory').value='Human';document.getElementById('fleetCategory').dispatchEvent(new Event('change'))");
await until("document.getElementById('fleetDataStatus').innerText.includes('Filters applied')","category change");
assert.ok(rpcCalls.some(r=>r.name==="csvb_fleet_vetting_experience_counts"&&r.args.p_category==="Human"));
assert.equal(await evaluate("[...document.querySelectorAll('.qitem')].every(x=>!!x.querySelector('[class*=badge]'))"),true);
await evaluate("document.getElementById('fleetRange').value='all';document.getElementById('fleetRange').dispatchEvent(new Event('change'))");
await until("!!document.querySelector('.qitem [class*=badge]') && document.getElementById('fleetDataStatus').innerText.includes('Filters applied')","all history counts");
await new Promise(resolve=>setTimeout(resolve,700));
await evaluate("[...document.querySelectorAll('.qitem')].find(x=>x.querySelector('[class*=badge]')).click()");
await until("document.querySelectorAll('.fleet-record').length>0","human all-history records");
assert.equal(await evaluate("document.getElementById('fleetFrom').value"),"");
assert.equal(await evaluate("document.querySelector('#fleetObservations a')!==null"),false);
assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
assert.equal(await evaluate("[...document.querySelectorAll('.fleet-record .fleet-record-meta')].every(x=>x.innerText.includes('Human'))"),true);
// Screenshot contains real server data through the disposable identity bridge.
fs.writeFileSync("/tmp/csvb-fleet-experience-desktop.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
await evaluate("document.getElementById('fleetOil').selectedIndex=1;document.getElementById('fleetOil').dispatchEvent(new Event('change'))");
await until("document.getElementById('fleetDataStatus').innerText.includes('Filters applied')","oil-major change");
const chosenOil=await evaluate("document.getElementById('fleetOil').value");
assert.ok(rpcCalls.some(r=>r.name==="csvb_fleet_vetting_experience_counts"&&r.args.p_oil_major===chosenOil));
assert.equal(await evaluate("[...document.querySelectorAll('.qitem')].every(x=>!!x.querySelector('[class*=badge]'))"),true);
for(const call of rpcCalls.filter(r=>r.name==="csvb_fleet_vetting_experience_history"&&r.args.p_oil_major===chosenOil&&r.data)){
  assert.ok(call.data.rows.every(row=>row.oil_major===chosenOil));
}
await evaluate("document.getElementById('fleetFrom').value='2099-01-01';document.getElementById('fleetTo').value='2099-12-31';document.getElementById('fleetTo').dispatchEvent(new Event('change'))");
await until("document.querySelectorAll('.qitem [class*=badge]').length===0 && document.getElementById('fleetRange').value==='custom'","custom inspection dates remove badges");
for(let n=0;n<100&&!rpcCalls.some(r=>r.name==="csvb_fleet_vetting_experience_counts"&&r.args.p_from_date==="2099-01-01"&&r.data);n++){
  await new Promise(resolve=>setTimeout(resolve,100));
}
assert.ok(rpcCalls.some(r=>r.name==="csvb_fleet_vetting_experience_counts"&&r.args.p_from_date==="2099-01-01"));
await until("window.CSVB_SIRE_QUESTIONS_VIEWER.getSelected()===null && document.getElementById('emptyState').innerText.includes('No matching questions')","empty filtered question list");
assert.equal(await evaluate("document.querySelectorAll('.qitem').length"),0);
await evaluate("document.getElementById('fleetOnlyObservedToggle').click()");
assert.equal(await evaluate("document.querySelectorAll('.qitem').length"),fullQuestionCount,"OFF restores complete question list even with no observations");
const vessel = profiles.find(p=>p.role==="vessel");
assert.ok(vessel,"Existing internal-company vessel account required");
profile = vessel;
await cdp("Page.navigate",{url:base+"/sire-fleet-vetting-experience.html"});
await until("window.CSVB_MODULE_GUARD?.allowed===true && document.getElementById('fleetCompany')?.value","vessel context");
assert.equal(await evaluate("document.getElementById('fleetCompany').disabled"),true);
await until("!!document.querySelector('.qitem [class*=badge]')","vessel fleet badges");
assert.equal(await evaluate("document.getElementById('fleetOnlyObservedToggle').checked"),false,"New page defaults OFF");
await evaluate("[...document.querySelectorAll('.qitem')].find(x=>x.querySelector('[class*=badge]')).click()");
await until("document.querySelectorAll('.fleet-record').length>0","vessel limited records");
assert.equal(await evaluate("document.querySelector('#fleetObservations a')!==null"),false);
await cdp("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
fs.writeFileSync("/tmp/csvb-fleet-experience-mobile.jpg",Buffer.from((await cdp("Page.captureScreenshot",{format:"jpeg",quality:80})).data,"base64"));
}
profile=profiles.find(p=>p.role==="super_admin");
if(process.argv.includes("--dashboard-only")){
await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await cdp("Page.navigate",{url:base+"/q-dashboard.html?area=inspection_libraries_vetting"});
await until("document.querySelector('[data-area-module-card=sire_fleet_vetting_experience]')?.getBoundingClientRect().height>0","dashboard module shortcut");
assert.equal(await evaluate("document.querySelector('[data-area-module-card=sire_fleet_vetting_experience]').getBoundingClientRect().height>0"),true);
assert.equal(await evaluate("document.querySelector('[data-area-module-card=sire_fleet_vetting_experience] a').getAttribute('href')"),"./sire-fleet-vetting-experience.html");
console.log("PASS: served dashboard shows the new module under Inspection Libraries & Vetting in company view.");
}else{
console.log("PASS: actual served viewer/guard with real read-only RPC data: inherited company, default six months, counts without fanout, collapsed sections, preserved filters, category/history/oil-major/custom-date changes, vessel fleet access, no report links, desktop/mobile width.");
}
console.log("Initial recurrence:",before,"Uncaught exceptions:",errors.length);
assert.equal(errors.length,0);
await cdp("Page.close"); socket.close();
