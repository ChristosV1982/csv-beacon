import fs from "node:fs/promises";
import assert from "node:assert/strict";

const project = "bdidrcyufazskpuwmfca";
const migration = "supabase/migrations/20261026160000_sire_fleet_vetting_experience.sql";
const linked = (await fs.readFile("supabase/.temp/project-ref", "utf8")).trim();
assert.equal(linked, project, "Unexpected Supabase target");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error("Supabase management authentication is unavailable");
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const verification = await fetch(`https://api.supabase.com/v1/projects/${project}`, { headers });
if (!verification.ok) throw Error(`Project verification failed: HTTP ${verification.status}`);
const info = await verification.json();
assert.equal(info.id, project);
console.log(`Verified existing testing target: ${info.name}`);
async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: "POST", headers, body: JSON.stringify({ query })
  });
  if (!response.ok) throw Error(`SQL HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
const source = await fs.readFile(migration, "utf8");
if (process.argv.includes("--apply-dev")) {
  console.log(await sql(source.replace(/commit;\s*$/i, `
    insert into supabase_migrations.schema_migrations(version,name,statements)
    values ('20261026160000','sire_fleet_vetting_experience',array['read-only fleet awareness module'])
    on conflict(version) do nothing; commit;`)));
  console.log("Applied module migration to the verified testing project only.");
  process.exit(0);
}
const tests = `
select set_config('request.jwt.claim.sub',(select id::text from public.profiles
  where role::text='super_admin' and coalesce(is_active,true) and not coalesce(is_disabled,false) limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $tests$
declare
  company uuid;
  counts jsonb;
  context jsonb;
  history jsonb;
  padded jsonb;
  count_row jsonb;
  row jsonb;
  expected bigint;
  keys integer;
begin
  begin
    perform public.csvb_fleet_vetting_experience_counts();
    raise exception 'Missing explicit platform company was accepted';
  exception when invalid_parameter_value then null; end;
  context := public.csvb_fleet_vetting_experience_context();
  if jsonb_array_length(context->'companies') = 0 then raise exception 'No enabled test company'; end if;
  company := (context->'companies'->0->>'id')::uuid;
  -- Prefer the internal company, which has populated historical data.
  if exists(select 1 from jsonb_array_elements(context->'companies') c
      where c->>'id'='381b3b4f-0fbd-4f30-bafe-450baa410a04') then
    company := '381b3b4f-0fbd-4f30-bafe-450baa410a04';
  end if;
  context := public.csvb_fleet_vetting_experience_context(company);
  counts := public.csvb_fleet_vetting_experience_counts(company);
  if jsonb_array_length(counts)=0 then raise exception 'Expected populated fleet history'; end if;
  for count_row in select value from jsonb_array_elements(counts) loop
    history := public.csvb_fleet_vetting_experience_history(company,count_row->>'question_no',null,null,null,null,0,100);
    if (history->>'total')::bigint <> (count_row->>'count')::bigint then
      raise exception 'Badges and history disagree';
    end if;
    for row in select value from jsonb_array_elements(history->'rows') loop
      select count(*) into keys from jsonb_object_keys(row);
      if keys<>5 or not row ?& array['vessel_name','inspection_date','oil_major','designation','observation_text'] then
        raise exception 'Unexpected or missing response fields: %',row;
      end if;
    end loop;
  end loop;
  history := public.csvb_fleet_vetting_experience_history(company,'5.9.1');
  padded := public.csvb_fleet_vetting_experience_history(company,'05.09.01');
  if history <> padded then raise exception 'Canonical/padded matching differs'; end if;
  select count(*) into expected from public.post_inspection_observation_items i
  join public.post_inspection_reports r on r.id=i.report_id
  where r.company_id=company and coalesce(i.has_observation,true)
    and nullif(trim(i.observation_text),'') is not null
    and lower(coalesce(nullif(trim(i.obs_type),''),trim(i.observation_type))) in ('negative','negative_observation')
    and lower(trim(i.designation)) in ('human','hardware','process')
    and public.csvb_canonical_question_no(public.csvb_sire_normalize_question_number(
      coalesce(nullif(trim(i.question_base),''),nullif(trim(i.question_no),''),i.question_full)))='5.9.1';
  if (history->>'total')::bigint <> expected then raise exception 'Physical finding counts changed'; end if;
  history := public.csvb_fleet_vetting_experience_history(company,'5.9.1',null,null,null,'Human');
  if exists(select 1 from jsonb_array_elements(history->'rows') x where x->>'designation'<>'Human') then
    raise exception 'Category filter failed';
  end if;
  if public.csvb_fleet_vetting_experience_counts(company,current_date+1,null) <> '[]'::jsonb then
    raise exception 'Inspection-date filter failed';
  end if;
  begin
    perform public.csvb_fleet_vetting_experience_history(company,'5.9.1-X');
    raise exception 'Suffixed question incorrectly matched base';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.csvb_fleet_vetting_experience_counts(company,current_date,current_date-1);
    raise exception 'Reversed date range accepted';
  exception when invalid_parameter_value then null; end;
  if has_function_privilege('authenticated','public.csvb_fve_rows(uuid)','execute') or
     has_function_privilege('anon','public.csvb_fleet_vetting_experience_counts(uuid,date,date,text,text)','execute') then
    raise exception 'Private/anonymous function access unexpectedly granted';
  end if;
  raise notice 'PASS platform context, narrow fields, canonical matching, counts, negative-only physical rows and filters';
end $tests$;
reset role;
-- Select an existing authorized vessel user and a negative finding from ANOTHER
-- vessel in the same company. No accounts, memberships or permissions are changed.
do $select_vessel$
declare candidate record;
begin
  for candidate in
    select p.id,p.company_id,p.vessel_id from public.profiles p
    join public.company_modules m on m.company_id=p.company_id and m.module_key='sire_fleet_vetting_experience' and m.is_enabled
    where p.role::text='vessel' and p.vessel_id is not null
      and coalesce(p.is_active,true) and not coalesce(p.is_disabled,false)
  loop
    perform set_config('request.jwt.claim.sub',candidate.id::text,true);
    if exists(select 1 from public.csvb_my_effective_app_permissions()
      where module_code='SIRE_FLEET_VETTING_EXPERIENCE' and permission_action='view' and is_granted) then
      perform set_config('fve_test.company',candidate.company_id::text,true);
      perform set_config('fve_test.vessel',candidate.vessel_id::text,true);
      return;
    end if;
  end loop;
  raise exception 'No existing authorized vessel user available for the scope test';
end $select_vessel$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'role','authenticated')::text,true);
set local role authenticated;
do $vessel$
declare
  company uuid := current_setting('fve_test.company')::uuid;
  own_vessel uuid := current_setting('fve_test.vessel')::uuid;
  other record;
  history jsonb;
begin
  if (public.csvb_fleet_vetting_experience_context()->>'company_id')::uuid <> company then
    raise exception 'Vessel own-company resolution failed';
  end if;
  -- Current raw table policy permits company reads; the report RPC correctly
  -- restricts full detail. We only expose the new narrow fleet projection.
  select r.id,r.vessel_id,v.name,public.csvb_canonical_question_no(
    public.csvb_sire_normalize_question_number(coalesce(i.question_base,i.question_no))) question_no into other
  from public.post_inspection_reports r join public.post_inspection_observation_items i on i.report_id=r.id
  join public.vessels v on v.id=r.vessel_id
  where r.company_id=company and r.vessel_id<>own_vessel
    and coalesce(i.has_observation,true) and nullif(trim(i.observation_text),'') is not null
    and i.obs_type='negative' and i.designation in ('Human','Hardware','Process')
  limit 1;
  if other.id is null or other.question_no is null then raise exception 'No other-vessel fixture available'; end if;
  history := public.csvb_fleet_vetting_experience_history(null,other.question_no,null,null,null,null,0,100);
  if not exists(select 1 from jsonb_array_elements(history->'rows') x where x->>'vessel_name'=other.name) then
    raise exception 'Company fleet awareness failed for vessel user';
  end if;
  if exists(select 1 from public.csvb_post_inspection_report_by_id_for_me(other.id)) then
    raise exception 'Other-vessel full report RPC became accessible';
  end if;
  begin
    perform public.csvb_fleet_vetting_experience_context('00000000-0000-0000-0000-000000000001');
    raise exception 'Foreign company accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS vessel sees limited company-fleet data, not other-vessel full report RPC; foreign company blocked';
end $vessel$;
reset role;
rollback;`;
const prefix = process.argv.includes("--installed") ? "begin;" : source.replace(/commit;\s*$/i, "");
await sql(prefix + tests);
console.log("PASS: testing-project real-role RPC checks; all test/migration writes rolled back.");
