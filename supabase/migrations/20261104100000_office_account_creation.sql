begin;
-- No changes to existing accounts, roles, grants or Access Profile enforcement.
create table public.csvb_office_account_creation_requests (
  id uuid primary key,
  actor_id uuid not null,
  username text not null,
  company_id uuid not null references public.companies(id) on delete restrict,
  office_role_code text not null references public.csvb_office_role_catalogue(code) on delete restrict,
  access_profile_code text not null references public.csvb_office_access_profiles(code) on delete restrict,
  legacy_role public.app_role not null check(legacy_role in ('company_admin','company_superintendent')),
  requires_enforcement boolean not null,
  particulars jsonb not null,
  auth_user_id uuid,
  status text not null default 'pending' check(status in ('pending','profile_ready','completed','failed','cleanup_required')),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index csvb_office_creation_username_reserved
on public.csvb_office_account_creation_requests(lower(username)) where status<>'failed';
alter table public.csvb_office_account_creation_requests enable row level security;
revoke all on public.csvb_office_account_creation_requests from public,anon,authenticated;

create function public.csvb_admin_office_creation_options()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
begin
  perform public.csvb_role_catalogue_require_super_admin();
  return jsonb_build_object(
    'roles',coalesce((select jsonb_agg(jsonb_build_object(
      'code',c.code,'display_name',c.display_name,
      'default_access_profile_code',c.default_access_profile_code) order by c.display_name)
      from public.csvb_office_role_catalogue c where c.is_active and c.is_assignable),'[]'::jsonb),
    'access_profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'code',a.code,'display_name',a.display_name,
      'requires_enforcement',a.legacy_baseline is null) order by a.display_name)
      from public.csvb_office_access_profiles a where exists(
        select 1 from public.csvb_office_role_catalogue c where c.is_active and c.is_assignable
          and c.default_access_profile_code=a.code)),'[]'::jsonb),
    'permission_enforcement_active',false
  );
end;
$$;

create function public.csvb_admin_office_creation_prepare(
  p_request_id uuid,p_username text,p_company_id uuid,p_office_role_code text,
  p_access_profile_code text default null,p_first_name text default null,
  p_last_name text default null,p_position text default null,p_force_reset boolean default false
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare c public.csvb_office_role_catalogue; a public.csvb_office_access_profiles;
  r public.csvb_office_account_creation_requests; details jsonb; name text:=btrim(p_username);
begin
  perform public.csvb_role_catalogue_require_super_admin();
  if p_request_id is null or name is null or name !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$' then
    raise exception 'Enter a username without spaces or @domain (letters, numbers, dot, underscore or hyphen).';
  end if;
  if not exists(select 1 from public.companies where id=p_company_id and is_active) then
    raise exception 'Select an active company for the Office user.';
  end if;
  select * into c from public.csvb_office_role_catalogue
    where code=p_office_role_code and is_active and is_assignable;
  if not found then raise exception 'Select an active, assignable Office Role.'; end if;
  select * into a from public.csvb_office_access_profiles
    where code=coalesce(p_access_profile_code,c.default_access_profile_code);
  if not found or not exists(select 1 from public.csvb_office_role_catalogue
    where is_active and is_assignable and default_access_profile_code=a.code) then
    raise exception 'Select an allowed Access Profile.';
  end if;
  if a.legacy_baseline is not null and a.legacy_baseline::text not in ('company_admin','company_superintendent') then
    raise exception 'This profile is not compatible with normal Office creation.';
  end if;
  details:=jsonb_build_object('first_name',nullif(btrim(p_first_name),''),
    'last_name',nullif(btrim(p_last_name),''),'position',nullif(btrim(p_position),''),
    'force_password_reset',coalesce(p_force_reset,false));
  select * into r from public.csvb_office_account_creation_requests where id=p_request_id for update;
  if found then
    if r.actor_id<>auth.uid() or r.username<>name or r.company_id<>p_company_id
      or r.office_role_code<>c.code or r.access_profile_code<>a.code or r.particulars<>details then
      raise exception 'Creation request differs from its original selection. Use a new request.';
    end if;
    if r.status='cleanup_required' then
      raise exception 'Creation request needs administrator review; do not create a duplicate account.';
    end if;
    if r.status='failed' then
      if exists(select 1 from auth.users where raw_app_meta_data->>'csvb_office_creation_request'=r.id::text)
        or exists(select 1 from public.profiles where lower(username)=lower(name)) then
        raise exception 'An account already exists for this request; review it instead of creating a duplicate.';
      end if;
      -- A corrected password may retry a cleanly failed request. No credentials
      -- are stored in the request or compared here.
      update public.csvb_office_account_creation_requests set status='pending',
        auth_user_id=null,failure_code=null,updated_at=now() where id=r.id returning * into r;
    end if;
    return to_jsonb(r);
  end if;
  if exists(select 1 from public.profiles where lower(username)=lower(name)) then
    raise exception 'Username already exists. Open the existing user instead.';
  end if;
  insert into public.csvb_office_account_creation_requests
    (id,actor_id,username,company_id,office_role_code,access_profile_code,legacy_role,requires_enforcement,particulars)
  values(p_request_id,auth.uid(),name,p_company_id,c.code,a.code,
    coalesce(a.legacy_baseline,'company_superintendent'::public.app_role),a.legacy_baseline is null,details)
  returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.csvb_admin_office_creation_finalize(p_request_id uuid,p_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare r public.csvb_office_account_creation_requests;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into r from public.csvb_office_account_creation_requests
    where id=p_request_id and actor_id=auth.uid() for update;
  if not found then raise exception 'Office creation request not found for this administrator.'; end if;
  if r.status in ('profile_ready','completed') and r.auth_user_id=p_auth_user_id then return to_jsonb(r); end if;
  if r.status<>'pending' then raise exception 'Creation request cannot be finalized in this state.'; end if;
  if not exists(select 1 from auth.users where id=p_auth_user_id
    and lower(email)=lower(r.username)||'@csvtest.local'
    and raw_app_meta_data->>'csvb_office_creation_request'=r.id::text
    and raw_app_meta_data->>'csvb_office_creation_actor'=auth.uid()::text
    and banned_until>now()) then
    raise exception 'Only the newly created, locked Auth identity may be finalized.';
  end if;
  if not exists(select 1 from public.companies where id=r.company_id and is_active)
    or not exists(select 1 from public.csvb_office_role_catalogue where code=r.office_role_code and is_active and is_assignable)
    or not exists(select 1 from public.csvb_office_role_catalogue where is_active and is_assignable
      and default_access_profile_code=r.access_profile_code) then
    raise exception 'Company/Office Role/Access Profile availability changed. Reload before creating.';
  end if;
  perform set_config('csvb.office_assignment_reason','Office account created by Super Admin',true);
  insert into public.profiles(id,username,role,company_id,vessel_id,first_name,last_name,position,
    is_active,is_disabled,force_password_reset,office_role_code,office_access_profile_code)
  values(p_auth_user_id,r.username,r.legacy_role,r.company_id,null,
    r.particulars->>'first_name',r.particulars->>'last_name',r.particulars->>'position',
    false,true,(r.particulars->>'force_password_reset')::boolean,r.office_role_code,r.access_profile_code);
  update public.csvb_office_account_creation_requests set status='profile_ready',
    auth_user_id=p_auth_user_id,updated_at=now() where id=r.id returning * into r;
  return to_jsonb(r);
end;
$$;

-- Recover only this request's Admin-created Auth identity after a lost response.
-- No passwords, sessions or arbitrary Auth records are exposed.
create function public.csvb_admin_office_creation_identity(p_request_id uuid)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare identity_id uuid;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select a.id into identity_id from auth.users a
    join public.csvb_office_account_creation_requests r on r.id=p_request_id and r.actor_id=auth.uid()
    where a.raw_app_meta_data->>'csvb_office_creation_request'=r.id::text
      and a.raw_app_meta_data->>'csvb_office_creation_actor'=auth.uid()::text
      and lower(a.email)=lower(r.username)||'@csvtest.local';
  return identity_id;
end;
$$;

create function public.csvb_admin_office_creation_complete(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare r public.csvb_office_account_creation_requests;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into r from public.csvb_office_account_creation_requests
    where id=p_request_id and actor_id=auth.uid() for update;
  if not found then raise exception 'Creation request not found.'; end if;
  if r.status='completed' then return to_jsonb(r); end if;
  if r.status<>'profile_ready' then raise exception 'Office profile is not ready.'; end if;
  if not exists(select 1 from auth.users where id=r.auth_user_id and
    case when r.requires_enforcement then banned_until>now()
      else banned_until is null or banned_until<=now() end) then
    raise exception 'Auth lock state does not match the prepared/legacy account state.';
  end if;
  update public.profiles set is_active=not r.requires_enforcement,is_disabled=r.requires_enforcement
    where id=r.auth_user_id and office_role_code=r.office_role_code
      and office_access_profile_code=r.access_profile_code;
  if not found then raise exception 'Office account assignment changed before completion.'; end if;
  update public.csvb_office_account_creation_requests set status='completed',updated_at=now()
    where id=r.id returning * into r;
  return to_jsonb(r);
end;
$$;

create function public.csvb_admin_office_creation_failed(
  p_request_id uuid,p_auth_user_id uuid default null,p_cleanup_confirmed boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$
declare r public.csvb_office_account_creation_requests;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select * into r from public.csvb_office_account_creation_requests
    where id=p_request_id and actor_id=auth.uid() for update;
  if not found or r.status='completed' then return; end if;
  if p_auth_user_id is not null and exists(select 1 from auth.users where id=p_auth_user_id
    and (raw_app_meta_data->>'csvb_office_creation_request' is distinct from r.id::text
      or raw_app_meta_data->>'csvb_office_creation_actor' is distinct from auth.uid()::text)) then
    raise exception 'Cleanup identity mismatch.';
  end if;
  if p_cleanup_confirmed and p_auth_user_id is not null and
    exists(select 1 from auth.users where id=p_auth_user_id) then
    raise exception 'Auth cleanup has not completed.';
  end if;
  update public.csvb_office_account_creation_requests
    set status=case when r.status='pending' and (p_auth_user_id is null or p_cleanup_confirmed)
      then 'failed' else 'cleanup_required' end,
      auth_user_id=coalesce(r.auth_user_id,p_auth_user_id),failure_code='creation_failed',updated_at=now()
    where id=r.id;
end;
$$;
revoke all on function public.csvb_admin_office_creation_options(),
 public.csvb_admin_office_creation_prepare(uuid,text,uuid,text,text,text,text,text,boolean),
 public.csvb_admin_office_creation_finalize(uuid,uuid),
 public.csvb_admin_office_creation_identity(uuid),
 public.csvb_admin_office_creation_complete(uuid),
 public.csvb_admin_office_creation_failed(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.csvb_admin_office_creation_options(),
 public.csvb_admin_office_creation_prepare(uuid,text,uuid,text,text,text,text,text,boolean),
 public.csvb_admin_office_creation_finalize(uuid,uuid),
 public.csvb_admin_office_creation_identity(uuid),
 public.csvb_admin_office_creation_complete(uuid),
 public.csvb_admin_office_creation_failed(uuid,uuid,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
