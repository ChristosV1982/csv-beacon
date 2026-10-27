// Served-page browser regression with browser-only AUTH/data fixtures.
// Never connects to a real backend or submits application records.
import assert from "node:assert/strict";
import WebSocket from "ws";
const base = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000";
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", {method:"PUT"})).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.once("open", r));
let seq = 0, scenario = {role:"company_admin"};
const pending = new Map(), errors = [];
function call(method, params = {}) {
  return new Promise((resolve,reject) => {
    const id = ++seq; pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
}
ws.on("message", async raw => {
  const msg = JSON.parse(raw);
  if (pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
  if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  if (msg.method !== "Fetch.requestPaused") return;
  const {requestId, request} = msg.params;
  const pathname = new URL(request.url).pathname;
  const body = pathname.endsWith("/auth.js") ? `(${fixture.toString()})(${JSON.stringify(scenario)})` : "";
  await call("Fetch.fulfillRequest",{requestId,responseCode:200,
    responseHeaders:[{name:"Content-Type",value:"application/javascript"}],
    body:Buffer.from(body).toString("base64")});
});
async function evaluate(expression) {
  const r = await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
async function waitFor(expression) {
  await evaluate(`new Promise((resolve,reject)=>{
    const until=Date.now()+12000; const timer=setInterval(()=>{
      if(${expression}) {clearInterval(timer);resolve(true);}
      else if(Date.now()>until){clearInterval(timer);reject(Error("Timed out: "+${JSON.stringify(expression)}));}
    },40);
  })`);
}
function fixture(config) {
  const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
  const profile={role:config.role,vessel_id:config.role==="vessel"?a:null,company_id:"company",onboard_status:"active"};
  const bundle={profile,session:{user:{id:"fixture-user"}}};
  const vessels=[{id:a,name:"ALPHA",hull_number:"101",company_id:"company",is_active:true},
    {id:b,name:"BRAVO",hull_number:"102",company_id:"company",is_active:true}];
  const components=vessels.map((v,i)=>({id:`33333333-3333-4333-8333-33333333333${i}`,
    vessel_id:v.id,vessel_name:v.name,hull_number:v.hull_number,unique_id:`WIRE-${i+1}`,
    component_type_id:"type",component_type_code:"WIRE",component_type_name:"Mooring Wire",
    current_status:"active",current_status_label:"Active",company_id:"company",location_mode:"fitted"}));
  const tables={vessels,mai_component_types:[{id:"type",name:"Mooring Wire",code:"WIRE",is_active:true}],
    mai_status_options:[{status_key:"active",status_label:"Active",is_active:true}],
    mai_v_components_list:components,mai_location_options:[],
    mai_v_component_lifecycle_status:components.map((c,i)=>({component_id:c.id,lifecycle_status:i?"ok":"overdue",rule_label:"Inspection",sort_order:1})),
    mai_v_component_usage_summary:[],mai_v_component_particulars_lock_status:[],
    mai_v_operation_type_definitions:[],mai_v_vessel_operations_list:[]};
  window.fixtureRequests=[];
  function from(table) {
    const filters=[];
    const q={select(){return q},order(){return q},limit(){return q},
      eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},
      maybeSingle:async()=>({data:profile,error:null}),
      then(resolve,reject){window.fixtureRequests.push({table});
        const rows=(tables[table]||[]).filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));
        return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};
    return q;
  }
  const sb={from,auth:{getSession:async()=>({data:{session:bundle.session}}),
    getUser:async()=>({data:{user:bundle.session.user}})},
    rpc:async(name,args)=>{
      window.fixtureRequests.push({name,args});
      if(name==="csvb_my_effective_app_permissions") return {data:["view","edit"].filter(x=>!config.readOnly||x==="view")
        .map(permission_action=>({module_code:"MOORING_ANCHORING_INVENTORIES",permission_action,is_granted:true})),error:null};
      if(name==="csvb_my_company_modules") return {data:[{module_key:"mooring_anchoring_inventories",is_enabled:true}],error:null};
      return {data:[],error:null};
    }};
  window.AUTH={ensureSupabase:()=>sb,getSessionUserProfile:async()=>bundle,
    setupAuthButtons:async()=>bundle};
}
async function load(role="company_admin", path="/mooring-anchoring-inventories-v4.html", extra={}) {
  scenario={role,...extra}; errors.length=0;
  await call("Page.navigate",{url:base+path});
  await waitFor(path.includes("operations.html") ? `document.getElementById("operationVessel")?.options.length>1`
    : `document.getElementById("viewInventoryBtn")?.disabled===false`);
  await new Promise(r=>setTimeout(r,300));
}
try {
  await call("Page.enable"); await call("Runtime.enable");
  await call("Network.enable"); await call("Network.setCacheDisabled",{cacheDisabled:true});
  await call("Network.setBypassServiceWorker",{bypass:true});
  await call("Fetch.enable",{patterns:[{urlPattern:"*/auth.js*"},{urlPattern:"*supabase-js*"},{urlPattern:"*supabase.co/*"}]});
  await load();
  assert.equal(await evaluate(`document.getElementById("maiInventoryWorkspace").hidden`),true);
  await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"2");
  assert.equal(await evaluate(`document.querySelectorAll("[data-mai-delete-component]").length`),2);
  await click("clearVesselsBtn"); await click("reloadBtn");
  await new Promise(r=>setTimeout(r,250));
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"0","None survives Reload");
  await click("selectAllVesselsBtn");
  await evaluate(`const second=document.querySelectorAll("[data-vessel-check]")[1];second.click()`);
  assert.equal(await evaluate(`window.CSVB_MAI_INVENTORY_CONTEXT.selectedVesselId()`),"11111111-1111-4111-8111-111111111111");
  await evaluate(`document.getElementById("searchInput").value="WIRE-1";document.getElementById("searchInput").dispatchEvent(new Event("input"))`);
  await click("backToTasksBtn"); await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("searchInput").value`),"WIRE-1");
  await click("backToTasksBtn"); await click("registerComponentBtn");
  await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),"11111111-1111-4111-8111-111111111111");
  await click("maiRegCancelBtn");
  await click("viewInventoryBtn"); await click("clearSearchBtn"); await click("backToTasksBtn");
  await click("registerComponentBtn"); await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),"","Multiple vessels require explicit selection");
  await click("maiRegCancelBtn"); await click("reviewDueBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1");
  await click("backToTasksBtn"); await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"2");
  await evaluate(`document.querySelectorAll("[data-vessel-check]")[1].click()`);
  await click("backToTasksBtn"); await click("recordOperationBtn");
  await waitFor(`location.pathname.endsWith("operations.html") && document.getElementById("operationVessel")?.value==="11111111-1111-4111-8111-111111111111"`);
  console.log("PASS office multi/single context, stable None, filters/session state, registration, due view and operations handoff");
  await load("company_admin","/mooring-anchoring-operations.html?vessel_id=not-authorized");
  assert.equal(await evaluate(`document.getElementById("operationVessel").value`),"");
  await load("vessel"); await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1");
  assert.equal(await evaluate(`document.getElementById("vesselDropdown").hidden`),true);
  assert.equal(await evaluate(`document.getElementById("componentsTbody").textContent.includes("BRAVO")`),false);
  await click("backToTasksBtn"); await click("registerComponentBtn");
  await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").disabled`),true);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").options.length`),2);
  await click("maiRegCancelBtn"); await click("recordOperationBtn");
  await waitFor(`document.getElementById("operationVessel")?.disabled===true`);
  assert.equal(await evaluate(`document.getElementById("operationVessel").value`),"11111111-1111-4111-8111-111111111111");
  console.log("PASS vessel inventory/registration/operations restricted context; invalid office context ignored");
  await load("vessel","/mooring-anchoring-inventories-v4.html",{readOnly:true});
  assert.equal(await evaluate(`getComputedStyle(document.getElementById("registerComponentBtn")).display`),"none");
  assert.equal(await evaluate(`getComputedStyle(document.getElementById("recordOperationBtn")).display`),"none");
  console.log("PASS read-only action permissions retained");
  await load();
  for(const width of [1440,390]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<600});
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    const {data}=await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    const {writeFile}=await import("node:fs/promises");
    await writeFile(`/tmp/mai-task-landing-${width}.jpg`,Buffer.from(data,"base64"));
    await click("viewInventoryBtn");
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    await click("backToTasksBtn");
  }
  assert.deepEqual(errors,[]);
  console.log("PASS desktop/mobile layout; no runtime exceptions; no real backend writes");
} catch(error) {
  console.error(await evaluate(`({url:location.href,warn:document.getElementById("warnBox")?.textContent,
    vessel:document.getElementById("operationVessel")?.value,requests:window.fixtureRequests,
    overflow:[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,id:e.id,class:e.className,width:e.getBoundingClientRect().width})),width:innerWidth})`));
  console.error(errors);
  throw error;
} finally {
  await call("Page.close").catch(()=>{});
  ws.close();
}
