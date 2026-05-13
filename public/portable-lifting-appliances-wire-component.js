/* public/portable-lifting-appliances-wire-component.js */
/* C.S.V. BEACON – PLA-06 Component Detail Page */

(() => {
  "use strict";

  const BUILD = "PLA-COMPONENT-DETAIL-06-20260513-1";

  const state = {
    sb: null,
    profile: null,
    componentId: "",
    component: null
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

  function getComponentId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function value(value) {
    if (value === true) return "Yes";
    if (value === false) return "No";
    if (value === null || value === undefined || value === "") return "—";
    return String(value);
  }

  function asDate(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function asDateTime(value) {
    if (!value) return "—";
    return String(value).replace("T", " ").slice(0, 19);
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

  function renderHeader(c) {
    el.detailTitle.textContent = c.unique_id || "PLA Component Detail";

    const subtitleParts = [
      c.vessel_name,
      c.section_code ? `${c.section_code} — ${c.section_name || ""}` : "",
      c.component_type_code ? `${c.component_type_code} — ${c.component_type_name || ""}` : ""
    ].filter(Boolean);

    el.detailSubtitle.textContent = subtitleParts.join(" / ") || "Portable Lifting Appliances & Wires component.";

    const status = c.status || c.component_status || "—";
    const lock = c.particulars_lock_status || "unlocked";

    el.statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Status</div>
        <div class="stat-value">${esc(status)}</div>
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
        <div class="stat-value">${esc(lock)}</div>
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
        ${field("Next Inspection Due", asDate(c.next_inspection_due))}
        ${field("Last 5Y Test Date", asDate(c.last_five_year_test_date))}
        ${field("Next 5Y Test Due", asDate(c.next_five_year_test_due))}
      </div>
    `;
  }

  function renderGovernance(c) {
    renderGrid(el.governanceParticulars, [
      field("Particulars Lock Status", c.particulars_lock_status),
      field("Mapping / Source Status", c.mapping_source || c.source_status),
      field("Remarks", c.remarks),
      field("Created At", asDateTime(c.created_at)),
      field("Updated At", asDateTime(c.updated_at)),
      field("Record ID", c.id)
    ]);
  }

  function renderRaw(c) {
    const skip = new Set([""]);
    const keys = Object.keys(c || {}).filter((k) => !skip.has(k)).sort();

    if (!keys.length) {
      el.rawSnapshot.innerHTML = `<div class="empty">No data fields found.</div>`;
      return;
    }

    el.rawSnapshot.innerHTML = `
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
    `;
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
    renderMain(c);
    renderTechnical(c);
    renderLifecycle(c);
    renderGovernance(c);
    renderRaw(c);
  }

  async function loadComponent() {
    if (!state.componentId) {
      throw new Error("Missing component id in URL.");
    }

    const { data, error } = await state.sb
      .from("pla_v_components_list")
      .select("*")
      .eq("id", state.componentId)
      .maybeSingle();

    if (error) throw error;

    state.component = data || null;
  }

  async function reload() {
    showMsg("warn", "");
    showMsg("ok", "");

    await loadComponent();
    renderComponent();

    if (state.component) {
      showMsg("ok", "PLA component detail loaded.");
    }
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
