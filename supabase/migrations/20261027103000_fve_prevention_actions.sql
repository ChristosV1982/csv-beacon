begin;

-- A separate awareness workflow. Original inspection fields and counts are untouched.
insert into public.app_permissions(module_id,action)
select id,'edit' from public.app_modules where code='SIRE_FLEET_VETTING_EXPERIENCE'
on conflict(module_id,action) do nothing;
insert into public.role_permissions(role,position,permission_id,scope,is_granted)
select rp.role,rp.position,e.id,rp.scope,rp.is_granted
from public.role_permissions rp
join public.app_permissions v on v.id=rp.permission_id and v.action='view'
join public.app_modules m on m.id=v.module_id and m.code='SIRE_FLEET_VETTING_EXPERIENCE'
join public.app_permissions e on e.module_id=m.id and e.action='edit'
where rp.role::text in ('company_admin','company_superintendent')
and not exists(select 1 from public.role_permissions r where r.role=rp.role
  and r.position is not distinct from rp.position and r.permission_id=e.id);

create table public.fve_prevention_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_observation_item_id uuid not null references public.post_inspection_observation_items(id) on delete restrict,
  canonical_question_no text not null,
  title text,
  preventative_actions_required_by_vessel text not null,
  status text not null default 'draft'
    check(status in ('draft','issued','submitted','returned','closed')),
  target_mode text not null check(target_mode in ('all','selected')),
  source_snapshot jsonb not null check(jsonb_typeof(source_snapshot)='object'),
  issued_at timestamptz,
  due_date date,
  revision integer not null default 1 check(revision>0),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id,source_observation_item_id),
  unique(id,company_id),
  check(length(trim(preventative_actions_required_by_vessel)) between 1 and 20000),
  check(status='draft' or issued_at is not null)
);
create table public.fve_prevention_action_targets (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null,
  company_id uuid not null,
  vessel_id uuid not null references public.vessels(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key(action_id,company_id) references public.fve_prevention_actions(id,company_id) on delete restrict,
  unique(action_id,vessel_id)
);
create index fve_prevention_target_vessel on public.fve_prevention_action_targets(vessel_id,action_id);
create table public.fve_prevention_action_audit (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.fve_prevention_actions(id) on delete restrict,
  event text not null check(event in ('created','updated','issued')),
  actor_id uuid not null references public.profiles(id),
  revision integer not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);
create index fve_prevention_audit_action on public.fve_prevention_action_audit(action_id,revision);
alter table public.fve_prevention_actions enable row level security;
alter table public.fve_prevention_action_targets enable row level security;
alter table public.fve_prevention_action_audit enable row level security;
-- Deliberately RPC-only. No direct browser table access or broad write policies.
revoke all on public.fve_prevention_actions,public.fve_prevention_action_targets,
  public.fve_prevention_action_audit from public,anon,authenticated;

create function public.csvb_fve_can_edit() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles p where p.id=auth.uid()
    and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false)
    and p.role::text in ('super_admin','platform_owner','company_admin','company_superintendent'))
  and exists(select 1 from csvb_my_effective_app_permissions() e
    where e.module_code='SIRE_FLEET_VETTING_EXPERIENCE' and e.permission_action='edit'
      and e.is_granted and e.scope<>'none')
$$;

-- Never expose an action solely because its source finding is fleet-visible.
create function public.csvb_fve_visible_actions(p_company_id uuid,p_source_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
    'target_count',(select count(*) from fve_prevention_action_targets t where t.action_id=a.id),
    'targets',case when (select role::text from profiles where id=auth.uid())<>'vessel'
      then (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'vessel_id',t.vessel_id,
        'vessel_name',v.name) order by v.name),'[]'::jsonb)
        from fve_prevention_action_targets t join vessels v on v.id=t.vessel_id where t.action_id=a.id)
      else '[]'::jsonb end) order by a.created_at),'[]'::jsonb)
  from fve_prevention_actions a
  where a.company_id=p_company_id and a.source_observation_item_id=p_source_id
  and ((select role::text from profiles where id=auth.uid())<>'vessel'
    or (a.status='issued' and exists(select 1 from fve_prevention_action_targets t
      join profiles p on p.id=auth.uid() and p.vessel_id=t.vessel_id
      where t.action_id=a.id and t.company_id=p_company_id)))
$$;

create function public.csvb_fve_prevention_context(p_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare company uuid:=csvb_fve_authorized_company(p_company_id); editable boolean:=csvb_fve_can_edit();
begin
  return jsonb_build_object('company_id',company,'can_edit',editable,
    'vessels',case when editable then
      (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]'::jsonb)
       from vessels where company_id=company and is_active)
      else '[]'::jsonb end);
end $$;

create function public.csvb_fve_prevention_history(
  p_company_id uuid default null,p_question_no text default null,
  p_from_date date default null,p_to_date date default null,
  p_oil_major text default null,p_category text default null,
  p_offset integer default 0,p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  company uuid:=csvb_fve_authorized_company(p_company_id);
  base jsonb;
  question text:=csvb_canonical_question_no(csvb_sire_normalize_question_number(p_question_no));
  enriched jsonb;
begin
  -- Keep Phase 1 totals, filters and recurrence semantics as the source of truth.
  base:=csvb_fleet_vetting_experience_history(company,p_question_no,p_from_date,p_to_date,
    p_oil_major,p_category,p_offset,p_limit);
  select coalesce(jsonb_agg(to_jsonb(page) || jsonb_build_object('prevention_actions',
    csvb_fve_visible_actions(company,page.source_observation_item_id))
    order by page.inspection_date desc nulls last,page.vessel_name,page.source_observation_item_id),'[]'::jsonb)
  into enriched from (
    select x.sort_id as source_observation_item_id,x.vessel_name,x.inspection_date,x.oil_major,
      x.designation,x.observation_text from csvb_fve_rows(company) x
    where x.question_no=question
      and (p_from_date is null or x.inspection_date>=p_from_date)
      and (p_to_date is null or x.inspection_date<=p_to_date)
      and (nullif(p_oil_major,'') is null or x.oil_major=p_oil_major)
      and (p_category is null or x.designation=p_category)
    order by x.inspection_date desc nulls last,x.vessel_name,x.sort_id
    offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,25),1),100)
  ) page;
  return base || jsonb_build_object('rows',enriched,'can_edit',csvb_fve_can_edit());
end $$;

create function public.csvb_fve_prevention_action_get(p_company_id uuid,p_action_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare company uuid:=csvb_fve_authorized_company(p_company_id); result jsonb;
begin
  select item into result from jsonb_array_elements(csvb_fve_visible_actions(company,
    (select source_observation_item_id from fve_prevention_actions where id=p_action_id and company_id=company))) item
    where item->>'id'=p_action_id::text;
  if result is null then raise exception 'Prevention action not accessible.' using errcode='42501'; end if;
  return result;
end $$;

create function public.csvb_fve_prevention_action_save(
  p_company_id uuid,p_source_observation_item_id uuid,p_action_id uuid default null,
  p_instruction text default null,p_target_mode text default 'all',p_vessel_ids uuid[] default '{}',
  p_due_date date default null,p_expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  company uuid:=csvb_fve_authorized_company(p_company_id);
  prior fve_prevention_actions%rowtype;
  source record;
  saved_id uuid:=p_action_id;
  targets uuid[];
  prior_targets uuid[];
  before_value jsonb;
  after_value jsonb;
begin
  if not csvb_fve_can_edit() then raise exception 'Office edit permission required.' using errcode='42501'; end if;
  if nullif(trim(p_instruction),'') is null or length(trim(p_instruction))>20000 then
    raise exception 'Enter Preventative Actions Required by the Vessel (maximum 20000 characters).' using errcode='22023';
  end if;
  if p_target_mode is null or p_target_mode not in ('all','selected') then
    raise exception 'Select All company vessels or Selected vessels.' using errcode='22023'; end if;
  -- Hold the source row against concurrent destructive re-import until its FK is installed.
  perform 1 from post_inspection_observation_items where id=p_source_observation_item_id for key share;
  select * into source from csvb_fve_rows(company) where sort_id=p_source_observation_item_id and question_no is not null;
  if not found then raise exception 'A negative SIRE source observation in this company is required.' using errcode='42501'; end if;
  if saved_id is not null then
    select * into prior from fve_prevention_actions where id=saved_id and company_id=company for update;
    if not found or prior.source_observation_item_id<>p_source_observation_item_id then
      raise exception 'Prevention action not accessible.' using errcode='42501'; end if;
    if prior.status not in ('draft','issued') then raise exception 'This action cannot be edited in Phase 2.'; end if;
    if p_expected_revision is distinct from prior.revision then
      raise exception 'This action changed. Reload it before saving.' using errcode='40001'; end if;
    before_value:=csvb_fve_prevention_action_get(company,saved_id);
    select coalesce(array_agg(t.vessel_id order by t.vessel_id),'{}'::uuid[]) into prior_targets
      from fve_prevention_action_targets t where t.action_id=prior.id;
  end if;
  if prior.status='issued' then
    targets:=prior_targets;
    if p_target_mode<>prior.target_mode or (p_target_mode='selected' and
      (select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) from unnest(coalesce(p_vessel_ids,'{}')) x)<>prior_targets) then
      raise exception 'Issued vessel targets are locked. Only instruction text and due date may be edited.' using errcode='22023';
    end if;
  elsif p_target_mode='all' then
    select coalesce(array_agg(id order by id),'{}'::uuid[]) into targets
      from vessels where company_id=company and is_active;
  else
    select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into targets from unnest(coalesce(p_vessel_ids,'{}')) x;
    if exists(select 1 from unnest(targets) x where not exists(
      select 1 from vessels v where v.id=x and v.company_id=company and v.is_active)) then
      raise exception 'Selected vessels must be active vessels in this company.' using errcode='42501'; end if;
  end if;
  if cardinality(targets)=0 then raise exception 'Select at least one active company vessel.' using errcode='22023'; end if;
  if saved_id is null then
    insert into fve_prevention_actions(company_id,source_observation_item_id,canonical_question_no,
      preventative_actions_required_by_vessel,target_mode,due_date,created_by,updated_by,source_snapshot)
    values(company,p_source_observation_item_id,source.question_no,trim(p_instruction),p_target_mode,p_due_date,
      auth.uid(),auth.uid(),jsonb_build_object('vessel_name',source.vessel_name,
        'inspection_date',source.inspection_date,'oil_major',source.oil_major,
        'designation',source.designation,'observation_text',source.observation_text))
    returning id into saved_id;
  else
    update fve_prevention_actions set preventative_actions_required_by_vessel=trim(p_instruction),
      due_date=p_due_date,target_mode=p_target_mode,revision=revision+1,
      updated_by=auth.uid(),updated_at=clock_timestamp() where id=saved_id;
  end if;
  if prior.status is distinct from 'issued' then
    delete from fve_prevention_action_targets t where t.action_id=saved_id and not(t.vessel_id=any(targets));
    insert into fve_prevention_action_targets(action_id,company_id,vessel_id)
      select saved_id,company,x from unnest(targets) x on conflict(action_id,vessel_id) do nothing;
  end if;
  after_value:=csvb_fve_prevention_action_get(company,saved_id);
  insert into fve_prevention_action_audit(action_id,event,actor_id,revision,before_state,after_state)
    values(saved_id,case when prior.id is null then 'created' else 'updated' end,auth.uid(),
      (after_value->>'revision')::integer,before_value,after_value);
  return after_value;
exception when unique_violation then
  raise exception 'A prevention action already exists for this observation. Reload to view/edit it.' using errcode='23505';
end $$;

create function public.csvb_fve_prevention_action_issue(p_company_id uuid,p_action_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  company uuid:=csvb_fve_authorized_company(p_company_id);
  a fve_prevention_actions%rowtype; before_value jsonb; after_value jsonb;
begin
  if not csvb_fve_can_edit() then raise exception 'Office edit permission required.' using errcode='42501'; end if;
  select * into a from fve_prevention_actions where id=p_action_id and company_id=company for update;
  if not found then raise exception 'Prevention action not accessible.' using errcode='42501'; end if;
  if a.status='issued' then return csvb_fve_prevention_action_get(company,a.id); end if;
  if a.status<>'draft' then raise exception 'Only a Draft can be issued.'; end if;
  if p_expected_revision is distinct from a.revision then
    raise exception 'This action changed. Reload it before issuing.' using errcode='40001'; end if;
  if not exists(select 1 from csvb_fve_rows(company) where sort_id=a.source_observation_item_id and question_no is not null) then
    raise exception 'The source negative observation is no longer available.' using errcode='42501'; end if;
  before_value:=csvb_fve_prevention_action_get(company,a.id);
  if a.target_mode='all' then
    delete from fve_prevention_action_targets t where t.action_id=a.id and not exists(
      select 1 from vessels v where v.id=t.vessel_id and v.company_id=company and v.is_active);
    insert into fve_prevention_action_targets(action_id,company_id,vessel_id)
      select a.id,company,v.id from vessels v where v.company_id=company and v.is_active
      on conflict(action_id,vessel_id) do nothing;
  end if;
  if not exists(select 1 from fve_prevention_action_targets where action_id=a.id) or exists(
    select 1 from fve_prevention_action_targets t join vessels v on v.id=t.vessel_id
    where t.action_id=a.id and (v.company_id<>company or not v.is_active)) then
    raise exception 'Choose at least one active company vessel before issuing.' using errcode='22023'; end if;
  update fve_prevention_actions set status='issued',issued_at=clock_timestamp(),revision=revision+1,
    updated_at=clock_timestamp(),updated_by=auth.uid() where id=a.id;
  after_value:=csvb_fve_prevention_action_get(company,a.id);
  insert into fve_prevention_action_audit(action_id,event,actor_id,revision,before_state,after_state)
    values(a.id,'issued',auth.uid(),(after_value->>'revision')::int,before_value,after_value);
  return after_value;
end $$;

-- Friendly preflight for every existing PDF findings-replacement path.
create function public.csvb_fve_prevention_replacement_guard(p_report_id uuid)
returns integer language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(select 1 from csvb_post_inspection_report_by_id_for_me(p_report_id)) then
    raise exception 'Inspection report not accessible.' using errcode='42501'; end if;
  return (select count(*)::integer from fve_prevention_actions a
    join post_inspection_observation_items i on i.id=a.source_observation_item_id where i.report_id=p_report_id);
end $$;
create function public.csvb_fve_prevent_referenced_finding_delete()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from fve_prevention_actions where source_observation_item_id=old.id) then
    raise exception 'Findings replacement blocked: a Fleet Vetting Experience prevention action references this observation. No remap workflow exists.' using errcode='23503';
  end if;
  return old;
end $$;
create trigger fve_prevention_source_delete_guard before delete on public.post_inspection_observation_items
for each row execute function public.csvb_fve_prevent_referenced_finding_delete();

revoke all on function public.csvb_fve_can_edit(),public.csvb_fve_visible_actions(uuid,uuid),
  public.csvb_fve_prevent_referenced_finding_delete() from public,anon,authenticated;
revoke all on function public.csvb_fve_prevention_context(uuid),
  public.csvb_fve_prevention_history(uuid,text,date,date,text,text,integer,integer),
  public.csvb_fve_prevention_action_get(uuid,uuid),
  public.csvb_fve_prevention_action_save(uuid,uuid,uuid,text,text,uuid[],date,integer),
  public.csvb_fve_prevention_action_issue(uuid,uuid,integer),
  public.csvb_fve_prevention_replacement_guard(uuid) from public,anon;
grant execute on function public.csvb_fve_prevention_context(uuid),
  public.csvb_fve_prevention_history(uuid,text,date,date,text,text,integer,integer),
  public.csvb_fve_prevention_action_get(uuid,uuid),
  public.csvb_fve_prevention_action_save(uuid,uuid,uuid,text,text,uuid[],date,integer),
  public.csvb_fve_prevention_action_issue(uuid,uuid,integer),
  public.csvb_fve_prevention_replacement_guard(uuid) to authenticated;
commit;
