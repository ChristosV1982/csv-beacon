-- supabase/sql/20260526_registered_device_foundation_d1_hotfix_01.sql
-- C.S.V. BEACON — D1 Registered Device Foundation Hotfix 01
-- Fixes: column reference "device_public_id" is ambiguous
-- Cause: PL/pgSQL OUT parameter name conflicts with the ON CONFLICT column reference.
-- Action: replace csvb_request_device_registration() using ON CONFLICT ON CONSTRAINT.

begin;

create or replace function public.csvb_request_device_registration(
  p_device_public_id text,
  p_device_label text default null,
  p_device_type text default 'unknown',
  p_platform text default null,
  p_user_agent_summary text default null,
  p_browser_language text default null,
  p_screen_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  device_id uuid,
  device_public_id text,
  status text,
  device_label text,
  device_type text,
  platform text,
  company_id uuid,
  vessel_id uuid,
  offline_allowed boolean,
  offline_allowed_modules text[],
  requested_at timestamptz,
  approved_at timestamptz,
  last_seen_at timestamptz,
  access_allowed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_device record;
  v_device_type text;
  v_platform_admin boolean;
  v_device_public_id text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_device_public_id := trim(coalesce(p_device_public_id, ''));

  if length(v_device_public_id) < 12 then
    raise exception 'Invalid device_public_id';
  end if;

  select * into v_profile
  from public.csvb_device_current_profile()
  limit 1;

  if v_profile.user_id is null then
    raise exception 'Profile not found for current user';
  end if;

  v_platform_admin := v_profile.role in ('super_admin','platform_owner');

  v_device_type := coalesce(nullif(trim(p_device_type), ''), 'unknown');
  if v_device_type not in ('desktop','laptop','tablet','smartphone','shared_workstation','unknown') then
    v_device_type := 'unknown';
  end if;

  insert into public.csvb_registered_devices (
    device_public_id,
    device_label,
    device_type,
    platform,
    user_agent_summary,
    browser_language,
    screen_summary,
    company_id,
    vessel_id,
    requested_by,
    last_user_id,
    last_seen_at,
    metadata
  ) values (
    v_device_public_id,
    nullif(trim(coalesce(p_device_label, '')), ''),
    v_device_type,
    nullif(trim(coalesce(p_platform, '')), ''),
    left(coalesce(p_user_agent_summary, ''), 500),
    nullif(trim(coalesce(p_browser_language, '')), ''),
    nullif(trim(coalesce(p_screen_summary, '')), ''),
    case when v_platform_admin then null else v_profile.company_id end,
    v_profile.vessel_id,
    v_profile.user_id,
    v_profile.user_id,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict on constraint csvb_registered_devices_device_public_id_key do update set
    device_label = coalesce(nullif(trim(coalesce(excluded.device_label, '')), ''), public.csvb_registered_devices.device_label),
    device_type = excluded.device_type,
    platform = coalesce(excluded.platform, public.csvb_registered_devices.platform),
    user_agent_summary = excluded.user_agent_summary,
    browser_language = excluded.browser_language,
    screen_summary = excluded.screen_summary,
    last_user_id = excluded.last_user_id,
    last_seen_at = now(),
    metadata = public.csvb_registered_devices.metadata || coalesce(excluded.metadata, '{}'::jsonb)
  returning * into v_device;

  return query
  select
    v_device.id::uuid,
    v_device.device_public_id::text,
    v_device.status::text,
    v_device.device_label::text,
    v_device.device_type::text,
    v_device.platform::text,
    v_device.company_id::uuid,
    v_device.vessel_id::uuid,
    v_device.offline_allowed::boolean,
    v_device.offline_allowed_modules::text[],
    v_device.requested_at::timestamptz,
    v_device.approved_at::timestamptz,
    v_device.last_seen_at::timestamptz,
    (
      v_device.status = 'approved'
      and (
        v_platform_admin
        or v_device.company_id is null
        or v_device.company_id = v_profile.company_id
      )
    )::boolean as access_allowed;
end;
$$;

grant execute on function public.csvb_request_device_registration(text, text, text, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
