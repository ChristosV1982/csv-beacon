#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc5d2_audit_inspector_filtering

for f in \
  public/audit_observations.js \
  public/inspector_intelligence.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc5d2_audit_inspector_filtering/$(basename "$f")
  fi
done

node <<'NODE'
const fs = require("fs");

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function write(file, txt) {
  fs.writeFileSync(file, txt, "utf8");
}

function findBlockEnd(str, start) {
  const open = str.indexOf("{", start);
  if (open < 0) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

function replaceAsyncFunction(src, name, replacement) {
  const marker = `async function ${name}(`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Async function not found: ${name}`);

  const end = findBlockEnd(src, start);
  if (end < 0) throw new Error(`Could not find end of async function: ${name}`);

  return src.slice(0, start) + replacement + src.slice(end);
}

/* ============================================================
   1. audit_observations.js
============================================================ */

{
  const file = "public/audit_observations.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadVessels",
`async function loadVessels() {
  const { data, error } = await state.supabase.rpc("csvb_accessible_vessels_for_me");

  if (error) throw error;

  return (data || [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({
      id: v.id,
      company_id: v.company_id,
      company_name: v.company_name || "",
      name: v.name,
      is_active: v.is_active
    }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadAuditTypes",
`async function loadAuditTypes() {
  const { data, error } = await state.supabase.rpc("csvb_audit_types_for_me");

  if (error) throw error;

  return (data || []).filter((t) => t.is_active !== false);
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadProfiles",
`async function loadProfiles() {
  const { data, error } = await state.supabase.rpc("csvb_profiles_for_my_company");

  if (error) throw error;

  return (data || [])
    .filter((p) => p.is_active !== false && p.is_disabled !== true)
    .map((p) => ({
      id: p.id,
      company_id: p.company_id,
      company_name: p.company_name || "",
      username: p.username,
      role: p.role,
      vessel_id: p.vessel_id,
      vessel_name: p.vessel_name || "",
      is_active: p.is_active,
      is_disabled: p.is_disabled
    }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadInspectors",
`async function loadInspectors() {
  const { data, error } = await state.supabase.rpc("csvb_inspectors_for_me");

  if (error) throw error;

  return (data || []).filter((i) => i.is_active !== false);
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadAudits",
`async function loadAudits() {
  const { data, error } = await state.supabase.rpc("csvb_audit_reports_for_me");

  if (error) throw error;

  return data || [];
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadObservationsForAudit",
`async function loadObservationsForAudit(auditId) {
  if (!auditId) return [];

  const { data, error } = await state.supabase.rpc("csvb_audit_observation_items_for_me", {
    p_report_id: auditId
  });

  if (error) throw error;

  return data || [];
}`
    );

    write(file, s);
    console.log("patched audit_observations.js");
  }
}

/* ============================================================
   2. inspector_intelligence.js
============================================================ */

{
  const file = "public/inspector_intelligence.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadVessels",
`async function loadVessels() {
  const { data, error } = await state.supabase.rpc("csvb_accessible_vessels_for_me");

  if (error) throw error;

  return (data || [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({
      id: v.id,
      company_id: v.company_id,
      company_name: v.company_name || "",
      name: v.name,
      is_active: v.is_active
    }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadReports",
`async function loadReports() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    company_name: r.company_name || "",
    vessel_id: r.vessel_id,
    inspection_date: r.inspection_date,
    report_ref: r.report_ref,
    title: r.title,
    inspector_name: r.inspector_name,
    inspector_company: r.inspector_company,
    ocimf_inspecting_company: r.ocimf_inspecting_company
  }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadOwnObservationRows",
`async function loadOwnObservationRows() {
  const { data, error } = await state.supabase.rpc("post_insp_export_observations", {
    p_vessel_id: null,
    p_from: null,
    p_to: null,
    p_observation_type: null,
  });

  if (error) throw error;

  const allowedVesselNames = new Set(
    (state.vessels || [])
      .map((v) => String(v.name || "").trim())
      .filter(Boolean)
  );

  if (!allowedVesselNames.size) return [];

  return (data || []).filter((r) => {
    const vesselName = String(r.vessel_name || "").trim();
    return allowedVesselNames.has(vesselName);
  });
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadInspectors",
`async function loadInspectors() {
  const { data, error } = await state.supabase.rpc("csvb_inspectors_for_me");

  if (error) throw error;

  return data || [];
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadAliases",
`async function loadAliases() {
  const { data, error } = await state.supabase.rpc("csvb_inspector_aliases_for_me");

  if (error) throw error;

  return data || [];
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadThirdPartyRows",
`async function loadThirdPartyRows() {
  const { data, error } = await state.supabase.rpc("csvb_third_party_inspector_observations_for_me");

  if (error) throw error;

  return data || [];
}`
    );

    write(file, s);
    console.log("patched inspector_intelligence.js");
  }
}

/* ============================================================
   3. Service worker cache bump
============================================================ */

{
  const sw = "public/service-worker.js";

  if (fs.existsSync(sw)) {
    let s = read(sw);

    if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
      s = s.replace(
        /const CACHE_VERSION = "[^"]+";/,
        'const CACHE_VERSION = "v21-mc5d-audit-inspector-filtering";'
      );
    }

    write(sw, s);
    console.log("bumped service-worker.js");
  }
}

fs.writeFileSync(
  "public/MC5D_AUDIT_INSPECTOR_COMPANY_FILTERING_APPLIED.txt",
  "MC-5D applied: Audit Observations and Inspector Intelligence now use company/vessel-scoped RPCs. No auth/Supabase key/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-5D Audit / Inspector Intelligence company filtering applied.");
NODE

echo "DONE: MC-5D frontend patch completed."
echo "Next: hard refresh relevant pages with Ctrl + Shift + R."
