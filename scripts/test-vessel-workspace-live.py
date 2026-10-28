"""Development-only vessel editor verification; restores the edited field."""
import importlib.util
import json
import os
import pathlib
import subprocess

spec = importlib.util.spec_from_file_location("office_test", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
before = api.sql("select jsonb_agg(to_jsonb(v) order by id) rows from public.vessels v", True)[0]["rows"]
profiles_before = api.sql("select md5(string_agg(to_jsonb(p)::text,'' order by id)) hash from public.profiles p", True)[0]["hash"]
vessel = next((v for v in before if v["name"] == "OLYMPIC FIGHTER"), before[0])
actor = api.sql("select id from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1", True)[0]["id"]
api.ACTOR, api.COMPANY = actor, vessel["company_id"]
api.ROLE = api.sql("select code from public.csvb_office_role_catalogue where display_name='Technical Superintendent'", True)[0]["code"]
payload = {
    "p_vessel_id": vessel["id"], "p_name": vessel["name"],
    "p_hull_number": vessel["hull_number"], "p_imo_number": str(vessel["imo_number"]) if vessel["imo_number"] else None,
    "p_call_sign": vessel["call_sign"], "p_date_delivered": vessel["date_delivered"]
}
try:
    visual_only = os.environ.get("VESSEL_WORKSPACE_VISUAL_ONLY") == "1"
    if not visual_only:
        api.sql(pathlib.Path("supabase/tests/vessel_particulars_editor.sql").read_text())
        print("PASS: rollback Add/Edit/lifecycle/identity/validation checks")
    uid, session = api.make_fixture("standard_office_view_only")
    api.actor_sql("update public.profiles set role='company_admin',office_access_profile_code=null,"
        "office_role_code=null where id=" + api.literal(uid) +
        ";delete from public.profile_roles_cache where user_id=" + api.literal(uid))
    status, error = api.rpc("csvb_admin_update_vessel_particulars", payload, session["access_token"])
    assert status in (400, 403) and ("admin" in str(error).lower() or "permission" in str(error).lower())
    print("PASS: legacy Company Admin cannot use Super Admin particulars editor")
    api.actor_sql("update public.profiles set role='super_admin' where id=" + api.literal(uid) +
        ";delete from public.profile_roles_cache where user_id=" + api.literal(uid))
    status, history_before = api.rpc("csvb_admin_vessel_status_history",
        {"p_vessel_id": vessel["id"]}, session["access_token"])
    assert status == 200
    browser = subprocess.run(["node", "scripts/test-vessel-workspace-preview.mjs"],
        input=json.dumps({"session": session, "project": api.PROJECT, "vessel": vessel, "readOnly": visual_only}),
        text=True, capture_output=True, timeout=150)
    print(browser.stdout.strip())
    if browser.returncode:
        raise RuntimeError(browser.stderr.strip() or "Preview checks failed")
    status, history_after = api.rpc("csvb_admin_vessel_status_history",
        {"p_vessel_id": vessel["id"]}, session["access_token"])
    assert status == 200 and history_before == history_after, "Lifecycle history changed"
    print("PASS: lifecycle history unchanged")
finally:
    # Browser saves/reverts through the real UI. This fallback is only for a
    # failed browser run, and only restores the marker written by this test.
    original = "null" if vessel["call_sign"] is None else api.literal(vessel["call_sign"])
    api.sql("update public.vessels set call_sign=" + original +
        " where id=" + api.literal(vessel["id"]) + " and call_sign='UXVERIFY'")
    for uid in api.CREATED:
        api.sql("delete from public.csvb_office_authorization_test_subjects where profile_id=" + api.literal(uid))
        api.actor_sql("update public.profiles set role='company_superintendent' where id=" + api.literal(uid))
        status, _ = api.http("/auth/v1/admin/users/" + uid, method="DELETE")
        assert status == 200, "Disposable account cleanup failed"
        api.sql("delete from public.profile_roles_cache where user_id=" + api.literal(uid))
after = api.sql("select jsonb_agg(to_jsonb(v) order by id) rows from public.vessels v", True)[0]["rows"]
profiles_after = api.sql("select md5(string_agg(to_jsonb(p)::text,'' order by id)) hash from public.profiles p", True)[0]["hash"]
assert before == after and profiles_before == profiles_after
print("PASS: all original vessels and profiles restored exactly; no lost/duplicate vessels")
