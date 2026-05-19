-- =========================================================
-- C.S.V. BEACON / SIRE 2.0 Questions Viewer
-- AI Usage Log visibility hardening
-- 2026-05-19
--
-- Purpose:
--   Make AI Usage Log retrieval platform-only.
--
-- Visibility after this migration:
--   - super_admin / platform_owner: all AI usage rows
--   - company_admin / company_superintendent: blocked
--   - vessel / inspector: blocked
--
-- Scope:
--   - Function replacement only.
--   - No SIRE question data modified.
--   - No AI provider changes.
-- =========================================================

begin;

create or replace function public.csvb_sire_viewer_ai_usage_log_for_me(
  p_limit integer default 50
)
returns table(
  log_id uuid,
  created_at timestamptz,
  user_id uuid,
  username text,
  company_id uuid,
  company_name text,
  user_role text,
  query_text text,
  source_question_count integer,
  source_pack_chars integer,
  model text,
  success boolean,
  error_message text,
  response_chars integer,
  duration_ms integer,
  usage jsonb
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
    raise exception 'AI usage log is available to platform roles only.';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));

  return query
  select
    l.id as log_id,
    l.created_at,
    l.user_id,
    p.username::text as username,
    l.company_id,
    c.company_name::text as company_name,
    l.user_role,
    l.query_text,
    l.source_question_count,
    l.source_pack_chars,
    l.model,
    l.success,
    l.error_message,
    l.response_chars,
    l.duration_ms,
    l.usage
  from public.sire_viewer_ai_usage_log l
  left join public.profiles p
    on p.id = l.user_id
  left join public.companies c
    on c.id = l.company_id
  order by l.created_at desc
  limit v_limit;
end;
$function$;

-- Verification: function exists.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'csvb_sire_viewer_ai_usage_log_for_me';

commit;
