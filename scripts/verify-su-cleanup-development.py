"""Explicit development-only verification using newly created, isolated fixture accounts.
Never selects legacy accounts for deletion. Secrets/passwords/tokens stay in memory.
"""
import json, os, secrets, pathlib, uuid, urllib.request, urllib.error

REF = "bdidrcyufazskpuwmfca"
URL = f"https://{REF}.supabase.co"
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
MH = {"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"], "Content-Type": "application/json"}
SH = {"Authorization": "Bearer " + SERVICE, "apikey": SERVICE, "Content-Type": "application/json"}
fixtures = {}
prefix = "cleanup_verify_" + secrets.token_hex(5)

def http(url, method="GET", body=None, headers=None):
    req = urllib.request.Request(url, method=method, headers=headers or SH,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        r = urllib.request.urlopen(req, timeout=60)
        text = r.read().decode()
        return r.status, json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try: data = json.loads(text)
        except ValueError: data = {"error": text[:500]}
        return e.code, data

def sql(query, readonly=True):
    status, data = http(f"https://api.supabase.com/v1/projects/{REF}/database/query", "POST",
                        {"query": query, "read_only": readonly}, MH)
    assert status < 300, data
    return data

def rest(path, method="GET", body=None):
    status, data = http(URL + "/rest/v1/" + path, method, body,
                        {**SH, "Prefer": "return=representation,resolution=merge-duplicates"})
    assert status < 300, data
    return data

def record_fixture(uid, role, username):
    fixtures[uid] = {"role": role, "username": username}
    pathlib.Path("/tmp/csvb-cleanup-fixtures.json").write_text(json.dumps(fixtures))

def create_fixture(role, number, context):
    username = f"{prefix}_{number}"
    password = secrets.token_urlsafe(32)
    code, data = http(URL + "/auth/v1/admin/users", "POST",
                      {"email": username + "@csvtest.local", "password": password, "email_confirm": True})
    assert code < 300, data
    uid = data.get("id") or data["user"]["id"]
    record_fixture(uid, role, username)
    rest("profiles", "POST", {"id": uid, "username": username, "role": role,
         "company_id": context["company_id"], "vessel_id": context["id"] if role == "vessel" else None,
         "first_name": "Cleanup", "last_name": "Verification", "is_active": True, "is_disabled": False})
    return uid, username, password

code, project = http(f"https://api.supabase.com/v1/projects/{REF}", headers=MH)
assert code == 200 and project["id"] == REF
baseline_sql = """select (select count(*) from public.vessels) vessel_count,
 (select md5(string_agg(to_jsonb(v)::text,',' order by v.id)) from public.vessels v) vessel_hash,
 (select count(*) from public.profiles where role::text<>'vessel') office_count,
 (select md5(string_agg(to_jsonb(p)::text,',' order by p.id)) from public.profiles p where role::text<>'vessel') office_hash,
 (select count(*) from public.profiles where role::text='vessel') vessel_users,
 (select count(*) from auth.users) auth_users"""
baseline = sql(baseline_sql)[0]
context = sql("select id,company_id from public.vessels where is_active and company_id is not null order by id limit 1")[0]
office = sql("select id from public.profiles where role::text<>'vessel' order by id limit 1")[0]["id"]
unselected = str(uuid.uuid4())  # Never use a real legacy account as a negative-test deletion target.
admin, admin_name, password = create_fixture("super_admin", "admin", context)
users = [create_fixture("vessel", str(n), context)[0] for n in (1, 2)]
code, session = http(URL + "/auth/v1/token?grant_type=password", "POST",
                     {"email": admin_name + "@csvtest.local", "password": password})
assert code == 200, session
AH = {**SH, "Authorization": "Bearer " + session["access_token"]}
def action(body):
    return http(URL + "/functions/v1/su-admin-delete-user", "POST", body, AH)
def rpc(name, args):
    code, data = http(URL + "/rest/v1/rpc/" + name, "POST", args)
    assert code < 300, data
    return data

# Self-authored history/notifications exercise SET NULL/cascade ordering.
event = sql("select change_type from public.profile_onboard_access_log limit 1")
event = event[0]["change_type"] if event else "update"
for uid in users:
    rest("profile_onboard_access_log", "POST", {"profile_id": uid, "changed_by": uid,
         "change_type": event, "reason": "Isolated cleanup verification", "old_row": {}, "new_row": {"test": True}})
    rest("profile_roles_cache", "POST", {"user_id": uid, "role": "vessel"})
event = sql("select event_type from public.thread_notifications limit 1")
event = event[0]["event_type"] if event else "mention"
rest("thread_notifications", "POST", {"user_id": users[0], "created_by": users[0],
     "company_id": context["company_id"], "event_type": event, "title": "Cleanup verification only"})
logs = {uid: rest(f"profile_onboard_access_log?profile_id=eq.{uid}") for uid in users}

assert action({"action": "prepare_user_deletions", "user_ids": [admin]})[0] == 409
assert action({"action": "prepare_user_deletions", "user_ids": [users[0], office]})[0] == 409
code, prepared = action({"action": "prepare_user_deletions", "user_ids": users})
assert code == 200, prepared
job = prepared["job_id"]
assert action({"action": "delete_user", "job_id": job, "user_id": users[0]})[0] == 403
assert action({"action": "confirm_user_deletions", "job_id": job,
               "confirmation_token": prepared["confirmation_token"]})[0] == 200
assert action({"action": "delete_user", "job_id": job, "user_id": unselected})[0] == 403
code, result = action({"action": "delete_user", "job_id": job, "user_id": users[0]})
assert code == 200 and result["status"] == "completed", result
assert action({"action": "delete_user", "job_id": job, "user_id": users[0]})[1]["status"] == "already_deleted"

# Simulate browser/connection loss after Auth deletion, before cache finalization.
claim = rpc("csvb_su_cleanup_claim", {"p_job_id": job, "p_user_id": users[1], "p_actor_id": admin})
assert claim["state"] == "processing"
assert users[1] in fixtures and fixtures[users[1]]["role"] == "vessel"
code, result = http(URL + "/auth/v1/admin/users/" + users[1], "DELETE")
assert code < 300, result
sql(f"update public.su_user_cleanup_items set lease_expires_at=now()-interval '1 second' where job_id='{job}' and user_id='{users[1]}'", False)
code, result = action({"action": "delete_user", "job_id": job, "user_id": users[1]})
assert code == 200 and result["status"] == "completed", result
for uid in users:
    assert not rest("profiles?id=eq." + uid)
    assert not rest("profile_roles_cache?user_id=eq." + uid)
    archive = rest("su_deleted_user_identities?original_user_id=eq." + uid)[0]
    assert archive["identity"]["username"] == fixtures[uid]["username"] and archive["cleanup_completed_at"]
    copied = rest("su_deleted_user_onboard_logs?original_user_id=eq." + uid)
    for log in logs[uid]:
        assert any(row["source_record"] == log for row in copied), "Original onboard history not preserved"
assert not rest("thread_notifications?user_id=eq." + users[0])
code, progress = action({"action": "get_user_deletion_job", "job_id": job})
assert code == 200 and all(i["status"] == "completed" for i in progress["job"]["items"])
print("PASS live two-user subset: archive, self/Office/unselected rejection, Auth/profile/cache cleanup, duplicate skip, interrupted-finalization resume, exact onboard log preservation.")

# Dispose ONLY the temporary test administrator, after ending its session.
# If registration generated account history, archive that fixture history first.
code, _ = http(URL + "/auth/v1/logout", "POST", {}, AH)
assert code < 300
admin_logs = rest("profile_onboard_access_log?profile_id=eq." + admin)
if admin_logs:
    ident = rpc("csvb_su_cleanup_identity", {"p_user_id": admin})
    rest("su_deleted_user_identities", "POST", {"original_user_id": admin, "identity": ident, "archived_by": admin})
    for log in admin_logs:
        sql("insert into public.su_deleted_user_onboard_logs(original_user_id,original_log_id,source_record,source_fingerprint,archived_by) "
            f"select '{admin}',id,to_jsonb(l),md5(to_jsonb(l)::text),'{admin}' from public.profile_onboard_access_log l "
            f"where id='{log['id']}' on conflict do nothing", False)
    # Exact fixture-only cleanup, preserving its archived copies.
    sql(f"delete from public.profile_onboard_access_log where profile_id='{admin}'", False)
assert admin in fixtures and fixtures[admin]["role"] == "super_admin"
code, result = http(URL + "/auth/v1/admin/users/" + admin, "DELETE")
assert code < 300, result
rest("profile_roles_cache?user_id=eq." + admin, "DELETE")
final = sql(baseline_sql)[0]
assert final == baseline, {"baseline": baseline, "final": final}
print(f"PASS unchanged baseline: {final['vessel_count']} vessels (all fields), {final['office_count']} original Office profiles (all fields), {final['vessel_users']} legacy vessel users, {final['auth_users']} original Auth users. Only isolated verification users were removed.")
