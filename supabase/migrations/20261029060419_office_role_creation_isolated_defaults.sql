-- PREPARED ONLY: do not apply/register as part of the workspace repair.
-- Requires the already-applied isolated defaults, Office creation/resolver and
-- M02 Office View migrations. Other historical filenames are out of date order;
-- this file does not make a fresh directory replay safe.
-- Installation changes functions only: no backfill, reassignment or grant seed.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Fail closed on source drift instead of wrapping an unknown authorization API.
do $preflight$
begin
  if to_regprocedure('csvb_office_auth_private.csvb_role_catalogue_change(text,text,text)') is not null
     or to_regprocedure('csvb_office_auth_private.csvb_role_catalogue_list()') is not null then
    raise exception 'Catalogue compatibility wrappers already exist; do not reapply.';
  end if;
  if (select md5(prosrc) from pg_proc where oid=
      'public.csvb_role_catalogue_change(text,text,text)'::regprocedure)
      is distinct from 'c5f45a4fd8d91388f9e2706c40fb58f8'
     or (select md5(prosrc) from pg_proc where oid=
      'public.csvb_admin_office_role_defaults(text)'::regprocedure)
      is distinct from '7501d81b52facba80e0aa988ad651bf2'
     or (select md5(prosrc) from pg_proc where oid=
      'public.csvb_role_catalogue_require_super_admin()'::regprocedure)
      is distinct from 'c387fade2e4458527d9b019e3e0b023e' then
    raise exception 'Office catalogue/defaults source differs from the reviewed contract.';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','csvb_office_auth_private')
        and p.oid<>'public.csvb_role_catalogue_change(text,text,text)'::regprocedure
        and position('csvb_role_catalogue_change' in p.prosrc)>0) then
    raise exception 'Unreviewed database catalogue callers exist; review before wrapping.';
  end if;
  if to_regclass('public.csvb_office_role_permission_bindings') is null
     or to_regclass('public.csvb_office_account_creation_requests') is null then
    raise exception 'Applied Office isolation and account-creation prerequisites required.';
  end if;
  if (select count(*) from public.app_permissions p join public.app_modules m on m.id=p.module_id
      where m.code='M02_SHIP_INSPECTION_REPORT' and p.action='view') <> 1 then
    raise exception 'The approved M02 Office View permission must be registered uniquely.';
  end if;
end $preflight$;

-- Retain the complete existing validation, protected identities and audit logic.
-- These implementation functions cease to be callable browser RPCs.
alter function public.csvb_role_catalogue_change(text,text,text)
  set schema csvb_office_auth_private;
alter function public.csvb_role_catalogue_list()
  set schema csvb_office_auth_private;
revoke all on function csvb_office_auth_private.csvb_role_catalogue_change(text,text,text),
  csvb_office_auth_private.csvb_role_catalogue_list() from public,anon,authenticated;

create function csvb_office_auth_private.initialize_role_defaults(p_code text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.csvb_office_role_catalogue; ap text; initialized jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into strict r from public.csvb_office_role_catalogue where code=p_code for update;
  if r.ever_used or r.is_assignable or r.default_access_profile_code is not null
     or exists(select 1 from public.csvb_office_role_permission_bindings where role_code=p_code) then
    raise exception 'Only a new, unassigned draft may initialize isolated defaults.';
  end if;
  if (select count(*) from public.app_permissions p join public.app_modules m on m.id=p.module_id
      where m.code='M02_SHIP_INSPECTION_REPORT' and p.action='view' and m.is_active) <> 1 then
    raise exception 'Approved M02 Office View baseline is unavailable; no role was created.';
  end if;
  ap := 'office_role_'||md5(r.code);
  insert into public.csvb_office_access_profiles(code,display_name,legacy_baseline,is_active)
    -- Full stable identity makes vacated labels reusable after a rename.
    values(ap,r.display_name||' — Role defaults ['||r.code||']',null,true);
  -- No job-title inference or broad shared-profile copy.
  -- New roles: deny by default (draft catalogue policy, 20261030140000).
  -- Sole initial grant: M02 View for all Office users (20261108120000).
  insert into public.csvb_office_access_profile_permissions
    (access_profile_code,permission_id,scope,is_granted)
    select ap,p.id,'company'::public.permission_scope,
      (m.code='M02_SHIP_INSPECTION_REPORT' and p.action='view' and m.is_active)
    from public.app_permissions p join public.app_modules m on m.id=p.module_id;
  -- Self-source identifies a newly initialized policy, not a copied shared
  -- baseline. The original 16 bindings/source references are never rewritten.
  insert into public.csvb_office_role_permission_bindings
    (role_code,access_profile_code,source_access_profile_code,migrated_by)
    values(r.code,ap,ap,auth.uid());
  update public.csvb_office_role_catalogue
    set default_access_profile_code=ap,updated_by=auth.uid(),updated_at=now()
    where code=r.code returning to_jsonb(csvb_office_role_catalogue.*) into initialized;
  insert into public.csvb_office_access_audit(actor_id,operation,after_value,reason)
    values(auth.uid(),'profile_permission',
      jsonb_build_object('role_code',r.code,'access_profile_code',ap,
        'policy','deny_by_default_plus_approved_m02_office_view','assignable',false),
      'Initialize new isolated Office Role defaults; no existing role or user changed.');
  insert into public.csvb_role_catalogue_audit
    (role_code,display_name,action,actor_id,actor_username,before_data,after_data)
    select r.code,r.display_name,'configure',auth.uid(),p.username,to_jsonb(r),initialized
      from public.profiles p where p.id=auth.uid();
end $$;
revoke all on function csvb_office_auth_private.initialize_role_defaults(text)
  from public,anon,authenticated;

create function public.csvb_role_catalogue_change(
  p_action text,p_role_code text default null,p_display_name text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb; r public.csvb_office_role_catalogue;
  b public.csvb_office_role_permission_bindings; dependencies jsonb; removed jsonb;
  profile_before jsonb; profile_after jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  if p_action='create' then
    result := csvb_office_auth_private.csvb_role_catalogue_change(p_action,p_role_code,p_display_name);
    perform csvb_office_auth_private.initialize_role_defaults(result->>'code');
    return result || jsonb_build_object('isolated_defaults_initialized',true,'is_assignable',false);
  end if;
  if p_action='rename' then
    -- Assignment can hold a profile row before updating the catalogue; saves
    -- hold binding/profile rows first. Never wait on that inverse row order.
    select * into r from public.csvb_office_role_catalogue where code=p_role_code for update nowait;
    select * into b from public.csvb_office_role_permission_bindings where role_code=p_role_code for update nowait;
    if found and b.source_access_profile_code=b.access_profile_code
       and b.access_profile_code='office_role_'||md5(r.code)
       and r.default_access_profile_code=b.access_profile_code then
      select to_jsonb(a) into strict profile_before from public.csvb_office_access_profiles a
        where a.code=b.access_profile_code for update of a nowait;
    end if;
    -- Keep the original reserved-label validation and role rename audit.
    result := csvb_office_auth_private.csvb_role_catalogue_change(p_action,p_role_code,p_display_name);
    if profile_before is not null then
      select * into strict r from public.csvb_office_role_catalogue where code=p_role_code;
      update public.csvb_office_access_profiles
        set display_name=r.display_name||' — Role defaults ['||r.code||']',updated_at=now()
        where code=b.access_profile_code
        returning to_jsonb(csvb_office_access_profiles.*) into profile_after;
      insert into public.csvb_office_access_audit(actor_id,operation,before_value,after_value,reason)
        values(auth.uid(),'profile_permission',
          jsonb_build_object('role_code',r.code,'profile',profile_before),
          jsonb_build_object('role_code',r.code,'profile',profile_after),
          'Rename new role-owned profile label only; permission values, status and stable references unchanged.');
    end if;
    return result;
  end if;
  if p_action='delete' then
    -- Keep serialization against assignment/creation and all legacy dependency
    -- writers, but NEVER wait while holding these table locks. In particular,
    -- a save can already hold binding/AP rows and need RowExclusive table locks.
    lock table public.profiles,public.csvb_office_account_creation_requests,
      public.csvb_office_role_catalogue,public.csvb_office_role_permission_bindings,
      public.csvb_office_access_profiles,public.csvb_office_access_profile_permissions
      in share row exclusive mode nowait;
    -- Pre-acquire every additional table lock used by the unchanged legacy
    -- delete before taking rows. Its later reentrant lock requests cannot wait.
    lock table public.role_permissions,public.app_role_permissions,
      public.role_permission_change_log,public.profile_roles_cache,public.app_roles
      in share mode nowait;
    select * into r from public.csvb_office_role_catalogue where code=p_role_code for update nowait;
    select * into b from public.csvb_office_role_permission_bindings where role_code=p_role_code for update nowait;
    if found then
      perform 1 from public.csvb_office_access_profiles
        where code=b.access_profile_code for update nowait;
      perform 1 from public.csvb_office_access_profile_permissions
        where access_profile_code=b.access_profile_code order by permission_id for update nowait;
      dependencies := public.csvb_role_catalogue_dependencies(p_role_code);
      if r.ever_used or (dependencies->>'assigned_user_count')::bigint>0
         or (dependencies->>'permission_reference_count')::bigint>0
         or exists(select 1 from public.csvb_office_account_creation_requests
           where office_role_code=r.code or access_profile_code=b.access_profile_code) then
        raise exception 'Cannot delete: account or audit dependencies exist. Deactivate this role instead.';
      end if;
      if b.source_access_profile_code<>b.access_profile_code
         or b.access_profile_code<>'office_role_'||md5(r.code)
         or r.default_access_profile_code is distinct from b.access_profile_code then
        raise exception 'Existing migrated/shared defaults are protected; deactivate instead of deleting.';
      end if;
      if exists(select 1 from public.profiles where office_access_profile_code=b.access_profile_code)
         or exists(select 1 from public.csvb_office_role_catalogue
           where code<>r.code and default_access_profile_code=b.access_profile_code)
         or exists(select 1 from public.csvb_office_role_permission_bindings
           where role_code<>r.code and (access_profile_code=b.access_profile_code
             or source_access_profile_code=b.access_profile_code)) then
        raise exception 'Cannot delete: another identity references these defaults. Deactivate instead.';
      end if;
      select jsonb_build_object('binding',to_jsonb(b),'profile',to_jsonb(a),'permissions',
        coalesce((select jsonb_agg(to_jsonb(g) order by g.permission_id)
          from public.csvb_office_access_profile_permissions g
          where g.access_profile_code=b.access_profile_code),'[]'::jsonb))
        into removed from public.csvb_office_access_profiles a where a.code=b.access_profile_code;
      delete from public.csvb_office_role_permission_bindings where role_code=r.code;
      update public.csvb_office_role_catalogue set default_access_profile_code=null where code=r.code;
      delete from public.csvb_office_access_profile_permissions where access_profile_code=b.access_profile_code;
      delete from public.csvb_office_access_profiles where code=b.access_profile_code;
    end if;
  end if;
  -- Activate/deactivate remain catalogue-only: no assigned-user grant,
  -- account-status, revision, scope or personal-override change.
  result := csvb_office_auth_private.csvb_role_catalogue_change(p_action,p_role_code,p_display_name);
  if removed is not null then
    insert into public.csvb_office_access_audit(actor_id,operation,before_value,reason)
      values(auth.uid(),'profile_permission',removed,
        'Delete never-used Office Role and exclusively owned defaults; retain complete audit history.');
  end if;
  return result;
exception when lock_not_available then
  raise exception 'Role or permission records are busy. No changes saved. Reload and retry.'
    using errcode='55P03';
when foreign_key_violation then
  raise exception 'Cannot delete/change role: protected references remain. No changes saved; deactivate instead.';
end $$;

-- Keep the audited save RPC and its revision/fingerprint checks unchanged.
-- Draft initialization and assignment eligibility are deliberately independent.
do $draft_editor$
declare d text; marker text := '''is_active'',r.is_active and r.is_assignable and ap.is_active,';
begin
  d := pg_get_functiondef('public.csvb_admin_office_role_defaults(text)'::regprocedure);
  if position(marker in d)=0 then raise exception 'Unknown role-default read contract'; end if;
  d := replace(d,marker,
    '''is_active'',r.is_active and ap.is_active,''is_assignable'',r.is_assignable,');
  -- Include explicit custom borrowers in the affected-user confirmation too.
  -- Their organizational role is not changed, but this profile governs them.
  execute replace(d,
    'from public.profiles p where p.office_role_code=b.role_code',
    'from public.profiles p where (p.office_role_code=b.role_code or p.office_access_profile_code=b.access_profile_code)');
end $draft_editor$;

create function public.csvb_admin_office_role_enable_assignment(
  p_role_code text,p_expected_revision bigint,p_expected_fingerprint text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.csvb_office_role_catalogue; b public.csvb_office_role_permission_bindings;
  snapshot jsonb; updated jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  if nullif(btrim(p_reason),'') is null then raise exception 'Audit reason required'; end if;
  select * into strict r from public.csvb_office_role_catalogue where code=p_role_code for update;
  select * into strict b from public.csvb_office_role_permission_bindings where role_code=r.code for update;
  perform 1 from public.csvb_office_access_profiles where code=b.access_profile_code for update;
  snapshot := public.csvb_admin_office_role_defaults(r.code);
  if b.revision is distinct from p_expected_revision or
     (snapshot->>'fingerprint') is distinct from p_expected_fingerprint then
    raise exception 'Role defaults changed. Review and reload before enabling assignment.';
  end if;
  if not coalesce((snapshot->>'is_active')::boolean,false)
     or b.source_access_profile_code<>b.access_profile_code
     or r.default_access_profile_code is distinct from b.access_profile_code then
    raise exception 'An active, newly initialized isolated role is required.';
  end if;
  if not exists(select 1 from public.csvb_office_authorization_state where enforcement_enabled) then
    raise exception 'Office authorization must be enforced before enabling new role assignment.';
  end if;
  if exists(select 1 from public.csvb_office_access_profiles
      where code=b.access_profile_code and legacy_baseline is not null)
     or exists(select 1 from public.csvb_office_access_profile_permissions g
       join public.app_permissions p on p.id=g.permission_id
       join public.app_modules m on m.id=p.module_id
       where g.access_profile_code=b.access_profile_code and g.is_granted
         and (g.scope::text='global' or m.code='SU_ADMIN' or not m.is_active)) then
    raise exception 'Role defaults violate the Office security boundary.';
  end if;
  if not r.is_assignable then
    update public.csvb_office_role_catalogue
      set is_assignable=true,updated_by=auth.uid(),updated_at=now()
      where code=r.code returning to_jsonb(csvb_office_role_catalogue.*) into updated;
    insert into public.csvb_role_catalogue_audit
      (role_code,display_name,action,actor_id,actor_username,before_data,after_data)
      select r.code,r.display_name,'configure',auth.uid(),p.username,to_jsonb(r),
        updated||jsonb_build_object('assignment_reason',p_reason,
          'confirmed_revision',b.revision,'confirmed_fingerprint',p_expected_fingerprint)
        from public.profiles p where p.id=auth.uid();
  end if;
  return public.csvb_admin_office_role_defaults(r.code);
end $$;

create function public.csvb_role_catalogue_list()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; entries jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  result := csvb_office_auth_private.csvb_role_catalogue_list();
  select coalesce(jsonb_agg(e.value || jsonb_build_object(
    'has_isolated_defaults',b.role_code is not null,
    'can_enable_assignment',coalesce(b.source_access_profile_code=b.access_profile_code
      and c.is_active and not c.is_assignable,false),
    'deletion_block_reason',case when b.source_access_profile_code<>b.access_profile_code
      then 'Applied migrated defaults are protected. Deactivate instead.'
      else null end,
    'status',case when b.source_access_profile_code=b.access_profile_code
      then case when c.is_assignable then 'Assignable / Isolated role defaults'
        else 'Draft / Isolated defaults ready / Not yet assignable' end
      else e.value->>'status' end) order by e.ordinality),'[]'::jsonb)
    into entries from jsonb_array_elements(result->'roles') with ordinality e(value,ordinality)
    left join public.csvb_office_role_catalogue c on c.code=e.value->>'code'
    left join public.csvb_office_role_permission_bindings b on b.role_code=c.code;
  return result || jsonb_build_object('roles',entries,'isolated_role_initialization',1);
end $$;

revoke all on function public.csvb_role_catalogue_change(text,text,text),
  public.csvb_role_catalogue_list(),
  public.csvb_admin_office_role_enable_assignment(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.csvb_role_catalogue_change(text,text,text),
  public.csvb_role_catalogue_list(),
  public.csvb_admin_office_role_enable_assignment(text,bigint,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
