begin;
alter table public.m02_inspection_reports add column workspace_state jsonb not null default '{}';

create table public.m02_company_item_catalogue (
 item_no smallint primary key check(item_no between 1 and 51), item_text text not null
);
insert into public.m02_company_item_catalogue values
(1,$t$Safety meeting held (TMSA KPI 9.1.2). Attach relevant minutes. If NO, explain reason.$t$),
(2,$t$Drill conducted. If YES, specify type.$t$),
(3,$t$Training needs identified. If YES, provide details.$t$),
(4,$t$Seminars conducted and training needs addressed. If YES, provide details and update the Personal Training Log.$t$),
(5,$t$Interview held with crew. If YES, provide details.$t$),
(6,$t$Appraisals for crew. Emphasis to be placed for familiarity to using equipment. Provide details (including identified training needs, if any). Attach relevant documentation to this report.$t$),
(7,$t$The concept of HSQE excellence and continuous improvement addressed with the crew.$t$),
(8,$t$PMS training provided. Provide details.$t$),
(9,$t$PMS records compared with actual ship condition.$t$),
(10,$t$Outstandings reporting / unscheduled maintenance rectification system properly followed up.$t$),
(11,$t$Pending works & past job orders verified. Verification of outstandings, job orders and rest pending works reported by the vessel as completed - items not cleared must be repeated as job orders in this report; also, justification must be provided for all items not cleared in time.$t$),
(12,$t$Critical equipment tested.$t$),
(13,$t$Inventories of spares (including optimum inventories of minimum spare parts) verified. Provide details and report any identified shortages, inconsistencies and misalignments.$t$),
(14,$t$Engineering practices & E/R management system properly implemented. If NO, provide details and proposed corrective actions.$t$),
(15,$t$FO/DO/LO bunkering procedures properly implemented (TMSA KPI 6.1.3).$t$),
(16,$t$Oil Record Book entries checked.$t$),
(17,$t$Cargo operations, records and forms reviewed and found in good order (TMSA KPI 6.1.3). Including adherence to seasonal load-line zones, water levels, Port restrictions and shipboard limits, including maximum cargo capacities and loading rates.$t$),
(18,$t$Enhanced Survey File is updated Including reports of structural surveys, condition evaluation reports, thickness measurement reports, repair history, etc.$t$),
(19,$t$Safety standards and Safety recommendations monitoring (TMSA KPI 9.1.1). This must be ensured during all ship visits.$t$),
(20,$t$Safe working practices and permit issuance system properly implemented. Provide details, in case of identified non-compliance.$t$),
(21,$t$Work/rest hours records crosschecked with Logbooks.$t$),
(22,$t$Risk Assessments reviewed.$t$),
(23,$t$Proper implementation of MoC process verified (including checking of cases where MoC should have been originated by the vessel). If NO, provide details and ensure that issue has been discussed with crew.$t$),
(24,$t$Near misses identified. Attach documentation, if any.$t$),
(25,$t$Verification of Environmental Tagging System$t$),
(26,$t$Verification of necessary entries in the Biofouling Management plan$t$),
(27,$t$VOYAGER/GNS (last edition).$t$),
(28,$t$Checked if both ADP and ENP publications are installed on two computers, one of which is connected to vessel's emergency power supply.$t$),
(29,$t$One Ocean Ports Is the last edition installed?$t$),
(30,$t$Passage Plan form last revision used$t$),
(31,$t$Communication system (email) in good working order.$t$),
(32,$t$Training Computer available in good working order.$t$),
(33,$t$Pre-arrival / Pre-departure check lists, completed and cover page signed by all officers on board.$t$),
(34,$t$Company's "Contingency Plan" properly kept and posted.$t$),
(35,$t$Maritime Partners in Safety Software onboard.$t$),
(36,$t$OCEAN Training Platform installed. If yes, verify working order.$t$),
(37,$t$Module or Theme presented during the Superintendent visit / inspection onboard.$t$),
(38,$t$Learning Engagement Tool (LET) binders available onboard.$t$),
(39,$t$SSP and related documentation (files No 47) confirmed locked.$t$),
(40,$t$Effective visitors’ control verified.$t$),
(41,$t$All accommodation doors prevent illegal entry.$t$),
(42,$t$Restricted Areas secured and monitored.$t$),
(43,$t$IMO numbers visible.$t$),
(44,$t$Master has got facility security information from Agents, before arrival.$t$),
(45,$t$Security check point clearly marked and guarded.$t$),
(46,$t$SSO and one more officer holding approved training certificate.$t$),
(47,$t$Intrinsically safe flashlights are available$t$),
(48,$t$Intrinsically safe walkie talkies are available and used for security communication.$t$),
(49,$t$Wi-Fi signal is eliminated on the Bridge and personal electronic devices are not available on the Bridge / CCR & ECR by the officers on duty.$t$),
(50,$t$Plastic water bottles are not reused for carrying any other substances, such as paint, thinner, chemicals, etc.$t$),
(51,$t$Best Practices, Positive issues. Provide details of any identified Best Practices, other worth-mentioning positive performances, etc.$t$);

create table public.m02_company_item_responses (
 report_id uuid not null references public.m02_inspection_reports(id) on delete cascade,
 item_no smallint not null references public.m02_company_item_catalogue(item_no) on delete restrict,
 response text check(response in ('Yes','No','N/S')), comments text not null default '',
 updated_by uuid not null, updated_at timestamptz not null default now(),
 primary key(report_id,item_no), check(length(comments)<=50000)
);
create table public.m02_supporting_attachments (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.m02_inspection_reports(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete restrict,
 question_id uuid, company_item_no smallint references public.m02_company_item_catalogue(item_no) on delete restrict,
 storage_path text not null unique, original_filename text not null, mime_type text not null,
 size_bytes bigint not null check(size_bytes>0 and size_bytes<=10485760),
 state text not null default 'pending' check(state in ('pending','uploaded','deleting','deleted')),
 uploaded_by uuid not null, uploaded_by_name text not null,
 created_at timestamptz not null default now(), uploaded_at timestamptz, deleted_at timestamptz, deleted_by uuid,
 check((question_id is not null and company_item_no is null) or (question_id is null and company_item_no is not null)),
 foreign key(report_id,question_id) references public.m02_inspection_responses(report_id,question_id) on delete restrict
);
create index m02_supporting_attachments_group on public.m02_supporting_attachments(report_id,question_id,company_item_no) where state<>'deleted';
alter table public.m02_company_item_catalogue enable row level security;
alter table public.m02_company_item_responses enable row level security;
alter table public.m02_supporting_attachments enable row level security;
revoke all on public.m02_company_item_catalogue,public.m02_company_item_responses,public.m02_supporting_attachments from public,anon,authenticated;

create function public.csvb_m02_attachment_report(p_report_id uuid,p_edit boolean)
returns public.m02_inspection_reports language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.m02_inspection_reports%rowtype;
begin
 if p_edit then select * into r from public.m02_inspection_reports where id=p_report_id for update;
 else select * into r from public.m02_inspection_reports where id=p_report_id; end if;
 if r.id is null or not public.csvb_m02_vessel_allowed(r.company_id,r.vessel_id,p_edit) then
   raise exception 'M02 report not accessible' using errcode='42501'; end if;
 if p_edit and r.status<>'draft' then raise exception 'Attachments can only be changed on an editable Draft'; end if;
 return r;
end $$;

create function public.csvb_m02_company_items()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and not coalesce(is_disabled,false)
   and (role::text='super_admin' or exists(select 1 from public.csvb_my_effective_app_permissions() e
     where e.module_code='M02_SHIP_INSPECTION_REPORT' and e.permission_action='view' and e.is_granted and e.scope<>'none'))) then
   raise exception 'M02 module access required' using errcode='42501'; end if;
 return (select jsonb_agg(to_jsonb(i) order by item_no) from public.m02_company_item_catalogue i);
end $$;

create function public.csvb_m02_attachments(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.csvb_m02_attachment_report(p_report_id,false);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'report_id',report_id,'question_id',question_id,
   'company_item_no',company_item_no,'original_filename',original_filename,'mime_type',mime_type,'size_bytes',size_bytes,
   'uploaded_by',uploaded_by,'uploaded_by_name',uploaded_by_name,'uploaded_at',uploaded_at,'created_at',created_at,'state',state)
   order by created_at,id),'[]') from public.m02_supporting_attachments where report_id=p_report_id and state<>'deleted');
end $$;

create function public.csvb_m02_get_v2(p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare base jsonb:=public.csvb_m02_get(p_report_id);
begin
 return base||jsonb_build_object('company_items',(select jsonb_agg(jsonb_build_object(
   'item_no',i.item_no,'item_text',i.item_text,'response',r.response,'comments',coalesce(r.comments,'')) order by i.item_no)
   from public.m02_company_item_catalogue i left join public.m02_company_item_responses r
   on r.report_id=p_report_id and r.item_no=i.item_no),'attachments',public.csvb_m02_attachments(p_report_id));
end $$;

create function public.csvb_m02_reports_v2(p_company_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x||jsonb_build_object('company_total_count',51,'company_checked_count',
   (select count(*) from public.m02_company_item_responses r where r.report_id=(x->>'id')::uuid and r.response is not null))
   order by x->>'updated_at' desc),'[]') from jsonb_array_elements(public.csvb_m02_reports(p_company_id)) x
$$;

create function public.csvb_m02_save_v2(p_report jsonb,p_answers jsonb default '[]',p_company_items jsonb default '[]',p_workspace jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; rid uuid; a jsonb; n integer; answer text; original_id uuid:=nullif(p_report->>'id','')::uuid; prior uuid;
begin
 if jsonb_typeof(p_company_items) is distinct from 'array' or jsonb_array_length(p_company_items)>51
   or pg_column_size(p_company_items)>3000000 or jsonb_typeof(p_workspace) is distinct from 'object'
   or pg_column_size(p_workspace)>100000 then raise exception 'Invalid Company items or workspace payload'; end if;
 -- Preserve the original idempotent-create contract: an exact create-request
 -- retry must not overwrite later Company responses or saved workspace.
 if original_id is null and nullif(p_report->>'create_request_id','') is not null then
   perform pg_advisory_xact_lock(hashtextextended(p_report->>'create_request_id',0));
   select id into prior from public.m02_inspection_reports
     where create_request_id=(p_report->>'create_request_id')::uuid;
 end if;
 result:=public.csvb_m02_save(p_report,p_answers);
 rid:=(result->>'id')::uuid;
 if prior is not null then return result; end if;
 if exists(select 1 from jsonb_array_elements(p_company_items) x group by x->>'item_no' having count(*)>1) then
   raise exception 'Duplicate Company item'; end if;
 for a in select value from jsonb_array_elements(p_company_items) loop
   n:=(a->>'item_no')::integer; answer:=nullif(a->>'response','');
   if n is null or n not between 1 and 51 or (answer is not null and answer not in ('Yes','No','N/S'))
     or length(coalesce(a->>'comments',''))>50000 then raise exception 'Invalid Company attendance response'; end if;
   insert into public.m02_company_item_responses(report_id,item_no,response,comments,updated_by)
     values(rid,n,answer,coalesce(a->>'comments',''),auth.uid())
   on conflict(report_id,item_no) do update set response=excluded.response,comments=excluded.comments,
     updated_by=auth.uid(),updated_at=now();
 end loop;
 update public.m02_inspection_reports set workspace_state=p_workspace where id=rid;
 return result||jsonb_build_object('company_checked_count',(select count(*) from public.m02_company_item_responses
   where report_id=rid and response is not null),'company_total_count',51);
end $$;

create function public.csvb_m02_attachment_reserve(p_report_id uuid,p_question_id uuid,p_company_item_no integer,p_filename text,p_mime text,p_size bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.m02_inspection_reports:=public.csvb_m02_attachment_report(p_report_id,true);
 a public.m02_supporting_attachments%rowtype; ext text:=lower(substring(p_filename from '\.([^.]+)$')); expected text;
 count_files integer; total_bytes bigint; actor_name text;
begin
 if (p_question_id is null)=(p_company_item_no is null) then raise exception 'Select one question or Company item'; end if;
 if p_question_id is not null and not exists(select 1 from public.m02_inspection_responses
   where report_id=r.id and question_id=p_question_id) then raise exception 'Question does not belong to report'; end if;
 if p_company_item_no is not null and not exists(select 1 from public.m02_company_item_catalogue where item_no=p_company_item_no) then
   raise exception 'Unknown Company item'; end if;
 if p_filename is null or length(p_filename)>240 or p_filename ~ '[[:cntrl:]]'
   or position('/' in p_filename)>0 or position(chr(92) in p_filename)>0 then raise exception 'Invalid filename'; end if;
 expected:=case ext when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png'
   when 'webp' then 'image/webp' when 'pdf' then 'application/pdf' when 'doc' then 'application/msword'
   when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   when 'xls' then 'application/vnd.ms-excel' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' end;
 if expected is null or p_mime is distinct from expected then raise exception 'Unsupported attachment type'; end if;
 if p_size is null or p_size<=0 or p_size>10485760 then raise exception 'Attachments must total at most 10 MB per question/item'; end if;
 -- The report FOR UPDATE lock serializes reservations and completion, including
 -- concurrent requests for the final slot/remaining bytes.
 select count(*),coalesce(sum(size_bytes),0) into count_files,total_bytes from public.m02_supporting_attachments
   where report_id=r.id and question_id is not distinct from p_question_id
     and company_item_no is not distinct from p_company_item_no and state<>'deleted';
 if count_files>=5 then raise exception 'Maximum 5 files per question/item'; end if;
 if total_bytes+p_size>10485760 then raise exception 'Maximum 10 MB combined per question/item'; end if;
 select coalesce(nullif(trim(concat_ws(' ',coalesce(to_jsonb(p)->>'first_name',to_jsonb(p)->>'name'),
   coalesce(to_jsonb(p)->>'surname',to_jsonb(p)->>'last_name'))),''),to_jsonb(p)->>'username',auth.uid()::text)
   into actor_name from public.profiles p where id=auth.uid();
 a.id:=gen_random_uuid();
 insert into public.m02_supporting_attachments(id,report_id,company_id,question_id,company_item_no,storage_path,
   original_filename,mime_type,size_bytes,uploaded_by,uploaded_by_name)
 values(a.id,r.id,r.company_id,p_question_id,p_company_item_no,
   r.company_id::text||'/'||r.id::text||'/'||a.id::text||'.'||ext,p_filename,expected,p_size,auth.uid(),actor_name)
 returning * into a;
 return to_jsonb(a);
end $$;

create function public.csvb_m02_attachment_finalize(p_attachment_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.m02_supporting_attachments%rowtype; meta jsonb;
begin
 select * into a from public.m02_supporting_attachments where id=p_attachment_id;
 if a.id is null then raise exception 'Attachment not found'; end if;
 perform public.csvb_m02_attachment_report(a.report_id,true);
 select * into a from public.m02_supporting_attachments where id=p_attachment_id for update;
 if a.uploaded_by<>auth.uid() or a.state not in ('pending','uploaded') then raise exception 'Upload not accessible' using errcode='42501'; end if;
 select metadata into meta from storage.objects where bucket_id='m02-supporting-evidence' and name=a.storage_path;
 if meta is null or (meta->>'size')::bigint is distinct from a.size_bytes or meta->>'mimetype' is distinct from a.mime_type then
   raise exception 'Stored file size/type does not match reservation'; end if;
 update public.m02_supporting_attachments set state='uploaded',uploaded_at=coalesce(uploaded_at,now()) where id=a.id;
 return (select x from jsonb_array_elements(public.csvb_m02_attachments(a.report_id)) x where x->>'id'=a.id::text);
end $$;

create function public.csvb_m02_attachment_download(p_attachment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a public.m02_supporting_attachments%rowtype;
begin
 select * into a from public.m02_supporting_attachments where id=p_attachment_id and state='uploaded';
 if a.id is null then raise exception 'Attachment is not available'; end if;
 perform public.csvb_m02_attachment_report(a.report_id,false);
 return jsonb_build_object('storage_path',a.storage_path,'original_filename',a.original_filename);
end $$;

create function public.csvb_m02_attachment_delete(p_attachment_id uuid,p_finish boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.m02_supporting_attachments%rowtype;
begin
 select * into a from public.m02_supporting_attachments where id=p_attachment_id;
 if a.id is null then raise exception 'Attachment not found'; end if;
 perform public.csvb_m02_attachment_report(a.report_id,true);
 select * into a from public.m02_supporting_attachments where id=p_attachment_id for update;
 if a.state='deleted' then return jsonb_build_object('deleted',true,'storage_path',a.storage_path); end if;
 if p_finish then
   if exists(select 1 from storage.objects where bucket_id='m02-supporting-evidence' and name=a.storage_path) then
     raise exception 'Remove the private file before completing deletion'; end if;
   update public.m02_supporting_attachments set state='deleted',deleted_at=now(),deleted_by=auth.uid() where id=a.id;
 else update public.m02_supporting_attachments set state='deleting' where id=a.id; end if;
 return jsonb_build_object('deleted',p_finish,'storage_path',a.storage_path);
end $$;

create function public.csvb_m02_completion_attachment_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='completed' and exists(select 1 from public.m02_supporting_attachments
   where report_id=new.id and state in ('pending','deleting')) then
   raise exception 'Finish or remove pending attachments before completing this report'; end if;
 return new;
end $$;
create trigger m02_completion_attachments before update of status on public.m02_inspection_reports
 for each row execute function public.csvb_m02_completion_attachment_guard();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('m02-supporting-evidence','m02-supporting-evidence',false,10485760,array[
 'image/jpeg','image/png','image/webp','application/pdf','application/msword',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
-- Even any pre-existing broad storage policy must not allow direct browser
-- access to this bucket. Only the authenticated, permission-checked Edge flow
-- uses the service role to upload/delete or mint short-lived download links.
create policy m02_private_evidence_only_through_edge on storage.objects as restrictive
 for all to authenticated,anon using(bucket_id<>'m02-supporting-evidence') with check(bucket_id<>'m02-supporting-evidence');

revoke all on function public.csvb_m02_attachment_report(uuid,boolean),public.csvb_m02_completion_attachment_guard() from public,anon,authenticated;
revoke all on function public.csvb_m02_company_items(),public.csvb_m02_attachments(uuid),public.csvb_m02_get_v2(uuid),
 public.csvb_m02_reports_v2(uuid),public.csvb_m02_save_v2(jsonb,jsonb,jsonb,jsonb),
 public.csvb_m02_attachment_reserve(uuid,uuid,integer,text,text,bigint),public.csvb_m02_attachment_finalize(uuid),
 public.csvb_m02_attachment_download(uuid),public.csvb_m02_attachment_delete(uuid,boolean) from public,anon;
grant execute on function public.csvb_m02_company_items(),public.csvb_m02_attachments(uuid),public.csvb_m02_get_v2(uuid),
 public.csvb_m02_reports_v2(uuid),public.csvb_m02_save_v2(jsonb,jsonb,jsonb,jsonb),
 public.csvb_m02_attachment_reserve(uuid,uuid,integer,text,text,bigint),public.csvb_m02_attachment_finalize(uuid),
 public.csvb_m02_attachment_download(uuid),public.csvb_m02_attachment_delete(uuid,boolean) to authenticated;
commit;
