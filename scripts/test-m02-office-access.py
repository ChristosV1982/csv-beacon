"""M02 Office View baseline verification; only disposable accounts are mutated."""
import importlib.util
import json
import subprocess
import uuid

spec = importlib.util.spec_from_file_location("api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
api.ACTOR = api.sql("select id from public.profiles where role='super_admin' and is_active and not is_disabled limit 1", True)[0]["id"]
vessel = api.sql("""select v.id,v.company_id from public.vessels v join public.companies c on c.id=v.company_id
 where v.is_active and c.is_active order by (c.company_name ilike '%Internal%') desc,v.name limit 1""", True)[0]
api.COMPANY = vessel["company_id"]
api.ROLE = api.sql("select code from public.csvb_office_role_catalogue where display_name='Technical Superintendent'", True)[0]["code"]
permission = api.sql("""select a.id from public.app_permissions a join public.app_modules m on m.id=a.module_id
 where m.code='M02_SHIP_INSPECTION_REPORT' and a.action='view'""", True)[0]["id"]
roles = api.sql("""select c.code,c.display_name,c.default_access_profile_code,ap.legacy_baseline::text legacy
 from public.csvb_office_role_catalogue c join public.csvb_office_access_profiles ap
 on ap.code=c.default_access_profile_code where c.is_active and c.is_assignable and ap.is_active
 order by c.code""", True)
company_vessels = {v["id"] for v in api.sql("select id from public.vessels where company_id="+api.literal(api.COMPANY),True)}
def assign(uid, role, office=None, access=None):
    api.actor_sql("update public.profiles set role="+api.literal(role)+
        ",office_role_code="+(api.literal(office) if office else "null")+
        ",office_access_profile_code="+(api.literal(access) if access else "null")+
        " where id="+api.literal(uid)+";delete from public.profile_roles_cache where user_id="+api.literal(uid))

def context(token, company=None):
    return api.rpc("csvb_m02_context", {"p_company_id": company}, token)

def browser(session, denied=False):
    result = subprocess.run(["node","scripts/test-m02-phase1a-preview.mjs"],
        input=json.dumps({"session":session,"project":api.PROJECT,"company":api.COMPANY,
            "readOnly":not denied,"denied":denied}), text=True,capture_output=True,timeout=110)
    print(result.stdout.strip())
    assert result.returncode==0,result.stderr

try:
    uid, session = api.make_fixture("standard_office_view_only")
    token = session["access_token"]
    for role in roles:
        assign(uid, role["legacy"] or "company_superintendent", role["code"], role["default_access_profile_code"])
        status, data = context(token)
        assert status==200 and data["company_id"]==api.COMPANY and data["can_edit"] is False, {
            "role":role["display_name"],"status":status,"can_edit":data.get("can_edit"),
            "company_matches":data.get("company_id")==api.COMPANY,"error":data.get("message")}
        assert all(v["id"] in company_vessels for v in data["vessels"])
    print(f"PASS: {len(roles)} active assignable Office categories have company-scoped M02 View with no automatic Edit.")
    for security_class in ["company_admin","company_superintendent"]:
        assign(uid,security_class)
        status,data=context(token)
        assert status==200 and data["can_edit"] is False,security_class
    print("PASS: both unmigrated legacy Office security classes have M02 View only.")
    assign(uid,"company_admin")
    browser(session)
    assign(uid,"company_superintendent",api.ROLE,"standard_office_view_only")
    browser(session)
    foreign = api.sql("select id from public.companies where id<>"+api.literal(api.COMPANY)+" and is_active limit 1",True)
    if foreign:
        assert context(token,foreign[0]["id"])[0]==403
    status,_=api.rpc("csvb_m02_save_v2",{"p_report":{"company_id":api.COMPANY,
        "vessel_id":vessel["id"],"create_request_id":str(uuid.uuid4())}},token)
    assert status==403,"View-only account could save"
    status,permissions=api.rpc("csvb_my_effective_app_permissions",{},token)
    assert status==200
    assert not any(p["module_code"]=="M02_SHIP_INSPECTION_REPORT" and
        p["permission_action"] in ("edit","export","admin") and p["is_granted"] for p in permissions)
    print("PASS: backend save denied, no effective Edit/Export/Admin and foreign company rejected.")
    edit_permission = api.sql("""select a.id from public.app_permissions a join public.app_modules m on m.id=a.module_id
      where m.code='M02_SHIP_INSPECTION_REPORT' and a.action='edit'""",True)[0]["id"]
    api.actor_sql("select public.csvb_admin_office_personal_override_save("+api.literal(uid)+","+
        api.literal(edit_permission)+",'allow','company','Disposable M02 explicit Edit verification')")
    status,data=context(token)
    assert status==200 and data["can_edit"] is True
    status,saved=api.rpc("csvb_m02_save_v2",{"p_report":{"company_id":api.COMPANY,
        "vessel_id":vessel["id"],"library_version":data["library_versions"][0],
        "create_request_id":str(uuid.uuid4())}},token)
    assert status==200 and saved.get("id"),"Explicitly authorized Office Edit could not save"
    api.sql("delete from public.m02_inspection_reports where id="+api.literal(saved["id"])+" and created_by="+api.literal(uid))
    api.sql("delete from public.csvb_office_user_permission_overrides where profile_id="+api.literal(uid))
    assert context(token)[1]["can_edit"] is False
    print("PASS: explicit personal Edit allows a disposable draft save; removing it restores View-only.")
    api.actor_sql("select public.csvb_admin_office_personal_override_save("+api.literal(uid)+","+
        api.literal(permission)+",'deny','company','Disposable M02 Office baseline verification')")
    assert context(token)[0]==403,"Personal Deny was bypassed"
    browser(session,True)
    api.sql("delete from public.csvb_office_user_permission_overrides where profile_id="+api.literal(uid))
    assert context(token)[0]==200,"Inherited profile View did not restore"
    print("PASS: personal View Deny blocks RPC and direct route; removing fixture override restores inheritance.")
    for security_class in ["vessel","inspector"]:
        assign(uid,security_class)
        assert context(token)[0]==403,security_class
    assign(uid,"super_admin")
    status,data=context(token,api.COMPANY)
    assert status==200 and data["can_edit"] is True
    print("PASS: Vessel/Inspector remain denied; Super Admin remains View/Edit allowed.")
finally:
    for uid in api.CREATED:
        status,account=api.http("/auth/v1/admin/users/"+uid)
        assert status==200 and account.get("app_metadata",{}).get("office_authorization_verification")
        api.sql("delete from public.csvb_office_user_permission_overrides where profile_id="+api.literal(uid)+
            ";delete from public.csvb_office_authorization_test_subjects where profile_id="+api.literal(uid)+
            ";delete from public.m02_inspection_reports where created_by="+api.literal(uid))
        status,_=api.http("/auth/v1/admin/users/"+uid,method="DELETE")
        assert status in (200,204),"Fixture cleanup failed"
        api.sql("delete from public.profile_roles_cache where user_id="+api.literal(uid))
    print("PASS: disposable accounts removed; no existing users reassigned.")
