-- Isolated test subjects allow real authenticated REST verification before
-- switching existing assigned users. Only the database owner may populate it.
begin;
create table public.csvb_office_authorization_test_subjects(
  profile_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.csvb_office_authorization_test_subjects enable row level security;
revoke all on public.csvb_office_authorization_test_subjects from public,anon,authenticated;
create or replace function public.csvb_office_authorization_applies()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
  select exists(select 1 from public.profiles p
    cross join public.csvb_office_authorization_state s
    where p.id=auth.uid() and p.role::text in ('company_admin','company_superintendent')
      and p.office_access_profile_code is not null and
      (s.enforcement_enabled or exists(select 1 from public.csvb_office_authorization_test_subjects t
        where t.profile_id=p.id)))
$$;
do $$
declare existing_hook text;
begin
  select split_part(setting,'=',2) into existing_hook from pg_roles r,
    lateral unnest(coalesce(r.rolconfig,'{}')) setting
    where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
  if existing_hook is not null and existing_hook<>'public.csvb_office_api_pre_request' then
    raise exception 'Existing API hook must be explicitly preserved: %',existing_hook;
  end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.csvb_office_api_pre_request';
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
