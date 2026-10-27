-- Extend the prepared Office configuration only. Do not activate the profile,
-- change its grants, assign users, or change any other organizational role.
begin;
do $$
declare
  demo_code constant text := 'office_draft_' || md5('csvb:prepared-role:demo_user');
  shared_code constant text := 'standard_office_view_only';
  actor constant uuid := '00000000-0000-0000-0000-000000000000';
  old_row public.csvb_office_role_catalogue;
  new_row public.csvb_office_role_catalogue;
begin
  select * into old_row from public.csvb_office_role_catalogue
    where code=demo_code for update;
  if not found or old_row.role_kind<>'demo' then
    raise exception 'Existing distinct Demo User catalogue identity is required.';
  end if;
  if old_row.is_assignable or exists(
    select 1 from public.profiles where office_role_code=demo_code
  ) then
    raise exception 'Demo User is assignable/in use; preparation-only change stopped.';
  end if;
  if not exists(select 1 from public.csvb_office_access_profiles
    where code=shared_code and not is_active and legacy_baseline is null) then
    raise exception 'Expected inactive, deny-by-default shared Office View-Only profile.';
  end if;
  if (select count(*) from public.csvb_office_access_profile_permissions
      where access_profile_code=shared_code)<>9
    or (select count(distinct m.code)
      from public.csvb_office_access_profile_permissions p
      join public.app_permissions ap on ap.id=p.permission_id
      join public.app_modules m on m.id=ap.module_id
      where p.access_profile_code=shared_code and p.is_granted
        and p.scope::text='company' and m.is_active and ap.action='view'
        and m.code in (
          'SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE',
          'VETTING_INSPECTION_PLANNER','POST_INSPECTION','POST_INSPECTION_STATS',
          'INSPECTOR_INTELLIGENCE','MOORING_ANCHORING_INVENTORIES',
          'PORT_CALL_INTELLIGENCE','PORTABLE_LIFTING_APPLIANCES_WIRES'
        ))<>9 then
    raise exception 'Shared profile must contain exactly the nine approved company-scoped View grants.';
  end if;
  if old_row.default_access_profile_code is distinct from shared_code
    or old_row.proposed_access_profile_code is distinct from shared_code then
    update public.csvb_office_role_catalogue
      set default_access_profile_code=shared_code,
          proposed_access_profile_code=shared_code,
          updated_by=actor,updated_at=now()
      where code=demo_code returning * into new_row;
    insert into public.csvb_role_catalogue_audit
      (role_code,display_name,action,actor_id,actor_username,before_data,after_data)
    values(demo_code,new_row.display_name,'configure',actor,
      'System migration (user-approved Demo User shared nine-module View-only profile)',
      to_jsonb(old_row),to_jsonb(new_row));
  end if;
end;
$$;
notify pgrst,'reload schema';
commit;
