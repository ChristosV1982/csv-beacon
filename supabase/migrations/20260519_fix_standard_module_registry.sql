-- =========================================================
-- C.S.V. BEACON / Supabase Migration Changelog
-- 2026-05-19
--
-- Fix: Standard Module Registry Update
--
-- Purpose:
--   csvb_my_company_modules() and csvb_admin_list_company_modules()
--   depend on csvb_standard_modules().
--
--   Newer company module keys already existed in company_modules,
--   but they were not visible to normal company users because
--   csvb_standard_modules() did not return them.
--
-- Result after applying:
--   Company Admin users such as MMM can see enabled operational modules,
--   including Company Policy, Mooring and Anchoring Inventories,
--   Portable Lifting Appliances & Wires, RISQ Questions Editor,
--   Threads, and SIRE 2.0 Questions Viewer.
--
-- Scope:
--   - Function replacement only.
--   - No SIRE question data modified.
--   - No company_modules rows modified by this file.
--   - Platform Administration remains listed in registry but should remain
--     blocked by Dashboard / rights logic for normal Company Admin users.
--
-- Applied manually in Supabase before this migration file was committed.
-- Keep this file as recovery/deployment documentation.
-- =========================================================

begin;

create or replace function public.csvb_standard_modules()
returns table(
  module_key text,
  module_label text,
  module_group text,
  sort_order integer
)
language sql
stable
security definer
set search_path to 'public'
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

-- Verification 1: standard registry should include current operational keys.
select *
from public.csvb_standard_modules()
where module_key in (
  'company_policy',
  'mooring_anchoring_inventories',
  'portable_lifting_appliances_wires',
  'risq_questions_editor',
  'threads',
  'sire_questions_viewer'
)
order by sort_order;

-- Verification 2: optional MMM company check.
-- Safe to run only if user MMM exists in the target environment.
with mmm as (
  select company_id
  from public.profiles
  where lower(username) = lower('MMM')
  limit 1
)
select
  sm.module_key,
  sm.module_label,
  sm.module_group,
  sm.sort_order,
  coalesce(cm.is_enabled, false) as is_enabled
from public.csvb_standard_modules() sm
cross join mmm
left join public.company_modules cm
  on cm.company_id = mmm.company_id
 and cm.module_key = sm.module_key
where sm.module_key in (
  'company_policy',
  'mooring_anchoring_inventories',
  'portable_lifting_appliances_wires',
  'risq_questions_editor',
  'threads',
  'sire_questions_viewer'
)
order by sm.sort_order;

commit;
