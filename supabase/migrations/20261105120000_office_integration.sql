begin;
-- Shared permission predicates retain legacy behavior for non-migrated users.
do $$
declare d text;
begin
  select pg_get_functiondef('public.mai_has_permission(text)'::regprocedure) into d;
  d:=replace(d,'SELECT CASE WHEN', 'SELECT CASE WHEN public.csvb_office_authorization_applies() THEN
    public.csvb_office_authorize_module(''MOORING_ANCHORING_INVENTORIES'',
      CASE split_part(p_perm_key,''.'',2)
        WHEN ''view'' THEN ''view'' WHEN ''export'' THEN ''export''
        WHEN ''edit'' THEN ''edit'' WHEN ''create'' THEN ''edit''
        WHEN ''inspect'' THEN ''edit'' WHEN ''attach'' THEN ''edit'' ELSE ''admin'' END)
    WHEN');
  execute d;
  select pg_get_functiondef('public.pla_current_user_can(text,uuid,uuid)'::regprocedure) into d;
  d:=regexp_replace(d,'\mBEGIN\M',$inject$BEGIN
    IF public.csvb_office_authorization_applies() THEN
      RETURN public.csvb_office_authorize_module('PORTABLE_LIFTING_APPLIANCES_WIRES',
        CASE WHEN p_action IN ('view','edit','export','admin') THEN p_action ELSE 'admin' END,
        p_company_id,p_vessel_id);
    END IF;
$inject$,'i');
  execute d;
  -- These helpers are ordinary edit checks, not platform-administrator identity.
  for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('csvb_can_write_post_inspection','csvb_can_write_questions_editor','csvb_fve_can_edit')
  loop
    d:=regexp_replace(d,'\mBEGIN\M',
      case when d like '%FUNCTION public.csvb_can_write_post_inspection(%' then
        'BEGIN IF public.csvb_office_authorization_applies() THEN RETURN public.csvb_office_authorize_module(''POST_INSPECTION'',''edit''); END IF;'
      when d like '%FUNCTION public.csvb_can_write_questions_editor(%' then
        'BEGIN IF public.csvb_office_authorization_applies() THEN RETURN public.csvb_office_authorize_module(''QUESTIONS_EDITOR'',''edit''); END IF;'
      else 'BEGIN IF public.csvb_office_authorization_applies() THEN RETURN public.csvb_office_authorize_module(''SIRE_FLEET_VETTING_EXPERIENCE'',''edit''); END IF;' end,'i');
    execute d;
  end loop;
end $$;

-- Metadata is authoritative, not a frontend promise or a raw profile-active flag.
create function public.csvb_office_profile_is_enforced(p_profile_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.profiles p
    join public.csvb_office_access_profiles a on a.code=p.office_access_profile_code
    cross join public.csvb_office_authorization_state s
    where p.id=p_profile_id and p.role::text in ('company_admin','company_superintendent')
      and a.is_active and s.enforcement_enabled)
$$;
revoke all on function public.csvb_office_profile_is_enforced(uuid) from public,anon,authenticated;

do $$
declare d text;
begin
  select pg_get_functiondef('public.csvb_admin_list_users_by_company_v2(uuid)'::regprocedure) into d;
  d:=replace(d,'then false else null end',
    'then public.csvb_office_profile_is_enforced(p.id) else null end');
  d:=replace(d,'''office_profile_is_role_default'',',
    '''office_custom_permissions_applied'',exists(select 1 from public.csvb_office_user_permission_overrides po where po.profile_id=p.id),
     ''office_profile_is_role_default'',');
  execute d;
  select pg_get_functiondef('public.csvb_admin_office_user_options(uuid)'::regprocedure) into d;
  d:=replace(d,'''permission_enforcement_active'',false',
    '''permission_enforcement_active'',public.csvb_office_profile_is_enforced(p_profile_id)');
  d:=replace(d,'''Office Role and Access Profile are saved as prepared assignments. Current legacy permissions remain in effect until the Office authorization resolver is activated. A view-only profile does not yet restrict access.''',
    'case when public.csvb_office_profile_is_enforced(p_profile_id) then
       ''Access Profile permissions are enforced. Personal Deny, then Allow, then profile apply within protected company/vessel scope.''
     else ''No enforced Access Profile assignment. Legacy behavior remains until deliberately migrated.'' end');
  execute d;
  select pg_get_functiondef('public.csvb_admin_office_creation_options()'::regprocedure) into d;
  d:=replace(d,'a.legacy_baseline is null',
    'not (a.is_active and (select enforcement_enabled from public.csvb_office_authorization_state))');
  d:=replace(d,'''permission_enforcement_active'',false',
    '''permission_enforcement_active'',(select enforcement_enabled from public.csvb_office_authorization_state)');
  execute d;
  select pg_get_functiondef('public.csvb_admin_office_creation_prepare(uuid,text,uuid,text,text,text,text,text,boolean)'::regprocedure) into d;
  -- Retain the compatible legacy security class, but never substitute its
  -- permissions when an Access Profile has been assigned.
  d:=replace(d,'''company_superintendent''::public.app_role),a.legacy_baseline is null,details)',
    '''company_superintendent''::public.app_role),
       not (a.is_active and (select enforcement_enabled from public.csvb_office_authorization_state)),details)');
  execute d;
end $$;

-- Permit extra diagnostics fields only through the existing Super Admin endpoint.
create or replace function public.csvb_admin_office_permission_diagnostic(p_profile_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,csvb_office_auth_private as $$
begin
  perform public.csvb_role_catalogue_require_super_admin();
  return jsonb_build_object(
    'enforcement_enabled',public.csvb_office_profile_is_enforced(p_profile_id),
    'profile_id',p_profile_id,
    'custom_permissions_applied',exists(select 1 from public.csvb_office_user_permission_overrides
      where profile_id=p_profile_id),
    'overrides',coalesce((select jsonb_agg(to_jsonb(o)) from public.csvb_office_user_permission_overrides o
      where profile_id=p_profile_id),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object(
      'permission_id',a.id,'module_code',m.code,'module_name',m.name,'action',a.action,
      'decision',csvb_office_auth_private.decision(p_profile_id,m.code,a.action))
      order by m.code,a.action)
      from public.app_modules m join public.app_permissions a on a.module_id=m.id
      where m.is_active),'[]'::jsonb));
end $$;
notify pgrst,'reload schema';
commit;
