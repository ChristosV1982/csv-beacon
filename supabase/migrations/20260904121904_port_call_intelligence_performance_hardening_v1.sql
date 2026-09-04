-- Port Call Intelligence performance hardening v1
-- Follow-up to 20260904095701_port_call_intelligence_schema_v1.sql.
-- Adds covering indexes for composite foreign keys and caches auth.uid()
-- once per statement in the policies identified by Supabase advisors.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create index if not exists pci_call_amendment_changes_amendment_company_fk_idx
  on public.pci_call_amendment_changes (amendment_id, company_id);

create index if not exists pci_call_amendments_call_company_fk_idx
  on public.pci_call_amendments (call_id, company_id);

create index if not exists pci_call_attachments_amendment_company_fk_idx
  on public.pci_call_attachments (amendment_id, company_id);

create index if not exists pci_call_attachments_call_company_fk_idx
  on public.pci_call_attachments (call_id, company_id);

create index if not exists pci_call_hazards_call_company_fk_idx
  on public.pci_call_hazards (call_id, company_id);

create index if not exists pci_call_repeat_rows_call_company_fk_idx
  on public.pci_call_repeat_rows (call_id, company_id);

create index if not exists pci_call_repeat_values_call_company_fk_idx
  on public.pci_call_repeat_values (call_id, company_id);

create index if not exists pci_call_repeat_values_row_company_fk_idx
  on public.pci_call_repeat_values (repeat_row_id, company_id);

create index if not exists pci_call_section_confirmations_call_company_fk_idx
  on public.pci_call_section_confirmations (call_id, company_id);

create index if not exists pci_call_values_call_company_fk_idx
  on public.pci_call_values (call_id, company_id);

create index if not exists pci_port_information_revisions_item_company_fk_idx
  on public.pci_port_information_revisions (information_item_id, company_id);

create index if not exists pci_profile_change_proposals_existing_company_fk_idx
  on public.pci_profile_change_proposals (existing_profile_value_id, company_id);

create index if not exists pci_profile_value_history_value_company_fk_idx
  on public.pci_profile_value_history (profile_value_id, company_id);

alter policy pci_port_calls_insert
on public.pci_port_calls
with check (
  status = 'draft'
  and created_by = (select auth.uid())
  and pci_private.is_master(company_id, vessel_id)
);

alter policy pci_port_calls_update
on public.pci_port_calls
using (
  pci_private.is_office_user(company_id)
  or (
    created_by = (select auth.uid())
    and pci_private.is_master(company_id, vessel_id)
    and status in ('draft', 'submitted')
  )
)
with check (
  pci_private.is_office_user(company_id)
  or (
    created_by = (select auth.uid())
    and pci_private.is_master(company_id, vessel_id)
    and status in ('draft', 'submitted')
  )
);

alter policy pci_port_calls_delete
on public.pci_port_calls
using (
  status = 'draft'
  and created_by = (select auth.uid())
  and pci_private.is_master(company_id, vessel_id)
);

alter policy pci_call_amendments_insert
on public.pci_call_amendments
with check (
  status = 'amendment_draft'
  and requested_by = (select auth.uid())
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

alter policy pci_call_amendments_update
on public.pci_call_amendments
using (
  pci_private.is_office_user(company_id)
  or pci_private.amendment_can_edit(id)
)
with check (
  pci_private.is_office_user(company_id)
  or requested_by = (select auth.uid())
);

alter policy pci_call_attachments_insert
on public.pci_call_attachments
with check (
  uploaded_by = (select auth.uid())
  and company_id = public.current_profile_company_id()
  and pci_private.attachment_can_edit(call_id, amendment_id)
);

alter policy pci_profile_values_insert
on public.pci_profile_values
with check (
  pci_private.is_office_user(company_id)
  and approved_by = (select auth.uid())
);

alter policy pci_profile_values_update
on public.pci_profile_values
using (pci_private.is_office_user(company_id))
with check (
  pci_private.is_office_user(company_id)
  and approved_by = (select auth.uid())
);

alter policy pci_port_information_items_insert
on public.pci_port_information_items
with check (
  status = 'office_info_draft'
  and created_by = (select auth.uid())
  and pci_private.is_office_user(company_id)
);

alter policy pci_port_information_revisions_insert
on public.pci_port_information_revisions
with check (
  created_by = (select auth.uid())
  and pci_private.is_office_user(company_id)
);

commit;
