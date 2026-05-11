// public/mooring-anchoring-inventories.js
// C.S.V. BEACON – Mooring and Anchoring Inventories

(() => {
  "use strict";

  const BUILD = "MAI-FE-20260511-1";
  const MODULE_KEY = "mooring_anchoring_inventories";
  const PERM_PREFIX = "MOORING_ANCHORING_INVENTORIES";

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
    selectedComponent: null,
    selectedEffectiveFields: [],
    selectedFieldValues: {},
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
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

  function asDateText(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return esc(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysBetweenToday(dateText) {
    if (!dateText) return null;
    const due = new Date(String(dateText).slice(0, 10) + "T00:00:00Z");
    if (Number.isNaN(due.getTime())) return null;
    const now = new Date(todayIso() + "T00:00:00Z");
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  }

  function dueClass(dateText) {
    const days = daysBetweenToday(dateText);
    if (days === null) return "";
    if (days < 0) return "due-overdue";
    if (days <= 30) return "due-soon";
    return "due-ok";
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

  function roleIsPlatform(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function optionHtml(value, label, selectedValue = "") {
    const selected = String(value) === String(selectedValue) ? " selected" : "";
    return `<option value="${esc(value)}"${selected}>${esc(label)}</option>`;
  }

  function getCompanyName(companyId) {
    const c = state.companies.find((x) => x.id === companyId);
    return c?.company_name || c?.short_name || c?.company_code || companyId || "";
  }

  function getVessel(vesselId) {
    return state.vessels.find((x) => x.id === vesselId) || null;
  }

  function getTypeLabel(typeId) {
    const t = state.componentTypes.find((x) => x.id === typeId);
    if (!t) return "";
    return `${t.code} — ${t.name}`;
  }

  function componentTypesForCompany(companyId = "") {
    return state.componentTypes.filter((t) => !t.company_id || !companyId || t.company_id === companyId);
  }

  function getStatusLabel(statusKey) {
    const s = state.statusOptions.find((x) => x.status_key === statusKey);
    return s?.status_label || statusKey || "—";
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

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn", "newComponentBtn", "clearFiltersBtn",
      "companyFilter", "vesselFilter", "typeFilter", "statusFilter", "searchInput",
      "statTotal", "statActive", "statDue", "statRetired", "listMeta", "componentsTbody",
      "registerPanel", "closeRegisterBtn", "registerForm", "registerVessel", "registerType",
      "registerOrderNumber", "registerStatus", "registerLocationMode", "registerFittedWrap",
      "registerFittedPosition", "registerStorageWrap", "registerStorageLocation", "registerNotes",
      "registerDynamicFields", "submitRegisterBtn", "resetRegisterBtn",
      "detailPanel", "detailTitle", "detailSubtitle", "identityBox", "closeDetailBtn", "saveFieldsBtn",
      "detailDynamicFields", "moveLocationMode", "moveFittedWrap", "moveFittedPosition",
      "moveStorageWrap", "moveStorageLocation", "moveRemarks", "applyMoveBtn",
      "inspectionType", "inspectionDate", "inspectionResult", "inspectionBy", "inspectionRemarks",
      "recordInspectionBtn", "inspectionHistory", "movementHistory", "attachmentsBox"
    ].forEach((id) => {
      el[id] = $(id);
    });
  }

  function bindEvents() {
    el.reloadBtn?.addEventListener("click", () => reloadAll().catch(handleError));
    el.newComponentBtn?.addEventListener("click", () => openRegisterPanel());
    el.closeRegisterBtn?.addEventListener("click", () => closeRegisterPanel());
    el.clearFiltersBtn?.addEventListener("click", clearFilters);

    [el.companyFilter, el.vesselFilter, el.typeFilter, el.statusFilter, el.searchInput].forEach((input) => {
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
      showWarn(
        "This module is not enabled for your company yet. It has been created safely but remains hidden until final activation."
      );
    }

    return allowed;
  }

  async function loadCompanies() {
    if (state.isPlatform) {
      try {
        const data = await rpc("csvb_admin_list_companies");
        state.companies = (data || []).filter((c) => c.is_active !== false);
        return;
      } catch (_) {
        // Fall back to companies visible through normal RLS.
      }
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

    fillRegisterTypes();

    el.registerStatus.innerHTML = state.statusOptions
      .map((s) => optionHtml(s.status_key, s.status_label, "active"))
      .join("");

    el.inspectionType.innerHTML = state.inspectionTypes
      .map((i) => optionHtml(i.inspection_type_key, i.inspection_type_label))
      .join("");

    el.inspectionDate.value = todayIso();

    fillRegisterVessels();
    fillLocationSelects();
  }

  function visibleVesselsForCompany(companyId = "") {
    return state.vessels.filter((v) => !companyId || v.company_id === companyId);
  }

  function fillVesselFilter() {
    const companyId = el.companyFilter?.value || (!state.isPlatform ? state.profile?.company_id || "" : "");
    const vessels = visibleVesselsForCompany(companyId);
    const current = el.vesselFilter?.value || "";
    const stillValid = current && vessels.some((v) => v.id === current);
    const selected = stillValid ? current : "";

    el.vesselFilter.innerHTML = [optionHtml("", "All visible vessels", selected)]
      .concat(vessels.map((v) => optionHtml(v.id, `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}`, selected)))
      .join("");

    el.vesselFilter.value = selected;
  }

  function fillRegisterVessels() {
    const companyId = !state.isPlatform ? state.profile?.company_id || "" : "";
    const vessels = visibleVesselsForCompany(companyId);
    const current = el.registerVessel?.value || "";
    const selected = current && vessels.some((v) => v.id === current) ? current : "";

    el.registerVessel.innerHTML = [optionHtml("", "Select vessel", selected)]
      .concat(vessels.map((v) => optionHtml(v.id, `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}`, selected)))
      .join("");

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      el.registerVessel.value = state.profile.vessel_id;
      el.registerVessel.disabled = true;
    }

    fillRegisterTypes();
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
    const options = filteredLocationOptions(mode, vesselId, componentTypeId);
    selectEl.innerHTML = options.length
      ? options.map((x) => optionHtml(x.location_key, x.location_label, selected)).join("")
      : optionHtml("", "No configured options");
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
      p_component_type_id: componentTypeId,
    });

    return data || [];
  }

  function inputTypeForField(field) {
    if (field.value_type === "date") return "date";
    if (field.value_type === "number") return "number";
    if (field.value_type === "boolean") return "checkbox";
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
              <span>${esc(label)}${field.is_required ? " <b>*</b>" : ""}</span>
              <textarea id="${esc(id)}" data-dynamic-input="${esc(key)}"${required}>${esc(current)}</textarea>
              ${help}
            </label>
          `;
        }

        if (field.value_type === "select") {
          const opts = normalizeOptions(field.options);
          return `
            <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
              <span>${esc(label)}${field.is_required ? " <b>*</b>" : ""}</span>
              <select id="${esc(id)}" data-dynamic-input="${esc(key)}"${required}>
                <option value="">Select...</option>
                ${opts.map((o) => optionHtml(o.value, o.label, current)).join("")}
              </select>
              ${help}
            </label>
          `;
        }

        if (field.value_type === "boolean") {
          const checked = current === true || current === "true" ? " checked" : "";
          return `
            <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
              <span>${esc(label)}${field.is_required ? " <b>*</b>" : ""}</span>
              <select id="${esc(id)}" data-dynamic-input="${esc(key)}"${required}>
                <option value="">Not set</option>
                <option value="true"${checked ? " selected" : ""}>Yes</option>
                <option value="false"${current === false || current === "false" ? " selected" : ""}>No</option>
              </select>
              ${help}
            </label>
          `;
        }

        return `
          <label class="field" data-field-key="${esc(key)}" data-value-type="${esc(field.value_type)}">
            <span>${esc(label)}${field.is_required ? " <b>*</b>" : ""}</span>
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
          c.notes,
        ]
          .map((x) => String(x || "").toLowerCase())
          .join(" | ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }

  function renderStats(rows) {
    const active = rows.filter((c) => !isTerminalStatus(c.current_status)).length;
    const retired = rows.filter((c) => isTerminalStatus(c.current_status)).length;
    const due = rows.filter((c) => {
      const days = daysBetweenToday(c.next_inspection_due_date);
      return days !== null && days <= 30;
    }).length;

    el.statTotal.textContent = String(rows.length);
    el.statActive.textContent = String(active);
    el.statDue.textContent = String(due);
    el.statRetired.textContent = String(retired);
  }

  function renderComponents() {
    fillVesselFilter();

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
        const dueCls = dueClass(c.next_inspection_due_date);
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
            <td>${esc(asDateText(c.last_inspection_date))}<div class="muted-small">${esc(c.last_inspection_result || "")}</div></td>
            <td><span class="due-pill ${dueCls}">${esc(dueLabel(c.next_inspection_due_date))}</span></td>
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
        p_field_values: fieldValues,
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

    state.selectedEffectiveFields = await getEffectiveFieldsFor(component.vessel_id, component.component_type_id);
    state.selectedFieldValues = await loadFieldValues(component.id, state.selectedEffectiveFields);
    renderDynamicFields(el.detailDynamicFields, state.selectedEffectiveFields, state.selectedFieldValues, "detail_field");

    el.moveLocationMode.value = component.location_mode || "storage";
    fillLocationSelects();
    updateMoveLocationUi();
    el.moveRemarks.value = "";

    await Promise.all([
      renderInspectionHistory(component.id),
      renderMovementHistory(component.id),
      renderAttachments(component.id),
    ]);

    el.detailPanel.classList.remove("hidden");
    el.detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderIdentity(c) {
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
      ["Last Inspection", asDateText(c.last_inspection_date)],
      ["Next Due", dueLabel(c.next_inspection_due_date)],
      ["Notes", c.notes || "—"],
    ];

    el.identityBox.innerHTML = rows
      .map(([k, v]) => `<div class="kv-key">${esc(k)}</div><div class="kv-value">${esc(v || "—")}</div>`)
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
      p_values: values,
    });

    showOk("Field values saved.");
    await openDetail(state.selectedComponent.id);
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
      p_remarks: el.moveRemarks.value || null,
    });

    showOk("Location changed and movement history recorded.");
    await reloadComponentsOnly();
    await openDetail(state.selectedComponent.id);
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
      p_remarks: el.inspectionRemarks.value || null,
    });

    showOk("Inspection recorded.");
    el.inspectionDate.value = todayIso();
    el.inspectionResult.value = "satisfactory";
    el.inspectionBy.value = "";
    el.inspectionRemarks.value = "";
    await reloadComponentsOnly();
    await openDetail(state.selectedComponent.id);
  }

  async function renderInspectionHistory(componentId) {
    const { data, error } = await state.sb
      .from("mai_component_inspections")
      .select("id, inspection_type, inspection_date, next_due_date, result, inspected_by, remarks, created_at")
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
      el.attachmentsBox.innerHTML = `<div class="hint-text">No attachments recorded yet.</div>`;
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

  function clearFilters() {
    if (state.isPlatform) el.companyFilter.value = "";
    el.vesselFilter.value = "";
    el.typeFilter.value = "";
    el.statusFilter.value = "";
    el.searchInput.value = "";
    renderComponents();
  }

  async function reloadComponentsOnly() {
    await loadComponents();
    renderComponents();
  }

  async function reloadAll() {
    clearMessages();
    await Promise.all([
      loadCompanies(),
      loadVessels(),
      loadComponentTypes(),
      loadStatusOptions(),
      loadLocationOptions(),
      loadInspectionTypes(),
    ]);
    await loadComponents();
    fillStaticSelects();
    updateRegisterLocationUi();
    updateMoveLocationUi();
    renderComponents();
    await renderRegisterDynamicFields();
    showOk("Mooring and Anchoring Inventories reloaded.");
  }

  function handleError(error) {
    console.error("MAI error:", error);
    showWarn(String(error?.message || error || "Unknown error"));
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
      switchBtnId: "switchUserBtn",
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