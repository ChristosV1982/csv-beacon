// Verified development project only. All fixtures and usage inserts are rolled back.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {verify,sql} from "./lib/fve-dev-test.mjs";
await verify();
const operationBefore=await sql(`select md5(pg_get_functiondef('public.mai_record_vessel_operation(uuid,text,timestamptz,timestamptz,uuid[],text,text,text,text,boolean,boolean,text,text,uuid,uuid)'::regprocedure)) hash`);
const tests=await fs.readFile("supabase/tests/mai_manual_bulk_usage.sql","utf8");
await sql(tests);
const operationAfter=await sql(`select md5(pg_get_functiondef('public.mai_record_vessel_operation(uuid,text,timestamptz,timestamptz,uuid[],text,text,text,text,boolean,boolean,text,text,uuid,uuid)'::regprocedure)) hash`);
assert.deepEqual(operationAfter,operationBefore);
console.log("PASS development database: atomic four-component credit, mixed types, ledger totals, idempotent retry, invalid hours/empty/retired/foreign selection, vessel access, office permission enforcement and existing operation crediting. All fixtures rolled back. Operation RPC unchanged.");
