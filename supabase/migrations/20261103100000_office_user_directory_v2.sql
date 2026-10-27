begin;
-- Preserve the original list contract and its platform-admin access checks.
-- This is directory metadata only; it never activates the prepared resolver.
create function public.csvb_admin_list_users_by_company_v2(p_company_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare result jsonb;
begin
  perform public.csvb_require_platform_admin();
  select coalesce(jsonb_agg(to_jsonb(u)||jsonb_build_object(
    'office_role_code',c.code,'office_role_label',c.display_name,
    'office_access_profile_code',a.code,'office_access_profile_label',a.display_name,
    'office_profile_is_role_default',
      case when c.code is not null and a.code is not null
        then a.code=c.default_access_profile_code else null end,
    'office_permission_enforcement_active',
      case when c.code is not null and a.code is not null then false else null end
  ) order by u.company_name nulls first,u.role_name,u.username),'[]'::jsonb)
  into result
  from public.csvb_admin_list_users_by_company(p_company_id) u
  join public.profiles p on p.id=u.id
  left join public.csvb_office_role_catalogue c on c.code=p.office_role_code
    and p.role::text in ('company_admin','company_superintendent')
  left join public.csvb_office_access_profiles a on a.code=p.office_access_profile_code
    and p.role::text in ('company_admin','company_superintendent');
  return result;
end;
$$;
revoke all on function public.csvb_admin_list_users_by_company_v2(uuid) from public,anon,authenticated;
grant execute on function public.csvb_admin_list_users_by_company_v2(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
