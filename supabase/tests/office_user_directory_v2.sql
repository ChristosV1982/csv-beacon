begin;
do $$
declare actor uuid; rows jsonb; original jsonb; actual jsonb; aga jsonb; rejected boolean:=false;
begin
  select id into actor from public.profiles where role::text='super_admin'
    and coalesce(is_active,true) and not coalesce(is_disabled,false) limit 1;
  if actor is null then raise exception 'Active Super Admin required for directory test.'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  rows:=public.csvb_admin_list_users_by_company_v2(null);
  select jsonb_agg(to_jsonb(u) order by u.id) into original
    from public.csvb_admin_list_users_by_company(null) u;
  select jsonb_agg(u - array['office_role_code','office_role_label',
    'office_access_profile_code','office_access_profile_label',
    'office_profile_is_role_default','office_permission_enforcement_active'] order by u->>'id')
    into actual from jsonb_array_elements(rows) u;
  if actual is distinct from original then raise exception 'Legacy directory fields/records changed.'; end if;
  select u into aga from jsonb_array_elements(rows) u where u->>'username'='AGA';
  if aga is null or aga->>'office_role_label'<>'Marine Coordinator'
    or aga->>'office_access_profile_label'<>'Company Administrator Access'
    or aga->>'role_name'<>'company_admin' or aga->>'user_position'<>'Marine Superintendent'
    or aga->'office_profile_is_role_default'<>'true'::jsonb
    or aga->'office_permission_enforcement_active'<>'false'::jsonb then
    raise exception 'AGA directory metadata did not match the stored prepared assignment and preserved legacy fields.';
  end if;
  if exists(select 1 from jsonb_array_elements(
    public.csvb_admin_list_users_by_company_v2((aga->>'company_id')::uuid)
  ) u where u->>'company_id' is distinct from aga->>'company_id') then
    raise exception 'Company-filtered directory escaped the requested scope.';
  end if;
  if public.csvb_admin_list_users_by_company_v2(gen_random_uuid())<>'[]'::jsonb then
    raise exception 'Unknown company should return an empty directory.';
  end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.csvb_admin_list_users_by_company_v2(null);
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Unknown/non-admin actor was able to read the directory.'; end if;
  if has_function_privilege('anon','public.csvb_admin_list_users_by_company_v2(uuid)','execute') then
    raise exception 'Anonymous directory access must remain denied.';
  end if;
  raise notice 'PASS: AGA metadata, legacy row parity, company scope, empty results and authorization.';
end;
$$;
rollback;
