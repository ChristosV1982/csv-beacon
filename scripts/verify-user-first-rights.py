"""Testing-only targeted AGA grant through existing audited RPCs.

Default is read-only. --apply-aga is an explicit, atomic two-permission action.
No auth users, profile assignments, shared grants or schema are changed.
"""
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("office_api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

AGA = "223ee2d9-5a1f-4b38-9323-5d701fb096e2"
COMPANY = "381b3b4f-0fbd-4f30-bafe-450baa410a04"
root = api.sql("""select id from public.profiles where role::text='super_admin'
    and is_active and not coalesce(is_disabled,false) order by id limit 1""", True)
assert root, "No active authorized Super Admin"
actor = root[0]["id"]


def context(uid, query, write=False):
    prefix = "begin;" if write else "begin read only;"
    claims = json.dumps({"sub": uid, "role": "authenticated"})
    return api.sql(prefix + "set local role authenticated;"
        f"set local request.jwt.claim.sub={api.literal(uid)};"
        f"set local request.jwt.claims={api.literal(claims)};" + query +
        (";commit;" if write else ";rollback;"))


def snapshot():
    tables = ["profiles", "role_permissions", "company_modules", "app_modules", "app_permissions",
              "csvb_office_access_profiles", "csvb_office_access_profile_permissions",
              "csvb_office_role_catalogue"]
    result = {}
    for table in tables:
        result[table] = api.sql(
            f"select md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) hash "
            f"from public.{table} t", True)[0]["hash"]
    result["other_overrides"] = api.sql(f"""select md5(coalesce(string_agg(to_jsonb(t)::text,''
        order by to_jsonb(t)::text),'')) hash from public.csvb_office_user_permission_overrides t
        where not (profile_id={api.literal(AGA)} and permission_id in
          (select a.id from public.app_permissions a join public.app_modules m on m.id=a.module_id
           where m.code='POST_INSPECTION' and a.action in ('view','edit')))""", True)[0]["hash"]
    result["auth_identity_status"] = api.sql("""select md5(coalesce(string_agg(
        jsonb_build_array(id,email,banned_until,deleted_at,updated_at)::text,''
        order by id),'')) hash from auth.users""", True)[0]["hash"]
    return result


subject = api.sql(f"""select username,company_id,role,is_active,is_disabled,office_access_profile_code
    from public.profiles where id={api.literal(AGA)}""", True)[0]
assert subject["username"].lower() == "aga" and subject["company_id"] == COMPANY
assert subject["is_active"] and not subject["is_disabled"]
assert subject["office_access_profile_code"] == "company_administrator_access"
permissions = api.sql("""select a.id,a.action from public.app_permissions a join public.app_modules m
    on m.id=a.module_id where m.code='POST_INSPECTION' and a.action in ('view','edit')""", True)
assert len(permissions) == 2
ids = {p["action"]: p["id"] for p in permissions}
before = snapshot()
diagnostic = context(actor, f"select public.csvb_admin_office_permission_diagnostic({api.literal(AGA)}) d")[0]["d"]
assert diagnostic["enforcement_enabled"], "Office enforcement not active"
for p in diagnostic["permissions"]:
    if p["permission_id"] in ids.values():
        d = p["decision"]
        assert not (d["source"] == "hard_constraint" and not d["allowed"]), d.get("reason")

if "--apply-aga" in sys.argv:
    calls = "\n".join(
        "perform public.csvb_admin_office_personal_override_save("
        f"{api.literal(AGA)},{api.literal(ids[action])},'allow','company',"
        "'User-approved testing-only targeted AGA Post-Inspection View/Edit grant; shared profiles unchanged');"
        for action in ["view", "edit"])
    # Both existing RPC calls and backend diagnostic assertions share one transaction.
    context(actor, f"""
      do $grant$
      declare before_d jsonb; after_d jsonb; old_other jsonb; new_other jsonb; entry jsonb;
      begin
        before_d:=public.csvb_admin_office_permission_diagnostic({api.literal(AGA)});
        if not (before_d->>'enforcement_enabled')::boolean then
          raise exception 'Office enforcement unavailable';
        end if;
        for entry in select value from jsonb_array_elements(before_d->'permissions')
          where value->>'module_code'='POST_INSPECTION' and value->>'action' in ('view','edit')
        loop
          if entry->'decision'->>'source'='hard_constraint' and not (entry->'decision'->>'allowed')::boolean then
            raise exception 'Hard restriction prevents grant: %',entry->'decision'->>'reason';
          end if;
        end loop;
        {calls}
        after_d:=public.csvb_admin_office_permission_diagnostic({api.literal(AGA)});
        if (select count(*) from jsonb_array_elements(after_d->'permissions') p
            where p->>'module_code'='POST_INSPECTION' and p->>'action' in ('view','edit')
              and (p->'decision'->>'allowed')::boolean
              and p->'decision'->>'source'='personal_allow')<>2 then
          raise exception 'Backend did not confirm both targeted grants';
        end if;
        select jsonb_agg(value order by value->>'permission_id') into old_other
          from jsonb_array_elements(before_d->'permissions')
          where not (value->>'module_code'='POST_INSPECTION' and value->>'action' in ('view','edit'));
        select jsonb_agg(value order by value->>'permission_id') into new_other
          from jsonb_array_elements(after_d->'permissions')
          where not (value->>'module_code'='POST_INSPECTION' and value->>'action' in ('view','edit'));
        if old_other is distinct from new_other then raise exception 'Unrelated effective rights changed'; end if;
      end $grant$;
      select 'AGA View/Edit audited and backend-verified' result
    """, True)

after = snapshot()
assert before == after, "Unrelated account/configuration snapshot changed"
result = context(AGA, """select jsonb_build_object(
    'view',public.csvb_office_authorize_module('POST_INSPECTION','view'),
    'edit',public.csvb_office_authorize_module('POST_INSPECTION','edit'),
    'export',public.csvb_office_authorize_module('POST_INSPECTION','export'),
    'admin',public.csvb_office_authorize_module('POST_INSPECTION','admin'),
    'outside_company',public.csvb_office_authorize_module('POST_INSPECTION','view',
       '00000000-0000-0000-0000-000000000001',null),
    'platform_admin',public.csvb_office_authorize_module('SU_ADMIN','view'),
    'effective_rows',(select jsonb_agg(to_jsonb(p)) from public.csvb_my_effective_app_permissions() p
      where module_code='POST_INSPECTION')) outcome""")[0]["outcome"]
if "--apply-aga" in sys.argv:
    assert result["view"] and result["edit"], result
assert not any(result[k] for k in ["export", "admin", "outside_company", "platform_admin"]), result
print(json.dumps({"testing_project": api.PROJECT, "applied": "--apply-aga" in sys.argv,
    "AGA": result, "unrelated_configuration_and_accounts_unchanged": before == after}, indent=2))
