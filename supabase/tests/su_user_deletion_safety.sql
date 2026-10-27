-- Read-only assertions: never create/delete Auth users or business records.
begin;
do $$
begin
  if has_function_privilege('authenticated','public.csvb_assert_user_deletion_safe(uuid)','execute')
    or has_function_privilege('anon','public.csvb_assert_user_deletion_safe(uuid)','execute') then
    raise exception 'Deletion preflight must not be exposed to browser roles';
  end if;
  if not has_function_privilege('service_role','public.csvb_assert_user_deletion_safe(uuid)','execute') then
    raise exception 'Service role cannot run deletion preflight';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
      and ((tgrelid = 'auth.users'::regclass and tgname='csvb_guard_account_deletion')
        or (tgrelid = 'public.profiles'::regclass and tgname='csvb_guard_profile_deletion'))) <> 2 then
    raise exception 'Transactional account/profile cascade guards are missing';
  end if;
end;
$$;
rollback;
