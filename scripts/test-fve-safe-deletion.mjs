import fs from "node:fs/promises";
import {verify,sql,company} from "./lib/fve-dev-test.mjs";
await verify();
const source=await fs.readFile("supabase/migrations/20261027133000_fve_safe_deletion.sql","utf8");
if(process.argv.includes("--apply-dev")){
 if(!(await sql("select version from supabase_migrations.schema_migrations where version='20261027133000'")).length){
  await sql(source.replace(/commit;\s*$/i,`insert into supabase_migrations.schema_migrations(version,name,statements)
   values('20261027133000','fve_safe_deletion',array['scoped resumable cleanup; atomic clean action/draft deletion; immutable submitted history']);commit;`));
 }
 console.log("Applied safe-deletion migration to verified development/testing project only.");process.exit(0);
}
const tests=`
create temp table dc as select '${company}'::uuid company,
 (select id from profiles where company_id=p.company_id and role::text in('company_admin','company_superintendent')
   and coalesce(is_active,true) and not coalesce(is_disabled,false) order by role::text limit 1) office_id,
 p.id vessel_user,p.vessel_id,
 (select sort_id from csvb_fve_rows(p.company_id) where question_no is not null and
   not exists(select 1 from fve_prevention_actions a where a.source_observation_item_id=sort_id) order by sort_id limit 1) source_id
 from profiles p join vessels v on v.id=p.vessel_id and v.is_active
 where p.company_id='${company}' and p.role::text='vessel' and p.onboard_access_enabled
 and p.onboard_status in('onboard','temporarily_ashore') and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false) limit 1;
create temp table dv(k text primary key,v jsonb);
grant select on dc to authenticated;grant select,insert,update on dv to authenticated;
insert into dv select 'source_before',to_jsonb(i) from post_inspection_observation_items i join dc on i.id=dc.source_id;
create function pg_temp.reject(q text,pattern text) returns void language plpgsql as $$
begin
 begin execute q;exception when others then if sqlerrm !~* pattern then raise exception 'Unexpected error: %',sqlerrm;end if;return;end;
 raise exception 'Expected rejection: %',pattern;
end $$;
select set_config('request.jwt.claim.sub',office_id::text,true) from dc;set local role authenticated;
do $$ declare c record;a jsonb;op jsonb;t jsonb;begin
 select * into c from dc;
 a:=csvb_fve_prevention_action_save(c.company,c.source_id,null,'Safe deletion Draft','all','{}',null,null);
 if not (a->'delete_info'->>'can_delete')::boolean then raise exception 'Clean Draft unexpectedly protected';end if;
 op:=csvb_fve_cleanup_prepare(c.company,'action',(a->>'id')::uuid,false,1);
 perform pg_temp.reject(format('select csvb_fve_prevention_action_issue(%L,%L,1)',c.company,a->>'id'),'Deletion is in progress');
 perform csvb_fve_cleanup_finish(c.company,(op->>'id')::uuid);
 perform csvb_fve_cleanup_finish(c.company,(op->>'id')::uuid);
 if csvb_fve_cleanup_prepare(c.company,'action',(a->>'id')::uuid,false,1)->>'status'<>'completed' then raise exception 'Lost-response retry failed';end if;
 a:=csvb_fve_prevention_action_save(c.company,c.source_id,null,'Safe deletion Issued','selected',array[c.vessel_id],null,null);
 a:=csvb_fve_prevention_action_issue(c.company,(a->>'id')::uuid,1);
 perform pg_temp.reject(format('select csvb_fve_cleanup_prepare(%L,%L,%L,false,2)',c.company,'action',a->>'id'),'Confirm');
 insert into dv values('action',a),('target',a->'workflow_summary'->'targets'->0);
end $$;
reset role;select set_config('request.jwt.claim.sub',vessel_user::text,true) from dc;set local role authenticated;
do $$ declare c record;w jsonb;r uuid;e jsonb;begin
 select * into c from dc;
 w:=csvb_fve_response_draft(c.company,(select (v->>'id')::uuid from dv where k='target'));r:=(w->'draft'->>'id')::uuid;
 e:=csvb_fve_evidence_reserve(c.company,r,'temporary.pdf','application/pdf',123);
 insert into dv values('temporary_evidence',e),('draft',to_jsonb(r));
 perform pg_temp.reject(format('select csvb_fve_cleanup_prepare(%L,%L,%L,true,2)',c.company,'action',(select v->>'id' from dv where k='action')),'Office');
end $$;
reset role;select set_config('request.jwt.claim.sub',office_id::text,true) from dc;set local role authenticated;
do $$ declare c record;a jsonb;op jsonb;begin
 select * into c from dc;a:=(select v from dv where k='action');
 op:=csvb_fve_cleanup_prepare(c.company,'action',(a->>'id')::uuid,true,2);
 if jsonb_array_length(op->'storage_paths')<>1 then raise exception 'Temporary evidence cleanup not scoped';end if;
 if not csvb_fve_storage_access((select v->>'storage_path' from dv where k='temporary_evidence'),'delete') then raise exception 'Office temporary cleanup denied';end if;
 perform csvb_fve_cleanup_finish(c.company,(op->>'id')::uuid);
 a:=csvb_fve_prevention_action_save(c.company,c.source_id,null,'Submitted action must remain','selected',array[c.vessel_id],null,null);
 a:=csvb_fve_prevention_action_issue(c.company,(a->>'id')::uuid,1);
 update dv set v=a where k='action';update dv set v=a->'workflow_summary'->'targets'->0 where k='target';
end $$;
reset role;select set_config('request.jwt.claim.sub',vessel_user::text,true) from dc;set local role authenticated;
do $$ declare c record;t uuid;w jsonb;r uuid;op jsonb;begin
 select * into c from dc;t:=(select (v->>'id')::uuid from dv where k='target');
 w:=csvb_fve_response_draft(c.company,t);r:=(w->'draft'->>'id')::uuid;
 perform csvb_fve_response_draft_text_save(c.company,r,'Delete this unsubmitted text');
 op:=csvb_fve_cleanup_prepare(c.company,'draft',r);
 perform pg_temp.reject(format('select csvb_fve_response_submit(%L,%L,%L)',c.company,r,'stale submit'),'Deletion is in progress');
 perform csvb_fve_cleanup_finish(c.company,(op->>'id')::uuid);
 if csvb_fve_target_workflow(c.company,t)->'draft'<>'null'::jsonb then raise exception 'Deleted draft retained';end if;
 w:=csvb_fve_response_draft(c.company,t);r:=(w->'draft'->>'id')::uuid;
 w:=csvb_fve_response_submit(c.company,r,'Immutable response one');
 insert into dv values('submitted',w->'responses'->0);
 perform pg_temp.reject(format('select csvb_fve_cleanup_prepare(%L,%L,%L)',c.company,'draft',r),'unsubmitted.*immutable');
end $$;
reset role;select set_config('request.jwt.claim.sub',office_id::text,true) from dc;set local role authenticated;
do $$ declare c record;a jsonb;t uuid;r uuid;begin
 select * into c from dc;a:=(select v from dv where k='action');t:=(select (v->>'id')::uuid from dv where k='target');
 a:=csvb_fve_prevention_action_get(c.company,(a->>'id')::uuid);
 if (a->'delete_info'->>'can_delete')::boolean then raise exception 'Submitted action deletable';end if;
 perform pg_temp.reject(format('select csvb_fve_cleanup_prepare(%L,%L,%L,true,2)',c.company,'action',a->>'id'),'response/audit history');
 r:=(select (v->>'id')::uuid from dv where k='submitted');
 perform csvb_fve_target_review(c.company,t,'start_review',null,r);
 perform csvb_fve_target_review(c.company,t,'return','Preserve this return history',r);
 insert into dv values('events_before',csvb_fve_target_workflow(c.company,t)->'events');
end $$;
reset role;select set_config('request.jwt.claim.sub',vessel_user::text,true) from dc;set local role authenticated;
do $$ declare c record;t uuid;w jsonb;r uuid;op jsonb;begin
 select * into c from dc;t:=(select (v->>'id')::uuid from dv where k='target');
 w:=csvb_fve_response_draft(c.company,t);r:=(w->'draft'->>'id')::uuid;
 perform csvb_fve_response_draft_text_save(c.company,r,'Unsubmitted response two');
 perform csvb_fve_evidence_reserve(c.company,r,'version-two.pdf','application/pdf',123);
 op:=csvb_fve_cleanup_prepare(c.company,'draft',r);
 perform csvb_fve_cleanup_finish(c.company,(op->>'id')::uuid);
 w:=csvb_fve_target_workflow(c.company,t);
 if w->'responses'->0 is distinct from (select v from dv where k='submitted')
  or w->'events' is distinct from (select v from dv where k='events_before')
  or w->'target'->>'status'<>'returned' or w->'draft'<>'null'::jsonb then raise exception 'Prior history or returned target changed';end if;
end $$;
reset role;
do $$begin
 if exists(select 1 from fve_vessel_responses where id=(select (v#>>'{}')::uuid from dv where k='draft')) then raise exception 'Clean action draft not removed';end if;
 if (select to_jsonb(i) from post_inspection_observation_items i join dc on dc.source_id=i.id)
   is distinct from (select v from dv where k='source_before') then raise exception 'Source changed';end if;
 if has_table_privilege('authenticated','fve_cleanup_operations','UPDATE') or
   has_function_privilege('anon','csvb_fve_cleanup_finish(uuid,uuid)','EXECUTE') then raise exception 'Broad cleanup access';end if;
end $$;
select 'PASS: Draft/Issued deletion; stronger confirmation; atomic target/draft/evidence cleanup; stale write freeze; immutable submission protection; returned draft deletion preserves history; source unchanged' result;
rollback;`;
console.log(await sql(process.argv.includes("--installed")?"begin;"+tests:source.replace(/commit;\s*$/i,"")+tests));
console.log("All verification changes rolled back.");
