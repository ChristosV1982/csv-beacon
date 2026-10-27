begin;
create temp table mai_test_state(data jsonb);
do $$
declare
  admin_id uuid; vessel_user uuid; office_user uuid; vessel uuid; company uuid; kind uuid; other_kind uuid;
  cids uuid[] := array[]::uuid[]; cid uuid; terminal_id uuid; foreign_id uuid;
  request uuid := gen_random_uuid(); i integer;
begin
  select id into admin_id from profiles where role::text='super_admin' and is_active and not is_disabled limit 1;
  select p.id,p.vessel_id,p.company_id into vessel_user,vessel,company from profiles p
    join vessels v on v.id=p.vessel_id and v.company_id=p.company_id and v.is_active
    where p.role::text='vessel' and p.onboard_status in ('onboard','temporarily_ashore')
      and p.onboard_access_enabled and p.is_active and not p.is_disabled limit 1;
  assert admin_id is not null and vessel_user is not null, 'Need existing active development actors';
  select id into office_user from profiles where role::text in ('company_admin','company_superintendent')
    and company_id=company and is_active and not is_disabled limit 1;
  select id into kind from mai_component_types where is_active and (company_id is null or company_id=company)
    order by case when lower(coalesce(name,'')) like '%wire%' then 0 else 1 end limit 1;
  select id into other_kind from mai_component_types where is_active and (company_id is null or company_id=company)
    and id<>kind limit 1;
  assert other_kind is not null, 'Need two existing component types for mixed test';
  for i in 1..5 loop
    insert into mai_components(company_id,vessel_id,component_type_id,unique_id,current_status,is_active)
      values(company,vessel,case when i=5 then other_kind else kind end,
        'MANUAL-USAGE-TEST-' || gen_random_uuid(),'active',true) returning id into cid;
    cids:=array_append(cids,cid);
  end loop;
  insert into mai_components(company_id,vessel_id,component_type_id,unique_id,current_status,is_active)
    values(company,vessel,kind,'MANUAL-USAGE-RETIRED-' || gen_random_uuid(),'retired',true) returning id into terminal_id;
  select id into foreign_id from mai_components c where vessel_id<>vessel and (to_jsonb(c)->>'deleted_at') is null limit 1;
  if foreign_id is null then
    insert into mai_components(company_id,vessel_id,component_type_id,unique_id,current_status,is_active)
      select v.company_id,v.id,kind,'MANUAL-USAGE-FOREIGN-' || gen_random_uuid(),'active',true
      from vessels v where v.id<>vessel and v.company_id=company and v.is_active limit 1 returning id into foreign_id;
  end if;
  assert foreign_id is not null, 'Need another development vessel for scope test';
  insert into mai_test_state values(jsonb_build_object('admin',admin_id,'vessel_user',vessel_user,
    'office_user',office_user,'vessel',vessel,'company',company,'ids',to_jsonb(cids),
    'retired',terminal_id,'foreign',foreign_id,
    'foreign_vessel',(select vessel_id from mai_components where id=foreign_id),'request',request));
end $$;
grant select on mai_test_state to authenticated;
set local role authenticated;
do $$
declare
  s jsonb; ids uuid[]; result jsonb; before_operations bigint; failed boolean; hours numeric;
  operation_id uuid; operation_key text;
begin
  select data into s from mai_test_state;
  select array_agg(x::uuid order by ord) into ids from jsonb_array_elements_text(s->'ids') with ordinality a(x,ord);
  perform set_config('request.jwt.claim.sub',s->>'admin',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s->>'admin','role','authenticated')::text,true);
  select count(*) into before_operations from mai_vessel_operations;
  assert mai_manual_usage_access((s->>'vessel')::uuid,true), 'Super admin access';
  result:=mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],current_date,6.5,'Four wires test',(s->>'request')::uuid);
  assert (result->>'component_count')::int=4;
  assert (select count(*)=4 from mai_component_usage_logs where manual_bulk_request_id=(s->>'request')::uuid
    and hours_under_tension=6.5 and source_type='manual' and vessel_operation_id is null and created_by=auth.uid());
  assert (select count(*)=4 from mai_v_component_usage_summary where component_id=any(ids[1:4])
    and total_lifecycle_hours=6.5), 'Existing lifecycle ledger totals reflect manual credit';
  result:=mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],current_date,6.5,'Four wires test',(s->>'request')::uuid);
  assert (result->>'replayed')::boolean;
  assert (select count(*)=4 from mai_component_usage_logs where manual_bulk_request_id=(s->>'request')::uuid);
  -- Mixed selection and repeated component ID are safe and produce distinct component rows.
  result:=mai_register_manual_usage_bulk((s->>'vessel')::uuid,array[ids[1],ids[5],ids[5]],current_date,1.2,'Mixed test',gen_random_uuid());
  assert (result->>'component_count')::int=2;
  foreach hours in array array[0,-1,'NaN'::numeric] loop
    failed:=false;
    begin
      perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],current_date,hours,null,gen_random_uuid());
    exception when raise_exception then failed:=true; end;
    assert failed, 'Invalid hours must fail';
  end loop;
  failed:=false;
  begin
    perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,array[]::uuid[],current_date,2,null,gen_random_uuid());
  exception when raise_exception then failed:=true; end;
  assert failed, 'Empty selection must fail';
  failed:=false;
  begin
    perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,array[ids[1],(s->>'retired')::uuid],current_date,2,null,gen_random_uuid());
  exception when raise_exception then failed:=true; end;
  assert failed, 'Retired component must abort entire batch';
  failed:=false;
  begin
    perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,array[ids[1],(s->>'foreign')::uuid],current_date,2,null,gen_random_uuid());
  exception when raise_exception then failed:=true; end;
  assert failed, 'Foreign vessel component must abort entire batch';
  failed:=false;
  begin
    perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],null,2,null,gen_random_uuid());
  exception when raise_exception then failed:=true; end;
  assert failed, 'Date required';
  failed:=false;
  begin
    perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],current_date,7,'Four wires test',(s->>'request')::uuid);
  exception when raise_exception then failed:=true; end;
  assert failed, 'Request ID cannot be reused for different credit';
  assert (select count(*)=6 from mai_component_usage_logs where component_id=any(ids)),
    'Failed batches must not partially credit any component';
  assert (select count(*)=before_operations from mai_vessel_operations), 'Manual usage creates no operation';
  select operation_type_key into operation_key from mai_operation_type_definitions
    where is_active and (company_id is null or company_id=(s->>'company')::uuid) limit 1;
  operation_id:=mai_record_vessel_operation((s->>'vessel')::uuid,operation_key,
    now()-interval '1 hour',now(),ids[1:2]);
  assert (select count(*)=before_operations+1 from mai_vessel_operations), 'Existing operation path remains separate';
  assert (select count(*)=2 from mai_component_usage_logs where vessel_operation_id=operation_id),
    'One operation still credits its selected components';

  perform set_config('request.jwt.claim.sub',s->>'vessel_user',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s->>'vessel_user','role','authenticated')::text,true);
  assert mai_manual_usage_access((s->>'vessel')::uuid,true), 'Assigned vessel user may register';
  result:=mai_register_manual_usage_bulk((s->>'vessel')::uuid,array[ids[1]],current_date,0.5,'Vessel single test',gen_random_uuid());
  assert (result->>'component_count')::int=1;
  assert (mai_manual_usage_components((s->>'vessel')::uuid)->>'vessel_id')::uuid=(s->>'vessel')::uuid;
  assert not mai_manual_usage_access((s->>'foreign_vessel')::uuid,true),
    'Vessel user cannot access other vessel';
  if s->>'office_user' is not null then
    perform set_config('request.jwt.claim.sub',s->>'office_user',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',s->>'office_user','role','authenticated')::text,true);
    -- Honor actual grants; never change permissions merely to make tests pass.
    if mai_manual_usage_access((s->>'vessel')::uuid,true) then
      result:=mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],current_date,0.5,'Office bulk test',gen_random_uuid());
      assert (result->>'component_count')::int=4;
    else
      failed:=false;
      begin
        perform mai_register_manual_usage_bulk((s->>'vessel')::uuid,ids[1:4],current_date,0.5,'Office denied test',gen_random_uuid());
      exception when insufficient_privilege then failed:=true; end;
      assert failed, 'Read-only office cannot register';
    end if;
  end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  assert not mai_manual_usage_access((s->>'vessel')::uuid,true), 'Missing user cannot write';
end $$;
rollback;
