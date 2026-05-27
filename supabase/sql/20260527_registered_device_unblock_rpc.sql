-- supabase/sql/20260527_registered_device_unblock_rpc.sql
-- C.S.V. BEACON — Registered Device Unblock RPC
--
-- Purpose:
--   Add an explicit reversible action for devices that were temporarily blocked.
--
-- Rules:
--   - Only status = 'blocked' can be unblocked by this function.
--   - status = 'revoked' cannot be unblocked; a new registration is required.
--   - Unblock restores online approval only.
--   - Offline access remains disabled until explicitly approved again.
--   - Device gate remains unchanged / safe mode.

begin;

create or replace function public.csvb_admin_unblock_registered_device(
  p_device_id uuid,
  p_notes text default null
)
returns table (
  device_id uuid,
  device_public_id text,
  status text,
  device_label text,
  company_id uuid,
  vessel_id uuid,
  offline_allowed boolean,
  offline_allowed_modules text[],
  notes text,
  approved_at timestamptz,
  blocked_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_device record;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_profile
  from public.csvb_device_current_profile()
  limit 1;

  if v_profile.user_id is null then
    raise exception 'Profile not found for current user';
  end if;

  select * into v_device
  from public.csvb_registered_devices d
  where d.id = p_device_id
  limit 1;

  if v_device.id is null then
    raise exception 'Device not found';
  end if;

  if not public.csvb_device_can_admin_company(v_device.company_id) then
    raise exception 'Access denied';
  end if;

  if v_device.status = 'revoked' then
    raise exception 'Revoked devices cannot be unblocked. The device must request a new registration.';
  end if;

  if v_device.status <> 'blocked' then
    raise exception 'Only blocked devices can be unblocked. Current status: %', v_device.status;
  end if;

  v_note := coalesce(
    nullif(trim(coalesce(p_notes, '')), ''),
    'Unblocked by administrator. Offline access remains disabled until explicitly approved again.'
  );

  update public.csvb_registered_devices d
  set
    status = 'approved',
    offline_allowed = false,
    offline_allowed_modules = array[]::text[],
    notes = v_note,
    approved_by = v_profile.user_id,
    approved_at = now(),
    metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'last_unblocked_by', v_profile.user_id::text,
      'last_unblocked_at', now()::text,
      'last_unblock_notes', v_note
    )
  where d.id = p_device_id
  returning * into v_device;

  return query
  select
    v_device.id,
    v_device.device_public_id,
    v_device.status,
    v_device.device_label,
    v_device.company_id,
    v_device.vessel_id,
    v_device.offline_allowed,
    v_device.offline_allowed_modules,
    v_device.notes,
    v_device.approved_at,
    v_device.blocked_at,
    v_device.revoked_at;
end;
$$;

grant execute on function public.csvb_admin_unblock_registered_device(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
