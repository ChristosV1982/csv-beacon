-- supabase/sql/20260528_device_offline_grant_lifecycle_rpc.sql
-- C.S.V. BEACON — Registered Device Offline Grant Lifecycle RPC
--
-- Purpose:
--   Add an admin RPC to revoke the latest active offline grant for a registered device/module.
--
-- Important:
--   - Does not enable global device-gate enforcement.
--   - Does not change auth.js.
--   - Does not change offline package download logic directly.
--   - Intended for Registered Devices admin lifecycle controls.
--
-- Notes:
--   This function is defensive about optional audit columns. It updates revoked_at
--   as the authoritative revocation marker and updates revoked_by / revoked_reason /
--   notes / updated_at only when those columns exist.

begin;

create or replace function public.csvb_admin_revoke_latest_device_offline_grant(
  p_device_id uuid,
  p_module_code text default 'SIRE_QUESTIONS_VIEWER',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_actor_company_id uuid;
  v_device record;
  v_grant record;
  v_table regclass := 'public.csvb_device_offline_grants'::regclass;
  v_set text[] := array[]::text[];
  v_sql text;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');

  function_has_revoked_at boolean;
  function_has_revoked_by boolean;
  function_has_revoked_reason boolean;
  function_has_notes boolean;
  function_has_updated_at boolean;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select p.role::text, p.company_id
    into v_role, v_actor_company_id
  from public.profiles p
  where p.id = v_actor;

  if v_role is null then
    raise exception 'Profile not found for current user.';
  end if;

  if v_role not in ('super_admin', 'platform_owner', 'company_admin') then
    raise exception 'Not authorized to revoke device offline grants.';
  end if;

  select d.*
    into v_device
  from public.csvb_registered_devices d
  where d.id = p_device_id;

  if not found then
    raise exception 'Registered device not found.';
  end if;

  if v_role = 'company_admin'
     and coalesce(v_device.company_id::text, '') <> coalesce(v_actor_company_id::text, '') then
    raise exception 'Company administrator cannot revoke grants for a device outside own company.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'revoked_at'
  ) into function_has_revoked_at;

  if not function_has_revoked_at then
    raise exception 'csvb_device_offline_grants.revoked_at column is required for grant lifecycle revocation.';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'revoked_by'
  ) into function_has_revoked_by;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'revoked_reason'
  ) into function_has_revoked_reason;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'notes'
  ) into function_has_notes;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'updated_at'
  ) into function_has_updated_at;

  execute format(
    'select * from %s
      where device_id = $1
        and upper(module_code) = upper($2)
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      order by expires_at desc nulls first, issued_at desc nulls last
      limit 1',
    v_table
  )
  into v_grant
  using p_device_id, coalesce(nullif(trim(p_module_code), ''), 'SIRE_QUESTIONS_VIEWER');

  if v_grant is null then
    return jsonb_build_object(
      'revoked', false,
      'reason', 'no_active_grant',
      'device_id', p_device_id,
      'module_code', coalesce(nullif(trim(p_module_code), ''), 'SIRE_QUESTIONS_VIEWER')
    );
  end if;

  v_set := v_set || 'revoked_at = now()';

  if function_has_revoked_by then
    v_set := v_set || 'revoked_by = $2';
  end if;

  if function_has_revoked_reason then
    v_set := v_set || 'revoked_reason = coalesce($3, ''Revoked by administrator.'')';
  end if;

  if function_has_notes then
    v_set := v_set || 'notes = coalesce($3, notes)';
  end if;

  if function_has_updated_at then
    v_set := v_set || 'updated_at = now()';
  end if;

  v_sql := format('update %s set %s where id = $1', v_table, array_to_string(v_set, ', '));

  execute v_sql using v_grant.id, v_actor, v_notes;

  return jsonb_build_object(
    'revoked', true,
    'grant_id', v_grant.id,
    'device_id', p_device_id,
    'module_code', coalesce(nullif(trim(p_module_code), ''), 'SIRE_QUESTIONS_VIEWER'),
    'revoked_at', now()
  );
end;
$$;

grant execute on function public.csvb_admin_revoke_latest_device_offline_grant(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
