begin;
do $$
declare actor uuid; company uuid; opts jsonb; prepared jsonb; rejected boolean:=false;
begin
  select id into actor from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1;
  select id into company from public.companies where is_active limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  opts:=public.csvb_admin_office_creation_options();
  if jsonb_array_length(opts->'roles')<16 then raise exception 'Expected approved assignable Office roles.'; end if;
  prepared:=public.csvb_admin_office_creation_prepare(gen_random_uuid(),
    'office_fixture_'||substr(md5(random()::text),1,12),company,
    'office_draft_'||md5('csvb:prepared-role:marine_coordinator'));
  if prepared->>'legacy_role'<>'company_admin' or (prepared->>'requires_enforcement')::boolean then
    raise exception 'Marine Coordinator must use its configured Company Administrator baseline.';
  end if;
  prepared:=public.csvb_admin_office_creation_prepare(gen_random_uuid(),
    'office_fixture_'||substr(md5(random()::text),1,12),company,
    'office_draft_'||md5('csvb:prepared-role:demo_user'));
  if prepared->>'access_profile_code'<>'standard_office_view_only'
    or not (prepared->>'requires_enforcement')::boolean then
    raise exception 'Demo must remain locked until the nine-module view-only profile is enforced.';
  end if;
  if public.csvb_admin_office_creation_identity((prepared->>'id')::uuid) is not null then
    raise exception 'Preflight must never create Auth accounts.';
  end if;
  perform public.csvb_admin_office_creation_failed((prepared->>'id')::uuid,null,false);
  prepared:=public.csvb_admin_office_creation_prepare((prepared->>'id')::uuid,
    prepared->>'username',company,prepared->>'office_role_code');
  if prepared->>'status'<>'pending' then raise exception 'Clean failed creation must permit correction/retry.'; end if;
  begin
    perform public.csvb_admin_office_creation_prepare(gen_random_uuid(),'office_fixture_forbidden',
      company,'super_admin');
  exception when others then rejected:=true;
  end;
  if not rejected then raise exception 'Office Role must not select a protected security role.'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false;
  begin perform public.csvb_admin_office_creation_options();
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Non-Super-Admin creation options must be denied.'; end if;
  if has_function_privilege('anon','public.csvb_admin_office_creation_options()','execute') then
    raise exception 'Anonymous creation options must be denied.';
  end if;
end;
$$;
-- Execute real profile/audit triggers and finalization in the rollback-only
-- transaction. These locked, passwordless synthetic identities are never
-- committed or usable for login; no Auth Admin account is created.
do $$
declare actor uuid; company uuid; identity_id uuid; request_id uuid; prepared jsonb;
  role_key text; profile public.profiles; username text; locked boolean;
begin
  select id into actor from public.profiles where role::text='super_admin' and is_active and not is_disabled limit 1;
  select id into company from public.companies where is_active limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  foreach role_key in array array['marine_coordinator','demo_user'] loop
    identity_id:=gen_random_uuid(); request_id:=gen_random_uuid();
    username:='office_sql_fixture_'||substr(md5(identity_id::text),1,12);
    prepared:=public.csvb_admin_office_creation_prepare(request_id,username,company,
      'office_draft_'||md5('csvb:prepared-role:'||role_key),null,'Example','Office','Separate position',true);
    locked:=(prepared->>'requires_enforcement')::boolean;
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,
      raw_user_meta_data,banned_until,created_at,updated_at)
    values(identity_id,'authenticated','authenticated',username||'@csvtest.local',now(),
      jsonb_build_object('csvb_office_creation_request',request_id::text,
        'csvb_office_creation_actor',actor::text),'{}'::jsonb,now()+interval '100 years',now(),now());
    perform public.csvb_admin_office_creation_finalize(request_id,identity_id);
    perform public.csvb_admin_office_creation_finalize(request_id,identity_id);
    if not locked then update auth.users set banned_until=null where id=identity_id; end if;
    perform public.csvb_admin_office_creation_complete(request_id);
    perform public.csvb_admin_office_creation_complete(request_id);
    select * into profile from public.profiles where id=identity_id;
    if profile.office_role_code is distinct from prepared->>'office_role_code'
      or profile.office_access_profile_code is distinct from prepared->>'access_profile_code'
      or profile.is_active is distinct from not locked or profile.is_disabled is distinct from locked
      or profile.vessel_id is not null or profile.company_id<>company
      or profile.first_name<>'Example' or profile.last_name<>'Office'
      or profile.position<>'Separate position' or not profile.force_password_reset then
      raise exception 'Finalized profile must retain exact Office identity, assignment and lock state.';
    end if;
    if (select count(*) from public.csvb_office_access_audit where subject_profile_id=identity_id
      and actor_id=actor and operation in ('role_assignment','profile_assignment'))<>2 then
      raise exception 'New Office Role/profile assignments must be audited once each.';
    end if;
  end loop;
end;
$$;
rollback;
