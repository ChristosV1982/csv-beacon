// public/mooring-anchoring-operations.js
// C.S.V. BEACON – MAI Vessel Operation Recording UI

(() => {
  "use strict";

  const BUILD = "MAI-OPERATIONS-20260511-1";

  const state = {
    sb: null,
    profile: null,
    isOfficeViewer: false,
    isVesselViewer: false,
    vessels: [],
    operationTypes: [],
    components: [],
    operations: [],
    selectedComponents: new Set()
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn",
      "viewerMode", "viewerHint",
      "operationVessel", "operationType", "operationStart", "operationEnd", "durationPreview",
      "operationReference", "portName", "berthTerminal", "anchorageName",
      "unusualEvent", "requiresInspection", "eventDescription", "operationRemarks",
      "operationSummaryBox", "recordOperationSubmitBtn", "resetFormBtn",
      "componentSelectionMeta", "selectAllComponentsBtn", "clearComponentsBtn",
      "componentTypeFilter", "componentSearch", "componentChecks",
      "historyMeta", "operationHistory"
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

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box = type === "ok" ? el.okBox : el.warnBox;
    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
    }
  }

  function roleIsOffice(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role);
  }

  function roleIsVessel(role) {
    return role === "vessel";
  }

  function asDateTime(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return String(value);
    }
  }

  function asNumber(value, decimals = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  }

  function nowLocalInput() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function calculateDurationHours() {
    if (!el.operationStart.value || !el.operationEnd.value) return null;

    const start = new Date(el.operationStart.value);
    const end = new Date(el.operationEnd.value);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

    const hours = (end.getTime() - start.getTime()) / 3600000;
    return hours;
  }

  function selectedVesselId() {
    return el.operationVessel.value || "";
  }

  function selectedOperationType() {
    return state.operationTypes.find((t) => t.operation_type_key === el.operationType.value) || null;
  }

  function componentTypeLabel(component) {
    return `${component.component_type_code || "—"} — ${component.component_type_name || ""}`;
  }

  function operationTypeLabel(key) {
    const t = state.operationTypes.find((x) => x.operation_type_key === key);
    return t?.operation_type_label || key || "—";
  }

  async function loadBaseData() {
    const [vesselRes, typeRes, componentRes] = await Promise.all([
      state.sb.from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true).order("name"),
      state.sb.from("mai_v_operation_type_definitions").select("*").order("sort_order"),
      state.sb.from("mai_v_components_list").select("*").order("unique_id")
    ]);

    for (const res of [vesselRes, typeRes, componentRes]) {
      if (res.error) throw res.error;
    }

    state.vessels = vesselRes.data || [];
    state.operationTypes = typeRes.data || [];
    state.components = componentRes.data || [];

    if (state.isVesselViewer && state.profile?.vessel_id) {
      el.operationVessel.value = state.profile.vessel_id;
    }
  }

  async function loadOperationHistory() {
    const vesselId = selectedVesselId();

    if (!vesselId) {
      state.operations = [];
      renderOperationHistory();
      return;
    }

    const { data, error } = await state.sb
      .from("mai_v_vessel_operations_list")
      .select("*")
      .eq("vessel_id", vesselId)
      .order("operation_start_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    state.operations = data || [];
    renderOperationHistory();
  }

  function renderViewerMode() {
    if (state.isOfficeViewer) {
      el.viewerMode.textContent = "Office Viewer";
      el.viewerHint.textContent = "Office users can record operations for accessible vessels.";
      return;
    }

    if (state.isVesselViewer) {
      el.viewerMode.textContent = "Vessel Viewer";
      el.viewerHint.textContent = "Vessel users can record operations only for their own vessel.";
      return;
    }

    el.viewerMode.textContent = `Role: ${state.profile?.role || "unknown"}`;
    el.viewerHint.textContent = "Viewer mode determined from current user role and RLS.";
  }

  function renderVesselSelect() {
    el.operationVessel.innerHTML = [`<option value="">Select vessel...</option>`]
      .concat(state.vessels.map((v) => `
        <option value="${esc(v.id)}">${esc(v.name || "Unnamed Vessel")} / Hull ${esc(v.hull_number || "—")}</option>
      `))
      .join("");

    if (state.isVesselViewer && state.profile?.vessel_id) {
      el.operationVessel.value = state.profile.vessel_id;
      el.operationVessel.disabled = true;
    }
  }

  function renderOperationTypes() {
    el.operationType.innerHTML = [`<option value="">Select operation type...</option>`]
      .concat(state.operationTypes.map((t) => `
        <option value="${esc(t.operation_type_key)}">${esc(t.operation_type_label || t.operation_type_key)}</option>
      `))
      .join("");
  }

  function visibleComponentTypes() {
    const vesselId = selectedVesselId();

    const map = new Map();

    state.components
      .filter((c) => c.vessel_id === vesselId)
      .forEach((c) => {
        map.set(c.component_type_id, {
          id: c.component_type_id,
          code: c.component_type_code,
          name: c.component_type_name
        });
      });

    return [...map.values()].sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
  }

  function renderComponentTypeFilter() {
    const types = visibleComponentTypes();

    const current = el.componentTypeFilter.value || "";

    el.componentTypeFilter.innerHTML = [`<option value="">All component types</option>`]
      .concat(types.map((t) => `<option value="${esc(t.id)}">${esc(t.code || "")} — ${esc(t.name || "")}</option>`))
      .join("");

    if (current && types.some((t) => t.id === current)) {
      el.componentTypeFilter.value = current;
    }
  }

  function filteredComponents() {
    const vesselId = selectedVesselId();
    const typeId = el.componentTypeFilter.value || "";
    const q = String(el.componentSearch.value || "").trim().toLowerCase();

    return state.components.filter((c) => {
      if (c.vessel_id !== vesselId) return false;
      if (typeId && c.component_type_id !== typeId) return false;

      if (q) {
        const haystack = [
          c.unique_id,
          c.component_type_code,
          c.component_type_name,
          c.current_status_label,
          c.location_mode,
          c.current_location_detail,
          c.order_number
        ].map((x) => String(x || "").toLowerCase()).join(" | ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }

  function renderComponents() {
    const rows = filteredComponents();

    el.componentSelectionMeta.textContent =
      `${state.selectedComponents.size} component(s) selected. ${rows.length} visible for the selected vessel/filter.`;

    if (!selectedVesselId()) {
      el.componentChecks.innerHTML = `<div class="hint-text">Select a vessel first.</div>`;
      return;
    }

    if (!rows.length) {
      el.componentChecks.innerHTML = `<div class="hint-text">No components found for selected vessel/filter.</div>`;
      return;
    }

    el.componentChecks.innerHTML = rows.map((c) => {
      const checked = state.selectedComponents.has(c.id) ? " checked" : "";

      return `
        <label class="component-card">
          <input type="checkbox" data-component-check="${esc(c.id)}"${checked} />
          <span>
            <div class="component-title">${esc(c.unique_id)}</div>
            <div class="component-sub">${esc(componentTypeLabel(c))}</div>
            <div class="component-sub">Status: ${esc(c.current_status_label || c.current_status || "—")}</div>
            <div class="component-sub">Location: ${esc(c.location_mode || "—")} / ${esc(c.current_location_detail || "—")}</div>
          </span>
        </label>
      `;
    }).join("");

    el.componentChecks.querySelectorAll("[data-component-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-component-check");
        if (input.checked) state.selectedComponents.add(id);
        else state.selectedComponents.delete(id);
        renderSummary();
        renderComponents();
      });
    });
  }

  function renderSummary() {
    const vessel = state.vessels.find((v) => v.id === selectedVesselId());
    const opType = selectedOperationType();
    const duration = calculateDurationHours();

    el.durationPreview.value =
      duration === null
        ? "—"
        : duration <= 0
          ? "Invalid duration"
          : `${asNumber(duration, 2)} hours`;

    const warnings = [];

    if (!vessel) warnings.push("Vessel not selected.");
    if (!opType) warnings.push("Operation type not selected.");
    if (duration === null) warnings.push("Start/end time not complete.");
    else if (duration <= 0) warnings.push("End time must be after start time.");
    if (!state.selectedComponents.size) warnings.push("No components selected.");

    el.operationSummaryBox.innerHTML = `
      <div><strong>Vessel:</strong> ${esc(vessel?.name || "—")}</div>
      <div><strong>Operation:</strong> ${esc(opType?.operation_type_label || "—")}</div>
      <div><strong>Duration:</strong> ${esc(duration === null ? "—" : `${asNumber(duration, 2)} hours`)}</div>
      <div><strong>Components credited:</strong> ${esc(state.selectedComponents.size)}</div>
      <div><strong>Counts toward lifecycle:</strong> ${esc(opType?.default_counts_towards_lifecycle ? "Yes" : "No")}</div>
      <div><strong>Default unusual event:</strong> ${esc(opType?.default_unusual_event ? "Yes" : "No")}</div>
      <div><strong>Default requires inspection:</strong> ${esc(opType?.default_event_requires_inspection ? "Yes" : "No")}</div>
      ${
        warnings.length
          ? `<div style="margin-top:8px;"><span class="pill pill-warn">Check</span> ${warnings.map(esc).join(" / ")}</div>`
          : `<div style="margin-top:8px;"><span class="pill pill-ok">Ready to record</span></div>`
      }
    `;
  }

  function renderOperationHistory() {
    const rows = state.operations;

    el.historyMeta.textContent = `${rows.length} operation record(s) shown.`;

    if (!rows.length) {
      el.operationHistory.innerHTML = `<div class="hint-text">No vessel operations recorded yet.</div>`;
      return;
    }

    el.operationHistory.innerHTML = rows.map((op) => {
      const comps = Array.isArray(op.components) ? op.components : [];

      return `
        <div class="mini-item">
          <div class="mini-title">
            ${esc(op.operation_type_label || op.operation_type_key)}
            ${op.operation_status === "voided" ? `<span class="pill pill-danger">voided</span>` : `<span class="pill pill-ok">active</span>`}
          </div>
          <div class="mini-meta">
            ${esc(asDateTime(op.operation_start_at))} → ${esc(asDateTime(op.operation_end_at))}
            / Duration: ${esc(asNumber(op.duration_hours, 2))} h
          </div>
          <div class="mini-meta">
            Port/Berth/Anchorage: ${esc(op.port_name || "—")} / ${esc(op.berth_or_terminal || "—")} / ${esc(op.anchorage_name || "—")}
          </div>
          <div class="mini-meta">
            Components: ${esc(op.component_count || 0)}
            / Total credited component-hours: ${esc(asNumber(op.total_component_hours_credited || 0, 2))}
          </div>
          ${
            comps.length
              ? `<div class="mini-meta">Credited: ${comps.map((c) => esc(c.unique_id)).join(", ")}</div>`
              : ""
          }
          ${op.event_requires_inspection ? `<div class="mini-meta"><span class="pill pill-warn">Inspection trigger</span> ${esc(op.event_description || "")}</div>` : ""}
          ${op.remarks ? `<div class="mini-meta">${esc(op.remarks)}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  function resetForm() {
    const currentVessel = el.operationVessel.value;

    el.operationType.value = "";
    el.operationStart.value = "";
    el.operationEnd.value = "";
    el.durationPreview.value = "—";
    el.operationReference.value = "";
    el.portName.value = "";
    el.berthTerminal.value = "";
    el.anchorageName.value = "";
    el.unusualEvent.checked = false;
    el.requiresInspection.checked = false;
    el.eventDescription.value = "";
    el.operationRemarks.value = "";
    el.componentTypeFilter.value = "";
    el.componentSearch.value = "";
    state.selectedComponents.clear();

    if (currentVessel) {
      el.operationVessel.value = currentVessel;
    }

    renderComponentTypeFilter();
    renderComponents();
    renderSummary();
  }

  async function recordOperation() {
    const vesselId = selectedVesselId();
    const operationTypeKey = el.operationType.value || "";
    const duration = calculateDurationHours();

    if (!vesselId) {
      toast("warn", "Select vessel.");
      return;
    }

    if (!operationTypeKey) {
      toast("warn", "Select operation type.");
      return;
    }

    if (duration === null || duration <= 0) {
      toast("warn", "Operation start/end date-time is invalid.");
      return;
    }

    if (!state.selectedComponents.size) {
      toast("warn", "Select at least one component to credit working hours.");
      return;
    }

    const ok = confirm(
      "Record vessel operation and credit the calculated duration to all selected components?\n\n" +
      `Selected components: ${state.selectedComponents.size}\n` +
      `Duration: ${asNumber(duration, 2)} hours`
    );

    if (!ok) return;

    const componentIds = Array.from(state.selectedComponents);

    await rpc("mai_record_vessel_operation", {
      p_vessel_id: vesselId,
      p_operation_type_key: operationTypeKey,
      p_operation_start_at: new Date(el.operationStart.value).toISOString(),
      p_operation_end_at: new Date(el.operationEnd.value).toISOString(),
      p_component_ids: componentIds,
      p_port_name: el.portName.value || null,
      p_berth_or_terminal: el.berthTerminal.value || null,
      p_anchorage_name: el.anchorageName.value || null,
      p_operation_reference: el.operationReference.value || null,
      p_unusual_event: el.unusualEvent.checked,
      p_event_requires_inspection: el.requiresInspection.checked,
      p_event_description: el.eventDescription.value || null,
      p_remarks: el.operationRemarks.value || null
    });

    toast("ok", "Vessel operation recorded and component working-hours credited.");

    resetForm();
    await reloadAfterVesselChange();
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function reloadAfterVesselChange() {
    state.selectedComponents.clear();
    renderComponentTypeFilter();
    renderComponents();
    renderSummary();
    await loadOperationHistory();
  }

  async function reload() {
    await loadBaseData();
    renderViewerMode();
    renderVesselSelect();
    renderOperationTypes();

    if (state.isVesselViewer && state.profile?.vessel_id) {
      el.operationVessel.value = state.profile.vessel_id;
      el.operationVessel.disabled = true;
    }

    renderComponentTypeFilter();
    renderComponents();
    renderSummary();
    await loadOperationHistory();

    toast("ok", "Operation recording page reloaded.");
  }

  function bindEvents() {
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));

    el.operationVessel.addEventListener("change", () => reloadAfterVesselChange().catch(handleError));

    [
      el.operationType,
      el.operationStart,
      el.operationEnd,
      el.unusualEvent,
      el.requiresInspection
    ].forEach((input) => {
      input.addEventListener("input", renderSummary);
      input.addEventListener("change", renderSummary);
    });

    el.componentTypeFilter.addEventListener("change", () => {
      renderComponents();
      renderSummary();
    });

    el.componentSearch.addEventListener("input", () => {
      renderComponents();
      renderSummary();
    });

    el.selectAllComponentsBtn.addEventListener("click", () => {
      filteredComponents().forEach((c) => state.selectedComponents.add(c.id));
      renderComponents();
      renderSummary();
    });

    el.clearComponentsBtn.addEventListener("click", () => {
      state.selectedComponents.clear();
      renderComponents();
      renderSummary();
    });

    el.recordOperationSubmitBtn.addEventListener("click", () => recordOperation().catch(handleError));
    el.resetFormBtn.addEventListener("click", resetForm);
  }

  function handleError(error) {
    console.error(error);
    toast("warn", String(error?.message || error || "Unknown error"));
  }

  async function init() {
    window.CSVB_MAI_OPERATIONS_BUILD = BUILD;

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
      toast("warn", "You are logged out. Please login.");
      return;
    }

    state.profile = bundle.profile || {};
    state.isOfficeViewer = roleIsOffice(state.profile.role);
    state.isVesselViewer = roleIsVessel(state.profile.role);

    const now = nowLocalInput();
    el.operationStart.value = now;
    el.operationEnd.value = now;

    await reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();
