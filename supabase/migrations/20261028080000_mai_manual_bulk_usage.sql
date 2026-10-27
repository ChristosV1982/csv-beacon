-- Development/testing only. Existing operation recording and usage rows are unchanged.
begin;

alter table public.mai_component_usage_logs add column if not exists manual_bulk_request_id uuid;
create unique index if not exists mai_usage_manual_request_component_uniq
  on public.mai_component_usage_logs(manual_bulk_request_id, component_id)
  where manual_bulk_request_id is not null;

create or replace function public.mai_manual_usage_access(p_vessel_id uuid, p_write boolean)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles p join vessels v on v.id=p_vessel_id and v.is_active
    where p.id=auth.uid() and p.is_active and not p.is_disabled
      and mai_can_access_company_vessel(v.company_id,v.id)
      and exists(select 1 from csvb_my_company_modules() m
        where m.module_key='mooring_anchoring_inventories' and m.is_enabled)
      and mai_has_permission('MOORING_ANCHORING_INVENTORIES.' || case when p_write then 'edit' else 'view' end)
      and exists (
        select 1 from csvb_my_effective_app_permissions() e
        where e.module_code='MOORING_ANCHORING_INVENTORIES'
          and e.permission_action=case when p_write then 'edit' else 'view' end and e.is_granted
          and (e.scope in ('global','company','vessel_any')
            or (e.scope in ('vessel','vessel_assigned') and p.vessel_id=v.id))
      )
      and (
        (p.role::text <> 'vessel' and p.onboard_rank_id is null)
        or (p.vessel_id=v.id and p.company_id=v.company_id and p.onboard_access_enabled
          and (p.onboard_status in ('onboard','temporarily_ashore')
            or (not p_write and p.onboard_status='disembarked' and p.read_only_after_disembarkation)))
      )
  );
$$;

create or replace function public.mai_manual_usage_components(p_vessel_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not coalesce(mai_manual_usage_access(p_vessel_id,false),false) then
    raise exception 'You do not have access to usage hours for this vessel.' using errcode='42501';
  end if;
  select jsonb_build_object('vessel_id',v.id,'vessel_name',v.name,
    'can_edit',mai_manual_usage_access(v.id,true),
    'components',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'unique_id',c.unique_id,
        'component_type_id',c.component_type_id,'component_type_name',t.name,
        'current_status',c.current_status) order by c.unique_id)
      from mai_components c join mai_component_types t on t.id=c.component_type_id
      where c.vessel_id=v.id and c.company_id=v.company_id and c.is_active
        and (to_jsonb(c)->>'deleted_at') is null and c.current_status not in ('retired','disposed','removed_from_service')
        and not exists(select 1 from mai_status_options s where s.status_key=c.current_status
          and s.is_terminal and (s.company_id is null or s.company_id=c.company_id))
        and mai_can_access_component(c.id,'MOORING_ANCHORING_INVENTORIES.view')
    ),'[]'::jsonb)) into result from vessels v where v.id=p_vessel_id;
  return result;
end;
$$;

create or replace function public.mai_register_manual_usage_bulk(
  p_vessel_id uuid, p_component_ids uuid[], p_usage_date date,
  p_hours numeric, p_remarks text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  ids uuid[];
  company uuid;
  affected integer;
  previous integer;
begin
  if not coalesce(mai_manual_usage_access(p_vessel_id,true),false) then
    raise exception 'You do not have permission to register usage hours for this vessel.' using errcode='42501';
  end if;
  if p_usage_date is null then raise exception 'Select an effective usage date.'; end if;
  if p_hours is null or p_hours <= 0 or p_hours::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Usage hours must be a positive finite number.';
  end if;
  if p_request_id is null then raise exception 'A usage request ID is required.'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_component_ids) x where x is not null;
  if coalesce(cardinality(ids),0)=0 then raise exception 'Select at least one component.'; end if;
  select v.company_id into company from vessels v where v.id=p_vessel_id;

  -- Serialize retries of the same request. This is not a parallel usage ledger.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select count(*) into previous from mai_component_usage_logs where manual_bulk_request_id=p_request_id;
  if previous>0 then
    if previous<>cardinality(ids) or exists(
      select 1 from mai_component_usage_logs u where u.manual_bulk_request_id=p_request_id
        and (u.component_id<>all(ids) or u.vessel_id<>p_vessel_id or u.company_id<>company
          or u.created_by is distinct from auth.uid() or u.operation_date<>p_usage_date
          or u.hours_under_tension<>p_hours or u.remarks is distinct from nullif(btrim(p_remarks),''))
    ) then raise exception 'This request ID was already used for a different usage entry.'; end if;
    return jsonb_build_object('component_count',previous,'hours',p_hours,'replayed',true);
  end if;

  -- Lock in deterministic order; a concurrent retirement/delete must wait.
  perform c.id from mai_components c where c.id=any(ids) order by c.id for share;
  select count(*) into affected from mai_components c
    where c.id=any(ids) and c.company_id=company and c.vessel_id=p_vessel_id
      and c.is_active and (to_jsonb(c)->>'deleted_at') is null
      and c.current_status not in ('retired','disposed','removed_from_service')
      and not exists(select 1 from mai_status_options s where s.status_key=c.current_status
        and s.is_terminal and (s.company_id is null or s.company_id=c.company_id))
      and mai_can_access_component(c.id,'MOORING_ANCHORING_INVENTORIES.edit');
  if affected<>cardinality(ids) then
    raise exception 'One or more components are inactive, retired, unavailable or outside the authorized vessel. No hours were applied.';
  end if;

  insert into mai_component_usage_logs(company_id,vessel_id,component_id,operation_date,
    operation_type,hours_under_tension,counts_towards_lifecycle,remarks,source_type,
    is_initial_balance,vessel_operation_id,created_by,updated_by,manual_bulk_request_id)
  select company,p_vessel_id,x,p_usage_date,'manual_usage',p_hours,true,nullif(btrim(p_remarks),''),
    'manual',false,null,auth.uid(),auth.uid(),p_request_id from unnest(ids) x;
  get diagnostics affected = row_count;
  return jsonb_build_object('component_count',affected,'hours',p_hours,'replayed',false);
end;
$$;

revoke all on function public.mai_manual_usage_access(uuid,boolean),
  public.mai_manual_usage_components(uuid),
  public.mai_register_manual_usage_bulk(uuid,uuid[],date,numeric,text,uuid) from public, anon;
grant execute on function public.mai_manual_usage_access(uuid,boolean),
  public.mai_manual_usage_components(uuid),
  public.mai_register_manual_usage_bulk(uuid,uuid[],date,numeric,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
