-- Disposable fixtures only: every write below is rolled back.
begin;
create temp table lifecycle_test_state(vessel_id uuid,actor uuid,reader uuid,linked_profile uuid,profile_hash text);
do $$
declare v_actor uuid; v_reader uuid; v_linked uuid; v_company uuid; v_vessel uuid;
begin
  select id into v_actor from public.profiles
    where role::text='super_admin' and is_active and not is_disabled limit 1;
  select id into v_reader from public.profiles
    where role::text in ('company_admin','company_superintendent','vessel')
    and is_active and not is_disabled limit 1;
  select id,company_id into v_linked,v_company from public.profiles
    where role::text='vessel' and is_active and not is_disabled and vessel_id is not null limit 1;
  assert v_actor is not null and v_reader is not null and v_linked is not null,'Missing development test actors';
  insert into public.vessels(name,company_id,is_active)
    values('LIFECYCLE-ROLLBACK-TEST',v_company,true) returning id into v_vessel;
  -- A fixture link makes accidental account changes observable. Not committed.
  update public.profiles set vessel_id=v_vessel where id=v_linked;
  insert into lifecycle_test_state values(v_vessel,v_actor,v_reader,v_linked,
    (select md5(string_agg(to_jsonb(p)::text,'|' order by id)) from public.profiles p));
end $$;
grant select on lifecycle_test_state to authenticated;
set local role authenticated;
do $$
declare s record; r jsonb; h jsonb; original_company uuid;
begin
  select * into s from lifecycle_test_state;
  perform set_config('request.jwt.claim.sub',s.actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s.actor,'role','authenticated')::text,true);
  select company_id into original_company from public.vessels where id=s.vessel_id;
  begin
    perform public.csvb_admin_set_vessel_active(s.vessel_id,false,'  ',null,true);
    raise exception 'TEST missing reason unexpectedly accepted';
  exception when others then
    if sqlerrm like 'TEST %' then raise; end if;
    assert sqlerrm like '%inactivity reason%';
  end;
  assert (select is_active from public.vessels where id=s.vessel_id);
  begin
    perform public.csvb_admin_set_vessel_active(s.vessel_id,false,'Reason',null,false);
    raise exception 'TEST stale expected status unexpectedly accepted';
  exception when serialization_failure then null;
  end;
  r:=public.csvb_admin_set_vessel_active(s.vessel_id,false,'Restricted test reason','Restricted test remarks',true);
  assert (r->>'changed')::boolean;
  assert not (select is_active from public.vessels where id=s.vessel_id);
  assert not exists(select 1 from public.vessels where id=s.vessel_id and is_active=true);
  assert exists(select 1 from public.csvb_accessible_vessels_for_me() where id=s.vessel_id and not is_active),
    'Historical/access-scoped vessel lookup must retain inactive vessels';
  r:=public.csvb_admin_set_vessel_active(s.vessel_id,false,'Repeated request',null,true);
  assert not (r->>'changed')::boolean,'Repeat must be a no-op';
  h:=public.csvb_admin_vessel_status_history(s.vessel_id);
  assert jsonb_array_length(h->'history')=1;
  assert h#>>'{history,0,inactivity_reason}'='Restricted test reason';
  assert h#>>'{history,0,restricted_internal_remarks}'='Restricted test remarks';
  assert h#>>'{history,0,changed_by}'=s.actor::text;
  assert h#>>'{history,0,company_id}'=original_company::text;
  assert exists(select 1 from public.profiles where id=s.linked_profile and vessel_id=s.vessel_id
    and is_active and not is_disabled and onboard_access_enabled);
  r:=public.csvb_admin_set_vessel_active(s.vessel_id,true,null,null,false);
  assert (r->>'changed')::boolean;
  assert (select is_active from public.vessels where id=s.vessel_id);
  assert (select company_id is not distinct from original_company from public.vessels where id=s.vessel_id);
  h:=public.csvb_admin_vessel_status_history(s.vessel_id);
  assert jsonb_array_length(h->'history')=2;
  assert (h#>>'{history,0,new_is_active}')::boolean;
  assert not (h#>>'{history,0,previous_is_active}')::boolean;
  assert not has_table_privilege('authenticated','public.vessel_status_transitions','SELECT');
  assert not has_table_privilege('authenticated','public.vessel_status_transitions','INSERT');
  begin
    perform 1 from public.vessel_status_transitions;
    raise exception 'TEST direct restricted history read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',s.reader::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s.reader,'role','authenticated')::text,true);
  begin
    perform public.csvb_admin_vessel_status_history(s.vessel_id);
    raise exception 'TEST non-platform reader unexpectedly allowed';
  exception when others then
    if sqlerrm like 'TEST %' then raise; end if;
    assert sqlerrm like '%Access denied%';
  end;
  begin
    perform public.csvb_admin_set_vessel_active(s.vessel_id,false,'Forbidden',null,true);
    raise exception 'TEST non-platform write unexpectedly allowed';
  exception when others then
    if sqlerrm like 'TEST %' then raise; end if;
    assert sqlerrm like '%Access denied%';
  end;
end $$;
reset role;
do $$
begin
  assert (select profile_hash from lifecycle_test_state)=
    (select md5(string_agg(to_jsonb(p)::text,'|' order by id)) from public.profiles p),
    'Status transition changed profile/account governance';
end $$;
rollback;
