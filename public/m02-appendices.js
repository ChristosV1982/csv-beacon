(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  let h, records = [], critical = [], persisted = new Set(), source = null, fetchToken = 0, pendingPrefill = null;
  const hosts = { pms: "maintenancePmsRows", unscheduled: "maintenanceUnscheduledRows", jobs: "maintenanceJobsRows" };
  const field = (name, label, value, type = "text") => `<label class="m02-field">${label}${type === "textarea"
    ? `<textarea data-appendix-field="${name}" rows="2" maxlength="50000">${esc(value)}</textarea>`
    : `<input data-appendix-field="${name}" type="${type}" ${type === "date" ? "" : 'maxlength="180"'} value="${esc(value)}">`}</label>`;
  function referenceSelect(row) {
    return `<label class="m02-field">Linked SIRE question<select data-appendix-field="question_id"><option value="">No linked question</option>${h.state.questions.map((q) =>
      `<option value="${esc(q.id)}" ${q.id === row.question_id ? "selected" : ""}>${esc(q.number_full || q.number_base)}</option>`).join("")}</select></label>`;
  }
  function counts() {
    const answered = critical.filter((item) => ["Yes", "No", "N/A"].includes(item.response)).length;
    return { key: "critical", label: "Appendix 2", total: critical.length, answered, remaining: critical.length - answered };
  }
  function progress() {
    const c = counts(), value = `Answered ${c.answered} / ${c.total} · Remaining ${c.remaining}`;
    $("criticalProgress").textContent = value; $("criticalNavProgress").textContent = value;
  }
  function deriveTotals() {
    ["High", "Medium", "Low"].forEach((severity) => {
      $("total" + severity).value = records.filter((row) => row.kind === "finding" && row.severity === severity).length;
    });
  }
  function sourceLabel() {
    $("lastVettingSource").textContent = source
      ? `Prefilled from Post-Inspection · ${source.inspection_date || "Date unavailable"} · ${source.report_ref || "Source retained"}${$("manualVettingOverride").checked ? " · Manual override" : ""}`
      : "Manual entry available. Use latest Post-Inspection to check vessel history.";
  }
  function applySource() {
    if (!source) return;
    $("lastVettingDate").value = source.inspection_date || "";
    $("lastVettingCompany").value = source.oil_major || "";
    $("lastVettingPlace").value = source.port_name || "";
    $("lastVettingDetails").value = source.report_ref || "";
    $("manualVettingOverride").checked = false;
    sourceLabel(); h.markDirty();
  }
  async function prefill(force = false) {
    const vessel = $("vesselId").value, ticket = ++fetchToken;
    if (!vessel || !h.state.canEdit) return;
    $("lastVettingSource").textContent = "Checking Post-Inspection history…";
    $("useVettingPrefill").disabled = true;
    try {
      const found = await h.rpc("csvb_m02_last_vetting", { p_company_id: h.state.companyId, p_vessel_id: vessel,
        p_as_of: $("inspectionTo").value || $("reportDate").value || new Date().toISOString().slice(0, 10) });
      if (ticket !== fetchToken || $("vesselId").value !== vessel) return;
      if (!found) {
        $("lastVettingSource").textContent = "No Post-Inspection history found for this vessel/date. Manual entry is available."; return;
      }
      source = found;
      if (force || !$("manualVettingOverride").checked) applySource();
      else sourceLabel();
    } catch (error) {
      if (ticket === fetchToken) $("lastVettingSource").textContent = `Post-Inspection lookup failed: ${error.message}. Manual entry remains available.`;
    } finally { if (ticket === fetchToken) $("useVettingPrefill").disabled = !h.state.canEdit || !vessel; }
  }
  function startPrefill(force = false) {
    const request = prefill(force); pendingPrefill = request;
    request.finally(() => { if (pendingPrefill === request) pendingPrefill = null; });
    return request;
  }
  function renderCritical() {
    $("criticalItems").innerHTML = critical.map((item) => `<article class="m02-appendix-card m02-critical-card" data-critical-item="${item.item_no}">
      <h4>${item.item_no}. ${esc(item.item_text)}</h4><div class="m02-appendix-grid">
      <label class="m02-field">Response<select data-critical-response="${item.item_no}" aria-label="Critical equipment ${item.item_no} response">
      <option value="" disabled hidden>Select response</option>${["Yes", "No", "N/A"].map((v) => `<option value="${v}" ${item.response === v ? "selected" : ""}>${v === "N/A" ? "Not Applicable" : v}</option>`).join("")}</select></label>
      <label class="m02-field">Results / comments<textarea rows="2" maxlength="50000" data-critical-comments="${item.item_no}">${esc(item.comments || "")}</textarea></label></div></article>`).join("");
    // A disabled placeholder must remain selected for a genuine unanswered item.
    document.querySelectorAll("[data-critical-response]").forEach((select) => {
      select.value = critical.find((item) => item.item_no === Number(select.dataset.criticalResponse))?.response || "";
    });
    window.CSVB_M02_STRUCTURED_ITEMS.mountCritical();
    progress();
  }
  function renderRecords() {
    Object.values(hosts).forEach((id) => $(id).replaceChildren());
    $("findingsRows").replaceChildren(); $("photoRecords").replaceChildren();
    records.forEach((row) => {
      const card = document.createElement("article"); card.className = "m02-appendix-card"; card.dataset.appendixRecord = row.id;
      let content = "";
      if (row.kind === "maintenance") {
        content = field("reference", row.subsection === "pms" ? "Equipment / system / PMS job checked" : row.subsection === "jobs" ? "Item / reference" : "Case / reference checked", row.reference);
        if (row.subsection === "jobs") content += field("due_date", "Due date", row.due_date, "date");
        content += field("comments", row.subsection === "jobs" ? "Comments / details" : "Comments", row.comments, "textarea");
      } else if (row.kind === "finding") {
        content = field("reference", "Remark reference number", row.reference) + field("description", "Description of remark", row.description, "textarea") +
          field("corrective_action", "Corrective action", row.corrective_action, "textarea") + field("root_cause", "Root cause", row.root_cause, "textarea") +
          `<label class="m02-field">Severity<select data-appendix-field="severity"><option value="">Select severity</option>${["Low", "Medium", "High"].map((v) => `<option ${row.severity === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>` +
          referenceSelect(row) + field("requirement_reference", "SIRE 2.0 / other applicable requirement reference", row.requirement_reference) +
          field("due_date", "Rectification due date", row.due_date, "date");
      } else {
        content = field("description", "Caption / description", row.description, "textarea") +
          field("requirement_reference", "Location / section / other reference (optional)", row.requirement_reference) + referenceSelect(row) +
          `<div class="m02-photo-preview" data-photo-preview="${row.id}"></div>`;
      }
      card.innerHTML = `<div class="m02-appendix-grid">${content}</div><button type="button" class="m02-attachment-action" data-remove-appendix="${row.id}">Remove row</button>` +
        (row.kind === "finding" ? "" : h.attachmentMarkup(null, null, row.id, row.kind));
      (row.kind === "maintenance" ? $(hosts[row.subsection]) : row.kind === "finding" ? $("findingsRows") : $("photoRecords")).append(card);
    });
    deriveTotals(); h.renderAttachments();
    if (!h.state.canEdit) document.querySelectorAll(".m02-appendix-card input,.m02-appendix-card select,.m02-appendix-card textarea,[data-remove-appendix]").forEach((input) => { input.disabled = true; });
  }
  function add(kind, subsection = null) {
    if (!h.state.canEdit || h.state.saving || h.state.attachmentBusy) return;
    records.push({ id: crypto.randomUUID(), kind, subsection, sort_order: records.length, reference: "", comments: "", description: "", corrective_action: "",
      root_cause: "", severity: null, requirement_reference: "", question_id: null, due_date: null });
    renderRecords(); h.markDirty();
  }
  function init(hooks) {
    h = hooks;
    document.querySelectorAll("[data-add-maintenance]").forEach((b) => b.addEventListener("click", () => add("maintenance", b.dataset.addMaintenance)));
    $("addM02Finding").addEventListener("click", () => add("finding"));
    $("addM02Photo").addEventListener("click", () => add("photo"));
    $("useVettingPrefill").addEventListener("click", () => startPrefill(true));
    $("vesselId").addEventListener("change", () => {
      fetchToken++; source = null; $("manualVettingOverride").checked = false;
      ["lastVettingDate", "lastVettingCompany", "lastVettingPlace", "lastVettingDetails"].forEach((id) => { $(id).value = ""; });
      sourceLabel(); startPrefill();
    });
    $("manualVettingOverride").addEventListener("change", () => { if (!$("manualVettingOverride").checked) applySource(); sourceLabel(); });
    ["lastVettingDate", "lastVettingCompany", "lastVettingPlace", "lastVettingDetails"].forEach((id) => $(id).addEventListener("input", () => {
      $("manualVettingOverride").checked = true; sourceLabel();
    }));
    $("reportForm").addEventListener("input", (event) => {
      const input = event.target, row = input.closest("[data-appendix-record]");
      if (row && input.dataset.appendixField) {
        const item = records.find((item) => item.id === row.dataset.appendixRecord);
        item[input.dataset.appendixField] = input.value || null;
        deriveTotals();
      }
      if (input.dataset.criticalComments) critical.find((item) => item.item_no === Number(input.dataset.criticalComments)).comments = input.value;
    });
    $("reportForm").addEventListener("change", (event) => {
      const input = event.target;
      if (input.dataset.appendixField) input.dispatchEvent(new Event("input", { bubbles: true }));
      if (input.dataset.criticalResponse) {
        critical.find((item) => item.item_no === Number(input.dataset.criticalResponse)).response = input.value || null;
        progress(); h.progress(); h.markDirty();
      }
    });
    $("reportForm").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-appendix]"); if (!remove || !h.state.canEdit || h.state.saving || h.state.attachmentBusy) return;
      const id = remove.dataset.removeAppendix;
      if (h.state.attachments.some((file) => file.appendix_record_id === id)) { h.showEditorError("Remove this row's supporting files before removing the row."); return; }
      if (!confirm("Remove this row from the M02 draft? The change is saved with Save Draft.")) return;
      records = records.filter((item) => item.id !== id); renderRecords(); h.markDirty();
    });
  }
  async function newReport() {
    fetchToken++; pendingPrefill = null; records = []; persisted.clear(); source = null;
    critical = (await h.rpc("csvb_m02_critical_items", { p_company_id: h.state.companyId })).map((item) => ({ ...item, response: null, comments: "" }));
    $("maintenanceClosed").checked = false; $("manualVettingOverride").checked = false;
    sourceLabel(); renderCritical(); renderRecords();
  }
  function load(bundle) {
    fetchToken++; pendingPrefill = null; records = (bundle.appendices?.records || []).map((row) => ({ ...row }));
    persisted = new Set(records.map((row) => row.id));
    critical = bundle.appendices?.critical_items || [];
    source = bundle.report.last_vetting_provenance?.source || null;
    $("manualVettingOverride").checked = bundle.report.last_vetting_provenance?.manual_override === true ||
      (!source && ["lastVettingDate", "lastVettingCompany", "lastVettingPlace", "lastVettingDetails"].some((id) => $(id).value));
    $("maintenanceClosed").checked = bundle.report.maintenance_previous_closed === true;
    sourceLabel(); renderCritical(); renderRecords();
  }
  function collect() {
    return { records: records.map((row, i) => ({ ...row, sort_order: i })), critical_items: critical.map((row) => ({ item_no: row.item_no, response: row.response, comments: row.comments || "" })),
      maintenance_previous_closed: $("maintenanceClosed").checked, vetting_source_id: source?.report_id || null, manual_vetting_override: $("manualVettingOverride").checked };
  }
  window.CSVB_M02_APPENDICES = { init, newReport, load, collect, counts, progress, deriveTotals,
    readyForSave: async () => { if (pendingPrefill) await pendingPrefill; }, isPersisted: (id) => persisted.has(id) };
})();
