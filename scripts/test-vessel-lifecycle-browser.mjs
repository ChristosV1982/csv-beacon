// Real served admin UI + browser-only account/data fixtures. No backend writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import WebSocket from "ws";
const base=process.env.REPLIT_DEV_DOMAIN?`https://${process.env.REPLIT_DEV_DOMAIN}`:"http://127.0.0.1:3000";
const target=await(await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>ws.once("open",r));
let sequence=0;const pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{
  const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
});}
function fixture(){
  const company={id:"11111111-1111-4111-8111-111111111111",company_name:"Development Test Company",is_active:true};
  const vessels=[{id:"22222222-2222-4222-8222-222222222222",name:"LIFECYCLE TEST",company_id:company.id,company_name:company.company_name,is_active:true},
    {id:"33333333-3333-4333-8333-333333333333",name:"INACTIVE TEST",company_id:company.id,company_name:company.company_name,is_active:false}];
  const profile={id:"44444444-4444-4444-8444-444444444444",username:"test_admin",role:"super_admin",is_active:true,is_disabled:false};
  const bundle={profile,user:{id:profile.id},session:{user:{id:profile.id},access_token:"browser-fixture-only"}};
  const history=[];window.lifecycleRequests=[];window.failNextTransition=false;
  const sb={auth:{getSession:async()=>({data:{session:bundle.session}}),getUser:async()=>({data:{user:bundle.user}}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from(table){const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},range(){return q},
      maybeSingle:async()=>({data:table==="profiles"?profile:null,error:null}),single:async()=>({data:profile,error:null}),
      then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return q;},
    async rpc(name,args={}){
      window.lifecycleRequests.push({name,args});
      let data=[];
      if(name==="csvb_admin_list_companies")data=[company];
      if(name==="csvb_admin_list_vessels_by_company")data=structuredClone(vessels);
      if(name==="csvb_admin_set_vessel_active"){
        await new Promise(r=>setTimeout(r,80));
        if(window.failNextTransition){window.failNextTransition=false;return {data:null,error:{message:"Test temporary failure"}};}
        const vessel=vessels.find(v=>v.id===args.p_vessel_id);
        history.push({id:crypto.randomUUID(),vessel_id:vessel.id,previous_is_active:vessel.is_active,
          new_is_active:args.p_is_active,inactivity_reason:args.p_reason,
          restricted_internal_remarks:args.p_internal_remarks,changed_by:profile.id,
          changed_by_username:profile.username,changed_at:new Date().toISOString()});
        vessel.is_active=args.p_is_active;data={changed:true,is_active:vessel.is_active};
      }
      if(name==="csvb_admin_vessel_status_history")data={
        vessel:structuredClone(vessels.find(v=>v.id===args.p_vessel_id)),
        history:structuredClone(history.filter(h=>h.vessel_id===args.p_vessel_id))};
      return {data,error:null};
    }};
  window.AUTH={SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_ANON_KEY:"fixture-only",
    ensureSupabase:()=>sb,requireAuth:async()=>bundle,getSessionUserProfile:async()=>bundle,
    setupAuthButtons:async()=>bundle,roleToUi:r=>r};
}
ws.on("message",async raw=>{
  const m=JSON.parse(raw);
  if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
  if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method!=="Fetch.requestPaused")return;
  const {requestId,request}=m.params;const path=new URL(request.url).pathname;
  const body=path.endsWith("/auth.js")?`(${fixture.toString()})()`:
    request.url.includes("fixture.supabase.co")?JSON.stringify({ok:true,modules:[],permissions:[],roles:["super_admin"],positions:[]}):"";
  await call("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[
    {name:"Access-Control-Allow-Origin",value:"*"},
    {name:"Access-Control-Allow-Headers",value:"authorization,apikey,content-type"},
    {name:"Access-Control-Allow-Methods",value:"POST,GET,OPTIONS"},
    {name:"Content-Type",value:request.url.includes("fixture.supabase.co")?"application/json":"application/javascript"}],body:Buffer.from(body).toString("base64")});
});
async function evaluate(expression){const r=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){return evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+12000;
  const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true);}else if(Date.now()>end){clearInterval(timer);reject(Error("Timeout: "+${JSON.stringify(expression)}));}},30);})`);}
const click=expression=>evaluate(`(${expression}).click()`);
async function filter(value){await evaluate(`document.getElementById("v_status_filter").value=${JSON.stringify(value)};document.getElementById("v_status_filter").dispatchEvent(new Event("change"));`);}
try{
  await call("Page.enable");await call("Runtime.enable");
  await call("Network.setBypassServiceWorker",{bypass:true});await call("Network.setCacheDisabled",{cacheDisabled:true});
  await call("Fetch.enable",{patterns:[{urlPattern:"*auth.js*"},{urlPattern:"*supabase-js*"},{urlPattern:"*supabase.co/*"}]});
  await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call("Page.navigate",{url:base+"/su-admin.html"});
  await wait(`document.querySelectorAll('#vesselsBody button[data-act="deactivate"]').length===1`);
  await click(`document.querySelector('[data-tab="vessels"]')`);
  await filter("active");assert.equal(await evaluate(`document.querySelectorAll("#vesselsBody tr").length`),1);
  await filter("inactive");assert.equal(await evaluate(`document.querySelectorAll('#vesselsBody [data-act="activate"]').length`),1);
  await filter("all");
  await click(`document.querySelector('#vesselsBody [data-act="deactivate"]')`);
  await wait(`document.querySelector("dialog.csvb-vl-dialog")?.open`);
  await click(`document.querySelector('dialog button[type="submit"]')`);
  assert.equal(await evaluate(`window.lifecycleRequests.filter(r=>r.name==="csvb_admin_set_vessel_active").length`),0);
  await evaluate(`document.querySelectorAll("dialog textarea")[0].value="Restricted <b>plain text</b> reason";
    document.querySelectorAll("dialog textarea")[1].value="Private administrative context";window.failNextTransition=true;`);
  await click(`document.querySelector('dialog button[type="submit"]')`);
  await wait(`document.querySelector("dialog .csvb-vl-alert").textContent.includes("Test temporary failure")`);
  assert.equal(await evaluate(`document.querySelector('dialog button[type="submit"]').disabled`),false,"Failure must allow retry");
  await click(`document.querySelector('dialog button[type="submit"]')`);
  await click(`document.querySelector('dialog button[type="submit"]')`);
  await wait(`document.querySelector("dialog .csvb-vl-alert").textContent.includes("Vessel marked Inactive.")`);
  assert.equal(await evaluate(`window.lifecycleRequests.filter(r=>r.name==="csvb_admin_set_vessel_active").length`),2,"One failure + one successful request, no double submit");
  assert.equal(await evaluate(`document.querySelectorAll('#vesselsBody [data-act="activate"]').length`),2);
  assert.equal(await evaluate(`document.getElementById("vesselsBody").textContent.includes("Restricted")`),false);
  await click(`[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="View status history")`);
  await wait(`document.querySelectorAll(".csvb-vl-entry").length===1`);
  assert.match(await evaluate(`document.querySelector(".csvb-vl-entry").textContent`),/test_admin/);
  assert.equal(await evaluate(`document.querySelector(".csvb-vl-entry-text b")`),null,"Restricted text must be escaped");
  for(const width of [1440,390]){
    await call("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:width<600});
    await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    assert.equal(await evaluate(`document.querySelector("dialog").getBoundingClientRect().right<=innerWidth&&document.querySelector("dialog").getBoundingClientRect().left>=0`),true);
    const shot=await call("Page.captureScreenshot",{format:"jpeg",quality:75});
    await fs.writeFile(`/tmp/vessel-status-history-${width}.jpg`,Buffer.from(shot.data,"base64"));
  }
  await click(`document.querySelector("dialog .csvb-vl-x")`);
  await click(`document.querySelector('#vesselsBody [data-act="activate"][data-id="22222222-2222-4222-8222-222222222222"]')`);
  await click(`document.querySelector('dialog button[type="submit"]')`);
  await wait(`document.querySelector("dialog .csvb-vl-alert").textContent.includes("Vessel marked Active.")`);
  assert.equal(await evaluate(`document.querySelectorAll('#vesselsBody [data-act="deactivate"]').length`),1);
  await click(`[...document.querySelectorAll("dialog button")].find(b=>b.textContent==="View status history")`);
  await wait(`document.querySelectorAll(".csvb-vl-entry").length===2`);
  assert.match(await evaluate(`document.querySelector(".csvb-vl-entry .csvb-vl-transition").textContent`),/Inactive → Active/);
  assert.equal(await evaluate(`window.lifecycleRequests.some(r=>/set_profile|onboard|password|set_vessel_company|upsert_vessel/.test(r.name))`),false);
  assert.deepEqual(errors,[]);
  console.log("PASS served admin: Active/Inactive/All filter; required reason; retry after error; single flight; restricted escaped history, actor/chronology; reactivate; no account/transfer/upsert calls; desktop/mobile dialogs. Browser-only fixtures, no backend writes.");
}catch(error){console.error(await evaluate(`({warn:document.getElementById("warnBox")?.textContent,requests:window.lifecycleRequests?.map(r=>r.name),errors:${JSON.stringify(errors)}})`));throw error;}
finally{await call("Page.close");ws.close();}
