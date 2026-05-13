/* public/portable-lifting-appliances-wire-component.js */
/* C.S.V. BEACON – PLA-07C Component Detail Actions UI */

(() => {
  "use strict";

  const BUILD = "PLA-COMPONENT-DETAIL-ACTIONS-07C-20260513-1";

  const state = {
    sb: null,
    profile: null,
    componentId: "",
    component: null,
    canView: false,
    canEdit: false,
    canAdmin: false,
    conditions: [],
    locations: [],
    storageLocations: [],
    events: [],
    inspections: []
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn",
      "detailTitle", "detailSubtitle",
      "statsGrid",
      "mainParticulars", "technicalParticulars", "lifecycleParticulars", "governanceParticulars", "rawSnapshot"
    ].forEach((id) => {
      el[id] = $(id);
    });
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function value(value) {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function showMsg(type, message) {
    const box = type === "ok" ? el.okBox : el.warnBox;
    if (!box) return;

    box.textContent = message || "";
    box.style.display = message ? "block" : "none";

    if (message && type === "ok") {
      setTimeout(() => {
        box.textContent = "";
        box.style.display = "none";
      }, 2500);
    }
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  function getComponentId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function inputDate(value) {
    if (!value) return "";
    const raw = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function asDate(value) {
    const raw = inputDate(value);
    if (!raw) return "—";
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function asDateTime(value) {
    if (!value) return "—";
    return String(value).replace("T", " ").slice(0, 19);
  }

  function addMonths(dateString, months) {
    if (!dateString) return "";
    const [y, m, d] = dateString.split("-").map(Number);
    if (!y || !m || !d) return "";

    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + Number(months || 0));
    return dt.toISOString().slice(0, 10);
  }

  function numberOrNull(value) {
    const v = String(value ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function uuidOrNull(value) {
    const v = String(value ?? "").trim();
    return v ? v : null;
  }

  function textOrNull(value) {
    const v = String(value ?? "").trim();
    return v ? v : null;
  }

  function isoOrNull(value) {
    const v = String(value ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  function field(label, valueText) {
    return `
      <div class="field-box">
        <div class="field-label">${esc(label)}</div>
        <div class="field-value">${esc(value(valueText))}</div>
      </div>
    `;
  }

  function renderGrid(target, rows) {
    target.innerHTML = `<div class="field-grid">${rows.join("")}</div>`;
  }

  function statusLabel(raw) {
    const v = String(raw || "");
    const map = {
      ok: "OK",
      due_soon: "Due Soon",
      overdue: "Overdue",
      condition_based: "Condition Based",
      maker_based: "As per Maker",
      not_recorded: "Not Recorded",
      not_applicable: "N/A",
      missing: "Missing",
      recorded: "Recorded"
    };
    return map[v] || v.replaceAll("_", " ") || "—";
  }

  function statusClass(raw) {
    const v = String(raw || "");
    if (v === "overdue") return "pill-danger";
    if (v === "due_soon" || v === "not_recorded" || v === "missing") return "pill-warn";
    if (v === "not_applicable" || v === "condition_based" || v === "maker_based") return "pill-muted";
    return "pill-ok";
  }

  function pill(label, raw) {
    return `<span class="pill ${statusClass(raw)}">${esc(label || statusLabel(raw))}</span>`;
  }

  function firstNonEmpty(obj, keys) {
    for (const key of keys) {
      if (obj[key] !== null && obj[key] !== undefined && obj[key] !== "") return obj[key];
    }
    return "";
  }

  function option(value, label, selected = "") {
    return `<option value="${esc(value)}"${String(value) === String(selected) ? " selected" : ""}>${esc(label)}</option>`;
  }

  function conditionOptions(selected = "") {
    return [
      `<option value="">Not changed / Not recorded</option>`,
      ...state.conditions.map((c) => option(c.id, c.condition_label || c.condition_key || c.id, selected))
    ].join("");
  }

  function locationOptions(selected = "") {
    return [
      `<option value="">Select equipment / location...</option>`,
      ...state.locations.map((l) => option(l.id, `${l.location_code || "—"} — ${l.location_name || "—"}`, selected))
    ].join("");
  }

  function storageOptions(selected = "") {
    return [
      `<option value="">No storage / Not applicable</option>`,
      ...state.storageLocations.map((s) => option(s.id, s.storage_label || s.storage_key || s.id, selected))
    ].join("");
  }

  async function loadPermissions() {
    const c = state.component;
    if (!c) return;

    state.canView = await rpc("pla_current_user_can", {
      p_action: "view",
      p_company_id: c.company_id,
      p_vessel_id: c.vessel_id
    });

    state.canEdit = await rpc("pla_current_user_can", {
      p_action: "edit",
      p_company_id: c.company_id,
      p_vessel_id: c.vessel_id
    });

    state.canAdmin = await rpc("pla_current_user_can", {
      p_action: "admin",
      p_company_id: c.company_id,
      p_vessel_id: c.vessel_id
    });
  }

  async function loadSetupData() {
    const [conditionsRes, locationsRes, storageRes] = await Promise.all([
      state.sb.from("pla_condition_options").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_equipment_locations").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_storage_locations").select("*").eq("is_active", true).order("sort_order")
    ]);

    for (const res of [conditionsRes, locationsRes, storageRes]) {
      if (res.error) throw res.error;
    }

    state.conditions = conditionsRes.data || [];
    state.locations = locationsRes.data || [];
    state.storageLocations = storageRes.data || [];
  }

  async function loadHistory() {
    const [eventsRes, inspectionsRes] = await Promise.all([
      state.sb
        .from("pla_v_component_events_list")
        .select("*")
        .eq("component_id", state.componentId)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false }),

      state.sb
        .from("pla_v_component_inspections_list")
        .select("*")
        .eq("component_id", state.componentId)
        .order("inspection_date", { ascending: false })
        .order("created_at", { ascending: false })
    ]);

    if (eventsRes.error) throw eventsRes.error;
    if (inspectionsRes.error) throw inspectionsRes.error;

    state.events = eventsRes.data || [];
    state.inspections = inspectionsRes.data || [];
  }

  async function loadComponent() {
    if (!state.componentId) throw new Error("Missing component id in URL.");

    const { data, error } = await state.sb
      .from("pla_v_components_list")
      .select("*")
      .eq("id", state.componentId)
      .maybeSingle();

    if (error) throw error;

    state.component = data || null;
  }

  function isDeleted() {
    const c = state.component;
    return c?.is_deleted === true || !!c?.deleted_at;
  }

  function renderHeader(c) {
    el.detailTitle.textContent = c.unique_id || "PLA Component Detail";

    const subtitleParts = [
      c.vessel_name,
      c.section_code ? `${c.section_code} — ${c.section_name || ""}` : "",
      c.component_type_code ? `${c.component_type_code} — ${c.component_type_name || ""}` : ""
    ].filter(Boolean);

    el.detailSubtitle.textContent = subtitleParts.join(" / ") || "Portable Lifting Appliances & Wires component.";

    el.statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Status</div>
        <div class="stat-value">${esc(c.status || c.component_status || (isDeleted() ? "Discarded" : "—"))}</div>
        <div class="stat-help">Current component status.</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Condition</div>
        <div class="stat-value">${esc(c.condition_label || "—")}</div>
        <div class="stat-help">Latest recorded condition.</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Replacement</div>
        <div class="stat-value">${esc(statusLabel(c.calculated_replacement_due_status))}</div>
        <div class="stat-help">Due: ${esc(asDate(c.replacement_due_date))}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Inspection</div>
        <div class="stat-value">${esc(statusLabel(c.calculated_inspection_due_status))}</div>
        <div class="stat-help">Next: ${esc(asDate(c.next_inspection_due))}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">5Y Test</div>
        <div class="stat-value">${esc(statusLabel(c.calculated_five_year_test_status))}</div>
        <div class="stat-help">Next: ${esc(asDate(c.next_five_year_test_due))}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Particulars</div>
        <div class="stat-value">${esc(c.particulars_lock_status || "unlocked")}</div>
        <div class="stat-help">Office-controlled lock state.</div>
      </div>
    `;
  }

  function renderMain(c) {
    renderGrid(el.mainParticulars, [
      field("Unique ID", c.unique_id),
      field("Company", c.company_name),
      field("Vessel", c.vessel_name),
      field("Hull Number", c.hull_number),
      field("IMO Number", c.imo_number),
      field("Section", `${value(c.section_code)} — ${value(c.section_name)}`),
      field("Category", c.category_name || c.category_code),
      field("Equipment / Location", `${value(c.location_code)} — ${value(c.location_name)}`),
      field("Storage Location", c.storage_label || c.storage_key),
      field("Component Type", `${value(c.component_type_code)} — ${value(c.component_type_name)}`),
      field("Sequence", c.sequence_number),
      field("Status", c.status || c.component_status)
    ]);
  }

  function renderTechnical(c) {
    const diameterLength = firstNonEmpty(c, [
      "diameter_length_text",
      "diameter_length",
      "diameter_length_mm_m",
      "diameter_length_mm_m_text"
    ]);

    renderGrid(el.technicalParticulars, [
      field("Certificate No.", c.certificate_no),
      field("Certificate Missing", c.certificate_missing),
      field("Condition", c.condition_label || c.condition_key),
      field("Severity Level", c.severity_level),
      field("Date Rigged", asDate(c.date_rigged)),
      field("Diameter / Length (mm / m)", diameterLength),
      field("Material", c.material),
      field("Construction", c.construction),
      field("SWL (T / kN)", c.swl_text || c.swl),
      field("Five-Year Test Required", c.five_year_test_required)
    ]);
  }

  function renderLifecycle(c) {
    el.lifecycleParticulars.innerHTML = `
      <div class="pill-row">
        ${pill(null, c.calculated_replacement_due_status)}
        ${pill(null, c.calculated_inspection_due_status)}
        ${pill(null, c.calculated_five_year_test_status)}
      </div>

      <div class="field-grid" style="margin-top:10px;">
        ${field("Replacement Periodicity", c.replacement_periodicity_months ? `${c.replacement_periodicity_months} months` : "—")}
        ${field("Replacement Due Date", asDate(c.replacement_due_date))}
        ${field("Inspection Date", asDate(c.inspection_date))}
        ${field("Next Annual Inspection Due", asDate(c.next_inspection_due))}
        ${field("Last 5Y Test Date", asDate(c.last_five_year_test_date))}
        ${field("Next 5Y Test Due", asDate(c.next_five_year_test_due))}
      </div>
    `;
  }

  function renderGovernance(c) {
    renderGrid(el.governanceParticulars, [
      field("Particulars Lock Status", c.particulars_lock_status),
      field("Discarded", isDeleted()),
      field("Delete / Discard Reason", c.delete_reason),
      field("Remarks", c.remarks),
      field("Created At", asDateTime(c.created_at)),
      field("Updated At", asDateTime(c.updated_at))
    ]);
  }

  function renderHistory() {
    const panel = el.rawSnapshot.closest(".panel");
    if (panel) {
      const title = panel.querySelector(".panel-title");
      const meta = panel.querySelector(".panel-meta");
      if (title) title.textContent = "Inspection & Action History";
      if (meta) meta.textContent = "Recorded inspections, tests, maintenance, transfers and discard actions.";
    }

    const inspectionsHtml = state.inspections.length
      ? `
        <table class="raw-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Condition</th>
              <th>Next Due</th>
              <th>Finding</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${state.inspections.map((i) => `
              <tr>
                <td>${esc(asDate(i.inspection_date))}</td>
                <td>${esc(i.inspection_type || "—")}</td>
                <td>${esc(i.condition_label || "—")}</td>
                <td>${esc(asDate(i.next_inspection_due))}</td>
                <td>${esc(i.finding_summary || "—")}</td>
                <td>${esc(i.remarks || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `
      : `<div class="empty">No inspections/tests have been recorded yet.</div>`;

    const eventsHtml = state.events.length
      ? `
        <table class="raw-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Performed By</th>
              <th>Remarks / Reason</th>
              <th>Created By</th>
            </tr>
          </thead>
          <tbody>
            ${state.events.map((e) => `
              <tr>
                <td>${esc(asDate(e.event_date))}</td>
                <td>${esc(e.event_type || "—")}</td>
                <td>${esc(e.performed_by || "—")}</td>
                <td>${esc(e.remarks || "—")}</td>
                <td>${esc(e.created_by_username || "—")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `
      : `<div class="empty">No component actions have been recorded yet.</div>`;

    el.rawSnapshot.innerHTML = `
      <div class="panel" style="box-shadow:none;">
        <div class="panel-head">
          <div class="panel-title">Inspection / Test Records</div>
        </div>
        <div class="panel-body">${inspectionsHtml}</div>
      </div>

      <div class="panel" style="box-shadow:none;margin-top:10px;">
        <div class="panel-head">
          <div class="panel-title">Action Records</div>
        </div>
        <div class="panel-body">${eventsHtml}</div>
      </div>
    `;
  }

  function ensureActionBar() {
    let bar = $("plaActionBar");
    if (bar) return bar;

    bar = document.createElement("section");
    bar.id = "plaActionBar";
    bar.className = "panel";
    bar.style.marginTop = "8px";
    bar.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">Component Actions</div>
        <div class="panel-meta">Controlled actions are recorded and KPI-ready.</div>
      </div>
      <div id="plaActionButtons" class="panel-body topbar-actions"></div>
    `;

    el.statsGrid.insertAdjacentElement("afterend", bar);
    return bar;
  }

  function renderActions() {
    const bar = ensureActionBar();
    const target = $("plaActionButtons");

    if (!state.canEdit || isDeleted()) {
      target.innerHTML = isDeleted()
        ? `<span class="pill pill-danger">Component discarded. Editing and new actions are blocked.</span>`
        : `<span class="pill pill-muted">No edit permission for this component.</span>`;
      return;
    }

    target.innerHTML = `
      <button id="editComponentBtn" class="btn2" type="button">Edit Component</button>
      <button id="annualInspectionBtn" class="btn2" type="button">Record Annual Inspection</button>
      <button id="fiveYearTestBtn" class="btn2" type="button">Record 5Y Test</button>
      <button id="maintenanceBtn" class="btn2" type="button">Maintenance / Repair</button>
      <button id="certificateBtn" class="btn2" type="button">Certificate / Condition Update</button>
      <button id="transferBtn" class="btn2" type="button">Transfer Location</button>
      <button id="discardBtn" class="btn" type="button">Discard Component</button>
      ${state.canAdmin ? `<button id="advancedSnapshotBtn" class="btn2" type="button">Advanced Snapshot</button>` : ""}
    `;

    $("editComponentBtn")?.addEventListener("click", openEditModal);
    $("annualInspectionBtn")?.addEventListener("click", () => openInspectionModal("routine_annual"));
    $("fiveYearTestBtn")?.addEventListener("click", () => openInspectionModal("five_year_test"));
    $("maintenanceBtn")?.addEventListener("click", () => openEventModal("maintenance_repair"));
    $("certificateBtn")?.addEventListener("click", () => openEventModal("certificate_condition_update"));
    $("transferBtn")?.addEventListener("click", openTransferModal);
    $("discardBtn")?.addEventListener("click", openDiscardModal);
    $("advancedSnapshotBtn")?.addEventListener("click", openRawSnapshotModal);
  }

  function renderComponent() {
    const c = state.component;

    if (!c) {
      el.detailTitle.textContent = "PLA Component Not Found";
      el.detailSubtitle.textContent = "No component record was loaded.";
      el.statsGrid.innerHTML = "";
      el.mainParticulars.innerHTML = `<div class="empty">Component not found.</div>`;
      el.technicalParticulars.innerHTML = "";
      el.lifecycleParticulars.innerHTML = "";
      el.governanceParticulars.innerHTML = "";
      el.rawSnapshot.innerHTML = "";
      return;
    }

    renderHeader(c);
    renderActions();
    renderMain(c);
    renderTechnical(c);
    renderLifecycle(c);
    renderGovernance(c);
    renderHistory();
  }

  function injectModalStyles() {
    if ($("plaActionModalStyles")) return;

    const style = document.createElement("style");
    style.id = "plaActionModalStyles";
    style.textContent = `
      .pla-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(3,27,63,.46);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow: auto;
        padding: 20px 10px;
      }

      .pla-modal {
        width: min(1120px, 96vw);
        background: #fff;
        border: 1px solid #c9d9ec;
        border-radius: 16px;
        box-shadow: 0 24px 72px rgba(3,27,63,.28);
        overflow: hidden;
      }

      .pla-modal-head {
        padding: 12px 14px;
        border-bottom: 1px solid #dce8f6;
        background: linear-gradient(180deg, #fbfdff, #f4f8fc);
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .pla-modal-title {
        color: #062a5e;
        font-weight: 950;
        font-size: 1.08rem;
      }

      .pla-modal-subtitle {
        color: #52677f;
        font-weight: 700;
        font-size: .84rem;
        margin-top: 3px;
      }

      .pla-modal-body {
        padding: 12px 14px;
      }

      .pla-modal-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(260px, 1fr));
        gap: 10px;
      }

      .pla-modal-wide {
        grid-column: 1 / -1;
      }

      .pla-modal label {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .pla-modal label span {
        color: #062a5e;
        font-weight: 900;
        font-size: .82rem;
      }

      .pla-modal input,
      .pla-modal select,
      .pla-modal textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #bfd5ee;
        border-radius: 10px;
        padding: 8px 10px;
        font-family: inherit;
        font-size: .88rem;
        color: #10233f;
        background: #fff;
      }

      .pla-modal textarea {
        min-height: 90px;
        resize: vertical;
      }

      .pla-modal textarea.large {
        min-height: 180px;
      }

      .pla-modal-actions {
        padding: 12px 14px;
        border-top: 1px solid #dce8f6;
        background: #f8fbfe;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .pla-check-row {
        flex-direction: row !important;
        align-items: center;
        gap: 8px !important;
      }

      .pla-check-row input {
        width: auto;
      }

      @media(max-width: 850px) {
        .pla-modal-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.querySelector(".pla-modal-backdrop")?.remove();
  }

  function modalShell(title, subtitle, bodyHtml, actionsHtml) {
    injectModalStyles();
    document.querySelector(".pla-modal-backdrop")?.remove();

    document.body.insertAdjacentHTML("beforeend", `
      <div class="pla-modal-backdrop">
        <div class="pla-modal">
          <div class="pla-modal-head">
            <div>
              <div class="pla-modal-title">${esc(title)}</div>
              <div class="pla-modal-subtitle">${esc(subtitle || "")}</div>
            </div>
            <button id="plaModalCloseBtn" class="btn2" type="button">Close</button>
          </div>
          <div class="pla-modal-body">${bodyHtml}</div>
          <div class="pla-modal-actions">${actionsHtml}</div>
        </div>
      </div>
    `);

    $("plaModalCloseBtn")?.addEventListener("click", closeModal);
  }

  function openEditModal() {
    const c = state.component;

    modalShell(
      "Edit PLA Component",
      `${c.unique_id} / audited particulars update`,
      `
        <div class="pla-modal-grid">
          <label>
            <span>Equipment / Location</span>
            <select id="editLocation">${locationOptions(c.equipment_location_id)}</select>
          </label>

          <label>
            <span>Storage Location</span>
            <select id="editStorage">${storageOptions(c.storage_location_id)}</select>
          </label>

          <label>
            <span>Certificate No.</span>
            <input id="editCertificate" value="${esc(c.certificate_no || "")}" />
          </label>

          <label>
            <span>Date Rigged</span>
            <input id="editDateRigged" type="date" value="${esc(inputDate(c.date_rigged))}" />
          </label>

          <label>
            <span>Replacement Periodicity (months)</span>
            <input id="editReplacementMonths" type="number" min="0" step="1" value="${esc(c.replacement_periodicity_months ?? "")}" />
          </label>

          <label>
            <span>Replacement Due Date</span>
            <input id="editReplacementDue" type="date" value="${esc(inputDate(c.replacement_due_date))}" />
          </label>

          <label>
            <span>Diameter / Length (mm / m)</span>
            <input id="editDiameterLength" value="${esc(c.diameter_length_text || "")}" />
          </label>

          <label>
            <span>Material</span>
            <input id="editMaterial" value="${esc(c.material || "")}" />
          </label>

          <label>
            <span>Construction</span>
            <input id="editConstruction" value="${esc(c.construction || "")}" />
          </label>

          <label>
            <span>SWL (T / kN)</span>
            <input id="editSWL" value="${esc(c.swl_text || "")}" />
          </label>

          <label>
            <span>Condition</span>
            <select id="editCondition">${conditionOptions(c.condition_id)}</select>
          </label>

          <label>
            <span>Inspection Date</span>
            <input id="editInspectionDate" type="date" value="${esc(inputDate(c.inspection_date))}" />
          </label>

          <label>
            <span>Next Annual Inspection Due</span>
            <input id="editNextInspectionDue" type="date" value="${esc(inputDate(c.next_inspection_due))}" />
          </label>

          <label class="pla-check-row">
            <input id="editFiveYearRequired" type="checkbox" ${c.five_year_test_required ? "checked" : ""} />
            <span>5Y Test Required</span>
          </label>

          <label>
            <span>Last 5Y Test Date</span>
            <input id="editLastFiveYear" type="date" value="${esc(inputDate(c.last_five_year_test_date))}" />
          </label>

          <label>
            <span>Next 5Y Test Due</span>
            <input id="editNextFiveYear" type="date" value="${esc(inputDate(c.next_five_year_test_due))}" />
          </label>

          <label class="pla-modal-wide">
            <span>Remarks</span>
            <textarea id="editRemarks">${esc(c.remarks || "")}</textarea>
          </label>

          <label class="pla-modal-wide">
            <span>Change Reason / Audit Note</span>
            <textarea id="editReason" placeholder="Required."></textarea>
          </label>
        </div>
      `,
      `
        <button id="editCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="editSaveBtn" class="btn" type="button">Save Component</button>
      `
    );

    $("editCancelBtn").addEventListener("click", closeModal);

    $("editSaveBtn").addEventListener("click", async () => {
      try {
        const reason = $("editReason").value.trim();
        if (!reason) throw new Error("Change Reason is required.");

        $("editSaveBtn").disabled = true;
        $("editSaveBtn").textContent = "Saving...";

        await rpc("pla_update_component_particulars", {
          p_component_id: c.id,
          p_storage_location_id: uuidOrNull($("editStorage").value),
          p_equipment_location_id: uuidOrNull($("editLocation").value),
          p_certificate_no: textOrNull($("editCertificate").value),
          p_date_rigged: isoOrNull($("editDateRigged").value),
          p_replacement_periodicity_months: numberOrNull($("editReplacementMonths").value),
          p_replacement_due_date: isoOrNull($("editReplacementDue").value),
          p_diameter_length_text: textOrNull($("editDiameterLength").value),
          p_material: textOrNull($("editMaterial").value),
          p_construction: textOrNull($("editConstruction").value),
          p_swl_text: textOrNull($("editSWL").value),
          p_condition_id: uuidOrNull($("editCondition").value),
          p_inspection_date: isoOrNull($("editInspectionDate").value),
          p_next_inspection_due: isoOrNull($("editNextInspectionDue").value),
          p_five_year_test_required: $("editFiveYearRequired").checked,
          p_last_five_year_test_date: isoOrNull($("editLastFiveYear").value),
          p_next_five_year_test_due: isoOrNull($("editNextFiveYear").value),
          p_remarks: textOrNull($("editRemarks").value),
          p_change_reason: reason
        });

        closeModal();
        await reload();
        showMsg("ok", "PLA component updated.");
      } catch (error) {
        handleError(error);
        $("editSaveBtn").disabled = false;
        $("editSaveBtn").textContent = "Save Component";
      }
    });
  }

  function openInspectionModal(type) {
    const c = state.component;
    const isFive = type === "five_year_test";
    const defaultDate = todayIso();
    const defaultNext = addMonths(defaultDate, isFive ? 60 : 12);

    modalShell(
      isFive ? "Record 5Y Test" : "Record Annual Inspection",
      `${c.unique_id} / ${isFive ? "5-year testing control" : "routine annual inspection"}`,
      `
        <div class="pla-modal-grid">
          <label>
            <span>${isFive ? "5Y Test Date" : "Inspection Date"}</span>
            <input id="inspDate" type="date" value="${esc(defaultDate)}" />
          </label>

          <label>
            <span>${isFive ? "Next 5Y Test Due" : "Next Annual Inspection Due"}</span>
            <input id="inspNextDue" type="date" value="${esc(defaultNext)}" />
          </label>

          <label>
            <span>Inspected / Tested By</span>
            <input id="inspBy" placeholder="Name / rank / company" />
          </label>

          <label>
            <span>Condition</span>
            <select id="inspCondition">${conditionOptions(c.condition_id)}</select>
          </label>

          <label class="pla-check-row">
            <input id="inspCorrective" type="checkbox" />
            <span>Corrective action required</span>
          </label>

          <label class="pla-modal-wide">
            <span>Findings</span>
            <textarea id="inspFindings" class="large" placeholder="Inspection findings / defects / deficiencies, if any."></textarea>
          </label>

          <label class="pla-modal-wide">
            <span>Remarks</span>
            <textarea id="inspRemarks"></textarea>
          </label>
        </div>
      `,
      `
        <button id="inspCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="inspSaveBtn" class="btn" type="button">Save ${isFive ? "5Y Test" : "Inspection"}</button>
      `
    );

    $("inspDate").addEventListener("change", () => {
      $("inspNextDue").value = addMonths($("inspDate").value, isFive ? 60 : 12);
    });

    $("inspCancelBtn").addEventListener("click", closeModal);

    $("inspSaveBtn").addEventListener("click", async () => {
      try {
        if (!$("inspDate").value) throw new Error("Inspection/Test date is required.");

        $("inspSaveBtn").disabled = true;
        $("inspSaveBtn").textContent = "Saving...";

        await rpc("pla_record_component_inspection", {
          p_component_id: c.id,
          p_inspection_type: type,
          p_inspection_date: isoOrNull($("inspDate").value),
          p_inspected_by: textOrNull($("inspBy").value),
          p_condition_id: uuidOrNull($("inspCondition").value),
          p_next_inspection_due: isoOrNull($("inspNextDue").value),
          p_finding_summary: textOrNull($("inspFindings").value),
          p_corrective_action_required: $("inspCorrective").checked,
          p_remarks: textOrNull($("inspRemarks").value)
        });

        closeModal();
        await reload();
        showMsg("ok", isFive ? "5Y test recorded." : "Annual inspection recorded.");
      } catch (error) {
        handleError(error);
        $("inspSaveBtn").disabled = false;
        $("inspSaveBtn").textContent = `Save ${isFive ? "5Y Test" : "Inspection"}`;
      }
    });
  }

  function openEventModal(type) {
    const c = state.component;
    const label = type === "maintenance_repair" ? "Maintenance / Repair" : "Certificate / Condition Update";

    modalShell(
      label,
      `${c.unique_id} / manual action record`,
      `
        <div class="pla-modal-grid">
          <label>
            <span>Action Date</span>
            <input id="evtDate" type="date" value="${esc(todayIso())}" />
          </label>

          <label>
            <span>Performed By</span>
            <input id="evtBy" placeholder="Name / rank / company" />
          </label>

          <label>
            <span>New Condition</span>
            <select id="evtCondition">${conditionOptions(c.condition_id)}</select>
          </label>

          <label>
            <span>Certificate No. / Renewal</span>
            <input id="evtCertificate" value="${esc(c.certificate_no || "")}" />
          </label>

          <label>
            <span>Replacement Due Date</span>
            <input id="evtReplacementDue" type="date" value="${esc(inputDate(c.replacement_due_date))}" />
          </label>

          <label class="pla-modal-wide">
            <span>Remarks / Findings / Work Done</span>
            <textarea id="evtRemarks" class="large"></textarea>
          </label>
        </div>
      `,
      `
        <button id="evtCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="evtSaveBtn" class="btn" type="button">Save Action</button>
      `
    );

    $("evtCancelBtn").addEventListener("click", closeModal);

    $("evtSaveBtn").addEventListener("click", async () => {
      try {
        if (!$("evtDate").value) throw new Error("Action date is required.");

        $("evtSaveBtn").disabled = true;
        $("evtSaveBtn").textContent = "Saving...";

        await rpc("pla_record_component_event", {
          p_component_id: c.id,
          p_event_type: type,
          p_event_date: isoOrNull($("evtDate").value),
          p_performed_by: textOrNull($("evtBy").value),
          p_new_condition_id: uuidOrNull($("evtCondition").value),
          p_certificate_no: textOrNull($("evtCertificate").value),
          p_replacement_due_date: isoOrNull($("evtReplacementDue").value),
          p_remarks: textOrNull($("evtRemarks").value)
        });

        closeModal();
        await reload();
        showMsg("ok", `${label} saved.`);
      } catch (error) {
        handleError(error);
        $("evtSaveBtn").disabled = false;
        $("evtSaveBtn").textContent = "Save Action";
      }
    });
  }

  function openTransferModal() {
    const c = state.component;

    modalShell(
      "Transfer Component Location",
      `${c.unique_id} / location and storage transfer`,
      `
        <div class="pla-modal-grid">
          <label>
            <span>Transfer Date</span>
            <input id="trDate" type="date" value="${esc(todayIso())}" />
          </label>

          <label>
            <span>Performed By</span>
            <input id="trBy" placeholder="Name / rank / company" />
          </label>

          <label>
            <span>New Equipment / Location</span>
            <select id="trLocation">${locationOptions(c.equipment_location_id)}</select>
          </label>

          <label>
            <span>New Storage Location</span>
            <select id="trStorage">${storageOptions(c.storage_location_id)}</select>
          </label>

          <label class="pla-modal-wide">
            <span>Reason / Remarks</span>
            <textarea id="trReason" class="large"></textarea>
          </label>
        </div>
      `,
      `
        <button id="trCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="trSaveBtn" class="btn" type="button">Save Transfer</button>
      `
    );

    $("trCancelBtn").addEventListener("click", closeModal);

    $("trSaveBtn").addEventListener("click", async () => {
      try {
        if (!$("trDate").value) throw new Error("Transfer date is required.");
        if (!$("trLocation").value) throw new Error("New equipment/location is required.");

        $("trSaveBtn").disabled = true;
        $("trSaveBtn").textContent = "Saving...";

        await rpc("pla_transfer_component_location", {
          p_component_id: c.id,
          p_equipment_location_id: uuidOrNull($("trLocation").value),
          p_storage_location_id: uuidOrNull($("trStorage").value),
          p_event_date: isoOrNull($("trDate").value),
          p_performed_by: textOrNull($("trBy").value),
          p_reason: textOrNull($("trReason").value)
        });

        closeModal();
        await reload();
        showMsg("ok", "Component location transfer saved.");
      } catch (error) {
        handleError(error);
        $("trSaveBtn").disabled = false;
        $("trSaveBtn").textContent = "Save Transfer";
      }
    });
  }

  function openDiscardModal() {
    const c = state.component;

    modalShell(
      "Discard Component",
      `${c.unique_id} / soft-discard with audit trail`,
      `
        <div class="pla-modal-grid">
          <label>
            <span>Discard Date</span>
            <input id="discardDate" type="date" value="${esc(todayIso())}" />
          </label>

          <label>
            <span>Performed By</span>
            <input id="discardBy" placeholder="Name / rank / company" />
          </label>

          <label class="pla-modal-wide">
            <span>Discard Reason</span>
            <textarea id="discardReason" class="large" placeholder="Required."></textarea>
          </label>
        </div>
      `,
      `
        <button id="discardCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="discardSaveBtn" class="btn" type="button">Discard Component</button>
      `
    );

    $("discardCancelBtn").addEventListener("click", closeModal);

    $("discardSaveBtn").addEventListener("click", async () => {
      try {
        const reason = $("discardReason").value.trim();
        if (!reason) throw new Error("Discard reason is required.");

        $("discardSaveBtn").disabled = true;
        $("discardSaveBtn").textContent = "Discarding...";

        await rpc("pla_discard_component", {
          p_component_id: c.id,
          p_discard_date: isoOrNull($("discardDate").value),
          p_discard_reason: reason,
          p_performed_by: textOrNull($("discardBy").value)
        });

        closeModal();
        await reload();
        showMsg("ok", "Component discarded.");
      } catch (error) {
        handleError(error);
        $("discardSaveBtn").disabled = false;
        $("discardSaveBtn").textContent = "Discard Component";
      }
    });
  }

  function openRawSnapshotModal() {
    const c = state.component;
    const keys = Object.keys(c || {}).sort();

    modalShell(
      "Advanced Data Snapshot",
      "Super Admin diagnostic view only.",
      `
        <table class="raw-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${keys.map((key) => `
              <tr>
                <td><strong>${esc(key)}</strong></td>
                <td>${esc(value(typeof c[key] === "object" ? JSON.stringify(c[key]) : c[key]))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `,
      `<button id="rawCloseBtn" class="btn2" type="button">Close</button>`
    );

    $("rawCloseBtn").addEventListener("click", closeModal);
  }

  async function reload() {
    showMsg("warn", "");
    showMsg("ok", "");

    await loadComponent();

    if (!state.component) {
      renderComponent();
      return;
    }

    await loadPermissions();

    if (!state.canView) {
      throw new Error("You do not have permission to view this PLA component.");
    }

    await loadSetupData();
    await loadHistory();

    renderComponent();

    showMsg("ok", "PLA component detail loaded.");
  }

  function handleError(error) {
    console.error(error);
    showMsg("warn", String(error?.message || error || "Unknown error"));
  }

  function bindEvents() {
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));
  }

  async function init() {
    window.CSVB_PLA_COMPONENT_DETAIL_BUILD = BUILD;

    cacheDom();

    state.componentId = getComponentId();
    state.sb = window.AUTH.ensureSupabase();

    const bundle = await window.AUTH.setupAuthButtons({
      badgeId: "userBadge",
      loginBtnId: "loginBtn",
      logoutBtnId: "logoutBtn",
      switchBtnId: "switchUserBtn"
    });

    if (!bundle?.session?.user) {
      showMsg("warn", "You are logged out. Please login.");
      return;
    }

    state.profile = bundle.profile || {};

    bindEvents();

    await reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();
