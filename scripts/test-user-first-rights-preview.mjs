import {spawn} from "node:child_process";
import {mkdtemp,rm,mkdir,writeFile,readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const input=JSON.parse(Buffer.concat(chunks).toString()), checks=[];
const adminSource=await readFile("public/su-admin.js","utf8");
if(!adminSource.includes('init().catch((e) => showWarn(String(e?.message || e)));'))throw Error("Bootstrap changed; review isolated Users test.");
const usersSource=adminSource.replace('init().catch((e) => showWarn(String(e?.message || e)));',"/* auth bootstrap isolated for presentation test */")+`
  state.users=window.__rightsTest.users;state.companies=window.__rightsTest.companies;state.vessels=[];
  currentAdminUser=state.users.find(u=>u.id===window.__rightsTest.root);
  callSuAdmin=async payload=>{window.__rightsTest.accountCalls.push(payload);return {};};
  refreshUsers=async()=>renderUsers();
  initSearch();renderUsers();
  window.__usersPresentation={refresh:()=>renderUsers(),inconsistentFixtures:()=>{
    const base=state.users.find(u=>u.username==="BIK");
    state.users=[...state.users,{...base,id:"00000000-0000-4000-8000-000000000001",username:"FLAG_ONLY_INACTIVE",is_active:false,is_disabled:false},
      {...base,id:"00000000-0000-4000-8000-000000000002",username:"FLAG_ONLY_DISABLED",is_active:true,is_disabled:true}];
    renderUsers();
  },restore:()=>{state.users=window.__rightsTest.users;renderUsers();}};
`;
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
    if(d.method==="Runtime.exceptionThrown")exceptions.push(JSON.stringify(d.params.exceptionDetails));
    if(d.method==="Fetch.requestPaused"){
      const p=d.params, keep=/\/(?:csvb-(?:office-rights|rights-sections)|csvb-user-edit-u05|su-admin-users-workspace)\.js(?:\?|$)/.test(p.request.url);
      if(p.resourceType==="Script"&&/\/su-admin\.js(?:\?|$)/.test(p.request.url))await call("Fetch.fulfillRequest",{
        requestId:p.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from(usersSource).toString("base64")
      },d.sessionId);
      else if(p.resourceType==="Script"&&!keep)await call("Fetch.fulfillRequest",{
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
    window.__rightsTest.calls=[];window.__rightsTest.accountCalls=[];window.__rightsTest.forceHard=false;
    localStorage.setItem("SU_ADMIN_USERS_PARTITION","deactivated");
    window.confirm=()=>true;
    window.AUTH={ensureSupabase:()=>({rpc:async(name,args={})=>{
      const t=window.__rightsTest;t.calls.push({name,args});
      if(name==="csvb_admin_office_access_configuration")return {data:structuredClone(t.config)};
      if(["csvb_admin_list_users_by_company_v2","csvb_admin_list_users_by_company"].includes(name))return {data:structuredClone(t.users)};
      if(name==="csvb_admin_list_vessels_by_company")return {data:[]};
      if(name==="csvb_admin_office_creation_options")return {data:structuredClone(t.options)};
      if(name==="csvb_admin_office_role_defaults"){
        if(t.failRoleRead)return {error:{message:"Simulated role verification unavailable"}};
        return {data:structuredClone(t.roleDefaults[args.p_role_code])};
      }
      if(name==="csvb_admin_office_role_defaults_save"){
        const s=t.roleDefaults[args.p_role_code];
        if(s.revision!==args.p_expected_revision||s.fingerprint!==args.p_expected_fingerprint)
          return {error:{message:"Role defaults changed since loading. Reload before saving."}};
        for(const c of args.p_changes){
          let g=s.grants.find(g=>g.permission_id===c.permission_id);
          if(!g){g={permission_id:c.permission_id,access_profile_code:s.access_profile_code};s.grants.push(g);}
          Object.assign(g,c);
          const cg=t.config.grants.find(g=>g.permission_id===c.permission_id&&g.access_profile_code===s.access_profile_code);
          if(cg)Object.assign(cg,c);else t.config.grants.push({...g});
          for(const u of s.users.filter(u=>u.follows_role)){
            const d=t.diagnostics[u.id]?.permissions.find(p=>p.permission_id===c.permission_id)?.decision;
            if(d&&["role_default","access_profile"].includes(d.source))Object.assign(d,{allowed:c.is_granted,source:"role_default"});
          }
        }
        s.revision++;s.fingerprint+="x";return {data:structuredClone(s)};
      }
      if(name==="csvb_admin_list_companies")return {data:structuredClone(t.companies)};
      if(name==="csvb_admin_list_company_modules"){
        if(t.failCompanyRead)return {error:{message:"Simulated company read unavailable"}};
        return {data:structuredClone(t.companyModules[args.p_company_id])};
      }
      if(name==="csvb_admin_set_company_module"){
        const m=t.companyModules[args.p_company_id].find(m=>m.module_key===args.p_module_key);
        if(!m)return {error:{message:"Unknown module key"}};
        m.is_enabled=args.p_is_enabled;return {data:structuredClone(m)};
      }
      if(name==="csvb_admin_office_permission_diagnostic"){
        if(t.failDiagnostic)return {error:{message:"Simulated diagnostic unavailable"}};
        return {data:structuredClone(t.diagnostics[args.p_profile_id])};
      }
      if(name==="csvb_admin_office_personal_override_save"){
        const d=t.diagnostics[args.p_profile_id],p=d.permissions.find(p=>p.permission_id===args.p_permission_id);
        d.overrides=d.overrides.filter(o=>o.permission_id!==args.p_permission_id);
        if(args.p_mode!=="inherit")d.overrides.push({permission_id:args.p_permission_id,is_granted:args.p_mode==="allow",scope:args.p_scope});
        const u=t.users.find(u=>u.id===args.p_profile_id),s=t.roleDefaults[u.office_role_code];
        const base=s?.grants.find(g=>g.permission_id===args.p_permission_id);
        p.decision={...p.decision,allowed:args.p_mode==="inherit"?!!base?.is_granted:args.p_mode==="allow",source:args.p_mode==="inherit"?"role_default":args.p_mode==="allow"?"personal_allow":"personal_deny",reason:null};
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
  await wait(`!!window.__usersPresentation`);
  await check("Users starts Active even with stale saved Deactivated preference",`document.querySelector('[data-users-partition="active"]').getAttribute("aria-selected")==="true" && !["BIK","MMM","PIS"].some(name=>[...document.querySelectorAll("#usersBody tr")].some(r=>r.textContent.includes(name)))`);
  await ev(`document.querySelector('[data-users-partition="deactivated"]').click()`);
  await wait(`!![...document.querySelectorAll("#usersBody tr button")].find(b=>b.textContent==="Edit")`);
  await check("Deactivated list retains BIK MMM PIS and Reactivate actions",`["BIK","MMM","PIS"].every(name=>[...document.querySelectorAll("#usersBody tr")].some(r=>r.textContent.includes(name)&&r.querySelector('[data-act="enable_user"]')?.textContent==="Reactivate"))`);
  await check("Existing Edit extension remains available on deactivated accounts",`["BIK","MMM","PIS"].every(name=>[...document.querySelectorAll("#usersBody tr")].some(r=>r.textContent.includes(name)&&[...r.querySelectorAll("button")].some(b=>b.textContent==="Edit")))`);
  await ev(`document.getElementById("u_search").value="BIK";document.getElementById("u_search").dispatchEvent(new Event("input",{bubbles:true}))`);
  await check("Deactivated users are searchable without moving to Active",`document.querySelectorAll("#usersBody tr").length===1 && document.querySelector("#usersBody").textContent.includes("BIK") && document.querySelector('[data-users-partition="deactivated"]').getAttribute("aria-selected")==="true"`);
  await ev(`window.__usersPresentation.refresh();document.getElementById("u_filter_clear").click()`);
  await check("Directory refresh and Clear filters retain selected status partition",`document.querySelector('[data-users-partition="deactivated"]').getAttribute("aria-selected")==="true" && document.getElementById("u_search").value===""`);
  await check("Browsing user partitions performs no account writes",`__rightsTest.accountCalls.length===0`);
  await ev(`window.__usersPresentation.inconsistentFixtures()`);
  await check("Both inactive-only and disabled-only accounts are consistently deactivated",`["FLAG_ONLY_INACTIVE","FLAG_ONLY_DISABLED"].every(name=>[...document.querySelectorAll("#usersBody tr")].some(r=>r.textContent.includes(name)&&r.querySelector('[data-act="enable_user"]')))`);
  await ev(`document.querySelector('[data-act="enable_user"][data-id="00000000-0000-4000-8000-000000000001"]').click()`);
  await wait(`__rightsTest.accountCalls.length===1`);
  await check("Reactivate delegates only the selected synthetic account to existing enable_user",`__rightsTest.accountCalls[0].action==="enable_user" && __rightsTest.accountCalls[0].user_id==="00000000-0000-4000-8000-000000000001" && !__rightsTest.accountCalls.some(c=>/delet/.test(c.action))`);
  await ev(`window.__usersPresentation.restore()`);
  await mkdir("generated-artifacts/rights",{recursive:true});
  await ev(`document.getElementById("tab-users").style.display="block";document.getElementById("tab-rights").style.display="none";document.getElementById("usersPartitionContext").scrollIntoView()`);
  await writeFile("generated-artifacts/rights/deactivated-users-desktop.jpg",Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80},sid)).data,"base64"));
  await ev(`document.querySelector('[data-users-partition="active"]').click();document.getElementById("tab-users").style.display="none"`);
  await ev(`{document.querySelectorAll('[id^="tab-"]').forEach(n=>n.style.display="none");document.getElementById("tab-rights").style.display="block";document.querySelector('[data-tab="rights"]').click();}`);
  await wait(`document.querySelectorAll("#officeRightsPanel [data-user] option").length>2`);
  await check("User-first workspace; shared/legacy controls collapsed",`!document.getElementById("officeRightsAdvanced").open && !document.querySelector("#officeRightsPanel [data-save-users]").offsetParent===false`);
  await set("#officeRightsPanel [data-user]",input.aga);
  const ids=Object.fromEntries(input.diagnostics[input.aga].permissions.filter(p=>p.module_code==="POST_INSPECTION").map(p=>[p.action,p.permission_id]));
  const editRow=`[data-permission-row="${ids.edit}"]`, viewRow=`[data-permission-row="${ids.view}"]`;
  await wait(`document.querySelector('${editRow} .office-rights-effective')?.dataset.allowed==="true"`);
  await check("All displayed AGA decisions match the current live snapshot without changing grants",
    JSON.stringify(input.diagnostics[input.aga].permissions.filter(p=>p.module_code==="POST_INSPECTION")
      .map(p=>({id:p.permission_id,allowed:p.decision.allowed})))+
    `.every(p=>document.querySelector('[data-permission-row="'+p.id+'"] .office-rights-effective').dataset.allowed===String(p.allowed))`);
  await check("Registered Review action is displayed",`[...document.querySelectorAll(".office-rights-action > strong")].some(n=>n.textContent==="Review")`);
  await ev(`document.querySelector('${editRow} [data-choice="deny"]').click()`);
  await check("Unsaved setting does not misrepresent backend result",`document.querySelector('${editRow} .office-rights-effective').dataset.allowed==="true" && document.querySelector("[data-dirty]").textContent.includes("1 unsaved")`);
  await set("#officeRightsPanel [data-reason]","Isolated UI test (simulated writes only)");
  await ev(`document.querySelector("[data-save-users]").click()`);
  await wait(`document.querySelector("[data-status]").textContent.includes("backend-verified")`);
  await check("Save only calls personal override RPC and reloads diagnostic",`document.querySelector('${editRow} .office-rights-effective').dataset.allowed==="false" && __rightsTest.calls.filter(c=>/save/.test(c.name)).every(c=>c.name==="csvb_admin_office_personal_override_save")`);
  await ev(`document.querySelector('${editRow} [data-use-default]').click();document.querySelector("[data-save-users]").click()`);
  await wait(`document.querySelector('${editRow} .office-rights-origin').textContent.includes("Office Role defaults")`);
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
  await wait(`document.querySelector("[data-policy]").textContent.includes("earlier role settings")`);
  await check("Legacy account is not silently migrated or written",`document.querySelector("[data-save-users]").disabled && [...document.querySelectorAll("#officeRightsPanel [data-permission]")].every(n=>n.disabled)`);
  await set("#officeRightsPanel [data-user]",input.root);
  await check("Protected/non-Office roles cannot be changed by Office editor",`document.querySelector("[data-policy]").textContent.includes("Protected/non-Office") && !document.querySelectorAll(".office-rights-module").length`);
  await set("#officeRightsPanel [data-user]",input.aga);
  await wait(`!!document.querySelector('${editRow}')`);
  await ev(`document.getElementById("officeRightsAdvanced").open=true`);
  await set("#officeRightsAdvanced [data-profile]",input.users.find(u=>u.id===input.aga).office_access_profile_code);
  await check("Advanced shared editor identifies affected users",`document.querySelector("[data-affected]").textContent.includes("AGA") && document.querySelector("[data-affected]").textContent.includes("DSK")`);
  await ev(`document.getElementById("officeRightsAdvanced").open=false`);
  await check("Three sections exist; user-first workspace is preserved",`document.querySelectorAll("[data-rights-section]").length===3 && document.getElementById("rightsUserTab").getAttribute("aria-selected")==="true"`);
  await ev(`document.querySelector('[data-rights-section="role"]').click()`);
  await wait(`document.querySelectorAll("[data-office-role] option").length>2`);
  await set("[data-office-role]",input.users.find(u=>u.id===input.aga).office_role_code);
  await wait(`!!document.querySelector('[data-role-permission="${ids.edit}"]:not(:disabled)')`);
  await check("Role editor loads isolated backend defaults and affected-user count",`document.querySelector(".rights-readonly-note").textContent.includes("isolated and audited") && document.querySelector("[data-role-context]").textContent.includes("user(s) follow this role") && document.querySelectorAll("[data-role-rows] tr").length>5 && document.querySelector("[data-role-save]").disabled`);
  await check("Selected section matches visible panel",`document.getElementById("rightsRoleTab").getAttribute("aria-selected")==="true" && document.getElementById("rightsUserTab").getAttribute("aria-selected")==="false" && !document.getElementById("rightsRolePanel").hidden`);
  await check("No role or company writes occur on selection",`!__rightsTest.calls.some(c=>c.name==="csvb_admin_set_company_module" || c.name==="csvb_admin_office_access_save")`);
  await set(`[data-role-permission="${ids.edit}"]`,"allow");
  await check("Role edits are staged without changing backend decisions",`!document.querySelector("[data-role-save]").disabled && !__rightsTest.calls.some(c=>c.name==="csvb_admin_office_role_defaults_save")`);
  await ev(`document.querySelector("[data-role-reason]").value="Isolated UI test; no live writes";window.confirm=()=>false;document.querySelector("[data-role-save]").click()`);
  await check("Cancelling shared role confirmation does not save",`!__rightsTest.calls.some(c=>c.name==="csvb_admin_office_role_defaults_save")`);
  await ev(`window.confirm=()=>true;document.querySelector("[data-role-save]").click()`);
  await wait(`document.querySelector("[data-role-context]").textContent.includes("Saved and backend-verified")`);
  await check("Role save uses narrow audited endpoint and verifies saved defaults",`__rightsTest.calls.filter(c=>c.name==="csvb_admin_office_role_defaults_save").length===1 && document.querySelector("[data-role-save]").disabled`);
  await set(`[data-role-permission="${ids.edit}"]`,"deny");
  await ev(`__rightsTest.failRoleRead=true;document.querySelector("[data-role-save]").click()`);
  await wait(`document.querySelector("[data-role-context]").textContent.includes("verification failed")`);
  await check("Role verification failure locks edits and never claims success",`document.querySelector("[data-role-save]").disabled && [...document.querySelectorAll("[data-role-permission]")].every(e=>e.disabled)`);
  await ev(`__rightsTest.failRoleRead=false;document.querySelector("[data-role-reload]").click()`);
  await wait(`!!document.querySelector('[data-role-permission="${ids.edit}"]:not(:disabled)')`);
  await ev(`document.querySelector('[data-rights-section="company"]').click()`);
  await wait(`document.querySelectorAll("[data-company-select] option").length>1`);
  const companyId=input.users.find(u=>u.id===input.aga).company_id||input.companies[0].id;
  await set("[data-company-select]",companyId);
  await wait(`document.querySelectorAll("[data-company-key]").length>0 && !document.querySelector("[data-company-reload]").disabled`);
  await check("Company Builder links to its actual route and honestly reports API limitation",`document.querySelector("[data-open-builder]").getAttribute("href")==="./q-company.html" && document.querySelector("[data-company-builder-note]").textContent.includes("cannot safely offer") && !__rightsTest.calls.some(c=>c.name==="csvb_admin_set_company_module")`);
  await ev(`document.querySelector("[data-company-key]").click()`);
  await check("Company toggles stage changes without writing",`!document.querySelector("[data-company-save]").disabled && !__rightsTest.calls.some(c=>c.name==="csvb_admin_set_company_module")`);
  await ev(`window.confirm=()=>false;document.querySelector("[data-company-save]").click()`);
  await check("Company confirmation cancellation does not write",`!__rightsTest.calls.some(c=>c.name==="csvb_admin_set_company_module")`);
  await ev(`window.confirm=()=>true;document.querySelector("[data-company-save]").click()`);
  await wait(`document.querySelector("[data-company-status]").textContent.includes("saved and backend-verified")`);
  await check("Explicit company save uses only existing setter, verifies backend and leaves grants alone",`__rightsTest.calls.filter(c=>c.name==="csvb_admin_set_company_module").length===1 && !__rightsTest.calls.some(c=>c.name==="csvb_admin_office_access_save") && document.querySelector("[data-company-save]").disabled`);
  await ev(`document.querySelector("[data-company-key]").click();__rightsTest.failCompanyRead=true;document.querySelector("[data-company-save]").click()`);
  await wait(`document.querySelector("[data-company-status]").textContent.includes("could not be verified")`);
  await check("Company reload failure locks edits and never reports success",`document.querySelector("[data-company-save]").disabled && [...document.querySelectorAll("[data-company-key]")].every(c=>c.disabled)`);
  await ev(`{__rightsTest.failCompanyRead=false;document.querySelector("[data-company-reload]").click();}`);
  await wait(`!document.querySelector("[data-company-reload]").disabled`);
  await ev(`document.querySelector('[data-rights-section="user"]').click()`);
  await set("#officeRightsPanel [data-user]",input.legacy);
  await wait(`document.querySelector(".rights-blocker-card p").textContent.includes("Deletion eligibility")`);
  await check("Deletion explanation is non-destructive and never claims eligibility",`document.querySelector(".rights-blocker-card").textContent.includes("not verified by this screen") && !__rightsTest.calls.some(c=>/cleanup|delet/.test(c.name)) && !document.querySelectorAll(".rights-blocker-card button").length`);
  await set("#officeRightsPanel [data-user]",input.aga);
  await wait(`!!document.querySelector('${editRow}')`);
  await check("Normal user UI uses simple labels without technical defaults",`document.querySelector('${editRow} [data-use-default]').textContent==="Same as role" && !/legacy|inherited|profile default/i.test(document.getElementById("officeRightsPanel").textContent)`);
  await mkdir("generated-artifacts/rights",{recursive:true});
  await ev(`document.querySelector('[data-rights-section="role"]').click();document.getElementById("csvbRightsSections").scrollIntoView()`);
  await new Promise(r=>setTimeout(r,210));
  await writeFile("generated-artifacts/rights/role-overview-desktop.jpg",Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80},sid)).data,"base64"));
  await set("[data-office-role]","");
  await check("Clearing role selection removes stale mapped permissions",`!document.querySelector("[data-role-rows]").children.length && !document.querySelector("[data-role-base]").textContent`);
  await ev(`document.querySelector('[data-rights-section="company"]').click();document.getElementById("csvbRightsSections").scrollIntoView()`);
  await new Promise(r=>setTimeout(r,210));
  await writeFile("generated-artifacts/rights/company-modules-desktop.jpg",Buffer.from((await call("Page.captureScreenshot",{format:"jpeg",quality:80},sid)).data,"base64"));
  await ev(`document.querySelector('[data-rights-section="user"]').click()`);
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
