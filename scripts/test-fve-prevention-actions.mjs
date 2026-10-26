import fs from "node:fs/promises";
import assert from "node:assert/strict";

const project="bdidrcyufazskpuwmfca";
assert.equal((await fs.readFile("supabase/.temp/project-ref","utf8")).trim(),project);
const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"};
const verified=await fetch(`https://api.supabase.com/v1/projects/${project}`,{headers});
if(!verified.ok) throw Error(`Project verification HTTP ${verified.status}`);
assert.equal((await verified.json()).id,project);
async function sql(query){
  const r=await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,
    {method:"POST",headers,body:JSON.stringify({query})});
  if(!r.ok) throw Error(`SQL HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
const files=["20261027103000_fve_prevention_actions","20261027104500_fve_prevention_vessel_projection"];
const sources=await Promise.all(files.map(name=>fs.readFile(`supabase/migrations/${name}.sql`,"utf8")));
const source=sources[0].replace(/commit;\s*$/i,"")+sources[1].replace(/^begin;/i,"");
if(process.argv.includes("--apply-dev")){
  for(let i=0;i<files.length;i++){
    const [version,...name]=files[i].split("_");
    if((await sql(`select version from supabase_migrations.schema_migrations where version='${version}'`)).length)continue;
    await sql(sources[i].replace(/commit;\s*$/i,`insert into supabase_migrations.schema_migrations(version,name,statements)
      values('${version}','${name.join("_")}',array['separate office prevention actions and limited vessel projection']);
      commit;`));
  }
  console.log("Applied prevention-action migration to verified development/testing project only.");
  process.exit(0);
}
const tests=`
create temp table fve_test_context as
select '381b3b4f-0fbd-4f30-bafe-450baa410a04'::uuid company,
 (select id from profiles where role::text='super_admin' and coalesce(is_active,true) and not coalesce(is_disabled,false) limit 1) super_id,
 (select id from profiles where company_id='381b3b4f-0fbd-4f30-bafe-450baa410a04'
  and role::text in('company_admin','company_superintendent') and coalesce(is_active,true)
  and not coalesce(is_disabled,false) order by role::text limit 1) office_id,
 p.id vessel_user,p.vessel_id,
 (select id from vessels where company_id=p.company_id and is_active and id<>p.vessel_id limit 1) other_vessel,
 (select sort_id from csvb_fve_rows(p.company_id) where question_no is not null
  and not exists(select 1 from fve_prevention_actions a where a.source_observation_item_id=sort_id)
  order by sort_id limit 1) source1,
 (select sort_id from csvb_fve_rows(p.company_id) where question_no is not null
  and not exists(select 1 from fve_prevention_actions a where a.source_observation_item_id=sort_id)
  order by sort_id offset 1 limit 1) source2
from profiles p join vessels v on v.id=p.vessel_id and v.is_active
where p.company_id='381b3b4f-0fbd-4f30-bafe-450baa410a04' and p.role::text='vessel'
 and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false)
 and coalesce(p.onboard_access_enabled,true) and coalesce(p.onboard_status,'')<>'inactive' limit 1;
do $$ begin
 if not exists(select 1 from fve_test_context where super_id is not null and office_id is not null
  and other_vessel is not null and source1 is not null and source2 is not null)
 then raise exception 'Existing active office/vessel/two-source fixtures are required'; end if;
end $$;
create temp table fve_test_values(key text primary key,value jsonb);
insert into fve_test_values select 'source_before',to_jsonb(i) from post_inspection_observation_items i
 join fve_test_context c on i.id=c.source1;
grant select on fve_test_context to authenticated;
grant select,insert,update on fve_test_values to authenticated;
select set_config('request.jwt.claim.sub',office_id::text,true) from fve_test_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',office_id,'role','authenticated')::text,true) from fve_test_context;
set local role authenticated;
do $test$
declare c record; a jsonb; b jsonb; before_history jsonb; history jsonb; q text;
begin
 select * into c from fve_test_context;
 if not (csvb_fve_prevention_context(c.company)->>'can_edit')::boolean then raise exception 'Office cannot edit'; end if;
 begin
  perform csvb_fve_prevention_context(gen_random_uuid()); raise exception 'Foreign company accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform csvb_fve_prevention_action_save(c.company,c.source1,p_instruction=>' ',p_target_mode=>'all');
  raise exception 'Blank instruction accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform csvb_fve_prevention_action_save(c.company,c.source1,p_instruction=>'Test',p_target_mode=>'selected',p_vessel_ids=>array[gen_random_uuid()]);
  raise exception 'Foreign/nonexistent target accepted';
 exception when insufficient_privilege then null; end;
 a:=csvb_fve_prevention_action_save(c.company,c.source1,p_instruction=>'Draft instruction',
  p_target_mode=>'selected',p_vessel_ids=>array[c.vessel_id]);
 if a->>'status'<>'draft' or (a->>'target_count')::int<>1 then raise exception 'Draft/selected save failed'; end if;
 begin
  perform csvb_fve_prevention_action_save(c.company,c.source1,(a->>'id')::uuid,'Bad stale edit',
    'selected',array[c.vessel_id],null,0); raise exception 'Stale revision accepted';
 exception when serialization_failure then null; end;
 a:=csvb_fve_prevention_action_save(c.company,c.source1,(a->>'id')::uuid,'Edited Draft instruction',
  'selected',array[c.other_vessel],current_date+14,(a->>'revision')::int);
 insert into fve_test_values values('selected',a);
 b:=csvb_fve_prevention_action_save(c.company,c.source2,p_instruction=>'All fleet instruction',p_target_mode=>'all');
 if (b->>'target_count')::int<2 then raise exception 'All vessels not expanded'; end if;
 insert into fve_test_values values('all',b);
 q:=a->>'canonical_question_no';
 before_history:=csvb_fleet_vetting_experience_history(c.company,q);
 history:=csvb_fve_prevention_history(c.company,q);
 if history->'total'<>before_history->'total' or history->'last_12_months'<>before_history->'last_12_months'
  or (select jsonb_agg(r-'source_observation_item_id'-'prevention_actions') from jsonb_array_elements(history->'rows') r)<>before_history->'rows'
 then raise exception 'Phase 1 history changed'; end if;
 begin perform count(*) from fve_prevention_actions; raise exception 'Direct table read allowed';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',vessel_user::text,true) from fve_test_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',vessel_user,'role','authenticated')::text,true) from fve_test_context;
set local role authenticated;
do $test$
declare c record; a jsonb; ctx jsonb;
begin
 select * into c from fve_test_context;
 ctx:=csvb_fve_prevention_context(c.company);
 if (ctx->>'can_edit')::boolean or ctx->'vessels'<>'[]'::jsonb then raise exception 'Vessel has office context'; end if;
 select value into a from fve_test_values where key='all';
 begin perform csvb_fve_prevention_action_get(c.company,(a->>'id')::uuid); raise exception 'Vessel saw Draft';
 exception when insufficient_privilege then null; end;
 begin perform csvb_fve_prevention_action_save(c.company,c.source1,p_instruction=>'forbidden');
 raise exception 'Vessel write accepted'; exception when insufficient_privilege then null; end;
 begin perform csvb_fve_prevention_action_issue(c.company,(a->>'id')::uuid,(a->>'revision')::int);
 raise exception 'Vessel issue accepted'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',office_id::text,true) from fve_test_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',office_id,'role','authenticated')::text,true) from fve_test_context;
set local role authenticated;
do $test$
declare c record; a jsonb; b jsonb; issued jsonb;
begin
 select * into c from fve_test_context;
 for a in select value from fve_test_values where key in ('selected','all') loop
  issued:=csvb_fve_prevention_action_issue(c.company,(a->>'id')::uuid,(a->>'revision')::int);
  b:=csvb_fve_prevention_action_issue(c.company,(a->>'id')::uuid,(a->>'revision')::int);
  if b<>issued then raise exception 'Issue retry not idempotent'; end if;
  b:=csvb_fve_prevention_action_save(c.company,(a->>'source_observation_item_id')::uuid,(a->>'id')::uuid,
    'Logged office edit after issue',a->>'target_mode',
    case when a->>'target_mode'='selected' then array[c.other_vessel] else '{}'::uuid[] end,
    current_date+20,(issued->>'revision')::int);
  if b->>'issued_at'<>issued->>'issued_at' or b->'targets'<>issued->'targets'
    or b->'source_snapshot'<>a->'source_snapshot' then raise exception 'Issued audit identity changed'; end if;
  update fve_test_values set value=b where value->>'id'=a->>'id';
 end loop;
 select value into a from fve_test_values where key='selected';
 begin perform csvb_fve_prevention_action_save(c.company,c.source1,(a->>'id')::uuid,'Illegal target edit',
   'selected',array[c.vessel_id],null,(a->>'revision')::int);
 raise exception 'Issued targets changed'; exception when invalid_parameter_value then null; end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',vessel_user::text,true) from fve_test_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',vessel_user,'role','authenticated')::text,true) from fve_test_context;
set local role authenticated;
do $test$
declare c record; a jsonb; b jsonb; h jsonb;
begin
 select * into c from fve_test_context;
 select value into a from fve_test_values where key='selected';
 begin perform csvb_fve_prevention_action_get(c.company,(a->>'id')::uuid);
 raise exception 'Vessel saw untargeted Issued action'; exception when insufficient_privilege then null; end;
 select value into a from fve_test_values where key='all';
 b:=csvb_fve_prevention_action_get(c.company,(a->>'id')::uuid);
 if b->>'status'<>'issued' or b->'targets'<>'[]'::jsonb or b ? 'source_observation_item_id'
 then raise exception 'Targeted vessel visibility failed'; end if;
 h:=csvb_fve_prevention_history(c.company,a->>'canonical_question_no',p_limit=>100);
 if exists(select 1 from jsonb_array_elements(h->'rows') r,
   jsonb_array_elements(r->'prevention_actions') p where p->>'status'<>'issued')
 then raise exception 'Draft leaked in history'; end if;
 if exists(select 1 from jsonb_array_elements(h->'rows') r where r->>'source_observation_item_id' is not null)
 then raise exception 'Vessel received Post-Inspection source IDs'; end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',super_id::text,true) from fve_test_context;
select set_config('request.jwt.claims',jsonb_build_object('sub',super_id,'role','authenticated')::text,true) from fve_test_context;
set local role authenticated;
do $test$
begin
 begin perform csvb_fve_prevention_context(); raise exception 'Super context was implicit';
 exception when invalid_parameter_value then null; end;
end $test$;
reset role;
do $test$
declare c record; actual jsonb;
begin
 select * into c from fve_test_context;
 select to_jsonb(i) into actual from post_inspection_observation_items i where id=c.source1;
 if actual<>(select value from fve_test_values where key='source_before') then raise exception 'Original observation changed'; end if;
 if csvb_fve_prevention_replacement_guard((actual->>'report_id')::uuid)<1 then raise exception 'Replacement preflight missed actions'; end if;
 begin delete from post_inspection_observation_items where id=c.source1;
 raise exception 'Referenced source deleted'; exception when foreign_key_violation then
 if sqlerrm not like '%Fleet Vetting Experience%' then raise; end if; end;
 if (select count(*) from fve_prevention_action_audit)<7 then raise exception 'Missing audit records'; end if;
 if has_function_privilege('anon','public.csvb_fve_prevention_action_get(uuid,uuid)','execute')
 or has_function_privilege('authenticated','public.csvb_fve_visible_actions(uuid,uuid)','execute')
 then raise exception 'Private function privilege leaked'; end if;
end $test$;
select 'PASS: Draft/edit/issue; targets; optimistic revisions; issue idempotence; vessel isolation; unchanged history/source; audit and replacement guards' result;
rollback;`;
console.log(await sql((process.argv.includes("--installed")?"begin;":source.replace(/commit;\s*$/i,""))+tests));
console.log("All verification changes rolled back.");
