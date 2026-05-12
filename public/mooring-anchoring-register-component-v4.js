/* public/mooring-anchoring-register-component-v4.js */
/* C.S.V. BEACON – MAI Register Component v4 Extension */
/* U-09B: restores component registration workflow into active v4 inventory page. */

(() => {
  "use strict";

  const BUILD = "MAI-REGISTER-COMPONENT-V4-U09B-20260512-1";
  const APP_MODULE_CODE = "MOORING_ANCHORING_INVENTORIES";

  const state = {
    sb: null,
    profile: null,
    canEditMai: false,
    vessels: [],
    types: [],
    statuses: [],
    locations: [],
    fields: [],
    installed: false
  };

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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box =
      type === "ok"
        ? $("okBox")
        : $("warnBox");

    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
      return;
    }

    alert(message);
  }

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function isOfficeRole(role) {
    return [
      "super_admin",
      "platform_owner",
      "company_admin",
      "company_superintendent"
    ].includes(role);
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function determineMaiEditPermission() {
    if (isPlatformRole(state.profile?.role)) return true;

    try {
      const rows = await rpc("csvb_my_effective_app_permissions");

      return (rows || []).some((row) => {
        return row.module_code === APP_MODULE_CODE &&
          row.permission_action === "edit" &&
          row.is_granted === true;
      });
    } catch (error) {
      console.warn("MAI register permission check failed:", error);
      return false;
    }
  }

  function addStyles() {
    if ($("maiRegisterV4Styles")) return;

    const style = document.createElement("style");
    style.id = "maiRegisterV4Styles";
    style.textContent = `
      .mai-register-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(3, 27, 63, .46);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow: auto;
        padding: 24px 10px;
      }

      .mai-register-modal {
        width: min(1120px, 96vw);
        background: #ffffff;
        border: 1px solid #c9d9ec;
        border-radius: 16px;
        box-shadow: 0 24px 72px rgba(3,27,63,.28);
        overflow: hidden;
      }

      .mai-register-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        padding: 12px 14px;
        border-bottom: 1px solid #dce8f6;
        background: linear-gradient(180deg, #fbfdff, #f4f8fc);
      }

      .mai-register-title {
        color: #062A5E;
        font-weight: 950;
        font-size: 1.08rem;
      }

      .mai-register-subtitle {
        color: #52677f;
        font-weight: 700;
        font-size: .84rem;
        margin-top: 3px;
        line-height: 1.35;
      }

      .mai-register-body {
        padding: 12px 14px;
      }

      .mai-register-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(220px, 1fr));
        gap: 10px;
      }

      .mai-register-grid .field-wide {
        grid-column: 1 / -1;
      }

      .mai-register-section-title {
        grid-column: 1 / -1;
        color: #062A5E;
        font-weight: 950;
        margin-top: 8px;
        padding-top: 10px;
        border-top: 1px solid #dce8f6;
      }

      .mai-register-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid #dce8f6;
        background: #f8fbfe;
      }

      .mai-register-help {
        color: #52677f;
        font-size: .78rem;
        font-weight: 700;
        line-height: 1.3;
        margin-top: 3px;
      }

      .mai-register-modal label.field {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .mai-register-modal label.field > span {
        color: #062A5E;
        font-weight: 900;
        font-size: .84rem;
      }

      .mai-register-modal input,
      .mai-register-modal select,
      .mai-register-modal textarea {
        width: 100%;
        min-height: 38px;
        box-sizing: border-box;
        border: 1px solid #bfd5ee;
        border-radius: 10px;
        padding: 8px 10px;
        font-family: inherit;
        font-size: .88rem;
      }

      .mai-register-modal textarea {
        min-height: 74px;
        resize: vertical;
      }

      .mai-register-required {
        color: #9b1c1c;
      }

      @media (max-width: 980px) {
        .mai-register-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function optionHtml(value, label, selected = "") {
    const sel = String(value) === String(selected) ? " selected" : "";
    return `<option value="${esc(value)}"${sel}>${esc(label)}</option>`;
  }

  function vesselOptions() {
    const rows = state.vessels || [];

    return [
      '<option value="">Select vessel...</option>',
      ...rows.map((v) => {
        const label = `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}${v.imo_number ? " / IMO " + v.imo_number : ""}`;
        return optionHtml(v.id, label);
      })
    ].join("");
  }

  function typeOptions() {
    return [
      '<option value="">Select component type...</option>',
      ...(state.types || []).map((t) => optionHtml(t.id, `${t.code || ""} — ${t.name || ""}`))
    ].join("");
  }

  function statusOptions() {
    const rows = (state.statuses || []).filter((s) => s.is_active !== false);

    return rows.map((s) => {
      return optionHtml(s.status_key, s.status_label || s.status_key, "active");
    }).join("");
  }

  function locationsByMode(mode) {
    return (state.locations || [])
      .filter((l) => l.is_active !== false)
      .filter((l) => l.location_mode === mode)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }

  function locationOptions(mode) {
    const rows = locationsByMode(mode);

    return [
      '<option value="">Select...</option>',
      ...rows.map((l) => optionHtml(l.location_key, l.location_label || l.location_key))
    ].join("");
  }

  function selectedVessel() {
    const id = $("maiRegVessel")?.value || "";
    return state.vessels.find((v) => String(v.id) === String(id)) || null;
  }

  function selectedCompanyId() {
    const v = selectedVessel();
    return v?.company_id || state.profile?.company_id || null;
  }

  async function loadBaseData() {
    const vesselQuery = state.sb
      .from("vessels")
      .select("id, name, hull_number, imo_number, company_id, is_active")
      .eq("is_active", true)
      .order("name");

    const [vesselsRes, typesRes, statusesRes, locationsRes] = await Promise.all([
      vesselQuery,
      state.sb.from("mai_component_types").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("mai_status_options").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("mai_location_options").select("*").eq("is_active", true).order("sort_order")
    ]);

    for (const res of [vesselsRes, typesRes, statusesRes, locationsRes]) {
      if (res.error) throw res.error;
    }

    state.vessels = vesselsRes.data || [];
    state.types = typesRes.data || [];
    state.statuses = statusesRes.data || [];
    state.locations = locationsRes.data || [];

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      state.vessels = state.vessels.filter((v) => String(v.id) === String(state.profile.vessel_id));
    }
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

  function inputTypeForField(field) {
    if (field.value_type === "date") return "date";
    if (field.value_type === "number") return "number";
    return "text";
  }

  function fieldInputHtml(field) {
    const key = field.field_key;
    const id = `maiRegField_${key}`.replaceAll(/[^A-Za-z0-9_\-]/g, "_");
    const label = `${field.field_label || key}${field.unit_label ? " (" + field.unit_label + ")" : ""}`;
    const required = field.is_required ? ' required' : "";
    const requiredMark = field.is_required ? ' <span class="mai-register-required">*</span>' : "";
    const help = field.help_text ? `<div class="mai-register-help">${esc(field.help_text)}</div>` : "";

    if (field.value_type === "textarea") {
      return `
        <label class="field">
          <span>${esc(label)}${requiredMark}</span>
          <textarea id="${esc(id)}" data-mai-reg-field="${esc(key)}"${required}></textarea>
          ${help}
        </label>
      `;
    }

    if (field.value_type === "select") {
      const opts = normalizeOptions(field.options);

      return `
        <label class="field">
          <span>${esc(label)}${requiredMark}</span>
          <select id="${esc(id)}" data-mai-reg-field="${esc(key)}"${required}>
            <option value="">Select...</option>
            ${opts.map((o) => optionHtml(o.value, o.label)).join("")}
          </select>
          ${help}
        </label>
      `;
    }

    if (field.value_type === "boolean") {
      return `
        <label class="field">
          <span>${esc(label)}${requiredMark}</span>
          <select id="${esc(id)}" data-mai-reg-field="${esc(key)}"${required}>
            <option value="">Select...</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          ${help}
        </label>
      `;
    }

    return `
      <label class="field">
        <span>${esc(label)}${requiredMark}</span>
        <input id="${esc(id)}" type="${esc(inputTypeForField(field))}" data-mai-reg-field="${esc(key)}"${required} />
        ${help}
      </label>
    `;
  }

  async function loadDynamicFields() {
    const typeId = $("maiRegType")?.value || "";
    const companyId = selectedCompanyId();

    const box = $("maiRegDynamicFields");

    if (!box) return;

    if (!typeId || !companyId) {
      state.fields = [];
      box.innerHTML = `<div class="mai-register-help">Select vessel and component type to load component particulars.</div>`;
      return;
    }

    const fields = await rpc("mai_get_effective_fields", {
      p_company_id: companyId,
      p_component_type_id: typeId
    });

    state.fields = fields || [];

    if (!state.fields.length) {
      box.innerHTML = `<div class="mai-register-help">No editable particulars configured for this component type.</div>`;
      return;
    }

    box.innerHTML = state.fields.map(fieldInputHtml).join("");
  }

  function renderLocationControls() {
    const mode = $("maiRegLocationMode")?.value || "storage";

    const fittedWrap = $("maiRegFittedWrap");
    const storageWrap = $("maiRegStorageWrap");

    if (fittedWrap) fittedWrap.style.display = mode === "fitted" ? "" : "none";
    if (storageWrap) storageWrap.style.display = mode === "storage" ? "" : "none";

    const fitted = $("maiRegFittedPosition");
    const storage = $("maiRegStorageLocation");

    if (fitted) fitted.innerHTML = locationOptions("fitted");
    if (storage) storage.innerHTML = locationOptions("storage");
  }

  function modalHtml() {
    return `
      <div id="maiRegisterBackdrop" class="mai-register-backdrop">
        <div class="mai-register-modal">
          <div class="mai-register-head">
            <div>
              <div class="mai-register-title">Register New Mooring / Anchoring Component</div>
              <div class="mai-register-subtitle">
                Unique ID is generated by the backend using Hull Number + Order Number + Component Type + Sequence.
              </div>
            </div>
            <button id="maiRegCloseBtn" class="btn2" type="button">Close</button>
          </div>

          <div class="mai-register-body">
            <div class="mai-register-grid">
              <label class="field">
                <span>Vessel <span class="mai-register-required">*</span></span>
                <select id="maiRegVessel" required>${vesselOptions()}</select>
              </label>

              <label class="field">
                <span>Component Type <span class="mai-register-required">*</span></span>
                <select id="maiRegType" required>${typeOptions()}</select>
              </label>

              <label class="field">
                <span>Order Number <span class="mai-register-required">*</span></span>
                <input id="maiRegOrderNumber" required placeholder="e.g. PO-2026-01" />
              </label>

              <label class="field">
                <span>Status</span>
                <select id="maiRegStatus">${statusOptions()}</select>
              </label>

              <label class="field">
                <span>Location Mode</span>
                <select id="maiRegLocationMode">
                  <option value="storage" selected>Storage</option>
                  <option value="fitted">Fitted</option>
                  <option value="shore">Shore</option>
                  <option value="disposed">Disposed</option>
                </select>
              </label>

              <label id="maiRegFittedWrap" class="field" style="display:none;">
                <span>Fitted Position</span>
                <select id="maiRegFittedPosition"></select>
              </label>

              <label id="maiRegStorageWrap" class="field">
                <span>Storage Location</span>
                <select id="maiRegStorageLocation"></select>
              </label>

              <label class="field field-wide">
                <span>Notes</span>
                <textarea id="maiRegNotes" placeholder="Initial registration notes"></textarea>
              </label>

              <div class="mai-register-section-title">Component Particulars</div>
              <div id="maiRegDynamicFields" class="mai-register-grid field-wide">
                <div class="mai-register-help">Select vessel and component type to load component particulars.</div>
              </div>
            </div>
          </div>

          <div class="mai-register-actions">
            <button id="maiRegCancelBtn" class="btn2" type="button">Cancel</button>
            <button id="maiRegSubmitBtn" class="btn" type="button">Register Component</button>
          </div>
        </div>
      </div>
    `;
  }

  function closeModal() {
    $("maiRegisterBackdrop")?.remove();
  }

  function collectFieldValues() {
    const values = {};

    $("maiRegDynamicFields")?.querySelectorAll("[data-mai-reg-field]").forEach((input) => {
      const key = input.getAttribute("data-mai-reg-field");
      let value = input.value;

      if (value === "") {
        values[key] = null;
        return;
      }

      const field = state.fields.find((f) => f.field_key === key);

      if (field?.value_type === "number") {
        const n = Number(value);
        values[key] = Number.isFinite(n) ? n : null;
        return;
      }

      if (field?.value_type === "boolean") {
        values[key] = value === "true";
        return;
      }

      values[key] = value;
    });

    return values;
  }

  function validateRequiredFields() {
    const missing = [];

    if (!$("maiRegVessel")?.value) missing.push("Vessel");
    if (!$("maiRegType")?.value) missing.push("Component Type");
    if (!$("maiRegOrderNumber")?.value?.trim()) missing.push("Order Number");

    for (const field of state.fields) {
      if (!field.is_required) continue;

      const input = $(`maiRegField_${field.field_key}`.replaceAll(/[^A-Za-z0-9_\-]/g, "_"));
      const value = input?.value;

      if (value === null || value === undefined || String(value).trim() === "") {
        missing.push(field.field_label || field.field_key);
      }
    }

    if (missing.length) {
      throw new Error("Required fields missing: " + missing.join(", "));
    }
  }

  function extractComponentId(result) {
    if (!result) return "";

    if (typeof result === "string") return result;

    if (Array.isArray(result)) {
      return extractComponentId(result[0]);
    }

    if (typeof result === "object") {
      return result.component_id || result.id || result.component?.id || result.data?.id || "";
    }

    return "";
  }

  async function submitRegistration() {
    validateRequiredFields();

    const submitBtn = $("maiRegSubmitBtn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Registering...";
    }

    try {
      const locationMode = $("maiRegLocationMode")?.value || "storage";

      const result = await rpc("mai_register_component", {
        p_vessel_id: $("maiRegVessel").value,
        p_component_type_id: $("maiRegType").value,
        p_order_number: $("maiRegOrderNumber").value.trim(),
        p_current_status: $("maiRegStatus").value || "active",
        p_location_mode: locationMode,
        p_fitted_position: locationMode === "fitted" ? ($("maiRegFittedPosition").value || null) : null,
        p_storage_location: locationMode === "storage" ? ($("maiRegStorageLocation").value || null) : null,
        p_notes: $("maiRegNotes").value || null,
        p_field_values: collectFieldValues()
      });

      const componentId = extractComponentId(result);

      toast("ok", "Component registered successfully.");

      closeModal();

      if (componentId) {
        location.href = `./mooring-anchoring-component.html?id=${encodeURIComponent(componentId)}`;
      } else {
        location.reload();
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Register Component";
      }
    }
  }

  async function openModal() {
    if (!state.canEditMai) {
      toast("warn", "You do not have MAI edit permission. Component registration is restricted to authorized ranks/users.");
      return;
    }

    await loadBaseData();

    addStyles();

    document.body.insertAdjacentHTML("beforeend", modalHtml());

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      $("maiRegVessel").value = state.profile.vessel_id;
      $("maiRegVessel").disabled = true;
    }

    renderLocationControls();
    await loadDynamicFields();

    $("maiRegCloseBtn").addEventListener("click", closeModal);
    $("maiRegCancelBtn").addEventListener("click", closeModal);

    $("maiRegVessel").addEventListener("change", () => {
      loadDynamicFields().catch((error) => toast("warn", String(error?.message || error)));
    });

    $("maiRegType").addEventListener("change", () => {
      loadDynamicFields().catch((error) => toast("warn", String(error?.message || error)));
    });

    $("maiRegLocationMode").addEventListener("change", renderLocationControls);

    $("maiRegSubmitBtn").addEventListener("click", () => {
      submitRegistration().catch((error) => {
        console.error(error);
        toast("warn", String(error?.message || error || "Registration failed."));
        const submitBtn = $("maiRegSubmitBtn");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Register Component";
        }
      });
    });
  }

  function replaceRegisterButtonHandler() {
    const btn = $("registerComponentBtn");
    if (!btn) return false;

    if (btn.getAttribute("data-mai-register-v4-bound") === "1") return true;

    const clone = btn.cloneNode(true);
    clone.setAttribute("data-mai-register-v4-bound", "1");

    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", () => {
      openModal().catch((error) => {
        console.error(error);
        toast("warn", String(error?.message || error || "Could not open registration form."));
      });
    });

    if (!state.canEditMai) {
      clone.style.display = "none";
    }

    return true;
  }

  async function init() {
    window.CSVB_MAI_REGISTER_COMPONENT_V4_BUILD = BUILD;

    state.sb = window.AUTH.ensureSupabase();

    const bundle = await window.AUTH.getSessionUserProfile();

    if (!bundle?.session?.user) return;

    state.profile = bundle.profile || {};
    state.canEditMai = await determineMaiEditPermission();

    replaceRegisterButtonHandler();

    window.setTimeout(replaceRegisterButtonHandler, 500);
    window.setTimeout(replaceRegisterButtonHandler, 1500);
  }

  function start() {
    init().catch((error) => {
      console.error("MAI register component v4 extension failed:", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
