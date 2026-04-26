// public/audit_observations.js
// Audit Observations module.
// Manual audit entry with mandatory uploaded report file.
// Observations use SIRE-style fields: question_no, obs_type, designation, SOC, NOC.

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
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadAuditTypes() {
  const { data, error } = await state.supabase
    .from("audit_types")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("audit_type_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadProfiles() {
  const { data, error } = await state.supabase
    .from("profiles")
    .select("id, username, role, position, is_active")
    .in("role", ["super_admin", "company_admin", "company_superintendent", "vessel"])
    .order("username", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadInspectors() {
  const { data, error } = await state.supabase
    .from("inspectors")
    .select("*")
    .eq("is_active", true)
    .order("inspector_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadAudits() {
  const { data, error } = await state.supabase
    .from("audit_reports")
    .select("*")
    .order("audit_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadObservationsForAudit(auditId) {
  if (!auditId) return [];

  const { data, error } = await state.supabase
    .from("audit_observation_items")
    .select("*")
    .eq("report_id", auditId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

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