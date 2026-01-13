// public/q-company.js
import { loadLockedLibraryJson } from "./question_library_loader.js";

const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// LOCKED library file (exactly as you specified)
const LIBRARY_FILE = "./sire_questions_all_columns_named.json";

const SESSION_KEY_COMPAT = "q_session_v1";

const UI_ROLE_MAP = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  company_superintendent: "Company Superintendent",
  vessel: "Vessel",
  inspector: "Inspector / Third Party",
};

function roleToUi(role) {
  return UI_ROLE_MAP[role] || role || "";
}
function el(id) {
  return document.getElementById(id);
}
function setSubLine(text) {
  el("subLine").textContent = text;
}
function showWarn(msg) {
  const w = el("warnBox");
  w.textContent = msg;
  w.style.display = "block";
}
function clearWarn() {
  const w = el("warnBox");
  w.textContent = "";
  w.style.display = "none";
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function fmtTs(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
function statusPill(status) {
  const s = String(status || "");
  const cls =
    s === "submitted" ? "submitted" : s === "pending_office_review" ? "pending" : "progress";
  const label =
    s === "in_progress"
      ? "In Progress"
      : s === "pending_office_review"
      ? "Pending Office Review"
      : s === "submitted"
      ? "Submitted"
      : s;
  return `<span class="pill ${cls}">${escapeHtml(label)}</span>`;
}

// ----------------------
// Auth + profile
// ----------------------
async function getUserOrWarn() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error) showWarn("Auth error: " + error.message);
  if (!user) {
    showWarn("You are not logged in. Please login first.");
    setSubLine("Not logged in.");
    return null;
  }
  return user;
}

async function getMyProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username, role, vessel_id")
    .eq("id", userId)
    .single();

  if (error) throw error;

  let vesselName = "";
  if (data?.vessel_id) {
    const { data: v, error: vErr } = await supabaseClient
      .from("vessels")
      .select("name")
      .eq("id", data.vessel_id)
      .maybeSingle();
    if (!vErr) vesselName = v?.name || "";
  }

  return { ...data, vessels: { name: vesselName } };
}

// ----------------------
// Supabase data
// ----------------------
async function loadVessels() {
  const { data, error } = await supabaseClient
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadQuestionnaires() {
  const { data, error } = await supabaseClient
    .from("questionnaires")
    .select("id, title, status, created_at, updated_at, vessel_id")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const vesselIds = [...new Set(rows.map((r) => r.vessel_id).filter(Boolean))];
  if (!vesselIds.length) return rows.map((r) => ({ ...r, vessel_name: "" }));

  const { data: vessels, error: vErr } = await supabaseClient
    .from("vessels")
    .select("id, name")
    .in("id", vesselIds);

  if (vErr) return rows.map((r) => ({ ...r, vessel_name: "" }));

  const map = new Map((vessels || []).map((v) => [v.id, v.name]));
  return rows.map((r) => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
}

// Templates
async function loadTemplates() {
  const { data, error } = await supabaseClient
    .from("questionnaire_templates")
    .select("id, name, description, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadTemplateCounts() {
  const { data, error } = await supabaseClient
    .from("questionnaire_template_questions")
    .select("template_id, question_no");
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    map.set(row.template_id, (map.get(row.template_id) || 0) + 1);
  }
  return map;
}

async function loadTemplateQuestionNos(templateId) {
  const { data, error } = await supabaseClient
    .from("questionnaire_template_questions")
    .select("question_no, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .order("question_no", { ascending: true });
  if (error) throw error;
  return (data || []).map((r) => String(r.question_no).trim()).filter(Boolean);
}

// ----------------------
// Library parsing (your JSON keys)
// ----------------------
let LIB = [];
let FILTERED = [];
let SELECTED_SET = new Set(); // question_no strings
const LIB_BY_QNO = new Map();

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getQno(q) {
  return String(
    pick(q, ["No.", "No", "question_no", "questionNo", "id", "qid", "QuestionNo", "Question ID", "QuestionID"])
  ).trim();
}

function getChapter(q) {
  const v = pick(q, ["Chap", "chapter", "Chapter"]);
  return String(v ?? "").trim();
}
function getSection(q) {
  const v = pick(q, ["Sect", "section", "Section"]);
  return String(v ?? "").trim();
}
function getQType(q) {
  return String(pick(q, ["Question Type", "question_type", "questionType", "qtype"])).trim();
}
function getVesselType(q) {
  return String(pick(q, ["Vessel Type", "vessel_type", "vesselType"])).trim();
}
function getRankAlloc(q) {
  return String(pick(q, ["Company Rank Allocation", "SPIS Rank Allocation", "Rank Allocation"])).trim();
}
function getRoviq(q) {
  return String(pick(q, ["ROVIQ List", "ROVIQ", "roviq", "roviq_list_contains"])).trim();
}
function getRisk(q) {
  const v = pick(q, ["Risk Level", "risk_level", "riskLevel"]);
  return String(v ?? "").trim();
}

function getHumanResp(q) {
  return String(pick(q, ["Human Response Type", "human_response_type"])).trim();
}
function getHardwareResp(q) {
  return String(pick(q, ["Hardware Response Type", "hardware_response_type"])).trim();
}
function getProcessResp(q) {
  return String(pick(q, ["Process Response Type", "process_response_type"])).trim();
}
function getPhotoResp(q) {
  return String(pick(q, ["Photo Response", "photo_response"])).trim();
}

function hasMeaningful(val) {
  const s = String(val ?? "").trim();
  if (!s) return false;
  return !["none", "n/a", "na", "n", "no"].includes(s.toLowerCase());
}

function responseBuckets(q) {
  const out = [];
  if (hasMeaningful(getHumanResp(q))) out.push("Human");
  if (hasMeaningful(getHardwareResp(q))) out.push("Hardware");
  if (hasMeaningful(getProcessResp(q))) out.push("Process");

  // Photo Response is typically Y/N
  const p = String(getPhotoResp(q)).trim().toLowerCase();
  if (p === "y" || p === "yes" || p === "true") out.push("Photo");
  return out;
}

function getTextBlob(q) {
  const a = pick(q, ["Question", "question", "question_text", "questionText"]);
  const b = pick(q, ["Expected Evidence", "expected_evidence", "expectedEvidence"]);
  const c = pick(q, ["Inspection Guidance", "Inspector Guidance", "inspector_guidance", "inspectorGuidance"]);
  return `${a} ${b} ${c}`.toLowerCase();
}

function uniqSorted(arr) {
  return [...new Set(arr.filter((x) => x != null && String(x).trim() !== "").map((x) => String(x).trim()))].sort();
}

// ----------------------
// Filters UI (Read-Only style: multi-select tickboxes in dropdowns)
// ----------------------
const filterState = {
  chapters: new Set(),
  sections: new Set(),
  qtypes: new Set(),
  vtypes: new Set(),
  ranks: new Set(),
  roviq: new Set(),
  risks: new Set(),
  responses: new Set(), // Human/Hardware/Process/Photo
};

function setCountText() {
  el("fltCount").textContent = `${FILTERED.length} questions currently selected by filters`;
  el("selectedCount").textContent = `${SELECTED_SET.size} questions selected for compile`;
}

function closeAllMenus() {
  document.querySelectorAll(".fltMenu").forEach((m) => (m.style.display = "none"));
}

function toggleMenu(menuId) {
  const m = el(menuId);
  const isOpen = m.style.display === "block";
  closeAllMenus();
  m.style.display = isOpen ? "none" : "block";
}

function buildChecklist(menuId, items, stateSet) {
  const wrap = el(menuId);
  wrap.innerHTML = "";

  // Header row (All / None)
  const head = document.createElement("div");
  head.className = "fltMenuHead";
  head.innerHTML = `
    <button class="fltMiniBtn" type="button" data-act="all">All</button>
    <button class="fltMiniBtn" type="button" data-act="none">None</button>
  `;
  wrap.appendChild(head);

  head.querySelector('[data-act="all"]').onclick = () => {
    stateSet.clear();
    for (const it of items) stateSet.add(it);
    applyFilters();
    syncChecklist(menuId, items, stateSet);
  };
  head.querySelector('[data-act="none"]').onclick = () => {
    stateSet.clear();
    applyFilters();
    syncChecklist(menuId, items, stateSet);
  };

  const list = document.createElement("div");
  list.className = "fltMenuList";

  for (const it of items) {
    const row = document.createElement("label");
    row.className = "fltRow";
    const checked = stateSet.has(it);
    row.innerHTML = `
      <input type="checkbox" ${checked ? "checked" : ""} />
      <span>${escapeHtml(it)}</span>
    `;
    const cb = row.querySelector("input");
    cb.onchange = () => {
      if (cb.checked) stateSet.add(it);
      else stateSet.delete(it);
      applyFilters();
      setCountText();
    };
    list.appendChild(row);
  }

  wrap.appendChild(list);
}

function syncChecklist(menuId, items, stateSet) {
  const wrap = el(menuId);
  wrap.querySelectorAll(".fltRow").forEach((row, idx) => {
    const it = items[idx];
    const cb = row.querySelector("input");
    if (cb) cb.checked = stateSet.has(it);
  });
}

// Apply filters
function applyFilters() {
  const s = el("fltSearch").value.trim().toLowerCase();

  FILTERED = LIB.filter((q) => {
    const qno = getQno(q);
    if (!qno) return false;

    // Set filters (multi-select)
    if (filterState.chapters.size && !filterState.chapters.has(getChapter(q))) return false;
    if (filterState.sections.size && !filterState.sections.has(getSection(q))) return false;
    if (filterState.qtypes.size && !filterState.qtypes.has(getQType(q))) return false;
    if (filterState.vtypes.size && !filterState.vtypes.has(getVesselType(q))) return false;
    if (filterState.ranks.size && !filterState.ranks.has(getRankAlloc(q))) return false;
    if (filterState.roviq.size && !filterState.roviq.has(getRoviq(q))) return false;
    if (filterState.risks.size && !filterState.risks.has(getRisk(q))) return false;

    // Combined Response filter: match if question has ANY of selected buckets
    if (filterState.responses.size) {
      const buckets = responseBuckets(q);
      const ok = buckets.some((b) => filterState.responses.has(b));
      if (!ok) return false;
    }

    if (s) {
      const blob = `${qno} ${getChapter(q)} ${getSection(q)} ${getQType(q)} ${getVesselType(q)} ${getRankAlloc(q)} ${getRisk(q)} ${getRoviq(q)} ${getTextBlob(q)}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }

    return true;
  });

  setCountText();
}

function selectAllFiltered() {
  for (const q of FILTERED) {
    const qno = getQno(q);
    if (qno) SELECTED_SET.add(qno);
  }
  setCountText();
}

function clearSelected() {
  SELECTED_SET = new Set();
  setCountText();
}

// ----------------------
// Questionnaires UI
// ----------------------
let ALL_Q = [];
let VESSELS = [];
let PROFILE = null;

function renderVesselSelect() {
  const sel = el("vesselSelect");
  if (!VESSELS.length) {
    sel.innerHTML = `<option value="">(No vessels found)</option>`;
    return;
  }
  sel.innerHTML = VESSELS.map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join("");
}

function renderQuestionnairesTable() {
  const term = el("searchInput").value.trim().toLowerCase();
  const body = el("tableBody");

  const rows = ALL_Q.filter((q) => {
    if (!term) return true;
    const vessel = q?.vessel_name || "";
    const s = String(q.status || "");
    const t = String(q.title || "");
    return vessel.toLowerCase().includes(term) || t.toLowerCase().includes(term) || s.toLowerCase().includes(term);
  });

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="small">No questionnaires found.</td></tr>`;
    return;
  }

  const isSuper = PROFILE?.role === "super_admin";

  body.innerHTML = rows
    .map((q) => {
      const vessel = q?.vessel_name || "";
      return `
        <tr>
          <td>${statusPill(q.status)}</td>
          <td>${escapeHtml(vessel)}</td>
          <td>
            <div style="font-weight:950;">${escapeHtml(q.title)}</div>
            <div class="small mono">ID: ${escapeHtml(q.id)}</div>
          </td>
          <td class="small">
            <div>Updated: ${escapeHtml(fmtTs(q.updated_at))}</div>
            <div>Created: ${escapeHtml(fmtTs(q.created_at))}</div>
          </td>
          <td>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <a class="btn btn-muted" href="./q-answer.html?qid=${encodeURIComponent(q.id)}">Open</a>
              <button class="btn btn-outline" type="button" data-act="in_progress" data-id="${escapeHtml(q.id)}">Set In Progress</button>
              <button class="btn btn-outline" type="button" data-act="pending_office_review" data-id="${escapeHtml(q.id)}">Set Pending</button>
              <button class="btn btn-outline" type="button" data-act="submitted" data-id="${escapeHtml(q.id)}">Set Submitted</button>
              ${isSuper ? `<button class="btn btn-danger" type="button" data-del="1" data-id="${escapeHtml(q.id)}">Delete</button>` : ``}
            </div>
          </td>
          <td class="small"></td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-id");
      const st = btn.getAttribute("data-act");
      if (!qid || !st) return;
      if (!confirm("Change status to: " + st + " ?")) return;
      await updateStatus(qid, st);
    });
  });

  body.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-id");
      if (!qid) return;
      if (!confirm("DELETE questionnaire permanently?\n\nProceed?")) return;
      await deleteQuestionnaire(qid);
    });
  });
}

async function updateStatus(qid, newStatus) {
  clearWarn();
  const { error } = await supabaseClient.from("questionnaires").update({ status: newStatus }).eq("id", qid);
  if (error) {
    showWarn("Status update failed: " + error.message);
    return;
  }
  await refreshAll();
}

async function deleteQuestionnaire(qid) {
  clearWarn();
  const { error } = await supabaseClient.from("questionnaires").delete().eq("id", qid);
  if (error) {
    showWarn("Delete failed: " + error.message);
    return;
  }
  await refreshAll();
}

// ----------------------
// Templates UI
// ----------------------
let TEMPLATES = [];
let TEMPLATE_COUNTS = new Map();

function renderTemplates() {
  const body = el("tplBody");
  const isSuper = PROFILE?.role === "super_admin";

  if (!TEMPLATES.length) {
    body.innerHTML = `<tr><td colspan="5" class="small">No templates found.</td></tr>`;
    return;
  }

  body.innerHTML = TEMPLATES
    .map((t) => {
      const cnt = TEMPLATE_COUNTS.get(t.id) || 0;
      return `
        <tr>
          <td style="font-weight:950;">${escapeHtml(t.name)}</td>
          <td class="small">${escapeHtml(t.description || "")}</td>
          <td class="small">${cnt}</td>
          <td class="small">${escapeHtml(fmtTs(t.updated_at || t.created_at))}</td>
          <td>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${isSuper ? `<button class="btn btn-outline" data-tpl-compile="1" data-id="${escapeHtml(t.id)}">Compile (replace questions)</button>` : ``}
              ${isSuper ? `<button class="btn btn-outline" data-tpl-createq="1" data-id="${escapeHtml(t.id)}">Create Questionnaire for Vessel</button>` : ``}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("button[data-tpl-compile]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tid = btn.getAttribute("data-id");
      if (!tid) return;
      if (!confirm("Replace template questions with the currently SELECTED set?\n\nThis overwrites the template question list.")) return;
      await compileTemplateQuestions(tid);
    });
  });

  body.querySelectorAll("button[data-tpl-createq]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tid = btn.getAttribute("data-id");
      if (!tid) return;
      await createQuestionnaireFromTemplateFlow(tid);
    });
  });
}

async function createTemplate() {
  clearWarn();
  const name = el("tplName").value.trim();
  const desc = el("tplDesc").value.trim();
  if (!name) {
    showWarn("Template name is required.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("questionnaire_templates")
    .insert({ name, description: desc, is_active: true })
    .select("id")
    .single();

  if (error) {
    showWarn("Create template failed: " + error.message);
    return;
  }

  el("tplName").value = "";
  el("tplDesc").value = "";

  if (confirm("Template created. Compile it now using the currently SELECTED questions?")) {
    await compileTemplateQuestions(data.id);
  } else {
    await refreshTemplates();
  }
}

async function compileTemplateQuestions(templateId) {
  clearWarn();
  if (SELECTED_SET.size < 1) {
    showWarn("No questions selected. Select questions first, then compile.");
    return;
  }

  // Wipe old rows
  {
    const { error } = await supabaseClient.from("questionnaire_template_questions").delete().eq("template_id", templateId);
    if (error) {
      showWarn("Failed clearing template questions: " + error.message);
      return;
    }
  }

  const selected = Array.from(SELECTED_SET);
  const payload = selected.map((qno, idx) => ({
    template_id: templateId,
    question_no: qno,
    sort_order: idx,
  }));

  const { error } = await supabaseClient.from("questionnaire_template_questions").insert(payload);
  if (error) {
    showWarn("Compile failed: " + error.message);
    return;
  }

  await refreshTemplates();
}

async function createQuestionnaireFromTemplateFlow(templateId) {
  clearWarn();

  const vesselId = el("vesselSelect").value;
  const title = el("titleInput").value.trim();
  if (!vesselId) {
    showWarn("Select a vessel first (left panel Vessel).");
    return;
  }
  if (!title) {
    showWarn("Enter a title first (left panel Title).");
    return;
  }

  const qnos = await loadTemplateQuestionNos(templateId);
  if (!qnos.length) {
    showWarn("This template has 0 questions. Compile questions into it first.");
    return;
  }

  // Create questionnaire
  const { data: q, error: qErr } = await supabaseClient
    .from("questionnaires")
    .insert({ title, vessel_id: vesselId, status: "in_progress", created_by: (await supabaseClient.auth.getUser()).data.user?.id })
    .select("id")
    .single();

  if (qErr) {
    showWarn("Create questionnaire failed: " + qErr.message);
    return;
  }
  const qid = q.id;

  // Insert questionnaire_questions INCLUDING question_json (NOT NULL)
  const rows = [];
  for (let idx = 0; idx < qnos.length; idx++) {
    const qno = qnos[idx];
    const qObj = LIB_BY_QNO.get(qno);
    if (!qObj) continue;
    rows.push({
      questionnaire_id: qid,
      question_no: qno,
      question_json: qObj, // jsonb
      sort_order: idx,
    });
  }

  if (!rows.length) {
    showWarn("Template questions could not be mapped to library question objects (question_no mismatch).");
    return;
  }

  const { error: qqErr } = await supabaseClient.from("questionnaire_questions").insert(rows);
  if (qqErr) {
    showWarn("Created questionnaire, but failed to compile questions: " + qqErr.message);
    return;
  }

  el("titleInput").value = "";
  await refreshAll();
  window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
}

// ----------------------
// Create questionnaire by compiling (Option A)
// ----------------------
async function createQuestionnaireByCompile(userId) {
  clearWarn();

  const vesselId = el("vesselSelect").value;
  const title = el("titleInput").value.trim();

  if (!vesselId) {
    showWarn("Please select a vessel.");
    return;
  }
  if (!title) {
    showWarn("Please enter a title.");
    return;
  }
  if (SELECTED_SET.size < 1) {
    showWarn("No questions selected. Adjust filters, then click Select All Filtered.");
    return;
  }

  // 1) Create questionnaire
  const { data: q, error: qErr } = await supabaseClient
    .from("questionnaires")
    .insert({ title, vessel_id: vesselId, status: "in_progress", created_by: userId })
    .select("id")
    .single();

  if (qErr) {
    showWarn("Create questionnaire failed: " + qErr.message);
    return;
  }
  const qid = q.id;

  // 2) Insert questionnaire_questions INCLUDING question_json (NOT NULL)
  const selected = Array.from(SELECTED_SET);
  const rows = [];
  for (let idx = 0; idx < selected.length; idx++) {
    const qno = selected[idx];
    const qObj = LIB_BY_QNO.get(qno);
    if (!qObj) continue;
    rows.push({
      questionnaire_id: qid,
      question_no: qno,
      question_json: qObj, // jsonb
      sort_order: idx,
    });
  }

  if (!rows.length) {
    showWarn("No selected questions could be mapped to library question objects (question_no mismatch).");
    return;
  }

  const { error: qqErr } = await supabaseClient.from("questionnaire_questions").insert(rows);
  if (qqErr) {
    showWarn("Created questionnaire, but failed to compile questions: " + qqErr.message);
    return;
  }

  el("titleInput").value = "";
  await refreshAll();
  window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
}

// ----------------------
// Refresh
// ----------------------
async function refreshTemplates() {
  TEMPLATES = await loadTemplates();
  TEMPLATE_COUNTS = await loadTemplateCounts();
  renderTemplates();
}

async function refreshAll() {
  VESSELS = await loadVessels();
  renderVesselSelect();

  ALL_Q = await loadQuestionnaires();
  renderQuestionnairesTable();

  await refreshTemplates();
}

// ----------------------
// Init
// ----------------------
async function init() {
  clearWarn();

  // Close menus when clicking outside
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t.closest || !t.closest(".fltWrap")) closeAllMenus();
  });

  const user = await getUserOrWarn();
  if (!user) return;

  try {
    PROFILE = await getMyProfile(user.id);
  } catch (e) {
    setSubLine("Logged in, but profile missing or blocked.");
    showWarn("Profile missing or blocked by RLS. Ensure a row exists in public.profiles for this user.");
    return;
  }

  const uiRole = roleToUi(PROFILE.role);
  const username = PROFILE.username || user.email || "(unknown)";

  el("sessionLine").textContent = `Session: ${username}`;
  el("roleLine").textContent = `Role: ${uiRole}`;

  const vesselName = PROFILE?.vessels?.name || "";
  localStorage.setItem(
    SESSION_KEY_COMPAT,
    JSON.stringify({
      username: PROFILE.username || "",
      role: uiRole,
      vessel: vesselName,
      created_at: new Date().toISOString(),
    })
  );

  setSubLine("Loading question library, vessels, questionnaires, templates...");

  // Load library JSON (locked)
  try {
    LIB = await loadLockedLibraryJson(LIBRARY_FILE);
    LIB_BY_QNO.clear();
    for (const q of LIB) {
      const qno = getQno(q);
      if (qno) LIB_BY_QNO.set(qno, q);
    }
    el("libLine").textContent = `Library locked to: sire_questions_all_columns_named.json`;
  } catch (e) {
    showWarn(`Question library load failed: ${String(e.message || e)}\n\nExpected file: ${LIBRARY_FILE}`);
    setSubLine("Error loading library JSON.");
  }

  // Build filter dropdowns
  if (LIB.length) {
    const chapters = uniqSorted(LIB.map(getChapter));
    const sections = uniqSorted(LIB.map(getSection));
    const qtypes = uniqSorted(LIB.map(getQType));
    const vtypes = uniqSorted(LIB.map(getVesselType));
    const ranks = uniqSorted(LIB.map(getRankAlloc));
    const roviq = uniqSorted(LIB.map(getRoviq));
    const risks = uniqSorted(LIB.map(getRisk));

    // Responses are fixed buckets
    const responses = ["Human", "Hardware", "Process", "Photo"];

    buildChecklist("menuChapters", chapters, filterState.chapters);
    buildChecklist("menuSections", sections, filterState.sections);
    buildChecklist("menuQType", qtypes, filterState.qtypes);
    buildChecklist("menuVesselType", vtypes, filterState.vtypes);
    buildChecklist("menuRank", ranks, filterState.ranks);
    buildChecklist("menuRoviq", roviq, filterState.roviq);
    buildChecklist("menuRisk", risks, filterState.risks);
    buildChecklist("menuResponse", responses, filterState.responses);
  }

  applyFilters();
  setCountText();

  // Load DB data
  try {
    await refreshAll();
    setSubLine("Ready.");
  } catch (e) {
    showWarn("Load failed: " + String(e.message || e));
    setSubLine("Error loading data.");
  }

  // Bind
  el("refreshBtn").addEventListener("click", refreshAll);
  el("searchInput").addEventListener("input", renderQuestionnairesTable);

  el("createBtn").addEventListener("click", () => createQuestionnaireByCompile(user.id));
  el("clearBtn").addEventListener("click", () => {
    el("titleInput").value = "";
  });

  el("fltSearch").addEventListener("input", () => {
    applyFilters();
  });

  el("btnSelectAllFiltered").addEventListener("click", () => {
    applyFilters();
    selectAllFiltered();
  });

  el("btnClearSelected").addEventListener("click", clearSelected);

  // Menu buttons
  el("btnChapters").onclick = (e) => { e.stopPropagation(); toggleMenu("menuChapters"); };
  el("btnSections").onclick = (e) => { e.stopPropagation(); toggleMenu("menuSections"); };
  el("btnQType").onclick = (e) => { e.stopPropagation(); toggleMenu("menuQType"); };
  el("btnVesselType").onclick = (e) => { e.stopPropagation(); toggleMenu("menuVesselType"); };
  el("btnRank").onclick = (e) => { e.stopPropagation(); toggleMenu("menuRank"); };
  el("btnRoviq").onclick = (e) => { e.stopPropagation(); toggleMenu("menuRoviq"); };
  el("btnRisk").onclick = (e) => { e.stopPropagation(); toggleMenu("menuRisk"); };
  el("btnResponse").onclick = (e) => { e.stopPropagation(); toggleMenu("menuResponse"); };

  // Templates
  el("btnCreateTemplate").addEventListener("click", createTemplate);

  // Logout
  el("logoutBtn").addEventListener("click", async () => {
    clearWarn();
    await supabaseClient.auth.signOut();
    localStorage.removeItem(SESSION_KEY_COMPAT);
    setSubLine("Logged out.");
    showWarn("Logged out. Go to login.html to sign in again.");
  });
}

init();
