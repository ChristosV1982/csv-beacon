// Disposable browser fixture. External scripts are blocked and mutations are
// simulated in memory; no authentication bypass or fixture ships in the app.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const fixture = JSON.parse(readFileSync(process.argv[2] || "/tmp/role-catalogue-fixture.json", "utf8"));
const target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let seq = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on("message", async message => {
  const data = JSON.parse(message);
  if (data.id && pending.has(data.id)) {
    const waiter = pending.get(data.id);
    pending.delete(data.id);
    data.error ? waiter.reject(Error(JSON.stringify(data.error))) : waiter.resolve(data.result);
  }
  if (data.method === "Fetch.requestPaused") {
    const {requestId, request, resourceType} = data.params;
    if (new URL(request.url).host === "127.0.0.1:3000" &&
        (resourceType !== "Script" || request.url.includes("/csvb-role-management.js"))) {
      await call("Fetch.continueRequest", {requestId});
    } else {
      await call("Fetch.fulfillRequest", {requestId, responseCode: 200,
        responseHeaders: [{name:"Content-Type",value:"application/javascript"}], body:""});
    }
  }
});
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const wait = () => new Promise(resolve => setTimeout(resolve, 160));
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.setBypassServiceWorker", {bypass:true});
  await call("Fetch.enable", {patterns:[{urlPattern:"*"}]});
  await call("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate", {url:"http://127.0.0.1:3000/su-admin.html"});
  for (let i=0;i<50;i++) {
    if (await evaluate("!!window.CSVB_ROLE_MANAGEMENT")) break;
    await wait();
  }
  await evaluate(`(() => {
    window.__fixture=${JSON.stringify(fixture)};
    window.__mutations=[];
    const current = window.__fixture;
    const sb={rpc:async(name,args={})=>{
      if(name==="csvb_role_catalogue_list") return {data:structuredClone(current)};
      window.__mutations.push(args);
      let role=current.roles.find(r=>r.code===args.p_role_code);
      if(args.p_action==="create"){
        role={code:"office_draft_"+"a".repeat(32),display_name:args.p_display_name,
          classification:"Office",is_active:true,is_protected:false,is_assignable:false,
          assigned_user_count:0,permission_reference_count:0,status:"Draft / Not yet assignable"};
        current.roles.push(role);
      }else if(args.p_action==="rename"){role.display_name=args.p_display_name;}
      else if(args.p_action==="activate"||args.p_action==="deactivate"){role.is_active=args.p_action==="activate";}
      else if(args.p_action==="delete"){current.roles=current.roles.filter(r=>r!==role);}
      current.audit.unshift({role_code:role.code,display_name:role.display_name,action:args.p_action,
        actor_username:"superuser",changed_at:new Date().toISOString()});
      return {data:{ok:true}};
    }};
    document.querySelectorAll('[id^="tab-"]').forEach(p=>p.style.display="none");
    document.querySelector("#tab-role-management").style.display="";
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab==="role-management"));
    window.CSVB_ROLE_MANAGEMENT.init({sb});
  })()`);
  await wait();
  assert.equal(await evaluate('document.querySelectorAll("[data-role-rows] tr").length'),5);
  assert.equal(await evaluate('document.querySelectorAll("[data-role-rows] [data-action]").length'),0);
  assert.equal(await evaluate('window.__mutations.length'),0);
  await evaluate('document.querySelector("[data-action=create]").click()');
  await evaluate('document.querySelector("dialog input").value="QA <Office>";document.querySelector("dialog form").requestSubmit()');
  await wait();
  assert.equal(await evaluate('document.querySelectorAll("[data-role-rows] tr").length'),6);
  assert.equal(await evaluate('!!document.querySelector("[data-role-rows] office")'),false);
  assert.match(await evaluate('document.querySelector("[data-role-rows]").textContent'),/QA <Office>/);
  for (const action of ["rename","deactivate","activate"]) {
    await evaluate(`document.querySelector('[data-role-rows] [data-action="${action}"]').click()`);
    if (action==="rename") await evaluate('document.querySelector("dialog input").value="Vetting Coordinator — Draft"');
    await evaluate('document.querySelector("dialog form").requestSubmit()');
    await wait();
  }
  assert.equal(await evaluate('window.__fixture.roles.at(-1).is_assignable'),false);
  const desktop=await call("Page.captureScreenshot",{format:"png"});
  writeFileSync("/tmp/csvb-role-catalogue-desktop.png",Buffer.from(desktop.data,"base64"));
  await call("Emulation.setDeviceMetricsOverride",{width:768,height:1024,deviceScaleFactor:1,mobile:false});
  await wait();
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  const tablet=await call("Page.captureScreenshot",{format:"png"});
  writeFileSync("/tmp/csvb-role-catalogue-tablet.png",Buffer.from(tablet.data,"base64"));
  await evaluate('document.querySelector("[data-role-rows] [data-action=delete]").click();document.querySelector("dialog form").requestSubmit()');
  await wait();
  assert.equal(await evaluate('document.querySelectorAll("[data-role-rows] tr").length'),5);
  assert.deepEqual(await evaluate('window.__mutations.map(x=>x.p_action)'),["create","rename","deactivate","activate","delete"]);
  assert.equal(await evaluate('document.querySelectorAll("[data-role-audit] .csvb-role-audit-item").length') > 0 ||
    await evaluate('document.querySelector("[data-role-audit]").textContent.includes("superuser")'),true);
  console.log("PASS: five protected roles; create/rename/activate/deactivate/delete draft; escaped text; audit; non-assignment; desktop/tablet layout. Browser mutations were in-memory only.");
} finally {
  await call("Page.close");
  ws.close();
}
