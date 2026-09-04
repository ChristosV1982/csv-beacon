-- Port Call Intelligence schema v1
-- Repository draft only. Do not execute until the security review is complete.
-- Approved scope: consolidated Port/Terminal/Berth profiles, immutable vessel-call
-- evidence, report-by-report consultation, office-authored port information,
-- controlled amendments, private attachments and complete audit provenance.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- Module registry and Rights Matrix
-- -----------------------------------------------------------------------------

create or replace function public.csvb_standard_modules()
returns table (
  module_key text,
  module_label text,
  module_group text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    v.module_key,
    v.module_label,
    v.module_group,
    v.sort_order
  from (
    values
      ('read_only_library', 'Read-Only Library', 'SIRE 2.0', 10),
      ('sire_questions_viewer', 'SIRE 2.0 Questions Viewer', 'SIRE 2.0', 11),
      ('sire_2_vetting', 'SIRE 2.0 Vetting', 'SIRE 2.0', 20),
      ('self_assessment', 'Self-Assessment', 'SIRE 2.0', 30),
      ('post_inspection', 'Post-Inspection', 'SIRE 2.0', 40),
      ('post_inspection_stats', 'Post-Inspection Stats', 'SIRE 2.0', 50),
      ('inspector_intelligence', 'Inspector Intelligence', 'Assurance Intelligence', 60),
      ('audit_observations', 'Audit Observations', 'Audits', 70),
      ('questions_editor', 'Questions Editor', 'Administration', 80),
      ('risq_questions_editor', 'RISQ Questions Editor', 'Administration', 85),
      ('marine_equipment_register', 'Marine Equipment Register', 'Marine Operations', 90),
      ('mooring_anchoring_inventories', 'Mooring and Anchoring Inventories', 'Marine Operations', 95),
      ('portable_lifting_appliances_wires', 'Portable Lifting Appliances & Wires', 'Marine Operations', 96),
      ('port_call_intelligence', 'Port Call Intelligence', 'Marine Operations', 97),
      ('ism_sms_actions', 'ISM / SMS Actions', 'ISM / SMS', 100),
      ('threads', 'Threads', 'Discussions', 105),
      ('fleet_reports', 'Fleet Reports & KPIs', 'Reports', 110),
      ('company_policy', 'Company Policy', 'Company Policy', 120),
      ('company_policy_documents', 'Company Policy Documents', 'Company Policy', 121),
      ('company_policy_change_requests', 'Company Policy Change Requests', 'Company Policy', 122),
      ('company_policy_ai_search', 'Company Policy AI Search', 'Company Policy', 123),
      ('platform_administration', 'Platform Administration', 'Administration', 900)
  ) as v(module_key, module_label, module_group, sort_order)
  order by v.sort_order, v.module_key;
$function$;

insert into public.app_modules (code, name, is_active)
values ('PORT_CALL_INTELLIGENCE', 'Port Call Intelligence', true)
on conflict (code) do update
set name = excluded.name,
    is_active = excluded.is_active;

insert into public.app_permissions (module_id, action)
select m.id, a.action
from public.app_modules m
cross join (
  values ('view'), ('edit'), ('review'), ('admin')
) as a(action)
where m.code = 'PORT_CALL_INTELLIGENCE'
on conflict (module_id, action) do nothing;

with grants(role_name, position_name, action_name, scope_name) as (
  values
    ('company_admin', null::text, 'view', 'company'),
    ('company_admin', null::text, 'edit', 'company'),
    ('company_admin', null::text, 'review', 'company'),
    ('company_admin', null::text, 'admin', 'company'),
    ('company_superintendent', null::text, 'view', 'company'),
    ('company_superintendent', null::text, 'edit', 'company'),
    ('company_superintendent', null::text, 'review', 'company'),
    ('company_superintendent', null::text, 'admin', 'company'),
    ('vessel', null::text, 'view', 'vessel_any'),
    ('vessel', 'Master', 'edit', 'vessel_assigned')
), resolved as (
  select
    g.role_name::public.app_role as role,
    g.position_name as position,
    p.id as permission_id,
    g.scope_name::public.permission_scope as scope
  from grants g
  join public.app_modules m
    on m.code = 'PORT_CALL_INTELLIGENCE'
  join public.app_permissions p
    on p.module_id = m.id
   and p.action = g.action_name
)
insert into public.role_permissions (
  role,
  position,
  permission_id,
  scope,
  is_granted
)
select
  r.role,
  r.position,
  r.permission_id,
  r.scope,
  true
from resolved r
where not exists (
  select 1
  from public.role_permissions existing
  where existing.role = r.role
    and existing.position is not distinct from r.position
    and existing.permission_id = r.permission_id
);

-- Company enablement is deliberately not inserted here. The module remains
-- disabled until a separately verified testing-stage company_modules change.

-- -----------------------------------------------------------------------------
-- Private authorization helpers
-- -----------------------------------------------------------------------------

create schema if not exists pci_private;
revoke all on schema pci_private from public;

create or replace function pci_private.has_permission(p_action text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.csvb_my_effective_app_permissions() p
    where p.module_code = 'PORT_CALL_INTELLIGENCE'
      and p.permission_action = p_action
      and p.is_granted = true
  );
$function$;

create or replace function pci_private.module_enabled(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select case
    when coalesce(public.current_app_role_text(), '') in ('super_admin', 'platform_owner')
      then true
    when p_company_id is null
      then false
    else exists (
      select 1
      from public.companies c
      join public.company_modules cm
        on cm.company_id = c.id
       and cm.module_key = 'port_call_intelligence'
       and cm.is_enabled = true
      where c.id = p_company_id
        and c.is_active = true
    )
  end;
$function$;

create or replace function pci_private.is_office_user(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    case
      when auth.uid() is null then false
      when coalesce(public.current_app_role_text(), '') in ('super_admin', 'platform_owner') then true
      else exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.company_id = p_company_id
          and p.role::text in ('company_admin', 'company_superintendent')
          and p.is_active = true
          and p.is_disabled = false
      )
      and pci_private.module_enabled(p_company_id)
      and (
        pci_private.has_permission('review')
        or pci_private.has_permission('admin')
      )
    end;
$function$;

create or replace function pci_private.is_master(
  p_company_id uuid,
  p_vessel_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.profiles p
    join public.onboard_ranks r
      on r.id = p.onboard_rank_id
    where p.id = auth.uid()
      and p.role::text = 'vessel'
      and p.company_id = p_company_id
      and (p_vessel_id is null or p.vessel_id = p_vessel_id)
      and p.is_active = true
      and p.is_disabled = false
      and p.onboard_access_enabled = true
      and p.onboard_status in ('onboard', 'temporarily_ashore')
      and r.rank_code = 'master'
      and r.is_active = true
      and (r.company_id is null or r.company_id = p_company_id)
      and pci_private.module_enabled(p_company_id)
      and pci_private.has_permission('edit')
  );
$function$;

create or replace function pci_private.can_view_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    case
      when auth.uid() is null then false
      when coalesce(public.current_app_role_text(), '') in ('super_admin', 'platform_owner')
        then pci_private.has_permission('view')
      else public.current_profile_company_id() = p_company_id
        and pci_private.module_enabled(p_company_id)
        and pci_private.has_permission('view')
    end;
$function$;

-- -----------------------------------------------------------------------------
-- Configuration and two-layer evidence model
-- -----------------------------------------------------------------------------

create table public.pci_field_definitions (
  id uuid primary key default gen_random_uuid(),
  field_key text not null,
  version integer not null default 1 check (version > 0),
  section_key text not null,
  section_label text not null,
  field_label text not null,
  source_name text,
  source_reference text,
  retention_rule text not null,
  control_type text not null,
  value_type text not null check (
    value_type in (
      'text', 'number', 'boolean', 'date', 'time', 'local_datetime',
      'utc_datetime', 'uuid', 'attachment', 'repeat'
    )
  ),
  postgres_type_hint text not null,
  unit_format text,
  requirement_rule text not null check (
    requirement_rule in ('system', 'core', 'optional', 'conditional')
  ),
  repeating_group_key text,
  storage_target text not null check (
    storage_target in (
      'call_header', 'call_value', 'repeat_value', 'attachment',
      'hazard', 'section_confirmation'
    )
  ),
  profile_treatment text not null check (
    profile_treatment in (
      'system_profile_key', 'profile_candidate', 'call_history_only'
    )
  ),
  profile_eligible boolean not null default false,
  condition_notes text,
  sort_order integer not null check (sort_order > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_key, version),
  unique (sort_order, version),
  check (
    profile_eligible = (profile_treatment = 'profile_candidate')
  )
);

create table public.pci_field_options (
  id uuid primary key default gen_random_uuid(),
  field_definition_id uuid not null
    references public.pci_field_definitions(id) on delete restrict,
  option_key text not null,
  option_label text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_definition_id, option_key)
);

create table public.pci_port_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id) on update cascade on delete restrict,
  port_id uuid not null
    references public.mai_ports(id) on delete restrict,
  terminal_name text not null default '',
  berth_name text not null default '',
  port_name_snapshot text not null,
  country_name_snapshot text,
  country_code_snapshot text,
  unlocode_snapshot text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (berth_name = '' or terminal_name <> '')
);

create unique index pci_port_profiles_scope_uidx
on public.pci_port_profiles (
  company_id,
  port_id,
  lower(btrim(terminal_name)),
  lower(btrim(berth_name))
);

create index pci_port_profiles_port_fk_idx
on public.pci_port_profiles(port_id);

create table public.pci_port_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id) on update cascade on delete restrict,
  vessel_id uuid not null
    references public.vessels(id) on update cascade on delete restrict,
  port_id uuid not null
    references public.mai_ports(id) on delete restrict,
  profile_id uuid not null
    references public.pci_port_profiles(id) on delete restrict,
  call_reference text not null,
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'under_review', 'finalised')
  ),
  vessel_name_snapshot text not null,
  port_name_snapshot text not null,
  country_name_snapshot text,
  country_code_snapshot text,
  unlocode_snapshot text,
  terminal_name_snapshot text not null,
  berth_name_snapshot text not null,
  all_lines_fast_local timestamp without time zone,
  all_lines_fast_utc_offset_minutes smallint,
  all_lines_fast_utc timestamptz,
  all_lines_clear_local timestamp without time zone,
  all_lines_clear_utc_offset_minutes smallint,
  all_lines_clear_utc timestamptz,
  port_entry_local timestamp without time zone,
  port_entry_utc_offset_minutes smallint,
  port_entry_utc timestamptz,
  arrival_draught_forward numeric(10,3),
  arrival_draught_aft numeric(10,3),
  controlling_depth numeric(10,3),
  tide_height_at_entry numeric(10,3),
  ukc_method text,
  ukc_result numeric(10,3),
  ukc_notes text,
  cargo_operation_type text,
  master_completion_confirmed boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  submitted_by uuid,
  submitted_at timestamptz,
  review_started_by uuid,
  review_started_at timestamptz,
  returned_by uuid,
  returned_at timestamptz,
  return_reason text,
  finalised_by uuid,
  finalised_at timestamptz,
  unique (company_id, call_reference),
  check (
    all_lines_fast_utc_offset_minutes is null
    or all_lines_fast_utc_offset_minutes between -840 and 840
  ),
  check (
    all_lines_clear_utc_offset_minutes is null
    or all_lines_clear_utc_offset_minutes between -840 and 840
  ),
  check (
    port_entry_utc_offset_minutes is null
    or port_entry_utc_offset_minutes between -840 and 840
  ),
  check (
    (all_lines_fast_local is null and all_lines_fast_utc_offset_minutes is null and all_lines_fast_utc is null)
    or
    (all_lines_fast_local is not null and all_lines_fast_utc_offset_minutes is not null and all_lines_fast_utc is not null)
  ),
  check (
    (all_lines_clear_local is null and all_lines_clear_utc_offset_minutes is null and all_lines_clear_utc is null)
    or
    (all_lines_clear_local is not null and all_lines_clear_utc_offset_minutes is not null and all_lines_clear_utc is not null)
  ),
  check (
    (port_entry_local is null and port_entry_utc_offset_minutes is null and port_entry_utc is null)
    or
    (port_entry_local is not null and port_entry_utc_offset_minutes is not null and port_entry_utc is not null)
  ),
  check (
    all_lines_fast_utc is null
    or all_lines_fast_utc = (
      all_lines_fast_local - make_interval(mins => all_lines_fast_utc_offset_minutes)
    ) at time zone 'UTC'
  ),
  check (
    all_lines_clear_utc is null
    or all_lines_clear_utc = (
      all_lines_clear_local - make_interval(mins => all_lines_clear_utc_offset_minutes)
    ) at time zone 'UTC'
  ),
  check (
    port_entry_utc is null
    or port_entry_utc = (
      port_entry_local - make_interval(mins => port_entry_utc_offset_minutes)
    ) at time zone 'UTC'
  ),
  check (
    all_lines_fast_utc is null
    or all_lines_clear_utc is null
    or all_lines_clear_utc >= all_lines_fast_utc
  )
);

create unique index pci_port_calls_id_company_uidx
on public.pci_port_calls(id, company_id);

create index pci_port_calls_port_history_idx
on public.pci_port_calls(company_id, port_id, status, all_lines_fast_utc desc);

create index pci_port_calls_vessel_idx
on public.pci_port_calls(company_id, vessel_id, status, created_at desc);

create table public.pci_call_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  field_definition_id uuid not null
    references public.pci_field_definitions(id) on delete restrict,
  value_jsonb jsonb not null,
  display_value text,
  unit_key text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (call_id, field_definition_id),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete cascade
);

create table public.pci_call_repeat_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  group_key text not null,
  row_number integer not null check (row_number > 0),
  row_label text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (call_id, group_key, row_number),
  unique (id, company_id),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete cascade
);

create table public.pci_call_repeat_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  repeat_row_id uuid not null,
  field_definition_id uuid not null
    references public.pci_field_definitions(id) on delete restrict,
  value_jsonb jsonb not null,
  display_value text,
  unit_key text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (repeat_row_id, field_definition_id),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete cascade,
  foreign key (repeat_row_id, company_id)
    references public.pci_call_repeat_rows(id, company_id) on delete cascade
);

create table public.pci_call_section_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  section_key text not null,
  completion_status text not null check (
    completion_status in ('completed', 'not_available', 'not_applicable')
  ),
  remarks text,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default now(),
  unique (call_id, section_key),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete cascade,
  check (
    completion_status <> 'not_available'
    or nullif(btrim(remarks), '') is not null
  )
);

create table public.pci_call_hazards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  category_key text not null,
  category_label text not null,
  hazard_narrative text not null,
  precautions_lessons text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete cascade
);

create table public.pci_call_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  request_origin text not null check (request_origin in ('master', 'office')),
  reason text not null check (nullif(btrim(reason), '') is not null),
  status text not null default 'amendment_draft' check (
    status in (
      'amendment_draft', 'amendment_submitted',
      'amendment_rejected', 'amendment_applied'
    )
  ),
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  decision_reason text,
  applied_by uuid,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete restrict
);

create table public.pci_call_amendment_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  amendment_id uuid not null,
  field_definition_id uuid
    references public.pci_field_definitions(id) on delete restrict,
  change_path text not null,
  old_value_jsonb jsonb,
  proposed_value_jsonb jsonb,
  approved_value_jsonb jsonb,
  reason text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (amendment_id, company_id)
    references public.pci_call_amendments(id, company_id) on delete cascade
);

create table public.pci_call_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  amendment_id uuid,
  storage_bucket text not null default 'port-call-intelligence-private'
    check (storage_bucket = 'port-call-intelligence-private'),
  object_path text not null,
  original_file_name text not null,
  mime_type text not null check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256_hex text check (sha256_hex is null or sha256_hex ~ '^[0-9a-fA-F]{64}$'),
  category_key text not null,
  description text,
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (object_path),
  foreign key (call_id, company_id)
    references public.pci_port_calls(id, company_id) on delete restrict,
  foreign key (amendment_id, company_id)
    references public.pci_call_amendments(id, company_id) on delete restrict
);

create index pci_call_attachments_call_idx
on public.pci_call_attachments(call_id, uploaded_at);

create table public.pci_profile_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  profile_id uuid not null
    references public.pci_port_profiles(id) on delete restrict,
  field_definition_id uuid not null
    references public.pci_field_definitions(id) on delete restrict,
  condition_label text not null default '',
  value_jsonb jsonb not null,
  display_value text,
  unit_key text,
  source_call_id uuid
    references public.pci_port_calls(id) on delete restrict,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (profile_id, field_definition_id, condition_label),
  unique (id, company_id)
);

create table public.pci_profile_change_proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  profile_id uuid not null
    references public.pci_port_profiles(id) on delete restrict,
  source_call_id uuid not null
    references public.pci_port_calls(id) on delete restrict,
  field_definition_id uuid not null
    references public.pci_field_definitions(id) on delete restrict,
  existing_profile_value_id uuid,
  proposed_condition_label text not null default '',
  proposed_value_jsonb jsonb not null,
  proposed_display_value text,
  proposed_unit_key text,
  status text not null default 'pending' check (
    status in (
      'pending', 'accepted', 'rejected', 'kept_existing',
      'condition_dependent', 'clarification_requested'
    )
  ),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  unique (source_call_id, field_definition_id, proposed_condition_label),
  foreign key (existing_profile_value_id, company_id)
    references public.pci_profile_values(id, company_id) on delete restrict
);

create index pci_profile_proposals_pending_idx
on public.pci_profile_change_proposals(company_id, profile_id, status, created_at)
where status in ('pending', 'clarification_requested');

create table public.pci_profile_value_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  profile_id uuid not null
    references public.pci_port_profiles(id) on delete restrict,
  profile_value_id uuid,
  field_definition_id uuid not null
    references public.pci_field_definitions(id) on delete restrict,
  condition_label text not null default '',
  action text not null check (action in ('created', 'revised', 'withdrawn')),
  previous_value_jsonb jsonb,
  new_value_jsonb jsonb,
  source_call_id uuid
    references public.pci_port_calls(id) on delete restrict,
  proposal_id uuid
    references public.pci_profile_change_proposals(id) on delete restrict,
  action_by uuid not null,
  action_at timestamptz not null default now(),
  reason text,
  foreign key (profile_value_id, company_id)
    references public.pci_profile_values(id, company_id) on delete restrict
);

create table public.pci_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id) on update cascade on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_id uuid,
  actor_username_snapshot text,
  event_at timestamptz not null default now(),
  old_state jsonb,
  new_state jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index pci_audit_events_entity_idx
on public.pci_audit_events(company_id, entity_type, entity_id, event_at desc);

create table public.pci_port_information_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.companies(id) on update cascade on delete restrict,
  port_id uuid not null
    references public.mai_ports(id) on delete restrict,
  profile_id uuid
    references public.pci_port_profiles(id) on delete restrict,
  terminal_name text not null default '',
  berth_name text not null default '',
  category_key text not null check (
    category_key in (
      'regulation', 'incident', 'operational_note',
      'master_guidance', 'superintendent_note', 'other'
    )
  ),
  status text not null default 'office_info_draft' check (
    status in ('office_info_draft', 'office_info_published', 'office_info_withdrawn')
  ),
  current_revision_number integer check (current_revision_number is null or current_revision_number > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  published_by uuid,
  published_at timestamptz,
  withdrawn_by uuid,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  check (berth_name = '' or terminal_name <> ''),
  check (
    status <> 'office_info_withdrawn'
    or nullif(btrim(withdrawal_reason), '') is not null
  )
);

create table public.pci_port_information_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  information_item_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  title text not null check (nullif(btrim(title), '') is not null),
  narrative text not null check (nullif(btrim(narrative), '') is not null),
  reference_text text,
  reference_url text,
  effective_from date,
  effective_to date,
  master_guidance text,
  superintendent_guidance text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  published_by uuid,
  published_at timestamptz,
  unique (information_item_id, revision_number),
  unique (id, company_id),
  foreign key (information_item_id, company_id)
    references public.pci_port_information_items(id, company_id) on delete cascade,
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index pci_port_information_scope_idx
on public.pci_port_information_items(company_id, port_id, status, updated_at desc);

-- Foreign-key and frequent-filter indexes. PostgreSQL does not create these
-- automatically on the referencing side.
create index pci_field_options_definition_idx
on public.pci_field_options(field_definition_id);

create index pci_port_calls_profile_idx
on public.pci_port_calls(profile_id, status, all_lines_fast_utc desc);

create index pci_port_calls_port_fk_idx
on public.pci_port_calls(port_id);

create index pci_port_calls_vessel_fk_idx
on public.pci_port_calls(vessel_id);

create index pci_call_values_definition_idx
on public.pci_call_values(field_definition_id);

create index pci_call_repeat_rows_call_idx
on public.pci_call_repeat_rows(call_id);

create index pci_call_repeat_values_call_idx
on public.pci_call_repeat_values(call_id);

create index pci_call_repeat_values_definition_idx
on public.pci_call_repeat_values(field_definition_id);

create index pci_call_section_confirmations_call_idx
on public.pci_call_section_confirmations(call_id);

create index pci_call_hazards_call_idx
on public.pci_call_hazards(call_id);

create index pci_call_amendments_call_idx
on public.pci_call_amendments(call_id, status, requested_at desc);

create index pci_call_amendment_changes_amendment_idx
on public.pci_call_amendment_changes(amendment_id);

create index pci_call_amendment_changes_definition_idx
on public.pci_call_amendment_changes(field_definition_id)
where field_definition_id is not null;

create index pci_call_attachments_amendment_idx
on public.pci_call_attachments(amendment_id)
where amendment_id is not null;

create index pci_profile_values_source_call_idx
on public.pci_profile_values(source_call_id)
where source_call_id is not null;

create index pci_profile_values_definition_idx
on public.pci_profile_values(field_definition_id);

create index pci_profile_proposals_profile_idx
on public.pci_profile_change_proposals(profile_id);

create index pci_profile_proposals_source_call_idx
on public.pci_profile_change_proposals(source_call_id);

create index pci_profile_proposals_definition_idx
on public.pci_profile_change_proposals(field_definition_id);

create index pci_profile_proposals_existing_value_idx
on public.pci_profile_change_proposals(existing_profile_value_id)
where existing_profile_value_id is not null;

create index pci_profile_history_profile_idx
on public.pci_profile_value_history(profile_id, field_definition_id, action_at desc);

create index pci_profile_history_definition_idx
on public.pci_profile_value_history(field_definition_id);

create index pci_profile_history_profile_value_idx
on public.pci_profile_value_history(profile_value_id)
where profile_value_id is not null;

create index pci_profile_history_source_call_idx
on public.pci_profile_value_history(source_call_id)
where source_call_id is not null;

create index pci_profile_history_proposal_idx
on public.pci_profile_value_history(proposal_id)
where proposal_id is not null;

create index pci_port_information_profile_idx
on public.pci_port_information_items(profile_id, status, updated_at desc)
where profile_id is not null;

create index pci_port_information_port_fk_idx
on public.pci_port_information_items(port_id);

create index pci_port_information_revisions_company_idx
on public.pci_port_information_revisions(company_id, information_item_id, revision_number desc);

-- -----------------------------------------------------------------------------
-- Seed the 143 approved retained field definitions
-- -----------------------------------------------------------------------------

with seed as (
  select *
  from jsonb_to_recordset($json$
[
  {
    "field_key": "record_control__company_identifier",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Company identifier",
    "source_name": "System design",
    "source_reference": "—",
    "retention_rule": "system_managed",
    "control_type": "Hidden/system",
    "value_type": "uuid",
    "postgres_type_hint": "uuid",
    "unit_format": "UUID",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Company ownership and access boundary.",
    "sort_order": 1,
    "is_active": true
  },
  {
    "field_key": "record_control__vessel_identifier",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Vessel identifier",
    "source_name": "System design",
    "source_reference": "—",
    "retention_rule": "retain",
    "control_type": "Vessel selector or logged-vessel context",
    "value_type": "uuid",
    "postgres_type_hint": "uuid",
    "unit_format": "UUID",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Links the call to the company vessel.",
    "sort_order": 2,
    "is_active": true
  },
  {
    "field_key": "record_control__vessel_name_snapshot",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Vessel name snapshot",
    "source_name": "CBO70",
    "source_reference": "Port Info 2: Ship Name",
    "retention_rule": "retain",
    "control_type": "Read-only snapshot",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Preserves the name displayed when the call record was created.",
    "sort_order": 3,
    "is_active": true
  },
  {
    "field_key": "record_control__port_identifier",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Port identifier",
    "source_name": "Existing MAI port registry",
    "source_reference": "mai_v_ports_list.port_id",
    "retention_rule": "retain",
    "control_type": "Searchable port dropdown",
    "value_type": "uuid",
    "postgres_type_hint": "uuid",
    "unit_format": "UUID",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "system_profile_key",
    "profile_eligible": false,
    "condition_notes": "Uses the existing port registry; no duplicate port master.",
    "sort_order": 4,
    "is_active": true
  },
  {
    "field_key": "record_control__port_name_snapshot",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Port name snapshot",
    "source_name": "CBO70 + registry",
    "source_reference": "Port Info 1: Port",
    "retention_rule": "retain",
    "control_type": "Read-only snapshot",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "system_profile_key",
    "profile_eligible": false,
    "condition_notes": "Historical label stored with the call.",
    "sort_order": 5,
    "is_active": true
  },
  {
    "field_key": "record_control__country_name_snapshot",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Country name snapshot",
    "source_name": "CBO70 + registry",
    "source_reference": "Port Info 1: Country",
    "retention_rule": "retain",
    "control_type": "Read-only snapshot",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "system_profile_key",
    "profile_eligible": false,
    "condition_notes": "Populated from the selected port.",
    "sort_order": 6,
    "is_active": true
  },
  {
    "field_key": "record_control__country_code_snapshot",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Country code snapshot",
    "source_name": "Existing MAI port registry",
    "source_reference": "mai_v_ports_list.country_code",
    "retention_rule": "retain",
    "control_type": "Read-only snapshot",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "ISO-style code",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "system_profile_key",
    "profile_eligible": false,
    "condition_notes": "Populated from the selected port.",
    "sort_order": 7,
    "is_active": true
  },
  {
    "field_key": "record_control__un_locode_snapshot",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "UN/LOCODE snapshot",
    "source_name": "Existing MAI port registry",
    "source_reference": "mai_v_ports_list.unlocode",
    "retention_rule": "retain",
    "control_type": "Read-only snapshot",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "system_profile_key",
    "profile_eligible": false,
    "condition_notes": "Shown in dropdown and retained historically when available.",
    "sort_order": 8,
    "is_active": true
  },
  {
    "field_key": "record_control__arrival_local_date_and_time_all_lines_fast",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Arrival local date and time (All Lines Fast)",
    "source_name": "User decision",
    "source_reference": "Approved call-period design",
    "retention_rule": "retain",
    "control_type": "Local datetime",
    "value_type": "local_datetime",
    "postgres_type_hint": "timestamp",
    "unit_format": "Local date/time",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Arrival is defined as the actual All Lines Fast time.",
    "sort_order": 9,
    "is_active": true
  },
  {
    "field_key": "record_control__arrival_utc_offset",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Arrival UTC offset",
    "source_name": "User decision",
    "source_reference": "Approved call-period design",
    "retention_rule": "retain",
    "control_type": "Offset selector",
    "value_type": "number",
    "postgres_type_hint": "smallint",
    "unit_format": "Minutes from UTC",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Stored with the local All Lines Fast time to make it unambiguous.",
    "sort_order": 10,
    "is_active": true
  },
  {
    "field_key": "record_control__arrival_utc_timestamp",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Arrival UTC timestamp",
    "source_name": "System design",
    "source_reference": "Derived from local All Lines Fast time and offset",
    "retention_rule": "system_managed",
    "control_type": "Read-only timestamp",
    "value_type": "utc_datetime",
    "postgres_type_hint": "timestamptz",
    "unit_format": "UTC",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Derived automatically; the Master does not enter the same event twice.",
    "sort_order": 11,
    "is_active": true
  },
  {
    "field_key": "record_control__departure_local_date_and_time_all_lines_clear",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Departure local date and time (All Lines Clear)",
    "source_name": "User decision",
    "source_reference": "Approved call-period design",
    "retention_rule": "retain",
    "control_type": "Local datetime",
    "value_type": "local_datetime",
    "postgres_type_hint": "timestamp",
    "unit_format": "Local date/time",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Departure is defined as the actual All Lines Clear time.",
    "sort_order": 12,
    "is_active": true
  },
  {
    "field_key": "record_control__departure_utc_offset",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Departure UTC offset",
    "source_name": "User decision",
    "source_reference": "Approved call-period design",
    "retention_rule": "retain",
    "control_type": "Offset selector",
    "value_type": "number",
    "postgres_type_hint": "smallint",
    "unit_format": "Minutes from UTC",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Stored with the local All Lines Clear time to make it unambiguous.",
    "sort_order": 13,
    "is_active": true
  },
  {
    "field_key": "record_control__departure_utc_timestamp",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Departure UTC timestamp",
    "source_name": "System design",
    "source_reference": "Derived from local All Lines Clear time and offset",
    "retention_rule": "system_managed",
    "control_type": "Read-only timestamp",
    "value_type": "utc_datetime",
    "postgres_type_hint": "timestamptz",
    "unit_format": "UTC",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Derived automatically; the Master does not enter the same event twice.",
    "sort_order": 14,
    "is_active": true
  },
  {
    "field_key": "record_control__call_reference",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Call reference",
    "source_name": "Proposed governance",
    "source_reference": "—",
    "retention_rule": "to_decide",
    "control_type": "Generated/read-only",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Identifier",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Useful for audit and linking attachments; format not yet approved.",
    "sort_order": 15,
    "is_active": true
  },
  {
    "field_key": "record_control__record_status",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Record status",
    "source_name": "Proposed governance",
    "source_reference": "—",
    "retention_rule": "to_decide",
    "control_type": "Status control",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Draft / Submitted / Final",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Locking and amendment rules require approval.",
    "sort_order": 16,
    "is_active": true
  },
  {
    "field_key": "record_control__completed_by",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Completed by",
    "source_name": "System design",
    "source_reference": "—",
    "retention_rule": "system_managed",
    "control_type": "Read-only user",
    "value_type": "uuid",
    "postgres_type_hint": "uuid",
    "unit_format": "UUID",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Audit identity; not free text.",
    "sort_order": 17,
    "is_active": true
  },
  {
    "field_key": "record_control__completed_at",
    "version": 1,
    "section_key": "record_control",
    "section_label": "Record control",
    "field_label": "Completed at",
    "source_name": "System design",
    "source_reference": "—",
    "retention_rule": "system_managed",
    "control_type": "Read-only timestamp",
    "value_type": "utc_datetime",
    "postgres_type_hint": "timestamptz",
    "unit_format": "UTC timestamp",
    "requirement_rule": "system",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Audit timestamp.",
    "sort_order": 18,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__terminal_name",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Terminal name",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / A1",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Terminal is call-specific and is not taken from the Mooring facility registry at this stage.",
    "sort_order": 19,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__berth_name_or_number",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Berth name or number",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / A1",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Call-specific berth.",
    "sort_order": 20,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__type_of_berth",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Type of berth",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Type of berth",
    "retention_rule": "retain",
    "control_type": "Text or controlled list",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Jetty / pontoon / buoy / other",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Final dropdown values must be approved before implementation.",
    "sort_order": 21,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__terminal_berth_latitude",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Terminal / berth latitude",
    "source_name": "CBO83",
    "source_reference": "A2",
    "retention_rule": "retain",
    "control_type": "Coordinate input",
    "value_type": "number",
    "postgres_type_hint": "numeric(9,6)",
    "unit_format": "Decimal degrees",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical position reported for this call.",
    "sort_order": 22,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__terminal_berth_longitude",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Terminal / berth longitude",
    "source_name": "CBO83",
    "source_reference": "A2",
    "retention_rule": "retain",
    "control_type": "Coordinate input",
    "value_type": "number",
    "postgres_type_hint": "numeric(9,6)",
    "unit_format": "Decimal degrees",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical position reported for this call.",
    "sort_order": 23,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__anchorage_waiting_position",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Anchorage / waiting position",
    "source_name": "CBO83",
    "source_reference": "A3",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Position / area",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Port customary anchorage experienced or confirmed.",
    "sort_order": 24,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__quarantine_notification_procedures",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Quarantine notification procedures",
    "source_name": "CBO83",
    "source_reference": "A4(a)",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Stored as information applicable at the date of call.",
    "sort_order": 25,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__customs_clearance_procedures",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Customs clearance procedures",
    "source_name": "CBO83",
    "source_reference": "A4(b)",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Stored as information applicable at the date of call.",
    "sort_order": 26,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__documents_required_before_arrival",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Documents required before arrival",
    "source_name": "CBO83",
    "source_reference": "A5(a)",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical call reference; future call must re-confirm.",
    "sort_order": 27,
    "is_active": true
  },
  {
    "field_key": "port_berth_identification__documents_required_upon_arrival",
    "version": 1,
    "section_key": "port_berth_identification",
    "section_label": "Port / berth identification",
    "field_label": "Documents required upon arrival",
    "source_name": "CBO83",
    "source_reference": "A5(b)",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical call reference; future call must re-confirm.",
    "sort_order": 28,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__distance_through_channel",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Distance through channel",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Channel details",
    "retention_rule": "retain",
    "control_type": "Numeric + unit",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "NM or user-selected unit",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Unit selection must be stored, not assumed.",
    "sort_order": 29,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__minimum_channel_approach_depth",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Minimum channel / approach depth",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / B1(a)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Controlling value should be identified in remarks when multiple legs exist.",
    "sort_order": 30,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__channel_salinity",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Channel salinity",
    "source_name": "CBO83",
    "source_reference": "B1(a)/(b)",
    "retention_rule": "retain",
    "control_type": "Numeric or text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Reported basis",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Form does not prescribe one numeric unit; do not force one without approval.",
    "sort_order": 31,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__maximum_allowed_channel_draft",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Maximum allowed channel draft",
    "source_name": "CBO83",
    "source_reference": "B1(b)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical restriction reported for the call.",
    "sort_order": 32,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__allowed_draft_basis",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Allowed draft basis",
    "source_name": "CBO83",
    "source_reference": "B1(b)",
    "retention_rule": "retain",
    "control_type": "Choice",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Static / Dynamic / Not stated",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Records the basis stated by the terminal/port.",
    "sort_order": 33,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__date_of_last_channel_depth_draft_survey",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Date of last channel depth/draft survey",
    "source_name": "CBO83",
    "source_reference": "B1(c)",
    "retention_rule": "retain",
    "control_type": "Date or reported text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Date / unknown / reported text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Source form says 'draft survey'; preserve source wording in notes.",
    "sort_order": 34,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__prevailing_currents",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Prevailing currents",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Channel details",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Observed/reported conditions.",
    "sort_order": 35,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__condition_of_buoys",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Condition of buoys",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Channel details",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Observed/reported condition at call date.",
    "sort_order": 36,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__speed_restrictions",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Speed restrictions",
    "source_name": "CBO83",
    "source_reference": "B8",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Channel/river restrictions experienced or confirmed.",
    "sort_order": 37,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__pilot_boarding_position_latitude",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Pilot boarding position latitude",
    "source_name": "CBO83",
    "source_reference": "B9",
    "retention_rule": "retain",
    "control_type": "Coordinate input",
    "value_type": "number",
    "postgres_type_hint": "numeric(9,6)",
    "unit_format": "Decimal degrees",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "May be left blank when only an area is known.",
    "sort_order": 38,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__pilot_boarding_position_longitude",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Pilot boarding position longitude",
    "source_name": "CBO83",
    "source_reference": "B9",
    "retention_rule": "retain",
    "control_type": "Coordinate input",
    "value_type": "number",
    "postgres_type_hint": "numeric(9,6)",
    "unit_format": "Decimal degrees",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "May be left blank when only an area is known.",
    "sort_order": 39,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__pilot_boarding_position_area_description",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Pilot boarding position / area description",
    "source_name": "CBO83",
    "source_reference": "B9",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Supports cases where coordinates are not available.",
    "sort_order": 40,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__pilot_information",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Pilot information",
    "source_name": "CBO70",
    "source_reference": "Port Info 2: Pilot Information",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Practical pilotage information from the completed call.",
    "sort_order": 41,
    "is_active": true
  },
  {
    "field_key": "navigation_channel__other_important_channel_information",
    "version": 1,
    "section_key": "navigation_channel",
    "section_label": "Navigation / channel",
    "field_label": "Other important channel information",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Channel details",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Free text for material information not covered above.",
    "sort_order": 42,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__dock_water_density",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Dock water density",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Details",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(7,4)",
    "unit_format": "t/m³",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Value as measured/reported for the call.",
    "sort_order": 43,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__berth_water_salinity",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Berth water salinity",
    "source_name": "CBO83",
    "source_reference": "B2(a)",
    "retention_rule": "retain",
    "control_type": "Numeric or text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Reported basis",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Form does not prescribe one numeric unit.",
    "sort_order": 44,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__minimum_depth_alongside",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Minimum depth alongside",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / B2(a)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Reported/observed depth at berth.",
    "sort_order": 45,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__maximum_draft_permitted_at_berth",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Maximum draft permitted at berth",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / B2(b)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical restriction for the call.",
    "sort_order": 46,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__date_of_last_berth_depth_draft_survey",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Date of last berth depth/draft survey",
    "source_name": "CBO83",
    "source_reference": "B2(c)",
    "retention_rule": "retain",
    "control_type": "Date or reported text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Date / unknown / reported text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Source form says 'draft survey'; preserve source wording in notes.",
    "sort_order": 47,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__maximum_air_draught_permitted",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Maximum air draught permitted",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / B3",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable where an air-draft restriction exists.",
    "sort_order": 48,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__maximum_loa_permitted",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Maximum LOA permitted",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Restrictions",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical restriction.",
    "sort_order": 49,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__maximum_beam_permitted",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Maximum beam permitted",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Restrictions",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical restriction.",
    "sort_order": 50,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__displacement_restriction",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Displacement restriction",
    "source_name": "CBO83",
    "source_reference": "B4",
    "retention_rule": "retain",
    "control_type": "Numeric + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "t / reported basis",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Keep reported condition and qualifiers.",
    "sort_order": 51,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__deadweight_restriction",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Deadweight restriction",
    "source_name": "CBO83",
    "source_reference": "B5",
    "retention_rule": "retain",
    "control_type": "Numeric + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "t / reported basis",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Keep reported condition and qualifiers.",
    "sort_order": 52,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__freeboard_restriction",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Freeboard restriction",
    "source_name": "CBO83",
    "source_reference": "B6",
    "retention_rule": "retain",
    "control_type": "Numeric + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "m / reported basis",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Keep reported condition and qualifiers.",
    "sort_order": 53,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__minimum_permitted_ukc",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Minimum permitted UKC",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Restrictions",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Required minimum as reported; not invented by the application.",
    "sort_order": 54,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__minimum_permissible_manifold_height",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Minimum permissible manifold height",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Restrictions",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical terminal limit.",
    "sort_order": 55,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__maximum_permissible_manifold_height",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Maximum permissible manifold height",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Restrictions",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical terminal limit.",
    "sort_order": 56,
    "is_active": true
  },
  {
    "field_key": "berth_restrictions__other_cargo_handling_safe_mooring_restrictions",
    "version": 1,
    "section_key": "berth_restrictions",
    "section_label": "Berth restrictions",
    "field_label": "Other cargo-handling / safe-mooring restrictions",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Berth Restrictions",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Call-specific restrictions.",
    "sort_order": 57,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__port_entry_date_and_time_utc",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Port-entry date and time UTC",
    "source_name": "User decision",
    "source_reference": "Approved UKC design",
    "retention_rule": "retain",
    "control_type": "UTC datetime",
    "value_type": "utc_datetime",
    "postgres_type_hint": "timestamptz",
    "unit_format": "UTC",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Actual entry time used for historical UKC review.",
    "sort_order": 58,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__port_entry_local_date_and_time",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Port-entry local date and time",
    "source_name": "User decision",
    "source_reference": "Approved UKC design",
    "retention_rule": "retain",
    "control_type": "Local datetime",
    "value_type": "local_datetime",
    "postgres_type_hint": "timestamp",
    "unit_format": "Local time",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Stored together with the reported UTC offset.",
    "sort_order": 59,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__port_entry_utc_offset",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Port-entry UTC offset",
    "source_name": "User decision",
    "source_reference": "Approved UKC design",
    "retention_rule": "retain",
    "control_type": "Offset selector",
    "value_type": "number",
    "postgres_type_hint": "smallint",
    "unit_format": "Minutes from UTC",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Makes the local-time value unambiguous.",
    "sort_order": 60,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__arrival_draught_forward",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Arrival draught forward",
    "source_name": "User decision + CBO70",
    "source_reference": "Approved UKC design / Sounding remarks",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Actual arrival draught.",
    "sort_order": 61,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__arrival_draught_aft",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Arrival draught aft",
    "source_name": "User decision + CBO70",
    "source_reference": "Approved UKC design / Sounding remarks",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Actual arrival draught.",
    "sort_order": 62,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__controlling_depth_used",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Controlling depth used",
    "source_name": "User decision + CBO70/CBO83",
    "source_reference": "Approved UKC design / B1",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Input selected by the Master; application must not guess the controlling location.",
    "sort_order": 63,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__tide_height_at_entry",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Tide height at entry",
    "source_name": "User decision + CBO83",
    "source_reference": "Approved UKC design / B7",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Input tied to the approved entry time.",
    "sort_order": 64,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__ukc_calculation_method",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "UKC calculation method",
    "source_name": "User decision",
    "source_reference": "Approved UKC design",
    "retention_rule": "retain",
    "control_type": "Choice",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Static / Dynamic / Recorded only",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Method must be stated; dynamic criteria are not yet defined.",
    "sort_order": 65,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__ukc_result",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "UKC result",
    "source_name": "User decision",
    "source_reference": "Approved UKC design",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Store the recorded/calculated result together with its inputs.",
    "sort_order": 66,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__ukc_calculation_assessment_notes",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "UKC calculation / assessment notes",
    "source_name": "User decision",
    "source_reference": "Approved UKC design",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "For squat, density, heel, wave response, survey uncertainty or company allowances when applicable; no criteria are assumed.",
    "sort_order": 67,
    "is_active": true
  },
  {
    "field_key": "ukc_at_port_entry__tide_table_attachment",
    "version": 1,
    "section_key": "ukc_at_port_entry",
    "section_label": "UKC at port entry",
    "field_label": "Tide-table attachment",
    "source_name": "CBO83 + user decision",
    "source_reference": "B7",
    "retention_rule": "retain_as_reference",
    "control_type": "File attachment",
    "value_type": "attachment",
    "postgres_type_hint": "child record",
    "unit_format": "PDF / image / document",
    "requirement_rule": "conditional",
    "repeating_group_key": "attachments",
    "storage_target": "attachment",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Reference covering the dates of the call and tied to the entry time.",
    "sort_order": 68,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__general_fender_information",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "General fender information",
    "source_name": "CBO70",
    "source_reference": "Port Info 2: Fenders Information",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Practical condition and arrangement information.",
    "sort_order": 69,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__shore_mooring_arrangement",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Shore mooring arrangement",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 2 / C1",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Number and position of lines may be included.",
    "sort_order": 70,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__side_alongside",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Side alongside",
    "source_name": "CBO70",
    "source_reference": "Port Info 2 / Sounding remarks",
    "retention_rule": "retain",
    "control_type": "Choice",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Port / Starboard / Other",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Final choices require approval.",
    "sort_order": 71,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__mooring_configuration",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Mooring configuration",
    "source_name": "CBO70",
    "source_reference": "Port Info 2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Call-specific arrangement.",
    "sort_order": 72,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__restriction_on_use_of_mooring_wires",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Restriction on use of mooring wires",
    "source_name": "CBO83",
    "source_reference": "C2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical shore restriction.",
    "sort_order": 73,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__quick_release_hooks_fitted",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Quick-release hooks fitted",
    "source_name": "CBO83",
    "source_reference": "C3",
    "retention_rule": "retain",
    "control_type": "Yes / No / Unknown + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Choice + text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Unknown must remain distinct from No.",
    "sort_order": 74,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__number_and_type_of_mooring_fenders",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Number and type of mooring fenders",
    "source_name": "CBO83",
    "source_reference": "C4",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Do not force one fender taxonomy yet.",
    "sort_order": 75,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__forward_fender_distance_from_centre_manifold",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Forward fender distance from centre manifold",
    "source_name": "CBO83",
    "source_reference": "C5",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Separate forward value.",
    "sort_order": 76,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__aft_fender_distance_from_centre_manifold",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Aft fender distance from centre manifold",
    "source_name": "CBO83",
    "source_reference": "C5",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Separate aft value.",
    "sort_order": 77,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__number_of_tugs_used",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Number of tugs used",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 2 / C6",
    "retention_rule": "retain",
    "control_type": "Whole number",
    "value_type": "number",
    "postgres_type_hint": "smallint",
    "unit_format": "Count",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Actual number used during this call.",
    "sort_order": 78,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__tug_details_name_bollard_pull_horsepower",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Tug details: name, bollard pull, horsepower",
    "source_name": "CBO83",
    "source_reference": "C7",
    "retention_rule": "retain",
    "control_type": "Repeating rows",
    "value_type": "repeat",
    "postgres_type_hint": "child record",
    "unit_format": "Name / t / HP or kW",
    "requirement_rule": "optional",
    "repeating_group_key": "tugs",
    "storage_target": "repeat_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "One row per tug; unit must be stored.",
    "sort_order": 79,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__ship_s_lines_or_tug_lines_used",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Ship's lines or tug lines used",
    "source_name": "CBO83",
    "source_reference": "C8",
    "retention_rule": "retain",
    "control_type": "Choice + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Actual arrangement.",
    "sort_order": 80,
    "is_active": true
  },
  {
    "field_key": "mooring_fenders__tug_configuration_positioning",
    "version": 1,
    "section_key": "mooring_fenders",
    "section_label": "Mooring / fenders",
    "field_label": "Tug configuration / positioning",
    "source_name": "CBO70",
    "source_reference": "Port Info 2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Configuration is separate from tug count.",
    "sort_order": 81,
    "is_active": true
  },
  {
    "field_key": "berthing_limits__maximum_wind_for_berthing",
    "version": 1,
    "section_key": "berthing_limits",
    "section_label": "Berthing limits",
    "field_label": "Maximum wind for berthing",
    "source_name": "CBO83",
    "source_reference": "D1",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,2)",
    "unit_format": "kn",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical limit reported/experienced.",
    "sort_order": 82,
    "is_active": true
  },
  {
    "field_key": "berthing_limits__maximum_wave_height_for_berthing",
    "version": 1,
    "section_key": "berthing_limits",
    "section_label": "Berthing limits",
    "field_label": "Maximum wave height for berthing",
    "source_name": "CBO83",
    "source_reference": "D2",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,2)",
    "unit_format": "m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical limit reported/experienced.",
    "sort_order": 83,
    "is_active": true
  },
  {
    "field_key": "berthing_limits__minimum_visibility_for_berthing",
    "version": 1,
    "section_key": "berthing_limits",
    "section_label": "Berthing limits",
    "field_label": "Minimum visibility for berthing",
    "source_name": "CBO83",
    "source_reference": "D3",
    "retention_rule": "retain",
    "control_type": "Numeric + unit",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "NM or m",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Unit is stored explicitly.",
    "sort_order": 84,
    "is_active": true
  },
  {
    "field_key": "berthing_limits__daylight_restriction",
    "version": 1,
    "section_key": "berthing_limits",
    "section_label": "Berthing limits",
    "field_label": "Daylight restriction",
    "source_name": "CBO83",
    "source_reference": "D4",
    "retention_rule": "retain",
    "control_type": "Yes / No / Unknown + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Choice + text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Unknown must remain distinct from No.",
    "sort_order": 85,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__maximum_tank_o2_content",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Maximum tank O₂ content",
    "source_name": "CBO83",
    "source_reference": "E1(a)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(6,3)",
    "unit_format": "% vol",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical port/terminal requirement.",
    "sort_order": 86,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__maximum_h2s_in_cargo_tanks",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Maximum H₂S in cargo tanks",
    "source_name": "CBO83",
    "source_reference": "E1(b)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(12,3)",
    "unit_format": "ppm",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical port/terminal requirement.",
    "sort_order": 87,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__maximum_mercaptan_in_cargo_tanks",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Maximum mercaptan in cargo tanks",
    "source_name": "CBO83",
    "source_reference": "E1(c)",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(12,3)",
    "unit_format": "ppm",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical port/terminal requirement.",
    "sort_order": 88,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__other_local_safety_requirements",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Other local safety requirements",
    "source_name": "CBO83",
    "source_reference": "E2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable at call date.",
    "sort_order": 89,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__local_health_requirements",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Local health requirements",
    "source_name": "CBO83",
    "source_reference": "E3",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable at call date.",
    "sort_order": 90,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__local_environmental_requirements",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Local environmental requirements",
    "source_name": "CBO83",
    "source_reference": "E4",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable at call date.",
    "sort_order": 91,
    "is_active": true
  },
  {
    "field_key": "hse_requirements__other_port_terminal_requirements",
    "version": 1,
    "section_key": "hse_requirements",
    "section_label": "HSE requirements",
    "field_label": "Other port / terminal requirements",
    "source_name": "CBO83",
    "source_reference": "E5",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable at call date.",
    "sort_order": 92,
    "is_active": true
  },
  {
    "field_key": "access_to_ship__gangway_source",
    "version": 1,
    "section_key": "access_to_ship",
    "section_label": "Access to ship",
    "field_label": "Gangway source",
    "source_name": "CBO83",
    "source_reference": "F1",
    "retention_rule": "retain",
    "control_type": "Choice",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Ship / Shore / Other",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Final choices require approval.",
    "sort_order": 93,
    "is_active": true
  },
  {
    "field_key": "access_to_ship__gangway_position",
    "version": 1,
    "section_key": "access_to_ship",
    "section_label": "Access to ship",
    "field_label": "Gangway position",
    "source_name": "CBO83",
    "source_reference": "F2",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable where a portable gangway is used.",
    "sort_order": 94,
    "is_active": true
  },
  {
    "field_key": "access_to_ship__gangway_distance_from_centre_manifold",
    "version": 1,
    "section_key": "access_to_ship",
    "section_label": "Access to ship",
    "field_label": "Gangway distance from centre manifold",
    "source_name": "CBO83",
    "source_reference": "F2",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Applicable to the reported arrangement.",
    "sort_order": 95,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__type_of_cargo_operation",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Type of cargo operation",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Cargo Details",
    "retention_rule": "retain",
    "control_type": "Choice + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Loading / Discharging / Other",
    "requirement_rule": "core",
    "repeating_group_key": null,
    "storage_target": "call_header",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Final choices require approval.",
    "sort_order": 96,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__manifold_connection",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Manifold connection",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Cargo Details",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Size / arrangement",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Record actual connection used.",
    "sort_order": 97,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__cargo_type_grade",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Cargo type / grade",
    "source_name": "CBO70",
    "source_reference": "Port Info 1: Cargo Details",
    "retention_rule": "retain",
    "control_type": "Repeating rows",
    "value_type": "repeat",
    "postgres_type_hint": "child record",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": "cargo_grades",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Supports multiple grades.",
    "sort_order": 98,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__shore_cargo_nomination_quantity",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Shore cargo nomination quantity",
    "source_name": "CBO83 + user decision",
    "source_reference": "G1",
    "retention_rule": "retain_as_reference",
    "control_type": "Numeric",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(16,3)",
    "unit_format": "Bbl or MT",
    "requirement_rule": "conditional",
    "repeating_group_key": "cargo_grades",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Reference quantity; unit stored explicitly.",
    "sort_order": 99,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__cargo_api",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Cargo API",
    "source_name": "CBO83 + user decision",
    "source_reference": "G2",
    "retention_rule": "retain_as_reference",
    "control_type": "Numeric",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(8,3)",
    "unit_format": "°API",
    "requirement_rule": "conditional",
    "repeating_group_key": "cargo_grades",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Reference value for loading calls.",
    "sort_order": 100,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__loading_temperature",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Loading temperature",
    "source_name": "CBO83 + user decision",
    "source_reference": "G2",
    "retention_rule": "retain_as_reference",
    "control_type": "Numeric",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(8,3)",
    "unit_format": "°C or °F",
    "requirement_rule": "conditional",
    "repeating_group_key": "cargo_grades",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Unit stored explicitly.",
    "sort_order": 101,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__loading_discharging_sequence_of_grades",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Loading / discharging sequence of grades",
    "source_name": "CBO83 + user decision",
    "source_reference": "G3",
    "retention_rule": "retain_as_reference",
    "control_type": "Ordered repeating rows / notes",
    "value_type": "repeat",
    "postgres_type_hint": "child record",
    "unit_format": "Sequence order",
    "requirement_rule": "conditional",
    "repeating_group_key": "cargo_grades",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Keep actual or agreed call sequence as historical reference.",
    "sort_order": 102,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__number_of_shore_loading_arms_connected",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Number of shore loading arms connected",
    "source_name": "CBO83",
    "source_reference": "G4",
    "retention_rule": "retain",
    "control_type": "Whole number",
    "value_type": "number",
    "postgres_type_hint": "smallint",
    "unit_format": "Count",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Actual number used.",
    "sort_order": 103,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__shore_loading_arm_size",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Shore loading-arm size",
    "source_name": "CBO83",
    "source_reference": "G4",
    "retention_rule": "retain",
    "control_type": "Numeric + unit",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "in or mm",
    "requirement_rule": "optional",
    "repeating_group_key": "loading_arms",
    "storage_target": "repeat_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "One row per differing arm size where necessary.",
    "sort_order": 104,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__maximum_loading_discharging_rate",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Maximum loading / discharging rate",
    "source_name": "CBO70 + CBO83",
    "source_reference": "Port Info 1 / G5",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(14,3)",
    "unit_format": "m³/h",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical maximum reported/achieved; exact meaning should be labelled in UI.",
    "sort_order": 105,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__shore_vapour_return_line_available",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Shore vapour-return line available",
    "source_name": "CBO83",
    "source_reference": "G6",
    "retention_rule": "retain",
    "control_type": "Yes / No / Unknown",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Choice",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Separate availability from actual use.",
    "sort_order": 106,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__shore_vapour_return_line_used",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Shore vapour-return line used",
    "source_name": "CBO83",
    "source_reference": "G6",
    "retention_rule": "retain",
    "control_type": "Yes / No / Unknown",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Choice",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Actual use during the call.",
    "sort_order": 107,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__maximum_permitted_discharge_pressure",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Maximum permitted discharge pressure",
    "source_name": "CBO83",
    "source_reference": "G7",
    "retention_rule": "retain",
    "control_type": "Numeric + unit",
    "value_type": "number",
    "postgres_type_hint": "numeric(12,3)",
    "unit_format": "bar / kg·cm⁻² / other",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Discharging calls only; unit stored.",
    "sort_order": 108,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__distance_to_shore_tanks",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Distance to shore tanks",
    "source_name": "CBO83",
    "source_reference": "G8",
    "retention_rule": "retain",
    "control_type": "Numeric + unit",
    "value_type": "number",
    "postgres_type_hint": "numeric(14,3)",
    "unit_format": "m / km",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Discharging calls only.",
    "sort_order": 109,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__height_of_shore_tanks_above_sea_level",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Height of shore tanks above sea level",
    "source_name": "CBO83",
    "source_reference": "G9",
    "retention_rule": "retain",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Discharging calls only.",
    "sort_order": 110,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__shore_booster_pump_used",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Shore booster pump used",
    "source_name": "CBO83",
    "source_reference": "G10",
    "retention_rule": "retain",
    "control_type": "Yes / No / Unknown + notes",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Choice + text",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Discharging calls only.",
    "sort_order": 111,
    "is_active": true
  },
  {
    "field_key": "cargo_transfer__cargo_nomination_attachment",
    "version": 1,
    "section_key": "cargo_transfer",
    "section_label": "Cargo / transfer",
    "field_label": "Cargo nomination attachment",
    "source_name": "User decision",
    "source_reference": "Approved reference requirement",
    "retention_rule": "retain_as_reference",
    "control_type": "File attachment",
    "value_type": "attachment",
    "postgres_type_hint": "child record",
    "unit_format": "PDF / document / image",
    "requirement_rule": "conditional",
    "repeating_group_key": "attachments",
    "storage_target": "attachment",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Reference only; may accompany the structured nomination data.",
    "sort_order": 112,
    "is_active": true
  },
  {
    "field_key": "security__security_level_experienced_during_call",
    "version": 1,
    "section_key": "security",
    "section_label": "Security",
    "field_label": "Security level experienced during call",
    "source_name": "CBO83",
    "source_reference": "H1",
    "retention_rule": "retain",
    "control_type": "Choice",
    "value_type": "number",
    "postgres_type_hint": "smallint",
    "unit_format": "1 / 2 / 3",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Historical only; must never be presented as the current port security level.",
    "sort_order": 113,
    "is_active": true
  },
  {
    "field_key": "security__pfso_name",
    "version": 1,
    "section_key": "security",
    "section_label": "Security",
    "field_label": "PFSO name",
    "source_name": "CBO83",
    "source_reference": "H2",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Stored with call date because contacts can change.",
    "sort_order": 114,
    "is_active": true
  },
  {
    "field_key": "security__pfso_contact_details",
    "version": 1,
    "section_key": "security",
    "section_label": "Security",
    "field_label": "PFSO contact details",
    "source_name": "CBO83",
    "source_reference": "H2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Stored with call date because contacts can change.",
    "sort_order": 115,
    "is_active": true
  },
  {
    "field_key": "security__port_authority_security_contacts",
    "version": 1,
    "section_key": "security",
    "section_label": "Security",
    "field_label": "Port-authority security contacts",
    "source_name": "CBO83",
    "source_reference": "H3",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical contact reference.",
    "sort_order": 116,
    "is_active": true
  },
  {
    "field_key": "agent_communications__person_in_charge",
    "version": 1,
    "section_key": "agent_communications",
    "section_label": "Agent / communications",
    "field_label": "Person in charge",
    "source_name": "CBO83",
    "source_reference": "I1",
    "retention_rule": "retain",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical contact reference.",
    "sort_order": 118,
    "is_active": true
  },
  {
    "field_key": "agent_communications__pic_office_aoh_communications",
    "version": 1,
    "section_key": "agent_communications",
    "section_label": "Agent / communications",
    "field_label": "PIC / office / AOH communications",
    "source_name": "CBO83",
    "source_reference": "I2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Preserve source label; clarify AOH expansion later if needed.",
    "sort_order": 119,
    "is_active": true
  },
  {
    "field_key": "agent_communications__emergency_communications",
    "version": 1,
    "section_key": "agent_communications",
    "section_label": "Agent / communications",
    "field_label": "Emergency communications",
    "source_name": "CBO83",
    "source_reference": "I3",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Historical call reference.",
    "sort_order": 120,
    "is_active": true
  },
  {
    "field_key": "general_information__authorities_information",
    "version": 1,
    "section_key": "general_information",
    "section_label": "General information",
    "field_label": "Authorities information",
    "source_name": "CBO70",
    "source_reference": "Port Info 2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Authorities encountered during the call.",
    "sort_order": 121,
    "is_active": true
  },
  {
    "field_key": "general_information__other_general_information",
    "version": 1,
    "section_key": "general_information",
    "section_label": "General information",
    "field_label": "Other general information",
    "source_name": "CBO70",
    "source_reference": "Port Info 2",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "optional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Material information not covered by structured fields.",
    "sort_order": 122,
    "is_active": true
  },
  {
    "field_key": "general_information__port_chart_jetty_area_photos",
    "version": 1,
    "section_key": "general_information",
    "section_label": "General information",
    "field_label": "Port / chart / jetty / area photos",
    "source_name": "CBO70",
    "source_reference": "Port Info 2",
    "retention_rule": "retain",
    "control_type": "Multiple image attachments",
    "value_type": "attachment",
    "postgres_type_hint": "child record",
    "unit_format": "Image + caption",
    "requirement_rule": "optional",
    "repeating_group_key": "attachments",
    "storage_target": "attachment",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Photos belong to the historical call and need captions/categories.",
    "sort_order": 123,
    "is_active": true
  },
  {
    "field_key": "risk_assessment_support__hazard_category",
    "version": 1,
    "section_key": "risk_assessment_support",
    "section_label": "Risk-assessment support",
    "field_label": "Hazard category",
    "source_name": "User decision",
    "source_reference": "Approved hazard-flags design",
    "retention_rule": "retain",
    "control_type": "Editable multi-select / repeating rows",
    "value_type": "repeat",
    "postgres_type_hint": "child record",
    "unit_format": "Navigation/UKC / pilotage / weather / mooring / cargo / security / environmental / other",
    "requirement_rule": "optional",
    "repeating_group_key": "hazards",
    "storage_target": "hazard",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Categories remain editable. No numerical or Low/Medium/High risk score is calculated.",
    "sort_order": 124,
    "is_active": true
  },
  {
    "field_key": "risk_assessment_support__hazard_narrative",
    "version": 1,
    "section_key": "risk_assessment_support",
    "section_label": "Risk-assessment support",
    "field_label": "Hazard narrative",
    "source_name": "User decision",
    "source_reference": "Approved hazard-flags design",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "repeat",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "conditional",
    "repeating_group_key": "hazards",
    "storage_target": "hazard",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Required for each selected hazard flag; retains vessel and call provenance.",
    "sort_order": 125,
    "is_active": true
  },
  {
    "field_key": "risk_assessment_support__precautions_and_lessons_learned",
    "version": 1,
    "section_key": "risk_assessment_support",
    "section_label": "Risk-assessment support",
    "field_label": "Precautions and lessons learned",
    "source_name": "User decision",
    "source_reference": "Approved hazard-flags design",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "repeat",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "conditional",
    "repeating_group_key": "hazards",
    "storage_target": "hazard",
    "profile_treatment": "profile_candidate",
    "profile_eligible": true,
    "condition_notes": "Practical input for future port-call planning and the vessel's separate formal risk assessment.",
    "sort_order": 126,
    "is_active": true
  },
  {
    "field_key": "section_completion__major_section_identifier",
    "version": 1,
    "section_key": "section_completion",
    "section_label": "Section completion",
    "field_label": "Major section identifier",
    "source_name": "User decision",
    "source_reference": "Approved completeness design",
    "retention_rule": "system_managed",
    "control_type": "Read-only section key",
    "value_type": "repeat",
    "postgres_type_hint": "text",
    "unit_format": "Controlled key",
    "requirement_rule": "system",
    "repeating_group_key": "section_confirmations",
    "storage_target": "section_confirmation",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "One confirmation record is maintained for every major post-call section.",
    "sort_order": 127,
    "is_active": true
  },
  {
    "field_key": "section_completion__section_completion_status",
    "version": 1,
    "section_key": "section_completion",
    "section_label": "Section completion",
    "field_label": "Section completion status",
    "source_name": "User decision",
    "source_reference": "Approved completeness design",
    "retention_rule": "retain",
    "control_type": "Choice",
    "value_type": "repeat",
    "postgres_type_hint": "text",
    "unit_format": "Completed / Not available / Not applicable",
    "requirement_rule": "core",
    "repeating_group_key": "section_confirmations",
    "storage_target": "section_confirmation",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Every major section must have one of the approved states before submission.",
    "sort_order": 128,
    "is_active": true
  },
  {
    "field_key": "section_completion__section_completion_remarks",
    "version": 1,
    "section_key": "section_completion",
    "section_label": "Section completion",
    "field_label": "Section completion remarks",
    "source_name": "User decision",
    "source_reference": "Approved completeness design",
    "retention_rule": "retain",
    "control_type": "Long text",
    "value_type": "repeat",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "conditional",
    "repeating_group_key": "section_confirmations",
    "storage_target": "section_confirmation",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Required explanation when information is marked Not available; optional context for Not applicable.",
    "sort_order": 129,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__sounding_exercise_completed",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Sounding exercise completed",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Yes / No",
    "value_type": "boolean",
    "postgres_type_hint": "boolean",
    "unit_format": "Boolean",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Only in emergency or doubt regarding reliability of berth-depth data.",
    "sort_order": 130,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__sounding_date",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Sounding date",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Date",
    "value_type": "date",
    "postgres_type_hint": "date",
    "unit_format": "yyyy-mm-dd",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Separate from normal call date.",
    "sort_order": 131,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__sounding_time_utc",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Sounding time UTC",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Time",
    "value_type": "time",
    "postgres_type_hint": "time",
    "unit_format": "UTC",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Source form specifies UTC.",
    "sort_order": 132,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__sounding_point_number",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Sounding point number",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: points 1–25",
    "retention_rule": "conditional",
    "control_type": "Repeating rows",
    "value_type": "repeat",
    "postgres_type_hint": "child record",
    "unit_format": "1–25",
    "requirement_rule": "conditional",
    "repeating_group_key": "soundings",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "One row per sounding point.",
    "sort_order": 133,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__sounding_measured",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Sounding measured",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Numeric",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": "soundings",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Measured sounding.",
    "sort_order": 134,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__height_of_tide_at_sounding",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Height of tide at sounding",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Numeric",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": "soundings",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Tide height used for the point.",
    "sort_order": 135,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__depth_alongside_derived_recorded",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Depth alongside derived/recorded",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Numeric",
    "value_type": "repeat",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": "soundings",
    "storage_target": "repeat_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Preserve recorded value; calculation rule to be confirmed before automation.",
    "sort_order": 136,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__nature_of_bottom",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Nature of bottom",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Sounding context.",
    "sort_order": 137,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__tide_information_source",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Tide information / source",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Text",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Text",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Source form contains 'Height of Tide'; retain supporting note/source.",
    "sort_order": 138,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__list_if_any",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "List, if any",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Numeric + direction",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Degrees / side",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Preserve actual observation.",
    "sort_order": 139,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__trim",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Trim",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Numeric + direction",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "m / by bow or stern",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Preserve actual observation.",
    "sort_order": 140,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__forward_draught_at_sounding",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Forward draught at sounding",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "May differ from port-entry draught.",
    "sort_order": 141,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__aft_draught_at_sounding",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Aft draught at sounding",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Numeric",
    "value_type": "number",
    "postgres_type_hint": "numeric(10,3)",
    "unit_format": "m",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "May differ from port-entry draught.",
    "sort_order": 142,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__side_alongside_during_sounding",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Side alongside during sounding",
    "source_name": "CBO70",
    "source_reference": "Port Info 3: Remarks",
    "retention_rule": "conditional",
    "control_type": "Choice",
    "value_type": "text",
    "postgres_type_hint": "text",
    "unit_format": "Port / Starboard / Other",
    "requirement_rule": "conditional",
    "repeating_group_key": null,
    "storage_target": "call_value",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "Sounding context.",
    "sort_order": 143,
    "is_active": true
  },
  {
    "field_key": "conditional_sounding__sounding_remarks_diagram_attachment",
    "version": 1,
    "section_key": "conditional_sounding",
    "section_label": "Conditional sounding",
    "field_label": "Sounding remarks / diagram attachment",
    "source_name": "CBO70",
    "source_reference": "Port Info 3",
    "retention_rule": "conditional",
    "control_type": "Long text + attachment",
    "value_type": "attachment",
    "postgres_type_hint": "text + child record",
    "unit_format": "Text / file",
    "requirement_rule": "conditional",
    "repeating_group_key": "attachments",
    "storage_target": "attachment",
    "profile_treatment": "call_history_only",
    "profile_eligible": false,
    "condition_notes": "The diagram is evidence for exceptional use, not a mandatory page.",
    "sort_order": 144,
    "is_active": true
  }
]
$json$::jsonb) as x(
    field_key text,
    version integer,
    section_key text,
    section_label text,
    field_label text,
    source_name text,
    source_reference text,
    retention_rule text,
    control_type text,
    value_type text,
    postgres_type_hint text,
    unit_format text,
    requirement_rule text,
    repeating_group_key text,
    storage_target text,
    profile_treatment text,
    profile_eligible boolean,
    condition_notes text,
    sort_order integer,
    is_active boolean
  )
)
insert into public.pci_field_definitions (
  field_key,
  version,
  section_key,
  section_label,
  field_label,
  source_name,
  source_reference,
  retention_rule,
  control_type,
  value_type,
  postgres_type_hint,
  unit_format,
  requirement_rule,
  repeating_group_key,
  storage_target,
  profile_treatment,
  profile_eligible,
  condition_notes,
  sort_order,
  is_active
)
select
  field_key,
  version,
  section_key,
  section_label,
  field_label,
  source_name,
  source_reference,
  retention_rule,
  control_type,
  value_type,
  postgres_type_hint,
  unit_format,
  requirement_rule,
  repeating_group_key,
  storage_target,
  profile_treatment,
  profile_eligible,
  condition_notes,
  sort_order,
  is_active
from seed
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

insert into public.pci_field_options (
  field_definition_id,
  option_key,
  option_label,
  sort_order
)
select fd.id, o.option_key, o.option_label, o.sort_order
from public.pci_field_definitions fd
join (
  values
    ('section_completion__section_completion_status', 'completed', 'Completed', 10),
    ('section_completion__section_completion_status', 'not_available', 'Not available', 20),
    ('section_completion__section_completion_status', 'not_applicable', 'Not applicable', 30)
) as o(field_key, option_key, option_label, sort_order)
  on o.field_key = fd.field_key
 and fd.version = 1
on conflict (field_definition_id, option_key) do nothing;

-- -----------------------------------------------------------------------------
-- Authorization helpers that depend on PCI tables
-- -----------------------------------------------------------------------------

create or replace function pci_private.call_can_view(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.pci_port_calls c
    where c.id = p_call_id
      and pci_private.can_view_company(c.company_id)
      and (
        pci_private.is_office_user(c.company_id)
        or c.status = 'finalised'
        or (
          c.created_by = auth.uid()
          and pci_private.is_master(c.company_id, c.vessel_id)
        )
      )
  );
$function$;

create or replace function pci_private.call_is_master_draft(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.pci_port_calls c
    where c.id = p_call_id
      and c.status = 'draft'
      and c.created_by = auth.uid()
      and pci_private.is_master(c.company_id, c.vessel_id)
  );
$function$;

create or replace function pci_private.amendment_can_edit(p_amendment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.pci_call_amendments a
    join public.pci_port_calls c on c.id = a.call_id
    where a.id = p_amendment_id
      and a.status = 'amendment_draft'
      and c.status = 'finalised'
      and (
        pci_private.is_office_user(a.company_id)
        or (
          a.requested_by = auth.uid()
          and c.vessel_id = (
            select p.vessel_id from public.profiles p where p.id = auth.uid()
          )
          and pci_private.is_master(a.company_id, c.vessel_id)
        )
      )
  );
$function$;

create or replace function pci_private.attachment_can_edit(
  p_call_id uuid,
  p_amendment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select case
    when p_amendment_id is null
      then pci_private.call_is_master_draft(p_call_id)
    else pci_private.amendment_can_edit(p_amendment_id)
  end;
$function$;

create or replace function pci_private.authorized_ports()
returns table (
  port_id uuid,
  company_id uuid,
  country_code text,
  country_name text,
  unlocode text,
  port_name text,
  port_name_local text,
  latitude numeric,
  longitude numeric,
  sort_order numeric
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    p.id,
    p.company_id,
    p.country_code,
    p.country_name,
    p.unlocode,
    p.port_name,
    p.port_name_local,
    p.latitude,
    p.longitude,
    p.sort_order
  from public.mai_ports p
  where p.is_active = true
    and pci_private.has_permission('view')
    and (
      coalesce(public.current_app_role_text(), '') in ('super_admin', 'platform_owner')
      or (
        pci_private.module_enabled(public.current_profile_company_id())
        and (
          p.company_id is null
          or p.company_id = public.current_profile_company_id()
        )
      )
    );
$function$;

create or replace function pci_private.can_upload_storage_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_parts text[];
  v_company_id uuid;
  v_call_id uuid;
  v_amendment_id uuid;
  v_call public.pci_port_calls%rowtype;
begin
  v_parts := string_to_array(coalesce(p_name, ''), '/');
  if array_length(v_parts, 1) < 5 then
    return false;
  end if;

  begin
    v_company_id := v_parts[1]::uuid;
    v_call_id := v_parts[2]::uuid;
  exception when others then
    return false;
  end;

  select * into v_call
  from public.pci_port_calls c
  where c.id = v_call_id
    and c.company_id = v_company_id;

  if not found then
    return false;
  end if;

  if v_parts[3] = 'draft' then
    return pci_private.call_is_master_draft(v_call_id);
  end if;

  begin
    v_amendment_id := v_parts[3]::uuid;
  exception when others then
    return false;
  end;

  return exists (
    select 1
    from public.pci_call_amendments a
    where a.id = v_amendment_id
      and a.company_id = v_company_id
      and a.call_id = v_call_id
      and pci_private.amendment_can_edit(a.id)
  );
end;
$function$;

create or replace function pci_private.can_select_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.pci_call_attachments a
    where a.object_path = p_name
      and pci_private.call_can_view(a.call_id)
  );
$function$;

create or replace function pci_private.can_delete_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.pci_call_attachments a
    where a.object_path = p_name
      and pci_private.attachment_can_edit(a.call_id, a.amendment_id)
  );
$function$;

-- -----------------------------------------------------------------------------
-- Data-integrity and audit triggers
-- -----------------------------------------------------------------------------

create or replace function pci_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_call_draft_child()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_call_company uuid;
begin
  select c.company_id into v_call_company
  from public.pci_port_calls c
  where c.id = new.call_id;

  if v_call_company is distinct from new.company_id then
    raise exception 'Draft detail company does not match its vessel call.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  elsif new.id <> old.id
        or new.company_id <> old.company_id
        or new.call_id <> old.call_id
        or new.created_by <> old.created_by
        or new.created_at <> old.created_at then
    raise exception 'Draft detail identity and creation evidence are immutable.';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_section_confirmation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_call_company uuid;
begin
  select c.company_id into v_call_company
  from public.pci_port_calls c
  where c.id = new.call_id;

  if v_call_company is distinct from new.company_id then
    raise exception 'Section confirmation company does not match its vessel call.';
  end if;

  if tg_op = 'UPDATE' and (
    new.id <> old.id
    or new.company_id <> old.company_id
    or new.call_id <> old.call_id
    or new.section_key <> old.section_key
  ) then
    raise exception 'Section confirmation identity is immutable.';
  end if;

  if not exists (
    select 1
    from public.pci_field_definitions fd
    where fd.version = 1
      and fd.is_active = true
      and fd.section_key = new.section_key
      and fd.section_key not in ('record_control', 'section_completion')
  ) then
    raise exception 'Section confirmation key is not an active major section.';
  end if;

  new.confirmed_by := auth.uid();
  new.confirmed_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_amendment_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_amendment_company uuid;
begin
  select a.company_id into v_amendment_company
  from public.pci_call_amendments a
  where a.id = new.amendment_id;

  if v_amendment_company is distinct from new.company_id then
    raise exception 'Amendment change company does not match its amendment.';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  elsif new.id <> old.id
        or new.company_id <> old.company_id
        or new.amendment_id <> old.amendment_id
        or new.created_by <> old.created_by
        or new.created_at <> old.created_at then
    raise exception 'Amendment change identity and creation evidence are immutable.';
  end if;

  return new;
end;
$function$;

create or replace function pci_private.guard_port_call()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_is_master boolean;
  v_is_office boolean;
  v_missing_sections integer;
  v_vessel public.vessels%rowtype;
  v_port public.mai_ports%rowtype;
  v_profile public.pci_port_profiles%rowtype;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'UPDATE'
       and (
         new.port_id <> old.port_id
         or new.profile_id <> old.profile_id
       )
       and not (
         old.status = 'draft'
         and new.status = 'draft'
       ) then
      raise exception 'Port, terminal or berth scope may be changed only while the call remains a Draft.';
    end if;

    select * into v_vessel
    from public.vessels v
    where v.id = new.vessel_id
      and v.company_id = new.company_id
      and v.is_active = true;

    if not found then
      raise exception 'The vessel is not active within the call company.';
    end if;

    select * into v_port
    from public.mai_ports p
    where p.id = new.port_id
      and p.is_active = true
      and (p.company_id is null or p.company_id = new.company_id);

    if not found then
      raise exception 'The selected port is not available to the call company.';
    end if;

    select * into v_profile
    from public.pci_port_profiles pp
    where pp.id = new.profile_id
      and pp.company_id = new.company_id
      and pp.port_id = new.port_id;

    if not found then
      raise exception 'The call profile does not match the company and port.';
    end if;

    new.vessel_name_snapshot := v_vessel.name;
    new.port_name_snapshot := v_port.port_name;
    new.country_name_snapshot := v_port.country_name;
    new.country_code_snapshot := v_port.country_code;
    new.unlocode_snapshot := v_port.unlocode;
    new.terminal_name_snapshot := v_profile.terminal_name;
    new.berth_name_snapshot := v_profile.berth_name;

    if new.all_lines_fast_local is not null
       and new.all_lines_fast_utc_offset_minutes is not null then
      new.all_lines_fast_utc := (
        new.all_lines_fast_local - make_interval(mins => new.all_lines_fast_utc_offset_minutes)
      ) at time zone 'UTC';
    elsif new.all_lines_fast_local is null
          and new.all_lines_fast_utc_offset_minutes is null then
      new.all_lines_fast_utc := null;
    end if;

    if new.all_lines_clear_local is not null
       and new.all_lines_clear_utc_offset_minutes is not null then
      new.all_lines_clear_utc := (
        new.all_lines_clear_local - make_interval(mins => new.all_lines_clear_utc_offset_minutes)
      ) at time zone 'UTC';
    elsif new.all_lines_clear_local is null
          and new.all_lines_clear_utc_offset_minutes is null then
      new.all_lines_clear_utc := null;
    end if;

    if new.port_entry_local is not null
       and new.port_entry_utc_offset_minutes is not null then
      new.port_entry_utc := (
        new.port_entry_local - make_interval(mins => new.port_entry_utc_offset_minutes)
      ) at time zone 'UTC';
    elsif new.port_entry_local is null
          and new.port_entry_utc_offset_minutes is null then
      new.port_entry_utc := null;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.call_reference := 'PCI-' || to_char(current_date, 'YYYY') || '-' ||
      upper(substr(replace(new.id::text, '-', ''), 1, 10));
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft'
       or old.created_by <> auth.uid()
       or not pci_private.is_master(old.company_id, old.vessel_id) then
      raise exception 'Only the creating Master may delete an own Draft call.';
    end if;
    if exists (
      select 1 from public.pci_call_attachments a where a.call_id = old.id
    ) then
      raise exception 'Remove Draft attachments through Storage before deleting the call.';
    end if;
    return old;
  end if;

  if new.id <> old.id
     or new.company_id <> old.company_id
     or new.vessel_id <> old.vessel_id
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at
     or new.call_reference <> old.call_reference then
    raise exception 'Immutable Port Call Intelligence call identity cannot be changed.';
  end if;

  v_is_master := pci_private.is_master(old.company_id, old.vessel_id)
    and old.created_by = auth.uid();
  v_is_office := pci_private.is_office_user(old.company_id);

  if v_is_master then
    if old.status = 'draft' and new.status in ('draft', 'submitted') then
      null;
    elsif old.status = 'submitted'
          and new.status = 'draft'
          and old.review_started_at is null then
      null;
    else
      raise exception 'The Master cannot perform this call-state transition.';
    end if;

    if new.status = 'submitted' and old.status = 'draft' then
      if new.all_lines_fast_utc is null
         or new.all_lines_clear_utc is null
         or new.port_entry_utc is null
         or new.arrival_draught_forward is null
         or new.arrival_draught_aft is null
         or nullif(btrim(new.terminal_name_snapshot), '') is null
         or nullif(btrim(new.berth_name_snapshot), '') is null
         or nullif(btrim(new.cargo_operation_type), '') is null
         or new.master_completion_confirmed is not true then
        raise exception 'Core call information is incomplete.';
      end if;

      select count(*) into v_missing_sections
      from (
        select distinct fd.section_key
        from public.pci_field_definitions fd
        where fd.version = 1
          and fd.is_active = true
          and fd.section_key not in ('record_control', 'section_completion')
        except
        select sc.section_key
        from public.pci_call_section_confirmations sc
        where sc.call_id = new.id
      ) missing;

      if v_missing_sections > 0 then
        raise exception 'Every major section must be confirmed before submission.';
      end if;

      new.submitted_by := auth.uid();
      new.submitted_at := now();
    end if;
  elsif v_is_office then
    if (
      to_jsonb(new) - array[
        'status', 'updated_by', 'updated_at', 'review_started_by',
        'review_started_at', 'returned_by', 'returned_at', 'return_reason',
        'finalised_by', 'finalised_at'
      ]
    ) <> (
      to_jsonb(old) - array[
        'status', 'updated_by', 'updated_at', 'review_started_by',
        'review_started_at', 'returned_by', 'returned_at', 'return_reason',
        'finalised_by', 'finalised_at'
      ]
    ) then
      raise exception 'Office review cannot silently edit submitted call evidence.';
    end if;

    if old.status = 'submitted' and new.status = 'under_review' then
      new.review_started_by := auth.uid();
      new.review_started_at := now();
    elsif old.status in ('submitted', 'under_review') and new.status = 'draft' then
      if nullif(btrim(new.return_reason), '') is null then
        raise exception 'A return reason is required.';
      end if;
      new.returned_by := auth.uid();
      new.returned_at := now();
    elsif old.status = 'under_review' and new.status = 'finalised' then
      new.finalised_by := auth.uid();
      new.finalised_at := now();
    else
      raise exception 'Office call-state transition is not permitted.';
    end if;
  else
    raise exception 'Not authorised to update this call.';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.check_attachment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_total bigint;
  v_call_company uuid;
  v_amendment_call uuid;
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    new.uploaded_at := now();
    new.locked_at := null;
  end if;

  select c.company_id into v_call_company
  from public.pci_port_calls c
  where c.id = new.call_id;

  if v_call_company is distinct from new.company_id then
    raise exception 'Attachment company does not match the call.';
  end if;

  if new.amendment_id is not null then
    select a.call_id into v_amendment_call
    from public.pci_call_amendments a
    where a.id = new.amendment_id
      and a.company_id = new.company_id;
    if v_amendment_call is distinct from new.call_id then
      raise exception 'Attachment amendment does not belong to this call.';
    end if;
  end if;

  if tg_op = 'UPDATE' and (
    new.company_id <> old.company_id
    or new.call_id <> old.call_id
    or new.amendment_id is distinct from old.amendment_id
    or new.storage_bucket <> old.storage_bucket
    or new.object_path <> old.object_path
    or new.original_file_name <> old.original_file_name
    or new.mime_type <> old.mime_type
    or new.size_bytes <> old.size_bytes
    or new.sha256_hex is distinct from old.sha256_hex
    or new.uploaded_by <> old.uploaded_by
    or new.uploaded_at <> old.uploaded_at
  ) then
    raise exception 'Attachment identity and file evidence are immutable.';
  end if;

  if tg_op = 'UPDATE'
     and new.locked_at is distinct from old.locked_at
     and not exists (
       select 1
       from public.pci_port_calls c
       where c.id = new.call_id
         and c.status = 'finalised'
     ) then
    raise exception 'Only finalisation may lock a call attachment.';
  end if;

  if new.amendment_id is null
     and new.object_path not like new.company_id::text || '/' || new.call_id::text || '/draft/%' then
    raise exception 'Draft attachment path must use company_id/call_id/draft/.';
  elsif new.amendment_id is not null
     and new.object_path not like new.company_id::text || '/' || new.call_id::text || '/' || new.amendment_id::text || '/%' then
    raise exception 'Amendment attachment path must include the amendment id.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.call_id::text, 0));

  select coalesce(sum(a.size_bytes), 0) into v_total
  from public.pci_call_attachments a
  where a.call_id = new.call_id
    and a.id <> new.id;

  if v_total + new.size_bytes > 104857600 then
    raise exception 'Combined attachment limit is 100 MB per call.';
  end if;

  return new;
end;
$function$;

create or replace function pci_private.guard_port_profile()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_port public.mai_ports%rowtype;
begin
  select * into v_port
  from public.mai_ports p
  where p.id = new.port_id
    and p.is_active = true
    and (p.company_id is null or p.company_id = new.company_id);

  if not found then
    raise exception 'The selected port is not available to the profile company.';
  end if;

  new.terminal_name := btrim(new.terminal_name);
  new.berth_name := btrim(new.berth_name);
  new.port_name_snapshot := v_port.port_name;
  new.country_name_snapshot := v_port.country_name;
  new.country_code_snapshot := v_port.country_code;
  new.unlocode_snapshot := v_port.unlocode;
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_amendment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_call public.pci_port_calls%rowtype;
  v_is_master boolean;
  v_is_office boolean;
begin
  select * into v_call
  from public.pci_port_calls c
  where c.id = coalesce(new.call_id, old.call_id);

  if not found or v_call.status <> 'finalised' then
    raise exception 'Controlled amendments require a finalised vessel call.';
  end if;

  if tg_op = 'INSERT' then
    if new.company_id <> v_call.company_id then
      raise exception 'Amendment company does not match the vessel call.';
    end if;
    if pci_private.is_office_user(new.company_id) then
      new.request_origin := 'office';
    elsif pci_private.is_master(new.company_id, v_call.vessel_id) then
      new.request_origin := 'master';
    else
      raise exception 'Not authorised to create this controlled amendment.';
    end if;
    new.requested_by := auth.uid();
    new.requested_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.id <> old.id
     or new.company_id <> old.company_id
     or new.call_id <> old.call_id
     or new.request_origin <> old.request_origin
     or new.requested_by <> old.requested_by
     or new.requested_at <> old.requested_at then
    raise exception 'Amendment identity and requester evidence are immutable.';
  end if;

  v_is_master := old.requested_by = auth.uid()
    and pci_private.is_master(old.company_id, v_call.vessel_id);
  v_is_office := pci_private.is_office_user(old.company_id);

  if v_is_master then
    if old.status <> 'amendment_draft'
       or new.status not in ('amendment_draft', 'amendment_submitted') then
      raise exception 'The Master may edit or submit only an amendment Draft.';
    end if;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.decision_reason := null;
    new.applied_by := null;
    new.applied_at := null;
  elsif v_is_office then
    if old.status not in ('amendment_draft', 'amendment_submitted')
       or new.status not in ('amendment_rejected', 'amendment_applied') then
      raise exception 'Office amendment transition is not permitted.';
    end if;
    if nullif(btrim(new.decision_reason), '') is null then
      raise exception 'An amendment decision reason is required.';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    if new.status = 'amendment_applied' then
      new.applied_by := auth.uid();
      new.applied_at := now();
    else
      new.applied_by := null;
      new.applied_at := null;
    end if;
  else
    raise exception 'Not authorised to update this amendment.';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_profile_proposal()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1
      from public.pci_port_profiles pp
      where pp.id = new.profile_id
        and pp.company_id = new.company_id
    ) then
      raise exception 'Profile proposal company does not match the profile.';
    end if;

    if not exists (
      select 1
      from public.pci_port_calls c
      where c.id = new.source_call_id
        and c.company_id = new.company_id
        and c.profile_id = new.profile_id
        and c.status in ('submitted', 'under_review', 'finalised')
    ) then
      raise exception 'Profile proposal source must be a submitted call for the same profile.';
    end if;

    if not exists (
      select 1
      from public.pci_field_definitions fd
      where fd.id = new.field_definition_id
        and fd.profile_eligible = true
        and fd.is_active = true
    ) then
      raise exception 'Profile proposal field is not an active profile candidate.';
    end if;

    if new.existing_profile_value_id is not null and not exists (
      select 1
      from public.pci_profile_values pv
      where pv.id = new.existing_profile_value_id
        and pv.company_id = new.company_id
        and pv.profile_id = new.profile_id
        and pv.field_definition_id = new.field_definition_id
    ) then
      raise exception 'Existing approved profile value does not match the proposal.';
    end if;

    new.status := 'pending';
    new.created_at := now();
    new.decided_by := null;
    new.decided_at := null;
    new.decision_reason := null;
    return new;
  end if;

  if (
    to_jsonb(new) - array['status', 'decided_by', 'decided_at', 'decision_reason']
  ) <> (
    to_jsonb(old) - array['status', 'decided_by', 'decided_at', 'decision_reason']
  ) then
    raise exception 'Source and proposed profile evidence are immutable.';
  end if;

  if old.status not in ('pending', 'clarification_requested')
     or new.status not in (
       'accepted', 'rejected', 'kept_existing',
       'condition_dependent', 'clarification_requested'
     ) then
    raise exception 'Profile proposal decision transition is not permitted.';
  end if;

  if new.status <> 'clarification_requested'
     and nullif(btrim(new.decision_reason), '') is null then
    raise exception 'A profile decision reason is required.';
  end if;

  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end;
$function$;

create or replace function pci_private.prepare_profile_value()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'UPDATE' and (
    new.id <> old.id
    or new.company_id <> old.company_id
    or new.profile_id <> old.profile_id
    or new.field_definition_id <> old.field_definition_id
    or new.condition_label <> old.condition_label
  ) then
    raise exception 'Profile value identity is immutable; create a separate condition-dependent value.';
  end if;

  if not exists (
    select 1
    from public.pci_port_profiles pp
    where pp.id = new.profile_id
      and pp.company_id = new.company_id
  ) then
    raise exception 'Profile value company does not match the profile.';
  end if;

  if not exists (
    select 1
    from public.pci_field_definitions fd
    where fd.id = new.field_definition_id
      and fd.profile_eligible = true
      and fd.is_active = true
  ) then
    raise exception 'Only active profile-candidate fields may be approved as profile values.';
  end if;

  if new.source_call_id is not null and not exists (
    select 1
    from public.pci_port_calls c
    where c.id = new.source_call_id
      and c.company_id = new.company_id
      and c.profile_id = new.profile_id
      and c.status = 'finalised'
  ) then
    raise exception 'Approved profile source must be a finalised call for the same profile.';
  end if;

  new.approved_by := auth.uid();
  new.approved_at := now();
  new.version := case when tg_op = 'UPDATE' then old.version + 1 else 1 end;
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_office_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'INSERT' then
    if not pci_private.is_office_user(new.company_id) then
      raise exception 'Only an authorised office user may create office port information.';
    end if;
    if not exists (
      select 1
      from public.mai_ports p
      where p.id = new.port_id
        and p.is_active = true
        and (p.company_id is null or p.company_id = new.company_id)
    ) then
      raise exception 'The selected port is not available to the office-information company.';
    end if;
    if new.profile_id is not null and not exists (
      select 1
      from public.pci_port_profiles pp
      where pp.id = new.profile_id
        and pp.company_id = new.company_id
        and pp.port_id = new.port_id
    ) then
      raise exception 'Office-information profile does not match its company and port.';
    end if;
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'office_info_draft' or not pci_private.is_office_user(old.company_id) then
      raise exception 'Only office-information Drafts may be deleted.';
    end if;
    return old;
  end if;

  if new.id <> old.id
     or new.company_id <> old.company_id
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Office-information identity and creation evidence are immutable.';
  end if;

  if (
    new.port_id <> old.port_id
    or new.profile_id is distinct from old.profile_id
    or new.terminal_name <> old.terminal_name
    or new.berth_name <> old.berth_name
    or new.category_key <> old.category_key
  ) and not (
    old.status = 'office_info_draft'
    and new.status = 'office_info_draft'
  ) then
    raise exception 'Published office-information scope is immutable.';
  end if;

  if not exists (
    select 1
    from public.mai_ports p
    where p.id = new.port_id
      and p.is_active = true
      and (p.company_id is null or p.company_id = new.company_id)
  ) then
    raise exception 'The selected port is not available to the office-information company.';
  end if;

  if new.profile_id is not null and not exists (
    select 1
    from public.pci_port_profiles pp
    where pp.id = new.profile_id
      and pp.company_id = new.company_id
      and pp.port_id = new.port_id
  ) then
    raise exception 'Office-information profile does not match its company and port.';
  end if;

  if old.status = 'office_info_draft'
     and new.status in ('office_info_draft', 'office_info_published') then
    null;
  elsif old.status = 'office_info_published'
        and new.status in ('office_info_published', 'office_info_withdrawn') then
    null;
  else
    raise exception 'Office-information state transition is not permitted.';
  end if;

  if new.status = 'office_info_published' then
    if new.current_revision_number is null then
      raise exception 'A published office-information item requires a current revision.';
    end if;
    if not exists (
      select 1
      from public.pci_port_information_revisions r
      where r.information_item_id = new.id
        and r.company_id = new.company_id
        and r.revision_number = new.current_revision_number
        and r.published_by is not null
        and r.published_at is not null
    ) then
      raise exception 'The selected office-information revision has not been published.';
    end if;
    new.published_by := auth.uid();
    new.published_at := now();
  end if;

  if new.status = 'office_info_withdrawn' then
    if nullif(btrim(new.withdrawal_reason), '') is null then
      raise exception 'A withdrawal reason is required.';
    end if;
    new.withdrawn_by := auth.uid();
    new.withdrawn_at := now();
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function pci_private.guard_office_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_company_id uuid;
  v_item_status text;
  v_expected_revision integer;
begin
  if tg_op = 'DELETE' then
    if old.published_by is not null or old.published_at is not null then
      raise exception 'Only an unpublished office-information revision may be deleted.';
    end if;
    return old;
  end if;

  select i.company_id, i.status into v_company_id, v_item_status
  from public.pci_port_information_items i
  where i.id = new.information_item_id;

  if not found then
    raise exception 'Office-information item does not exist.';
  end if;

  if v_company_id is distinct from new.company_id then
    raise exception 'Office-information revision company does not match its item.';
  end if;

  if v_item_status = 'office_info_withdrawn' then
    raise exception 'A withdrawn office-information item cannot receive revisions.';
  end if;

  if tg_op = 'INSERT' then
    select coalesce(max(r.revision_number), 0) + 1 into v_expected_revision
    from public.pci_port_information_revisions r
    where r.information_item_id = new.information_item_id;

    if new.revision_number <> v_expected_revision then
      raise exception 'Office-information revision numbers must be sequential.';
    end if;

    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.id <> old.id
       or new.company_id <> old.company_id
       or new.information_item_id <> old.information_item_id
       or new.revision_number <> old.revision_number
       or new.created_by <> old.created_by
       or new.created_at <> old.created_at then
      raise exception 'Office-information revision identity and creation evidence are immutable.';
    end if;

    if old.published_by is not null or old.published_at is not null then
      raise exception 'Published office-information revisions are immutable.';
    end if;
  end if;

  if new.published_at is not null or new.published_by is not null then
    new.published_by := auth.uid();
    new.published_at := now();
  else
    new.published_by := null;
    new.published_at := null;
  end if;
  return new;
end;
$function$;

create or replace function pci_private.write_audit_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_company_id uuid;
  v_entity_id uuid;
  v_event_type text;
  v_username text;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_company_id := coalesce((v_new ->> 'company_id')::uuid, (v_old ->> 'company_id')::uuid);
  v_entity_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  if tg_op = 'UPDATE' and coalesce(v_new ->> 'status', '') <> coalesce(v_old ->> 'status', '') then
    v_event_type := 'status_' || coalesce(v_new ->> 'status', 'unknown');
  elsif tg_op = 'DELETE' then
    v_event_type := 'deleted';
  else
    v_event_type := lower(tg_op);
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = auth.uid();

  insert into public.pci_audit_events (
    company_id,
    entity_type,
    entity_id,
    event_type,
    actor_id,
    actor_username_snapshot,
    old_state,
    new_state
  ) values (
    v_company_id,
    tg_table_name,
    v_entity_id,
    v_event_type,
    auth.uid(),
    v_username,
    v_old,
    v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create or replace function pci_private.profile_value_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  insert into public.pci_profile_value_history (
    company_id,
    profile_id,
    profile_value_id,
    field_definition_id,
    condition_label,
    action,
    previous_value_jsonb,
    new_value_jsonb,
    source_call_id,
    action_by,
    action_at
  ) values (
    new.company_id,
    new.profile_id,
    new.id,
    new.field_definition_id,
    new.condition_label,
    case when tg_op = 'INSERT' then 'created' else 'revised' end,
    case when tg_op = 'UPDATE' then old.value_jsonb else null end,
    new.value_jsonb,
    new.source_call_id,
    new.approved_by,
    new.approved_at
  );
  return new;
end;
$function$;

create or replace function pci_private.lock_call_attachments()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if old.status <> 'finalised' and new.status = 'finalised' then
    update public.pci_call_attachments
    set locked_at = coalesce(locked_at, now())
    where call_id = new.id
      and amendment_id is null;
  end if;
  return new;
end;
$function$;

create or replace function pci_private.enqueue_profile_proposals()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if old.status <> 'submitted' and new.status = 'submitted' then
    with reported as (
      select
        cv.field_definition_id,
        cv.value_jsonb,
        cv.display_value,
        cv.unit_key
      from public.pci_call_values cv
      join public.pci_field_definitions fd
        on fd.id = cv.field_definition_id
       and fd.profile_eligible = true
       and fd.is_active = true
      where cv.call_id = new.id

      union all

      select
        fd.id,
        to_jsonb(new.terminal_name_snapshot),
        new.terminal_name_snapshot,
        null::text
      from public.pci_field_definitions fd
      where fd.field_key = 'port_berth_identification__terminal_name'
        and fd.version = 1
        and fd.profile_eligible = true

      union all

      select
        fd.id,
        to_jsonb(new.berth_name_snapshot),
        new.berth_name_snapshot,
        null::text
      from public.pci_field_definitions fd
      where fd.field_key = 'port_berth_identification__berth_name_or_number'
        and fd.version = 1
        and fd.profile_eligible = true

      union all

      select
        rv.field_definition_id,
        jsonb_agg(
          jsonb_build_object(
            'row_number', rr.row_number,
            'row_label', rr.row_label,
            'value', rv.value_jsonb,
            'display_value', rv.display_value,
            'unit_key', rv.unit_key
          ) order by rr.row_number, rv.id
        ),
        count(*)::text || ' reported value(s)',
        null::text
      from public.pci_call_repeat_values rv
      join public.pci_call_repeat_rows rr
        on rr.id = rv.repeat_row_id
       and rr.company_id = rv.company_id
      join public.pci_field_definitions fd
        on fd.id = rv.field_definition_id
       and fd.profile_eligible = true
       and fd.is_active = true
      where rv.call_id = new.id
      group by rv.field_definition_id

      union all

      select
        fd.id,
        jsonb_agg(
          jsonb_build_object(
            'attachment_id', a.id,
            'category_key', a.category_key,
            'description', a.description,
            'file_name', a.original_file_name,
            'mime_type', a.mime_type
          ) order by a.uploaded_at, a.id
        ),
        count(*)::text || ' photograph(s) or document(s)',
        null::text
      from public.pci_call_attachments a
      join public.pci_field_definitions fd
        on fd.field_key = 'general_information__port_chart_jetty_area_photos'
       and fd.version = 1
       and fd.profile_eligible = true
      where a.call_id = new.id
        and a.amendment_id is null
      group by fd.id

      union all

      select
        fd.id,
        jsonb_agg(
          jsonb_build_object(
            'hazard_id', h.id,
            'category_key', h.category_key,
            'category_label', h.category_label
          ) order by h.created_at, h.id
        ),
        count(*)::text || ' hazard category flag(s)',
        null::text
      from public.pci_call_hazards h
      join public.pci_field_definitions fd
        on fd.field_key = 'risk_assessment_support__hazard_category'
       and fd.version = 1
       and fd.profile_eligible = true
      where h.call_id = new.id
      group by fd.id

      union all

      select
        fd.id,
        jsonb_agg(
          jsonb_build_object(
            'hazard_id', h.id,
            'category_key', h.category_key,
            'narrative', h.hazard_narrative
          ) order by h.created_at, h.id
        ),
        count(*)::text || ' hazard narrative(s)',
        null::text
      from public.pci_call_hazards h
      join public.pci_field_definitions fd
        on fd.field_key = 'risk_assessment_support__hazard_narrative'
       and fd.version = 1
       and fd.profile_eligible = true
      where h.call_id = new.id
      group by fd.id

      union all

      select
        fd.id,
        jsonb_agg(
          jsonb_build_object(
            'hazard_id', h.id,
            'category_key', h.category_key,
            'precautions_lessons', h.precautions_lessons
          ) order by h.created_at, h.id
        ),
        count(*)::text || ' precaution/lesson entry or entries',
        null::text
      from public.pci_call_hazards h
      join public.pci_field_definitions fd
        on fd.field_key = 'risk_assessment_support__precautions_and_lessons_learned'
       and fd.version = 1
       and fd.profile_eligible = true
      where h.call_id = new.id
      group by fd.id
    )
    insert into public.pci_profile_change_proposals (
      company_id,
      profile_id,
      source_call_id,
      field_definition_id,
      existing_profile_value_id,
      proposed_condition_label,
      proposed_value_jsonb,
      proposed_display_value,
      proposed_unit_key
    )
    select
      new.company_id,
      new.profile_id,
      new.id,
      r.field_definition_id,
      pv.id,
      '',
      r.value_jsonb,
      r.display_value,
      r.unit_key
    from reported r
    left join public.pci_profile_values pv
      on pv.profile_id = new.profile_id
     and pv.field_definition_id = r.field_definition_id
     and pv.condition_label = ''
    where pv.id is null
       or pv.value_jsonb is distinct from r.value_jsonb
       or pv.display_value is distinct from r.display_value
       or pv.unit_key is distinct from r.unit_key
    on conflict (source_call_id, field_definition_id, proposed_condition_label)
    do nothing;
  end if;

  return new;
end;
$function$;

create or replace function pci_private.decide_profile_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_reason text,
  p_condition_label text default null
)
returns public.pci_profile_change_proposals
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_proposal public.pci_profile_change_proposals%rowtype;
  v_condition_label text;
begin
  select * into v_proposal
  from public.pci_profile_change_proposals p
  where p.id = p_proposal_id
  for update;

  if not found or not pci_private.is_office_user(v_proposal.company_id) then
    raise exception 'Profile proposal is unavailable or access is denied.';
  end if;

  if v_proposal.status not in ('pending', 'clarification_requested') then
    raise exception 'This profile proposal has already been decided.';
  end if;

  if p_decision not in (
    'accepted', 'rejected', 'kept_existing',
    'condition_dependent', 'clarification_requested'
  ) then
    raise exception 'Invalid profile proposal decision.';
  end if;

  if p_decision <> 'clarification_requested'
     and nullif(btrim(p_reason), '') is null then
    raise exception 'A profile decision reason is required.';
  end if;

  if p_decision in ('accepted', 'condition_dependent') then
    if not exists (
      select 1
      from public.pci_port_calls c
      where c.id = v_proposal.source_call_id
        and c.status = 'finalised'
    ) then
      raise exception 'The source call must be finalised before its information can update the approved profile.';
    end if;

    v_condition_label := case
      when p_decision = 'condition_dependent'
        then nullif(btrim(p_condition_label), '')
      else v_proposal.proposed_condition_label
    end;

    if v_condition_label is null then
      raise exception 'A condition label is required when retaining both values.';
    end if;

    insert into public.pci_profile_values (
      company_id,
      profile_id,
      field_definition_id,
      condition_label,
      value_jsonb,
      display_value,
      unit_key,
      source_call_id,
      approved_by
    ) values (
      v_proposal.company_id,
      v_proposal.profile_id,
      v_proposal.field_definition_id,
      v_condition_label,
      v_proposal.proposed_value_jsonb,
      v_proposal.proposed_display_value,
      v_proposal.proposed_unit_key,
      v_proposal.source_call_id,
      auth.uid()
    )
    on conflict (profile_id, field_definition_id, condition_label) do update
    set value_jsonb = excluded.value_jsonb,
        display_value = excluded.display_value,
        unit_key = excluded.unit_key,
        source_call_id = excluded.source_call_id,
        approved_by = auth.uid();
  end if;

  update public.pci_profile_change_proposals
  set status = p_decision,
      decision_reason = p_reason
  where id = v_proposal.id
  returning * into v_proposal;

  return v_proposal;
end;
$function$;

create or replace function public.pci_decide_profile_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_reason text,
  p_condition_label text default null
)
returns public.pci_profile_change_proposals
language sql
volatile
security invoker
set search_path = pg_catalog, public
as $function$
  select * from pci_private.decide_profile_proposal(
    p_proposal_id,
    p_decision,
    p_reason,
    p_condition_label
  );
$function$;

create trigger pci_port_profiles_guard
before insert on public.pci_port_profiles
for each row execute function pci_private.guard_port_profile();

create trigger pci_port_calls_guard
before insert or update or delete on public.pci_port_calls
for each row execute function pci_private.guard_port_call();

create trigger pci_port_calls_lock_attachments
after update of status on public.pci_port_calls
for each row execute function pci_private.lock_call_attachments();

create trigger pci_port_calls_enqueue_profile_proposals
after update of status on public.pci_port_calls
for each row execute function pci_private.enqueue_profile_proposals();

create trigger pci_call_attachments_check
before insert or update on public.pci_call_attachments
for each row execute function pci_private.check_attachment();

create trigger pci_call_values_guard
before insert or update on public.pci_call_values
for each row execute function pci_private.guard_call_draft_child();

create trigger pci_call_repeat_rows_guard
before insert or update on public.pci_call_repeat_rows
for each row execute function pci_private.guard_call_draft_child();

create trigger pci_call_repeat_values_guard
before insert or update on public.pci_call_repeat_values
for each row execute function pci_private.guard_call_draft_child();

create trigger pci_call_hazards_guard
before insert or update on public.pci_call_hazards
for each row execute function pci_private.guard_call_draft_child();

create trigger pci_call_section_confirmations_guard
before insert or update on public.pci_call_section_confirmations
for each row execute function pci_private.guard_section_confirmation();

create trigger pci_call_amendment_changes_guard
before insert or update on public.pci_call_amendment_changes
for each row execute function pci_private.guard_amendment_change();

create trigger pci_profile_values_history
after insert or update on public.pci_profile_values
for each row execute function pci_private.profile_value_history();

create trigger pci_call_amendments_guard
before insert or update on public.pci_call_amendments
for each row execute function pci_private.guard_amendment();

create trigger pci_profile_change_proposals_guard
before insert or update on public.pci_profile_change_proposals
for each row execute function pci_private.guard_profile_proposal();

create trigger pci_profile_values_prepare
before insert or update on public.pci_profile_values
for each row execute function pci_private.prepare_profile_value();

create trigger pci_port_information_items_guard
before insert or update or delete on public.pci_port_information_items
for each row execute function pci_private.guard_office_item();

create trigger pci_port_information_revisions_guard
before insert or update or delete on public.pci_port_information_revisions
for each row execute function pci_private.guard_office_revision();

create trigger pci_port_calls_audit
after insert or update or delete on public.pci_port_calls
for each row execute function pci_private.write_audit_event();

create trigger pci_call_amendments_audit
after insert or update or delete on public.pci_call_amendments
for each row execute function pci_private.write_audit_event();

create trigger pci_profile_change_proposals_audit
after insert or update or delete on public.pci_profile_change_proposals
for each row execute function pci_private.write_audit_event();

create trigger pci_profile_values_audit
after insert or update on public.pci_profile_values
for each row execute function pci_private.write_audit_event();

create trigger pci_port_information_items_audit
after insert or update or delete on public.pci_port_information_items
for each row execute function pci_private.write_audit_event();

create trigger pci_port_information_revisions_audit
after insert or update or delete on public.pci_port_information_revisions
for each row execute function pci_private.write_audit_event();

create trigger pci_field_definitions_touch
before update on public.pci_field_definitions
for each row execute function pci_private.touch_updated_at();

create trigger pci_field_options_touch
before update on public.pci_field_options
for each row execute function pci_private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Security-invoker consultation views
-- -----------------------------------------------------------------------------

create or replace view public.pci_v_ports_list
with (security_invoker = true)
as
select * from pci_private.authorized_ports();

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
  c.finalised_at
from public.pci_port_calls c
where c.status = 'finalised';

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'pci_field_definitions',
    'pci_field_options',
    'pci_port_profiles',
    'pci_port_calls',
    'pci_call_values',
    'pci_call_repeat_rows',
    'pci_call_repeat_values',
    'pci_call_section_confirmations',
    'pci_call_hazards',
    'pci_call_amendments',
    'pci_call_amendment_changes',
    'pci_call_attachments',
    'pci_profile_values',
    'pci_profile_change_proposals',
    'pci_profile_value_history',
    'pci_audit_events',
    'pci_port_information_items',
    'pci_port_information_revisions'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end;
$block$;

create policy pci_field_definitions_select
on public.pci_field_definitions for select to authenticated
using (
  pci_private.has_permission('view')
  and pci_private.module_enabled(public.current_profile_company_id())
);

create policy pci_field_options_select
on public.pci_field_options for select to authenticated
using (
  pci_private.has_permission('view')
  and pci_private.module_enabled(public.current_profile_company_id())
);

create policy pci_port_profiles_select
on public.pci_port_profiles for select to authenticated
using (pci_private.can_view_company(company_id));

create policy pci_port_profiles_insert
on public.pci_port_profiles for insert to authenticated
with check (
  pci_private.is_office_user(company_id)
  or pci_private.is_master(company_id, null)
);

create policy pci_port_calls_select
on public.pci_port_calls for select to authenticated
using (pci_private.call_can_view(id));

create policy pci_port_calls_insert
on public.pci_port_calls for insert to authenticated
with check (
  status = 'draft'
  and created_by = auth.uid()
  and pci_private.is_master(company_id, vessel_id)
);

create policy pci_port_calls_update
on public.pci_port_calls for update to authenticated
using (
  pci_private.is_office_user(company_id)
  or (
    created_by = auth.uid()
    and pci_private.is_master(company_id, vessel_id)
    and status in ('draft', 'submitted')
  )
)
with check (
  pci_private.is_office_user(company_id)
  or (
    created_by = auth.uid()
    and pci_private.is_master(company_id, vessel_id)
    and status in ('draft', 'submitted')
  )
);

create policy pci_port_calls_delete
on public.pci_port_calls for delete to authenticated
using (
  status = 'draft'
  and created_by = auth.uid()
  and pci_private.is_master(company_id, vessel_id)
);

do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'pci_call_values',
    'pci_call_repeat_rows',
    'pci_call_repeat_values',
    'pci_call_section_confirmations',
    'pci_call_hazards'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (pci_private.call_can_view(call_id))',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (company_id = public.current_profile_company_id() and pci_private.call_is_master_draft(call_id))',
      v_table || '_insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (pci_private.call_is_master_draft(call_id)) with check (company_id = public.current_profile_company_id() and pci_private.call_is_master_draft(call_id))',
      v_table || '_update', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (pci_private.call_is_master_draft(call_id))',
      v_table || '_delete', v_table
    );
  end loop;
end;
$block$;

create policy pci_call_amendments_select
on public.pci_call_amendments for select to authenticated
using (pci_private.call_can_view(call_id));

create policy pci_call_amendments_insert
on public.pci_call_amendments for insert to authenticated
with check (
  status = 'amendment_draft'
  and requested_by = auth.uid()
  and (
    pci_private.is_office_user(company_id)
    or exists (
      select 1
      from public.pci_port_calls c
      where c.id = call_id
        and c.status = 'finalised'
        and pci_private.is_master(c.company_id, c.vessel_id)
    )
  )
);

create policy pci_call_amendments_update
on public.pci_call_amendments for update to authenticated
using (
  pci_private.is_office_user(company_id)
  or pci_private.amendment_can_edit(id)
)
with check (
  pci_private.is_office_user(company_id)
  or requested_by = auth.uid()
);

create policy pci_call_amendments_delete
on public.pci_call_amendments for delete to authenticated
using (status = 'amendment_draft' and pci_private.amendment_can_edit(id));

create policy pci_call_amendment_changes_select
on public.pci_call_amendment_changes for select to authenticated
using (
  exists (
    select 1 from public.pci_call_amendments a
    where a.id = amendment_id
      and pci_private.call_can_view(a.call_id)
  )
);

create policy pci_call_amendment_changes_insert
on public.pci_call_amendment_changes for insert to authenticated
with check (pci_private.amendment_can_edit(amendment_id));

create policy pci_call_amendment_changes_update
on public.pci_call_amendment_changes for update to authenticated
using (pci_private.amendment_can_edit(amendment_id))
with check (pci_private.amendment_can_edit(amendment_id));

create policy pci_call_amendment_changes_delete
on public.pci_call_amendment_changes for delete to authenticated
using (pci_private.amendment_can_edit(amendment_id));

create policy pci_call_attachments_select
on public.pci_call_attachments for select to authenticated
using (pci_private.call_can_view(call_id));

create policy pci_call_attachments_insert
on public.pci_call_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and company_id = public.current_profile_company_id()
  and pci_private.attachment_can_edit(call_id, amendment_id)
);

create policy pci_call_attachments_update
on public.pci_call_attachments for update to authenticated
using (pci_private.attachment_can_edit(call_id, amendment_id))
with check (pci_private.attachment_can_edit(call_id, amendment_id));

create policy pci_call_attachments_delete
on public.pci_call_attachments for delete to authenticated
using (pci_private.attachment_can_edit(call_id, amendment_id));

create policy pci_profile_values_select
on public.pci_profile_values for select to authenticated
using (pci_private.can_view_company(company_id));

create policy pci_profile_values_insert
on public.pci_profile_values for insert to authenticated
with check (pci_private.is_office_user(company_id) and approved_by = auth.uid());

create policy pci_profile_values_update
on public.pci_profile_values for update to authenticated
using (pci_private.is_office_user(company_id))
with check (pci_private.is_office_user(company_id) and approved_by = auth.uid());

create policy pci_profile_change_proposals_select
on public.pci_profile_change_proposals for select to authenticated
using (pci_private.can_view_company(company_id));

create policy pci_profile_value_history_select
on public.pci_profile_value_history for select to authenticated
using (pci_private.can_view_company(company_id));

create policy pci_audit_events_select
on public.pci_audit_events for select to authenticated
using (pci_private.can_view_company(company_id));

create policy pci_port_information_items_select
on public.pci_port_information_items for select to authenticated
using (
  pci_private.can_view_company(company_id)
  and (
    status in ('office_info_published', 'office_info_withdrawn')
    or pci_private.is_office_user(company_id)
  )
);

create policy pci_port_information_items_insert
on public.pci_port_information_items for insert to authenticated
with check (
  status = 'office_info_draft'
  and created_by = auth.uid()
  and pci_private.is_office_user(company_id)
);

create policy pci_port_information_items_update
on public.pci_port_information_items for update to authenticated
using (pci_private.is_office_user(company_id))
with check (pci_private.is_office_user(company_id));

create policy pci_port_information_items_delete
on public.pci_port_information_items for delete to authenticated
using (
  status = 'office_info_draft'
  and pci_private.is_office_user(company_id)
);

create policy pci_port_information_revisions_select
on public.pci_port_information_revisions for select to authenticated
using (
  exists (
    select 1
    from public.pci_port_information_items i
    where i.id = information_item_id
      and pci_private.can_view_company(i.company_id)
      and (
        i.status in ('office_info_published', 'office_info_withdrawn')
        or pci_private.is_office_user(i.company_id)
      )
  )
);

create policy pci_port_information_revisions_insert
on public.pci_port_information_revisions for insert to authenticated
with check (
  created_by = auth.uid()
  and pci_private.is_office_user(company_id)
);

create policy pci_port_information_revisions_update
on public.pci_port_information_revisions for update to authenticated
using (
  published_by is null
  and published_at is null
  and pci_private.is_office_user(company_id)
)
with check (pci_private.is_office_user(company_id));

create policy pci_port_information_revisions_delete
on public.pci_port_information_revisions for delete to authenticated
using (
  published_by is null
  and published_at is null
  and pci_private.is_office_user(company_id)
);

-- -----------------------------------------------------------------------------
-- Private Storage bucket and object policies
-- -----------------------------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'port-call-intelligence-private',
  'port-call-intelligence-private',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();

create policy pci_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'port-call-intelligence-private'
  and pci_private.can_select_storage_object(name)
);

create policy pci_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'port-call-intelligence-private'
  and pci_private.can_upload_storage_object(name)
);

create policy pci_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'port-call-intelligence-private'
  and pci_private.can_delete_storage_object(name)
);

-- No UPDATE policy is created: object paths are unique and uploads must not use
-- Storage upsert. Replacements create a new attachment row and object path.

-- -----------------------------------------------------------------------------
-- Grants and final self-checks
-- -----------------------------------------------------------------------------

do $block$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'pci_field_definitions',
    'pci_field_options',
    'pci_port_profiles',
    'pci_port_calls',
    'pci_call_values',
    'pci_call_repeat_rows',
    'pci_call_repeat_values',
    'pci_call_section_confirmations',
    'pci_call_hazards',
    'pci_call_amendments',
    'pci_call_amendment_changes',
    'pci_call_attachments',
    'pci_profile_values',
    'pci_profile_change_proposals',
    'pci_profile_value_history',
    'pci_audit_events',
    'pci_port_information_items',
    'pci_port_information_revisions',
    'pci_v_ports_list',
    'pci_v_port_call_history'
  ] loop
    execute format('revoke all on table public.%I from anon', v_relation);
  end loop;
end;
$block$;

grant select on public.pci_field_definitions to authenticated;
grant select on public.pci_field_options to authenticated;
grant select, insert on public.pci_port_profiles to authenticated;
grant select, insert, update, delete on public.pci_port_calls to authenticated;
grant select, insert, update, delete on public.pci_call_values to authenticated;
grant select, insert, update, delete on public.pci_call_repeat_rows to authenticated;
grant select, insert, update, delete on public.pci_call_repeat_values to authenticated;
grant select, insert, update, delete on public.pci_call_section_confirmations to authenticated;
grant select, insert, update, delete on public.pci_call_hazards to authenticated;
grant select, insert, update, delete on public.pci_call_amendments to authenticated;
grant select, insert, update, delete on public.pci_call_amendment_changes to authenticated;
grant select, insert, update, delete on public.pci_call_attachments to authenticated;
grant select, insert, update on public.pci_profile_values to authenticated;
grant select on public.pci_profile_change_proposals to authenticated;
grant select on public.pci_profile_value_history to authenticated;
grant select on public.pci_audit_events to authenticated;
grant select, insert, update, delete on public.pci_port_information_items to authenticated;
grant select, insert, update, delete on public.pci_port_information_revisions to authenticated;
grant select on public.pci_v_ports_list to authenticated;
grant select on public.pci_v_port_call_history to authenticated;

revoke all on function public.pci_decide_profile_proposal(uuid, text, text, text) from public;
grant execute on function public.pci_decide_profile_proposal(uuid, text, text, text) to authenticated;

grant usage on schema pci_private to authenticated;
revoke all on all functions in schema pci_private from public;
grant execute on all functions in schema pci_private to authenticated;

do $block$
declare
  v_fields integer;
  v_profile_candidates_and_keys integer;
  v_excluded integer;
  v_company_enablements integer;
begin
  select count(*) into v_fields
  from public.pci_field_definitions
  where version = 1;

  select count(*) into v_profile_candidates_and_keys
  from public.pci_field_definitions
  where version = 1
    and profile_treatment in ('profile_candidate', 'system_profile_key');

  select count(*) into v_excluded
  from public.pci_field_definitions
  where version = 1
    and retention_rule = 'exclude';

  select count(*) into v_company_enablements
  from public.company_modules
  where module_key = 'port_call_intelligence';

  if v_fields <> 143 then
    raise exception 'PCI field seed mismatch: expected 143, found %', v_fields;
  end if;

  if v_profile_candidates_and_keys <> 92 then
    raise exception 'PCI profile seed mismatch: expected 92, found %', v_profile_candidates_and_keys;
  end if;

  if v_excluded <> 0 then
    raise exception 'Excluded source rows must not be seeded as PCI fields.';
  end if;

  if v_company_enablements <> 0 then
    raise exception 'PCI must remain disabled for every company at schema-draft stage.';
  end if;
end;
$block$;

commit;
