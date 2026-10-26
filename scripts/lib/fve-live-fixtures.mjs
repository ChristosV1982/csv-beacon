// Disposable development users and clearly tagged actions. No credentials are
// written to disk. Cleanup is scoped to these users' newly created actions.
import fs from "node:fs/promises";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {verify,sql,quote,company,base} from "./fve-dev-test.mjs";
export async function fixtures(){
 await verify();
 const anon=(await fs.readFile("public/auth.js","utf8")).match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const adminHeaders={apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"};
 const tag="FVE3-"+crypto.randomUUID().slice(0,12),actors=[],paths=[];
 let office;
 async function admin(path,method="GET",body){
  const r=await fetch(base+path,{method,headers:adminHeaders,body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw Error(`Temporary fixture administration ${method} HTTP ${r.status}`);
  return r.status===204?null:r.json();
 }
 async function cleanup(){
  const issues=[];
  if(office){
   const evidence=await sql(`select e.storage_path from fve_response_evidence e join fve_vessel_responses r on r.id=e.response_id
    join fve_prevention_actions a on a.id=r.action_id where a.created_by=${quote(office.id)}::uuid`);
   paths.push(...evidence.map(e=>e.storage_path));
  }
  if(paths.length){
   try{await admin("/storage/v1/object/fve-response-evidence","DELETE",{prefixes:[...new Set(paths)]});}
   catch(e){issues.push(e.message);}
  }
  if(office){
   // Only this transaction bypasses immutability triggers to remove disposable
   // verification records; application sessions/triggers remain unchanged.
   const cleanupTable=(await sql("select to_regclass('public.fve_cleanup_operations')::text relation"))[0].relation;
   try{await sql(`begin;set local session_replication_role='replica';
    ${cleanupTable?`delete from fve_cleanup_operations where requested_by in(${actors.map(a=>quote(a.id)+"::uuid").join(",")});`:""}
    create temp table f3_cleanup_actions as select id from fve_prevention_actions where created_by=${quote(office.id)}::uuid;
    create temp table f3_cleanup_targets as select id from fve_prevention_action_targets where action_id in(select id from f3_cleanup_actions);
    delete from fve_target_events where action_target_id in(select id from f3_cleanup_targets);
    delete from fve_response_evidence where response_id in(select id from fve_vessel_responses where action_id in(select id from f3_cleanup_actions));
    update fve_prevention_action_targets set workflow_status='pending',last_response_id=null where id in(select id from f3_cleanup_targets);
    delete from fve_vessel_responses where action_id in(select id from f3_cleanup_actions);
    delete from fve_prevention_action_targets where id in(select id from f3_cleanup_targets);
    delete from fve_prevention_action_audit where action_id in(select id from f3_cleanup_actions);
    delete from fve_prevention_actions where id in(select id from f3_cleanup_actions);commit;`);}
   catch(e){issues.push(e.message);}
  }
  for(const a of actors)try{await admin(`/auth/v1/admin/users/${a.id}`,"DELETE");}catch(e){issues.push(e.message);}
  if(issues.length)throw Error("Fixture cleanup needs attention: "+issues.join("; "));
  console.log("Removed temporary development users/actions/evidence; original records preserved.");
 }
 try{
  const [template]=await sql(`select
   (select id from profiles where company_id='${company}' and role::text in('company_admin','company_superintendent')
     and coalesce(is_active,true) and not coalesce(is_disabled,false) order by role::text limit 1) office_id,
   p.id vessel_user,p.vessel_id from profiles p join vessels v on v.id=p.vessel_id and v.is_active
   where p.company_id='${company}' and p.role::text='vessel' and p.onboard_access_enabled
   and p.onboard_status in('onboard','temporarily_ashore') and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false) limit 1`);
  assert.ok(template?.office_id);
  const vessels=await sql(`select id,name from vessels where company_id='${company}' and is_active order by id`);
  assert.ok(vessels.length>=3);
  async function make(kind,vesselId){
   const email=`${tag.toLowerCase()}-${kind}@example.invalid`,password=crypto.randomBytes(24).toString("base64url");
   const created=await admin("/auth/v1/admin/users","POST",{email,password,email_confirm:true,
     user_metadata:{username:tag.replaceAll("-","")+kind}});
   const a={id:created.id};actors.push(a);
   await sql(`insert into profiles(id,username,role)
     select ${quote(a.id)}::uuid,${quote(tag.replaceAll("-","")+kind)},role from profiles
     where id=${quote(kind==="office"?template.office_id:template.vessel_user)}::uuid on conflict(id) do nothing;
     update profiles p set company_id=t.company_id,role=t.role,position=t.position,
      vessel_id=${vesselId?quote(vesselId)+"::uuid":"null"},onboard_rank_id=${vesselId?"t.onboard_rank_id":"null"},
      onboard_access_enabled=${!!vesselId},onboard_status=${vesselId?"'onboard'":"'not_applicable'"},
      read_only_after_disembarkation=true,is_active=true,is_disabled=false
     from profiles t where p.id=${quote(a.id)}::uuid and t.id=${quote(kind==="office"?template.office_id:template.vessel_user)}::uuid`);
   const r=await fetch(base+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:anon,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
   if(!r.ok)throw Error("Temporary development sign-in HTTP "+r.status);
   a.session=await r.json();
   [a.profile]=await sql(`select id,role,position,company_id,vessel_id,onboard_rank_id,onboard_access_enabled,onboard_status,
      read_only_after_disembarkation,is_active,is_disabled from profiles where id=${quote(a.id)}::uuid`);
   assert.ok(a.profile,"Temporary profile must exist");
   a.headers={apikey:anon,Authorization:`Bearer ${a.session.access_token}`,"Content-Type":"application/json"};
   return a;
  }
  office=await make("office",null);
  const a=await make("vessela",template.vessel_id);
  const b=await make("vesselb",vessels.find(v=>v.id!==template.vessel_id).id);
  const c=await make("vesselc",vessels.find(v=>![a.profile.vessel_id,b.profile.vessel_id].includes(v.id)).id);
  const sources=await sql(`with eligible as(select * from csvb_fve_rows('${company}') x
    where question_no is not null and not exists(select 1 from fve_prevention_actions a where a.source_observation_item_id=x.sort_id)),
    chosen as(select question_no from eligible group by question_no having count(*)>=3 order by question_no limit 1)
    select e.sort_id id,e.question_no,(select to_jsonb(i) from post_inspection_observation_items i where i.id=e.sort_id) original
    from eligible e join chosen c using(question_no) order by sort_id limit 3`);
  assert.equal(sources.length,3);
  const rpc=async(actor,name,args)=>{
   const r=await fetch(base+"/rest/v1/rpc/"+name,{method:"POST",headers:actor.headers,body:JSON.stringify(args)});
   const data=await r.json();
   if(!r.ok)throw Error(`${name} HTTP ${r.status}: ${data.message||data.error||"request rejected"}`);
   return data;
  };
  const upload=async(actor,evidence,bytes)=>{
   paths.push(evidence.storage_path);
   return fetch(base+"/storage/v1/object/fve-response-evidence/"+evidence.storage_path,{method:"POST",
     headers:{...actor.headers,"Content-Type":evidence.mime_type,"x-upsert":"false"},body:bytes});
  };
  return{tag,office,a,b,c,vessels,sources,anon,base,company,rpc,upload,paths,cleanup,sql,quote};
 }catch(e){await cleanup();throw e;}
}
