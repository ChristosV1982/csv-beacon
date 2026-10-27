-- Preparation-only catalogue. No enum, profile, grant, resolver or legacy
-- app_roles changes: these drafts deliberately cannot be assigned to users.
begin;

create table public.csvb_office_role_catalogue (
  code text primary key default ('office_draft_' || replace(gen_random_uuid()::text,'-','')),
  display_name text not null check (length(btrim(display_name)) between 2 and 100),
  is_active boolean not null default true,
  is_assignable boolean not null default false check (is_assignable = false),
  ever_used boolean not null default false,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code ~ '^office_draft_[0-9a-f]{32}$')
);
create unique index csvb_office_role_catalogue_label_uniq
  on public.csvb_office_role_catalogue (lower(btrim(display_name)));

-- Intentionally no FK to the draft row or actor: deletion of a never-used
-- catalogue entry/account must not destroy its historical audit identity.
create table public.csvb_role_catalogue_audit (
  id bigint generated always as identity primary key,
  role_code text not null,
  display_name text not null,
  action text not null check (action in ('create','rename','activate','deactivate','delete')),
  actor_id uuid not null,
  actor_username text,
  changed_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb
);
create index csvb_role_catalogue_audit_code_date
  on public.csvb_role_catalogue_audit (role_code, changed_at desc, id desc);
alter table public.csvb_office_role_catalogue enable row level security;
alter table public.csvb_role_catalogue_audit enable row level security;
revoke all on public.csvb_office_role_catalogue, public.csvb_role_catalogue_audit
  from public, anon, authenticated;
revoke all on sequence public.csvb_role_catalogue_audit_id_seq
  from public, anon, authenticated;

create function public.csvb_role_catalogue_require_super_admin()
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and role::text='super_admin'
      and coalesce(is_active,true) and not coalesce(is_disabled,false)
  ) then
    raise exception 'Active Super Admin authorization required.' using errcode='42501';
  end if;
end;
$$;

create function public.csvb_role_catalogue_dependencies(p_code text)
returns jsonb language sql security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'assigned_user_count',(select count(*) from public.profiles where role::text=p_code),
    'permission_reference_count',
      (select count(*) from public.role_permissions where role::text=p_code)
      +(select count(*) from public.app_role_permissions where role_id=p_code)
      +(select count(*) from public.role_permission_change_log where role::text=p_code)
      +(select count(*) from public.profile_roles_cache where role::text=p_code)
      +(select count(*) from public.app_roles where id=p_code)
  );
$$;

create function public.csvb_role_catalogue_list()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  select jsonb_build_object(
    'roles', (
      select jsonb_agg(x.data order by x.sort_order,x.label)
      from (
        select 0 sort_order,s.display_name label,
          jsonb_build_object(
            'code',s.code,'display_name',s.display_name,
            'classification',case when s.code='company_superintendent' then 'Office' else 'System' end,
            'is_active',coalesce(a.is_active,true),'is_assignable',true,
            'is_protected',true,
            'status',case when s.code='company_superintendent'
              then 'Legacy operational role — protected' else 'Protected system role' end,
            'protection_reason',case when s.code='company_superintendent'
              then 'Current users and backend checks depend on this legacy operational role. Under review; not safe to delete.'
              else 'Protected application security role. Stable code and existing behavior must remain unchanged.' end
          ) || public.csvb_role_catalogue_dependencies(s.code) data
        from (values
          ('super_admin','Super Admin'),
          ('company_admin','Company Admin'),
          ('company_superintendent','Company Superintendent'),
          ('vessel','Onboard Personnel'),
          ('inspector','Inspector / Third Party')
        ) s(code,display_name)
        left join public.app_roles a on a.id=s.code
        union all
        select 1,c.display_name,
          jsonb_build_object(
            'code',c.code,'display_name',c.display_name,'classification','Office',
            'is_active',c.is_active,'is_assignable',false,'is_protected',false,
            'status','Draft / Not yet assignable','ever_used',c.ever_used,
            'protection_reason','Catalogue preparation only. No permissions granted; unavailable in user assignment and authorization.'
          ) || public.csvb_role_catalogue_dependencies(c.code)
        from public.csvb_office_role_catalogue c
      ) x
    ),
    'audit',coalesce((
      select jsonb_agg(to_jsonb(a) order by a.changed_at desc,a.id desc)
      from (select id,role_code,display_name,action,actor_username,changed_at
            from public.csvb_role_catalogue_audit order by changed_at desc,id desc limit 100) a
    ),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.csvb_role_catalogue_change(
  p_action text, p_role_code text default null, p_display_name text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  old_row public.csvb_office_role_catalogue;
  new_row public.csvb_office_role_catalogue;
  v_label text := btrim(p_display_name);
  code_value text;
  dependencies jsonb;
  actor_name text;
begin
  perform public.csvb_role_catalogue_require_super_admin();
  if p_action is null or p_action not in ('create','rename','activate','deactivate','delete') then
    raise exception 'Unsupported role-catalogue action.';
  end if;
  if p_action in ('create','rename') then
    if v_label is null or length(v_label) not between 2 and 100 then
      raise exception 'Display name must contain 2–100 characters.';
    end if;
    if lower(v_label) in ('super admin','company admin','company superintendent','vessel',
        'onboard personnel','vessel / onboard personnel','inspector','inspector / third party','platform owner')
      or exists(select 1 from public.app_roles where lower(btrim(app_roles.label))=lower(v_label)) then
      raise exception 'That display name is reserved for an existing/system role.';
    end if;
  end if;
  if p_action='create' then
    if p_role_code is not null then
      raise exception 'Stable Office role codes are generated by the server.';
    end if;
    insert into public.csvb_office_role_catalogue(display_name,created_by,updated_by)
    values(v_label,auth.uid(),auth.uid()) returning * into new_row;
    code_value := new_row.code;
  else
    if p_role_code is null or p_role_code !~ '^office_draft_[0-9a-f]{32}$' then
      raise exception 'Protected/system roles cannot be changed in this workspace.';
    end if;
    select * into old_row from public.csvb_office_role_catalogue where code=p_role_code for update;
    if not found then raise exception 'Draft Office role no longer exists. Reload the catalogue.'; end if;
    code_value := old_row.code;
    if p_action='delete' then
      -- Serialize against current profile/grant/cache/catalogue writers. Future
      -- assignment integration must additionally add a restrictive FK.
      lock table public.profiles,public.role_permissions,public.app_role_permissions,
        public.role_permission_change_log,public.profile_roles_cache,public.app_roles in share mode;
      dependencies := public.csvb_role_catalogue_dependencies(code_value);
      if old_row.ever_used or (dependencies->>'assigned_user_count')::bigint>0
         or (dependencies->>'permission_reference_count')::bigint>0 then
        raise exception 'Cannot delete: this Office role has been used or still has user/permission references. Deactivate it instead.';
      end if;
      delete from public.csvb_office_role_catalogue where code=code_value;
    else
      update public.csvb_office_role_catalogue
      set display_name=case when p_action='rename' then v_label else display_name end,
          is_active=case when p_action='activate' then true when p_action='deactivate' then false else is_active end,
          updated_by=auth.uid(),updated_at=now()
      where code=code_value returning * into new_row;
    end if;
  end if;
  select username into actor_name from public.profiles where id=auth.uid();
  insert into public.csvb_role_catalogue_audit(
    role_code,display_name,action,actor_id,actor_username,before_data,after_data
  ) values (
    code_value,coalesce(new_row.display_name,old_row.display_name),p_action,auth.uid(),actor_name,
    case when p_action='create' then null else to_jsonb(old_row) end,
    case when p_action='delete' then null else to_jsonb(new_row) end
  );
  return jsonb_build_object('ok',true,'code',code_value,'is_assignable',false);
end;
$$;
revoke all on function public.csvb_role_catalogue_require_super_admin(),
  public.csvb_role_catalogue_dependencies(text), public.csvb_role_catalogue_list(),
  public.csvb_role_catalogue_change(text,text,text) from public, anon, authenticated;
grant execute on function public.csvb_role_catalogue_list(),
  public.csvb_role_catalogue_change(text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
