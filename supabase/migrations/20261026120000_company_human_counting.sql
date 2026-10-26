-- Company policy changes calculation weights, never physical finding identity.
BEGIN;

CREATE TABLE public.company_human_counting_policies (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id),
  human_counting_mode text NOT NULL DEFAULT 'per_finding'
    CHECK (human_counting_mode IN ('per_finding','per_pif')),
  policy_revision bigint NOT NULL DEFAULT 1 CHECK (policy_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);
ALTER TABLE public.company_human_counting_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_human_counting_policies FROM anon, authenticated;
GRANT SELECT ON public.company_human_counting_policies TO authenticated;
CREATE POLICY human_counting_policy_read ON public.company_human_counting_policies
 FOR SELECT TO authenticated USING (
   public.current_app_role_text() = 'super_admin'
   OR company_id = public.current_profile_company_id()
 );

CREATE FUNCTION public.csvb_human_counting_policy_for_me(p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  company uuid;
  role_name text := public.current_app_role_text();
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid()
      AND coalesce(is_active,true) AND NOT coalesce(is_disabled,false)
  ) THEN RAISE EXCEPTION 'Active user required' USING ERRCODE='42501'; END IF;
  IF role_name='super_admin' THEN
    company := p_company_id;
  ELSE
    company := public.current_profile_company_id();
    IF company IS NULL OR (p_company_id IS NOT NULL AND p_company_id<>company) THEN
      RAISE EXCEPTION 'Company not accessible' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.csvb_my_effective_app_permissions()
      WHERE module_code IN ('POST_INSPECTION','POST_INSPECTION_STATS')
        AND permission_action='view' AND is_granted
    ) THEN RAISE EXCEPTION 'Post-Inspection access required' USING ERRCODE='42501'; END IF;
  END IF;
  IF company IS NULL THEN
    RETURN jsonb_build_object('company_id',null,'can_edit',false,'companies',
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',company_name) ORDER BY company_name)
                FROM public.companies WHERE coalesce(is_active,true)), '[]'::jsonb));
  END IF;
  SELECT jsonb_build_object(
    'company_id',c.id,'company_name',c.company_name,
    'human_counting_mode',coalesce(p.human_counting_mode,'per_finding'),
    'policy_revision',coalesce(p.policy_revision,0),
    'can_edit',role_name='super_admin' OR (
      role_name='company_admin' AND EXISTS (
        SELECT 1 FROM public.csvb_my_effective_app_permissions()
        WHERE module_code='POST_INSPECTION' AND permission_action='edit' AND is_granted
      )
    ),
    'companies',CASE WHEN role_name='super_admin' THEN
      (SELECT jsonb_agg(jsonb_build_object('id',id,'name',company_name) ORDER BY company_name)
       FROM public.companies WHERE coalesce(is_active,true))
      ELSE '[]'::jsonb END
  ) INTO result
  FROM public.companies c LEFT JOIN public.company_human_counting_policies p ON p.company_id=c.id
  WHERE c.id=company;
  IF result IS NULL THEN RAISE EXCEPTION 'Company not found'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.csvb_human_counting_policy_save(
  p_company_id uuid, p_mode text, p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE policy jsonb;
BEGIN
  IF p_company_id IS NULL OR p_mode NOT IN ('per_finding','per_pif') OR p_mode IS NULL
     OR p_expected_revision IS NULL THEN RAISE EXCEPTION 'Explicit company, valid mode and revision required'; END IF;
  -- Serialize absent-row creation as well as edits; optimistic revision prevents lost updates.
  PERFORM 1 FROM public.companies WHERE id=p_company_id FOR UPDATE;
  policy := public.csvb_human_counting_policy_for_me(p_company_id);
  IF NOT coalesce((policy->>'can_edit')::boolean,false) THEN
    RAISE EXCEPTION 'Not authorized to change this company policy' USING ERRCODE='42501';
  END IF;
  IF (policy->>'policy_revision')::bigint<>p_expected_revision THEN
    RAISE EXCEPTION 'Policy changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF policy->>'human_counting_mode'<>p_mode THEN
    INSERT INTO public.company_human_counting_policies
      (company_id,human_counting_mode,created_by,updated_by)
    VALUES (p_company_id,p_mode,auth.uid(),auth.uid())
    ON CONFLICT (company_id) DO UPDATE SET
      human_counting_mode=excluded.human_counting_mode,
      policy_revision=company_human_counting_policies.policy_revision+1,
      updated_at=now(),updated_by=auth.uid();
  END IF;
  RETURN public.csvb_human_counting_policy_for_me(p_company_id);
END $$;

CREATE FUNCTION public.csvb_retained_human_pifs(p_classification text,p_nature text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public AS $$
  SELECT coalesce(array_agg(raw ORDER BY ordinal),'{}'::text[]) FROM (
    SELECT DISTINCT ON (normalized) raw,ordinal FROM (
      SELECT btrim(regexp_replace(value,'\s+',' ','g')) raw,ordinal,
        lower(normalize(btrim(regexp_replace(value,'\s+',' ','g')),NFKC)) normalized
      FROM regexp_split_to_table(coalesce(p_classification,'')||'|'||coalesce(p_nature,''),'\|')
        WITH ORDINALITY AS x(value,ordinal)
    ) t WHERE normalized<>'' AND normalized !~
      '^(not as expected|largely as expected|as expected|exceeded normal expectation)\.?$'
    ORDER BY normalized,ordinal
  ) d
$$;

CREATE FUNCTION public.csvb_human_effective_count(p_designation text,p_pifs text[],p_mode text)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN lower(trim(p_designation))='human' AND p_mode='per_pif'
   THEN greatest(1,coalesce(cardinality(p_pifs),0)) ELSE 1 END
$$;

CREATE VIEW public.csvb_counted_post_inspection_items WITH (security_invoker=true) AS
SELECT oi.*,pifs.retained_pifs,
  cardinality(pifs.retained_pifs)::integer human_pif_count,
  public.csvb_human_effective_count(oi.designation,pifs.retained_pifs,
    coalesce(policy.human_counting_mode,'per_finding')) effective_observation_count,
  coalesce(policy.human_counting_mode,'per_finding') human_counting_mode,
  coalesce(policy.policy_revision,0)::bigint policy_revision
FROM public.post_inspection_observation_items oi
JOIN public.post_inspection_reports r ON r.id=oi.report_id
LEFT JOIN public.company_human_counting_policies policy ON policy.company_id=r.company_id
CROSS JOIN LATERAL (
 SELECT CASE WHEN lower(trim(oi.designation))='human'
   THEN public.csvb_retained_human_pifs(oi.classification_coding,oi.nature_of_concern)
   ELSE '{}'::text[] END retained_pifs
) pifs;
GRANT SELECT ON public.csvb_counted_post_inspection_items TO authenticated;

-- The legacy KPI page explicitly measures its legacy records; do not union in or
-- duplicate modern rows. Apply the same contract when legacy Human PIFs exist.
CREATE VIEW public.csvb_counted_post_inspection_legacy WITH (security_invoker=true) AS
SELECT i.*,public.csvb_human_effective_count(i.designation,pifs.retained_pifs,
    coalesce(p.human_counting_mode,'per_finding')) effective_observation_count,
 cardinality(pifs.retained_pifs) human_pif_count,pifs.retained_pifs,
 coalesce(p.human_counting_mode,'per_finding') human_counting_mode,
 coalesce(p.policy_revision,0) policy_revision
FROM public.post_inspection_observations i
JOIN public.post_inspection_reports r ON r.id=i.report_id
LEFT JOIN public.company_human_counting_policies p ON p.company_id=r.company_id
CROSS JOIN LATERAL (SELECT CASE WHEN lower(trim(i.designation))='human'
 THEN public.csvb_retained_human_pifs(i.classification_coding,i.nature_of_concern)
 ELSE '{}'::text[] END retained_pifs) pifs;
GRANT SELECT ON public.csvb_counted_post_inspection_legacy TO authenticated;

-- Read-only, RLS-scoped metadata. Each item occurs exactly once.
CREATE FUNCTION public.csvb_human_counting_items_for_me(p_report_ids uuid[] DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('observation_item_id',i.id,'report_id',i.report_id,
   'human_pif_count',i.human_pif_count,'retained_pifs',i.retained_pifs,
   'effective_observation_count',i.effective_observation_count,
   'human_counting_mode',i.human_counting_mode,'policy_revision',i.policy_revision)
 FROM public.csvb_counted_post_inspection_items i
 WHERE p_report_ids IS NULL OR i.report_id=ANY(p_report_ids)
 ORDER BY i.id
$$;

-- Versioned exports keep existing RPC return signatures and RLS semantics intact.
CREATE FUNCTION public.post_insp_export_observations_v2(
 p_vessel_id uuid DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_observation_type text DEFAULT NULL
) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('vessel_name',v.name,'inspection_date',r.inspection_date,
   'report_ref',r.report_ref,'title',r.title,'question_no',i.question_no,
   'observation_type',i.obs_type,'designation',i.designation,
   'soc',i.classification_coding,'noc',i.nature_of_concern,
   'pgno_selected',coalesce(i.pgno_selected,'[]'::jsonb),
   'pgno_count',CASE WHEN jsonb_typeof(i.pgno_selected)='array' THEN jsonb_array_length(i.pgno_selected) ELSE 0 END,
   'remarks',coalesce(i.remarks,i.observation_text),'updated_at',i.updated_at,
   'source_observation_id',i.id,'observation_item_id',i.id,'report_id',r.id,
   'retained_pifs',i.retained_pifs,'human_pif_count',i.human_pif_count,
   'effective_observation_count',i.effective_observation_count,
   'human_counting_mode',i.human_counting_mode,'policy_revision',i.policy_revision)
 FROM public.csvb_counted_post_inspection_items i
 JOIN public.post_inspection_reports r ON r.id=i.report_id LEFT JOIN public.vessels v ON v.id=r.vessel_id
 WHERE i.has_observation IS DISTINCT FROM false
 AND (p_vessel_id IS NULL OR r.vessel_id=p_vessel_id)
 AND (p_from IS NULL OR r.inspection_date>=p_from) AND (p_to IS NULL OR r.inspection_date<=p_to)
 AND (public._post_insp_normalize_type_filter(p_observation_type) IS NULL
      OR i.obs_type=public._post_insp_normalize_type_filter(p_observation_type))
 ORDER BY r.inspection_date DESC,v.name,i.question_no,i.sort_index
$$;

CREATE FUNCTION public.fleet_obs_analytics_export_v2(
 p_vessel_id uuid DEFAULT NULL,p_from date DEFAULT NULL,p_to date DEFAULT NULL,
 p_record_source text DEFAULT NULL,p_observation_type text DEFAULT NULL
) RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT to_jsonb(e)||jsonb_build_object(
   'retained_pifs',coalesce(i.retained_pifs,'{}'::text[]),'human_pif_count',coalesce(i.human_pif_count,0),
   'effective_observation_count',coalesce(i.effective_observation_count,1),
   'human_counting_mode',coalesce(i.human_counting_mode,'per_finding'),
   'policy_revision',coalesce(i.policy_revision,0))
 FROM public.fleet_obs_analytics_export(p_vessel_id,p_from,p_to,p_record_source,p_observation_type) e
 LEFT JOIN public.csvb_counted_post_inspection_items i
   ON e.record_source='vetting_inspection' AND i.id=e.source_observation_id
$$;

CREATE FUNCTION public.csvb_human_policy_snapshot_status_for_me()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object('report_id',s.report_id,'risk_snapshot_id',s.id,
   'profile_version_id',s.profile_version_id,'human_counting_mode',coalesce(p.human_counting_mode,'per_finding'),
   'policy_revision',coalesce(p.policy_revision,0),
   'is_stale',coalesce((s.calculation_json->'rating_profile'->>'policy_revision')::bigint,0)
        <>coalesce(p.policy_revision,0)
       OR coalesce(s.calculation_json->'rating_profile'->>'human_counting_mode','per_finding')
        <>coalesce(p.human_counting_mode,'per_finding'))
 FROM public.risk_inspection_scores s JOIN public.post_inspection_reports r ON r.id=s.report_id
 LEFT JOIN public.company_human_counting_policies p ON p.company_id=r.company_id
 WHERE s.is_current
$$;

-- Modify only the count expression in the current planner; all suggestion, access,
-- history ordering and inspection denominators remain the deployed implementation.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.csvb_vetting_inspection_planner_for_me_v2()'::regprocedure) INTO definition;
 IF position('count(*) filter (' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected planner definition'; END IF;
 definition := replace(definition,'count(*) filter (','coalesce(sum(oi.effective_observation_count) filter (');
 definition := replace(definition,E'      )::integer as negative_count', E'      ),0)::integer as negative_count');
 definition := replace(definition,'public.post_inspection_observation_items oi','public.csvb_counted_post_inspection_items oi');
 EXECUTE definition;
END $$;

-- Existing aggregate RPCs also use the shared observation weight; distinct
-- inspections/questions and absent-row handling retain their original meaning.
DO $$
DECLARE definition text; signature regprocedure;
BEGIN
 FOR signature IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'post_insp_stats_summary','post_insp_stats_by_type',
     'post_insp_stats_by_vessel','post_insp_stats_top_questions')
 LOOP
   SELECT pg_get_functiondef(signature) INTO definition;
   definition:=replace(definition,'public.post_inspection_observation_items','public.csvb_counted_post_inspection_items');
   definition:=replace(definition,'count(*) from filtered_items',
     'coalesce(sum(effective_observation_count),0)::bigint from filtered_items');
   definition:=replace(definition,'count(*) as observation_count',
     'coalesce(sum(oi.effective_observation_count),0)::bigint as observation_count');
   definition:=replace(definition,'count(fi.id) as observation_count',
     'coalesce(sum(fi.effective_observation_count),0)::bigint as observation_count');
   definition:=replace(definition,'count(*) filter (where public._post_insp_missing_pgno(oi.pgno_selected, oi.obs_type))',
     'coalesce(sum(oi.effective_observation_count) filter (where public._post_insp_missing_pgno(oi.pgno_selected, oi.obs_type)),0)::bigint');
   definition:=replace(definition,'count(fi.id) filter (where public._post_insp_missing_pgno(fi.pgno_selected, fi.obs_type))',
     'coalesce(sum(fi.effective_observation_count) filter (where public._post_insp_missing_pgno(fi.pgno_selected, fi.obs_type)),0)::bigint');
   EXECUTE definition;
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.csvb_human_counting_policy_for_me(uuid),
 public.csvb_human_counting_policy_save(uuid,text,bigint),
 public.csvb_human_counting_items_for_me(uuid[]),
 public.post_insp_export_observations_v2(uuid,date,date,text),
 public.fleet_obs_analytics_export_v2(uuid,date,date,text,text),
 public.csvb_human_policy_snapshot_status_for_me() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.csvb_human_counting_policy_for_me(uuid),
 public.csvb_human_counting_policy_save(uuid,text,bigint),
 public.csvb_human_counting_items_for_me(uuid[]),
 public.post_insp_export_observations_v2(uuid,date,date,text),
 public.fleet_obs_analytics_export_v2(uuid,date,date,text,text),
 public.csvb_human_policy_snapshot_status_for_me() TO authenticated;

COMMIT;
