"""Controlled testing-project migration. Default: full rollback-only rehearsal.

--apply commits only the preservation-checked migration, never the mutation tests.
No accounts are created, activated, deleted or impersonated through Auth.
"""
import importlib.util
import json
import pathlib
import sys

spec = importlib.util.spec_from_file_location("existing_api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
assert api.PROJECT == "bdidrcyufazskpuwmfca"
actor = api.sql("select id from public.profiles where role::text='super_admin' "
               "and is_active and not is_disabled order by id limit 1", True)[0]["id"]
claims = json.dumps({"sub": actor, "role": "authenticated"})
migration = pathlib.Path("supabase/migrations/20261106100000_office_role_isolated_defaults.sql").read_text()
apply = "--apply" in sys.argv

# Compare protected records inside the same transaction, not across unrelated
# concurrent browser sessions. Do not print personal information or Auth data.
protected = [
    "company_modules", "vessels", "role_permissions",
    "csvb_office_user_permission_overrides", "threads", "thread_participants",
    "thread_notifications", "profile_onboard_access_log",
]
snapshot = """
create temporary table csvb_protected_snapshots(name text,h text) on commit drop;
insert into csvb_protected_snapshots select 'profile_identity',
 md5(coalesce(string_agg((to_jsonb(p)-'office_access_profile_code'-'updated_at')::text,''
 order by p.id),'')) from public.profiles p;
insert into csvb_protected_snapshots select 'auth_identity',
 md5(coalesce(string_agg(jsonb_build_array(id,email,banned_until,deleted_at)::text,''
 order by id),'')) from auth.users;
"""
for table in protected:
    snapshot += (f"insert into csvb_protected_snapshots select '{table}',"
                 f"md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) "
                 f"from public.{table} t;\n")
checks = """
do $preserve$
declare current_hash text; old record;
begin
 for old in select * from csvb_protected_snapshots loop
  if old.name='profile_identity' then
   select md5(coalesce(string_agg((to_jsonb(p)-'office_access_profile_code'-'updated_at')::text,''
     order by p.id),'')) into current_hash from public.profiles p;
  elsif old.name='auth_identity' then
   select md5(coalesce(string_agg(jsonb_build_array(id,email,banned_until,deleted_at)::text,''
     order by id),'')) into current_hash from auth.users;
  else
   execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,%L order by to_jsonb(t)::text),%L)) from public.%I t',
     '','',old.name) into current_hash;
  end if;
  if current_hash is distinct from old.h then raise exception 'Protected records changed: %',old.name; end if;
 end loop;
end $preserve$;
"""
tests = r"""
do $test$
declare subject public.profiles; test_permission uuid; before jsonb; saved jsonb;
 role_code text; others jsonb; after_others jsonb; decision jsonb; root_actor uuid:=auth.uid();
begin
 select a.id into test_permission from public.app_permissions a
 join public.app_modules m on m.id=a.module_id where m.code='POST_INSPECTION' and a.action='edit';
 select p.* into subject from public.profiles p
 join public.csvb_office_role_permission_bindings b on b.role_code=p.office_role_code
 where p.is_active and not p.is_disabled
 and (csvb_office_auth_private.decision(p.id,'POST_INSPECTION','edit',p.company_id,null)->>'allowed')::boolean=false
 and csvb_office_auth_private.decision(p.id,'POST_INSPECTION','edit',p.company_id,null)->>'source'='role_default'
 and not exists(select 1 from public.csvb_office_user_permission_overrides o
   where o.profile_id=p.id and o.permission_id=test_permission)
 order by p.id limit 1;
 if not found then raise exception 'No safe existing role-default test subject available; no test writes made.'; end if;
 role_code:=subject.office_role_code;
 select jsonb_agg(jsonb_build_object('id',p.id,'d',
   csvb_office_auth_private.decision(p.id,'POST_INSPECTION','edit',p.company_id,null)) order by p.id)
 into others from public.profiles p where p.office_role_code is distinct from role_code;
 before:=public.csvb_admin_office_role_defaults(role_code);
 saved:=public.csvb_admin_office_role_defaults_save(role_code,
   jsonb_build_array(jsonb_build_object('permission_id',test_permission,'is_granted',true,'scope','company')),
   (before->>'revision')::bigint,before->>'fingerprint','Rollback-only role permission integration test');
 decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','edit',subject.company_id,null);
 if not (decision->>'allowed')::boolean or decision->>'source'<>'role_default' then
   raise exception 'Role update did not become authoritative at runtime';
 end if;
 if (saved->>'revision')::bigint<>(before->>'revision')::bigint+1 then raise exception 'Revision did not increment'; end if;
 select jsonb_agg(jsonb_build_object('id',p.id,'d',
   csvb_office_auth_private.decision(p.id,'POST_INSPECTION','edit',p.company_id,null)) order by p.id)
 into after_others from public.profiles p where p.office_role_code is distinct from role_code;
 if others is distinct from after_others then raise exception 'Role save changed a different role or unmigrated user'; end if;
 begin
  perform public.csvb_admin_office_role_defaults_save(role_code,
   jsonb_build_array(jsonb_build_object('permission_id',test_permission,'is_granted',false,'scope','company')),
   (before->>'revision')::bigint,before->>'fingerprint','Rollback-only stale edit test');
  raise exception 'TEST_FAIL: stale revision accepted';
 exception when others then
  if sqlerrm not like 'Role defaults changed since loading.%' then raise; end if;
 end;
 perform public.csvb_admin_office_personal_override_save(subject.id,test_permission,'deny',null,
   'Rollback-only personal Deny integration test');
 decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','edit',subject.company_id,null);
 if (decision->>'allowed')::boolean or decision->>'source'<>'personal_deny' then raise exception 'Personal Deny did not win'; end if;
 perform public.csvb_admin_office_personal_override_save(subject.id,test_permission,'inherit',null,
   'Rollback-only Same as Role integration test');
 decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','edit',subject.company_id,null);
 if not (decision->>'allowed')::boolean or decision->>'source'<>'role_default' then raise exception 'Same as Role did not restore role default'; end if;
 saved:=public.csvb_admin_office_role_defaults(role_code);
 perform public.csvb_admin_office_role_defaults_save(role_code,
   jsonb_build_array(jsonb_build_object('permission_id',test_permission,'is_granted',false,'scope','company')),
   (saved->>'revision')::bigint,saved->>'fingerprint','Rollback-only role revoke test');
 perform public.csvb_admin_office_personal_override_save(subject.id,test_permission,'allow','company',
   'Rollback-only personal Allow integration test');
 decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','edit',subject.company_id,null);
 if not (decision->>'allowed')::boolean or decision->>'source'<>'personal_allow' then raise exception 'Personal Allow did not win'; end if;
 decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','edit',gen_random_uuid(),null);
 if (decision->>'allowed')::boolean or decision->>'source'<>'hard_constraint' then raise exception 'Company boundary bypassed'; end if;
 update public.company_modules set is_enabled=false where company_id=subject.company_id and module_key='post_inspection';
 decision:=csvb_office_auth_private.decision(subject.id,'POST_INSPECTION','edit',subject.company_id,null);
 if (decision->>'allowed')::boolean or decision->>'source'<>'hard_constraint' then raise exception 'Company module gate bypassed'; end if;
 decision:=csvb_office_auth_private.decision(subject.id,'SU_ADMIN','view',subject.company_id,null);
 if (decision->>'allowed')::boolean then raise exception 'Super Admin boundary bypassed'; end if;
 -- A real non-admin claim must fail the role editor's server guard.
 perform set_config('request.jwt.claim.sub',subject.id::text,true);
 begin
  perform public.csvb_admin_office_role_defaults(role_code);
  raise exception 'TEST_FAIL: non-admin read accepted';
 exception when others then
  if sqlerrm like 'TEST_FAIL:%' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub',root_actor::text,true);
end $test$;
"""
summary = """
select jsonb_build_object('isolated_roles',(select count(*) from public.csvb_office_role_permission_bindings),
 'role_following_users',(select count(*) from public.profiles p join public.csvb_office_role_permission_bindings b
 on b.role_code=p.office_role_code and b.access_profile_code=p.office_access_profile_code),
 'baseline_decisions_checked',(select count(*) from csvb_role_baseline),
 'protected_record_sets',10,'preservation_verified',true) result;
"""
query = ("begin;set local request.jwt.claim.sub=" + api.literal(actor) +
         ";set local request.jwt.claims=" + api.literal(claims) + ";" +
         snapshot + migration + checks + ("" if apply else tests) + summary +
         ("commit;" if apply else "rollback;"))
result = api.sql(query)
print(json.dumps({"mode": "APPLIED" if apply else "ROLLBACK_ONLY_REHEARSAL", "result": result,
                  "runtime_tests": "not persisted" if apply else [
                      "role edits effective at runtime", "different roles unchanged",
                      "revision increment/stale rejection", "personal Deny", "Same as Role",
                      "personal Allow", "company boundary", "company module gate",
                      "Super Admin protection", "non-admin role endpoint denied"]}, indent=2))
