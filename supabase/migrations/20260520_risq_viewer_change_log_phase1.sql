-- =========================================================
-- C.S.V. BEACON
-- RISQ Questions Viewer Change Log — Phase 1 backend
-- 2026-05-20
--
-- Purpose:
--   Add a separate RISQ change-event log for the RISQ Questions Viewer.
--
-- Scope:
--   - Additive RISQ-only table.
--   - Platform-only read RPC.
--   - Event recording RPC for future RISQ Editor integration.
--   - No SIRE tables modified.
--   - No RISQ question data modified.
-- =========================================================

begin;

create table if not exists public.risq_library_change_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null,

  source_module text not null default 'risq_questions_editor',
  source_record_id uuid null,

  question_id uuid null,
  question_no text null,
  company_id uuid null,

  event_type text not null,
  change_scope text not null default 'question',
  title text not null,
  summary text null,

  payload jsonb not null default '{}'::jsonb
);

comment on table public.risq_library_change_events is
  'Platform monitoring log for RISQ Questions Viewer content-change events.';

create index if not exists risq_library_change_events_created_at_idx
  on public.risq_library_change_events (created_at desc);

create index if not exists risq_library_change_events_question_id_idx
  on public.risq_library_change_events (question_id);

create index if not exists risq_library_change_events_question_no_idx
  on public.risq_library_change_events (question_no);

create index if not exists risq_library_change_events_company_id_idx
  on public.risq_library_change_events (company_id);

create index if not exists risq_library_change_events_event_type_idx
  on public.risq_library_change_events (event_type);

alter table public.risq_library_change_events enable row level security;

-- Platform roles may read RISQ change events directly.
drop policy if exists risq_library_change_events_platform_select
  on public.risq_library_change_events;

create policy risq_library_change_events_platform_select
on public.risq_library_change_events
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

-- No direct authenticated insert/update/delete policies.
-- Events are written through the security-definer RPC below.


create or replace function public.csvb_risq_record_change_event(
  p_event_type text,
  p_change_scope text default 'question',
  p_question_id uuid default null,
  p_question_no text default null,
  p_title text default null,
  p_summary text default null,
  p_source_record_id uuid default null,
  p_company_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_event_id uuid;
  v_event_type text;
  v_change_scope text;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select p.role::text
  into v_role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_role is null then
    raise exception 'User profile was not found.';
  end if;

  if v_role not in ('super_admin', 'platform_owner', 'company_admin', 'company_superintendent') then
    raise exception 'RISQ change event recording is not allowed for this role.';
  end if;

  v_event_type := nullif(trim(coalesce(p_event_type, '')), '');
  v_change_scope := coalesce(nullif(trim(coalesce(p_change_scope, '')), ''), 'question');

  if v_event_type is null then
    raise exception 'event_type is required.';
  end if;

  v_title := coalesce(
    nullif(trim(coalesce(p_title, '')), ''),
    case
      when p_question_no is not null then 'RISQ question updated — ' || p_question_no
      else 'RISQ library updated'
    end
  );

  insert into public.risq_library_change_events (
    created_by,
    source_module,
    source_record_id,
    question_id,
    question_no,
    company_id,
    event_type,
    change_scope,
    title,
    summary,
    payload
  ) values (
    auth.uid(),
    'risq_questions_editor',
    p_source_record_id,
    p_question_id,
    nullif(trim(coalesce(p_question_no, '')), ''),
    p_company_id,
    v_event_type,
    v_change_scope,
    v_title,
    nullif(trim(coalesce(p_summary, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

comment on function public.csvb_risq_record_change_event(
  text, text, uuid, text, text, text, uuid, uuid, jsonb
) is
  'Records a RISQ Viewer change event after a RISQ Editor action succeeds. Intended for frontend or RPC integration.';


create or replace function public.csvb_risq_library_change_log_for_me(
  p_limit integer default 20
)
returns table(
  event_id uuid,
  created_at timestamptz,
  created_by uuid,
  created_by_username text,
  source_module text,
  source_record_id uuid,
  question_id uuid,
  question_no text,
  company_id uuid,
  company_name text,
  event_type text,
  change_scope text,
  title text,
  summary text,
  payload jsonb
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_role text;
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select p.role::text
  into v_role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_role is null then
    raise exception 'User profile was not found.';
  end if;

  if v_role not in ('super_admin', 'platform_owner') then
    raise exception 'RISQ change log is available to platform roles only.';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));

  return query
  select
    e.id as event_id,
    e.created_at,
    e.created_by,
    p.username::text as created_by_username,
    e.source_module,
    e.source_record_id,
    e.question_id,
    e.question_no,
    e.company_id,
    c.company_name::text as company_name,
    e.event_type,
    e.change_scope,
    e.title,
    e.summary,
    e.payload
  from public.risq_library_change_events e
  left join public.profiles p
    on p.id = e.created_by
  left join public.companies c
    on c.id = e.company_id
  order by e.created_at desc
  limit v_limit;
end;
$function$;

comment on function public.csvb_risq_library_change_log_for_me(integer) is
  'Platform-only RPC returning recent RISQ Questions Viewer change events.';

-- Verification
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'risq_library_change_events';

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'csvb_risq_record_change_event',
    'csvb_risq_library_change_log_for_me'
  )
order by p.proname;

commit;
