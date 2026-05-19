-- =========================================================
-- C.S.V. BEACON / SIRE 2.0 Questions Viewer
-- AI Search Phase 2 — Usage Logging
-- 2026-05-19
--
-- Purpose:
--   Record every SIRE Viewer AI Search request handled by the
--   sire-viewer-ai-search Edge Function.
--
-- Scope:
--   - New audit/log table only.
--   - No SIRE question data modified.
--   - No Dashboard changes.
--   - Edge Function inserts using the service role key.
-- =========================================================

begin;

create table if not exists public.sire_viewer_ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  user_id uuid null,
  company_id uuid null,
  user_role text null,

  query_text text not null,
  source_question_count integer not null default 0,
  source_pack_chars integer not null default 0,

  model text null,
  success boolean not null default false,
  error_message text null,
  response_chars integer not null default 0,
  duration_ms integer null,

  usage jsonb null,
  request_context jsonb not null default '{}'::jsonb
);

comment on table public.sire_viewer_ai_usage_log is
  'Audit log for SIRE 2.0 Questions Viewer AI Search requests.';

comment on column public.sire_viewer_ai_usage_log.query_text is
  'User query submitted to the SIRE Viewer AI Search function.';

comment on column public.sire_viewer_ai_usage_log.source_question_count is
  'Number of source questions identified in the source pack.';

comment on column public.sire_viewer_ai_usage_log.usage is
  'Provider usage payload, where returned by the AI provider.';

create index if not exists sire_viewer_ai_usage_log_created_at_idx
  on public.sire_viewer_ai_usage_log (created_at desc);

create index if not exists sire_viewer_ai_usage_log_user_id_idx
  on public.sire_viewer_ai_usage_log (user_id);

create index if not exists sire_viewer_ai_usage_log_company_id_idx
  on public.sire_viewer_ai_usage_log (company_id);

create index if not exists sire_viewer_ai_usage_log_success_idx
  on public.sire_viewer_ai_usage_log (success);

alter table public.sire_viewer_ai_usage_log enable row level security;

-- Platform administrators may read all AI usage logs.
drop policy if exists sire_viewer_ai_usage_log_platform_select
  on public.sire_viewer_ai_usage_log;

create policy sire_viewer_ai_usage_log_platform_select
on public.sire_viewer_ai_usage_log
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('super_admin', 'platform_owner')
  )
);

-- Company administrators/superintendents may read only their company logs.
drop policy if exists sire_viewer_ai_usage_log_company_select
  on public.sire_viewer_ai_usage_log;

create policy sire_viewer_ai_usage_log_company_select
on public.sire_viewer_ai_usage_log
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.company_id = sire_viewer_ai_usage_log.company_id
      and p.role::text in ('company_admin', 'company_superintendent')
  )
);

-- No authenticated insert/update/delete policies are created.
-- Inserts are performed by the Edge Function using the service role key.

-- Verification
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'sire_viewer_ai_usage_log';

select
  indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'sire_viewer_ai_usage_log'
order by indexname;

commit;
