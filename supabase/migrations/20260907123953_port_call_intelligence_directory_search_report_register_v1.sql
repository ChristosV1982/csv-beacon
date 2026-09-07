-- Port Call Intelligence directory search and Company report register v1

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists pci_port_calls_company_register_idx
on public.pci_port_calls (
  company_id,
  (coalesce(all_lines_fast_utc, created_at)) desc,
  id desc
);

create index if not exists pci_port_calls_company_status_register_idx
on public.pci_port_calls (
  company_id,
  status,
  (coalesce(all_lines_fast_utc, created_at)) desc,
  id desc
);

do $$
declare
  v_trgm_schema text;
begin
  select n.nspname
    into v_trgm_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n
    on n.oid = e.extnamespace
  where e.extname = 'pg_trgm';

  if v_trgm_schema is null then
    raise exception 'Required pg_trgm extension is not installed';
  end if;

  execute format(
    'create index if not exists mai_port_facilities_pci_name_trgm_idx
       on public.mai_port_facilities
       using gin (facility_name %I.gin_trgm_ops)
       where is_active = true',
    v_trgm_schema
  );
end;
$$;

create or replace function pci_private.search_port_directory(
  p_unlocode text,
  p_terminal_name text,
  p_limit integer default 25
)
returns table (
  match_type text,
  port_id uuid,
  port_facility_id uuid,
  port_company_id uuid,
  facility_company_id uuid,
  country_code text,
  country_name text,
  unlocode text,
  port_name text,
  terminal_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_unlocode text := upper(
    regexp_replace(coalesce(p_unlocode, ''), '[^[:alnum:]]', '', 'g')
  );
  v_terminal text := btrim(
    regexp_replace(coalesce(p_terminal_name, ''), '[%_]+', ' ', 'g')
  );
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_company_id uuid := public.current_profile_company_id();
  v_role text := coalesce(public.current_app_role_text(), '');
  v_is_platform boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if not pci_private.has_permission('view') then
    raise exception 'Port Call Intelligence viewing permission is required';
  end if;

  v_is_platform := v_role in ('super_admin', 'platform_owner');

  if not v_is_platform
     and (
       v_company_id is null
       or not pci_private.module_enabled(v_company_id)
     ) then
    raise exception 'An enabled Company context is required';
  end if;

  if (v_unlocode = '') = (v_terminal = '') then
    raise exception 'Enter either one UN/LOCODE or one terminal name';
  end if;

  if v_unlocode <> '' then
    if length(v_unlocode) < 2 then
      raise exception 'Enter at least two UN/LOCODE characters';
    end if;

    return query
    select
      'unlocode'::text,
      p.id,
      null::uuid,
      p.company_id,
      null::uuid,
      p.country_code,
      p.country_name,
      p.unlocode,
      p.port_name,
      null::text
    from public.mai_ports p
    where p.is_active = true
      and (
        v_is_platform
        or p.company_id is null
        or p.company_id = v_company_id
      )
      and upper(
        regexp_replace(coalesce(p.unlocode, ''), '[^[:alnum:]]', '', 'g')
      ) like v_unlocode || '%'
    order by
      case
        when upper(
          regexp_replace(coalesce(p.unlocode, ''), '[^[:alnum:]]', '', 'g')
        ) = v_unlocode then 0
        else 1
      end,
      p.unlocode,
      p.country_name,
      p.port_name,
      p.id
    limit v_limit;

    return;
  end if;

  if length(v_terminal) < 3 then
    raise exception 'Enter at least three terminal-name characters';
  end if;

  return query
  select
    'terminal'::text,
    p.id,
    f.id,
    p.company_id,
    f.company_id,
    p.country_code,
    p.country_name,
    p.unlocode,
    p.port_name,
    f.facility_name
  from public.mai_port_facilities f
  join public.mai_ports p
    on p.id = f.port_id
  where f.is_active = true
    and p.is_active = true
    and (
      v_is_platform
      or p.company_id is null
      or p.company_id = v_company_id
    )
    and (
      f.company_id is null
      or f.company_id = v_company_id
    )
    and f.facility_name ilike '%' || v_terminal || '%'
  order by
    case
      when lower(f.facility_name) = lower(v_terminal) then 0
      when lower(f.facility_name) like lower(v_terminal) || '%' then 1
      else 2
    end,
    p.country_name,
    p.port_name,
    f.facility_name,
    f.id
  limit v_limit;
end;
$function$;

revoke all on function pci_private.search_port_directory(
  text,
  text,
  integer
) from public;

revoke all on function pci_private.search_port_directory(
  text,
  text,
  integer
) from anon;

grant execute on function pci_private.search_port_directory(
  text,
  text,
  integer
) to authenticated;

grant execute on function pci_private.search_port_directory(
  text,
  text,
  integer
) to service_role;

create or replace function public.pci_search_port_directory(
  p_unlocode text default null,
  p_terminal_name text default null,
  p_limit integer default 25
)
returns table (
  match_type text,
  port_id uuid,
  port_facility_id uuid,
  port_company_id uuid,
  facility_company_id uuid,
  country_code text,
  country_name text,
  unlocode text,
  port_name text,
  terminal_name text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select *
  from pci_private.search_port_directory(
    p_unlocode,
    p_terminal_name,
    p_limit
  );
$function$;

revoke all on function public.pci_search_port_directory(
  text,
  text,
  integer
) from public;

revoke all on function public.pci_search_port_directory(
  text,
  text,
  integer
) from anon;

grant execute on function public.pci_search_port_directory(
  text,
  text,
  integer
) to authenticated;

grant execute on function public.pci_search_port_directory(
  text,
  text,
  integer
) to service_role;

drop view if exists public.pci_v_call_report_register;

create view public.pci_v_call_report_register
with (security_invoker = true)
as
select
  c.*,
  p.port_facility_id,
  coalesce(c.all_lines_fast_utc, c.created_at) as call_sort_at
from public.pci_port_calls c
join public.pci_port_profiles p
  on p.id = c.profile_id
 and p.company_id = c.company_id;

revoke all on public.pci_v_call_report_register from public;
revoke all on public.pci_v_call_report_register from anon;
grant select on public.pci_v_call_report_register to authenticated;
grant select on public.pci_v_call_report_register to service_role;

commit;
