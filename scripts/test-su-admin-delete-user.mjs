// Mocked worker regression: no real account/data mutation.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {webcrypto} from "node:crypto";
globalThis.crypto ||= webcrypto;
const source=await fs.readFile("supabase/functions/su-admin-delete-user/handler.js","utf8");
const {createDeleteUserHandler}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const actor="11111111-1111-4111-8111-111111111111",user="22222222-2222-4222-8222-222222222222",
 other="33333333-3333-4333-8333-333333333333",jobId="44444444-4444-4444-8444-444444444444";
let role="super_admin",active=true,time=100000,confirmed=false,state="processing",blocked=false,finalizeFails=false;
const deletes=[],calls=[];
const identity={id:user,username:"fixture.vessel",role:"vessel",vessel_name:"TEST VESSEL"};
const job=()=>({id:jobId,mode:"vessel_cleanup",confirmed_at:confirmed?"now":null,
 items:[{user_id:user,identity,status:state==="completed"?"completed":"pending"}]});
const sbAdmin={
 auth:{getUser:async()=>({data:{user:{id:actor}}}),admin:{deleteUser:async id=>{deletes.push(id);return{};}}},
 from:()=>({select(){return this;},eq(){return this;},single:async()=>({data:{id:actor,role,is_active:active,is_disabled:!active}})}),
 rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==="csvb_su_cleanup_prepare"){
   if(args.p_user_ids.includes(other))return{error:{code:"P0001",message:"Vessel cleanup rejects Office/platform accounts"}};
   return{data:job()};
  }
  if(name==="csvb_su_cleanup_confirm"){confirmed=true;return{};}
  if(name==="csvb_su_cleanup_job")return{data:job()};
  if(name==="csvb_su_cleanup_claim"){
   if(!confirmed||args.p_user_id!==user)return{error:{code:"42501",message:"Not confirmed/selected"}};
   if(blocked)return{error:{message:"Linked business record protected"}};
   return{data:{state,identity,lease_token:other}};
  }
  if(name==="csvb_su_cleanup_finish")return finalizeFails?{error:{message:"Transient finalize failure"}}:{};
  if(name==="csvb_su_cleanup_failed")return{};
  throw Error(name);
 }
};
const handler=createDeleteUserHandler({sbAdmin,signingSecret:"synthetic-fixture",now:()=>time});
async function request(body,auth=true){
 const r=await handler(new Request("https://fixture.invalid",{method:"POST",headers:auth?{authorization:"Bearer fixture"}:{},body:JSON.stringify(body)}));
 return{status:r.status,data:await r.json()};
}
const prepare=()=>request({action:"prepare_user_deletions",user_ids:[user]});
assert.equal((await request({action:"prepare_user_deletions",user_ids:[user]},false)).status,401);
for(const r of["company_admin","company_superintendent","vessel","inspector"]){role=r;assert.equal((await prepare()).status,403);}
role="super_admin";active=false;assert.equal((await prepare()).status,403);active=true;
assert.equal((await request({action:"prepare_user_deletions",user_ids:[actor]})).status,409);
assert.equal((await request({action:"prepare_user_deletions",user_ids:[user,user]})).status,400);
assert.equal((await request({action:"prepare_user_deletions",user_ids:[user,other]})).status,409);
const prepared=await prepare();assert.equal(prepared.status,200);assert.equal(prepared.data.users[0].username,identity.username);
const confirm={action:"confirm_user_deletions",job_id:jobId,confirmation_token:prepared.data.confirmation_token};
assert.equal((await request({...confirm,confirmation_token:"forged"})).status,403);
time+=600001;assert.equal((await request(confirm)).status,409);time-=600001;
assert.equal((await request({...confirm,job_id:other})).status,409);
assert.equal((await request({action:"delete_user",job_id:jobId,user_id:user})).status,403);
assert.equal((await request(confirm)).status,200);
assert.equal((await request({action:"delete_user",job_id:jobId,user_id:other})).status,403);
blocked=true;assert.equal((await request({action:"delete_user",job_id:jobId,user_id:user})).data.status,"failed");blocked=false;
assert.deepEqual(deletes,[]);
assert.equal((await request({action:"delete_user",job_id:jobId,user_id:user,confirm_username:"obsolete"})).status,400);
const process={action:"delete_user",job_id:jobId,user_id:user};
assert.equal((await request(process)).data.status,"completed");assert.deepEqual(deletes,[user]);
state="completed";assert.equal((await request(process)).data.status,"already_deleted");assert.equal(deletes.length,1);
state="busy";assert.equal((await request(process)).data.status,"busy");assert.equal(deletes.length,1);
state="auth_missing";assert.equal((await request(process)).data.status,"completed");assert.equal(deletes.length,1);
state="processing";finalizeFails=true;assert.equal((await request(process)).data.status,"failed");
const beforeResume=deletes.length;state="auth_missing";finalizeFails=false;
assert.equal((await request(process)).data.status,"completed");assert.equal(deletes.length,beforeResume);
assert(calls.some(c=>c.name==="csvb_su_cleanup_failed"));
console.log("PASS mocked cleanup worker: auth/roles, self/Office rejection, explicit selection, simple signed confirmation, failures, leases, duplicate skips and post-Auth finalize-only resume.");
