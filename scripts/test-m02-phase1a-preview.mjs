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
    await call("Page.navigate",{url:"http://127.0.0.1:3000/q-dashboard.html?area=marine_applications_vessel_interaction"},sid);
    await wait(`Array.isArray(window.CSVB_DASHBOARD_RANK_ACCESS?.allowedViewModules) && Array.from(document.querySelectorAll('a[href*="port-call-intelligence.html"]')).some(e=>e.getClientRects().length>0)`);
    await check("Explicit View Deny removes the M02 dashboard card", `!Array.from(document.querySelectorAll('a[href*="m02-ship-inspection-report.html"]')).some(e=>e.getClientRects().length>0)`);
  } else if (input.readOnly) {
    await wait(`document.getElementById("companySelect")?.value===${JSON.stringify(input.company)} && document.querySelector('[data-view="new"]')?.disabled && document.getElementById("globalMessage").textContent.includes("read-only")`);
    await check("Office M02 route is View-allowed without editing", `window.CSVB_MODULE_GUARD.allowed===true && document.querySelector('[data-view="new"]').disabled`);
    await ev(`document.querySelector('[data-view="register"]').click()`);
    await wait(`!document.getElementById("registerView").hidden && !document.getElementById("reportRows").textContent.includes("Loading")`);
    await check("Office can open the company-scoped M02 register", `document.getElementById("companySelect").value===${JSON.stringify(input.company)}`);
    await screenshot("office-readonly-register");
    await call("Page.navigate",{url:"http://127.0.0.1:3000/q-dashboard.html?area=marine_applications_vessel_interaction"},sid);
    await wait(`Array.from(document.querySelectorAll('a[href*="m02-ship-inspection-report.html"]')).some(e=>e.getClientRects().length>0)`);
    await check("Office dashboard shows the M02 card in Marine Applications", `new URL(location.href).searchParams.get("area")==="marine_applications_vessel_interaction"`);
    await screenshot("office-m02-dashboard");
  } else {
  await wait(`document.getElementById("companySelect")?.value===${JSON.stringify(input.company)} && !document.getElementById("companySelect").disabled`);
  await check("Explicit dashboard company inherited and three tasks visible",
    `document.querySelectorAll("#taskLanding [data-view]").length===3 && !document.getElementById("taskLanding").hidden`);
  await screenshot("landing-desktop");
  await ev(`document.querySelector('[data-view="new"]').click()`);
  await wait(`document.querySelectorAll("[data-question-card]").length===282`);
  await check("Full-width editor and Oil-only question set", `!document.getElementById("editorView").hidden && document.getElementById("editorView").getBoundingClientRect().width>1100`);
  await check("Controlled form footer uses the central Version 09 identity in the report workspace",
    `document.querySelector("[data-m02-form-reference]").textContent==="M02 · Ship Inspection Report · Version 09 · 23.06.2026" && window.CSVB_M02_FORM_IDENTITY.version==="09" && !document.querySelector("[data-m02-form-reference]").closest("section") && document.querySelector("[data-m02-form-reference]").getBoundingClientRect().width>0`);
  await check("Four reference panels remain collapsed; each SIRE question exposes its own attachment control", `document.querySelectorAll("[data-question-card] .m02-panels details").length===1128 && !document.querySelector("[data-question-card] .m02-panels details[open]") && Array.from(document.querySelectorAll("[data-question-card]")).every(c=>c.querySelector(".m02-attachments").open && c.querySelector("[data-upload-file]").dataset.questionId===c.dataset.questionCard)`);
  await check("Exactly 51 Company attendance cards with separate progress", `document.querySelectorAll("[data-company-card]").length===51 && !!document.getElementById("companyProgress") && !document.getElementById("appendixDetails").open`);
  await check("Only Yes/No/N/A/N/S are selectable and unanswered is clearly blank",
    `Array.from(document.querySelector("[data-response]").options).filter(o=>!o.disabled).map(o=>o.value).join(",")==="Yes,No,N/A,N/S" && document.querySelector("[data-response]").value==="" && document.querySelector("[data-response]").selectedOptions[0].hidden && !document.querySelector(".m02-unanswered").hidden`);
  await check("SIRE response labels are Yes/No/Not Applicable/Not Seen", `Array.from(document.querySelector("[data-response]").options).filter(o=>!o.disabled).map(o=>o.textContent).join(",")==="Yes,No,Not Applicable,Not Seen"`);
  await check("All SIRE free-text fields use Question Remarks", `Array.from(document.querySelectorAll("[data-comments]")).every(t=>t.getAttribute("aria-label").startsWith("Question Remarks") && t.parentElement.firstChild.textContent==="Question Remarks")`);
  await check("No per-question startup requests", `true`);
  if(requests.filter(n=>n==="csvb_m02_reference").length!==0) throw Error("Reference startup request storm");
  await inputValue("vesselId",input.vessel);
  await inputValue("attendingSuperintendent","M02 disposable verification");
  await inputValue("executiveSummary","Manually entered M02 verification summary");
  await inputValue("reportDate","2026-10-28");
  await inputValue("inspectionFrom","2026-10-27"); await inputValue("inspectionTo","2026-10-28");
  await ev(`{const c=document.querySelector("[data-company-response='1']");c.value="Yes";c.dispatchEvent(new Event("change",{bubbles:true}));const t=document.querySelector("[data-company-comments='1']");t.value="Minutes and crew discussion";t.dispatchEvent(new Event("input",{bubbles:true}));}`);
  qid = await ev(`document.querySelector("[data-question-card]").dataset.questionCard`);
  await check("Chapter scales exactly match M02 1–5 / N/S", `Array.from(document.querySelector("[data-chapter-score]").options).map(o=>o.value).join(",")===",1,2,3,4,5,N/S"`);
  await ev(`{const e=document.querySelector("[data-question-card] select");e.value="N/S";e.dispatchEvent(new Event("change",{bubbles:true}));const t=document.querySelector("[data-question-card] textarea");t.value="M02 verification comment";t.dispatchEvent(new Event("input",{bubbles:true}));}`);
  const longRemarks = "\n\n  Exact remarks — preserve spaces & symbols < >  \n" + Array.from({length:110},(_,i)=>`Line ${i+1}: extended question remarks for inspection review, with readable detail.`).join("\n") + "\n  End.  ";
  await ev(`{const t=document.querySelectorAll("[data-comments]")[1];t.closest(".m02-chapter").open=true;t.value=${JSON.stringify(longRemarks)};t.dispatchEvent(new Event("input",{bubbles:true}));t.scrollIntoView();}`);
  await wait(`document.querySelectorAll("[data-comments]")[1].clientHeight>=document.querySelectorAll("[data-comments]")[1].scrollHeight-1 && document.querySelectorAll("[data-comments]")[1].offsetHeight>1000`);
  await check("Long Question Remarks auto-grow without changing answer progress", `document.querySelectorAll("[data-comments]")[1].maxLength===50000 && document.querySelectorAll("[data-response]")[1].value==="" && document.getElementById("navProgress").textContent==="Answered 1 / 282 · Remaining 281" && document.querySelector(".m02-unanswered").hidden`);
  await ev(`{const s=document.querySelectorAll("[data-response]")[2];s.value="N/A";s.dispatchEvent(new Event("change",{bubbles:true}));}`);
  await check("Not Applicable retains the N/A code and counts as answered", `document.querySelectorAll("[data-response]")[2].selectedOptions[0].textContent==="Not Applicable" && document.getElementById("navProgress").textContent==="Answered 2 / 282 · Remaining 280"`);
  await screenshot("question-remarks-desktop");
  await check("Appendix derives Not seen and Not checked immediately",
    `document.getElementById("appendixRows").textContent.includes("Not seen") && document.getElementById("appendixRows").textContent.includes("Not checked")`);
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
  await check("Company responses/comments persist and unanswered stay blank", `document.querySelector("[data-company-response='1']").value==="Yes" && document.querySelector("[data-company-comments='1']").value==="Minutes and crew discussion" && document.querySelector("[data-company-response='2']").value==="" && !document.getElementById("appendixDetails").open && document.getElementById("saveState").textContent.includes("Saved")`);
  await wait(`document.querySelectorAll("[data-comments]")[1].offsetHeight>1000`);
  await check("Long remarks persist exactly and grow after reopening", `document.querySelectorAll("[data-comments]")[1].value===${JSON.stringify(longRemarks)} && document.querySelectorAll("[data-comments]")[1].clientHeight>=document.querySelectorAll("[data-comments]")[1].scrollHeight-1 && document.querySelectorAll("[data-response]")[1].value===""`);
  const sireGroup = `[data-attachment-group="q:${qid}"]`;
  await ev(`{const g=document.querySelector(${JSON.stringify(sireGroup)});g.closest(".m02-chapter").open=true;g.scrollIntoView();const f=g.querySelector("input[type=file]");if(f.disabled)throw Error("SIRE Draft upload disabled");const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII="),c=>c.charCodeAt(0))],"preview-sire-evidence.png",{type:"image/png"}));f.files=d.files;f.dispatchEvent(new Event("change",{bubbles:true}));}`);
  await wait(`document.querySelector(${JSON.stringify(sireGroup)}).querySelector(".m02-attachment-row")?.textContent.includes("preview-sire-evidence.png") && !document.getElementById("saveDraft").disabled`);
  await check("SIRE attachment metadata and quota stay specific to its question", `document.querySelector(${JSON.stringify(sireGroup)}).querySelector(".m02-attachment-quota").textContent.includes("1/5 files") && Array.from(document.querySelectorAll("[data-question-card]")).filter(c=>c.textContent.includes("preview-sire-evidence.png")).length===1 && !document.querySelector('[data-attachment-group="c:1"]').textContent.includes("preview-sire-evidence.png")`);
  await screenshot("sire-question-attachment-desktop");
  await ev(`{const g=document.querySelector('[data-attachment-group="c:1"]');g.open=true;g.scrollIntoView();const f=g.querySelector("input[type=file]");if(f.disabled)throw Error("Draft upload disabled");const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII="),c=>c.charCodeAt(0))],"preview-evidence.png",{type:"image/png"}));f.files=d.files;f.dispatchEvent(new Event("change",{bubbles:true}));}`);
  await wait(`document.querySelector('[data-attachment-group="c:1"] .m02-attachment-row')?.textContent.includes("preview-evidence.png") && !document.getElementById("saveDraft").disabled`);
  await check("Real UI file upload shows private attachment metadata", `document.querySelector('[data-attachment-group="c:1"] .m02-attachment-row').textContent.includes("image/png")`);
  await ev(`{const card=document.querySelector('[data-company-card="1"]');card.scrollIntoView();document.querySelector('.m02-section-nav [data-section="company"]').click();document.getElementById("saveDraft").click();}`);
  await wait(`!document.getElementById("saveDraft").disabled && document.getElementById("saveState").textContent.includes("Saved")`);
  // Reload the whole page, not just the editor, to prove no in-memory draft dependency.
  await call("Page.navigate",{url:"http://127.0.0.1:3000/m02-ship-inspection-report.html"},sid);
  await wait(`document.querySelector('[data-view="register"]') && !document.getElementById("companySelect").disabled`);
  await ev(`document.querySelector('[data-view="register"]').click()`);
  await wait(`document.getElementById("reportRows").querySelector("button")`);
  await ev(`document.getElementById("reportRows").querySelector("button").click()`);
  await wait(`document.querySelector('[data-attachment-group="c:1"] .m02-attachment-row')?.textContent.includes("preview-evidence.png")`);
  await check("Full page reload restores attendance, attachment and section progress", `document.querySelector("[data-company-response='1']").value==="Yes" && document.querySelector('.m02-section-nav [data-section="company"]').classList.contains("is-current") && !document.getElementById("appendixDetails").open`);
  await check("Full page reload retains exact Question Remarks and unanswered/null distinction", `document.querySelectorAll("[data-comments]")[1].value===${JSON.stringify(longRemarks)} && document.querySelectorAll("[data-response]")[1].value==="" && document.querySelectorAll("[data-response]")[0].value==="N/S"`);
  await check("Question attachment and full response label survive full page reload", `document.querySelector(${JSON.stringify(sireGroup)}).querySelector(".m02-attachment-row").textContent.includes("preview-sire-evidence.png") && document.querySelector("[data-response]").selectedOptions[0].textContent==="Not Seen"`);
  await check("Saved Not Applicable keeps its legacy code and full UI label", `document.querySelectorAll("[data-response]")[2].value==="N/A" && document.querySelectorAll("[data-response]")[2].selectedOptions[0].textContent==="Not Applicable" && document.getElementById("navProgress").textContent==="Answered 2 / 282 · Remaining 280"`);
  await ev(`{window.confirm=()=>true;document.querySelector(${JSON.stringify(sireGroup)}).querySelector("[data-delete-attachment]").click();}`);
  await wait(`!document.querySelector(${JSON.stringify(sireGroup)}).querySelector(".m02-attachment-row") && !document.getElementById("saveDraft").disabled`);
  await ev(`{window.confirm=()=>true;document.querySelector('[data-attachment-group="c:1"] [data-delete-attachment]').click();}`);
  await wait(`!document.querySelector('[data-attachment-group="c:1"] .m02-attachment-row') && !document.getElementById("saveDraft").disabled`);
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
  await wait(`document.querySelectorAll("[data-comments]")[1].clientHeight>=document.querySelectorAll("[data-comments]")[1].scrollHeight-1`);
  await ev(`document.querySelector("[data-m02-form-reference]").scrollIntoView({block:"end"})`);
  await check("Mobile controlled-form footer clears the fixed save controls",
    `document.querySelector("[data-m02-form-reference]").getBoundingClientRect().bottom<=document.querySelector(".m02-mobile-save").getBoundingClientRect().top`);
  await screenshot("controlled-form-footer-mobile");
  await ev(`document.querySelectorAll("[data-comments]")[1].scrollIntoView()`);
  await screenshot("question-remarks-mobile");
  await screenshot("editor-mobile");
  await ev(`document.getElementById("section-company").scrollIntoView()`);
  await screenshot("company-mobile");
  for (const width of [320,768,1024]) {
    await call("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<768},sid);
    if(await ev(`document.documentElement.scrollWidth>window.innerWidth+2`)) {
      console.error(JSON.stringify(await ev(`Array.from(document.querySelectorAll("body *")).filter(e=>e.getBoundingClientRect().right>window.innerWidth+2&&e.getBoundingClientRect().width>0).slice(0,12).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right}))`)));
    }
    await check(`Responsive ${width}px layout has no page overflow`, `document.documentElement.scrollWidth<=window.innerWidth+2`);
  }
  await ev(`document.getElementById("markCompleted").click()`);
  await check("Incomplete completion is blocked with section summary and jump actions",
    `document.getElementById("editorMessage").textContent.includes("Part 3: 50 remaining") && document.getElementById("editorMessage").textContent.includes("Part 4: 280 remaining") && document.querySelectorAll(".m02-completion-jumps button").length===2 && !document.getElementById("saveDraft").disabled`);
  await ev(`document.querySelector(".m02-completion-jumps button").click()`);
  await check("Completion jump opens the missing response section", `document.querySelector('[data-section="company"]').classList.contains("is-current")`);
  await ev(`{const s=document.querySelector("[data-response]");s.value="";s.dispatchEvent(new Event("change",{bubbles:true}));}`);
  await check("Clearing a response immediately increases section and chapter Remaining",
    `document.getElementById("questionProgress").textContent==="Answered 1 / 282 · Remaining 281" && document.querySelector(".m02-chapter-count").textContent.includes("Remaining")`);
  await ev(`{
    document.querySelectorAll("[data-company-response]").forEach((s,i)=>{s.value=["Yes","No","N/S"][i%3];s.dispatchEvent(new Event("change",{bubbles:true}));});
    document.querySelectorAll("[data-response]").forEach((s,i)=>{s.value=["Yes","No","N/A","N/S"][i%4];s.dispatchEvent(new Event("change",{bubbles:true}));});
  }`);
  await check("All explicit answers including Not Seen/Not Applicable produce zero Remaining",
    `document.getElementById("companyProgress").textContent==="Answered 51 / 51 · Remaining 0" && document.getElementById("questionProgress").textContent==="Answered 282 / 282 · Remaining 0" && Array.from(document.querySelectorAll(".m02-chapter-count")).every(c=>c.textContent.endsWith("Remaining 0")) && !document.getElementById("appendixRows").textContent.includes("Not checked") && document.getElementById("appendixRows").textContent.includes("Not seen")`);
  await ev(`document.getElementById("markCompleted").click()`);
  await wait(`document.getElementById("editorMessage").textContent.includes("Report marked Completed") && !document.getElementById("saveDraft").disabled`);
  await check("Fully answered report completes through the normal save RPC", `document.getElementById("editorMessage").textContent.includes("Completed")`);
  await ev(`document.getElementById("editorBack").click()`);
  await call("Emulation.setDeviceMetricsOverride",{width:768,height:1024,deviceScaleFactor:1,mobile:false},sid);
  await check("Tablet register uses stacked cards instead of a dense table", `getComputedStyle(document.querySelector("#reportRows tr")).display==="grid" && document.documentElement.scrollWidth<=window.innerWidth+2`);
  await screenshot("register-tablet");
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
