"""M02 appendix regression checks using only a caller-owned disposable report."""
import base64
import json
import urllib.error
import urllib.request
import uuid

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRuoAAAAASUVORK5CYII=")
NAMES = ["M/E trips","M/E crankcase oil mist detector","D/Gs emergency shut-downs related to main switchboard","Emergency D/G",
 "Emergency Batteries and charger for communication equipment","Emergency air compressor","Emergency fire pump","Fixed fire extinguishing systems",
 "Fire detection and alarm system","Remote shut-down devices","Quick closing valves","Permanent gas detection system","Emergency lighting",
 "Lifeboats, including engine starting","General alarm system","Hand-held emergency radios","Breathing apparatus compressor",
 "Cargo pumps emergency shut-down system","P/V Breaker","IGS shut-down alarms","OWS & OCM","E/R bilge alarms","ODME","Incinerator",
 "Sewage treatment plant","EGCS gas analyzer and water monitors","BWTS total residual oxidants meter","Other","Other"]

def exercise(api, uid, session):
    token = session["access_token"]
    def rpc(name,args):
        status,data=api.rpc(name,args,token)
        assert status==200,(name,status,data)
        return data
    def edge(action,aid):
        return api.http("/functions/v1/m02-attachments",{"action":action,"attachment_id":aid},token)
    def upload(rid,aid,payload=PNG,filename="appendix.png",mime="image/png"):
        boundary="M02Appendix"+uuid.uuid4().hex
        body=b""
        for key,value in {"action":"upload","report_id":rid,"appendix_record_id":aid}.items():
            body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        body+=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode()+payload+f'\r\n--{boundary}--\r\n'.encode()
        request=urllib.request.Request(api.URL+"/functions/v1/m02-attachments",data=body,headers={
            "Authorization":"Bearer "+token,"apikey":api.KEY,"Content-Type":"multipart/form-data; boundary="+boundary})
        try:
            with urllib.request.urlopen(request,timeout=90) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as error:return error.code,json.load(error)
    rid=None
    try:
        context=rpc("csvb_m02_context",{"p_company_id":api.COMPANY})
        catalogue=rpc("csvb_m02_critical_items",{"p_company_id":api.COMPANY})
        assert [x["item_text"] for x in catalogue]==NAMES
        vessel=api.sql("select vessel_id from public.post_inspection_reports where company_id="+api.literal(api.COMPANY)+
            " and inspection_date<=current_date order by inspection_date desc limit 1",True)[0]["vessel_id"]
        source=rpc("csvb_m02_last_vetting",{"p_company_id":api.COMPANY,"p_vessel_id":vessel})
        assert source and set(source)=={"report_id","inspection_date","oil_major","port_name","report_ref"}
        status,_=api.rpc("csvb_m02_last_vetting",{"p_company_id":api.COMPANY,"p_vessel_id":str(uuid.uuid4())},token)
        assert status==403
        details={"last_vetting_date":source["inspection_date"],"last_vetting_company":source["oil_major"],
            "last_vetting_place":source["port_name"],"last_vetting_details":source["report_ref"],"total_high":999}
        records=[{"id":str(uuid.uuid4()),"kind":"maintenance","subsection":s,"reference":"Verification "+s,
            "comments":"Retained maintenance details","due_date":"2026-12-01" if s=="jobs" else None} for s in ["pms","unscheduled","jobs"]]
        records += [{"id":str(uuid.uuid4()),"kind":"photo","description":"Private photo caption","requirement_reference":"E/R"}]
        records += [{"id":str(uuid.uuid4()),"kind":"finding","reference":"F"+str(i),"description":"Recorded remark",
            "corrective_action":"Planned correction","root_cause":"Free text root cause","severity":sev,
            "requirement_reference":"Company reference","due_date":"2026-12-20"} for i,sev in enumerate(["High","Low"])]
        appendix={"records":records,"critical_items":[{"item_no":i+1,"response":["Yes","No","N/A"][i] if i<3 else None,"comments":"Test result"} for i in range(29)],
            "maintenance_previous_closed":True,"vetting_source_id":source["report_id"],"manual_vetting_override":False}
        result=rpc("csvb_m02_save_v3",{"p_report":{"company_id":api.COMPANY,"vessel_id":vessel,"library_version":context["library_versions"][0],
            "create_request_id":str(uuid.uuid4()),"details":details},"p_appendices":appendix})
        rid=result["id"]
        get=lambda:rpc("csvb_m02_get_v3",{"p_report_id":rid})
        bundle=get()
        assert len(bundle["appendices"]["records"])==6 and len(bundle["appendices"]["critical_items"])==29
        assert bundle["report"]["maintenance_previous_closed"] and not bundle["report"]["last_vetting_provenance"]["manual_override"]
        assert [bundle["report"]["details"]["total_"+s] for s in ["high","medium","low"]]==[1,0,1]
        assert sum(x["response"] is not None for x in bundle["appendices"]["critical_items"])==3
        qid=bundle["answers"][0]["question_id"]
        records[-1]["question_id"]=qid
        manual={**bundle["report"],"details":{**bundle["report"]["details"],"last_vetting_company":"Manual attendance vetting",
            "last_vetting_place":"Manual location"}}
        appendix["manual_vetting_override"]=True
        rpc("csvb_m02_save_v3",{"p_report":manual,"p_appendices":appendix})
        bundle=get()
        assert bundle["report"]["details"]["last_vetting_company"]=="Manual attendance vetting"
        assert bundle["report"]["last_vetting_provenance"]["source"]==source and bundle["report"]["last_vetting_provenance"]["manual_override"]
        assert any(x["question_id"]==qid for x in bundle["appendices"]["records"])
        photo=records[3]["id"]
        status,data=upload(rid,photo)
        assert status==200,(status,data)
        aid=data["attachment"]["id"]
        assert data["attachment"]["appendix_record_id"]==photo and data["attachment"]["uploaded_by"]==uid
        assert upload(rid,photo)[0]==400
        assert upload(rid,records[0]["id"],b"not an image")[0]==400
        assert upload(rid,photo,b"%PDF-1.4\n",filename="not-photo.pdf",mime="application/pdf")[0]==400
        status,data=edge("download",aid);assert status==200
        assert urllib.request.urlopen(data["url"],timeout=25).read()==PNG
        for i in range(5):assert upload(rid,records[0]["id"])[0]==200
        assert upload(rid,records[0]["id"])[0]==400
        status,_=api.rpc("csvb_m02_attachment_reserve_appendix",{"p_report_id":rid,"p_appendix_record_id":records[1]["id"],
            "p_filename":"too-big.png","p_mime":"image/png","p_size":10485761},token)
        assert status==400
        status,_=api.rpc("csvb_m02_save_v3",{"p_report":get()["report"],"p_appendices":{**appendix,"records":[]}},token)
        assert status==400 and len(get()["appendices"]["records"])==6,"Attached row removal lost data"
        # Completion requires Appendix 2 even with every Company/SIRE answer present.
        bundle=get()
        answers=[{**x,"response":"N/S"} for x in bundle["answers"]]
        company=[{**x,"response":"N/S"} for x in bundle["company_items"]]
        rpc("csvb_m02_save_v3",{"p_report":bundle["report"],"p_answers":answers,"p_company_items":company,"p_appendices":appendix})
        current=get()["report"]
        status,error=api.rpc("csvb_m02_save_v2",{"p_report":{**current,"status":"completed"}},token)
        assert status==400 and "Appendix 2: 26 remaining" in error["message"] and "Part 3:" not in error["message"]
        assert get()["report"]==current
        appendix["critical_items"]=[{"item_no":i+1,"response":["Yes","No","N/A"][i%3],"comments":"Result"} for i in range(29)]
        assert rpc("csvb_m02_save_v3",{"p_report":{**current,"status":"completed"},"p_appendices":appendix})["status"]=="completed"
        assert edge("delete",aid)[0]==400
        rpc("csvb_m02_save_v3",{"p_report":{**get()["report"],"status":"draft"},"p_appendices":appendix})
        # Verify new readers/writers under actual assigned Office permissions, not Root only.
        api.actor_sql("update public.profiles set role='company_superintendent',office_role_code="+api.literal(api.ROLE)+
            ",office_access_profile_code='standard_office_view_only' where id="+api.literal(uid)+";delete from public.profile_roles_cache where user_id="+api.literal(uid))
        assert api.rpc("csvb_m02_get_v3",{"p_report_id":rid},token)[0]==200
        assert api.rpc("csvb_m02_last_vetting",{"p_company_id":api.COMPANY,"p_vessel_id":vessel},token)[0]==200
        assert api.rpc("csvb_m02_save_v3",{"p_report":get()["report"],"p_appendices":appendix},token)[0]==403
        assert upload(rid,records[1]["id"])[0]==403
        assert edge("download",aid)[0]==200
        other=api.sql("select id from public.companies where id<>"+api.literal(api.COMPANY)+" limit 1",True)
        if other:assert api.rpc("csvb_m02_last_vetting",{"p_company_id":other[0]["id"],"p_vessel_id":vessel},token)[0]==403
        print("PASS appendices API: exact 29; A/B/C save/reopen; linked findings and derived H/M/L; scoped real vetting source plus manual provenance; private photos and metadata; image/quota checks; maintenance 5-file group; attachment deletion protection; 29-row completion gate and atomic rollback; View-only Office reads, writes denied, tenancy preserved.")
    finally:
        api.actor_sql("update public.profiles set role='super_admin',office_role_code=null,office_access_profile_code=null where id="+api.literal(uid)+
            ";delete from public.profile_roles_cache where user_id="+api.literal(uid))
        if rid:
            # Only this fixture's own report/files; no source or existing M02 data.
            for attachment in rpc("csvb_m02_attachments",{"p_report_id":rid}):
                edge("delete",attachment["id"])
            api.sql("delete from public.m02_supporting_attachments where report_id="+api.literal(rid)+
                ";delete from public.m02_inspection_reports where id="+api.literal(rid)+" and created_by="+api.literal(uid))
