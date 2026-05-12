/* public/portable-lifting-appliances-wires.js */
/* C.S.V. BEACON – PLA-04 Inventory List Page */

(() => {
  "use strict";

  const BUILD = "PLA-INVENTORY-LIST-05B-MULTIFILTER-REGISTER";

  const state = {
    sb: null,
    profile: null,
    canView: false,
    canEdit: false,
    canExport: false,
    canAdmin: false,

    components: [],
    vessels: [],
    sections: [],
    categories: [],
    types: [],
    conditions: [],

    filtered: []
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn", "exportBtn", "registerBtn",
      "viewerMode", "viewerHint",
      "statTotal", "statReplacementDue", "statInspectionDue", "statFiveYearDue", "statMissingCert", "statLocked",
      "filterVessel", "filterSection", "filterCategory", "filterType", "filterStatus", "searchInput", "clearFiltersBtn",
      "tableMeta", "componentsTbody"
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

  function norm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function toast(type, message) {
    const box = type === "ok" ? el.okBox : el.warnBox;
    if (!box) {
      if (message) alert(message);
      return;
    }

    box.textContent = message || "";
    box.style.display = message ? "block" : "none";

    if (message && type === "ok") {
      window.setTimeout(() => {
        box.textContent = "";
        box.style.display = "none";
      }, 2800);
    }
  }

  function asDate(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function isDueStatus(value) {
    return ["due_soon", "overdue"].includes(String(value || ""));
  }

  function dueClass(value) {
    if (value === "overdue") return "pill-danger";
    if (value === "due_soon") return "pill-warn";
    if (value === "condition_based") return "pill-muted";
    if (value === "maker_based") return "pill-muted";
    if (value === "not_recorded") return "pill-warn";
    if (value === "not_applicable") return "pill-muted";
    return "pill-ok";
  }

  function statusLabel(value) {
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

    return map[value] || String(value || "—").replaceAll("_", " ");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadPermissions() {
    state.canView = await rpc("pla_current_user_can", {
      p_action: "view",
      p_company_id: null,
      p_vessel_id: null
    });

    state.canEdit = await rpc("pla_current_user_can", {
      p_action: "edit",
      p_company_id: null,
      p_vessel_id: null
    });

    state.canExport = await rpc("pla_current_user_can", {
      p_action: "export",
      p_company_id: null,
      p_vessel_id: null
    });

    state.canAdmin = await rpc("pla_current_user_can", {
      p_action: "admin",
      p_company_id: null,
      p_vessel_id: null
    });
  }

  async function loadBaseData() {
    const [
      componentsRes,
      vesselsRes,
      sectionsRes,
      categoriesRes,
      typesRes,
      conditionsRes
    ] = await Promise.all([
      state.sb.from("pla_v_components_list").select("*").order("updated_at", { ascending: false }),
      state.sb.from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true).order("name"),
      state.sb.from("pla_sections").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_equipment_categories").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_component_types").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_condition_options").select("*").eq("is_active", true).order("sort_order")
    ]);

    for (const res of [componentsRes, vesselsRes, sectionsRes, categoriesRes, typesRes, conditionsRes]) {
      if (res.error) throw res.error;
    }

    state.components = componentsRes.data || [];
    state.vessels = vesselsRes.data || [];
    state.sections = sectionsRes.data || [];
    state.categories = categoriesRes.data || [];
    state.types = typesRes.data || [];
    state.conditions = conditionsRes.data || [];

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      state.vessels = state.vessels.filter((v) => String(v.id) === String(state.profile.vessel_id));
    }
  }


  function selectedMultiValues(id) {
    const select = $(id);
    if (!select) return new Set();

    return new Set(
      Array.from(select.selectedOptions || [])
        .map((o) => String(o.value || ""))
        .filter(Boolean)
    );
  }

  function selectAllOptions(select) {
    Array.from(select.options || []).forEach((option) => {
      if (option.value) option.selected = true;
    });
  }

  function clearMultiSelect(select) {
    Array.from(select.options || []).forEach((option) => {
      option.selected = false;
    });
  }

  function option(value, label, selected = "") {
    const sel = String(value) === String(selected) ? " selected" : "";
    return `<option value="${esc(value)}"${sel}>${esc(label)}</option>`;
  }

  function renderFilters() {
    const currentVessels = selectedMultiValues("filterVessel");
    const currentSections = selectedMultiValues("filterSection");
    const currentCategories = selectedMultiValues("filterCategory");
    const currentTypes = selectedMultiValues("filterType");

    el.filterVessel.innerHTML =
      `<option value="">All vessels</option>` +
      state.vessels.map((v) => {
        const label = `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}`;
        return option(v.id, label, currentVessels.has(String(v.id)) ? v.id : "");
      }).join("");

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      Array.from(el.filterVessel.options || []).forEach((option) => {
        option.selected = String(option.value) === String(state.profile.vessel_id);
      });
      el.filterVessel.disabled = true;
    }

    el.filterSection.innerHTML =
      state.sections.map((section) => option(section.id, `${section.section_code} — ${section.section_name}`, currentSections.has(String(section.id)) ? section.id : "")).join("");

    el.filterCategory.innerHTML =
      state.categories.map((cat) => option(cat.id, cat.category_name || cat.category_code, currentCategories.has(String(cat.id)) ? cat.id : "")).join("");

    el.filterType.innerHTML =
      state.types.map((type) => option(type.id, `${type.component_type_code} — ${type.component_type_name}`, currentTypes.has(String(type.id)) ? type.id : "")).join("");
  }

  function renderViewerMode() {
    const p = state.profile || {};
    const role = p.role || "unknown";

    if (role === "vessel") {
      el.viewerMode.textContent = `Onboard Personnel / ${p.position || "Rank not set"}`;
      el.viewerHint.textContent = "Vessel users see records according to vessel assignment and rank-based PLA permissions.";
      return;
    }

    if (["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role)) {
      el.viewerMode.textContent = "Office / Platform Viewer";
      el.viewerHint.textContent = "Office users see records according to company and role permissions.";
      return;
    }

    el.viewerMode.textContent = `Role: ${role}`;
    el.viewerHint.textContent = "Access is controlled by module permissions.";
  }

  function filteredComponents() {
    const vesselIds = selectedMultiValues("filterVessel");
    const sectionIds = selectedMultiValues("filterSection");
    const categoryIds = selectedMultiValues("filterCategory");
    const typeIds = selectedMultiValues("filterType");
    const status = el.filterStatus.value || "";
    const q = norm(el.searchInput.value);

    return state.components.filter((c) => {
      if (vesselIds.size && !vesselIds.has(String(c.vessel_id))) return false;
      if (sectionIds.size && !sectionIds.has(String(c.section_id))) return false;
      if (categoryIds.size && !categoryIds.has(String(c.equipment_category_id))) return false;
      if (typeIds.size && !typeIds.has(String(c.component_type_id))) return false;

      if (status === "replacement_due" && !isDueStatus(c.calculated_replacement_due_status)) return false;
      if (status === "inspection_due" && !isDueStatus(c.calculated_inspection_due_status)) return false;
      if (status === "five_year_due" && !isDueStatus(c.calculated_five_year_test_status)) return false;
      if (status === "missing_certificate" && c.certificate_missing !== true) return false;
      if (status === "locked" && c.particulars_lock_status !== "locked") return false;
      if (status === "unlocked" && c.particulars_lock_status === "locked") return false;

      if (q) {
        const haystack = [
          c.unique_id,
          c.company_name,
          c.vessel_name,
          c.section_code,
          c.section_name,
          c.category_code,
          c.category_name,
          c.location_code,
          c.location_name,
          c.storage_label,
          c.component_type_code,
          c.component_type_name,
          c.certificate_no,
          c.condition_label,
          c.remarks
        ].map(norm).join(" | ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }

  function renderStats() {
    const rows = state.filtered;

    el.statTotal.textContent = String(rows.length);

    el.statReplacementDue.textContent = String(
      rows.filter((c) => isDueStatus(c.calculated_replacement_due_status)).length
    );

    el.statInspectionDue.textContent = String(
      rows.filter((c) => isDueStatus(c.calculated_inspection_due_status)).length
    );

    el.statFiveYearDue.textContent = String(
      rows.filter((c) => isDueStatus(c.calculated_five_year_test_status)).length
    );

    el.statMissingCert.textContent = String(
      rows.filter((c) => c.certificate_missing === true).length
    );

    el.statLocked.textContent = String(
      rows.filter((c) => c.particulars_lock_status === "locked").length
    );
  }

  function renderTable() {
    const rows = state.filtered;

    el.tableMeta.textContent = `${rows.length} record(s) shown from ${state.components.length} accessible record(s).`;

    if (!rows.length) {
      el.componentsTbody.innerHTML =
        `<tr><td colspan="12" class="empty-cell">No PLA records found for current filters.</td></tr>`;
      return;
    }

    el.componentsTbody.innerHTML = rows.map((c) => {
      const rep = c.calculated_replacement_due_status || "not_recorded";
      const insp = c.calculated_inspection_due_status || "not_recorded";
      const five = c.calculated_five_year_test_status || "not_applicable";

      const detailHref = `./portable-lifting-appliances-wire-component.html?id=${encodeURIComponent(c.id)}`;

      return `
        <tr>
          <td>
            <div class="id-strong">${esc(c.unique_id)}</div>
            <div class="mini">Seq: ${esc(c.sequence_number || "—")}</div>
          </td>

          <td>
            <strong>${esc(c.vessel_name || "—")}</strong>
            <div class="mini">Hull: ${esc(c.hull_number || "—")}</div>
          </td>

          <td>
            <strong>${esc(c.section_code || "—")}</strong>
            <div class="mini">${esc(c.section_name || "—")}</div>
          </td>

          <td>
            <strong>${esc(c.category_name || "—")}</strong>
            <div class="mini">${esc(c.location_code || "—")} / ${esc(c.location_name || "—")}</div>
            ${c.storage_label ? `<div class="mini">Storage: ${esc(c.storage_label)}</div>` : ""}
          </td>

          <td>
            <strong>${esc(c.component_type_code || "—")}</strong>
            <div class="mini">${esc(c.component_type_name || "—")}</div>
          </td>

          <td>
            ${c.certificate_missing ? `<span class="pill pill-danger">Missing</span>` : `<strong>${esc(c.certificate_no || "—")}</strong>`}
          </td>

          <td>
            <span class="pill ${Number(c.severity_level || 0) >= 4 ? "pill-danger" : Number(c.severity_level || 0) >= 3 ? "pill-warn" : "pill-ok"}">
              ${esc(c.condition_label || "Not recorded")}
            </span>
          </td>

          <td>
            <span class="pill ${dueClass(rep)}">${esc(statusLabel(rep))}</span>
            <div class="mini">Due: ${esc(asDate(c.replacement_due_date))}</div>
            <div class="mini">Period: ${esc(c.replacement_periodicity_months ?? "—")} months</div>
          </td>

          <td>
            <span class="pill ${dueClass(insp)}">${esc(statusLabel(insp))}</span>
            <div class="mini">Last: ${esc(asDate(c.inspection_date))}</div>
            <div class="mini">Next: ${esc(asDate(c.next_inspection_due))}</div>
          </td>

          <td>
            <span class="pill ${dueClass(five)}">${esc(statusLabel(five))}</span>
            <div class="mini">Last: ${esc(asDate(c.last_five_year_test_date))}</div>
            <div class="mini">Next: ${esc(asDate(c.next_five_year_test_due))}</div>
          </td>

          <td>
            <span class="pill ${c.particulars_lock_status === "locked" ? "pill-muted" : "pill-warn"}">
              ${esc(c.particulars_lock_status || "unlocked")}
            </span>
          </td>

          <td>
            <button class="btn2 btnSmall" type="button" data-pla-detail="${esc(detailHref)}">Open</button>
          </td>
        </tr>
      `;
    }).join("");

    el.componentsTbody.querySelectorAll("[data-pla-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        toast("warn", "PLA component detail page will be built in PLA-06.");
      });
    });
  }

  function renderAll() {
    state.filtered = filteredComponents();
    renderStats();
    renderTable();

    el.registerBtn.style.display = state.canEdit ? "" : "none";
    el.exportBtn.style.display = state.canExport || state.canEdit ? "" : "none";
  }

  function clearFilters() {
    if (!(state.profile?.role === "vessel" && state.profile?.vessel_id)) {
      clearMultiSelect(el.filterVessel);
    }

    clearMultiSelect(el.filterSection);
    clearMultiSelect(el.filterCategory);
    clearMultiSelect(el.filterType);
    el.filterStatus.value = "";
    el.searchInput.value = "";

    renderAll();
  }

  function csvCell(value) {
    const s = String(value ?? "");
    return `"${s.replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const rows = state.filtered;

    const headers = [
      "Unique ID",
      "Vessel",
      "Section",
      "Category",
      "Location",
      "Storage",
      "Component Type",
      "Certificate No",
      "Condition",
      "Replacement Due",
      "Replacement Status",
      "Inspection Date",
      "Next Inspection Due",
      "5Y Test Required",
      "Next 5Y Test Due",
      "5Y Status",
      "Particulars Lock",
      "Remarks"
    ];

    const lines = [headers.map(csvCell).join(",")];

    rows.forEach((c) => {
      lines.push([
        c.unique_id,
        c.vessel_name,
        `${c.section_code || ""} ${c.section_name || ""}`,
        c.category_name,
        `${c.location_code || ""} ${c.location_name || ""}`,
        c.storage_label,
        `${c.component_type_code || ""} ${c.component_type_name || ""}`,
        c.certificate_no,
        c.condition_label,
        c.replacement_due_date,
        c.calculated_replacement_due_status,
        c.inspection_date,
        c.next_inspection_due,
        c.five_year_test_required ? "Yes" : "No",
        c.next_five_year_test_due,
        c.calculated_five_year_test_status,
        c.particulars_lock_status,
        c.remarks
      ].map(csvCell).join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `pla_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));
    el.exportBtn.addEventListener("click", exportCsv);

    [
      el.filterVessel,
      el.filterSection,
      el.filterCategory,
      el.filterType,
      el.filterStatus
    ].forEach((input) => {
      input.addEventListener("change", renderAll);
    });

    el.searchInput.addEventListener("input", renderAll);
    el.clearFiltersBtn.addEventListener("click", clearFilters);
  }

  async function reload() {
    toast("warn", "");
    toast("ok", "");

    await loadPermissions();

    if (!state.canView) {
      toast("warn", "You do not have permission to view Portable Lifting Appliances & Wires.");
      return;
    }

    await loadBaseData();

    renderViewerMode();
    renderFilters();
    renderAll();

    toast("ok", "Portable Lifting Appliances & Wires inventory loaded.");
  }

  function handleError(error) {
    console.error(error);
    toast("warn", String(error?.message || error || "Unknown error"));
  }

  async function init() {
    window.CSVB_PLA_INVENTORY_BUILD = BUILD;

    cacheDom();

    state.sb = window.AUTH.ensureSupabase();

    const bundle = await window.AUTH.setupAuthButtons({
      badgeId: "userBadge",
      loginBtnId: "loginBtn",
      logoutBtnId: "logoutBtn",
      switchBtnId: "switchUserBtn"
    });

    if (!bundle?.session?.user) {
      toast("warn", "You are logged out. Please login.");
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
