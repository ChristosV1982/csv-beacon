/* scripts/patch-risq-import-chunks-no-temp.mjs */
/*
  Converts RISQ import chunks from TEMP table payload style
  to inline CTE payload style.

  Reason:
    Supabase SQL Editor may not preserve temp tables reliably across pasted statements.

  Safety:
    - Patches generated SQL files only.
    - Does not connect to Supabase.
    - Does not touch SIRE.
*/

import fs from "node:fs";
import path from "node:path";

const DIR = "./data/risq-import-sql-chunks";

if (!fs.existsSync(DIR)) {
  console.error(`Missing directory: ${DIR}`);
  process.exit(1);
}

function patchCore(sql) {
  const re = /CREATE TEMP TABLE _risq_core_payload\s*\(\s*payload jsonb NOT NULL\s*\)\s*ON COMMIT DROP;\s*INSERT INTO _risq_core_payload\(payload\)\s*VALUES\s*\((\$RISQCORE\d+\$[\s\S]*?\$RISQCORE\d+\$::jsonb)\);/m;
  const m = sql.match(re);
  if (!m) return sql;

  const payloadExpr = m[1];

  let out = sql.replace(m[0], "");

  out = out.replaceAll("FROM _risq_core_payload p", "FROM payload p");

  out = out.replace(
    /WITH qs AS \(/g,
    `WITH payload AS (
  SELECT ${payloadExpr} AS payload
),
qs AS (`
  );

  return out;
}

function patchQuestions(sql) {
  const re = /CREATE TEMP TABLE _risq_questions_payload\s*\(\s*payload jsonb NOT NULL\s*\)\s*ON COMMIT DROP;\s*INSERT INTO _risq_questions_payload\(payload\)\s*VALUES\s*\((\$RISQQ\d+\$[\s\S]*?\$RISQQ\d+\$::jsonb)\);/m;
  const m = sql.match(re);
  if (!m) return sql;

  const payloadExpr = m[1];

  let out = sql.replace(m[0], "");

  out = out.replaceAll("FROM _risq_questions_payload p", "FROM payload p");

  out = out.replace(
    /WITH qs AS \(/g,
    `WITH payload AS (
  SELECT ${payloadExpr} AS payload
),
qs AS (`
  );

  return out;
}

let patched = 0;

for (const name of fs.readdirSync(DIR).sort()) {
  if (!name.endsWith(".sql")) continue;

  const file = path.join(DIR, name);
  const before = fs.readFileSync(file, "utf8");

  let after = before;
  after = patchCore(after);
  after = patchQuestions(after);

  if (after !== before) {
    fs.writeFileSync(file, after, "utf8");
    patched += 1;
    console.log(`Patched no-temp payload: ${name}`);
  }
}

console.log(`No-temp patch completed. Files patched: ${patched}`);
