begin;

-- Keep the existing M02 authorization and limited FVE projection. Both the
-- total and displayed rows use inspection dates in the same calendar window.
create or replace function public.csvb_m02_reference(p_company_id uuid,p_question_id uuid,p_report_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=public.csvb_m02_company(p_company_id,false); q public.questions_master%rowtype;
  r public.m02_inspection_reports%rowtype; canonical_no text; hist jsonb; evidence jsonb; total bigint;
  window_to date; window_from date;
begin
 select * into q from public.questions_master where id=p_question_id and source_type::text='SIRE'
   and (company_id is null or company_id=c);
 if q.id is null then raise exception 'Question not accessible' using errcode='42501'; end if;
 if p_report_id is not null then
   select * into r from public.m02_inspection_reports where id=p_report_id and company_id=c;
   if r.id is null or not public.csvb_m02_vessel_allowed(c,r.vessel_id,false)
     or not exists(select 1 from public.m02_inspection_responses where report_id=r.id and question_id=q.id) then
     raise exception 'Question does not belong to this M02 report' using errcode='42501'; end if;
 elsif q.status::text<>'active' or not public.csvb_m02_question_eligible(q.payload) then
   raise exception 'Question is not in the M02 checklist'; end if;
 window_to:=coalesce(r.report_date,r.inspection_to,r.inspection_from,current_date);
 window_from:=(window_to - interval '18 months')::date;
 canonical_no:=public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(q.number_base));
 select coalesce(jsonb_agg(jsonb_build_object('evidence_text',evidence_text,'esms_references',esms_references,
   'esms_forms',esms_forms,'remarks',remarks) order by seq),'[]') into evidence
 from public.expected_evidence_master where question_id=q.id and (company_id is null or company_id=c);
 select count(*) into total from public.csvb_fve_rows(c) x
   where x.question_no=canonical_no and x.inspection_date between window_from and window_to;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into hist from (
   select vessel_name,inspection_date,oil_major,designation,observation_text from public.csvb_fve_rows(c) x
   where x.question_no=canonical_no and x.inspection_date between window_from and window_to
   order by inspection_date desc nulls last,vessel_name,sort_id limit 25) x;
 return jsonb_build_object('expected_evidence',evidence,'history',jsonb_build_object(
   'rows',hist,'total',total,'months',18,'from_date',window_from,'to_date',window_to));
end $$;

revoke all on function public.csvb_m02_reference(uuid,uuid,uuid) from public,anon;
grant execute on function public.csvb_m02_reference(uuid,uuid,uuid) to authenticated;
commit;
