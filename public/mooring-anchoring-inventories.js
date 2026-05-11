// public/mooring-anchoring-inventories.js
// C.S.V. BEACON – Mooring and Anchoring Inventories
// v3: lifecycle status, usage hours, lifecycle events, spare minimums, MSMP checklist inspection workflow

(() => {
  "use strict";

  const BUILD = "MAI-FE-20260511-3";
  const MODULE_KEY = "mooring_anchoring_inventories";

  const state = {
    sb: null,
    bundle: null,
    profile: null,
    isPlatform: false,
    moduleAllowed: false,

    companies: [],
    vessels: [],
    componentTypes: [],
    statusOptions: [],
    locationOptions: [],
    inspectionTypes: [],

    components: [],
    lifecycleRows: [],
    usageSummaryRows: [],
    spareStatusRows: [],

    selectedComponent: null,
    selectedEffectiveFields: [],
    selectedFieldValues: {},
    selectedUsageRows: [],
    selectedLifecycleEvents: [],

    selectedTemplates: [],
    selectedChecklistRuns: [],
    activeChecklistRun: null,
    activeChecklistItems: [],
    activeChecklistAnswers: []
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox",
      "reloadBtn", "spareStatusBtn", "newComponentBtn", "clearFiltersBtn",
      "companyFilter", "vesselFilter", "typeFilter", "statusFilter", "searchInput",
      "statTotal", "statActive", "statDue", "statRetired",
      "listMeta", "componentsTbody",

      "registerPanel", "closeRegisterBtn", "registerForm",
      "registerVessel", "registerType", "registerOrderNumber", "registerStatus",
      "registerLocationMode", "registerFittedWrap", "registerFittedPosition",
      "registerStorageWrap", "registerStorageLocation", "registerNotes",
      "registerDynamicFields", "submitRegisterBtn", "resetRegisterBtn",

      "detailPanel", "detailTitle", "detailSubtitle", "identityBox",
      "lifecycleOverviewBox", "lifecycleStatusTbody",
      "closeDetailBtn", "saveFieldsBtn", "detailDynamicFields",

      "checklistTemplateSelect", "checklistInspectionDate", "checklistInspectedBy",
      "checklistRunSelect", "checklistRemarks", "startChecklistBtn",
      "loadChecklistRunBtn", "reloadChecklistRunsBtn", "checklistRunSummary",
      "checklistWorkArea", "checklistItemsTbody", "checklistFinalDecision",
      "checklistFinalRemarks", "saveChecklistAnswersBtn", "completeChecklistRunBtn",
      "checklistRunsHistory",

      "usageOperationDate", "usageOperationType", "usagePort", "usageBerth",
      "usageHours", "usageUnusualEvent", "usageRequiresInspection",
      "usageEventDescription", "usageRemarks", "recordUsageBtn", "usageHistory",

      "lifecycleEventType", "lifecycleEventDate", "lifecyclePerformedBy",
      "lifecycleRemarks", "recordLifecycleEventBtn", "lifecycleEventHistory",

      "moveLocationMode", "moveFittedWrap", "moveFittedPosition",
      "moveStorageWrap", "moveStorageLocation", "moveRemarks", "applyMoveBtn",
      "movementHistory",

      "inspectionType", "inspectionDate", "inspectionResult", "inspectionBy",
      "inspectionRemarks", "recordInspectionBtn", "inspectionHistory",

      "attachmentsBox",

      "sparePanel", "closeSpareBtn", "spareStatusTbody"
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

  function showBox(box, message) {
    if (!box) return;
    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
  }

  function showWarn(message) {
    showBox(el.warnBox, message);
  }

  function showOk(message) {
    showBox(el.okBox, message);
    if (message) {
      window.setTimeout(() => showBox(el.okBox, ""), 4500);
    }
  }

  function clearMessages() {
    showWarn("");
    showOk("");
  }

  function handleError(error) {
    console.error("MAI error:", error);
    showWarn(String(error?.message || error || "Unknown error"));
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function asDateText(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function asNumber(value, decimals = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  }

  function daysBetweenToday(dateText) {
    if (!dateText) return null;
    const due = new Date(String(dateText).slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(due.getTime())) return null;
    const now = new Date(todayIso() + "T00:00:00Z");
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  }

  function dueLabel(dateText) {
    if (!dateText) return "—";
    const days = daysBetweenToday(dateText);
    const base = asDateText(dateText);
    if (days === null) return base;
    if (days < 0) return `${base} / overdue ${Math.abs(days)}d`;
    if (days === 0) return `${base} / due today`;
    return `${base} / ${days}d`;
  }

  function roleIsPlatform(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function optionHtml(value, label, selectedValue = "") {
    const selected = String(value) === String(selectedValue) ? " selected" : "";
    return `<option value="${esc(value)}"${selected}>${esc(label)}</option>`;
  }

  function normalizeOptions(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function selectRows(table, columns = "*") {
    const { data, error } = await state.sb.from(table).select(columns);
    if (error) throw error;
    return data || [];
  }

  function getCompanyName(companyId) {
    const c = state.companies.find((x) => x.id === companyId);
    return c?.company_name || c?.short_name || c?.company_code || companyId || "";
  }

  function getVessel(vesselId) {
    return state.vessels.find((x) => x.id === vesselId) || null;
  }

  function getStatusLabel(statusKey) {
    const s = state.statusOptions.find((x) => x.status_key === statusKey);
    return s?.status_label || statusKey || "—";
  }

  function isTerminalStatus(statusKey) {
    const row = state.statusOptions.find((x) => x.status_key === statusKey);
    return row?.is_terminal === true;
  }

  function statusClass(statusKey) {
    if (isTerminalStatus(statusKey)) return "status-terminal";
    if (["under_inspection", "repair_required", "removed_from_service"].includes(statusKey)) {
      return "status-attention";
    }
    return "";
  }

  function lifecyclePriority(status) {
    const s = String(status || "");
    if (s === "retire_now") return 60;
    if (s === "overdue") return 50;
    if (s === "action_required") return 45;
    if (s === "due_soon") return 40;
    if (s === "ok") return 20;
    if (s === "event_based") return 10;
    if (s === "completed") return 0;
    return 5;
  }

  function lifecycleClass(status) {
    const s = String(status || "").replaceAll("_", "-");
    return `lifecycle-${s}`;
  }

  function lifecycleLabel(status) {
    const map = {
      ok: "OK",
      due_soon: "Due Soon",
      overdue: "Overdue",
      retire_now: "Retire Now",
      action_required: "Action Required",
      completed: "Completed",
      event_based: "Event Based"
    };
    return map[status] || String(status || "—").replaceAll("_", " ");
  }

  function runStatusClass(status) {
    return `run-${String(status || "draft").replaceAll("_", "-")}`;
  }

  function runStatusLabel(status) {
    const map = {
      draft: "Draft",
      completed: "Completed",
      voided: "Voided"
    };
    return map[status] || String(status || "—");
  }

  function lifecycleRowsForComponent(componentId) {
    return state.lifecycleRows
      .filter((r) => r.component_id === componentId)
      .sort((a, b) => {
        const p = lifecyclePriority(b.lifecycle_status) - lifecyclePriority(a.lifecycle_status);
        if (p !== 0) return p;
        return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      });
  }

  function usageSummaryForComponent(componentId) {
    return state.usageSummaryRows.find((r) => r.component_id === componentId) || null;
  }

  function worstLifecycleForComponent(componentId) {
    const rows = lifecycleRowsForComponent(componentId);
    if (!rows.length) return null;
    return rows[0];
  }

  function nextLifecycleActionForComponent(componentId) {
    const rows = lifecycleRowsForComponent(componentId);

    const actionable = rows.find((r) =>
      ["retire_now", "overdue", "action_required", "due_soon"].includes(r.lifecycle_status)
    );

    if (actionable) return actionable;

    const future = rows
      .filter((r) => r.due_date || r.hours_remaining !== null)
      .sort((a, b) => {
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return Number(a.hours_remaining ?? 999999999) - Number(b.hours_remaining ?? 999999999);
      })[0];

    return future || rows[0] || null;
  }

  function bindEvents() {
    el.reloadBtn?.addEventListener("click", () => reloadAll().catch(handleError));
    el.spareStatusBtn?.addEventListener("click", () => openSparePanel());
    el.closeSpareBtn?.addEventListener("click", () => closeSparePanel());

    el.newComponentBtn?.addEventListener("click", () => openRegisterPanel());
    el.closeRegisterBtn?.addEventListener("click", () => closeRegisterPanel());
    el.clearFiltersBtn?.addEventListener("click", clearFilters);

    el.companyFilter?.addEventListener("change", () => {
      fillVesselFilter();
      renderComponents();
    });

    [el.vesselFilter, el.typeFilter, el.statusFilter, el.searchInput].forEach((input) => {
      input?.addEventListener("input", renderComponents);
      input?.addEventListener("change", renderComponents);
    });

    el.registerVessel?.addEventListener("change", () => onRegisterContextChanged().catch(handleError));
    el.registerType?.addEventListener("change", () => onRegisterContextChanged().catch(handleError));
    el.registerLocationMode?.addEventListener("change", () => updateRegisterLocationUi());

    el.registerForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      registerComponent().catch(handleError);
    });

    el.resetRegisterBtn?.addEventListener("click", () => resetRegisterForm());

    el.closeDetailBtn?.addEventListener("click", closeDetailPanel);
    el.saveFieldsBtn?.addEventListener("click", () => saveSelectedFields().catch(handleError));

    el.startChecklistBtn?.addEventListener("click", () => startChecklistRun().catch(handleError));
    el.loadChecklistRunBtn?.addEventListener("click", () => loadSelectedChecklistRun().catch(handleError));
    el.reloadChecklistRunsBtn?.addEventListener("click", () => reloadChecklistArea().catch(handleError));
    el.saveChecklistAnswersBtn?.addEventListener("click", () => saveChecklistAnswers().catch(handleError));
    el.completeChecklistRunBtn?.addEventListener("click", () => completeChecklistRun().catch(handleError));

    el.recordUsageBtn?.addEventListener("click", () => recordUsage().catch(handleError));
    el.recordLifecycleEventBtn?.addEventListener("click", () => recordLifecycleEvent().catch(handleError));

    el.moveLocationMode?.addEventListener("change", () => updateMoveLocationUi());
    el.applyMoveBtn?.addEventListener("click", () => applyLocationChange().catch(handleError));

    el.recordInspectionBtn?.addEventListener("click", () => recordInspection().catch(handleError));
  }

  async function checkModuleEnabled() {
    if (state.isPlatform) {
      state.moduleAllowed = true;
      return true;
    }

    const data = await rpc("csvb_my_company_modules");
    const allowed = (data || []).some((m) => m.module_key === MODULE_KEY && m.is_enabled === true);
    state.moduleAllowed = allowed;

    if (!allowed) {
      showWarn("This module is not enabled for your company yet.");
    }

    return allowed;
  }

  async function loadCompanies() {
    if (state.isPlatform) {
      try {
        const data = await rpc("csvb_admin_list_companies");
        state.companies = (data || []).filter((c) => c.is_active !== false);
        return;
      } catch (_) {}
    }

    try {
      const rows = await selectRows("companies", "id, company_name, short_name, company_code, is_active");
      state.companies = rows.filter((c) => c.is_active !== false);
    } catch (_) {
      const profileCompany = state.profile?.company;
      state.companies = profileCompany ? [profileCompany] : [];
    }
  }

  async function loadVessels() {
    let query = state.sb
      .from("vessels")
      .select("id, name, hull_number, imo_number, company_id, is_active")
      .order("name", { ascending: true });

    if (!state.isPlatform && state.profile?.company_id) {
      query = query.eq("company_id", state.profile.company_id);
    }

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      query = query.eq("id", state.profile.vessel_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    state.vessels = (data || []).filter((v) => v.is_active !== false);
  }

  async function loadComponentTypes() {
    const { data, error } = await state.sb
      .from("mai_component_types")
      .select("id, company_id, code, name, category, description, is_system, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    state.componentTypes = data || [];
  }

  async function loadStatusOptions() {
    const { data, error } = await state.sb
      .from("mai_status_options")
      .select("id, company_id, status_key, status_label, status_group, is_terminal, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    state.statusOptions = data || [];
  }

  async function loadLocationOptions() {
    const { data, error } = await state.sb
      .from("mai_location_options")
      .select("id, company_id, vessel_id, component_type_id, location_mode, location_key, location_label, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    state.locationOptions = data || [];
  }

  async function loadInspectionTypes() {
    const { data, error } = await state.sb
      .from("mai_inspection_type_definitions")
      .select("id, company_id, component_type_id, inspection_type_key, inspection_type_label, default_interval_months, requires_next_due, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;
    state.inspectionTypes = data || [];
  }

  async function loadComponents() {
    const { data, error } = await state.sb
      .from("mai_v_components_list")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(2000);

    if (error) throw error;
    state.components = data || [];
  }

  async function loadLifecycleStatus() {
    const { data, error } = await state.sb
      .from("mai_v_component_lifecycle_status")
      .select("*")
      .order("unique_id", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) throw error;
    state.lifecycleRows = data || [];
  }

  async function loadUsageSummary() {
    const { data, error } = await state.sb
      .from("mai_v_component_usage_summary")
      .select("*");

    if (error) throw error;
    state.usageSummaryRows = data || [];
  }

  async function loadSpareStatus() {
    const { data, error } = await state.sb
      .from("mai_v_spare_minimum_status")
      .select("*")
      .order("company_name", { ascending: true })
      .order("vessel_name", { ascending: true })
      .order("component_type_code", { ascending: true });

    if (error) throw error;
    state.spareStatusRows = data || [];
  }

  function visibleVesselsForCompany(companyId = "") {
    return state.vessels.filter((v) => !companyId || v.company_id === companyId);
  }

  function componentTypesForCompany(companyId = "") {
    return state.componentTypes.filter((t) => !t.company_id || !companyId || t.company_id === companyId);
  }

  function fillStaticSelects() {
    const companyOptions = [optionHtml("", "All visible companies")].concat(
      state.companies.map((c) => optionHtml(c.id, c.company_name || c.short_name || c.company_code || c.id))
    );

    el.companyFilter.innerHTML = companyOptions.join("");

    if (!state.isPlatform && state.profile?.company_id) {
      el.companyFilter.value = state.profile.company_id;
      el.companyFilter.disabled = true;
    }

    fillVesselFilter();

    el.typeFilter.innerHTML = [optionHtml("", "All component types")]
      .concat(state.componentTypes.map((t) => optionHtml(t.id, `${t.code} — ${t.name}`)))
      .join("");

    el.statusFilter.innerHTML = [optionHtml("", "All statuses")]
      .concat(state.statusOptions.map((s) => optionHtml(s.status_key, s.status_label)))
      .join("");

    fillRegisterVessels();
    fillRegisterTypes();

    el.registerStatus.innerHTML = state.statusOptions
      .map((s) => optionHtml(s.status_key, s.status_label, "active"))
      .join("");

    el.inspectionType.innerHTML = state.inspectionTypes
      .map((i) => optionHtml(i.inspection_type_key, i.inspection_type_label))
      .join("");

    el.usageOperationDate.value = todayIso();
    el.lifecycleEventDate.value = todayIso();
    el.inspectionDate.value = todayIso();
    el.checklistInspectionDate.value = todayIso();

    fillLocationSelects();
  }

  function fillVesselFilter() {
    const companyId = el.companyFilter?.value || (!state.isPlatform ? state.profile?.company_id || "" : "");
    const vessels = visibleVesselsForCompany(companyId);
    const current = el.vesselFilter?.value || "";
    const selected = current && vessels.some((v) => v.id === current) ? current : "";

    el.vesselFilter.innerHTML = [optionHtml("", "All visible vessels", selected)]
      .concat(vessels.map((v) =>
        optionHtml(
          v.id,
          `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}`,
          selected
        )
      ))
      .join("");

    el.vesselFilter.value = selected;
  }

  function fillRegisterVessels() {
    const companyId = !state.isPlatform ? state.profile?.company_id || "" : "";
    const vessels = visibleVesselsForCompany(companyId);
    const current = el.registerVessel?.value || "";
    const selected = current && vessels.some((v) => v.id === current) ? current : "";

    el.registerVessel.innerHTML = [optionHtml("", "Select vessel", selected)]
      .concat(vessels.map((v) =>
        optionHtml(
          v.id,
          `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}`,
          selected
        )
      ))
      .join("");

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      el.registerVessel.value = state.profile.vessel_id;
      el.registerVessel.disabled = true;
    }
  }

  function fillRegisterTypes() {
    if (!el.registerType) return;

    const vessel = getVessel(el.registerVessel?.value || "");
    const companyId = vessel?.company_id || (!state.isPlatform ? state.profile?.company_id || "" : "");
    const types = componentTypesForCompany(companyId);
    const current = el.registerType.value || "";
    const selected = current && types.some((t) => t.id === current) ? current : "";

    el.registerType.innerHTML = [optionHtml("", "Select component type", selected)]
      .concat(types.map((t) => optionHtml(t.id, `${t.code} — ${t.name}`, selected)))
      .join("");

    el.registerType.value = selected;
  }

  function filteredLocationOptions(mode, vesselId = "", componentTypeId = "") {
    const vessel = getVessel(vesselId);
    const companyId = vessel?.company_id || state.profile?.company_id || "";

    return state.locationOptions
      .filter((x) => x.location_mode === mode)
      .filter((x) => !x.company_id || x.company_id === companyId)
      .filter((x) => !x.vessel_id || x.vessel_id === vesselId)
      .filter((x) => !x.component_type_id || x.component_type_id === componentTypeId)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function fillOneLocationSelect(selectEl, mode, vesselId, componentTypeId, selected = "") {
    if (!selectEl) return;
    const options = filteredLocationOptions(mode, vesselId, componentTypeId);
    selectEl.innerHTML = options.length
      ? options.map((x) => optionHtml(x.location_key, x.location_label, selected)).join("")
      : optionHtml("", "No configured options", selected);
  }

  function fillLocationSelects() {
    const vesselId = el.registerVessel?.value || "";
    const typeId = el.registerType?.value || "";

    fillOneLocationSelect(el.registerFittedPosition, "fitted", vesselId, typeId);
    fillOneLocationSelect(el.registerStorageLocation, "storage", vesselId, typeId);

    const selected = state.selectedComponent;
    const detailVesselId = selected?.vessel_id || vesselId;
    const detailTypeId = selected?.component_type_id || typeId;

    fillOneLocationSelect(el.moveFittedPosition, "fitted", detailVesselId, detailTypeId, selected?.fitted_position || "");
    fillOneLocationSelect(el.moveStorageLocation, "storage", detailVesselId, detailTypeId, selected?.storage_location || "");
  }

  async function onRegisterContextChanged() {
    fillRegisterTypes();
    fillLocationSelects();
    await renderRegisterDynamicFields();
  }

  function updateRegisterLocationUi() {
    const mode = el.registerLocationMode.value;
    el.registerFittedWrap.classList.toggle("hidden", mode !== "fitted");
    el.registerStorageWrap.classList.toggle("hidden", mode !== "storage");
  }

  function updateMoveLocationUi() {
    const mode = el.moveLocationMode.value;
    el.moveFittedWrap.classList.toggle("hidden", mode !== "fitted");
    el.moveStorageWrap.classList.toggle("hidden", mode !== "storage");
  }

  async function getEffectiveFieldsFor(vesselId, componentTypeId) {
    if (!vesselId || !componentTypeId) return [];
    const vessel = getVessel(vesselId);
    if (!vessel?.company_id) return [];

    const data = await rpc("mai_get_effective_fields", {
      p_company_id: vessel.company_id,
      p_component_type_id: componentTypeId
    });

    return data || [];
  }

  function inputTypeForField(field) {
    if (field.value_type === "date") return "date";
    if (field.value_type === "number") return "number";
    return "text";
  }

  function valueToString(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function renderDynamicFields(container, fields, values = {}, prefix = "field") {
    if (!container) return;

    if (!fields.length) {
      container.innerHTML = `<div class="hint-text">No editable fields are configured for the selected component type.</div>`;
      return;
    }

    container.innerHTML = fields
      .map((field) => {
        const key = field.field_key;
        const id = `${prefix}_${key}`.replaceAll(/[^A-Za-z0-9_\-]/g, "_");
        const required = field.is_required ? " required" : "";
        const label = `${field.field_label || key}${field.unit_label ? " (" + field.unit_label + ")" : ""}`;
        const help = field.help_text ? `<div class="field-help">${esc(field.help_text)}</div>` : "";
        const current = values[key] ?? "";

        if (field.value_type === "textarea") {
          return `
            <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
              <span>${esc(label)}${field.is_required ? " *" : ""}</span>
              <textarea id="${esc(id)}" data-dynamic-input="${esc(key)}"${required}>${esc(current)}</textarea>
              ${help}
            </label>
          `;
        }

        if (field.value_type === "select") {
          const opts = normalizeOptions(field.options);
          return `
            <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
              <span>${esc(label)}${field.is_required ? " *" : ""}</span>
              <select id="${esc(id)}" data-dynamic-input="${esc(key)}"${required}>
                <option value="">Select...</option>
                ${opts.map((o) => optionHtml(o.value, o.label, current)).join("")}
              </select>
              ${help}
            </label>
          `;
        }

        if (field.value_type === "boolean") {
          return `
            <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
              <span>${esc(label)}${field.is_required ? " *" : ""}</span>
              <select id="${esc(id)}" data-dynamic-input="${esc(key)}"${required}>
                <option value="">Not set</option>
                <option value="true"${current === true || current === "true" ? " selected" : ""}>Yes</option>
                <option value="false"${current === false || current === "false" ? " selected" : ""}>No</option>
              </select>
              ${help}
            </label>
          `;
        }

        return `
          <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
            <span>${esc(label)}${field.is_required ? " *" : ""}</span>
            <input id="${esc(id)}" type="${esc(inputTypeForField(field))}" data-dynamic-input="${esc(key)}" value="${esc(valueToString(current))}"${required} />
            ${help}
          </label>
        `;
      })
      .join("");
  }

  function collectDynamicValues(container) {
    const values = {};
    container.querySelectorAll("[data-dynamic-input]").forEach((input) => {
      const key = input.getAttribute("data-dynamic-input");
      if (!key) return;

      let value;
      if (input.type === "checkbox") {
        value = input.checked;
      } else {
        value = input.value;
      }

      values[key] = value === "" ? null : value;
    });
    return values;
  }

  async function renderRegisterDynamicFields() {
    const fields = await getEffectiveFieldsFor(el.registerVessel.value, el.registerType.value);
    renderDynamicFields(el.registerDynamicFields, fields, {}, "register_field");
  }

  function filteredComponents() {
    const companyId = el.companyFilter.value || "";
    const vesselId = el.vesselFilter.value || "";
    const typeId = el.typeFilter.value || "";
    const status = el.statusFilter.value || "";
    const q = String(el.searchInput.value || "").trim().toLowerCase();

    return state.components.filter((c) => {
      if (companyId && c.company_id !== companyId) return false;
      if (vesselId && c.vessel_id !== vesselId) return false;
      if (typeId && c.component_type_id !== typeId) return false;
      if (status && c.current_status !== status) return false;

      if (q) {
        const next = nextLifecycleActionForComponent(c.id);
        const haystack = [
          c.unique_id,
          c.company_name,
          c.vessel_name,
          c.hull_number,
          c.component_type_code,
          c.component_type_name,
          c.order_number,
          c.current_status_label,
          c.location_mode,
          c.current_location_detail,
          next?.rule_label,
          next?.lifecycle_status,
          c.notes
        ].map((x) => String(x || "").toLowerCase()).join(" | ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }

  function renderStats(rows) {
    const active = rows.filter((c) => !isTerminalStatus(c.current_status)).length;
    const retired = rows.filter((c) => isTerminalStatus(c.current_status)).length;

    const dueComponents = new Set();

    rows.forEach((c) => {
      const worst = worstLifecycleForComponent(c.id);
      if (worst && lifecyclePriority(worst.lifecycle_status) >= lifecyclePriority("due_soon")) {
        dueComponents.add(c.id);
      }
    });

    el.statTotal.textContent = String(rows.length);
    el.statActive.textContent = String(active);
    el.statDue.textContent = String(dueComponents.size);
    el.statRetired.textContent = String(retired);
  }

  function renderComponents() {
    const rows = filteredComponents();
    renderStats(rows);
    el.listMeta.textContent = `${rows.length} record(s) shown from ${state.components.length} visible record(s).`;

    if (!rows.length) {
      el.componentsTbody.innerHTML = `<tr><td colspan="9" class="empty-cell">No components found.</td></tr>`;
      return;
    }

    el.componentsTbody.innerHTML = rows
      .map((c) => {
        const statusLabel = c.current_status_label || getStatusLabel(c.current_status);
        const location = c.current_location_detail || c.location_mode || "—";
        const usage = usageSummaryForComponent(c.id);
        const next = nextLifecycleActionForComponent(c.id);

        const nextHtml = next
          ? `
            <div><span class="lifecycle-pill ${lifecycleClass(next.lifecycle_status)}">${esc(lifecycleLabel(next.lifecycle_status))}</span></div>
            <div class="muted-small">${esc(next.rule_label || next.rule_key || "—")}</div>
            <div class="muted-small">Due: ${esc(dueLabel(next.due_date))} / Hours left: ${esc(next.hours_remaining === null || next.hours_remaining === undefined ? "—" : asNumber(next.hours_remaining, 1))}</div>
          `
          : "—";

        return `
          <tr data-component-id="${esc(c.id)}">
            <td>
              <div class="id-strong">${esc(c.unique_id)}</div>
              <div class="muted-small">Order: ${esc(c.order_number || "—")}</div>
            </td>
            <td>
              <div>${esc(c.vessel_name || "—")}</div>
              <div class="muted-small">Hull: ${esc(c.hull_number || "—")}</div>
            </td>
            <td>
              <div>${esc(c.component_type_code || "")}</div>
              <div class="muted-small">${esc(c.component_type_name || "")}</div>
            </td>
            <td><span class="status-pill ${statusClass(c.current_status)}">${esc(statusLabel)}</span></td>
            <td>
              <div>${esc(c.location_mode || "—")}</div>
              <div class="muted-small">${esc(location)}</div>
            </td>
            <td>
              <div>${esc(asNumber(usage?.total_lifecycle_hours || 0, 1))}</div>
              <div class="muted-small">${esc(usage?.usage_log_count || 0)} usage record(s)</div>
            </td>
            <td>${nextHtml}</td>
            <td>${esc(asDateText(c.updated_at))}</td>
            <td class="actions-cell">
              <button class="btn2 compact" type="button" data-action="view" data-id="${esc(c.id)}">View</button>
            </td>
          </tr>
        `;
      })
      .join("");

    el.componentsTbody.querySelectorAll("[data-action='view']").forEach((btn) => {
      btn.addEventListener("click", () => openDetail(btn.getAttribute("data-id")).catch(handleError));
    });
  }

  function openRegisterPanel() {
    clearMessages();
    el.registerPanel.classList.remove("hidden");
    el.registerPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeRegisterPanel() {
    el.registerPanel.classList.add("hidden");
  }

  function resetRegisterForm() {
    el.registerForm.reset();

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      el.registerVessel.value = state.profile.vessel_id;
    }

    el.registerStatus.value = "active";
    el.registerLocationMode.value = "storage";
    updateRegisterLocationUi();
    renderRegisterDynamicFields().catch(handleError);
  }

  async function registerComponent() {
    clearMessages();

    const vesselId = el.registerVessel.value;
    const componentTypeId = el.registerType.value;
    const orderNumber = el.registerOrderNumber.value.trim();

    if (!vesselId || !componentTypeId || !orderNumber) {
      showWarn("Vessel, Component Type and Order Number are required.");
      return;
    }

    el.submitRegisterBtn.disabled = true;
    el.submitRegisterBtn.textContent = "Registering...";

    try {
      const locationMode = el.registerLocationMode.value || "storage";
      const fieldValues = collectDynamicValues(el.registerDynamicFields);

      const data = await rpc("mai_register_component", {
        p_vessel_id: vesselId,
        p_component_type_id: componentTypeId,
        p_order_number: orderNumber,
        p_current_status: el.registerStatus.value || "active",
        p_location_mode: locationMode,
        p_fitted_position: locationMode === "fitted" ? el.registerFittedPosition.value || null : null,
        p_storage_location: locationMode === "storage" ? el.registerStorageLocation.value || null : null,
        p_notes: el.registerNotes.value || null,
        p_field_values: fieldValues
      });

      const row = Array.isArray(data) ? data[0] : data;

      showOk(`Component registered successfully. Unique ID: ${row?.unique_id || "generated"}`);

      resetRegisterForm();
      closeRegisterPanel();
      await reloadComponentsOnly();
    } finally {
      el.submitRegisterBtn.disabled = false;
      el.submitRegisterBtn.textContent = "Register Component";
    }
  }

  function closeDetailPanel() {
    state.selectedComponent = null;
    state.selectedEffectiveFields = [];
    state.selectedFieldValues = {};
    state.selectedUsageRows = [];
    state.selectedLifecycleEvents = [];
    state.selectedTemplates = [];
    state.selectedChecklistRuns = [];
    state.activeChecklistRun = null;
    state.activeChecklistItems = [];
    state.activeChecklistAnswers = [];
    el.detailPanel.classList.add("hidden");
  }

  async function openDetail(componentId) {
    clearMessages();

    const component = state.components.find((c) => c.id === componentId);
    if (!component) {
      showWarn("Component was not found in the current visible list.");
      return;
    }

    state.selectedComponent = component;

    el.detailTitle.textContent = component.unique_id || "Component Detail";
    el.detailSubtitle.textContent = `${component.vessel_name || "Vessel"} / ${component.component_type_code || "Type"} — ${component.component_type_name || ""}`;

    renderIdentity(component);
    renderLifecycleOverview(component);
    renderLifecycleStatus(component);

    state.selectedEffectiveFields = await getEffectiveFieldsFor(component.vessel_id, component.component_type_id);
    state.selectedFieldValues = await loadFieldValues(component.id, state.selectedEffectiveFields);
    renderDynamicFields(el.detailDynamicFields, state.selectedEffectiveFields, state.selectedFieldValues, "detail_field");

    el.moveLocationMode.value = component.location_mode || "storage";
    fillLocationSelects();
    updateMoveLocationUi();
    el.moveRemarks.value = "";

    el.usageOperationDate.value = todayIso();
    el.lifecycleEventDate.value = todayIso();
    el.inspectionDate.value = todayIso();
    el.checklistInspectionDate.value = todayIso();

    await Promise.all([
      loadSelectedUsageRows(component.id),
      loadSelectedLifecycleEvents(component.id),
      loadChecklistTemplates(component.id),
      loadChecklistRuns(component.id),
      renderInspectionHistory(component.id),
      renderMovementHistory(component.id),
      renderAttachments(component.id)
    ]);

    renderUsageHistory();
    renderLifecycleEventHistory();
    renderChecklistTemplateSelect();
    renderChecklistRunSelect();
    renderChecklistRunsHistory();
    clearChecklistWorkArea();

    el.detailPanel.classList.remove("hidden");
    el.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderIdentity(c) {
    const usage = usageSummaryForComponent(c.id);

    const rows = [
      ["Unique ID", c.unique_id],
      ["Company", c.company_name || getCompanyName(c.company_id)],
      ["Vessel", c.vessel_name],
      ["Hull Number", c.hull_number],
      ["Component Type", `${c.component_type_code || ""} — ${c.component_type_name || ""}`],
      ["Order Number", c.order_number],
      ["Sequence", c.sequence_number],
      ["Status", c.current_status_label || getStatusLabel(c.current_status)],
      ["Location Mode", c.location_mode],
      ["Location Detail", c.current_location_detail],
      ["Total Lifecycle Hours", asNumber(usage?.total_lifecycle_hours || 0, 1)],
      ["Last Usage", asDateText(usage?.last_usage_date)],
      ["Last Abnormal Event", asDateText(usage?.last_abnormal_event_date)],
      ["Notes", c.notes || "—"]
    ];

    el.identityBox.innerHTML = rows
      .map(([k, v]) => `<div class="kv-key">${esc(k)}</div><div class="kv-value">${esc(v || "—")}</div>`)
      .join("");
  }

  function renderLifecycleOverview(c) {
    const rows = lifecycleRowsForComponent(c.id);
    const usage = usageSummaryForComponent(c.id);
    const worst = worstLifecycleForComponent(c.id);
    const next = nextLifecycleActionForComponent(c.id);

    const overdueCount = rows.filter((r) => r.lifecycle_status === "overdue" || r.lifecycle_status === "retire_now").length;
    const dueSoonCount = rows.filter((r) => r.lifecycle_status === "due_soon" || r.lifecycle_status === "action_required").length;

    el.lifecycleOverviewBox.innerHTML = `
      <div class="overview-card">
        <div class="overview-label">Total Hours</div>
        <div class="overview-value">${esc(asNumber(usage?.total_lifecycle_hours || 0, 1))}</div>
      </div>
      <div class="overview-card">
        <div class="overview-label">Worst Status</div>
        <div class="overview-value"><span class="lifecycle-pill ${lifecycleClass(worst?.lifecycle_status)}">${esc(lifecycleLabel(worst?.lifecycle_status || "ok"))}</span></div>
      </div>
      <div class="overview-card">
        <div class="overview-label">Overdue / Retire</div>
        <div class="overview-value">${esc(overdueCount)}</div>
      </div>
      <div class="overview-card">
        <div class="overview-label">Due Soon / Action</div>
        <div class="overview-value">${esc(dueSoonCount)}</div>
      </div>
      <div class="overview-card">
        <div class="overview-label">Next Action</div>
        <div class="overview-value">${esc(next?.rule_label || "—")}</div>
      </div>
      <div class="overview-card">
        <div class="overview-label">Next Due</div>
        <div class="overview-value">${esc(dueLabel(next?.due_date))}</div>
      </div>
    `;
  }

  function renderLifecycleStatus(c) {
    const rows = lifecycleRowsForComponent(c.id);

    if (!rows.length) {
      el.lifecycleStatusTbody.innerHTML = `<tr><td colspan="6" class="empty-cell">No lifecycle criteria found for this component type.</td></tr>`;
      return;
    }

    el.lifecycleStatusTbody.innerHTML = rows
      .map((r) => {
        const base = [
          `Start: ${asDateText(r.service_start_date)}`,
          r.reset_event_date ? `Reset: ${asDateText(r.reset_event_date)}` : ""
        ].filter(Boolean).join(" / ");

        const limits = [
          r.date_limit_months !== null && r.date_limit_months !== undefined ? `${r.date_limit_months} months` : "",
          r.hours_limit !== null && r.hours_limit !== undefined ? `${asNumber(r.hours_limit, 0)} hours` : ""
        ].filter(Boolean).join(" / ") || "—";

        const hours = [
          `Used: ${asNumber(r.hours_since_base || 0, 1)}`,
          r.hours_remaining !== null && r.hours_remaining !== undefined ? `Left: ${asNumber(r.hours_remaining, 1)}` : ""
        ].filter(Boolean).join(" / ");

        return `
          <tr>
            <td>
              <div class="id-strong">${esc(r.rule_label || r.rule_key)}</div>
              <div class="muted-small">${esc(r.rule_group || "")} / ${esc(limits)}</div>
            </td>
            <td><span class="lifecycle-pill ${lifecycleClass(r.lifecycle_status)}">${esc(lifecycleLabel(r.lifecycle_status))}</span></td>
            <td>${esc(base || "—")}</td>
            <td>${esc(dueLabel(r.due_date))}</td>
            <td>${esc(hours || "—")}</td>
            <td>${esc(r.recommended_action || "—")}</td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadFieldValues(componentId, fields) {
    const { data, error } = await state.sb
      .from("mai_component_field_values")
      .select("field_definition_id, value_text, value_number, value_date, value_boolean, value_json")
      .eq("component_id", componentId);

    if (error) throw error;

    const byId = new Map((data || []).map((row) => [row.field_definition_id, row]));
    const values = {};

    fields.forEach((field) => {
      const row = byId.get(field.field_definition_id);
      if (!row) return;

      if (field.value_type === "number") values[field.field_key] = row.value_number;
      else if (field.value_type === "date") values[field.field_key] = row.value_date;
      else if (field.value_type === "boolean") values[field.field_key] = row.value_boolean;
      else if (field.value_type === "json" || field.value_type === "multiselect") values[field.field_key] = row.value_json;
      else values[field.field_key] = row.value_text;
    });

    return values;
  }

  async function saveSelectedFields() {
    if (!state.selectedComponent) return;

    const values = collectDynamicValues(el.detailDynamicFields);

    await rpc("mai_save_component_field_values", {
      p_component_id: state.selectedComponent.id,
      p_values: values
    });

    showOk("Field values saved.");

    const id = state.selectedComponent.id;
    await reloadComponentsOnly();
    await openDetail(id);
  }

  async function loadChecklistTemplates(componentId) {
    const data = await rpc("mai_get_available_inspection_templates", {
      p_component_id: componentId
    });

    state.selectedTemplates = data || [];
  }

  function renderChecklistTemplateSelect() {
    if (!state.selectedTemplates.length) {
      el.checklistTemplateSelect.innerHTML = `<option value="">No templates available</option>`;
      el.startChecklistBtn.disabled = true;
      return;
    }

    el.checklistTemplateSelect.innerHTML = state.selectedTemplates
      .map((t) => {
        const label = `${t.form_code || ""} — ${t.template_title || t.template_key} (${t.score_item_count || 0} items)`;
        return optionHtml(t.template_id, label);
      })
      .join("");

    el.startChecklistBtn.disabled = false;
  }

  async function loadChecklistRuns(componentId) {
    const { data, error } = await state.sb
      .from("mai_v_inspection_runs_list")
      .select("*")
      .eq("component_id", componentId)
      .order("inspection_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.selectedChecklistRuns = data || [];
  }

  function renderChecklistRunSelect() {
    if (!state.selectedChecklistRuns.length) {
      el.checklistRunSelect.innerHTML = `<option value="">No checklist runs</option>`;
      el.loadChecklistRunBtn.disabled = true;
      return;
    }

    el.checklistRunSelect.innerHTML = state.selectedChecklistRuns
      .map((r) => {
        const score = r.average_score === null || r.average_score === undefined ? "" : ` / Avg ${asNumber(r.average_score, 2)}`;
        const label = `${asDateText(r.inspection_date)} — ${r.form_code || ""} — ${runStatusLabel(r.run_status)}${score}`;
        return optionHtml(r.run_id, label);
      })
      .join("");

    el.loadChecklistRunBtn.disabled = false;
  }

  function renderChecklistRunsHistory() {
    const rows = state.selectedChecklistRuns;

    if (!rows.length) {
      el.checklistRunsHistory.innerHTML = `<div class="hint-text">No checklist runs yet.</div>`;
      return;
    }

    el.checklistRunsHistory.innerHTML = rows
      .map((r) => `
        <div class="mini-item">
          <div class="mini-title">
            ${esc(r.form_code || "")} — ${esc(r.template_title || "")}
            <span class="run-pill ${runStatusClass(r.run_status)}">${esc(runStatusLabel(r.run_status))}</span>
          </div>
          <div class="mini-meta">Inspection date: ${esc(asDateText(r.inspection_date))} / Inspected by: ${esc(r.inspected_by || "—")}</div>
          <div class="mini-meta">Answered: ${esc(r.answered_items_count || 0)} / ${esc(r.total_score_items_count || 0)} / Average: ${esc(r.average_score === null || r.average_score === undefined ? "—" : asNumber(r.average_score, 2))}</div>
          ${r.calculated_condition ? `<div class="mini-meta">Condition: ${esc(r.calculated_condition)}</div>` : ""}
          ${r.calculated_recommendation ? `<div class="mini-meta">Recommendation: ${esc(r.calculated_recommendation)}</div>` : ""}
        </div>
      `)
      .join("");
  }

  async function startChecklistRun() {
    if (!state.selectedComponent) return;

    const templateId = el.checklistTemplateSelect.value;
    if (!templateId) {
      showWarn("Select an inspection checklist template first.");
      return;
    }

    const runId = await rpc("mai_start_inspection_run", {
      p_component_id: state.selectedComponent.id,
      p_template_id: templateId,
      p_inspection_date: el.checklistInspectionDate.value || todayIso(),
      p_inspected_by: el.checklistInspectedBy.value || null,
      p_remarks: el.checklistRemarks.value || null
    });

    showOk("Checklist inspection run started.");

    await reloadChecklistArea();
    el.checklistRunSelect.value = runId;
    await loadSelectedChecklistRun();
  }

  async function reloadChecklistArea() {
    if (!state.selectedComponent) return;

    await loadChecklistTemplates(state.selectedComponent.id);
    await loadChecklistRuns(state.selectedComponent.id);

    renderChecklistTemplateSelect();
    renderChecklistRunSelect();
    renderChecklistRunsHistory();
  }

  async function loadSelectedChecklistRun() {
    const runId = el.checklistRunSelect.value;
    if (!runId) {
      showWarn("Select a checklist run first.");
      return;
    }

    const run = state.selectedChecklistRuns.find((r) => r.run_id === runId);

    if (!run) {
      showWarn("Checklist run was not found in loaded run list.");
      return;
    }

    state.activeChecklistRun = run;

    await Promise.all([
      loadActiveChecklistItems(run.template_id),
      loadActiveChecklistAnswers(run.run_id)
    ]);

    renderChecklistWorkArea();
  }

  async function loadActiveChecklistItems(templateId) {
    const { data, error } = await state.sb
      .from("mai_v_inspection_template_items_detail")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    state.activeChecklistItems = data || [];
  }

  async function loadActiveChecklistAnswers(runId) {
    const { data, error } = await state.sb
      .from("mai_v_inspection_run_answers_detail")
      .select("*")
      .eq("run_id", runId);

    if (error) throw error;

    state.activeChecklistAnswers = data || [];
  }

  function answerForItem(itemId) {
    return state.activeChecklistAnswers.find((a) => a.item_id === itemId) || null;
  }

  function clearChecklistWorkArea() {
    state.activeChecklistRun = null;
    state.activeChecklistItems = [];
    state.activeChecklistAnswers = [];

    el.checklistRunSummary.classList.add("hidden");
    el.checklistRunSummary.innerHTML = "";
    el.checklistWorkArea.classList.add("hidden");
    el.checklistItemsTbody.innerHTML = `<tr><td colspan="4" class="empty-cell">No checklist loaded.</td></tr>`;
    el.checklistFinalDecision.value = "";
    el.checklistFinalRemarks.value = "";
  }

  function renderChecklistWorkArea() {
    const run = state.activeChecklistRun;

    if (!run) {
      clearChecklistWorkArea();
      return;
    }

    const completed = run.run_status === "completed" || run.run_status === "voided";

    el.checklistRunSummary.classList.remove("hidden");
    el.checklistRunSummary.innerHTML = `
      <strong>${esc(run.form_code || "")} — ${esc(run.template_title || "")}</strong><br />
      Status: <span class="run-pill ${runStatusClass(run.run_status)}">${esc(runStatusLabel(run.run_status))}</span>
      / Date: ${esc(asDateText(run.inspection_date))}
      / Inspected by: ${esc(run.inspected_by || "—")}
      <br />
      Score: ${esc(run.average_score === null || run.average_score === undefined ? "Draft" : asNumber(run.average_score, 2))}
      ${run.calculated_condition ? " / Condition: " + esc(run.calculated_condition) : ""}
      ${run.calculated_recommendation ? "<br />Recommendation: " + esc(run.calculated_recommendation) : ""}
    `;

    if (!state.activeChecklistItems.length) {
      el.checklistItemsTbody.innerHTML = `<tr><td colspan="4" class="empty-cell">No checklist items found.</td></tr>`;
    } else {
      el.checklistItemsTbody.innerHTML = state.activeChecklistItems
        .map((item) => {
          const answer = answerForItem(item.item_id);
          const options = normalizeOptions(item.options);

          const selectHtml = `
            <select data-checklist-option="${esc(item.item_id)}" ${completed ? "disabled" : ""}>
              <option value="">Select evaluation...</option>
              ${options.map((o) => {
                const label = `Score ${o.score_value} — ${o.option_label}`;
                return optionHtml(o.option_id, label, answer?.selected_option_id || "");
              }).join("")}
            </select>
          `;

          const optionHelpHtml = options
            .map((o) => `<div class="score-help"><span class="score-label">${esc(o.score_value)}:</span> ${esc(o.option_description || "")}</div>`)
            .join("");

          return `
            <tr data-checklist-item-id="${esc(item.item_id)}">
              <td>${esc(item.item_no)}</td>
              <td>
                <div class="checkpoint-title">${esc(item.item_title)}</div>
                <div class="checkpoint-question">${esc(item.question_text)}</div>
                <div class="muted-small">${esc(item.item_group || "")}</div>
              </td>
              <td>
                ${selectHtml}
                ${optionHelpHtml}
              </td>
              <td>
                <textarea class="checklist-answer-remarks" data-checklist-remarks="${esc(item.item_id)}" ${completed ? "disabled" : ""}>${esc(answer?.answer_remarks || "")}</textarea>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    el.checklistWorkArea.classList.remove("hidden");
    el.saveChecklistAnswersBtn.disabled = completed;
    el.completeChecklistRunBtn.disabled = completed;
    el.checklistFinalDecision.disabled = completed;
    el.checklistFinalRemarks.disabled = completed;

    if (completed) {
      el.checklistFinalDecision.value = run.final_decision || "";
      el.checklistFinalRemarks.value = run.final_decision_remarks || "";
    } else {
      el.checklistFinalDecision.value = "";
      el.checklistFinalRemarks.value = "";
    }
  }

  async function saveChecklistAnswers() {
    const run = state.activeChecklistRun;

    if (!run) {
      showWarn("Load or start a checklist run first.");
      return;
    }

    if (run.run_status !== "draft") {
      showWarn("Only draft checklist runs can be edited.");
      return;
    }

    const rows = Array.from(el.checklistItemsTbody.querySelectorAll("[data-checklist-item-id]"));

    if (!rows.length) {
      showWarn("No checklist items found to save.");
      return;
    }

    let saved = 0;

    for (const row of rows) {
      const itemId = row.getAttribute("data-checklist-item-id");
      const optionSelect = row.querySelector(`[data-checklist-option="${CSS.escape(itemId)}"]`);
      const remarksInput = row.querySelector(`[data-checklist-remarks="${CSS.escape(itemId)}"]`);

      const selectedOptionId = optionSelect?.value || null;
      const remarks = remarksInput?.value || null;

      if (!selectedOptionId && !remarks) continue;

      await rpc("mai_save_inspection_run_answer", {
        p_run_id: run.run_id,
        p_item_id: itemId,
        p_selected_option_id: selectedOptionId,
        p_answer_remarks: remarks
      });

      saved += 1;
    }

    showOk(`Checklist answers saved. ${saved} item(s) updated.`);

    await loadActiveChecklistAnswers(run.run_id);
    renderChecklistWorkArea();
  }

  async function completeChecklistRun() {
    const run = state.activeChecklistRun;

    if (!run) {
      showWarn("Load or start a checklist run first.");
      return;
    }

    await saveChecklistAnswers();

    await rpc("mai_complete_inspection_run", {
      p_run_id: run.run_id,
      p_final_decision: el.checklistFinalDecision.value || null,
      p_final_decision_remarks: el.checklistFinalRemarks.value || null
    });

    showOk("Checklist inspection completed and linked to inspection/lifecycle history.");

    const componentId = state.selectedComponent.id;

    await reloadComponentsOnly();
    await openDetail(componentId);

    const freshRun = state.selectedChecklistRuns.find((r) => r.run_id === run.run_id);
    if (freshRun) {
      el.checklistRunSelect.value = freshRun.run_id;
      await loadSelectedChecklistRun();
    }
  }

  async function recordUsage() {
    if (!state.selectedComponent) return;

    const hours = Number(el.usageHours.value || 0);
    if (!Number.isFinite(hours) || hours < 0) {
      showWarn("Hours under tension must be zero or higher.");
      return;
    }

    await rpc("mai_record_component_usage", {
      p_component_id: state.selectedComponent.id,
      p_operation_date: el.usageOperationDate.value || todayIso(),
      p_operation_type: el.usageOperationType.value || "mooring",
      p_hours_under_tension: hours,
      p_port_name: el.usagePort.value || null,
      p_berth_or_terminal: el.usageBerth.value || null,
      p_unusual_event: el.usageUnusualEvent.checked,
      p_event_requires_inspection: el.usageRequiresInspection.checked,
      p_event_description: el.usageEventDescription.value || null,
      p_remarks: el.usageRemarks.value || null
    });

    showOk("Usage / working-hours record saved.");

    el.usageHours.value = "";
    el.usagePort.value = "";
    el.usageBerth.value = "";
    el.usageUnusualEvent.checked = false;
    el.usageRequiresInspection.checked = false;
    el.usageEventDescription.value = "";
    el.usageRemarks.value = "";

    const id = state.selectedComponent.id;
    await reloadComponentsOnly();
    await openDetail(id);
  }

  async function recordLifecycleEvent() {
    if (!state.selectedComponent) return;

    await rpc("mai_record_lifecycle_event", {
      p_component_id: state.selectedComponent.id,
      p_event_type: el.lifecycleEventType.value,
      p_event_date: el.lifecycleEventDate.value || todayIso(),
      p_performed_by: el.lifecyclePerformedBy.value || null,
      p_source_type: "manual",
      p_related_inspection_id: null,
      p_related_usage_log_id: null,
      p_remarks: el.lifecycleRemarks.value || null
    });

    showOk("Lifecycle event recorded.");

    el.lifecyclePerformedBy.value = "";
    el.lifecycleRemarks.value = "";

    const id = state.selectedComponent.id;
    await reloadComponentsOnly();
    await openDetail(id);
  }

  async function applyLocationChange() {
    if (!state.selectedComponent) return;

    const mode = el.moveLocationMode.value || "storage";

    await rpc("mai_set_component_location", {
      p_component_id: state.selectedComponent.id,
      p_location_mode: mode,
      p_fitted_position: mode === "fitted" ? el.moveFittedPosition.value || null : null,
      p_storage_location: mode === "storage" ? el.moveStorageLocation.value || null : null,
      p_reason: el.moveRemarks.value || null,
      p_remarks: el.moveRemarks.value || null
    });

    showOk("Location changed and movement history recorded.");

    const id = state.selectedComponent.id;
    await reloadComponentsOnly();
    await openDetail(id);
  }

  async function recordInspection() {
    if (!state.selectedComponent) return;

    if (!el.inspectionDate.value) {
      showWarn("Inspection date is required.");
      return;
    }

    await rpc("mai_record_component_inspection", {
      p_component_id: state.selectedComponent.id,
      p_inspection_type_key: el.inspectionType.value,
      p_inspection_date: el.inspectionDate.value,
      p_result: el.inspectionResult.value || "satisfactory",
      p_inspected_by: el.inspectionBy.value || null,
      p_remarks: el.inspectionRemarks.value || null
    });

    showOk("Inspection summary recorded.");

    el.inspectionDate.value = todayIso();
    el.inspectionResult.value = "satisfactory";
    el.inspectionBy.value = "";
    el.inspectionRemarks.value = "";

    const id = state.selectedComponent.id;
    await reloadComponentsOnly();
    await openDetail(id);
  }

  async function loadSelectedUsageRows(componentId) {
    const { data, error } = await state.sb
      .from("mai_component_usage_logs")
      .select("*")
      .eq("component_id", componentId)
      .order("operation_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    state.selectedUsageRows = data || [];
  }

  function renderUsageHistory() {
    const rows = state.selectedUsageRows;

    if (!rows.length) {
      el.usageHistory.innerHTML = `<div class="hint-text">No usage / working-hours records yet.</div>`;
      return;
    }

    el.usageHistory.innerHTML = rows
      .map((r) => `
        <div class="mini-item">
          <div class="mini-title">${esc(r.operation_type || "usage")} — ${esc(asDateText(r.operation_date))}</div>
          <div class="mini-meta">Hours under tension: ${esc(asNumber(r.hours_under_tension || 0, 1))}</div>
          <div class="mini-meta">Port: ${esc(r.port_name || "—")} / Berth: ${esc(r.berth_or_terminal || "—")}</div>
          ${r.unusual_event || r.event_requires_inspection ? `<div class="mini-meta"><span class="lifecycle-pill lifecycle-overdue">Event / inspection trigger</span></div>` : ""}
          ${r.event_description ? `<div class="mini-meta">${esc(r.event_description)}</div>` : ""}
          ${r.remarks ? `<div class="mini-meta">${esc(r.remarks)}</div>` : ""}
        </div>
      `)
      .join("");
  }

  async function loadSelectedLifecycleEvents(componentId) {
    const { data, error } = await state.sb
      .from("mai_component_lifecycle_events")
      .select("*")
      .eq("component_id", componentId)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    state.selectedLifecycleEvents = data || [];
  }

  function renderLifecycleEventHistory() {
    const rows = state.selectedLifecycleEvents;

    if (!rows.length) {
      el.lifecycleEventHistory.innerHTML = `<div class="hint-text">No lifecycle events yet.</div>`;
      return;
    }

    el.lifecycleEventHistory.innerHTML = rows
      .map((r) => `
        <div class="mini-item">
          <div class="mini-title">${esc(r.event_type || "event")} — ${esc(asDateText(r.event_date))}</div>
          <div class="mini-meta">Hours at event: ${esc(r.hours_at_event === null || r.hours_at_event === undefined ? "—" : asNumber(r.hours_at_event, 1))}</div>
          <div class="mini-meta">Performed by: ${esc(r.performed_by || "—")} / Source: ${esc(r.source_type || "—")}</div>
          ${r.remarks ? `<div class="mini-meta">${esc(r.remarks)}</div>` : ""}
        </div>
      `)
      .join("");
  }

  async function renderInspectionHistory(componentId) {
    const { data, error } = await state.sb
      .from("mai_component_inspections")
      .select("id, inspection_type, inspection_date, next_due_date, result, inspected_by, remarks, hours_at_inspection, created_at")
      .eq("component_id", componentId)
      .order("inspection_date", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      el.inspectionHistory.innerHTML = `<div class="hint-text">No inspection records yet.</div>`;
      return;
    }

    el.inspectionHistory.innerHTML = rows
      .map((r) => {
        const type = state.inspectionTypes.find((x) => x.inspection_type_key === r.inspection_type);
        return `
          <div class="mini-item">
            <div class="mini-title">${esc(type?.inspection_type_label || r.inspection_type)} — ${esc(r.result || "")}</div>
            <div class="mini-meta">Date: ${esc(asDateText(r.inspection_date))} / Next due: ${esc(dueLabel(r.next_due_date))}</div>
            <div class="mini-meta">Hours at inspection: ${esc(r.hours_at_inspection === null || r.hours_at_inspection === undefined ? "—" : asNumber(r.hours_at_inspection, 1))}</div>
            <div class="mini-meta">Inspected by: ${esc(r.inspected_by || "—")}</div>
            ${r.remarks ? `<div class="mini-meta">${esc(r.remarks)}</div>` : ""}
          </div>
        `;
      })
      .join("");
  }

  async function renderMovementHistory(componentId) {
    const { data, error } = await state.sb
      .from("mai_component_movements")
      .select("id, movement_type, movement_date, from_location_mode, from_location_detail, to_location_mode, to_location_detail, reason, remarks, created_at")
      .eq("component_id", componentId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      el.movementHistory.innerHTML = `<div class="hint-text">No movement records yet.</div>`;
      return;
    }

    el.movementHistory.innerHTML = rows
      .map((r) => `
        <div class="mini-item">
          <div class="mini-title">${esc(r.movement_type || "movement")} — ${esc(asDateText(r.movement_date))}</div>
          <div class="mini-meta">From: ${esc(r.from_location_mode || "—")} / ${esc(r.from_location_detail || "—")}</div>
          <div class="mini-meta">To: ${esc(r.to_location_mode || "—")} / ${esc(r.to_location_detail || "—")}</div>
          ${r.remarks || r.reason ? `<div class="mini-meta">${esc(r.remarks || r.reason)}</div>` : ""}
        </div>
      `)
      .join("");
  }

  async function renderAttachments(componentId) {
    const { data, error } = await state.sb
      .from("mai_component_attachments")
      .select("id, attachment_type, file_name, file_path, mime_type, uploaded_at, remarks")
      .eq("component_id", componentId)
      .order("uploaded_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      el.attachmentsBox.innerHTML = `
        <div class="hint-text">No attachments recorded yet.</div>
        <div class="hint-text">File upload will be connected after the checklist workflow is stable.</div>
      `;
      return;
    }

    el.attachmentsBox.innerHTML = rows
      .map((r) => `
        <div class="mini-item">
          <div class="mini-title">${esc(r.file_name || "Attachment")}</div>
          <div class="mini-meta">Type: ${esc(r.attachment_type || "other")} / Uploaded: ${esc(asDateText(r.uploaded_at))}</div>
          ${r.remarks ? `<div class="mini-meta">${esc(r.remarks)}</div>` : ""}
        </div>
      `)
      .join("");
  }

  function openSparePanel() {
    renderSpareStatus();
    el.sparePanel.classList.remove("hidden");
    el.sparePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeSparePanel() {
    el.sparePanel.classList.add("hidden");
  }

  function renderSpareStatus() {
    const companyId = el.companyFilter?.value || "";
    const vesselId = el.vesselFilter?.value || "";

    let rows = state.spareStatusRows.slice();

    if (companyId) rows = rows.filter((r) => r.company_id === companyId);
    if (vesselId) rows = rows.filter((r) => r.vessel_id === vesselId);

    rows.sort((a, b) => {
      const shortageDiff = Number(b.shortage_quantity || 0) - Number(a.shortage_quantity || 0);
      if (shortageDiff !== 0) return shortageDiff;
      return String(a.vessel_name || "").localeCompare(String(b.vessel_name || ""));
    });

    if (!rows.length) {
      el.spareStatusTbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No spare minimum status records found.</td></tr>`;
      return;
    }

    el.spareStatusTbody.innerHTML = rows
      .map((r) => {
        const shortage = Number(r.shortage_quantity || 0);
        const statusClassName = shortage > 0 ? "spare-shortage" : "spare-ok";
        const statusLabel = shortage > 0 ? "Shortage" : "OK";

        return `
          <tr>
            <td>${esc(r.company_name || "—")}</td>
            <td>
              <div>${esc(r.vessel_name || "—")}</div>
              <div class="muted-small">Hull: ${esc(r.hull_number || "—")}</div>
            </td>
            <td>
              <div>${esc(r.component_type_code || "—")}</div>
              <div class="muted-small">${esc(r.component_type_name || "")}</div>
            </td>
            <td>${esc(r.minimum_quantity)}</td>
            <td>${esc(r.actual_quantity)}</td>
            <td>${esc(r.shortage_quantity)}</td>
            <td><span class="spare-pill ${statusClassName}">${esc(statusLabel)}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  function clearFilters() {
    if (state.isPlatform) el.companyFilter.value = "";
    fillVesselFilter();
    el.vesselFilter.value = "";
    el.typeFilter.value = "";
    el.statusFilter.value = "";
    el.searchInput.value = "";
    renderComponents();
  }

  async function reloadComponentsOnly() {
    await Promise.all([
      loadComponents(),
      loadLifecycleStatus(),
      loadUsageSummary(),
      loadSpareStatus()
    ]);

    renderComponents();

    if (!el.sparePanel.classList.contains("hidden")) {
      renderSpareStatus();
    }
  }

  async function reloadAll() {
    clearMessages();

    await Promise.all([
      loadCompanies(),
      loadVessels(),
      loadComponentTypes(),
      loadStatusOptions(),
      loadLocationOptions(),
      loadInspectionTypes()
    ]);

    await reloadComponentsOnly();

    fillStaticSelects();
    updateRegisterLocationUi();
    updateMoveLocationUi();
    renderComponents();
    await renderRegisterDynamicFields();

    showOk("Mooring and Anchoring Inventories reloaded.");
  }

  async function init() {
    window.CSVB_MAI_BUILD = BUILD;

    cacheDom();
    bindEvents();

    state.sb = window.AUTH.ensureSupabase();

    const bundle = await window.AUTH.setupAuthButtons({
      badgeId: "userBadge",
      loginBtnId: "loginBtn",
      logoutBtnId: "logoutBtn",
      switchBtnId: "switchUserBtn"
    });

    if (!bundle?.session?.user) {
      showWarn("You are logged out. Please login to use this module.");
      return;
    }

    state.bundle = bundle;
    state.profile = bundle.profile || {};
    state.isPlatform = roleIsPlatform(state.profile.role);

    const allowed = await checkModuleEnabled();

    if (!allowed && !state.isPlatform) {
      el.newComponentBtn.disabled = true;
      el.reloadBtn.disabled = true;
      el.spareStatusBtn.disabled = true;
      return;
    }

    await reloadAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();