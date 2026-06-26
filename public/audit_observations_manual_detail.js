// public/audit_observations_manual_detail.js
// Audit Observations Manual — separate audit detail window.

const BUILD = "AUDIT_OBSERVATIONS_MANUAL_DETAIL_20260626_STEP5A";
window.CSVB_AUDIT_OBSERVATIONS_MANUAL_DETAIL_BUILD = BUILD;

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

function getAuditId() {
  return new URLSearchParams(window.location.search).get("id");
}

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => String(Number((p.replace(/^0+/, "") || "0"))).padStart(2, "0")).join(".");
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
  reportId: null,
  audit: null,
  vessels: [],
  auditTypes: [],
  observations: [],
};

function vesselNameById(id) {
  const v = state.vessels.find((x) => String(x.id) === String(id));
  return v?.name || "";
}

function auditTypeNameById(id) {
  const t = state.auditTypes.find((x) => String(x.id) === String(id));
  return t?.audit_type_name || "";
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

async function loadAudit() {
  const { data, error } = await state.supabase.rpc("csvb_audit_reports_for_me");
  if (error) throw error;

  const found = (data || []).find((a) => String(a.id) === String(state.reportId));
  if (!found) throw new Error("Audit record not found or not accessible.");

  return found;
}

async function loadObservationsForAudit() {
  const { data, error } = await state.supabase.rpc("csvb_audit_observation_items_for_me", {
    p_report_id: state.reportId
  });

  if (error) throw error;

  return (data || []).slice().sort((a, b) => {
    const ai = Number(a.sort_index || 0);
    const bi = Number(b.sort_index || 0);
    if (ai !== bi) return ai - bi;
    return String(a.id).localeCompare(String(b.id));
  });
}

function summaryCard(label, value) {
  return `
    <div class="summaryCard">
      <div class="summaryLabel">${esc(label)}</div>
      <div class="summaryValue">${esc(value || "—")}</div>
    </div>
  `;
}

function renderAuditHeader() {
  const a = state.audit;
  if (!a) return;

  const vesselName = vesselNameById(a.vessel_id) || "—";
  const auditTypeName = auditTypeNameById(a.audit_type_id) || "—";
  const source = AUDIT_SOURCE_LABELS[a.audit_source] || a.audit_source || "—";
  const file = a.report_file_name || (a.report_storage_path ? a.report_storage_path.split("/").pop() : "—");

  el("pageTitle").textContent = `Audit Detail — ${vesselName}`;
  el("pageSub").textContent = `${a.audit_date || "—"} / ${source} / ${auditTypeName}`;

  el("auditSummaryGrid").innerHTML = [
    summaryCard("Vessel", vesselName),
    summaryCard("Audit date", a.audit_date || "—"),
    summaryCard("Audit source", source),
    summaryCard("Audit type", auditTypeName),
    summaryCard("Reference", a.report_reference || "—"),
    summaryCard("Report / source file", file || "—"),
    summaryCard("Contractor company", a.contractor_company || "—"),
    summaryCard("Record ID", a.id || "—"),
  ].join("");

  el("auditRemarksBox").textContent = String(a.remarks || "No audit remarks recorded.");
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
  if (!state.audit?.id) throw new Error("Audit record not loaded.");

  const qno = canonicalQno(el("obsQuestionNo").value);
  const observationText = String(el("obsText").value || "").trim();
  const remarks = String(el("obsRemarks").value || "").trim();

  if (!observationText && !remarks) {
    throw new Error("Observation text or remarks is required.");
  }

  return {
    company_id: state.audit.company_id || state.me?.company_id || null,
    report_id: state.audit.id,
    question_no: qno || null,
    question_base: qno || null,
    obs_type: String(el("obsType").value || "").trim(),
    designation: String(el("obsDesignation").value || "").trim() || null,
    soc: String(el("obsSoc").value || "").trim() || null,
    noc: String(el("obsNoc").value || "").trim() || null,
    observation_text: observationText || null,
    remarks: remarks || null,
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

  state.observations = await loadObservationsForAudit();
  clearObservationForm();
  renderObservationsTable();

  setStatus("Saved");
}

async function deleteObservation(id) {
  if (!id) return;

  const ok = confirm("Delete this observation?");
  if (!ok) return;

  setStatus("Deleting observation…");

  const { error } = await state.supabase
    .from("audit_observation_items")
    .delete()
    .eq("id", id);

  if (error) throw error;

  state.observations = await loadObservationsForAudit();
  renderObservationsTable();
  clearObservationForm();

  setStatus("Deleted");
}

async function openReportFile() {
  const a = state.audit;
  const path = a?.report_storage_path;

  if (!path) {
    alert("No report/source file path is recorded.");
    return;
  }

  if (String(path).startsWith("manual_import_batches/")) {
    alert(
      "This audit was imported from the manual Excel staging batch. " +
      "The source filename is recorded, but no individual report file is stored for this audit record."
    );
    return;
  }

  const { data, error } = await state.supabase
    .storage
    .from(AUDIT_BUCKET)
    .createSignedUrl(path, 60);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No signed URL returned.");

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function refreshDetail() {
  setStatus("Loading…");

  state.vessels = await loadVessels();
  state.auditTypes = await loadAuditTypes();
  state.audit = await loadAudit();
  state.observations = await loadObservationsForAudit();

  renderAuditHeader();
  renderObservationsTable();
  clearObservationForm();

  setStatus("Ready");
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

  state.supabase = window.AUTH?.ensureSupabase
    ? window.AUTH.ensureSupabase()
    : window.__supabaseClient;

  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded.");
  }

  state.reportId = getAuditId();
  if (!state.reportId) {
    throw new Error("Missing audit id in URL.");
  }

  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);
  el("refreshBtn").addEventListener("click", async () => {
    try {
      await refreshDetail();
    } catch (e) {
      console.error(e);
      alert("Reload failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("closeWindowBtn").addEventListener("click", () => {
    window.close();
  });

  el("openReportBtn").addEventListener("click", async () => {
    try {
      await openReportFile();
    } catch (e) {
      console.error(e);
      alert("Open source/report file failed: " + (e?.message || String(e)));
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

  el("buildInfo").textContent = BUILD;

  await refreshDetail();
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Audit detail page failed to load: " + (e?.message || String(e)));
    setStatus("Error");
  }
})();
