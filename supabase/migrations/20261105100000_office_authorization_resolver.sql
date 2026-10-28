-- Office resolver, staged separately from activation. No user reassignment.
begin;

create table public.csvb_office_authorization_state (
  singleton boolean primary key default true check (singleton),
  enforcement_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.csvb_office_authorization_state(singleton) values(true);
alter table public.csvb_office_authorization_state enable row level security;
revoke all on public.csvb_office_authorization_state from public,anon,authenticated;

create schema if not exists csvb_office_auth_private;
revoke all on schema csvb_office_auth_private from public,anon,authenticated;

-- Company enablement is a hard tenancy constraint, not a grant.
create function csvb_office_auth_private.company_module_key(p_module text)
returns text language sql immutable set search_path=pg_catalog as $$
  select case p_module
    when 'POST_INSPECTION' then 'post_inspection'
    when 'POST_INSPECTION_STATS' then 'post_inspection_stats'
    when 'SIRE_QUESTIONS_VIEWER' then 'sire_questions_viewer'
    when 'SIRE_FLEET_VETTING_EXPERIENCE' then 'sire_fleet_vetting_experience'
    when 'VETTING_INSPECTION_PLANNER' then 'vetting_planner'
    when 'MOORING_ANCHORING_INVENTORIES' then 'mooring_anchoring_inventories'
    when 'PORT_CALL_INTELLIGENCE' then 'port_call_intelligence'
    when 'PORTABLE_LIFTING_APPLIANCES_WIRES' then 'portable_lifting_appliances_wires'
    when 'INSPECTOR_INTELLIGENCE' then 'inspector_intelligence'
    when 'QUESTIONS_EDITOR' then 'questions_editor'
    when 'QUESTION_LIBRARY' then 'read_only_library'
    when 'REPORTS' then 'fleet_reports'
    when 'INSPECTOR_THIRD_PARTY' then 'sire_2_vetting'
    when 'VESSEL_QUESTIONNAIRES' then 'self_assessment'
    when 'SELF_ASSESSMENT_TASKS' then 'self_assessment'
    when 'SELF_ASSESSMENT_ASSIGNMENTS' then 'self_assessment'
    when 'RISQ_QUESTIONS_EDITOR' then 'risq_questions_editor'
    when 'RISQ_QUESTIONS_VIEWER' then 'risq_questions_viewer'
    else lower(p_module) end
$$;

create function public.csvb_office_authorization_applies()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.profiles p
    cross join public.csvb_office_authorization_state s
    where p.id=auth.uid() and p.role::text in ('company_admin','company_superintendent')
      and p.office_access_profile_code is not null and s.enforcement_enabled)
$$;

-- Owner-only implementation: callers may never pass somebody else's identity.
create function csvb_office_auth_private.decision(
  p_subject uuid,p_module text,p_action text,
  p_company_id uuid default null,p_vessel_id uuid default null)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
declare
  p public.profiles; perm uuid; granted boolean:=false; resolved_scope text;
  origin text:='access_profile'; reason text; ov record; baseline record;
begin
  select * into p from public.profiles where id=p_subject;
  if not found or not coalesce(p.is_active,true) or coalesce(p.is_disabled,false) then
    reason:='Account unavailable or disabled';
  elsif p.role::text='super_admin' then
    return jsonb_build_object('allowed',true,'source','hard_constraint','scope','global',
      'reason','Protected Super Admin access');
  elsif p.role::text not in ('company_admin','company_superintendent') then
    reason:='Not an Office security class';
  elsif p.company_id is null then
    reason:='Company context is required';
  elsif p_company_id is not null and p.company_id is distinct from p_company_id then
    reason:='Outside assigned company';
  elsif p_vessel_id is not null and not exists(
    select 1 from public.vessels v where v.id=p_vessel_id and v.company_id=p.company_id
      and public.csvb_can_access_vessel(v.id)) then
    reason:='Outside permitted vessel scope';
  elsif p_module in ('SU_ADMIN') then
    reason:='Super Admin-only platform administration';
  elsif p_action not in ('view','edit','export','admin') then
    reason:='Unsupported action; destructive capabilities require explicit administration';
  elsif p_module in ('Q_DASHBOARD','MODE_SELECTION') and p_action='view' then
    return jsonb_build_object('allowed',true,'source','hard_constraint','scope','company',
      'reason','Navigation only; module cards are independently authorized');
  elsif not exists(select 1 from public.app_modules m
    join public.app_permissions a on a.module_id=m.id
    where m.code=p_module and m.is_active and a.action=p_action) then
    reason:='Unknown/inactive module or unsupported action';
  elsif not exists(select 1 from public.company_modules cm
    where cm.company_id=p.company_id
      and cm.module_key=csvb_office_auth_private.company_module_key(p_module)
      and cm.is_enabled) then
    reason:='Module not enabled for assigned company';
  end if;
  if reason is not null then
    return jsonb_build_object('allowed',false,'source','hard_constraint','reason',reason,
      'scope',null);
  end if;
  select a.id into perm from public.app_permissions a
    join public.app_modules m on m.id=a.module_id
    where m.code=p_module and a.action=p_action;
  if p.office_access_profile_code is null then
    select rp.is_granted,rp.scope::text into baseline
    from public.role_permissions rp where rp.role=p.role and rp.permission_id=perm
      and (rp.position is null or rp.position=p.position)
    order by (rp.position is not null) desc,rp.updated_at desc nulls last,rp.id limit 1;
    granted:=coalesce(baseline.is_granted,false);
    resolved_scope:=baseline.scope;
    origin:='legacy_fallback';
  else
    -- Assignment never falls back, including missing/inactive profiles.
    select * into ov from public.csvb_office_user_permission_overrides o
      where o.profile_id=p.id and o.permission_id=perm;
    if found then
      granted:=ov.is_granted;
      resolved_scope:=ov.scope::text;
      origin:=case when granted then 'personal_allow' else 'personal_deny' end;
    else
      select pp.is_granted,pp.scope::text into granted,resolved_scope
        from public.csvb_office_access_profile_permissions pp
        join public.csvb_office_access_profiles ap on ap.code=pp.access_profile_code
        where pp.access_profile_code=p.office_access_profile_code and ap.is_active
          and pp.permission_id=perm;
    end if;
    -- Even personal Allow cannot activate an unavailable profile.
    if not exists(select 1 from public.csvb_office_access_profiles ap
      where ap.code=p.office_access_profile_code and ap.is_active) then
      granted:=false; origin:='hard_constraint'; reason:='Access Profile inactive';
    end if;
  end if;
  -- "global" in a legacy baseline never changes company/vessel tenancy.
  return jsonb_build_object('allowed',coalesce(granted,false),'source',origin,
    'scope',case when resolved_scope='global' then 'company' else resolved_scope end,
    'company_id',p.company_id,
    'access_profile_code',p.office_access_profile_code,'reason',reason);
end $$;

create function public.csvb_office_authorize_module(
  p_module text,p_action text,p_company_id uuid default null,p_vessel_id uuid default null)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
begin
  if not public.csvb_office_authorization_applies() then return true; end if;
  return coalesce((csvb_office_auth_private.decision(
    auth.uid(),p_module,p_action,p_company_id,p_vessel_id)->>'allowed')::boolean,false);
end $$;

-- Diagnostics resolve even while staging, and never expose another user to a
-- normal Office caller. No emails, credentials or Auth metadata are returned.
create function public.csvb_admin_office_permission_diagnostic(p_profile_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
begin
  perform public.csvb_role_catalogue_require_super_admin();
  return jsonb_build_object(
    'enforcement_enabled',(select enforcement_enabled from public.csvb_office_authorization_state),
    'profile_id',p_profile_id,
    'custom_permissions_applied',exists(select 1 from public.csvb_office_user_permission_overrides
      where profile_id=p_profile_id),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object(
      'permission_id',a.id,'module_code',m.code,'module_name',m.name,'action',a.action,
      'decision',csvb_office_auth_private.decision(p_profile_id,m.code,a.action))
      order by m.code,a.action)
      from public.app_modules m join public.app_permissions a on a.module_id=m.id
      where m.is_active),'[]'::jsonb));
end $$;

create function public.csvb_admin_office_access_configuration()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
begin
  perform public.csvb_role_catalogue_require_super_admin();
  return jsonb_build_object(
    'profiles',(select jsonb_agg(to_jsonb(p) order by display_name)
      from public.csvb_office_access_profiles p),
    'permissions',(select jsonb_agg(to_jsonb(p)) from public.app_permissions p),
    'modules',(select jsonb_agg(to_jsonb(m) order by name) from public.app_modules m),
    'grants',coalesce((select jsonb_agg(to_jsonb(g))
      from public.csvb_office_access_profile_permissions g),'[]'::jsonb),
    'enforcement_enabled',(select enforcement_enabled from public.csvb_office_authorization_state));
end $$;

create function public.csvb_admin_office_access_save(
  p_access_profile_code text,p_changes jsonb,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare change jsonb; old_value jsonb; new_value jsonb; perm uuid; sc public.permission_scope;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  if nullif(btrim(p_reason),'') is null then raise exception 'Audit reason required'; end if;
  perform 1 from public.csvb_office_access_profiles where code=p_access_profile_code for update;
  if not found then raise exception 'Access Profile not found'; end if;
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>500 then
    raise exception 'Invalid permission changes';
  end if;
  for change in select value from jsonb_array_elements(p_changes) loop
    perm:=(change->>'permission_id')::uuid;
    if not exists(select 1 from public.app_permissions where id=perm)
      or jsonb_typeof(change->'is_granted') is distinct from 'boolean' then
      raise exception 'Invalid module/action permission';
    end if;
    sc:=coalesce(change->>'scope','company')::public.permission_scope;
    -- Never manufacture platform/global scope for Office profiles.
    if sc::text='global' and (change->>'is_granted')::boolean then
      raise exception 'Office grants must be company/vessel scoped';
    end if;
    if (change->>'is_granted')::boolean and exists(
      select 1 from public.app_permissions a join public.app_modules m on m.id=a.module_id
      where a.id=perm and m.code='SU_ADMIN') then
      raise exception 'Super Admin administration is protected';
    end if;
    select to_jsonb(g) into old_value from public.csvb_office_access_profile_permissions g
      where access_profile_code=p_access_profile_code and permission_id=perm;
    insert into public.csvb_office_access_profile_permissions
      (access_profile_code,permission_id,scope,is_granted)
      values(p_access_profile_code,perm,sc,(change->>'is_granted')::boolean)
      on conflict(access_profile_code,permission_id) do update
        set scope=excluded.scope,is_granted=excluded.is_granted
      returning to_jsonb(csvb_office_access_profile_permissions.*) into new_value;
    if old_value is distinct from new_value then
      insert into public.csvb_office_access_audit(actor_id,operation,permission_id,
        before_value,after_value,reason)
      values(auth.uid(),'profile_permission',perm,old_value,new_value,p_reason);
    end if;
  end loop;
end $$;

create function public.csvb_admin_office_personal_override_save(
  p_profile_id uuid,p_permission_id uuid,p_mode text,p_scope public.permission_scope,
  p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_value jsonb; new_value jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  perform 1 from public.profiles where id=p_profile_id
    and role::text in ('company_admin','company_superintendent')
    and office_access_profile_code is not null for update;
  if not found then raise exception 'Select a migrated Office user'; end if;
  if p_mode not in ('allow','deny','inherit') or nullif(btrim(p_reason),'') is null then
    raise exception 'Choose Allow, Deny or Inherited and provide an audit reason';
  end if;
  if not exists(select 1 from public.app_permissions where id=p_permission_id) then
    raise exception 'Unknown permission';
  end if;
  if p_mode='allow' and (p_scope is null or p_scope::text='global' or exists(
    select 1 from public.app_permissions a join public.app_modules m on m.id=a.module_id
      where a.id=p_permission_id and m.code='SU_ADMIN')) then
    raise exception 'Personal Allow cannot bypass protected system/company constraints';
  end if;
  select to_jsonb(o) into old_value from public.csvb_office_user_permission_overrides o
    where profile_id=p_profile_id and permission_id=p_permission_id;
  if p_mode='inherit' then
    delete from public.csvb_office_user_permission_overrides
      where profile_id=p_profile_id and permission_id=p_permission_id;
  else
    insert into public.csvb_office_user_permission_overrides
      (profile_id,permission_id,scope,is_granted,updated_by)
      values(p_profile_id,p_permission_id,p_scope,p_mode='allow',auth.uid())
      on conflict(profile_id,permission_id) do update set
        scope=excluded.scope,is_granted=excluded.is_granted,
        updated_by=auth.uid(),updated_at=now()
      returning to_jsonb(csvb_office_user_permission_overrides.*) into new_value;
  end if;
  if old_value is distinct from new_value then
    insert into public.csvb_office_access_audit(subject_profile_id,actor_id,operation,
      permission_id,before_value,after_value,reason)
      values(p_profile_id,auth.uid(),'personal_override',p_permission_id,
        old_value,new_value,p_reason);
  end if;
end $$;

revoke all on all functions in schema csvb_office_auth_private from public,anon,authenticated;
revoke all on function public.csvb_office_authorization_applies(),
  public.csvb_office_authorize_module(text,text,uuid,uuid),
  public.csvb_admin_office_permission_diagnostic(uuid),
  public.csvb_admin_office_access_configuration(),
  public.csvb_admin_office_access_save(text,jsonb,text),
  public.csvb_admin_office_personal_override_save(uuid,uuid,text,public.permission_scope,text)
  from public,anon;
grant execute on function public.csvb_office_authorization_applies(),
  public.csvb_office_authorize_module(text,text,uuid,uuid),
  public.csvb_admin_office_permission_diagnostic(uuid),
  public.csvb_admin_office_access_configuration(),
  public.csvb_admin_office_access_save(text,jsonb,text),
  public.csvb_admin_office_personal_override_save(uuid,uuid,text,public.permission_scope,text)
  to authenticated;
notify pgrst,'reload schema';
commit;
