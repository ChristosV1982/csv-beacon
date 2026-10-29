-- TESTING ONLY. Execute transactionally with an authenticated Super Admin actor.
-- Preserve the existing resolver, scopes, personal exceptions and legacy fallback.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
select public.csvb_role_catalogue_require_super_admin();
lock table public.profiles, public.csvb_office_role_catalogue,
  public.csvb_office_access_profiles, public.csvb_office_access_profile_permissions,
  public.csvb_office_user_permission_overrides, public.company_modules
  in share row exclusive mode;

create table if not exists public.csvb_office_role_permission_bindings (
  role_code text primary key references public.csvb_office_role_catalogue(code) on delete restrict,
  access_profile_code text not null unique references public.csvb_office_access_profiles(code) on delete restrict,
  source_access_profile_code text not null references public.csvb_office_access_profiles(code) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  migrated_at timestamptz not null default now(),
  migrated_by uuid references public.profiles(id) on delete restrict
);
alter table public.csvb_office_role_permission_bindings enable row level security;
revoke all on public.csvb_office_role_permission_bindings from public, anon, authenticated;

-- Capture both effective outcomes and their scopes, including disabled and
-- unmigrated users. A source-label change is allowed; an authorization change is not.
create temporary table csvb_role_baseline on commit drop as
select p.id profile_id, m.code module_code, a.action,
  d->'allowed' allowed, d->'scope' scope, d->'reason' reason
from public.profiles p cross join public.app_permissions a
join public.app_modules m on m.id=a.module_id
cross join lateral (select csvb_office_auth_private.decision(
  p.id,m.code,a.action,p.company_id,null) d) q;

do $bootstrap$
declare r record; new_code text; before_value jsonb;
begin
  -- Do not silently reinterpret custom assignments or an incomplete catalogue.
  if exists (
    select 1 from public.profiles p
    left join public.csvb_office_role_catalogue cat on cat.code=p.office_role_code
    where p.role::text in ('company_admin','company_superintendent')
      and p.office_role_code is not null and
      (cat.code is null or not cat.is_active or not cat.is_assignable
       or p.office_access_profile_code is distinct from cat.default_access_profile_code)
  ) then
    raise exception 'Migration stopped: an Office Role assignment is custom, unavailable or inconsistent. Review it without changing access first.';
  end if;

  for r in
    select c.*,a.legacy_baseline,a.is_active profile_active
    from public.csvb_office_role_catalogue c
    join public.csvb_office_access_profiles a on a.code=c.default_access_profile_code
    where c.is_active and c.is_assignable and not exists (
      select 1 from public.csvb_office_role_permission_bindings b where b.role_code=c.code)
    order by c.code
  loop
    if not r.profile_active then raise exception 'Migration stopped: inactive source profile for %',r.code; end if;
    new_code := 'office_role_'||md5(r.code);
    insert into public.csvb_office_access_profiles(code,display_name,legacy_baseline,is_active)
      values(new_code,r.display_name||' — Role defaults',r.legacy_baseline,true);
    insert into public.csvb_office_access_profile_permissions
      (access_profile_code,permission_id,is_granted,scope)
      select new_code,permission_id,is_granted,scope
      from public.csvb_office_access_profile_permissions
      where access_profile_code=r.default_access_profile_code;
    insert into public.csvb_office_role_permission_bindings
      (role_code,access_profile_code,source_access_profile_code,migrated_by)
      values(r.code,new_code,r.default_access_profile_code,auth.uid());
    before_value:=jsonb_build_object('role_code',r.code,'access_profile_code',r.default_access_profile_code);
    -- Update the catalogue first: the existing account-assignment validator
    -- admits only profiles registered as assignable role defaults.
    update public.csvb_office_role_catalogue
      set default_access_profile_code=new_code,updated_by=auth.uid(),updated_at=now()
      where code=r.code;
    update public.profiles set office_access_profile_code=new_code
      where office_role_code=r.code and office_access_profile_code=r.default_access_profile_code
        and role::text in ('company_admin','company_superintendent');
    insert into public.csvb_office_access_audit(actor_id,operation,before_value,after_value,reason)
      values(auth.uid(),'profile_permission',before_value,
        jsonb_build_object('role_code',r.code,'access_profile_code',new_code),
        'Approved testing migration: isolate identical role defaults; preserve effective access and personal exceptions.');
  end loop;
end $bootstrap$;

-- Add diagnostic provenance without replacing any existing security checks.
do $provenance$
declare definition text; marker text;
begin
  definition:=pg_get_functiondef('csvb_office_auth_private.decision(uuid,text,text,uuid,uuid)'::regprocedure);
  if position('csvb_office_role_permission_bindings' in definition)=0 then
    marker := E'  -- Even personal Allow cannot activate an unavailable profile.';
    if position(marker in definition)=0 then
      raise exception 'Resolver definition changed; review before migrating.';
    end if;
    definition:=replace(definition,marker,
      E'  if origin=''access_profile'' and exists(select 1 from public.csvb_office_role_permission_bindings b\n'||
      E'    where b.role_code=p.office_role_code and b.access_profile_code=p.office_access_profile_code) then\n'||
      E'    origin:=''role_default'';\n  end if;\n'||marker);
    execute definition;
  end if;
end $provenance$;

-- This endpoint is the authoritative role editor contract. Custom assignments
-- remain explicitly identifiable, never silently converted by a role save.
create or replace function public.csvb_admin_office_role_defaults(p_role_code text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare b public.csvb_office_role_permission_bindings; result jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into b from public.csvb_office_role_permission_bindings where role_code=p_role_code;
  if not found then raise exception 'Role defaults are not initialized for this Office Role.'; end if;
  select jsonb_build_object(
    'role_code',b.role_code,'access_profile_code',b.access_profile_code,'revision',b.revision,
    'role_label',r.display_name,'is_active',r.is_active and r.is_assignable and ap.is_active,
    'fingerprint',md5(coalesce((select jsonb_agg(to_jsonb(g) order by g.permission_id)::text
      from public.csvb_office_access_profile_permissions g where g.access_profile_code=b.access_profile_code),'[]')),
    'grants',coalesce((select jsonb_agg(to_jsonb(g)) from public.csvb_office_access_profile_permissions g
      where g.access_profile_code=b.access_profile_code),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'username',p.username,'follows_role',p.office_access_profile_code=b.access_profile_code,
      'active',coalesce(p.is_active,true) and not coalesce(p.is_disabled,false)))
      from public.profiles p where p.office_role_code=b.role_code
        and p.role::text in ('company_admin','company_superintendent')),'[]'::jsonb)
  ) into result from public.csvb_office_role_catalogue r
  join public.csvb_office_access_profiles ap on ap.code=b.access_profile_code where r.code=b.role_code;
  return result;
end $$;

create or replace function public.csvb_admin_office_role_defaults_save(
  p_role_code text,p_changes jsonb,p_expected_revision bigint,
  p_expected_fingerprint text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare b public.csvb_office_role_permission_bindings; snapshot jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into b from public.csvb_office_role_permission_bindings
    where role_code=p_role_code for update;
  if not found then raise exception 'Role defaults not initialized.'; end if;
  perform 1 from public.csvb_office_access_profiles where code=b.access_profile_code for update;
  snapshot:=public.csvb_admin_office_role_defaults(p_role_code);
  if not coalesce((snapshot->>'is_active')::boolean,false) then raise exception 'Role or default configuration is inactive.'; end if;
  if b.revision is distinct from p_expected_revision or
    (snapshot->>'fingerprint') is distinct from p_expected_fingerprint then
    raise exception 'Role defaults changed since loading. Reload before saving.';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)=0 then
    raise exception 'At least one explicit permission change is required.';
  end if;
  -- Reuse all existing audited permission/scope/Super-Admin-only validations.
  perform public.csvb_admin_office_access_save(b.access_profile_code,p_changes,p_reason);
  update public.csvb_office_role_permission_bindings set revision=revision+1 where role_code=p_role_code;
  insert into public.csvb_office_access_audit(actor_id,operation,before_value,after_value,reason)
    values(auth.uid(),'profile_permission',
      jsonb_build_object('role_code',p_role_code,'revision',b.revision),
      jsonb_build_object('role_code',p_role_code,'revision',b.revision+1),p_reason);
  return public.csvb_admin_office_role_defaults(p_role_code);
end $$;
revoke all on function public.csvb_admin_office_role_defaults(text),
  public.csvb_admin_office_role_defaults_save(text,jsonb,bigint,text,text) from public,anon;
grant execute on function public.csvb_admin_office_role_defaults(text),
  public.csvb_admin_office_role_defaults_save(text,jsonb,bigint,text,text) to authenticated;

do $verify$
begin
  if exists (
    select 1 from csvb_role_baseline b
    join public.profiles p on p.id=b.profile_id
    cross join lateral (select csvb_office_auth_private.decision(
      p.id,b.module_code,b.action,p.company_id,null) d) q
    where b.allowed is distinct from d->'allowed'
       or b.scope is distinct from d->'scope'
       or b.reason is distinct from d->'reason'
  ) then
    raise exception 'Migration verification failed: existing runtime permission or scope changed. All changes rolled back.';
  end if;
end $verify$;
notify pgrst,'reload schema';
