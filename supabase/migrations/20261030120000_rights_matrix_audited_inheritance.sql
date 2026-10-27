-- Backward-compatible optional "inherit": true entry on the existing audited RPC.
-- No permission rows are changed by this migration. Existing INSERT/UPDATE/DELETE
-- audit triggers remain the single source of role_permission_change_log records.
CREATE OR REPLACE FUNCTION csvb_vessel_policy_private.csvb_set_role_permissions_audited(
  p_role public.app_role,
  p_position text DEFAULT NULL,
  p_grants jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $function$
DECLARE
  r record;
  v_scope public.permission_scope;
  v_position text := NULLIF(trim(COALESCE(p_position, '')), '');
  v_updated integer := 0;
  v_inserted integer := 0;
  v_deleted integer := 0;
  v_rows integer;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform/super admin may update the platform Rights Matrix.';
  END IF;
  IF p_role IS NULL THEN RAISE EXCEPTION 'role is required.'; END IF;
  IF jsonb_typeof(COALESCE(p_grants, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_grants must be a JSON array.';
  END IF;
  FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_grants, '[]'::jsonb))
    AS x(permission_id uuid, scope text, is_granted boolean, inherit boolean)
  LOOP
    IF r.permission_id IS NULL THEN CONTINUE; END IF;
    IF COALESCE(r.inherit, false) THEN
      IF v_position IS NULL THEN
        RAISE EXCEPTION 'Only rank/position overrides may be reset to inherited rights.';
      END IF;
      DELETE FROM public.role_permissions
      WHERE role = p_role AND position = v_position AND permission_id = r.permission_id;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_deleted := v_deleted + v_rows;
      CONTINUE;
    END IF;
    v_scope := CASE WHEN COALESCE(r.is_granted, false)
      THEN COALESCE(NULLIF(trim(COALESCE(r.scope, '')), ''), 'global')::public.permission_scope
      ELSE 'global'::public.permission_scope END;
    UPDATE public.role_permissions
      SET scope = v_scope, is_granted = COALESCE(r.is_granted, false)
      WHERE role = p_role AND position IS NOT DISTINCT FROM v_position
        AND permission_id = r.permission_id;
    IF FOUND THEN
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO public.role_permissions(role, position, permission_id, scope, is_granted)
      VALUES (p_role, v_position, r.permission_id, v_scope, COALESCE(r.is_granted, false));
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'updated', v_updated,
    'inserted', v_inserted, 'deleted', v_deleted);
END;
$function$;
