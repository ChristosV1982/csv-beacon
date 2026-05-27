-- supabase/sql/20260527_device_offline_grants_foundation.sql
-- C.S.V. BEACON — Device Offline Grants Foundation
--
-- Purpose:
--   Create server-side offline grant records for approved registered devices.
--
-- Important:
--   This migration does NOT enable device blocking.
--   This migration does NOT enforce offline access.
--   This migration does NOT change auth.js.
--   This migration does NOT enable offline sync.
--   This is an audit/control foundation only.
--
-- Design:
--   A device can have module-specific, time-limited offline grants.
--   Existing registered-device offline permissions remain the gate for issuing grants.
--   Future offline packages should be tied to these grants.

begin;

create table if not exists public.csvb_device_offline_grants (
  id uuid primary key default gen_random_uuid(),

  device_id uuid not null references public.csvb_registered_devices(id) on delete cascade,
  device_public_id text not null,

  -- Reserved for future user-bound grants. For now this may be the last user seen on the device.
  user_id uuid,

  company_id uuid,
  vessel_id uuid,

  module_code text not null,
  grant_type text not null default 'readonly_package'
    check (grant_type in ('readonly_package','write_pending_sync')),

  issued_by uuid,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,

  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text,

  package_id text,
  package_hash text,

  offline_grant_validity_days integer not null
    check (offline_grant_validity_days between 1 and 30),

  notes text,
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint csvb_device_offline_grants_module_code_not_blank
    check (length(trim(module_code)) > 0),

  constraint csvb_device_offline_grants_expires_after_issued
    check (expires_at > issued_at)
);

create index if not exists idx_csvb_device_offline_grants_device
  on public.csvb_device_offline_grants(device_id);

create index if not exists idx_csvb_device_offline_grants_device_module_active
  on public.csvb_device_offline_grants(device_id, module_code, expires_at)
  where revoked_at is null;

create index if not exists idx_csvb_device_offline_grants_company_module
  on public.csvb_device_offline_grants(company_id, module_code);

create index if not exists idx_csvb_device_offline_grants_expires
  on public.csvb_device_offline_grants(expires_at);

alter table public.csvb_device_offline_grants enable row level security;

drop policy if exists csvb_device_offline_grants_no_direct_access
  on public.csvb_device_offline_grants;

create policy csvb_device_offline_grants_no_direct_access
  on public.csvb_device_offline_grants
  for all
  to authenticated
  using (false)
  with check (false);

create or replace function public.csvb_offline_grant_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_csvb_device_offline_grants_updated_at
  on public.csvb_device_offline_grants;

create trigger trg_csvb_device_offline_grants_updated_at
before update on public.csvb_device_offline_grants
for each row
execute function public.csvb_offline_grant_touch_updated_at();

create or replace function public.csvb_offline_grant_effective_status(
  p_expires_at timestamptz,
  p_revoked_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_revoked_at is not null then 'revoked'
    when p_expires_at <= now() then 'expired'
    else 'active'
  end;
$$;

create or replace function public.csvb_admin_issue_device_offline_grant(
  p_device_id uuid,
  p_module_code text,
  p_grant_type text default 'readonly_package',
  p_validity_days integer default null,
  p_package_id text default null,
  p_package_hash text default null,
  p_notes text default null
)
returns table (
  grant_id uuid,
  device_id uuid,
  device_public_id text,
  module_code text,
  grant_type text,
  effective_status text,
  issued_at timestamptz,
  expires_at timestamptz,
  package_id text,
  package_hash text,
  offline_grant_validity_days integer,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_device record;
  v_module_code text;
  v_grant_type text;
  v_days integer;
  v_grant record;
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

  if v_device.status <> 'approved' then
    raise exception 'Offline grants can only be issued to approved devices. Current status: %', v_device.status;
  end if;

  if v_device.offline_allowed is not true then
    raise exception 'Device is not approved for offline access.';
  end if;

  v_module_code := upper(trim(coalesce(p_module_code, '')));
  if length(v_module_code) = 0 then
    raise exception 'module_code is required';
  end if;

  if not (v_module_code = any(coalesce(v_device.offline_allowed_modules, array[]::text[]))) then
    raise exception 'Device is not approved for offline module: %', v_module_code;
  end if;

  v_grant_type := trim(coalesce(p_grant_type, 'readonly_package'));
  if v_grant_type not in ('readonly_package','write_pending_sync') then
    raise exception 'Invalid grant_type: %', p_grant_type;
  end if;

  -- Write/sync grants are intentionally blocked for now.
  if v_grant_type = 'write_pending_sync' then
    raise exception 'write_pending_sync offline grants are not enabled yet.';
  end if;

  v_days := coalesce(
    p_validity_days,
    v_device.offline_grant_validity_days,
    public.csvb_registered_device_default_offline_days(v_device.device_trust_profile),
    7
  );

  if v_days < 1 or v_days > 30 then
    raise exception 'validity days must be between 1 and 30. Current value: %', v_days;
  end if;

  -- One active grant per device/module. Existing active grant is retired before issuing the new one.
  update public.csvb_device_offline_grants g
  set
    revoked_by = v_profile.user_id,
    revoked_at = now(),
    revoke_reason = 'Replaced by newly issued offline grant.'
  where g.device_id = v_device.id
    and g.module_code = v_module_code
    and g.revoked_at is null
    and g.expires_at > now();

  insert into public.csvb_device_offline_grants (
    device_id,
    device_public_id,
    user_id,
    company_id,
    vessel_id,
    module_code,
    grant_type,
    issued_by,
    issued_at,
    expires_at,
    package_id,
    package_hash,
    offline_grant_validity_days,
    notes,
    metadata
  ) values (
    v_device.id,
    v_device.device_public_id,
    v_device.last_user_id,
    v_device.company_id,
    v_device.vessel_id,
    v_module_code,
    v_grant_type,
    v_profile.user_id,
    now(),
    now() + make_interval(days => v_days),
    nullif(trim(coalesce(p_package_id, '')), ''),
    nullif(trim(coalesce(p_package_hash, '')), ''),
    v_days,
    nullif(trim(coalesce(p_notes, '')), ''),
    jsonb_build_object(
      'issued_from', 'csvb_admin_issue_device_offline_grant',
      'device_trust_profile', coalesce(v_device.device_trust_profile, 'standard_device')
    )
  )
  returning * into v_grant;

  return query
  select
    v_grant.id,
    v_grant.device_id,
    v_grant.device_public_id,
    v_grant.module_code,
    v_grant.grant_type,
    public.csvb_offline_grant_effective_status(v_grant.expires_at, v_grant.revoked_at),
    v_grant.issued_at,
    v_grant.expires_at,
    v_grant.package_id,
    v_grant.package_hash,
    v_grant.offline_grant_validity_days,
    v_grant.notes;
end;
$$;

create or replace function public.csvb_admin_revoke_device_offline_grant(
  p_grant_id uuid,
  p_revoke_reason text default null
)
returns table (
  grant_id uuid,
  device_id uuid,
  device_public_id text,
  module_code text,
  grant_type text,
  effective_status text,
  issued_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_grant record;
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

  select g.* into v_grant
  from public.csvb_device_offline_grants g
  where g.id = p_grant_id
  limit 1;

  if v_grant.id is null then
    raise exception 'Offline grant not found';
  end if;

  if not public.csvb_device_can_admin_company(v_grant.company_id) then
    raise exception 'Access denied';
  end if;

  update public.csvb_device_offline_grants g
  set
    revoked_by = v_profile.user_id,
    revoked_at = coalesce(g.revoked_at, now()),
    revoke_reason = coalesce(nullif(trim(coalesce(p_revoke_reason, '')), ''), g.revoke_reason, 'Revoked by administrator.')
  where g.id = p_grant_id
  returning * into v_grant;

  return query
  select
    v_grant.id,
    v_grant.device_id,
    v_grant.device_public_id,
    v_grant.module_code,
    v_grant.grant_type,
    public.csvb_offline_grant_effective_status(v_grant.expires_at, v_grant.revoked_at),
    v_grant.issued_at,
    v_grant.expires_at,
    v_grant.revoked_at,
    v_grant.revoke_reason;
end;
$$;

create or replace function public.csvb_admin_list_device_offline_grants(
  p_device_id uuid default null,
  p_module_code text default null,
  p_include_revoked boolean default true
)
returns table (
  grant_id uuid,
  device_id uuid,
  device_public_id text,
  device_label text,
  company_id uuid,
  vessel_id uuid,
  module_code text,
  grant_type text,
  effective_status text,
  issued_by uuid,
  issued_by_username text,
  issued_at timestamptz,
  expires_at timestamptz,
  revoked_by uuid,
  revoked_by_username text,
  revoked_at timestamptz,
  revoke_reason text,
  package_id text,
  package_hash text,
  offline_grant_validity_days integer,
  notes text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_platform_admin boolean;
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

  return query
  select
    g.id,
    g.device_id,
    g.device_public_id,
    d.device_label,
    g.company_id,
    g.vessel_id,
    g.module_code,
    g.grant_type,
    public.csvb_offline_grant_effective_status(g.expires_at, g.revoked_at),
    g.issued_by,
    issuep.username::text,
    g.issued_at,
    g.expires_at,
    g.revoked_by,
    revokep.username::text,
    g.revoked_at,
    g.revoke_reason,
    g.package_id,
    g.package_hash,
    g.offline_grant_validity_days,
    g.notes,
    g.metadata
  from public.csvb_device_offline_grants g
  join public.csvb_registered_devices d on d.id = g.device_id
  left join public.profiles issuep on issuep.id = g.issued_by
  left join public.profiles revokep on revokep.id = g.revoked_by
  where (p_device_id is null or g.device_id = p_device_id)
    and (p_module_code is null or g.module_code = upper(trim(p_module_code)))
    and (p_include_revoked = true or g.revoked_at is null)
    and (
      v_platform_admin
      or g.company_id = v_profile.company_id
    )
  order by g.issued_at desc;
end;
$$;

create or replace function public.csvb_my_device_offline_grants(
  p_device_public_id text
)
returns table (
  grant_id uuid,
  device_id uuid,
  device_public_id text,
  module_code text,
  grant_type text,
  effective_status text,
  issued_at timestamptz,
  expires_at timestamptz,
  package_id text,
  package_hash text,
  offline_grant_validity_days integer,
  notes text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_device record;
  v_platform_admin boolean;
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

  select * into v_device
  from public.csvb_registered_devices d
  where d.device_public_id = trim(coalesce(p_device_public_id, ''))
  limit 1;

  if v_device.id is null then
    return;
  end if;

  if v_device.status <> 'approved' then
    return;
  end if;

  if not v_platform_admin and v_device.company_id is not null and v_device.company_id <> v_profile.company_id then
    return;
  end if;

  return query
  select
    g.id,
    g.device_id,
    g.device_public_id,
    g.module_code,
    g.grant_type,
    public.csvb_offline_grant_effective_status(g.expires_at, g.revoked_at),
    g.issued_at,
    g.expires_at,
    g.package_id,
    g.package_hash,
    g.offline_grant_validity_days,
    g.notes,
    g.metadata
  from public.csvb_device_offline_grants g
  where g.device_id = v_device.id
    and g.revoked_at is null
    and g.expires_at > now()
  order by g.expires_at desc;
end;
$$;

grant execute on function public.csvb_offline_grant_effective_status(timestamptz, timestamptz) to authenticated;
grant execute on function public.csvb_admin_issue_device_offline_grant(uuid, text, text, integer, text, text, text) to authenticated;
grant execute on function public.csvb_admin_revoke_device_offline_grant(uuid, text) to authenticated;
grant execute on function public.csvb_admin_list_device_offline_grants(uuid, text, boolean) to authenticated;
grant execute on function public.csvb_my_device_offline_grants(text) to authenticated;

notify pgrst, 'reload schema';

commit;
