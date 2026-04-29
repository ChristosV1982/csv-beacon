#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc5c2_self_assessment_company_filtering

for f in \
  public/q-company.js \
  public/q-vessel.js \
  public/sa_assignments.js \
  public/sa_tasks.js \
  public/sa_compare.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc5c2_self_assessment_company_filtering/$(basename "$f")
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

function replaceFunction(src, name, replacement) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  const end = findBlockEnd(src, start);
  if (end < 0) throw new Error(`Could not find end of function: ${name}`);
  return src.slice(0, start) + replacement + src.slice(end);
}

function replaceAsyncFunction(src, name, replacement) {
  const marker = `async function ${name}(`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`Async function not found: ${name}`);
  const end = findBlockEnd(src, start);
  if (end < 0) throw new Error(`Could not find end of async function: ${name}`);
  return src.slice(0, start) + replacement + src.slice(end);
}

/* ------------------------------------------------------------
   1. q-company.js
------------------------------------------------------------ */

{
  const file = "public/q-company.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "getMyProfile",
`async function getMyProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username, role, vessel_id, position, company_id")
    .eq("id", userId)
    .single();

  if (error) throw error;

  let vesselName = "";

  if (data?.vessel_id) {
    const { data: v, error: vErr } = await supabaseClient
      .rpc("csvb_accessible_vessels_for_me");

    if (!vErr) {
      const row = (v || []).find((x) => String(x.id) === String(data.vessel_id));
      vesselName = row?.name || "";
    }
  }

  return { ...data, vessels: { name: vesselName } };
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadVessels",
`async function loadVessels() {
  const { data, error } = await supabaseClient.rpc("csvb_accessible_vessels_for_me");

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
      "loadQuestionnaires",
`async function loadQuestionnaires() {
  const { data, error } = await supabaseClient.rpc("csvb_questionnaires_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    company_name: r.company_name || "",
    title: r.title,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    vessel_id: r.vessel_id,
    vessel_name: r.vessel_name || "",
    assigned_position: r.assigned_position,
    mode: r.mode,
    created_by: r.created_by
  }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadTemplates",
`async function loadTemplates() {
  const { data, error } = await supabaseClient.rpc("csvb_questionnaire_templates_for_me");

  if (error) throw error;

  return (data || []).map((t) => ({
    id: t.id,
    company_id: t.company_id,
    company_name: t.company_name || "",
    name: t.name,
    description: t.description,
    is_active: t.is_active,
    created_at: t.created_at,
    updated_at: t.updated_at
  }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadTemplateCounts",
`async function loadTemplateCounts() {
  const { data, error } = await supabaseClient.rpc("csvb_template_question_counts_for_me");

  if (error) throw error;

  const map = new Map();

  for (const row of data || []) {
    map.set(row.template_id, Number(row.question_count || 0));
  }

  return map;
}`
    );

    write(file, s);
    console.log("patched q-company.js");
  }
}

/* ------------------------------------------------------------
   2. q-vessel.js
------------------------------------------------------------ */

{
  const file = "public/q-vessel.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadVessels",
`async function loadVessels(supabase) {
  const { data, error } = await supabase.rpc("csvb_accessible_vessels_for_me");

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
      "loadQuestionnairesForVessel",
`async function loadQuestionnairesForVessel(supabase, vesselId, status, viewerRole, viewerPosition) {
  const { data, error } = await supabase.rpc("csvb_questionnaires_for_me");

  if (error) throw error;

  let rows = (data || []).filter((r) => String(r.vessel_id || "") === String(vesselId || ""));

  if (status) {
    rows = rows.filter((r) => String(r.status || "") === String(status));
  }

  const isVesselViewer = (viewerRole === AUTH.ROLES.VESSEL);

  if (isVesselViewer) {
    const pos = String(viewerPosition || "").toLowerCase();

    if (pos && pos !== "master") {
      rows = rows.filter((r) => {
        const assigned = String(r.assigned_position || "").toLowerCase();
        return !assigned || assigned === pos;
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    updated_at: r.updated_at,
    created_at: r.created_at,
    mode: r.mode,
    assigned_position: r.assigned_position
  }));
}`
    );

    s = s.replace(
      "const me = await AUTH.requireAuth([R.VESSEL, R.SUPER_ADMIN, R.COMPANY_ADMIN],",
      "const me = await AUTH.requireAuth([R.VESSEL, R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean),"
    );

    s = s.replace(
      "const isAdminViewer = (role === R.SUPER_ADMIN || role === R.COMPANY_ADMIN);",
      "const isAdminViewer = (role === R.SUPER_ADMIN || role === R.COMPANY_ADMIN || role === R.COMPANY_SUPERINTENDENT);"
    );

    write(file, s);
    console.log("patched q-vessel.js");
  }
}

/* ------------------------------------------------------------
   3. sa_assignments.js
------------------------------------------------------------ */

{
  const file = "public/sa_assignments.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadCampaigns",
`async function loadCampaigns(supabase) {
  const { data, error } = await supabase.rpc("csvb_self_assess_campaigns_for_me");

  if (error) throw error;

  return (data || []).map((c) => ({
    id: c.id,
    company_id: c.company_id,
    company_name: c.company_name || "",
    name: c.name,
    due_date: c.due_date,
    open_from: c.open_from,
    created_at: c.created_at
  }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadTemplates",
`async function loadTemplates(supabase) {
  const { data, error } = await supabase.rpc("csvb_questionnaire_templates_for_me");

  if (error) throw error;

  return (data || [])
    .filter((t) => t.is_active !== false)
    .map((t) => ({
      id: t.id,
      company_id: t.company_id,
      company_name: t.company_name || "",
      name: t.name,
      description: t.description,
      is_active: t.is_active,
      updated_at: t.updated_at
    }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadVessels",
`async function loadVessels(supabase) {
  const { data, error } = await supabase.rpc("csvb_accessible_vessels_for_me");

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

    s = s.replace(
      "const me = await AUTH.requireAuth([AUTH.ROLES.SUPER_ADMIN, AUTH.ROLES.COMPANY_ADMIN]);",
      "const me = await AUTH.requireAuth([AUTH.ROLES.SUPER_ADMIN, AUTH.ROLES.COMPANY_ADMIN, AUTH.ROLES.COMPANY_SUPERINTENDENT].filter(Boolean));"
    );

    write(file, s);
    console.log("patched sa_assignments.js");
  }
}

/* ------------------------------------------------------------
   4. sa_tasks.js
------------------------------------------------------------ */

{
  const file = "public/sa_tasks.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadCampaigns",
`async function loadCampaigns(supabase) {
  const { data, error } = await supabase.rpc("csvb_self_assess_campaigns_for_me");

  if (error) throw error;

  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    due_date: c.due_date,
    open_from: c.open_from,
    created_at: c.created_at
  }));
}`
    );

    s = replaceAsyncFunction(
      s,
      "loadMyTasks",
`async function loadMyTasks(supabase, campaignIdOrNull) {
  const { data, error } = await supabase.rpc("csvb_self_assess_instances_for_me", {
    p_campaign_id: campaignIdOrNull || null
  });

  if (error) throw error;

  return (data || []).map((r) => ({
    questionnaire_id: r.questionnaire_id,
    campaign_id: r.campaign_id,
    assignee_type: r.assignee_type,
    assignee_role: r.assignee_role,
    due_date: r.due_date,
    created_by: r.created_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    questionnaires: {
      id: r.questionnaire_id,
      title: r.questionnaire_title,
      status: r.questionnaire_status,
      updated_at: r.questionnaire_updated_at,
      created_at: r.questionnaire_created_at,
      vessel_id: r.questionnaire_vessel_id
    },
    self_assess_campaigns: {
      id: r.campaign_id,
      name: r.campaign_name,
      open_from: r.campaign_open_from,
      due_date: r.campaign_due_date
    },
    _vessel_name: r.questionnaire_vessel_name || ""
  }));
}`
    );

    s = replaceFunction(
      s,
      "renderRows",
`function renderRows(rows, vesselNameMap) {
  const body = getBodyEl();
  if (!body) return;

  body.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="7" class="muted">No assigned self-assessments found.</td>';
    body.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const q = r.questionnaires || {};
    const campName = r.self_assess_campaigns?.name || "(no campaign)";
    const vesselName = r._vessel_name || vesselNameMap.get(q.vessel_id) || "-";
    const title = q.title || r.questionnaire_id;

    const updated = q.updated_at || q.created_at || null;

    const tr = document.createElement("tr");

    tr.innerHTML = \`
      <td><div style="font-weight:900;color:#1a4170;">\${campName}</div></td>
      <td style="font-weight:900;color:#1a4170;">\${vesselName}</td>
      <td>
        <div style="font-weight:900;color:#1a4170;">\${title}</div>
        <div style="color:#4d6283;font-weight:700;margin-top:4px;">ID: \${r.questionnaire_id}</div>
      </td>
      <td>\${statusPill(q.status)}</td>
      <td style="font-weight:900;color:#1a4170;">\${fmtDate(r.due_date)}</td>
      <td style="font-weight:900;color:#1a4170;">\${fmtTs(updated)}</td>
      <td>
        <button class="btn2" data-open="\${r.questionnaire_id}">Open</button>
        <button class="btn2" data-submit="\${r.questionnaire_id}" \${String(q.status||"").toLowerCase()==="submitted" ? "disabled" : ""}>Mark Submitted</button>
      </td>
    \`;

    body.appendChild(tr);
  }
}`
    );

    write(file, s);
    console.log("patched sa_tasks.js");
  }
}

/* ------------------------------------------------------------
   5. sa_compare.js
------------------------------------------------------------ */

{
  const file = "public/sa_compare.js";

  if (fs.existsSync(file)) {
    let s = read(file);

    s = replaceAsyncFunction(
      s,
      "loadVessels",
`async function loadVessels(supabase) {
  const { data, error } = await supabase.rpc("csvb_accessible_vessels_for_me");

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
      "loadCampaigns",
`async function loadCampaigns(supabase) {
  const { data, error } = await supabase.rpc("csvb_self_assess_campaigns_for_me");

  if (error) throw error;

  return (data || []).map((c) => ({
    id: c.id,
    company_id: c.company_id,
    company_name: c.company_name || "",
    name: c.name,
    created_at: c.created_at
  }));
}`
    );

    s = s.replace(
      "const me = await AUTH.requireAuth([AUTH.ROLES.SUPER_ADMIN, AUTH.ROLES.COMPANY_ADMIN]);",
      "const me = await AUTH.requireAuth([AUTH.ROLES.SUPER_ADMIN, AUTH.ROLES.COMPANY_ADMIN, AUTH.ROLES.COMPANY_SUPERINTENDENT].filter(Boolean));"
    );

    write(file, s);
    console.log("patched sa_compare.js");
  }
}

/* ------------------------------------------------------------
   6. Service worker cache bump
------------------------------------------------------------ */

{
  const sw = "public/service-worker.js";

  if (fs.existsSync(sw)) {
    let s = read(sw);

    if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
      s = s.replace(
        /const CACHE_VERSION = "[^"]+";/,
        'const CACHE_VERSION = "v20-mc5c2-self-assessment-filtering";'
      );
    }

    write(sw, s);
    console.log("bumped service-worker.js");
  }
}

fs.writeFileSync(
  "public/MC5C2_SELF_ASSESSMENT_COMPANY_FILTERING_APPLIED.txt",
  "MC-5C2 applied: Self-Assessment frontend now uses company/vessel-scoped RPCs. No auth/Supabase key/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-5C2 Self-Assessment company/vessel filtering applied.");
NODE

echo "DONE: MC-5C2 completed."
echo "Next: hard refresh relevant pages with Ctrl + Shift + R."
