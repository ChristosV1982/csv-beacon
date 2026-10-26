BEGIN;
-- Use the existing report authorization contract, not a new direct-table access
-- requirement, when supplementing legacy risk-read RPCs with per-PIF metadata.
CREATE FUNCTION public.csvb_human_pif_risk_factors_for_report(p_report_id uuid)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.csvb_post_inspection_reports_for_me() r WHERE r.id=p_report_id
 ) THEN RAISE EXCEPTION 'Report not accessible' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT jsonb_build_object('observation_item_id',s.observation_item_id,
   'inspection_score_id',s.inspection_score_id,'factors_json',s.factors_json)
 FROM public.risk_observation_scores s JOIN public.risk_inspection_scores snapshot
   ON snapshot.id=s.inspection_score_id AND snapshot.report_id=s.report_id
 WHERE s.report_id=p_report_id AND snapshot.is_current;
END $$;
REVOKE ALL ON FUNCTION public.csvb_human_pif_risk_factors_for_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.csvb_human_pif_risk_factors_for_report(uuid) TO authenticated;
COMMIT;
