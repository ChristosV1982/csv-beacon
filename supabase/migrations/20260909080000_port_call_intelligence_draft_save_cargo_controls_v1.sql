-- C.S.V. BEACON — PCI Draft-save repair and cargo controls v1.
-- Backward-compatible: existing cargo/API values remain stored and readable.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- This function is shared by pci_port_profiles and pci_port_information_items.
-- Only the latter table has a status column, so OLD.status must be referenced
-- exclusively inside the table-specific branch.
create or replace function pci_private.validate_terminal_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_facility public.mai_port_facilities%rowtype;
begin
  if tg_table_name = 'pci_port_information_items' then
    if tg_op = 'UPDATE'
       and old.status <> 'office_info_draft'
       and new.port_facility_id is distinct from old.port_facility_id then
      raise exception 'Published office-information terminal scope is immutable.';
    end if;
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

with changes(
  field_key, field_label, control_type, value_type,
  postgres_type_hint, unit_format, condition_notes
) as (
  values
    ('mooring_fenders__ship_s_lines_or_tug_lines_used', 'Ship''s lines or tug lines used', 'Controlled dropdown', 'text', 'text', 'Ship''s lines / Tug lines', 'Actual arrangement used during this call.'),
    ('cargo_transfer__cargo_type_grade', 'Cargo grade / name', 'Text', 'text', 'text', 'Grade/name', 'Actual cargo grade or commercial name for this call.'),
    ('cargo_transfer__shore_cargo_nomination_quantity', 'Shore cargo nomination quantity', 'Numeric', 'number', 'numeric(16,3)', 'Bbl or MT', 'Reference quantity; unit stored explicitly.'),
    ('cargo_transfer__cargo_api', 'Cargo API / Density value', 'Numeric', 'number', 'numeric(10,3)', '°API or kg/m³ at 15°C', 'The selected measurement basis determines the displayed label and unit.'),
    ('cargo_transfer__loading_temperature', 'Loading temperature', 'Numeric', 'number', 'numeric(8,3)', '°C or °F', 'Unit stored explicitly.'),
    ('cargo_transfer__loading_discharging_sequence_of_grades', 'Loading / discharging sequence of grades', 'Controlled sequence dropdown', 'number', 'smallint', 'Sequence position', 'Hidden for one cargo grade; unique controlled positions are required for multiple grades.')
)
update public.pci_field_definitions d
set field_label = c.field_label,
    control_type = c.control_type,
    value_type = c.value_type,
    postgres_type_hint = c.postgres_type_hint,
    unit_format = c.unit_format,
    condition_notes = c.condition_notes,
    updated_at = now()
from changes c
where d.field_key = c.field_key
  and d.version = 1;

insert into public.pci_field_definitions (
  field_key, version, section_key, section_label, field_label,
  source_name, source_reference, retention_rule, control_type, value_type,
  postgres_type_hint, unit_format, requirement_rule, repeating_group_key,
  storage_target, profile_treatment, profile_eligible, condition_notes,
  sort_order, is_active
)
values
  ('cargo_transfer__cargo_type', 1, 'cargo_transfer', 'Cargo / transfer', 'Cargo type', 'User decision', 'Approved call-form usability v2', 'retain', 'Controlled dropdown', 'text', 'text', 'Crude Oil / Product', 'optional', 'cargo_grades', 'repeat_value', 'call_history_only', false, 'Select Crude Oil or Product; record the actual grade/name separately.', 1000, true),
  ('cargo_transfer__cargo_measurement_basis', 1, 'cargo_transfer', 'Cargo / transfer', 'Cargo measurement basis', 'User decision', 'Approved call-form usability v2', 'retain', 'Controlled dropdown', 'text', 'text', '°API / Density at 15°C', 'optional', 'cargo_grades', 'repeat_value', 'call_history_only', false, 'Select API or Density at 15°C in kg/m³.', 1001, true)
on conflict (field_key, version) do update
set field_label = excluded.field_label,
    control_type = excluded.control_type,
    value_type = excluded.value_type,
    postgres_type_hint = excluded.postgres_type_hint,
    unit_format = excluded.unit_format,
    requirement_rule = excluded.requirement_rule,
    repeating_group_key = excluded.repeating_group_key,
    storage_target = excluded.storage_target,
    profile_treatment = excluded.profile_treatment,
    profile_eligible = excluded.profile_eligible,
    condition_notes = excluded.condition_notes,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.pci_field_options (
  field_definition_id, option_key, option_label, sort_order, is_active
)
select d.id, o.option_key, o.option_label, o.sort_order, true
from public.pci_field_definitions d
join (
  values
    ('mooring_fenders__ship_s_lines_or_tug_lines_used', 'ships_lines', 'Ship''s lines', 10),
    ('mooring_fenders__ship_s_lines_or_tug_lines_used', 'tug_lines', 'Tug lines', 20),
    ('cargo_transfer__cargo_type', 'crude_oil', 'Crude Oil', 10),
    ('cargo_transfer__cargo_type', 'product', 'Product', 20),
    ('cargo_transfer__cargo_measurement_basis', 'api', 'API (°API)', 10),
    ('cargo_transfer__cargo_measurement_basis', 'density_15c', 'Density at 15°C (kg/m³)', 20)
) as o(field_key, option_key, option_label, sort_order)
  on d.field_key = o.field_key
 and d.version = 1
on conflict (field_definition_id, option_key) do update
set option_label = excluded.option_label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

do $verify$
declare
  v_trigger_count integer;
  v_field_count integer;
  v_option_count integer;
  v_function_text text;
begin
  select count(*) into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname = 'public'
    and c.relname in ('pci_port_profiles', 'pci_port_information_items')
    and t.tgfoid = 'pci_private.validate_terminal_scope()'::regprocedure;

  if v_trigger_count <> 2 then
    raise exception 'PCI V7 verification failed: expected 2 terminal-scope triggers, found %', v_trigger_count;
  end if;

  select pg_get_functiondef('pci_private.validate_terminal_scope()'::regprocedure)
  into v_function_text;

  if position('if tg_table_name = ''pci_port_information_items'' then' in lower(v_function_text)) = 0 then
    raise exception 'PCI V7 verification failed: terminal-scope status guard is not table-specific.';
  end if;

  select count(*) into v_field_count
  from public.pci_field_definitions
  where version = 1
    and is_active = true
    and field_key in (
      'mooring_fenders__ship_s_lines_or_tug_lines_used',
      'cargo_transfer__cargo_type',
      'cargo_transfer__cargo_type_grade',
      'cargo_transfer__cargo_measurement_basis',
      'cargo_transfer__cargo_api',
      'cargo_transfer__loading_discharging_sequence_of_grades'
    );

  if v_field_count <> 6 then
    raise exception 'PCI V7 verification failed: expected 6 controlled field definitions, found %', v_field_count;
  end if;

  select count(*) into v_option_count
  from public.pci_field_options o
  join public.pci_field_definitions d on d.id = o.field_definition_id
  where d.version = 1
    and o.is_active = true
    and (
      (d.field_key = 'mooring_fenders__ship_s_lines_or_tug_lines_used' and o.option_key in ('ships_lines', 'tug_lines'))
      or (d.field_key = 'cargo_transfer__cargo_type' and o.option_key in ('crude_oil', 'product'))
      or (d.field_key = 'cargo_transfer__cargo_measurement_basis' and o.option_key in ('api', 'density_15c'))
    );

  if v_option_count <> 6 then
    raise exception 'PCI V7 verification failed: expected 6 controlled options, found %', v_option_count;
  end if;
end;
$verify$;

commit;
