-- No account/data deletion in this migration.
-- Conservative: do not allow user removal to cascade/delete/null business or audit references.
begin;
create or replace function public.csvb_assert_user_deletion_safe(p_user_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare ref record; has_rows boolean;
begin
  if p_user_id is null then raise exception 'Exactly one user ID is required'; end if;
  for ref in
    select c.conname, c.conrelid::regclass as relation_name, a.attname as column_name,
           cardinality(c.conkey) as key_count
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
      and n.nspname <> 'auth'
      -- Only the user's own profile and Auth credentials/sessions are account records.
      and not (c.conrelid = 'public.profiles'::regclass
        and c.confrelid = 'auth.users'::regclass and a.attname = 'id'
        and cardinality(c.conkey) = 1)
    order by c.conrelid, c.conname
  loop
    if ref.key_count <> 1 then
      raise exception 'Deletion blocked: composite user reference % requires review', ref.conname;
    end if;
    execute format('select exists(select 1 from %s where %I = $1)', ref.relation_name, ref.column_name)
      into has_rows using p_user_id;
    if has_rows then
      raise exception 'Deletion blocked: this user has linked audit/business records in %. Disable the account instead.', ref.relation_name;
    end if;
  end loop;
  -- Storage ownership is not always represented by a foreign key.
  for ref in select column_name from information_schema.columns
    where table_schema = 'storage' and table_name = 'objects' and column_name in ('owner','owner_id')
  loop
    execute format('select exists(select 1 from storage.objects where %I::text = $1)', ref.column_name)
      into has_rows using p_user_id::text;
    if has_rows then raise exception 'Deletion blocked: this user owns stored files. Administrative review is required.'; end if;
  end loop;
end;
$$;
revoke all on function public.csvb_assert_user_deletion_safe(uuid) from public, anon, authenticated;
grant execute on function public.csvb_assert_user_deletion_safe(uuid) to service_role;

create or replace function public.csvb_guard_user_delete_dependencies()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.csvb_assert_user_deletion_safe(old.id);
  return old;
end;
$$;
revoke all on function public.csvb_guard_user_delete_dependencies() from public, anon, authenticated;
drop trigger if exists csvb_guard_account_deletion on auth.users;
create trigger csvb_guard_account_deletion before delete on auth.users
for each row execute function public.csvb_guard_user_delete_dependencies();
drop trigger if exists csvb_guard_profile_deletion on public.profiles;
create trigger csvb_guard_profile_deletion before delete on public.profiles
for each row execute function public.csvb_guard_user_delete_dependencies();
commit;
