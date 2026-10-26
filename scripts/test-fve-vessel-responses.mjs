import fs from "node:fs/promises";
import {verify,sql,company} from "./lib/fve-dev-test.mjs";
await verify();
const names=["20261027120000_fve_vessel_responses","20261027121500_fve_storage_upload_probe"];
const sources=await Promise.all(names.map(n=>fs.readFile(`supabase/migrations/${n}.sql`,"utf8")));
const source=sources[0].replace(/commit;\s*$/i,"")+sources[1].replace(/^begin;/i,"");
if(process.argv.includes("--apply-dev")){
 for(let i=0;i<names.length;i++){
  const [version,...name]=names[i].split("_");
  if(!(await sql(`select version from supabase_migrations.schema_migrations where version='${version}'`)).length){
   await sql(sources[i].replace(/commit;\s*$/i,`insert into supabase_migrations.schema_migrations(version,name,statements)
    values('${version}','${name.join("_")}',array['target workflow; private quota-enforced evidence']); commit;`));
  }
 }
 console.log("Applied Phase 3 migration to verified development/testing project only.");
 process.exit(0);
}
const tests=`
create temp table f3_context as select '${company}'::uuid company,
 (select id from profiles where company_id=p.company_id and role::text in('company_admin','company_superintendent')
  and coalesce(is_active,true) and not coalesce(is_disabled,false) order by role::text limit 1) office_id,
 p.id vessel_user,p.vessel_id,
 (select id from vessels where company_id=p.company_id and is_active and id<>p.vessel_id limit 1) other_vessel,
 (select sort_id from csvb_fve_rows(p.company_id) where question_no is not null
  and not exists(select 1 from fve_prevention_actions a where a.source_observation_item_id=sort_id)
  order by sort_id limit 1) source_id
 from profiles p join vessels v on v.id=p.vessel_id and v.is_active where p.company_id='${company}'
 and p.role::text='vessel' and p.onboard_access_enabled and p.onboard_status in('onboard','temporarily_ashore')
 and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false) limit 1;
do $$ begin if not exists(select 1 from f3_context where office_id is not null and source_id is not null and other_vessel is not null)
 then raise exception 'Active testing fixtures required'; end if; end $$;
create temp table f3_values(k text primary key,v jsonb);
grant select on f3_context to authenticated;
grant select,insert,update on f3_values to authenticated;
insert into f3_values select 'original_source',to_jsonb(i) from post_inspection_observation_items i join f3_context c on c.source_id=i.id;
create function pg_temp.f3_expect(q text,pattern text) returns void language plpgsql as $$
begin
 begin execute q; exception when others then
  if sqlerrm !~* pattern then raise exception 'Wrong rejection: %',sqlerrm; end if; return;
 end;
 raise exception 'Expected rejection: %',pattern;
end $$;
select set_config('request.jwt.claim.sub',office_id::text,true) from f3_context;
set local role authenticated;
do $$ declare c record; a jsonb; begin
 select * into c from f3_context;
 a:=csvb_fve_prevention_action_save(c.company,c.source_id,null,'Phase 3 rollback verification','all','{}',current_date-1,null);
 insert into f3_values values('action',a);
 a:=csvb_fve_prevention_action_issue(c.company,(a->>'id')::uuid,1);
 update f3_values set v=a where k='action';
 insert into f3_values select 'target',x from jsonb_array_elements(a->'workflow_summary'->'targets') x where x->>'vessel_id'=c.vessel_id::text;
 if a->>'status'<>'issued' or (a->'workflow_summary'->'counts'->>'pending')::int<2 then raise exception 'All-vessel activation failed'; end if;
 if not (select (v->>'overdue')::boolean from f3_values where k='target') then raise exception 'Overdue not derived'; end if;
 perform pg_temp.f3_expect(format('select csvb_fve_response_draft(%L,%L)',c.company,(select v->>'id' from f3_values where k='target')),'onboard');
end $$;
reset role;
select set_config('request.jwt.claim.sub',vessel_user::text,true) from f3_context;
set local role authenticated;
do $$ declare c record; t uuid; w jsonb; r uuid; begin
 select * into c from f3_context; t:=(select (v->>'id')::uuid from f3_values where k='target');
 w:=csvb_fve_response_draft(c.company,t); r:=(w->'draft'->>'id')::uuid;
 if w->'draft'->>'id' is distinct from csvb_fve_response_draft(c.company,t)->'draft'->>'id' then raise exception 'Duplicate drafts'; end if;
 w:=csvb_fve_response_submit(c.company,r,'Response one, text only');
 insert into f3_values values('response1',w->'responses'->0);
 if w->'target'->>'status'<>'response_submitted' then raise exception 'Submit failed'; end if;
 if jsonb_array_length(csvb_fve_response_submit(c.company,r,'Response one, text only')->'responses')<>1 then raise exception 'Retry duplicated response'; end if;
 perform pg_temp.f3_expect(format('select csvb_fve_response_submit(%L,%L,%L)',c.company,r,'Changed'),'cannot be edited');
 perform pg_temp.f3_expect(format('select csvb_fve_target_review(%L,%L,%L,null,%L)',c.company,t,'start_review',r),'Office');
 perform pg_temp.f3_expect(format('select csvb_fve_target_workflow(%L,%L)',c.company,
  (select x->>'id' from f3_values,jsonb_array_elements(v->'workflow_summary'->'targets') x where k='action' and x->>'vessel_id'<>c.vessel_id::text limit 1)),'assigned vessel');
end $$;
reset role;
select set_config('request.jwt.claim.sub',office_id::text,true) from f3_context;
set local role authenticated;
do $$ declare c record; t uuid; r uuid; begin
 select * into c from f3_context; t:=(select (v->>'id')::uuid from f3_values where k='target');
 r:=(select (v->>'id')::uuid from f3_values where k='response1');
 perform csvb_fve_target_review(c.company,t,'start_review',null,r);
 perform pg_temp.f3_expect(format('select csvb_fve_target_review(%L,%L,%L,null,%L)',c.company,t,'return',r),'comment');
 perform csvb_fve_target_review(c.company,t,'return','Please provide objective evidence',r);
end $$;
reset role;
select set_config('request.jwt.claim.sub',vessel_user::text,true) from f3_context;
set local role authenticated;
do $$ declare c record; t uuid; w jsonb; r uuid; e jsonb; n int; begin
 select * into c from f3_context; t:=(select (v->>'id')::uuid from f3_values where k='target');
 w:=csvb_fve_response_draft(c.company,t); r:=(w->'draft'->>'id')::uuid;
 insert into f3_values values('response2id',to_jsonb(r));
 perform pg_temp.f3_expect(format('select csvb_fve_evidence_reserve(%L,%L,%L,%L,1)',c.company,r,'evil.zip','application/zip'),'Unsupported');
 e:=csvb_fve_evidence_reserve(c.company,r,'large.pdf','application/pdf',6291456);
 perform pg_temp.f3_expect(format('select csvb_fve_evidence_reserve(%L,%L,%L,%L,5242880)',c.company,r,'extra.pdf','application/pdf'),'10 MB combined');
 perform csvb_fve_evidence_cancel(c.company,(e->>'id')::uuid);
 for n in 1..5 loop
  e:=csvb_fve_evidence_reserve(c.company,r,'proof'||n||'.pdf','application/pdf',2097152);
  if csvb_fve_storage_access(e->>'storage_path','upload',jsonb_build_object('size',1,'mimetype','application/pdf')) then raise exception 'Underdeclared upload allowed'; end if;
  insert into storage.objects(bucket_id,name,metadata) values('fve-response-evidence',e->>'storage_path',
    jsonb_build_object('size',2097152,'mimetype','application/pdf'));
 end loop;
 perform pg_temp.f3_expect(format('select csvb_fve_evidence_reserve(%L,%L,%L,%L,1)',c.company,r,'sixth.pdf','application/pdf'),'5 active');
 w:=csvb_fve_response_submit(c.company,r,'Response two, five evidence files');
 if jsonb_array_length(w->'responses')<>2 or jsonb_array_length(w->'responses'->1->'evidence')<>5 then raise exception 'Versioned evidence submission failed'; end if;
 if w->'responses'->0 is distinct from (select v from f3_values where k='response1') then raise exception 'First response mutated'; end if;
 if csvb_fve_storage_access(e->>'storage_path','delete') then raise exception 'Submitted evidence deletion permitted'; end if;
 if not csvb_fve_storage_access(e->>'storage_path','read') then raise exception 'Own evidence unreadable'; end if;
 perform pg_temp.f3_expect(format('select csvb_fve_response_discard(%L,%L)',c.company,r),'Submitted history');
end $$;
reset role;
-- A read-only disembarked user may inspect history but cannot create/submit.
update profiles set onboard_status='disembarked',read_only_after_disembarkation=true where id=(select vessel_user from f3_context);
select set_config('request.jwt.claim.sub',vessel_user::text,true) from f3_context;
set local role authenticated;
do $$ declare c record; t uuid; begin
 select * into c from f3_context; t:=(select (v->>'id')::uuid from f3_values where k='target');
 if (csvb_fve_target_workflow(c.company,t)->>'can_respond')::boolean then raise exception 'Disembarked writer'; end if;
 perform pg_temp.f3_expect(format('select csvb_fve_response_draft(%L,%L)',c.company,t),'Active access');
end $$;
reset role;
select set_config('request.jwt.claim.sub',office_id::text,true) from f3_context;
set local role authenticated;
do $$ declare c record; t uuid; r uuid; w jsonb; begin
 select * into c from f3_context; t:=(select (v->>'id')::uuid from f3_values where k='target');
 r:=(select (v#>>'{}')::uuid from f3_values where k='response2id');
 perform csvb_fve_target_review(c.company,t,'start_review',null,r);
 w:=csvb_fve_target_review(c.company,t,'close','Evidence accepted',r);
 if w->'target'->>'status'<>'closed' or (w->'target'->>'overdue')::boolean then raise exception 'Close/overdue failed'; end if;
 if jsonb_array_length(w->'events')<>7 then raise exception 'Chronology incomplete: %',w->'events'; end if;
end $$;
reset role;
do $$ declare r uuid; before_value jsonb; after_value jsonb; begin
 r:=(select (v->>'id')::uuid from f3_values where k='response1');
 perform pg_temp.f3_expect(format('update fve_vessel_responses set response_text=%L where id=%L','bad',r),'immutable');
 perform pg_temp.f3_expect(format('delete from post_inspection_observation_items where id=%L',(select source_id from f3_context)),'replacement blocked');
 select v into before_value from f3_values where k='original_source';
 select to_jsonb(i) into after_value from post_inspection_observation_items i join f3_context c on c.source_id=i.id;
 if before_value is distinct from after_value then raise exception 'Source observation changed'; end if;
 if has_table_privilege('authenticated','fve_vessel_responses','UPDATE') or
   has_function_privilege('anon','csvb_fve_response_submit(uuid,uuid,text)','EXECUTE') then raise exception 'Broad permissions'; end if;
end $$;
select 'PASS: target workflow; text-only + 5-file versions; 10MB combined and 6th-file rejection; immutable prior history; return/close chronology; onboard restrictions; source unchanged' result;
rollback;`;
const query=process.argv.includes("--installed")?"begin;"+tests:source.replace(/commit;\s*$/i,"")+tests;
console.log(await sql(query));
console.log("Verification transaction rolled back.");
