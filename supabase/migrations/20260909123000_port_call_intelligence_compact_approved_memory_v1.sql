begin;

-- Optional detail shown only when Gangway source = Other.
insert into public.pci_field_definitions (
  field_key, version, section_key, section_label, field_label,
  source_name, source_reference, retention_rule,
  control_type, value_type, postgres_type_hint, unit_format, requirement_rule,
  repeating_group_key, storage_target, profile_treatment,
  profile_eligible, condition_notes, sort_order, is_active
) values (
  'access_to_ship__gangway_source_other', 1,
  'access_to_ship', 'Access to ship', 'Specify other gangway source',
  'User decision', 'Approved compact call-form usability update', 'retain',
  'Text', 'text', 'text', null, 'optional', null, 'call_value',
  'profile_candidate', true,
  'Required in the interface when Gangway source is Other.', 1002, true
)
on conflict (field_key, version) do update set
  field_label = excluded.field_label,
  condition_notes = excluded.condition_notes,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- These narrowly scoped functions allow an authorised Company user to reuse
-- finalised names without exposing the underlying reports of other vessels.
create or replace function public.pci_list_approved_cargo_grades(p_company_id uuid)
returns table (cargo_grade_name text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null or not pci_private.can_view_company(p_company_id) then
    raise exception 'Port Call Intelligence access is required for this Company.';
  end if;

  return query
  select distinct btrim(rv.value_jsonb #>> '{}')
  from public.pci_port_calls c
  join public.pci_call_repeat_rows rr
    on rr.call_id = c.id and rr.company_id = c.company_id
  join public.pci_call_repeat_values rv
    on rv.repeat_row_id = rr.id and rv.call_id = c.id and rv.company_id = c.company_id
  join public.pci_field_definitions fd
    on fd.id = rv.field_definition_id
  where c.company_id = p_company_id
    and c.status = 'finalised'
    and rr.group_key = 'cargo_grades'
    and fd.field_key = 'cargo_transfer__cargo_type_grade'
    and nullif(btrim(rv.value_jsonb #>> '{}'), '') is not null
  order by 1;
end;
$function$;

create or replace function public.pci_list_approved_berths(
  p_company_id uuid,
  p_port_id uuid
)
returns table (port_facility_id uuid, berth_name text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null or not pci_private.can_view_company(p_company_id) then
    raise exception 'Port Call Intelligence access is required for this Company.';
  end if;

  return query
  select distinct p.port_facility_id, btrim(c.berth_name_snapshot)
  from public.pci_port_calls c
  join public.pci_port_profiles p
    on p.id = c.profile_id and p.company_id = c.company_id and p.port_id = c.port_id
  where c.company_id = p_company_id
    and c.port_id = p_port_id
    and c.status = 'finalised'
    and nullif(btrim(c.berth_name_snapshot), '') is not null
  order by 2, 1;
end;
$function$;

revoke all on function public.pci_list_approved_cargo_grades(uuid) from public;
revoke all on function public.pci_list_approved_berths(uuid, uuid) from public;
grant execute on function public.pci_list_approved_cargo_grades(uuid) to authenticated;
grant execute on function public.pci_list_approved_berths(uuid, uuid) to authenticated;

do $verify$
declare
  v_field_count integer;
  v_function_count integer;
begin
  select count(*) into v_field_count
  from public.pci_field_definitions
  where version = 1
    and field_key = 'access_to_ship__gangway_source_other'
    and is_active = true;

  select count(*) into v_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('pci_list_approved_cargo_grades', 'pci_list_approved_berths');

  if v_field_count <> 1 or v_function_count <> 2 then
    raise exception 'PCI V8 verification failed: field %, functions %', v_field_count, v_function_count;
  end if;
end;
$verify$;

commit;
