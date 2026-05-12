// public/mooring-anchoring-component.js
// C.S.V. BEACON – MAI Component Detail v4-B

(() => {
  "use strict";

  const BUILD = "MAI-COMPONENT-DETAIL-U09C-OFFICE-LOCK-ONLY";

  const state = {
    sb: null,
    profile: null,
    componentId: "",
    component: null,
    fields: [],
    fieldValues: {},
    lifecycleRows: [],
    usageRows: [],
    checklistRuns: [],
    attachments: [],
    lock: null
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn",
      "detailTitle", "detailSubtitle",
      "mainInfoBox", "lockStatusBox", "dynamicFields",
      "saveFieldsBtn", "completeLockBtn", "unlockBtn", "lockBtn",
      "lifecycleStatusTbody",
      "initialHours", "initialHoursDate", "initialHoursRemarks", "recordInitialHoursBtn",
      "usageHistory",
      "lifecycleEventType", "lifecycleEventDate", "lifecyclePerformedBy", "lifecycleRemarks", "recordLifecycleEventBtn",
      "lifecycleEventHistory",
      "checklistRunsHistory",
      "attachmentsBox"
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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
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
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return String(value);
    }
  }

  function asNumber(value, decimals = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  }

  function lifecycleClass(status) {
    if (["overdue", "retire_now", "action_required"].includes(status)) return "pill-danger";
    if (status === "due_soon") return "pill-warn";
    if (status === "ok") return "pill-ok";
    if (status === "completed") return "pill-muted";
    return "";
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

  function lockClass(status) {
    return status === "locked" ? "pill-muted" : "pill-warn";
  }

  function roleIsOffice(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role);
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadComponent() {
    const { data, error } = await state.sb
      .from("mai_v_components_list")
      .select("*")
      .eq("id", state.componentId)
      .limit(1)
      .single();

    if (error) throw error;
    state.component = data;
  }

  async function loadFields() {
    const c = state.component;

    const fields = await rpc("mai_get_effective_fields", {
      p_company_id: c.company_id,
      p_component_type_id: c.component_type_id
    });

    state.fields = fields || [];

    const { data, error } = await state.sb
      .from("mai_component_field_values")
      .select("field_definition_id, value_text, value_number, value_date, value_boolean, value_json")
      .eq("component_id", state.componentId);

    if (error) throw error;

    const byId = new Map((data || []).map((row) => [row.field_definition_id, row]));
    const values = {};

    state.fields.forEach((field) => {
      const row = byId.get(field.field_definition_id);
      if (!row) return;

      if (field.value_type === "number") values[field.field_key] = row.value_number;
      else if (field.value_type === "date") values[field.field_key] = row.value_date;
      else if (field.value_type === "boolean") values[field.field_key] = row.value_boolean;
      else if (field.value_type === "json" || field.value_type === "multiselect") values[field.field_key] = row.value_json;
      else values[field.field_key] = row.value_text;
    });

    state.fieldValues = values;
  }

  async function loadSupportingData() {
    const [
      lifecycleRes,
      usageRes,
      runRes,
      attachmentRes,
      lockRes
    ] = await Promise.all([
      state.sb.from("mai_v_component_lifecycle_status").select("*").eq("component_id", state.componentId).order("sort_order"),
      state.sb.from("mai_component_usage_logs").select("*").eq("component_id", state.componentId).order("operation_date", { ascending: false }).order("created_at", { ascending: false }),
      state.sb.from("mai_v_inspection_runs_list").select("*").eq("component_id", state.componentId).order("inspection_date", { ascending: false }).order("created_at", { ascending: false }),
      state.sb.from("mai_v_component_attachments_list").select("*").eq("component_id", state.componentId).order("uploaded_at", { ascending: false }),
      state.sb.from("mai_v_component_particulars_lock_status").select("*").eq("component_id", state.componentId).limit(1).maybeSingle()
    ]);

    for (const res of [lifecycleRes, usageRes, runRes, attachmentRes, lockRes]) {
      if (res.error) throw res.error;
    }

    state.lifecycleRows = lifecycleRes.data || [];
    state.usageRows = usageRes.data || [];
    state.checklistRuns = runRes.data || [];
    state.attachments = attachmentRes.data || [];
    state.lock = lockRes.data || null;
  }

  function renderMainInfo() {
    const c = state.component;

    el.detailTitle.textContent = c.unique_id || "Component Detail";
    el.detailSubtitle.textContent = `${c.vessel_name || "Vessel"} / ${c.component_type_code || "Type"} — ${c.component_type_name || ""}`;

    const rows = [
      ["Unique ID", c.unique_id],
      ["Company", c.company_name],
      ["Vessel", c.vessel_name],
      ["Hull Number", c.hull_number],
      ["Component Type", `${c.component_type_code || ""} — ${c.component_type_name || ""}`],
      ["Order Number", c.order_number],
      ["Sequence", c.sequence_number],
      ["Status", c.current_status_label || c.current_status],
      ["Location Mode", c.location_mode],
      ["Location Detail", c.current_location_detail],
      ["Notes", c.notes || "—"]
    ];

    el.mainInfoBox.innerHTML = rows
      .map(([k, v]) => `<div class="kv-key">${esc(k)}</div><div class="kv-value">${esc(v || "—")}</div>`)
      .join("");
  }

  function renderLockStatus() {
    const lock = state.lock || {};
    const status = lock.particulars_lock_status || "unlocked";
    const canEdit = lock.can_current_user_edit_particulars === true;

    el.lockStatusBox.innerHTML = `
      <div><span class="pill ${lockClass(status)}">${esc(status)}</span></div>
      <div class="mini-meta">Can current user edit particulars: <strong>${canEdit ? "Yes" : "No"}</strong></div>
      <div class="mini-meta">Completed: ${esc(asDateTime(lock.particulars_completed_at))} / By: ${esc(lock.completed_by_username || "—")}</div>
      <div class="mini-meta">Locked: ${esc(asDateTime(lock.particulars_locked_at))} / By: ${esc(lock.locked_by_username || "—")}</div>
      <div class="mini-meta">Lock reason: ${esc(lock.particulars_lock_reason || "—")}</div>
      <div class="mini-meta">Last unlock: ${esc(asDateTime(lock.particulars_unlocked_at))} / By: ${esc(lock.unlocked_by_username || "—")}</div>
      <div class="mini-meta">Unlock reason: ${esc(lock.particulars_unlock_reason || "—")}</div>
    `;

    const isOffice = roleIsOffice(state.profile?.role);

    el.saveFieldsBtn.disabled = !canEdit;

    // U-09C governance:
    // Vessel / onboard personnel may save particulars when allowed,
    // but only Office users may complete/lock/unlock component particulars.
    el.completeLockBtn.disabled = !isOffice || status === "locked";
    el.lockBtn.disabled = !isOffice || status === "locked";
    el.unlockBtn.disabled = !isOffice;

    el.completeLockBtn.style.display = isOffice ? "" : "none";
    el.lockBtn.style.display = isOffice ? "" : "none";
    el.unlockBtn.style.display = isOffice ? "" : "none";
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

  function renderDynamicFields() {
    const canEdit = state.lock?.can_current_user_edit_particulars === true;

    if (!state.fields.length) {
      el.dynamicFields.innerHTML = `<div class="hint-text">No editable fields configured for this component type.</div>`;
      return;
    }

    el.dynamicFields.innerHTML = state.fields.map((field) => {
      const key = field.field_key;
      const id = `field_${key}`.replaceAll(/[^A-Za-z0-9_\-]/g, "_");
      const current = state.fieldValues[key] ?? "";
      const label = `${field.field_label || key}${field.unit_label ? " (" + field.unit_label + ")" : ""}`;
      const disabled = canEdit ? "" : " disabled";
      const help = field.help_text ? `<div class="field-help">${esc(field.help_text)}</div>` : "";

      if (field.value_type === "textarea") {
        return `
          <label class="field">
            <span>${esc(label)}</span>
            <textarea id="${esc(id)}" data-dynamic-input="${esc(key)}"${disabled}>${esc(current)}</textarea>
            ${help}
          </label>
        `;
      }

      if (field.value_type === "select") {
        const opts = normalizeOptions(field.options);
        return `
          <label class="field">
            <span>${esc(label)}</span>
            <select id="${esc(id)}" data-dynamic-input="${esc(key)}"${disabled}>
              <option value="">Select...</option>
              ${opts.map((o) => optionHtml(o.value, o.label, current)).join("")}
            </select>
            ${help}
          </label>
        `;
      }

      return `
        <label class="field">
          <span>${esc(label)}</span>
          <input id="${esc(id)}" type="${esc(inputTypeForField(field))}" data-dynamic-input="${esc(key)}" value="${esc(valueToString(current))}"${disabled} />
          ${help}
        </label>
      `;
    }).join("");
  }

  function collectDynamicValues() {
    const values = {};
    el.dynamicFields.querySelectorAll("[data-dynamic-input]").forEach((input) => {
      const key = input.getAttribute("data-dynamic-input");
      values[key] = input.value === "" ? null : input.value;
    });
    return values;
  }

  function renderLifecycleStatus() {
    if (!state.lifecycleRows.length) {
      el.lifecycleStatusTbody.innerHTML = `<tr><td colspan="6" class="empty-cell">No lifecycle criteria found.</td></tr>`;
      return;
    }

    el.lifecycleStatusTbody.innerHTML = state.lifecycleRows.map((r) => {
      const limits = [
        r.date_limit_months !== null && r.date_limit_months !== undefined ? `${r.date_limit_months} months` : "",
        r.hours_limit !== null && r.hours_limit !== undefined ? `${asNumber(r.hours_limit, 0)} hours` : ""
      ].filter(Boolean).join(" / ") || "—";

      const base = [
        `Start: ${asDate(r.service_start_date)}`,
        r.reset_event_date ? `Reset: ${asDate(r.reset_event_date)}` : ""
      ].filter(Boolean).join(" / ");

      const hours = [
        `Used: ${asNumber(r.hours_since_base || 0, 1)}`,
        r.hours_remaining !== null && r.hours_remaining !== undefined ? `Left: ${asNumber(r.hours_remaining, 1)}` : ""
      ].filter(Boolean).join(" / ");

      return `
        <tr>
          <td>
            <strong>${esc(r.rule_label || r.rule_key)}</strong>
            <div class="muted">${esc(r.rule_group || "")} / ${esc(limits)}</div>
          </td>
          <td><span class="pill ${lifecycleClass(r.lifecycle_status)}">${esc(lifecycleLabel(r.lifecycle_status))}</span></td>
          <td>${esc(base || "—")}</td>
          <td>${esc(asDate(r.due_date))}</td>
          <td>${esc(hours || "—")}</td>
          <td>${esc(r.recommended_action || "—")}</td>
        </tr>
      `;
    }).join("");
  }

  function renderUsageHistory() {
    if (!state.usageRows.length) {
      el.usageHistory.innerHTML = `<div class="hint-text">No working-hours records yet.</div>`;
      return;
    }

    el.usageHistory.innerHTML = state.usageRows.map((u) => `
      <div class="mini-item">
        <div class="mini-title">${esc(u.operation_type || "usage")} — ${esc(asDate(u.operation_date))}</div>
        <div class="mini-meta">Hours: ${esc(asNumber(u.hours_under_tension || 0, 1))} / Source: ${esc(u.source_type || "manual")}</div>
        <div class="mini-meta">Port / Berth: ${esc(u.port_name || "—")} / ${esc(u.berth_or_terminal || "—")}</div>
        ${u.is_initial_balance ? `<div class="mini-meta"><span class="pill pill-warn">Initial balance</span></div>` : ""}
        ${u.remarks ? `<div class="mini-meta">${esc(u.remarks)}</div>` : ""}
      </div>
    `).join("");
  }

  function runStatusClass(status) {
    if (status === "completed") return "pill-muted";
    if (status === "draft") return "pill-warn";
    if (status === "voided") return "pill-danger";
    return "";
  }

  function renderChecklistRuns() {
    if (!state.checklistRuns.length) {
      el.checklistRunsHistory.innerHTML = `<div class="hint-text">No checklist runs yet.</div>`;
      return;
    }

    el.checklistRunsHistory.innerHTML = state.checklistRuns.map((r) => `
      <div class="mini-item">
        <div class="mini-title">
          ${esc(r.form_code || "")} — ${esc(r.template_title || "")}
          <span class="pill ${runStatusClass(r.run_status)}">${esc(r.run_status || "—")}</span>
        </div>
        <div class="mini-meta">Date: ${esc(asDate(r.inspection_date))} / Inspected by: ${esc(r.inspected_by || "—")}</div>
        <div class="mini-meta">Answered: ${esc(r.answered_items_count || 0)} / ${esc(r.total_score_items_count || 0)} / Average: ${esc(r.average_score === null || r.average_score === undefined ? "—" : asNumber(r.average_score, 2))}</div>
        ${r.calculated_condition ? `<div class="mini-meta">Condition: ${esc(r.calculated_condition)}</div>` : ""}
        ${r.calculated_recommendation ? `<div class="mini-meta">Recommendation: ${esc(r.calculated_recommendation)}</div>` : ""}
      </div>
    `).join("");
  }

  function renderAttachments() {
    if (!state.attachments.length) {
      el.attachmentsBox.innerHTML = `<div class="hint-text">No evidence files attached.</div>`;
      return;
    }

    el.attachmentsBox.innerHTML = state.attachments.map((a) => `
      <div class="mini-item">
        <div class="mini-title">${esc(a.file_name || "Evidence file")}</div>
        <div class="mini-meta">Context: ${esc(a.evidence_context || a.attachment_type || "—")} / Uploaded: ${esc(asDate(a.uploaded_at))}</div>
        <div class="mini-meta">By: ${esc(a.uploaded_by_username || "—")}</div>
      </div>
    `).join("");
  }

  function renderAll() {
    renderMainInfo();
    renderLockStatus();
    renderDynamicFields();
    renderLifecycleStatus();
    renderUsageHistory();
    renderChecklistRuns();
    renderAttachments();

    el.lifecycleEventDate.value = todayIso();
    el.initialHoursDate.value = todayIso();
  }

  async function reload() {
    await loadComponent();
    await loadFields();
    await loadSupportingData();
    renderAll();
  }

  async function saveFields() {
    const values = collectDynamicValues();

    await rpc("mai_save_component_field_values", {
      p_component_id: state.componentId,
      p_values: values
    });

    toast("ok", "Component particulars saved.");
    await reload();
  }

  async function completeAndLock() {
    if (!roleIsOffice(state.profile?.role)) {
      toast("warn", "Only Office users can complete and lock component particulars.");
      return;
    }

    const reason = prompt("Lock reason:", "Initial component particulars completed and locked.");
    if (reason === null) return;

    await rpc("mai_complete_component_particulars", {
      p_component_id: state.componentId,
      p_lock_reason: reason
    });

    toast("ok", "Component particulars completed and locked.");
    await reload();
  }

  async function lockParticulars() {
    if (!roleIsOffice(state.profile?.role)) {
      toast("warn", "Only Office users can lock component particulars.");
      return;
    }

    const reason = prompt("Lock reason:", "Component particulars locked.");
    if (reason === null) return;

    await rpc("mai_lock_component_particulars", {
      p_component_id: state.componentId,
      p_lock_reason: reason
    });

    toast("ok", "Component particulars locked.");
    await reload();
  }

  async function unlockParticulars() {
    if (!roleIsOffice(state.profile?.role)) {
      toast("warn", "Only Office users can unlock component particulars.");
      return;
    }

    const reason = prompt("Unlock reason:", "Component particulars unlocked by Office for correction.");
    if (reason === null) return;

    await rpc("mai_unlock_component_particulars", {
      p_component_id: state.componentId,
      p_unlock_reason: reason
    });

    toast("ok", "Component particulars unlocked.");
    await reload();
  }

  async function recordInitialHours() {
    const hours = Number(el.initialHours.value || 0);

    if (!Number.isFinite(hours) || hours < 0) {
      toast("warn", "Initial hours must be zero or higher.");
      return;
    }

    await rpc("mai_record_initial_component_hours", {
      p_component_id: state.componentId,
      p_hours: hours,
      p_as_of_date: el.initialHoursDate.value || todayIso(),
      p_remarks: el.initialHoursRemarks.value || null
    });

    toast("ok", "Initial working-hours balance recorded.");
    el.initialHours.value = "";
    el.initialHoursRemarks.value = "";
    await reload();
  }

  async function recordLifecycleEvent() {
    await rpc("mai_record_lifecycle_event", {
      p_component_id: state.componentId,
      p_event_type: el.lifecycleEventType.value,
      p_event_date: el.lifecycleEventDate.value || todayIso(),
      p_performed_by: null,
      p_source_type: "manual",
      p_related_inspection_id: null,
      p_related_usage_log_id: null,
      p_remarks: el.lifecycleRemarks.value || null
    });

    toast("ok", "Lifecycle event recorded.");
    el.lifecycleRemarks.value = "";
    await reload();
  }

  function bindEvents() {
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));
    el.saveFieldsBtn.addEventListener("click", () => saveFields().catch(handleError));
    el.completeLockBtn.addEventListener("click", () => completeAndLock().catch(handleError));
    el.lockBtn.addEventListener("click", () => lockParticulars().catch(handleError));
    el.unlockBtn.addEventListener("click", () => unlockParticulars().catch(handleError));
    el.recordInitialHoursBtn.addEventListener("click", () => recordInitialHours().catch(handleError));
    el.recordLifecycleEventBtn.addEventListener("click", () => recordLifecycleEvent().catch(handleError));
  }

  function handleError(error) {
    console.error(error);
    toast("warn", String(error?.message || error || "Unknown error"));
  }

  async function init() {
    window.CSVB_MAI_COMPONENT_DETAIL_BUILD = BUILD;

    cacheDom();
    bindEvents();

    const id = new URLSearchParams(location.search).get("id");
    if (!id) {
      toast("warn", "No component ID was supplied.");
      return;
    }

    state.componentId = id;
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

    await reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();
