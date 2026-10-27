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
  let vessels=[{id:a,name:"ALPHA",hull_number:"101",company_id:"company",is_active:true},
    {id:b,name:"BRAVO",hull_number:"102",company_id:"company",is_active:true}];
  const components=vessels.map((v,i)=>({id:`33333333-3333-4333-8333-33333333333${i}`,
    vessel_id:v.id,vessel_name:v.name,hull_number:v.hull_number,unique_id:`WIRE-${i+1}`,
    component_type_id:"type",component_type_code:"WIRE",component_type_name:"Mooring Wire",
    current_status:"active",current_status_label:"Active",company_id:"company",location_mode:"fitted"}));
  if (config.multiType) components.push({...components[0],id:"55555555-5555-4555-8555-555555555555",
    unique_id:"ROPE-1",component_type_id:"type2",component_type_code:"ROPE",component_type_name:"Mooring Rope"});
  if (config.emptyVessel) vessels.push({id:"44444444-4444-4444-8444-444444444444",name:"CHARLIE",company_id:"company",is_active:true});
  if (config.omitB) vessels = vessels.filter(v => v.id !== b);
  const tables={vessels,mai_component_types:[{id:"type",name:"Mooring Wire",code:"WIRE",is_active:true},
    ...(config.multiType ? [{id:"type2",name:"Mooring Rope",code:"ROPE",is_active:true}] : [])],
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
    : `document.getElementById("maiContextSingleVessel")?.options.length>1`);
  await new Promise(r=>setTimeout(r,300));
}
async function select(id,value) {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};
    document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event("change",{bubbles:true}))`);
}
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const contextKey = "csvb_mai_context_v1:fixture-user:company";
try {
  await call("Page.enable"); await call("Runtime.enable");
  await call("Network.enable"); await call("Network.setCacheDisabled",{cacheDisabled:true});
  await call("Network.setBypassServiceWorker",{bypass:true});
  await call("Fetch.enable",{patterns:[{urlPattern:"*/auth.js*"},{urlPattern:"*supabase-js*"},{urlPattern:"*supabase.co/*"}]});
  await call("Page.navigate",{url:base+"/offline.html"});
  await new Promise(r=>setTimeout(r,400));
  await evaluate(`sessionStorage.removeItem(${JSON.stringify(contextKey)})`);
  await load();
  assert.equal(await evaluate(`document.getElementById("maiSingleVesselDialog").parentElement.tagName`),"MAIN","Task dialog is outside hidden inventory workspace");
  assert.equal(await evaluate(`document.querySelector(".inventory-list-panel").parentElement.id`),"maiInventoryWorkspace");
  assert.equal(await evaluate(`document.getElementById("maiInventoryWorkspace").hidden`),true);
  assert.equal(await evaluate(`document.getElementById("maiTaskLanding").hidden`),true,"Choose office context before tasks");
  assert.equal(await evaluate(`document.getElementById("maiOfficePerspective").hidden`),false);
  assert.equal(await evaluate(`document.getElementById("maiOfficeContext").hidden`),true);
  await click("maiPerspectiveVessel");
  assert.equal(await evaluate(`document.getElementById("maiOfficeContext").hidden`),false);
  await select("maiContextMode","all");
  assert.equal(await evaluate(`document.getElementById("maiTaskLanding").hidden`),false);
  assert.equal(await evaluate(`document.getElementById("maiCurrentContext").textContent`),"Current view: By Vessel — All accessible vessels");
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
  await waitFor(`document.getElementById("maiSingleVesselDialog").open`);
  await select("maiTaskVessel",A); await click("maiTaskVesselContinue");
  await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),A);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").disabled`),true);
  await click("maiRegCancelBtn");
  await click("viewInventoryBtn"); await click("clearSearchBtn");
  assert.equal(await evaluate(`window.CSVB_MAI_INVENTORY_CONTEXT.selectedVesselId()`),A,"Clear filters preserves vessel context");
  await click("backToTasksBtn"); await select("maiContextMode","all");
  await click("registerComponentBtn");
  await waitFor(`document.getElementById("maiSingleVesselDialog").open`);
  assert.equal(await evaluate(`!!document.getElementById("maiRegVessel")`),false,"No registration modal before choosing one vessel");
  await click("maiTaskVesselContinue");
  assert.match(await evaluate(`document.getElementById("maiTaskVesselError").textContent`),/Select one/);
  await click("maiTaskVesselCancel");
  assert.equal(await evaluate(`document.getElementById("maiContextMode").value`),"all","Cancel preserves scope");
  await click("registerComponentBtn");
  await select("maiTaskVessel",B); await click("maiTaskVesselContinue");
  await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),B);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").disabled`),true);
  await click("maiRegCancelBtn");
  assert.match(await evaluate(`document.getElementById("maiCurrentContext").textContent`),/BRAVO/);
  await select("maiContextMode","all"); await click("reviewDueBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1");
  await click("backToTasksBtn"); await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"2");
  await select("maiContextMode","multiple");
  await evaluate(`document.querySelectorAll("[data-vessel-check]")[1].click()`);
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1");
  await evaluate(`document.querySelectorAll("[data-vessel-check]")[1].click()`);
  await click("backToTasksBtn"); await click("recordOperationBtn");
  await waitFor(`document.getElementById("maiSingleVesselDialog").open`);
  assert.equal(await evaluate(`location.pathname.endsWith("inventories-v4.html")`),true,"No operations navigation before single-vessel choice");
  await select("maiTaskVessel",A); await click("maiTaskVesselContinue");
  await waitFor(`location.pathname.endsWith("operations.html") && document.getElementById("operationVessel")?.value==="11111111-1111-4111-8111-111111111111"`);
  await load();
  assert.equal(await evaluate(`document.getElementById("maiContextMode").value`),"single");
  assert.equal(await evaluate(`window.CSVB_MAI_INVENTORY_CONTEXT.selectedVesselId()`),A,"Return from operations restores context");
  await select("maiContextSingleVessel",B);
  await load();
  assert.equal(await evaluate(`window.CSVB_MAI_INVENTORY_CONTEXT.selectedVesselId()`),B,"Page reload restores context");
  await load("company_admin","/mooring-anchoring-inventories-v4.html",{omitB:true});
  assert.equal(await evaluate(`window.CSVB_MAI_INVENTORY_CONTEXT.selectedVesselId()`),"","Revoked vessel is not restored");
  assert.equal(await evaluate(`document.getElementById("maiTaskLanding").hidden`),true);
  await load("company_admin","/mooring-anchoring-inventories-v4.html",{emptyVessel:true});
  await select("maiContextSingleVessel","44444444-4444-4444-8444-444444444444");
  await click("registerComponentBtn"); await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),"44444444-4444-4444-8444-444444444444","Can register first component on accessible vessel with no inventory");
  await click("maiRegCancelBtn");
  console.log("PASS office context-first, All/multiple/single, gated tasks/cancel, context restore/revalidation, empty-inventory vessel");
  await load("company_admin","/mooring-anchoring-operations.html?vessel_id=not-authorized");
  assert.equal(await evaluate(`document.getElementById("operationVessel").value`),"");
  await load("vessel"); await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("maiOfficePerspective").hidden`),true);
  assert.equal(await evaluate(`document.getElementById("maiTypeContext").hidden`),true);
  await click("maiPerspectiveType");
  assert.equal(await evaluate(`document.getElementById("maiTypeContext").hidden`),true,"Vessel role cannot activate type perspective");
  assert.equal(await evaluate(`document.getElementById("maiOfficeContext").hidden`),true);
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
  assert.equal(await evaluate(`document.getElementById("operationVessel").textContent.includes("BRAVO")`),false,"Operations selector never exposes another vessel");
  console.log("PASS vessel inventory/registration/operations restricted context; invalid office context ignored");
  await load("vessel","/mooring-anchoring-inventories-v4.html",{readOnly:true});
  assert.equal(await evaluate(`getComputedStyle(document.getElementById("registerComponentBtn")).display`),"none");
  assert.equal(await evaluate(`getComputedStyle(document.getElementById("recordOperationBtn")).display`),"none");
  await load("inspector","/mooring-anchoring-inventories-v4.html",{readOnly:true});
  await select("maiContextMode","all");
  assert.equal(await evaluate(`document.getElementById("maiTaskLanding").hidden`),false);
  assert.equal(await evaluate(`getComputedStyle(document.getElementById("registerComponentBtn")).display`),"none");
  await load("inspector");
  await select("maiContextMode","single");
  await select("maiContextSingleVessel",A);
  await click("registerComponentBtn"); await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),A,"Existing non-admin module edit grant still works");
  await click("maiRegCancelBtn");
  console.log("PASS read-only action permissions retained");
  await load("company_admin","/mooring-anchoring-inventories-v4.html",{multiType:true});
  await click("maiPerspectiveVessel"); await select("maiContextMode","single"); await select("maiContextSingleVessel",B);
  await click("maiPerspectiveType");
  assert.equal(await evaluate(`document.getElementById("maiTaskLanding").hidden`),true,"Choose type before tasks");
  assert.equal(await evaluate(`document.getElementById("maiContextComponentType").options.length`),3);
  await select("maiContextComponentType","type");
  assert.equal(await evaluate(`document.getElementById("maiCurrentContext").textContent`),"Current view: By Component Type — Mooring Wire — All accessible vessels");
  await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"2","Wires across both accessible vessels");
  assert.equal(await evaluate(`document.getElementById("componentsTbody").textContent.includes("ROPE-1")`),false);
  assert.equal(await evaluate(`document.getElementById("selectAllTypesBtn").disabled`),true);
  assert.equal(await evaluate(`document.querySelector("[data-type-check]").disabled`),true);
  await click("clearSearchBtn"); await click("selectAllTypesBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"2","Cannot clear/broaden perspective constraint");
  await select("maiContextMode","multiple"); await evaluate(`document.querySelectorAll("[data-vessel-check]")[1].click()`);
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1","Type view supports vessel filtering");
  await evaluate(`document.getElementById("searchInput").value="ROPE";document.getElementById("searchInput").dispatchEvent(new Event("input"))`);
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"0");
  await click("clearSearchBtn"); await select("maiContextMode","all");
  await click("backToTasksBtn"); await click("reviewDueBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1","Due review preserves type constraint");
  await click("backToTasksBtn"); await click("registerComponentBtn");
  await waitFor(`document.getElementById("maiSingleVesselDialog").open`);
  await select("maiTaskVessel",A); await click("maiTaskVesselContinue");
  await waitFor(`!!document.getElementById("maiRegVessel")`);
  assert.equal(await evaluate(`document.getElementById("maiRegVessel").value`),A);
  await click("maiRegCancelBtn");
  assert.equal(await evaluate(`document.getElementById("maiContextMode").value`),"all","Vessel-specific task does not replace fleet type context");
  await load("company_admin","/mooring-anchoring-inventories-v4.html",{multiType:true});
  assert.equal(await evaluate(`document.getElementById("maiPerspectiveType").checked`),true);
  assert.equal(await evaluate(`document.getElementById("maiContextComponentType").value`),"type","Restore type perspective after returning");
  await click("maiPerspectiveVessel");
  assert.equal(await evaluate(`window.CSVB_MAI_INVENTORY_CONTEXT.selectedVesselId()`),B,"By Vessel context preserved separately");
  await click("maiPerspectiveType"); await select("maiContextComponentType","type2");
  await click("viewInventoryBtn");
  assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"1","Second type restricts inventory");
  await click("backToTasksBtn"); await click("recordOperationBtn");
  await waitFor(`document.getElementById("maiSingleVesselDialog").open`);
  await select("maiTaskVessel",B); await click("maiTaskVesselContinue");
  await waitFor(`location.pathname.endsWith("operations.html") && document.getElementById("operationVessel")?.value===${JSON.stringify(B)}`);
  await load("company_admin","/mooring-anchoring-inventories-v4.html",{multiType:true});
  assert.equal(await evaluate(`document.getElementById("maiContextComponentType").value`),"type2");
  await load("company_admin"); // type2 is no longer in the authorized type lookup.
  assert.equal(await evaluate(`document.getElementById("maiContextComponentType").value`),"");
  assert.equal(await evaluate(`document.getElementById("maiTaskLanding").hidden`),true,"Stale type never broadens to unrestricted inventory");
  console.log("PASS component-type fleet view, hard constraint, vessel/search/due filters, task gating, perspective restore and stale-type rejection");
  await load();
  await click("maiPerspectiveVessel");
  await select("maiContextMode","all");
  for(const width of [1440,390]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<600});
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    const {data}=await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    const {writeFile}=await import("node:fs/promises");
    await writeFile(`/tmp/mai-task-landing-${width}.jpg`,Buffer.from(data,"base64"));
    await click("viewInventoryBtn");
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    await click("backToTasksBtn");
    await click("recordOperationBtn");
    await waitFor(`document.getElementById("maiSingleVesselDialog").open`);
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await evaluate(`document.getElementById("maiSingleVesselDialog").getBoundingClientRect().height>100`),true);
    assert.equal(await evaluate(`document.getElementById("maiSingleVesselDialog").getBoundingClientRect().right<=innerWidth`),true);
    const image = await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    await writeFile(`/tmp/mai-context-gate-${width}.jpg`,Buffer.from(image.data,"base64"));
    await click("maiTaskVesselCancel");
  }
  await load("company_admin","/mooring-anchoring-inventories-v4.html",{multiType:true});
  await click("maiPerspectiveType"); await select("maiContextComponentType","type");
  for (const width of [1440,390]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    const {writeFile}=await import("node:fs/promises");
    const landing = await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    await writeFile(`/tmp/mai-type-perspective-${width}.jpg`,Buffer.from(landing.data,"base64"));
    await click("viewInventoryBtn");
    assert.equal(await evaluate(`document.getElementById("statTotal").textContent`),"2");
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true);
    const inventory = await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    await writeFile(`/tmp/mai-type-inventory-${width}.jpg`,Buffer.from(inventory.data,"base64"));
    await click("backToTasksBtn");
  }
  assert.deepEqual(errors,[]);
  assert.equal(await evaluate(`window.fixtureRequests.filter(r=>r.name&&!r.name.startsWith("csvb_my_")).length`),0,"Context changes do not issue per-vessel RPCs");
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
