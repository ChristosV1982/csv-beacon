-- Prepared configuration only. No resolver activation, user reassignment,
-- legacy grant edits, or app_role enum changes.
begin;

do $$
declare
  profile_code constant text := 'standard_office_view_only';
  actor constant uuid := '00000000-0000-0000-0000-000000000000';
  actor_label constant text := 'System migration (user-approved Office view-only configuration)';
  wanted_modules constant text[] := array[
    'SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE',
    'VETTING_INSPECTION_PLANNER','POST_INSPECTION','POST_INSPECTION_STATS',
    'INSPECTOR_INTELLIGENCE','MOORING_ANCHORING_INVENTORIES',
    'PORT_CALL_INTELLIGENCE','PORTABLE_LIFTING_APPLIANCES_WIRES'
  ];
  wanted_roles constant text[] := array[
    'marine_superintendent','marine_superintendent_port_captain',
    'technical_superintendent','technical_superintendent_port_engineer',
    'hsqe_superintendent','dpa','technical_manager','general_manager'
  ];
  proposals jsonb;
  before_profile jsonb;
  after_profile jsonb;
  old_role public.csvb_office_role_catalogue;
  new_role public.csvb_office_role_catalogue;
  role_key text;
  technical_manager_code text := 'office_draft_' || md5('csvb:prepared-role:technical_manager');
begin
  -- Refuse to turn this preparation step into an active permission change.
  if exists (
    select 1 from public.csvb_office_access_profiles
    where code=profile_code and is_active
  ) or exists (
    select 1 from public.profiles where office_access_profile_code=profile_code
  ) then
    raise exception 'View-only profile is active/in use; review live authorization before changing it.';
  end if;
  if exists (
    select 1 from public.csvb_office_role_catalogue c
    where c.code in (
      select 'office_draft_' || md5('csvb:prepared-role:' || k)
      from unnest(wanted_roles) k
    ) and (c.is_assignable or exists (
      select 1 from public.profiles p where p.office_role_code=c.code
    ))
  ) then
    raise exception 'A target Office role is assignable/in use; preparation-only migration stopped.';
  end if;
  if (select count(*) from public.app_modules m
      join public.app_permissions ap on ap.module_id=m.id
      where m.code=any(wanted_modules) and m.is_active and ap.action='view')<>9
    or (select count(distinct m.code) from public.app_modules m
      join public.app_permissions ap on ap.module_id=m.id
      where m.code=any(wanted_modules) and m.is_active and ap.action='view')<>9 then
    raise exception 'Expected exactly one existing View permission for each of the nine active modules.';
  end if;
  if (select count(*) from public.csvb_office_role_catalogue c
      where c.code in (
        select 'office_draft_' || md5('csvb:prepared-role:' || k)
        from unnest(wanted_roles) k where k<>'technical_manager'
      ))<>7 then
    raise exception 'A target Office role is missing; do not guess/rename organizational identities.';
  end if;

  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.csvb_office_access_profiles p where code=profile_code),
    'permissions',coalesce((select jsonb_agg(to_jsonb(p) order by permission_id)
      from public.csvb_office_access_profile_permissions p
      where access_profile_code=profile_code),'[]'::jsonb)
  ) into before_profile;

  insert into public.csvb_office_access_profiles(code,display_name,legacy_baseline,is_active)
    values(profile_code,'Standard Office View-Only',null,false)
    on conflict(code) do update set display_name=excluded.display_name,
      legacy_baseline=null,updated_at=now()
    where csvb_office_access_profiles.display_name is distinct from excluded.display_name
       or csvb_office_access_profiles.legacy_baseline is not null;
  -- Exactly nine allow rows. Everything absent is denied by default.
  -- No legacy baseline fallback belongs to this new prepared profile.
  delete from public.csvb_office_access_profile_permissions
    where access_profile_code=profile_code;
  insert into public.csvb_office_access_profile_permissions
    (access_profile_code,permission_id,scope,is_granted)
  select profile_code,ap.id,'company'::public.permission_scope,true
    from public.app_modules m join public.app_permissions ap on ap.module_id=m.id
    where m.code=any(wanted_modules) and m.is_active and ap.action='view';

  select jsonb_agg(jsonb_build_object('module_code',m.code,'action',ap.action)
    order by m.code) into proposals
    from public.app_modules m join public.app_permissions ap on ap.module_id=m.id
    where m.code=any(wanted_modules) and m.is_active and ap.action='view';
  -- Mirror preparation metadata so the existing Role Management reader/UI
  -- displays the same proposal as the future Access Profile permission layer.
  insert into public.csvb_prepared_access_profiles
    (code,display_name,proposed_permissions,notes)
  values(profile_code,'Standard Office View-Only',proposals,
    'Prepared only; not active authorization. Company-scoped View for exactly the nine approved modules. All other actions/modules denied by default. Assignment remains blocked until the Office resolver/backend checks are verified.')
  on conflict(code) do update set display_name=excluded.display_name,
    proposed_permissions=excluded.proposed_permissions,notes=excluded.notes;

  select * into old_role from public.csvb_office_role_catalogue
    where code=technical_manager_code for update;
  if not found then
    insert into public.csvb_office_role_catalogue
      (code,display_name,role_kind,organizational_classification,
       proposed_access_profile_code,default_access_profile_code,created_by,updated_by)
    values(technical_manager_code,'Technical Manager','office','Management',
      profile_code,profile_code,actor,actor)
    returning * into new_role;
    insert into public.csvb_role_catalogue_audit
      (role_code,display_name,action,actor_id,actor_username,before_data,after_data)
    values(new_role.code,new_role.display_name,'create',actor,actor_label,null,to_jsonb(new_role));
  elsif old_role.role_kind<>'office' or old_role.organizational_classification<>'Management' then
    raise exception 'Technical Manager catalogue identity is incompatible; manual review required.';
  end if;

  foreach role_key in array wanted_roles loop
    select * into old_role from public.csvb_office_role_catalogue
      where code='office_draft_' || md5('csvb:prepared-role:' || role_key) for update;
    if old_role.default_access_profile_code is distinct from profile_code
      or old_role.proposed_access_profile_code is distinct from profile_code then
      update public.csvb_office_role_catalogue
        set default_access_profile_code=profile_code,proposed_access_profile_code=profile_code,
          updated_by=actor,updated_at=now()
        where code=old_role.code returning * into new_role;
      insert into public.csvb_role_catalogue_audit
        (role_code,display_name,action,actor_id,actor_username,before_data,after_data)
      values(new_role.code,new_role.display_name,'configure',actor,actor_label,
        to_jsonb(old_role),to_jsonb(new_role));
    end if;
  end loop;

  select jsonb_build_object(
    'profile',(select to_jsonb(p) from public.csvb_office_access_profiles p where code=profile_code),
    'permissions',coalesce((select jsonb_agg(to_jsonb(p) order by permission_id)
      from public.csvb_office_access_profile_permissions p
      where access_profile_code=profile_code),'[]'::jsonb)
  ) into after_profile;
  if before_profile is distinct from after_profile then
    insert into public.csvb_office_access_audit
      (actor_id,operation,before_value,after_value,reason)
    values(actor,'profile_permission',before_profile,after_profile,
      'User-approved prepared Standard Office View-Only profile: exactly nine company-scoped View grants; no activation or user reassignment.');
  end if;
end;
$$;
notify pgrst,'reload schema';
commit;
