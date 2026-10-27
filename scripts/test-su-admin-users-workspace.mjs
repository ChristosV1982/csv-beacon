// Browser-only UI fixture. No real authentication, account or database writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import WebSocket from "ws";
const base="http://127.0.0.1:3000";
const tab=await(await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.once("open",r));
let seq=0;const pending=new Map(),writes=[],errors=[],cleanupCalls=[],jobs=new Map();
let nextJob=0,failOnce=true;
function call(method,params={}){return new Promise((resolve,reject)=>{
  const id=++seq;pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(pending.delete(id))reject(Error(`CDP timeout: ${method}`));},20000).unref();
});}
function fixture(){
  const company={id:"11111111-1111-4111-8111-111111111111",company_name:"Example Maritime",is_active:true};
  const vessel={id:"22222222-2222-4222-8222-222222222222",name:"Example Vessel",company_id:company.id,is_active:true};
  const profile={id:"33333333-3333-4333-8333-333333333333",role:"super_admin",username:"example.admin"};
  const session={user:{id:profile.id},access_token:"browser-fixture-only"};
  const bundle={profile,session};
  const users=Array.from({length:12},(_,i)=>({
    id:`44444444-4444-4444-8444-${String(i).padStart(12,"0")}`,
    user_id:`44444444-4444-4444-8444-${String(i).padStart(12,"0")}`,
    username:`example.user.${String(i+1).padStart(2,"0")}`,role:i%3?"vessel":"company_admin",
    role_name:i%3?"vessel":"company_admin",position:i%3?"Master":"Office",
    company_id:company.id,company_name:company.company_name,
    vessel_id:i%3?vessel.id:null,vessel_name:i%3?vessel.name:"",is_active:i<8,is_disabled:i>=8
  }));
  window.fixtureUsers=users;
  const sb={auth:{getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session.user}})},
    rpc:async(name)=>{
      if(name.includes("list_users"))return{data:window.fixtureUsers};
      if(name.includes("list_vessels"))return{data:[vessel]};
      if(name.includes("list_companies"))return{data:[company]};
      return{data:[],error:null};
    },from(){const q={select(){return q;},order(){return q;},eq(){return q;},
      maybeSingle:async()=>({data:profile}),then:r=>r({data:[]})};return q;}};
  window.AUTH={SUPABASE_URL:"https://ui-fixture.supabase.co",SUPABASE_ANON_KEY:"fixture",
    ensureSupabase:()=>sb,requireAuth:async()=>bundle,getSessionUserProfile:async()=>bundle,
    setupAuthButtons:async()=>bundle,isPlatformAdminRole:r=>r==="super_admin"};
}
ws.on("message",async raw=>{
  const m=JSON.parse(raw);
  if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
  if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method!=="Fetch.requestPaused")return;
  const {requestId,request}=m.params;const url=new URL(request.url);
  let body="",type="application/javascript";
  if(url.pathname.endsWith("/auth.js"))body=`(${fixture.toString()})();`;
  else if(url.hostname==="ui-fixture.supabase.co"){
    type="application/json";const posted=JSON.parse(request.postData||"{}"),action=posted.action;
    if(action==="prepare_user_deletion"||action==="prepare_user_deletions"){
      assert(url.pathname.endsWith("/su-admin-delete-user"));
      const ids=posted.user_ids||[posted.user_id];
      const users=await evaluate(`window.fixtureUsers.filter(u=>${JSON.stringify(ids)}.includes(u.id))`);
      const job={id:`55555555-5555-4555-8555-${String(++nextJob).padStart(12,"0")}`,
        confirmed_at:null,items:users.map(identity=>({user_id:identity.id,identity,status:"pending"}))};
      jobs.set(job.id,job);
      body=JSON.stringify({ok:true,job_id:job.id,users,confirmation_token:"fixture-confirmation-only"});
    }else if(action==="confirm_user_deletions"){
      assert.equal(posted.confirmation_token,"fixture-confirmation-only");
      jobs.get(posted.job_id).confirmed_at="fixture";
      body=JSON.stringify({ok:true});
    }else if(action==="get_user_deletion_job"){
      body=JSON.stringify({ok:true,job:jobs.get(posted.job_id),confirmation_token:"fixture-confirmation-only"});
    }else if(action==="delete_user"){
      assert(url.pathname.endsWith("/su-admin-delete-user"));
      assert(!("confirm_username" in posted));
      const job=jobs.get(posted.job_id),item=job.items.find(i=>i.user_id===posted.user_id);
      assert(job.confirmed_at&&item,"Only confirmed selected users");
      cleanupCalls.push(posted.user_id);
      if(failOnce&&item.identity.username==="example.user.02"){
        failOnce=false;item.status="failed";item.error_text="Simulated linked record";
        body=JSON.stringify({ok:true,status:"failed",error:item.error_text});
      }else{
        assert.equal(item.status==="completed",false,"Completed users must be skipped");
        item.status="completed";writes.push("mocked_selected_user_delete");
        await evaluate(`window.fixtureUsers=window.fixtureUsers.filter(u=>u.id!==${JSON.stringify(posted.user_id)})`);
        body=JSON.stringify({ok:true,status:"completed",user_id:posted.user_id});
      }
    }else{
      if(action&&!["ping","list_users","list_vessels","list_modules_permissions","list_roles_positions","get_role_permissions"].includes(action))writes.push(action);
      body=JSON.stringify({ok:true,roles:["super_admin","company_admin","company_superintendent","vessel","inspector"],positions:[],modules:[],permissions:[],grants:[]});
    }
  }
  await call("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[
    {name:"Content-Type",value:type},{name:"Access-Control-Allow-Origin",value:"*"},
    {name:"Access-Control-Allow-Headers",value:"*"}],body:Buffer.from(body).toString("base64")});
});
async function evaluate(expression){
  const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(condition){
  for(let i=0;i<80;i++){if(await evaluate(condition))return;await new Promise(r=>setTimeout(r,100));}
  throw Error(`UI did not settle: ${condition}`);
}
try{
  await call("Page.enable");await call("Runtime.enable");await call("Network.enable");
  await call("Network.setCacheDisabled",{cacheDisabled:true});
  await call("Network.setBypassServiceWorker",{bypass:true});
  await call("Fetch.enable",{patterns:["*auth.js*","*csvb-module-guard.js*","*supabase*","*cdn.jsdelivr.net*"].map(urlPattern=>({urlPattern,requestStage:"Request"}))});
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate",{url:base+"/su-admin.html"});
  await waitFor("document.querySelectorAll('#usersBody > tr').length===12 && window.__SU_ADMIN_USERS_WORKSPACE__");
  assert.equal(await evaluate("document.querySelectorAll('#cu_username').length"),1);
  assert(await evaluate("document.querySelector('.users-list-card').getBoundingClientRect().width>1200"));
  assert(await evaluate("parseFloat(getComputedStyle(document.querySelector('#usersBody td')).fontSize)>=14"));
  await evaluate("document.getElementById('u_search').value='example.user.01';document.getElementById('u_search').dispatchEvent(new Event('input',{bubbles:true}))");
  await waitFor("document.querySelectorAll('#usersBody > tr').length===1");
  await evaluate("document.getElementById('u_filter_clear').click();document.getElementById('u_filter_role').value='vessel';document.getElementById('u_filter_role').dispatchEvent(new Event('change'))");
  await waitFor("document.querySelectorAll('#usersBody > tr').length===8");
  await evaluate("document.getElementById('usersOpenCreate').click()");
  assert(await evaluate("window.__SU_ADMIN_USERS_WORKSPACE__.isOpen() && document.getElementById('cu_username').getClientRects().length>0"));
  await evaluate("document.getElementById('cu_username').value='unsaved-draft';document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert(await evaluate("!window.__SU_ADMIN_USERS_WORKSPACE__.isOpen() && document.activeElement.id==='usersOpenCreate'"));
  await evaluate("document.getElementById('usersOpenCreate').click()");
  assert.equal(await evaluate("document.getElementById('cu_username').value"),"unsaved-draft");
  // Exercise existing validation, never a valid create/account request.
  await evaluate("document.getElementById('cu_password').value='';document.getElementById('cu_createBtn').click()");
  await waitFor("!document.getElementById('usersModalFeedback').hidden");
  await evaluate("document.getElementById('usersCloseCreate').click();document.querySelector('[data-tab=companies]').click()");
  assert(await evaluate("!document.querySelector('.wrap').classList.contains('users-workspace-active') && document.querySelector('.wrap').style.maxWidth===''"));
  await evaluate("document.querySelector('[data-tab=users]').click()");
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert(await evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"));
  await evaluate("document.getElementById('usersOpenCreate').click()");
  assert(await evaluate("document.querySelector('[role=dialog]').getBoundingClientRect().width<=window.innerWidth"));
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const modalImage=await call("Page.captureScreenshot",{format:"png"});
  await fs.writeFile("/tmp/csvb-users-workspace-modal.png",Buffer.from(modalImage.data,"base64"));
  await evaluate("document.getElementById('usersCloseCreate').click();document.getElementById('u_filter_clear').click();window.scrollTo(0,400)");
  const image=await call("Page.captureScreenshot",{format:"png"});
  await fs.writeFile("/tmp/csvb-users-workspace-desktop.png",Buffer.from(image.data,"base64"));
  // Confirm/cancel only through mocked endpoints; no live account deletion.
  assert.equal(await evaluate("document.querySelectorAll('#usersBody [data-act=delete_user]').length"),12);
  await evaluate("document.querySelector('#usersBody [data-act=delete_user]').click()");
  await waitFor("!document.getElementById('suCleanupDialog').hidden");
  assert(await evaluate("document.getElementById('suCleanupUserList').textContent.includes('example.user.01')"));
  await evaluate("document.getElementById('suCleanupCancel').click()");
  assert.deepEqual(writes,[]);
  assert.equal(await evaluate("document.querySelectorAll('#usersBody input[data-su-cleanup-id]:not(:disabled)').length"),8);
  assert(await evaluate("[...document.querySelectorAll('#usersBody tr')].every(r=>r.children[1].textContent.includes('example.user'))"),"Original cell indices preserved");
  await evaluate("document.getElementById('suCleanupSelectVisible').click();document.getElementById('u_search').value='example.user.02';document.getElementById('u_search').dispatchEvent(new Event('input'))");
  await waitFor("document.getElementById('suCleanupSelectionCount').textContent==='1 selected'");
  await evaluate("document.getElementById('suCleanupClearSelection').click();document.getElementById('u_search').value='';document.getElementById('u_search').dispatchEvent(new Event('input'))");
  await waitFor("document.querySelectorAll('#usersBody > tr').length===12");
  await evaluate("[...document.querySelectorAll('#usersBody input[data-su-cleanup-id]:not(:disabled)')].slice(0,2).forEach(c=>c.click());document.getElementById('suCleanupDeleteSelected').click()");
  await waitFor("!document.getElementById('suCleanupDialog').hidden");
  assert.equal(await evaluate("document.querySelectorAll('#suCleanupUserList li').length"),2);
  await fs.writeFile("/tmp/csvb-user-cleanup-review.png",Buffer.from((await call("Page.captureScreenshot",{format:"png"})).data,"base64"));
  await evaluate("document.getElementById('suCleanupConfirm').click()");
  await waitFor("document.querySelectorAll('#usersBody > tr').length===11&&!document.getElementById('suCleanupClose').disabled");
  assert.equal(cleanupCalls.length,2);
  assert.equal(writes.length,1,"Ordinary failure continued without an automatic retry");
  await evaluate("document.getElementById('suCleanupClose').click();document.getElementById('suCleanupResume').click()");
  await waitFor("document.getElementById('suCleanupConfirm').textContent==='Resume cleanup'");
  await evaluate("document.getElementById('suCleanupConfirm').click()");
  await waitFor("document.querySelectorAll('#usersBody > tr').length===10&&!document.getElementById('suCleanupClose').disabled");
  assert.equal(cleanupCalls.length,3,"Resume skips the already completed row");
  assert.equal(writes.length,2);
  assert.equal(await evaluate("fixtureUsers.filter(u=>u.role==='company_admin').length"),4);
  await evaluate("document.getElementById('suCleanupClose').click()");
  await evaluate("state.canDeleteUsers=false;renderUsers()");
  assert.equal(await evaluate("document.querySelectorAll('#usersBody [data-act=delete_user]').length"),0);
  assert(await evaluate("document.getElementById('suUserCleanupToolbar').hidden"));
  assert(await evaluate("[...document.querySelectorAll('.su-user-cleanup-select-cell')].every(cell=>cell.hidden)"));
  assert.deepEqual(errors,[]);
  console.log("PASS Users workspace: forms/other tabs/mobile, vessel-only selection, filter pruning, confirmation/cancel, continued failure, explicit resume skipping successes, original cell indices and Office accounts preserved. Zero live UI writes/browser exceptions.");
}finally{await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`);ws.close();}
