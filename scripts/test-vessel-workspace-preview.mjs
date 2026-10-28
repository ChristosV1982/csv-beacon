// Disposable Super Admin session comes through stdin, never command arguments/logs.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const { session, project, vessel, readOnly = false } = JSON.parse(Buffer.concat(chunks).toString());
const profile = await mkdtemp(path.join(tmpdir(), "csvb-vessels-browser-"));
const chrome = spawn("/repl/tools/bin/chromium", ["--headless","--no-sandbox",
  "--disable-dev-shm-usage","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],
  { stdio: ["ignore","ignore","ignore"] });
const results=[], requests=[], apiErrors=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try {
  let port;
  for(let i=0;i<100;i++) {
    try { port=(await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).trim().split("\n"); break; }
    catch { await delay(100); }
  }
  if(!port) throw Error("Chromium did not start");
  socket=new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",reject);});
  let n=0;const pending=new Map();
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const id=++n;pending.set(id,{resolve,reject});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
  socket.on("message",raw=>{
    const d=JSON.parse(raw);
    if(d.id) {const p=pending.get(d.id);if(!p)return;pending.delete(d.id);
      if(d.error)p.reject(Error(d.error.message));else p.resolve(d.result);}
    if(d.method==="Network.requestWillBeSent" && d.params.request.method==="POST" &&
      d.params.request.url.includes("/rest/v1/rpc/"))
      requests.push(d.params.request.url.split("/").pop());
    if(d.method==="Network.responseReceived" && d.params.response.status>=400 &&
      d.params.response.url.includes(".supabase.co/")) apiErrors.push(d.params.response.status+" "+new URL(d.params.response.url).pathname);
  });
  const context=await call("Target.createBrowserContext",{disposeOnDetach:true});
  const target=await call("Target.createTarget",{url:"about:blank",browserContextId:context.browserContextId});
  const attached=await call("Target.attachToTarget",{targetId:target.targetId,flatten:true}), sid=attached.sessionId;
  await call("Page.enable",{},sid);await call("Network.enable",{},sid);
  await call("Emulation.setDeviceMetricsOverride",{width:1540,height:1000,deviceScaleFactor:1,mobile:false},sid);
  await call("Page.addScriptToEvaluateOnNewDocument",{
    source:`localStorage.setItem(${JSON.stringify("sb-"+project+"-auth-token")},${JSON.stringify(JSON.stringify(session))});`
  },sid);
  const evaluate=async expression=>{
    const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},sid);
    if(r.exceptionDetails)throw Error(r.exceptionDetails.text+" "+(r.exceptionDetails.exception?.description||""));
    return r.result.value;
  };
  const wait=async expression=>{
    for(let i=0;i<180;i++){try{if(await evaluate(expression))return;}catch{}await delay(150);}
    throw Error("Timed out: "+expression);
  };
  const check=async(name,expression)=>{
    const passed=!!await evaluate(expression);results.push({test:name,passed});if(!passed)throw Error(name);
  };
  const open=async()=>{
    await call("Page.navigate",{url:"http://127.0.0.1:3000/su-admin.html"},sid);
    await wait(`document.querySelector('#vesselsBody button[data-act="edit"]')`);
    await evaluate(`document.querySelector('[data-tab="vessels"]').click()`);
    await wait(`document.querySelector('#tab-vessels').style.display!=="none"`);
  };
  const selectTarget=async()=>{
    await evaluate(`document.querySelector('#v_status_filter').value="all";
      document.querySelector('#v_search').value=${JSON.stringify(vessel.name)};
      document.querySelector('#v_search').dispatchEvent(new Event('input'))`);
  };
  await open();
  await check("Full-width vessel list with Edit on every row and no inline date editor",
    `document.querySelector('#tab-vessels').getBoundingClientRect().width>1400 &&
     document.querySelectorAll('#vesselsBody button[data-act="edit"]').length===document.querySelectorAll('#vesselsBody tr').length &&
     document.querySelectorAll('#vesselsBody input[type=date]').length===0 &&
     document.querySelector('#v_search').getBoundingClientRect().height<=50`);
  await evaluate(`document.querySelector('#v_openAddBtn').click()`);
  await wait(`document.querySelector('#vesselEditorDialog').open`);
  await check("Add Vessel opens cleanly with editable Company",
    `document.querySelector('#vesselEditorTitle').textContent==="Add Vessel" &&
     !document.querySelector('#v_company').disabled && document.querySelector('#v_name').value===""`);
  await evaluate(`document.querySelector('#v_cancelBtn').click()`);
  await delay(100);
  if (!readOnly) {
  await selectTarget();
  const edit=`document.querySelector('button[data-act="edit"][data-id="${vessel.id}"]').click()`;
  await evaluate(edit);await wait(`document.querySelector('#vesselEditorDialog').open`);
  await check("Edit is pre-populated and Company is read-only",
    `document.querySelector('#vesselEditorTitle').textContent==="Edit Vessel" &&
     document.querySelector('#v_company').disabled &&
     document.querySelector('#v_company').value===${JSON.stringify(vessel.company_id)} &&
     document.querySelector('#v_name').value===${JSON.stringify(vessel.name)} &&
     document.querySelector('#v_call').value===${JSON.stringify(vessel.call_sign||"")}`);
  await evaluate(`document.querySelector('#v_call').value="UXVERIFY";
    document.querySelector('#vesselEditorForm').requestSubmit()`);
  await wait(`!document.querySelector('#vesselEditorDialog').open`);
  await check("Save refreshes the same vessel row immediately",
    `document.querySelector('button[data-act="edit"][data-id="${vessel.id}"]').closest('tr').textContent.includes("UXVERIFY")`);
  await open();await selectTarget();await evaluate(edit);
  await wait(`document.querySelector('#vesselEditorDialog').open`);
  await check("Saved particulars survive a page reload",
    `document.querySelector('#v_call').value==="UXVERIFY"`);
  await evaluate(`document.querySelector('#v_call').value=${JSON.stringify(vessel.call_sign||"")};
    document.querySelector('#vesselEditorForm').requestSubmit()`);
  await wait(`!document.querySelector('#vesselEditorDialog').open`);
  const visible=`n=>n.getClientRects().length>0`;
  await evaluate(`document.querySelector('button[data-act="status_history"][data-id="${vessel.id}"]').click()`);
  await wait(`[...document.querySelectorAll('button')].filter(${visible}).some(n=>n.textContent.trim()==="Close")`);
  await delay(600);
  await check("Status History remains separately accessible",
    `[...document.querySelectorAll('button')].filter(${visible}).some(n=>n.textContent.trim()==="Close")`);
  await evaluate(`[...document.querySelectorAll('button')].filter(${visible}).find(n=>n.textContent.trim()==="Close").click()`);
  await evaluate(`document.querySelector('button[data-act="${vessel.is_active===false?"activate":"deactivate"}"][data-id="${vessel.id}"]').click()`);
  await wait(`[...document.querySelectorAll('textarea')].filter(${visible}).length>=2`);
  await check("Lifecycle dialog remains separate with restricted reason/remarks",
    `[...document.querySelectorAll('textarea')].filter(${visible}).length>=2`);
  await evaluate(`[...document.querySelectorAll('button')].filter(${visible}).find(n=>n.textContent.trim()==="Cancel").click()`);
  await evaluate(`document.querySelector('#v_search').value="__no_vessel__";document.querySelector('#v_search').dispatchEvent(new Event('input'))`);
  await check("Vessel search filters the list",`document.querySelector('#vesselsBody').textContent.includes("No vessels found")`);
  await evaluate(`document.querySelector('#v_search').value="";document.querySelector('#v_search').dispatchEvent(new Event('input'));
    document.querySelector('#v_status_filter').value="inactive";document.querySelector('#v_status_filter').dispatchEvent(new Event('change'))`);
  await check("Inactive filter excludes active rows",`[...document.querySelectorAll('#vesselsBody .pill')].every(n=>n.textContent==="Inactive")`);
  await evaluate(`document.querySelector('#v_status_filter').value="all";document.querySelector('#v_status_filter').dispatchEvent(new Event('change'))`);
  }
  await call("Page.captureScreenshot",{format:"png"},sid).then(r=>writeFile("/tmp/vessels-workspace-desktop.png",Buffer.from(r.data,"base64")));
  await call("Emulation.setDeviceMetricsOverride",{width:740,height:1000,deviceScaleFactor:1,mobile:false},sid);
  await evaluate(`document.querySelector('#v_openAddBtn').click()`);await wait(`document.querySelector('#vesselEditorDialog').open`);
  await check("Editor fits a narrow viewport",`document.querySelector('#vesselEditorDialog').getBoundingClientRect().width<=innerWidth`);
  await call("Page.captureScreenshot",{format:"png"},sid).then(r=>writeFile("/tmp/vessel-editor-narrow.png",Buffer.from(r.data,"base64")));
  results.push({test:readOnly ? "Read-only layout check makes no vessel writes" : "Exactly two particulars saves; no Add/Delete/transition writes during Preview test",
    passed:requests.filter(n=>n==="csvb_admin_update_vessel_particulars").length===(readOnly ? 0 : 2) &&
      !requests.some(n=>["csvb_admin_upsert_vessel","csvb_admin_set_vessel_active","csvb_admin_delete_vessel"].includes(n))});
  console.log(JSON.stringify({results,apiErrors}));
  if(results.some(r=>!r.passed)||apiErrors.length)process.exitCode=1;
} catch(e) {console.error(JSON.stringify({error:e.message,results,apiErrors}));process.exitCode=1;}
finally {socket?.close();chrome.kill();await delay(300);await rm(profile,{recursive:true,force:true});}
