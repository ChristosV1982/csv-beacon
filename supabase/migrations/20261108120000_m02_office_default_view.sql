begin;

-- Development/testing change: M02 is now an Office-visible module by default.
-- Seed ordinary permission rows, rather than bypassing the effective resolver.
-- Explicit profile/position/personal decisions and all tenancy checks remain live.
do $$
declare actor uuid; permission uuid; profile record;
begin
  actor := auth.uid();
  if actor is null then
    select id into actor from public.profiles
    where role::text='super_admin' and coalesce(is_active,true)
      and not coalesce(is_disabled,false) order by id limit 1;
    if actor is null then raise exception 'Active Super Admin audit actor required'; end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  end if;
  perform public.csvb_role_catalogue_require_super_admin();
  select p.id into strict permission from public.app_permissions p
    join public.app_modules m on m.id=p.module_id
    where m.code='M02_SHIP_INSPECTION_REPORT' and p.action='view';

  -- Existing explicit defaults/position overrides are intentionally preserved.
  -- The existing role_permissions audit trigger records these insertions.
  insert into public.role_permissions(role,position,permission_id,scope,is_granted)
    select r::public.app_role,null,permission,'company',true
    from unnest(array['company_admin','company_superintendent']) r
    where not exists(select 1 from public.role_permissions p
      where p.role::text=r and p.position is null and p.permission_id=permission);

  -- Include inactive profiles without activating them. Their hard inactive
  -- constraint remains unchanged if someone still holds such an assignment.
  for profile in select a.code from public.csvb_office_access_profiles a
    where not exists(select 1 from public.csvb_office_access_profile_permissions p
      where p.access_profile_code=a.code and p.permission_id=permission)
  loop
    perform public.csvb_admin_office_access_save(profile.code,
      jsonb_build_array(jsonb_build_object('permission_id',permission,
        'scope','company','is_granted',true)),
      'M02 default Office View access; no Edit/Export/Admin grants. Migration 20261108120000.');
  end loop;
end $$;

-- M02 was added after the deny-by-default Office API allowlist. Explicitly
-- register its narrow readers/writers; never allow raw M02 tables or shared_read.
insert into public.csvb_office_api_contracts
  (endpoint_kind,endpoint_name,module_codes,rpc_action,shared_read)
select 'rpc',name,array['M02_SHIP_INSPECTION_REPORT'],action,false
from (values
  ('csvb_m02_context','view'),
  ('csvb_m02_reports','view'),
  ('csvb_m02_reports_v2','view'),
  ('csvb_m02_get','view'),
  ('csvb_m02_get_v2','view'),
  ('csvb_m02_questions','view'),
  ('csvb_m02_reference','view'),
  ('csvb_m02_company_items','view'),
  ('csvb_m02_attachments','view'),
  ('csvb_m02_attachment_download','view'),
  ('csvb_m02_save','edit'),
  ('csvb_m02_save_v2','edit'),
  ('csvb_m02_attachment_reserve','edit'),
  ('csvb_m02_attachment_finalize','edit'),
  ('csvb_m02_attachment_delete','edit')
) contract(name,action)
on conflict(endpoint_kind,endpoint_name) do update
set module_codes=excluded.module_codes,rpc_action=excluded.rpc_action,shared_read=false;

commit;
