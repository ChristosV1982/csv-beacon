// public/inspector_intelligence.js
// Inspector Intelligence module.
// Own inspection observations are read from existing post-inspection data.
// Third-party observations are stored separately in third_party_inspector_observations.

const OBS_TYPES = {
  negative: "Negative",
  largely: "Largely as expected",
  positive: "Positive",
};

function el(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => String(Number((p.replace(/^0+/, "") || "0")))).join(".");
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateInRange(dateStr, from, to) {
  const d = String(dateStr || "").slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function setStatus(text) {
  el("statusPill").textContent = text || "Ready";
}

function pgnoExportText(pgnoSelected) {
  const arr = Array.isArray(pgnoSelected) ? pgnoSelected : [];
  if (!arr.length) return "";

  return arr
    .map((x) => {
      const no = String(x?.pgno_no || x?.idx || "").trim();
      const text = String(x?.text || "").trim();
      if (no && text) return `${no} — ${text}`;
      if (no) return no;
      return text;
    })
    .filter(Boolean)
    .join("; ");
}

const state = {
  me: null,
  supabase: null,
  vessels: [],
  inspectors: [],
  aliases: [],
  allOwnRows: [],
  allThirdRows: [],
  allReports: [],
  reportMetaByKey: new Map(),
  currentRows: [],
};

function reportKey(row) {
  return [
    String(row.vessel_name || "").trim(),
    String(row.inspection_date || "").trim(),
    String(row.report_ref || "").trim(),
    String(row.title || "").trim(),
  ].join("|");
}

function vesselNameById(vesselId) {
  const v = (state.vessels || []).find((x) => String(x.id) === String(vesselId));
  return String(v?.name || "").trim();
}

function reportKeyFromReport(row) {
  return [
    vesselNameById(row.vessel_id),
    String(row.inspection_date || "").trim(),
    String(row.report_ref || "").trim(),
    String(row.title || "").trim(),
  ].join("|");
}

function rebuildReportMetaMap() {
  state.reportMetaByKey = new Map();

  for (const r of state.allReports || []) {
    const k = reportKeyFromReport(r);
    if (!k) continue;

    state.reportMetaByKey.set(k, {
      inspector_name: String(r.inspector_name || "").trim(),
      inspector_company: String(r.inspector_company || "").trim(),
      ocimf_inspecting_company: String(r.ocimf_inspecting_company || "").trim(),
    });
  }
}

function enrichOwnRows(rows) {
  return (rows || []).map((r) => {
    const meta = state.reportMetaByKey.get(reportKey(r)) || {};
    return {
      source_kind: "own",
      source_label: "Own Fleet Inspection",
      inspector_name: meta.inspector_name || "",
      inspector_company: meta.inspector_company || r.inspector_company || "",
      source_reference: r.report_ref || "",
      vessel_name: r.vessel_name || "",
      inspection_date: r.inspection_date || "",
      report_ref: r.report_ref || "",
      title: r.title || "",
      question_no: r.question_no || "",
      obs_type: r.observation_type || r.obs_type || "",
      designation: r.designation || "",
      soc: r.soc || "",
      noc: r.noc || "",
      observation_text: r.remarks || r.observation_text || "",
      remarks: r.remarks || r.observation_text || "",
      pgno_selected: Array.isArray(r.pgno_selected) ? r.pgno_selected : [],
      raw: r,
    };
  });
}

function normalizeThirdRow(r) {
  const inspector = (state.inspectors || []).find((x) => String(x.id) === String(r.inspector_id));

  return {
    source_kind: "third_party",
    source_label: "Third Party",
    inspector_id: r.inspector_id,
    inspector_name: inspector?.inspector_name || "",
    inspector_company: inspector?.inspector_company || "",
    source_company: r.source_company || "",
    source_reference: r.source_reference || "",
    vessel_name: r.vessel_name || "",
    vessel_type: r.vessel_type || "",
    inspection_date: r.inspection_date || "",
    report_ref: r.source_reference || "",
    title: r.source_company || "",
    question_no: r.question_no || "",
    obs_type: r.obs_type || "",
    designation: r.designation || "",
    soc: r.soc || "",
    noc: r.noc || "",
    observation_text: r.observation_text || "",
    remarks: r.remarks || r.observation_text || "",
    pgno_selected: Array.isArray(r.pgno_selected) ? r.pgno_selected : [],
    raw: r,
  };
}

async function loadVessels() {
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadReports() {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, report_ref, title, inspector_name, inspector_company, ocimf_inspecting_company");

  if (error) throw error;
  return data || [];
}

async function loadOwnObservationRows() {
  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
      p_vessel_id: null,
      p_from: null,
      p_to: null,
      p_observation_type: null,
    });

  if (error) throw error;
  return data || [];
}

async function loadInspectors() {
  const { data, error } = await state.supabase
    .from("inspectors")
    .select("*")
    .order("inspector_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadAliases() {
  const { data, error } = await state.supabase
    .from("inspector_aliases")
    .select("*")
    .order("alias_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadThirdPartyRows() {
  const { data, error } = await state.supabase
    .from("third_party_inspector_observations")
    .select("*")
    .order("inspection_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderInspectorSelect() {
  const sel = el("inspectorSelect");
  sel.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "— Select inspector —";
  sel.appendChild(empty);

  for (const i of state.inspectors || []) {
    const o = document.createElement("option");
    o.value = i.id;
    o.textContent = `${i.inspector_name}${i.inspector_company ? ` (${i.inspector_company})` : ""}`;
    sel.appendChild(o);
  }
}

function selectedInspector() {
  const id = String(el("inspectorSelect").value || "").trim();
  if (!id) return null;
  return (state.inspectors || []).find((i) => String(i.id) === id) || null;
}

function selectedInspectorNames() {
  const inspector = selectedInspector();
  if (!inspector) return new Set();

  const names = new Set([normName(inspector.inspector_name)]);

  for (const a of state.aliases || []) {
    if (String(a.inspector_id) === String(inspector.id)) {
      names.add(normName(a.alias_name));
    }
  }

  return names;
}

function renderAliases() {
  const inspector = selectedInspector();
  if (!inspector) {
    el("aliasList").textContent = "Aliases: —";
    return;
  }

  const aliases = (state.aliases || [])
    .filter((a) => String(a.inspector_id) === String(inspector.id))
    .map((a) => a.alias_name)
    .filter(Boolean);

  el("aliasList").textContent = aliases.length
    ? `Aliases: ${aliases.join(" | ")}`
    : "Aliases: —";
}

function filteredCombinedRows() {
  const inspector = selectedInspector();
  if (!inspector) return [];

  const names = selectedInspectorNames();
  const from = String(el("dateFrom").value || "").trim();
  const to = String(el("dateTo").value || "").trim();
  const source = String(el("sourceFilter").value || "combined").trim();

  const ownRows = state.allOwnRows.filter((r) => {
    if (source === "third_party") return false;
    if (!names.has(normName(r.inspector_name))) return false;
    if (!dateInRange(r.inspection_date, from, to)) return false;
    return true;
  });

  const thirdRows = state.allThirdRows.map(normalizeThirdRow).filter((r) => {
    if (source === "own") return false;
    if (String(r.inspector_id) !== String(inspector.id)) return false;
    if (!dateInRange(r.inspection_date, from, to)) return false;
    return true;
  });

  return [...ownRows, ...thirdRows].sort((a, b) => {
    const da = String(a.inspection_date || "");
    const db = String(b.inspection_date || "");
    return db.localeCompare(da);
  });
}

function renderSummary(rows) {
  const total = rows.length;
  const own = rows.filter((r) => r.source_kind === "own").length;
  const third = rows.filter((r) => r.source_kind === "third_party").length;
  const qSet = new Set(rows.map((r) => String(r.question_no || "").trim()).filter(Boolean));

  el("sumTotal").textContent = String(total);
  el("sumOwn").textContent = String(own);
  el("sumThird").textContent = String(third);
  el("sumQuestions").textContent = String(qSet.size);
}

function renderRecordsTable(rows) {
  const tbody = el("recordsTbody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="muted">No records found for the selected inspector/source/date filters.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const sourcePill = r.source_kind === "own"
      ? `<span class="pill pill-own">Own Fleet Inspection</span>`
      : `<span class="pill pill-third">Third Party</span>`;

    const reference = r.source_kind === "own"
      ? `${r.report_ref || ""}${r.title ? ` — ${r.title}` : ""}`
      : `${r.source_company || ""}${r.source_reference ? ` — ${r.source_reference}` : ""}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sourcePill}</td>
      <td>${esc(r.vessel_name || "—")}</td>
      <td>${esc(r.inspection_date || "—")}</td>
      <td>${esc(reference || "—")}</td>
      <td class="mono">${esc(canonicalQno(r.question_no || "") || "—")}</td>
      <td>${esc(OBS_TYPES[r.obs_type] || r.obs_type || "—")}</td>
      <td>${esc(r.designation || "—")}</td>
      <td>${esc(r.soc || "—")}</td>
      <td>${esc(r.noc || "—")}</td>
      <td>${esc(r.inspector_company || "—")}</td>
      <td class="remarksCell">${esc(r.remarks || r.observation_text || "—")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function applyFilters() {
  const rows = filteredCombinedRows();
  state.currentRows = rows;
  renderAliases();
  renderSummary(rows);
  renderRecordsTable(rows);
}

async function syncInspectorsFromOwnReports() {
  setStatus("Syncing…");

  const existing = new Set((state.inspectors || []).map((i) => normName(i.inspector_name)));
  const candidates = [];

  for (const r of state.allReports || []) {
    const name = String(r.inspector_name || "").trim();
    if (!name) continue;

    const key = normName(name);
    if (existing.has(key)) continue;

    existing.add(key);
    candidates.push({
      inspector_name: name,
      inspector_company: String(r.inspector_company || "").trim() || null,
      created_by: state.me?.id || null,
    });
  }

  if (!candidates.length) {
    setStatus("Ready");
    alert("No new inspectors found in own reports.");
    return;
  }

  const { error } = await state.supabase
    .from("inspectors")
    .insert(candidates);

  if (error) throw error;

  await reloadInspectorData();

  setStatus("Ready");
  alert(`Synced ${candidates.length} inspector(s) from own reports.`);
}

async function createInspector() {
  const name = String(el("newInspectorName").value || "").trim();
  if (!name) return alert("Inspector name is required.");

  const payload = {
    inspector_name: name,
    inspector_company: String(el("newInspectorCompany").value || "").trim() || null,
    notes: String(el("newInspectorNotes").value || "").trim() || null,
    created_by: state.me?.id || null,
  };

  const { error } = await state.supabase
    .from("inspectors")
    .insert([payload]);

  if (error) throw error;

  el("newInspectorName").value = "";
  el("newInspectorCompany").value = "";
  el("newInspectorNotes").value = "";

  await reloadInspectorData();
  alert("Inspector created.");
}

async function addAlias() {
  const inspector = selectedInspector();
  if (!inspector) return alert("Select inspector first.");

  const alias = String(el("aliasName").value || "").trim();
  if (!alias) return alert("Alias name is required.");

  const payload = {
    inspector_id: inspector.id,
    alias_name: alias,
    created_by: state.me?.id || null,
  };

  const { error } = await state.supabase
    .from("inspector_aliases")
    .insert([payload]);

  if (error) throw error;

  el("aliasName").value = "";
  await reloadInspectorData();
  el("inspectorSelect").value = inspector.id;
  renderAliases();
  applyFilters();

  alert("Alias added.");
}

function clearThirdPartyForm() {
  [
    "tpSourceCompany",
    "tpSourceReference",
    "tpInspectionDate",
    "tpVesselName",
    "tpVesselType",
    "tpQuestionNo",
    "tpSoc",
    "tpNoc",
    "tpObservationText",
    "tpRemarks",
  ].forEach((id) => {
    el(id).value = "";
  });

  el("tpObsType").value = "negative";
  el("tpDesignation").value = "";
}

async function saveThirdPartyObservation() {
  const inspector = selectedInspector();
  if (!inspector) return alert("Select inspector first.");

  const obsType = String(el("tpObsType").value || "").trim();
  if (!obsType) return alert("Observation type is required.");

  const payload = {
    inspector_id: inspector.id,
    source_type: "third_party",
    source_company: String(el("tpSourceCompany").value || "").trim() || null,
    source_reference: String(el("tpSourceReference").value || "").trim() || null,
    inspection_date: String(el("tpInspectionDate").value || "").trim() || null,
    vessel_name: String(el("tpVesselName").value || "").trim() || null,
    vessel_type: String(el("tpVesselType").value || "").trim() || null,
    question_no: canonicalQno(el("tpQuestionNo").value) || null,
    obs_type: obsType,
    designation: String(el("tpDesignation").value || "").trim() || null,
    soc: String(el("tpSoc").value || "").trim() || null,
    noc: String(el("tpNoc").value || "").trim() || null,
    observation_text: String(el("tpObservationText").value || "").trim() || null,
    remarks: String(el("tpRemarks").value || "").trim() || null,
    pgno_selected: [],
    created_by: state.me?.id || null,
  };

  const { error } = await state.supabase
    .from("third_party_inspector_observations")
    .insert([payload]);

  if (error) throw error;

  clearThirdPartyForm();
  state.allThirdRows = await loadThirdPartyRows();
  applyFilters();

  alert("Third-party observation saved.");
}

function exportCurrentViewCsv() {
  const rows = state.currentRows || [];

  const header = [
    "source",
    "vessel_name",
    "inspection_date",
    "report_or_reference",
    "question_no",
    "observation_type",
    "designation",
    "soc",
    "noc",
    "inspector_name",
    "inspector_company",
    "pgno_selected",
    "remarks",
  ];

  const csv = [header.join(",")];

  for (const r of rows) {
    const reference = r.source_kind === "own"
      ? `${r.report_ref || ""}${r.title ? ` — ${r.title}` : ""}`
      : `${r.source_company || ""}${r.source_reference ? ` — ${r.source_reference}` : ""}`;

    const line = [
      r.source_label || "",
      r.vessel_name || "",
      r.inspection_date || "",
      reference || "",
      canonicalQno(r.question_no || ""),
      OBS_TYPES[r.obs_type] || r.obs_type || "",
      r.designation || "",
      r.soc || "",
      r.noc || "",
      r.inspector_name || "",
      r.inspector_company || "",
      pgnoExportText(r.pgno_selected),
      r.remarks || r.observation_text || "",
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");

    csv.push(line);
  }

  const inspector = selectedInspector();
  const safeName = String(inspector?.inspector_name || "inspector")
    .replace(/[^a-z0-9]+/gi, "_")
    .slice(0, 80);

  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.download = `inspector_intelligence_${safeName}.csv`;
  a.href = URL.createObjectURL(blob);

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function reloadInspectorData() {
  state.inspectors = await loadInspectors();
  state.aliases = await loadAliases();
  renderInspectorSelect();
}

async function reloadAllData() {
  state.vessels = await loadVessels();
  state.allReports = await loadReports();
  rebuildReportMetaMap();

  const rawOwnRows = await loadOwnObservationRows();
  state.allOwnRows = enrichOwnRows(rawOwnRows);

  await reloadInspectorData();

  state.allThirdRows = await loadThirdPartyRows();
}

async function init() {
  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([
    R.SUPER_ADMIN,
    R.COMPANY_ADMIN,
    R.COMPANY_SUPERINTENDENT,
  ].filter(Boolean));

  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  state.supabase = window.AUTH?.ensureSupabase
    ? window.AUTH.ensureSupabase()
    : window.__supabaseClient;

  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded.");
  }

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 365);

  el("dateFrom").value = ymd(from);
  el("dateTo").value = ymd(to);

  await reloadAllData();

  el("inspectorSelect").addEventListener("change", applyFilters);
  el("sourceFilter").addEventListener("change", applyFilters);
  el("dateFrom").addEventListener("change", applyFilters);
  el("dateTo").addEventListener("change", applyFilters);
  el("applyBtn").addEventListener("click", applyFilters);

  el("syncInspectorsBtn").addEventListener("click", async () => {
    try {
      await syncInspectorsFromOwnReports();
    } catch (e) {
      console.error(e);
      alert("Sync failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("createInspectorBtn").addEventListener("click", async () => {
    try {
      await createInspector();
    } catch (e) {
      console.error(e);
      alert("Create inspector failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("addAliasBtn").addEventListener("click", async () => {
    try {
      await addAlias();
    } catch (e) {
      console.error(e);
      alert("Add alias failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("saveThirdPartyBtn").addEventListener("click", async () => {
    try {
      await saveThirdPartyObservation();
    } catch (e) {
      console.error(e);
      alert("Save third-party observation failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("clearThirdPartyFormBtn").addEventListener("click", clearThirdPartyForm);
  el("exportCsvBtn").addEventListener("click", exportCurrentViewCsv);

  renderAliases();
  applyFilters();
  setStatus("Ready");
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Inspector Intelligence page failed to load: " + (e?.message || String(e)));
    setStatus("Error");
  }
})();