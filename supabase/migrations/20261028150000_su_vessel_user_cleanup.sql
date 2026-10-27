-- Explicit, resumable account cleanup. No existing accounts/vessels are deleted here.
begin;
create table public.su_user_cleanup_jobs (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null, mode text not null check(mode in ('individual','vessel_cleanup')),
 created_at timestamptz not null default now(), confirmed_at timestamptz, completed_at timestamptz
);
create table public.su_user_cleanup_items (
 job_id uuid not null references public.su_user_cleanup_jobs(id) on delete restrict,
 user_id uuid not null, position integer not null, identity jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','failed','completed')),
 attempts integer not null default 0, lease_token uuid, lease_expires_at timestamptz,
 error_text text, updated_at timestamptz not null default now(), completed_at timestamptz,
 primary key(job_id,user_id)
);
create table public.su_deleted_user_identities (
 original_user_id uuid primary key, identity jsonb not null,
 archived_at timestamptz not null default now(), archived_by uuid not null,
 auth_deleted_at timestamptz, cleanup_completed_at timestamptz
);
create table public.su_deleted_user_onboard_logs (
 id uuid primary key default gen_random_uuid(),
 original_user_id uuid not null references public.su_deleted_user_identities(original_user_id) on delete restrict,
 original_log_id uuid not null, source_record jsonb not null, source_fingerprint text not null,
 archived_at timestamptz not null default now(), archived_by uuid not null,
 unique(original_user_id,original_log_id,source_fingerprint)
);
create index su_cleanup_active_user on public.su_user_cleanup_items(user_id,status);
alter table public.su_user_cleanup_jobs enable row level security;
alter table public.su_user_cleanup_items enable row level security;
alter table public.su_deleted_user_identities enable row level security;
alter table public.su_deleted_user_onboard_logs enable row level security;
revoke all on public.su_user_cleanup_jobs,public.su_user_cleanup_items,
 public.su_deleted_user_identities,public.su_deleted_user_onboard_logs from public,anon,authenticated;
-- Actor/vessel/company UUIDs in archives intentionally have no live-profile FK.
-- Removing an account must not erase archived identities or actor attribution.

create function public.csvb_su_cleanup_assert_actor(p_actor_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role::text='super_admin'
   and is_active and not is_disabled) then
   raise exception 'Active Super Admin access required' using errcode='42501';
 end if;
end $$;

create function public.csvb_su_cleanup_identity(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'username',p.username,'first_name',p.first_name,'last_name',p.last_name,
  'role',p.role,'onboard_rank_id',p.onboard_rank_id,'rank_name',r.rank_name,'position',p.position,
  'vessel_id',p.vessel_id,'vessel_name',v.name,'company_id',p.company_id,'company_name',c.company_name)
 from public.profiles p left join public.vessels v on v.id=p.vessel_id
 left join public.companies c on c.id=p.company_id left join public.onboard_ranks r on r.id=p.onboard_rank_id
 where p.id=p_user_id
$$;

create function public.csvb_su_cleanup_job(p_job_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 perform public.csvb_su_cleanup_assert_actor(p_actor_id);
 select to_jsonb(j)||jsonb_build_object('items',coalesce(
   (select jsonb_agg(to_jsonb(i)-'lease_token'-'lease_expires_at' order by i.position)
    from public.su_user_cleanup_items i where i.job_id=j.id),'[]'::jsonb))
 into result from public.su_user_cleanup_jobs j where j.id=p_job_id and j.actor_id=p_actor_id;
 if result is null then raise exception 'Cleanup job not accessible' using errcode='42501'; end if;
 return result;
end $$;

create function public.csvb_su_cleanup_prepare(p_user_ids uuid[],p_actor_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare job uuid; target uuid; ident jsonb; n integer:=0;
begin
 perform public.csvb_su_cleanup_assert_actor(p_actor_id);
 if p_mode not in ('individual','vessel_cleanup') or cardinality(p_user_ids) not between 1 and 100
  or p_user_ids is null or array_position(p_user_ids,null) is not null
  or (select count(distinct x) from unnest(p_user_ids) x)<>cardinality(p_user_ids)
  or (p_mode='individual' and cardinality(p_user_ids)<>1) then
  raise exception 'Select 1-100 distinct users (one for individual deletion)';
 end if;
 insert into public.su_user_cleanup_jobs(actor_id,mode) values(p_actor_id,p_mode) returning id into job;
 foreach target in array p_user_ids loop
  if target=p_actor_id then raise exception 'You cannot delete your signed-in Super Admin account'; end if;
  perform 1 from public.profiles where id=target for update;
  ident:=public.csvb_su_cleanup_identity(target);
  if ident is null then raise exception 'Selected user no longer exists; refresh the directory'; end if;
  if p_mode='vessel_cleanup' and ident->>'role'<>'vessel' then
   raise exception 'Vessel cleanup rejects Office/platform accounts';
  end if;
  n:=n+1;
  insert into public.su_user_cleanup_items(job_id,user_id,position,identity) values(job,target,n,ident);
 end loop;
 return public.csvb_su_cleanup_job(job,p_actor_id);
end $$;

create function public.csvb_su_cleanup_confirm(p_job_id uuid,p_actor_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.csvb_su_cleanup_assert_actor(p_actor_id);
 update public.su_user_cleanup_jobs set confirmed_at=coalesce(confirmed_at,now())
 where id=p_job_id and actor_id=p_actor_id;
 if not found then raise exception 'Cleanup job not accessible' using errcode='42501'; end if;
end $$;

create function public.csvb_su_cleanup_authorized(p_user_id uuid)
returns boolean language sql volatile security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from public.su_user_cleanup_items i join public.su_user_cleanup_jobs j on j.id=i.job_id
  join public.su_deleted_user_identities a on a.original_user_id=i.user_id
  join public.profiles actor on actor.id=j.actor_id
  where i.user_id=p_user_id and i.status='processing' and i.lease_expires_at>now()
   and j.confirmed_at is not null and j.actor_id<>p_user_id
   and actor.role::text='super_admin' and actor.is_active and not actor.is_disabled
   and i.identity->>'role'='vessel' and a.identity=i.identity
   and public.csvb_su_cleanup_identity(p_user_id)=i.identity
 )
$$;

create or replace function public.csvb_assert_user_deletion_safe(p_user_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare ref record; has_rows boolean; vessel_cleanup boolean;
begin
 if p_user_id is null then raise exception 'Exactly one user ID is required'; end if;
 vessel_cleanup:=public.csvb_su_cleanup_authorized(p_user_id);
 for ref in
  select c.conname,c.conrelid::regclass as relation_name,a.attname as column_name,
   cardinality(c.conkey) as key_count,n.nspname as schema_name,t.relname as table_name
  from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid in ('auth.users'::regclass,'public.profiles'::regclass)
   and n.nspname<>'auth' and not(c.conrelid='public.profiles'::regclass
    and c.confrelid='auth.users'::regclass and a.attname='id' and cardinality(c.conkey)=1)
  order by c.conrelid,c.conname
 loop
  if ref.key_count<>1 then raise exception 'Composite user reference % requires review',ref.conname; end if;
  if vessel_cleanup and ref.schema_name='public' then
   if ref.table_name='profile_onboard_access_log' then
    -- Preserve every current row/version before allowing target-owned logs to cascade.
    if exists(select 1 from public.profile_onboard_access_log l
      where l.profile_id=p_user_id and not exists(
       select 1 from public.su_deleted_user_onboard_logs a where a.original_user_id=p_user_id
        and a.original_log_id=l.id and a.source_record=to_jsonb(l))) then
      raise exception 'Onboard history changed; retry to archive the new history before deletion';
    end if;
    if ref.column_name='profile_id' then continue; end if;
    if ref.column_name='changed_by' then
     if exists(select 1 from public.profile_onboard_access_log where changed_by=p_user_id and profile_id<>p_user_id) then
      raise exception 'User is an actor in another account history; administrative review required';
     end if;
     continue;
    end if;
   elsif ref.table_name='thread_notifications' then
    if ref.column_name='user_id' then continue; end if;
    if ref.column_name='created_by' then
     if exists(select 1 from public.thread_notifications where created_by=p_user_id and user_id<>p_user_id) then
      raise exception 'User is an actor in another account notification; administrative review required';
     end if;
     continue;
    end if;
   end if;
  end if;
  execute format('select exists(select 1 from %s where %I=$1)',ref.relation_name,ref.column_name)
   into has_rows using p_user_id;
  if has_rows then raise exception 'Deletion blocked: linked business/audit records in %. No business actors or vessels will be changed.',ref.relation_name; end if;
 end loop;
 for ref in select column_name from information_schema.columns
  where table_schema='storage' and table_name='objects' and column_name in ('owner','owner_id')
 loop
  execute format('select exists(select 1 from storage.objects where %I::text=$1)',ref.column_name)
   into has_rows using p_user_id::text;
  if has_rows then raise exception 'User owns stored evidence/files; administrative review required'; end if;
 end loop;
end $$;

create or replace function public.csvb_guard_user_delete_dependencies()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.su_user_cleanup_items where user_id=old.id and status='processing') then
  if not exists(select 1 from public.su_user_cleanup_items i join public.su_user_cleanup_jobs j on j.id=i.job_id
    join public.profiles actor on actor.id=j.actor_id
    where i.user_id=old.id and i.status='processing' and i.lease_expires_at>now()
     and j.confirmed_at is not null and j.actor_id<>old.id
     and actor.role::text='super_admin' and actor.is_active and not actor.is_disabled
     and public.csvb_su_cleanup_identity(old.id)=i.identity
     and (j.mode='individual' or i.identity->>'role'='vessel')) then
   raise exception 'Cleanup selection/authorization changed or expired; retry after review';
  end if;
  if tg_table_schema='public' and exists(select 1 from auth.users where id=old.id) then
   raise exception 'Remove the Auth account through Admin API, not its profile directly';
  end if;
 end if;
 perform public.csvb_assert_user_deletion_safe(old.id);
 if tg_table_schema='auth' and public.csvb_su_cleanup_authorized(old.id) then
  -- Same Auth transaction, after verifying exact archive copies. This avoids
  -- SET NULL actor FKs changing target-owned rows before profile cascade runs.
  delete from public.profile_onboard_access_log where profile_id=old.id;
  delete from public.thread_notifications where user_id=old.id;
 end if;
 return old;
end $$;

create function public.csvb_su_cleanup_claim(p_job_id uuid,p_user_id uuid,p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.su_user_cleanup_jobs; i public.su_user_cleanup_items; ident jsonb; lease uuid:=gen_random_uuid();
begin
 perform public.csvb_su_cleanup_assert_actor(p_actor_id);
 select * into j from public.su_user_cleanup_jobs where id=p_job_id and actor_id=p_actor_id and confirmed_at is not null for share;
 if not found then raise exception 'Confirmed cleanup job not accessible' using errcode='42501'; end if;
 select * into i from public.su_user_cleanup_items where job_id=p_job_id and user_id=p_user_id for update;
 if not found or p_user_id=p_actor_id then raise exception 'User was not selected for this cleanup' using errcode='42501'; end if;
 if i.status='completed' then return jsonb_build_object('state','completed','identity',i.identity); end if;
 if i.status='processing' and i.lease_expires_at>now() then return jsonb_build_object('state','busy','identity',i.identity); end if;
 perform 1 from public.profiles where id=p_user_id for update;
 ident:=public.csvb_su_cleanup_identity(p_user_id);
 if ident is null then
  if exists(select 1 from auth.users where id=p_user_id)
    or not exists(select 1 from public.su_deleted_user_identities where original_user_id=p_user_id and identity=i.identity) then
   raise exception 'Missing/mismatched live profile; manual review is required';
  end if;
 else
  if ident<>i.identity or (j.mode='vessel_cleanup' and ident->>'role'<>'vessel') then
   raise exception 'Selected identity/role/vessel changed; create a new reviewed selection';
  end if;
  if exists(select 1 from public.su_deleted_user_identities where original_user_id=p_user_id and identity<>ident) then
   raise exception 'A different archived identity exists; manual review required';
  end if;
  insert into public.su_deleted_user_identities(original_user_id,identity,archived_by)
    values(p_user_id,ident,p_actor_id) on conflict(original_user_id) do nothing;
  insert into public.su_deleted_user_onboard_logs(original_user_id,original_log_id,source_record,source_fingerprint,archived_by)
    select p_user_id,l.id,to_jsonb(l),md5(to_jsonb(l)::text),p_actor_id
    from public.profile_onboard_access_log l where l.profile_id=p_user_id
    on conflict(original_user_id,original_log_id,source_fingerprint) do nothing;
 end if;
 update public.su_user_cleanup_items set status='processing',attempts=attempts+1,
  lease_token=lease,lease_expires_at=now()+interval '5 minutes',error_text=null,updated_at=now()
  where job_id=p_job_id and user_id=p_user_id;
 if ident is not null then perform public.csvb_assert_user_deletion_safe(p_user_id); end if;
 return jsonb_build_object('state',case when ident is null then 'auth_missing' else 'processing' end,
   'lease_token',lease,'identity',i.identity);
end $$;

create function public.csvb_su_cleanup_failed(p_job_id uuid,p_user_id uuid,p_actor_id uuid,p_lease_token uuid,p_error text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.csvb_su_cleanup_assert_actor(p_actor_id);
 if not exists(select 1 from public.su_user_cleanup_jobs where id=p_job_id and actor_id=p_actor_id and confirmed_at is not null) then
  raise exception 'Cleanup job not accessible' using errcode='42501';
 end if;
 update public.su_user_cleanup_items set status='failed',error_text=left(p_error,1500),
   lease_expires_at=null,updated_at=now()
 where job_id=p_job_id and user_id=p_user_id and status<>'completed'
  and (status<>'processing' or lease_expires_at<=now() or lease_token=p_lease_token);
end $$;

create function public.csvb_su_cleanup_finish(p_job_id uuid,p_user_id uuid,p_actor_id uuid,p_lease_token uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.csvb_su_cleanup_assert_actor(p_actor_id);
 perform 1 from public.su_user_cleanup_jobs where id=p_job_id and actor_id=p_actor_id and confirmed_at is not null for share;
 if not found then raise exception 'Cleanup job not accessible' using errcode='42501'; end if;
 perform 1 from public.su_user_cleanup_items where job_id=p_job_id and user_id=p_user_id
  and status='processing' and lease_token=p_lease_token for update;
 if not found then raise exception 'Cleanup lease changed; resume the job'; end if;
 if exists(select 1 from auth.users where id=p_user_id) or exists(select 1 from public.profiles where id=p_user_id) then
  raise exception 'Auth/profile deletion is not complete; retry without changing history';
 end if;
 delete from public.profile_roles_cache where user_id=p_user_id;
 update public.su_deleted_user_identities set auth_deleted_at=coalesce(auth_deleted_at,now()),cleanup_completed_at=now()
  where original_user_id=p_user_id;
 update public.su_user_cleanup_items set status='completed',completed_at=now(),updated_at=now(),
  lease_expires_at=null,error_text=null where job_id=p_job_id and user_id=p_user_id;
 update public.su_user_cleanup_jobs set completed_at=now() where id=p_job_id and not exists(
  select 1 from public.su_user_cleanup_items where job_id=p_job_id and status<>'completed');
end $$;

create function public.csvb_su_deleted_user_archive_for_me(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 perform public.csvb_su_cleanup_assert_actor(auth.uid());
 return (select to_jsonb(a)||jsonb_build_object('onboard_access_history',coalesce(
  (select jsonb_agg(to_jsonb(l) order by l.archived_at,l.original_log_id)
   from public.su_deleted_user_onboard_logs l where l.original_user_id=a.original_user_id),'[]'::jsonb))
  from public.su_deleted_user_identities a where a.original_user_id=p_user_id);
end $$;

-- No browser can invoke the worker primitives or read/write archive/job tables.
do $$
declare f record;
begin
 for f in select oid::regprocedure as signature from pg_proc
  where pronamespace='public'::regnamespace and proname like 'csvb_su_cleanup_%'
 loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
revoke all on function public.csvb_su_deleted_user_archive_for_me(uuid) from public,anon;
grant execute on function public.csvb_su_deleted_user_archive_for_me(uuid) to authenticated;
commit;
