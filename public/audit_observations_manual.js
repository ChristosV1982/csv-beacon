// public/audit_observations_manual.js
// Audit Observations Manual module.
// Manual Excel-based audit observation staging module. Future steps will add Excel import and M-SCAT RCA.
// Observations use SIRE-style fields: question_no, obs_type, designation, SOC, NOC.

const AUDIT_OBSERVATIONS_MANUAL_BUILD = "AUDIT_OBSERVATIONS_MANUAL_20260626_STEP3A_EXCEL_PREVIEW";
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

const state = {
  me: null,
  supabase: null,
  vessels: [],
  auditTypes: [],
  profiles: [],
  inspectors: [],
  audits: [],
  observations: [],
  activeAudit: null,
  uploadedFileMeta: null,
};

const manualImportState = {
  workbook: null,
  fileName: "",
  sheetName: "",
  rows: [],
  headerRowNumber: null,
};

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
  const from = String(el("auditFrom").value || "").trim();
  const to = String(el("auditTo").value || "").trim();

  return (state.audits || []).filter((a) => {
    if (vesselId && String(a.vessel_id) !== vesselId) return false;
    if (typeId && String(a.audit_type_id) !== typeId) return false;
    if (source && String(a.audit_source) !== source) return false;
    if (!dateInRange(a.audit_date, from, to)) return false;
    return true;
  });
}

function renderAuditsTable() {
  const tbody = el("auditsTbody");
  const rows = filteredAudits();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No audit records found.</td></tr>`;
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
        <td>${esc(currentAuditorLabel(a))}</td>
        <td>${esc(a.report_reference || "—")}</td>
        <td>${esc(file || "—")}</td>
        <td><button class="btn btn-muted btn-small openAuditBtn" data-id="${esc(a.id)}">Open</button></td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".openAuditBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await openAudit(id);
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
    const remarks = String(r.remarks || r.observation_text || "").trim();
    return `
      <tr>
        <td class="mono">${esc(r.question_no || "—")}</td>
        <td>${obsTypeBadge(r.obs_type)}</td>
        <td>${esc(r.designation || "—")}</td>
        <td>${esc(r.soc || "—")}</td>
        <td>${esc(r.noc || "—")}</td>
        <td class="remarksCell">${esc(remarks || "—")}</td>
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
  const label = s === "valid" ? "Valid" : (s === "error" ? "Error" : "Warning");
  return `<span class="validationPill validation-${esc(s)}">${esc(label)}</span>`;
}

function validateManualImportRow(row) {
  const messages = [];

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
  const auditCode = parseManualAuditCode(auditCodeRaw);
  const isNil = isManualNilAudit(ncrDetails);
  const questionNo = normalizeManualQuestionNo(checklistRaw);
  const auditTypeId = findManualAuditTypeId(auditCode.audit_domain);

  const row = {
    excel_row_no: excelRowNo,
    vessel_raw: vesselRaw,
    vessel_normalized: vesselNormalized,
    vessel_id: findManualVesselId(vesselNormalized),
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
    import_action: isNil ? "create_audit_header_only" : "create_observation",
    raw_payload: {
      Vessel: vesselRaw,
      Audit_date: auditDateRaw,
      Audit_code: auditCodeRaw,
      "Checklist_no(VIQ/SIRE2.0)": checklistRaw,
      ncr_details: ncrDetails
    }
  };

  const validation = validateManualImportRow(row);
  row.validation_status = validation.status;
  row.validation_messages = validation.messages;

  if (validation.status === "error") {
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
  el("manualImportShown").textContent = String(shown.length);

  const header = manualImportState.headerRowNumber
    ? `Header detected at Excel row ${manualImportState.headerRowNumber}.`
    : "Header not detected.";

  el("manualImportSummary").innerHTML = `
    <strong>Preview only — no database changes.</strong><br/>
    Source file: ${esc(manualImportState.fileName || "—")}<br/>
    Sheet: ${esc(manualImportState.sheetName || "—")}<br/>
    ${esc(header)}<br/>
    Parsed rows: ${counts.total}. Valid: ${counts.valid}. Warnings: ${counts.warning}. Errors: ${counts.error}. NIL audits: ${counts.nil}.
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
  manualImportState.sheetName = "";
  manualImportState.rows = [];
  manualImportState.headerRowNumber = null;

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

  renderManualImportPreview();
  setStatus("Preview ready");
}


async function reloadAll() {
  state.vessels = await loadVessels();
  state.auditTypes = await loadAuditTypes();
  state.profiles = await loadProfiles();
  state.inspectors = await loadInspectors();
  state.audits = await loadAudits();

  renderSelects();
  renderAuditsTable();
  updateAuditorMode();

  if (!state.activeAudit) clearAuditForm();
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

  await reloadAll();

  el("newAuditBtn").addEventListener("click", clearAuditForm);

  el("reloadAuditsBtn").addEventListener("click", async () => {
    try {
      state.audits = await loadAudits();
      renderAuditsTable();
    } catch (e) {
      console.error(e);
      alert("Reload failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  ["auditVesselFilter", "auditTypeFilter", "auditSourceFilter", "auditFrom", "auditTo"].forEach((id) => {
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