// public/q-company.js
import { loadLockedLibraryJson } from "./question_library_loader.js";

const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lock to EXACT file
const LIBRARY_JSON_PATH = "./sire_questions_all_columns_named.json";

const SESSION_KEY_COMPAT = "q_session_v1";

const UI_ROLE_MAP = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  company_superintendent: "Company Superintendent",
  vessel: "Vessel",
  inspector: "Inspector / Third Party"
};

function roleToUi(role){ return UI_ROLE_MAP[role] || role || ""; }
function el(id){ return document.getElementById(id); }

function setSubLine(text){ el("subLine").textContent = text; }

function showWarn(msg){
  const w = el("warnBox");
  w.textContent = msg;
  w.style.display = "block";
}
function clearWarn(){
  const w = el("warnBox");
  w.textContent = "";
  w.style.display = "none";
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function fmtTs(ts){
  if (!ts) return "-";
  try{ return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

function statusPill(status){
  const s = String(status || "");
  const cls = (s === "submitted") ? "submitted" : (s === "pending_office_review" ? "pending" : "progress");
  const label = (s === "in_progress") ? "In Progress" :
                (s === "pending_office_review") ? "Pending Office Review" :
                (s === "submitted") ? "Submitted" : s;
  return `<span class="pill ${cls}">${label}</span>`;
}

// ----------------------
// Auth + profile
// ----------------------
async function getUserOrWarn(){
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error) showWarn("Auth error: " + error.message);
  if (!user){
    showWarn("You are not logged in. Please login first.");
    setSubLine("Not logged in.");
    return null;
  }
  return user;
}

async function getMyProfile(userId){
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("username, role, vessel_id")
    .eq("id", userId)
    .single();

  if (error) throw error;

  let vesselName = "";
  if (data?.vessel_id){
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
// Data loading (DB)
// ----------------------
async function loadVessels(){
  const { data, error } = await supabaseClient
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadQuestionnaires(){
  const { data, error } = await supabaseClient
    .from("questionnaires")
    .select("id, title, status, created_at, updated_at, vessel_id")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const vesselIds = [...new Set(rows.map(r => r.vessel_id).filter(Boolean))];

  if (!vesselIds.length) return rows.map(r => ({ ...r, vessel_name: "" }));

  const { data: vessels, error: vErr } = await supabaseClient
    .from("vessels")
    .select("id, name")
    .in("id", vesselIds);

  if (vErr) return rows.map(r => ({ ...r, vessel_name: "" }));

  const map = new Map((vessels || []).map(v => [v.id, v.name]));
  return rows.map(r => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
}

// Templates
async function loadTemplates(){
  const { data, error } = await supabaseClient
    .from("questionnaire_templates")
    .select("id, name, description, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadTemplateCounts(){
  const { data, error } = await supabaseClient
    .from("questionnaire_template_questions")
    .select("template_id, question_no");
  if (error) throw error;

  const map = new Map();
  for (const row of (data || [])){
    map.set(row.template_id, (map.get(row.template_id) || 0) + 1);
  }
  return map;
}

// ----------------------
// Library parsing (your JSON structure)
// ----------------------
let LIB = [];
let FILTERED = [];
let SELECTED_SET = new Set(); // question_no strings ("No." like "5.8.1")

function pick(obj, keys){
  for (const k of keys){
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function norm(v){ return String(v ?? "").trim(); }
function splitCSV(v){
  const s = norm(v);
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

// Primary question number in your JSON is "No."
function getQno(q){
  return norm(pick(q, ["No.", "No", "question_no", "questionNo", "id", "qid"]));
}

// Numeric chapter/section in your JSON: Chap, Sect
function getChapter(q){ return norm(pick(q, ["Chap", "chapter", "Chapter"])); }
function getSection(q){ return norm(pick(q, ["Sect", "section", "Section"])); }

function getQuestionType(q){ return norm(pick(q, ["Question Type", "question_type", "qtype"])); }
function getVesselTypesRaw(q){ return norm(pick(q, ["Vessel Type", "vessel_type"])); } // "Chemical, LNG, LPG, Oil"
function getVesselTypes(q){ return splitCSV(getVesselTypesRaw(q)); }

function getRankAllocationRaw(q){ return norm(pick(q, ["Company Rank Allocation", "SPIS Rank Allocation", "Company Rank Allocation "])); }
function getRankAllocationTokens(q){ return splitCSV(getRankAllocationRaw(q)); }

function getRoviqRaw(q){ return norm(pick(q, ["ROVIQ List", "ROVIQ List contains", "roviq_list_contains"])); }
function getRoviqTokens(q){ return splitCSV(getRoviqRaw(q)); }

// Response types - exactly as requested:
function getHumanResponse(q){ return norm(pick(q, ["Human Response Type", "Human Response", "human_response_type"])); }
function getHardwareResponse(q){ return norm(pick(q, ["Hardware Response Type", "Hardware Response", "hardware_response_type"])); }
function getProcessResponse(q){ return norm(pick(q, ["Process Response Type", "Process Response", "process_response_type"])); }
function getPhotoResponse(q){ return norm(pick(q, ["Photo Response", "photo_response"])); } // typically "Y"/"N"

// Risk
function getRisk(q){ return norm(pick(q, ["Risk Level", "risk_level", "Risk"])); }

// Search blob
function getTextBlob(q){
  const a = norm(pick(q, ["Question", "question", "question_text"]));
  const b = norm(pick(q, ["Expected Evidence", "expected_evidence"]));
  const c = norm(pick(q, ["Inspection Guidance", "Inspector Guidance", "inspector_guidance"]));
  const d = norm(pick(q, ["Suggested Inspector Actions", "Suggested Actions", "suggested_actions"]));
  return `${a} ${b} ${c} ${d}`.toLowerCase();
}

function uniqSorted(arr){
  return [...new Set(arr.filter(Boolean).map(x => String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
}

// ----------------------
// Read-Only style checkbox dropdown filters (multi-select)
// ----------------------
const FILTERS = {
  f_chapter: new Set(),
  f_section: new Set(),
  f_qtype: new Set(),
  f_vessel: new Set(),
  f_rank: new Set(),
  f_roviq: new Set(),
  f_human: new Set(),
  f_hardware: new Set(),
  f_process: new Set(),
  f_photo: new Set(),
  f_risk: new Set()
};

function setHasAny(set){ return set && set.size > 0; }

function matchesSet(value, set){
  if (!setHasAny(set)) return true;
  return set.has(String(value));
}

// For token fields (vessel type, roviq, rank allocation)
function matchesTokenSet(tokens, set){
  if (!setHasAny(set)) return true;
  for (const t of (tokens || [])){
    if (set.has(String(t))) return true;
  }
  return false;
}

function buildFilterBox(filterKey, values){
  const box = el(`box_${filterKey}`);
  const set = FILTERS[filterKey];

  const items = values.map(v => String(v));

  box.innerHTML = `
    <div class="filterTopActions">
      <button class="miniBtn" type="button" data-act="all" data-key="${filterKey}">All</button>
      <button class="miniBtn" type="button" data-act="none" data-key="${filterKey}">None</button>
    </div>
    ${items.length ? items.map(v => `
      <label class="checkRow">
        <input type="checkbox" data-key="${filterKey}" value="${escapeHtml(v)}" ${set.has(v) ? "checked" : ""} />
        <span>${escapeHtml(v)}</span>
      </label>
    `).join("") : `<div class="small">No values.</div>`}
  `;

  // events: all/none
  box.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const act = btn.getAttribute("data-act");
      if (act === "all"){
        set.clear();
        for (const v of items) set.add(v);
      } else {
        set.clear();
      }
      // re-render to update checkbox states
      buildAllFilterBoxes();
      applyFilters();
      renderSelectedSummary();
    });
  });

  // events: checkboxes
  box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const v = cb.value;
      if (cb.checked) set.add(v);
      else set.delete(v);
      applyFilters();
      renderSelectedSummary();
    });
  });
}

function buildAllFilterBoxes(){
  // compute available values from LIB (not FILTERED) like read-only
  const chapters = uniqSorted(LIB.map(getChapter));
  const sections = uniqSorted(LIB.map(getSection));
  const qtypes = uniqSorted(LIB.map(getQuestionType));

  // vessel types / rank / roviq are tokenized across rows
  const vesselTypes = uniqSorted(LIB.flatMap(getVesselTypes));
  const ranks = uniqSorted(LIB.flatMap(getRankAllocationTokens));
  const roviq = uniqSorted(LIB.flatMap(getRoviqTokens));

  const human = uniqSorted(LIB.map(getHumanResponse));
  const hardware = uniqSorted(LIB.map(getHardwareResponse));
  const process = uniqSorted(LIB.map(getProcessResponse));
  const photo = uniqSorted(LIB.map(getPhotoResponse));
  const risk = uniqSorted(LIB.map(getRisk));

  buildFilterBox("f_chapter", chapters);
  buildFilterBox("f_section", sections);
  buildFilterBox("f_qtype", qtypes);
  buildFilterBox("f_vessel", vesselTypes);
  buildFilterBox("f_rank", ranks);
  buildFilterBox("f_roviq", roviq);

  buildFilterBox("f_human", human);
  buildFilterBox("f_hardware", hardware);
  buildFilterBox("f_process", process);
  buildFilterBox("f_photo", photo);
  buildFilterBox("f_risk", risk);
}

function closeAllFilterBoxes(){
  document.querySelectorAll(".filterBox").forEach(b => b.classList.remove("open"));
}

function wireFilterDropdownToggles(){
  document.querySelectorAll(".filterLabel[data-toggle]").forEach(lbl => {
    lbl.addEventListener("click", (e) => {
      const key = lbl.getAttribute("data-toggle");
      const box = el(`box_${key}`);
      if (!box) return;

      const isOpen = box.classList.contains("open");
      closeAllFilterBoxes();
      if (!isOpen) box.classList.add("open");
      e.stopPropagation();
    });
  });

  // close when clicking outside
  document.addEventListener("click", () => closeAllFilterBoxes());
}

// ----------------------
// Filters application
// ----------------------
function applyFilters(){
  const s = el("fltSearch").value.trim().toLowerCase();

  FILTERED = LIB.filter(q => {
    const qno = getQno(q);
    if (!qno) return false;

    if (!matchesSet(getChapter(q), FILTERS.f_chapter)) return false;
    if (!matchesSet(getSection(q), FILTERS.f_section)) return false;
    if (!matchesSet(getQuestionType(q), FILTERS.f_qtype)) return false;

    if (!matchesTokenSet(getVesselTypes(q), FILTERS.f_vessel)) return false;
    if (!matchesTokenSet(getRankAllocationTokens(q), FILTERS.f_rank)) return false;
    if (!matchesTokenSet(getRoviqTokens(q), FILTERS.f_roviq)) return false;

    if (!matchesSet(getHumanResponse(q), FILTERS.f_human)) return false;
    if (!matchesSet(getHardwareResponse(q), FILTERS.f_hardware)) return false;
    if (!matchesSet(getProcessResponse(q), FILTERS.f_process)) return false;
    if (!matchesSet(getPhotoResponse(q), FILTERS.f_photo)) return false;

    if (!matchesSet(getRisk(q), FILTERS.f_risk)) return false;

    if (s){
      const blob = `${qno} ${getChapter(q)} ${getSection(q)} ${getQuestionType(q)} ${getVesselTypesRaw(q)} ${getRankAllocationRaw(q)} ${getRoviqRaw(q)} ${getHumanResponse(q)} ${getHardwareResponse(q)} ${getProcessResponse(q)} ${getPhotoResponse(q)} ${getRisk(q)} ${getTextBlob(q)}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }

    return true;
  });

  el("fltCount").textContent = `${FILTERED.length} questions currently selected by filters`;
}

function renderSelectedSummary(){
  el("selectedCount").textContent = `${SELECTED_SET.size} questions selected for compile`;
}

function selectAllFiltered(){
  for (const q of FILTERED){
    const qno = getQno(q);
    if (qno) SELECTED_SET.add(qno);
  }
  renderSelectedSummary();
}

function clearSelected(){
  SELECTED_SET = new Set();
  renderSelectedSummary();
}

// ----------------------
// Questionnaires UI
// ----------------------
let ALL_Q = [];
let VESSELS = [];
let PROFILE = null;

function renderVesselSelect(){
  const sel = el("vesselSelect");
  if (!VESSELS.length){
    sel.innerHTML = `<option value="">(No vessels found)</option>`;
    return;
  }
  sel.innerHTML = VESSELS.map(v => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`).join("");
}

function renderQuestionnairesTable(){
  const term = el("searchInput").value.trim().toLowerCase();
  const body = el("tableBody");

  const rows = ALL_Q.filter(q => {
    if (!term) return true;
    const vessel = q?.vessel_name || "";
    const s = String(q.status || "");
    const t = String(q.title || "");
    return vessel.toLowerCase().includes(term) || t.toLowerCase().includes(term) || s.toLowerCase().includes(term);
  });

  if (!rows.length){
    body.innerHTML = `<tr><td colspan="6" class="small">No questionnaires found.</td></tr>`;
    return;
  }

  const isSuper = (PROFILE?.role === "super_admin");

  body.innerHTML = rows.map(q => {
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
        <td class="small">
          Vessel uses <span class="mono">request_submission()</span> in q-answer (Option B).
        </td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-id");
      const st = btn.getAttribute("data-act");
      if (!qid || !st) return;
      if (!confirm("Change status to: " + st + " ?")) return;
      await updateStatus(qid, st);
    });
  });

  body.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-id");
      if (!qid) return;
      if (!confirm("DELETE questionnaire permanently?\n\nThis will cascade-delete child rows if constraints are set.\nProceed?")) return;
      await deleteQuestionnaire(qid);
    });
  });
}

async function updateStatus(qid, newStatus){
  clearWarn();
  const { error } = await supabaseClient
    .from("questionnaires")
    .update({ status: newStatus })
    .eq("id", qid);

  if (error){
    showWarn("Status update failed: " + error.message);
    return;
  }
  await refreshAll();
}

async function deleteQuestionnaire(qid){
  clearWarn();
  const { error } = await supabaseClient
    .from("questionnaires")
    .delete()
    .eq("id", qid);

  if (error){
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

function renderTemplates(){
  const body = el("tplBody");
  const isSuper = (PROFILE?.role === "super_admin");

  if (!TEMPLATES.length){
    body.innerHTML = `<tr><td colspan="5" class="small">No templates found.</td></tr>`;
    return;
  }

  body.innerHTML = TEMPLATES.map(t => {
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
  }).join("");

  body.querySelectorAll("button[data-tpl-compile]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tid = btn.getAttribute("data-id");
      if (!tid) return;
      if (!confirm("Replace template questions with the currently SELECTED set?\n\nThis overwrites the template question list.")) return;
      await compileTemplateQuestions(tid);
    });
  });

  body.querySelectorAll("button[data-tpl-createq]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const tid = btn.getAttribute("data-id");
      if (!tid) return;
      await createQuestionnaireFromTemplateFlow(tid);
    });
  });
}

async function createTemplate(){
  clearWarn();
  const name = el("tplName").value.trim();
  const desc = el("tplDesc").value.trim();

  if (!name){
    showWarn("Template name is required.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("questionnaire_templates")
    .insert({ name, description: desc, is_active: true })
    .select("id")
    .single();

  if (error){
    showWarn("Create template failed: " + error.message);
    return;
  }

  el("tplName").value = "";
  el("tplDesc").value = "";

  if (confirm("Template created. Compile it now using the currently SELECTED questions?")){
    await compileTemplateQuestions(data.id);
  } else {
    await refreshTemplates();
  }
}

async function compileTemplateQuestions(templateId){
  clearWarn();

  if (SELECTED_SET.size < 1){
    showWarn("No questions selected. Adjust filters, then click Select All Filtered (or build selection), then compile.");
    return;
  }

  // wipe old rows
  {
    const { error } = await supabaseClient
      .from("questionnaire_template_questions")
      .delete()
      .eq("template_id", templateId);

    if (error){
      showWarn("Failed clearing template questions: " + error.message);
      return;
    }
  }

  const selected = Array.from(SELECTED_SET);
  const payload = selected.map((qno, idx) => ({
    template_id: templateId,
    question_no: qno,
    sort_order: idx
  }));

  const { error } = await supabaseClient
    .from("questionnaire_template_questions")
    .insert(payload);

  if (error){
    showWarn("Compile failed: " + error.message);
    return;
  }

  await refreshTemplates();
}

async function createQuestionnaireFromTemplateFlow(templateId){
  clearWarn();

  const vesselId = el("vesselSelect").value;
  const title = el("titleInput").value.trim();

  if (!vesselId){
    showWarn("Select a vessel first (Vessel dropdown).");
    return;
  }
  if (!title){
    showWarn("Enter a title first.");
    return;
  }

  const { data, error } = await supabaseClient
    .rpc("create_questionnaire_from_template", {
      p_template_id: templateId,
      p_vessel_id: vesselId,
      p_title: title
    });

  if (error){
    showWarn("Create from template failed: " + error.message);
    return;
  }

  const qid = data;

  await refreshAll();

  if (!qid){
    showWarn("Template RPC returned no questionnaire id. Check the function return type and RLS.");
    return;
  }
  window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
}

// ----------------------
// Create questionnaire by compile (Option A)
// ----------------------
async function createQuestionnaireByCompile(userId){
  clearWarn();

  const vesselId = el("vesselSelect").value;
  const title = el("titleInput").value.trim();

  if (!vesselId){
    showWarn("Please select a vessel.");
    return;
  }
  if (!title){
    showWarn("Please enter a title.");
    return;
  }
  if (SELECTED_SET.size < 1){
    showWarn("No questions selected. Adjust filters, then click Select All Filtered.");
    return;
  }

  // 1) create questionnaire
  const payload = { title, vessel_id: vesselId, status: "in_progress", created_by: userId };

  const { data: q, error: qErr } = await supabaseClient
    .from("questionnaires")
    .insert(payload)
    .select("id")
    .single();

  if (qErr){
    showWarn("Create questionnaire failed: " + qErr.message);
    return;
  }

  const qid = q?.id;
  if (!qid){
    showWarn("Questionnaire was created but no id was returned. This is typically a SELECT/RLS return issue.");
    return;
  }

  // 2) compile questions
  const selected = Array.from(SELECTED_SET);
  const rows = selected.map(qno => ({ questionnaire_id: qid, question_no: qno }));

  const { error: qqErr } = await supabaseClient
    .from("questionnaire_questions")
    .insert(rows);

  if (qqErr){
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
async function refreshTemplates(){
  TEMPLATES = await loadTemplates();
  TEMPLATE_COUNTS = await loadTemplateCounts();
  renderTemplates();
}

async function refreshAll(){
  VESSELS = await loadVessels();
  renderVesselSelect();

  ALL_Q = await loadQuestionnaires();
  renderQuestionnairesTable();

  await refreshTemplates();
}

// ----------------------
// Init
// ----------------------
async function init(){
  clearWarn();

  const user = await getUserOrWarn();
  if (!user) return;

  try{
    PROFILE = await getMyProfile(user.id);
  }catch(e){
    setSubLine("Logged in, but profile missing or blocked.");
    showWarn("Profile missing or blocked by RLS. Ensure a row exists in public.profiles for this user.");
    return;
  }

  const uiRole = roleToUi(PROFILE.role);
  const username = PROFILE.username || user.email || "(unknown)";

  el("sessionLine").textContent = `Session: ${username}`;
  el("roleLine").textContent = `Role: ${uiRole}`;

  const vesselName = PROFILE?.vessels?.name || "";
  localStorage.setItem(SESSION_KEY_COMPAT, JSON.stringify({
    username: PROFILE.username || "",
    role: uiRole,
    vessel: vesselName,
    created_at: new Date().toISOString()
  }));

  setSubLine("Connected. Loading library, vessels, questionnaires, templates...");

  // wire dropdown toggles now
  wireFilterDropdownToggles();

  // load library
  try{
    LIB = await loadLockedLibraryJson(LIBRARY_JSON_PATH);
  }catch(e){
    showWarn(
      "Question library load failed.\n\n" +
      `Tried: ${LIBRARY_JSON_PATH}\n\n` +
      `Error: ${String(e.message || e)}`
    );
    setSubLine("Error loading library JSON.");
    LIB = [];
  }

  // build filters
  if (LIB.length){
    buildAllFilterBoxes();
    applyFilters();
    renderSelectedSummary();

    // bind search
    el("fltSearch").addEventListener("input", () => {
      applyFilters();
      renderSelectedSummary();
    });
  }

  // load db
  try{
    await refreshAll();
    setSubLine("Ready.");
  }catch(e){
    showWarn("Load failed: " + String(e.message || e));
    setSubLine("Error loading data.");
  }

  // bind buttons
  el("refreshBtn").addEventListener("click", refreshAll);
  el("searchInput").addEventListener("input", renderQuestionnairesTable);

  el("createBtn").addEventListener("click", () => createQuestionnaireByCompile(user.id));
  el("clearBtn").addEventListener("click", () => { el("titleInput").value = ""; });

  el("btnSelectAllFiltered").addEventListener("click", () => {
    applyFilters();
    selectAllFiltered();
  });

  el("btnClearSelected").addEventListener("click", clearSelected);

  // templates
  el("btnCreateTemplate").addEventListener("click", createTemplate);

  // logout
  el("logoutBtn").addEventListener("click", async () => {
    clearWarn();
    await supabaseClient.auth.signOut();
    localStorage.removeItem(SESSION_KEY_COMPAT);
    setSubLine("Logged out.");
    showWarn("Logged out. Go to login.html to sign in again.");
  });
}

init();
