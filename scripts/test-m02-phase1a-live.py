"""Signed-in Preview verification. Deletes only its own temporary M02 report and login."""
import importlib.util
import json
import subprocess

spec = importlib.util.spec_from_file_location("api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
vessel = api.sql("""select v.id,v.company_id from public.vessels v join public.companies c on c.id=v.company_id
 where v.is_active and c.is_active order by (c.company_name ilike '%Internal%') desc,v.name limit 1""", True)[0]
api.COMPANY = vessel["company_id"]
history_question = api.sql("""select q.id from public.questions_master q
 join public.post_inspection_observation_items i on
 public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(q.number_base))=
 public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(coalesce(nullif(i.question_base,''),nullif(i.question_no,''),i.question_full)))
 join public.post_inspection_reports r on r.id=i.report_id
 where r.company_id=""" + api.literal(api.COMPANY) + """ and q.source_type::text='SIRE' and q.status::text='active'
 and lower(coalesce(nullif(trim(i.obs_type),''),trim(i.observation_type))) in ('negative','negative_observation')
 and coalesce(i.has_observation,true) and nullif(trim(i.observation_text),'') is not null
 and r.inspection_date between date '2025-04-28' and date '2026-10-28'
 and lower(trim(i.designation)) in ('human','hardware','process')
 and exists(select 1 from regexp_split_to_table(q.payload->>'Vessel Type',',') t where lower(trim(t))='oil')
 and upper(trim(coalesce(q.payload->>'Photo Response',''))) <> 'Y' limit 1""", True)[0]["id"]
api.ACTOR = api.sql("select id from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1", True)[0]["id"]
api.ROLE = api.sql("select code from public.csvb_office_role_catalogue where display_name='Technical Superintendent'", True)[0]["code"]
snapshot = """select md5(string_agg(to_jsonb(t)::text,'' order by id)) hash from public.%s t"""
protected = ["vessels","profiles","questions_master","post_inspection_reports","post_inspection_observation_items"]
before = {t: api.sql(snapshot % t, True)[0]["hash"] for t in protected}
try:
    uid, session = api.make_fixture("standard_office_view_only")
    status, _ = api.rpc("csvb_m02_context",{"p_company_id":api.COMPANY},session["access_token"])
    assert status==403,"M02 was auto-granted to the nine-module Office profile"
    denied = subprocess.run(["node","scripts/test-m02-phase1a-preview.mjs"],
        input=json.dumps({"session":session,"project":api.PROJECT,"company":api.COMPANY,"denied":True}),
        text=True,capture_output=True,timeout=90)
    print(denied.stdout.strip())
    if denied.returncode:
        raise RuntimeError(denied.stderr.strip() or "Denied-route verification failed")
    api.actor_sql("update public.profiles set role='company_admin',office_role_code=null,office_access_profile_code=null where id="+api.literal(uid))
    status, _ = api.rpc("csvb_m02_context",{"p_company_id":api.COMPANY},session["access_token"])
    assert status==403,"M02 was auto-granted through legacy Company Admin fallback"
    api.actor_sql("update public.profiles set role='super_admin',company_id="+api.literal(api.COMPANY)+" where id="+api.literal(uid)+";delete from public.profile_roles_cache where user_id="+api.literal(uid))
    result = subprocess.run(["node","scripts/test-m02-phase1a-preview.mjs"],
        input=json.dumps({"session":session,"project":api.PROJECT,"company":api.COMPANY,"vessel":vessel["id"],"historyQuestion":history_question}),
        text=True,capture_output=True,timeout=180)
    print(result.stdout.strip())
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "M02 Preview verification failed")
finally:
    for uid in api.CREATED:
        api.sql("delete from public.m02_inspection_reports where created_by="+api.literal(uid))
        api.sql("delete from public.csvb_office_authorization_test_subjects where profile_id="+api.literal(uid))
        api.actor_sql("update public.profiles set role='company_superintendent' where id="+api.literal(uid))
        status, _ = api.http("/auth/v1/admin/users/"+uid,method="DELETE")
        assert status==200,"Disposable login cleanup failed"
        api.sql("delete from public.profile_roles_cache where user_id="+api.literal(uid))
assert before=={t: api.sql(snapshot % t, True)[0]["hash"] for t in protected},"Protected source data changed"
print("PASS: original vessels, profiles, SIRE library and Post-Inspection data unchanged; disposable M02 report/login removed.")
