-- The live verifier substitutes its disposable profile UUID. Every change
-- below is rolled back; existing users are never reassigned.
begin;
do $$
declare fixture uuid:='__FIXTURE__'; actor uuid; company uuid; vessel uuid; rank_id uuid;
  role_value text; before_rows jsonb; after_rows jsonb; permission uuid;
  before_audit bigint; result jsonb; coordinator text;
begin
  select id into actor from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1;
  select company_id into company from public.profiles where id=fixture;
  select id into vessel from public.vessels where company_id=company and is_active order by name limit 1;
  select id into rank_id from public.onboard_ranks where lower(rank_code)='master' and
    (company_id=company or company_id is null) order by company_id nulls last limit 1;
  foreach role_value in array array['company_admin','company_superintendent','super_admin','vessel','inspector']
  loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
    update public.profiles set role=role_value::public.app_role,
      office_role_code=null,office_access_profile_code=null,position=null,
      vessel_id=case when role_value='vessel' then vessel else null end,
      onboard_rank_id=case when role_value='vessel' then rank_id else null end
      where id=fixture;
    perform set_config('request.jwt.claim.sub',fixture::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',fixture,'role','authenticated')::text,true);
    update public.csvb_office_authorization_state set enforcement_enabled=false;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.module_code,x.permission_action),'[]') into before_rows
      from public.csvb_my_effective_app_permissions() x;
    update public.csvb_office_authorization_state set enforcement_enabled=true;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.module_code,x.permission_action),'[]') into after_rows
      from public.csvb_my_effective_app_permissions() x;
    if before_rows is distinct from after_rows or public.csvb_office_authorization_applies() then
      raise exception 'Legacy/security-role compatibility failed: %',role_value;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select code into coordinator from public.csvb_office_role_catalogue where display_name='Marine Coordinator';
  update public.profiles set role='company_admin',office_role_code=coordinator,
    office_access_profile_code='company_administrator_access',vessel_id=null,onboard_rank_id=null where id=fixture;
  -- All prepared role-default grants/scopes must match the live baseline.
  if exists(
    select 1 from public.role_permissions r left join public.csvb_office_access_profile_permissions p
      on p.permission_id=r.permission_id and p.access_profile_code='company_administrator_access'
    where r.role='company_admin' and r.position is null and
      (p.is_granted is distinct from r.is_granted or p.scope is distinct from
        case when r.scope::text='global' then 'company'::public.permission_scope else r.scope end))
  then raise exception 'Company Administrator baseline mismatch'; end if;
  result:=public.csvb_admin_office_permission_diagnostic(fixture);
  if not (result->>'enforcement_enabled')::boolean then raise exception 'Diagnostic did not report real enforcement'; end if;
  if public.csvb_admin_office_access_configuration()->'profiles' is null then raise exception 'Missing Rights Matrix profiles'; end if;
  select a.id into permission from public.app_permissions a join public.app_modules m on m.id=a.module_id
    where m.code='POST_INSPECTION' and a.action='view';
  select count(*) into before_audit from public.csvb_office_access_audit;
  perform public.csvb_admin_office_access_save('standard_office_view_only',
    jsonb_build_array(jsonb_build_object('permission_id',permission,'scope','company','is_granted',false)),
    'Rollback-only Access Profile/Rights Matrix verification');
  if (select count(*) from public.csvb_office_access_audit)<=before_audit then raise exception 'Missing profile permission audit'; end if;
  perform public.csvb_admin_office_access_save('standard_office_view_only',
    jsonb_build_array(jsonb_build_object('permission_id',permission,'scope','company','is_granted',true)),
    'Rollback-only restore of Access Profile verification');
end $$;
rollback;
