-- supabase/sql/20260528_device_offline_grant_lifecycle_rpc_array_append_fix.sql
-- C.S.V. BEACON — Fix Registered Device Offline Grant Lifecycle RPC
--
-- Purpose:
--   Correct the previous csvb_admin_revoke_latest_device_offline_grant() function.
--
-- Reason:
--   The previous function used:
--     v_set := v_set || 'revoked_at = now()';
--
--   PostgreSQL may interpret that as array concatenation and raise:
--     malformed array literal: "revoked_at = now()"
--
-- Fix:
--   Use array_append(v_set, '...') for every dynamic SET clause.
--
-- Important:
--   - Does not enable global device-gate enforcement.
--   - Does not change auth.js.
--   - Does not change offline package download logic.
--   - Only replaces the admin revoke-latest-offline-grant RPC.

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

  v_table regclass := 'public.csvb_device_offline_grants'::regclass;
  v_key_col text;
  v_grant_id uuid;
  v_module_code text := coalesce(nullif(trim(p_module_code), ''), 'SIRE_QUESTIONS_VIEWER');

  v_set text[] := array[]::text[];
  v_sql text;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');

  v_has_id boolean;
  v_has_grant_id boolean;
  v_has_revoked_at boolean;
  v_has_revoked_by boolean;
  v_has_revoked_reason boolean;
  v_has_notes boolean;
  v_has_updated_at boolean;
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
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'id'
  ) into v_has_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'grant_id'
  ) into v_has_grant_id;

  if v_has_id then
    v_key_col := 'id';
  elsif v_has_grant_id then
    v_key_col := 'grant_id';
  else
    raise exception 'csvb_device_offline_grants must have either id or grant_id column.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'revoked_at'
  ) into v_has_revoked_at;

  if not v_has_revoked_at then
    raise exception 'csvb_device_offline_grants.revoked_at column is required for grant revocation.';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'revoked_by'
  ) into v_has_revoked_by;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'revoked_reason'
  ) into v_has_revoked_reason;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'notes'
  ) into v_has_notes;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'csvb_device_offline_grants'
      and column_name = 'updated_at'
  ) into v_has_updated_at;

  v_sql := format(
    'select %I::uuid
       from %s
      where device_id = $1
        and upper(module_code) = upper($2)
        and revoked_at is null
        and (expires_at is null or expires_at > now())
      order by expires_at desc nulls first, issued_at desc nulls last
      limit 1',
    v_key_col,
    v_table
  );

  execute v_sql
    into v_grant_id
    using p_device_id, v_module_code;

  if v_grant_id is null then
    return jsonb_build_object(
      'revoked', false,
      'reason', 'no_active_grant',
      'device_id', p_device_id,
      'module_code', v_module_code
    );
  end if;

  v_set := array_append(v_set, 'revoked_at = now()');

  if v_has_revoked_by then
    v_set := array_append(v_set, 'revoked_by = $2');
  end if;

  if v_has_revoked_reason then
    v_set := array_append(v_set, 'revoked_reason = coalesce($3, ''Revoked by administrator.'')');
  end if;

  if v_has_notes then
    v_set := array_append(v_set, 'notes = coalesce($3, notes)');
  end if;

  if v_has_updated_at then
    v_set := array_append(v_set, 'updated_at = now()');
  end if;

  v_sql := format(
    'update %s set %s where %I = $1',
    v_table,
    array_to_string(v_set, ', '),
    v_key_col
  );

  execute v_sql
    using v_grant_id, v_actor, v_notes;

  return jsonb_build_object(
    'revoked', true,
    'grant_id', v_grant_id,
    'device_id', p_device_id,
    'module_code', v_module_code,
    'revoked_at', now()
  );
end;
$$;

grant execute on function public.csvb_admin_revoke_latest_device_offline_grant(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
