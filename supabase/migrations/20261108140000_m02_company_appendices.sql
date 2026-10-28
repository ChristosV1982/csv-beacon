begin;
create table public.m02_critical_item_catalogue (
 item_no smallint primary key check(item_no between 1 and 29), item_text text not null
);
insert into public.m02_critical_item_catalogue values
(1,'M/E trips'),(2,'M/E crankcase oil mist detector'),
(3,'D/Gs emergency shut-downs related to main switchboard'),(4,'Emergency D/G'),
(5,'Emergency Batteries and charger for communication equipment'),(6,'Emergency air compressor'),
(7,'Emergency fire pump'),(8,'Fixed fire extinguishing systems'),(9,'Fire detection and alarm system'),
(10,'Remote shut-down devices'),(11,'Quick closing valves'),(12,'Permanent gas detection system'),
(13,'Emergency lighting'),(14,'Lifeboats, including engine starting'),(15,'General alarm system'),
(16,'Hand-held emergency radios'),(17,'Breathing apparatus compressor'),
(18,'Cargo pumps emergency shut-down system'),(19,'P/V Breaker'),(20,'IGS shut-down alarms'),
(21,'OWS & OCM'),(22,'E/R bilge alarms'),(23,'ODME'),(24,'Incinerator'),
(25,'Sewage treatment plant'),(26,'EGCS gas analyzer and water monitors'),
(27,'BWTS total residual oxidants meter'),(28,'Other'),(29,'Other');
create table public.m02_critical_item_responses (
 report_id uuid not null references public.m02_inspection_reports(id) on delete cascade,
 item_no smallint not null references public.m02_critical_item_catalogue(item_no) on delete restrict,
 response text check(response in ('Yes','No','N/A')), comments text not null default '' check(length(comments)<=50000),
 updated_by uuid not null,updated_at timestamptz not null default now(),primary key(report_id,item_no)
);
create table public.m02_appendix_records (
 id uuid primary key, report_id uuid not null references public.m02_inspection_reports(id) on delete cascade,
 kind text not null check(kind in ('maintenance','finding','photo')),
 subsection text check(subsection in ('pms','unscheduled','jobs')),
 sort_order integer not null check(sort_order>=0), reference text not null default '' check(length(reference)<=180),
 description text not null default '' check(length(description)<=50000),
 comments text not null default '' check(length(comments)<=50000),
 corrective_action text not null default '' check(length(corrective_action)<=50000),
 root_cause text not null default '' check(length(root_cause)<=50000),
 severity text check(severity in ('Low','Medium','High')),
 requirement_reference text not null default '' check(length(requirement_reference)<=500),
 question_id uuid references public.questions_master(id) on delete restrict,due_date date,
 is_deleted boolean not null default false,
 created_by uuid not null,updated_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((kind='maintenance' and subsection is not null) or (kind<>'maintenance' and subsection is null))
);
create index m02_appendix_records_report on public.m02_appendix_records(report_id,kind,sort_order) where not is_deleted;
alter table public.m02_inspection_reports
 add column maintenance_previous_closed boolean not null default false,
 add column last_vetting_provenance jsonb not null default '{}';
alter table public.m02_supporting_attachments add column appendix_record_id uuid references public.m02_appendix_records(id) on delete restrict;
do $$
declare n text;
begin
 select conname into n from pg_constraint where conrelid='public.m02_supporting_attachments'::regclass
 and contype='c' and pg_get_constraintdef(oid) like '%question_id%company_item_no%';
 if n is null then raise exception 'Attachment group constraint not found'; end if;
 execute format('alter table public.m02_supporting_attachments drop constraint %I',n);
end $$;
alter table public.m02_supporting_attachments add constraint m02_attachment_one_group
 check(num_nonnulls(question_id,company_item_no,appendix_record_id)=1);
create index m02_supporting_attachments_appendix on public.m02_supporting_attachments(appendix_record_id) where state<>'deleted';
alter table public.m02_critical_item_catalogue enable row level security;
alter table public.m02_critical_item_responses enable row level security;
alter table public.m02_appendix_records enable row level security;
revoke all on public.m02_critical_item_catalogue,public.m02_critical_item_responses,public.m02_appendix_records from public,anon,authenticated;

create function public.csvb_m02_critical_items(p_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.csvb_m02_company(p_company_id,false);
 return (select jsonb_agg(to_jsonb(c) order by item_no) from public.m02_critical_item_catalogue c);
end $$;

create function public.csvb_m02_last_vetting(p_company_id uuid,p_vessel_id uuid,p_as_of date default current_date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c uuid:=public.csvb_m02_company(p_company_id,false); result jsonb;
begin
 if not public.csvb_m02_vessel_allowed(c,p_vessel_id,false) then raise exception 'Vessel not accessible' using errcode='42501'; end if;
 select jsonb_build_object('report_id',r.id,'inspection_date',r.inspection_date,
   'oil_major',coalesce(nullif(r.ocimf_inspecting_company,''),nullif(r.inspector_company,''),''),
   'port_name',coalesce(r.port_name,''),'report_ref',coalesce(r.report_ref,''))
 into result from public.post_inspection_reports r
 where r.company_id=c and r.vessel_id=p_vessel_id and r.inspection_date<=coalesce(p_as_of,current_date)
 order by r.inspection_date desc,r.created_at desc,r.id limit 1;
 return result;
end $$;

create or replace function public.csvb_m02_attachments(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.csvb_m02_attachment_report(p_report_id,false);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'report_id',report_id,'question_id',question_id,
   'company_item_no',company_item_no,'appendix_record_id',appendix_record_id,
   'original_filename',original_filename,'mime_type',mime_type,'size_bytes',size_bytes,
   'uploaded_by',uploaded_by,'uploaded_by_name',uploaded_by_name,'uploaded_at',uploaded_at,'created_at',created_at,'state',state)
   order by created_at,id),'[]') from public.m02_supporting_attachments where report_id=p_report_id and state<>'deleted');
end $$;

create function public.csvb_m02_attachment_reserve_appendix(p_report_id uuid,p_appendix_record_id uuid,
 p_filename text,p_mime text,p_size bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.m02_inspection_reports:=public.csvb_m02_attachment_report(p_report_id,true);
 rec public.m02_appendix_records; a public.m02_supporting_attachments;
 ext text:=lower(substring(p_filename from '\.([^.]+)$')); expected text; n integer; bytes bigint; actor_name text;
begin
 select * into rec from public.m02_appendix_records where id=p_appendix_record_id and report_id=r.id and not is_deleted;
 if rec.id is null or rec.kind not in ('maintenance','photo') then raise exception 'Appendix record not accessible' using errcode='42501'; end if;
 if p_filename is null or length(p_filename)>240 or p_filename ~ '[[:cntrl:]]'
   or position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 then raise exception 'Invalid filename'; end if;
 expected:=case ext when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png'
  when 'webp' then 'image/webp' when 'pdf' then 'application/pdf' when 'doc' then 'application/msword'
  when 'xls' then 'application/vnd.ms-excel' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' end;
 if expected is null or p_mime is distinct from expected or (rec.kind='photo' and expected not like 'image/%') then
   raise exception 'Photographic records require JPG/PNG/WebP images; supporting documents use approved M02 types'; end if;
 if p_size is null or p_size<=0 or p_size>10485760 then raise exception 'Maximum 10 MB per photo or maintenance attachment group'; end if;
 select count(*),coalesce(sum(size_bytes),0) into n,bytes from public.m02_supporting_attachments
  where appendix_record_id=rec.id and state<>'deleted';
 if n>=(case when rec.kind='photo' then 1 else 5 end) or bytes+p_size>10485760 then
   raise exception 'Attachment limit reached (one photo or 5 maintenance files; 10 MB combined)'; end if;
 select coalesce(nullif(trim(concat_ws(' ',to_jsonb(p)->>'first_name',to_jsonb(p)->>'surname')),''),to_jsonb(p)->>'username',auth.uid()::text)
 into actor_name from public.profiles p where id=auth.uid();
 a.id:=gen_random_uuid();
 insert into public.m02_supporting_attachments(id,report_id,company_id,appendix_record_id,storage_path,original_filename,mime_type,size_bytes,uploaded_by,uploaded_by_name)
 values(a.id,r.id,r.company_id,rec.id,r.company_id::text||'/'||r.id::text||'/'||a.id::text||'.'||ext,
  p_filename,expected,p_size,auth.uid(),actor_name) returning * into a;
 return to_jsonb(a);
end $$;

create function public.csvb_m02_derive_finding_totals()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 new.details:=new.details||(select jsonb_build_object(
  'total_high',count(*) filter(where severity='High'),'total_medium',count(*) filter(where severity='Medium'),
  'total_low',count(*) filter(where severity='Low'))
  from public.m02_appendix_records where report_id=new.id and kind='finding' and not is_deleted);
 return new;
end $$;
create trigger m02_finding_totals before insert or update on public.m02_inspection_reports
 for each row execute function public.csvb_m02_derive_finding_totals();

create function public.csvb_m02_get_v3(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare base jsonb:=public.csvb_m02_get_v2(p_report_id);
begin
 return base||jsonb_build_object('appendices',jsonb_build_object(
  'records',(select coalesce(jsonb_agg(to_jsonb(a) order by sort_order,id),'[]') from public.m02_appendix_records a where report_id=p_report_id and not is_deleted),
  'critical_items',(select jsonb_agg(jsonb_build_object('item_no',c.item_no,'item_text',c.item_text,'response',r.response,'comments',coalesce(r.comments,'')) order by c.item_no)
   from public.m02_critical_item_catalogue c left join public.m02_critical_item_responses r on r.item_no=c.item_no and r.report_id=p_report_id)));
end $$;
create function public.csvb_m02_reports_v3(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x||jsonb_build_object('critical_total_count',29,'critical_checked_count',
  (select count(*) from public.m02_critical_item_responses c where c.report_id=(x->>'id')::uuid and c.response is not null))),'[]')
 from jsonb_array_elements(public.csvb_m02_reports_v2(p_company_id)) x
$$;

create function public.csvb_m02_save_v3(p_report jsonb,p_answers jsonb default '[]',p_company_items jsonb default '[]',
 p_workspace jsonb default '{}',p_appendices jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; rid uuid; a jsonb; q uuid; cid uuid; n integer; existing public.m02_appendix_records;
 records jsonb; critical jsonb; r public.m02_inspection_reports; source_id uuid; source jsonb; final_values jsonb; provenance jsonb; prior uuid;
begin
 if p_report->>'id' is null and nullif(p_report->>'create_request_id','') is not null then
   select id into prior from public.m02_inspection_reports where create_request_id=(p_report->>'create_request_id')::uuid;
 end if;
 result:=public.csvb_m02_save_v2(p_report,p_answers,p_company_items,p_workspace);
 rid:=(result->>'id')::uuid;
 if prior is not null or p_appendices is null then return result; end if;
 if jsonb_typeof(p_appendices)<>'object' or jsonb_typeof(p_appendices->'records') is distinct from 'array'
   or jsonb_typeof(p_appendices->'critical_items') is distinct from 'array' then raise exception 'Invalid M02 appendices'; end if;
 records:=p_appendices->'records'; critical:=p_appendices->'critical_items';
 if jsonb_array_length(records)>1000 or jsonb_array_length(critical)>29 then raise exception 'Too many appendix rows'; end if;
 if exists(select 1 from jsonb_array_elements(records) x group by x->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(critical) x group by x->>'item_no' having count(*)>1) then raise exception 'Duplicate appendix row'; end if;
 for a in select value from jsonb_array_elements(records) loop
  cid:=(a->>'id')::uuid; q:=nullif(a->>'question_id','')::uuid;
  if cid is null or a->>'kind' is null or a->>'kind' not in ('maintenance','finding','photo') then raise exception 'Invalid appendix row'; end if;
  select * into existing from public.m02_appendix_records where id=cid;
  if existing.id is not null and (existing.report_id<>rid or existing.kind<>a->>'kind' or existing.is_deleted) then
    raise exception 'Appendix identity does not belong to this report' using errcode='42501'; end if;
  if q is not null and not exists(select 1 from public.m02_inspection_responses where report_id=rid and question_id=q) then
    raise exception 'SIRE reference does not belong to this inspection'; end if;
  insert into public.m02_appendix_records(id,report_id,kind,subsection,sort_order,reference,description,comments,corrective_action,
   root_cause,severity,requirement_reference,question_id,due_date,created_by,updated_by)
  values(cid,rid,a->>'kind',nullif(a->>'subsection',''),coalesce((a->>'sort_order')::integer,0),
   coalesce(a->>'reference',''),coalesce(a->>'description',''),coalesce(a->>'comments',''),coalesce(a->>'corrective_action',''),
   coalesce(a->>'root_cause',''),nullif(a->>'severity',''),coalesce(a->>'requirement_reference',''),q,nullif(a->>'due_date','')::date,auth.uid(),auth.uid())
  on conflict(id) do update set subsection=excluded.subsection,sort_order=excluded.sort_order,reference=excluded.reference,
   description=excluded.description,comments=excluded.comments,corrective_action=excluded.corrective_action,root_cause=excluded.root_cause,
   severity=excluded.severity,requirement_reference=excluded.requirement_reference,question_id=excluded.question_id,due_date=excluded.due_date,
   updated_by=auth.uid(),updated_at=now();
 end loop;
 if exists(select 1 from public.m02_appendix_records rec join public.m02_supporting_attachments att on att.appendix_record_id=rec.id
  where rec.report_id=rid and not rec.is_deleted and att.state<>'deleted'
  and not exists(select 1 from jsonb_array_elements(records) x where x->>'id'=rec.id::text)) then
   raise exception 'Remove supporting files before removing their maintenance/photo record'; end if;
 update public.m02_appendix_records rec set is_deleted=true,updated_by=auth.uid(),updated_at=now()
 where report_id=rid and not is_deleted and not exists(select 1 from jsonb_array_elements(records) x where x->>'id'=rec.id::text);
 for a in select value from jsonb_array_elements(critical) loop
  insert into public.m02_critical_item_responses(report_id,item_no,response,comments,updated_by)
  values(rid,(a->>'item_no')::integer,nullif(a->>'response',''),coalesce(a->>'comments',''),auth.uid())
  on conflict(report_id,item_no) do update set response=excluded.response,comments=excluded.comments,updated_by=auth.uid(),updated_at=now();
 end loop;
 select * into r from public.m02_inspection_reports where id=rid;
 source_id:=nullif(p_appendices->>'vetting_source_id','')::uuid;
 if source_id is not null then
  if r.last_vetting_provenance->'source'->>'report_id'=source_id::text then source:=r.last_vetting_provenance->'source';
  else
   select jsonb_build_object('report_id',s.id,'inspection_date',s.inspection_date,
    'oil_major',coalesce(nullif(s.ocimf_inspecting_company,''),nullif(s.inspector_company,''),''),
    'port_name',coalesce(s.port_name,''),'report_ref',coalesce(s.report_ref,''))
   into source from public.post_inspection_reports s where s.id=source_id and s.company_id=r.company_id and s.vessel_id=r.vessel_id;
   if source is null then raise exception 'Post-Inspection prefill source not accessible' using errcode='42501'; end if;
  end if;
 end if;
 final_values:=jsonb_build_object('inspection_date',r.details->'last_vetting_date','oil_major',coalesce(r.details->>'last_vetting_company',''),
  'port_name',coalesce(r.details->>'last_vetting_place',''),'report_ref',coalesce(r.details->>'last_vetting_details',''));
 provenance:=jsonb_build_object('source',source,'manual_override',
  coalesce((p_appendices->>'manual_vetting_override')::boolean,false) or (source is not null and final_values is distinct from source-'report_id'),
  'saved_by',auth.uid(),'saved_at',now());
 update public.m02_inspection_reports set maintenance_previous_closed=coalesce((p_appendices->>'maintenance_previous_closed')::boolean,false),
  last_vetting_provenance=provenance where id=rid;
 return result;
end $$;

-- Extend the existing final-transaction completion gate; no historical report is rewritten.
create or replace function public.csvb_m02_completion_sections(p_report_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_agg(jsonb_build_object('key',key,'label',label,'total',total,'answered',answered,'remaining',total-answered) order by sort_order)
 from (
  select 'company' key,'Part 3' label,3 sort_order,count(*) total,count(*) filter(where r.response in ('Yes','No','N/S')) answered
  from public.m02_company_item_catalogue c left join public.m02_company_item_responses r on r.item_no=c.item_no and r.report_id=p_report_id
  union all select 'questions','Part 4',4,count(*),count(*) filter(where response in ('Yes','No','N/A','N/S'))
  from public.m02_inspection_responses where report_id=p_report_id
  union all select 'critical','Appendix 2',6,count(*),count(*) filter(where r.response in ('Yes','No','N/A'))
  from public.m02_critical_item_catalogue c left join public.m02_critical_item_responses r on r.item_no=c.item_no and r.report_id=p_report_id
 ) sections
$$;
revoke all on function public.csvb_m02_derive_finding_totals(),public.csvb_m02_critical_items(uuid),
 public.csvb_m02_last_vetting(uuid,uuid,date),public.csvb_m02_attachment_reserve_appendix(uuid,uuid,text,text,bigint),
 public.csvb_m02_get_v3(uuid),public.csvb_m02_reports_v3(uuid),public.csvb_m02_save_v3(jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.csvb_m02_critical_items(uuid),public.csvb_m02_last_vetting(uuid,uuid,date),
 public.csvb_m02_attachment_reserve_appendix(uuid,uuid,text,text,bigint),public.csvb_m02_get_v3(uuid),
 public.csvb_m02_reports_v3(uuid),public.csvb_m02_save_v3(jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated;
insert into public.csvb_office_api_contracts(endpoint_kind,endpoint_name,module_codes,rpc_action,shared_read)
select 'rpc',name,array['M02_SHIP_INSPECTION_REPORT'],action,false from (values
 ('csvb_m02_critical_items','view'),('csvb_m02_last_vetting','view'),('csvb_m02_get_v3','view'),
 ('csvb_m02_reports_v3','view'),('csvb_m02_save_v3','edit'),('csvb_m02_attachment_reserve_appendix','edit')) c(name,action);
notify pgrst,'reload schema';
commit;
