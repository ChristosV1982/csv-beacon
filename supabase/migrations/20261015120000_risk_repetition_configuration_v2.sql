-- Add profile-version repetition controls and apply them to risk previews and snapshots.
-- Existing risk snapshots are not recalculated by this migration.

ALTER TABLE public.risk_rating_profile_versions
  ADD COLUMN IF NOT EXISTS repetition_lookback_mode text NOT NULL DEFAULT 'all_history',
  ADD COLUMN IF NOT EXISTS repetition_include_largely_as_expected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repetition_require_same_noc boolean NOT NULL DEFAULT false;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.risk_rating_profile_versions'::regclass
      AND conname = 'risk_rating_profile_versions_lookback_mode_chk'
  ) THEN
    ALTER TABLE public.risk_rating_profile_versions
      ADD CONSTRAINT risk_rating_profile_versions_lookback_mode_chk
      CHECK (repetition_lookback_mode IN ('all_history', 'last_n_months'));
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.csvb_admin_risk_rating_config_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- The existing config RPC serializes complete profile-version rows with to_jsonb,
  -- so the additive settings columns are included without changing its contract.
  RETURN public.csvb_admin_risk_rating_config();
END;
$function$;

CREATE OR REPLACE FUNCTION public.csvb_admin_risk_update_version_settings_v2(
  p_profile_version_id uuid,
  p_include_largely_as_expected boolean,
  p_repetition_scope text,
  p_repetition_lookback_mode text,
  p_repetition_lookback_months integer,
  p_repetition_include_largely_as_expected boolean,
  p_repetition_require_same_noc boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.risk_rating_profile_versions%rowtype;
BEGIN
  PERFORM public.csvb_require_platform_admin();

  IF p_profile_version_id IS NULL THEN
    RAISE EXCEPTION 'p_profile_version_id is required.';
  END IF;

  IF coalesce(p_repetition_scope, '') NOT IN ('company', 'vessel') THEN
    RAISE EXCEPTION 'Invalid repetition scope: %', p_repetition_scope;
  END IF;

  IF coalesce(p_repetition_lookback_mode, '') NOT IN ('all_history', 'last_n_months') THEN
    RAISE EXCEPTION 'Invalid repetition lookback mode: %', p_repetition_lookback_mode;
  END IF;

  IF coalesce(p_repetition_lookback_months, 0) <= 0 THEN
    RAISE EXCEPTION 'Repetition lookback months must be greater than zero.';
  END IF;

  UPDATE public.risk_rating_profile_versions
  SET
    include_largely_as_expected = coalesce(p_include_largely_as_expected, false),
    repetition_scope = p_repetition_scope,
    repetition_lookback_mode = p_repetition_lookback_mode,
    repetition_lookback_months = p_repetition_lookback_months,
    repetition_include_largely_as_expected = coalesce(p_repetition_include_largely_as_expected, false),
    repetition_require_same_noc = coalesce(p_repetition_require_same_noc, false),
    updated_at = now()
  WHERE id = p_profile_version_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Risk rating profile version not found: %', p_profile_version_id;
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.csvb_admin_risk_clone_profile_v2(
  p_source_profile_version_id uuid,
  p_new_profile_code text,
  p_new_profile_name text,
  p_description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_new_version_id uuid;
BEGIN
  PERFORM public.csvb_require_platform_admin();

  v_result := public.csvb_admin_risk_clone_profile(
    p_source_profile_version_id,
    p_new_profile_code,
    p_new_profile_name,
    p_description
  );

  v_new_version_id := nullif(v_result->>'profile_version_id', '')::uuid;

  UPDATE public.risk_rating_profile_versions AS destination
  SET
    repetition_lookback_mode = source.repetition_lookback_mode,
    repetition_include_largely_as_expected = source.repetition_include_largely_as_expected,
    repetition_require_same_noc = source.repetition_require_same_noc
  FROM public.risk_rating_profile_versions AS source
  WHERE source.id = p_source_profile_version_id
    AND destination.id = v_new_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Could not copy repetition settings to the cloned profile version.';
  END IF;

  RETURN v_result;
END;
$function$;

-- Preserve the deployed calculation as the base calculation for all non-repetition factors.
-- The public function below replaces only repetition counts/factors and the resulting totals.
DO $migration$
BEGIN
  IF to_regprocedure('public.csvb_calculate_post_inspection_risk_preview_legacy(uuid,uuid,uuid)') IS NULL THEN
    ALTER FUNCTION public.csvb_calculate_post_inspection_risk_preview(uuid, uuid, uuid)
      RENAME TO csvb_calculate_post_inspection_risk_preview_legacy;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.csvb_risk_repetition_count_v2(
  p_profile_version_id uuid,
  p_report_id uuid,
  p_question_base text,
  p_designation text,
  p_noc text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text;
  v_lookback_mode text;
  v_lookback_months integer;
  v_count_largely boolean;
  v_require_same_noc boolean;
  v_inspection_date date;
  v_vessel_id uuid;
  v_company_id uuid;
  v_lookback_start date;
  v_count integer := 0;
BEGIN
  IF p_report_id IS NULL OR p_profile_version_id IS NULL
     OR nullif(trim(coalesce(p_question_base, '')), '') IS NULL
     OR nullif(trim(coalesce(p_designation, '')), '') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    repetition_scope,
    repetition_lookback_mode,
    repetition_lookback_months,
    repetition_include_largely_as_expected,
    repetition_require_same_noc
  INTO
    v_scope,
    v_lookback_mode,
    v_lookback_months,
    v_count_largely,
    v_require_same_noc
  FROM public.risk_rating_profile_versions
  WHERE id = p_profile_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk rating profile version not found: %', p_profile_version_id;
  END IF;

  SELECT r.inspection_date, r.vessel_id, v.company_id
  INTO v_inspection_date, v_vessel_id, v_company_id
  FROM public.post_inspection_reports r
  LEFT JOIN public.vessels v ON v.id = r.vessel_id
  WHERE r.id = p_report_id;

  IF v_inspection_date IS NULL THEN
    RETURN 0;
  END IF;

  IF v_lookback_mode = 'last_n_months' THEN
    v_lookback_start := (v_inspection_date - make_interval(months => v_lookback_months))::date;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM (
    SELECT
      oi.*,
      rr.id AS historical_report_id,
      rr.inspection_date AS historical_inspection_date,
      rr.vessel_id AS historical_vessel_id,
      vv.company_id AS historical_company_id,
      public.csvb_canonical_question_no(coalesce(oi.question_base, oi.question_no)) AS historical_question_base,
      CASE lower(trim(coalesce(oi.designation, '')))
        WHEN 'hardware' THEN 'Hardware'
        WHEN 'process' THEN 'Process'
        WHEN 'human' THEN 'Human'
        WHEN 'photo' THEN 'Photo'
        WHEN 'photograph' THEN 'Photo'
        ELSE trim(coalesce(oi.designation, ''))
      END AS historical_designation,
      CASE lower(trim(coalesce(oi.obs_type, '')))
        WHEN 'negative' THEN 'negative'
        WHEN 'positive' THEN 'positive'
        WHEN 'largely' THEN 'largely'
        ELSE CASE lower(trim(coalesce(oi.observation_type, '')))
          WHEN 'negative_observation' THEN 'negative'
          WHEN 'positive_observation' THEN 'positive'
          WHEN 'note_improvement' THEN 'largely'
          ELSE ''
        END
      END AS historical_finding_type
    FROM public.post_inspection_observation_items oi
    JOIN public.post_inspection_reports rr ON rr.id = oi.report_id
    LEFT JOIN public.vessels vv ON vv.id = rr.vessel_id
  ) AS history
  LEFT JOIN LATERAL (
    SELECT ns.noc_text
    FROM public.risk_noc_scores ns
    JOIN LATERAL regexp_split_to_table(
      coalesce(history.classification_coding, '') || '|' || coalesce(history.nature_of_concern, ''),
      '\|'
    ) AS candidate(raw_text) ON true
    WHERE ns.profile_version_id = p_profile_version_id
      AND ns.designation = 'Human'
      AND history.historical_designation = 'Human'
      AND public.csvb_risk_norm_text(ns.noc_text) = public.csvb_risk_norm_text(candidate.raw_text)
    ORDER BY ns.score DESC, ns.sort_order ASC
    LIMIT 1
  ) AS human_noc ON true
  WHERE history.historical_report_id <> p_report_id
    AND history.historical_inspection_date < v_inspection_date
    AND (
      v_lookback_mode = 'all_history'
      OR history.historical_inspection_date >= v_lookback_start
    )
    AND history.historical_question_base = p_question_base
    AND history.historical_designation = p_designation
    AND (
      history.historical_finding_type = 'negative'
      OR (v_count_largely AND history.historical_finding_type = 'largely')
    )
    AND (
      NOT v_require_same_noc
      OR public.csvb_risk_norm_text(
        CASE
          WHEN history.historical_designation = 'Human' THEN coalesce(human_noc.noc_text, '')
          ELSE coalesce(history.nature_of_concern, '')
        END
      ) = public.csvb_risk_norm_text(coalesce(p_noc, ''))
    )
    AND (
      (v_scope = 'company' AND history.historical_company_id = v_company_id)
      OR
      (v_scope = 'vessel' AND history.historical_vessel_id = v_vessel_id)
    );

  RETURN coalesce(v_count, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.csvb_calculate_post_inspection_risk_preview(
  p_report_id uuid,
  p_profile_id uuid DEFAULT NULL::uuid,
  p_profile_version_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_profile jsonb;
  v_summary jsonb;
  v_observation jsonb;
  v_factors jsonb;
  v_observations jsonb := '[]'::jsonb;
  v_profile_version_id uuid;
  v_lookback_mode text;
  v_lookback_months integer;
  v_count_largely boolean;
  v_require_same_noc boolean;
  v_repeat_count integer;
  v_repeat_factor numeric;
  v_score numeric;
  v_total_score numeric := 0;
  v_max_score numeric := 0;
  v_eligible_count integer := 0;
  v_examined_count integer;
  v_included boolean;
BEGIN
  v_result := public.csvb_calculate_post_inspection_risk_preview_legacy(
    p_report_id,
    p_profile_id,
    p_profile_version_id
  );

  v_profile := coalesce(v_result->'rating_profile', '{}'::jsonb);
  v_profile_version_id := nullif(v_profile->>'profile_version_id', '')::uuid;
  IF v_profile_version_id IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT
    repetition_lookback_mode,
    repetition_lookback_months,
    repetition_include_largely_as_expected,
    repetition_require_same_noc
  INTO
    v_lookback_mode,
    v_lookback_months,
    v_count_largely,
    v_require_same_noc
  FROM public.risk_rating_profile_versions
  WHERE id = v_profile_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Risk rating profile version not found: %', v_profile_version_id;
  END IF;

  FOR v_observation IN
    SELECT value
    FROM jsonb_array_elements(coalesce(v_result->'observations', '[]'::jsonb))
  LOOP
    v_factors := coalesce(v_observation->'factors', '{}'::jsonb);
    v_repeat_count := public.csvb_risk_repetition_count_v2(
      v_profile_version_id,
      p_report_id,
      v_observation->>'question_base',
      v_observation->>'designation',
      coalesce(v_observation->>'noc', '')
    );

    SELECT rf.factor
    INTO v_repeat_factor
    FROM public.risk_repetition_factors rf
    WHERE rf.profile_version_id = v_profile_version_id
      AND v_repeat_count >= rf.min_count
      AND (rf.max_count IS NULL OR v_repeat_count <= rf.max_count)
    ORDER BY rf.sort_order
    LIMIT 1;
    v_repeat_factor := coalesce(v_repeat_factor, 1.0000);

    v_factors := v_factors || jsonb_build_object(
      'repetition_scope', v_profile->>'repetition_scope',
      'repetition_lookback_mode', v_lookback_mode,
      'repetition_lookback_months', v_lookback_months,
      'repetition_include_largely_as_expected', coalesce(v_count_largely, false),
      'repetition_require_same_noc', coalesce(v_require_same_noc, false),
      'repetition_match_key', CASE
        WHEN coalesce(v_require_same_noc, false) THEN 'question_designation_noc'
        ELSE 'question_designation'
      END,
      'repetition_counted_finding_types', CASE
        WHEN coalesce(v_count_largely, false) THEN jsonb_build_array('negative', 'largely')
        ELSE jsonb_build_array('negative')
      END,
      'repetition_count_previous', v_repeat_count,
      'repetition_factor', v_repeat_factor
    );

    v_included := coalesce((v_observation->>'included_in_risk')::boolean, false);
    IF v_included THEN
      v_score := round(
        coalesce(nullif(v_factors->>'finding_type_factor', '')::numeric, 0)
        * coalesce(nullif(v_factors->>'question_type_weight', '')::numeric, 0)
        * coalesce(nullif(v_factors->>'noc_score', '')::numeric, 0)
        * coalesce(nullif(v_factors->>'vessel_age_factor', '')::numeric, 1)
        * v_repeat_factor,
        4
      );
      v_eligible_count := v_eligible_count + 1;
      v_total_score := v_total_score + v_score;
      v_max_score := greatest(v_max_score, v_score);
    ELSE
      v_score := 0;
    END IF;

    v_observation := jsonb_set(v_observation, '{factors}', v_factors, true);
    v_observation := jsonb_set(v_observation, '{risk_score}', to_jsonb(v_score), true);
    v_observations := v_observations || jsonb_build_array(v_observation);
  END LOOP;

  v_profile := v_profile || jsonb_build_object(
    'repetition_lookback_mode', v_lookback_mode,
    'repetition_lookback_months', v_lookback_months,
    'repetition_include_largely_as_expected', coalesce(v_count_largely, false),
    'repetition_require_same_noc', coalesce(v_require_same_noc, false),
    'repetition_match_key', CASE
      WHEN coalesce(v_require_same_noc, false) THEN 'question_designation_noc'
      ELSE 'question_designation'
    END,
    'repetition_counted_finding_types', CASE
      WHEN coalesce(v_count_largely, false) THEN jsonb_build_array('negative', 'largely')
      ELSE jsonb_build_array('negative')
    END
  );

  v_summary := coalesce(v_result->'summary', '{}'::jsonb);
  v_examined_count := nullif(v_result->'report'->>'examined_count', '')::integer;
  v_summary := v_summary || jsonb_build_object(
    'eligible_risk_observations', v_eligible_count,
    'total_risk_score', round(v_total_score, 4),
    'average_observation_risk', CASE
      WHEN v_eligible_count > 0 THEN round(v_total_score / v_eligible_count, 4)
      ELSE 0
    END,
    'max_observation_risk', round(v_max_score, 4),
    'risk_per_examined_question', CASE
      WHEN coalesce(v_examined_count, 0) > 0 THEN round(v_total_score / v_examined_count, 4)
      ELSE NULL
    END
  );

  v_result := jsonb_set(v_result, '{rating_profile}', v_profile, true);
  v_result := jsonb_set(v_result, '{observations}', v_observations, true);
  v_result := jsonb_set(v_result, '{summary}', v_summary, true);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.csvb_risk_repetition_count_v2(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.csvb_calculate_post_inspection_risk_preview_legacy(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.csvb_admin_risk_rating_config_v2()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csvb_admin_risk_update_version_settings_v2(uuid, boolean, text, text, integer, boolean, boolean)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csvb_admin_risk_clone_profile_v2(uuid, text, text, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.csvb_calculate_post_inspection_risk_preview(uuid, uuid, uuid)
  TO anon, authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261015120000', 'risk_repetition_configuration_v2')
ON CONFLICT (version) DO NOTHING;
