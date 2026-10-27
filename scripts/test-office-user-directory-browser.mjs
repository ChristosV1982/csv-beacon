// Browser fixture only. Loads the served directory/editor scripts; prevents
// automatic auth/network initialization in this disposable browser tab only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let sequence = 0;
const pending = new Map();
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.on("message", async raw => {
  const message = JSON.parse(raw);
  if (message.id && pending.has(message.id)) {
    const p = pending.get(message.id); pending.delete(message.id);
    message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result);
  }
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request, resourceType } = message.params;
  const url = new URL(request.url);
  if (url.host === "127.0.0.1:3000" && /\/su-admin\.js\?/.test(url.href)) {
    const source = readFileSync("public/su-admin.js", "utf8");
    const boot = "init().catch((e) => showWarn(String(e?.message || e)));";
    assert(source.includes(boot));
    await call("Fetch.fulfillRequest", {
      requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/javascript" }],
      body: Buffer.from(source.replace(boot, "window.__directoryFixtureBooted = true;")).toString("base64")
    });
  } else if (url.host === "127.0.0.1:3000" && (resourceType !== "Script" ||
    /\/(csvb-office-user-assignment|csvb-user-edit-u05)\.js\?/.test(url.href))) {
    await call("Fetch.continueRequest", { requestId });
  } else {
    await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: "" });
  }
});
async function evalJS(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const sleep = () => new Promise(resolve => setTimeout(resolve, 180));
try {
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.alert=()=>{};
    window.AUTH={ensureSupabase:()=>({
      rpc:(...args)=>window.__fixtureSb.rpc(...args),
      from:(...args)=>window.__fixtureSb.from(...args)
    })};
  ` });
  await call("Page.navigate", { url: "http://127.0.0.1:3000/su-admin.html" });
  for (let i=0;i<45;i++) {
    if (await evalJS("!!window.__directoryFixtureBooted && !!window.CSVBOfficeUserAssignment")) break;
    await sleep();
  }
  assert.equal(await evalJS("!!window.__directoryFixtureBooted && !!window.CSVBOfficeUserAssignment"), true);
  const fixture = await evalJS(`(() => {
    const company="22222222-2222-4222-8222-222222222222", id="11111111-1111-4111-8111-111111111111";
    const ago="office_draft_90da2d69479a85f4ef3999c82d6b8909";
    const profiles=[
      {id,username:"AGA",role:"company_admin",position:"Marine Superintendent",
        office_role_code:ago,office_access_profile_code:"company_administrator_access",
        first_name:"Test",last_name:"Office",company_id:company,is_active:true,is_disabled:false},
      {id:"33333333-3333-4333-8333-333333333333",username:"VESSEL_TEST",role:"vessel",
        position:"Master",vessel_id:"44444444-4444-4444-8444-444444444444",
        company_id:company,is_active:true,is_disabled:false}
    ];
    const rows=()=>{
      return profiles.map(p=>({id:p.id,username:p.username,company_id:p.company_id,
        company_name:"Fixture company",role_name:p.role,user_position:p.position,
        vessel_id:p.vessel_id || null,vessel_name:p.vessel_id?"Fixture vessel":null,
        is_active:p.is_active,is_disabled:p.is_disabled,force_password_reset:false,
        office_role_code:p.office_role_code || null,
        office_role_label:p.office_role_code?"Marine Coordinator":null,
        office_access_profile_code:p.office_access_profile_code || null,
        office_access_profile_label:p.office_access_profile_code?"Company Administrator Access":null,
        office_profile_is_role_default:p.office_access_profile_code=== "company_administrator_access" ? true:null,
        office_permission_enforcement_active:p.office_access_profile_code ? false:null}));
    };
    window.__fixture={profiles,rows,readCount:0,writeCount:0};
    window.__fixtureSb={
      from:()=>({select(){return this},eq(){return this},limit(){return this},
        order:async()=>({data:[]}),maybeSingle:async()=>({data:structuredClone(profiles[0])})}),
      rpc:async(name,args={})=>{
        if(name==="csvb_admin_list_users_by_company_v2"){
          __fixture.readCount++;return {data:rows(),error:null};
        }
        if(name==="csvb_admin_office_user_options")return {data:{
          profile:structuredClone(profiles[0]),company_name:"Fixture company",
          roles:[{code:ago,display_name:"Marine Coordinator",
            default_access_profile_code:"company_administrator_access"}],
          access_profiles:[{code:"company_administrator_access",display_name:"Company Administrator Access",is_active:false}]
        },error:null};
        if(name==="csvb_admin_update_office_user"){
          __fixture.writeCount++;profiles[0].office_role_code=args.p_office_role_code;
          profiles[0].office_access_profile_code=args.p_access_profile_code;
          Object.assign(profiles[0],args.p_changes);
          return {data:{ok:true,profile:structuredClone(profiles[0])},error:null};
        }
        throw Error("Unexpected fixture RPC: "+name);
      }
    };
    window.AUTH.ensureSupabase=()=>window.__fixtureSb;
    window.confirm=()=>true;
    state.companiesLoaded=true;
    state.companies=[{id:company,company_name:"Fixture company"}];
    state.vessels=[{id:profiles[1].vessel_id,name:"Fixture vessel"}];
    initSearch();
    return window.CSVB_REFRESH_USER_DIRECTORY().then(()=>true);
  })()`);
  assert.equal(fixture, true);
  for (let i=0;i<30;i++) {
    if (await evalJS('[...document.querySelectorAll("#usersBody button")].some(b=>b.textContent==="Edit")')) break;
    await sleep();
  }
  const agaRow = '#usersBody tr:first-child';
  assert.match(await evalJS(`document.querySelector("${agaRow}").innerText`), /Marine Coordinator/);
  assert.match(await evalJS(`document.querySelector("${agaRow}").innerText`), /Company Administrator Access/);
  assert.match(await evalJS(`document.querySelector("${agaRow}").innerText`), /Prepared \/ enforcement pending/);
  assert.match(await evalJS(`document.querySelector("${agaRow}").innerText`), /Marine Superintendent/);
  assert.equal(await evalJS(`document.querySelector("${agaRow}").innerText.includes("company_admin")`), false);
  assert.equal(await evalJS(`document.querySelector("${agaRow} details").textContent.includes("company_admin")`), true);
  assert.match(await evalJS('document.querySelector("#usersBody tr:nth-child(2)").innerText'), /Master/);
  assert.equal(await evalJS('document.querySelector("#u_filter_role").value'), "");
  assert.equal(await evalJS('!![...u_filter_role.options].find(o=>o.textContent==="Marine Coordinator")'), true);
  await evalJS('u_filter_profile.value="company_administrator_access";u_filter_profile.dispatchEvent(new Event("change"))');
  assert.equal(await evalJS('document.querySelectorAll("#usersBody tr").length'), 1);
  await evalJS('u_filter_profile.value="";u_filter_profile.dispatchEvent(new Event("change"));u_search.value="Company Administrator Access";u_search.dispatchEvent(new Event("input"))');
  assert.equal(await evalJS('document.querySelectorAll("#usersBody tr").length'), 1);
  await evalJS('u_search.value="";u_search.dispatchEvent(new Event("input"))');
  for(let i=0;i<35;i++){
    if(await evalJS('[...document.querySelectorAll("#usersBody tr:first-child button")].some(b=>b.textContent==="Edit")')) break;
    await sleep();
  }
  assert.equal(await evalJS('[...document.querySelectorAll("#usersBody tr:first-child button")].some(b=>b.textContent==="Edit")'),true);
  await evalJS('[...document.querySelectorAll("#usersBody tr:first-child button")].find(b=>b.textContent==="Edit").click()');
  for(let i=0;i<30;i++){
    if(await evalJS('!!document.getElementById("officeUserEditForm")')) break;
    await sleep();
  }
  assert.equal(await evalJS('!!document.getElementById("officeUserEditForm")'), true);
  await evalJS('officeChangeReason.value="Browser fixture save";officeUserEditForm.requestSubmit()');
  for(let i=0;i<30;i++){
    if(await evalJS('__fixture.writeCount===1 && __fixture.readCount>=2')) break;
    await sleep();
  }
  assert.equal(await evalJS('__fixture.writeCount'), 1);
  assert.equal(await evalJS('__fixture.readCount>=2'), true);
  assert.match(await evalJS(`document.querySelector("${agaRow}").innerText`), /Marine Coordinator/);
  assert.match(await evalJS(`document.querySelector("${agaRow}").innerText`), /Company Administrator Access/);
  writeFileSync("/tmp/csvb-office-directory-fixture.png",
    Buffer.from((await call("Page.captureScreenshot",{format:"png"})).data,"base64"));
  console.log("PASS: served directory scripts display prepared role/profile and legacy position/security detail; vessel rank, profile filter, search and Edit-save immediate reload work. Browser writes were in-memory only.");
} finally {
  await call("Page.close"); ws.close();
}
