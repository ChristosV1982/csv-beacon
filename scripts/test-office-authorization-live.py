"""Real JWT/REST verification using disposable accounts; never prints credentials.

Run before global activation. Only fixtures are entered in the owner-only test
subject table. Existing users are never reassigned. Fixtures are removed in finally.
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request
import uuid

PROJECT = "bdidrcyufazskpuwmfca"
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
assert PROJECT in URL, "Unexpected Supabase project"
MANAGEMENT = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
RESULTS = []
CREATED = []


def http(path, body=None, token=None, method=None):
    headers = {"apikey": KEY, "Authorization": "Bearer " + (token or KEY),
               "Content-Type": "application/json"}
    req = urllib.request.Request(URL + path, headers=headers,
                                 data=None if body is None else json.dumps(body).encode(),
                                 method=method)
    try:
        response = urllib.request.urlopen(req, timeout=90)
        data = response.read()
        return response.status, json.loads(data) if data else None
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except ValueError:
            return e.code, None


def sql(query, readonly=False):
    headers = {"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"],
               "Content-Type": "application/json"}
    req = urllib.request.Request(MANAGEMENT, headers=headers,
        data=json.dumps({"query": query, "read_only": readonly}).encode())
    try:
        return json.load(urllib.request.urlopen(req, timeout=90))
    except urllib.error.HTTPError as e:
        raise RuntimeError("Database verification failed: " + e.read().decode()[:700])


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def check(name, condition):
    RESULTS.append({"test": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


def actor_sql(query):
    return sql("begin;select set_config('request.jwt.claim.sub'," + literal(ACTOR) +
               ",true);select set_config('request.jwt.claims'," +
               literal(json.dumps({"sub": ACTOR, "role": "authenticated"})) +
               ",true);" + query + ";commit;")


def make_fixture(profile):
    username = "OAV" + uuid.uuid4().hex[:16]
    password = secrets.token_urlsafe(28)
    status, user = http("/auth/v1/admin/users", {
        "email": username.lower() + "@csvtest.local", "password": password,
        "email_confirm": True, "app_metadata": {"office_authorization_verification": True},
    }, method="POST")
    check("Create disposable Auth fixture", status in (200, 201) and bool(user.get("id")))
    uid = user["id"]
    CREATED.append(uid)
    actor_sql(f"""
      insert into public.profiles(id,username,role,company_id,is_active,is_disabled,
        office_role_code,office_access_profile_code,force_password_reset)
      values({literal(uid)},{literal(username)},'company_superintendent',{literal(COMPANY)},
        true,false,{literal(ROLE)},{literal(profile)},false)
      on conflict(id) do update set username=excluded.username,role=excluded.role,
        company_id=excluded.company_id,is_active=true,is_disabled=false,
        office_role_code=excluded.office_role_code,
        office_access_profile_code=excluded.office_access_profile_code,force_password_reset=false;
      insert into public.csvb_office_authorization_test_subjects(profile_id)
        values({literal(uid)})""")
    status, session = http("/auth/v1/token?grant_type=password", {
        "email": username.lower() + "@csvtest.local", "password": password,
    }, method="POST")
    check("Sign in disposable fixture", status == 200 and bool(session.get("access_token")))
    return uid, session


def rpc(name, args, token):
    return http("/rest/v1/rpc/" + name, args, token, "POST")

def browser_verify(session):
    import subprocess
    result = subprocess.run(["node", "scripts/test-office-authorization-preview.mjs"],
        input=json.dumps({"session": session, "project": PROJECT}), text=True,
        capture_output=True, timeout=150)
    print(result.stdout.strip())
    if result.returncode and result.stderr:
        print("Browser harness error:", result.stderr[-1200:])
    check("Authenticated Preview verification", result.returncode == 0)


def main():
    global ACTOR, COMPANY, ROLE
    context = sql("""select jsonb_build_object(
      'actor',(select id from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1),
      'company',(select id from public.companies where company_name ilike '%Internal%' limit 1),
      'role',(select code from public.csvb_office_role_catalogue where display_name='Technical Superintendent'),
      'state',(select enforcement_enabled from public.csvb_office_authorization_state)) data""", True)[0]["data"]
    ACTOR, COMPANY, ROLE = context["actor"], context["company"], context["role"]
    expected_active = "--active" in sys.argv
    check("Global enforcement active" if expected_active else "Global activation remains off during verification",
          context["state"] is expected_active)
    try:
        first, session = make_fixture("standard_office_view_only")
        second, session2 = make_fixture("standard_office_view_only")
        token, token2 = session["access_token"], session2["access_token"]
        if os.environ.get("OFFICE_BROWSER_ONLY") != "1":
            from pathlib import Path
            sql(Path("supabase/tests/office_authorization_compatibility.sql").read_text().replace("__FIXTURE__", second))
            check("Legacy Office, Super Admin, Vessel, Inspector and Coordinator baseline compatibility", True)
            check("Rights Matrix profile save / diagnostics / audit (rolled back)", True)
            if os.environ.get("OFFICE_COMPAT_ONLY") == "1":
                return
        if os.environ.get("OFFICE_BROWSER_ONLY") == "1":
            browser_verify(session2)
            return
        status, permissions = rpc("csvb_my_effective_app_permissions", {}, token)
        expected = set([
            "SIRE_QUESTIONS_VIEWER", "SIRE_FLEET_VETTING_EXPERIENCE", "VETTING_INSPECTION_PLANNER",
            "POST_INSPECTION", "POST_INSPECTION_STATS", "INSPECTOR_INTELLIGENCE",
            "MOORING_ANCHORING_INVENTORIES", "PORT_CALL_INTELLIGENCE",
            "PORTABLE_LIFTING_APPLIANCES_WIRES", "M02_SHIP_INSPECTION_REPORT",
        ])
        check("Nine business View modules plus the approved M02 Office View baseline", status == 200 and
              {p["module_code"] for p in permissions if p["permission_action"] == "view" and
               p["module_code"] not in ("Q_DASHBOARD", "MODE_SELECTION")} == expected)
        check("No Edit/Export/Admin/review grants",
              not any(p["permission_action"] != "view" for p in permissions))
        for name, args in [
            ("csvb_questions_master_for_me", {}),
            ("csvb_fleet_vetting_experience_context", {"p_company_id": COMPANY}),
            ("csvb_vetting_inspection_planner_for_me_v2", {}),
            ("csvb_post_inspection_reports_for_me_v2", {}),
            ("csvb_inspectors_for_me", {}),
            ("mai_operation_port_countries", {}),
        ]:
            status, data = rpc(name, args, token)
            check("View reader " + name, status == 200)
        for table in ["mai_v_components_list", "pci_v_call_report_register",
                      "pla_v_components_list", "post_inspection_observation_items"]:
            status, _ = http("/rest/v1/" + table + "?select=*&limit=1", token=token)
            check("View relation " + table, status == 200)
        for name in ["mai_record_vessel_operation", "mai_register_component",
                     "csvb_vetting_inspection_plan_save_v2",
                     "csvb_fve_response_draft", "pla_register_component",
                     "csvb_store_post_inspection_risk_snapshots_all_profiles",
                     "su_admin_sql", "csvb_admin_list_users_by_company_v2"]:
            # Supply the actual argument names. Invalid signatures are rejected
            # by PostgREST before a function invocation/pre-request transaction.
            signatures = sql("select p.proargnames,p.pronargs from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
                " where n.nspname='public' and p.proname=" + literal(name) +
                " order by p.pronargs desc limit 1", True)
            args = {n: None for n in signatures[0]["proargnames"][:signatures[0]["pronargs"]]} if signatures else {}
            status, data = rpc(name, args, token)
            check("Deny RPC " + name + " HTTP " + str(status), status == 403)
        for table in ["post_inspection_reports", "pci_port_calls", "inspectors", "mai_components"]:
            status, _ = http("/rest/v1/" + table, {}, token, "POST")
            check("Deny table insert " + table, status == 403)
        for slug in ["import-post-inspection-pdf", "suggest-post-inspection-mscat",
                     "backfill-post-inspection-mscat-ai", "backfill-audit-observations-mscat-ai",
                     "su-admin"]:
            status, _ = http("/functions/v1/" + slug, {}, token, "POST")
            check("Deny privileged Edge " + slug, status == 403)
        for payload in [
            {"viewer_type": "RISQ"}, {"viewer_type": "RIGHTSHIP"},
            {"viewerType": " RightShip "}, {"source_kind": "RISQ_3_2"},
            {"viewer_type": "RIGHTSHIP", "source_kind": "SIRE"},
        ]:
            status, _ = http("/functions/v1/sire-viewer-ai-search", payload, token, "POST")
            check("Viewer discriminator denies ungranted RISQ: " + json.dumps(payload), status == 403)
        status, _ = http("/functions/v1/sire-viewer-ai-search",
            {"viewer_type": "SIRE", "source_kind": "RIGHTSHIP"}, token, "POST")
        check("Viewer discriminator preserves SIRE field precedence", status != 403)
        status, _ = http("/storage/v1/object/mai-evidence/" + first + "/denied.txt",
                         {"data": "denied"}, token, "POST")
        check("Deny storage upload", status in (400, 403))
        # This operation creates no business data: only an explicit, audited override.
        permission = sql("""select a.id from public.app_permissions a
          join public.app_modules m on m.id=a.module_id
          where m.code='THREADS' and a.action='view'""", True)[0]["id"]
        enabled = sql("select exists(select 1 from public.company_modules where company_id=" +
                      literal(COMPANY) + " and module_key='threads' and is_enabled) enabled", True)[0]["enabled"]
        check("Extra module already company-enabled", enabled)
        actor_sql(f"""select public.csvb_admin_office_personal_override_save(
          {literal(first)},{literal(permission)},'allow','company','Isolated authorization verification')""")
        status, rows = rpc("csvb_my_effective_app_permissions", {}, token)
        check("Personal Allow grants extra module", status == 200 and any(
            p["module_code"] == "THREADS" and p["match_type"] == "personal_allow" for p in rows))
        status, rows = rpc("csvb_my_effective_app_permissions", {}, token2)
        check("Personal Allow does not affect another user", status == 200 and not any(
            p["module_code"] == "THREADS" for p in rows))
        permission = sql("""select a.id from public.app_permissions a
          join public.app_modules m on m.id=a.module_id
          where m.code='POST_INSPECTION' and a.action='view'""", True)[0]["id"]
        actor_sql(f"""select public.csvb_admin_office_personal_override_save(
          {literal(first)},{literal(permission)},'deny',null,'Isolated authorization verification')""")
        status, allowed = rpc("csvb_office_authorize_module",
            {"p_module": "POST_INSPECTION", "p_action": "view"}, token)
        check("Personal Deny overrides profile View", status == 200 and allowed is False)
        status, allowed = rpc("csvb_office_authorize_module",
            {"p_module": "POST_INSPECTION", "p_action": "view"}, token2)
        check("Personal Deny affects only selected user", status == 200 and allowed is True)
        status, allowed = rpc("csvb_office_authorize_module",
            {"p_module": "SIRE_QUESTIONS_VIEWER", "p_action": "view", "p_company_id": str(uuid.uuid4())}, token2)
        check("Company boundary cannot be overridden", status == 200 and allowed is False)
        status, allowed = rpc("csvb_office_authorize_module",
            {"p_module": "MOORING_ANCHORING_INVENTORIES", "p_action": "view",
             "p_vessel_id": str(uuid.uuid4())}, token2)
        check("Vessel boundary cannot be overridden", status == 200 and allowed is False)
        # Optional browser harness receives credentials only over process stdin.
        if os.environ.get("OFFICE_BROWSER_VERIFY") == "1":
            browser_verify(session2)
    finally:
        failures = []
        for uid in CREATED:
            # Explicitly verify this is our disposable fixture before deleting.
            status, account = http("/auth/v1/admin/users/" + uid)
            if status != 200 or not account.get("app_metadata", {}).get("office_authorization_verification"):
                failures.append(uid)
                continue
            sql("delete from public.csvb_office_authorization_test_subjects where profile_id=" + literal(uid))
            sql("delete from public.csvb_office_user_permission_overrides where profile_id=" + literal(uid))
            status, _ = http("/auth/v1/admin/users/" + uid, method="DELETE")
            if status not in (200, 204):
                failures.append(uid)
            else:
                sql("delete from public.profile_roles_cache where user_id=" + literal(uid))
        RESULTS.append({"test": "Disposable accounts cleaned up", "passed": not failures})
        print(json.dumps({"results": RESULTS, "passed": sum(x["passed"] for x in RESULTS),
                          "failed": sum(not x["passed"] for x in RESULTS)}))
        if failures:
            raise AssertionError("Disposable account cleanup needs attention")


if __name__ == "__main__":
    main()
