import fs from "node:fs/promises";
import assert from "node:assert/strict";
import {verify,sql} from "./lib/fve-dev-test.mjs";
await verify();
const snapshot=async()=>sql(`select
  (select md5(string_agg(to_jsonb(v)::text,'|' order by id)) from vessels v) vessels,
  (select md5(string_agg(to_jsonb(p)::text,'|' order by id)) from profiles p) profiles,
  (select md5(string_agg(jsonb_build_array(id,email,banned_until)::text,'|' order by id)) from auth.users) account_flags,
  (select md5(coalesce(string_agg(to_jsonb(u)::text,'|' order by id),'')) from mai_component_usage_logs u) usage,
  (select md5(string_agg(to_jsonb(r)::text,'|' order by id)) from post_inspection_reports r) reports,
  (select md5(string_agg(to_jsonb(i)::text,'|' order by id)) from post_inspection_observation_items i) findings,
  (select count(*) from vessel_status_transitions) transitions;`);
const before=await snapshot();
await sql(await fs.readFile("supabase/tests/vessel_lifecycle_governance.sql","utf8"));
assert.deepEqual(await snapshot(),before,"All test changes must roll back");
console.log("PASS development: deactivate/reactivate, required reason, stale/no-op guards, restricted history/actor/company, active selector vs historical lookup, account/profile preservation, non-admin/direct-read denial. All fixtures rolled back; existing vessels/accounts/reports/findings/usage unchanged.");
