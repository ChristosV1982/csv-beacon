-- Configuration assertions. No user writes, role grants or resolver changes.
do $$
declare
  wanted_modules constant text[] := array[
    'SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE',
    'VETTING_INSPECTION_PLANNER','POST_INSPECTION','POST_INSPECTION_STATS',
    'INSPECTOR_INTELLIGENCE','MOORING_ANCHORING_INVENTORIES',
    'PORT_CALL_INTELLIGENCE','PORTABLE_LIFTING_APPLIANCES_WIRES'
  ];
  wanted_roles constant text[] := array[
    'marine_superintendent','marine_superintendent_port_captain',
    'technical_superintendent','technical_superintendent_port_engineer',
    'hsqe_superintendent','dpa','technical_manager','general_manager','demo_user'
  ];
begin
  if (select count(*) from public.csvb_office_access_profile_permissions
      where access_profile_code='standard_office_view_only')<>9 then
    raise exception 'The shared profile must contain exactly nine permission rows.';
  end if;
  if exists (
    select 1 from public.csvb_office_access_profile_permissions p
      join public.app_permissions ap on ap.id=p.permission_id
      join public.app_modules m on m.id=ap.module_id
    where p.access_profile_code='standard_office_view_only'
      and (ap.action<>'view' or not p.is_granted
        or p.scope::text<>'company' or not m.is_active or not(m.code=any(wanted_modules)))
  ) then
    raise exception 'Unexpected action, scope or module in view-only profile.';
  end if;
  if (select count(distinct m.code)
      from public.csvb_office_access_profile_permissions p
      join public.app_permissions ap on ap.id=p.permission_id
      join public.app_modules m on m.id=ap.module_id
      where p.access_profile_code='standard_office_view_only')<>9 then
    raise exception 'Nine distinct modules are required.';
  end if;
  if not exists(select 1 from public.csvb_office_access_profiles
      where code='standard_office_view_only' and not is_active and legacy_baseline is null) then
    raise exception 'Profile activated or given an unsafe legacy fallback.';
  end if;
  if (select count(*) from public.csvb_office_role_catalogue
      where default_access_profile_code='standard_office_view_only')<>9
    or exists (
      select 1 from unnest(wanted_roles) k
      where not exists (
        select 1 from public.csvb_office_role_catalogue c
        where c.code='office_draft_'||md5('csvb:prepared-role:'||k)
          and c.default_access_profile_code='standard_office_view_only'
          and c.proposed_access_profile_code='standard_office_view_only'
          and not c.is_assignable
      )
    ) then
    raise exception 'Expected exactly the nine requested unassignable role mappings, including Demo User.';
  end if;
  if not exists(select 1 from public.csvb_office_role_catalogue
      where code='office_draft_'||md5('csvb:prepared-role:technical_manager')
      and display_name='Technical Manager' and organizational_classification='Management'
      and role_kind='office') then
    raise exception 'Technical Manager must remain a distinct Management identity.';
  end if;
  if not exists(select 1 from public.csvb_office_role_catalogue
      where code='office_draft_'||md5('csvb:prepared-role:demo_user')
      and display_name='Demo User' and role_kind='demo'
      and organizational_classification='Demo / Training') then
    raise exception 'Sharing a profile must not change Demo User organizational identity.';
  end if;
  if (select proposed_permissions from public.csvb_prepared_access_profiles
      where code='standard_office_view_only') is distinct from (
      select jsonb_agg(jsonb_build_object('module_code',m.code,'action',ap.action) order by m.code)
      from public.csvb_office_access_profile_permissions p
      join public.app_permissions ap on ap.id=p.permission_id
      join public.app_modules m on m.id=ap.module_id
      where p.access_profile_code='standard_office_view_only'
  ) then
    raise exception 'Role Management proposal differs from Access Profile configuration.';
  end if;
  if exists(select 1 from public.profiles where office_access_profile_code='standard_office_view_only') then
    raise exception 'No existing users may be reassigned by this preparation task.';
  end if;
end;
$$;
