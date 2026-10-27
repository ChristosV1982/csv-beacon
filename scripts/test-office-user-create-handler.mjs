// All Auth mutations are mocks. No account is created.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync("supabase/functions/su-admin-create-office-user/handler.js", "utf8");
const { createOfficeUserHandler } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const actor="11111111-1111-4111-8111-111111111111";
const account="22222222-2222-4222-8222-222222222222";
const payload={action:"create_office_user",request_id:"33333333-3333-4333-8333-333333333333",
  company_id:"44444444-4444-4444-8444-444444444444",username:"office.fixture",
  password:"fixture-password-only",office_role_code:"office_draft_example",
  access_profile_code:"standard_office_view_only",first_name:"Example",last_name:"Office",
  force_password_reset:true};
function fixture(config={}) {
  const calls=[],mutations=[];
  let state={status:"pending",username:payload.username,requires_enforcement:config.locked!==false};
  const admin={
    from:()=>({select(){return this},eq(){return this},
      single:async()=>({data:{id:actor,role:config.role||"super_admin",is_active:true,is_disabled:false}})}),
    auth:{getUser:async()=>({data:{user:{id:actor}}}),
      admin:{
        createUser:async value=>{mutations.push(["create",value]);return {data:{user:{id:account}}}},
        updateUserById:async(id,value)=>{mutations.push(["update",id,value]);return {}},
        deleteUser:async id=>{mutations.push(["delete",id]);return config.cleanupFailure?{error:{message:"cleanup failed"}}:{}}
      }
    }
  };
  const handler=createOfficeUserHandler({admin,rpcAsActor:async(auth,name,args)=>{
    assert.equal(auth,"Bearer fixture-jwt");calls.push([name,args]);
    if(name.endsWith("_prepare"))return {...state};
    if(name.endsWith("_identity"))return null;
    if(name.endsWith("_finalize")){
      if(config.failFinalize)throw Error("Final profile rejected");
      state={...state,auth_user_id:account,status:"profile_ready"};return {...state};
    }
    if(name.endsWith("_complete")){state.status="completed";return {...state}}
    if(name.endsWith("_failed"))return null;
    throw Error("Unexpected RPC");
  }});
  return {calls,mutations,handler};
}
async function run(f,changes={}) {
  const response=await f.handler(new Request("https://fixture.invalid",{
    method:"POST",headers:{Authorization:"Bearer fixture-jwt","Content-Type":"application/json"},
    body:JSON.stringify({...payload,...changes})
  }));
  return {status:response.status,body:await response.json()};
}
{
  const f=fixture(),r=await run(f);
  assert.equal(r.status,200);assert.equal(r.body.user_id,account);
  assert.equal(r.body.inactive_pending_enforcement,true);
  assert.equal(f.mutations.filter(x=>x[0]==="create").length,1);
  assert.equal(f.mutations[0][1].email,"office.fixture@csvtest.local");
  assert.equal(f.mutations[0][1].ban_duration,"876000h");
  assert.equal(f.mutations.filter(x=>x[0]==="update").length,0);
  assert.equal(f.calls[0][1].p_force_reset,true);
  assert.equal(f.calls[0][1].p_first_name,"Example");
  assert.equal("password" in f.calls[0][1],false);
}
{
  const f=fixture({locked:false}),r=await run(f,{access_profile_code:"company_administrator_access"});
  assert.equal(r.status,200);
  assert.equal(f.mutations.find(x=>x[0]==="update")[2].ban_duration,"none");
}
{
  const f=fixture({failFinalize:true}),r=await run(f);
  assert.equal(r.status,400);assert.equal(r.body.cleanup_required,false);
  assert.deepEqual(f.mutations.at(-1),["delete",account]);
  assert.equal(f.calls.at(-1)[1].p_cleanup_confirmed,true);
}
{
  const f=fixture({failFinalize:true,cleanupFailure:true}),r=await run(f);
  assert.equal(r.body.cleanup_required,true);
}
for(const changes of [{role:"super_admin"},{vessel_id:account},{office_role_code:null}]) {
  const f=fixture(),r=await run(f,changes);
  assert.equal(r.status,400);assert.equal(f.mutations.length,0);
}
{
  const f=fixture({role:"company_admin"}),r=await run(f);
  assert.equal(r.status,403);assert.equal(f.mutations.length,0);
}
console.log("PASS: Super Admin authorization, contract rejection, staged locked Auth identity, baselines, audit/force-reset payload, finalize cleanup and cleanup-failure reporting. No real Auth mutations.");
