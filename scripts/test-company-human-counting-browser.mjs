// Disposable synthetic UI state only. No real sign-in or backend writes.
import assert from "node:assert/strict";
import WebSocket from "ws";
import fs from "node:fs";
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const page = await (await fetch("http://127.0.0.1:9222/json/new?about:blank",{method:"PUT"})).json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve=>socket.once("open",resolve));
let id=0;
const pending=new Map();
const calls=(method,params={})=>new Promise((resolve,reject)=>{
  const key=++id; pending.set(key,{resolve,reject}); socket.send(JSON.stringify({id:key,method,params}));
});
socket.on("message",async raw=>{
  const message=JSON.parse(raw);
  if(message.id){const job=pending.get(message.id); if(job){pending.delete(message.id);message.error?job.reject(Error(JSON.stringify(message.error))):job.resolve(message.result);} }
  if(message.method==="Fetch.requestPaused"){
    const {requestId,request}=message.params;
    const url=new URL(request.url);
    if(/\/(?:auth|post_inspection|csvb-module-guard)\.js$/.test(url.pathname)){
      await calls("Fetch.fulfillRequest",{requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"application/javascript"}],body:Buffer.from("").toString("base64")});
    }else await calls("Fetch.continueRequest",{requestId});
  }
});
const evaluate=async expression=>{
  const result=await calls("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
};
await calls("Page.enable");
await calls("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await calls("Network.enable");
await calls("Network.setCacheDisabled",{cacheDisabled:true});
await calls("Network.setBypassServiceWorker",{bypass:true});
await calls("Fetch.enable",{patterns:[{urlPattern:"*",resourceType:"Script"}]});
await calls("Page.navigate",{url:`${base}/post_inspection.html`});
for(let n=0;n<80;n++){
  if(await evaluate("!!document.getElementById('humanCountingPolicyHost')"))break;
  await new Promise(resolve=>setTimeout(resolve,100));
}
await evaluate(`(async()=>{
 const {mountHumanCountingPanel}=await import('/csvb-human-counting-panel.mjs?v=20261026_company_policy_v1');
 window.panelMount=mountHumanCountingPanel;
 window.testPolicy={company_id:'test-company',company_name:'Synthetic Testing Company',human_counting_mode:'per_finding',policy_revision:0,can_edit:true,companies:[]};
 window.testSaves=[];
 window.panelSb={rpc:async(name,args)=>{
   if(name==='csvb_human_counting_policy_save'){
     testSaves.push(args); testPolicy={...testPolicy,human_counting_mode:args.p_mode,policy_revision:testPolicy.policy_revision+1};
   }
   return {data:testPolicy,error:null};
 }};
 await mountHumanCountingPanel({supabase:panelSb,host:document.getElementById('humanCountingPolicyHost'),onSaved:async()=>{}});
})()`);
assert.match(await evaluate("document.getElementById('humanCountingPolicyHost').innerText"),/Human observation counting/);
assert.equal(await evaluate("document.querySelector('input[value=per_finding]').checked"),true);
await evaluate("document.querySelector('input[value=per_pif]').click()");
await evaluate("[...document.getElementById('humanCountingPolicyHost').querySelectorAll('button')].find(b=>b.textContent==='Save').click()");
for(let n=0;n<30;n++){
  if(await evaluate("testSaves.length===1 && testPolicy.policy_revision===1"))break;
  await new Promise(resolve=>setTimeout(resolve,50));
}
assert.equal(await evaluate("testSaves[0].p_company_id"),"test-company");
assert.equal(await evaluate("testSaves[0].p_mode"),"per_pif");
assert.match(await evaluate("document.getElementById('humanCountingPolicyHost').innerText"),/Revision 1/);
await evaluate("document.querySelector('input[value=per_finding]').click()");
await evaluate("[...document.getElementById('humanCountingPolicyHost').querySelectorAll('button')].find(b=>b.textContent==='Save').click()");
await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(await evaluate("testPolicy.human_counting_mode"),"per_finding");
await evaluate(`(async()=>{
 testPolicy={...testPolicy,can_edit:false};
 document.getElementById('humanCountingPolicyHost').replaceChildren();
 await panelMount({supabase:panelSb,host:document.getElementById('humanCountingPolicyHost')});
})()`);
assert.equal(await evaluate("[...document.querySelectorAll('#humanCountingPolicyHost input')].every(i=>i.disabled)"),true);
assert.equal(await evaluate("[...document.querySelectorAll('#humanCountingPolicyHost button')].some(b=>b.textContent==='Save'&&!b.disabled)"),false);
const shot=await calls("Page.captureScreenshot",{format:"jpeg",quality:80});
fs.writeFileSync("/tmp/csvb-human-counting-panel.jpg",Buffer.from(shot.data,"base64"));
await calls("Emulation.setDeviceMetricsOverride",{width:402,height:874,deviceScaleFactor:1,mobile:true});
assert.equal(await evaluate("document.getElementById('humanCountingPolicyHost').scrollWidth<=window.innerWidth"),true);
console.log("PASS: served Entry page panel, both modes, explicit company/revision save and read-only controls; no backend writes.");
await calls("Page.close");
socket.close();
