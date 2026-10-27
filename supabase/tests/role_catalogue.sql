-- Run against development/testing only. All fixtures and audit entries roll back.
begin;
do $test$
declare
  actor uuid;
  ordinary uuid;
  draft_code text;
  system_code text;
  payload jsonb;
  blocked boolean;
begin
  select id into actor from public.profiles where role::text='super_admin'
    and coalesce(is_active,true) and not coalesce(is_disabled,false) limit 1;
  select id into ordinary from public.profiles where role::text='company_admin' limit 1;
  assert actor is not null and ordinary is not null, 'Expected existing test administrators';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  payload := public.csvb_role_catalogue_list();
  assert (select count(*) from jsonb_array_elements(payload->'roles') r
    where (r->>'is_protected')::boolean)=5, 'All five current roles must be protected';
  assert not exists(select 1 from jsonb_array_elements(payload->'roles') r
    where r->>'code'='platform_owner'), 'Do not introduce platform_owner';
  foreach system_code in array array['super_admin','company_admin','company_superintendent','vessel','inspector'] loop
    blocked := false;
    begin
      perform public.csvb_role_catalogue_change('delete',system_code);
    exception when raise_exception then blocked := true;
    end;
    assert blocked, 'System role deletion must fail';
    blocked := false;
    begin
      perform public.csvb_role_catalogue_change('rename',system_code,'Changed system label');
    exception when raise_exception then blocked := true;
    end;
    assert blocked, 'System role renaming must fail';
  end loop;
  payload := public.csvb_role_catalogue_change('create',null,'QA Office '||gen_random_uuid()::text);
  draft_code := payload->>'code';
  assert (payload->>'is_assignable')::boolean=false;
  assert not exists(select 1 from public.app_roles where id=draft_code), 'Do not insert a live legacy role';
  blocked := false;
  begin
    perform draft_code::public.app_role;
  exception when invalid_text_representation then blocked := true;
  end;
  assert blocked, 'Office drafts must not be valid current account roles';
  perform public.csvb_role_catalogue_change('rename',draft_code,'QA Renamed '||gen_random_uuid()::text);
  perform public.csvb_role_catalogue_change('deactivate',draft_code);
  assert (select not is_active and not is_assignable from public.csvb_office_role_catalogue where code=draft_code);
  perform public.csvb_role_catalogue_change('activate',draft_code);
  assert (select is_active and not is_assignable from public.csvb_office_role_catalogue where code=draft_code);

  -- Simulate a future/legacy reference: the RPC must not trigger its FK cascade.
  insert into public.app_roles(id,label,scope) values(draft_code,'QA dependency','shore');
  insert into public.app_role_permissions(role_id,perm_key,allowed)
    values(draft_code,'QUESTIONS_EDITOR.view',false);
  blocked := false;
  begin
    perform public.csvb_role_catalogue_change('delete',draft_code);
  exception when raise_exception then blocked := true;
  end;
  assert blocked, 'Referenced Office role must not be deleted';
  assert exists(select 1 from public.app_role_permissions where role_id=draft_code),
    'Dependency guard must preserve permission data';
  delete from public.app_role_permissions where role_id=draft_code;
  delete from public.app_roles where id=draft_code;
  update public.csvb_office_role_catalogue set ever_used=true where code=draft_code;
  blocked := false;
  begin
    perform public.csvb_role_catalogue_change('delete',draft_code);
  exception when raise_exception then blocked := true;
  end;
  assert blocked, 'Previously used Office role must not be deleted';
  update public.csvb_office_role_catalogue set ever_used=false where code=draft_code;

  perform set_config('request.jwt.claim.sub',ordinary::text,true);
  blocked := false;
  begin
    perform public.csvb_role_catalogue_list();
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'Company Admin must not read restricted catalogue';
  blocked := false;
  begin
    perform public.csvb_role_catalogue_change('delete',draft_code);
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'Company Admin must not mutate catalogue';
  perform set_config('request.jwt.claim.sub','',true);
  blocked := false;
  begin
    perform public.csvb_role_catalogue_list();
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'Unauthenticated caller must be rejected';

  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.csvb_role_catalogue_change('delete',draft_code);
  assert not exists(select 1 from public.csvb_office_role_catalogue where code=draft_code);
  assert (select count(*) from public.csvb_role_catalogue_audit where role_code=draft_code)=5,
    'Create, rename, deactivate, activate and delete audit entries must survive deletion';
  assert not has_function_privilege('anon','public.csvb_role_catalogue_list()','execute');
  assert not has_function_privilege('authenticated','public.csvb_role_catalogue_dependencies(text)','execute');
  assert not has_table_privilege('authenticated','public.csvb_office_role_catalogue','select');
end;
$test$;
rollback;
select 'PASS: protected roles, draft lifecycle, non-assignment, dependency/ever-used guards, audit retention, authorization, rollback' result;
