-- Manual Office identity/profile assignment only. Access profiles stay
-- inactive; no effective-permission resolver or legacy role grants change.
begin;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.csvb_office_role_catalogue'::regclass
      and contype='c' and pg_get_constraintdef(oid) like '%is_assignable = false%'
  loop
    execute format('alter table public.csvb_office_role_catalogue drop constraint %I',c.conname);
  end loop;
end;
$$;

do $$
declare old_row public.csvb_office_role_catalogue; new_row public.csvb_office_role_catalogue;
begin
  for old_row in select * from public.csvb_office_role_catalogue
where is_active and not is_assignable and default_access_profile_code is not null
  and code in (
    select 'office_draft_'||md5('csvb:prepared-role:'||k)
    from unnest(array[
      'marine_coordinator','marine_superintendent','marine_superintendent_port_captain',
      'technical_superintendent','technical_superintendent_port_engineer','technical_operator',
      'hsqe_superintendent','fleet_operator','post_fixture_operator','performance_engineer',
      'fleet_manager','dpa','general_manager','technical_director','technical_manager','demo_user'
    ]) k
  ) loop
    update public.csvb_office_role_catalogue set is_assignable=true
      where code=old_row.code returning * into new_row;
    insert into public.csvb_role_catalogue_audit
      (role_code,display_name,action,actor_id,actor_username,before_data,after_data)
    values(new_row.code,new_row.display_name,'configure',
      '00000000-0000-0000-0000-000000000000',
      'System migration (user-approved manual Office assignment; access enforcement pending)',
      to_jsonb(old_row),to_jsonb(new_row));
  end loop;
end;
$$;

create or replace function public.csvb_office_assignment_pending()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare changed boolean;
begin
  changed := tg_op='INSERT';
  if tg_op='UPDATE' then
    changed := new.office_role_code is distinct from old.office_role_code
      or new.office_access_profile_code is distinct from old.office_access_profile_code;
  end if;
  if new.office_role_code is null and new.office_access_profile_code is null and not changed then
    return new;
  end if;
  if tg_op='INSERT' and new.office_role_code is null and new.office_access_profile_code is null then
    return new;
  end if;
  if new.office_role_code is not null and (
    new.role::text not in ('company_admin','company_superintendent') or new.company_id is null
  ) then
    raise exception 'Office assignment requires an existing company Office account; protected system, vessel and third-party identities are unchanged.'
      using errcode='42501';
  end if;
  if changed then
    perform public.csvb_role_catalogue_require_super_admin();
    if (new.office_role_code is null)<>(new.office_access_profile_code is null) then
      raise exception 'Office Role and Access Profile must both be set or both cleared.';
    end if;
    if new.office_role_code is not null then
      if not exists(select 1 from public.csvb_office_role_catalogue
        where code=new.office_role_code and is_active and is_assignable) then
        raise exception 'Office Role is not active/assignable. Reload before saving.';
      end if;
      if not exists(select 1 from public.csvb_office_access_profiles a
        where a.code=new.office_access_profile_code and exists(
          select 1 from public.csvb_office_role_catalogue c
          where c.is_active and c.is_assignable and c.default_access_profile_code=a.code
        )) then
        raise exception 'Access Profile is not an available Office assignment profile.';
      end if;
      update public.csvb_office_role_catalogue
        set ever_used=true where code=new.office_role_code and not ever_used;
    end if;
  end if;
  return new;
end;
$$;
drop trigger csvb_office_assignment_pending on public.profiles;
create trigger csvb_office_assignment_pending
before insert or update of office_role_code,office_access_profile_code,role,company_id
on public.profiles for each row execute function public.csvb_office_assignment_pending();

create function public.csvb_office_assignment_audit()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare old_role text; old_profile text;
begin
  if tg_op='UPDATE' then
    old_role:=old.office_role_code;
    old_profile:=old.office_access_profile_code;
  end if;
  if new.office_role_code is distinct from old_role then
    insert into public.csvb_office_access_audit
      (subject_profile_id,actor_id,operation,before_value,after_value,reason)
    values(new.id,auth.uid(),'role_assignment',
      jsonb_build_object('office_role_code',old_role),
      jsonb_build_object('office_role_code',new.office_role_code),
      coalesce(nullif(current_setting('csvb.office_assignment_reason',true),''),
        'Super Admin manual Office assignment'));
  end if;
  if new.office_access_profile_code is distinct from old_profile then
    insert into public.csvb_office_access_audit
      (subject_profile_id,actor_id,operation,before_value,after_value,reason)
    values(new.id,auth.uid(),'profile_assignment',
      jsonb_build_object('access_profile_code',old_profile),
      jsonb_build_object('access_profile_code',new.office_access_profile_code),
      coalesce(nullif(current_setting('csvb.office_assignment_reason',true),''),
        'Super Admin manual Office assignment'));
  end if;
  return new;
end;
$$;
create trigger csvb_office_assignment_audit
after insert or update of office_role_code,office_access_profile_code on public.profiles
for each row execute function public.csvb_office_assignment_audit();

create function public.csvb_admin_office_user_options(p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare p public.profiles;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into p from public.profiles where id=p_profile_id;
  if not found or p.role::text not in ('company_admin','company_superintendent') then
    raise exception 'Select an existing Office user. Protected system and onboard identities use their existing editor.';
  end if;
  return jsonb_build_object(
    'profile',jsonb_build_object('id',p.id,'username',p.username,
      'first_name',p.first_name,'last_name',p.last_name,'position',p.position,
      'company_id',p.company_id,'vessel_id',p.vessel_id,'role',p.role,
      'is_active',p.is_active,'is_disabled',p.is_disabled,
      'force_password_reset',p.force_password_reset,
      'office_role_code',p.office_role_code,'office_access_profile_code',p.office_access_profile_code),
    'company_name',(select coalesce(short_name,company_name) from public.companies where id=p.company_id),
    'roles',coalesce((select jsonb_agg(jsonb_build_object('code',c.code,'display_name',c.display_name,
      'default_access_profile_code',c.default_access_profile_code,
      'classification',c.organizational_classification) order by c.display_name)
      from public.csvb_office_role_catalogue c where c.is_active and c.is_assignable),'[]'::jsonb),
    'access_profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'code',a.code,'display_name',a.display_name,'is_active',a.is_active) order by a.display_name)
      from public.csvb_office_access_profiles a where exists(
        select 1 from public.csvb_office_role_catalogue c
        where c.is_active and c.is_assignable and c.default_access_profile_code=a.code
      )),'[]'::jsonb),
    'current_office_role_name',(select display_name from public.csvb_office_role_catalogue where code=p.office_role_code),
    'current_access_profile_name',(select display_name from public.csvb_office_access_profiles where code=p.office_access_profile_code),
    'permission_enforcement_active',false,
    'permission_notice','Office Role and Access Profile are saved as prepared assignments. Current legacy permissions remain in effect until the Office authorization resolver is activated. A view-only profile does not yet restrict access.'
  );
end;
$$;

create function public.csvb_admin_update_office_user(
  p_profile_id uuid,
  p_office_role_code text,
  p_access_profile_code text default null,
  p_changes jsonb default '{}'::jsonb,
  p_reason text default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare p public.profiles; selected_profile text; result jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  if nullif(btrim(p_reason),'') is null then raise exception 'Change reason is required.'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or exists(
    select 1 from jsonb_object_keys(p_changes) k where k not in (
      'first_name','last_name','position','is_active','is_disabled','force_password_reset'
    )
  ) then raise exception 'Only editable Office particulars/status fields are accepted.'; end if;
  select * into p from public.profiles where id=p_profile_id for update;
  if not found or p.role::text not in ('company_admin','company_superintendent') then
    raise exception 'An existing company Office user must be explicitly selected.' using errcode='42501';
  end if;
  if p_office_role_code is not null then
    select coalesce(p_access_profile_code,c.default_access_profile_code) into selected_profile
      from public.csvb_office_role_catalogue c where c.code=p_office_role_code;
    if selected_profile is null then raise exception 'Office Role/default Access Profile not found.'; end if;
  elsif p_access_profile_code is not null then
    raise exception 'Select an Office Role before overriding its Access Profile.';
  end if;
  perform set_config('csvb.office_assignment_reason',p_reason,true);
  update public.profiles set office_role_code=p_office_role_code,
    office_access_profile_code=selected_profile where id=p_profile_id;
  -- Retain the existing particulars writer and its historical audit. Preserve
  -- security role, company, vessel, onboard and identity fields explicitly.
  result:=public.csvb_update_user_particulars(
    p_profile_id=>p.id,
    p_first_name=>coalesce(p_changes->>'first_name',p.first_name),
    p_last_name=>coalesce(p_changes->>'last_name',p.last_name),
    p_company_id=>p.company_id,p_vessel_id=>p.vessel_id,p_role=>p.role::text,
    p_position=>coalesce(p_changes->>'position',p.position),
    p_danaos_credential=>p.danaos_credential,p_onboard_rank_id=>p.onboard_rank_id,
    p_onboard_status=>p.onboard_status,p_onboard_access_enabled=>p.onboard_access_enabled,
    p_read_only_after_disembarkation=>p.read_only_after_disembarkation,
    p_embarkation_date=>p.embarkation_date,p_disembarkation_date=>p.disembarkation_date,
    p_force_password_reset=>coalesce((p_changes->>'force_password_reset')::boolean,p.force_password_reset),
    p_is_active=>coalesce((p_changes->>'is_active')::boolean,p.is_active),
    p_is_disabled=>coalesce((p_changes->>'is_disabled')::boolean,p.is_disabled),
    p_reason=>p_reason
  );
  return public.csvb_admin_office_user_options(p_profile_id)||jsonb_build_object('ok',true);
end;
$$;

-- Preserve original dependency counts, extending the assigned-user count to
-- stable Office identities. ever_used continues to prevent historical deletion.
do $$
declare definition text;
begin
  select replace(pg_get_functiondef(oid),E'\r','') into definition from pg_proc
    where oid='public.csvb_role_catalogue_dependencies(text)'::regprocedure;
  if position('from public.profiles where role::text=p_code' in definition)=0 then
    raise exception 'Catalogue dependency definition changed; review before migration.';
  end if;
  execute replace(definition,'from public.profiles where role::text=p_code',
    'from public.profiles where role::text=p_code or office_role_code=p_code');

  select replace(pg_get_functiondef(oid),E'\r','') into definition from pg_proc
    where oid='public.csvb_role_catalogue_list()'::regprocedure;
  if position('''is_assignable'',false' in definition)=0 then
    raise exception 'Catalogue list definition changed; review before migration.';
  end if;
  definition:=replace(definition,'''is_assignable'',false','''is_assignable'',c.is_assignable');
  definition:=replace(definition,'''status'',''Draft / Not yet assignable''',
    '''status'',case when c.is_assignable then ''Manual assignment available / access enforcement pending'' else ''Draft / Not yet assignable'' end');
  definition:=replace(definition,
    'Catalogue preparation only. No permissions granted; unavailable in user assignment and authorization.',
    'Organizational assignment is separate from authorization. Prepared Access Profiles do not yet change effective permissions.');
  execute definition;
end;
$$;
revoke all on function public.csvb_admin_office_user_options(uuid),
  public.csvb_admin_update_office_user(uuid,text,text,jsonb,text),
  public.csvb_office_assignment_audit(),public.csvb_office_assignment_pending()
  from public,anon,authenticated;
grant execute on function public.csvb_admin_office_user_options(uuid),
  public.csvb_admin_update_office_user(uuid,text,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
