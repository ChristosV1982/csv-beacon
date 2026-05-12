/* public/portable-lifting-appliances-register-u05.js */
/* C.S.V. BEACON – PLA-05 Register Component Workflow */

(() => {
  "use strict";

  const BUILD = "PLA-REGISTER-U05B-FORCE-BIND-20260512-1";

  const state = {
    sb: null,
    profile: null,
    canEdit: false,
    vessels: [],
    sections: [],
    categories: [],
    locations: [],
    storageLocations: [],
    types: [],
    conditions: []
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

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box = type === "ok" ? $("okBox") : $("warnBox");

    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";

      if (message && type === "ok") {
        setTimeout(() => {
          box.textContent = "";
          box.style.display = "none";
        }, 2600);
      }
      return;
    }

    if (message) alert(message);
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  function toNull(value) {
    const v = String(value ?? "").trim();
    return v ? v : null;
  }

  function uuidOrNull(value) {
    const v = String(value ?? "").trim();
    return v ? v : null;
  }

  function numberOrNull(value) {
    const v = String(value ?? "").trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isoOrNull(value) {
    const v = String(value ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }

  function datePlusMonths(dateString, months) {
    if (!dateString || !Number.isFinite(Number(months))) return "";

    const [y, m, d] = dateString.split("-").map(Number);
    if (!y || !m || !d) return "";

    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + Number(months));

    return dt.toISOString().slice(0, 10);
  }

  function option(value, label, selected = "") {
    const sel = String(value) === String(selected) ? " selected" : "";
    return `<option value="${esc(value)}"${sel}>${esc(label)}</option>`;
  }

  function selectedCategory() {
    const id = $("plaRegCategory")?.value || "";
    return state.categories.find((c) => String(c.id) === String(id)) || null;
  }

  async function determineEditPermission() {
    try {
      const allowed = await rpc("pla_current_user_can", {
        p_action: "edit",
        p_company_id: null,
        p_vessel_id: null
      });

      return allowed === true;
    } catch (error) {
      console.warn("PLA edit permission check failed:", error);
      return false;
    }
  }

  async function loadSetupData() {
    const [
      vesselsRes,
      sectionsRes,
      categoriesRes,
      locationsRes,
      storageRes,
      typesRes,
      conditionsRes
    ] = await Promise.all([
      state.sb.from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true).order("name"),
      state.sb.from("pla_sections").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_equipment_categories").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_equipment_locations").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_storage_locations").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_component_types").select("*").eq("is_active", true).order("sort_order"),
      state.sb.from("pla_condition_options").select("*").eq("is_active", true).order("sort_order")
    ]);

    for (const res of [vesselsRes, sectionsRes, categoriesRes, locationsRes, storageRes, typesRes, conditionsRes]) {
      if (res.error) throw res.error;
    }

    state.vessels = vesselsRes.data || [];
    state.sections = sectionsRes.data || [];
    state.categories = categoriesRes.data || [];
    state.locations = locationsRes.data || [];
    state.storageLocations = storageRes.data || [];
    state.types = typesRes.data || [];
    state.conditions = conditionsRes.data || [];

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      state.vessels = state.vessels.filter((v) => String(v.id) === String(state.profile.vessel_id));
    }
  }

  function vesselOptions() {
    return [
      '<option value="">Select vessel...</option>',
      ...state.vessels.map((v) => {
        const label = `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}${v.imo_number ? " / IMO " + v.imo_number : ""}`;
        return option(v.id, label);
      })
    ].join("");
  }

  function sectionOptions() {
    return [
      '<option value="">Select section...</option>',
      ...state.sections.map((s) => option(s.id, `${s.section_code} — ${s.section_name}`))
    ].join("");
  }

  function categoryOptions() {
    return [
      '<option value="">Select category...</option>',
      ...state.categories.map((c) => {
        const basis = c.policy_basis ? ` / ${c.policy_basis}` : "";
        return option(c.id, `${c.category_name || c.category_code}${basis}`);
      })
    ].join("");
  }

  function locationOptions() {
    return [
      '<option value="">Select equipment / location...</option>',
      ...state.locations.map((l) => option(l.id, `${l.location_code} — ${l.location_name}`))
    ].join("");
  }

  function storageOptions() {
    return [
      '<option value="">No storage location / Not applicable</option>',
      ...state.storageLocations.map((s) => option(s.id, s.storage_label || s.storage_key))
    ].join("");
  }

  function typeOptions() {
    return [
      '<option value="">Select component type...</option>',
      ...state.types.map((t) => option(t.id, `${t.component_type_code} — ${t.component_type_name}`))
    ].join("");
  }

  function conditionOptions() {
    return [
      '<option value="">Not recorded</option>',
      ...state.conditions.map((c) => option(c.id, c.condition_label || c.condition_key))
    ].join("");
  }

  function addStyles() {
    if ($("plaRegisterU05Styles")) return;

    const style = document.createElement("style");
    style.id = "plaRegisterU05Styles";
    style.textContent = `
      .pla-reg-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(3,27,63,.46);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow: auto;
        padding: 22px 10px;
      }

      .pla-reg-modal {
        width: min(1180px, 96vw);
        background: #fff;
        border: 1px solid #c9d9ec;
        border-radius: 16px;
        box-shadow: 0 24px 72px rgba(3,27,63,.28);
        overflow: hidden;
      }

      .pla-reg-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid #dce8f6;
        background: linear-gradient(180deg, #fbfdff, #f4f8fc);
      }

      .pla-reg-title {
        color: #062A5E;
        font-weight: 950;
        font-size: 1.08rem;
      }

      .pla-reg-subtitle {
        color: #52677f;
        font-weight: 700;
        line-height: 1.35;
        font-size: .84rem;
        margin-top: 3px;
      }

      .pla-reg-body {
        padding: 12px 14px;
      }

      .pla-reg-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(220px, 1fr));
        gap: 10px;
      }

      .pla-reg-section-title {
        grid-column: 1 / -1;
        color: #062A5E;
        font-weight: 950;
        margin-top: 8px;
        padding-top: 10px;
        border-top: 1px solid #dce8f6;
      }

      .pla-reg-wide {
        grid-column: 1 / -1;
      }

      .pla-reg-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid #dce8f6;
        background: #f8fbfe;
      }

      .pla-reg-modal label.field {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .pla-reg-modal label.field > span {
        color: #062A5E;
        font-weight: 900;
        font-size: .82rem;
      }

      .pla-reg-modal input,
      .pla-reg-modal select,
      .pla-reg-modal textarea {
        width: 100%;
        min-height: 38px;
        box-sizing: border-box;
        border: 1px solid #bfd5ee;
        border-radius: 10px;
        padding: 8px 10px;
        font-family: inherit;
        font-size: .88rem;
      }

      .pla-reg-modal textarea {
        min-height: 78px;
        resize: vertical;
      }

      .pla-reg-required {
        color: #9b1c1c;
      }

      .pla-reg-help {
        color: #52677f;
        font-size: .76rem;
        font-weight: 700;
        line-height: 1.3;
        margin-top: 3px;
      }

      @media(max-width: 980px) {
        .pla-reg-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function modalHtml() {
    return `
      <div id="plaRegisterBackdrop" class="pla-reg-backdrop">
        <div class="pla-reg-modal">
          <div class="pla-reg-head">
            <div>
              <div class="pla-reg-title">Register New Portable Lifting / Wire Component</div>
              <div class="pla-reg-subtitle">
                Unique ID is generated by the backend using Hull Number + Section + Equipment/Location + Component Type + Sequence.
              </div>
            </div>
            <button id="plaRegCloseBtn" class="btn2" type="button">Close</button>
          </div>

          <div class="pla-reg-body">
            <div class="pla-reg-grid">
              <label class="field">
                <span>Vessel <span class="pla-reg-required">*</span></span>
                <select id="plaRegVessel" required>${vesselOptions()}</select>
              </label>

              <label class="field">
                <span>Section <span class="pla-reg-required">*</span></span>
                <select id="plaRegSection" required>${sectionOptions()}</select>
              </label>

              <label class="field">
                <span>Component Type <span class="pla-reg-required">*</span></span>
                <select id="plaRegType" required>${typeOptions()}</select>
              </label>

              <label class="field">
                <span>Equipment Category / Policy Basis <span class="pla-reg-required">*</span></span>
                <select id="plaRegCategory" required>${categoryOptions()}</select>
                <div id="plaRegPolicyHint" class="pla-reg-help">Select category to apply policy basis.</div>
              </label>

              <label class="field">
                <span>Equipment / Location Code <span class="pla-reg-required">*</span></span>
                <select id="plaRegLocation" required>${locationOptions()}</select>
              </label>

              <label class="field">
                <span>Storage Location</span>
                <select id="plaRegStorage">${storageOptions()}</select>
              </label>

              <div class="pla-reg-section-title">Certificate / Particulars</div>

              <label class="field">
                <span>Certificate No.</span>
                <input id="plaRegCertificate" placeholder="Certificate number" />
              </label>

              <label class="field">
                <span>Date Rigged</span>
                <input id="plaRegDateRigged" type="date" />
              </label>

              <label class="field">
                <span>Replacement Periodicity (months)</span>
                <input id="plaRegReplacementMonths" type="number" min="0" step="1" placeholder="Auto from policy where applicable" />
              </label>

              <label class="field">
                <span>Replacement Due Date</span>
                <input id="plaRegReplacementDue" type="date" />
              </label>

              <label class="field">
                <span>Diameter / Length (mm / m)</span>
                <input id="plaRegDiameterLength" placeholder="e.g. 16 mm / 25 m" />
              </label>

              <label class="field">
                <span>Material</span>
                <input id="plaRegMaterial" placeholder="e.g. Galvanized steel wire" />
              </label>

              <label class="field">
                <span>Construction</span>
                <input id="plaRegConstruction" placeholder="e.g. 6x36 IWRC" />
              </label>

              <label class="field">
                <span>SWL (T / kN)</span>
                <input id="plaRegSWL" placeholder="e.g. 5T / 49kN" />
              </label>

              <label class="field">
                <span>Condition</span>
                <select id="plaRegCondition">${conditionOptions()}</select>
              </label>

              <div class="pla-reg-section-title">Inspection / Testing</div>

              <label class="field">
                <span>Inspection Date</span>
                <input id="plaRegInspectionDate" type="date" />
              </label>

              <label class="field">
                <span>Next Inspection Due</span>
                <input id="plaRegNextInspectionDue" type="date" />
              </label>

              <label class="field">
                <span>5Y Testing Required</span>
                <select id="plaRegFiveYearRequired">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>

              <label class="field">
                <span>Last 5Y Test Date</span>
                <input id="plaRegLastFiveYearDate" type="date" />
              </label>

              <label class="field">
                <span>Next 5Y Test Due</span>
                <input id="plaRegNextFiveYearDue" type="date" />
              </label>

              <label class="field pla-reg-wide">
                <span>Remarks</span>
                <textarea id="plaRegRemarks" placeholder="Initial registration remarks"></textarea>
              </label>
            </div>
          </div>

          <div class="pla-reg-actions">
            <button id="plaRegCancelBtn" class="btn2" type="button">Cancel</button>
            <button id="plaRegSubmitBtn" class="btn" type="button">Register Component</button>
          </div>
        </div>
      </div>
    `;
  }

  function closeModal() {
    $("plaRegisterBackdrop")?.remove();
  }

  function applyCategoryDefaults() {
    const cat = selectedCategory();

    if (!cat) {
      $("plaRegPolicyHint").textContent = "Select category to apply policy basis.";
      return;
    }

    $("plaRegPolicyHint").textContent =
      `Policy basis: ${cat.policy_basis || "—"} / Inspection interval: ${cat.default_inspection_interval_months || 6} months`;

    const monthsInput = $("plaRegReplacementMonths");

    if (cat.default_replacement_months !== null && cat.default_replacement_months !== undefined) {
      monthsInput.value = cat.default_replacement_months;
    } else {
      monthsInput.value = "";
    }

    $("plaRegFiveYearRequired").value = cat.five_year_test_required ? "true" : "false";

    recalculateDates();
  }

  function recalculateDates() {
    const cat = selectedCategory();
    const dateRigged = $("plaRegDateRigged")?.value || "";
    const replacementMonths = numberOrNull($("plaRegReplacementMonths")?.value);

    if (dateRigged && replacementMonths !== null) {
      $("plaRegReplacementDue").value = datePlusMonths(dateRigged, replacementMonths);
    }

    const inspectionDate = $("plaRegInspectionDate")?.value || "";
    const intervalMonths = Number(cat?.default_inspection_interval_months || 6);

    if (inspectionDate) {
      $("plaRegNextInspectionDue").value = datePlusMonths(inspectionDate, intervalMonths);
    }

    const fiveRequired = $("plaRegFiveYearRequired")?.value === "true";
    const lastFive = $("plaRegLastFiveYearDate")?.value || "";

    if (!fiveRequired) {
      $("plaRegNextFiveYearDue").value = "";
    } else if (lastFive) {
      $("plaRegNextFiveYearDue").value = datePlusMonths(lastFive, 60);
    }
  }

  function validate() {
    const missing = [];

    if (!$("plaRegVessel").value) missing.push("Vessel");
    if (!$("plaRegSection").value) missing.push("Section");
    if (!$("plaRegCategory").value) missing.push("Equipment Category");
    if (!$("plaRegLocation").value) missing.push("Equipment / Location Code");
    if (!$("plaRegType").value) missing.push("Component Type");

    if (missing.length) {
      throw new Error("Required fields missing: " + missing.join(", "));
    }
  }

  async function submit() {
    validate();

    const btn = $("plaRegSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Registering...";

    try {
      const data = await rpc("pla_register_component", {
        p_vessel_id: $("plaRegVessel").value,
        p_section_id: $("plaRegSection").value,
        p_equipment_category_id: $("plaRegCategory").value,
        p_equipment_location_id: $("plaRegLocation").value,
        p_component_type_id: $("plaRegType").value,
        p_storage_location_id: uuidOrNull($("plaRegStorage").value),

        p_certificate_no: toNull($("plaRegCertificate").value),
        p_date_rigged: isoOrNull($("plaRegDateRigged").value),
        p_replacement_periodicity_months: numberOrNull($("plaRegReplacementMonths").value),
        p_replacement_due_date: isoOrNull($("plaRegReplacementDue").value),

        p_diameter_length_text: toNull($("plaRegDiameterLength").value),
        p_material: toNull($("plaRegMaterial").value),
        p_construction: toNull($("plaRegConstruction").value),
        p_swl_text: toNull($("plaRegSWL").value),
        p_condition_id: uuidOrNull($("plaRegCondition").value),

        p_inspection_date: isoOrNull($("plaRegInspectionDate").value),
        p_next_inspection_due: isoOrNull($("plaRegNextInspectionDue").value),

        p_five_year_test_required: $("plaRegFiveYearRequired").value === "true",
        p_last_five_year_test_date: isoOrNull($("plaRegLastFiveYearDate").value),
        p_next_five_year_test_due: isoOrNull($("plaRegNextFiveYearDue").value),

        p_remarks: toNull($("plaRegRemarks").value)
      });

      closeModal();

      toast("ok", `Component registered successfully: ${data?.unique_id || ""}`);

      const reloadBtn = $("reloadBtn");
      if (reloadBtn) reloadBtn.click();
    } finally {
      btn.disabled = false;
      btn.textContent = "Register Component";
    }
  }

  window.CSVB_PLA_REGISTER_OPEN_MODAL = () => {
    openModal().catch((error) => {
      console.error(error);
      toast("warn", String(error?.message || error || "Could not open registration form."));
    });
  };

  async function openModal() {
    if (!state.canEdit) {
      toast("warn", "You do not have edit permission for Portable Lifting Appliances & Wires.");
      return;
    }

    await loadSetupData();

    addStyles();

    document.body.insertAdjacentHTML("beforeend", modalHtml());

    if (state.profile?.role === "vessel" && state.profile?.vessel_id) {
      $("plaRegVessel").value = state.profile.vessel_id;
      $("plaRegVessel").disabled = true;
    }

    $("plaRegCloseBtn").addEventListener("click", closeModal);
    $("plaRegCancelBtn").addEventListener("click", closeModal);
    $("plaRegSubmitBtn").addEventListener("click", () => submit().catch((error) => {
      console.error(error);
      toast("warn", String(error?.message || error || "Registration failed."));
      const btn = $("plaRegSubmitBtn");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Register Component";
      }
    }));

    [
      "plaRegCategory",
      "plaRegDateRigged",
      "plaRegReplacementMonths",
      "plaRegInspectionDate",
      "plaRegFiveYearRequired",
      "plaRegLastFiveYearDate"
    ].forEach((id) => {
      $(id)?.addEventListener("change", () => {
        if (id === "plaRegCategory") applyCategoryDefaults();
        else recalculateDates();
      });

      $(id)?.addEventListener("input", () => {
        if (id === "plaRegCategory") applyCategoryDefaults();
        else recalculateDates();
      });
    });
  }

  function replaceButtonHandler() {
    const btn = $("registerBtn");
    if (!btn) return false;

    if (btn.getAttribute("data-pla-u05-bound") === "1") return true;

    const clone = btn.cloneNode(true);
    clone.setAttribute("data-pla-u05-bound", "1");

    btn.parentNode.replaceChild(clone, btn);

    clone.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      openModal().catch((error) => {
        console.error(error);
        toast("warn", String(error?.message || error || "Could not open registration form."));
      });
    };

    if (!state.canEdit) {
      clone.style.display = "none";
    }

    return true;
  }

  async function init() {
    window.CSVB_PLA_REGISTER_U05_BUILD = BUILD;

    state.sb = window.AUTH.ensureSupabase();

    const bundle = await window.AUTH.getSessionUserProfile();
    state.profile = bundle?.profile || null;

    if (!bundle?.session?.user || !state.profile) return;

    state.canEdit = await determineEditPermission();

    replaceButtonHandler();

    setTimeout(replaceButtonHandler, 500);
    setTimeout(replaceButtonHandler, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(console.error));
  } else {
    init().catch(console.error);
  }
})();
