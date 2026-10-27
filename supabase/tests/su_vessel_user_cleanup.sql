-- ROLLBACK ONLY. Does not invoke Auth Admin API or delete any account.
begin;
do $$
declare t text; a uuid; v uuid; office_id uuid; j jsonb; result jsonb;
begin
 foreach t in array array['su_user_cleanup_jobs','su_user_cleanup_items',
   'su_deleted_user_identities','su_deleted_user_onboard_logs'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass)
    or has_table_privilege('anon','public.'||t,'select')
    or has_table_privilege('authenticated','public.'||t,'select')
    or has_table_privilege('authenticated','public.'||t,'insert') then
   raise exception 'Restricted cleanup/archive table exposed: %',t;
  end if;
 end loop;
 if has_function_privilege('authenticated','public.csvb_su_cleanup_prepare(uuid[],uuid,text)','execute')
   or has_function_privilege('anon','public.csvb_su_cleanup_claim(uuid,uuid,uuid)','execute')
   or not has_function_privilege('service_role','public.csvb_su_cleanup_finish(uuid,uuid,uuid,uuid)','execute') then
  raise exception 'Worker primitive privileges are incorrect';
 end if;
 select id into a from public.profiles where role::text='super_admin' and is_active and not is_disabled order by id limit 1;
 select id into v from public.profiles where role::text='vessel' order by id limit 1;
 select id into office_id from public.profiles where role::text<>'vessel' and id<>a order by id limit 1;
 if a is null or v is null then return; end if;
 if office_id is not null then
  begin
   perform public.csvb_su_cleanup_prepare(array[v,office_id],a,'vessel_cleanup');
   raise exception 'TEST: Office selection incorrectly accepted';
  exception when raise_exception then
   if sqlerrm not like '%rejects Office/platform%' then raise; end if;
  end;
 end if;
 j:=public.csvb_su_cleanup_prepare(array[v],a,'vessel_cleanup');
 begin
  perform public.csvb_su_cleanup_claim((j->>'id')::uuid,v,a);
  raise exception 'TEST: Unconfirmed selection incorrectly accepted';
 exception when insufficient_privilege then null;
 end;
 perform public.csvb_su_cleanup_confirm((j->>'id')::uuid,a);
 -- Even a SET NULL business reference must block deletion; actor UUIDs survive.
 -- A regular table inside this rolled-back transaction: PostgreSQL forbids a
 -- temporary table's FK from referencing a permanent Auth table.
 create table public.csvb_cleanup_test_dependency (
  actor_id uuid references auth.users(id) on delete set null
 );
 insert into public.csvb_cleanup_test_dependency values(v);
 begin
  perform public.csvb_su_cleanup_claim((j->>'id')::uuid,v,a);
  raise exception 'TEST: Business actor reference incorrectly accepted';
 exception when raise_exception then
  if sqlerrm not like '%linked business/audit records%' then raise; end if;
 end;
 drop table public.csvb_cleanup_test_dependency;
 result:=public.csvb_su_cleanup_claim((j->>'id')::uuid,v,a);
 if result->>'state'<>'processing' or not exists(select 1 from auth.users where id=v)
   or not exists(select 1 from public.profiles where id=v) then
  raise exception 'Preflight unexpectedly modified an account';
 end if;
 if exists(select 1 from public.profile_onboard_access_log l where l.profile_id=v and not exists(
   select 1 from public.su_deleted_user_onboard_logs ar
   where ar.original_user_id=v and ar.original_log_id=l.id and ar.source_record=to_jsonb(l))) then
  raise exception 'Exact onboard history not archived';
 end if;
end $$;
rollback;
