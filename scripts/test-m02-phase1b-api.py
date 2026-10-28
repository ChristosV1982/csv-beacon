"""M02-only integration checks, invoked with a disposable signed-in fixture."""
import base64
import concurrent.futures
import importlib.util
import json
import pathlib
import re
import urllib.error
import urllib.request
import uuid

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII=")

def exercise(api, uid, session, vessel):
    token = session["access_token"]
    def rpc(name, args):
        status, data = api.rpc(name, args, token)
        assert status == 200, (name, status, data)
        return data
    def edge(action, attachment_id):
        return api.http("/functions/v1/m02-attachments", {"action":action,"attachment_id":attachment_id},token)
    def upload(rid, group, payload=PNG, filename="test.png", mime="image/png"):
        boundary = "m02test" + uuid.uuid4().hex
        chunks = []
        for key, val in {"action":"upload","report_id":rid,**group}.items():
            chunks.append(("--"+boundary+'\r\nContent-Disposition: form-data; name="'+key+'"\r\n\r\n'+str(val)+'\r\n').encode())
        chunks.append(("--"+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="'+filename+'"\r\nContent-Type: '+mime+'\r\n\r\n').encode()+payload+b"\r\n")
        chunks.append(("--"+boundary+"--\r\n").encode())
        req = urllib.request.Request(api.URL+"/functions/v1/m02-attachments",data=b"".join(chunks),headers={
            "Authorization":"Bearer "+token,"apikey":api.KEY,"Content-Type":"multipart/form-data; boundary="+boundary})
        try:
            with urllib.request.urlopen(req,timeout=90) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as error: return error.code,json.load(error)

    rid = None
    try:
        context = rpc("csvb_m02_context",{"p_company_id":api.COMPANY})
        catalogue = rpc("csvb_m02_company_items",{})
        source = pathlib.Path("supabase/migrations/20261108110000_m02_phase1b.sql").read_text()
        expected = {int(n):text for n,text in re.findall(r"\((\d+),\$t\$(.*?)\$t\$\)",source)}
        assert len(catalogue)==51 and [x["item_no"] for x in catalogue]==list(range(1,52))
        assert {x["item_no"]:x["item_text"] for x in catalogue}==expected
        report = {"company_id":api.COMPANY,"vessel_id":vessel,"library_version":context["library_versions"][0],
            "create_request_id":str(uuid.uuid4()),"status":"draft","report_date":"2026-10-28",
            "details":{"last_psc_details":"Manual retained PSC detail"},"executive_summary":"Phase1B disposable check"}
        company = [{"item_no":1,"response":"Yes","comments":"Minutes checked"},{"item_no":2,"response":None,"comments":"Still pending"}]
        workspace = {"section":"company","question_search":"bridge","open_chapters":["2"]}
        saved = rpc("csvb_m02_save_v2",{"p_report":report,"p_company_items":company,"p_workspace":workspace})
        rid = saved["id"]
        loaded = rpc("csvb_m02_get_v2",{"p_report_id":rid})
        qid = loaded["answers"][0]["question_id"]
        qid2 = loaded["answers"][1]["question_id"]
        qid3 = loaded["answers"][2]["question_id"]
        assert len(loaded["company_items"])==51
        assert loaded["company_items"][0]["response"]=="Yes" and loaded["company_items"][1]["response"] is None
        assert loaded["company_items"][1]["comments"]=="Still pending"
        assert loaded["report"]["workspace_state"]==workspace
        assert all(x["response"] is None for x in loaded["answers"])
        # Retry the original request with different Company text: no overwrite.
        assert rpc("csvb_m02_save_v2",{"p_report":report,"p_company_items":[{"item_no":1,"response":"No"}]})["id"]==rid
        assert rpc("csvb_m02_get_v2",{"p_report_id":rid})["company_items"][0]["response"]=="Yes"

        status,bad=upload(rid,{"question_id":qid},b"not a PNG")
        assert status==400 and "content" in bad["error"]
        assert upload(rid,{"question_id":qid},PNG,"danger.exe","application/octet-stream")[0]==400
        assert upload(rid,{"question_id":qid},b"")[0]==413
        assert upload(rid,{"question_id":str(uuid.uuid4())})[0]==400
        assert upload(rid,{"question_id":qid,"company_item_no":1})[0]==400
        # Concurrent last-slot requests: reservations serialize in PostgreSQL.
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(lambda _:upload(rid,{"question_id":qid}),range(6)))
        assert sum(code==200 for code,_ in results)==5, [(c,d.get("error")) for c,d in results]
        assert sum("5 files" in d.get("error","") for c,d in results if c!=200)==1
        first=next(data["attachment"] for code,data in results if code==200)
        assert first["uploaded_by"]==uid and first["uploaded_at"] and first["uploaded_by_name"]
        # Combined byte limit, not per-file: 6MB+4MB passes; one more byte fails.
        six=PNG+b"\0"*(6*1024*1024-len(PNG));four=PNG+b"\0"*(4*1024*1024-len(PNG))
        assert upload(rid,{"question_id":qid2},six)[0]==200
        assert upload(rid,{"question_id":qid2},four)[0]==200
        status,bad=upload(rid,{"question_id":qid2})
        assert status==400 and "10 MB combined" in bad["error"]
        status,qfile=upload(rid,{"question_id":qid3})
        assert status==200
        assert upload(rid,{"company_item_no":1})[0]==200
        files=rpc("csvb_m02_attachments",{"p_report_id":rid})
        assert len(files)==9 and all("storage_path" not in x for x in files)
        assert all(x["report_id"]==rid for x in files)
        assert sum(x["question_id"]==qid for x in files)==5
        assert sum(x["question_id"]==qid2 for x in files)==2
        assert sum(x["question_id"]==qid3 for x in files)==1
        assert sum(x["company_item_no"]==1 for x in files)==1
        assert len(rpc("csvb_m02_get_v2",{"p_report_id":rid})["attachments"])==9
        other=rpc("csvb_m02_save_v2",{"p_report":{**report,"create_request_id":str(uuid.uuid4())}})
        assert rpc("csvb_m02_attachments",{"p_report_id":other["id"]})==[],"Files leaked across reports"
        api.sql("delete from public.m02_inspection_reports where id="+api.literal(other["id"])+" and created_by="+api.literal(uid))
        code,download=edge("download",first["id"])
        assert code==200 and "/public/" not in download["url"]
        with urllib.request.urlopen(download["url"],timeout=30) as response: assert response.read()==PNG
        # Direct browser storage access blocked, even if another broad policy exists.
        path=api.sql("select storage_path from public.m02_supporting_attachments where id="+api.literal(first["id"]),True)[0]["storage_path"]
        status,_=api.http("/storage/v1/object/authenticated/m02-supporting-evidence/"+path,token=token)
        assert status in (400,403,404)
        current=rpc("csvb_m02_get_v2",{"p_report_id":rid})["report"]
        status,error=api.rpc("csvb_m02_save_v2",{"p_report":{**current,"status":"completed"},"p_workspace":workspace},token)
        assert status==400 and error.get("code")=="23514" and "Part 3" in error["message"] and "Part 4" in error["message"]
        assert rpc("csvb_m02_get_v2",{"p_report_id":rid})["report"]==current,"Failed completion did not roll back atomically"
        full=rpc("csvb_m02_get_v2",{"p_report_id":rid})
        completed_company=[{"item_no":x["item_no"],"response":["Yes","No","N/S"][i%3],"comments":x["comments"]} for i,x in enumerate(full["company_items"])]
        rpc("csvb_m02_save_v2",{"p_report":current,"p_company_items":completed_company})
        current=rpc("csvb_m02_get_v2",{"p_report_id":rid})["report"]
        status,error=api.rpc("csvb_m02_save",{"p_report":{**current,"status":"completed"},"p_answers":[]},token)
        assert status==400 and "Part 4" in error["message"] and "Part 3:" not in error["message"],"Legacy save bypassed required SIRE answers"
        completed_answers=[{"question_id":x["question_id"],"response":["Yes","No","N/A","N/S"][i%4],"comments":x["comments"]} for i,x in enumerate(full["answers"])]
        critical=rpc("csvb_m02_critical_items",{"p_company_id":api.COMPANY})
        result=rpc("csvb_m02_save_v3",{"p_report":{**current,"status":"completed"},"p_answers":completed_answers,"p_company_items":completed_company,"p_workspace":workspace,
            "p_appendices":{"records":[],"critical_items":[{"item_no":x["item_no"],"response":"N/A"} for x in critical]}})
        assert result["status"]=="completed"
        print("PASS completion: Draft with blanks; atomic rejection with section counts; legacy save cannot bypass; Yes/No/N/A/N/S accepted; all answers saved and Completed in one transaction.")
        assert edge("delete",first["id"])[0]==400
        assert upload(rid,{"question_id":qid3})[0]==400
        current=rpc("csvb_m02_get_v2",{"p_report_id":rid})["report"]
        rpc("csvb_m02_save_v2",{"p_report":{**current,"status":"draft"},"p_company_items":company,"p_workspace":workspace})
        assert edge("delete",first["id"])[0]==200
        assert len(rpc("csvb_m02_attachments",{"p_report_id":rid}))==8
        assert edge("delete",first["id"])[0]==200 # idempotent removal
        # Office now has default M02 View. Use an ungranted Inspector security
        # class to verify denial while retaining the same real JWT/identity.
        api.actor_sql("update public.profiles set role='inspector' where id="+api.literal(uid)+
            ";delete from public.profile_roles_cache where user_id="+api.literal(uid))
        assert edge("download",qfile["attachment"]["id"])[0]==403
        assert api.rpc("csvb_m02_get_v2",{"p_report_id":rid},token)[0]==403
        api.actor_sql("update public.profiles set role='super_admin' where id="+api.literal(uid)+
            ";delete from public.profile_roles_cache where user_id="+api.literal(uid))
        print("PASS M02 API: exact 51 texts; save/reopen/workspace/blank preservation; create retry; real SIRE-question uploads; per-question 5-file concurrency and exact 10MB total; question/report isolation; Company attachments retained; type/signature/zero rejection; metadata; signed download; direct storage denied; Completed mutation denied; idempotent draft deletion; unauthorized read/download denied.")
    finally:
        if rid:
            # Test-owned report/files only; remove private bytes before metadata.
            paths=api.sql("select storage_path from public.m02_supporting_attachments where report_id="+api.literal(rid),True)
            if paths:
                status,_=api.http("/storage/v1/object/m02-supporting-evidence",{"prefixes":[x["storage_path"] for x in paths]},method="DELETE")
                assert status==200,"Test private-file cleanup failed"
            api.sql("delete from public.m02_supporting_attachments where report_id="+api.literal(rid)+
                ";delete from public.m02_inspection_reports where id="+api.literal(rid)+" and created_by="+api.literal(uid))
