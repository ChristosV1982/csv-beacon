-- All test changes, including the existing Add/lifecycle paths, roll back.
begin;
do $$
declare
  actor uuid;
  vessel public.vessels;
  after_edit public.vessels;
  added jsonb;
  count_before bigint;
  old_status boolean;
begin
  select id into actor from public.profiles
    where role::text='super_admin' and is_active and not is_disabled limit 1;
  if actor is null then raise exception 'A development Super Admin is required'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select * into vessel from public.vessels
    order by (name ilike '%demo%') desc,id limit 1;
  if vessel.id is null then raise exception 'An existing verification vessel is required'; end if;
  select count(*) into count_before from public.vessels;
  old_status := vessel.is_active;
  -- Exercise the existing lifecycle transaction, then verify Edit cannot undo it.
  perform public.csvb_admin_set_vessel_active(vessel.id,not old_status,
    'Rollback-only particulars editor verification',null,old_status);
  perform public.csvb_admin_update_vessel_particulars(
    vessel.id,vessel.name,vessel.hull_number,vessel.imo_number::text,
    'UXVERIFY',vessel.date_delivered);
  select * into after_edit from public.vessels where id=vessel.id;
  if after_edit.id<>vessel.id or after_edit.company_id is distinct from vessel.company_id
    or after_edit.is_active is distinct from not old_status
    or after_edit.call_sign<>'UXVERIFY'
    or after_edit.created_at is distinct from vessel.created_at then
    raise exception 'Particulars editing changed vessel identity, company or lifecycle';
  end if;
  if (select count(*) from public.vessels)<>count_before then
    raise exception 'Editing changed the vessel row count';
  end if;
  begin
    perform public.csvb_admin_update_vessel_particulars(vessel.id,' ');
    raise exception 'Blank name unexpectedly accepted';
  exception when others then
    if sqlerrm<>'Vessel name is required.' then raise; end if;
  end;
  begin
    perform public.csvb_admin_update_vessel_particulars(null,'Must not create');
    raise exception 'Null identity unexpectedly accepted';
  exception when others then
    if sqlerrm not like 'Vessel not found:%' then raise; end if;
  end;
  added:=public.csvb_admin_upsert_vessel(
    null,vessel.company_id,'Rollback-only Add verification',null,null,null,true,false,null);
  if not (added->>'ok')::boolean or
    (select count(*) from public.vessels)<>count_before+1 then
    raise exception 'Existing Add Vessel path did not create exactly one vessel';
  end if;
end $$;
rollback;
