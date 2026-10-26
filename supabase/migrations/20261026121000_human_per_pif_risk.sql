BEGIN;
-- Keep the complete deployed per-finding calculation as the baseline.
ALTER FUNCTION public.csvb_calculate_post_inspection_risk_preview(uuid,uuid,uuid)
 RENAME TO csvb_calculate_post_inspection_risk_preview_per_finding;
REVOKE ALL ON FUNCTION public.csvb_calculate_post_inspection_risk_preview_per_finding(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.csvb_risk_prior_same_pif_count(
 p_version uuid,p_report uuid,p_question text,p_pif text
) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT count(*)::integer
 FROM public.risk_rating_profile_versions config
 JOIN public.post_inspection_reports current_report ON current_report.id=p_report
 LEFT JOIN public.vessels current_vessel ON current_vessel.id=current_report.vessel_id
 JOIN public.post_inspection_reports history ON history.id<>current_report.id
   AND history.inspection_date<current_report.inspection_date
 JOIN public.vessels history_vessel ON history_vessel.id=history.vessel_id
 JOIN public.post_inspection_observation_items item ON item.report_id=history.id
 WHERE config.id=p_version
 AND (config.repetition_lookback_mode='all_history' OR
   history.inspection_date >= (current_report.inspection_date -
     make_interval(months=>config.repetition_lookback_months))::date)
 AND ((config.repetition_scope='vessel' AND history.vessel_id=current_report.vessel_id)
   OR (config.repetition_scope='company' AND history_vessel.company_id=current_vessel.company_id))
 AND lower(trim(item.designation))='human'
 AND public.csvb_canonical_question_no(coalesce(item.question_base,item.question_no))=p_question
 AND (coalesce(nullif(lower(trim(item.obs_type)),''),CASE lower(item.observation_type)
      WHEN 'negative_observation' THEN 'negative' WHEN 'note_improvement' THEN 'largely' END)='negative'
   OR (config.repetition_include_largely_as_expected AND
     coalesce(nullif(lower(trim(item.obs_type)),''),CASE lower(item.observation_type)
       WHEN 'note_improvement' THEN 'largely' END)='largely'))
 AND EXISTS (
   SELECT 1 FROM unnest(public.csvb_retained_human_pifs(item.classification_coding,item.nature_of_concern)) pif
   WHERE public.csvb_risk_norm_text(pif)=public.csvb_risk_norm_text(p_pif)
 )
$$;
REVOKE ALL ON FUNCTION public.csvb_risk_prior_same_pif_count(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.csvb_calculate_post_inspection_risk_preview(
 p_report_id uuid,p_profile_id uuid DEFAULT NULL,p_profile_version_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 result jsonb; profile jsonb; summary jsonb; observation jsonb; factors jsonb;
 observations jsonb:='[]'; contributions jsonb; pif text; pifs text[];
 mode text; revision bigint; version_id uuid; match_noc boolean;
 repeat_count integer; repeat_factor numeric; noc_score numeric; contribution numeric;
 score numeric; total numeric:=0; max_score numeric:=0; eligible integer:=0;
 effective_count integer; total_effective integer:=0; weighted_noc numeric;
BEGIN
 -- This baseline performs all original authentication, access and eligibility checks.
 result:=public.csvb_calculate_post_inspection_risk_preview_per_finding(
   p_report_id,p_profile_id,p_profile_version_id);
 SELECT coalesce(p.human_counting_mode,'per_finding'),coalesce(p.policy_revision,0)
 INTO mode,revision FROM public.post_inspection_reports r
 LEFT JOIN public.company_human_counting_policies p ON p.company_id=r.company_id WHERE r.id=p_report_id;
 profile:=coalesce(result->'rating_profile','{}');
 version_id:=(profile->>'profile_version_id')::uuid;
 SELECT repetition_require_same_noc INTO match_noc
 FROM public.risk_rating_profile_versions WHERE id=version_id;
 profile:=profile||jsonb_build_object('human_counting_mode',mode,'policy_revision',revision);
 FOR observation IN SELECT value FROM jsonb_array_elements(coalesce(result->'observations','[]'))
 LOOP
   factors:=coalesce(observation->'factors','{}');
   pifs:='{}'; effective_count:=1;
   SELECT public.csvb_retained_human_pifs(i.classification_coding,i.nature_of_concern)
   INTO pifs FROM public.post_inspection_observation_items i
   WHERE i.id=(observation->>'observation_item_id')::uuid AND i.report_id=p_report_id
     AND lower(trim(i.designation))='human';
   pifs:=coalesce(pifs,'{}');
   IF mode='per_pif' THEN effective_count:=greatest(1,cardinality(pifs)); END IF;
   score:=coalesce((observation->>'risk_score')::numeric,0);
   IF mode='per_pif' AND cardinality(pifs)>0 THEN
     contributions:='[]'; score:=0; weighted_noc:=0;
     FOREACH pif IN ARRAY pifs LOOP
       SELECT ns.score INTO noc_score FROM public.risk_noc_scores ns
       WHERE ns.profile_version_id=version_id AND ns.designation='Human'
         AND public.csvb_risk_norm_text(ns.noc_text)=public.csvb_risk_norm_text(pif)
       ORDER BY ns.sort_order LIMIT 1;
       IF coalesce(match_noc,false) THEN
         repeat_count:=public.csvb_risk_prior_same_pif_count(
           version_id,p_report_id,observation->>'question_base',pif);
       ELSE repeat_count:=coalesce((factors->>'repetition_count_previous')::integer,0);
       END IF;
       SELECT rf.factor INTO repeat_factor FROM public.risk_repetition_factors rf
       WHERE rf.profile_version_id=version_id AND repeat_count>=rf.min_count
         AND (rf.max_count IS NULL OR repeat_count<=rf.max_count)
       ORDER BY rf.sort_order LIMIT 1;
       repeat_factor:=coalesce(repeat_factor,1);
       contribution:=CASE WHEN coalesce((observation->>'included_in_risk')::boolean,false) THEN
         round(coalesce((factors->>'finding_type_factor')::numeric,0)
           *coalesce((factors->>'question_type_weight')::numeric,0)
           *coalesce(noc_score,0)*coalesce((factors->>'vessel_age_factor')::numeric,1)*repeat_factor,4)
         ELSE 0 END;
       score:=score+contribution;
       weighted_noc:=weighted_noc+coalesce(noc_score,0)*repeat_factor;
       contributions:=contributions||jsonb_build_array(jsonb_build_object(
         'pif',pif,'noc_score',noc_score,'score_configured',noc_score IS NOT NULL,
         'repetition_count_previous',repeat_count,'repetition_factor',repeat_factor,
         'finding_type_factor',factors->'finding_type_factor',
         'question_type_weight',factors->'question_type_weight',
         'vessel_age_factor',factors->'vessel_age_factor','risk_score',contribution));
     END LOOP;
     factors:=factors||jsonb_build_object('pif_contributions',contributions,
       'pif_weighted_noc_repetition_score',weighted_noc);
   END IF;
   factors:=factors||jsonb_build_object('human_counting_mode',mode,'policy_revision',revision,
     'retained_pifs',to_jsonb(pifs),'human_pif_count',cardinality(pifs),
     'effective_observation_count',effective_count);
   observation:=observation||jsonb_build_object('factors',factors,'risk_score',score,
     'human_pif_count',cardinality(pifs),'effective_observation_count',effective_count);
   observations:=observations||jsonb_build_array(observation);
   total_effective:=total_effective+effective_count;
   IF coalesce((observation->>'included_in_risk')::boolean,false) THEN
     total:=total+score; max_score:=greatest(max_score,score); eligible:=eligible+effective_count;
   END IF;
 END LOOP;
 summary:=coalesce(result->'summary','{}')||jsonb_build_object(
   'human_counting_mode',mode,'policy_revision',revision,'effective_observation_count',total_effective);
 -- Per-finding scores/denominators remain byte-for-byte the baseline values.
 IF mode='per_pif' THEN
   summary:=summary||jsonb_build_object('eligible_risk_observations',eligible,
     'total_risk_score',round(total,4),'average_observation_risk',
       CASE WHEN eligible>0 THEN round(total/eligible,4) ELSE 0 END,
     'max_observation_risk',round(max_score,4),'risk_per_examined_question',
       CASE WHEN coalesce((result->'report'->>'examined_count')::integer,0)>0
         THEN round(total/(result->'report'->>'examined_count')::integer,6) ELSE NULL END);
 END IF;
 RETURN result||jsonb_build_object('rating_profile',profile,'summary',summary,'observations',observations);
END $$;
REVOKE ALL ON FUNCTION public.csvb_calculate_post_inspection_risk_preview(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.csvb_calculate_post_inspection_risk_preview(uuid,uuid,uuid) TO authenticated;

-- Snapshot writer already persists the complete preview and each factors JSON.
-- Fix adjusted Largely displays to use the recorded per-PIF contributions rather
-- than the baseline highest-PIF score. Other factors and eligibility are untouched.
DO $$
DECLARE definition text; signature regprocedure;
BEGIN
 FOR signature IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'csvb_post_inspection%adjusted'
 LOOP
   SELECT pg_get_functiondef(signature) INTO definition;
   IF position('coalesce(ros.noc_score, 0)' IN definition)>0
      AND position('coalesce(ros.repetition_factor, 1)' IN definition)>0 THEN
     definition:=replace(definition,'coalesce(ros.noc_score, 0)',
       'coalesce((ros.factors_json->>''pif_weighted_noc_repetition_score'')::numeric, coalesce(ros.noc_score,0)*coalesce(ros.repetition_factor,1))');
     definition:=replace(definition,'* coalesce(ros.repetition_factor, 1)','');
     definition:=replace(definition,'count(*) filter (where x.is_eligible) as eligible_count',
       'sum(x.effective_count) filter (where x.is_eligible) as eligible_count');
     definition:=replace(definition,E'      select\n        case',
       E'      select\n        coalesce((ros.factors_json->>''effective_observation_count'')::integer,1) as effective_count,\n        case');
     EXECUTE definition;
   END IF;
 END LOOP;
END $$;
COMMIT;
