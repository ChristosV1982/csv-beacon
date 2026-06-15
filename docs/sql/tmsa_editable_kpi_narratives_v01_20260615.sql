-- ============================================================
-- C.S.V. BEACON
-- TMSA Editable KPI Narratives v01 - 2026-06-15
--
-- Purpose:
--   Preserve original imported TMSA KPI text while allowing
--   company-editable KPI narrative overrides.
--
-- Applied live in Supabase during v04E-A.
--
-- Scope:
--   - Adds company-editable KPI statement field.
--   - Adds company-editable Best Practice Guidance field.
--   - Adds update traceability columns.
--   - Adds read/save/reset RPC functions.
--
-- Original imported book text is NOT overwritten.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Company-specific editable narrative fields
-- ============================================================

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS company_kpi_statement text;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS company_best_practice_guidance text;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS company_kpi_statement_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS company_kpi_statement_updated_at timestamptz;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS company_best_practice_guidance_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS company_best_practice_guidance_updated_at timestamptz;


-- ============================================================
-- 2. Read original + company override + effective text
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_kpi_narratives_for_me(text, uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_kpi_narratives_for_me(
  p_element_code text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  kpi_id uuid,
  element_code text,
  element_title text,
  kpi_code text,
  kpi_level integer,

  original_kpi_statement text,
  original_best_practice_guidance text,

  company_kpi_statement text,
  company_best_practice_guidance text,

  effective_kpi_statement text,
  effective_best_practice_guidance text,

  company_kpi_statement_updated_at timestamptz,
  company_best_practice_guidance_updated_at timestamptz,

  company_kpi_statement_updated_by uuid,
  company_best_practice_guidance_updated_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record;
  v_company_id uuid;
BEGIN
  SELECT *
  INTO v_me
  FROM public.csvb_tmsa_current_profile()
  LIMIT 1;

  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  v_company_id := coalesce(p_company_id, v_me.company_id);

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company is required.';
  END IF;

  IF NOT public.csvb_tmsa_can_access_company(v_company_id) THEN
    RAISE EXCEPTION 'Access denied for company.';
  END IF;

  RETURN QUERY
  SELECT
    k.id AS kpi_id,
    e.element_code,
    e.element_title,
    k.kpi_code,
    k.kpi_level,

    k.kpi_statement AS original_kpi_statement,
    k.best_practice_guidance AS original_best_practice_guidance,

    m.company_kpi_statement,
    m.company_best_practice_guidance,

    CASE
      WHEN nullif(trim(coalesce(m.company_kpi_statement, '')), '') IS NOT NULL
        THEN m.company_kpi_statement
      ELSE k.kpi_statement
    END AS effective_kpi_statement,

    CASE
      WHEN nullif(trim(coalesce(m.company_best_practice_guidance, '')), '') IS NOT NULL
        THEN m.company_best_practice_guidance
      ELSE k.best_practice_guidance
    END AS effective_best_practice_guidance,

    m.company_kpi_statement_updated_at,
    m.company_best_practice_guidance_updated_at,

    m.company_kpi_statement_updated_by,
    m.company_best_practice_guidance_updated_by

  FROM public.tmsa_elements e
  JOIN public.tmsa_kpis k
    ON k.element_id = e.id
  LEFT JOIN public.tmsa_company_kpi_matrix m
    ON m.kpi_id = k.id
   AND m.company_id = v_company_id
  WHERE e.is_active = true
    AND k.is_active = true
    AND (p_element_code IS NULL OR e.element_code = p_element_code)
  ORDER BY e.sort_order, k.sort_order;
END;
$$;


-- ============================================================
-- 3. Save company narrative overrides
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_save_kpi_narrative_override(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_save_kpi_narrative_override(
  p_kpi_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_company_kpi_statement text DEFAULT NULL,
  p_company_best_practice_guidance text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record;
  v_company_id uuid;
  v_matrix_id uuid;
BEGIN
  SELECT *
  INTO v_me
  FROM public.csvb_tmsa_current_profile()
  LIMIT 1;

  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  v_company_id := coalesce(p_company_id, v_me.company_id);

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company is required.';
  END IF;

  IF NOT public.csvb_tmsa_can_access_company(v_company_id) THEN
    RAISE EXCEPTION 'Access denied for company.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tmsa_kpis k
    WHERE k.id = p_kpi_id
      AND k.is_active = true
  ) THEN
    RAISE EXCEPTION 'KPI not found.';
  END IF;

  SELECT m.id
  INTO v_matrix_id
  FROM public.tmsa_company_kpi_matrix m
  WHERE m.company_id = v_company_id
    AND m.kpi_id = p_kpi_id
  LIMIT 1;

  IF v_matrix_id IS NULL THEN
    INSERT INTO public.tmsa_company_kpi_matrix (
      company_id,
      kpi_id,
      company_kpi_statement,
      company_best_practice_guidance,
      company_kpi_statement_updated_by,
      company_kpi_statement_updated_at,
      company_best_practice_guidance_updated_by,
      company_best_practice_guidance_updated_at,
      created_by,
      updated_by,
      updated_at
    )
    VALUES (
      v_company_id,
      p_kpi_id,
      nullif(trim(coalesce(p_company_kpi_statement, '')), ''),
      nullif(trim(coalesce(p_company_best_practice_guidance, '')), ''),
      CASE WHEN nullif(trim(coalesce(p_company_kpi_statement, '')), '') IS NOT NULL THEN v_me.user_id ELSE NULL END,
      CASE WHEN nullif(trim(coalesce(p_company_kpi_statement, '')), '') IS NOT NULL THEN now() ELSE NULL END,
      CASE WHEN nullif(trim(coalesce(p_company_best_practice_guidance, '')), '') IS NOT NULL THEN v_me.user_id ELSE NULL END,
      CASE WHEN nullif(trim(coalesce(p_company_best_practice_guidance, '')), '') IS NOT NULL THEN now() ELSE NULL END,
      v_me.user_id,
      v_me.user_id,
      now()
    )
    RETURNING id INTO v_matrix_id;
  ELSE
    UPDATE public.tmsa_company_kpi_matrix
    SET
      company_kpi_statement = nullif(trim(coalesce(p_company_kpi_statement, '')), ''),
      company_best_practice_guidance = nullif(trim(coalesce(p_company_best_practice_guidance, '')), ''),

      company_kpi_statement_updated_by =
        CASE
          WHEN nullif(trim(coalesce(p_company_kpi_statement, '')), '') IS NOT NULL
            THEN v_me.user_id
          ELSE NULL
        END,

      company_kpi_statement_updated_at =
        CASE
          WHEN nullif(trim(coalesce(p_company_kpi_statement, '')), '') IS NOT NULL
            THEN now()
          ELSE NULL
        END,

      company_best_practice_guidance_updated_by =
        CASE
          WHEN nullif(trim(coalesce(p_company_best_practice_guidance, '')), '') IS NOT NULL
            THEN v_me.user_id
          ELSE NULL
        END,

      company_best_practice_guidance_updated_at =
        CASE
          WHEN nullif(trim(coalesce(p_company_best_practice_guidance, '')), '') IS NOT NULL
            THEN now()
          ELSE NULL
        END,

      updated_by = v_me.user_id,
      updated_at = now()
    WHERE id = v_matrix_id;
  END IF;

  RETURN v_matrix_id;
END;
$$;


-- ============================================================
-- 4. Reset company narrative overrides to original imported text
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_reset_kpi_narrative_override(uuid, uuid, boolean, boolean);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_reset_kpi_narrative_override(
  p_kpi_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_reset_kpi_statement boolean DEFAULT true,
  p_reset_best_practice_guidance boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record;
  v_company_id uuid;
  v_matrix_id uuid;
BEGIN
  SELECT *
  INTO v_me
  FROM public.csvb_tmsa_current_profile()
  LIMIT 1;

  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  v_company_id := coalesce(p_company_id, v_me.company_id);

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company is required.';
  END IF;

  IF NOT public.csvb_tmsa_can_access_company(v_company_id) THEN
    RAISE EXCEPTION 'Access denied for company.';
  END IF;

  SELECT m.id
  INTO v_matrix_id
  FROM public.tmsa_company_kpi_matrix m
  WHERE m.company_id = v_company_id
    AND m.kpi_id = p_kpi_id
  LIMIT 1;

  IF v_matrix_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.tmsa_company_kpi_matrix
  SET
    company_kpi_statement =
      CASE WHEN p_reset_kpi_statement THEN NULL ELSE company_kpi_statement END,
    company_kpi_statement_updated_by =
      CASE WHEN p_reset_kpi_statement THEN NULL ELSE company_kpi_statement_updated_by END,
    company_kpi_statement_updated_at =
      CASE WHEN p_reset_kpi_statement THEN NULL ELSE company_kpi_statement_updated_at END,

    company_best_practice_guidance =
      CASE WHEN p_reset_best_practice_guidance THEN NULL ELSE company_best_practice_guidance END,
    company_best_practice_guidance_updated_by =
      CASE WHEN p_reset_best_practice_guidance THEN NULL ELSE company_best_practice_guidance_updated_by END,
    company_best_practice_guidance_updated_at =
      CASE WHEN p_reset_best_practice_guidance THEN NULL ELSE company_best_practice_guidance_updated_at END,

    updated_by = v_me.user_id,
    updated_at = now()
  WHERE id = v_matrix_id;

  RETURN v_matrix_id;
END;
$$;


-- ============================================================
-- 5. Grants
-- ============================================================

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_kpi_narratives_for_me(text, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_save_kpi_narrative_override(uuid, uuid, text, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_reset_kpi_narrative_override(uuid, uuid, boolean, boolean)
TO authenticated;

COMMIT;


-- ============================================================
-- 6. Verification
-- ============================================================

SELECT
  'v04e_a_columns' AS check_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tmsa_company_kpi_matrix'
  AND column_name IN (
    'company_kpi_statement',
    'company_best_practice_guidance',
    'company_kpi_statement_updated_by',
    'company_kpi_statement_updated_at',
    'company_best_practice_guidance_updated_by',
    'company_best_practice_guidance_updated_at'
  )
ORDER BY column_name;

SELECT
  'v04e_a_functions' AS check_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'csvb_tmsa_kpi_narratives_for_me',
    'csvb_tmsa_save_kpi_narrative_override',
    'csvb_tmsa_reset_kpi_narrative_override'
  )
ORDER BY p.proname;
