-- ============================================================
-- C.S.V. BEACON
-- TMSA Element Targets + KPI Evidence Upload v01 - 2026-06-15
--
-- Purpose:
--   Archive the Supabase-side SQL applied for:
--   - Element-level target level
--   - KPI default short titles
--   - KPI owner department / short title metadata save helper
--   - Guarded department archive helper
--   - Private Supabase Storage bucket for KPI evidence files
--   - Per-KPI evidence records helper
--   - Extended KPI support payload including evidence records
--
-- Applied live in Supabase during v04C / v04D-A / v04D-B.
--
-- Notes:
--   - This archive assumes the earlier TMSA KPI support structures
--     already exist: tmsa_departments, tmsa_kpi_presenter_links,
--     tmsa_kpi_internal_notes, tmsa_kpi_policy_links.
--   - Evidence files are stored in Supabase Storage bucket:
--       tmsa-kpi-evidence
--   - Storage path convention:
--       company_id / element_code / kpi_code / filename
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Guarded department archive helper
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_archive_department(uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_archive_department(
  p_department_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record;
  v_company_id uuid;
  v_department_name text;
BEGIN
  SELECT *
  INTO v_me
  FROM public.csvb_tmsa_current_profile()
  LIMIT 1;

  IF v_me.user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT
    d.company_id,
    d.department_name
  INTO
    v_company_id,
    v_department_name
  FROM public.tmsa_departments d
  WHERE d.id = p_department_id
    AND d.is_active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Department not found or already inactive.';
  END IF;

  IF NOT (public.csvb_tmsa_can_manage_company(v_company_id) OR public.csvb_tmsa_is_admin()) THEN
    RAISE EXCEPTION 'Access denied to delete department.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tmsa_company_kpi_matrix m
    WHERE m.owner_department_id = p_department_id
  ) THEN
    RAISE EXCEPTION 'Cannot delete department "%" because it is assigned to one or more KPI records.', v_department_name;
  END IF;

  UPDATE public.tmsa_departments
  SET
    is_active = false,
    updated_at = now()
  WHERE id = p_department_id;

  RETURN true;
END;
$$;


-- ============================================================
-- 2. KPI short title / owner department columns
-- ============================================================

ALTER TABLE public.tmsa_kpis
ADD COLUMN IF NOT EXISTS default_short_title text;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS kpi_short_title text;

ALTER TABLE public.tmsa_company_kpi_matrix
ADD COLUMN IF NOT EXISTS owner_department_id uuid REFERENCES public.tmsa_departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tmsa_company_kpi_matrix_owner_department_idx
ON public.tmsa_company_kpi_matrix(owner_department_id);


-- ============================================================
-- 3. Element-level target table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tmsa_company_element_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  element_id uuid NOT NULL REFERENCES public.tmsa_elements(id) ON DELETE CASCADE,
  target_level integer CHECK (target_level IS NULL OR target_level BETWEEN 1 AND 4),
  target_note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tmsa_company_element_targets_uq
ON public.tmsa_company_element_targets(company_id, element_id);

CREATE INDEX IF NOT EXISTS tmsa_company_element_targets_company_idx
ON public.tmsa_company_element_targets(company_id);

ALTER TABLE public.tmsa_company_element_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tmsa_company_element_targets_select
ON public.tmsa_company_element_targets;

CREATE POLICY tmsa_company_element_targets_select
ON public.tmsa_company_element_targets
FOR SELECT
TO authenticated
USING (public.csvb_tmsa_can_access_company(company_id));

DROP POLICY IF EXISTS tmsa_company_element_targets_write
ON public.tmsa_company_element_targets;

CREATE POLICY tmsa_company_element_targets_write
ON public.tmsa_company_element_targets
FOR ALL
TO authenticated
USING (public.csvb_tmsa_can_access_company(company_id))
WITH CHECK (public.csvb_tmsa_can_access_company(company_id));


-- ============================================================
-- 4. Seed Element 1 KPI default short titles
-- ============================================================

WITH title_seed AS (
  SELECT *
  FROM (
    VALUES
      ('1.1.1', 'Management commitment documentation'),
      ('1.1.2', 'Senior management SMS commitment'),
      ('1.1.3', 'HSSE excellence support'),
      ('1.2.1', 'Understanding HSSE excellence'),
      ('1.2.2', 'Safety and environmental improvement plan'),
      ('1.2.3', 'Leadership promotes HSSE excellence'),
      ('1.3.1', 'HSSE targets and measurements'),
      ('1.3.2', 'Action plan steps to HSSE excellence'),
      ('1.4.1', 'HSSE targets in management meetings'),
      ('1.4.2', 'KPI monitoring of HSSE targets'),
      ('1.4.3', 'Personnel commitment to HSSE excellence'),
      ('1.4.4', 'Strategic HSSE improvement plan')
  ) AS v(kpi_code, default_short_title)
)
UPDATE public.tmsa_kpis k
SET
  default_short_title = s.default_short_title,
  updated_at = now()
FROM title_seed s
WHERE k.kpi_code = s.kpi_code
  AND k.is_active = true;


-- ============================================================
-- 5. Element target read helper
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_element_target_for_me(text, uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_element_target_for_me(
  p_element_code text,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  element_id uuid,
  element_code text,
  element_title text,
  company_id uuid,
  target_level integer,
  target_note text,
  updated_at timestamptz
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
    e.id AS element_id,
    e.element_code,
    e.element_title,
    v_company_id AS company_id,
    t.target_level,
    t.target_note,
    t.updated_at
  FROM public.tmsa_elements e
  LEFT JOIN public.tmsa_company_element_targets t
    ON t.element_id = e.id
   AND t.company_id = v_company_id
  WHERE e.element_code = p_element_code
    AND e.is_active = true
  LIMIT 1;
END;
$$;


-- ============================================================
-- 6. Element target save helper
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_save_element_target_level(text, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_save_element_target_level(
  p_element_code text,
  p_company_id uuid DEFAULT NULL,
  p_target_level integer DEFAULT NULL,
  p_target_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me record;
  v_company_id uuid;
  v_element_id uuid;
  v_id uuid;
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

  IF p_target_level IS NOT NULL AND (p_target_level < 1 OR p_target_level > 4) THEN
    RAISE EXCEPTION 'Target level must be between 1 and 4.';
  END IF;

  IF NOT public.csvb_tmsa_can_access_company(v_company_id) THEN
    RAISE EXCEPTION 'Access denied for company.';
  END IF;

  SELECT e.id
  INTO v_element_id
  FROM public.tmsa_elements e
  WHERE e.element_code = p_element_code
    AND e.is_active = true
  LIMIT 1;

  IF v_element_id IS NULL THEN
    RAISE EXCEPTION 'TMSA element not found: %', p_element_code;
  END IF;

  INSERT INTO public.tmsa_company_element_targets (
    company_id,
    element_id,
    target_level,
    target_note,
    created_by,
    updated_by,
    updated_at
  )
  VALUES (
    v_company_id,
    v_element_id,
    p_target_level,
    nullif(trim(coalesce(p_target_note, '')), ''),
    v_me.user_id,
    v_me.user_id,
    now()
  )
  ON CONFLICT (company_id, element_id)
  DO UPDATE SET
    target_level = EXCLUDED.target_level,
    target_note = EXCLUDED.target_note,
    updated_by = EXCLUDED.updated_by,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 7. KPI title helper
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_kpi_titles_for_me(text, uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_kpi_titles_for_me(
  p_element_code text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  kpi_id uuid,
  element_code text,
  kpi_code text,
  kpi_level integer,
  default_short_title text,
  company_short_title text,
  effective_short_title text
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
    k.kpi_code,
    k.kpi_level,
    k.default_short_title,
    m.kpi_short_title AS company_short_title,
    coalesce(
      nullif(trim(coalesce(m.kpi_short_title, '')), ''),
      nullif(trim(coalesce(k.default_short_title, '')), '')
    ) AS effective_short_title
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
-- 8. KPI workspace metadata save helper
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_save_kpi_workspace_meta_v04(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_save_kpi_workspace_meta_v04(
  p_kpi_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_kpi_short_title text DEFAULT NULL,
  p_owner_department_id uuid DEFAULT NULL
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

  IF p_owner_department_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.tmsa_departments d
    WHERE d.id = p_owner_department_id
      AND d.company_id = v_company_id
      AND d.is_active = true
  ) THEN
    RAISE EXCEPTION 'Owner department does not belong to this company.';
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
      kpi_short_title,
      owner_department_id,
      created_by,
      updated_by,
      updated_at
    )
    VALUES (
      v_company_id,
      p_kpi_id,
      nullif(trim(coalesce(p_kpi_short_title, '')), ''),
      p_owner_department_id,
      v_me.user_id,
      v_me.user_id,
      now()
    )
    RETURNING id INTO v_matrix_id;
  ELSE
    UPDATE public.tmsa_company_kpi_matrix
    SET
      kpi_short_title = nullif(trim(coalesce(p_kpi_short_title, '')), ''),
      owner_department_id = p_owner_department_id,
      updated_by = v_me.user_id,
      updated_at = now()
    WHERE id = v_matrix_id;
  END IF;

  RETURN v_matrix_id;
END;
$$;


-- ============================================================
-- 9. Private storage bucket for per-KPI evidence
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'tmsa-kpi-evidence',
  'tmsa-kpi-evidence',
  false,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = now();


-- ============================================================
-- 10. Storage policies
-- ============================================================

DROP POLICY IF EXISTS "tmsa_kpi_evidence_select_by_company"
ON storage.objects;

CREATE POLICY "tmsa_kpi_evidence_select_by_company"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tmsa-kpi-evidence'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.csvb_tmsa_can_access_company(split_part(name, '/', 1)::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "tmsa_kpi_evidence_insert_by_company"
ON storage.objects;

CREATE POLICY "tmsa_kpi_evidence_insert_by_company"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tmsa-kpi-evidence'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.csvb_tmsa_can_access_company(split_part(name, '/', 1)::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "tmsa_kpi_evidence_update_by_company_manager"
ON storage.objects;

CREATE POLICY "tmsa_kpi_evidence_update_by_company_manager"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tmsa-kpi-evidence'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (
      public.csvb_tmsa_can_manage_company(split_part(name, '/', 1)::uuid)
      OR public.csvb_tmsa_is_admin()
    )
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'tmsa-kpi-evidence'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (
      public.csvb_tmsa_can_manage_company(split_part(name, '/', 1)::uuid)
      OR public.csvb_tmsa_is_admin()
    )
    ELSE false
  END
);

DROP POLICY IF EXISTS "tmsa_kpi_evidence_delete_by_company_manager"
ON storage.objects;

CREATE POLICY "tmsa_kpi_evidence_delete_by_company_manager"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tmsa-kpi-evidence'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (
      public.csvb_tmsa_can_manage_company(split_part(name, '/', 1)::uuid)
      OR public.csvb_tmsa_is_admin()
    )
    ELSE false
  END
);


-- ============================================================
-- 11. Per-KPI evidence records helper
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_kpi_records_for_me(uuid, uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_kpi_records_for_me(
  p_kpi_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  link_id uuid,
  evidence_id uuid,
  company_id uuid,
  kpi_id uuid,
  evidence_title text,
  evidence_type text,
  document_reference text,
  sms_reference text,
  owner_department text,
  storage_path text,
  file_name text,
  file_type text,
  evidence_strength text,
  confidentiality_level text,
  remarks text,
  link_note text,
  is_primary boolean,
  evidence_is_active boolean,
  uploaded_by_username text,
  created_at timestamptz,
  updated_at timestamptz
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
    l.id AS link_id,
    e.id AS evidence_id,
    e.company_id,
    l.kpi_id,
    e.evidence_title,
    e.evidence_type,
    e.document_reference,
    e.sms_reference,
    e.owner_department,
    e.storage_path,
    e.file_name,
    e.file_type,
    e.evidence_strength,
    e.confidentiality_level,
    e.remarks,
    l.link_note,
    l.is_primary,
    e.is_active AS evidence_is_active,
    NULL::text AS uploaded_by_username,
    e.created_at,
    e.updated_at
  FROM public.tmsa_kpi_evidence_links l
  JOIN public.tmsa_evidence_register e
    ON e.id = l.evidence_id
  WHERE l.company_id = v_company_id
    AND e.company_id = v_company_id
    AND l.kpi_id = p_kpi_id
    AND coalesce(e.is_active, true) = true
  ORDER BY
    l.is_primary DESC,
    e.created_at DESC;
END;
$$;


-- ============================================================
-- 12. Extended KPI support payload with evidence records
-- ============================================================

DROP FUNCTION IF EXISTS public.csvb_tmsa_kpi_support_for_me(uuid, uuid);

CREATE OR REPLACE FUNCTION public.csvb_tmsa_kpi_support_for_me(
  p_kpi_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  departments jsonb,
  personnel jsonb,
  presenters jsonb,
  internal_notes jsonb,
  policy_links jsonb,
  matrix_meta jsonb,
  evidence_records jsonb
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.tmsa_kpis k
    WHERE k.id = p_kpi_id
      AND k.is_active = true
  ) THEN
    RAISE EXCEPTION 'KPI not found.';
  END IF;

  RETURN QUERY
  SELECT
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'department_name', d.department_name
        )
        ORDER BY d.department_name
      )
      FROM public.tmsa_departments d
      WHERE d.company_id = v_company_id
        AND d.is_active = true
    ), '[]'::jsonb) AS departments,

    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'profile_id', p.profile_id,
          'username', p.username,
          'role_name', p.role_name,
          'user_position', p.user_position,
          'display_label', p.display_label
        )
        ORDER BY p.display_label
      )
      FROM public.csvb_tmsa_personnel_for_me(v_company_id) p
      WHERE p.is_active = true
    ), '[]'::jsonb) AS personnel,

    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'profile_id', l.profile_id,
          'presenter_label', l.presenter_label,
          'sort_order', l.sort_order
        )
        ORDER BY l.sort_order, l.created_at
      )
      FROM public.tmsa_kpi_presenter_links l
      WHERE l.company_id = v_company_id
        AND l.kpi_id = p_kpi_id
        AND l.is_active = true
    ), '[]'::jsonb) AS presenters,

    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'note_text', n.note_text,
          'note_type', n.note_type,
          'created_by_username', n.created_by_username,
          'created_at', n.created_at
        )
        ORDER BY n.created_at DESC
      )
      FROM public.tmsa_kpi_internal_notes n
      WHERE n.company_id = v_company_id
        AND n.kpi_id = p_kpi_id
        AND n.is_active = true
    ), '[]'::jsonb) AS internal_notes,

    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', pl.id,
          'link_kind', pl.link_kind,
          'policy_node_id', pl.policy_node_id,
          'policy_document_id', pl.policy_document_id,
          'reference_code', pl.reference_code,
          'display_label', pl.display_label,
          'link_note', pl.link_note,
          'sort_order', pl.sort_order
        )
        ORDER BY pl.link_kind, pl.sort_order, pl.created_at
      )
      FROM public.tmsa_kpi_policy_links pl
      WHERE pl.company_id = v_company_id
        AND pl.kpi_id = p_kpi_id
        AND pl.is_active = true
    ), '[]'::jsonb) AS policy_links,

    coalesce((
      SELECT jsonb_build_object(
        'matrix_id', m.id,
        'kpi_short_title', m.kpi_short_title,
        'owner_department_id', m.owner_department_id
      )
      FROM public.tmsa_company_kpi_matrix m
      WHERE m.company_id = v_company_id
        AND m.kpi_id = p_kpi_id
      LIMIT 1
    ), '{}'::jsonb) AS matrix_meta,

    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'link_id', r.link_id,
          'evidence_id', r.evidence_id,
          'evidence_title', r.evidence_title,
          'evidence_type', r.evidence_type,
          'document_reference', r.document_reference,
          'sms_reference', r.sms_reference,
          'owner_department', r.owner_department,
          'storage_path', r.storage_path,
          'file_name', r.file_name,
          'file_type', r.file_type,
          'evidence_strength', r.evidence_strength,
          'confidentiality_level', r.confidentiality_level,
          'remarks', r.remarks,
          'link_note', r.link_note,
          'is_primary', r.is_primary,
          'uploaded_by_username', r.uploaded_by_username,
          'created_at', r.created_at
        )
        ORDER BY r.is_primary DESC, r.created_at DESC
      )
      FROM public.csvb_tmsa_kpi_records_for_me(p_kpi_id, v_company_id) r
    ), '[]'::jsonb) AS evidence_records;
END;
$$;


-- ============================================================
-- 13. Grants
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.tmsa_company_element_targets
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_archive_department(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_element_target_for_me(text, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_save_element_target_level(text, uuid, integer, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_kpi_titles_for_me(text, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_save_kpi_workspace_meta_v04(uuid, uuid, text, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_kpi_records_for_me(uuid, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_tmsa_kpi_support_for_me(uuid, uuid)
TO authenticated;

COMMIT;


-- ============================================================
-- 14. Verification
-- ============================================================

SELECT
  'element_targets_table' AS check_name,
  to_regclass('public.tmsa_company_element_targets') AS table_name;

SELECT
  'element_1_default_short_titles' AS check_name,
  count(*) AS element_1_kpis,
  count(*) FILTER (
    WHERE nullif(trim(coalesce(k.default_short_title, '')), '') IS NOT NULL
  ) AS seeded_short_titles
FROM public.tmsa_elements e
JOIN public.tmsa_kpis k
  ON k.element_id = e.id
WHERE e.element_code = '1'
  AND k.is_active = true;

SELECT
  'tmsa_kpi_evidence_bucket' AS check_name,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'tmsa-kpi-evidence';

SELECT
  'storage_policies' AS check_name,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'tmsa_kpi_evidence_select_by_company',
    'tmsa_kpi_evidence_insert_by_company',
    'tmsa_kpi_evidence_update_by_company_manager',
    'tmsa_kpi_evidence_delete_by_company_manager'
  )
ORDER BY policyname;

SELECT
  'workspace_evidence_functions' AS check_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'csvb_tmsa_archive_department',
    'csvb_tmsa_element_target_for_me',
    'csvb_tmsa_save_element_target_level',
    'csvb_tmsa_kpi_titles_for_me',
    'csvb_tmsa_save_kpi_workspace_meta_v04',
    'csvb_tmsa_kpi_records_for_me',
    'csvb_tmsa_kpi_support_for_me'
  )
ORDER BY p.proname;
