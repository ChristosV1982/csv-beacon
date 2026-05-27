-- supabase/sql/20260527_registered_device_list_trust_profile_fields.sql
-- C.S.V. BEACON — Registered Device list RPC trust-profile fields
--
-- Purpose:
--   Extend csvb_admin_list_registered_devices() to return:
--   - device_trust_profile
--   - offline_grant_validity_days
--
-- Important:
--   This does not enforce device blocking.
--   This does not change auth.js.
--   This does not change device gate behavior.
--   This is display/listing foundation only.

begin;

drop function if exists public.csvb_admin_list_registered_devices(text, uuid);

create or replace function public.csvb_admin_list_registered_devices(
  p_status text default null,
  p_company_id uuid default null
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
  requested_by uuid,
  requested_by_username text,
  approved_by uuid,
  approved_by_username text,
  requested_at timestamptz,
  approved_at timestamptz,
  last_user_id uuid,
  last_user_username text,
  last_seen_at timestamptz,
  offline_allowed boolean,
  offline_allowed_modules text[],
  device_trust_profile text,
  offline_grant_validity_days integer,
  notes text,
  user_agent_summary text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_platform_admin boolean;
  v_company_scope uuid;
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

  v_platform_admin := v_profile.role in ('super_admin','platform_owner');

  if not v_platform_admin and v_profile.role <> 'company_admin' then
    raise exception 'Access denied';
  end if;

  v_company_scope := case
    when v_platform_admin then p_company_id
    else v_profile.company_id
  end;

  return query
  select
    d.id,
    d.device_public_id,
    d.status,
    d.device_label,
    d.device_type,
    d.platform,
    d.company_id,
    d.vessel_id,
    d.requested_by,
    req.username::text,
    d.approved_by,
    app.username::text,
    d.requested_at,
    d.approved_at,
    d.last_user_id,
    lastp.username::text,
    d.last_seen_at,
    d.offline_allowed,
    d.offline_allowed_modules,
    coalesce(d.device_trust_profile, 'standard_device')::text,
    coalesce(d.offline_grant_validity_days, 7)::integer,
    d.notes,
    d.user_agent_summary
  from public.csvb_registered_devices d
  left join public.profiles req on req.id = d.requested_by
  left join public.profiles app on app.id = d.approved_by
  left join public.profiles lastp on lastp.id = d.last_user_id
  where (p_status is null or d.status = p_status)
    and (v_company_scope is null or d.company_id = v_company_scope)
    and (v_platform_admin or d.company_id = v_profile.company_id)
  order by
    case d.status
      when 'pending' then 1
      when 'approved' then 2
      when 'blocked' then 3
      when 'revoked' then 4
      else 9
    end,
    d.requested_at desc;
end;
$$;

grant execute on function public.csvb_admin_list_registered_devices(text, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
