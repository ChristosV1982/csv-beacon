begin;
-- Prepared profiles were snapshots. Refresh from current role defaults only if
-- nobody has subsequently edited the reusable profile through its audited API.
do $$
declare profile_code text; legacy public.app_role;
begin
  for profile_code,legacy in values
    ('company_administrator_access','company_admin'::public.app_role),
    ('standard_office_access','company_superintendent'::public.app_role)
  loop
    if not exists(select 1 from public.csvb_office_access_audit
      where operation='profile_permission' and
        (before_value->>'access_profile_code'=profile_code or after_value->>'access_profile_code'=profile_code)) then
      insert into public.csvb_office_access_profile_permissions
        (access_profile_code,permission_id,scope,is_granted)
      select distinct on (r.permission_id) profile_code,r.permission_id,
        case when r.scope::text='global' then 'company'::public.permission_scope else r.scope end,
        r.is_granted
      from public.role_permissions r where r.role=legacy and r.position is null
      order by r.permission_id,r.updated_at desc nulls last,r.id
      on conflict(access_profile_code,permission_id) do update
        set scope=excluded.scope,is_granted=excluded.is_granted;
      update public.csvb_office_access_profile_permissions p set is_granted=false
        where p.access_profile_code=profile_code and not exists(
          select 1 from public.role_permissions r where r.role=legacy
            and r.position is null and r.permission_id=p.permission_id);
    end if;
  end loop;
end $$;
-- These remain inert for existing users until global activation. Isolated
-- verification subjects can now exercise the real API boundary.
update public.csvb_office_access_profiles set is_active=true,updated_at=now()
  where code in ('company_administrator_access','standard_office_access','standard_office_view_only');
do $$
begin
  if (select count(*) from public.csvb_office_access_profile_permissions p
      join public.app_permissions a on a.id=p.permission_id
      where p.access_profile_code='standard_office_view_only' and p.is_granted and a.action='view')<>9
    or exists(select 1 from public.csvb_office_access_profile_permissions p
      join public.app_permissions a on a.id=p.permission_id
      where p.access_profile_code='standard_office_view_only' and p.is_granted and a.action<>'view')
  then raise exception 'View-only profile must have exactly nine View grants and no other grants'; end if;
end $$;
-- Support the existing Review action where registered; it is not synthesized
-- from Edit and does not change the approved view-only profile.
do $$
declare d text;
begin
  select pg_get_functiondef('csvb_office_auth_private.decision(uuid,text,text,uuid,uuid)'::regprocedure) into d;
  d:=replace(d,'''view'',''edit'',''export'',''admin''','''view'',''edit'',''export'',''admin'',''review''');
  execute d;
end $$;

insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,module_codes,rpc_action)
select 'rpc',n,array['THREADS'],'view' from unnest(array[
  'csvb_threads_for_me','csvb_thread_inbox_for_me','csvb_thread_messages_for_me',
  'csvb_thread_notifications_for_me','csvb_thread_participants_for_me',
  'csvb_thread_attachments_for_me','csvb_related_threads_for_me',
  'csvb_thread_available_participants']) n on conflict do nothing;
notify pgrst,'reload schema';
commit;
