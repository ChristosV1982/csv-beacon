begin;

-- Target workflow is independent from the Phase 2 parent Draft/Issued status.
alter table public.fve_prevention_action_targets
  add column workflow_status text not null default 'pending'
    check(workflow_status in('pending','response_submitted','office_review','returned','closed')),
  add column activated_at timestamptz,
  add column updated_at timestamptz not null default now();
create table public.fve_vessel_responses(
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.fve_prevention_actions(id) on delete restrict,
  action_target_id uuid not null references public.fve_prevention_action_targets(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  vessel_id uuid not null references public.vessels(id) on delete restrict,
  response_no integer,
  response_text text not null default '' check(length(response_text)<=30000),
  status text not null default 'draft' check(status in('draft','submitted','discarded')),
  action_revision integer not null,
  instruction_snapshot text not null,
  created_by uuid not null references public.profiles(id),
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(action_target_id,response_no),
  check((status='submitted' and response_no>0 and submitted_at is not null
    and submitted_by is not null and length(trim(response_text))>0)
    or (status<>'submitted' and response_no is null and submitted_at is null))
);
create unique index fve_one_response_draft on public.fve_vessel_responses(action_target_id) where status='draft';
create index fve_response_target_history on public.fve_vessel_responses(action_target_id,submitted_at);
alter table public.fve_prevention_action_targets add column last_response_id uuid
  references public.fve_vessel_responses(id) on delete restrict;
alter table public.fve_prevention_action_targets add unique(id,action_id,company_id,vessel_id);
alter table public.fve_vessel_responses
 add unique(id,company_id,vessel_id),add unique(id,action_target_id),
 add foreign key(action_target_id,action_id,company_id,vessel_id)
   references public.fve_prevention_action_targets(id,action_id,company_id,vessel_id) on delete restrict;
alter table public.fve_prevention_action_targets
 add foreign key(last_response_id,id) references public.fve_vessel_responses(id,action_target_id) on delete restrict,
 add check(workflow_status='pending' or last_response_id is not null);
create table public.fve_response_evidence(
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.fve_vessel_responses(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  vessel_id uuid not null references public.vessels(id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=10485760),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index fve_evidence_response on public.fve_response_evidence(response_id) where not deleted;
alter table public.fve_response_evidence add foreign key(response_id,company_id,vessel_id)
 references public.fve_vessel_responses(id,company_id,vessel_id) on delete restrict;
create table public.fve_target_events(
  id uuid primary key default gen_random_uuid(),
  action_target_id uuid not null references public.fve_prevention_action_targets(id) on delete restrict,
  response_id uuid references public.fve_vessel_responses(id) on delete restrict,
  event text not null check(event in('issued','response_submitted','office_review','returned','closed')),
  comment text check(length(comment)<=20000),
  actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default now()
);
create index fve_target_event_history on public.fve_target_events(action_target_id,occurred_at,id);
create unique index fve_target_issued_once on public.fve_target_events(action_target_id) where event='issued';
alter table public.fve_target_events add foreign key(response_id,action_target_id)
 references public.fve_vessel_responses(id,action_target_id) on delete restrict;
alter table public.fve_vessel_responses enable row level security;
alter table public.fve_response_evidence enable row level security;
alter table public.fve_target_events enable row level security;
revoke all on public.fve_vessel_responses,public.fve_response_evidence,public.fve_target_events from public,anon,authenticated;

create function public.csvb_fve_is_onboard_user() returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select role::text='vessel' or
   (vessel_id is not null and onboard_rank_id is not null
    and role::text not in('super_admin','platform_owner','company_admin','company_superintendent'))
   from profiles where id=auth.uid()),false)
$$;
create function public.csvb_fve_onboard_access(p_write boolean) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles p join vessels v on v.id=p.vessel_id and v.company_id=p.company_id
   where p.id=auth.uid() and csvb_fve_is_onboard_user() and v.is_active
   and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false)
   and p.onboard_access_enabled is true
   and (p.onboard_status in('onboard','temporarily_ashore')
     or (not p_write and p.onboard_status='disembarked' and p.read_only_after_disembarkation is true)))
$$;
create function public.csvb_fve_target_access(p_company_id uuid,p_target_id uuid,p_operation text)
returns public.fve_prevention_action_targets language plpgsql stable security definer set search_path=public as $$
declare c uuid:=csvb_fve_authorized_company(p_company_id); t fve_prevention_action_targets%rowtype;
begin
 select x.* into t from fve_prevention_action_targets x join fve_prevention_actions a on a.id=x.action_id
 where x.id=p_target_id and x.company_id=c and a.company_id=c and a.status='issued';
 if not found then raise exception 'Issued vessel target not accessible.' using errcode='42501'; end if;
 if csvb_fve_is_onboard_user() then
   if not csvb_fve_onboard_access(p_operation='respond') or
      t.vessel_id is distinct from (select vessel_id from profiles where id=auth.uid()) then
     raise exception 'Active access to your assigned vessel target is required.' using errcode='42501';
   end if;
 elsif p_operation='respond' then
   raise exception 'Only authorized onboard users can submit a vessel response.' using errcode='42501';
 end if;
 if p_operation='review' and not csvb_fve_can_edit() then
   raise exception 'Office edit/review permission required.' using errcode='42501';
 end if;
 return t;
end $$;
create function public.csvb_fve_action_workflow_summary(p_action_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 with visible as (
  select t.*,v.name vessel_name,
    (a.due_date<current_date and t.workflow_status in('pending','returned','response_submitted')) overdue,
    (csvb_fve_is_onboard_user() and csvb_fve_onboard_access(true)
      and t.workflow_status in('pending','returned')) can_respond
  from fve_prevention_action_targets t join fve_prevention_actions a on a.id=t.action_id
    join vessels v on v.id=t.vessel_id
  where a.id=p_action_id and a.status='issued' and
    (not csvb_fve_is_onboard_user() or (csvb_fve_onboard_access(false)
      and t.vessel_id=(select vessel_id from profiles where id=auth.uid())))
 )
 select jsonb_build_object('can_review',csvb_fve_can_edit(),'counts',jsonb_build_object(
   'pending',count(*) filter(where workflow_status='pending'),
   'response_submitted',count(*) filter(where workflow_status='response_submitted'),
   'office_review',count(*) filter(where workflow_status='office_review'),
   'returned',count(*) filter(where workflow_status='returned'),
   'closed',count(*) filter(where workflow_status='closed')),
   'targets',coalesce(jsonb_agg(jsonb_build_object('id',id,'vessel_id',vessel_id,
    'vessel_name',vessel_name,'status',workflow_status,'overdue',coalesce(overdue,false),
    'can_respond',can_respond) order by vessel_name,id),'[]'::jsonb)) from visible
$$;
create or replace function public.csvb_fve_visible_actions(p_company_id uuid,p_source_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(
  (case when csvb_fve_is_onboard_user() then to_jsonb(a)-'source_observation_item_id'-'created_by'-'updated_by'
    else to_jsonb(a) end) || jsonb_build_object(
   'target_count',(select count(*) from fve_prevention_action_targets t where t.action_id=a.id),
   'targets',case when not csvb_fve_is_onboard_user() then
     (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'vessel_id',t.vessel_id,'vessel_name',v.name)
       order by v.name),'[]'::jsonb) from fve_prevention_action_targets t join vessels v on v.id=t.vessel_id where t.action_id=a.id)
     else '[]'::jsonb end,
   'workflow_summary',csvb_fve_action_workflow_summary(a.id)) order by a.created_at),'[]'::jsonb)
 from fve_prevention_actions a where a.company_id=p_company_id and a.source_observation_item_id=p_source_id
 and (not csvb_fve_is_onboard_user() or (csvb_fve_onboard_access(false) and a.status='issued' and exists(
   select 1 from fve_prevention_action_targets t join profiles p on p.id=auth.uid() and p.vessel_id=t.vessel_id
   where t.action_id=a.id and t.company_id=p_company_id)))
$$;

create function public.csvb_fve_target_workflow(p_company_id uuid,p_target_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t fve_prevention_action_targets%rowtype:=csvb_fve_target_access(p_company_id,p_target_id,'read');
 a fve_prevention_actions%rowtype; respond boolean;
begin
 select * into a from fve_prevention_actions where id=t.action_id;
 respond:=csvb_fve_is_onboard_user() and csvb_fve_onboard_access(true) and t.workflow_status in('pending','returned');
 return jsonb_build_object(
  'action',jsonb_build_object('id',a.id,'instruction',a.preventative_actions_required_by_vessel,'due_date',a.due_date,'revision',a.revision),
  'target',jsonb_build_object('id',t.id,'vessel_id',t.vessel_id,'vessel_name',(select name from vessels where id=t.vessel_id),
    'status',t.workflow_status,'overdue',coalesce(a.due_date<current_date and t.workflow_status in('pending','returned','response_submitted'),false)),
  'can_respond',respond,'can_review',csvb_fve_can_edit(),
  'responses',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('evidence',
     (select coalesce(jsonb_agg(to_jsonb(e) order by e.uploaded_at,e.id),'[]'::jsonb)
       from fve_response_evidence e where e.response_id=r.id and not e.deleted))
     order by r.response_no),'[]'::jsonb) from fve_vessel_responses r where r.action_target_id=t.id and r.status='submitted'),
  'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id),'[]'::jsonb)
     from fve_target_events e where e.action_target_id=t.id),
  'draft',(select to_jsonb(r)||jsonb_build_object('evidence',
     (select coalesce(jsonb_agg(to_jsonb(e) order by e.uploaded_at,e.id),'[]'::jsonb)
      from fve_response_evidence e where e.response_id=r.id and not e.deleted))
    from fve_vessel_responses r where r.action_target_id=t.id and r.status='draft' and respond));
end $$;
create function public.csvb_fve_response_draft(p_company_id uuid,p_target_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t fve_prevention_action_targets%rowtype;
begin
 perform csvb_fve_target_access(p_company_id,p_target_id,'respond');
 select * into t from fve_prevention_action_targets where id=p_target_id for update;
 if t.workflow_status not in('pending','returned') then raise exception 'This target is not awaiting a vessel response.'; end if;
 insert into fve_vessel_responses(action_id,action_target_id,company_id,vessel_id,action_revision,instruction_snapshot,created_by)
 select a.id,t.id,t.company_id,t.vessel_id,a.revision,a.preventative_actions_required_by_vessel,auth.uid()
 from fve_prevention_actions a where a.id=t.action_id
 on conflict(action_target_id) where status='draft' do nothing;
 return csvb_fve_target_workflow(p_company_id,p_target_id);
end $$;
create function public.csvb_fve_evidence_reserve(
 p_company_id uuid,p_response_id uuid,p_filename text,p_mime_type text,p_size_bytes bigint
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r fve_vessel_responses%rowtype; e fve_response_evidence%rowtype; ext text; expected text; used bigint; files integer;
begin
 select * into r from fve_vessel_responses where id=p_response_id for update;
 if not found then raise exception 'Draft response not accessible.' using errcode='42501'; end if;
 perform csvb_fve_target_access(p_company_id,r.action_target_id,'respond');
 if r.status<>'draft' or (select workflow_status from fve_prevention_action_targets where id=r.action_target_id) not in('pending','returned')
 then raise exception 'Evidence can only be uploaded to a current draft response.'; end if;
 if p_filename is null or length(p_filename)>200 or p_filename ~ '[\\/[:cntrl:]]' then raise exception 'Invalid evidence filename.'; end if;
 ext:=lower(substring(p_filename from '\.([a-zA-Z0-9]+)$'));
 expected:=case ext when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png'
  when 'webp' then 'image/webp' when 'pdf' then 'application/pdf'
  when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  when 'txt' then 'text/plain' when 'csv' then 'text/csv' end;
 if expected is null or p_mime_type is distinct from expected then raise exception 'Unsupported evidence type. Scripts, executables and archives are not allowed.'; end if;
 if p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>10485760 then raise exception 'Evidence must fit within 10 MB combined per submission.'; end if;
 select count(*),coalesce(sum(size_bytes),0) into files,used from fve_response_evidence where response_id=r.id and not deleted;
 if files>=5 then raise exception 'Maximum 5 active evidence files per response.' using errcode='23514'; end if;
 if used+p_size_bytes>10485760 then raise exception 'Maximum 10 MB combined evidence per response.' using errcode='23514'; end if;
 e.id:=gen_random_uuid();
 insert into fve_response_evidence(id,response_id,company_id,vessel_id,storage_path,original_filename,mime_type,size_bytes,uploaded_by)
 values(e.id,r.id,r.company_id,r.vessel_id,r.company_id||'/'||r.vessel_id||'/'||r.id||'/'||e.id||'.'||ext,
   p_filename,p_mime_type,p_size_bytes,auth.uid()) returning * into e;
 return to_jsonb(e);
end $$;

create function public.csvb_fve_response_draft_text_save(p_company_id uuid,p_response_id uuid,p_response_text text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype;
begin
 select * into r from fve_vessel_responses where id=p_response_id;
 if not found then raise exception 'Draft not accessible.' using errcode='42501'; end if;
 perform csvb_fve_target_access(p_company_id,r.action_target_id,'respond');
 select * into t from fve_prevention_action_targets where id=r.action_target_id for update;
 select * into r from fve_vessel_responses where id=p_response_id for update;
 if r.status<>'draft' or t.workflow_status not in('pending','returned') then raise exception 'Only a current draft can be saved.'; end if;
 if p_response_text is null or length(p_response_text)>30000 then raise exception 'Vessel Response maximum 30000 characters.'; end if;
 update fve_vessel_responses set response_text=p_response_text,updated_at=clock_timestamp() where id=r.id;
 return csvb_fve_target_workflow(p_company_id,t.id);
end $$;
create function public.csvb_fve_response_submit(p_company_id uuid,p_response_id uuid,p_response_text text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype;
begin
 select * into r from fve_vessel_responses where id=p_response_id;
 if not found then raise exception 'Response not accessible.' using errcode='42501'; end if;
 perform csvb_fve_target_access(p_company_id,r.action_target_id,'respond');
 select * into t from fve_prevention_action_targets where id=r.action_target_id for update;
 select * into r from fve_vessel_responses where id=p_response_id for update;
 if r.status='submitted' and r.response_text=trim(p_response_text) then
   return csvb_fve_target_workflow(p_company_id,t.id); -- exact network retry, not a second submission
 end if;
 if r.status<>'draft' or t.workflow_status not in('pending','returned') then raise exception 'This submission cannot be edited. Open the current target history.'; end if;
 if nullif(trim(p_response_text),'') is null or length(trim(p_response_text))>30000 then raise exception 'Enter a Vessel Response (maximum 30000 characters).'; end if;
 if exists(select 1 from fve_response_evidence e where e.response_id=r.id and not e.deleted and not exists(
    select 1 from storage.objects o where o.bucket_id='fve-response-evidence' and o.name=e.storage_path
      and (o.metadata->>'size')::bigint=e.size_bytes and o.metadata->>'mimetype'=e.mime_type))
 then raise exception 'Evidence upload is incomplete. Retry or remove the incomplete file before submitting.'; end if;
 if (select count(*)>5 or coalesce(sum(size_bytes),0)>10485760 from fve_response_evidence where response_id=r.id and not deleted)
 then raise exception 'Evidence exceeds 5 files or 10 MB combined.'; end if;
 update fve_vessel_responses set response_text=trim(p_response_text),status='submitted',
   response_no=(select coalesce(max(response_no),0)+1 from fve_vessel_responses where action_target_id=t.id),
   submitted_at=clock_timestamp(),submitted_by=auth.uid(),updated_at=clock_timestamp() where id=r.id;
 update fve_prevention_action_targets set workflow_status='response_submitted',last_response_id=r.id,updated_at=clock_timestamp() where id=t.id;
 insert into fve_target_events(action_target_id,response_id,event,actor_id) values(t.id,r.id,'response_submitted',auth.uid());
 return csvb_fve_target_workflow(p_company_id,t.id);
end $$;
create function public.csvb_fve_target_review(p_company_id uuid,p_target_id uuid,p_decision text,
 p_comment text default null,p_expected_response_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t fve_prevention_action_targets%rowtype; next_status text;
begin
 perform csvb_fve_target_access(p_company_id,p_target_id,'review');
 select * into t from fve_prevention_action_targets where id=p_target_id for update;
 if p_expected_response_id is null or p_expected_response_id is distinct from t.last_response_id then
   raise exception 'The response changed. Reload before reviewing.' using errcode='40001'; end if;
 if p_decision='start_review' and t.workflow_status='office_review' then return csvb_fve_target_workflow(p_company_id,t.id); end if;
 if p_decision='start_review' and t.workflow_status='response_submitted' then next_status:='office_review';
 elsif p_decision in('return','close') and t.workflow_status='office_review' then
   next_status:=case p_decision when 'return' then 'returned' else 'closed' end;
 else raise exception 'Invalid workflow transition. Reload the target history.'; end if;
 if p_decision='return' and nullif(trim(p_comment),'') is null then raise exception 'An office comment/reason is required when returning to vessel.'; end if;
 if length(p_comment)>20000 then raise exception 'Office comment exceeds 20000 characters.'; end if;
 update fve_prevention_action_targets set workflow_status=next_status,updated_at=clock_timestamp() where id=t.id;
 insert into fve_target_events(action_target_id,response_id,event,comment,actor_id)
 values(t.id,t.last_response_id,next_status,nullif(trim(p_comment),''),auth.uid());
 return csvb_fve_target_workflow(p_company_id,t.id);
end $$;

create function public.csvb_fve_evidence_cancel(p_company_id uuid,p_evidence_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare e fve_response_evidence%rowtype; r fve_vessel_responses%rowtype;
begin
 select * into e from fve_response_evidence where id=p_evidence_id;
 if not found then raise exception 'Evidence not accessible.' using errcode='42501'; end if;
 select * into r from fve_vessel_responses where id=e.response_id for update;
 perform csvb_fve_target_access(p_company_id,r.action_target_id,'respond');
 if r.status<>'draft' then raise exception 'Submitted evidence is immutable.'; end if;
 if exists(select 1 from storage.objects where bucket_id='fve-response-evidence' and name=e.storage_path)
 then raise exception 'Remove the temporary storage object before releasing its evidence slot.'; end if;
 update fve_response_evidence set deleted=true where id=e.id;
 return jsonb_build_object('ok',true);
end $$;
create function public.csvb_fve_response_discard(p_company_id uuid,p_response_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r fve_vessel_responses%rowtype;
begin
 select * into r from fve_vessel_responses where id=p_response_id for update;
 if not found then raise exception 'Draft not accessible.' using errcode='42501'; end if;
 perform csvb_fve_target_access(p_company_id,r.action_target_id,'respond');
 if r.status<>'draft' then raise exception 'Submitted history cannot be discarded.'; end if;
 if exists(select 1 from fve_response_evidence e join storage.objects o on o.bucket_id='fve-response-evidence' and o.name=e.storage_path where e.response_id=r.id)
 then raise exception 'Remove draft storage objects before discarding.'; end if;
 update fve_response_evidence set deleted=true where response_id=r.id;
 update fve_vessel_responses set status='discarded',updated_at=now() where id=r.id;
 return jsonb_build_object('ok',true);
end $$;

-- Private storage: reservation sizes + a locked draft enforce atomic quotas.
-- Actual size/MIME are set by Storage, not custom user_metadata.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fve-response-evidence','fve-response-evidence',false,10485760,array[
 'image/jpeg','image/png','image/webp','application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv']);
create function public.csvb_fve_storage_access(p_path text,p_operation text,p_metadata jsonb default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare e fve_response_evidence%rowtype; r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype;
begin
 if auth.uid() is null then return false; end if;
 select * into e from fve_response_evidence where storage_path=p_path;
 if not found then return false; end if;
 select * into r from fve_vessel_responses where id=e.response_id;
 if p_operation='read' then
   perform csvb_fve_target_access(e.company_id,r.action_target_id,'read');
   return not e.deleted and (r.status='submitted' or
     (r.status='draft' and csvb_fve_is_onboard_user() and csvb_fve_onboard_access(true)));
 end if;
 t:=csvb_fve_target_access(e.company_id,r.action_target_id,'respond');
 select * into r from fve_vessel_responses where id=e.response_id for update;
 -- Re-read after waiting for the draft lock: a concurrent cancel may have
 -- released this reservation while the storage request was queued.
 select * into e from fve_response_evidence where id=e.id;
 if r.status<>'draft' or t.workflow_status not in('pending','returned') then return false; end if;
 if p_operation='delete' then return true; end if;
 return p_operation='upload' and not e.deleted and
   (p_metadata->>'size')::bigint=e.size_bytes and p_metadata->>'mimetype'=e.mime_type;
exception when others then return false;
end $$;
-- Restrictive rules prevent another bucket's broad permissive policy from
-- granting access to this bucket. All other buckets retain their behavior.
create policy fve_evidence_read_allow on storage.objects for select to authenticated
 using(bucket_id='fve-response-evidence' and public.csvb_fve_storage_access(name,'read'));
create policy fve_evidence_read_fence on storage.objects as restrictive for select to public
 using(bucket_id<>'fve-response-evidence' or public.csvb_fve_storage_access(name,'read'));
create policy fve_evidence_upload_allow on storage.objects for insert to authenticated
 with check(bucket_id='fve-response-evidence' and public.csvb_fve_storage_access(name,'upload',metadata));
create policy fve_evidence_upload_fence on storage.objects as restrictive for insert to public
 with check(bucket_id<>'fve-response-evidence' or public.csvb_fve_storage_access(name,'upload',metadata));
create policy fve_evidence_no_overwrite on storage.objects as restrictive for update to public
 using(bucket_id<>'fve-response-evidence') with check(bucket_id<>'fve-response-evidence');
create policy fve_evidence_delete_allow on storage.objects for delete to authenticated
 using(bucket_id='fve-response-evidence' and public.csvb_fve_storage_access(name,'delete'));
create policy fve_evidence_delete_fence on storage.objects as restrictive for delete to public
 using(bucket_id<>'fve-response-evidence' or public.csvb_fve_storage_access(name,'delete'));

create function public.csvb_fve_immutable_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='fve_vessel_responses' then
   if old.status='submitted' then raise exception 'Submitted vessel responses are immutable.' using errcode='23514'; end if;
 elsif tg_table_name='fve_response_evidence' then
   if exists(select 1 from fve_vessel_responses where id=old.response_id and status='submitted') then
    raise exception 'Submitted response evidence is immutable.' using errcode='23514'; end if;
 else raise exception 'Workflow audit history is immutable.' using errcode='23514';
 end if;
 if tg_op='DELETE' then raise exception 'Use draft discard; hard deletion of response/evidence history is not permitted.'; end if;
 return new;
end $$;
create trigger fve_response_immutable before update or delete on public.fve_vessel_responses
 for each row execute function public.csvb_fve_immutable_history();
create trigger fve_response_evidence_immutable before update or delete on public.fve_response_evidence
 for each row execute function public.csvb_fve_immutable_history();
create trigger fve_target_event_immutable before update or delete on public.fve_target_events
 for each row execute function public.csvb_fve_immutable_history();
create function public.csvb_fve_activate_issued_targets() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='issued' and old.status is distinct from new.status then
  update fve_prevention_action_targets set activated_at=new.issued_at,updated_at=now() where action_id=new.id;
  insert into fve_target_events(action_target_id,event,actor_id,occurred_at)
   select id,'issued',auth.uid(),coalesce(new.issued_at,now()) from fve_prevention_action_targets where action_id=new.id
   on conflict(action_target_id) where event='issued' do nothing;
 end if;
 return new;
end $$;
create trigger fve_activate_issued_targets after update of status on public.fve_prevention_actions
 for each row execute function public.csvb_fve_activate_issued_targets();
update public.fve_prevention_action_targets t set activated_at=a.issued_at
 from public.fve_prevention_actions a where a.id=t.action_id and a.status='issued';
insert into public.fve_target_events(action_target_id,event,actor_id,occurred_at)
 select t.id,'issued',coalesce((select actor_id from fve_prevention_action_audit h
   where h.action_id=a.id and h.event='issued' order by h.created_at limit 1),a.updated_by,a.created_by),a.issued_at
 from public.fve_prevention_action_targets t join public.fve_prevention_actions a on a.id=t.action_id
 where a.status='issued';

do $$ declare f record; begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in(
  'csvb_fve_is_onboard_user','csvb_fve_onboard_access','csvb_fve_target_access','csvb_fve_action_workflow_summary',
  'csvb_fve_target_workflow','csvb_fve_response_draft','csvb_fve_evidence_reserve','csvb_fve_response_submit',
  'csvb_fve_response_draft_text_save',
  'csvb_fve_target_review','csvb_fve_evidence_cancel','csvb_fve_response_discard','csvb_fve_storage_access',
  'csvb_fve_immutable_history','csvb_fve_activate_issued_targets')
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in('csvb_fve_target_workflow','csvb_fve_response_draft','csvb_fve_evidence_reserve',
    'csvb_fve_response_draft_text_save',
    'csvb_fve_response_submit','csvb_fve_target_review','csvb_fve_evidence_cancel','csvb_fve_response_discard','csvb_fve_storage_access')
  then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end $$;
grant execute on function public.csvb_fve_storage_access(text,text,jsonb) to anon;
-- Extend the existing limited projection's privacy rule to assigned onboard
-- users as well as the legacy vessel role.
do $$
declare definition text;
begin
 select pg_get_functiondef(oid) into definition from pg_proc
 where oid='public.csvb_fve_prevention_history(uuid,text,date,date,text,text,integer,integer)'::regprocedure;
 definition:=replace(definition,
   'vessel_user boolean:=(select role::text=''vessel'' from profiles where id=auth.uid());',
   'vessel_user boolean:=csvb_fve_is_onboard_user();');
 if position('vessel_user boolean:=csvb_fve_is_onboard_user();' in definition)=0 then
  raise exception 'Unexpected prevention history projection; review before migrating.';
 end if;
 execute definition;
end $$;
commit;
