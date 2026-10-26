// Synthetic, read-only browser regression: real served dashboard, browser-only
// AUTH/RPC fixtures. No real account, database, or application auth is changed.
import assert from "node:assert/strict";
import WebSocket from "ws";

const base = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000";
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", {method:"PUT"})).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let id = 0;
const pending = new Map();
const errors = [];
let scenario = {role:"super_admin"};
socket.on("message", async raw => {
  const message = JSON.parse(raw);
  if (message.id && pending.has(message.id)) {
    const {resolve,reject} = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  const {requestId,request} = message.params;
  const url = new URL(request.url);
  let body = "";
  if (url.pathname.endsWith("/auth.js")) {
    body = `(${fixture.toString()})(${JSON.stringify(scenario)});`;
  } else if (url.hostname.endsWith("supabase.co")) {
    body = "{}";
  }
  await call("Fetch.fulfillRequest", {requestId,responseCode:200,
    responseHeaders:[{name:"Content-Type",value:url.pathname.endsWith("/auth.js")?"application/javascript":"application/json"}],
    body:Buffer.from(body).toString("base64")});
});
function call(method,params={}) {
  return new Promise((resolve,reject) => {
    const next = ++id;
    pending.set(next,{resolve,reject});
    socket.send(JSON.stringify({id:next,method,params}));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
function fixture(config) {
  const allKeys = ["company_policy","self_assessment","post_inspection","vetting_planner",
    "post_inspection_stats","inspector_intelligence","audit_observations","tmsa_office_manager",
    "fleet_reports","sire_2_vetting","questions_editor","risq_questions_editor","threads",
    "mooring_anchoring_inventories","port_call_intelligence","portable_lifting_appliances_wires",
    "platform_administration","sire_questions_viewer","risq_questions_viewer"];
  const codes = ["COMPANY_POLICY","COMPANY_BUILDER","SELF_ASSESSMENT_ASSIGNMENTS","SELF_ASSESSMENT_TASKS",
    "VESSEL_QUESTIONNAIRES","POST_INSPECTION","VETTING_INSPECTION_PLANNER","POST_INSPECTION_STATS",
    "INSPECTOR_INTELLIGENCE","AUDIT_OBSERVATIONS","TMSA_OFFICE_MANAGER","REPORTS","INSPECTOR_THIRD_PARTY",
    "QUESTIONS_EDITOR","RISQ_QUESTIONS_EDITOR","THREADS","MOORING_ANCHORING_INVENTORIES",
    "PORT_CALL_INTELLIGENCE","PORTABLE_LIFTING_APPLIANCES_WIRES","SU_ADMIN","SIRE_QUESTIONS_VIEWER",
    "RISQ_QUESTIONS_VIEWER","PRE_POST_COMPARE"];
  window.testRpcCalls = [];
  const profile = {role:config.role,company_id:"test-company",onboard_status:"active",...config.profile};
  const bundle = {profile,session:{user:{id:"test-user"}}};
  const chain = {
    select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
    in(){return this;},maybeSingle(){return Promise.resolve({data:profile,error:null});},
    single(){return Promise.resolve({data:profile,error:null});},
    then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}
  };
  const sb = {
    auth:{getSession:async()=>({data:{session:bundle.session}}),
      getUser:async()=>({data:{user:bundle.session.user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>Object.create(chain),
    async rpc(name,args) {
      window.testRpcCalls.push({name,args});
      if (name === "csvb_dashboard_list_platform_areas")
        return {data:null,error:{message:"Synthetic test: exercise shipped fallback mappings"}};
      if (name === "csvb_admin_list_companies")
        return {data:[{id:"test-company",company_name:"Fixture Company"}],error:null};
      if (name === "csvb_my_company_modules" || name === "csvb_admin_list_company_modules") {
        await new Promise(r=>setTimeout(r,180));
        return {data:(name === "csvb_admin_list_company_modules" ? ["company_policy"] :
          config.keys || allKeys).map(module_key=>({module_key,is_enabled:true})),error:null};
      }
      if (name === "csvb_my_effective_app_permissions") {
        await new Promise(r=>setTimeout(r,250));
        if(config.permissionError) return {data:null,error:{message:"Fixture permission failure"}};
        return {data:(config.codes || codes).map(module_code=>({module_code,permission_action:"view",is_granted:true})),error:null};
      }
      return {data:[],error:null};
    }
  };
  window.AUTH = {ROLES:{SUPER_ADMIN:"super_admin",COMPANY_ADMIN:"company_admin",
    COMPANY_SUPERINTENDENT:"company_superintendent",VESSEL:"vessel",INSPECTOR:"inspector"},
    ensureSupabase:()=>sb,getSessionUserProfile:async()=>bundle,
    setupAuthButtons:async()=>bundle,requireRoles:async()=>bundle,
    getSession:async()=>bundle.session};
}
const visibleSnapshot = `(()=>{
 const visible=e=>!!e&&getComputedStyle(e).display!=="none"&&!!e.getClientRects().length;
 return {url:location.href,ready:document.querySelector("#csvbPlatformAreaRoot")?.dataset.navigationReady,
  tiles:Array.from(document.querySelectorAll("[data-platform-area-card]")).filter(visible).map(e=>({
   key:e.dataset.platformAreaCard,count:Number(e.querySelector("[data-platform-area-count]").textContent.split(" ")[0])})),
  panels:Array.from(document.querySelectorAll("[data-platform-area-panel]")).filter(visible).map(e=>({
   key:e.dataset.platformAreaPanel,cards:Array.from(e.querySelectorAll("[data-area-module-card]"))
    .filter(visible).map(e=>e.dataset.areaModuleCard)})),
  warning:document.querySelector("#warnBox")?.textContent};
})()`;
async function waitReady() {
  await evaluate(`new Promise((resolve,reject)=>{
    const deadline=Date.now()+18000;
    const t=setInterval(()=>{
      if(document.querySelector("#csvbPlatformAreaRoot")?.dataset.navigationReady==="true"){clearInterval(t);resolve(true);}
      else if(Date.now()>deadline){clearInterval(t);reject(Error(document.querySelector("#warnBox")?.textContent||"not ready"));}
    },50);
  })`);
}
async function load(config,path="/q-dashboard.html") {
  scenario=config;
  errors.length=0;
  await call("Page.navigate",{url:base+path});
  await new Promise(r=>setTimeout(r,180));
  await waitReady();
  return evaluate(visibleSnapshot);
}
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Network.setBypassServiceWorker",{bypass:true});
  await call("Fetch.enable",{patterns:[
    {urlPattern:"*/auth.js*"}, {urlPattern:"*supabase-js*"}, {urlPattern:"*supabase.co/*"}
  ]});
  await call("Page.addScriptToEvaluateOnNewDocument",{source:`
    localStorage.removeItem("csvb_superuser_company_view_id");
    localStorage.removeItem("csvb_superuser_company_view_name");
    localStorage.setItem("csvb_dashboard_selected_platform_area_v6","inspection_libraries_vetting");
    window.testFlashes=[];
    const check=()=>{
      const root=document.getElementById("csvbPlatformAreaRoot");
      if(root&&root.dataset.navigationReady!=="true"&&getComputedStyle(root).display!=="none")
        window.testFlashes.push("root visible before ready");
    };
    new MutationObserver(check).observe(document,{childList:true,subtree:true,attributes:true});
  `});
  for (const role of ["super_admin","company_admin","company_superintendent"]) {
    const summary=await load({role});
    assert.equal(summary.panels.length,0,role+" plain load contains no module panels");
    assert.equal(summary.tiles.length,role==="super_admin"?5:4);
    const keys=summary.tiles.map(e=>e.key);
    for (const tile of summary.tiles) {
      await evaluate(`document.querySelector('[data-platform-area-card="${tile.key}"]').click()`);
      const detail=await evaluate(visibleSnapshot);
      assert.equal(detail.tiles.length,0);
      assert.equal(detail.panels.length,1);
      assert.equal(detail.panels[0].key,tile.key);
      assert.equal(detail.panels[0].cards.length,tile.count,role+" count matches shortcuts");
      assert.equal(new Set(detail.panels[0].cards).size,tile.count,"no duplicate shortcuts");
      await evaluate(`document.querySelector("#csvbBackToPlatformAreas").click()`);
    }
    assert.deepEqual((await evaluate(visibleSnapshot)).tiles.map(e=>e.key),keys);
    assert.deepEqual(await evaluate("window.testFlashes"),[]);
    console.log(`PASS ${role}: areas only, all counts match, grouped detail, Back, no pre-readiness flash`);
  }
  let state=await load({role:"inspector",keys:["company_policy","threads"],codes:["COMPANY_POLICY"]});
  assert.deepEqual(state.tiles.map(e=>e.key),["company_policy"]);
  state=await load({role:"inspector",keys:["company_policy"],codes:["COMPANY_POLICY"]},
    "/q-dashboard.html?area=platform_administration");
  assert.equal(new URL(state.url).searchParams.has("area"),false);
  state=await load({role:"super_admin"},"/q-dashboard.html?area=not_real");
  assert.equal(new URL(state.url).searchParams.has("area"),false);
  console.log("PASS restricted user and invalid/unavailable area safely return to list");
  await evaluate(`document.querySelector('[data-platform-area-card="company_policy"]').click()`);
  await evaluate("history.back()");
  await new Promise(r=>setTimeout(r,200));
  assert.equal((await evaluate(visibleSnapshot)).panels.length,0);
  await evaluate("history.forward()");
  await new Promise(r=>setTimeout(r,200));
  assert.equal((await evaluate(visibleSnapshot)).panels[0].key,"company_policy");
  console.log("PASS browser Back/Forward follows URL");
  await evaluate(`document.querySelector("#csvbBackToPlatformAreas").click()`);
  // Select simulation with actual page handler; temporarily preserve storage in
  // next document (the initialization fixture otherwise starts clean each case).
  await call("Page.addScriptToEvaluateOnNewDocument",{source:`
    if(window.name==="simulation-test") {
      localStorage.setItem("csvb_superuser_company_view_id","test-company");
      localStorage.setItem("csvb_superuser_company_view_name","Fixture Company");
    }
  `});
  await evaluate(`window.name="simulation-test";const s=document.getElementById("csvbCompanyViewSelect");
    s.value="test-company";s.dispatchEvent(new Event("change"));`);
  await new Promise(r=>setTimeout(r,250));
  await waitReady();
  state=await evaluate(visibleSnapshot);
  assert.equal(state.panels.length,0);
  assert.deepEqual(state.tiles.map(e=>e.key),["company_policy","inspection_libraries_vetting"]);
  assert.equal(await evaluate("window.CSVB_DASHBOARD_MODULE_ACCESS.isSimulatedCompany"),true);
  console.log("PASS View-as-company respects enabled keys and existing role-only Assurance rule");
  await evaluate('window.name=""');
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await load({role:"super_admin"},"/q-dashboard.html?area=inspection_libraries_vetting");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),true);
  console.log("PASS narrow viewport has no horizontal overflow");
  assert.deepEqual(await evaluate("window.testFlashes"),[]);
  assert.deepEqual(errors,[]);
  await call("Emulation.clearDeviceMetricsOverride");
  state=await load({role:"vessel",keys:["company_policy","threads"],codes:["COMPANY_POLICY","THREADS"],
    profile:{onboard_access_enabled:false}});
  assert.equal(state.tiles.length,0,"blocked onboard user has no private areas");
  console.log("PASS onboard restrictions remain applied");
  // Exercise the unchanged guard with fixture-only access data: no real writes.
  await evaluate(`(${fixture.toString()})(${JSON.stringify({
    role:"inspector",keys:["company_policy"],codes:["COMPANY_POLICY"]
  })})`);
  await evaluate(`(async()=>{
    const code=await (await fetch("./csvb-module-guard.js")).text();
    history.replaceState({},"","./post_inspection.html");
    (0,eval)(code);
  })()`);
  await new Promise(r=>setTimeout(r,550));
  const guard=await evaluate("window.CSVB_MODULE_GUARD");
  assert.equal(guard.allowed,false);
  assert.equal(guard.companyAllowed,false);
  assert.equal(guard.rankAllowed,false);
  console.log("PASS direct module guard still denies inaccessible Post-Inspection");
} finally {
  await call("Page.close").catch(()=>{});
  socket.close();
}
