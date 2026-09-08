-- C.S.V. BEACON — Port Call Intelligence call-form usability v1.
-- Additive and backward-compatible: historical values remain readable.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.pci_port_calls
  add column if not exists arrival_draught_midships numeric(10,3),
  add column if not exists controlling_depth_status text,
  add column if not exists tide_height_at_entry_status text,
  add column if not exists tide_height_at_exit numeric(10,3),
  add column if not exists tide_height_at_exit_status text;

alter table public.pci_port_calls
  drop constraint if exists pci_port_calls_controlling_depth_status_check,
  drop constraint if exists pci_port_calls_tide_height_at_entry_status_check,
  drop constraint if exists pci_port_calls_tide_height_at_exit_status_check;

alter table public.pci_port_calls
  add constraint pci_port_calls_controlling_depth_status_check check (
    controlling_depth_status is null
    or (controlling_depth_status = 'reported' and controlling_depth is not null)
    or (controlling_depth_status in ('not_applicable', 'not_known') and controlling_depth is null)
  ),
  add constraint pci_port_calls_tide_height_at_entry_status_check check (
    tide_height_at_entry_status is null
    or (tide_height_at_entry_status = 'reported' and tide_height_at_entry is not null)
    or (tide_height_at_entry_status in ('not_applicable', 'not_known') and tide_height_at_entry is null)
  ),
  add constraint pci_port_calls_tide_height_at_exit_status_check check (
    tide_height_at_exit_status is null
    or (tide_height_at_exit_status = 'reported' and tide_height_at_exit is not null)
    or (tide_height_at_exit_status in ('not_applicable', 'not_known') and tide_height_at_exit is null)
  );

with changes(field_key, field_label, control_type, value_type, postgres_type_hint, unit_format, requirement_rule, condition_notes) as (
  values
    ('port_berth_identification__berth_name_or_number', 'Berth (Berth Name)', 'Text', 'text', 'text', 'Text', 'core', 'Call-specific berth name.'),
    ('port_berth_identification__type_of_berth', 'Type of berth', 'Multi-select checkboxes', 'text', 'jsonb array', 'Controlled choices', 'optional', 'Select every berth type that applied. Ship to Ship opens the other-vessel field.'),
    ('port_berth_identification__terminal_berth_latitude', 'Terminal / berth latitude', 'Degrees and decimal minutes', 'number', 'numeric(9,6)', 'DD° MM.mmm′ N/S', 'optional', 'Historical position reported for this call; stored as decimal degrees.'),
    ('port_berth_identification__terminal_berth_longitude', 'Terminal / berth longitude', 'Degrees and decimal minutes', 'number', 'numeric(9,6)', 'DDD° MM.mmm′ E/W', 'optional', 'Historical position reported for this call; stored as decimal degrees.'),
    ('navigation_channel__allowed_draft_basis', 'Allowed draft basis', 'Controlled dropdown', 'text', 'text', 'Static / Dynamic / Not stated', 'optional', 'Records the basis stated by the terminal or port.'),
    ('navigation_channel__condition_of_buoys', 'Condition of buoys / Missing Buoys', 'Long text', 'text', 'text', 'Text', 'optional', 'Observed or reported condition at the call date, including any missing buoys.'),
    ('navigation_channel__pilot_boarding_position_latitude', 'Pilot boarding position latitude', 'Degrees and decimal minutes', 'number', 'numeric(9,6)', 'DD° MM.mmm′ N/S', 'optional', 'May be left blank when only an area is known; stored as decimal degrees.'),
    ('navigation_channel__pilot_boarding_position_longitude', 'Pilot boarding position longitude', 'Degrees and decimal minutes', 'number', 'numeric(9,6)', 'DDD° MM.mmm′ E/W', 'optional', 'May be left blank when only an area is known; stored as decimal degrees.'),
    ('ukc_at_port_entry__controlling_depth_used', 'Channel Controlling depth', 'Number + reporting status', 'number', 'numeric(10,3)', 'm / Not applicable / Not known', 'conditional', 'The reported value is stored separately from Not applicable and Not known.'),
    ('ukc_at_port_entry__tide_height_at_entry', 'Tide height at Port Entry', 'Number + reporting status', 'number', 'numeric(10,3)', 'm / Not applicable / Not known', 'conditional', 'Input tied to the approved entry time.'),
    ('ukc_at_port_entry__ukc_calculation_method', 'UKC method', 'Text', 'text', 'text', 'Text', 'optional', 'Optional method used for the historical calculation.'),
    ('ukc_at_port_entry__ukc_result', 'Actual UKC at shallowest depth', 'Numeric', 'number', 'numeric(10,3)', 'm', 'optional', 'Actual UKC reported at the shallowest depth.'),
    ('ukc_at_port_entry__ukc_calculation_assessment_notes', 'UKC notes', 'Long text', 'text', 'text', 'Free text', 'optional', 'Free-text UKC calculation and assessment notes.'),
    ('cargo_transfer__type_of_cargo_operation', 'Cargo-operation type', 'Multi-select checkboxes', 'text', 'text', 'Controlled choices', 'core', 'Select every cargo operation that applied during this call.'),
    ('mooring_fenders__side_alongside', 'Side alongside', 'Controlled dropdown', 'text', 'text', 'Port / Starboard / Other', 'optional', 'Actual side alongside for this call.'),
    ('mooring_fenders__quick_release_hooks_fitted', 'Quick-release hooks fitted', 'Controlled dropdown', 'text', 'text', 'Yes / No / Unknown', 'optional', 'Unknown remains distinct from No.'),
    ('mooring_fenders__number_of_tugs_used', 'Number of tugs used + Names', 'Controlled count', 'number', 'smallint', '0–7', 'optional', 'Selecting the count opens one structured row per tug.'),
    ('mooring_fenders__tug_details_name_bollard_pull_horsepower', 'Tug name', 'Text', 'text', 'text', 'Name', 'optional', 'One structured row per tug.'),
    ('mooring_fenders__tug_configuration_positioning', 'Legacy tug configuration / positioning', 'Long text', 'text', 'text', 'Text', 'optional', 'Preserved for historical reports; replaced in new reports by structured tug rows.'),
    ('berthing_limits__daylight_restriction', 'Daylight restriction', 'Controlled dropdown', 'text', 'text', 'Yes / No / Unknown', 'optional', 'Unknown remains distinct from No.'),
    ('access_to_ship__gangway_source', 'Gangway source', 'Controlled dropdown', 'text', 'text', 'Ship / Shore / Other', 'optional', 'Actual gangway source used during the call.'),
    ('cargo_transfer__manifold_connection', 'Manifold connection', 'Structured connection', 'text', 'jsonb object', 'Side / count / inches', 'optional', 'Stores side, number connected and the two flange dimensions.'),
    ('cargo_transfer__number_of_shore_loading_arms_connected', 'Legacy number of shore loading arms connected', 'Whole number', 'number', 'smallint', 'Count', 'optional', 'Preserved for historical reports; now implied by Manifold connection.'),
    ('cargo_transfer__maximum_loading_discharging_rate', 'Maximum loading / discharging rate requested by Terminal', 'Operation + numeric rate', 'text', 'jsonb object', 'm³/h', 'optional', 'Stores Loading or Discharging together with the requested terminal rate.'),
    ('cargo_transfer__shore_vapour_return_line_available', 'Shore vapour-return line available', 'Controlled dropdown', 'text', 'text', 'Yes / No / Unknown', 'optional', 'Separate availability from actual use.'),
    ('cargo_transfer__shore_vapour_return_line_used', 'Shore vapour-return line used', 'Controlled dropdown', 'text', 'text', 'Yes / No / Unknown', 'optional', 'Actual use during the call.'),
    ('cargo_transfer__shore_booster_pump_used', 'Shore booster pump used', 'Controlled dropdown', 'text', 'text', 'Yes / No / Unknown', 'conditional', 'Discharging calls only; Unknown remains distinct from No.'),
    ('security__security_level_experienced_during_call', 'Security level experienced during call', 'Controlled dropdown', 'number', 'smallint', '1 / 2 / 3', 'optional', 'Historical call value only; never present it as the current port security level.')
)
update public.pci_field_definitions d
set field_label = c.field_label,
    control_type = c.control_type,
    value_type = c.value_type,
    postgres_type_hint = c.postgres_type_hint,
    unit_format = c.unit_format,
    requirement_rule = c.requirement_rule,
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
  ('port_berth_identification__ship_to_ship_other_vessel_name', 1, 'port_berth_identification', 'Port / berth identification', 'Other vessel name (Ship to Ship)', 'User decision', 'Approved call-form usability v1', 'retain', 'Conditional text', 'text', 'text', 'Vessel name', 'conditional', null, 'call_value', 'call_history_only', false, 'Shown only when Ship to Ship is selected.', 145, true),
  ('port_berth_identification__anchorage_waiting_latitude', 1, 'port_berth_identification', 'Port / berth identification', 'Anchorage / waiting position latitude', 'User decision + CBO83', 'A3', 'retain', 'Degrees and decimal minutes', 'number', 'numeric(9,6)', 'DD° MM.mmm′ N/S', 'optional', null, 'call_value', 'profile_candidate', true, 'Optional position; stored as decimal degrees.', 146, true),
  ('port_berth_identification__anchorage_waiting_longitude', 1, 'port_berth_identification', 'Port / berth identification', 'Anchorage / waiting position longitude', 'User decision + CBO83', 'A3', 'retain', 'Degrees and decimal minutes', 'number', 'numeric(9,6)', 'DDD° MM.mmm′ E/W', 'optional', null, 'call_value', 'profile_candidate', true, 'Optional position; stored as decimal degrees.', 147, true),
  ('ukc_at_port_entry__arrival_draught_midships', 1, 'ukc_at_port_entry', 'UKC at port entry', 'Arrival draught midships', 'User decision', 'Approved call-form usability v1', 'retain', 'Numeric', 'number', 'numeric(10,3)', 'm', 'optional', null, 'call_header', 'call_history_only', false, 'Optional actual arrival draught at midships.', 148, true),
  ('ukc_at_port_entry__tide_height_at_exit', 1, 'ukc_at_port_entry', 'UKC at port entry', 'Tide height at Port Exit', 'User decision', 'Approved call-form usability v1', 'retain', 'Number + reporting status', 'number', 'numeric(10,3)', 'm / Not applicable / Not known', 'optional', null, 'call_header', 'call_history_only', false, 'Historical tide height at port exit.', 149, true),
  ('mooring_fenders__tug_action', 1, 'mooring_fenders', 'Mooring / fenders', 'Tug action', 'User decision', 'Approved call-form usability v1', 'retain', 'Controlled dropdown', 'text', 'text', 'Pulling / Pushing', 'optional', 'tugs', 'repeat_value', 'call_history_only', false, 'Actual tug action during this call.', 150, true),
  ('mooring_fenders__tug_position', 1, 'mooring_fenders', 'Mooring / fenders', 'Tug position', 'User decision', 'Approved call-form usability v1', 'retain', 'Controlled dropdown', 'text', 'text', 'Forward / Midship / Aft', 'optional', 'tugs', 'repeat_value', 'call_history_only', false, 'Actual position of the tug on the vessel.', 151, true),
  ('cargo_transfer__maximum_loading_discharging_rate_achieved', 1, 'cargo_transfer', 'Cargo / transfer', 'Maximum loading / discharging rate achieved', 'User decision', 'Approved call-form usability v1', 'retain', 'Operation + numeric rate', 'text', 'jsonb object', 'm³/h', 'optional', null, 'call_value', 'call_history_only', false, 'Stores Loading or Discharging together with the maximum rate actually achieved.', 152, true)
on conflict (field_key, version) do update
set section_key = excluded.section_key,
    section_label = excluded.section_label,
    field_label = excluded.field_label,
    source_name = excluded.source_name,
    source_reference = excluded.source_reference,
    retention_rule = excluded.retention_rule,
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

insert into public.pci_field_options (field_definition_id, option_key, option_label, sort_order, is_active)
select d.id, o.option_key, o.option_label, o.sort_order, true
from public.pci_field_definitions d
join (
  values
    ('port_berth_identification__type_of_berth', 'standard_tanker_berth', 'Standard Tanker Berth', 10),
    ('port_berth_identification__type_of_berth', 'non_standard_tanker_berth', 'Non Standard Tanker Berth', 20),
    ('port_berth_identification__type_of_berth', 'sbm_berth', 'SBM Berth', 30),
    ('port_berth_identification__type_of_berth', 'mooring_in_tandem', 'Mooring in tandem', 40),
    ('port_berth_identification__type_of_berth', 'conventional_buoy_mooring', 'Conventional buoy mooring', 50),
    ('port_berth_identification__type_of_berth', 'multi_buoy_mooring', 'Multi-buoy mooring', 60),
    ('port_berth_identification__type_of_berth', 'mediterranean_mooring_berth', 'Mediterranean mooring berth', 70),
    ('port_berth_identification__type_of_berth', 'ship_to_ship', 'Ship to Ship', 80),
    ('cargo_transfer__type_of_cargo_operation', 'loading', 'Loading', 10),
    ('cargo_transfer__type_of_cargo_operation', 'discharging', 'Discharging', 20),
    ('cargo_transfer__type_of_cargo_operation', 'tank_cleaning', 'Tank Cleaning', 30),
    ('cargo_transfer__type_of_cargo_operation', 'cow', 'COW', 40),
    ('cargo_transfer__type_of_cargo_operation', 'bunkering', 'Bunkering', 50),
    ('cargo_transfer__type_of_cargo_operation', 'ballasting', 'Ballasting', 60),
    ('cargo_transfer__type_of_cargo_operation', 'purging', 'Purging', 70),
    ('cargo_transfer__type_of_cargo_operation', 'gas_freeing', 'Gas freeing', 80),
    ('cargo_transfer__type_of_cargo_operation', 'cargo_heating', 'Cargo heating', 90),
    ('navigation_channel__allowed_draft_basis', 'static', 'Static', 10),
    ('navigation_channel__allowed_draft_basis', 'dynamic', 'Dynamic', 20),
    ('navigation_channel__allowed_draft_basis', 'not_stated', 'Not stated', 30),
    ('mooring_fenders__side_alongside', 'port', 'Port', 10),
    ('mooring_fenders__side_alongside', 'starboard', 'Starboard', 20),
    ('mooring_fenders__side_alongside', 'other', 'Other', 30),
    ('mooring_fenders__quick_release_hooks_fitted', 'yes', 'Yes', 10),
    ('mooring_fenders__quick_release_hooks_fitted', 'no', 'No', 20),
    ('mooring_fenders__quick_release_hooks_fitted', 'unknown', 'Unknown', 30),
    ('berthing_limits__daylight_restriction', 'yes', 'Yes', 10),
    ('berthing_limits__daylight_restriction', 'no', 'No', 20),
    ('berthing_limits__daylight_restriction', 'unknown', 'Unknown', 30),
    ('access_to_ship__gangway_source', 'ship', 'Ship', 10),
    ('access_to_ship__gangway_source', 'shore', 'Shore', 20),
    ('access_to_ship__gangway_source', 'other', 'Other', 30),
    ('mooring_fenders__tug_action', 'pulling', 'Pulling', 10),
    ('mooring_fenders__tug_action', 'pushing', 'Pushing', 20),
    ('mooring_fenders__tug_position', 'forward', 'Forward', 10),
    ('mooring_fenders__tug_position', 'midship', 'Midship', 20),
    ('mooring_fenders__tug_position', 'aft', 'Aft', 30),
    ('cargo_transfer__shore_vapour_return_line_available', 'yes', 'Yes', 10),
    ('cargo_transfer__shore_vapour_return_line_available', 'no', 'No', 20),
    ('cargo_transfer__shore_vapour_return_line_available', 'unknown', 'Unknown', 30),
    ('cargo_transfer__shore_vapour_return_line_used', 'yes', 'Yes', 10),
    ('cargo_transfer__shore_vapour_return_line_used', 'no', 'No', 20),
    ('cargo_transfer__shore_vapour_return_line_used', 'unknown', 'Unknown', 30),
    ('cargo_transfer__shore_booster_pump_used', 'yes', 'Yes', 10),
    ('cargo_transfer__shore_booster_pump_used', 'no', 'No', 20),
    ('cargo_transfer__shore_booster_pump_used', 'unknown', 'Unknown', 30),
    ('security__security_level_experienced_during_call', '1', '1', 10),
    ('security__security_level_experienced_during_call', '2', '2', 20),
    ('security__security_level_experienced_during_call', '3', '3', 30)
) as o(field_key, option_key, option_label, sort_order)
  on d.field_key = o.field_key
 and d.version = 1
on conflict (field_definition_id, option_key) do update
set option_label = excluded.option_label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

create or replace view public.pci_v_port_call_history
with (security_invoker = true)
as
select
  c.id as call_id,
  c.company_id,
  c.port_id,
  c.profile_id,
  c.call_reference,
  c.vessel_id,
  c.vessel_name_snapshot,
  c.port_name_snapshot,
  c.country_name_snapshot,
  c.country_code_snapshot,
  c.unlocode_snapshot,
  c.terminal_name_snapshot,
  c.berth_name_snapshot,
  c.all_lines_fast_utc,
  c.all_lines_clear_utc,
  c.cargo_operation_type,
  c.finalised_by,
  c.finalised_at,
  c.report_origin,
  c.arrival_draught_midships,
  c.controlling_depth_status,
  c.tide_height_at_entry_status,
  c.tide_height_at_exit,
  c.tide_height_at_exit_status
from public.pci_port_calls c
where c.status = 'finalised';

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

do $verify$
declare
  v_column_count integer;
  v_new_field_count integer;
  v_option_count integer;
begin
  select count(*) into v_column_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'pci_port_calls'
    and column_name in (
      'arrival_draught_midships', 'controlling_depth_status',
      'tide_height_at_entry_status', 'tide_height_at_exit',
      'tide_height_at_exit_status'
    );

  if v_column_count <> 5 then
    raise exception 'PCI call-form migration verification failed: expected 5 new call columns, found %', v_column_count;
  end if;

  select count(*) into v_new_field_count
  from public.pci_field_definitions
  where version = 1
    and is_active = true
    and field_key in (
      'port_berth_identification__ship_to_ship_other_vessel_name',
      'port_berth_identification__anchorage_waiting_latitude',
      'port_berth_identification__anchorage_waiting_longitude',
      'ukc_at_port_entry__arrival_draught_midships',
      'ukc_at_port_entry__tide_height_at_exit',
      'mooring_fenders__tug_action',
      'mooring_fenders__tug_position',
      'cargo_transfer__maximum_loading_discharging_rate_achieved'
    );

  if v_new_field_count <> 8 then
    raise exception 'PCI call-form migration verification failed: expected 8 new field definitions, found %', v_new_field_count;
  end if;

  select count(*) into v_option_count
  from public.pci_field_options o
  join public.pci_field_definitions d on d.id = o.field_definition_id
  where d.version = 1
    and o.is_active = true
    and d.field_key in (
      'port_berth_identification__type_of_berth',
      'cargo_transfer__type_of_cargo_operation',
      'navigation_channel__allowed_draft_basis',
      'mooring_fenders__side_alongside',
      'mooring_fenders__quick_release_hooks_fitted',
      'berthing_limits__daylight_restriction',
      'access_to_ship__gangway_source',
      'mooring_fenders__tug_action',
      'mooring_fenders__tug_position',
      'cargo_transfer__shore_vapour_return_line_available',
      'cargo_transfer__shore_vapour_return_line_used',
      'cargo_transfer__shore_booster_pump_used',
      'security__security_level_experienced_during_call'
    );

  if v_option_count < 49 then
    raise exception 'PCI call-form migration verification failed: expected at least 49 controlled options, found %', v_option_count;
  end if;
end;
$verify$;

commit;
