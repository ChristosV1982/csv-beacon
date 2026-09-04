-- Port Call Intelligence terminal directory integration v1
-- Reuses the controlled MAI port-facility register without granting PCI users
-- any Mooring and Anchoring module permission.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.pci_port_profiles
  add column if not exists port_facility_id uuid;

alter table public.pci_port_information_items
  add column if not exists port_facility_id uuid;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pci_port_profiles_port_facility_id_fkey'
      and conrelid = 'public.pci_port_profiles'::regclass
  ) then
    alter table public.pci_port_profiles
      add constraint pci_port_profiles_port_facility_id_fkey
      foreign key (port_facility_id)
      references public.mai_port_facilities(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pci_port_information_items_port_facility_id_fkey'
      and conrelid = 'public.pci_port_information_items'::regclass
  ) then
    alter table public.pci_port_information_items
      add constraint pci_port_information_items_port_facility_id_fkey
      foreign key (port_facility_id)
      references public.mai_port_facilities(id)
      on delete set null;
  end if;
end;
$block$;

create index if not exists pci_port_profiles_facility_idx
on public.pci_port_profiles(company_id, port_id, port_facility_id);

create index if not exists pci_port_information_facility_idx
on public.pci_port_information_items(company_id, port_id, port_facility_id, status);

create unique index if not exists pci_port_profiles_facility_berth_uidx
on public.pci_port_profiles(
  company_id,
  port_id,
  port_facility_id,
  lower(btrim(berth_name))
)
where port_facility_id is not null;

create unique index if not exists mai_port_facilities_pci_company_name_uidx
on public.mai_port_facilities(
  port_id,
  company_id,
  lower(btrim(facility_name))
)
where company_id is not null
  and source_label = 'Port Call Intelligence';

drop policy if exists pci_port_facilities_select_scope
on public.mai_port_facilities;

create policy pci_port_facilities_select_scope
on public.mai_port_facilities
for select
to authenticated
using (
  is_active = true
  and pci_private.has_permission('view')
  and exists (
    select 1
    from public.mai_ports p
    where p.id = mai_port_facilities.port_id
      and p.is_active = true
      and (
        coalesce(public.current_app_role_text(), '') in ('super_admin', 'platform_owner')
        or (
          pci_private.module_enabled(public.current_profile_company_id())
          and (
            p.company_id is null
            or p.company_id = public.current_profile_company_id()
          )
        )
      )
  )
  and (
    company_id is null
    or pci_private.can_view_company(company_id)
  )
);

grant select on public.mai_port_facilities to authenticated;

create or replace view public.pci_v_port_facilities_list
with (security_invoker = true)
as
select
  f.id as port_facility_id,
  f.port_id,
  f.company_id,
  p.country_code,
  p.country_name,
  p.unlocode,
  p.port_name,
  f.facility_name,
  f.berth_or_terminal_name,
  f.port_facility_code,
  f.isps_code,
  f.security_code,
  f.source_label,
  f.source_reference,
  f.notes,
  f.is_active,
  f.sort_order,
  f.created_at,
  f.updated_at
from public.mai_port_facilities f
join public.mai_ports p
  on p.id = f.port_id
where f.is_active = true
  and p.is_active = true
  and pci_private.has_permission('view')
  and (
    coalesce(public.current_app_role_text(), '') in ('super_admin', 'platform_owner')
    or (
      pci_private.module_enabled(public.current_profile_company_id())
      and (
        p.company_id is null
        or p.company_id = public.current_profile_company_id()
      )
      and (
        f.company_id is null
        or f.company_id = public.current_profile_company_id()
      )
    )
  );

grant select on public.pci_v_port_facilities_list to authenticated;

create or replace function pci_private.validate_terminal_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_facility public.mai_port_facilities%rowtype;
begin
  if tg_op = 'UPDATE'
     and tg_table_name = 'pci_port_information_items'
     and old.status <> 'office_info_draft'
     and new.port_facility_id is distinct from old.port_facility_id then
    raise exception 'Published office-information terminal scope is immutable.';
  end if;

  if new.port_facility_id is null then
    return new;
  end if;

  select * into v_facility
  from public.mai_port_facilities f
  where f.id = new.port_facility_id
    and f.port_id = new.port_id
    and f.is_active = true
    and (
      f.company_id is null
      or f.company_id = new.company_id
    );

  if not found then
    raise exception 'The selected terminal is not available to this Company and port.';
  end if;

  new.terminal_name := btrim(v_facility.facility_name);
  return new;
end;
$function$;

drop trigger if exists pci_00_port_profiles_terminal_scope
on public.pci_port_profiles;

create trigger pci_00_port_profiles_terminal_scope
before insert or update on public.pci_port_profiles
for each row execute function pci_private.validate_terminal_scope();

drop trigger if exists pci_00_office_items_terminal_scope
on public.pci_port_information_items;

create trigger pci_00_office_items_terminal_scope
before insert or update on public.pci_port_information_items
for each row execute function pci_private.validate_terminal_scope();

create or replace function pci_private.add_company_terminal(
  p_company_id uuid,
  p_port_id uuid,
  p_terminal_name text
)
returns table (
  port_facility_id uuid,
  terminal_name text,
  company_id uuid,
  port_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_name text := btrim(coalesce(p_terminal_name, ''));
  v_existing public.mai_port_facilities%rowtype;
  v_saved public.mai_port_facilities%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_company_id is null then
    raise exception 'A Company context is required.';
  end if;

  if not (
    pci_private.is_master(p_company_id, null)
    or pci_private.is_office_user(p_company_id)
  ) then
    raise exception 'Not authorised to add a Company terminal.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 250 then
    raise exception 'Terminal name must contain between 2 and 250 characters.';
  end if;

  if not exists (
    select 1
    from public.mai_ports p
    where p.id = p_port_id
      and p.is_active = true
      and (p.company_id is null or p.company_id = p_company_id)
  ) then
    raise exception 'The selected port is not available to this Company.';
  end if;

  select * into v_existing
  from public.mai_port_facilities f
  where f.port_id = p_port_id
    and lower(btrim(f.facility_name)) = lower(v_name)
    and (f.company_id is null or f.company_id = p_company_id)
  order by (f.company_id is null) desc
  limit 1;

  if found then
    if v_existing.is_active then
      return query select v_existing.id, v_existing.facility_name, v_existing.company_id, v_existing.port_id;
      return;
    end if;
    raise exception 'This terminal already exists but is inactive. An authorised office user must review it.';
  end if;

  insert into public.mai_port_facilities (
    port_id,
    company_id,
    facility_name,
    berth_or_terminal_name,
    source_label,
    source_reference,
    notes,
    is_active,
    sort_order,
    created_by,
    updated_by
  ) values (
    p_port_id,
    p_company_id,
    v_name,
    v_name,
    'Port Call Intelligence',
    'Company-added terminal',
    'Added from the Port Call Intelligence terminal selector.',
    true,
    100,
    auth.uid(),
    auth.uid()
  )
  returning * into v_saved;

  return query select v_saved.id, v_saved.facility_name, v_saved.company_id, v_saved.port_id;
end;
$function$;

create or replace function public.pci_add_company_terminal(
  p_company_id uuid,
  p_port_id uuid,
  p_terminal_name text
)
returns table (
  port_facility_id uuid,
  terminal_name text,
  company_id uuid,
  port_id uuid
)
language sql
security invoker
set search_path = pg_catalog, public
as $function$
  select *
  from pci_private.add_company_terminal(
    p_company_id,
    p_port_id,
    p_terminal_name
  );
$function$;

create or replace function pci_private.manage_company_terminal(
  p_company_id uuid,
  p_port_facility_id uuid,
  p_terminal_name text,
  p_is_active boolean
)
returns table (
  port_facility_id uuid,
  terminal_name text,
  is_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_name text := btrim(coalesce(p_terminal_name, ''));
  v_current public.mai_port_facilities%rowtype;
  v_saved public.mai_port_facilities%rowtype;
begin
  if auth.uid() is null or not pci_private.is_office_user(p_company_id) then
    raise exception 'Only an authorised office user may manage Company terminals.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 250 then
    raise exception 'Terminal name must contain between 2 and 250 characters.';
  end if;

  select * into v_current
  from public.mai_port_facilities f
  where f.id = p_port_facility_id
    and f.company_id = p_company_id
    and f.source_label = 'Port Call Intelligence';

  if not found then
    raise exception 'Only a Company-added Port Call Intelligence terminal may be changed here.';
  end if;

  if exists (
    select 1
    from public.mai_port_facilities f
    where f.port_id = v_current.port_id
      and f.id <> v_current.id
      and f.is_active = true
      and lower(btrim(f.facility_name)) = lower(v_name)
      and (f.company_id is null or f.company_id = p_company_id)
  ) then
    raise exception 'Another active terminal with this name already exists for the port.';
  end if;

  update public.mai_port_facilities f
  set facility_name = v_name,
      berth_or_terminal_name = v_name,
      is_active = coalesce(p_is_active, f.is_active),
      updated_by = auth.uid(),
      updated_at = now()
  where f.id = v_current.id
  returning * into v_saved;

  return query select v_saved.id, v_saved.facility_name, v_saved.is_active;
end;
$function$;

create or replace function public.pci_manage_company_terminal(
  p_company_id uuid,
  p_port_facility_id uuid,
  p_terminal_name text,
  p_is_active boolean
)
returns table (
  port_facility_id uuid,
  terminal_name text,
  is_active boolean
)
language sql
security invoker
set search_path = pg_catalog, public
as $function$
  select *
  from pci_private.manage_company_terminal(
    p_company_id,
    p_port_facility_id,
    p_terminal_name,
    p_is_active
  );
$function$;

revoke all on function public.pci_add_company_terminal(uuid, uuid, text) from public;
grant execute on function public.pci_add_company_terminal(uuid, uuid, text) to authenticated;

revoke all on function public.pci_manage_company_terminal(uuid, uuid, text, boolean) from public;
grant execute on function public.pci_manage_company_terminal(uuid, uuid, text, boolean) to authenticated;

revoke all on function pci_private.add_company_terminal(uuid, uuid, text) from public;
grant execute on function pci_private.add_company_terminal(uuid, uuid, text) to authenticated;

revoke all on function pci_private.manage_company_terminal(uuid, uuid, text, boolean) from public;
grant execute on function pci_private.manage_company_terminal(uuid, uuid, text, boolean) to authenticated;

commit;
