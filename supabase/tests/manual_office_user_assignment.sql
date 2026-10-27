-- Run inside BEGIN/ROLLBACK. Uses one existing test Office profile, never Auth
-- account creation. Leaves no test assignment or profile/audit mutation behind.
do $$
declare
  actor uuid;
  target public.profiles;
  before_user public.profiles;
  result jsonb;
  marine text := 'office_draft_'||md5('csvb:prepared-role:marine_superintendent');
  demo text := 'office_draft_'||md5('csvb:prepared-role:demo_user');
  old_effective jsonb;
  new_effective jsonb;
  assigned text;
  rejected boolean;
begin
  select id into actor from public.profiles
    where role::text='super_admin' and coalesce(is_active,true)
      and not coalesce(is_disabled,false) limit 1;
  select * into target from public.profiles
    where username='companyadmin' and role::text in ('company_admin','company_superintendent');
  if actor is null or target.id is null then
    raise exception 'An active Super Admin and existing non-critical companyadmin test account are required.';
  end if;
  before_user:=target;
  perform set_config('request.jwt.claim.sub',target.id::text,true);
  select coalesce(jsonb_agg(to_jsonb(p) order by module_code,permission_action),'[]')
    into old_effective from public.csvb_my_effective_app_permissions() p;
  rejected:=false;
  begin
    perform public.csvb_admin_update_office_user(target.id,marine,null,'{}','Unauthorized test');
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'Non-Super Admin assignment was not denied.'; end if;

  perform set_config('request.jwt.claim.sub',actor::text,true);
  result:=public.csvb_admin_office_user_options(target.id);
  if jsonb_array_length(result->'roles')<>16 then raise exception 'Expected sixteen approved Office/Demo roles.'; end if;
  if (result->>'permission_enforcement_active')::boolean then raise exception 'Prepared profile must not be described as enforced.'; end if;
  result:=public.csvb_admin_update_office_user(target.id,marine,null,'{}','Test manual Office assignment');
  if result#>>'{profile,office_role_code}'<>marine
    or result#>>'{profile,office_access_profile_code}'<>'standard_office_view_only' then
    raise exception 'Role/default Access Profile did not persist.';
  end if;
  result:=public.csvb_admin_office_user_options(target.id);
  if result#>>'{profile,id}'<>target.id::text
    or result#>>'{profile,username}'<>target.username
    or result#>>'{profile,company_id}' is distinct from target.company_id::text
    or result#>>'{profile,vessel_id}' is distinct from target.vessel_id::text
    or result#>>'{profile,role}'<>target.role::text then
    raise exception 'Existing login identity/security role/company/vessel changed.';
  end if;
  perform set_config('request.jwt.claim.sub',target.id::text,true);
  select coalesce(jsonb_agg(to_jsonb(p) order by module_code,permission_action),'[]')
    into new_effective from public.csvb_my_effective_app_permissions() p;
  if new_effective is distinct from old_effective then
    raise exception 'Prepared assignment altered current effective permissions.';
  end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  result:=public.csvb_admin_update_office_user(target.id,demo,null,'{}','Test Demo default');
  if result#>>'{profile,office_access_profile_code}'<>'standard_office_view_only' then
    raise exception 'Demo must use the agreed nine-module profile.';
  end if;
  result:=public.csvb_admin_update_office_user(target.id,marine,'company_administrator_access',
    '{}','Test explicit Access Profile override');
  if result#>>'{profile,office_access_profile_code}'<>'company_administrator_access' then
    raise exception 'Explicit profile override did not persist.';
  end if;
  rejected:=false;
  begin
    perform public.csvb_admin_update_office_user(target.id,demo,null,
      '{"is_active":"not-a-boolean"}','Atomic failure test');
  exception when invalid_text_representation then rejected:=true;
  end;
  select office_role_code into assigned from public.profiles where id=target.id;
  if not rejected or assigned<>marine then
    raise exception 'Failed particulars save was not atomic with Office assignment.';
  end if;
  rejected:=false;
  begin
    perform public.csvb_admin_update_office_user(target.id,demo,null,
      jsonb_build_object('company_id',gen_random_uuid()),'Reject scope tampering');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Scope/identity payload keys were not rejected.'; end if;
  if not exists(select 1 from public.csvb_office_access_audit
    where subject_profile_id=target.id and actor_id=actor and operation='role_assignment')
    or not exists(select 1 from public.csvb_office_access_audit
    where subject_profile_id=target.id and actor_id=actor and operation='profile_assignment') then
    raise exception 'Office role/profile audit records missing.';
  end if;
  result:=public.csvb_admin_update_office_user(target.id,before_user.office_role_code,
    before_user.office_access_profile_code,'{}','Restore test Office assignment');
  if result#>>'{profile,office_role_code}' is distinct from before_user.office_role_code
    or result#>>'{profile,office_access_profile_code}' is distinct from before_user.office_access_profile_code then
    raise exception 'Restoring prior assignment failed.';
  end if;
  raise notice 'PASS: authorized manual assignment/default/override/readback/identity/audit/atomicity and restoration. Outer transaction must roll back.';
end;
$$;
