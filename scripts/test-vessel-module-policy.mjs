// Read-only verification of the development permission migration.
// No account/assignment edits or operational writes.
import assert from "node:assert/strict";
import {verify,sql,claims} from "./lib/fve-dev-test.mjs";
await verify();
const modules=["SIRE_QUESTIONS_VIEWER","SIRE_FLEET_VETTING_EXPERIENCE",
  "MOORING_ANCHORING_INVENTORIES","PORT_CALL_INTELLIGENCE","PORTABLE_LIFTING_APPLIANCES_WIRES"];
const ranks=["Master","Chief Officer","Chief Engineer","2nd Engineer","3rd Officer","Bosun","",
  "chief_officer","CHIEF ENGINEER","second_engineer"];
const rows=await sql(`select r,a,m,public.csvb_vessel_rank_policy(m,a,r) allowed
  from unnest(ARRAY[${ranks.map(r=>"'"+r+"'").join(",")}]) r
  cross join unnest(ARRAY['view','edit','admin','export','review','delete']) a
  cross join unnest(ARRAY[${[...modules,"POST_INSPECTION","QUESTIONS_EDITOR","RISQ_QUESTIONS_VIEWER","THREADS"].map(m=>"'"+m+"'").join(",")}]) m`);
for(const row of rows){
  const rank=row.r.toLowerCase().replace(/[^a-z0-9]/g,"");
  const expected=row.m===modules[0]?row.a==="view":
    ["view","edit"].includes(row.a)&&(row.m===modules[1]?
      ["master","chiefofficer","chiefengineer","2ndengineer","secondengineer"].includes(rank):
      modules.slice(2).includes(row.m)&&["master","chiefofficer"].includes(rank));
  assert.equal(row.allowed,expected,JSON.stringify(row));
}
const grants=await sql(`select m.code,a.action,r.position from role_permissions r
  join app_permissions a on a.id=r.permission_id join app_modules m on m.id=a.module_id
  where r.role::text='vessel' and r.is_granted`);
assert.equal(grants.length,21,"Exactly 21 explicit allowed rows, no unrelated grants");
assert.equal((await sql("select count(*)::int n from app_role_permissions where role_id='vessel' and allowed"))[0].n,0);
assert.equal((await sql(`select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace
  where s.nspname='public' and c.relkind='r' and not c.relrowsecurity`))[0].n,0);
const master=(await sql(`select id,company_id,vessel_id from profiles
  where role::text='vessel' and onboard_rank_id is not null and onboard_status='onboard'
  and is_active and not is_disabled order by id limit 1`))[0];
if(master){
  await sql(`BEGIN; ${claims(master.id)}
    DO $test$
    DECLARE n integer; blocked boolean:=false; context jsonb; question_id uuid;
    BEGIN
      SELECT count(*) INTO n FROM csvb_my_effective_app_permissions();
      ASSERT n=9,'Master must have exactly five views and four edits';
      SELECT count(*) INTO n FROM csvb_my_effective_app_permissions() WHERE permission_action='view';
      ASSERT n=5,'Master view count';
      ASSERT NOT EXISTS(SELECT 1 FROM post_inspection_reports),'Raw source reports exposed';
      ASSERT NOT EXISTS(SELECT 1 FROM post_inspection_observation_items),'Raw source findings exposed';
      ASSERT NOT EXISTS(SELECT 1 FROM questionnaires),'Questionnaires exposed';
      BEGIN
        PERFORM * FROM csvb_post_inspection_reports_for_me();
      EXCEPTION WHEN insufficient_privilege THEN blocked:=true;
      END;
      ASSERT blocked,'Denied report RPC unexpectedly succeeded';
      SELECT count(*) INTO n FROM csvb_questions_master_for_me();
      ASSERT n>0,'Viewer library unavailable';
      SELECT id INTO question_id FROM csvb_questions_master_for_me() LIMIT 1;
      PERFORM * FROM csvb_pgno_master_for_question_for_me(question_id);
      PERFORM * FROM csvb_expected_evidence_for_question_for_me(question_id);
      PERFORM * FROM csvb_sire_question_references_for_question(question_id);
      context:=csvb_fleet_vetting_experience_context();
      ASSERT context->>'company_id'='${master.company_id}','FVE company context';
    END $test$;
    ROLLBACK;`);
  console.log("Actual existing Master identity: five views/four edits; denied source tables/RPC blocked; SIRE/FVE read paths pass.");
}
console.log(`PASS: ${rows.length} rank/module/action cases, 21 grants, legacy bypass denied.`);
