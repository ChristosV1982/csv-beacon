-- supabase/sql/20260527_registered_device_trust_profile_foundation.sql
-- C.S.V. BEACON — Registered Device Trust Profile Foundation
--
-- Purpose:
--   Add admin-approved device trust profile and default offline grant validity.
--
-- Important:
--   This migration does not enable device blocking.
--   This migration does not enable offline sync.
--   This migration does not change auth.js.
--   This migration does not enforce access.
--
-- Design rule:
--   Superintendent field smartphones/tablets are treated as extended-offline field devices,
--   same as vessel onboard devices, when explicitly approved with the correct trust profile.

begin;

alter table public.csvb_registered_devices
  add column if not exists device_trust_profile text not null default 'standard_device',
  add column if not exists offline_grant_validity_days integer not null default 7;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'csvb_registered_devices_trust_profile_check'
  ) then
    alter table public.csvb_registered_devices
      add constraint csvb_registered_devices_trust_profile_check
      check (
        device_trust_profile in (
          'standard_device',
          'vessel_onboard_device',
          'superintendent_field_mobile',
          'superintendent_field_tablet',
          'superintendent_office_laptop',
          'company_admin_device',
          'super_admin_device',
          'third_party_device'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'csvb_registered_devices_offline_days_check'
  ) then
    alter table public.csvb_registered_devices
      add constraint csvb_registered_devices_offline_days_check
      check (offline_grant_validity_days between 0 and 30);
  end if;
end $$;

create or replace function public.csvb_registered_device_default_offline_days(
  p_device_trust_profile text
)
returns integer
language sql
stable
set search_path = public
as $$
  select case trim(coalesce(p_device_trust_profile, 'standard_device'))
    when 'vessel_onboard_device' then 14
    when 'superintendent_field_mobile' then 14
    when 'superintendent_field_tablet' then 14
    when 'superintendent_office_laptop' then 7
    when 'company_admin_device' then 3
    when 'super_admin_device' then 0
    when 'third_party_device' then 3
    else 7
  end;
$$;

update public.csvb_registered_devices
set offline_grant_validity_days =
  public.csvb_registered_device_default_offline_days(device_trust_profile)
where offline_grant_validity_days is null;

create or replace function public.csvb_admin_update_registered_device_trust_profile(
  p_device_id uuid,
  p_device_trust_profile text,
  p_offline_grant_validity_days integer default null,
  p_notes text default null
)
returns table (
  device_id uuid,
  device_public_id text,
  status text,
  device_label text,
  company_id uuid,
  vessel_id uuid,
  device_trust_profile text,
  offline_grant_validity_days integer,
  offline_allowed boolean,
  offline_allowed_modules text[],
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_device record;
  v_profile_value text;
  v_days integer;
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

  v_profile_value := trim(coalesce(p_device_trust_profile, ''));

  if v_profile_value not in (
    'standard_device',
    'vessel_onboard_device',
    'superintendent_field_mobile',
    'superintendent_field_tablet',
    'superintendent_office_laptop',
    'company_admin_device',
    'super_admin_device',
    'third_party_device'
  ) then
    raise exception 'Invalid device_trust_profile: %', p_device_trust_profile;
  end if;

  v_days := coalesce(
    p_offline_grant_validity_days,
    public.csvb_registered_device_default_offline_days(v_profile_value)
  );

  if v_days < 0 or v_days > 30 then
    raise exception 'offline_grant_validity_days must be between 0 and 30';
  end if;

  update public.csvb_registered_devices d
  set
    device_trust_profile = v_profile_value,
    offline_grant_validity_days = v_days,
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), d.notes),
    metadata = coalesce(d.metadata, '{}'::jsonb) || jsonb_build_object(
      'last_trust_profile_update_by', v_profile.user_id::text,
      'last_trust_profile_update_at', now()::text,
      'last_trust_profile', v_profile_value,
      'last_offline_grant_validity_days', v_days
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
    v_device.device_trust_profile,
    v_device.offline_grant_validity_days,
    v_device.offline_allowed,
    v_device.offline_allowed_modules,
    v_device.notes;
end;
$$;

grant execute on function public.csvb_registered_device_default_offline_days(text) to authenticated;
grant execute on function public.csvb_admin_update_registered_device_trust_profile(uuid, text, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
