begin;
-- Status remains public.vessels.is_active. Restricted context is never added
-- to the ordinary vessel record or its existing selectors/reporting RPCs.
create table public.vessel_status_transitions (
  id uuid primary key default gen_random_uuid(),
  vessel_id uuid not null references public.vessels(id) on delete restrict,
  company_id uuid,
  previous_is_active boolean not null,
  new_is_active boolean not null,
  inactivity_reason text,
  restricted_internal_remarks text,
  -- Snapshot actor identity: deleting an account must not erase this history.
  changed_by uuid not null,
  changed_by_username text not null,
  changed_at timestamptz not null default clock_timestamp(),
  check (previous_is_active <> new_is_active),
  check (new_is_active or length(btrim(coalesce(inactivity_reason,''))) > 0),
  check (length(coalesce(inactivity_reason,'')) <= 4000),
  check (length(coalesce(restricted_internal_remarks,'')) <= 4000)
);
create index vessel_status_transitions_vessel_time_idx
  on public.vessel_status_transitions(vessel_id,changed_at desc,id desc);
alter table public.vessel_status_transitions enable row level security;
revoke all on public.vessel_status_transitions from public,anon,authenticated;

create function public.csvb_admin_set_vessel_active(
  p_vessel_id uuid,
  p_is_active boolean,
  p_reason text default null,
  p_internal_remarks text default null,
  p_expected_is_active boolean default null
) returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  v_vessel public.vessels%rowtype;
  v_actor uuid := auth.uid();
  v_username text;
  v_reason text := nullif(btrim(p_reason),'');
  v_remarks text := nullif(btrim(p_internal_remarks),'');
  v_history_id uuid;
  v_changed_at timestamptz;
begin
  perform public.csvb_require_platform_admin();
  select coalesce(p.username,p.id::text) into v_username
    from public.profiles p where p.id=v_actor
    and p.is_active is not false and p.is_disabled is not true;
  if v_actor is null or v_username is null then
    raise exception 'An active platform administrator account is required.' using errcode='42501';
  end if;
  if p_vessel_id is null or p_is_active is null then
    raise exception 'Vessel and Active/Inactive selection are required.';
  end if;
  if not p_is_active and v_reason is null then
    raise exception 'Enter an inactivity reason before deactivating the vessel.';
  end if;
  if length(coalesce(v_reason,''))>4000 or length(coalesce(v_remarks,''))>4000 then
    raise exception 'Reason and internal remarks must each be at most 4000 characters.';
  end if;
  select * into v_vessel from public.vessels where id=p_vessel_id for update;
  if not found then raise exception 'Vessel not found.'; end if;
  -- A repeated request cannot create a second transition or alter its reason.
  if v_vessel.is_active=p_is_active then
    return jsonb_build_object('changed',false,'vessel_id',p_vessel_id,'is_active',p_is_active);
  end if;
  if p_expected_is_active is not null and v_vessel.is_active<>p_expected_is_active then
    raise exception 'Vessel status changed since it was loaded. Refresh the vessel list and review again.'
      using errcode='40001';
  end if;
  update public.vessels set is_active=p_is_active where id=p_vessel_id;
  insert into public.vessel_status_transitions(
    vessel_id,company_id,previous_is_active,new_is_active,inactivity_reason,
    restricted_internal_remarks,changed_by,changed_by_username
  ) values (
    p_vessel_id,v_vessel.company_id,v_vessel.is_active,p_is_active,v_reason,
    v_remarks,v_actor,v_username
  ) returning id,changed_at into v_history_id,v_changed_at;
  return jsonb_build_object('changed',true,'vessel_id',p_vessel_id,
    'is_active',p_is_active,'history_id',v_history_id,'changed_at',v_changed_at);
end $$;

create function public.csvb_admin_vessel_status_history(p_vessel_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare v_vessel jsonb; v_history jsonb;
begin
  perform public.csvb_require_platform_admin();
  if not exists(select 1 from public.profiles p where p.id=auth.uid()
      and p.is_active is not false and p.is_disabled is not true) then
    raise exception 'An active platform administrator account is required.' using errcode='42501';
  end if;
  select jsonb_build_object('id',id,'name',name,'company_id',company_id,'is_active',is_active)
    into v_vessel from public.vessels where id=p_vessel_id;
  if v_vessel is null then raise exception 'Vessel not found.'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.changed_at desc,t.id desc),'[]'::jsonb)
    into v_history from public.vessel_status_transitions t where t.vessel_id=p_vessel_id;
  return jsonb_build_object('vessel',v_vessel,'history',v_history);
end $$;
revoke all on function public.csvb_admin_set_vessel_active(uuid,boolean,text,text,boolean),
  public.csvb_admin_vessel_status_history(uuid) from public,anon;
grant execute on function public.csvb_admin_set_vessel_active(uuid,boolean,text,text,boolean),
  public.csvb_admin_vessel_status_history(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
