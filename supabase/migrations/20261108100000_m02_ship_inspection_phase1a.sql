begin;

insert into public.app_modules(code,name,is_active)
values('M02_SHIP_INSPECTION_REPORT','M02 – Ship Inspection Report',true)
on conflict(code) do nothing;
insert into public.app_permissions(module_id,action)
select id,a from public.app_modules cross join unnest(array['view','edit']) a
where code='M02_SHIP_INSPECTION_REPORT' on conflict(module_id,action) do nothing;
insert into public.role_permissions(role,position,permission_id,scope,is_granted)
select 'super_admin',null,p.id,'global',true from public.app_permissions p
join public.app_modules m on m.id=p.module_id where m.code='M02_SHIP_INSPECTION_REPORT'
and not exists(select 1 from public.role_permissions r where r.role::text='super_admin'
  and r.position is null and r.permission_id=p.id);
insert into public.company_modules(company_id,module_key,is_enabled)
select id,'m02_ship_inspection_report',true from public.companies where is_active
on conflict(company_id,module_key) do nothing;
insert into public.dashboard_platform_area_modules(area_id,module_card_key,sort_order,is_active)
select id,'m02_ship_inspection_report',25,true from public.dashboard_platform_areas
where area_key='marine_applications_vessel_interaction'
on conflict(area_id,module_card_key) do nothing;

-- Append to the actual registry implementation, retaining its existing security wrappers.
do $$
declare r record; d text; changed boolean:=false;
  anchor text:='(''port_call_intelligence'', ''Port Call Intelligence'', ''Marine Operations'', 97),';
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.proname='csvb_standard_modules' and n.nspname in ('public','csvb_vessel_policy_private')
 loop
   d:=replace(pg_get_functiondef(r.oid),E'\r\n',E'\n');
   if position('''m02_ship_inspection_report''' in d)>0 then changed:=true;
   elsif position(anchor in d)>0 then
     execute replace(d,anchor,anchor||E'\n      '||
       '(''m02_ship_inspection_report'', ''M02 – Ship Inspection Report'', ''Marine Operations'', 98),');
     changed:=true;
   end if;
 end loop;
 if not changed then raise exception 'Module registry anchor missing; refusing partial M02 registration'; end if;
end $$;

create table public.m02_inspection_reports(
 id uuid primary key default gen_random_uuid(),
 create_request_id uuid not null unique default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete restrict,
 vessel_id uuid not null references public.vessels(id) on delete restrict,
 vessel_snapshot jsonb not null,
 library_version text not null,
 status text not null default 'draft' check(status in ('draft','completed')),
 report_date date, inspection_from date, inspection_to date,
 attending_superintendent text not null default '',
 details jsonb not null default '{}' check(jsonb_typeof(details)='object'),
 executive_summary text not null default '',
 part2 jsonb not null default '{}' check(jsonb_typeof(part2)='object'),
 revision integer not null default 1,
 created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(inspection_from is null or inspection_to is null or inspection_from<=inspection_to)
);
-- The answer rows also freeze the report's question-ID manifest, including Not Checked.
-- No question text/guidance/history is copied. RESTRICT protects referenced library IDs.
create table public.m02_inspection_responses(
 report_id uuid not null references public.m02_inspection_reports(id) on delete cascade,
 question_id uuid not null references public.questions_master(id) on delete restrict,
 question_version text not null,
 response text check(response in ('Yes','No','N/A','N/S')),
 comments text not null default '',
 created_by uuid not null,updated_by uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(report_id,question_id)
);
create index m02_reports_company_updated on public.m02_inspection_reports(company_id,updated_at desc);
create index m02_reports_vessel on public.m02_inspection_reports(vessel_id,inspection_from desc);
alter table public.m02_inspection_reports enable row level security;
alter table public.m02_inspection_responses enable row level security;
revoke all on public.m02_inspection_reports,public.m02_inspection_responses from public,anon,authenticated;

create function public.csvb_m02_company(p_company_id uuid,p_edit boolean default false)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; c uuid;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or not coalesce(p.is_active,true) or coalesce(p.is_disabled,false) then
   raise exception 'An active signed-in user is required' using errcode='42501'; end if;
 if p.role::text='super_admin' then
   c:=p_company_id;
   if c is null then raise exception 'Select a company for M02' using errcode='22023'; end if;
 else
   c:=p.company_id;
   if p_company_id is not null and p_company_id is distinct from c then
     raise exception 'Company not accessible' using errcode='42501'; end if;
   if not exists(select 1 from public.csvb_my_effective_app_permissions() e
       where e.module_code='M02_SHIP_INSPECTION_REPORT' and e.permission_action='view'
       and e.is_granted and e.scope<>'none')
     or (p_edit and not exists(select 1 from public.csvb_my_effective_app_permissions() e
       where e.module_code='M02_SHIP_INSPECTION_REPORT' and e.permission_action='edit'
       and e.is_granted and e.scope<>'none')) then
     raise exception 'M02 permission required' using errcode='42501'; end if;
 end if;
 if c is null or not exists(select 1 from public.companies x join public.company_modules m
   on m.company_id=x.id and m.module_key='m02_ship_inspection_report' and m.is_enabled
   where x.id=c and x.is_active) then
   raise exception 'M02 is not enabled for this company' using errcode='42501'; end if;
 return c;
end $$;

create function public.csvb_m02_vessel_allowed(p_company_id uuid,p_vessel_id uuid,p_edit boolean default false)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=public.csvb_m02_company(p_company_id,false); sc text;
begin
 if not exists(select 1 from public.vessels where id=p_vessel_id and company_id=c) then return false; end if;
 if public.current_app_role_text()='super_admin' then return true; end if;
 if not coalesce(public.csvb_can_access_vessel(p_vessel_id),false) then return false; end if;
 select e.scope into sc from public.csvb_my_effective_app_permissions() e
 where e.module_code='M02_SHIP_INSPECTION_REPORT'
 and e.permission_action=case when p_edit then 'edit' else 'view' end
 and e.is_granted and e.scope<>'none'
 order by case e.scope when 'company' then 0 when 'global' then 1 when 'vessel_any' then 2 else 3 end limit 1;
 return sc is not null and (sc<>'vessel_assigned' or coalesce(p_vessel_id=public.current_profile_vessel_id(),false));
end $$;

create function public.csvb_m02_question_eligible(p_payload jsonb)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select exists(select 1 from regexp_split_to_table(coalesce(
   nullif(p_payload->>'Vessel Type',''),nullif(p_payload->>'vessel_type',''),p_payload->>'vesselType',''),',') t
   where lower(trim(t))='oil')
 and upper(trim(coalesce(nullif(p_payload->>'Photo Response',''),nullif(p_payload->>'Photo_Response',''),
   nullif(p_payload->>'photo_response',''),p_payload->>'photoResponse',''))) <> 'Y'
$$;

create function public.csvb_m02_context(p_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; c uuid; companies jsonb; editable boolean;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null or not coalesce(p.is_active,true) or coalesce(p.is_disabled,false) then
   raise exception 'An active signed-in user is required' using errcode='42501'; end if;
 if p.role::text='super_admin' then
   select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.company_name) order by x.company_name),'[]')
   into companies from public.companies x join public.company_modules m on m.company_id=x.id
     and m.module_key='m02_ship_inspection_report' and m.is_enabled where x.is_active;
   if p_company_id is null then return jsonb_build_object('companies',companies,'company_id',null,
     'company_name',null,'can_edit',false,'vessels','[]'::jsonb,'library_versions','[]'::jsonb); end if;
 else
   companies:='[]'::jsonb;
 end if;
 c:=public.csvb_m02_company(p_company_id,false);
 if p.role::text<>'super_admin' then select jsonb_build_array(jsonb_build_object('id',id,'name',company_name))
   into companies from public.companies where id=c; end if;
 editable:=p.role::text='super_admin' or exists(select 1 from public.csvb_my_effective_app_permissions() e
   where e.module_code='M02_SHIP_INSPECTION_REPORT' and e.permission_action='edit' and e.is_granted and e.scope<>'none');
 return jsonb_build_object('companies',companies,'company_id',c,
   'company_name',(select company_name from public.companies where id=c),'can_edit',editable,
   'vessels',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'imo_number',v.imo_number,
     'hull_number',v.hull_number,'call_sign',v.call_sign,'date_delivered',v.date_delivered,'is_active',v.is_active) order by v.name),'[]')
     from public.vessels v where v.company_id=c and coalesce(v.is_active,true)
     and public.csvb_m02_vessel_allowed(c,v.id,false)),
   'library_versions',(select coalesce(jsonb_agg(version order by version desc),'[]') from (
     select distinct coalesce(q.version,'Unversioned') version from public.questions_master q
     where q.source_type::text='SIRE' and q.status::text='active' and (q.company_id is null or q.company_id=c)
     and public.csvb_m02_question_eligible(q.payload)) versions));
end $$;

create function public.csvb_m02_reports(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=public.csvb_m02_company(p_company_id,false);
begin
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]') from (
   select r.id,r.company_id,r.vessel_id,r.vessel_snapshot->>'name' vessel_name,
     r.vessel_snapshot->>'imo_number' imo_number,r.status,r.report_date,r.inspection_from,r.inspection_to,
     r.attending_superintendent,r.updated_at,r.revision,
     (select count(*) from public.m02_inspection_responses a where a.report_id=r.id and a.response is not null) checked_count,
     (select count(*) from public.m02_inspection_responses a where a.report_id=r.id) total_count
   from public.m02_inspection_reports r where r.company_id=c
   and public.csvb_m02_vessel_allowed(c,r.vessel_id,false)) x);
end $$;

create function public.csvb_m02_get(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.m02_inspection_reports%rowtype;
begin
 select * into r from public.m02_inspection_reports where id=p_report_id;
 if r.id is null then raise exception 'M02 report not found'; end if;
 if not public.csvb_m02_vessel_allowed(r.company_id,r.vessel_id,false) then
   raise exception 'M02 report not accessible' using errcode='42501'; end if;
 return jsonb_build_object('report',to_jsonb(r),'can_edit',public.csvb_m02_vessel_allowed(r.company_id,r.vessel_id,true),
   'answers',(select coalesce(jsonb_agg(jsonb_build_object('question_id',question_id,
      'response',response,'comments',comments,'question_version',question_version)),'[]')
      from public.m02_inspection_responses where report_id=r.id),
   'checked_count',(select count(*) from public.m02_inspection_responses where report_id=r.id and response is not null),
   'total_count',(select count(*) from public.m02_inspection_responses where report_id=r.id));
end $$;

create function public.csvb_m02_questions(p_company_id uuid,p_version text default null,p_report_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=public.csvb_m02_company(p_company_id,false); r public.m02_inspection_reports%rowtype;
begin
 if p_report_id is not null then
   select * into r from public.m02_inspection_reports where id=p_report_id and company_id=c;
   if r.id is null or not public.csvb_m02_vessel_allowed(c,r.vessel_id,false) then
     raise exception 'M02 report not accessible' using errcode='42501'; end if;
 end if;
 return (select coalesce(jsonb_agg(to_jsonb(x) order by string_to_array(
   regexp_replace(x.number_base,'[^0-9.]','','g'),'.')::int[],x.number_suffix),'[]') from (
   select q.id,q.number_base,q.number_suffix,q.number_full,q.version,q.payload,
     case when p_report_id is null then false else coalesce(q.version,'Unversioned') is distinct from
       (select a.question_version from public.m02_inspection_responses a where a.report_id=p_report_id and a.question_id=q.id) end as library_version_changed
   from public.questions_master q
   where (q.company_id is null or q.company_id=c) and q.source_type::text='SIRE'
   and case when p_report_id is null then q.status::text='active'
       and coalesce(q.version,'Unversioned')=p_version and public.csvb_m02_question_eligible(q.payload)
     else exists(select 1 from public.m02_inspection_responses a where a.report_id=p_report_id and a.question_id=q.id) end
 ) x);
end $$;

create function public.csvb_m02_save(p_report jsonb,p_answers jsonb default '[]')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 c uuid:=public.csvb_m02_company((p_report->>'company_id')::uuid,true);
 rid uuid:=nullif(p_report->>'id','')::uuid; vid uuid:=(p_report->>'vessel_id')::uuid;
 r public.m02_inspection_reports%rowtype; v public.vessels%rowtype;
 a jsonb; qid uuid; answer text; ver text:=nullif(p_report->>'library_version',''); n integer;
 request_id uuid:=nullif(p_report->>'create_request_id','')::uuid; creating boolean:=rid is null;
begin
 if jsonb_typeof(p_report)<>'object' or jsonb_typeof(p_answers)<>'array'
   or pg_column_size(p_report)>1000000 or pg_column_size(p_answers)>4000000 then
   raise exception 'Invalid or oversized M02 save payload'; end if;
 if not public.csvb_m02_vessel_allowed(c,vid,true) then raise exception 'Vessel not accessible' using errcode='42501'; end if;
 if coalesce(p_report->>'status','draft') not in ('draft','completed') then raise exception 'Invalid M02 status'; end if;
 if rid is null then
   if ver is null then raise exception 'Select a SIRE library version'; end if;
   if request_id is not null then
     perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||request_id::text,0));
     select * into r from public.m02_inspection_reports where create_request_id=request_id;
     if r.id is not null then
       if r.created_by<>auth.uid() or r.company_id<>c or r.vessel_id<>vid or r.library_version<>ver then
         raise exception 'M02 creation request conflicts with an existing inspection' using errcode='42501'; end if;
       return jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,
         'checked_count',(select count(*) from public.m02_inspection_responses where report_id=r.id and response is not null),
         'total_count',(select count(*) from public.m02_inspection_responses where report_id=r.id));
     end if;
   end if;
   select * into v from public.vessels where id=vid and company_id=c and coalesce(is_active,true);
   if v.id is null then raise exception 'Select an active authorised vessel'; end if;
   insert into public.m02_inspection_reports(company_id,vessel_id,vessel_snapshot,library_version,created_by,updated_by,create_request_id)
   values(c,vid,jsonb_build_object('id',v.id,'name',v.name,'imo_number',v.imo_number,'hull_number',v.hull_number,
     'call_sign',v.call_sign,'date_delivered',v.date_delivered),ver,auth.uid(),auth.uid(),coalesce(request_id,gen_random_uuid()))
     -- A stable client request key makes retries after a lost network response idempotent.
   returning * into r;
   rid:=r.id;
   insert into public.m02_inspection_responses(report_id,question_id,question_version,created_by,updated_by)
   select rid,q.id,coalesce(q.version,'Unversioned'),auth.uid(),auth.uid()
   from public.questions_master q where q.source_type::text='SIRE' and q.status::text='active'
   and (q.company_id is null or q.company_id=c) and coalesce(q.version,'Unversioned')=ver
   and public.csvb_m02_question_eligible(q.payload);
   get diagnostics n=row_count;
   if n=0 then raise exception 'No eligible Oil / non-Photo SIRE questions in that version'; end if;
 else
   select * into r from public.m02_inspection_reports where id=rid and company_id=c for update;
   if r.id is null then raise exception 'M02 report not accessible' using errcode='42501'; end if;
   if r.vessel_id<>vid or r.library_version is distinct from ver then
     raise exception 'Saved vessel and SIRE library version cannot be changed'; end if;
   if r.revision is distinct from (p_report->>'revision')::integer then
     raise exception 'This M02 inspection was changed elsewhere. Reopen it before saving to avoid overwriting newer changes.'
       using errcode='40001'; end if;
 end if;
 if exists(select 1 from jsonb_array_elements(p_answers) x group by x->>'question_id' having count(*)>1) then
   raise exception 'Duplicate question IDs in M02 answers'; end if;
 for a in select value from jsonb_array_elements(p_answers) loop
   qid:=(a->>'question_id')::uuid;
   answer:=nullif(a->>'response','');
   if answer is not null and answer not in ('Yes','No','N/A','N/S') then raise exception 'Invalid M02 response'; end if;
   if length(coalesce(a->>'comments',''))>50000 then raise exception 'M02 question comment is too long'; end if;
   update public.m02_inspection_responses set response=answer,comments=coalesce(a->>'comments',''),
     updated_by=auth.uid(),updated_at=now() where report_id=rid and question_id=qid;
   if not found then raise exception 'Question does not belong to this pinned M02 checklist'; end if;
 end loop;
 update public.m02_inspection_reports set
   report_date=nullif(p_report->>'report_date','')::date,
   inspection_from=nullif(p_report->>'inspection_from','')::date,
   inspection_to=nullif(p_report->>'inspection_to','')::date,
   attending_superintendent=coalesce(p_report->>'attending_superintendent',''),
   status=coalesce(p_report->>'status','draft'),details=coalesce(p_report->'details','{}'),
   executive_summary=coalesce(p_report->>'executive_summary',''),part2=coalesce(p_report->'part2','{}'),
   updated_by=auth.uid(),updated_at=now(),revision=case when creating then 1 else revision+1 end
 where id=rid returning * into r;
 return jsonb_build_object('id',rid,'revision',r.revision,'status',r.status,
   'checked_count',(select count(*) from public.m02_inspection_responses where report_id=rid and response is not null),
   'total_count',(select count(*) from public.m02_inspection_responses where report_id=rid));
end $$;

create function public.csvb_m02_reference(p_company_id uuid,p_question_id uuid,p_report_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=public.csvb_m02_company(p_company_id,false); q public.questions_master%rowtype;
  r public.m02_inspection_reports%rowtype; canonical_no text; hist jsonb; evidence jsonb; total bigint;
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
 canonical_no:=public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(q.number_base));
 select coalesce(jsonb_agg(jsonb_build_object('evidence_text',evidence_text,'esms_references',esms_references,
   'esms_forms',esms_forms,'remarks',remarks) order by seq),'[]') into evidence
 from public.expected_evidence_master where question_id=q.id and (company_id is null or company_id=c);
 -- Existing restricted fleet projection, without its module-specific public endpoint or action workflow.
 select count(*) into total from public.csvb_fve_rows(c) x where x.question_no=canonical_no;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into hist from (
   select vessel_name,inspection_date,oil_major,designation,observation_text from public.csvb_fve_rows(c) x
   where x.question_no=canonical_no order by inspection_date desc nulls last,vessel_name,sort_id limit 25) x;
 return jsonb_build_object('expected_evidence',evidence,'history',jsonb_build_object('rows',hist,'total',total));
end $$;

revoke all on function public.csvb_m02_company(uuid,boolean),
 public.csvb_m02_vessel_allowed(uuid,uuid,boolean),public.csvb_m02_question_eligible(jsonb) from public,anon,authenticated;
revoke all on function public.csvb_m02_context(uuid),public.csvb_m02_reports(uuid),
 public.csvb_m02_get(uuid),public.csvb_m02_questions(uuid,text,uuid),
 public.csvb_m02_save(jsonb,jsonb),public.csvb_m02_reference(uuid,uuid,uuid) from public,anon;
grant execute on function public.csvb_m02_context(uuid),public.csvb_m02_reports(uuid),
 public.csvb_m02_get(uuid),public.csvb_m02_questions(uuid,text,uuid),
 public.csvb_m02_save(jsonb,jsonb),public.csvb_m02_reference(uuid,uuid,uuid) to authenticated;
comment on table public.m02_inspection_reports is 'M02 Phase 1A: company-scoped electronic reports; no approval/signature workflow.';
comment on table public.m02_inspection_responses is 'Pinned question UUID manifest and separate M02 answers; no copied library or fleet-history text.';
commit;
