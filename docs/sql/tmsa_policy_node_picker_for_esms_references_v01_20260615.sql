-- ============================================================
-- C.S.V. BEACON
-- TMSA eSMS Reference Picker RPC
--
-- File:
--   docs/sql/tmsa_policy_node_picker_for_esms_references_v01_20260615.sql
--
-- Purpose:
--   Provides a TMSA-specific Company Policy node picker for linking
--   TMSA KPIs to eSMS / Company Policy references.
--
-- Runtime usage:
--   TMSA Element Workspace -> eSMS Reference picker
--
-- Confirmed browser test:
--   Search "navigation" returns:
--   7.2 - NAVIGATION
--
-- Stable app checkpoint:
--   stable-tmsa-esms-policy-links-v01-20260615
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.csvb_tmsa_policy_node_picker_for_me(text, text, integer);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_policy_node_picker_for_me(
  p_search text DEFAULT NULL,
  p_book_key text DEFAULT 'main_policy',
  p_limit integer DEFAULT 30
)
RETURNS TABLE (
  policy_node_id uuid,
  book_id uuid,
  parent_node_id uuid,
  node_type text,
  node_code text,
  node_title text,
  display_label text,
  depth integer,
  sort_order numeric,
  is_content_node boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record;
  v_search text;
  v_book_key text;
  v_limit integer;
BEGIN
  SELECT *
  INTO v_me
  FROM public.csvb_tmsa_current_profile()
  LIMIT 1;

  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  v_search := lower(trim(coalesce(p_search, '')));
  v_book_key := coalesce(nullif(trim(coalesce(p_book_key, '')), ''), 'main_policy');
  v_limit := greatest(1, least(coalesce(p_limit, 30), 100));

  RETURN QUERY
  SELECT
    n.id::uuid AS policy_node_id,
    n.book_id::uuid AS book_id,
    n.parent_node_id::uuid AS parent_node_id,
    n.node_type::text AS node_type,
    n.node_code::text AS node_code,
    n.title::text AS node_title,
    trim(concat(
      coalesce(nullif(n.node_code::text, ''), ''),
      CASE WHEN nullif(n.node_code::text, '') IS NOT NULL THEN ' - ' ELSE '' END,
      coalesce(n.title::text, '')
    ))::text AS display_label,
    n.depth::integer AS depth,
    n.sort_order::numeric AS sort_order,
    n.is_content_node::boolean AS is_content_node
  FROM public.csvb_company_policy_list_nodes(v_book_key) n
  WHERE coalesce(n.is_active, true) = true
    AND (
      v_search = ''
      OR lower(
        coalesce(n.node_code::text, '') || ' ' ||
        coalesce(n.title::text, '') || ' ' ||
        coalesce(n.node_type::text, '')
      ) LIKE '%' || v_search || '%'
    )
  ORDER BY
    n.sort_order::numeric NULLS LAST,
    n.node_code::text,
    n.title::text
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_policy_node_picker_for_me(text, text, integer)
TO authenticated;

COMMIT;


-- ============================================================
-- Metadata verification only.
-- This does not call the function, because SQL Editor is not
-- authenticated as an app user.
-- ============================================================

SELECT
  'csvb_tmsa_policy_node_picker_for_me' AS check_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'csvb_tmsa_policy_node_picker_for_me';
