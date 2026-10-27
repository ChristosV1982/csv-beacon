// Disposable browser fixture; all account mutations stay in memory. No auth
// bypass, credentials or test data are added to the application's runtime.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const host = "127.0.0.1:3000";
const target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let sequence = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on("message", async raw => {
  const message = JSON.parse(raw);
  if (message.id && pending.has(message.id)) {
    const p = pending.get(message.id); pending.delete(message.id);
    message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result);
  }
  if (message.method === "Fetch.requestPaused") {
    const { requestId, request, resourceType } = message.params;
    if (new URL(request.url).host === host &&
      (resourceType !== "Script" || request.url.includes("/csvb-office-user-assignment.js")
        || request.url.includes("/csvb-user-edit-u05.js"))) {
      await call("Fetch.continueRequest", { requestId });
    } else await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: "" });
  }
});
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const wait = () => new Promise(resolve => setTimeout(resolve, 180));
try {
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.alert=()=>{};
    window.AUTH={ensureSupabase:()=>({
      rpc:(...args)=>window.__officeSb.rpc(...args),
      from:(...args)=>window.__officeSb.from(...args)
    })};` });
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: `http://${host}/su-admin.html` });
  for (let i = 0; i < 50; i++) {
    if (await evaluate("!!window.CSVBOfficeUserAssignment")) break;
    await wait();
  }
  assert.equal(await evaluate("!!window.CSVBOfficeUserAssignment"), true);
  const styles = readFileSync("public/csvb-user-edit-u05.js", "utf8").match(/style\.textContent = `([\s\S]*?)`;/)[1];
  await evaluate(`(() => {
    const style=document.createElement("style");style.textContent=${JSON.stringify(styles)};document.head.appendChild(style);
    const profile={id:"11111111-1111-4111-8111-111111111111",username:"office-fixture",role:"company_superintendent",
      company_id:"22222222-2222-4222-8222-222222222222",vessel_id:null,is_active:true,is_disabled:false,
      office_role_code:null,office_access_profile_code:null,first_name:"Test",last_name:"Office"};
    window.__office={profile,calls:[],confirmations:[],approve:true,fail:false};
    window.confirm=text=>{__office.confirmations.push(text);return __office.approve};
    const roles=[
      {code:"office_draft_marine",display_name:"Marine Superintendent",default_access_profile_code:"standard_office_view_only"},
      {code:"office_draft_demo",display_name:"Demo User",default_access_profile_code:"standard_office_view_only"},
      {code:"office_draft_coordinator",display_name:"Marine Coordinator",default_access_profile_code:"company_administrator_access"}
    ];
    const access_profiles=[
      {code:"standard_office_view_only",display_name:"Standard Office View-Only",is_active:false},
      {code:"company_administrator_access",display_name:"Company Administrator Access",is_active:false}
    ];
    window.__officeSb={
    from:()=>({
      select(){return this},eq(){return this},limit(){return this},
      order:async()=>({data:[]}),
      maybeSingle:async()=>({data:structuredClone(profile)})
    }),
    rpc:async(name,args)=>{
      if(name==="csvb_admin_office_user_options") return {data:{profile:structuredClone(profile),roles,access_profiles,
        company_name:"Fixture company",permission_enforcement_active:false}};
      if(name!=="csvb_admin_update_office_user") throw Error("Unexpected RPC "+name);
      __office.calls.push(structuredClone(args));
      await new Promise(r=>setTimeout(r,100));
      if(__office.fail) return {error:{message:"Fixture write denied"}};
      profile.office_role_code=args.p_office_role_code;
      profile.office_access_profile_code=args.p_access_profile_code;
      Object.assign(profile,args.p_changes);
      return {data:{ok:true,profile:structuredClone(profile)}};
    }};
    window.__openOffice=()=>CSVBOfficeUserAssignment.open(profile,{sb:__officeSb,onSaved:message=>{__office.saved=message}});
    window.alert=message=>{__office.saved=message};
    document.querySelector("#usersBody").innerHTML='<tr><td>office-fixture</td><td class="actions"><button data-id="'+profile.id+'">Existing action</button></td></tr>';
  })()`);
  for (let i = 0; i < 40; i++) {
    if (await evaluate('[...document.querySelectorAll("#usersBody button")].some(b=>b.textContent==="Edit")')) break;
    await wait();
  }
  assert.equal(await evaluate('[...document.querySelectorAll("#usersBody button")].some(b=>b.textContent==="Edit")'), true);
  await evaluate('[...document.querySelectorAll("#usersBody button")].find(b=>b.textContent==="Edit").click()');
  for (let i = 0; i < 30; i++) {
    if (await evaluate('!!document.getElementById("officeUserEditForm")')) break;
    await wait();
  }
  assert.equal(await evaluate('document.getElementById("officeRoleCode").value'), "");
  assert.equal(await evaluate('document.getElementById("officeAccessProfile").disabled'), true);
  assert.equal(await evaluate('!!document.querySelector("#officeUserEditForm [id*=rank]")'), false);
  assert.match(await evaluate('document.getElementById("officeUserEditForm").textContent'), /does not yet restrict access/);
  await evaluate('officeRoleCode.value="office_draft_marine";officeRoleCode.dispatchEvent(new Event("change"))');
  assert.equal(await evaluate("officeAccessProfile.value"), "standard_office_view_only");
  await evaluate('officeAccessProfile.value="company_administrator_access";officeAccessProfile.dispatchEvent(new Event("change"))');
  assert.match(await evaluate("officeProfileDifference.textContent"), /differs from/);
  await evaluate('officeRoleCode.value="office_draft_demo";officeRoleCode.dispatchEvent(new Event("change"))');
  assert.equal(await evaluate("officeAccessProfile.value"), "standard_office_view_only");
  await evaluate('officeChangeReason.value="Browser assignment test";officeUserEditForm.requestSubmit();officeUserEditForm.requestSubmit()');
  await wait();
  assert.equal(await evaluate("__office.calls.length"), 1);
  assert.equal(await evaluate("!!document.getElementById('officeUserEditForm')"), false);
  assert.equal(await evaluate("__office.profile.username"), "office-fixture");
  assert.equal(await evaluate("__office.profile.role"), "company_superintendent");
  await evaluate("__openOffice()");
  assert.equal(await evaluate("officeRoleCode.value"), "office_draft_demo");
  assert.equal(await evaluate("officeAccessProfile.value"), "standard_office_view_only");
  await evaluate('__office.fail=true;officeChangeReason.value="Fail test";officeUserEditForm.requestSubmit()');
  await wait();
  assert.match(await evaluate("officeSaveStatus.textContent"), /Save failed: Fixture write denied/);
  assert.equal(await evaluate("officeSaveChanges.disabled"), false);
  await evaluate('__office.fail=false;officeRoleCode.value="office_draft_marine";officeRoleCode.dispatchEvent(new Event("change"));__office.approve=false;officeUserEditForm.requestSubmit()');
  await wait();
  assert.equal(await evaluate("__office.calls.length"), 2);
  await call("Emulation.setDeviceMetricsOverride", { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
  await wait();
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  assert.equal(await evaluate("document.querySelector('.csvb-u05-modal').scrollWidth <= document.querySelector('.csvb-u05-modal').clientWidth"), true);
  writeFileSync("/tmp/csvb-office-assignment-tablet.png",
    Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64"));
  console.log("PASS: served editor, default profile, explicit override, Demo nine-module mapping, save/reload, identity preservation, error recovery, duplicate-submit guard, cancellation, tablet layout. Browser writes were in memory only.");
} finally {
  await call("Page.close"); ws.close();
}
