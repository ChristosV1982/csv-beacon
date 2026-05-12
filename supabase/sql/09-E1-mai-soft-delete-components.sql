-- ============================================================
-- SQL 09-E1
-- C.S.V. BEACON / SIRE 2.0
-- Marine Applications & Vessel Interaction
-- Mooring and Anchoring Inventories
--
-- Purpose:
--   Add audited soft-delete / restore capability for MAI components.
--
-- Important:
--   This does NOT physically delete components or their linked records.
--   It hides deleted components from the normal inventory list by filtering
--   mai_v_components_list where deleted_at is null.
--
-- Scope:
--   - Adds soft-delete metadata columns to mai_components if missing.
--   - Adds audit log table for component delete/restore actions.
--   - Adds SECURITY DEFINER RPCs:
--       public.mai_soft_delete_component(p_component_id, p_delete_reason)
--       public.mai_restore_component(p_component_id, p_restore_reason)
--   - Replaces public.mai_v_components_list with the same output columns,
--     excluding components with deleted_at populated.
--
-- Permissions:
--   - super_admin / platform_owner: any component
--   - company_admin / company_superintendent: own company components
--   - vessel users: no delete/restore permission
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Soft-delete metadata on base component table
-- ------------------------------------------------------------

ALTER TABLE public.mai_components
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS restore_reason text;

CREATE INDEX IF NOT EXISTS idx_mai_components_deleted_at
  ON public.mai_components (deleted_at);

CREATE INDEX IF NOT EXISTS idx_mai_components_company_deleted
  ON public.mai_components (company_id, deleted_at);


-- ------------------------------------------------------------
-- 2. Audit log table
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mai_component_delete_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.mai_components(id),
  company_id uuid,
  vessel_id uuid,
  unique_id text,
  action text NOT NULL CHECK (action IN ('soft_delete', 'restore')),
  action_reason text,
  action_by uuid REFERENCES public.profiles(id),
  action_at timestamptz NOT NULL DEFAULT now(),
  dependency_counts jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_mai_component_delete_log_component
  ON public.mai_component_delete_log (component_id, action_at DESC);

CREATE INDEX IF NOT EXISTS idx_mai_component_delete_log_company
  ON public.mai_component_delete_log (company_id, action_at DESC);


-- ------------------------------------------------------------
-- 3. Soft delete RPC
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mai_soft_delete_component(
  p_component_id uuid,
  p_delete_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_user_company_id uuid;

  v_component record;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_delete_reason, '')), '');
  v_dependency_counts jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Component delete failed: user is not authenticated.';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Component delete failed: delete reason is required.';
  END IF;

  SELECT
    p.role::text,
    p.company_id
  INTO
    v_role,
    v_user_company_id
  FROM public.profiles p
  WHERE p.id = v_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Component delete failed: current user profile was not found.';
  END IF;

  SELECT
    c.id,
    c.company_id,
    c.vessel_id,
    c.unique_id,
    c.deleted_at
  INTO v_component
  FROM public.mai_components c
  WHERE c.id = p_component_id
  FOR UPDATE;

  IF v_component.id IS NULL THEN
    RAISE EXCEPTION 'Component delete failed: component was not found.';
  END IF;

  IF v_component.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Component delete failed: component is already deleted.';
  END IF;

  IF NOT (
    v_role IN ('super_admin', 'platform_owner')
    OR (
      v_role IN ('company_admin', 'company_superintendent')
      AND v_user_company_id = v_component.company_id
    )
  ) THEN
    RAISE EXCEPTION 'Component delete failed: current user is not allowed to delete this component.';
  END IF;

  v_dependency_counts := jsonb_build_object(
    'usage_logs', (
      SELECT count(*)
      FROM public.mai_component_usage_logs u
      WHERE u.component_id = v_component.id
    ),
    'inspection_runs', (
      SELECT count(*)
      FROM public.mai_inspection_runs r
      WHERE r.component_id = v_component.id
    ),
    'lifecycle_events', (
      SELECT count(*)
      FROM public.mai_v_lifecycle_events_list e
      WHERE e.component_id = v_component.id
    ),
    'attachments', (
      SELECT count(*)
      FROM public.mai_component_attachments a
      WHERE a.component_id = v_component.id
    )
  );

  UPDATE public.mai_components
  SET
    is_active = false,
    deleted_at = v_now,
    deleted_by = v_user_id,
    delete_reason = v_reason,
    updated_at = v_now,
    updated_by = v_user_id
  WHERE id = v_component.id;

  INSERT INTO public.mai_component_delete_log (
    component_id,
    company_id,
    vessel_id,
    unique_id,
    action,
    action_reason,
    action_by,
    action_at,
    dependency_counts
  ) VALUES (
    v_component.id,
    v_component.company_id,
    v_component.vessel_id,
    v_component.unique_id,
    'soft_delete',
    v_reason,
    v_user_id,
    v_now,
    v_dependency_counts
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'soft_delete',
    'component_id', v_component.id,
    'unique_id', v_component.unique_id,
    'deleted_at', v_now,
    'dependency_counts', v_dependency_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mai_soft_delete_component(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mai_soft_delete_component(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.mai_soft_delete_component(uuid, text) IS
'Soft-deletes / hides an MAI component from normal inventory while preserving all linked audit/history records.';


-- ------------------------------------------------------------
-- 4. Restore RPC for future recovery by authorized office roles
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mai_restore_component(
  p_component_id uuid,
  p_restore_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_user_company_id uuid;

  v_component record;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_restore_reason, '')), '');
  v_dependency_counts jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Component restore failed: user is not authenticated.';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Component restore failed: restore reason is required.';
  END IF;

  SELECT
    p.role::text,
    p.company_id
  INTO
    v_role,
    v_user_company_id
  FROM public.profiles p
  WHERE p.id = v_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Component restore failed: current user profile was not found.';
  END IF;

  SELECT
    c.id,
    c.company_id,
    c.vessel_id,
    c.unique_id,
    c.deleted_at
  INTO v_component
  FROM public.mai_components c
  WHERE c.id = p_component_id
  FOR UPDATE;

  IF v_component.id IS NULL THEN
    RAISE EXCEPTION 'Component restore failed: component was not found.';
  END IF;

  IF v_component.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Component restore failed: component is not currently deleted.';
  END IF;

  IF NOT (
    v_role IN ('super_admin', 'platform_owner')
    OR (
      v_role IN ('company_admin', 'company_superintendent')
      AND v_user_company_id = v_component.company_id
    )
  ) THEN
    RAISE EXCEPTION 'Component restore failed: current user is not allowed to restore this component.';
  END IF;

  v_dependency_counts := jsonb_build_object(
    'usage_logs', (
      SELECT count(*)
      FROM public.mai_component_usage_logs u
      WHERE u.component_id = v_component.id
    ),
    'inspection_runs', (
      SELECT count(*)
      FROM public.mai_inspection_runs r
      WHERE r.component_id = v_component.id
    ),
    'lifecycle_events', (
      SELECT count(*)
      FROM public.mai_v_lifecycle_events_list e
      WHERE e.component_id = v_component.id
    ),
    'attachments', (
      SELECT count(*)
      FROM public.mai_component_attachments a
      WHERE a.component_id = v_component.id
    )
  );

  UPDATE public.mai_components
  SET
    is_active = true,
    deleted_at = null,
    deleted_by = null,
    delete_reason = null,
    restored_at = v_now,
    restored_by = v_user_id,
    restore_reason = v_reason,
    updated_at = v_now,
    updated_by = v_user_id
  WHERE id = v_component.id;

  INSERT INTO public.mai_component_delete_log (
    component_id,
    company_id,
    vessel_id,
    unique_id,
    action,
    action_reason,
    action_by,
    action_at,
    dependency_counts
  ) VALUES (
    v_component.id,
    v_component.company_id,
    v_component.vessel_id,
    v_component.unique_id,
    'restore',
    v_reason,
    v_user_id,
    v_now,
    v_dependency_counts
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'restore',
    'component_id', v_component.id,
    'unique_id', v_component.unique_id,
    'restored_at', v_now,
    'dependency_counts', v_dependency_counts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mai_restore_component(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mai_restore_component(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.mai_restore_component(uuid, text) IS
'Restores a previously soft-deleted MAI component and keeps an auditable restore log.';


-- ------------------------------------------------------------
-- 5. Normal component list view: exclude deleted components
-- ------------------------------------------------------------

CREATE OR REPLACE VIEW public.mai_v_components_list AS
 SELECT c.id,
    c.company_id,
    co.company_name,
    c.vessel_id,
    v.name AS vessel_name,
    v.hull_number,
    c.component_type_id,
    ct.code AS component_type_code,
    ct.name AS component_type_name,
    c.unique_id,
    c.order_number,
    c.sequence_number,
    c.current_status,
    so.status_label AS current_status_label,
    c.location_mode,
    c.fitted_position,
    c.storage_location,
        CASE
            WHEN c.location_mode = 'fitted'::text THEN c.fitted_position
            WHEN c.location_mode = 'storage'::text THEN c.storage_location
            ELSE c.location_mode
        END AS current_location_detail,
    c.notes,
    c.is_active,
    latest_inspection.inspection_date AS last_inspection_date,
    latest_inspection.next_due_date AS next_inspection_due_date,
    latest_inspection.result AS last_inspection_result,
    c.created_at,
    c.created_by,
    c.updated_at,
    c.updated_by
   FROM public.mai_components c
     JOIN public.companies co ON co.id = c.company_id
     JOIN public.vessels v ON v.id = c.vessel_id
     JOIN public.mai_component_types ct ON ct.id = c.component_type_id
     LEFT JOIN LATERAL ( SELECT so1.status_label
           FROM public.mai_status_options so1
          WHERE so1.status_key = c.current_status
            AND so1.is_active = true
            AND (so1.company_id IS NULL OR so1.company_id = c.company_id)
          ORDER BY (
                CASE
                    WHEN so1.company_id = c.company_id THEN 0
                    ELSE 1
                END), so1.sort_order
         LIMIT 1) so ON true
     LEFT JOIN LATERAL ( SELECT i.inspection_date,
            i.next_due_date,
            i.result
           FROM public.mai_component_inspections i
          WHERE i.component_id = c.id
          ORDER BY i.inspection_date DESC, i.created_at DESC
         LIMIT 1) latest_inspection ON true
  WHERE c.deleted_at IS NULL;

COMMENT ON VIEW public.mai_v_components_list IS
'Normal MAI component list view. Excludes components soft-deleted via mai_soft_delete_component.';

COMMIT;


-- ------------------------------------------------------------
-- 6. Verification only
-- ------------------------------------------------------------

SELECT
  'SQL 09-E1 installed: MAI audited soft-delete / restore RPCs are ready.' AS result;
