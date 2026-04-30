# C.S.V. BEACON — Multi-Company Security Status

## Current Status

C.S.V. BEACON has been converted from a single-company application foundation into a multi-company / tenant-aware platform.

Completed areas:

- Company / tenant foundation
- Company modules
- Company-aware Superuser Administration
- Company-aware vessel creation
- Company-aware user creation
- Company assignment controls
- Safe vessel delete
- Dashboard module visibility by company
- Direct module page guard
- Company-scoped frontend filtering
- Staged RLS enforcement
- Report storage hardening
- Question-photo bucket hardening

## Company Model

Main company tables:

- `public.companies`
- `public.company_modules`

Default internal company:

- `C.S.V. BEACON Internal / Testing Company`
- `CSVBEACON-INTERNAL`

Demo test company:

- `DEMO-SHIPPING`

## Admin RPC Foundation

Important admin functions installed:

- `csvb_admin_list_companies`
- `csvb_admin_upsert_company`
- `csvb_admin_list_company_modules`
- `csvb_admin_set_company_module`
- `csvb_admin_list_vessels_by_company`
- `csvb_admin_list_users_by_company`
- `csvb_admin_set_profile_company`
- `csvb_admin_set_profile_vessel`
- `csvb_admin_set_vessel_company`
- `csvb_admin_upsert_vessel`
- `csvb_admin_delete_vessel_if_unused`

Permanent user delete is deferred because a user exists in both:

- Supabase Auth
- `public.profiles`

Future deletion must be implemented through the `su-admin` Edge Function using Supabase Admin API.

## RLS Completed

RLS has been staged and applied to:

- `companies`
- `company_modules`
- `profiles`
- `vessels`
- `post_inspection_reports`
- `post_inspection_observation_items`
- `questionnaires`
- `questionnaire_questions`
- `questionnaire_templates`
- `questionnaire_template_questions`
- `answers_pgno`
- `self_assess_campaigns`
- `self_assess_instances`
- `audit_reports`
- `audit_observation_items`
- `third_party_inspector_observations`
- `audit_types`
- `inspectors`
- `inspector_aliases`
- `questions_master`
- `pgno_master`
- `expected_evidence_master`

Final verification showed all target tables had RLS enabled.

## Storage Security

Buckets audited:

- `inspection-reports`
- `audit-reports`
- `question-photos`

Current status:

- `inspection-reports`: private, scoped storage policies, signed URL workflow working
- `audit-reports`: private, scoped storage policies
- `question-photos`: private, scoped storage policies

Post-Inspection PDF download was tested successfully after storage hardening.

## Global Reference Tables

The following are intentionally treated as global/reference tables:

- `audit_types`
- `inspectors`
- `inspector_aliases`

They may be visible globally to authenticated users.

## Question Library Model

Global official SIRE rows:

- `questions_master.company_id IS NULL`
- visible broadly
- editable only by platform admin

Company custom rows:

- `company_id` populated
- visible only to that company and platform admin
- editable by own company office users and platform admin

Supporting rows follow the parent question:

- `pgno_master`
- `expected_evidence_master`

## Validated Behaviour

DEMO company user:

- sees only DEMO company modules
- sees only DEMO vessels/users/data
- sees global SIRE question rows
- does not see internal company custom rows
- sees no internal post-inspection/audit/self-assessment records

Superuser:

- sees all companies
- sees all vessels/users/modules
- sees all operational records
- can access all global and company-specific question rows

## Deferred Items

Deferred intentionally:

1. Permanent user delete
2. Cleanup of old/unlinked storage objects
3. Optional migration to company/vessel/report-based storage paths
4. Company-context switch tool for superuser
5. Reporting/dashboard polish
6. Future Marine Equipment Register module
7. Future ISM/SMS Actions module

## Operational Warning

Do not disable or rewrite RLS policies without first checking:

- frontend filtered RPC usage
- module guard behaviour
- storage signed URL workflow
- superuser access
- DEMO/user company isolation

This file records the stable security foundation reached after MC-7D1.
