-- All checks are read-only; regression lifecycle tests remain in role_catalogue.sql.
begin;
do $test$
declare row_value record; configured jsonb;
begin
  assert enum_range(null::public.app_role)::text=
    '{super_admin,company_admin,company_superintendent,vessel,inspector}',
    'The five existing application role identities must remain unchanged';
  for row_value in select * from (values
    ('Marine Coordinator','Company Administration'),
    ('Marine Superintendent','Office / Operational'),
    ('Marine Superintendent - Port Captain','Office / Operational'),
    ('Technical Superintendent','Office / Operational'),
    ('Technical Superintendent - Port Engineer','Office / Operational'),
    ('Technical Operator','Office / Operational'),('HSQE Superintendent','Office / Operational'),
    ('Fleet Operator','Office / Operational'),('Post Fixture Operator','Office / Operational'),
    ('Performance Engineer','Office / Operational'),('Fleet Manager','Management'),
    ('DPA','Management / Statutory'),('General Manager','Management'),
    ('Technical Director','Management'),('Demo User','Demo / Training')
  ) x(label,category) loop
    assert (select count(*)=1 from public.csvb_office_role_catalogue
      where display_name=row_value.label and organizational_classification=row_value.category
        and is_assignable=(to_regprocedure('public.csvb_admin_office_user_options(uuid)') is not null)
        and proposed_access_profile_code is not null),
      'Expected one classified catalogue entry with separate Access Profile proposal and correct assignment readiness';
  end loop;
  select proposed_permissions into configured from public.csvb_prepared_access_profiles
    where code='demo_view_only' and not default_allow and status='draft';
  assert jsonb_array_length(configured)=2;
  assert not exists(select 1 from jsonb_array_elements(configured) p
    where p->>'action'<>'view' or p->>'module_code' not in
      ('SIRE_QUESTIONS_VIEWER','SIRE_FLEET_VETTING_EXPERIENCE')),
    'Demo proposal must only include the approved conservative view-only set';
  assert not exists(select 1 from public.profiles p join public.csvb_office_role_catalogue c
    on p.role::text=c.code), 'No current account may be reassigned to the prepared roles';
  assert not exists(select 1 from public.app_roles r join public.csvb_office_role_catalogue c
    on r.id=c.code), 'Prepared roles must not leak into the legacy role catalogue';
  assert not has_table_privilege('authenticated','public.csvb_prepared_access_profiles','select'),
    'Access profile proposals must remain Super Admin RPC-only metadata';
  perform set_config('request.jwt.claim.sub',(select id::text from public.profiles
    where role::text='super_admin' limit 1),true);
  configured := public.csvb_role_catalogue_list();
  assert (select count(*) from jsonb_array_elements(configured->'roles') r
    where (r->>'is_protected')::boolean)=5;
  assert exists(select 1 from jsonb_array_elements(configured->'roles') r
    where r->>'display_name'='Demo User' and r->>'classification'='Demo'
      and (r->>'is_assignable')::boolean=
        (to_regprocedure('public.csvb_admin_office_user_options(uuid)') is not null));
  assert not exists(select 1 from jsonb_array_elements(configured->'roles') r
    where r->>'code'='platform_owner');
end;
$test$;
rollback;
select 'PASS: 15 categories/classifications, protected roles, independent proposals, conservative Demo, no assignment/authorization leakage' result;
