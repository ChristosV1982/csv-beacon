-- Candidate resolver verification. All fixture/config/account changes roll back.
begin;
do $$
declare actor uuid; subject public.profiles; role_code text; module_code text;
  decision jsonb; perm uuid; audit_count bigint; original_profile text;
begin
  select id into actor from public.profiles where role::text='super_admin'
    and is_active and not is_disabled order by id limit 1;
  if actor is null then raise exception 'Active Super Admin fixture required'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select * into subject from public.profiles
    where role::text='company_superintendent' and company_id is not null
    order by id limit 1;
  if subject.id is null then raise exception 'Office fixture required'; end if;
  select code into role_code from public.csvb_office_role_catalogue
    where display_name='Marine Superintendent' and is_active and is_assignable;
  if role_code is null then raise exception 'Marine Superintendent role missing'; end if;
  if (select count(*) from public.csvb_office_access_profile_permissions g
    join public.app_permissions a on a.id=g.permission_id
    where g.access_profile_code='standard_office_view_only' and g.is_granted
      and a.action='view')<>9 then raise exception 'Expected exactly nine View grants'; end if;
  if exists(select 1 from public.csvb_office_access_profile_permissions g
    join public.app_permissions a on a.id=g.permission_id
    where g.access_profile_code='standard_office_view_only' and g.is_granted
      and a.action<>'view') then raise exception 'View-only profile has non-View grants'; end if;
  update public.csvb_office_access_profiles set is_active=true
    where code in ('standard_office_view_only','company_administrator_access');
  update public.profiles set office_role_code=role_code,
    office_access_profile_code='standard_office_view_only',is_active=true,is_disabled=false
    where id=subject.id;
  -- Existing enablement may omit a module. Fixture enables only within rollback.
  foreach module_code in array array[
    'SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE','VETTING_INSPECTION_PLANNER',
    'POST_INSPECTION','POST_INSPECTION_STATS','INSPECTOR_INTELLIGENCE',
    'MOORING_ANCHORING_INVENTORIES','PORT_CALL_INTELLIGENCE','PORTABLE_LIFTING_APPLIANCES_WIRES']
  loop
    insert into public.company_modules(company_id,module_key,is_enabled)
      values(subject.company_id,csvb_office_auth_private.company_module_key(module_code),true)
      on conflict(company_id,module_key) do update set is_enabled=true;
    decision:=csvb_office_auth_private.decision(subject.id,module_code,'view');
    if not (decision->>'allowed')::boolean or decision->>'source'<>'access_profile' then
      raise exception 'View failed: %: %',module_code,decision;
    end if;
    foreach original_profile in array array['edit','export','admin'] loop
      if (csvb_office_auth_private.decision(subject.id,module_code,original_profile)
        ->>'allowed')::boolean then
        raise exception 'Non-View allowed: % %',module_code,original_profile;
      end if;
    end loop;
  end loop;
  -- An unlisted module stays denied, even if its company switch is enabled.
  insert into public.company_modules(company_id,module_key,is_enabled)
    values(subject.company_id,'threads',true)
    on conflict(company_id,module_key) do update set is_enabled=true;
  if (csvb_office_auth_private.decision(subject.id,'THREADS','view')->>'allowed')::boolean then
    raise exception 'Unlisted module was allowed';
  end if;
  select a.id into perm from public.app_permissions a join public.app_modules m on m.id=a.module_id
    where m.code='THREADS' and a.action='view';
  select count(*) into audit_count from public.csvb_office_access_audit;
  perform public.csvb_admin_office_personal_override_save(
    subject.id,perm,'allow','company','Transactional resolver test');
  decision:=csvb_office_auth_private.decision(subject.id,'THREADS','view');
  if not (decision->>'allowed')::boolean or decision->>'source'<>'personal_allow' then
    raise exception 'Personal Allow precedence failed';
  end if;
  perform public.csvb_admin_office_personal_override_save(
    subject.id,perm,'inherit',null,'Transactional resolver test');
  if (csvb_office_auth_private.decision(subject.id,'THREADS','view')->>'allowed')::boolean then
    raise exception 'Inherited should restore profile denial';
  end if;
  select a.id into perm from public.app_permissions a join public.app_modules m on m.id=a.module_id
    where m.code='POST_INSPECTION' and a.action='view';
  perform public.csvb_admin_office_personal_override_save(
    subject.id,perm,'deny',null,'Transactional resolver test');
  decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','view');
  if (decision->>'allowed')::boolean or decision->>'source'<>'personal_deny' then
    raise exception 'Personal Deny precedence failed';
  end if;
  if (select count(*) from public.csvb_office_access_audit)<=audit_count then
    raise exception 'Override audit missing';
  end if;
  if (csvb_office_auth_private.decision(subject.id,'SIRE_QUESTIONS_VIEWER','view',
    gen_random_uuid())->>'allowed')::boolean then raise exception 'Company escape allowed'; end if;
  if (csvb_office_auth_private.decision(subject.id,'SU_ADMIN','view')->>'allowed')::boolean then
    raise exception 'Platform administration escape allowed';
  end if;
  if not (csvb_office_auth_private.decision(actor,'SU_ADMIN','admin')->>'allowed')::boolean then
    raise exception 'Super Admin diagnostic changed';
  end if;
  -- Public decisions cannot be used as an arbitrary-user oracle.
  perform set_config('request.jwt.claim.sub',subject.id::text,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',subject.id,'role','authenticated')::text,true);
  begin
    perform public.csvb_admin_office_permission_diagnostic(actor);
    raise exception 'Office caller was allowed to inspect another identity';
  exception when insufficient_privilege then null;
  end;
  if public.csvb_office_authorization_applies() then
    raise exception 'Staging must not activate live enforcement';
  end if;
end $$;
rollback;
