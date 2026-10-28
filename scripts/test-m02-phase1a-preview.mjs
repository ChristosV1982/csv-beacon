import {spawn} from "node:child_process";
import {mkdtemp, rm, mkdir, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const chunks = []; for await (const c of process.stdin) chunks.push(c);
const input = JSON.parse(Buffer.concat(chunks).toString());
const dir = await mkdtemp(path.join(os.tmpdir(), "m02-preview-"));
const chrome = spawn("/repl/tools/bin/chromium", ["--headless","--no-sandbox","--disable-gpu",
  "--remote-debugging-port=0","--user-data-dir="+dir,"about:blank"], {stdio:["ignore","ignore","pipe"]});
const checks = [], exceptions = [], requests = []; let ws;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let text = ""; chrome.stderr.on("data", c => {text += c; const m = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(m) resolve(m[1]);});
    chrome.on("exit", () => reject(Error("Chromium exited")));
  });
  ws = new WebSocket(endpoint); await new Promise(r => ws.once("open", r));
  let seq = 0; const pending = new Map();
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, {resolve,reject}); ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
  ws.on("message", buffer => {
    const d = JSON.parse(buffer);
    if(d.id) {const p = pending.get(d.id); pending.delete(d.id); d.error?p?.reject(Error(d.error.message)):p?.resolve(d.result);}
    if(d.method==="Runtime.exceptionThrown") exceptions.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);
    if(d.method==="Network.requestWillBeSent" && d.params.request.method==="POST" && /\/rest\/v1\/rpc\//.test(d.params.request.url))
      requests.push(d.params.request.url.split("/").pop());
  });
  const {targetId} = await call("Target.createTarget", {url:"about:blank"});
  const {sessionId:sid} = await call("Target.attachToTarget", {targetId, flatten:true});
  for(const method of ["Page.enable","Runtime.enable","Network.enable"]) await call(method,{},sid);
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sid);
  await call("Page.addScriptToEvaluateOnNewDocument", {source:
    `if(location.hostname==="127.0.0.1"){localStorage.setItem("sb-${input.project}-auth-token",${JSON.stringify(JSON.stringify(input.session))});if(!sessionStorage.getItem("m02FixtureSeeded")){localStorage.setItem("csvb_superuser_company_view_id",${JSON.stringify(input.company)});sessionStorage.setItem("m02FixtureSeeded","1");}}`},sid);
  const ev = async expression => {
    const r = await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},sid);
    if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  };
  const wait = async (expression, timeout=25000) => {
    const deadline = Date.now()+timeout;
    while(Date.now()<deadline) {if(await ev(expression)) return; await new Promise(r=>setTimeout(r,160));}
    throw Error("Timed out: "+expression+"; UI: "+await ev(`JSON.stringify({
      global:document.getElementById("globalMessage")?.innerText,editor:document.getElementById("editorMessage")?.innerText,
      state:document.getElementById("saveState")?.innerText,disabled:document.getElementById("saveDraft")?.disabled,
      vesselLocked:document.getElementById("vesselId")?.disabled,tail:document.body.innerText.slice(-200)})`));
  };
  const check = async (name, expression) => {if(!await ev(expression)) throw Error(name); checks.push(name);};
  const inputValue = async (id,value) => ev(`{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}`);
  const screenshot = async name => {
    await mkdir("generated-artifacts/m02",{recursive:true});
    const image = await call("Page.captureScreenshot",{format:"jpeg",quality:75},sid);
    await writeFile("generated-artifacts/m02/"+name+".jpg",Buffer.from(image.data,"base64"));
  };
  await call("Page.navigate",{url:"http://127.0.0.1:3000/m02-ship-inspection-report.html"},sid);
  let qid = null;
  if (input.denied) {
    await wait(`window.CSVB_MODULE_GUARD?.moduleKey==="m02_ship_inspection_report" && window.CSVB_MODULE_GUARD.allowed===false`);
    await check("Unapproved Office user blocked on direct M02 route", `window.CSVB_MODULE_GUARD.allowed===false`);
    if(requests.some(n=>n.startsWith("csvb_m02_"))) throw Error("Denied route requested M02 data");
    checks.push("No M02 data requested by denied route");
  } else {
  await wait(`document.getElementById("companySelect")?.value===${JSON.stringify(input.company)} && !document.getElementById("companySelect").disabled`);
  await check("Explicit dashboard company inherited and three tasks visible",
    `document.querySelectorAll("#taskLanding [data-view]").length===3 && !document.getElementById("taskLanding").hidden`);
  await screenshot("landing-desktop");
  await ev(`document.querySelector('[data-view="new"]').click()`);
  await wait(`document.querySelectorAll("[data-question-card]").length===282`);
  await check("Full-width editor and Oil-only question set", `!document.getElementById("editorView").hidden && document.getElementById("editorView").getBoundingClientRect().width>1100`);
  await check("Four reference panels per question start collapsed", `document.querySelectorAll("[data-question-card] details").length===1128 && !document.querySelector("[data-question-card] details[open]")`);
  await check("No per-question startup requests", `true`);
  if(requests.filter(n=>n==="csvb_m02_reference").length!==0) throw Error("Reference startup request storm");
  await inputValue("vesselId",input.vessel);
  await inputValue("attendingSuperintendent","M02 disposable verification");
  await inputValue("executiveSummary","Manually entered M02 verification summary");
  await inputValue("reportDate","2026-10-28");
  await inputValue("inspectionFrom","2026-10-27"); await inputValue("inspectionTo","2026-10-28");
  qid = await ev(`document.querySelector("[data-question-card]").dataset.questionCard`);
  await check("Chapter scales exactly match M02 1–5 / N/S", `Array.from(document.querySelector("[data-chapter-score]").options).map(o=>o.value).join(",")===",1,2,3,4,5,N/S"`);
  await ev(`{const e=document.querySelector("[data-question-card] select");e.value="N/S";e.dispatchEvent(new Event("change",{bubbles:true}));const t=document.querySelector("[data-question-card] textarea");t.value="M02 verification comment";t.dispatchEvent(new Event("input",{bubbles:true}));}`);
  await check("Appendix derives Not seen and Not checked immediately",
    `document.getElementById("appendixRows").innerText.includes("Not seen") && document.getElementById("appendixRows").innerText.includes("Not checked")`);
  await ev(`document.getElementById("saveDraft").click()`);
  await wait(`!document.getElementById("saveDraft").disabled && document.getElementById("vesselId").disabled && document.getElementById("globalMessage").innerText.includes("saved")`);
  await check("Draft save persisted and locks vessel identity", `document.getElementById("executiveSummary").value==="Manually entered M02 verification summary" && document.getElementById("editorStatus").textContent==="Draft"`);
  await ev(`document.getElementById("editorBack").click()`);
  await wait(`!document.getElementById("registerView").hidden && document.getElementById("reportRows").querySelector("button")`);
  await screenshot("register-desktop");
  await ev(`document.getElementById("reportRows").querySelector("button").click()`);
  await wait(`!document.getElementById("editorView").hidden && document.querySelector("[data-question-card] textarea")?.value==="M02 verification comment"`);
  await check("Reopen preserves manual summary, answer and comment",
    `document.getElementById("executiveSummary").value==="Manually entered M02 verification summary" && document.querySelector("[data-question-card] select").value==="N/S"`);
  await ev(`document.querySelector('[data-section="questions"]')?.click()`);
  const historySelector = `[data-reference-panel="history"][data-question-id="${input.historyQuestion}"]`;
  await ev(`{const panel=document.querySelector(${JSON.stringify(historySelector)});panel.open=true;
    for(let e=panel.parentElement;e;e=e.parentElement)if(e.tagName==="DETAILS")e.open=true;panel.scrollIntoView();}`);
  await wait(`document.querySelector(${JSON.stringify(historySelector)}).querySelectorAll(".m02-observation-list li").length>0`);
  await check("Live negative fleet history loads for matching canonical question", `document.querySelector(${JSON.stringify(historySelector)}).querySelector(".m02-observation-list li").getBoundingClientRect().height>0`);
  await check("Fleet record visibly identifies its fixed 18-month window", `document.querySelector(${JSON.stringify(historySelector)}).textContent.includes("Last 18 months") && document.querySelector(${JSON.stringify(historySelector)}).textContent.includes("18-month window")`);
  await check("Reference RPC is lazy and coalesced", `true`);
  if(requests.filter(n=>n==="csvb_m02_reference").length!==1) throw Error("Reference not coalesced");
  await screenshot("editor-desktop");
  await call("Emulation.setDeviceMetricsOverride",{width:402,height:874,deviceScaleFactor:1,mobile:true},sid);
  await check("Narrow viewport has no page overflow", `document.documentElement.scrollWidth<=window.innerWidth+2`);
  await screenshot("editor-mobile");
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sid);
  await call("Page.navigate",{url:"http://127.0.0.1:3000/q-dashboard.html?area=marine_applications_vessel_interaction"},sid);
  await wait(`Array.from(document.querySelectorAll("a,button")).some(e=>e.textContent.includes("M02")) || document.body.innerText.includes("M02 – Ship Inspection Report")`);
  await check("Dashboard Marine area includes M02 module", `document.body.innerText.includes("M02 – Ship Inspection Report")`);
  await ev(`localStorage.removeItem("csvb_superuser_company_view_id")`);
  await call("Page.navigate",{url:"http://127.0.0.1:3000/m02-ship-inspection-report.html"},sid);
  await wait(`document.getElementById("companySelect")?.value==="" && !document.getElementById("companySelect").disabled`);
  await check("Super Admin without dashboard context can explicitly choose a company", `document.getElementById("companySelect").options.length>1`);
  }
  if(exceptions.length) throw Error(exceptions.join("\n"));
  console.log(JSON.stringify({passed:true,checks,reference_rpc_calls:requests.filter(n=>n==="csvb_m02_reference").length,qid,screenshots:"generated-artifacts/m02"}));
} finally {
  ws?.close(); chrome.kill("SIGTERM"); await new Promise(r=>chrome.once("exit",r)); await rm(dir,{recursive:true,force:true});
}
