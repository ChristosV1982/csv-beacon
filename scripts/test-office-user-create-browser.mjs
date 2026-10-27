// Disposable authenticated-UI fixture. Every account write is in-memory only.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";
const target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", {method:"PUT"})).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open",resolve));
let seq=0; const waiters=new Map();
const cdp=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++seq;waiters.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});
const allowed=/\/(su-admin-users-workspace|csvb-office-user-create|csvb-onboard-personnel-admin|csvb-onboard-personnel-admin-u02d-fix|csvb-onboard-personnel-terminology-u04|csvb-user-edit-u05)\.js\?/;
ws.on("message",async raw=>{
  const m=JSON.parse(raw);
  if(m.id&&waiters.has(m.id)){const p=waiters.get(m.id);waiters.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
  if(m.method!=="Fetch.requestPaused")return;
  const {requestId,request,resourceType}=m.params, url=new URL(request.url);
  if(url.host==="127.0.0.1:3000"&&/\/su-admin\.js\?/.test(url.href)){
    const original=readFileSync("public/su-admin.js","utf8");
    const boot="init().catch((e) => showWarn(String(e?.message || e)));";
    assert(original.includes(boot));
    await cdp("Fetch.fulfillRequest",{requestId,responseCode:200,
      responseHeaders:[{name:"Content-Type",value:"application/javascript"}],
      body:Buffer.from(original.replace(boot,"window.__fixtureBooted=true;")).toString("base64")});
  } else if(url.host==="127.0.0.1:3000"&&(resourceType!=="Script"||allowed.test(url.href))){
    await cdp("Fetch.continueRequest",{requestId});
  } else {
    await cdp("Fetch.fulfillRequest",{requestId,responseCode:200,
      responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:""});
  }
});
async function js(expression){
  const r=await cdp("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
  await cdp("Page.enable");await cdp("Runtime.enable");await cdp("Network.enable");
  await cdp("Network.setCacheDisabled",{cacheDisabled:true});
  await cdp("Network.setBypassServiceWorker",{bypass:true});
  await cdp("Fetch.enable",{patterns:[{urlPattern:"*"}]});
  await cdp("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const catalogue=JSON.parse(readFileSync("/tmp/office-create-options.json","utf8"));
  await cdp("Page.addScriptToEvaluateOnNewDocument",{source:`
    window.__createFixture={sends:[],reads:0,rows:[],options:${JSON.stringify(catalogue)}};
    window.confirm=()=>true;window.alert=()=>{};
    window.__fixtureCompany="44444444-4444-4444-8444-444444444444";
    window.__fixtureVessel="55555555-5555-4555-8555-555555555555";
    window.__fixtureSb={
      rpc:async(name,args)=>{
        if(name==="csvb_admin_office_creation_options")return {data:__createFixture.options};
        if(name==="csvb_admin_list_users_by_company_v2"){__createFixture.reads++;return {data:__createFixture.rows};}
        return {data:[]};
      },
      from:table=>{
        const data=table==="companies"?[{id:__fixtureCompany,company_name:"Fixture Company",short_name:"Fixture Company",is_active:true}]
          :table==="vessels"?[{id:__fixtureVessel,vessel_name:"Fixture Vessel",company_id:__fixtureCompany,is_active:true}]
          :table==="onboard_ranks"?[{id:__fixtureVessel,rank_name:"Master",rank_code:"MASTER",name:"Master",is_active:true}]:[];
        return {select(){return this},eq(){return this},or(){return this},order(){return this},limit(){return this},
          maybeSingle:async()=>({data:data[0]||null}),single:async()=>({data:data[0]||null}),
          then(resolve){return Promise.resolve({data}).then(resolve)}};
      }
    };
    window.AUTH={ensureSupabase:()=>window.__fixtureSb};
  `});
  await cdp("Page.navigate",{url:"http://127.0.0.1:3000/su-admin.html"});
  for(let i=0;i<70;i++){if(await js('!!document.getElementById("cu_office_role")'))break;await sleep(100);}
  assert.equal(await js('!!document.getElementById("cu_office_role")'),true);
  await js(`(() => {
    state.companies=[{id:__fixtureCompany,company_name:"Fixture Company",short_name:"Fixture Company"}];
    state.companiesLoaded=true;state.selectedCompanyId=null;
    renderUserCompanyDropdown();
    window.callSuAdmin=async payload=>{
      if(payload.action==="list_vessels")return {vessels:[{id:__fixtureVessel,vessel_name:"Fixture Vessel",company_id:__fixtureCompany,is_active:true}]};
      if(payload.action!=="create_office_user")throw Error("Unexpected fixture account action");
      __createFixture.sends.push({...payload,password:"[not retained]"});
      await new Promise(r=>setTimeout(r,100));
      const role=__createFixture.options.roles.find(r=>r.code===payload.office_role_code);
      const profile=__createFixture.options.access_profiles.find(r=>r.code===payload.access_profile_code);
      __createFixture.rows=[{id:"66666666-6666-4666-8666-666666666666",username:payload.username,
        company_id:__fixtureCompany,company_name:"Fixture Company",role_name:"company_superintendent",
        office_role_code:role.code,office_role_label:role.display_name,
        office_access_profile_code:profile.code,office_access_profile_label:profile.display_name,
        office_profile_is_role_default:profile.code===role.default_access_profile_code,
        office_permission_enforcement_active:false,user_position:payload.position,
        is_active:false,is_disabled:true,force_password_reset:true}];
      return {ok:true,user_id:__createFixture.rows[0].id,message:"Fixture account created inactive (in memory only)."};
    };
    cu_creation_mode.value="office";cu_creation_mode.dispatchEvent(new Event("change",{bubbles:true}));
  })()`);
  await sleep(2900); // Include all late-installing legacy button extensions.
  await js('cu_creation_mode.value="office";cu_creation_mode.dispatchEvent(new Event("change",{bubbles:true}));');
  await sleep(150);
  assert.equal(await js('cu_office_role.options.length'),17);
  assert.equal(await js('getComputedStyle(cu_role.closest(".field")).display'),"none");
  assert.equal(await js('getComputedStyle(cu_vessel.closest(".field")).display'),"none");
  await js(`cu_office_role.value=__createFixture.options.roles.find(r=>r.display_name==="Marine Coordinator").code;
    cu_office_role.dispatchEvent(new Event("change"));`);
  assert.equal(await js('cu_access_profile.value'),"company_administrator_access");
  await js('cu_access_profile.value="standard_office_view_only";cu_access_profile.dispatchEvent(new Event("change"));');
  assert.match(await js('officeCreateProfileStatus.innerText'),/Custom per-user/);
  await js(`cu_office_role.value=__createFixture.options.roles.find(r=>r.display_name==="Marine Superintendent").code;
    cu_office_role.dispatchEvent(new Event("change"));`);
  assert.equal(await js('cu_access_profile.value'),"standard_office_view_only");
  assert.match(await js('officeCreateProfileStatus.innerText'),/inactive.*locked/);
  await js(`cu_company.value=__fixtureCompany;cu_username.value="office.browser.fixture";
    cu_password.value="fixture-password-only";cu_first_name.value="Example";cu_last_name.value="Office";
    cu_force_reset.checked=true;cu_createBtn.click();cu_createBtn.click();`);
  await sleep(600);
  assert.equal(await js('__createFixture.sends.length'),1,JSON.stringify(await js('__createFixture.sends')));
  assert.equal(await js('__createFixture.sends[0].action'),"create_office_user");
  assert.equal(await js('__createFixture.sends[0].force_password_reset'),true);
  assert.equal(await js('"role" in __createFixture.sends[0]'),false);
  assert.equal(await js('"vessel_id" in __createFixture.sends[0]'),false);
  assert.equal(await js('__createFixture.reads>=1'),true);
  assert.match(await js('usersBody.innerText'),/Marine Superintendent/);
  assert.match(await js('usersBody.innerText'),/Standard Office View-Only/);
  await js('cu_creation_mode.value="onboard";cu_creation_mode.dispatchEvent(new Event("change",{bubbles:true}));');
  assert.equal(await js('getComputedStyle(officeCreateFields).display'),"none");
  assert.notEqual(await js('getComputedStyle(cu_onboard_personnel_block).display'),"none");
  assert.notEqual(await js('getComputedStyle(cu_vessel.closest(".field")).display'),"none");
  assert.match(await js('cu_username.closest(".field").innerText'),/DANAOS/);
  await js('cu_creation_mode.value="platform_admin";cu_creation_mode.dispatchEvent(new Event("change",{bubbles:true}));');
  assert.notEqual(await js('getComputedStyle(officeCreateProtected).display'),"none");
  assert.equal(await js('getComputedStyle(officeCreateFields).display'),"none");
  await js(`cu_creation_mode.value="office";cu_creation_mode.dispatchEvent(new Event("change",{bubbles:true}));
    document.querySelector('[data-tab="users"]')?.click();
    document.getElementById("usersOpenCreate")?.click();`);
  // Open the existing workspace modal if its button convention differs.
  await js(`if(document.getElementById("usersCreateDialog")?.showModal&&!usersCreateDialog.open)usersCreateDialog.showModal();`);
  writeFileSync("/tmp/csvb-office-create-fixture.png",Buffer.from((await cdp("Page.captureScreenshot",{format:"png"})).data,"base64"));
  console.log("PASS: actual served Create scripts: all 16 Office roles, role defaults/custom profile, hidden legacy role/vessel, single shared create despite late handlers/double-click, directory refresh, onboard DANAOS/vessel/rank and protected Super Admin modes. No real account created.");
} finally { await cdp("Page.close");ws.close(); }
