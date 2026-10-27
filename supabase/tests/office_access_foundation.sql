-- Read-only checks to run after the additive Office access foundation migration.
do $$
declare
  expected_modules integer;
begin
  if (select count(*) from public.csvb_office_access_profiles
      where code in ('company_administrator_access','standard_office_access','demo_view_only_access')) <> 3 then
    raise exception 'Expected the three original prepared reusable access profiles';
  end if;
  if exists(select 1 from public.csvb_office_access_profiles where is_active) then
    raise exception 'Access profiles were activated before the resolver is ready';
  end if;
  if exists(select 1 from public.csvb_office_role_catalogue where is_assignable) then
    raise exception 'Office role assignment was enabled prematurely';
  end if;
  if exists(select 1 from public.profiles
            where office_role_code is not null or office_access_profile_code is not null) then
    raise exception 'An existing user was reassigned';
  end if;
  if (select count(*) from public.csvb_office_role_catalogue
      where default_access_profile_code is null) <> 0 then
    raise exception 'A prepared Office role has no access-profile mapping';
  end if;
  if exists (
    select 1 from public.csvb_office_access_profile_permissions pp
    where pp.access_profile_code='demo_view_only_access'
      and (pp.is_granted is distinct from true
        or not exists (
          select 1 from public.app_permissions ap
          join public.app_modules m on m.id=ap.module_id
          where ap.id=pp.permission_id and ap.action='view'
            and m.code in ('SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE')
        ))
  ) then
    raise exception 'Demo proposal contains an unsafe permission';
  end if;
  select count(*) into expected_modules from public.csvb_office_access_profile_permissions
    where access_profile_code='demo_view_only_access';
  if expected_modules<>2 then
    raise exception 'Demo proposal must have exactly two view grants, got %', expected_modules;
  end if;
  if exists (
    select 1 from (
      select rp.role::text as legacy_role,rp.permission_id,
        bool_or(rp.is_granted) as is_granted,
        min(rp.scope::text) as scope
      from public.role_permissions rp
      where rp.position is null
        and rp.role::text in ('company_admin','company_superintendent')
      group by 1,2
    ) old
    full join (
      select * from public.csvb_office_access_profile_permissions
      where access_profile_code in
        ('company_administrator_access','standard_office_access')
    ) prepared
      on prepared.permission_id=old.permission_id
     and prepared.access_profile_code=
       case old.legacy_role when 'company_admin' then 'company_administrator_access'
            else 'standard_office_access' end
    where old.permission_id is null or prepared.permission_id is null
      or prepared.is_granted is distinct from old.is_granted
      or prepared.scope::text is distinct from old.scope
  ) then
    raise exception 'A prepared baseline differs from current legacy role defaults';
  end if;
end;
$$;
