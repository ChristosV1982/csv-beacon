// public/mooring-anchoring-inventories-v4.js
// C.S.V. BEACON – MAI Inventory List v4

(() => {
  "use strict";

  const BUILD = "MAI-INVENTORY-LIST-V4-20260511-2";
  const MODULE_KEY = "mooring_anchoring_inventories";

  const state = {
    sb: null,
    profile: null,
    isOfficeViewer: false,
    isVesselViewer: false,
    vessels: [],
    types: [],
    statuses: [],
    components: [],
    lifecycle: [],
    usage: [],
    locks: [],
    selectedVessels: new Set(),
    selectedTypes: new Set(),
    selectedStatuses: new Set(),
    selectionsInitialized: false,
    dueOnly: false,
    contextMode: "",
    perspective: "",
    contextTypeId: "",
    byVesselContext: null,
    byVesselTypes: null,
    contextStorageKey: "",
    loaded: false,
    pendingVesselChoice: null,
    usageVesselId: ""
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn", "recordOperationBtn", "registerComponentBtn",
      "viewerMode", "viewerHint",
      "statTotal", "statActive", "statDue", "statLocked",
      "vesselChecks", "typeChecks", "statusChecks",
      "vesselSummary", "typeSummary", "statusSummary",
      "selectAllVesselsBtn", "clearVesselsBtn",
      "selectAllTypesBtn", "clearTypesBtn",
      "selectAllStatusesBtn", "clearStatusesBtn",
      "searchInput", "clearSearchBtn",
      "listMeta", "componentsTbody", "maiTaskLanding", "maiInventoryWorkspace",
      "viewInventoryBtn", "reviewDueBtn", "backToTasksBtn",
      "maiOfficeContext", "maiContextMode", "maiContextSingleVessel",
      "maiSingleContextWrap", "maiMultiContextWrap", "maiCurrentContext",
      "maiSingleVesselDialog", "maiSingleVesselReason", "maiTaskVessel",
      "maiTaskVesselContinue", "maiTaskVesselCancel", "maiTaskVesselError",
      "maiOfficePerspective", "maiPerspectiveVessel", "maiPerspectiveType",
      "maiTypeContext", "maiContextComponentType",
      "registerUsageHoursBtn", "maiUsageWorkspace"
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
    return [
      "super_admin",
      "platform_owner",
      "company_admin",
      "company_superintendent"
    ].includes(role);
  }

  function roleIsVessel(role) {
    return role === "vessel";
  }

  function asDate(value) {
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

  function lifecycleClass(status) {
    if (["overdue", "retire_now", "action_required"].includes(status)) return "pill-danger";
    if (status === "due_soon") return "pill-warn";
    if (status === "ok") return "pill-ok";
    return "";
  }

  function lockClass(status) {
    return status === "locked" ? "pill-muted" : "pill-warn";
  }

  function usageFor(componentId) {
    return state.usage.find((r) => r.component_id === componentId) || null;
  }

  function lockFor(componentId) {
    return state.locks.find((r) => r.component_id === componentId) || null;
  }

  function lifecycleRowsFor(componentId) {
    return state.lifecycle
      .filter((r) => r.component_id === componentId)
      .sort((a, b) => {
        const p = lifecyclePriority(b.lifecycle_status) - lifecyclePriority(a.lifecycle_status);
        if (p !== 0) return p;
        return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      });
  }

  function nextLifecycle(componentId) {
    const rows = lifecycleRowsFor(componentId);
    const actionable = rows.find((r) =>
      ["retire_now", "overdue", "action_required", "due_soon"].includes(r.lifecycle_status)
    );
    return actionable || rows[0] || null;
  }

  async function loadBaseData() {
    const [
      vesselRes,
      typeRes,
      statusRes,
      componentRes,
      lifecycleRes,
      usageRes,
      lockRes
    ] = await Promise.all([
      (state.isVesselViewer
        ? state.sb.from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true).eq("id", state.profile?.vessel_id || "00000000-0000-0000-0000-000000000000")
        : state.sb.from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true)).order("name"),
      state.sb.from("mai_component_types").select("id, code, name, company_id, is_active, sort_order").eq("is_active", true).order("sort_order"),
      state.sb.from("mai_status_options").select("status_key, status_label, is_terminal, is_active, sort_order").eq("is_active", true).order("sort_order"),
      (state.isVesselViewer
        ? state.sb.from("mai_v_components_list").select("*").eq("vessel_id", state.profile?.vessel_id || "00000000-0000-0000-0000-000000000000")
        : state.sb.from("mai_v_components_list").select("*")).order("updated_at", { ascending: false }),
      state.sb.from("mai_v_component_lifecycle_status").select("*").order("sort_order"),
      state.sb.from("mai_v_component_usage_summary").select("*"),
      state.sb.from("mai_v_component_particulars_lock_status").select("*")
    ]);

    for (const res of [vesselRes, typeRes, statusRes, componentRes, lifecycleRes, usageRes, lockRes]) {
      if (res.error) throw res.error;
    }

    state.vessels = vesselRes.data || [];
    state.types = typeRes.data || [];
    state.statuses = statusRes.data || [];
    state.components = (componentRes.data || []).filter((row) =>
      !state.isVesselViewer || row.vessel_id === state.profile?.vessel_id);
    state.lifecycle = lifecycleRes.data || [];
    state.usage = usageRes.data || [];
    state.locks = lockRes.data || [];

    initializeSelections();
  }

  function visibleVesselIds() {
    // Include accessible active vessels even when no component is registered yet.
    return state.vessels.map((vessel) => vessel.id);
  }

  function visibleTypeIds() {
    return [...new Set(state.components.map((c) => c.component_type_id).filter(Boolean))];
  }

  function visibleStatusKeys() {
    return [...new Set(state.components.map((c) => c.current_status).filter(Boolean))];
  }

  function initializeSelections() {
    const allowedIds = new Set(visibleVesselIds());
    if (!state.selectionsInitialized) {
      visibleTypeIds().forEach((id) => state.selectedTypes.add(id));
      visibleStatusKeys().forEach((key) => state.selectedStatuses.add(key));
      state.selectionsInitialized = true;
      if (canChooseVesselContext()) {
        try {
          const saved = JSON.parse(sessionStorage.getItem(state.contextStorageKey) || "null");
          if (saved && ["all", "single", "multiple"].includes(saved.mode) && Array.isArray(saved.ids)) {
            state.contextMode = saved.mode;
            state.selectedVessels = new Set(saved.ids.filter((id) => allowedIds.has(id)));
            state.perspective = saved.perspective === "type" ? "type" : "vessel";
            state.contextTypeId = typeof saved.typeId === "string" ? saved.typeId : "";
            state.byVesselContext = saved.byVesselContext || null;
            state.byVesselTypes = Array.isArray(saved.byVesselTypes) ? saved.byVesselTypes : null;
          }
        } catch (_) { /* Storage is optional; current server data remains authoritative. */ }
      } else {
        state.perspective = "vessel";
        state.contextMode = state.isVesselViewer ? "single" : "all";
      }
    }
    // Revalidate restored/current context against every fresh authorized lookup.
    state.selectedVessels = new Set([...state.selectedVessels].filter((id) => allowedIds.has(id)));
    if (state.contextMode === "all") state.selectedVessels = allowedIds;
    if (state.isVesselViewer) {
      state.perspective = "vessel";
      state.contextTypeId = "";
      state.selectedVessels = new Set(
        allowedIds.has(state.profile?.vessel_id) ? [state.profile.vessel_id] : []);
    }
    if (state.perspective === "type") {
      if (!state.types.some((type) => type.id === state.contextTypeId)) state.contextTypeId = "";
      state.selectedTypes = new Set(state.contextTypeId ? [state.contextTypeId] : []);
    }
  }

  function canChooseVesselContext() {
    // Context selection is not an edit privilege. Non-onboard accounts still
    // need the unchanged module/action guards and backend authorization.
    return !!state.profile?.role && !state.isVesselViewer;
  }

  function selectedContextVessel() {
    if (!state.loaded) return "";
    if (state.isVesselViewer) {
      return state.vessels.some((vessel) => vessel.id === state.profile?.vessel_id)
        ? state.profile.vessel_id : "";
    }
    if (!canChooseVesselContext() || state.selectedVessels.size !== 1) return "";
    const [id] = state.selectedVessels;
    return state.vessels.some((vessel) => vessel.id === id) ? id : "";
  }

  function persistContext() {
    if (!canChooseVesselContext() || !state.loaded) return;
    try {
      sessionStorage.setItem(state.contextStorageKey, JSON.stringify({
        mode: state.contextMode, ids: [...state.selectedVessels],
        perspective: state.perspective, typeId: state.contextTypeId,
        byVesselContext: state.byVesselContext, byVesselTypes: state.byVesselTypes
      }));
    } catch (_) { /* Context still works for this page if browser storage is blocked. */ }
  }

  function renderContext() {
    const office = canChooseVesselContext() && state.loaded;
    const typeView = office && state.perspective === "type";
    el.maiOfficePerspective.hidden = !office;
    el.maiPerspectiveVessel.checked = state.perspective === "vessel";
    el.maiPerspectiveType.checked = state.perspective === "type";
    el.maiTypeContext.hidden = !typeView;
    el.maiOfficeContext.hidden = !office || !state.perspective;
    if (state.usageVesselId) {
      el.maiOfficePerspective.hidden = el.maiTypeContext.hidden = el.maiOfficeContext.hidden = true;
    }
    el.maiContextComponentType.innerHTML = '<option value="">Select component type...</option>' +
      state.types.map((type) => `<option value="${esc(type.id)}">${esc(type.name || type.code || "Component type")}</option>`).join("");
    el.maiContextComponentType.value = state.contextTypeId;
    el.maiContextMode.value = state.contextMode;
    el.maiSingleContextWrap.hidden = state.contextMode !== "single";
    el.maiMultiContextWrap.hidden = state.contextMode !== "multiple";
    $("vesselDropdown").hidden = !canChooseVesselContext();
    const options = '<option value="">Select vessel...</option>' + state.vessels
      .map((vessel) => `<option value="${esc(vessel.id)}">${esc(vessel.name || "Unnamed vessel")}</option>`).join("");
    el.maiContextSingleVessel.innerHTML = options;
    el.maiContextSingleVessel.value = selectedContextVessel();
    const names = state.vessels.filter((vessel) => state.selectedVessels.has(vessel.id))
      .map((vessel) => vessel.name || "Unnamed vessel");
    const selectedType = state.types.find((type) => type.id === state.contextTypeId);
    const ready = state.loaded && state.perspective !== "" &&
      (!typeView || !!selectedType) && state.contextMode !== "" && names.length > 0;
    const scope = !names.length ? "No accessible vessels selected"
      : state.contextMode === "all" ? "All accessible vessels"
      : names.length === 1 ? names[0] : `${names.length} vessels — ${names.join(", ")}`;
    el.maiCurrentContext.textContent = !state.loaded ? "Loading vessel context…"
      : !state.perspective ? "Choose how you want to view the inventory."
      : typeView ? `Current view: By Component Type — ${selectedType?.name || selectedType?.code || "Choose component type"} — ${scope}`
      : `Current view: By Vessel — ${state.contextMode ? scope : "Choose vessel context"}`;
    if (state.usageVesselId) {
      el.maiCurrentContext.textContent = `Current task: Register Usage Hours — ${state.vessels.find(v => v.id===state.usageVesselId)?.name || "Selected vessel"}`;
    }
    if (el.maiInventoryWorkspace.hidden) el.maiTaskLanding.hidden = !ready || !!state.usageVesselId;
    el.viewInventoryBtn.disabled = !ready;
    el.reviewDueBtn.disabled = !ready;
    el.registerUsageHoursBtn.disabled = !ready;
    el.selectAllTypesBtn.disabled = typeView;
    el.clearTypesBtn.disabled = typeView;
  }

  function contextChanged() {
    persistContext();
    renderContext();
    renderVesselChecks();
    renderTypeChecks();
    renderTable();
  }

  function finishVesselChoice(vesselId = "") {
    const resolve = state.pendingVesselChoice;
    state.pendingVesselChoice = null;
    el.maiSingleVesselDialog.close();
    resolve?.(vesselId);
  }

  async function requireSingleVessel(taskLabel) {
    const current = selectedContextVessel();
    if (current && (!canChooseVesselContext() ||
      (state.perspective === "vessel" && state.contextMode === "single"))) return current;
    if (!state.loaded || !canChooseVesselContext() || !state.vessels.length) {
      toast("warn", "No authorized vessel context is available for this task.");
      return "";
    }
    if (state.pendingVesselChoice) return "";
    el.maiSingleVesselReason.textContent = `${taskLabel} requires exactly one vessel. Choose a vessel to continue.`;
    el.maiTaskVessel.innerHTML = '<option value="">Select vessel...</option>' + state.vessels
      .map((vessel) => `<option value="${esc(vessel.id)}">${esc(vessel.name || "Unnamed vessel")}</option>`).join("");
    el.maiTaskVesselError.textContent = "";
    return new Promise((resolve) => {
      state.pendingVesselChoice = resolve;
      el.maiSingleVesselDialog.showModal();
      el.maiTaskVessel.focus();
    });
  }

  function showInventory(dueOnly = false) {
    if (!state.loaded || !state.perspective || !state.selectedVessels.size ||
      (state.perspective === "type" && !state.contextTypeId)) return;
    state.dueOnly = dueOnly;
    el.maiTaskLanding.hidden = true;
    el.maiInventoryWorkspace.hidden = false;
    renderTable();
    el.backToTasksBtn.focus();
  }

  async function openManualUsage(options = {}) {
    const vesselId = options.vesselId || await requireSingleVessel("Register Usage Hours");
    if (!vesselId || !state.vessels.some(v => v.id===vesselId)) return;
    if (!window.CSVB_MAI_MANUAL_USAGE) {
      toast("warn", "Usage-hours workspace is not ready. Please reload the page.");
      return;
    }
    state.usageVesselId = vesselId;
    el.maiTaskLanding.hidden = el.maiInventoryWorkspace.hidden = true;
    el.maiUsageWorkspace.hidden = false;
    renderContext();
    await window.CSVB_MAI_MANUAL_USAGE.open({vesselId,componentId:options.componentId || "",client:state.sb});
  }

  function closeManualUsage(inventory = false) {
    state.usageVesselId = "";
    el.maiUsageWorkspace.hidden = true;
    renderContext();
    if (inventory) showInventory();
    else if (!el.maiTaskLanding.hidden) el.registerUsageHoursBtn.focus();
  }

  function renderViewerMode() {
    const role = state.profile?.role || "";

    if (state.isOfficeViewer) {
      el.viewerMode.textContent = "Office Viewer";
      el.viewerHint.textContent = "Office users can view all accessible vessel inventories and filter by vessel/component type/status.";
      return;
    }

    if (state.isVesselViewer) {
      el.viewerMode.textContent = "Vessel Viewer";
      el.viewerHint.textContent = "Vessel users can view only their own vessel inventory. Vessel filter is locked by permissions.";
      return;
    }

    el.viewerMode.textContent = `Role: ${role || "unknown"}`;
    el.viewerHint.textContent = "Viewer mode determined from current user role and RLS.";
  }

  function summaryText(selectedSet, total, allLabel) {
    if (total <= 0) return "None";
    if (selectedSet.size === 0) return "None";
    if (selectedSet.size >= total) return allLabel;
    return `${selectedSet.size} selected`;
  }

  function updateSummaries() {
    el.vesselSummary.textContent = summaryText(state.selectedVessels, visibleVesselIds().length, "All");
    el.typeSummary.textContent = summaryText(state.selectedTypes, visibleTypeIds().length, "All");
    if (state.perspective === "type") {
      el.typeSummary.textContent = state.types.find((type) => type.id === state.contextTypeId)?.name || "Select type";
    }
    el.statusSummary.textContent = summaryText(state.selectedStatuses, visibleStatusKeys().length, "All");
  }

  function renderVesselChecks() {
    const byId = new Map(state.vessels.map((v) => [v.id, v]));
    const rows = visibleVesselIds()
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    if (!rows.length) {
      el.vesselChecks.innerHTML = `<div class="muted">No vessels found.</div>`;
      return;
    }

    el.vesselChecks.innerHTML = rows.map((v) => {
      const checked = state.selectedVessels.has(v.id) ? " checked" : "";
      const disabled = state.isVesselViewer ? " disabled" : "";
      return `
        <label class="check-line">
          <input type="checkbox" data-vessel-check="${esc(v.id)}"${checked}${disabled} />
          <span>
            <div class="check-title">${esc(v.name || "Unnamed Vessel")}</div>
            <div class="check-sub">Hull: ${esc(v.hull_number || "—")} / IMO: ${esc(v.imo_number || "—")}</div>
          </span>
        </label>
      `;
    }).join("");

    el.vesselChecks.querySelectorAll("[data-vessel-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-vessel-check");
        if (input.checked) state.selectedVessels.add(id);
        else state.selectedVessels.delete(id);
        state.contextMode = "multiple";
        contextChanged();
      });
    });
  }

  function renderTypeChecks() {
    const byId = new Map(state.types.map((t) => [t.id, t]));
    const rows = (state.perspective === "type" ? [state.contextTypeId] : visibleTypeIds())
      .map((id) => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

    if (!rows.length) {
      el.typeChecks.innerHTML = `<div class="muted">No component types found.</div>`;
      return;
    }

    el.typeChecks.innerHTML = rows.map((t) => {
      const checked = state.selectedTypes.has(t.id) ? " checked" : "";
      return `
        <label class="check-line">
          <input type="checkbox" data-type-check="${esc(t.id)}"${checked}${state.perspective === "type" ? " disabled" : ""} />
          <span>
            <div class="check-title">${esc(t.code || "")}</div>
            <div class="check-sub">${esc(t.name || "")}</div>
          </span>
        </label>
      `;
    }).join("");

    el.typeChecks.querySelectorAll("[data-type-check]").forEach((input) => {
      input.addEventListener("change", () => {
        if (state.perspective === "type") return;
        const id = input.getAttribute("data-type-check");
        if (input.checked) state.selectedTypes.add(id);
        else state.selectedTypes.delete(id);
        updateSummaries();
        renderTable();
      });
    });
  }

  function renderStatusChecks() {
    const visible = new Set(visibleStatusKeys());

    const rows = state.statuses
      .filter((s) => visible.has(s.status_key))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

    if (!rows.length) {
      el.statusChecks.innerHTML = `<div class="muted">No statuses found.</div>`;
      return;
    }

    el.statusChecks.innerHTML = rows.map((s) => {
      const checked = state.selectedStatuses.has(s.status_key) ? " checked" : "";
      return `
        <label class="check-line">
          <input type="checkbox" data-status-check="${esc(s.status_key)}"${checked} />
          <span>
            <div class="check-title">${esc(s.status_label || s.status_key)}</div>
            <div class="check-sub">${esc(s.status_key)}</div>
          </span>
        </label>
      `;
    }).join("");

    el.statusChecks.querySelectorAll("[data-status-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-status-check");
        if (input.checked) state.selectedStatuses.add(key);
        else state.selectedStatuses.delete(key);
        updateSummaries();
        renderTable();
      });
    });
  }

  function filteredComponents() {
    const q = String(el.searchInput.value || "").trim().toLowerCase();

    return state.components.filter((c) => {
      if (state.perspective === "type" && c.component_type_id !== state.contextTypeId) return false;
      if (!state.selectedVessels.has(c.vessel_id)) return false;
      if (!state.selectedTypes.has(c.component_type_id)) return false;
      if (!state.selectedStatuses.has(c.current_status)) return false;
      if (state.dueOnly && !["overdue", "retire_now", "action_required", "due_soon"]
        .includes(nextLifecycle(c.id)?.lifecycle_status)) return false;

      if (q) {
        const next = nextLifecycle(c.id);
        const haystack = [
          c.unique_id,
          c.vessel_name,
          c.hull_number,
          c.component_type_code,
          c.component_type_name,
          c.order_number,
          c.current_status_label,
          c.current_location_detail,
          next?.rule_label,
          next?.lifecycle_status
        ].map((x) => String(x || "").toLowerCase()).join(" | ");

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }

  function renderStats(rows) {
    const terminalStatuses = new Set(
      state.statuses.filter((s) => s.is_terminal).map((s) => s.status_key)
    );

    const active = rows.filter((c) => !terminalStatuses.has(c.current_status)).length;
    const locked = rows.filter((c) => lockFor(c.id)?.particulars_lock_status === "locked").length;

    const due = rows.filter((c) => {
      const n = nextLifecycle(c.id);
      return ["overdue", "retire_now", "action_required", "due_soon"].includes(n?.lifecycle_status);
    }).length;

    el.statTotal.textContent = rows.length;
    el.statActive.textContent = active;
    el.statDue.textContent = due;
    el.statLocked.textContent = locked;
  }

  function renderTable() {
    const rows = filteredComponents();
    renderStats(rows);
    updateSummaries();

    el.listMeta.textContent = `${rows.length} record(s) shown from ${state.components.length} accessible record(s).${state.dueOnly ? " Due / overdue actions only." : ""}`;

    if (!rows.length) {
      el.componentsTbody.innerHTML = `<tr><td colspan="9" class="empty-cell">No components match current filters.</td></tr>`;
      return;
    }

    el.componentsTbody.innerHTML = rows.map((c) => {
      const usage = usageFor(c.id);
      const lock = lockFor(c.id);
      const next = nextLifecycle(c.id);

      const lockStatus = lock?.particulars_lock_status || "unlocked";
      const lockHtml = `<span class="pill ${lockClass(lockStatus)}">${esc(lockStatus)}</span>`;

      const nextHtml = next
        ? `
          <div><span class="pill ${lifecycleClass(next.lifecycle_status)}">${esc(lifecycleLabel(next.lifecycle_status))}</span></div>
          <div class="muted">${esc(next.rule_label || next.rule_key || "—")}</div>
          <div class="muted">Due: ${esc(asDate(next.due_date))} / Hours left: ${esc(next.hours_remaining === null || next.hours_remaining === undefined ? "—" : asNumber(next.hours_remaining, 1))}</div>
        `
        : "—";

      return `
        <tr>
          <td>
            <div class="id-strong">${esc(c.unique_id)}</div>
            <div class="muted">Order: ${esc(c.order_number || "—")}</div>
          </td>
          <td>
            <div>${esc(c.vessel_name || "—")}</div>
            <div class="muted">Hull: ${esc(c.hull_number || "—")}</div>
          </td>
          <td>
            <div>${esc(c.component_type_code || "—")}</div>
            <div class="muted">${esc(c.component_type_name || "")}</div>
          </td>
          <td><span class="pill">${esc(c.current_status_label || c.current_status || "—")}</span></td>
          <td>${lockHtml}</td>
          <td>
            <div>${esc(c.location_mode || "—")}</div>
            <div class="muted">${esc(c.current_location_detail || "—")}</div>
          </td>
          <td>
            <div>${esc(asNumber(usage?.total_lifecycle_hours || 0, 1))}</div>
            <div class="muted">${esc(usage?.usage_log_count || 0)} usage record(s)</div>
          </td>
          <td>${nextHtml}</td>
          <td>
            <button class="btn2 compact" type="button" onclick="location.href='./mooring-anchoring-component.html?id=${esc(c.id)}'">
              Open Component
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function closeAllDropdowns(except = "") {
    document.querySelectorAll(".dropdown-filter").forEach((box) => {
      if (except && box.id === except) return;
      box.classList.remove("open");
      box.querySelector("[data-dropdown-toggle]")?.setAttribute("aria-expanded", "false");
    });
  }

  function bindDropdowns() {
    document.querySelectorAll("[data-dropdown-toggle]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();

        const key = btn.getAttribute("data-dropdown-toggle");
        const box = $(`${key}Dropdown`);

        if (!box) return;

        const wasOpen = box.classList.contains("open");
        closeAllDropdowns();
        box.classList.toggle("open", !wasOpen);
        btn.setAttribute("aria-expanded", String(!wasOpen));
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".dropdown-filter")) {
        closeAllDropdowns();
      }
    });
  }

  function bindEvents() {
    el.viewInventoryBtn.addEventListener("click", () => showInventory());
    el.reviewDueBtn.addEventListener("click", () => showInventory(true));
    el.backToTasksBtn.addEventListener("click", () => {
      el.maiInventoryWorkspace.hidden = true;
      renderContext();
      if (!el.maiTaskLanding.hidden) el.viewInventoryBtn.focus();
      else el.maiContextMode.focus();
    });
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));

    el.recordOperationBtn.addEventListener("click", async () => {
      const vesselId = await requireSingleVessel("Record Mooring / Anchoring Use");
      if (!vesselId) return;
      location.href = `./mooring-anchoring-operations.html?vessel_id=${encodeURIComponent(vesselId)}`;
    });
    el.registerUsageHoursBtn.addEventListener("click", () => openManualUsage().catch(handleError));

    function changePerspective(perspective) {
      if (!canChooseVesselContext() || state.perspective === perspective) return;
      if (perspective === "type") {
        state.byVesselContext = {mode: state.contextMode, ids: [...state.selectedVessels]};
        state.byVesselTypes = [...state.selectedTypes];
        state.contextMode = "all";
        state.selectedVessels = new Set(visibleVesselIds());
        state.selectedTypes = new Set(state.contextTypeId ? [state.contextTypeId] : []);
      } else {
        const saved = state.byVesselContext;
        state.contextMode = ["all", "single", "multiple"].includes(saved?.mode) ? saved.mode : "";
        state.selectedVessels = new Set(Array.isArray(saved?.ids)
          ? saved.ids.filter((id) => state.vessels.some((vessel) => vessel.id === id)) : []);
        if (state.contextMode === "all") state.selectedVessels = new Set(visibleVesselIds());
        state.selectedTypes = new Set((state.byVesselTypes || visibleTypeIds())
          .filter((id) => state.types.some((type) => type.id === id)));
      }
      state.perspective = perspective;
      contextChanged();
    }
    el.maiPerspectiveVessel.addEventListener("change", () => changePerspective("vessel"));
    el.maiPerspectiveType.addEventListener("change", () => changePerspective("type"));
    el.maiContextComponentType.addEventListener("change", () => {
      if (!canChooseVesselContext() || state.perspective !== "type") return;
      const id = el.maiContextComponentType.value;
      state.contextTypeId = state.types.some((type) => type.id === id) ? id : "";
      state.selectedTypes = new Set(state.contextTypeId ? [state.contextTypeId] : []);
      contextChanged();
    });

    el.maiContextMode.addEventListener("change", () => {
      state.contextMode = el.maiContextMode.value;
      if (state.contextMode === "all") state.selectedVessels = new Set(visibleVesselIds());
      else if (state.contextMode === "" || (state.contextMode === "single" && state.selectedVessels.size !== 1)) {
        state.selectedVessels.clear();
      }
      contextChanged();
    });
    el.maiContextSingleVessel.addEventListener("change", () => {
      const id = el.maiContextSingleVessel.value;
      state.selectedVessels = new Set(state.vessels.some((vessel) => vessel.id === id) ? [id] : []);
      contextChanged();
    });
    el.maiTaskVesselCancel.addEventListener("click", () => finishVesselChoice());
    el.maiSingleVesselDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finishVesselChoice();
    });
    el.maiTaskVesselContinue.addEventListener("click", () => {
      const id = el.maiTaskVessel.value;
      if (!state.vessels.some((vessel) => vessel.id === id)) {
        el.maiTaskVesselError.textContent = "Select one accessible vessel to continue.";
        return;
      }
      if (state.perspective !== "type") {
        state.contextMode = "single";
        state.selectedVessels = new Set([id]);
        contextChanged();
      }
      finishVesselChoice(id);
    });

    el.selectAllVesselsBtn.addEventListener("click", () => {
      if (state.isVesselViewer) return;
      state.contextMode = "multiple";
      visibleVesselIds().forEach((id) => state.selectedVessels.add(id));
      contextChanged();
    });

    el.clearVesselsBtn.addEventListener("click", () => {
      if (state.isVesselViewer) return;
      state.contextMode = "multiple";
      state.selectedVessels.clear();
      contextChanged();
    });

    el.selectAllTypesBtn.addEventListener("click", () => {
      if (state.perspective === "type") return;
      visibleTypeIds().forEach((id) => state.selectedTypes.add(id));
      renderTypeChecks();
      renderTable();
    });

    el.clearTypesBtn.addEventListener("click", () => {
      if (state.perspective === "type") return;
      state.selectedTypes.clear();
      renderTypeChecks();
      renderTable();
    });

    el.selectAllStatusesBtn.addEventListener("click", () => {
      visibleStatusKeys().forEach((key) => state.selectedStatuses.add(key));
      renderStatusChecks();
      renderTable();
    });

    el.clearStatusesBtn.addEventListener("click", () => {
      state.selectedStatuses.clear();
      renderStatusChecks();
      renderTable();
    });

    el.searchInput.addEventListener("input", renderTable);

    el.clearSearchBtn.addEventListener("click", () => {
      state.dueOnly = false;
      state.selectedTypes.clear();
      state.selectedStatuses.clear();
      (state.perspective === "type" ? [state.contextTypeId] : visibleTypeIds())
        .filter(Boolean).forEach((id) => state.selectedTypes.add(id));
      visibleStatusKeys().forEach((key) => state.selectedStatuses.add(key));
      el.searchInput.value = "";
      renderVesselChecks();
      renderTypeChecks();
      renderStatusChecks();
      renderTable();
    });

    bindDropdowns();
  }

  function handleError(error) {
    console.error(error);
    toast("warn", String(error?.message || error || "Unknown error"));
  }

  async function reload() {
    await loadBaseData();
    state.loaded = true;
    renderContext();
    persistContext();
    renderViewerMode();
    renderVesselChecks();
    renderTypeChecks();
    renderStatusChecks();
    renderTable();
    toast("ok", "Inventory list reloaded.");
  }

  async function init() {
    window.CSVB_MAI_INVENTORY_LIST_V4_BUILD = BUILD;

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
      el.viewerMode.textContent = "Signed out";
      el.viewerHint.textContent = "Log in to access your authorized vessel inventory and tasks.";
      el.maiCurrentContext.textContent = "Log in to resolve your vessel context.";
      toast("warn", "You are logged out. Please login.");
      return;
    }

    state.profile = bundle.profile || {};
    state.isOfficeViewer = roleIsOffice(state.profile.role);
    state.isVesselViewer = roleIsVessel(state.profile.role);
    state.contextStorageKey = `csvb_mai_context_v1:${bundle.session.user.id}:${state.profile.company_id || "platform"}`;
    $("vesselDropdown").hidden = !canChooseVesselContext();
    window.CSVB_MAI_INVENTORY_CONTEXT = Object.freeze({
      selectedVesselId: selectedContextVessel,
      requireSingleVessel,
      closeManualUsage,
      refresh: reload
    });

    await reload();
    const requested = new URLSearchParams(location.search).get("usage_component_id");
    if (requested) {
      const component = state.components.find(c => c.id===requested);
      if (!component || !state.vessels.some(v => v.id===component.vessel_id)) {
        toast("warn","That component is not available in your authorized inventory.");
      } else {
        if (!state.perspective || !state.selectedVessels.size) {
          state.perspective="vessel"; state.contextMode="single";
          state.selectedVessels=new Set([component.vessel_id]); contextChanged();
        }
        await openManualUsage({vesselId:component.vessel_id,componentId:requested});
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();
