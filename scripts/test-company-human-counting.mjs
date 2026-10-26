// Uses the explicitly confirmed development project. Validation rolls back all DDL
// and policy edits; --apply-dev installs the migrations, not test policy changes.
import fs from "node:fs";
const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (ref !== "bdidrcyufazskpuwmfca") throw Error("Unexpected linked project; stop.");
const files = [
  "supabase/migrations/20261026120000_company_human_counting.sql",
  "supabase/migrations/20261026121000_human_per_pif_risk.sql",
  "supabase/migrations/20261026122000_human_policy_report_scoped_read.sql",
  "supabase/migrations/20261026123000_human_pif_risk_metadata_read.sql",
];
const migration = files.map(file => fs.readFileSync(file, "utf8")
  .replace(/^BEGIN;$/m, "").replace(/COMMIT;\s*$/, "")).join("\n");
async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    }, body: JSON.stringify({query}),
  });
  const body = await response.text();
  if (!response.ok) throw Error(`SQL HTTP ${response.status}: ${body}`);
  return JSON.parse(body);
}
const test = `
DO $test$
DECLARE
 company uuid; report uuid:='96395949-e5ca-4eae-97c8-1656f1f2503b';
 super_user uuid; policy jsonb; baseline jsonb; calculated jsonb; item jsonb;
 original_hash text; after_hash text; risk_hash text; risk_after text; planner_count integer;
 physical integer; weighted integer; negatives integer; baseline_negatives integer;
 expected record; matches integer; part jsonb;
BEGIN
 SELECT company_id INTO company FROM public.post_inspection_reports WHERE id=report;
 IF company IS NULL THEN RAISE EXCEPTION 'Target report missing'; END IF;
 SELECT id INTO super_user FROM public.profiles WHERE role::text='super_admin'
   AND coalesce(is_active,true) AND NOT coalesce(is_disabled,false) LIMIT 1;
 IF super_user IS NULL THEN RAISE EXCEPTION 'No active superuser for transactional tests'; END IF;
 PERFORM set_config('request.jwt.claim.sub',super_user::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',super_user,'role','authenticated')::text,true);
 SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text),count(*) INTO original_hash,physical
 FROM public.post_inspection_observation_items i WHERE report_id=report;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]')::text) INTO risk_hash
 FROM public.risk_inspection_scores s WHERE report_id=report;
 IF cardinality(public.csvb_retained_human_pifs(' 1. A |1. A| 2. B ','Not as expected.'))<>2 THEN
   RAISE EXCEPTION 'PIF normalization/dedupe failed'; END IF;
 policy:=public.csvb_human_counting_policy_for_me(null);
 IF policy->>'company_id' IS NOT NULL OR (policy->>'can_edit')::boolean THEN
   RAISE EXCEPTION 'Superuser requires explicit company'; END IF;
 policy:=public.csvb_human_counting_policy_for_me(company);
 policy:=public.csvb_human_counting_policy_save(company,'per_finding',(policy->>'policy_revision')::bigint);
 SELECT sum(effective_observation_count),sum(effective_observation_count) FILTER (WHERE obs_type='negative')
 INTO weighted,baseline_negatives FROM public.csvb_counted_post_inspection_items WHERE report_id=report;
 IF weighted<>physical THEN RAISE EXCEPTION 'Per-finding total mismatch'; END IF;
 baseline:=public.csvb_calculate_post_inspection_risk_preview_per_finding(report,null,null);
 calculated:=public.csvb_calculate_post_inspection_risk_preview(report,null,null);
 IF baseline->'summary' <> ((calculated->'summary') - 'human_counting_mode' - 'policy_revision' - 'effective_observation_count') THEN
   RAISE EXCEPTION 'Per-finding risk changed'; END IF;
 policy:=public.csvb_human_counting_policy_save(company,'per_pif',(policy->>'policy_revision')::bigint);
 SELECT sum(effective_observation_count),sum(effective_observation_count) FILTER (WHERE obs_type='negative')
 INTO weighted,negatives FROM public.csvb_counted_post_inspection_items WHERE report_id=report;
 IF weighted<=physical OR negatives<=baseline_negatives THEN RAISE EXCEPTION 'Per-PIF counts did not increase'; END IF;
 SELECT (h->>'negative_observations_count')::integer INTO planner_count
 FROM public.csvb_vetting_inspection_planner_for_me_v2() p,
   LATERAL jsonb_array_elements(p.last_five_inspections) h WHERE h->>'report_id'=report::text;
 IF planner_count IS DISTINCT FROM negatives THEN RAISE EXCEPTION 'Planner negative count differs from shared contract'; END IF;
 IF EXISTS (SELECT 1 FROM public.csvb_counted_post_inspection_items
    WHERE report_id=report AND human_pif_count=2 AND effective_observation_count<>2) THEN
   RAISE EXCEPTION 'Two PIFs must count twice'; END IF;
 FOR expected IN SELECT * FROM (VALUES
   ('5.6.1','Senior Deck Officer','negative','2'),
   ('5.9.1','Senior Deck Officer','negative','9'),
   ('5.9.1','Senior Engineer Officer','negative','9'),
   ('6.2.1','Senior Deck Officer','negative','9'),
   ('10.2.1','Senior Engineer Officer','negative','2'),
   ('10.2.1','Junior Deck Officer','positive','2')
 ) AS cases(question,rank_name,finding_type,second_pif)
 LOOP
   SELECT count(*) INTO matches FROM public.csvb_counted_post_inspection_items i
   WHERE i.report_id=report AND public.csvb_canonical_question_no(coalesce(i.question_base,i.question_no))=expected.question
     AND i.obs_type=expected.finding_type AND lower(i.designation)='human'
     AND lower(coalesce(nullif(trim(i.positive_rank),''),
       substring(i.source_excerpt FROM '(?i)^Human\\s+([^:]+):')))=lower(expected.rank_name)
     AND i.human_pif_count=2 AND i.effective_observation_count=2
     AND EXISTS (SELECT 1 FROM unnest(i.retained_pifs) p WHERE p ~ '^1[.]')
     AND EXISTS (SELECT 1 FROM unnest(i.retained_pifs) p WHERE p ~ ('^'||expected.second_pif||'[.]'));
   IF matches<>1 THEN RAISE EXCEPTION 'Source case did not uniquely match: % % %',expected.question,expected.rank_name,expected.finding_type; END IF;
 END LOOP;
 -- Prove PIF-specific configuration is used, rather than highest-score * count.
 UPDATE public.risk_noc_scores SET score=CASE
   WHEN noc_text ~ '^1[.]' THEN 2 ELSE 4 END
 WHERE profile_version_id=(baseline->'rating_profile'->>'profile_version_id')::uuid
   AND designation='Human' AND noc_text ~ '^[12][.]';
 calculated:=public.csvb_calculate_post_inspection_risk_preview(report,null,null);
 matches:=0;
 FOR part IN SELECT value FROM jsonb_array_elements(
   (SELECT value->'factors'->'pif_contributions'
      FROM jsonb_array_elements(calculated->'observations')
      WHERE value->>'question_base'='5.6.1' AND value->>'designation'='Human' LIMIT 1))
 LOOP
   matches:=matches+1;
   IF (part->>'pif') ~ '^1[.]' AND (part->>'noc_score')::numeric<>2
      OR (part->>'pif') ~ '^2[.]' AND (part->>'noc_score')::numeric<>4 THEN
     RAISE EXCEPTION 'Per-PIF risk did not use the PIF-specific score'; END IF;
 END LOOP;
 IF matches<>2 THEN RAISE EXCEPTION 'Expected two separately scored PIF contributions'; END IF;
 calculated:=public.csvb_calculate_post_inspection_risk_preview(report,null,null);
 FOR item IN SELECT value FROM jsonb_array_elements(calculated->'observations') LOOP
   IF item->>'finding_type'='positive' AND (item->>'risk_score')::numeric<>0 THEN
     RAISE EXCEPTION 'Positive risk eligibility changed'; END IF;
   IF item->'factors' ? 'pif_contributions' AND
       (item->>'risk_score')::numeric<>(SELECT sum((value->>'risk_score')::numeric)
          FROM jsonb_array_elements(item->'factors'->'pif_contributions')) THEN
     RAISE EXCEPTION 'Per-PIF contribution sum mismatch'; END IF;
 END LOOP;
 policy:=public.csvb_human_counting_policy_save(company,'per_finding',(policy->>'policy_revision')::bigint);
 SELECT sum(effective_observation_count) INTO weighted FROM public.csvb_counted_post_inspection_items WHERE report_id=report;
 IF weighted<>physical THEN RAISE EXCEPTION 'Switch-back failed'; END IF;
 SELECT md5(jsonb_agg(to_jsonb(i) ORDER BY id)::text) INTO after_hash
 FROM public.post_inspection_observation_items i WHERE report_id=report;
 SELECT md5(coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]')::text) INTO risk_after
 FROM public.risk_inspection_scores s WHERE report_id=report;
 IF original_hash<>after_hash OR risk_hash<>risk_after THEN
   RAISE EXCEPTION 'Findings or historical snapshots changed'; END IF;
 RAISE NOTICE 'PASS: policy switching, normalized PIFs, original totals/risk, per-PIF risk sums, positive eligibility and unchanged findings/snapshots';
END $test$;
SET LOCAL ROLE authenticated;
DO $permissions$
DECLARE entry record; policy jsonb; company uuid; revision bigint; blocked boolean;
BEGIN
 -- Read paths run under the same SQL role as browser Supabase requests.
 PERFORM count(*) FROM public.csvb_human_counting_items_for_me(null);
 PERFORM count(*) FROM public.post_insp_export_observations_v2();
 PERFORM count(*) FROM public.fleet_obs_analytics_export_v2();
 PERFORM count(*) FROM public.csvb_human_policy_snapshot_status_for_me();
 PERFORM count(*) FROM public.csvb_human_pif_risk_factors_for_report('96395949-e5ca-4eae-97c8-1656f1f2503b');
 FOR entry IN SELECT id,role,company_id FROM public.profiles
   WHERE role::text IN ('company_superintendent','company_admin','inspector')
     AND company_id IS NOT NULL AND coalesce(is_active,true) AND NOT coalesce(is_disabled,false)
   LIMIT 12
 LOOP
   PERFORM set_config('request.jwt.claim.sub',entry.id::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',entry.id,'role','authenticated')::text,true);
   BEGIN
     policy:=public.csvb_human_counting_policy_for_me(entry.company_id);
     IF entry.role::text<>'company_admin' AND (policy->>'can_edit')::boolean THEN
       RAISE EXCEPTION 'Read-only role can edit'; END IF;
     IF NOT (policy->>'can_edit')::boolean THEN
       blocked:=false;
       BEGIN
         PERFORM public.csvb_human_counting_policy_save(entry.company_id,'per_pif',(policy->>'policy_revision')::bigint);
       EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
       IF NOT blocked THEN RAISE EXCEPTION 'Read-only write was allowed'; END IF;
     ELSE
       policy:=public.csvb_human_counting_policy_save(entry.company_id,
         CASE WHEN policy->>'human_counting_mode'='per_pif' THEN 'per_finding' ELSE 'per_pif' END,
         (policy->>'policy_revision')::bigint);
       IF NOT (policy->>'can_edit')::boolean THEN RAISE EXCEPTION 'Authorized Company Admin save lost permissions'; END IF;
     END IF;
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   SELECT id INTO company FROM public.companies WHERE id<>entry.company_id LIMIT 1;
   IF company IS NOT NULL THEN
     blocked:=false;
     BEGIN PERFORM public.csvb_human_counting_policy_for_me(company);
     EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
     IF NOT blocked THEN RAISE EXCEPTION 'Cross-company access allowed'; END IF;
   END IF;
 END LOOP;
END $permissions$;
RESET ROLE;
`;
if (process.argv.includes("--apply-dev")) {
  await sql(`BEGIN;\n${migration}
    INSERT INTO supabase_migrations.schema_migrations(version,name)
    VALUES ('20261026120000','company_human_counting'),('20261026121000','human_per_pif_risk'),
      ('20261026122000','human_policy_report_scoped_read'),
      ('20261026123000','human_pif_risk_metadata_read');
    COMMIT;`);
  console.log("Applied company counting and risk migrations to confirmed development project.");
} else {
  await sql(`BEGIN;\n${process.argv.includes("--installed") ? "" : migration}\n${test}\nROLLBACK;`);
  console.log("PASS: transactional company counting and risk tests; all test changes rolled back.");
}
