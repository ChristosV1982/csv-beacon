// public/inspection-event-create-v01.js
// C.S.V. BEACON - Inspection Event Create v01

const BUILD = "assurance_inspection_event_create_v01_20260602";

const sb = window.AUTH.ensureSupabase();

let PROFILE = null;
let OPTIONS = [];
let QUESTION_SETS = [];
let VESSELS = [];
let PROFILES = [];

function el(id) {
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

function showWarn(msg) {
  const n = el("warnBox");
  if (!n) return;
  n.textContent = msg || "";
  n.style.display = msg ? "block" : "none";
}

function showOk(msg) {
  const n = el("okBox");
  if (!n) return;
  n.textContent = msg || "";
  n.style.display = msg ? "block" : "none";
}

function clearMessages() {
  showWarn("");
  showOk("");
}

function labelFromSnake(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function selectedQuestionSet() {
  const id = el("questionSetId")?.value || "";
  return QUESTION_SETS.find(x => String(x.id) === String(id)) || null;
}

function selectedVessel() {
  const id = el("vesselId")?.value || "";
  return VESSELS.find(x => String(x.id) === String(id)) || null;
}

function optionLabel(row) {
  const code = row.code ? ` · ${row.code}` : "";
  return `${row.label || "-"}${code}`;
}

function renderQuestionSets() {
  const select = el("questionSetId");
  if (!select) return;

  if (!QUESTION_SETS.length) {
    select.innerHTML = `<option value="">No accessible question sets found</option>`;
    return;
  }

  select.innerHTML = `<option value="">Select question set...</option>` + QUESTION_SETS.map(row => {
    const itemCount = Number(row.metadata?.item_count || 0);
    const text = `${optionLabel(row)} · ${labelFromSnake(row.metadata?.question_set_type || "")} · ${itemCount} active item(s)`;
    return `<option value="${esc(row.id)}">${esc(text)}</option>`;
  }).join("");
}

function renderVessels() {
  const select = el("vesselId");
  if (!select) return;

  const qs = selectedQuestionSet();
  const companyId = qs?.company_id || "";

  let rows = VESSELS;
  if (companyId) {
    rows = VESSELS.filter(v => !v.company_id || String(v.company_id) === String(companyId));
  }

  if (!rows.length) {
    select.innerHTML = `<option value="">No accessible vessel found for selected company</option>`;
    return;
  }

  select.innerHTML = `<option value="">Select vessel...</option>` + rows.map(row => {
    return `<option value="${esc(row.id)}">${esc(optionLabel(row))}</option>`;
  }).join("");
}

function renderProfiles() {
  const assigned = el("assignedToProfileId");
  const reviewer = el("reviewerProfileId");
  const qs = selectedQuestionSet();
  const vessel = selectedVessel();
  const companyId = qs?.company_id || "";
  const vesselId = vessel?.id || "";

  let rows = PROFILES;
  if (companyId || vesselId) {
    rows = PROFILES.filter(p => {
      const profileCompany = String(p.company_id || "");
      const profileVessel = String(p.metadata?.vessel_id || "");
      return (
        !companyId ||
        profileCompany === String(companyId) ||
        profileVessel === String(vesselId) ||
        !profileCompany
      );
    });
  }

  const html = rows.map(row => {
    const role = row.code ? ` · ${labelFromSnake(row.code)}` : "";
    return `<option value="${esc(row.id)}">${esc(row.label || "-")}${esc(role)}</option>`;
  }).join("");

  if (assigned) assigned.innerHTML = `<option value="">Not assigned</option>${html}`;
  if (reviewer) reviewer.innerHTML = `<option value="">No reviewer selected</option>${html}`;
}

function updateQuestionSetInfo() {
  const info = el("questionSetInfo");
  const qs = selectedQuestionSet();

  if (!info) return;

  if (!qs) {
    info.textContent = "Select a question set.";
    return;
  }

  const itemCount = Number(qs.metadata?.item_count || 0);
  const defaultType = qs.metadata?.default_inspection_type || "";
  const source = qs.metadata?.source_scope || "";
  const status = qs.status || "";

  info.textContent = `Company: ${qs.company_id} · Status: ${status} · Source: ${source} · Active items: ${itemCount}`;

  if (defaultType && el("inspectionType")) {
    el("inspectionType").value = defaultType;
  }

  renderVessels();
  renderProfiles();
  maybeBuildTitle();
}

function maybeBuildTitle() {
  const title = el("inspectionTitle");
  if (!title || title.value.trim()) return;

  const qs = selectedQuestionSet();
  const vessel = selectedVessel();
  const planned = el("plannedDate")?.value || "";

  if (!qs || !vessel) return;

  const datePart = planned ? ` - ${planned}` : "";
  title.value = `${vessel.label} - ${labelFromSnake(el("inspectionType")?.value || "Inspection Event")}${datePart}`;
}

async function loadOptions() {
  clearMessages();

  const { data, error } = await sb.rpc("csvb_assurance_event_options_for_me");
  if (error) throw error;

  OPTIONS = data || [];
  QUESTION_SETS = OPTIONS.filter(x => x.option_type === "QUESTION_SET");
  VESSELS = OPTIONS.filter(x => x.option_type === "VESSEL");
  PROFILES = OPTIONS.filter(x => x.option_type === "PROFILE");

  renderQuestionSets();
  renderVessels();
  renderProfiles();

  window.CSVB_INSPECTION_EVENT_CREATE = {
    build: BUILD,
    loaded: true,
    option_count: OPTIONS.length,
    question_set_count: QUESTION_SETS.length,
    vessel_count: VESSELS.length,
    profile_count: PROFILES.length
  };
}

function payload() {
  const qs = selectedQuestionSet();

  if (!qs) throw new Error("Question set is required.");
  if (!el("vesselId")?.value) throw new Error("Vessel is required.");
  if (!el("inspectionTitle")?.value.trim()) throw new Error("Inspection title is required.");
  if (!el("inspectionType")?.value) throw new Error("Inspection type is required.");

  return {
    p_company_id: qs.company_id,
    p_vessel_id: el("vesselId").value,
    p_question_set_id: qs.id,
    p_inspection_title: el("inspectionTitle").value.trim(),
    p_inspection_type: el("inspectionType").value,
    p_event_status: el("eventStatus").value || "draft",
    p_planned_date: el("plannedDate").value || null,
    p_due_date: el("dueDate").value || null,
    p_assigned_to_profile_id: el("assignedToProfileId").value || null,
    p_reviewer_profile_id: el("reviewerProfileId").value || null,
    p_remarks: el("remarks").value.trim() || null
  };
}

async function createEvent() {
  clearMessages();

  const btn = el("createBtn");
  if (btn) btn.disabled = true;

  try {
    const { data, error } = await sb.rpc("csvb_assurance_create_inspection_event", payload());
    if (error) throw error;

    showOk(`Inspection event created. Event ID: ${data}`);
    window.setTimeout(() => {
      location.href = "./inspection-events.html";
    }, 850);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function resetForm() {
  ["questionSetId", "vesselId", "inspectionType", "eventStatus", "plannedDate", "dueDate", "inspectionTitle", "assignedToProfileId", "reviewerProfileId", "remarks"].forEach(id => {
    const n = el(id);
    if (!n) return;
    if (n.tagName === "SELECT") n.selectedIndex = 0;
    else n.value = "";
  });

  if (el("inspectionType")) el("inspectionType").value = "pre_sire_2_prep";
  if (el("eventStatus")) el("eventStatus").value = "draft";

  renderVessels();
  renderProfiles();
  updateQuestionSetInfo();
}

function bind() {
  el("logoutBtn")?.addEventListener("click", async () => {
    await window.AUTH.logout();
  });

  el("questionSetId")?.addEventListener("change", updateQuestionSetInfo);
  el("vesselId")?.addEventListener("change", () => {
    renderProfiles();
    maybeBuildTitle();
  });
  el("inspectionType")?.addEventListener("change", maybeBuildTitle);
  el("plannedDate")?.addEventListener("change", maybeBuildTitle);

  el("createBtn")?.addEventListener("click", () => {
    createEvent().catch(e => showWarn(e.message || String(e)));
  });

  el("resetBtn")?.addEventListener("click", resetForm);
}

async function init() {
  try {
    bind();

    const auth = await window.AUTH.setupAuthButtons({ logoutBtnId: "logoutBtn" });
    PROFILE = auth?.profile || null;

    if (el("subLine")) {
      el("subLine").textContent = PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "Create Inspection Event";
    }

    await loadOptions();
  } catch (e) {
    showWarn(e.message || String(e));
    if (el("subLine")) el("subLine").textContent = "Not ready.";
  }
}

init();
