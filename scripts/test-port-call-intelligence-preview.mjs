import {spawn} from "node:child_process";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
const live=!!input.session, results=[],errors=[];
const profile=await mkdtemp(path.join(os.tmpdir(),"pci-preview-"));
const chrome=spawn("/repl/tools/bin/chromium",["--headless","--no-sandbox","--disable-gpu","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
let ws;
try{
  const endpoint=await new Promise((resolve,reject)=>{
    let text="";chrome.stderr.on("data",b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});
    chrome.on("exit",()=>reject(Error("Chromium exited")));
  });
  ws=new WebSocket(endpoint);await new Promise(r=>ws.once("open",r));
  let seq=0;const pending=new Map();
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const stub=await readFile("scripts/fixtures/port-call-intelligence-browser.js","utf8");
  ws.on("message",async buffer=>{
    const d=JSON.parse(buffer);
    if(d.id){const p=pending.get(d.id);pending.delete(d.id);if(d.error)p?.reject(Error(d.error.message));else p?.resolve(d.result);return;}
    if(d.method==="Runtime.exceptionThrown")errors.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);
    if(d.method==="Fetch.requestPaused"){
      const url=d.params.request.url;
      const body=/\/auth\.js[?]/.test(url)?stub:"";
      await call("Fetch.fulfillRequest",{requestId:d.params.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from(body).toString("base64")},d.sessionId);
    }
  });
  const {targetId}=await call("Target.createTarget",{url:"about:blank"});
  const {sessionId:sid}=await call("Target.attachToTarget",{targetId,flatten:true});
  await call("Page.enable",{},sid);await call("Runtime.enable",{},sid);
  await call("Emulation.setDeviceMetricsOverride",{width:1540,height:1000,deviceScaleFactor:1,mobile:false},sid);
  if(!live)await call("Fetch.enable",{patterns:["*auth.js?*","*csvb-module-guard.js?*","*csvb-office-authorization.js?*","*cdn.jsdelivr.net/npm/@supabase/*"].map(urlPattern=>({urlPattern,resourceType:"Script"}))},sid);
  else await call("Page.addScriptToEvaluateOnNewDocument",{source:`localStorage.setItem(${JSON.stringify("sb-"+input.project+"-auth-token")},${JSON.stringify(JSON.stringify(input.session))});`},sid);
  const evaluate=async expression=>{const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},sid);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error("Timed out: "+expression);};
  const check=async(test,expr)=>{const passed=!!await evaluate(expr);results.push({test,passed});if(!passed)throw Error(test);};
  const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const idle=()=>wait(`document.querySelector('#pciBusy').hidden`);
  const open=async(role="super_admin")=>{
    await call("Page.navigate",{url:"http://127.0.0.1:3000/port-call-intelligence.html"+(!live?"?testRole="+role:"")},sid);
    await wait(`document.querySelector('[data-pci-task="calls"]') && !document.querySelector('[data-pci-task="calls"]').hidden`);
    await idle();
  };
  await open();
  await check("Task landing only; location and workspaces hidden",`!document.querySelector('#pciTaskLanding').hidden && document.querySelector('#pciLocationPicker').hidden && document.querySelector('#callsPanel').hidden && document.querySelector('#profilePanel').hidden`);
  await writeFile("/tmp/pci-tasks-desktop.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"},sid)).data,"base64"));
  await click('[data-pci-task="calls"]');
  await check("Full-width register and collapsed advanced filters",`document.querySelector('#pciRegisterWorkspace').getBoundingClientRect().width>1400 && !document.querySelector('#pciMoreFilters').open && document.querySelectorAll('.pci-register-table th').length===9`);
  const first=await evaluate(`document.querySelector('#callList [data-action="open-call"]')?.dataset.id`);
  if(first){
    await click('#callList [data-action="open-call"]');await idle();
    await check("Dedicated detail with list hidden",`!document.querySelector('#pciReportDetailWorkspace').hidden && document.querySelector('#pciRegisterWorkspace').hidden && document.querySelector('#callDetail').textContent.length>80`);
    await click('#pciBackReports');
    await check("Back restores selection and list",`!document.querySelector('#pciRegisterWorkspace').hidden && document.querySelector('.pci-call-row.is-selected [data-id]').dataset.id===${JSON.stringify(first)}`);
  }
  if(!live){
    await check("Pagination uses existing 25-row page",`document.querySelectorAll('.pci-call-row').length===25 && !document.querySelector('#callNextPageBtn').disabled`);
    await click('#callNextPageBtn');await idle();
    await check("Next page retains remaining rows",`document.querySelectorAll('.pci-call-row').length===2 && document.querySelector('#callPageSummary').textContent.includes('2 of 2')`);
    await evaluate(`document.querySelector('#callVesselFilter').value="Test Vessel";document.querySelector('#pciMoreFilters').open=true`);
    await click('#applyCallFiltersBtn');await idle();
    await click('#callNextPageBtn');await idle();
    await click('#callList [data-action="open-call"]');await idle();
    await click('#callDetail [data-action="edit-call"]');
    await wait(`!document.querySelector('#pciDrawer').hidden`);
    await check("Call editor is an in-flow full-width workspace with sticky actions",`document.querySelector('#pciDrawer').classList.contains('pci-call-editor') && document.querySelector('#pciDrawer').getBoundingClientRect().width>1300 && getComputedStyle(document.querySelector('#pciDrawer')).position==="relative" && getComputedStyle(document.querySelector('#drawerActions')).position==="sticky" && document.querySelector('main.pci-page').hidden && document.querySelector('#pciDrawerBackdrop').hidden && document.querySelector('#pciEditorBack').textContent==="Back to Report Detail"`);
    await check("Core fields, hazards, confirmations and attachment controls remain",`['pciCallForm','pciTerminal','pciVessel','pciBerth','pciALF','pciALC','pciEntry','pciUtcOffset','pciDraftF','pciDraftA','pciCargo','pciHazardRows','pciUploadFile'].every(id=>document.getElementById(id)) && [...document.querySelectorAll('#pciCallForm h3')].some(h=>h.textContent==="Section completion")`);
    await writeFile("/tmp/pci-editor-desktop.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"},sid)).data,"base64"));
    await call("Emulation.setDeviceMetricsOverride",{width:740,height:1000,deviceScaleFactor:1,mobile:false},sid);
    await check("Narrow editor fits viewport and keeps actions reachable",`document.querySelector('#pciDrawer').getBoundingClientRect().right<=740 && document.querySelector('#pciCallForm').scrollWidth<=document.querySelector('#pciCallForm').clientWidth+2 && document.querySelector('#drawerActions').getBoundingClientRect().bottom<=1001`);
    await writeFile("/tmp/pci-editor-narrow.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"},sid)).data,"base64"));
    await call("Emulation.setDeviceMetricsOverride",{width:375,height:900,deviceScaleFactor:1,mobile:false},sid);
    await check("Phone editor header and form do not overflow",`document.querySelector('#pciDrawer').getBoundingClientRect().right<=375 && document.querySelector('#pciCallForm').scrollWidth<=document.querySelector('#pciCallForm').clientWidth+2 && document.querySelector('#drawerTitle').getBoundingClientRect().right<=375`);
    await call("Emulation.setDeviceMetricsOverride",{width:1540,height:1000,deviceScaleFactor:1,mobile:false},sid);
    await evaluate(`document.querySelector('#pciBerth').value="Unsaved berth edit"`);
    await check("Browser navigation has unsaved-change protection",`(()=>{const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;})()`);
    await click('#pciEditorBack');await wait(`!document.querySelector('#confirmDialog').hidden`);
    await click('#confirmCancelBtn');
    await check("Keeping changes stays in editor with inputs intact",`!document.querySelector('#pciDrawer').hidden && document.querySelector('#pciBerth').value==="Unsaved berth edit"`);
    await click('#cancelCallBtn');await wait(`!document.querySelector('#confirmDialog').hidden`);await click('#confirmActionBtn');
    await check("Discard/cancel returns to same report detail",`document.querySelector('#pciDrawer').hidden && !document.querySelector('#pciReportDetailWorkspace').hidden && !document.querySelector('main.pci-page').hidden`);
    await click('#callDetail [data-action="edit-call"]');await wait(`!document.querySelector('#pciDrawer').hidden`);
    const updatesBefore = await evaluate(`window.__pciFixture.writes.filter(w=>w.table==="pci_port_calls"&&w.op==="update").length`);
    await evaluate(`document.querySelector('#saveCallBtn').click();document.querySelector('#saveCallBtn').click()`);
    await idle();await wait(`document.querySelector('#pciDrawer').hidden`);
    await check("Double Save updates existing report once and returns to detail",`window.__pciFixture.writes.filter(w=>w.table==="pci_port_calls"&&w.op==="update").length===${updatesBefore+1} && !document.querySelector('#pciReportDetailWorkspace').hidden`);
    await click('#pciBackReports');
    await idle();
    await check("Detail return preserves page, filters and More filters",`document.querySelector('#callPageSummary').textContent.includes('2 of 2') && document.querySelector('#callVesselFilter').value==="Test Vessel" && document.querySelector('#pciMoreFilters').open`);
    await evaluate(`document.querySelector('#callReferenceFilter').value="CALL-001"`);
    await click('#applyCallFiltersBtn');await idle();
    await check("Reference filter applies",`document.querySelectorAll('.pci-call-row').length===1 && document.querySelector('#callRegisterContext').textContent.includes('CALL-001')`);
    await click('#clearCallFiltersBtn');await idle();
    await click('#pciBackTasks');await click('[data-pci-task="profile"]');
    await evaluate(`document.querySelector('#countrySelect').value="SG";document.querySelector('#countrySelect').dispatchEvent(new Event('change'))`);await idle();
    await evaluate(`document.querySelector('#portSelect').value="port1";document.querySelector('#portSelect').dispatchEvent(new Event('change'))`);await idle();
    await check("Approved profile loads in its task",`document.querySelector('#profileContent').textContent.includes('Approved intelligence fixture') && !document.querySelector('#pciLocationPicker').hidden`);
    await click('#pciBackTasks');await click('[data-pci-task="office"]');
    await check("Office guidance and review grouped, edit-gated controls retained",`document.querySelector('#officePanel #proposalPanel') && !document.querySelector('#proposalPanel').hidden && document.querySelector('#officeList').textContent.includes('Published office fixture') && !document.querySelector('#newOfficeInfoBtn').hidden`);
    await click('#newOfficeInfoBtn');await wait(`!document.querySelector('#pciDrawer').hidden`);await click('#closeDrawerBtn');
    await click('#pciBackTasks');await click('[data-pci-task="calls"]');
    await check("Location restriction is explicit",`document.querySelector('#callRegisterContext').textContent.includes('Singapore')`);
    await click('#clearCallFiltersBtn');await idle();
    await check("Clear filters clears register context without clearing editor location",`document.querySelector('#callRegisterContext').textContent.includes('Company-wide') && document.querySelector('#portSelect').value==="port1"`);
    await click('#pciBackTasks');await click('[data-pci-task="new"]');await click('#newCallBtn');
    await wait(`!document.querySelector('#pciDrawer').hidden`);
    await click('#pciEditorBack');
    await check("Clean New Report Back returns to New Port Call location context",`document.querySelector('#pciDrawer').hidden && !document.querySelector('#pciLocationPicker').hidden && document.querySelector('#pciTaskTitle').textContent==="Record a New Port Call" && document.querySelector('#portSelect').value==="port1"`);
    await click('#newCallBtn');await wait(`!document.querySelector('#pciDrawer').hidden`);
    await evaluate(`for(const [id,value] of Object.entries({pciVessel:"vessel1",pciTerminal:"facility1",pciBerth:"Berth 1",pciALF:"2026-01-01T00:00",pciALC:"2026-01-02T00:00",pciEntry:"2026-01-01T00:00",pciDraftF:"8",pciDraftA:"8"}))document.getElementById(id).value=value;const offset=document.querySelector('#pciUtcOffset');offset.value=Array.from(offset.options).find(o=>o.value!=="" ).value;document.querySelector('#pciCargo input').checked=true;`);
    await evaluate(`document.querySelector('#saveCallBtn').click();document.querySelector('#saveCallBtn').click()`);
    await idle();await wait(`document.querySelector('#pciDrawer').hidden`);
    await check("Unchanged save path inserts one Draft and opens detail",`window.__pciFixture.writes.filter(w=>w.table==="pci_port_calls"&&w.op==="insert").length===1 && window.__pciFixture.writes.find(w=>w.table==="pci_port_calls"&&w.op==="insert").payload.status==="draft" && !document.querySelector('#pciReportDetailWorkspace').hidden`);
    await click('#pciBackReports');
    await check("Editor does not restore cleared register restriction",`document.querySelector('#callRegisterContext').textContent.includes("Company-wide")`);
    await writeFile("/tmp/pci-register-desktop.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"},sid)).data,"base64"));
    await open("view_only");
    await check("View-only user cannot create but can read published office guidance",`document.querySelector('[data-pci-task="new"]').getBoundingClientRect().height===0 && !document.querySelector('[data-pci-task="office"]').hidden`);
    await click('[data-pci-task="office"]');
    await check("Office management and review controls stay hidden without grants",`document.querySelector('#newOfficeInfoBtn').hidden && document.querySelector('#proposalPanel').hidden`);
    await open("vessel");
    await check("View-only vessel has no new-call control",`document.querySelector('[data-pci-task="new"]').hidden`);
  }
  if(live && input.location){
    await click('#pciBackTasks');await click('[data-pci-task="profile"]');
    await evaluate(`document.querySelector('#countrySelect').value=${JSON.stringify(input.location.country_code)};document.querySelector('#countrySelect').dispatchEvent(new Event('change'))`);await idle();
    await evaluate(`document.querySelector('#portSelect').value=${JSON.stringify(input.location.port_id)};document.querySelector('#portSelect').dispatchEvent(new Event('change'))`);await idle();
    await check("Live saved port loads approved-profile workspace",`document.querySelector('#portSelect').value===${JSON.stringify(input.location.port_id)} && !document.querySelector('#profilePanel').hidden && document.querySelector('#profileContent').textContent.trim().length>0`);
    await click('#pciBackTasks');await click('[data-pci-task="office"]');
    await check("Live office workspace keeps permission-authorized creation control",`!document.querySelector('#officePanel').hidden && !document.querySelector('#newOfficeInfoBtn').hidden`);
    await click('#pciBackTasks');await click('[data-pci-task="new"]');await click('#newCallBtn');
    await wait(`!document.querySelector('#pciDrawer').hidden`);
    await check("Live unchanged New Call editor opens; no save performed",`document.querySelector('#pciCallForm') && document.querySelector('#pciTerminal') && document.querySelector('#pciVessel')`);
    await check("Live full-width editor retains database-defined sections",`document.querySelector('#pciDrawer').getBoundingClientRect().width>1300 && document.querySelectorAll('#pciCallForm .pci-form-section').length>5 && document.querySelector('#pciDrawerBackdrop').hidden`);
    await writeFile("/tmp/pci-editor-live.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"},sid)).data,"base64"));
    await click('#pciEditorBack');
    await check("Live clean Back returns to New Call task without losing port",`document.querySelector('#pciDrawer').hidden && !document.querySelector('main.pci-page').hidden && !document.querySelector('#pciLocationPicker').hidden && document.querySelector('#portSelect').value===${JSON.stringify(input.location.port_id)}`);
  }
  await call("Emulation.setDeviceMetricsOverride",{width:740,height:1000,deviceScaleFactor:1,mobile:false},sid);
  await click('#pciBackTasks');
  await check("Narrow landing fits viewport",`document.querySelector('.pci-task-grid').getBoundingClientRect().right<=740`);
  await writeFile("/tmp/pci-tasks-narrow.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"},sid)).data,"base64"));
  if(errors.length)throw Error(errors.join("\n"));
  console.log(JSON.stringify({mode:live?"live read-only":"isolated browser fixtures; no backend writes",results,errors}));
}catch(error){console.log(JSON.stringify({results,errors}));console.error(error.stack);process.exitCode=1;}
finally{ws?.close();chrome.kill("SIGTERM");await new Promise(r=>chrome.exitCode!==null?r():chrome.once("exit",r));await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
