// public/mooring-anchoring-inventories-v4.js
// C.S.V. BEACON – MAI Inventory List v4

(() => {
  "use strict";

  const BUILD = "MAI-INVENTORY-LIST-V4-20260511-1";
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
    selectedTypes: new Set()
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
      "vesselChecks", "typeChecks",
      "selectAllVesselsBtn", "clearVesselsBtn",
      "selectAllTypesBtn", "clearTypesBtn",
      "statusFilter", "searchInput", "clearSearchBtn",
      "listMeta", "componentsTbody"
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

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
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
      state.sb.from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true).order("name"),
      state.sb.from("mai_component_types").select("id, code, name, company_id, is_active, sort_order").eq("is_active", true).order("sort_order"),
      state.sb.from("mai_status_options").select("status_key, status_label, is_terminal, is_active, sort_order").eq("is_active", true).order("sort_order"),
      state.sb.from("mai_v_components_list").select("*").order("updated_at", { ascending: false }),
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
    state.components = componentRes.data || [];
    state.lifecycle = lifecycleRes.data || [];
    state.usage = usageRes.data || [];
    state.locks = lockRes.data || [];

    initializeSelections();
  }

  function initializeSelections() {
    const visibleVesselIds = new Set(state.components.map((c) => c.vessel_id).filter(Boolean));
    const visibleTypeIds = new Set(state.components.map((c) => c.component_type_id).filter(Boolean));

    if (!state.selectedVessels.size) {
      visibleVesselIds.forEach((id) => state.selectedVessels.add(id));
    }

    if (!state.selectedTypes.size) {
      visibleTypeIds.forEach((id) => state.selectedTypes.add(id));
    }
  }

  function renderViewerMode() {
    const role = state.profile?.role || "";

    if (state.isOfficeViewer) {
      el.viewerMode.textContent = "Office Viewer";
      el.viewerHint.textContent = "Office users can view all accessible vessel inventories and filter by vessel/component type.";
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

  function renderStatusFilter() {
    el.statusFilter.innerHTML = [`<option value="">All statuses</option>`]
      .concat(state.statuses.map((s) => `<option value="${esc(s.status_key)}">${esc(s.status_label || s.status_key)}</option>`))
      .join("");
  }

  function renderVesselChecks() {
    const byId = new Map(state.vessels.map((v) => [v.id, v]));
    const vesselIds = [...new Set(state.components.map((c) => c.vessel_id).filter(Boolean))];

    const rows = vesselIds
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
        renderTable();
      });
    });
  }

  function renderTypeChecks() {
    const byId = new Map(state.types.map((t) => [t.id, t]));
    const typeIds = [...new Set(state.components.map((c) => c.component_type_id).filter(Boolean))];

    const rows = typeIds
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
          <input type="checkbox" data-type-check="${esc(t.id)}"${checked} />
          <span>
            <div class="check-title">${esc(t.code || "")}</div>
            <div class="check-sub">${esc(t.name || "")}</div>
          </span>
        </label>
      `;
    }).join("");

    el.typeChecks.querySelectorAll("[data-type-check]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-type-check");
        if (input.checked) state.selectedTypes.add(id);
        else state.selectedTypes.delete(id);
        renderTable();
      });
    });
  }

  function filteredComponents() {
    const status = el.statusFilter.value || "";
    const q = String(el.searchInput.value || "").trim().toLowerCase();

    return state.components.filter((c) => {
      if (!state.selectedVessels.has(c.vessel_id)) return false;
      if (!state.selectedTypes.has(c.component_type_id)) return false;
      if (status && c.current_status !== status) return false;

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

    el.listMeta.textContent = `${rows.length} record(s) shown from ${state.components.length} accessible record(s).`;

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

  function bindEvents() {
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));

    el.recordOperationBtn.addEventListener("click", () => {
      toast("info", "Vessel operation recording UI will be added in Frontend 4-C.");
    });

    el.registerComponentBtn.addEventListener("click", () => {
      location.href = "./mooring-anchoring-inventories.html";
    });

    el.selectAllVesselsBtn.addEventListener("click", () => {
      if (state.isVesselViewer) return;
      state.components.forEach((c) => state.selectedVessels.add(c.vessel_id));
      renderVesselChecks();
      renderTable();
    });

    el.clearVesselsBtn.addEventListener("click", () => {
      if (state.isVesselViewer) return;
      state.selectedVessels.clear();
      renderVesselChecks();
      renderTable();
    });

    el.selectAllTypesBtn.addEventListener("click", () => {
      state.components.forEach((c) => state.selectedTypes.add(c.component_type_id));
      renderTypeChecks();
      renderTable();
    });

    el.clearTypesBtn.addEventListener("click", () => {
      state.selectedTypes.clear();
      renderTypeChecks();
      renderTable();
    });

    el.statusFilter.addEventListener("change", renderTable);
    el.searchInput.addEventListener("input", renderTable);

    el.clearSearchBtn.addEventListener("click", () => {
      el.statusFilter.value = "";
      el.searchInput.value = "";
      renderTable();
    });
  }

  function handleError(error) {
    console.error(error);
    toast("warn", String(error?.message || error || "Unknown error"));
  }

  async function reload() {
    await loadBaseData();
    renderViewerMode();
    renderStatusFilter();
    renderVesselChecks();
    renderTypeChecks();
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
      toast("warn", "You are logged out. Please login.");
      return;
    }

    state.profile = bundle.profile || {};
    state.isOfficeViewer = roleIsOffice(state.profile.role);
    state.isVesselViewer = roleIsVessel(state.profile.role);

    await reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();
