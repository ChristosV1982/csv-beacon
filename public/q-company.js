// public/q-company.js
import { loadLockedLibraryJson } from "./question_library_loader.js";

// Lock to EXACT library JSON
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

// UI role labels (display only)
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
  const s = el("subLine");
  if (s) s.textContent = text || "";
}

function showWarn(msg) {
  const w = el("warnBox");
  if (!w) return;
  w.textContent = msg || "";
  w.style.display = msg ? "block" : "none";
}

function clearWarn() {
  showWarn("");
}

function ensureSupabase() {
  const sb = window.__supabaseClient;
  if (!sb) throw new Error("Supabase client not initialized. Ensure supabase-js CDN + auth.js are loaded before q-company.js.");
  return sb;
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
      : s || "-";
  return `<span class="pill ${cls}">${escapeHtml(label)}</span>`;
}

function assignedLabel(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "All roles";
  if (s === "master") return "Master";
  if (s === "chief_officer") return "Chief Officer";
  if (s === "chief_engineer") return "Chief Engineer";
  return s;
}

function getAssignedPositionFromUI() {
  const v = (el("assignedSelect")?.value || "").trim();
  return v ? v : null; // NULL in DB => All roles
}

// ----------------------
// Filters + library parsing
// ----------------------
let LIB = [];
let LIB_BY_NO = new Map();
let FILTERED = [];
let SELECTED_SET = new Set(); // question_no strings

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

function getQType(q) {
  return String(pick(q, ["Question Type", "question_type", "questionType", "qtype"])).trim();
}

function getVesselTypeRaw(q) {
  return String(pick(q, ["Vessel Type", "vessel_type", "vesselType"])).trim();
}

function getRankAllocRaw(q) {
  return String(pick(q, ["Company Rank Allocation", "SPIS Rank Allocation", "Rank Allocation"])).trim();
}

function hasResponse(q, kind) {
  if (kind === "Human") {
    const v = String(pick(q, ["Human Response Type", "Human Response", "Human"])).trim();
    return v !== "" && v.toLowerCase() !== "none";
  }
  if (kind === "Hardware") {
    const v = String(pick(q, ["Hardware Response Type", "Hardware Response", "Hardware"])).trim();
    return v !== "" && v.toLowerCase() !== "none";
  }
  if (kind === "Process") {
    const v = String(pick(q, ["Process Response Type", "Process Response", "Process"])).trim();
    return v !== "" && v.toLowerCase() !== "none";
  }
  if (kind === "Photo") {
    const v = pick(q, ["Photo Response", "Photo"]);
    return String(v ?? "").trim().toUpperCase() === "Y" || v === true;
  }
  return false;
}

function getTextBlob(q) {
  const a = pick(q, ["Question", "question", "question_text", "questionText"]);
  const b = pick(q, ["Expected Evidence", "expected_evidence", "expectedEvidence"]);
  const c = pick(q, ["Inspection Guidance", "Inspector Guidance", "inspector_guidance", "inspectorGuidance"]);
  return `${a} ${b} ${c}`.toLowerCase();
}

const VESSEL_TYPES_FIXED = ["Chemical", "LNG", "LPG", "Oil"];

const RANKS_FIXED = [
  "Master",
  "Chief Engineer",
  "Chief Officer",
  "2nd Engineer",
  "Deck Officers",
  "Engine Officers",
  "All Crew",
  "Galley Staff",
  "Deck Ratings",
];

const RESP_TYPES_FIXED = ["Human", "Hardware", "Process", "Photo"];

const FILTERS = {
  chapters: { label: "Chapters", values: [], selected: new Set() },
  qtype: { label: "Question Type", values: [], selected: new Set() },
  vessel: { label: "Vessel Type", values: VESSEL_TYPES_FIXED, selected: new Set() },
  rank: { label: "Rank Allocation", values: RANKS_FIXED, selected: new Set() },
  resp: { label: "Response", values: RESP_TYPES_FIXED, selected: new Set() },
};

function closeAllFilterMenus() {
  document.querySelectorAll(".fltDD.open").forEach((d) => d.classList.remove("open"));
}

function renderFilterBar() {
  const row = el("filterRow");
  if (!row) return;
  row.innerHTML = "";

  const makeDD = (key) => {
    const f = FILTERS[key];
    const wrap = document.createElement("div");
    wrap.className = "fltDD";
    wrap.dataset.key = key;

    wrap.innerHTML = `
      <button type="button" class="fltBtn" data-btn="1">${escapeHtml(f.label)} ▼</button>
      <div class="fltMenu" data-menu="1">
        <div class="fltHdr">
          <div class="fltTitle">${escapeHtml(f.label)}</div>
          <div class="fltHdrBtns">
            <button type="button" class="fltMiniBtn" data-all="1">All</button>
            <button type="button" class="fltMiniBtn" data-none="1">None</button>
          </div>
        </div>
        <div class="fltItems" data-items="1"></div>
      </div>
    `;

    const btn = wrap.querySelector("[data-btn]");
    const items = wrap.querySelector("[data-items]");
    const btnAll = wrap.querySelector("[data-all]");
    const btnNone = wrap.querySelector("[data-none]");

    const rebuildItems = () => {
      const values = f.values || [];
      items.innerHTML = values
        .map((v) => {
          const checked = f.selected.has(String(v));
          return `
            <label class="fltItem">
              <input type="checkbox" data-val="${escapeHtml(String(v))}" ${checked ? "checked" : ""}/>
              <span>${escapeHtml(String(v))}</span>
            </label>
          `;
        })
        .join("");

      items.querySelectorAll("input[type=checkbox]").forEach((cb) => {
        cb.addEventListener("change", () => {
          const v = cb.getAttribute("data-val");
          if (!v) return;
          if (cb.checked) f.selected.add(v);
          else f.selected.delete(v);
          applyFilters();
        });
      });
    };

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const isOpen = wrap.classList.contains("open");
      closeAllFilterMenus();
      if (!isOpen) wrap.classList.add("open");
    });

    btnAll.addEventListener("click", () => {
      f.selected = new Set((f.values || []).map((v) => String(v)));
      rebuildItems();
      applyFilters();
    });

    btnNone.addEventListener("click", () => {
      f.selected = new Set();
      rebuildItems();
      applyFilters();
    });

    rebuildItems();
    row.appendChild(wrap);
  };

  makeDD("chapters");
  makeDD("qtype");
  makeDD("vessel");
  makeDD("rank");
  makeDD("resp");
}

function applyFilters() {
  const s = (el("fltSearch")?.value || "").trim().toLowerCase();

  FILTERED = LIB.filter((q) => {
    const qno = getQno(q);
    if (!qno) return false;

    // Chapters
    if (FILTERS.chapters.selected.size) {
      const ch = getChapter(q);
      if (!FILTERS.chapters.selected.has(String(ch))) return false;
    }

    // Question Type
    if (FILTERS.qtype.selected.size) {
      const qt = getQType(q);
      if (!FILTERS.qtype.selected.has(String(qt))) return false;
    }

    // Vessel Type: match if library field contains any selected type
    if (FILTERS.vessel.selected.size) {
      const raw = getVesselTypeRaw(q).toLowerCase();
      let ok = false;
      for (const t of FILTERS.vessel.selected) {
        if (raw.includes(String(t).toLowerCase())) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }

    // Rank allocation: substring match
    if (FILTERS.rank.selected.size) {
      const alloc = getRankAllocRaw(q).toLowerCase();
      let ok = false;
      for (const r of FILTERS.rank.selected) {
        if (alloc.includes(String(r).toLowerCase())) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }

    // Response: pass if question supports ANY selected response type
    if (FILTERS.resp.selected.size) {
      let ok = false;
      for (const k of FILTERS.resp.selected) {
        if (hasResponse(q, String(k))) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }

    // Search
    if (s) {
      const blob = `${qno} ${getChapter(q)} ${getQType(q)} ${getVesselTypeRaw(q)} ${getRankAllocRaw(q)} ${getTextBlob(q)}`;
      if (!blob.toLowerCase().includes(s)) return false;
    }

    return true;
  });

  const fltCount = el("fltCount");
  if (fltCount) fltCount.textContent = `${FILTERED.length} questions currently selected by filters`;
}

function renderSelectedSummary() {
  const sc = el("selectedCount");
  if (sc) sc.textContent = `${SELECTED_SET.size} questions selected for compile`;
}

function selectAllFiltered() {
  for (const q of FILTERED) {
    const qno = getQno(q);
    if (qno) SELECTED_SET.add(qno);
  }
  renderSelectedSummary();
}

function clearSelected() {
  SELECTED_SET = new Set();
  renderSelectedSummary();
}

// ----------------------
// Data loading
// ----------------------
async function loadVessels(supabase) {
  const { data, error } = await supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadQuestionnaires(supabase) {
  const { data, error } = await supabase
    .from("questionnaires")
    .select("id, title, status, created_at, updated_at, vessel_id, assigned_position")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = data || [];
  const vesselIds = [...new Set(rows.map((r) => r.vessel_id).filter(Boolean))];

  if (!vesselIds.length) return rows.map((r) => ({ ...r, vessel_name: "" }));

  const { data: vessels, error: vErr } = await supabase
    .from("vessels")
    .select("id, name")
    .in("id", vesselIds);

  if (vErr) return rows.map((r) => ({ ...r, vessel_name: "" }));

  const map = new Map((vessels || []).map((v) => [v.id, v.name]));
  return rows.map((r) => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
}

// Templates
async function loadTemplates(supabase) {
  const { data, error } = await supabase
    .from("questionnaire_templates")
    .select("id, name, description, is_active, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function loadTemplateCounts(supabase) {
  const { data, error } = await supabase
    .from("questionnaire_template_questions")
    .select("template_id, question_no");
  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    map.set(row.template_id, (map.get(row.template_id) || 0) + 1);
  }
  return map;
}

// ----------------------
// UI rendering
// ----------------------
let ALL_Q = [];
let VESSELS = [];
let PROFILE = null;
let TEMPLATES = [];
let TEMPLATE_COUNTS = new Map();

function renderVesselSelect() {
  const sel = el("vesselSelect");
  if (!sel) return;

  if (!VESSELS.length) {
    sel.innerHTML = `<option value="">(No vessels found)</option>`;
    return;
  }
  sel.innerHTML = VESSELS
    .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`)
    .join("");
}

function renderQuestionnairesTable() {
  const term = (el("searchInput")?.value || "").trim().toLowerCase();
  const body = el("tableBody");
  if (!body) return;

  const rows = ALL_Q.filter((q) => {
    if (!term) return true;
    const vessel = q?.vessel_name || "";
    const st = String(q.status || "");
    const tt = String(q.title || "");
    const asg = assignedLabel(q.assigned_position);
    return (
      vessel.toLowerCase().includes(term) ||
      tt.toLowerCase().includes(term) ||
      st.toLowerCase().includes(term) ||
      asg.toLowerCase().includes(term)
    );
  });

  const isSuper = PROFILE?.role === "super_admin";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="small">No questionnaires found.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((q) => {
      const vessel = q?.vessel_name || "";
      return `
        <tr>
          <td>${statusPill(q.status)}</td>
          <td>${escapeHtml(vessel)}</td>
          <td>${escapeHtml(assignedLabel(q.assigned_position))}</td>
          <td>
            <div style="font-weight:950;">${escapeHtml(q.title || "")}</div>
            <div class="small mono">ID: ${escapeHtml(q.id)}</div>
          </td>
          <td class="small">
            <div>Updated: ${escapeHtml(fmtTs(q.updated_at))}</div>
            <div>Created: ${escapeHtml(fmtTs(q.created_at))}</div>
          </td>
          <td>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <a class="btn btn-muted" href="./q-answer.html?qid=${encodeURIComponent(q.id)}">Open</a>
              ${
                isSuper
                  ? `<button class="btn btn-danger" type="button" data-del="1" data-id="${escapeHtml(q.id)}">Delete</button>`
                  : ``
              }
            </div>
          </td>
          <td class="small">
            Answer in <span class="mono">q-answer.html?qid=&lt;uuid&gt;</span>
          </td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-id");
      if (!qid) return;
      if (!confirm("DELETE questionnaire permanently?\n\nProceed?")) return;
      await deleteQuestionnaire(qid);
    });
  });
}

async function deleteQuestionnaire(qid) {
  clearWarn();
  const supabase = ensureSupabase();
  const { error } = await supabase.from("questionnaires").delete().eq("id", qid);
  if (error) {
    showWarn("Delete failed: " + error.message);
    return;
  }
  await refreshAll();
}

function renderTemplates() {
  const body = el("tplBody");
  if (!body) return;

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
              ${
                isSuper
                  ? `<button class="btn btn-outline" data-tpl-compile="1" data-id="${escapeHtml(t.id)}">Compile (replace questions)</button>`
                  : ``
              }
              ${
                isSuper
                  ? `<button class="btn btn-outline" data-tpl-createq="1" data-id="${escapeHtml(t.id)}">Create Questionnaire for Vessel</button>`
                  : ``
              }
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

// ----------------------
// Template actions
// ----------------------
async function createTemplate() {
  clearWarn();
  const supabase = ensureSupabase();

  const name = (el("tplName")?.value || "").trim();
  const desc = (el("tplDesc")?.value || "").trim();

  if (!name) {
    showWarn("Template name is required.");
    return;
  }

  const { data, error } = await supabase
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
  const supabase = ensureSupabase();

  if (SELECTED_SET.size < 1) {
    showWarn("No questions selected. Select questions first, then compile.");
    return;
  }

  const { error: delErr } = await supabase
    .from("questionnaire_template_questions")
    .delete()
    .eq("template_id", templateId);

  if (delErr) {
    showWarn("Failed clearing template questions: " + delErr.message);
    return;
  }

  const selected = Array.from(SELECTED_SET);
  const payload = selected.map((qno, idx) => ({
    template_id: templateId,
    question_no: qno,
    sort_order: idx,
  }));

  const { error } = await supabase.from("questionnaire_template_questions").insert(payload);

  if (error) {
    showWarn("Compile failed: " + error.message);
    return;
  }

  await refreshTemplates();
}

async function applyAssignedPositionToQuestionnaire(qid) {
  const supabase = ensureSupabase();
  const assigned = getAssignedPositionFromUI();
  const { error } = await supabase
    .from("questionnaires")
    .update({ assigned_position: assigned })
    .eq("id", qid);

  if (error) throw error;
}

async function createQuestionnaireFromTemplateFlow(templateId) {
  clearWarn();
  const supabase = ensureSupabase();

  const vesselId = el("vesselSelect")?.value || "";
  const title = (el("titleInput")?.value || "").trim();

  if (!vesselId) {
    showWarn("Select a vessel first (Vessel).");
    return;
  }
  if (!title) {
    showWarn("Enter a title first (Title).");
    return;
  }

  const { data, error } = await supabase.rpc("create_questionnaire_from_template", {
    p_template_id: templateId,
    p_vessel_id: vesselId,
    p_title: title,
  });

  if (error) {
    showWarn("Create from template failed: " + error.message);
    return;
  }

  const qid = data;

  if (qid) {
    try {
      await applyAssignedPositionToQuestionnaire(qid);
    } catch (e) {
      showWarn(
        "Questionnaire created from template, but assignment update failed.\n\n" +
        "Error: " + String(e?.message || e)
      );
    }
  }

  await refreshAll();

  if (qid) {
    window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
  }
}

// ----------------------
// Create questionnaire by compiling (Option A)
// ----------------------
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getPgnoBullets(qObj) {
  const a = qObj?.NegObs_Bullets;
  if (Array.isArray(a) && a.length) {
    return a.map((x) => String(x || "").trim()).filter(Boolean);
  }

  const raw = qObj?.["Potential Grounds for Negative Observations"];
  if (!raw) return [];

  const lines = String(raw)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return lines.map((ln) => ln.replace(/^[-•o*]+\s*/, "").trim()).filter(Boolean);
}

async function createQuestionnaireByCompile(userId) {
  clearWarn();
  const supabase = ensureSupabase();

  const btn = el("createBtn");
  if (btn) btn.disabled = true;

  try {
    const vesselId = el("vesselSelect")?.value || "";
    const title = (el("titleInput")?.value || "").trim();
    const assigned = getAssignedPositionFromUI();

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

    setSubLine("Creating questionnaire and compiling selected questions...");

    // 1) Create questionnaire (includes assigned_position)
    const payload = {
      title,
      vessel_id: vesselId,
      status: "in_progress",
      created_by: userId,
      assigned_position: assigned, // NULL => All roles
    };

    const { data: q, error: qErr } = await supabase
      .from("questionnaires")
      .insert(payload)
      .select("id")
      .single();

    if (qErr) {
      showWarn("Create questionnaire failed: " + qErr.message);
      return;
    }

    const qid = q.id;

    // 2) Build questionnaire_questions rows (MUST include question_json)
    const selected = Array.from(SELECTED_SET);

    const qqRows = [];
    const missing = [];

    for (let i = 0; i < selected.length; i++) {
      const qno = String(selected[i]);
      const qObj = LIB_BY_NO.get(qno);
      if (!qObj) {
        missing.push(qno);
        continue;
      }

      qqRows.push({
        questionnaire_id: qid,
        seq: i + 1,
        question_no: qno,
        question_json: qObj,
      });
    }

    if (missing.length) {
      showWarn(
        "Some selected question numbers were not found in the locked library JSON:\n" +
          missing.slice(0, 30).join(", ") +
          (missing.length > 30 ? ` ... (+${missing.length - 30} more)` : "")
      );
    }

    const qqBatches = chunk(qqRows, 50);
    for (let i = 0; i < qqBatches.length; i++) {
      setSubLine(`Compiling questions... (${i + 1}/${qqBatches.length})`);
      const { error: insErr } = await supabase.from("questionnaire_questions").insert(qqBatches[i]);
      if (insErr) {
        await supabase.from("questionnaires").delete().eq("id", qid);
        showWarn("Created questionnaire, but failed to compile questions:\n" + insErr.message);
        return;
      }
    }

    // 3) Create answers_pgno rows (warn-only on failure)
    try {
      setSubLine("Creating PGNO answer rows...");

      const apRows = [];
      for (const row of qqRows) {
        const bullets = getPgnoBullets(row.question_json);
        for (let idx = 0; idx < bullets.length; idx++) {
          apRows.push({
            questionnaire_id: qid,
            question_no: row.question_no,
            pgno_index: idx + 1,
            pgno_text: bullets[idx],
            response: null,
            remarks: "",
          });
        }
      }

      const apBatches = chunk(apRows, 200);
      for (let i = 0; i < apBatches.length; i++) {
        setSubLine(`Creating PGNO rows... (${i + 1}/${apBatches.length})`);
        const { error: apErr } = await supabase.from("answers_pgno").insert(apBatches[i]);
        if (apErr) {
          showWarn(
            "Questionnaire created and questions compiled, but PGNO answer rows could not be created.\n" +
              "This usually means RLS or table constraints on answers_pgno.\n\n" +
              "Error: " + apErr.message
          );
          break;
        }
      }
    } catch (e) {
      showWarn("Questionnaire created, but PGNO row creation failed: " + String(e?.message || e));
    }

    if (el("titleInput")) el("titleInput").value = "";
    await refreshAll();

    window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
  } finally {
    if (btn) btn.disabled = false;
    setSubLine("Ready.");
  }
}

// ----------------------
// Refresh
// ----------------------
async function refreshTemplates() {
  const supabase = ensureSupabase();
  TEMPLATES = await loadTemplates(supabase);
  TEMPLATE_COUNTS = await loadTemplateCounts(supabase);
  renderTemplates();
}

async function refreshAll() {
  const supabase = ensureSupabase();

  VESSELS = await loadVessels(supabase);
  renderVesselSelect();

  ALL_Q = await loadQuestionnaires(supabase);
  renderQuestionnairesTable();

  await refreshTemplates();
}

// ----------------------
// Init
// ----------------------
async function init() {
  clearWarn();
  const lockLine = el("libraryLockLine");
  if (lockLine) lockLine.textContent = `Library locked to: ${LOCKED_LIBRARY_JSON}`;

  // Close filter menus when clicking outside
  document.addEventListener("click", (e) => {
    const inside = e.target.closest(".fltDD");
    if (!inside) closeAllFilterMenus();
  });

  // Escape closes menus
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllFilterMenus();
  });

  // Require office roles for Company page
  const me = await AUTH.requireAuth([
    AUTH.ROLES.SUPER_ADMIN,
    AUTH.ROLES.COMPANY_ADMIN,
    AUTH.ROLES.COMPANY_SUPERINTENDENT,
  ]);
  if (!me) return;

  PROFILE = me.profile;

  el("sessionLine").textContent = `Session: ${PROFILE.username || (me.user?.email || "")}`;
  el("roleLine").textContent = `Role: ${roleToUi(PROFILE.role)}`;

  setSubLine("Loading question library...");

  // Load library JSON
  try {
    LIB = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
    LIB_BY_NO = new Map();
    for (const q of LIB) {
      const qno = getQno(q);
      if (qno) LIB_BY_NO.set(String(qno), q);
    }
  } catch (e) {
    showWarn(`Question library load failed:\n${String(e.message || e)}`);
    setSubLine("Error loading library JSON.");
  }

  // Build filter values from LIB
  if (LIB.length) {
    const chapters = [...new Set(LIB.map(getChapter).filter(Boolean).map(String))].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    const qtypes = [...new Set(LIB.map(getQType).filter(Boolean).map(String))].sort();

    FILTERS.chapters.values = chapters;
    FILTERS.qtype.values = qtypes;

    renderFilterBar();
    applyFilters();
    renderSelectedSummary();
  } else {
    renderFilterBar();
  }

  // Load DB data
  try {
    await refreshAll();
    setSubLine("Ready.");
  } catch (e) {
    showWarn("Load failed: " + String(e.message || e));
    setSubLine("Error loading data.");
  }

  // Bind buttons
  el("refreshBtn")?.addEventListener("click", refreshAll);
  el("searchInput")?.addEventListener("input", renderQuestionnairesTable);

  el("createBtn")?.addEventListener("click", () => createQuestionnaireByCompile(me.user.id));
  el("clearBtn")?.addEventListener("click", () => { el("titleInput").value = ""; });

  el("fltSearch")?.addEventListener("input", applyFilters);

  el("btnSelectAllFiltered")?.addEventListener("click", () => {
    applyFilters();
    selectAllFiltered();
  });

  el("btnClearSelected")?.addEventListener("click", clearSelected);
  el("btnCreateTemplate")?.addEventListener("click", createTemplate);

  // Logout
  el("logoutBtn")?.addEventListener("click", AUTH.logoutAndGoLogin);
}

init().catch((e) => {
  console.error(e);
  showWarn(String(e?.message || e));
  setSubLine("Error.");
});
