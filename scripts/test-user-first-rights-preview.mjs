import {spawn} from "node:child_process";
import {mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const input=JSON.parse(Buffer.concat(chunks).toString()), checks=[];
const dir=await mkdtemp(path.join(os.tmpdir(),"user-rights-preview-"));
const chrome=spawn("/repl/tools/bin/chromium",["--headless","--no-sandbox","--disable-gpu",
  "--remote-debugging-port=0","--user-data-dir="+dir,"about:blank"],{stdio:["ignore","ignore","pipe"]});
let ws;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let out="";chrome.stderr.on("data",c=>{out+=c;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});
    chrome.on("exit",()=>reject(Error("Browser exited")));
  });
  ws=new WebSocket(endpoint);await new Promise(r=>ws.once("open",r));
  let seq=0;const pending=new Map(),exceptions=[];
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
  ws.on("message",async buffer=>{
    const d=JSON.parse(buffer);
    if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p?.reject(Error(d.error.message)):p?.resolve(d.result);}
    if(d.method==="Runtime.exceptionThrown")exceptions.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text);
    if(d.method==="Fetch.requestPaused"){
      const p=d.params, keep=/\/csvb-office-rights\.js(?:\?|$)/.test(p.request.url);
      if(p.resourceType==="Script"&&!keep)await call("Fetch.fulfillRequest",{
        requestId:p.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from("/* isolated presentation check; other admin scripts are not executed */").toString("base64")
      },d.sessionId);
      else await call("Fetch.continueRequest",{requestId:p.requestId},d.sessionId);
    }
  });
  const {targetId}=await call("Target.createTarget",{url:"about:blank"});
  const {sessionId:sid}=await call("Target.attachToTarget",{targetId,flatten:true});
  for(const method of ["Page.enable","Runtime.enable","Network.enable"])await call(method,{},sid);
  await call("Fetch.enable",{patterns:[{urlPattern:"*",resourceType:"Script"}]},sid);
  await call("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__rightsTest=${JSON.stringify(input)};
    window.__rightsTest.calls=[];window.__rightsTest.forceHard=false;
    window.confirm=()=>true;
    window.AUTH={ensureSupabase:()=>({rpc:async(name,args={})=>{
      const t=window.__rightsTest;t.calls.push({name,args});
      if(name==="csvb_admin_office_access_configuration")return {data:structuredClone(t.config)};
      if(name==="csvb_admin_list_users_by_company_v2")return {data:structuredClone(t.users)};
      if(name==="csvb_admin_office_permission_diagnostic"){
        if(t.failDiagnostic)return {error:{message:"Simulated diagnostic unavailable"}};
        return {data:structuredClone(t.diagnostics[args.p_profile_id])};
      }
      if(name==="csvb_admin_office_personal_override_save"){
        const d=t.diagnostics[args.p_profile_id],p=d.permissions.find(p=>p.permission_id===args.p_permission_id);
        d.overrides=d.overrides.filter(o=>o.permission_id!==args.p_permission_id);
        if(args.p_mode!=="inherit")d.overrides.push({permission_id:args.p_permission_id,is_granted:args.p_mode==="allow",scope:args.p_scope});
        p.decision={...p.decision,allowed:args.p_mode==="allow",source:args.p_mode==="inherit"?"access_profile":args.p_mode==="allow"?"personal_allow":"personal_deny",reason:null};
        if(t.forceHard&&args.p_mode==="allow")p.decision={...p.decision,allowed:false,source:"hard_constraint",reason:"Module not enabled for assigned company"};
        d.custom_permissions_applied=!!d.overrides.length;return {data:null};
      }
      return {error:{message:"Unexpected write/API call: "+name}};
    }})};`},sid);
  const ev=async expression=>{
    const r=await call("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true},sid);
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  };
  const wait=async expression=>{
    const end=Date.now()+20000;
    while(Date.now()<end){if(await ev(expression))return;await new Promise(r=>setTimeout(r,70));}
    throw Error("Timeout: "+expression+"; "+await ev(`document.querySelector("#officeRightsPanel [data-status]")?.textContent`));
  };
  const check=async(name,expr)=>{if(!await ev(expr))throw Error(name);checks.push(name);};
  const set=async(selector,value)=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event("change",{bubbles:true}));}`);
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sid);
  await call("Page.navigate",{url:"http://127.0.0.1:3000/su-admin.html"},sid);
  await wait(`!!document.getElementById("officeRightsPanel")`);
  await ev(`{document.querySelectorAll('[id^="tab-"]').forEach(n=>n.style.display="none");document.getElementById("tab-rights").style.display="block";document.querySelector('[data-tab="rights"]').click();}`);
  await wait(`document.querySelectorAll("#officeRightsPanel [data-user] option").length>2`);
  await check("User-first workspace; shared/legacy controls collapsed",`!document.getElementById("officeRightsAdvanced").open && !document.querySelector("#officeRightsPanel [data-save-users]").offsetParent===false`);
  await set("#officeRightsPanel [data-user]",input.aga);
  const ids=Object.fromEntries(input.diagnostics[input.aga].permissions.filter(p=>p.module_code==="POST_INSPECTION").map(p=>[p.action,p.permission_id]));
  const editRow=`[data-permission-row="${ids.edit}"]`, viewRow=`[data-permission-row="${ids.view}"]`;
  await wait(`document.querySelector('${editRow} .office-rights-effective')?.dataset.allowed==="true"`);
  await check("AGA live-snapshot View/Edit allowed, Export/Admin denied",`document.querySelector('${viewRow} .office-rights-effective').dataset.allowed==="true" && document.querySelector('[data-permission-row="${ids.admin}"] .office-rights-effective').dataset.allowed==="false" && document.querySelector('[data-permission-row="${ids.export}"] .office-rights-effective').dataset.allowed==="false"`);
  await check("Registered Review action is displayed",`[...document.querySelectorAll(".office-rights-action > strong")].some(n=>n.textContent==="Review")`);
  await ev(`document.querySelector('${editRow} [data-choice="deny"]').click()`);
  await check("Unsaved setting does not misrepresent backend result",`document.querySelector('${editRow} .office-rights-effective').dataset.allowed==="true" && document.querySelector("[data-dirty]").textContent.includes("1 unsaved")`);
  await set("#officeRightsPanel [data-reason]","Isolated UI test (simulated writes only)");
  await ev(`document.querySelector("[data-save-users]").click()`);
  await wait(`document.querySelector("[data-status]").textContent.includes("backend-verified")`);
  await check("Save only calls personal override RPC and reloads diagnostic",`document.querySelector('${editRow} .office-rights-effective').dataset.allowed==="false" && __rightsTest.calls.filter(c=>/save/.test(c.name)).every(c=>c.name==="csvb_admin_office_personal_override_save")`);
  await ev(`document.querySelector('${editRow} [data-use-default]').click();document.querySelector("[data-save-users]").click()`);
  await wait(`document.querySelector('${editRow} .office-rights-origin').textContent.includes("Access Profile")`);
  await check("Use profile default removes override, does not imply Allow",`document.querySelector('${editRow} .office-rights-effective').dataset.allowed==="false" && !__rightsTest.diagnostics[__rightsTest.aga].overrides.some(o=>o.permission_id==="${ids.edit}")`);
  await ev(`{__rightsTest.forceHard=true;document.querySelector('${editRow} [data-choice="allow"]').click();document.querySelector("[data-save-users]").click();}`);
  await wait(`document.querySelector("[data-status]").textContent.includes("No effective grant is claimed")`);
  await check("Hard denial after save is reported and Allow disabled",`document.querySelector('${editRow} .office-rights-reason').textContent.includes("Module not enabled") && document.querySelector('${editRow} [data-choice="allow"]').disabled`);
  await ev(`{document.querySelector('${editRow} [data-use-default]').click();__rightsTest.failDiagnostic=true;document.querySelector("[data-save-users]").click();}`);
  await wait(`document.querySelector("[data-status]").textContent.includes("backend verification failed")`);
  await check("Failed verification never claims success and locks editing",`document.querySelector("[data-save-users]").disabled && document.querySelector("[data-policy]").textContent.includes("could not be verified")`);
  await ev(`{__rightsTest.failDiagnostic=false;document.querySelector("[data-reload]").click();}`);
  await wait(`!!document.querySelector('${editRow}')`);
  await set("#officeRightsPanel [data-user]",input.legacy);
  await wait(`document.querySelector("[data-policy]").textContent.includes("Legacy fallback preserved")`);
  await check("Legacy account is not silently migrated or written",`document.querySelector("[data-save-users]").disabled && [...document.querySelectorAll("#officeRightsPanel [data-permission]")].every(n=>n.disabled)`);
  await set("#officeRightsPanel [data-user]",input.root);
  await check("Protected/non-Office roles cannot be changed by Office editor",`document.querySelector("[data-policy]").textContent.includes("Protected/non-Office") && !document.querySelectorAll(".office-rights-module").length`);
  await set("#officeRightsPanel [data-user]",input.aga);
  await wait(`!!document.querySelector('${editRow}')`);
  await ev(`document.getElementById("officeRightsAdvanced").open=true`);
  await check("Advanced shared editor identifies affected users",`document.querySelector("[data-affected]").textContent.includes("AGA") && document.querySelector("[data-affected]").textContent.includes("DSK")`);
  await ev(`document.getElementById("officeRightsAdvanced").open=false`);
  await ev(`{__rightsTest.diagnostics[__rightsTest.aga]=${JSON.stringify(input.diagnostics[input.aga])};
    __rightsTest.forceHard=false;document.querySelector("[data-reload]").click();}`);
  await wait(`document.querySelector('${editRow} .office-rights-effective')?.dataset.allowed==="true"`);
  await check("Reload restores actual live backend snapshot after isolated tests",`document.querySelector('${viewRow} .office-rights-effective').dataset.allowed==="true"`);
  await mkdir("generated-artifacts/rights",{recursive:true});
  await ev(`{const e=document.querySelector("[data-search]");e.value="Post-Inspection";e.dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("officeRightsPanel").scrollIntoView();}`);
  await writeFile("generated-artifacts/rights/user-first-desktop.jpg",Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80},sid)).data,"base64"));
  await call("Emulation.setDeviceMetricsOverride",{width:768,height:1024,deviceScaleFactor:1,mobile:false},sid);
  await check("Tablet workspace has no page overflow",`document.documentElement.scrollWidth<=innerWidth+2`);
  await writeFile("generated-artifacts/rights/user-first-tablet.jpg",Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80},sid)).data,"base64"));
  await call("Emulation.setDeviceMetricsOverride",{width:402,height:874,deviceScaleFactor:1,mobile:false},sid);
  await check("Narrow layout has no page overflow",`document.documentElement.scrollWidth<=innerWidth+2`);
  if(exceptions.length)throw Error(exceptions.join("\\n"));
  console.log(JSON.stringify({passed:true,checks,mode:"Live read-only snapshots; isolated browser writes simulated; no accounts created"}));
} finally {
  ws?.close();chrome.kill("SIGTERM");await new Promise(r=>chrome.once("exit",r));
  await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
