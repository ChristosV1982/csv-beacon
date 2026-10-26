BEGIN;
DO $$
DECLARE fn record; definition text; repaired integer:=0;
BEGIN
 FOR fn IN SELECT p.oid::regprocedure signature FROM pg_proc p
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'csvb_post_inspection_current_risk_scores_for_me_adjusted',
     'csvb_post_inspection_visible_risk_scores_for_me_adjusted',
     'csvb_post_inspection_all_profile_risk_scores_for_me_adjusted')
 LOOP
   SELECT replace(pg_get_functiondef(fn.signature),E'\r\n',E'\n') INTO definition;
   IF position('x.effective_count' IN definition)>0
      AND position('as effective_count' IN lower(definition))=0 THEN
     -- Historical snapshots without Phase 2 metadata retain per-finding weight
     -- one. Never apply today's company policy to an older stored snapshot.
     definition:=replace(definition,E'      select\n        case',
       E'      select\n        greatest(1,coalesce(nullif(ros.factors_json->>''effective_observation_count'','''')::integer,1)) as effective_count,\n        case');
     IF position('as effective_count' IN lower(definition))=0 THEN
       RAISE EXCEPTION 'Unable to safely repair projection in %',fn.signature;
     END IF;
     EXECUTE definition;
     repaired:=repaired+1;
   END IF;
 END LOOP;
 IF repaired<>4 THEN RAISE EXCEPTION 'Expected four adjusted-risk repairs, got %',repaired; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.csvb_human_policy_snapshot_status_for_me()
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.profiles WHERE id=auth.uid()
   AND coalesce(is_active,true) AND NOT coalesce(is_disabled,false)
 ) THEN RAISE EXCEPTION 'Active user required' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object(
   'report_id',s.report_id,'risk_snapshot_id',s.id,'profile_version_id',s.profile_version_id,
   'human_counting_mode',coalesce(p.human_counting_mode,'per_finding'),
   'policy_revision',coalesce(p.policy_revision,0),
   'is_stale',coalesce((s.calculation_json->'rating_profile'->>'policy_revision')::bigint,0)
      <>coalesce(p.policy_revision,0)
     OR coalesce(s.calculation_json->'rating_profile'->>'human_counting_mode','per_finding')
      <>coalesce(p.human_counting_mode,'per_finding'))
 FROM public.csvb_post_inspection_reports_for_me() accessible
 JOIN public.risk_inspection_scores s ON s.report_id=accessible.id AND s.is_current
 LEFT JOIN public.company_human_counting_policies p ON p.company_id=accessible.company_id;
END $$;
REVOKE ALL ON FUNCTION public.csvb_human_policy_snapshot_status_for_me() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.csvb_human_policy_snapshot_status_for_me() TO authenticated;
COMMIT;
