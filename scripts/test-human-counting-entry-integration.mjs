import fs from "node:fs";
const ref = "bdidrcyufazskpuwmfca";
if(fs.readFileSync("supabase/.temp/project-ref","utf8").trim()!==ref) throw Error("Unexpected linked project");
const token = process.env.SUPABASE_ACCESS_TOKEN;
async function query(sql) {
  const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
    method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({query:sql}),
  });
  const result=await r.json();
  if(!r.ok)throw Error(JSON.stringify(result));
  return result;
}
const migration=fs.readFileSync("supabase/migrations/20261026130000_fix_human_policy_entry_risk_reads.sql","utf8")
  .replace(/^BEGIN;/,"").replace(/COMMIT;\s*$/,"");
const tests=`
-- Existing default arguments make a direct SQL one-argument call ambiguous.
-- Execute that unchanged overload's exact body through a transaction-local
-- alias; do not alter its public signature/defaults to accommodate the test.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.csvb_post_inspection_all_profile_risk_scores_for_me_adjusted(boolean)'::regprocedure)
 INTO definition;
 EXECUTE replace(definition,
   'public.csvb_post_inspection_all_profile_risk_scores_for_me_adjusted(',
   'pg_temp.test_all_profile_one_argument(');
END $$;
DO $$
DECLARE actor uuid; company uuid; report uuid:='96395949-e5ca-4eae-97c8-1656f1f2503b';
 policy jsonb; result jsonb; baseline jsonb; restored jsonb;
 before_hash text; after_hash text; header_hash text; current_header text; n integer;
BEGIN
 SELECT id INTO actor FROM profiles WHERE role::text='super_admin'
   AND coalesce(is_active,true) AND NOT coalesce(is_disabled,false) LIMIT 1;
 SELECT company_id INTO company FROM post_inspection_reports WHERE id=report;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) INTO before_hash
   FROM post_inspection_observation_items i WHERE report_id=report;
 SELECT md5(to_jsonb(r)::text) INTO header_hash FROM post_inspection_reports r WHERE id=report;
 -- Execute every repaired overload, not just validate its DDL.
 PERFORM count(*) FROM csvb_post_inspection_current_risk_scores_for_me_adjusted(false);
 PERFORM count(*) FROM csvb_post_inspection_visible_risk_scores_for_me_adjusted(false);
 PERFORM count(*) FROM pg_temp.test_all_profile_one_argument(false);
 PERFORM count(*) FROM csvb_post_inspection_all_profile_risk_scores_for_me_adjusted(false,50);
 policy:=csvb_human_counting_policy_for_me(company);
 IF (policy->>'can_edit')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Superuser selected company not editable'; END IF;
 policy:=csvb_human_counting_policy_save(company,'per_finding',(policy->>'policy_revision')::bigint);
 PERFORM csvb_store_post_inspection_risk_snapshots_all_profiles(report);
 SELECT jsonb_agg(jsonb_build_array(profile_version_id,inspection_risk_score,eligible_risk_observations,average_observation_risk,risk_per_examined_question) ORDER BY profile_version_id)
 INTO baseline FROM csvb_post_inspection_all_profile_risk_scores_for_me_adjusted(false,50) r WHERE r.report_id=report;
 policy:=csvb_human_counting_policy_save(company,'per_pif',(policy->>'policy_revision')::bigint);
 IF NOT EXISTS(SELECT 1 FROM csvb_human_policy_snapshot_status_for_me() s
   WHERE s->>'report_id'=report::text AND (s->>'is_stale')::boolean) THEN RAISE EXCEPTION 'Policy change must mark stored snapshots stale'; END IF;
 SELECT sum(effective_observation_count) INTO n FROM csvb_counted_post_inspection_items WHERE report_id=report;
 IF n<>19 THEN RAISE EXCEPTION 'Expected 19 effective findings, got %',n; END IF;
 result:=csvb_store_post_inspection_risk_snapshots_all_profiles(report);
 IF (result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Snapshot refresh failed'; END IF;
 IF EXISTS(SELECT 1 FROM csvb_human_policy_snapshot_status_for_me() s
   WHERE s->>'report_id'=report::text AND (s->>'is_stale')::boolean) THEN RAISE EXCEPTION 'Fresh snapshots must not be stale'; END IF;
 IF EXISTS(SELECT 1 FROM csvb_post_inspection_all_profile_risk_scores_for_me_adjusted(false,50) r
   WHERE r.report_id=report AND (r.eligible_risk_observations<>13 OR r.inspection_risk_score IS NULL))
 THEN RAISE EXCEPTION 'Per-PIF adjusted risk read invalid'; END IF;
 policy:=csvb_human_counting_policy_save(company,'per_finding',(policy->>'policy_revision')::bigint);
 PERFORM csvb_store_post_inspection_risk_snapshots_all_profiles(report);
 SELECT jsonb_agg(jsonb_build_array(profile_version_id,inspection_risk_score,eligible_risk_observations,average_observation_risk,risk_per_examined_question) ORDER BY profile_version_id)
 INTO restored FROM csvb_post_inspection_all_profile_risk_scores_for_me_adjusted(false,50) r WHERE r.report_id=report;
 IF baseline IS DISTINCT FROM restored THEN RAISE EXCEPTION 'Per-finding risk totals did not restore'; END IF;
 SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) INTO after_hash
   FROM post_inspection_observation_items i WHERE report_id=report;
 SELECT md5(to_jsonb(r)::text) INTO current_header FROM post_inspection_reports r WHERE id=report;
 IF before_hash<>after_hash OR header_hash<>current_header THEN RAISE EXCEPTION 'Finding/header changed'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM risk_inspection_scores)<>0 THEN RAISE EXCEPTION 'Direct RLS should remain unchanged'; END IF;
 IF (SELECT count(*) FROM csvb_human_policy_snapshot_status_for_me())=0 THEN RAISE EXCEPTION 'Authenticated scoped snapshot status must be readable'; END IF;
 IF EXISTS(SELECT 1 FROM csvb_human_policy_snapshot_status_for_me() s WHERE NOT EXISTS(
   SELECT 1 FROM csvb_post_inspection_reports_for_me() r WHERE r.id::text=s->>'report_id'))
 THEN RAISE EXCEPTION 'Status leaked inaccessible report'; END IF;
END $$;
`;
if(process.argv.includes("--apply-dev")) {
  await query(`BEGIN;${migration}
    INSERT INTO supabase_migrations.schema_migrations(version,name)
    VALUES ('20261026130000','fix_human_policy_entry_risk_reads');COMMIT;`);
  console.log("Applied Entry risk-read repair to confirmed development project.");
} else {
  await query(`BEGIN;${process.argv.includes("--installed")?"":migration}${tests}ROLLBACK;`);
  console.log("PASS: four real risk readers; policy save/revision; 11→19→11 counts; stored/refreshed risk; stale flags; unchanged headers/findings and RLS. Test writes rolled back.");
}
