// Pure mocked backend tests. Never creates or deletes real accounts.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { webcrypto } from "node:crypto";
const source=await fs.readFile("supabase/functions/su-admin-delete-user/handler.js","utf8");
globalThis.crypto ||= webcrypto;
const {createDeleteUserHandler}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const actor="11111111-1111-4111-8111-111111111111",selected="22222222-2222-4222-8222-222222222222",
  other="33333333-3333-4333-8333-333333333333",vessel="44444444-4444-4444-8444-444444444444";
let role="super_admin",disabled=false,badJWT=false,blocked=false,deleteError=false,changed=false,time=1000000;
const deleted=[],queries=[];
const sbAdmin={
  auth:{getUser:async()=>({data:{user:badJWT?null:{id:actor}}}),
    admin:{deleteUser:async(id,soft)=>{deleted.push({id,soft});return{error:deleteError?{message:"protected"}:null};}}},
  from(table){
    assert(["profiles","vessels"].includes(table));
    const q={select(columns){queries.push({table,columns});return q;},eq(field,id){q.id=id;return q;},
      async single(){
        if(table==="vessels")return{data:{id:vessel,name:"TEST VESSEL"}};
        if(q.id===actor)return{data:{id:actor,role,is_active:!disabled,is_disabled:disabled}};
        return{data:{id:q.id,username:q.id===selected?"selected.user":"other.user",role:"vessel",
          vessel_id:vessel,updated_at:changed?"changed":"unchanged"}};
      }};
    return q;
  },
  rpc:async(name,args)=>{
    assert.equal(name,"csvb_assert_user_deletion_safe");assert.equal(args.p_user_id,selected);
    return{error:blocked?{message:"Deletion blocked: linked audit/business records."}:null};
  }
};
const handle=createDeleteUserHandler({sbAdmin,signingSecret:"synthetic-fixture-not-a-secret",now:()=>time});
async function request(body,auth=true){
  const response=await handle(new Request("https://fixture.invalid",{method:"POST",
    headers:auth?{Authorization:"Bearer fixture"}:{},body:JSON.stringify(body)}));
  return{status:response.status,data:await response.json()};
}
const prep=()=>request({action:"prepare_user_deletion",user_id:selected});
assert.equal((await request({action:"prepare_user_deletion",user_id:selected},false)).status,401);
badJWT=true;assert.equal((await prep()).status,401);badJWT=false;
for(const r of ["company_admin","company_superintendent","vessel","inspector"]){role=r;assert.equal((await prep()).status,403);}
role="super_admin";disabled=true;assert.equal((await prep()).status,403);disabled=false;
assert.equal((await request({action:"prepare_user_deletion",user_id:actor})).status,409);
assert.equal((await request({action:"delete_user",user_id:[selected,other]})).status,400);
assert.equal((await request({action:"delete_user",user_id:selected,user_ids:[other]})).status,400);
const prepared=await prep();assert.equal(prepared.status,200);
assert.equal(prepared.data.user.vessel_name,"TEST VESSEL");assert.deepEqual(deleted,[]);
const confirm={action:"delete_user",user_id:selected,confirm_username:"selected.user",confirmation_token:prepared.data.confirmation_token};
assert.equal((await request({...confirm,confirmation_token:"forged"})).status,403);
assert.equal((await request({...confirm,user_id:other,confirm_username:"other.user"})).status,409);
assert.equal((await request({...confirm,confirm_username:"wrong"})).status,409);
changed=true;assert.equal((await request(confirm)).status,409);changed=false;
time+=300001;assert.equal((await request(confirm)).status,409);time-=300001;
blocked=true;assert.equal((await request(confirm)).status,409);blocked=false;
assert.deepEqual(deleted,[]);
deleteError=true;assert.equal((await request(confirm)).status,409);deleteError=false;
deleted.length=0;
const done=await request(confirm);
assert.equal(done.status,200);assert.equal(done.data.deleted_user_id,selected);
assert.deepEqual(deleted,[{id:selected,soft:false}]);
assert(queries.every(q=>q.table==="profiles"||q.table==="vessels"));
console.log("PASS: Super Admin/session checks; single selection only; signed/expired/mismatched confirmations; changed target; typed username; dependency/API errors; exact selected Auth deletion only; no vessel writes. All mocked.");
