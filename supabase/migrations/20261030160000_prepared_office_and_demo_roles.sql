-- Catalogue preparation only: no profile assignments, enum changes, live
-- grants, authorization resolver changes, or Demo Mode.
begin;

create table public.csvb_prepared_access_profiles (
  code text primary key,
  display_name text not null,
  status text not null default 'draft' check (status='draft'),
  proposed_permissions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_permissions)='array'),
  default_allow boolean not null default false check (default_allow=false),
  notes text not null,
  created_at timestamptz not null default now()
);
alter table public.csvb_prepared_access_profiles enable row level security;
revoke all on public.csvb_prepared_access_profiles from public, anon, authenticated;
comment on table public.csvb_prepared_access_profiles is
  'Non-executable access-profile proposals. Not read by login, Rights Matrix or permission resolution.';

alter table public.csvb_office_role_catalogue
  add column role_kind text not null default 'office' check(role_kind in ('office','demo')),
  add column organizational_classification text not null default 'Office / Operational'
    check(organizational_classification in ('Company Administration','Office / Operational','Management','Management / Statutory','Demo / Training')),
  add column proposed_access_profile_code text
    references public.csvb_prepared_access_profiles(code) on delete restrict;

alter table public.csvb_role_catalogue_audit
  drop constraint csvb_role_catalogue_audit_action_check;
alter table public.csvb_role_catalogue_audit add constraint csvb_role_catalogue_audit_action_check
  check(action in ('create','rename','activate','deactivate','delete','configure'));

insert into public.csvb_prepared_access_profiles(code,display_name,proposed_permissions,notes)
values
  ('company_administration_candidate','Company Admin-equivalent (proposed)','[]',
   'Marine Coordinator remains a distinct organizational identity. Company Admin-level rights are an intention for later approval/mapping, not copied or granted now.'),
  ('office_operational_pending','Office operational access (to be agreed)','[]',
   'Reusable proposal only. No hierarchy or permissions inferred from a job title. Deny by default until explicitly configured.'),
  ('management_pending','Management access (to be agreed)','[]',
   'Management/statutory identity is not a Superintendent role. Sharing this proposal never changes organizational classification.'),
  ('demo_view_only','Demo view-only (proposed)',
   '[{"module_code":"SIRE_QUESTIONS_VIEWER","action":"view"},{"module_code":"SIRE_FLEET_VETTING_EXPERIENCE","action":"view"}]',
   'Normal future Demo User role, not Demo Mode. Proposed initial set: SIRE Questions Viewer and Fleet Vetting Experience, company-scoped, View only. No Edit/Admin/Export/destructive/account rights. Mooring, Port Call and Portable Lifting are deferred until backend view-only enforcement is verified. All proposals are inactive for authorization.');

do $seed$
declare
  item record;
  existing public.csvb_office_role_catalogue;
  updated public.csvb_office_role_catalogue;
  system_actor constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if (select count(*) from public.app_modules where code in
      ('SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE') and is_active)<>2 then
    raise exception 'Expected existing SIRE modules are missing; review the proposed Demo profile.';
  end if;
  for item in select * from (values
    ('marine_coordinator','Marine Coordinator','Company Administration','office','company_administration_candidate'),
    ('marine_superintendent','Marine Superintendent','Office / Operational','office','office_operational_pending'),
    ('marine_superintendent_port_captain','Marine Superintendent - Port Captain','Office / Operational','office','office_operational_pending'),
    ('technical_superintendent','Technical Superintendent','Office / Operational','office','office_operational_pending'),
    ('technical_superintendent_port_engineer','Technical Superintendent - Port Engineer','Office / Operational','office','office_operational_pending'),
    ('technical_operator','Technical Operator','Office / Operational','office','office_operational_pending'),
    ('hsqe_superintendent','HSQE Superintendent','Office / Operational','office','office_operational_pending'),
    ('fleet_operator','Fleet Operator','Office / Operational','office','office_operational_pending'),
    ('post_fixture_operator','Post Fixture Operator','Office / Operational','office','office_operational_pending'),
    ('performance_engineer','Performance Engineer','Office / Operational','office','office_operational_pending'),
    ('fleet_manager','Fleet Manager','Management','office','management_pending'),
    ('dpa','DPA','Management / Statutory','office','management_pending'),
    ('general_manager','General Manager','Management','office','management_pending'),
    ('technical_director','Technical Director','Management','office','management_pending'),
    ('demo_user','Demo User','Demo / Training','demo','demo_view_only')
  ) v(seed_key,display_name,org_class,kind,profile_code) loop
    select * into existing from public.csvb_office_role_catalogue
      where lower(btrim(display_name))=lower(item.display_name) for update;
    if not found then
      insert into public.csvb_office_role_catalogue(
        code,display_name,role_kind,organizational_classification,proposed_access_profile_code,created_by,updated_by)
      values('office_draft_'||md5('csvb:prepared-role:'||item.seed_key),item.display_name,
        item.kind,item.org_class,item.profile_code,system_actor,system_actor)
      returning * into updated;
    else
      update public.csvb_office_role_catalogue set
        role_kind=item.kind,organizational_classification=item.org_class,
        proposed_access_profile_code=item.profile_code,updated_by=system_actor,updated_at=now()
      where code=existing.code returning * into updated;
    end if;
    insert into public.csvb_role_catalogue_audit(
      role_code,display_name,action,actor_id,actor_username,before_data,after_data)
    values(updated.code,updated.display_name,
      case when existing.code is null then 'create' else 'configure' end,
      system_actor,'System migration (user-approved catalogue preparation)',
      case when existing.code is null then null else to_jsonb(existing) end,to_jsonb(updated));
  end loop;
end;
$seed$;

create or replace function public.csvb_role_catalogue_list()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select jsonb_build_object(
    'roles', (
      select jsonb_agg(x.data order by x.sort_order,x.label)
      from (
        select 0 sort_order,s.display_name label,
          jsonb_build_object(
            'code',s.code,'display_name',s.display_name,
            'classification',case when s.code='company_superintendent' then 'Office' else 'System' end,
            'is_active',coalesce(a.is_active,true),'is_assignable',true,
            'is_protected',true,
            'status',case when s.code='company_superintendent'
              then 'Legacy operational role — protected' else 'Protected system role' end,
            'protection_reason',case when s.code='company_superintendent'
              then 'Current users and backend checks depend on this legacy operational role. Under review; not safe to delete.'
              else 'Protected application security role. Stable code and existing behavior must remain unchanged.' end
          ) || public.csvb_role_catalogue_dependencies(s.code) data
        from (values
          ('super_admin','Super Admin'),('company_admin','Company Admin'),
          ('company_superintendent','Company Superintendent'),('vessel','Onboard Personnel'),
          ('inspector','Inspector / Third Party')
        ) s(code,display_name)
        left join public.app_roles a on a.id=s.code
        union all
        select 1,c.display_name,
          jsonb_build_object(
            'code',c.code,'display_name',c.display_name,
            'classification',case when c.role_kind='demo' then 'Demo' else 'Office' end,
            'role_kind',c.role_kind,'organizational_classification',c.organizational_classification,
            'proposed_access_profile_code',c.proposed_access_profile_code,
            'proposed_access_profile_label',p.display_name,
            'proposed_permissions',coalesce(p.proposed_permissions,'[]'::jsonb),
            'profile_notes',p.notes,
            'is_active',c.is_active,'is_assignable',false,'is_protected',false,
            'status','Draft / Not yet assignable','ever_used',c.ever_used,
            'protection_reason','Catalogue preparation only. No permissions granted; unavailable in user assignment and authorization.'
          ) || public.csvb_role_catalogue_dependencies(c.code)
        from public.csvb_office_role_catalogue c
        left join public.csvb_prepared_access_profiles p on p.code=c.proposed_access_profile_code
      ) x
    ),
    'audit',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.changed_at desc,a.id desc)
      from (select id,role_code,display_name,action,actor_username,changed_at
            from public.csvb_role_catalogue_audit order by changed_at desc,id desc limit 100) a
    ),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
notify pgrst,'reload schema';
commit;
