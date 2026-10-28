"""Read-only business-data Preview check, using a disposable admin login."""
import importlib.util
import json
import subprocess

spec = importlib.util.spec_from_file_location("api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
location = api.sql("""select company_id, port_id, country_code_snapshot country_code
    from public.pci_port_calls where country_code_snapshot is not null
    order by updated_at desc limit 1""", True)[0]
api.COMPANY = location["company_id"]
api.ACTOR = api.sql("select id from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1", True)[0]["id"]
api.ROLE = api.sql("select code from public.csvb_office_role_catalogue where display_name='Technical Superintendent'", True)[0]["code"]
snapshot = """
select c.relname, (xpath('/row/n/text()',query_to_xml(
 format('select count(*) n from public.%I',c.relname),false,true,'')))[1]::text n
from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
where ns.nspname='public' and c.relkind='r' and c.relname like 'pci_%'
order by c.relname
"""
before = api.sql(snapshot, True)
profile_hash = api.sql("select md5(string_agg(to_jsonb(p)::text,'' order by id)) hash from public.profiles p", True)[0]["hash"]
try:
    uid, session = api.make_fixture("standard_office_view_only")
    api.actor_sql("update public.profiles set role='company_admin',office_role_code=null,office_access_profile_code=null where id=" + api.literal(uid))
    api.actor_sql("update public.profiles set role='super_admin',company_id=" + api.literal(api.COMPANY) +
        " where id=" + api.literal(uid) + ";delete from public.profile_roles_cache where user_id=" + api.literal(uid))
    result = subprocess.run(["node", "scripts/test-port-call-intelligence-preview.mjs"],
        input=json.dumps({"session": session, "project": api.PROJECT, "location": location}),
        text=True, capture_output=True, timeout=150)
    print(result.stdout.strip())
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "Live Preview check failed")
finally:
    for uid in api.CREATED:
        api.sql("delete from public.csvb_office_authorization_test_subjects where profile_id=" + api.literal(uid))
        api.actor_sql("update public.profiles set role='company_superintendent' where id=" + api.literal(uid))
        status, _ = api.http("/auth/v1/admin/users/" + uid, method="DELETE")
        assert status == 200, "Temporary login cleanup failed"
        api.sql("delete from public.profile_roles_cache where user_id=" + api.literal(uid))
assert before == api.sql(snapshot, True), "PCI business-record counts changed"
assert profile_hash == api.sql("select md5(string_agg(to_jsonb(p)::text,'' order by id)) hash from public.profiles p", True)[0]["hash"]
print("PASS: all PCI business-record counts and original profiles unchanged; temporary login removed")
