"""Development-only M02 contract tests. All report writes run in a rolled-back transaction."""
import importlib.util
import json
import uuid

spec = importlib.util.spec_from_file_location("api", "scripts/test-office-authorization-live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
assert api.PROJECT == "bdidrcyufazskpuwmfca"

root = api.sql("select id from public.profiles where role::text='super_admin' and coalesce(is_active,true) and not coalesce(is_disabled,false) limit 1", True)[0]["id"]
vessel = api.sql("""select v.id,v.company_id from public.vessels v join public.companies c on c.id=v.company_id
 where v.is_active and c.is_active order by (c.company_name ilike '%Internal%') desc,v.name limit 1""", True)[0]
other = api.sql("select id from public.profiles where role::text in ('vessel','inspector') and coalesce(is_active,true) and not coalesce(is_disabled,false) union all select gen_random_uuid() limit 1", True)[0]["id"]
eligible = api.sql("""select count(*) n,count(*) filter(where payload->>'Vessel Type'<>'Oil') mixed,
 count(distinct payload->>'Question Type') types from public.questions_master
 where source_type::text='SIRE' and status::text='active'
 and exists(select 1 from regexp_split_to_table(payload->>'Vessel Type',',') t where lower(trim(t))='oil')
 and upper(trim(coalesce(payload->>'Photo Response',''))) <> 'Y'""", True)[0]
history_question = api.sql("""select q.id from public.questions_master q
 join public.csvb_fve_rows(""" + api.literal(vessel["company_id"]) + """) f on
 f.question_no=public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(q.number_base))
 where q.source_type::text='SIRE' and q.status::text='active' and public.csvb_m02_question_eligible(q.payload)
 and f.inspection_date >= date '2000-01-01'
 and (q.company_id is null or q.company_id=""" + api.literal(vessel["company_id"]) + """)
 limit 1""")[0]["id"]

sql = """
begin;
select set_config('request.jwt.claim.sub',ROOT,true);
select set_config('request.jwt.claims',CLAIMS,true);
set local role authenticated;
do $test$
declare
 c uuid:=COMPANY; v uuid:=VESSEL; request_id uuid:=REQUEST;
 ctx jsonb; qs jsonb; report jsonb; saved jsonb; fresh jsonb; result jsonb; ref jsonb;
 qid uuid; rejected boolean; rid uuid; count_before integer;
begin
 ctx:=public.csvb_m02_context(c);
 assert (ctx->>'can_edit')::boolean,'Super Admin must be editable';
 qs:=public.csvb_m02_questions(c,ctx->'library_versions'->>0,null);
 assert jsonb_array_length(qs)=EXPECTED,'Oil/non-Photo selection mismatch';
 assert not exists(select 1 from jsonb_array_elements(qs) x where upper(trim(x->'payload'->>'Photo Response'))='Y'),'Photo question leaked';
 assert exists(select 1 from jsonb_array_elements(qs) x where x->'payload'->>'Vessel Type'<>'Oil'),'Mixed Oil applicability missing';
 qid:=HISTORYQUESTION;
 report:=jsonb_build_object('id',null,'create_request_id',request_id,'company_id',c,'vessel_id',v,
  'library_version',ctx->'library_versions'->>0,'attending_superintendent','M02 transaction verification',
  'report_date','2026-10-28','inspection_from','2026-10-27','inspection_to','2026-10-28',
  'details',jsonb_build_object('operations',jsonb_build_array('Loading','IGS in operation'),
    'open_items',jsonb_build_array(jsonb_build_object('description','Verification item','due_date','2026-11-01')),
    'inspection_places',jsonb_build_array('Verification berth')),
  'executive_summary','Manual summary verification','part2',jsonb_build_object('high',2,'medium',1,'low',0),'status','draft');
 saved:=public.csvb_m02_save(report,jsonb_build_array(jsonb_build_object('question_id',qid,'response','Yes','comments','Manual M02 comment')));
 rid:=(saved->>'id')::uuid;
 assert (saved->>'checked_count')::integer=1;
 assert (saved->>'total_count')::integer=EXPECTED;
 result:=public.csvb_m02_save(report,'[]');
 assert result->>'id'=saved->>'id','New-report retry created duplicate identity';
 fresh:=public.csvb_m02_get(rid);
 assert fresh->'report'->>'executive_summary'='Manual summary verification';
 assert fresh->'report'->'vessel_snapshot'->>'name' is not null,'Vessel snapshot absent';
 assert exists(select 1 from jsonb_array_elements(fresh->'answers') a where (a->>'question_id')::uuid=qid and a->>'comments'='Manual M02 comment');
 assert (select count(*) from jsonb_array_elements(fresh->'answers') a where a->>'response' is null)=EXPECTED-1,'Not Checked conflated with N/S';
 report:=fresh->'report';
 saved:=public.csvb_m02_save(report,jsonb_build_array(jsonb_build_object('question_id',qid,'response','N/S','comments','Not seen verification')));
 assert (saved->>'revision')::integer=2,'Revision did not increment';
 rejected:=false;
 begin perform public.csvb_m02_save(report,'[]'); exception when serialization_failure then rejected:=true; end;
 assert rejected,'Stale revision was accepted';
 report:=(public.csvb_m02_get(rid))->'report';
 rejected:=false;
 begin perform public.csvb_m02_save(report||'{"executive_summary":"Must roll back"}',
   jsonb_build_array(jsonb_build_object('question_id',qid,'response','No','comments','Must roll back'),
     jsonb_build_object('question_id',gen_random_uuid(),'response','Yes')));
 exception when others then rejected:=true; end;
 assert rejected,'Foreign question accepted';
 fresh:=public.csvb_m02_get(rid);
 assert fresh->'report'->>'executive_summary'='Manual summary verification','Failed save partially updated header';
 assert exists(select 1 from jsonb_array_elements(fresh->'answers') a where (a->>'question_id')::uuid=qid and a->>'response'='N/S'),'Failed save partially updated answers';
 count_before:=jsonb_array_length(public.csvb_m02_reports(c));
 rejected:=false;
 begin perform public.csvb_m02_save((report-'id'-'revision')||jsonb_build_object('create_request_id',gen_random_uuid()),
   jsonb_build_array(jsonb_build_object('question_id',gen_random_uuid(),'response','Yes')));
 exception when others then rejected:=true; end;
 assert rejected;
 assert jsonb_array_length(public.csvb_m02_reports(c))=count_before,'Failed create left a partial report';
 ref:=public.csvb_m02_reference(c,qid,rid);
 assert ref ? 'expected_evidence' and ref ? 'history';
 assert ref->'history'->>'from_date'='2025-04-28' and ref->'history'->>'to_date'='2026-10-28','Incorrect 18-month report-date window';
 assert (ref->'history'->>'months')::integer=18;
 assert not exists(select 1 from jsonb_array_elements(ref->'history'->'rows') x
   where (x->>'inspection_date')::date not between date '2025-04-28' and date '2026-10-28'
     or x->>'inspection_date' is null),'Out-of-window inspection leaked';
 result:=public.csvb_m02_reference(c,qid,null);
 assert result->'history'->>'to_date'=current_date::text
   and result->'history'->>'from_date'=(current_date-interval '18 months')::date::text,'New report must use current date';
 -- Calendar-month arithmetic clamps month-end safely; both endpoints are inclusive.
 assert (date '2024-08-31'-interval '18 months')::date=date '2023-02-28';
 assert date '2025-04-28' between date '2025-04-28' and date '2026-10-28';
 assert date '2026-10-28' between date '2025-04-28' and date '2026-10-28';
 assert not (date '2025-04-27' between date '2025-04-28' and date '2026-10-28');
 assert not (date '2026-10-29' between date '2025-04-28' and date '2026-10-28');
 -- A question with real modern fleet history must not return those rows for
 -- an old report context. Only our temporary M02 report is updated.
 fresh:=public.csvb_m02_get(rid);
 perform public.csvb_m02_save((fresh->'report')||'{"report_date":"1900-01-01"}','[]');
 result:=public.csvb_m02_reference(c,qid,rid);
 assert (result->'history'->>'total')::integer=0 and jsonb_array_length(result->'history'->'rows')=0,
   'Real out-of-window fleet history leaked into old report context';
 fresh:=public.csvb_m02_get(rid);
 perform public.csvb_m02_save((fresh->'report')||'{"report_date":"2024-08-31"}','[]');
 result:=public.csvb_m02_reference(c,qid,rid);
 assert result->'history'->>'from_date'='2023-02-28' and result->'history'->>'to_date'='2024-08-31',
   'RPC month-end context was not clamped correctly';
 assert not exists(select 1 from jsonb_array_elements(ref->'history'->'rows') x
   where x ? 'source_observation_item_id' or x ? 'report_id' or x ? 'immediate_cause'),'History exceeded limited projection';
 rejected:=false;
 begin perform public.csvb_m02_context(gen_random_uuid()); exception when insufficient_privilege then rejected:=true; end;
 assert rejected,'Invalid company accepted';
 rejected:=false;
 begin perform count(*) from public.m02_inspection_reports; exception when insufficient_privilege then rejected:=true; end;
 assert rejected,'Direct table access granted';
 report:=(public.csvb_m02_get(rid))->'report';
 rejected:=false;
 begin
   perform public.csvb_m02_save(report||'{"status":"completed"}','[]');
   set constraints m02_required_response_completion immediate;
 exception when check_violation then rejected:=true; end;
 assert rejected,'Incomplete report marked Completed';
 set constraints m02_required_response_completion deferred;
 fresh:=public.csvb_m02_get_v2(rid);
 saved:=public.csvb_m02_save_v2(report||'{"status":"completed"}',
   (select jsonb_agg(x||jsonb_build_object('response',coalesce(x->>'response','N/S')))
    from jsonb_array_elements(fresh->'answers') x),
   (select jsonb_agg(x||jsonb_build_object('response',coalesce(x->>'response','N/S')))
    from jsonb_array_elements(fresh->'company_items') x));
 set constraints m02_required_response_completion immediate;
 assert saved->>'status'='completed','Completed organization state failed';
 perform set_config('request.jwt.claim.sub',OTHER,true);
 rejected:=false;
 begin perform public.csvb_m02_get(rid); exception when insufficient_privilege then rejected:=true; end;
 assert rejected,'Unapproved user gained M02 access';
end $test$;
reset role;
rollback;
"""
for key, value in {
    "ROOT": api.literal(root), "CLAIMS": api.literal(json.dumps({"sub": root, "role": "authenticated"})),
    "COMPANY": api.literal(vessel["company_id"]), "VESSEL": api.literal(vessel["id"]),
    "REQUEST": api.literal(uuid.uuid4()), "OTHER": api.literal(other), "EXPECTED": str(eligible["n"]),
    "HISTORYQUESTION": api.literal(history_question)
}.items():
    sql = sql.replace(key, value)
api.sql(sql)
print(json.dumps({"passed": True, "eligible_questions": eligible["n"], "mixed_oil_questions": eligible["mixed"],
 "question_types_retained": eligible["types"], "checks": [
 "Oil/non-Photo filtering", "mixed applicability", "atomic create/save/reopen", "snapshot",
 "answer/comment persistence", "Not Checked distinct from N/S", "idempotent create retry",
 "optimistic revision rejection", "failed-save rollback", "failed-create rollback",
 "narrow fleet-history projection", "18-month report/current-date windows", "inclusive boundaries and month-end",
 "company authorization", "direct table denied",
 "Completed organization state", "unapproved user denied"
 ], "writes": "rolled back"}))
