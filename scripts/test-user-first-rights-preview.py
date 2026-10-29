"""Read-only live snapshots + browser UI tests; browser writes are simulated.
No fixture accounts or changes to other users are needed.
"""
import importlib.util
import json
import subprocess

spec = importlib.util.spec_from_file_location("api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
root = api.sql("""select id from public.profiles where role::text='super_admin'
    and is_active and not coalesce(is_disabled,false) order by id limit 1""", True)[0]["id"]
aga = "223ee2d9-5a1f-4b38-9323-5d701fb096e2"
legacy = api.sql("""select id from public.profiles where role::text in
    ('company_admin','company_superintendent') and office_access_profile_code is null
    order by is_active desc,username limit 1""", True)[0]["id"]
claims = json.dumps({"sub": root, "role": "authenticated"})
query = ("begin read only;set local role authenticated;"
    f"set local request.jwt.claim.sub={api.literal(root)};"
    f"set local request.jwt.claims={api.literal(claims)};"
    "select jsonb_build_object("
    "'config',public.csvb_admin_office_access_configuration(),"
    "'options',public.csvb_admin_office_creation_options(),"
    "'roleDefaults',(select jsonb_object_agg(r->>'code',public.csvb_admin_office_role_defaults(r->>'code')) from jsonb_array_elements(public.csvb_admin_office_creation_options()->'roles') r),"
    "'companies',(select jsonb_agg(to_jsonb(c)) from public.csvb_admin_list_companies() c),"
    "'companyModules',(select jsonb_object_agg(c.id,(select jsonb_agg(to_jsonb(m)) from public.csvb_admin_list_company_modules(c.id) m)) from public.csvb_admin_list_companies() c),"
    "'users',public.csvb_admin_list_users_by_company_v2(null),"
    f"'diagnostics',jsonb_build_object({api.literal(aga)},public.csvb_admin_office_permission_diagnostic({api.literal(aga)}),"
    f"{api.literal(legacy)},public.csvb_admin_office_permission_diagnostic({api.literal(legacy)}))) snapshot;rollback;")
data = api.sql(query)[0]["snapshot"]
data.update({"aga": aga, "legacy": legacy, "root": root})
tables = ["profiles", "company_modules", "vessels", "role_permissions",
          "csvb_office_role_catalogue", "csvb_office_access_profiles",
          "csvb_office_access_profile_permissions", "csvb_office_user_permission_overrides",
          "csvb_office_access_audit", "threads", "thread_participants",
          "thread_notifications", "profile_onboard_access_log"]
def fingerprints():
    return {table: api.sql(
        f"select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) h from public.{table} t",
        True)[0]["h"] for table in tables}
before = fingerprints()
result = subprocess.run(["node", "scripts/test-user-first-rights-preview.mjs"],
    input=json.dumps(data), text=True, capture_output=True, timeout=150)
print(result.stdout)
if result.returncode:
    raise RuntimeError(result.stderr)
assert before == fingerprints(), "Live account, grant, company or history data changed"
print("Live database preservation: all 13 account/grant/company/vessel/history fingerprints unchanged.")
