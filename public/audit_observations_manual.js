// public/audit_observations_manual.js
// Audit Observations Manual module.
// Manual Excel-based audit observation staging module. Future steps will add Excel import and M-SCAT RCA.
// Observations use SIRE-style fields: question_no, obs_type, designation, SOC, NOC.

const AUDIT_OBSERVATIONS_MANUAL_BUILD = "AUDIT_OBSERVATIONS_MANUAL_20260626_FILTERED_MSCAT_RECALC_ALL_BATCHES";
window.CSVB_AUDIT_OBSERVATIONS_MANUAL_BUILD = AUDIT_OBSERVATIONS_MANUAL_BUILD;

const AUDIT_BUCKET = "audit-reports";

const AUDIT_SOURCE_LABELS = {
  internal_superintendent: "Internal by Superintendent",
  internal_master: "Internal by Master",
  external_contractor: "External by Contractor",
};

const OBS_TYPE_LABELS = {
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

function setStatus(text) {
  el("statusPill").textContent = text || "Ready";
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => String(Number((p.replace(/^0+/, "") || "0")))).join(".");
}

function dateInRange(dateStr, from, to) {
  const d = String(dateStr || "").slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const AUDIT_FILTER_IDS = [
  "auditVesselFilter",
  "auditTypeFilter",
  "auditSourceFilter",
  "auditNilFilter",
  "auditMscatFilter",
  "auditFrom",
  "auditTo"
];

function captureAuditFilters() {
  const out = {};
  for (const id of AUDIT_FILTER_IDS) {
    const node = el(id);
    if (node) out[id] = String(node.value || "");
  }
  return out;
}

function restoreAuditFilters(filters) {
  for (const id of AUDIT_FILTER_IDS) {
    const node = el(id);
    if (!node) continue;

    const wanted = String(filters?.[id] || "");

    if (node.tagName === "SELECT" && wanted) {
      const exists = Array.from(node.options || []).some((o) => String(o.value) === wanted);
      node.value = exists ? wanted : "";
    } else {
      node.value = wanted;
    }
  }
}

function safeName(name) {
  return String(name || "audit_report")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 120);
}

function obsTypeBadge(type) {
  if (type === "negative") return `<span class="pill pill-neg">Negative</span>`;
  if (type === "largely") return `<span class="pill pill-lae">Largely as expected</span>`;
  if (type === "positive") return `<span class="pill pill-pos">Positive</span>`;
  return `<span class="pill">${esc(type || "—")}</span>`;
}

function auditRemarkNumber(audit, label) {
  const text = String(audit?.remarks || "");
  const safeLabel = String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${safeLabel}\\s*:\\s*(\\d+)`, "i");
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

function auditNilInfo(audit) {
  const path = String(audit?.report_storage_path || "");
  const remarks = String(audit?.remarks || "");
  const isManualImport = path.startsWith("manual_import_batches/") ||
    remarks.includes("Manual Excel import from DANAOS-derived audit observations.");

  const nilRows = auditRemarkNumber(audit, "NIL header rows");
  const observationRows = auditRemarkNumber(audit, "Observation rows");

  const isNil = !!isManualImport &&
    Number(nilRows || 0) > 0 &&
    Number(observationRows || 0) === 0;

  return {
    isManualImport,
    isNil,
    nilRows: Number(nilRows || 0),
    observationRows: Number(observationRows || 0)
  };
}

function auditObsStatusBadge(audit) {
  const info = auditNilInfo(audit);

  if (info.isNil) {
    return `<span class="pill pill-nil">NIL</span>`;
  }

  if (info.isManualImport && info.observationRows > 0) {
    return `<span class="pill pill-obs">OBS ${esc(info.observationRows)}</span>`;
  }

  return `<span class="pill">—</span>`;
}

function auditMscatChunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function auditMscatInfo(audit) {
  const id = String(audit?.id || "");
  return state.auditMscatStats?.[id] || {
    status: "not_applicable",
    applicable: 0,
    withMscat: 0,
    mscatRows: 0,
    aiOnly: 0,
    manualOnly: 0,
    mixedObs: 0
  };
}

function auditMscatStatusBadge(audit) {
  const info = auditMscatInfo(audit);

  if (info.status === "missing") {
    return `<span class="pill pill-none">Missing ${esc(info.withMscat)}/${esc(info.applicable)}</span>`;
  }

  if (info.status === "manual") {
    return `<span class="pill pill-manual">Manual reviewed</span>`;
  }

  if (info.status === "mixed") {
    return `<span class="pill pill-mixed">Mixed</span>`;
  }

  if (info.status === "ai") {
    return `<span class="pill pill-ai">AI populated</span>`;
  }

  return `<span class="pill pill-none">N/A</span>`;
}

async function loadAuditMscatStats() {
  const reportIds = Array.from(new Set((state.audits || []).map((a) => String(a.id || "")).filter(Boolean)));
  const stats = {};

  for (const reportId of reportIds) {
    stats[reportId] = {
      status: "not_applicable",
      applicable: 0,
      withMscat: 0,
      mscatRows: 0,
      aiOnly: 0,
      manualOnly: 0,
      mixedObs: 0
    };
  }

  if (!reportIds.length) return stats;

  const obsRows = [];

  for (const reportChunk of auditMscatChunkArray(reportIds, 75)) {
    const { data, error } = await state.supabase
      .from("audit_observation_items")
      .select("id,report_id,obs_type")
      .in("report_id", reportChunk);

    if (error) throw error;

    obsRows.push(...(data || []));
  }

  const applicableObs = obsRows.filter((r) => {
    const t = String(r.obs_type || "").trim().toLowerCase();
    return t === "negative" || t === "largely";
  });

  const obsToReport = new Map();

  for (const obs of applicableObs) {
    const obsId = String(obs.id || "");
    const reportId = String(obs.report_id || "");
    if (!obsId || !reportId) continue;

    obsToReport.set(obsId, reportId);

    if (!stats[reportId]) {
      stats[reportId] = {
        status: "not_applicable",
        applicable: 0,
        withMscat: 0,
        mscatRows: 0,
        aiOnly: 0,
        manualOnly: 0,
        mixedObs: 0
      };
    }

    stats[reportId].applicable += 1;
  }

  const obsIds = Array.from(obsToReport.keys());
  const mscatRows = [];

  for (const obsChunk of auditMscatChunkArray(obsIds, 100)) {
    const { data, error } = await state.supabase
      .from("audit_observation_mscat")
      .select("audit_observation_item_id,selection_source")
      .in("audit_observation_item_id", obsChunk);

    if (error) throw error;

    mscatRows.push(...(data || []));
  }

  const rowsByObs = new Map();

  for (const row of mscatRows) {
    const obsId = String(row.audit_observation_item_id || "");
    if (!obsId) continue;

    if (!rowsByObs.has(obsId)) rowsByObs.set(obsId, []);
    rowsByObs.get(obsId).push(row);
  }

  for (const obsId of obsIds) {
    const reportId = obsToReport.get(obsId);
    if (!reportId || !stats[reportId]) continue;

    const rows = rowsByObs.get(obsId) || [];
    if (!rows.length) continue;

    const hasAi = rows.some((r) => String(r.selection_source) === "ai_suggested");
    const hasManual = rows.some((r) => String(r.selection_source) === "manual");

    stats[reportId].withMscat += 1;
    stats[reportId].mscatRows += rows.length;

    if (hasManual && !hasAi) stats[reportId].manualOnly += 1;
    else if (hasAi && !hasManual) stats[reportId].aiOnly += 1;
    else stats[reportId].mixedObs += 1;
  }

  for (const reportId of Object.keys(stats)) {
    const x = stats[reportId];

    if (!x.applicable) {
      x.status = "not_applicable";
    } else if (x.withMscat < x.applicable) {
      x.status = "missing";
    } else if (x.manualOnly === x.applicable) {
      x.status = "manual";
    } else if (x.aiOnly === x.applicable) {
      x.status = "ai";
    } else {
      x.status = "mixed";
    }
  }

  return stats;
}

const state = {
  me: null,
  supabase: null,
  vessels: [],
  auditTypes: [],
  profiles: [],
  inspectors: [],
  audits: [],
  auditMscatStats: {},
  observations: [],
  activeAudit: null,
  uploadedFileMeta: null,
};

const manualImportState = {
  workbook: null,
  fileName: "",
  fileType: "",
  sheetName: "",
  rows: [],
  headerRowNumber: null,
  batchId: null,
  saving: false,
};

const EXCLUDED_MANUAL_IMPORT_VESSELS = new Set([
  "OLYMPIC SEA",
  "OLYMPIC SKY",
]);

function isExcludedManualImportVessel(normalizedName) {
  const name = String(normalizedName || "").replace(/\s+/g, " ").trim().toUpperCase();
  return EXCLUDED_MANUAL_IMPORT_VESSELS.has(name);
}


function vesselNameById(id) {
  const v = state.vessels.find((x) => String(x.id) === String(id));
  return v?.name || "";
}

function auditTypeNameById(id) {
  const t = state.auditTypes.find((x) => String(x.id) === String(id));
  return t?.audit_type_name || "";
}

function profileNameById(id) {
  const p = state.profiles.find((x) => String(x.id) === String(id));
  return p?.username || p?.position || "";
}

function inspectorNameById(id) {
  const i = state.inspectors.find((x) => String(x.id) === String(id));
  return i?.inspector_name || "";
}

function currentAuditorLabel(audit) {
  if (!audit) return "";
  if (audit.audit_source === "external_contractor") {
    return inspectorNameById(audit.auditor_inspector_id) || "—";
  }
  return profileNameById(audit.auditor_profile_id) || "—";
}

async function loadVessels() {
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
}

async function loadAuditTypes() {
  const { data, error } = await state.supabase.rpc("csvb_audit_types_for_me");

  if (error) throw error;

  return (data || []).filter((t) => t.is_active !== false);
}

async function loadProfiles() {
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
}

async function loadInspectors() {
  const { data, error } = await state.supabase.rpc("csvb_inspectors_for_me");

  if (error) throw error;

  return (data || []).filter((i) => i.is_active !== false);
}

async function loadAudits() {
  const { data, error } = await state.supabase.rpc("csvb_audit_reports_for_me");

  if (error) throw error;

  return data || [];
}

async function loadObservationsForAudit(auditId) {
  if (!auditId) return [];

  const { data, error } = await state.supabase.rpc("csvb_audit_observation_items_for_me", {
    p_report_id: auditId
  });

  if (error) throw error;

  return data || [];
}

function renderSelects() {
  const vesselSelects = [el("vesselSelect"), el("auditVesselFilter")];

  for (const sel of vesselSelects) {
    sel.innerHTML = "";

    if (sel.id === "auditVesselFilter") {
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "All vessels";
      sel.appendChild(all);
    }

    for (const v of state.vessels) {
      const o = document.createElement("option");
      o.value = v.id;
      o.textContent = v.name;
      sel.appendChild(o);
    }
  }

  const auditTypeSelects = [el("auditTypeSelect"), el("auditTypeFilter")];

  for (const sel of auditTypeSelects) {
    sel.innerHTML = "";

    if (sel.id === "auditTypeFilter") {
      const all = document.createElement("option");
      all.value = "";
      all.textContent = "All audit types";
      sel.appendChild(all);
    }

    for (const t of state.auditTypes) {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.audit_type_name;
      sel.appendChild(o);
    }
  }

  const profSel = el("auditorProfileSelect");
  profSel.innerHTML = "";
  const emptyProf = document.createElement("option");
  emptyProf.value = "";
  emptyProf.textContent = "— Select company representative / Master —";
  profSel.appendChild(emptyProf);

  for (const p of state.profiles) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.username || "Unnamed"}${p.role ? ` (${p.role})` : ""}`;
    profSel.appendChild(o);
  }

  const inspSel = el("auditorInspectorSelect");
  inspSel.innerHTML = "";
  const emptyInsp = document.createElement("option");
  emptyInsp.value = "";
  emptyInsp.textContent = "— Select third-party auditor —";
  inspSel.appendChild(emptyInsp);

  for (const i of state.inspectors) {
    const o = document.createElement("option");
    o.value = i.id;
    o.textContent = `${i.inspector_name}${i.inspector_company ? ` (${i.inspector_company})` : ""}`;
    inspSel.appendChild(o);
  }
}

function updateAuditorMode() {
  const source = String(el("auditSource").value || "").trim();
  const isExternal = source === "external_contractor";

  el("internalAuditorWrap").classList.toggle("hidden", isExternal);
  el("externalAuditorWrap").classList.toggle("hidden", !isExternal);
  el("contractorCompanyWrap").classList.toggle("hidden", !isExternal);
}

function filteredAudits() {
  const vesselId = String(el("auditVesselFilter").value || "").trim();
  const typeId = String(el("auditTypeFilter").value || "").trim();
  const source = String(el("auditSourceFilter").value || "").trim();
  const nilFilter = String(el("auditNilFilter")?.value || "").trim();
  const mscatFilter = String(el("auditMscatFilter")?.value || "").trim();
  const from = String(el("auditFrom").value || "").trim();
  const to = String(el("auditTo").value || "").trim();

  return (state.audits || []).filter((a) => {
    if (vesselId && String(a.vessel_id) !== vesselId) return false;
    if (typeId && String(a.audit_type_id) !== typeId) return false;
    if (source && String(a.audit_source) !== source) return false;

    const nilInfo = auditNilInfo(a);
    if (nilFilter === "nil" && !nilInfo.isNil) return false;
    if (nilFilter === "non_nil" && nilInfo.isNil) return false;

    const mscatInfo = auditMscatInfo(a);
    if (mscatFilter && mscatInfo.status !== mscatFilter) return false;

    if (!dateInRange(a.audit_date, from, to)) return false;
    return true;
  });
}

function filteredAuditIds() {
  return filteredAudits()
    .map((a) => String(a.id || "").trim())
    .filter(Boolean);
}

function recalcCandidateSummary() {
  const rows = filteredAudits();
  const out = {
    audits: rows.length,
    missing: 0,
    ai: 0,
    manual: 0,
    mixed: 0,
    notApplicable: 0
  };

  for (const audit of rows) {
    const s = auditMscatInfo(audit).status;
    if (s === "missing") out.missing += 1;
    else if (s === "ai") out.ai += 1;
    else if (s === "manual") out.manual += 1;
    else if (s === "mixed") out.mixed += 1;
    else out.notApplicable += 1;
  }

  return out;
}

async function recalculateFilteredAiMscat() {
  const reportIds = filteredAuditIds();
  const summary = recalcCandidateSummary();

  if (!reportIds.length) {
    alert("No audit records match the current filters.");
    return;
  }

  const dryConfirm = confirm(
    "Dry-run recalculation for current filtered audit records?\n\n" +
    `Filtered audits: ${summary.audits}\n` +
    `Missing M-SCAT audits: ${summary.missing}\n` +
    `AI populated audits: ${summary.ai}\n` +
    `Manual reviewed audits locked: ${summary.manual}\n` +
    `Mixed audits locked: ${summary.mixed}\n` +
    `NIL / Not applicable: ${summary.notApplicable}\n\n` +
    "Only Missing or AI-only observations will be considered. Manual and Mixed observations will not be changed."
  );

  if (!dryConfirm) return;

  setStatus("Running dry-run recalculation preview…");

  const commonBody = {
    scope: "selected_reports",
    report_ids: reportIds,
    skip_existing: false,
    use_learning: true,
    target_mode: "ai_unreviewed",
    max_items: 10,
    concurrency: 1
  };

  const dry = await state.supabase.functions.invoke("backfill-audit-observations-mscat-ai", {
    body: {
      ...commonBody,
      dry_run: true
    }
  });

  if (dry.error) throw dry.error;
  if (!dry.data?.ok) throw new Error(dry.data?.error || "Dry-run failed.");

  const counts = dry.data.counts || {};
  const pending = Number(counts.pending_items || 0);
  const firstBatch = Number(counts.selected_for_processing || 0);

  if (!pending) {
    setStatus("No eligible observations found for recalculation.");
    alert(
      "No eligible observations found.\n\n" +
      "Manual reviewed, Mixed, Positive and NIL observations are locked / not applicable."
    );
    return;
  }

  const applyConfirm = confirm(
    "Dry-run completed. Apply recalculation now?\n\n" +
    `Eligible observations found: ${pending}\n` +
    `Will process in repeated batches of up to: ${firstBatch || 10}\n` +
    `Manual locked skipped: ${counts.skipped_manual_locked || 0}\n` +
    `Mixed locked skipped: ${counts.skipped_mixed_locked || 0}\n\n` +
    "This will replace AI-only M-SCAT rows and fill missing M-SCAT rows using learning-assisted AI.\n" +
    "Manual reviewed and Mixed observations will not be changed.\n\n" +
    "Continue until all eligible filtered observations are processed?"
  );

  if (!applyConfirm) {
    setStatus("Recalculation cancelled after dry-run.");
    return;
  }

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalInserted = 0;
  let remaining = pending;
  let batchNo = 0;
  const maxBatches = Math.ceil(pending / 10) + 5;
  const failedSamples = [];

  while (remaining > 0 && batchNo < maxBatches) {
    batchNo += 1;

    setStatus(`Applying learning-assisted M-SCAT recalculation batch ${batchNo}…`);

    const apply = await state.supabase.functions.invoke("backfill-audit-observations-mscat-ai", {
      body: {
        ...commonBody,
        dry_run: false
      }
    });

    if (apply.error) throw apply.error;
    if (!apply.data?.ok) throw new Error(apply.data?.error || `Apply recalculation failed on batch ${batchNo}.`);

    const resultCounts = apply.data.counts || {};
    const processed = Number(resultCounts.processed_items || 0);
    const succeeded = Number(resultCounts.succeeded_items || 0);
    const failed = Number(resultCounts.failed_items || 0);
    const inserted = Number(resultCounts.inserted_rows || 0);
    const newRemaining = Number(resultCounts.remaining_pending_after_batch || 0);

    totalProcessed += processed;
    totalSucceeded += succeeded;
    totalFailed += failed;
    totalInserted += inserted;

    if (Array.isArray(apply.data.failed) && apply.data.failed.length) {
      failedSamples.push(...apply.data.failed.slice(0, 3));
    }

    if (processed < 1) {
      remaining = 0;
      break;
    }

    if (newRemaining >= remaining && failed > 0 && succeeded === 0) {
      throw new Error(
        "Recalculation stopped because a batch failed without progress. " +
        "No manual-reviewed observations were touched."
      );
    }

    remaining = newRemaining;
  }

  if (batchNo >= maxBatches && remaining > 0) {
    throw new Error(
      `Safety stop reached after ${batchNo} batches with ${remaining} observation(s) still pending.`
    );
  }

  await refreshAuditRegisterPreservingFilters();

  const failedText = failedSamples.length
    ? `\n\nSample failure:\n${String(failedSamples[0]?.error || "Unknown failure").slice(0, 400)}`
    : "";

  alert(
    "Learning-assisted M-SCAT recalculation completed.\n\n" +
    `Batches executed: ${batchNo}\n` +
    `Processed observations: ${totalProcessed}\n` +
    `Succeeded: ${totalSucceeded}\n` +
    `Failed: ${totalFailed}\n` +
    `Inserted / replaced rows: ${totalInserted}\n` +
    `Remaining pending after final batch: ${remaining}\n\n` +
    "Manual reviewed and Mixed observations were locked and not changed.\n" +
    "Filters were preserved." +
    failedText
  );
}


function renderAuditsTable() {
  const tbody = el("auditsTbody");
  const rows = filteredAudits();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="muted">No audit records found.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((a) => {
    const file = a.report_file_name || (a.report_storage_path ? a.report_storage_path.split("/").pop() : "—");
    return `
      <tr>
        <td>${esc(vesselNameById(a.vessel_id) || "—")}</td>
        <td>${esc(a.audit_date || "—")}</td>
        <td>${esc(AUDIT_SOURCE_LABELS[a.audit_source] || a.audit_source || "—")}</td>
        <td>${esc(auditTypeNameById(a.audit_type_id) || "—")}</td>
        <td>${auditObsStatusBadge(a)}</td>
        <td>${auditMscatStatusBadge(a)}</td>
        <td>${esc(currentAuditorLabel(a))}</td>
        <td>${esc(a.report_reference || "—")}</td>
        <td>${esc(file || "—")}</td>
        <td><button class="btn btn-muted btn-small openAuditBtn" data-id="${esc(a.id)}">Open</button></td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".openAuditBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;

      const url = `./audit_observations_manual_detail.html?id=${encodeURIComponent(id)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

function setActiveAuditBox() {
  const a = state.activeAudit;
  if (!a) {
    el("activeAuditBox").textContent = "No active audit loaded.";
    return;
  }

  el("activeAuditBox").innerHTML = `
    <strong>Active audit:</strong>
    ${esc(vesselNameById(a.vessel_id) || "—")} /
    ${esc(a.audit_date || "—")} /
    ${esc(AUDIT_SOURCE_LABELS[a.audit_source] || a.audit_source || "—")} /
    ${esc(auditTypeNameById(a.audit_type_id) || "—")}
    <br/>
    <strong>Report file:</strong> ${esc(a.report_file_name || a.report_storage_path || "—")}
  `;
}

function loadAuditIntoForm(a) {
  if (!a) return;

  el("vesselSelect").value = a.vessel_id || "";
  el("auditDate").value = a.audit_date || "";
  el("auditSource").value = a.audit_source || "internal_superintendent";
  el("auditTypeSelect").value = a.audit_type_id || "";
  el("auditorProfileSelect").value = a.auditor_profile_id || "";
  el("auditorInspectorSelect").value = a.auditor_inspector_id || "";
  el("contractorCompany").value = a.contractor_company || "";
  el("reportReference").value = a.report_reference || "";
  el("auditRemarks").value = a.remarks || "";
  el("fileStatus").textContent = a.report_file_name || a.report_storage_path || "No file selected.";

  state.uploadedFileMeta = {
    report_storage_path: a.report_storage_path,
    report_file_name: a.report_file_name,
    report_file_type: a.report_file_type,
  };

  updateAuditorMode();
  setActiveAuditBox();
}

function clearAuditForm() {
  state.activeAudit = null;
  state.observations = [];
  state.uploadedFileMeta = null;

  el("vesselSelect").value = state.vessels[0]?.id || "";
  el("auditDate").value = ymd(new Date());
  el("auditSource").value = "internal_superintendent";
  el("auditTypeSelect").value = state.auditTypes[0]?.id || "";
  el("auditorProfileSelect").value = "";
  el("auditorInspectorSelect").value = "";
  el("contractorCompany").value = "";
  el("reportReference").value = "";
  el("auditRemarks").value = "";
  el("reportFile").value = "";
  el("fileStatus").textContent = "No file selected.";

  updateAuditorMode();
  setActiveAuditBox();
  renderObservationsTable();
}

async function openAudit(id) {
  const audit = state.audits.find((a) => String(a.id) === String(id));
  if (!audit) return;

  state.activeAudit = audit;
  state.observations = await loadObservationsForAudit(id);
  loadAuditIntoForm(audit);
  renderObservationsTable();
  setStatus("Loaded");
}

async function uploadReportFileIfNeeded() {
  const file = el("reportFile").files && el("reportFile").files[0];

  if (!file) {
    if (state.uploadedFileMeta?.report_storage_path) return state.uploadedFileMeta;
    throw new Error("Audit report file is mandatory.");
  }

  setStatus("Uploading report…");

  const vesselName = vesselNameById(el("vesselSelect").value) || "vessel";
  const auditDate = String(el("auditDate").value || ymd(new Date()));
  const path = `audit_reports/${auditDate}_${safeName(vesselName)}/${Date.now()}_${safeName(file.name)}`;

  const { error: upErr } = await state.supabase
    .storage
    .from(AUDIT_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (upErr) throw upErr;

  const meta = {
    report_storage_path: path,
    report_file_name: file.name,
    report_file_type: file.type || null,
  };

  state.uploadedFileMeta = meta;
  el("fileStatus").textContent = file.name;

  return meta;
}

function headerPayload(fileMeta) {
  const source = String(el("auditSource").value || "").trim();

  const payload = {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    audit_date: String(el("auditDate").value || "").trim(),
    audit_source: source,
    audit_type_id: String(el("auditTypeSelect").value || "").trim(),

    auditor_profile_id: source === "external_contractor"
      ? null
      : (String(el("auditorProfileSelect").value || "").trim() || null),

    auditor_inspector_id: source === "external_contractor"
      ? (String(el("auditorInspectorSelect").value || "").trim() || null)
      : null,

    contractor_company: source === "external_contractor"
      ? (String(el("contractorCompany").value || "").trim() || null)
      : null,

    report_reference: String(el("reportReference").value || "").trim() || null,
    remarks: String(el("auditRemarks").value || "").trim() || null,

    report_storage_path: fileMeta.report_storage_path,
    report_file_name: fileMeta.report_file_name || null,
    report_file_type: fileMeta.report_file_type || null,
    report_uploaded_by: state.me?.id || null,
  };

  if (!payload.vessel_id) throw new Error("Vessel is required.");
  if (!payload.audit_date) throw new Error("Audit date is required.");
  if (!payload.audit_source) throw new Error("Audit source is required.");
  if (!payload.audit_type_id) throw new Error("Audit type is required.");
  if (!payload.report_storage_path) throw new Error("Audit report file is mandatory.");

  if (source === "external_contractor" && !payload.auditor_inspector_id) {
    throw new Error("Third-party auditor is required for external contractor audits.");
  }

  if (source !== "external_contractor" && !payload.auditor_profile_id) {
    throw new Error("Company representative / Master is required for internal audits.");
  }

  return payload;
}

async function saveAuditHeader() {
  setStatus("Saving…");

  const fileMeta = await uploadReportFileIfNeeded();
  const payload = headerPayload(fileMeta);

  let saved;

  if (state.activeAudit?.id) {
    const { data, error } = await state.supabase
      .from("audit_reports")
      .update(payload)
      .eq("id", state.activeAudit.id)
      .select("*")
      .single();

    if (error) throw error;
    saved = data;
  } else {
    const { data, error } = await state.supabase
      .from("audit_reports")
      .insert([payload])
      .select("*")
      .single();

    if (error) throw error;
    saved = data;
  }

  state.activeAudit = saved;
  state.audits = await loadAudits();
  state.auditMscatStats = await loadAuditMscatStats();

  loadAuditIntoForm(saved);
  renderAuditsTable();

  setStatus("Saved");
  alert("Audit header saved.");
}

async function downloadActiveReport() {
  const path = state.activeAudit?.report_storage_path || state.uploadedFileMeta?.report_storage_path;
  if (!path) return alert("No uploaded report found.");

  const { data, error } = await state.supabase
    .storage
    .from(AUDIT_BUCKET)
    .createSignedUrl(path, 60);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No signed URL returned.");

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function deleteCurrentAudit() {
  if (!state.activeAudit?.id) return alert("No active audit loaded.");

  const ok = confirm("Delete this audit and all its observations?");
  if (!ok) return;

  setStatus("Deleting…");

  const { error } = await state.supabase
    .from("audit_reports")
    .delete()
    .eq("id", state.activeAudit.id);

  if (error) throw error;

  state.audits = await loadAudits();
  state.auditMscatStats = await loadAuditMscatStats();
  clearAuditForm();
  renderAuditsTable();

  setStatus("Deleted");
}

function clearObservationForm() {
  el("obsQuestionNo").value = "";
  el("obsType").value = "negative";
  el("obsDesignation").value = "";
  el("obsSoc").value = "";
  el("obsNoc").value = "";
  el("obsText").value = "";
  el("obsRemarks").value = "";
  el("obsSortIndex").value = String(state.observations.length || 0);
}

function observationPayload() {
  if (!state.activeAudit?.id) throw new Error("Save/load an audit header first.");

  const qno = canonicalQno(el("obsQuestionNo").value);

  return {
    report_id: state.activeAudit.id,
    question_no: qno || null,
    question_base: qno || null,
    obs_type: String(el("obsType").value || "").trim(),
    designation: String(el("obsDesignation").value || "").trim() || null,
    soc: String(el("obsSoc").value || "").trim() || null,
    noc: String(el("obsNoc").value || "").trim() || null,
    observation_text: String(el("obsText").value || "").trim() || null,
    remarks: String(el("obsRemarks").value || "").trim() || null,
    pgno_selected: [],
    sort_index: Number(el("obsSortIndex").value || state.observations.length || 0),
  };
}

async function saveObservation() {
  setStatus("Saving observation…");

  const payload = observationPayload();

  if (!payload.obs_type) throw new Error("Observation type is required.");

  const { error } = await state.supabase
    .from("audit_observation_items")
    .insert([payload]);

  if (error) throw error;

  state.observations = await loadObservationsForAudit(state.activeAudit.id);
  clearObservationForm();
  renderObservationsTable();

  setStatus("Saved");
}

async function deleteObservation(id) {
  if (!id) return;

  const ok = confirm("Delete this observation?");
  if (!ok) return;

  const { error } = await state.supabase
    .from("audit_observation_items")
    .delete()
    .eq("id", id);

  if (error) throw error;

  state.observations = await loadObservationsForAudit(state.activeAudit.id);
  renderObservationsTable();
}

function renderCounters() {
  const rows = state.observations || [];

  el("cntTotal").textContent = String(rows.length);
  el("cntNegative").textContent = String(rows.filter((r) => r.obs_type === "negative").length);
  el("cntLargely").textContent = String(rows.filter((r) => r.obs_type === "largely").length);
  el("cntPositive").textContent = String(rows.filter((r) => r.obs_type === "positive").length);
}

function renderObservationsTable() {
  const tbody = el("observationsTbody");
  const rows = state.observations || [];

  renderCounters();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">No observations entered for this audit.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => {
    const observationText = String(r.observation_text || "").trim();
    const importRemarks = String(r.remarks || "").trim();
    const mainText = observationText || importRemarks || "—";
    const metaHtml = observationText && importRemarks
      ? `<div class="obsImportMeta">${esc(importRemarks)}</div>`
      : "";

    return `
      <tr>
        <td class="mono">${esc(r.question_no || "—")}</td>
        <td>${obsTypeBadge(r.obs_type)}</td>
        <td>${esc(r.designation || "—")}</td>
        <td>${esc(r.soc || "—")}</td>
        <td>${esc(r.noc || "—")}</td>
        <td class="remarksCell">
          <div class="obsTextMain">${esc(mainText)}</div>
          ${metaHtml}
        </td>
        <td><button class="btn btn-danger btn-small deleteObsBtn" data-id="${esc(r.id)}">Delete</button></td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".deleteObsBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await deleteObservation(btn.getAttribute("data-id"));
      } catch (e) {
        console.error(e);
        alert("Delete observation failed: " + (e?.message || String(e)));
        setStatus("Error");
      }
    });
  });
}


function manualCellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return ymd(value);
  return String(value).trim();
}

function manualHeaderKey(value) {
  return manualCellText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findManualHeader(rows) {
  const max = Math.min(rows.length, 80);

  for (let r = 0; r < max; r += 1) {
    const row = rows[r] || [];
    const keys = row.map(manualHeaderKey);

    const vessel = keys.findIndex((k) => k === "vessel" || k.includes("vessel"));
    const auditDate = keys.findIndex((k) => k === "auditdate" || k.includes("auditdate"));
    const auditCode = keys.findIndex((k) => k === "auditcode" || k.includes("auditcode"));
    const checklist = keys.findIndex((k) =>
      k.includes("checklist") ||
      k.includes("viq") ||
      k.includes("sire20") ||
      k.includes("sire2")
    );
    const ncr = keys.findIndex((k) => k === "ncrdetails" || k.includes("ncrdetails") || k.includes("ncr"));

    if (vessel >= 0 && auditDate >= 0 && auditCode >= 0 && checklist >= 0 && ncr >= 0) {
      return {
        rowIndex: r,
        rowNumber: r + 1,
        columns: { vessel, auditDate, auditCode, checklist, ncr }
      };
    }
  }

  return null;
}

function parseManualDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return ymd(value);

  if (typeof value === "number" && Number.isFinite(value)) {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + Math.floor(value));
    return base.toISOString().slice(0, 10);
  }

  const raw = manualCellText(value);
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) {
    const yyyy = iso[1];
    const mm = String(Number(iso[2])).padStart(2, "0");
    const dd = String(Number(iso[3])).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const dmy = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const dd = String(Number(dmy[1])).padStart(2, "0");
    const mm = String(Number(dmy[2])).padStart(2, "0");
    let yyyy = String(Number(dmy[3]));
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function normalizeManualVessel(raw) {
  const base = manualCellText(raw).replace(/\s+/g, " ").trim();
  if (!base) return "";

  const withPrefix = /^olympic\b/i.test(base) ? base : `OLYMPIC ${base}`;
  return withPrefix.replace(/\s+/g, " ").trim().toUpperCase();
}

function findManualVesselId(normalizedName) {
  if (!normalizedName) return null;

  const wanted = normalizedName.replace(/\s+/g, " ").trim().toUpperCase();

  const direct = state.vessels.find((v) =>
    String(v.name || "").replace(/\s+/g, " ").trim().toUpperCase() === wanted
  );

  if (direct?.id) return direct.id;

  const withoutOlympic = wanted.replace(/^OLYMPIC\s+/i, "");
  const suffixMatch = state.vessels.find((v) => {
    const name = String(v.name || "").replace(/\s+/g, " ").trim().toUpperCase();
    return name.replace(/^OLYMPIC\s+/i, "") === withoutOlympic;
  });

  return suffixMatch?.id || null;
}

function parseManualAuditCode(raw) {
  const text = manualCellText(raw).replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      ok: false,
      audit_code_raw: "",
      audit_year: null,
      audit_domain: "unknown",
      audit_source_normalized: null,
      audit_source_detail: "unknown",
      label: "",
      message: "Audit code missing."
    };
  }

  const domainMap = {
    car: "cargo",
    cargo: "cargo",
    moo: "mooring",
    mooring: "mooring",
    nav: "navigation",
    navigation: "navigation"
  };

  const standard = text.match(/^(Ext|Mrn|Mstr)\.?\s*(Car|Cargo|Moo|Mooring|Nav|Navigation)\.?\s*(\d{4})$/i);
  if (standard) {
    const prefix = standard[1].toLowerCase();
    const domain = domainMap[standard[2].toLowerCase()] || "unknown";
    const year = Number(standard[3]);

    const sourceMap = {
      ext: ["external_contractor", "external_contractor", "External auditor"],
      mrn: ["internal_superintendent", "marine_superintendent", "Marine Superintendent"],
      mstr: ["internal_master", "master", "Master"]
    };

    const source = sourceMap[prefix] || [null, "unknown", "Unknown"];

    return {
      ok: domain !== "unknown",
      audit_code_raw: text,
      audit_year: year,
      audit_domain: domain,
      audit_source_normalized: source[0],
      audit_source_detail: source[1],
      label: `${source[2]} / ${domain}`,
      message: ""
    };
  }

  const vdr = text.match(/^VDR\s+Nav\.?\s*(\d{4})$/i);
  if (vdr) {
    return {
      ok: true,
      audit_code_raw: text,
      audit_year: Number(vdr[1]),
      audit_domain: "navigation",
      audit_source_normalized: "external_contractor",
      audit_source_detail: "remote_vdr",
      label: "Remote VDR auditor / navigation",
      message: ""
    };
  }

  return {
    ok: false,
    audit_code_raw: text,
    audit_year: null,
    audit_domain: "unknown",
    audit_source_normalized: null,
    audit_source_detail: "unknown",
    label: "Unknown",
    message: `Audit code not recognized: ${text}`
  };
}

function findManualAuditTypeId(domain) {
  if (!domain || domain === "unknown") return null;

  const terms = {
    cargo: ["cargo"],
    mooring: ["mooring", "moor"],
    navigation: ["navigation", "navigational", "nav"]
  }[domain] || [];

  const found = state.auditTypes.find((t) => {
    const name = String(t.audit_type_name || "").toLowerCase();
    return terms.some((term) => name.includes(term));
  });

  return found?.id || null;
}

function normalizeManualQuestionNo(raw) {
  const text = manualCellText(raw);
  if (!text) return "";

  const match = text.match(/\d+(?:\.\d+)+/);
  if (!match) return text.trim();

  return match[0]
    .split(".")
    .filter(Boolean)
    .map((part) => String(Number(part)).padStart(2, "0"))
    .join(".");
}

function isManualNilAudit(ncrText) {
  const text = manualCellText(ncrText).replace(/\s+/g, " ").trim().toUpperCase();
  return text === "NIL";
}

function manualValidationPill(status) {
  const s = String(status || "warning");
  const labels = {
    valid: "Valid",
    warning: "Warning",
    error: "Error",
    skipped: "Skipped"
  };
  const label = labels[s] || s;
  return `<span class="validationPill validation-${esc(s)}">${esc(label)}</span>`;
}

function validateManualImportRow(row) {
  const messages = [];

  if (row.is_excluded_vessel) {
    return {
      status: "skipped",
      messages: [{
        level: "skipped",
        message: "Vessel excluded from import because it is no longer in the fleet."
      }]
    };
  }

  if (!row.vessel_raw) messages.push({ level: "error", message: "Vessel missing." });
  if (row.vessel_normalized && !row.vessel_id) messages.push({ level: "error", message: "Vessel not matched to vessel list." });

  if (!row.audit_date_raw) messages.push({ level: "error", message: "Audit date missing." });
  if (row.audit_date_raw && !row.audit_date) messages.push({ level: "error", message: "Audit date could not be parsed." });

  if (!row.audit_code_raw) messages.push({ level: "error", message: "Audit code missing." });
  if (row.audit_code_raw && !row.audit_code_ok) messages.push({ level: "error", message: row.audit_code_message || "Audit code not recognized." });

  if (!row.audit_type_id && row.audit_domain !== "unknown") {
    messages.push({ level: "warning", message: "Audit type was parsed but not matched to an application audit type." });
  }

  if (!row.ncr_details) {
    messages.push({ level: "error", message: "ncr_details missing. Blank is not treated as NIL." });
  }

  if (!row.is_nil_audit && row.ncr_details && !row.checklist_no_raw) {
    messages.push({ level: "warning", message: "SIRE / checklist reference missing. Mapping will be required." });
  }

  const hasError = messages.some((m) => m.level === "error");
  const hasWarning = messages.some((m) => m.level === "warning");

  return {
    status: hasError ? "error" : (hasWarning ? "warning" : "valid"),
    messages
  };
}

function buildManualImportRow(rawRow, excelRowNo, cols) {
  const vesselRaw = manualCellText(rawRow[cols.vessel]);
  const auditDateRaw = manualCellText(rawRow[cols.auditDate]);
  const auditCodeRaw = manualCellText(rawRow[cols.auditCode]);
  const checklistRaw = manualCellText(rawRow[cols.checklist]);
  const ncrDetails = manualCellText(rawRow[cols.ncr]);

  const vesselNormalized = normalizeManualVessel(vesselRaw);
  const isExcludedVessel = isExcludedManualImportVessel(vesselNormalized);
  const auditCode = parseManualAuditCode(auditCodeRaw);
  const isNil = isManualNilAudit(ncrDetails);
  const questionNo = normalizeManualQuestionNo(checklistRaw);
  const auditTypeId = findManualAuditTypeId(auditCode.audit_domain);

  const row = {
    excel_row_no: excelRowNo,
    vessel_raw: vesselRaw,
    vessel_normalized: vesselNormalized,
    vessel_id: findManualVesselId(vesselNormalized),
    is_excluded_vessel: isExcludedVessel,
    audit_date_raw: auditDateRaw,
    audit_date: parseManualDate(rawRow[cols.auditDate]),
    audit_code_raw: auditCodeRaw,
    audit_code_ok: auditCode.ok,
    audit_code_message: auditCode.message,
    audit_year: auditCode.audit_year,
    audit_domain: auditCode.audit_domain,
    audit_source_normalized: auditCode.audit_source_normalized,
    audit_source_detail: auditCode.audit_source_detail,
    audit_source_label: auditCode.label,
    audit_type_id: auditTypeId,
    checklist_no_raw: checklistRaw,
    sire_question_no_normalized: questionNo,
    sire_mapping_status: isNil && !checklistRaw
      ? "blank_nil_audit"
      : (checklistRaw ? "provided" : "missing_needs_mapping"),
    ncr_details: ncrDetails,
    is_nil_audit: isNil,
    import_action: isExcludedVessel ? "no_action" : (isNil ? "create_audit_header_only" : "create_observation"),
    raw_payload: {
      Vessel: vesselRaw,
      Audit_date: auditDateRaw,
      Audit_code: auditCodeRaw,
      "Checklist_no(VIQ/SIRE2.0)": checklistRaw,
      ncr_details: ncrDetails,
      __csvb_excluded_vessel: isExcludedVessel
    }
  };

  const validation = validateManualImportRow(row);
  row.validation_status = validation.status;
  row.validation_messages = validation.messages;

  if (validation.status === "skipped") {
    row.import_action = "no_action";
  } else if (validation.status === "error") {
    row.import_action = "skip_needs_review";
  }

  return row;
}

function manualImportSummaryCounts(rows) {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.validation_status === "valid").length,
    warning: rows.filter((r) => r.validation_status === "warning").length,
    error: rows.filter((r) => r.validation_status === "error").length,
    skipped: rows.filter((r) => r.validation_status === "skipped").length,
    nil: rows.filter((r) => r.is_nil_audit).length
  };
}

function renderManualImportPreview() {
  const rows = manualImportState.rows || [];
  const shown = rows.slice(0, 200);
  const counts = manualImportSummaryCounts(rows);

  el("manualImportTotal").textContent = String(counts.total);
  el("manualImportValid").textContent = String(counts.valid);
  el("manualImportWarning").textContent = String(counts.warning);
  el("manualImportError").textContent = String(counts.error);
  el("manualImportNil").textContent = String(counts.nil);
  el("manualImportSkipped").textContent = String(counts.skipped);

  const saveBtn = el("saveManualImportStagingBtn");
  if (saveBtn) {
    saveBtn.disabled = !rows.length || manualImportState.saving;
    saveBtn.textContent = manualImportState.saving ? "Saving…" : "Save preview to staging";
  }

  const header = manualImportState.headerRowNumber
    ? `Header detected at Excel row ${manualImportState.headerRowNumber}.`
    : "Header not detected.";

  el("manualImportSummary").innerHTML = `
    <strong>Preview only — no database changes.</strong><br/>
    Source file: ${esc(manualImportState.fileName || "—")}<br/>
    Sheet: ${esc(manualImportState.sheetName || "—")}<br/>
    ${esc(header)}<br/>
    Parsed rows: ${counts.total}. Valid: ${counts.valid}. Warnings: ${counts.warning}. Errors: ${counts.error}. NIL audits: ${counts.nil}. Excluded/skipped: ${counts.skipped}.<br/>
    Rows shown in preview: ${shown.length}.<br/>
    Staging batch: ${manualImportState.batchId ? esc(manualImportState.batchId) : "not saved yet"}.
  `;

  const tbody = el("manualImportPreviewTbody");

  if (!shown.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="muted">No preview rows generated.</td></tr>`;
    return;
  }

  tbody.innerHTML = shown.map((r) => {
    const messages = (r.validation_messages || []).map((m) => m.message).join(" | ");
    const ncr = r.ncr_details || "—";

    return `
      <tr title="${esc(messages)}">
        <td class="mono">${esc(r.excel_row_no)}</td>
        <td>${esc(r.vessel_raw || "—")}</td>
        <td>${esc(r.vessel_normalized || "—")}</td>
        <td>${esc(r.audit_date || r.audit_date_raw || "—")}</td>
        <td class="mono">${esc(r.audit_code_raw || "—")}</td>
        <td>${esc(r.audit_domain || "—")}</td>
        <td>${esc(r.audit_source_detail || "—")}</td>
        <td class="mono">${esc(r.sire_question_no_normalized || r.checklist_no_raw || "—")}</td>
        <td>${r.is_nil_audit ? "YES" : "NO"}</td>
        <td>${manualValidationPill(r.validation_status)}</td>
        <td class="mono">${esc(r.import_action || "—")}</td>
        <td class="remarksCell">${esc(ncr.length > 360 ? `${ncr.slice(0, 360)}…` : ncr)}</td>
      </tr>
    `;
  }).join("");

  if (rows.length > shown.length) {
    tbody.insertAdjacentHTML(
      "beforeend",
      `<tr><td colspan="12" class="muted">Showing first ${shown.length} rows only. Total parsed rows: ${rows.length}.</td></tr>`
    );
  }
}

function clearManualImportPreview() {
  manualImportState.workbook = null;
  manualImportState.fileName = "";
  manualImportState.fileType = "";
  manualImportState.sheetName = "";
  manualImportState.rows = [];
  manualImportState.headerRowNumber = null;
  manualImportState.batchId = null;
  manualImportState.saving = false;

  el("manualExcelFile").value = "";
  el("manualExcelSheetSelect").innerHTML = `<option value="">No workbook loaded</option>`;
  el("manualExcelSheetSelect").disabled = true;

  renderManualImportPreview();
  el("manualImportSummary").textContent = "No Excel file parsed.";
  setStatus("Ready");
}

async function handleManualExcelFileChange() {
  const input = el("manualExcelFile");
  const file = input.files && input.files[0];

  manualImportState.workbook = null;
  manualImportState.rows = [];
  manualImportState.headerRowNumber = null;
  manualImportState.batchId = null;

  if (!file) {
    clearManualImportPreview();
    return;
  }

  if (!window.XLSX) {
    throw new Error("Excel parser library did not load. Check internet/CDN availability.");
  }

  setStatus("Reading Excel…");

  const buf = await file.arrayBuffer();
  const workbook = window.XLSX.read(buf, {
    type: "array",
    cellDates: true,
    raw: true
  });

  manualImportState.workbook = workbook;
  manualImportState.fileName = file.name;
  manualImportState.fileType = file.type || (file.name.toLowerCase().endsWith(".xls") ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const sheetNames = workbook.SheetNames || [];
  const sel = el("manualExcelSheetSelect");
  sel.innerHTML = "";

  for (const name of sheetNames) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = name;
    sel.appendChild(o);
  }

  const preferred = sheetNames.find((name) => /stats/i.test(name)) || sheetNames[0] || "";
  sel.value = preferred;
  sel.disabled = !sheetNames.length;
  manualImportState.sheetName = preferred;

  el("manualImportSummary").innerHTML = `
    Workbook loaded: <strong>${esc(file.name)}</strong><br/>
    Select the required sheet and press <strong>Preview Excel</strong>.
  `;

  renderManualImportPreview();
  setStatus("Excel loaded");
}


function manualImportRowDbPayload(row, batchId) {
  return {
    batch_id: batchId,
    excel_row_no: row.excel_row_no,
    raw_payload: row.raw_payload || {},

    vessel_raw: row.vessel_raw || null,
    vessel_normalized: row.vessel_normalized || null,
    vessel_id: row.vessel_id || null,

    audit_date_raw: row.audit_date_raw || null,
    audit_date: row.audit_date || null,

    audit_code_raw: row.audit_code_raw || null,
    audit_year: row.audit_year || null,
    audit_domain: row.audit_domain || "unknown",
    audit_source_normalized: row.audit_source_normalized || null,
    audit_source_detail: row.audit_source_detail || "unknown",
    audit_type_id: row.audit_type_id || null,

    checklist_no_raw: row.checklist_no_raw || null,
    sire_question_no_normalized: row.sire_question_no_normalized || null,
    sire_mapping_status: row.sire_mapping_status || "missing_needs_mapping",

    ai_suggested_question_no: null,
    ai_question_confidence: null,
    ai_question_reason: null,

    ncr_details: row.ncr_details || null,
    is_nil_audit: !!row.is_nil_audit,

    validation_status: row.validation_status || "warning",
    validation_messages: row.validation_messages || [],

    import_action: row.import_action || "no_action",

    created_report_id: null,
    created_observation_item_id: null
  };
}

async function saveManualImportToStaging() {
  const rows = manualImportState.rows || [];

  if (!rows.length) {
    alert("Preview the Excel file first. No rows are available for staging.");
    return;
  }

  if (manualImportState.batchId) {
    const again = confirm("This preview has already been saved to staging. Save it again as a new batch?");
    if (!again) return;
  }

  const counts = manualImportSummaryCounts(rows);

  const ok = confirm(
    `Save this preview to staging only?\\n\\n` +
    `Parsed rows: ${counts.total}\\n` +
    `Valid: ${counts.valid}\\n` +
    `Warnings: ${counts.warning}\\n` +
    `Errors: ${counts.error}\\n` +
    `NIL audits: ${counts.nil}\\n` +
    `Excluded/skipped: ${counts.skipped}\\n\\n` +
    `No audit records or observation records will be created yet.`
  );

  if (!ok) return;

  manualImportState.saving = true;
  renderManualImportPreview();
  setStatus("Saving staging batch…");

  try {
    const batchPayload = {
      source_file_name: manualImportState.fileName || "manual_audit_observations.xlsx",
      source_file_type: manualImportState.fileType || null,
      source_storage_path: null,
      sheet_name: manualImportState.sheetName || null,
      import_status: "validated",

      total_rows: rows.length,
      parsed_rows: rows.length,
      valid_rows: counts.valid,
      warning_rows: counts.warning,
      error_rows: counts.error,
      nil_audit_rows: counts.nil,

      notes: "Created from Audit Observations Manual Excel preview. No final audit import performed.",
      import_summary: {
        build: AUDIT_OBSERVATIONS_MANUAL_BUILD,
        source_file_name: manualImportState.fileName || null,
        sheet_name: manualImportState.sheetName || null,
        header_row_number: manualImportState.headerRowNumber,
        counts
      },
      imported_at: null
    };

    const { data: batch, error: batchErr } = await state.supabase
      .from("audit_manual_import_batches")
      .insert([batchPayload])
      .select("*")
      .single();

    if (batchErr) throw batchErr;
    if (!batch?.id) throw new Error("No staging batch ID returned.");

    const dbRows = rows.map((r) => manualImportRowDbPayload(r, batch.id));
    const chunkSize = 200;

    for (let i = 0; i < dbRows.length; i += chunkSize) {
      const chunk = dbRows.slice(i, i + chunkSize);
      const { error: rowErr } = await state.supabase
        .from("audit_manual_import_rows")
        .insert(chunk);

      if (rowErr) throw rowErr;

      setStatus(`Saving staging rows ${Math.min(i + chunk.length, dbRows.length)} / ${dbRows.length}…`);
    }

    manualImportState.batchId = batch.id;

    renderManualImportPreview();
    setStatus("Staged");

    alert(
      `Preview saved to staging.\\n\\n` +
      `Batch ID: ${batch.id}\\n` +
      `Rows saved: ${dbRows.length}\\n\\n` +
      `No final audit records were created.`
    );
  } finally {
    manualImportState.saving = false;
    renderManualImportPreview();
  }
}

function parseManualExcelPreview() {
  if (!manualImportState.workbook) {
    alert("Select an Excel file first.");
    return;
  }

  const sheetName = String(el("manualExcelSheetSelect").value || "").trim();
  if (!sheetName) {
    alert("Select a sheet first.");
    return;
  }

  const ws = manualImportState.workbook.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet not found: ${sheetName}`);

  setStatus("Parsing Excel…");

  const rows = window.XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false
  });

  const header = findManualHeader(rows);
  if (!header) {
    throw new Error("Could not detect expected headers: Vessel, Audit_date, Audit_code, Checklist_no(VIQ/SIRE2.0), ncr_details.");
  }

  const parsed = [];

  for (let r = header.rowIndex + 1; r < rows.length; r += 1) {
    const rawRow = rows[r] || [];
    const selectedCells = [
      rawRow[header.columns.vessel],
      rawRow[header.columns.auditDate],
      rawRow[header.columns.auditCode],
      rawRow[header.columns.checklist],
      rawRow[header.columns.ncr],
    ].map(manualCellText);

    const hasAnyExpectedCell = selectedCells.some((v) => v !== "");
    if (!hasAnyExpectedCell) continue;

    parsed.push(buildManualImportRow(rawRow, r + 1, header.columns));
  }

  manualImportState.sheetName = sheetName;
  manualImportState.rows = parsed;
  manualImportState.headerRowNumber = header.rowNumber;
  manualImportState.batchId = null;

  renderManualImportPreview();
  setStatus("Preview ready");
}


async function reloadAll(options = {}) {
  const preserveFilters = options.preserveFilters !== false;
  const filters = preserveFilters ? captureAuditFilters() : {};

  state.vessels = await loadVessels();
  state.auditTypes = await loadAuditTypes();
  state.profiles = await loadProfiles();
  state.inspectors = await loadInspectors();
  state.audits = await loadAudits();
  state.auditMscatStats = await loadAuditMscatStats();

  renderSelects();

  if (preserveFilters) {
    restoreAuditFilters(filters);
  }

  renderAuditsTable();
  updateAuditorMode();

  if (!state.activeAudit) clearAuditForm();
}

async function refreshAuditRegisterPreservingFilters() {
  setStatus("Refreshing register…");

  await reloadAll({ preserveFilters: true });

  setStatus("Register refreshed; filters preserved.");
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

  el("auditFrom").value = ymd(from);
  el("auditTo").value = ymd(to);
  el("auditDate").value = ymd(new Date());

  await reloadAll({ preserveFilters: true });

  el("newAuditBtn").addEventListener("click", clearAuditForm);

  el("reloadAuditsBtn").addEventListener("click", async () => {
    try {
      await refreshAuditRegisterPreservingFilters();
    } catch (e) {
      console.error(e);
      alert("Refresh failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("recalcFilteredMscatBtn").addEventListener("click", async () => {
    try {
      await recalculateFilteredAiMscat();
    } catch (e) {
      console.error(e);
      alert("Recalculate AI M-SCAT failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  ["auditVesselFilter", "auditTypeFilter", "auditSourceFilter", "auditNilFilter", "auditMscatFilter", "auditFrom", "auditTo"].forEach((id) => {
    el(id).addEventListener("change", renderAuditsTable);
  });

  el("auditSource").addEventListener("change", updateAuditorMode);

  el("reportFile").addEventListener("change", () => {
    const file = el("reportFile").files && el("reportFile").files[0];
    el("fileStatus").textContent = file ? file.name : (state.uploadedFileMeta?.report_file_name || "No file selected.");
  });

  el("saveAuditBtn").addEventListener("click", async () => {
    try {
      await saveAuditHeader();
    } catch (e) {
      console.error(e);
      alert("Save audit failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("downloadReportBtn").addEventListener("click", async () => {
    try {
      await downloadActiveReport();
    } catch (e) {
      console.error(e);
      alert("Open uploaded report failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("deleteAuditBtn").addEventListener("click", async () => {
    try {
      await deleteCurrentAudit();
    } catch (e) {
      console.error(e);
      alert("Delete audit failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("saveObsBtn").addEventListener("click", async () => {
    try {
      await saveObservation();
    } catch (e) {
      console.error(e);
      alert("Save observation failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("clearObsBtn").addEventListener("click", clearObservationForm);

  el("manualExcelFile").addEventListener("change", async () => {
    try {
      await handleManualExcelFileChange();
    } catch (e) {
      console.error(e);
      alert("Excel load failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("manualExcelSheetSelect").addEventListener("change", () => {
    manualImportState.sheetName = String(el("manualExcelSheetSelect").value || "").trim();
    manualImportState.rows = [];
    manualImportState.headerRowNumber = null;
    renderManualImportPreview();
  });

  el("parseManualExcelBtn").addEventListener("click", () => {
    try {
      parseManualExcelPreview();
    } catch (e) {
      console.error(e);
      alert("Excel preview failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("clearManualExcelPreviewBtn").addEventListener("click", clearManualImportPreview);

  el("saveManualImportStagingBtn").addEventListener("click", async () => {
    try {
      await saveManualImportToStaging();
    } catch (e) {
      console.error(e);
      alert("Save preview to staging failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  renderManualImportPreview();

  setStatus("Ready");
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Audit Observations page failed to load: " + (e?.message || String(e)));
    setStatus("Error");
  }
})();