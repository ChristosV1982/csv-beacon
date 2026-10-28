-- Apply only after live JWT/API and authenticated Preview verification.
begin;
do $$
declare existing_check text;
begin
  select pg_get_constraintdef(oid) into existing_check from pg_constraint
    where conrelid='public.csvb_office_access_audit'::regclass
      and conname='csvb_office_access_audit_operation_check';
  if existing_check not like '%resolver_activation%' then
    alter table public.csvb_office_access_audit drop constraint csvb_office_access_audit_operation_check;
    execute 'alter table public.csvb_office_access_audit add constraint csvb_office_access_audit_operation_check '
      ||'check ('||substring(existing_check from 7)||' or operation=''resolver_activation'')';
  end if;
end $$;
do $$
declare was_enabled boolean; actor uuid;
begin
  if exists(select 1 from public.csvb_office_authorization_test_subjects) then
    raise exception 'Remove isolated verification subjects before global activation';
  end if;
  if not exists(select 1 from pg_roles r,lateral unnest(coalesce(r.rolconfig,'{}')) s
      where r.rolname='authenticator' and s='pgrst.db_pre_request=public.csvb_office_api_pre_request') then
    raise exception 'API authorization hook is not installed';
  end if;
  if exists(select 1 from public.csvb_office_access_profiles
      where code in ('standard_office_view_only','company_administrator_access','standard_office_access')
        and not is_active) then raise exception 'Required Access Profile inactive'; end if;
  if (select count(*) from public.csvb_office_access_profile_permissions p
      join public.app_permissions a on a.id=p.permission_id
      where p.access_profile_code='standard_office_view_only' and p.is_granted and a.action='view')<>9
    or exists(select 1 from public.csvb_office_access_profile_permissions p
      join public.app_permissions a on a.id=p.permission_id
      where p.access_profile_code='standard_office_view_only' and p.is_granted and a.action<>'view')
    then raise exception 'Invalid nine-module view-only profile'; end if;
  select enforcement_enabled into was_enabled from public.csvb_office_authorization_state for update;
  update public.csvb_office_authorization_state set enforcement_enabled=true,updated_at=now();
  if not was_enabled then
    select id into actor from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1;
    insert into public.csvb_office_access_audit
      (actor_id,operation,before_value,after_value,reason)
    values(actor,'resolver_activation','{"enforcement_enabled":false}',
      '{"enforcement_enabled":true}',
      'Development/testing activation after live JWT/REST and authenticated Preview verification; no user reassignment.');
  end if;
end $$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
