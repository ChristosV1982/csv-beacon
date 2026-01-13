// public/q-company.js
import { loadLockedLibraryJson } from "./question_library_loader.js";

const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Lock to EXACT JSON used by your Read-Only library
const LIBRARY_JSON_FILENAME = "./sire_questions_all_columns_named.json";

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
// Data loading
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
// Library field mapping (your JSON keys)
// ----------------------
let LIB = [];
let FILTERED = [];
let SELECTED_SET = new Set(); // qno strings
let QNO_MAP = new Map();      // qno -> full question object (for question_json inserts)

function pick(obj, keys){
  for (const k of keys){
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getQno(q){
  return String(pick(q, ["No.","No","question_no","questionNo","id","qid","QuestionNo","Question ID","QuestionID"])).trim();
}
function getChapter(q){ return String(pick(q, ["Chap","chapter","Chapter"])).trim(); }
function getSection(q){ return String(pick(q, ["Sect","section","Section"])).trim(); }
function getQType(q){ return String(pick(q, ["Question Type","question_type","questionType","qtype"])).trim(); }
function getVesselType(q){ return String(pick(q, ["Vessel Type","vessel_type","vesselType"])).trim(); }
function getRisk(q){ return String(pick(q, ["Risk Level","risk_level","riskLevel"])).trim(); }
function getRoviq(q){ return String(pick(q, ["ROVIQ List","ROVIQ","roviq","roviq_list_contains","ROVIQ List contains"])).trim(); }
function getRank(q){ return String(pick(q, ["Company Rank Allocation","SPIS Rank Allocation","Rank Allocation"])).trim(); }

function getHumanResp(q){ return String(pick(q, ["Human Response Type","human_response_type","Human Response"])).trim(); }
function getProcessResp(q){ return String(pick(q, ["Process Response Type","process_response_type","Process Response"])).trim(); }
function getHardwareResp(q){ return String(pick(q, ["Hardware Response Type","hardware_response_type","Hardware Response"])).trim(); }
function getPhotoResp(q){
  const v = pick(q, ["Photo Response","photo_response","Photo"]);
  return String(v ?? "").trim();
}

function hasMeaningful(val){
  const s = String(val ?? "").trim();
  if (!s) return false;
  if (s.toLowerCase() === "none") return false;
  return true;
}

/**
 * Combined response category:
 * - Human: Human Response Type is not empty/None
 * - Process: Process Response Type is not empty/None
 * - Hardware: Hardware Response Type is not empty/None
 * - Photo: Photo Response is Y/Yes/True
 */
function matchesResponseCategory(q, cat){
  if (!cat) return true; // no filter
  if (cat === "Human") return hasMeaningful(getHumanResp(q));
  if (cat === "Process") return hasMeaningful(getProcessResp(q));
  if (cat === "Hardware") return hasMeaningful(getHardwareResp(q));
  if (cat === "Photo"){
    const p = String(getPhotoResp(q)).toLowerCase();
    return (p === "y" || p === "yes" || p === "true" || p === "1");
  }
  return true;
}

function getTextBlob(q){
  const a = pick(q, ["Question","question","question_text","questionText"]);
  const b = pick(q, ["Expected Evidence","expected_evidence","expectedEvidence"]);
  const c = pick(q, ["Inspection Guidance","Inspector Guidance","inspector_guidance","inspectorGuidance"]);
  return `${a} ${b} ${c}`.toLowerCase();
}

function uniqSorted(arr){
  return [...new Set(arr
    .filter(x => x != null && String(x).trim() !== "")
    .flatMap(x => String(x).split(",").map(s => s.trim()).filter(Boolean))
  )].sort((a,b) => a.localeCompare(b, undefined, { numeric:true, sensitivity:"base" }));
}

// ----------------------
// Read-Only style multi-select dropdown filters
// ----------------------
const filters = {
  chapters: { label: "Chapters", values: [], selected: new Set() },
  sections: { label: "Sections", values: [], selected: new Set() },
  qtype:    { label: "Question Type", values: [], selected: new Set() },
  vtype:    { label: "Vessel Type", values: [], selected: new Set() },
  rank:     { label: "Rank Allocation", values: [], selected: new Set() },
  roviq:    { label: "ROVIQ List", values: [], selected: new Set() },
  risk:     { label: "Risk Level", values: [], selected: new Set() },

  // Combined response filter (single-choice)
  responseCat: { label: "Response", value: "" } // "" means no filter
};

function isSelectedOrAll(selSet, allValues){
  // If nothing selected -> treat as ALL (same behaviour as Read-Only default)
  if (!selSet || selSet.size === 0) return true;
  // If all selected -> also effectively ALL
  if (selSet.size === allValues.length) return true;
  return false;
}

function selectedCountLabel(selSet, allValues){
  if (isSelectedOrAll(selSet, allValues)) return "";
  return ` (${selSet.size})`;
}

function closeAllMenus(){
  [
    "menuChapters","menuSections","menuQType","menuVesselType",
    "menuRank","menuRoviq","menuResponse","menuRisk"
  ].forEach(id => {
    const m = el(id);
    if (m) m.classList.remove("open");
  });
}

function toggleMenu(menuId){
  const m = el(menuId);
  if (!m) return;
  const isOpen = m.classList.contains("open");
  closeAllMenus();
  if (!isOpen) m.classList.add("open");
}

function buildMultiMenu({ menuEl, key, allValues }){
  const f = filters[key];

  const header = `
    <div class="filterMenuHeader">
      <div class="tiny"><b>${escapeHtml(f.label)}</b></div>
      <div style="display:flex; gap:8px;">
        <button class="miniBtn" type="button" data-all="1">All</button>
        <button class="miniBtn" type="button" data-none="1">None</button>
      </div>
    </div>
  `;

  const list = `
    <div class="filterList">
      ${allValues.map(v => {
        const checked = (f.selected.size === 0 || f.selected.has(v)) ? "checked" : "";
        return `
          <label class="chk">
            <input type="checkbox" data-val="${escapeHtml(v)}" ${checked}/>
            <span>${escapeHtml(v)}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;

  menuEl.innerHTML = header + list;

  // All / None
  menuEl.querySelector('button[data-all="1"]').addEventListener("click", () => {
    f.selected = new Set(allValues);
    renderFilterButtonLabels();
    applyFilters();
  });
  menuEl.querySelector('button[data-none="1"]').addEventListener("click", () => {
    f.selected = new Set(); // empty => treat as ALL? We want NONE as none selected? In Read-Only "None" means select none (filter becomes no matches).
    // To preserve "None" meaning: set to a special marker by selecting an impossible value.
    // Instead: we keep empty but store a separate flag:
    f.selected = new Set(["__NONE__"]);
    renderFilterButtonLabels();
    applyFilters();
  });

  // checkboxes
  menuEl.querySelectorAll('input[type="checkbox"][data-val]').forEach(chk => {
    chk.addEventListener("change", () => {
      const v = chk.getAttribute("data-val");
      if (!v) return;

      // if previously in NONE marker, clear it
      if (f.selected.has("__NONE__")) f.selected.delete("__NONE__");

      if (chk.checked) f.selected.add(v);
      else f.selected.delete(v);

      renderFilterButtonLabels();
      applyFilters();
    });
  });
}

function buildResponseMenu(menuEl){
  const label = filters.responseCat.label;
  const current = filters.responseCat.value || "";

  menuEl.innerHTML = `
    <div class="filterMenuHeader">
      <div class="tiny"><b>${escapeHtml(label)}</b></div>
      <div style="display:flex; gap:8px;">
        <button class="miniBtn" type="button" data-clear="1">Clear</button>
      </div>
    </div>

    <div class="filterList" style="max-height:220px;">
      ${[
        { v:"",        t:"(Any)" },
        { v:"Human",   t:"Human" },
        { v:"Hardware",t:"Hardware" },
        { v:"Process", t:"Process" },
        { v:"Photo",   t:"Photo" }
      ].map(opt => `
        <label class="radioRow">
          <input type="radio" name="respCat" value="${escapeHtml(opt.v)}" ${opt.v===current ? "checked" : ""}/>
          <span style="font-weight:900; color:#223a66;">${escapeHtml(opt.t)}</span>
        </label>
      `).join("")}
    </div>
  `;

  menuEl.querySelector('button[data-clear="1"]').addEventListener("click", () => {
    filters.responseCat.value = "";
    buildResponseMenu(menuEl);
    renderFilterButtonLabels();
    applyFilters();
  });

  menuEl.querySelectorAll('input[type="radio"][name="respCat"]').forEach(r => {
    r.addEventListener("change", () => {
      filters.responseCat.value = r.value || "";
      renderFilterButtonLabels();
      applyFilters();
    });
  });
}

function renderFilterButtonLabels(){
  el("btnChapters").textContent = `${filters.chapters.label} ▼${selectedCountLabel(filters.chapters.selected, filters.chapters.values)}`;
  el("btnSections").textContent = `${filters.sections.label} ▼${selectedCountLabel(filters.sections.selected, filters.sections.values)}`;
  el("btnQType").textContent = `${filters.qtype.label} ▼${selectedCountLabel(filters.qtype.selected, filters.qtype.values)}`;
  el("btnVesselType").textContent = `${filters.vtype.label} ▼${selectedCountLabel(filters.vtype.selected, filters.vtype.values)}`;
  el("btnRank").textContent = `${filters.rank.label} ▼${selectedCountLabel(filters.rank.selected, filters.rank.values)}`;
  el("btnRoviq").textContent = `${filters.roviq.label} ▼${selectedCountLabel(filters.roviq.selected, filters.roviq.values)}`;
  el("btnRisk").textContent = `${filters.risk.label} ▼${selectedCountLabel(filters.risk.selected, filters.risk.values)}`;

  const resp = filters.responseCat.value ? ` (${filters.responseCat.value})` : "";
  el("btnResponse").textContent = `${filters.responseCat.label} ▼${resp}`;
}

function valuePassesMultiFilter(selSet, allValues, value){
  if (!selSet || selSet.size === 0) return true; // treated as ALL
  if (selSet.has("__NONE__")) return false;
  if (selSet.size === allValues.length) return true;
  return selSet.has(value);
}

function applyFilters(){
  const s = el("fltSearch").value.trim().toLowerCase();

  FILTERED = LIB.filter(q => {
    const qno = getQno(q);
    if (!qno) return false;

    const ch = getChapter(q);
    const sec = getSection(q);
    const qt = getQType(q);

    // vessel type can be CSV string in your JSON => treat as contains
    const vtRaw = getVesselType(q);
    const vtList = vtRaw ? vtRaw.split(",").map(x => x.trim()).filter(Boolean) : [];

    const rk = getRisk(q);
    const rv = getRoviq(q);
    const ra = getRank(q);

    if (!valuePassesMultiFilter(filters.chapters.selected, filters.chapters.values, ch)) return false;
    if (!valuePassesMultiFilter(filters.sections.selected, filters.sections.values, sec)) return false;
    if (!valuePassesMultiFilter(filters.qtype.selected, filters.qtype.values, qt)) return false;

    // Vessel type: pass if ANY vessel type option matches the question's list
    if (filters.vtype.selected && filters.vtype.selected.size > 0 && !filters.vtype.selected.has("__NONE__")){
      const all = (filters.vtype.selected.size === filters.vtype.values.length);
      if (!all){
        const ok = vtList.some(v => filters.vtype.selected.has(v));
        if (!ok) return false;
      }
    } else if (filters.vtype.selected && filters.vtype.selected.has("__NONE__")){
      return false;
    }

    // Rank + ROVIQ are text fields; we filter by "contains" for practicality
    if (filters.rank.selected && filters.rank.selected.size > 0 && !filters.rank.selected.has("__NONE__")){
      const all = (filters.rank.selected.size === filters.rank.values.length);
      if (!all){
        const ok = Array.from(filters.rank.selected).some(v => (ra || "").toLowerCase().includes(v.toLowerCase()));
        if (!ok) return false;
      }
    } else if (filters.rank.selected && filters.rank.selected.has("__NONE__")){
      return false;
    }

    if (filters.roviq.selected && filters.roviq.selected.size > 0 && !filters.roviq.selected.has("__NONE__")){
      const all = (filters.roviq.selected.size === filters.roviq.values.length);
      if (!all){
        const ok = Array.from(filters.roviq.selected).some(v => (rv || "").toLowerCase().includes(v.toLowerCase()));
        if (!ok) return false;
      }
    } else if (filters.roviq.selected && filters.roviq.selected.has("__NONE__")){
      return false;
    }

    if (!valuePassesMultiFilter(filters.risk.selected, filters.risk.values, rk)) return false;

    // Combined response category
    if (!matchesResponseCategory(q, filters.responseCat.value)) return false;

    // Search
    if (s){
      const blob = `${qno} ${ch} ${sec} ${qt} ${vtRaw} ${rk} ${rv} ${ra} ${getTextBlob(q)}`;
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
      if (!confirm("DELETE questionnaire permanently?\n\nThis will cascade-delete child rows if your FK constraints are set.\nProceed?")) return;
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
    showWarn("No questions selected. Select questions first, then compile.");
    return;
  }

  // Wipe old rows
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

  // Insert new rows with sort_order
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
    showWarn("Select a vessel first (left panel Vessel).");
    return;
  }
  if (!title){
    showWarn("Enter a title first (left panel Title).");
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

  if (qid){
    window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
  }
}

// ----------------------
// Create questionnaire by compiling (Option A: no empty questionnaires)
// FIXED: inserts question_json (NOT NULL column) + sort_order
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
  if (!QNO_MAP || QNO_MAP.size === 0){
    showWarn("Library not loaded. Cannot compile questionnaire.");
    return;
  }

  // 1) Create questionnaire
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

  const qid = q.id;

  // 2) Insert questionnaire_questions with question_json (NOT NULL)
  const selected = Array.from(SELECTED_SET);
  const rows = [];

  for (let idx = 0; idx < selected.length; idx++){
    const qno = selected[idx];
    const obj = QNO_MAP.get(qno);
    if (!obj){
      showWarn(`Selected question not found in library JSON: ${qno}\n\nFix: ensure the library JSON is the same one used in Read-Only and includes this question number.`);
      return;
    }
    rows.push({
      questionnaire_id: qid,
      question_no: qno,
      sort_order: idx,
      question_json: obj
    });
  }

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

  // lock line
  if (el("libLockLine")) el("libLockLine").textContent = `Library locked to: ${LIBRARY_JSON_FILENAME}`;

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

  // close menus on outside click / Esc
  document.addEventListener("click", (e) => {
    const insideMenu = e.target.closest(".filterMenu");
    const insideBtn = e.target.closest(".filterBtn");
    if (!insideMenu && !insideBtn) closeAllMenus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });

  // Load library JSON (locked)
  try{
    LIB = await loadLockedLibraryJson(LIBRARY_JSON_FILENAME);

    // Build QNO map
    QNO_MAP = new Map();
    for (const q of LIB){
      const qno = getQno(q);
      if (qno) QNO_MAP.set(qno, q);
    }

  }catch(e){
    showWarn(
      `Question library load failed: ${String(e.message || e)}\n\n` +
      `Fix: ensure ${LIBRARY_JSON_FILENAME} exists in /public and is accessible.`
    );
    setSubLine("Error loading library JSON.");
  }

  // Build filters (Read-Only style)
  if (LIB.length){
    filters.chapters.values = uniqSorted(LIB.map(getChapter));
    filters.sections.values = uniqSorted(LIB.map(getSection));
    filters.qtype.values    = uniqSorted(LIB.map(getQType));

    // vessel type is CSV list -> collect unique tokens
    filters.vtype.values    = uniqSorted(LIB.map(getVesselType));

    // rank allocation / roviq list -> tokenize CSVs where present
    filters.rank.values     = uniqSorted(LIB.map(getRank));
    filters.roviq.values    = uniqSorted(LIB.map(getRoviq));

    filters.risk.values     = uniqSorted(LIB.map(getRisk)).sort((a,b) => Number(a)-Number(b));

    // default = ALL selected (Read-Only behaviour)
    filters.chapters.selected = new Set(filters.chapters.values);
    filters.sections.selected = new Set(filters.sections.values);
    filters.qtype.selected    = new Set(filters.qtype.values);
    filters.vtype.selected    = new Set(filters.vtype.values);
    filters.rank.selected     = new Set(filters.rank.values);
    filters.roviq.selected    = new Set(filters.roviq.values);
    filters.risk.selected     = new Set(filters.risk.values);

    // Build menus
    buildMultiMenu({ menuEl: el("menuChapters"), key:"chapters", allValues: filters.chapters.values });
    buildMultiMenu({ menuEl: el("menuSections"), key:"sections", allValues: filters.sections.values });
    buildMultiMenu({ menuEl: el("menuQType"), key:"qtype", allValues: filters.qtype.values });
    buildMultiMenu({ menuEl: el("menuVesselType"), key:"vtype", allValues: filters.vtype.values });
    buildMultiMenu({ menuEl: el("menuRank"), key:"rank", allValues: filters.rank.values });
    buildMultiMenu({ menuEl: el("menuRoviq"), key:"roviq", allValues: filters.roviq.values });
    buildMultiMenu({ menuEl: el("menuRisk"), key:"risk", allValues: filters.risk.values });

    buildResponseMenu(el("menuResponse"));
    renderFilterButtonLabels();

    applyFilters();
    renderSelectedSummary();
  }

  // Load DB data
  try{
    await refreshAll();
    setSubLine("Ready.");
  }catch(e){
    showWarn("Load failed: " + String(e.message || e));
    setSubLine("Error loading data.");
  }

  // Bind actions
  el("refreshBtn").addEventListener("click", refreshAll);
  el("searchInput").addEventListener("input", renderQuestionnairesTable);

  el("createBtn").addEventListener("click", () => createQuestionnaireByCompile(user.id));
  el("clearBtn").addEventListener("click", () => { el("titleInput").value = ""; });

  el("fltSearch").addEventListener("input", () => { applyFilters(); });

  el("btnSelectAllFiltered").addEventListener("click", () => {
    applyFilters();
    selectAllFiltered();
  });
  el("btnClearSelected").addEventListener("click", clearSelected);

  // Filter button toggles
  el("btnChapters").addEventListener("click", () => toggleMenu("menuChapters"));
  el("btnSections").addEventListener("click", () => toggleMenu("menuSections"));
  el("btnQType").addEventListener("click", () => toggleMenu("menuQType"));
  el("btnVesselType").addEventListener("click", () => toggleMenu("menuVesselType"));
  el("btnRank").addEventListener("click", () => toggleMenu("menuRank"));
  el("btnRoviq").addEventListener("click", () => toggleMenu("menuRoviq"));
  el("btnResponse").addEventListener("click", () => toggleMenu("menuResponse"));
  el("btnRisk").addEventListener("click", () => toggleMenu("menuRisk"));

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
