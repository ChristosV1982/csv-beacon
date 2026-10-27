-- Office-role/access-profile foundation. Intentionally does not authorize or
-- assign any user: legacy role checks must be converted before activation.
begin;

create table public.csvb_office_access_profiles (
  code text primary key,
  display_name text not null unique,
  legacy_baseline public.app_role,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^[a-z][a-z0-9_]*$')
);
create table public.csvb_office_access_profile_permissions (
  access_profile_code text not null
    references public.csvb_office_access_profiles(code) on delete restrict,
  permission_id uuid not null
    references public.app_permissions(id) on delete restrict,
  scope public.permission_scope not null,
  is_granted boolean not null default false,
  primary key(access_profile_code, permission_id)
);
create table public.csvb_office_user_permission_overrides (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete restrict,
  scope public.permission_scope,
  is_granted boolean not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key(profile_id, permission_id),
  check (not is_granted or scope is not null)
);
create table public.csvb_office_access_audit (
  id bigint generated always as identity primary key,
  subject_profile_id uuid,
  actor_id uuid not null,
  operation text not null check
    (operation in ('role_assignment','profile_assignment','personal_override','profile_permission')),
  permission_id uuid,
  before_value jsonb,
  after_value jsonb,
  reason text not null,
  changed_at timestamptz not null default now()
);
create index csvb_office_access_audit_subject_idx
  on public.csvb_office_access_audit(subject_profile_id, changed_at desc);

alter table public.csvb_office_role_catalogue
  add column default_access_profile_code text
  references public.csvb_office_access_profiles(code) on delete restrict;
alter table public.profiles
  add column office_role_code text
    references public.csvb_office_role_catalogue(code) on delete restrict,
  add column office_access_profile_code text
    references public.csvb_office_access_profiles(code) on delete restrict;
alter table public.profiles
  add constraint csvb_office_assignment_pair_check
  check ((office_role_code is null) = (office_access_profile_code is null));
create index csvb_profiles_office_role_idx
  on public.profiles(office_role_code) where office_role_code is not null;

insert into public.csvb_office_access_profiles(code,display_name,legacy_baseline)
values ('company_administrator_access','Company Administrator Access','company_admin'),
       ('standard_office_access','Standard Office Access','company_superintendent'),
       ('demo_view_only_access','Demo View-Only Access',null);

-- Snapshot only role-default grants. Position-specific exceptions remain
-- on the legacy resolver for currently unassigned users.
insert into public.csvb_office_access_profile_permissions
  (access_profile_code, permission_id, scope, is_granted)
select distinct on (rp.role,rp.permission_id)
  case rp.role::text
         when 'company_admin' then 'company_administrator_access'
         else 'standard_office_access'
       end, rp.permission_id, rp.scope, rp.is_granted
from public.role_permissions rp
where rp.position is null
  and rp.role::text in ('company_admin','company_superintendent')
order by rp.role,rp.permission_id,rp.id;

insert into public.csvb_office_access_profile_permissions
  (access_profile_code,permission_id,scope,is_granted)
select 'demo_view_only_access',ap.id,'company'::public.permission_scope,true
from public.app_permissions ap
join public.app_modules m on m.id=ap.module_id
where m.code in ('SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE')
  and m.is_active and ap.action='view';

update public.csvb_office_role_catalogue
set default_access_profile_code =
  case
    when role_kind='demo' then 'demo_view_only_access'
    when display_name='Marine Coordinator' then 'company_administrator_access'
    else 'standard_office_access'
  end;

alter table public.csvb_office_access_profiles enable row level security;
alter table public.csvb_office_access_profile_permissions enable row level security;
alter table public.csvb_office_user_permission_overrides enable row level security;
alter table public.csvb_office_access_audit enable row level security;
revoke all on public.csvb_office_access_profiles,
  public.csvb_office_access_profile_permissions,
  public.csvb_office_user_permission_overrides,
  public.csvb_office_access_audit from public, anon, authenticated;
revoke all on sequence public.csvb_office_access_audit_id_seq
  from public, anon, authenticated;

-- Block assignment even if existing profile RLS/table grants permit edits.
-- A later resolver migration must replace this gate only after every
-- ordinary Office backend authorization path has been verified.
create function public.csvb_office_assignment_pending()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.office_role_code is not null or new.office_access_profile_code is not null then
    raise exception 'Office role assignment is pending authorization migration.'
      using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger csvb_office_assignment_pending
before insert or update of office_role_code,office_access_profile_code
on public.profiles
for each row execute function public.csvb_office_assignment_pending();

comment on table public.csvb_office_access_profiles is
  'Inactive permission baselines for a future verified Office resolver. No live authorization consumes these rows yet.';
comment on column public.profiles.office_role_code is
  'Future Office identity; NULL means the existing legacy role resolver remains authoritative.';
notify pgrst,'reload schema';
commit;
