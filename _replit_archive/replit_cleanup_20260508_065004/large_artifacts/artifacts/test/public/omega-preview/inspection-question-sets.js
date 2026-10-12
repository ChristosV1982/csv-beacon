// public/inspection-question-sets.js
// C.S.V. BEACON - Inspection & Assurance Question Set Manager v01

const BUILD = "assurance_question_sets_js_v01_20260601";
const supabaseClient = window.AUTH.ensureSupabase();

const UI_ROLE_MAP = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  company_superintendent: "Company Superintendent",
  vessel: "Vessel",
  inspector: "Inspector / Third Party",
};

let SESSION = null;
let PROFILE = null;
let QUESTION_SETS = [];
let ITEM_COUNTS = new Map();

function el(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function roleLabel(role) { return UI_ROLE_MAP[role] || role || ""; }
function setText(id, text) { const node = el(id); if (node) node.textContent = text; }
function showWarn(message) {
  const box = el("warnBox");
  if (!box) return;
  box.textContent = message || "";
  box.style.display = message ? "block" : "none";
}
function showOk(message) {
  const box = el("okBox");
  if (!box) return;
  box.textContent = message || "";
  box.style.display = message ? "block" : "none";
}
function fmtTs(value) {
  if (!value) return "-";
  try { return new Date(value).toLocaleString(); }
  catch { return String(value); }
}
function pill(status) {
  const s = String(status || "draft");
  const cls = s === "active" ? "active" : s === "archived" ? "archived" : "draft";
  const label = s === "active" ? "Active" : s === "archived" ? "Archived" : "Draft";
  return `<span class="pill ${cls}">${label}</span>`;
}
function niceType(value) {
  const map = {
    pre_vetting: "Pre-vetting",
    superintendent_inspection: "Superintendent inspection",
    vessel_self_assessment: "Vessel self-assessment",
    internal_audit: "Internal audit",
    company_specific: "Company specific",
    risq_preparation: "RISQ preparation",
    mixed: "Mixed",
  };
  return map[value] || value || "-";
}

function canManage() {
  return ["super_admin", "company_admin"].includes(String(PROFILE?.role || ""));
}

async function getSessionOrWarn() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  const session = data?.session || null;
  if (!session?.user) throw new Error("You are not logged in. Please login first.");
  return session;
}

async function getMyProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, role, company_id, vessel_id, position, is_active, is_disabled")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function loadQuestionSets() {
  const { data, error } = await supabaseClient
    .from("assurance_question_sets")
    .select("id, company_id, question_set_name, question_set_code, description, question_set_type, default_inspection_type, source_scope, version, status, is_active, is_locked, created_at, updated_at, created_by")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  QUESTION_SETS = data || [];
}

async function loadItemCounts() {
  const { data, error } = await supabaseClient
    .from("assurance_question_set_items")
    .select("question_set_id");

  if (error) {
    ITEM_COUNTS = new Map();
    return;
  }

  ITEM_COUNTS = new Map();
  for (const row of data || []) {
    const key = row.question_set_id;
    ITEM_COUNTS.set(key, (ITEM_COUNTS.get(key) || 0) + 1);
  }
}

function filteredSets() {
  const query = String(el("searchInput")?.value || "").trim().toLowerCase();
  if (!query) return QUESTION_SETS;

  return QUESTION_SETS.filter((s) => {
    const blob = [
      s.question_set_name,
      s.question_set_code,
      s.description,
      s.question_set_type,
      s.source_scope,
      s.status,
    ].join(" ").toLowerCase();
    return blob.includes(query);
  });
}

function renderTable() {
  const tbody = el("setsBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const rows = filteredSets();
  setText("countPill", `${rows.length} record${rows.length === 1 ? "" : "s"}`);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="mono">No question sets found.</td></tr>`;
    return;
  }

  for (const s of rows) {
    const count = ITEM_COUNTS.get(s.id) || 0;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${pill(s.status)}</td>
      <td>
        <b>${esc(s.question_set_name)}</b>
        <div class="small mono">${esc(s.question_set_code || "-")}</div>
        <div class="small">${esc(s.description || "")}</div>
      </td>
      <td>${esc(niceType(s.question_set_type))}</td>
      <td><span class="pill">${esc(s.source_scope || "-")}</span></td>
      <td class="mono">${esc(count)}</td>
      <td class="small">${esc(fmtTs(s.updated_at || s.created_at))}</td>
      <td>
        <div class="actions" style="margin-top:0;">
          <button class="btn secondary" data-action="open" data-id="${esc(s.id)}" type="button">Open</button>
          <button class="btn secondary" data-action="active" data-id="${esc(s.id)}" type="button" ${!canManage() ? "disabled" : ""}>Activate</button>
          <button class="btn secondary" data-action="draft" data-id="${esc(s.id)}" type="button" ${!canManage() ? "disabled" : ""}>Draft</button>
          <button class="btn danger" data-action="archive" data-id="${esc(s.id)}" type="button" ${!canManage() ? "disabled" : ""}>Archive</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

function collectForm() {
  const question_set_name = String(el("qsName")?.value || "").trim();
  const question_set_code = String(el("qsCode")?.value || "").trim().toUpperCase() || null;
  const question_set_type = String(el("qsType")?.value || "company_specific").trim();
  const source_scope = String(el("sourceScope")?.value || "MIXED").trim();
  const default_inspection_type = String(el("defaultInspectionType")?.value || "company_specific_inspection").trim();
  const version = String(el("versionInput")?.value || "1.0").trim() || "1.0";
  const status = String(el("statusInput")?.value || "draft").trim();
  const description = String(el("descInput")?.value || "").trim() || null;

  if (!question_set_name) throw new Error("Question set name is required.");
  if (!PROFILE?.company_id) throw new Error("Your profile has no company_id. Cannot create company question set.");

  return {
    company_id: PROFILE.company_id,
    question_set_name,
    question_set_code,
    question_set_type,
    source_scope,
    default_inspection_type,
    version,
    status,
    description,
    is_active: status !== "archived",
    created_by: SESSION.user.id,
    updated_by: SESSION.user.id,
    metadata: { created_from: "inspection-question-sets.html", build: BUILD },
  };
}

function clearForm() {
  ["qsName", "qsCode", "descInput"].forEach((id) => { const n = el(id); if (n) n.value = ""; });
  if (el("versionInput")) el("versionInput").value = "1.0";
  if (el("statusInput")) el("statusInput").value = "draft";
  showWarn("");
  showOk("");
}

async function createQuestionSet() {
  showWarn("");
  showOk("");
  if (!canManage()) throw new Error("Only Super Admin and Company Admin can create question sets in this phase.");

  const payload = collectForm();
  const { error } = await supabaseClient
    .from("assurance_question_sets")
    .insert(payload);

  if (error) throw error;
  showOk("Question set created.");
  clearForm();
  await refreshAll();
}

async function updateStatus(id, status) {
  if (!canManage()) throw new Error("You do not have permission to update question sets.");

  const { error } = await supabaseClient
    .from("assurance_question_sets")
    .update({
      status,
      is_active: status !== "archived",
      updated_by: SESSION.user.id,
    })
    .eq("id", id);

  if (error) throw error;
  await refreshAll();
}

async function handleTableClick(e) {
  const btn = e.target?.closest?.("button[data-action]");
  if (!btn) return;
  const id = btn.getAttribute("data-id");
  const action = btn.getAttribute("data-action");
  if (!id || !action) return;

  try {
    showWarn("");
    showOk("");
    if (action === "open") {
      const s = QUESTION_SETS.find((x) => String(x.id) === String(id));
      showOk(`Selected question set: ${s?.question_set_name || id}. Item management will be added in the next build step.`);
      return;
    }
    if (action === "active") await updateStatus(id, "active");
    if (action === "draft") await updateStatus(id, "draft");
    if (action === "archive") await updateStatus(id, "archived");
  } catch (err) {
    showWarn(err?.message || String(err));
  }
}

async function refreshAll() {
  setText("subLine", "Loading question sets...");
  await loadQuestionSets();
  await loadItemCounts();
  renderTable();
  setText("subLine", `${PROFILE.username || "User"} · ${roleLabel(PROFILE.role)} · Inspection & Assurance Module`);
}

function bindEvents() {
  el("logoutBtn")?.addEventListener("click", async () => {
    await window.AUTH.logout();
  });
  el("refreshBtn")?.addEventListener("click", () => refreshAll().catch((err) => showWarn(err.message || String(err))));
  el("createBtn")?.addEventListener("click", () => createQuestionSet().catch((err) => showWarn(err.message || String(err))));
  el("clearBtn")?.addEventListener("click", clearForm);
  el("searchInput")?.addEventListener("input", renderTable);
  el("setsBody")?.addEventListener("click", handleTableClick);
}

async function init() {
  try {
    setText("buildPill", `build: ${BUILD}`);
    bindEvents();
    SESSION = await getSessionOrWarn();
    PROFILE = await getMyProfile(SESSION.user.id);

    if (!["super_admin", "company_admin", "company_superintendent"].includes(String(PROFILE.role || ""))) {
      throw new Error("Inspection & Assurance question sets are currently available to Super Admin, Company Admin and Company Superintendent roles only.");
    }

    if (!canManage()) {
      el("createBtn")?.setAttribute("disabled", "disabled");
      showWarn("Read-only phase access: your role can view question sets, but creation/editing is restricted to Super Admin and Company Admin for now.");
    }

    await refreshAll();
  } catch (err) {
    showWarn(err?.message || String(err));
    setText("subLine", "Not ready.");
  }
}

init();
