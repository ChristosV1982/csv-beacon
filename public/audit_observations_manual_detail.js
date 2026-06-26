// public/audit_observations_manual_detail.js
// Audit Observations Manual — separate audit detail window.

const BUILD = "AUDIT_OBSERVATIONS_MANUAL_DETAIL_20260626_STEP6D_MSCAT_REVIEW_SIRE_REF";
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
  const raw = String(qno || "").trim();
  if (!raw) return "";

  const parts = raw.split(".").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "";

  if (!parts.every((p) => /^\d+$/.test(p))) {
    throw new Error("SIRE 2.0 reference must be numeric and dot-separated, e.g. 04.07 or 08.99.02.");
  }

  return parts
    .map((p) => String(Number((p.replace(/^0+/, "") || "0"))).padStart(2, "0"))
    .join(".");
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
  mscatTaxonomy: [],
  mscatSelections: [],
  activeMscatObservationId: null,
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


async function loadMscatTaxonomy() {
  const { data, error } = await state.supabase
    .from("post_inspection_mscat_taxonomy")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return data || [];
}

async function loadMscatSelectionsForAudit() {
  const { data, error } = await state.supabase.rpc("csvb_audit_observation_mscat_for_me", {
    p_audit_observation_item_id: null,
    p_report_id: state.reportId
  });

  if (error) throw error;

  return data || [];
}

function mscatSelectionsForObservation(observationId) {
  return (state.mscatSelections || []).filter((x) =>
    String(x.audit_observation_item_id) === String(observationId)
  );
}

function mscatStatusForObservation(observationId) {
  const rows = mscatSelectionsForObservation(observationId);
  const total = rows.length;
  const ai = rows.filter((x) => String(x.selection_source) === "ai_suggested").length;
  const manual = rows.filter((x) => String(x.selection_source) === "manual").length;

  if (!total) {
    return { key: "none", label: "No M-SCAT", className: "pill-none", total, ai, manual };
  }

  if (manual > 0 && ai === 0) {
    return { key: "manual", label: "Manual reviewed", className: "pill-manual", total, ai, manual };
  }

  if (ai > 0 && manual === 0) {
    return { key: "ai", label: "AI populated", className: "pill-ai", total, ai, manual };
  }

  return { key: "mixed", label: "Mixed", className: "pill-mixed", total, ai, manual };
}

function mscatStatusBadge(observationId) {
  const s = mscatStatusForObservation(observationId);
  return `<span class="pill ${esc(s.className)}">${esc(s.label)}</span>`;
}

function mscatSourceBadge(source) {
  if (String(source) === "manual") return `<span class="pill pill-manual">Manual</span>`;
  if (String(source) === "ai_suggested") return `<span class="pill pill-ai">AI</span>`;
  return `<span class="pill">${esc(source || "—")}</span>`;
}

function taxonomyById(id) {
  return (state.mscatTaxonomy || []).find((x) => String(x.id) === String(id));
}

function activeMscatObservation() {
  return (state.observations || []).find((x) =>
    String(x.id) === String(state.activeMscatObservationId)
  );
}

function mscatDisplayLabel(item) {
  if (!item) return "—";

  const code = item.item_code || item.item_no || "";
  const label = item.item_label || "";
  const section = item.section_label || "";
  const subsection = item.subsection_label || "";

  return [code, label].filter(Boolean).join(" — ") ||
    [section, subsection].filter(Boolean).join(" / ") ||
    item.id;
}

function renderMscatSavedList() {
  const box = el("mscatSavedList");
  const obs = activeMscatObservation();

  if (!box) return;

  if (!obs) {
    box.innerHTML = "";
    return;
  }

  const saved = mscatSelectionsForObservation(obs.id);

  if (!saved.length) {
    box.innerHTML = `<span class="muted">No M-SCAT selections saved for this observation.</span>`;
    return;
  }

  box.innerHTML = saved.map((s) => {
    const label = [
      s.section_label,
      s.subsection_label,
      s.item_code || s.item_no,
      s.item_label
    ].filter(Boolean).join(" / ");

    const reason = String(s.notes || "").trim();

    return `
      <div class="mscatSavedItem">
        <div class="mscatSavedMain">
          ${mscatSourceBadge(s.selection_source)}
          <span>${esc(label)}</span>
        </div>
        ${reason ? `<div class="mscatReason"><strong>Reason:</strong> ${esc(reason)}</div>` : ""}
      </div>
    `;
  }).join("");
}


function renderMscatSelectedObservation() {
  const box = el("mscatSelectedObservationBox");
  const obs = activeMscatObservation();

  if (!box) return;

  if (!obs) {
    box.textContent = "No observation selected for M-SCAT.";
    return;
  }

  const observationText = String(obs.observation_text || obs.remarks || "").trim();

  box.innerHTML = `
    <strong>Selected observation:</strong> ${esc(obs.question_no || obs.question_base || "—")} / ${esc(OBS_TYPE_LABELS[obs.obs_type] || obs.obs_type || "—")}
    <br/>
    ${esc(observationText || "—")}
  `;
}

function groupMscatTaxonomy(items) {
  const sections = new Map();

  for (const item of items) {
    const sectionKey = item.section_label || item.section_key || "Other";
    const subsectionKey = item.subsection_label || item.subsection_key || "General";

    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, new Map());
    }

    const subsections = sections.get(sectionKey);

    if (!subsections.has(subsectionKey)) {
      subsections.set(subsectionKey, []);
    }

    subsections.get(subsectionKey).push(item);
  }

  return sections;
}

function renderMscatTaxonomy() {
  const grid = el("mscatTaxonomyGrid");
  if (!grid) return;

  const obs = activeMscatObservation();
  const search = String(el("mscatSearchInput")?.value || "").trim().toLowerCase();
  const savedIds = new Set(mscatSelectionsForObservation(obs?.id).map((s) => String(s.taxonomy_id)));

  let items = state.mscatTaxonomy || [];

  if (search) {
    items = items.filter((item) => {
      const haystack = [
        item.section_key,
        item.section_label,
        item.subsection_key,
        item.subsection_label,
        item.item_code,
        item.item_no,
        item.item_label,
        item.source_ref
      ].filter(Boolean).join(" ").toLowerCase();

      return haystack.includes(search);
    });
  }

  if (!items.length) {
    grid.innerHTML = `<div class="muted">No M-SCAT taxonomy items found.</div>`;
    return;
  }

  const grouped = groupMscatTaxonomy(items);

  const html = Array.from(grouped.entries()).map(([sectionLabel, subsections]) => {
    const subsectionHtml = Array.from(subsections.entries()).map(([subsectionLabel, subItems]) => {
      const itemHtml = subItems.map((item) => {
        const id = String(item.id);
        const code = item.item_code || item.item_no || "";
        const checked = savedIds.has(id) ? "checked" : "";

        return `
          <label class="mscatItem">
            <input type="checkbox" class="mscatCheckbox" value="${esc(id)}" ${checked} ${obs ? "" : "disabled"}/>
            <span>
              <span class="mscatCode">${esc(code || "—")}</span>
              ${esc(item.item_label || "—")}
            </span>
          </label>
        `;
      }).join("");

      return `
        <details class="mscatSubsection" ${search ? "open" : ""}>
          <summary>${esc(subsectionLabel)} <span class="mscatCountPill">${subItems.length}</span></summary>
          <div class="mscatItems">${itemHtml}</div>
        </details>
      `;
    }).join("");

    return `
      <div class="mscatSection">
        <div class="mscatSectionHead">${esc(sectionLabel)}</div>
        ${subsectionHtml}
      </div>
    `;
  }).join("");

  grid.innerHTML = html;
}

function renderMscatPanel() {
  renderMscatSelectedObservation();
  renderMscatSavedList();
  renderMscatTaxonomy();

  const active = !!activeMscatObservation();
  const activeObs = activeMscatObservation();
  const savedCount = activeObs ? mscatSelectionsForObservation(activeObs.id).length : 0;

  el("saveMscatBtn").disabled = !active;
  el("markMscatReviewedBtn").disabled = !active || savedCount === 0;
  el("clearMscatSelectionBtn").disabled = !active;
}

function setActiveMscatObservation(observationId) {
  state.activeMscatObservationId = observationId || null;
  renderObservationsTable();
  renderMscatPanel();

  const panel = el("mscatPanel");
  if (panel) {
    try {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (_) {
      panel.scrollIntoView();
    }
  }
}

async function saveMscatSelections() {
  const obs = activeMscatObservation();
  if (!obs) {
    alert("Select an observation first.");
    return;
  }

  const selectedIds = Array.from(document.querySelectorAll(".mscatCheckbox:checked"))
    .map((x) => String(x.value || "").trim())
    .filter(Boolean);

  const ok = confirm(
    `Save ${selectedIds.length} M-SCAT selection(s) for this observation?\\n\\n` +
    `Existing M-SCAT selections for this observation will be replaced.`
  );

  if (!ok) return;

  setStatus("Saving M-SCAT…");

  const { error: delErr } = await state.supabase
    .from("audit_observation_mscat")
    .delete()
    .eq("audit_observation_item_id", obs.id);

  if (delErr) throw delErr;

  if (selectedIds.length) {
    const payload = selectedIds.map((taxonomyId) => ({
      audit_observation_item_id: obs.id,
      taxonomy_id: taxonomyId,
      selection_source: "manual"
    }));

    const { error: insErr } = await state.supabase
      .from("audit_observation_mscat")
      .insert(payload);

    if (insErr) throw insErr;
  }

  state.mscatSelections = await loadMscatSelectionsForAudit();

  renderObservationsTable();
  renderMscatPanel();

  setStatus("M-SCAT saved");
}

async function markActiveMscatReviewed() {
  const obs = activeMscatObservation();

  if (!obs) {
    alert("Select an observation first.");
    return;
  }

  const rows = mscatSelectionsForObservation(obs.id);
  if (!rows.length) {
    alert("This observation has no M-SCAT selections to mark as reviewed.");
    return;
  }

  const ok = confirm(
    `Mark ${rows.length} M-SCAT selection(s) for this observation as manually reviewed?\n\n` +
    `The selected M-SCAT codes will remain unchanged. Only their source will change from AI to Manual.`
  );

  if (!ok) return;

  setStatus("Marking M-SCAT as manually reviewed…");

  const { error } = await state.supabase
    .from("audit_observation_mscat")
    .update({ selection_source: "manual" })
    .eq("audit_observation_item_id", obs.id);

  if (error) throw error;

  state.mscatSelections = await loadMscatSelectionsForAudit();

  renderObservationsTable();
  renderMscatPanel();

  setStatus("M-SCAT marked as manually reviewed");
}

async function editObservationSireReference(id) {
  const obs = (state.observations || []).find((x) => String(x.id) === String(id));
  if (!obs) {
    alert("Observation not found.");
    return;
  }

  const current = String(obs.question_no || obs.question_base || "").trim();
  const raw = prompt(
    "Enter SIRE 2.0 reference for this observation.\n\nExamples: 04.07, 08.99.02\nLeave blank to clear the reference.",
    current
  );

  if (raw === null) return;

  const qno = canonicalQno(raw);
  const displayValue = qno || "blank / no SIRE 2.0 reference";

  const ok = confirm(`Update SIRE 2.0 reference to: ${displayValue}?`);
  if (!ok) return;

  setStatus("Updating SIRE 2.0 reference…");

  const { error } = await state.supabase
    .from("audit_observation_items")
    .update({
      question_no: qno || null,
      question_base: qno || null
    })
    .eq("id", obs.id);

  if (error) throw error;

  state.observations = await loadObservationsForAudit();

  renderObservationsTable();
  renderMscatPanel();

  setStatus("SIRE 2.0 reference updated");
}

function clearMscatSelection() {
  state.activeMscatObservationId = null;
  renderObservationsTable();
  renderMscatPanel();
}


function renderObservationsTable() {
  const tbody = el("observationsTbody");
  const rows = state.observations || [];

  renderCounters();

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No observations entered for this audit.</td></tr>`;
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
      <tr class="${String(r.id) === String(state.activeMscatObservationId) ? 'csvb-mscat-active-row' : ''}">
        <td class="questionRefCell">
          <div class="questionRefValue">${esc(r.question_no || r.question_base || "—")}</div>
          <button class="btn btn-muted btn-small editSireRefBtn" data-id="${esc(r.id)}">Edit SIRE ref</button>
        </td>
        <td>${obsTypeBadge(r.obs_type)}</td>
        <td>${esc(r.designation || "—")}</td>
        <td>${esc(r.soc || "—")}</td>
        <td>${esc(r.noc || "—")}</td>
        <td class="remarksCell">
          <div class="obsTextMain">${esc(mainText)}</div>
          ${metaHtml}
        </td>
        <td>
          <button class="btn btn-muted btn-small mscatBtn selectMscatBtn" data-id="${esc(r.id)}">
            M-SCAT <span class="mscatCountPill">${mscatSelectionsForObservation(r.id).length}</span>
            <br/>${mscatStatusBadge(r.id)}
          </button>
        </td>
        <td><button class="btn btn-danger btn-small deleteObsBtn" data-id="${esc(r.id)}">Delete</button></td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll(".editSireRefBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await editObservationSireReference(btn.getAttribute("data-id"));
      } catch (e) {
        console.error(e);
        alert("Update SIRE 2.0 reference failed: " + (e?.message || String(e)));
        setStatus("Error");
      }
    });
  });

  tbody.querySelectorAll(".selectMscatBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveMscatObservation(btn.getAttribute("data-id"));
    });
  });

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
  state.mscatTaxonomy = await loadMscatTaxonomy();
  state.mscatSelections = await loadMscatSelectionsForAudit();

  renderAuditHeader();
  renderObservationsTable();
  clearObservationForm();
  renderMscatPanel();

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

  el("mscatSearchInput").addEventListener("input", renderMscatTaxonomy);

  el("saveMscatBtn").addEventListener("click", async () => {
    try {
      await saveMscatSelections();
    } catch (e) {
      console.error(e);
      alert("Save M-SCAT failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("markMscatReviewedBtn").addEventListener("click", async () => {
    try {
      await markActiveMscatReviewed();
    } catch (e) {
      console.error(e);
      alert("Mark M-SCAT as manually reviewed failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  el("clearMscatSelectionBtn").addEventListener("click", clearMscatSelection);

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
