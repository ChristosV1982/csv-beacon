#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc5b2_post_inspection_company_filtering

for f in \
  public/post_inspection.js \
  public/post_inspection_detail.js \
  public/post_inspection_stats.js \
  public/post_inspection_kpis.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc5b2_post_inspection_company_filtering/$(basename "$f")
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

  if (start < 0) {
    throw new Error(`Async function not found: ${name}`);
  }

  const end = findBlockEnd(src, start);

  if (end < 0) {
    throw new Error(`Could not find end of async function: ${name}`);
  }

  return src.slice(0, start) + replacement + src.slice(end);
}

function patchRequireAuthRoles(src) {
  src = src.replace(
    /window\.AUTH\.requireAuth\(\[R\.SUPER_ADMIN,\s*R\.COMPANY_ADMIN\]\)/g,
    "window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean))"
  );

  src = src.replace(
    /window\.AUTH\.requireAuth\(\[R\.SUPER_ADMIN,\s*R\.COMPANY_ADMIN\]\.filter\(Boolean\)\)/g,
    "window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean))"
  );

  return src;
}

/* ------------------------------------------------------------
   1. public/post_inspection.js
   Stored inspections list uses csvb_post_inspection_reports_for_me()
------------------------------------------------------------ */

{
  const file = "public/post_inspection.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadReportsFromDb",
`async function loadReportsFromDb() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    ...r,
    vessel_name: r.vessel_name || "",
    company_name: r.company_name || ""
  }));
}`
    );

    s = patchRequireAuthRoles(s);

    write(file, s);
    console.log("patched post_inspection.js");
  }
}

/* ------------------------------------------------------------
   2. public/post_inspection_detail.js
   Detail page uses accessible vessels and scoped report lookup
------------------------------------------------------------ */

{
  const file = "public/post_inspection_detail.js";

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
      "loadReportById",
`async function loadReportById(reportId) {
  if (!reportId) throw new Error("report_id is required.");

  const { data, error } = await state.supabase.rpc("csvb_post_inspection_report_by_id_for_me", {
    p_report_id: reportId
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("Post-Inspection report not found or access denied for your company/vessel.");
  }

  return row;
}`
    );

    s = patchRequireAuthRoles(s);

    write(file, s);
    console.log("patched post_inspection_detail.js");
  }
}

/* ------------------------------------------------------------
   3. public/post_inspection_stats.js
   Stats page uses accessible vessels/reports and filters raw export rows
------------------------------------------------------------ */

{
  const file = "public/post_inspection_stats.js";

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
      "loadPostReportRows",
`async function loadPostReportRows() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    company_name: r.company_name || "",
    vessel_id: r.vessel_id,
    vessel_name: r.vessel_name || "",
    inspection_date: r.inspection_date,
    report_ref: r.report_ref,
    title: r.title,
    ocimf_inspecting_company: r.ocimf_inspecting_company,
    inspector_name: r.inspector_name,
    inspector_company: r.inspector_company
  }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadPostObservationRows",
`async function loadPostObservationRows() {
  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
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
      "loadCombinedObservationRows",
`async function loadCombinedObservationRows() {
  const { data, error } = await state.supabase
    .rpc("fleet_obs_analytics_export", {
      p_vessel_id: null,
      p_from: null,
      p_to: null,
      p_record_source: null,
      p_observation_type: null,
    });

  if (error) throw error;

  const allowedVesselNames = new Set(
    (state.vessels || [])
      .map((v) => String(v.name || "").trim())
      .filter(Boolean)
  );

  if (!allowedVesselNames.size) return [];

  return normalizeCombinedRows(data || []).filter((r) => {
    const vesselName = String(r.vessel_name || "").trim();
    return allowedVesselNames.has(vesselName);
  });
}`
    );

    s = patchRequireAuthRoles(s);

    write(file, s);
    console.log("patched post_inspection_stats.js");
  }
}

/* ------------------------------------------------------------
   4. public/post_inspection_kpis.js
   KPI page uses scoped reports first, then observations by allowed report IDs
------------------------------------------------------------ */

{
  const file = "public/post_inspection_kpis.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadAllReports",
`async function loadAllReports(supabase, fromDate, toDate) {
  const { data, error } = await supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).filter((r) => {
    const d = String(r.inspection_date || "").slice(0, 10);
    if (!d) return false;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  });
}`
    );

    s = patchRequireAuthRoles(s);

    write(file, s);
    console.log("patched post_inspection_kpis.js");
  }
}

/* ------------------------------------------------------------
   5. Service worker cache bump
------------------------------------------------------------ */

{
  const sw = "public/service-worker.js";

  if (fs.existsSync(sw)) {
    let s = read(sw);

    if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
      s = s.replace(
        /const CACHE_VERSION = "[^"]+";/,
        'const CACHE_VERSION = "v19-mc5b2-post-inspection-filtering";'
      );
    }

    write(sw, s);
    console.log("bumped service-worker.js");
  }
}

fs.writeFileSync(
  "public/MC5B2_POST_INSPECTION_COMPANY_FILTERING_APPLIED.txt",
  "MC-5B2 applied: Post-Inspection frontend now uses company/vessel-scoped RPCs. No auth/Supabase key/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-5B2 Post-Inspection company/vessel filtering applied.");
NODE

echo "DONE: MC-5B2 completed."
echo "Next: hard refresh with Ctrl + Shift + R."
