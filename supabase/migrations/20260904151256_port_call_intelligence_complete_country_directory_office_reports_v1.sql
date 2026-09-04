-- Port Call Intelligence complete country directory and office-authored call reports v1

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- -----------------------------------------------------------------------------
-- Country directory: return one row per country instead of constructing the
-- country selector from PostgREST's first page of individual port rows.
-- -----------------------------------------------------------------------------

create or replace view public.pci_v_countries_list
with (security_invoker = true)
as
select
  p.country_code,
  max(p.country_name) as country_name,
  count(*)::bigint as port_count
from public.pci_v_ports_list p
where nullif(btrim(p.country_code), '') is not null
group by p.country_code;

revoke all on table public.pci_v_countries_list from anon;
grant select on table public.pci_v_countries_list to authenticated;

-- -----------------------------------------------------------------------------
-- Controlled active-vessel selector for office-authored call reports.
-- -----------------------------------------------------------------------------

create or replace function pci_private.list_company_vessels(p_company_id uuid)
returns table (
  vessel_id uuid,
  vessel_name text,
  imo_number bigint,
  call_sign text,
  hull_number text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_company_id is null or not pci_private.is_office_user(p_company_id) then
    raise exception 'Only an authorised office user may list Company vessels.';
  end if;

  return query
  select
    v.id,
    v.name,
    v.imo_number,
    v.call_sign,
    v.hull_number
  from public.vessels v
  where v.company_id = p_company_id
    and v.is_active = true
  order by v.name;
end;
$function$;

create or replace function public.pci_list_company_vessels(p_company_id uuid)
returns table (
  vessel_id uuid,
  vessel_name text,
  imo_number bigint,
  call_sign text,
  hull_number text
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select * from pci_private.list_company_vessels(p_company_id);
$function$;

revoke all on function pci_private.list_company_vessels(uuid) from public;
grant execute on function pci_private.list_company_vessels(uuid) to authenticated;

revoke all on function public.pci_list_company_vessels(uuid) from public;
grant execute on function public.pci_list_company_vessels(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Immutable report origin. Existing records are vessel-Master reports.
-- -----------------------------------------------------------------------------

alter table public.pci_port_calls
  add column if not exists report_origin text not null default 'vessel_master';

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pci_port_calls_report_origin_check'
      and conrelid = 'public.pci_port_calls'::regclass
  ) then
    alter table public.pci_port_calls
      add constraint pci_port_calls_report_origin_check
      check (report_origin in ('vessel_master', 'office'));
  end if;
end;
$block$;

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
  c.report_origin
from public.pci_port_calls c
where c.status = 'finalised';

-- -----------------------------------------------------------------------------
-- A Draft is editable only by its creating Master or its creating office user.
-- -----------------------------------------------------------------------------

create or replace function pci_private.call_is_author_draft(p_call_id uuid)
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
      and (
        pci_private.is_master(c.company_id, c.vessel_id)
        or (
          c.report_origin = 'office'
          and pci_private.is_office_user(c.company_id)
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
      then pci_private.call_is_author_draft(p_call_id)
    else pci_private.amendment_can_edit(p_amendment_id)
  end;
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
    return pci_private.call_is_author_draft(v_call_id);
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

-- -----------------------------------------------------------------------------
-- Call lifecycle. Office authors receive the same Draft authoring lifecycle as
-- a Master, while review/finalisation remains the controlled office workflow.
-- -----------------------------------------------------------------------------

create or replace function pci_private.guard_port_call()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_is_master boolean;
  v_is_office boolean;
  v_is_report_author boolean;
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
    if pci_private.is_master(new.company_id, new.vessel_id) then
      new.report_origin := 'vessel_master';
    elsif pci_private.is_office_user(new.company_id) then
      new.report_origin := 'office';
    else
      raise exception 'Only the assigned Master or an authorised office user may create a call report.';
    end if;

    new.call_reference := 'PCI-' || to_char(current_date, 'YYYY') || '-' ||
      upper(substr(replace(new.id::text, '-', ''), 1, 10));
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft'
       or old.created_by <> auth.uid()
       or not (
         pci_private.is_master(old.company_id, old.vessel_id)
         or (
           old.report_origin = 'office'
           and pci_private.is_office_user(old.company_id)
         )
       ) then
      raise exception 'Only the report author may delete their own Draft call.';
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
     or new.report_origin <> old.report_origin
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at
     or new.call_reference <> old.call_reference then
    raise exception 'Immutable Port Call Intelligence call identity cannot be changed.';
  end if;

  v_is_master := pci_private.is_master(old.company_id, old.vessel_id)
    and old.created_by = auth.uid();
  v_is_office := pci_private.is_office_user(old.company_id);
  v_is_report_author := old.created_by = auth.uid()
    and (
      v_is_master
      or (old.report_origin = 'office' and v_is_office)
    );

  if v_is_report_author
     and (
       (old.status = 'draft' and new.status in ('draft', 'submitted'))
       or (
         old.status = 'submitted'
         and new.status = 'draft'
         and old.review_started_at is null
       )
     ) then
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

-- -----------------------------------------------------------------------------
-- RLS: allow the creating office user to author and delete their own Draft,
-- while retaining the existing office review access after submission.
-- -----------------------------------------------------------------------------

drop policy if exists pci_port_calls_insert on public.pci_port_calls;
create policy pci_port_calls_insert
on public.pci_port_calls for insert to authenticated
with check (
  status = 'draft'
  and created_by = auth.uid()
  and (
    pci_private.is_master(company_id, vessel_id)
    or (
      report_origin = 'office'
      and pci_private.is_office_user(company_id)
    )
  )
);

drop policy if exists pci_port_calls_delete on public.pci_port_calls;
create policy pci_port_calls_delete
on public.pci_port_calls for delete to authenticated
using (
  status = 'draft'
  and created_by = auth.uid()
  and (
    pci_private.is_master(company_id, vessel_id)
    or (
      report_origin = 'office'
      and pci_private.is_office_user(company_id)
    )
  )
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
    execute format('drop policy if exists %I on public.%I', v_table || '_insert', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_update', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_delete', v_table);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (pci_private.call_is_author_draft(call_id))',
      v_table || '_insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (pci_private.call_is_author_draft(call_id)) with check (pci_private.call_is_author_draft(call_id))',
      v_table || '_update', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (pci_private.call_is_author_draft(call_id))',
      v_table || '_delete', v_table
    );
  end loop;
end;
$block$;

drop policy if exists pci_call_attachments_insert on public.pci_call_attachments;
create policy pci_call_attachments_insert
on public.pci_call_attachments for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and pci_private.attachment_can_edit(call_id, amendment_id)
);

drop policy if exists pci_call_attachments_update on public.pci_call_attachments;
create policy pci_call_attachments_update
on public.pci_call_attachments for update to authenticated
using (pci_private.attachment_can_edit(call_id, amendment_id))
with check (pci_private.attachment_can_edit(call_id, amendment_id));

drop policy if exists pci_call_attachments_delete on public.pci_call_attachments;
create policy pci_call_attachments_delete
on public.pci_call_attachments for delete to authenticated
using (pci_private.attachment_can_edit(call_id, amendment_id));

revoke all on function pci_private.call_is_author_draft(uuid) from public;
grant execute on function pci_private.call_is_author_draft(uuid) to authenticated;

commit;
