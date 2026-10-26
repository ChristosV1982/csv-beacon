begin;
-- Storage is a separate service, so cleanup is resumable: freeze the scope,
-- remove private temporary objects, then delete all relational rows atomically.
-- Completed operations retain only deletion audit identifiers/counts, not text.
create table public.fve_cleanup_operations(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 kind text not null check(kind in('action','draft')),
 object_id uuid not null,
 action_id uuid not null,
 vessel_id uuid,
 requested_by uuid not null references public.profiles(id),
 requested_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in('pending','finalizing','completed')),
 confirmed_issued boolean not null default false,
 expected_revision integer,
 storage_paths text[] not null default '{}',
 result jsonb,
 completed_at timestamptz
);
create unique index fve_cleanup_one_open_scope on public.fve_cleanup_operations(kind,object_id)
 where status in('pending','finalizing');
create index fve_cleanup_action_scope on public.fve_cleanup_operations(action_id) where status in('pending','finalizing');
alter table public.fve_cleanup_operations enable row level security;
revoke all on public.fve_cleanup_operations from public,anon,authenticated;

create function public.csvb_fve_action_delete_state(p_action_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare reason text; op fve_cleanup_operations%rowtype;
begin
 if not csvb_fve_can_edit() then reason:='Office edit permission required.';
 elsif exists(select 1 from fve_vessel_responses r where r.action_id=p_action_id
   and (r.status='submitted' or r.submitted_at is not null or r.response_no is not null))
  or exists(select 1 from fve_prevention_action_targets t where t.action_id=p_action_id
     and (t.workflow_status<>'pending' or t.last_response_id is not null))
  or exists(select 1 from fve_target_events e join fve_prevention_action_targets t on t.id=e.action_target_id
    where t.action_id=p_action_id and e.event<>'issued') then
  reason:='This action has response/audit history and cannot be deleted. Submitted responses, evidence and review history must be preserved.';
 elsif exists(select 1 from fve_cleanup_operations where action_id=p_action_id and kind='draft' and status in('pending','finalizing')) then
  reason:='A draft response deletion is in progress. Finish that deletion first.';
 end if;
 select * into op from fve_cleanup_operations where kind='action' and object_id=p_action_id and status in('pending','finalizing');
 if reason is null and op.id is not null and op.requested_by<>auth.uid() then
  reason:='Another office user is deleting this action. Deletion cannot be started twice.';
 end if;
 return jsonb_build_object('can_delete',reason is null,'reason',reason,'pending',op.id is not null);
end $$;

create function public.csvb_fve_cleanup_prepare(p_company_id uuid,p_kind text,p_object_id uuid,
 p_confirm_issued boolean default false,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c uuid:=csvb_fve_authorized_company(p_company_id); a fve_prevention_actions%rowtype;
 r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype; op fve_cleanup_operations%rowtype;
 info jsonb; paths text[];
begin
 if p_kind is null or p_kind not in('action','draft') then raise exception 'Invalid delete scope.'; end if;
 -- An exact retry after a lost final response is safe, even though the object
 -- no longer exists. No new operation or deletion is performed.
 select * into op from fve_cleanup_operations where company_id=c and kind=p_kind and object_id=p_object_id
  and requested_by=auth.uid() and status='completed' order by completed_at desc limit 1;
 if found then
  if p_kind='action' and not csvb_fve_can_edit() then raise exception 'Office edit permission required.' using errcode='42501'; end if;
  if p_kind='draft' and (not csvb_fve_onboard_access(true) or op.vessel_id is distinct from
    (select vessel_id from profiles where id=auth.uid())) then raise exception 'Own vessel draft access required.' using errcode='42501'; end if;
  return to_jsonb(op);
 end if;
 if p_kind='action' then
  if not csvb_fve_can_edit() then raise exception 'Office edit permission required.' using errcode='42501'; end if;
  select * into a from fve_prevention_actions where id=p_object_id and company_id=c for update;
  if not found then raise exception 'Prevention action not accessible.' using errcode='42501'; end if;
  if a.status not in('draft','issued') then raise exception 'This action cannot be deleted.'; end if;
  if p_expected_revision is distinct from a.revision then raise exception 'The action changed. Reload before deleting.' using errcode='40001'; end if;
  if a.status='issued' and p_confirm_issued is distinct from true then
   raise exception 'Confirm that the issued task and all its targets will be removed.'; end if;
  perform 1 from fve_prevention_action_targets where action_id=a.id order by id for update;
  perform 1 from fve_vessel_responses where action_id=a.id order by id for update;
  info:=csvb_fve_action_delete_state(a.id);
  if not (info->>'can_delete')::boolean then raise exception '%',info->>'reason' using errcode='23514'; end if;
  select coalesce(array_agg(e.storage_path order by e.storage_path),'{}') into paths
   from fve_response_evidence e join fve_vessel_responses x on x.id=e.response_id where x.action_id=a.id;
 else
  select * into r from fve_vessel_responses where id=p_object_id;
  if not found then raise exception 'Draft response not accessible.' using errcode='42501'; end if;
  -- All cleanup scopes lock in the same order: action, target, response.
  select * into a from fve_prevention_actions where id=r.action_id and company_id=c for update;
  t:=csvb_fve_target_access(c,r.action_target_id,'respond');
  perform 1 from fve_prevention_action_targets where id=t.id for update;
  select * into r from fve_vessel_responses where id=p_object_id for update;
  select * into t from fve_prevention_action_targets where id=t.id;
  if r.status<>'draft' or r.submitted_at is not null or r.response_no is not null
   or t.workflow_status not in('pending','returned') then
   raise exception 'Only your current unsubmitted draft response can be deleted. Submitted response history is immutable.' using errcode='23514';
  end if;
  if exists(select 1 from fve_cleanup_operations where action_id=a.id and kind='action' and status in('pending','finalizing')) then
   raise exception 'Office action deletion is in progress. The draft cannot be changed.';
  end if;
  select coalesce(array_agg(storage_path order by storage_path),'{}') into paths from fve_response_evidence where response_id=r.id;
 end if;
 select * into op from fve_cleanup_operations where kind=p_kind and object_id=p_object_id and status in('pending','finalizing');
 if found then
  if op.requested_by<>auth.uid() then raise exception 'Another user is deleting this record.' using errcode='42501'; end if;
  return to_jsonb(op);
 end if;
 insert into fve_cleanup_operations(company_id,kind,object_id,action_id,vessel_id,requested_by,
  confirmed_issued,expected_revision,storage_paths)
 values(c,p_kind,p_object_id,a.id,r.vessel_id,auth.uid(),coalesce(p_confirm_issued,false),p_expected_revision,paths)
 returning * into op;
 return to_jsonb(op);
end $$;

create function public.csvb_fve_cleanup_finish(p_company_id uuid,p_cleanup_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c uuid:=csvb_fve_authorized_company(p_company_id); op fve_cleanup_operations%rowtype;
 a fve_prevention_actions%rowtype; r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype; info jsonb;
begin
 select * into op from fve_cleanup_operations where id=p_cleanup_id and company_id=c and requested_by=auth.uid();
 if not found then raise exception 'Delete operation not accessible.' using errcode='42501'; end if;
 if op.kind='action' and not csvb_fve_can_edit() then raise exception 'Office edit permission required.' using errcode='42501'; end if;
 if op.kind='draft' and (not csvb_fve_onboard_access(true) or op.vessel_id is distinct from
  (select vessel_id from profiles where id=auth.uid())) then raise exception 'Own vessel draft access required.' using errcode='42501'; end if;
 if op.status='completed' then return op.result; end if;
 -- Do not lock the operation before the action: prepare/retry uses action first.
 select * into a from fve_prevention_actions where id=op.action_id and company_id=c for update;
 select * into op from fve_cleanup_operations where id=p_cleanup_id for update;
 if op.status='completed' then return op.result; end if;
 if op.kind='action' then
  perform 1 from fve_prevention_action_targets where action_id=a.id order by id for update;
  perform 1 from fve_vessel_responses where action_id=a.id order by id for update;
  info:=csvb_fve_action_delete_state(a.id);
  if not coalesce((info->>'can_delete')::boolean,false) then raise exception '%',info->>'reason' using errcode='23514'; end if;
  if op.expected_revision is distinct from a.revision then raise exception 'Action changed; deletion blocked.' using errcode='40001'; end if;
  if a.status not in('draft','issued') or (a.status='issued' and not op.confirmed_issued) then raise exception 'Issued deletion confirmation required.'; end if;
 else
  select * into r from fve_vessel_responses where id=op.object_id;
  t:=csvb_fve_target_access(c,r.action_target_id,'respond');
  perform 1 from fve_prevention_action_targets where id=t.id for update;
  select * into r from fve_vessel_responses where id=op.object_id for update;
  select * into t from fve_prevention_action_targets where id=t.id;
  if r.status<>'draft' or r.submitted_at is not null or r.response_no is not null or t.workflow_status not in('pending','returned')
   then raise exception 'Submitted response history cannot be deleted.' using errcode='23514'; end if;
 end if;
 if exists(select 1 from storage.objects where bucket_id='fve-response-evidence' and name=any(op.storage_paths)) then
  raise exception 'Temporary evidence cleanup is incomplete. Nothing was deleted from the workflow. Retry Delete to finish.';
 end if;
 update fve_cleanup_operations set status='finalizing' where id=op.id;
 if op.kind='action' then
  delete from fve_response_evidence where response_id in(select id from fve_vessel_responses where action_id=a.id);
  delete from fve_vessel_responses where action_id=a.id;
  delete from fve_target_events where action_target_id in(select id from fve_prevention_action_targets where action_id=a.id);
  delete from fve_prevention_action_targets where action_id=a.id;
  delete from fve_prevention_action_audit where action_id=a.id;
  delete from fve_prevention_actions where id=a.id;
 else
  delete from fve_response_evidence where response_id=r.id;
  delete from fve_vessel_responses where id=r.id;
 end if;
 info:=jsonb_build_object('deleted',true,'kind',op.kind,'object_id',op.object_id);
 update fve_cleanup_operations set status='completed',completed_at=clock_timestamp(),storage_paths='{}',result=info where id=op.id;
 return info;
end $$;

-- Freeze only the requested scope, including requests that passed a frontend
-- or RPC precheck before the cleanup locks were acquired.
create function public.csvb_fve_cleanup_fence() returns trigger
language plpgsql security definer set search_path=public as $$
declare value jsonb; action uuid; response uuid; op fve_cleanup_operations%rowtype;
begin
 value:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name='fve_prevention_actions' then action:=(value->>'id')::uuid;
 elsif tg_table_name='fve_prevention_action_targets' then action:=(value->>'action_id')::uuid;
 elsif tg_table_name='fve_vessel_responses' then action:=(value->>'action_id')::uuid;response:=(value->>'id')::uuid;
 elsif tg_table_name='fve_response_evidence' then
  response:=(value->>'response_id')::uuid;
  select action_id into action from fve_vessel_responses where id=response;
 else select action_id into action from fve_prevention_action_targets where id=(value->>'action_target_id')::uuid;
 end if;
 select * into op from fve_cleanup_operations where status in('pending','finalizing')
  and ((kind='action' and object_id=action) or (kind='draft' and object_id=response)) limit 1;
 if found and not (op.status='finalizing' and tg_op='DELETE') then
  raise exception 'Deletion is in progress. This record is frozen; retry the Delete control to finish cleanup.' using errcode='55000';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
do $$ declare tab text; begin
 foreach tab in array array['fve_prevention_actions','fve_prevention_action_targets','fve_vessel_responses','fve_response_evidence','fve_target_events']
 loop execute format('create trigger fve_safe_cleanup_fence before insert or update or delete on public.%I for each row execute function public.csvb_fve_cleanup_fence()',tab); end loop;
end $$;

create or replace function public.csvb_fve_immutable_history() returns trigger
language plpgsql security definer set search_path=public as $$
declare response uuid; action uuid;
begin
 if tg_table_name='fve_vessel_responses' then
  if old.status='submitted' or old.submitted_at is not null or old.response_no is not null then
   raise exception 'Submitted vessel responses are immutable.' using errcode='23514'; end if;
  response:=old.id;action:=old.action_id;
 elsif tg_table_name='fve_response_evidence' then
  if exists(select 1 from fve_vessel_responses where id=old.response_id
    and (status='submitted' or submitted_at is not null or response_no is not null)) then
   raise exception 'Submitted response evidence is immutable.' using errcode='23514'; end if;
  response:=old.response_id;select action_id into action from fve_vessel_responses where id=response;
 else
  select action_id into action from fve_prevention_action_targets where id=old.action_target_id;
  if tg_op<>'DELETE' or old.event<>'issued' or not exists(select 1 from fve_cleanup_operations
    where kind='action' and object_id=action and status='finalizing') then
   raise exception 'Workflow audit history is immutable.' using errcode='23514'; end if;
  return old;
 end if;
 if tg_op='DELETE' then
  if not exists(select 1 from fve_cleanup_operations where status='finalizing'
    and ((kind='action' and object_id=action) or (kind='draft' and object_id=response))) then
   raise exception 'Use the authorized Delete control for an unsubmitted draft. Submitted history is immutable.'; end if;
  return old;
 end if;
 return new;
end $$;

create function public.csvb_fve_cleanup_storage_permission(p_response_id uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare r fve_vessel_responses%rowtype; op fve_cleanup_operations%rowtype;
begin
 select * into r from fve_vessel_responses where id=p_response_id;
 select * into op from fve_cleanup_operations where status in('pending','finalizing')
   and ((kind='action' and object_id=r.action_id) or (kind='draft' and object_id=r.id)) limit 1;
 if not found then return null; end if;
 if op.requested_by is distinct from auth.uid() or r.status='submitted' or r.submitted_at is not null or r.response_no is not null then return false; end if;
 perform csvb_fve_authorized_company(op.company_id);
 if op.kind='action' then return csvb_fve_can_edit(); end if;
 return csvb_fve_onboard_access(true) and r.vessel_id=(select vessel_id from profiles where id=auth.uid());
end $$;
create or replace function public.csvb_fve_storage_access(p_path text,p_operation text,p_metadata jsonb default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare e fve_response_evidence%rowtype; r fve_vessel_responses%rowtype; t fve_prevention_action_targets%rowtype; cleanup boolean;
begin
 if auth.uid() is null then return false; end if;
 select * into e from fve_response_evidence where storage_path=p_path;
 if not found then return false; end if;
 select * into r from fve_vessel_responses where id=e.response_id;
 if p_operation='read' then
  cleanup:=csvb_fve_cleanup_storage_permission(r.id);
  if cleanup is not null then return cleanup; end if;
  perform csvb_fve_target_access(e.company_id,r.action_target_id,'read');
  return not e.deleted and (r.status='submitted' or
   (r.status='draft' and csvb_fve_is_onboard_user() and csvb_fve_onboard_access(true)));
 end if;
 select * into r from fve_vessel_responses where id=e.response_id for update;
 select * into e from fve_response_evidence where id=e.id;
 cleanup:=csvb_fve_cleanup_storage_permission(r.id);
 if cleanup is not null then return cleanup and p_operation='delete'; end if;
 t:=csvb_fve_target_access(e.company_id,r.action_target_id,'respond');
 if r.status<>'draft' or t.workflow_status not in('pending','returned') then return false; end if;
 if p_operation='delete' then return true; end if;
 return p_operation='upload' and not e.deleted and
  coalesce(p_metadata->>'size',p_metadata->>'contentLength')::bigint=e.size_bytes and p_metadata->>'mimetype'=e.mime_type;
exception when others then return false;
end $$;

do $$ declare definition text; begin
 select pg_get_functiondef('public.csvb_fve_visible_actions(uuid,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'''workflow_summary'',csvb_fve_action_workflow_summary(a.id)',
  '''workflow_summary'',csvb_fve_action_workflow_summary(a.id),''delete_info'',case when csvb_fve_can_edit() then csvb_fve_action_delete_state(a.id) else null end');
 if position('csvb_fve_action_delete_state(a.id)' in definition)=0 then raise exception 'Unexpected action projection; inspect before migrating.'; end if;
 execute definition;
end $$;
revoke all on function public.csvb_fve_action_delete_state(uuid),public.csvb_fve_cleanup_fence(),
 public.csvb_fve_cleanup_storage_permission(uuid),public.csvb_fve_cleanup_prepare(uuid,text,uuid,boolean,integer),
 public.csvb_fve_cleanup_finish(uuid,uuid) from public,anon,authenticated;
grant execute on function public.csvb_fve_cleanup_prepare(uuid,text,uuid,boolean,integer),
 public.csvb_fve_cleanup_finish(uuid,uuid) to authenticated;
commit;
