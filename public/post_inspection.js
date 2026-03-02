import { loadLockedLibraryJson } from "./question_library_loader.js";

/**
 * HARD BUILD STAMP
 */
const POST_INSPECTION_BUILD = "post_inspection_ui_v23_pgno_for_largely_examined_fix_2026-03-02";

/**
 * Locked library JSON
 */
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

/**
 * Storage
 */
const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";

/**
 * Titles storage (local, user-editable via modal)
 */
const TITLES_STORAGE_KEY = "post_inspection_titles_v1";
const DEFAULT_TITLES = [
  "SIRE 2.0 Inspection",
  "Company Audit",
  "Third Party Audit",
];

/**
 * Examined questions fallback storage (if DB schema missing)
 */
const EXAMINED_LOCAL_KEY = "post_inspection_examined_by_report_v1";

function el(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nowIso() { return new Date().toISOString(); }

function ddmmyyyyToIso(ddmmyyyy) {
  const s = String(ddmmyyyy || "").trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  const dd = m[1], mm = m[2], yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  const canon = parts.map(p => {
    const n = String(p).replace(/^0+/, "") || "0";
    return String(Number(n));
  });
  return canon.join(".");
}

function normalizeQnoParts(qno, pad2) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (parts.length < 2) return String(qno || "").trim();
  const norm = parts.map(p => {
    const n = p.replace(/^0+/, "") || "0";
    return pad2 ? n.padStart(2, "0") : String(Number(n));
  });
  return norm.join(".");
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getQno(q) {
  return String(pick(q, ["No.", "No", "question_no", "QuestionNo", "Question ID"])).trim();
}
function getChap(q) { return String(pick(q, ["Chap", "chapter", "Chapter"])).trim(); }
function getSection(q) { return String(pick(q, ["Section Name", "Sect", "section", "Section"])).trim(); }
function getShort(q) { return String(pick(q, ["Short Text", "short_text", "ShortText"])).trim(); }
function getQText(q) { return String(pick(q, ["Question", "question"])).trim(); }

function getPgnoBullets(q) {
  const bullets = Array.isArray(q?.NegObs_Bullets) ? q.NegObs_Bullets : null;
  if (bullets && bullets.length) {
    return bullets.map((t) => String(t || "").trim()).filter(Boolean);
  }

  const pgTxt = String(q?.["Potential Grounds for Negative Observations"] || "").trim();
  if (!pgTxt) return [];

  const lines = pgTxt.split("\n").map((s) => s.trim()).filter(Boolean);
  const usable = lines.filter((s) => s.length > 6);
  return usable.slice(0, 120);
}

function normDesignation(d) {
  const s = String(d || "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low === "human") return "Human";
  if (low === "process") return "Process";
  if (low === "hardware") return "Hardware";
  if (low === "photo") return "Photo";
  return s;
}

/* ---------- State ---------- */

const state = {
  me: null,
  supabase: null,

  vessels: [],
  lib: [],
  libByNo: new Map(),
  libCanonToExact: new Map(),

  reports: [],
  activeReport: null,

  observationsByQno: {},
  extractedItems: [],
  dialogItem: null,

  storedFilters: {},
  openFilterCol: null,

  titles: [],

  examinedQuestions: [],
  examinedCount: 0,
};

/* ---------- UI helpers ---------- */

function setSaveStatus(text) { el("saveStatus").textContent = text || "Not saved"; }
function setActivePill(text) { el("activeReportPill").textContent = text || "No active report"; }

function reportLabel(r) {
  const v = r.vessel_name || "Unknown vessel";
  const d = r.inspection_date || "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${v} | ${d}${ref}`;
}

function obsRowTypeLabel(kind) {
  if (kind === "negative") return `<span class="obs-badge neg">Negative</span>`;
  if (kind === "positive") return `<span class="obs-badge pos">Positive</span>`;
  return `<span class="obs-badge lae">Largely</span>`;
}

/* ---------- Titles (local) ---------- */

function loadTitles() {
  try {
    const raw = localStorage.getItem(TITLES_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr.map(x => String(x)).filter(Boolean);
    }
  } catch {}
  return [...DEFAULT_TITLES];
}

function saveTitles() {
  try { localStorage.setItem(TITLES_STORAGE_KEY, JSON.stringify(state.titles)); } catch {}
}

function renderTitleSelect() {
  const sel = el("reportTitle");
  const current = String(sel.value || "").trim();
  sel.innerHTML = "";
  for (const t of state.titles) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  }
  if (current && state.titles.includes(current)) sel.value = current;
  else sel.value = state.titles[0] || "";
}

function openTitlesModal() {
  renderTitlesList();
  el("titlesDialog").showModal();
}

function renderTitlesList() {
  const box = el("titlesList");
  box.innerHTML = "";
  for (const t of state.titles) {
    const row = document.createElement("div");
    row.className = "chk-row";
    row.style.justifyContent = "space-between";
    row.innerHTML = `
      <div>${esc(t)}</div>
      <button class="btn warn" type="button" data-title="${esc(t)}" style="padding:6px 10px !important;">Remove</button>
    `;
    box.appendChild(row);
  }
  box.querySelectorAll("button[data-title]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.getAttribute("data-title");
      state.titles = state.titles.filter(x => x !== t);
      if (!state.titles.length) state.titles = [...DEFAULT_TITLES];
      saveTitles();
      renderTitleSelect();
      renderTitlesList();
    });
  });
}

/* ---------- Supabase DB helpers ---------- */

async function loadVessels() {
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadReportsFromDb() {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const rows = data || [];
  const vesselIds = [...new Set(rows.map(r => r.vessel_id).filter(Boolean))];

  if (!vesselIds.length) return rows.map(r => ({ ...r, vessel_name: "" }));

  const { data: vessels, error: vErr } = await state.supabase
    .from("vessels")
    .select("id, name")
    .in("id", vesselIds);

  const map = new Map((vessels || []).map(v => [v.id, v.name]));
  if (vErr) return rows.map(r => ({ ...r, vessel_name: "" }));

  return rows.map(r => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
}

async function loadObservationsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .select("report_id, question_no, has_observation, observation_type, pgno_selected, remarks, updated_at, obs_type, observation_text, question_base, designation, nature_of_concern, classification_coding, positive_rank")
    .eq("report_id", reportId);

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    const pg = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
    map[row.question_no] = { ...row, pgno_selected: pg };
  }
  return map;
}

async function createReportHeader(payload) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([payload])
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, payload) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update(payload)
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

async function deleteReport(reportId) {
  const { error } = await state.supabase
    .from("post_inspection_reports")
    .delete()
    .eq("id", reportId);
  if (error) throw error;
}

async function upsertObservationRow(row) {
  const { error } = await state.supabase
    .from("post_inspection_observations")
    .upsert([row], { onConflict: "report_id,question_no" });
  if (error) throw error;
}

/**
 * Examined questions persistence (best-effort):
 */
async function persistExaminedQuestions(reportId, examinedQuestions) {
  const canon = (examinedQuestions || []).map(canonicalQno).filter(Boolean);
  const uniq = [...new Set(canon)].sort((a,b)=>a.localeCompare(b));

  el("examinedStoreHint").style.display = "none";

  try {
    const { error } = await state.supabase
      .from("post_inspection_reports")
      .update({
        examined_count: uniq.length,
        examined_questions: uniq,
        updated_at: nowIso(),
      })
      .eq("id", reportId);

    if (!error) return { ok:true, method:"reports_columns" };
  } catch (_) {}

  try {
    const rows = uniq.map(qno => ({
      report_id: reportId,
      question_no: qno,
      updated_at: nowIso(),
    }));

    const { error } = await state.supabase
      .from("post_inspection_examined_questions")
      .upsert(rows, { onConflict: "report_id,question_no" });

    if (!error) return { ok:true, method:"examined_table" };
  } catch (_) {}

  try {
    const raw = localStorage.getItem(EXAMINED_LOCAL_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[String(reportId)] = { examined_questions: uniq, examined_count: uniq.length, stored_at: nowIso() };
    localStorage.setItem(EXAMINED_LOCAL_KEY, JSON.stringify(obj));
    el("examinedStoreHint").style.display = "block";
  } catch {}

  return { ok:false, method:"local_fallback" };
}

function loadExaminedQuestionsFallback(reportId) {
  try {
    const raw = localStorage.getItem(EXAMINED_LOCAL_KEY);
    if (!raw) return { examined_questions: [], examined_count: 0 };
    const obj = JSON.parse(raw);
    const hit = obj?.[String(reportId)];
    if (!hit) return { examined_questions: [], examined_count: 0 };
    const arr = Array.isArray(hit.examined_questions) ? hit.examined_questions : [];
    const cnt = Number(hit.examined_count || arr.length) || arr.length;
    return { examined_questions: arr.map(canonicalQno).filter(Boolean), examined_count: cnt };
  } catch {
    return { examined_questions: [], examined_count: 0 };
  }
}

/* ---------- PGNO rules ---------- */
/**
 * PGNO is REQUIRED for:
 * - negative
 * - largely
 * PGNO is NOT APPLICABLE for:
 * - positive
 */
function pgnoRequiredForKind(kind) {
  return kind === "negative" || kind === "largely";
}

/* ---------- Stored inspections table + tickbox filters ---------- */

function uniqueValuesForCol(col) {
  const vals = (state.reports || [])
    .map(r => (r?.[col] ?? ""))
    .map(v => String(v || "").trim())
    .filter(Boolean);

  const uniq = [...new Set(vals)];
  uniq.sort((a,b) => a.localeCompare(b));
  return uniq;
}

function reportPassesStoredFilters(r) {
  for (const col of Object.keys(state.storedFilters)) {
    const set = state.storedFilters[col];
    if (!(set instanceof Set) || set.size === 0) continue;

    const v = String(r?.[col] ?? "").trim();
    if (!v) return false;
    if (!set.has(v)) return false;
  }
  return true;
}

function renderStoredTable() {
  const body = el("storedTableBody");
  const rows = (state.reports || []).filter(reportPassesStoredFilters);

  el("storedCount").textContent = `${rows.length} inspection(s)`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No inspections found.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    return `
      <tr class="stored-row" data-id="${esc(r.id)}">
        <td class="vessel-bold" title="${esc(r.vessel_name || "")}">${esc(r.vessel_name || "—")}</td>
        <td>${esc(r.inspection_date || "—")}</td>
        <td title="${esc(r.report_ref || "")}">${esc(r.report_ref || "—")}</td>
        <td title="${esc(r.title || "")}">${esc(r.title || "—")}</td>
        <td title="${esc(r.ocimf_inspecting_company || "")}">${esc(r.ocimf_inspecting_company || "—")}</td>
        <td title="${esc(r.inspector_name || "")}">${esc(r.inspector_name || "—")}</td>
        <td title="${esc(r.inspector_company || "")}">${esc(r.inspector_company || "—")}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("tr.stored-row").forEach(tr => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      await setActiveReportById(id);
    });
  });
}

function closeStoredFilterDialog() {
  try { el("storedFilterDialog").close(); } catch {}
  state.openFilterCol = null;
}

function openStoredFilterForCol(col) {
  if (state.openFilterCol === col && el("storedFilterDialog").open) {
    closeStoredFilterDialog();
    return;
  }

  state.openFilterCol = col;

  const titleMap = {
    vessel_name: "Vessel",
    inspection_date: "Date",
    report_ref: "Report Ref",
    title: "Title",
    ocimf_inspecting_company: "OCIMF Inspecting Company",
    inspector_name: "Inspector Name",
    inspector_company: "Inspector’s Company",
  };

  el("storedFilterTitle").textContent = `${titleMap[col] || "Filters"}`;
  el("storedFilterSearch").value = "";

  const values = uniqueValuesForCol(col);
  const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();

  renderStoredFilterList(values, set, "");

  el("storedFilterDialog").showModal();

  el("storedFilterDialog").addEventListener("click", (e) => {
    const rect = el("storedFilterDialog").getBoundingClientRect();
    const inDialog =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inDialog) closeStoredFilterDialog();
  }, { once:true });
}

function renderStoredFilterList(values, selectedSet, searchTerm) {
  const box = el("storedFilterList");
  const term = String(searchTerm || "").trim().toLowerCase();

  const filtered = !term
    ? values
    : values.filter(v => String(v).toLowerCase().includes(term));

  if (!filtered.length) {
    box.innerHTML = `<div class="muted" style="padding:8px;">No values.</div>`;
    return;
  }

  box.innerHTML = filtered.map(v => {
    const checked = selectedSet.has(v) ? "checked" : "";
    return `
      <label class="chk-row">
        <input type="checkbox" class="storedFilterChk" data-val="${esc(v)}" ${checked} />
        <span>${esc(v)}</span>
      </label>
    `;
  }).join("");

  box.querySelectorAll(".storedFilterChk").forEach(chk => {
    chk.addEventListener("change", () => {
      const v = chk.getAttribute("data-val");
      if (!v) return;
      if (chk.checked) selectedSet.add(v);
      else selectedSet.delete(v);
    });
  });
}

/* ---------- Header + active report ---------- */

function headerInputs() {
  return {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    inspection_date: String(el("inspectionDate").value || "").trim(),
    port_name: String(el("portName").value || "").trim(),
    port_code: String(el("portCode").value || "").trim(),
    ocimf_inspecting_company: String(el("ocimfCompany").value || "").trim(),
    report_ref: String(el("reportRef").value || "").trim(),
    title: String(el("reportTitle").value || "").trim(),
    inspector_name: String(el("inspectorName").value || "").trim() || null,
    inspector_company: String(el("inspectorCompany").value || "").trim() || null,
    pdf_storage_path: state.activeReport?.pdf_storage_path || null,
  };
}

function loadReportIntoHeader(r) {
  el("vesselSelect").value = r.vessel_id || "";
  el("inspectionDate").value = r.inspection_date || "";
  el("portName").value = r.port_name || "";
  el("portCode").value = r.port_code || "";
  el("ocimfCompany").value = r.ocimf_inspecting_company || "";
  el("reportRef").value = r.report_ref || "";

  const t = String(r.title || "").trim();
  if (t && !state.titles.includes(t)) {
    state.titles.push(t);
    state.titles = [...new Set(state.titles)];
    saveTitles();
    renderTitleSelect();
  }
  el("reportTitle").value = t || (state.titles[0] || "");

  el("inspectorName").value = r.inspector_name || "";
  el("inspectorCompany").value = r.inspector_company || "";

  setActivePill("Active: " + reportLabel(r));

  if (r.pdf_storage_path) {
    el("pdfStatus").textContent = `Stored: ${r.pdf_storage_path.split("/").pop()}`;
  } else {
    el("pdfStatus").textContent = "No PDF linked";
  }
}

function renderVesselsSelect() {
  const sel = el("vesselSelect");
  sel.innerHTML = `<option value="">— Select vessel —</option>`;
  for (const v of state.vessels) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function updateTopCounters() {
  el("questionsExaminedVal").textContent = String(state.examinedCount || 0);

  const items = state.extractedItems || [];
  const total = items.length;
  const neg = items.filter(x => x.kind === "negative").length;
  const pos = items.filter(x => x.kind === "positive").length;
  const lae = items.filter(x => x.kind === "largely").length;

  el("itemsExtractedVal").textContent = String(total);
  el("negCountVal").textContent = String(neg);
  el("posCountVal").textContent = String(pos);
  el("laeCountVal").textContent = String(lae);
}

async function setActiveReportById(id) {
  const r = state.reports.find(x => x.id === id) || null;
  if (!r) return;

  state.activeReport = r;
  loadReportIntoHeader(r);

  setSaveStatus("Loading…");

  try {
    state.observationsByQno = await loadObservationsForReport(r.id);
  } catch (e) {
    console.error(e);
    alert("Failed to load observations: " + (e?.message || String(e)));
    state.observationsByQno = {};
  }

  const fb = loadExaminedQuestionsFallback(r.id);
  state.examinedQuestions = fb.examined_questions || [];
  state.examinedCount = Number(fb.examined_count || state.examinedQuestions.length) || state.examinedQuestions.length;

  buildExtractedItemsFromDb();
  renderObsTable();
  renderObsSummary();
  updateTopCounters();

  setSaveStatus("Loaded");
}

/* ---------- Extracted items building ---------- */

function missingPgnoForQno(qno) {
  const row = state.observationsByQno[qno];
  if (!row) return false;

  const ot = String(row.observation_type || "");
  const isPgnoRequired = (ot === "negative_observation" || ot === "note_improvement"); // note_improvement == largely

  if (!isPgnoRequired) return false;

  const arr = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
  return arr.length === 0;
}

function buildExtractedItemsFromDb() {
  const out = [];
  const map = state.observationsByQno || {};

  for (const qno of Object.keys(map)) {
    const row = map[qno];
    if (!row?.has_observation) continue;

    const ot = String(row.observation_type || "");
    let kind = "largely";
    if (ot === "negative_observation") kind = "negative";
    else if (ot === "positive_observation") kind = "positive";
    else kind = "largely";

    out.push({
      qno,
      kind,
      designation: normDesignation(row.designation) || (kind === "positive" ? "Human" : ""),
      positive_rank: String(row.positive_rank || "").trim() || "",
      nature_of_concern: String(row.nature_of_concern || "").trim() || "",
      classification_coding: String(row.classification_coding || "").trim() || "",
      observation_text: String(row.observation_text || "").trim() || "",
      remarks: String(row.remarks || "").trim() || "",
      pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
    });
  }

  out.sort((a, b) => String(a.qno).localeCompare(String(b.qno)));
  state.extractedItems = out;

  updateTopCounters();
}

function applyObsFilters(items) {
  const term = String(el("obsSearch").value || "").trim().toLowerCase();
  const type = String(el("obsTypeFilter").value || "").trim();
  const designationFilter = String(el("obsDesignationFilter").value || "").trim();
  const onlyMissing = !!el("onlyMissingPgno").checked;

  return (items || []).filter(it => {
    if (type && it.kind !== type) return false;
    if (designationFilter && normDesignation(it.designation) !== designationFilter) return false;

    if (onlyMissing) {
      // Missing PGNO applies to negative AND largely
      if (!(pgnoRequiredForKind(it.kind) && missingPgnoForQno(it.qno))) return false;
    }

    if (term) {
      const hay = [
        it.qno,
        it.kind,
        it.designation || "",
        it.positive_rank || "",
        it.nature_of_concern || "",
        it.classification_coding || "",
        it.observation_text || "",
        it.remarks || "",
      ].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

function selectedPgnoText(pgno_selected) {
  const arr = Array.isArray(pgno_selected) ? pgno_selected : [];
  if (!arr.length) return "";
  return arr
    .map(x => String(x?.text || "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" • ");
}

function renderObsTable() {
  const body = el("obsTableBody");

  if (!state.activeReport) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No report loaded.</td></tr>`;
    el("obsSummary").textContent = "No report loaded.";
    updateTopCounters();
    return;
  }

  const items = applyObsFilters(state.extractedItems);

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No items match the current filters.</td></tr>`;
    renderObsSummary();
    updateTopCounters();
    return;
  }

  body.innerHTML = items.map(it => {
    const needsPgno = pgnoRequiredForKind(it.kind);

    const pgTxt = !needsPgno
      ? `<span class="muted">n/a</span>`
      : (selectedPgnoText(it.pgno_selected)
          ? selectedPgnoText(it.pgno_selected)
          : `<span class="muted">—</span>`);

    const catDisplay = it.kind === "positive"
      ? (it.positive_rank ? `Human (${it.positive_rank})` : "Human")
      : (it.designation || "—");

    const obsText = (it.observation_text || it.remarks || "").trim();

    return `
      <tr class="obs-row" data-qno="${esc(it.qno)}">
        <td title="${esc(it.qno)}">${esc(it.qno)}</td>
        <td>${obsRowTypeLabel(it.kind)}</td>
        <td title="${esc(catDisplay)}">${esc(catDisplay)}</td>
        <td title="${esc(it.nature_of_concern || "")}">${esc(it.nature_of_concern || "")}</td>
        <td title="${esc(it.classification_coding || "")}">${esc(it.classification_coding || "")}</td>
        <td title="${esc(obsText)}"><div class="clamp-3">${esc(obsText)}</div></td>
        <td title="${esc(needsPgno ? selectedPgnoText(it.pgno_selected) : "")}">${pgTxt}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("tr.obs-row").forEach(tr => {
    tr.addEventListener("click", () => {
      const qno = tr.getAttribute("data-qno");
      const item = state.extractedItems.find(x => x.qno === qno);
      if (item) openObsDialog(item);
    });
  });

  renderObsSummary();
  updateTopCounters();
}

function renderObsSummary() {
  const items = state.extractedItems || [];
  const total = items.length;
  const neg = items.filter(x => x.kind === "negative").length;
  const pos = items.filter(x => x.kind === "positive").length;
  const lae = items.filter(x => x.kind === "largely").length;
  const miss = items.filter(x => pgnoRequiredForKind(x.kind) && missingPgnoForQno(x.qno)).length;

  el("obsSummary").textContent =
    `Total Items Extracted: ${total} | Negative: ${neg} | Positive: ${pos} | Largely: ${lae} | Missing PGNO: ${miss}`;

  updateTopCounters();
}

/* ---------- Observation editor ---------- */

function openObsDialog(item) {
  state.dialogItem = item;

  const qExact = state.libCanonToExact.get(canonicalQno(item.qno)) || item.qno;
  const q = state.libByNo.get(qExact);

  const shortText = q ? getShort(q) : "";
  const qText = q ? getQText(q) : "";
  const chap = q ? getChap(q) : "";
  const sect = q ? getSection(q) : "";

  el("dlgTitle").textContent = `${item.qno} — ${shortText || "Question"}`;
  el("dlgSub").textContent = `Chapter ${chap || "—"} | ${sect || "—"} | ${item.kind.toUpperCase()}`;

  const pgnoApplies = pgnoRequiredForKind(item.kind); // NEGATIVE + LARGELY
  const pgnoBullets = q ? getPgnoBullets(q) : [];
  const selected = new Set((item.pgno_selected || []).map(x => Number(x.idx)).filter(Number.isFinite));

  const pgnoHtml = !pgnoApplies
    ? `<div class="hint">PGNOs are <b>not applicable</b> for Positive items.</div>`
    : (
      pgnoBullets.length
        ? `
          <div style="font-weight:900; color:#143a63; margin-top:8px;">PGNO tick selection (${item.kind === "largely" ? "Largely as expected" : "Negative"})</div>
          <div id="dlgPgnoList">
            ${pgnoBullets.map((txt, i) => {
              const idx = i + 1;
              const chk = selected.has(idx) ? "checked" : "";
              return `
                <div style="display:grid; grid-template-columns:22px 1fr; gap:10px; align-items:start; padding:10px 0; border-bottom:1px dashed #d5deef;">
                  <input type="checkbox" class="dlgPgChk" data-idx="${idx}" ${chk}/>
                  <div style="font-weight:600; color:#0c1b2a; line-height:1.25;">${esc(String(txt || "").trim())}</div>
                </div>
              `;
            }).join("")}
          </div>
        `
        : `<div class="hint">No PGNO bullets found in your locked library JSON for this question.</div>`
    );

  el("dlgBody").innerHTML = `
    <div style="font-weight:900; color:#143a63; margin-bottom:10px;">Question</div>
    <div style="font-weight:600; color:#0c1b2a; line-height:1.35; margin-bottom:12px;">
      ${esc(qText)}
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
      <div>
        <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Category (editable)</div>
        <select id="dlgDesignation" style="width:100%; padding:10px 12px; border:1px solid #cfe0f4; border-radius:12px; font-weight:600;">
          <option value="">—</option>
          <option value="Human">Human</option>
          <option value="Process">Process</option>
          <option value="Hardware">Hardware</option>
          <option value="Photo">Photo</option>
        </select>
      </div>

      <div>
        <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Nature of concern (editable)</div>
        <input id="dlgNature" type="text" value="${esc(item.nature_of_concern || "")}"
               style="width:100%; padding:10px 12px; border:1px solid #cfe0f4; border-radius:12px; font-weight:600;" />
      </div>
    </div>

    <div style="margin-top:10px;">
      <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Classification coding (editable)</div>
      <input id="dlgCoding" type="text" value="${esc(item.classification_coding || "")}"
             style="width:100%; padding:10px 12px; border:1px solid #cfe0f4; border-radius:12px; font-weight:600;" />
    </div>

    <div style="margin-top:10px;">
      <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Observation text (editable)</div>
      <textarea id="dlgObsText" placeholder="Edit / paste final wording here...">${esc((item.observation_text || item.remarks || "").trim())}</textarea>
    </div>

    ${pgnoHtml}

    ${pgnoApplies ? `<div id="dlgMissingHint" class="hint" style="display:none;">Missing PGNO tick (Finalize will flag this).</div>` : ``}
  `;

  const sel = el("dlgDesignation");
  sel.value = normDesignation(item.designation) || (item.kind === "positive" ? "Human" : "");

  if (pgnoApplies) {
    const hint = el("dlgMissingHint");
    const arr = Array.isArray(item.pgno_selected) ? item.pgno_selected : [];
    hint.style.display = arr.length ? "none" : "block";
  }

  el("obsDialog").showModal();
}

function closeObsDialog() {
  state.dialogItem = null;
  try { el("obsDialog").close(); } catch {}
}

async function saveObsDialog() {
  const item = state.dialogItem;
  if (!item) return;
  if (!state.activeReport) {
    alert("No active report.");
    return;
  }

  const qno = item.qno;
  const pgnoApplies = pgnoRequiredForKind(item.kind);

  const designation = normDesignation(String(el("dlgDesignation").value || "").trim());
  const nature_of_concern = String(el("dlgNature").value || "").trim();
  const classification_coding = String(el("dlgCoding").value || "").trim();
  const observation_text = String(el("dlgObsText").value || "").trim();

  let pgno_selected = [];
  if (pgnoApplies) {
    const pgList = el("dlgBody").querySelectorAll(".dlgPgChk");
    const qExact = state.libCanonToExact.get(canonicalQno(qno)) || qno;
    const q = state.libByNo.get(qExact);
    const bullets = q ? getPgnoBullets(q) : [];

    pgList.forEach(chk => {
      if (chk.checked) {
        const idx = Number(chk.getAttribute("data-idx"));
        if (!Number.isFinite(idx)) return;
        const txt = bullets[idx - 1] || "";
        pgno_selected.push({ idx, text: String(txt || "").trim() });
      }
    });
  }

  const observation_type =
    item.kind === "negative" ? "negative_observation" :
    item.kind === "positive" ? "positive_observation" :
    "note_improvement";

  const obs_type =
    item.kind === "negative" ? "negative" :
    item.kind === "positive" ? "positive" :
    "largely";

  const row = {
    report_id: state.activeReport.id,
    question_no: qno,
    has_observation: true,
    observation_type,
    obs_type,

    designation: designation || (item.kind === "positive" ? "Human" : null),
    nature_of_concern: nature_of_concern || null,
    classification_coding: classification_coding || null,

    observation_text: observation_text || null,
    remarks: observation_text || null,

    pgno_selected,
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);

    state.observationsByQno[qno] = { ...(state.observationsByQno[qno] || {}), ...row };

    buildExtractedItemsFromDb();
    renderObsTable();
    setSaveStatus("Saved");
    closeObsDialog();
  } catch (e) {
    console.error(e);
    alert("Save failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- Manual item ---------- */

async function addManualItem() {
  if (!state.activeReport) {
    alert("Load an inspection first (Stored Inspections) or save a new header.");
    return;
  }

  const qno = prompt("Enter Question No (e.g. 4.2.7):");
  if (!qno) return;

  const qCanon = canonicalQno(qno);
  if (!qCanon) { alert("Invalid question number."); return; }

  const exists = state.observationsByQno[qCanon];
  if (exists) { alert("This question already exists in this report."); return; }

  const kind = prompt("Type: negative / positive / largely", "negative");
  const t = String(kind || "").trim().toLowerCase();
  const k = (t === "positive" || t === "negative" || t === "largely") ? t : "negative";

  const observation_type =
    k === "negative" ? "negative_observation" :
    k === "positive" ? "positive_observation" :
    "note_improvement";

  const obs_type =
    k === "negative" ? "negative" :
    k === "positive" ? "positive" :
    "largely";

  const designation = k === "positive" ? "Human" : (prompt("Category (Human/Process/Hardware/Photo):", "Human") || "");
  const nature = prompt("Nature of concern:", k === "negative" ? "Not as expected." : (k === "positive" ? "Exceeded normal expectation." : "Largely as expected.")) || "";
  const text = prompt("Observation text:", "") || "";

  const row = {
    report_id: state.activeReport.id,
    question_no: qCanon,
    has_observation: true,
    observation_type,
    obs_type,
    designation: normDesignation(designation) || null,
    nature_of_concern: String(nature).trim() || null,
    classification_coding: null,
    observation_text: String(text).trim() || null,
    remarks: String(text).trim() || null,
    pgno_selected: [],
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);
    state.observationsByQno[qCanon] = row;
    buildExtractedItemsFromDb();
    renderObsTable();
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Manual add failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- Import PDF (AI) ---------- */

function findLibraryQno(qbase) {
  const raw = String(qbase || "").trim();
  if (!raw) return null;

  const canon = canonicalQno(raw);
  if (state.libCanonToExact.has(canon)) return state.libCanonToExact.get(canon);

  if (state.libByNo.has(raw)) return raw;

  const padded = normalizeQnoParts(raw, true);
  if (state.libByNo.has(padded)) return padded;

  const nonPadded = normalizeQnoParts(raw, false);
  if (state.libByNo.has(nonPadded)) return nonPadded;

  return null;
}

async function importReportPdfAiFromFile(file) {
  if (!file) return;

  const bucket = PDF_BUCKET_DEFAULT;
  const safeName = String(file.name || "report.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const tempPath = `${PDF_FOLDER_PREFIX}/tmp/${Date.now()}_${safeName}`;

  setSaveStatus("Uploading PDF…");
  const { error: upErr } = await state.supabase
    .storage
    .from(bucket)
    .upload(tempPath, file, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw upErr;

  setSaveStatus("Extracting via AI…");
  const { data, error } = await state.supabase.functions.invoke("import-post-inspection-pdf", {
    body: { report_id: "temp", pdf_storage_path: tempPath },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "AI import failed");

  const extracted = data.extracted;
  const h = extracted?.header || {};
  const obs = Array.isArray(extracted?.observations) ? extracted.observations : [];

  const examined_questions = Array.isArray(extracted?.examined_questions) ? extracted.examined_questions : [];
  const examined_count = Number(extracted?.examined_count || examined_questions.length) || examined_questions.length;

  const extractedVesselName = String(h.vessel_name || "").trim();
  const vesselHit = extractedVesselName
    ? (state.vessels || []).find(v => String(v.name || "").trim().toLowerCase() === extractedVesselName.toLowerCase())
    : null;
  if (!vesselHit?.id) {
    throw new Error(`AI import: vessel not found in vessels table: "${extractedVesselName}". Add it first.`);
  }

  const isoDate = ddmmyyyyToIso(h.inspection_date);
  if (!isoDate) throw new Error(`AI import: inspection_date not parsed (got "${String(h.inspection_date || "")}").`);

  const report_ref = String(h.report_reference || "").trim();
  if (!report_ref) throw new Error("AI import: report_reference missing (required).");

  const { data: existingRep, error: findErr } = await state.supabase
    .from("post_inspection_reports")
    .select("id")
    .eq("report_ref", report_ref)
    .maybeSingle();
  if (findErr) throw findErr;

  const headerPayload = {
    vessel_id: vesselHit.id,
    inspection_date: isoDate,
    port_name: String(h.port_name || "").trim() || null,
    port_code: String(h.port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || "").trim() || null,
    report_ref,
    title: String(el("reportTitle").value || "").trim() || state.titles[0] || null,
    inspector_name: String(el("inspectorName").value || "").trim() || null,
    inspector_company: String(el("inspectorCompany").value || "").trim() || null,
    pdf_storage_path: tempPath,
  };

  let report;
  if (existingRep?.id) {
    const ok = confirm(`Report ref already exists:\n\n${report_ref}\n\nImport into existing report and overwrite matching items?`);
    if (!ok) { setSaveStatus("Cancelled"); return; }
    report = await updateReportHeader(existingRep.id, headerPayload);
  } else {
    report = await createReportHeader(headerPayload);
  }

  state.reports = await loadReportsFromDb();
  renderStoredTable();

  await setActiveReportById(report.id);

  loadReportIntoHeader({ ...report, vessel_name: extractedVesselName });

  state.examinedQuestions = examined_questions.map(canonicalQno).filter(Boolean);
  state.examinedCount = examined_count;

  await persistExaminedQuestions(report.id, state.examinedQuestions);
  updateTopCounters();

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  setSaveStatus(`Saving ${obs.length} item(s)…`);

  for (const item of obs) {
    try {
      const qbase = String(item?.question_base || "").trim();
      const qno = findLibraryQno(qbase) || canonicalQno(qbase);
      if (!qno) { skipped++; continue; }

      const kind = String(item?.obs_type || "").toLowerCase();
      const k = (kind === "negative" || kind === "positive" || kind === "largely") ? kind : "largely";

      const observation_type =
        k === "negative" ? "negative_observation" :
        k === "positive" ? "positive_observation" :
        "note_improvement";

      const obs_type =
        k === "negative" ? "negative" :
        k === "positive" ? "positive" :
        "largely";

      const row = {
        report_id: report.id,
        question_no: canonicalQno(qno),
        has_observation: true,
        observation_type,
        obs_type,

        designation: normDesignation(item?.designation) || (k === "positive" ? "Human" : null),
        positive_rank: String(item?.positive_rank || "").trim() || null,
        nature_of_concern: String(item?.nature_of_concern || "").trim() || null,
        classification_coding: String(item?.classification_coding || "").trim() || null,

        observation_text: String(item?.observation_text || "").trim() || null,
        remarks: String(item?.observation_text || "").trim() || null,

        pgno_selected: [],
        updated_at: nowIso(),
      };

      await upsertObservationRow(row);
      saved++;
    } catch (e) {
      console.error("save item failed", e);
      errors++;
    }
  }

  state.observationsByQno = await loadObservationsForReport(report.id);
  buildExtractedItemsFromDb();
  renderObsTable();
  renderObsSummary();
  updateTopCounters();

  setSaveStatus(`AI import done (saved ${saved}, skipped ${skipped}, errors ${errors})`);
}

/* ---------- PDF download ---------- */

async function downloadActivePdf() {
  if (!state.activeReport) { alert("No active report."); return; }
  const path = state.activeReport.pdf_storage_path;
  if (!path) { alert("This report has no linked PDF."); return; }

  try {
    setSaveStatus("Preparing PDF…");
    const { data, error } = await state.supabase
      .storage
      .from(PDF_BUCKET_DEFAULT)
      .createSignedUrl(path, 60);

    if (error) throw error;
    if (!data?.signedUrl) throw new Error("No signed URL returned.");

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setSaveStatus("Loaded");
  } catch (e) {
    console.error(e);
    alert("PDF download failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- Export / Import JSON ---------- */

function buildExportPayload() {
  const report = state.activeReport;
  if (!report) return null;

  return {
    export_version: "post_inspection_export_v1",
    exported_at: nowIso(),
    report_header: {
      ...report,
      vessel_name: report.vessel_name || "",
    },
    examined: {
      examined_count: state.examinedCount || 0,
      examined_questions: state.examinedQuestions || [],
    },
    observations: state.observationsByQno || {},
  };
}

function exportJson() {
  if (!state.activeReport) { alert("No active report."); return; }
  const payload = buildExportPayload();
  if (!payload) return;

  const name = `post_inspection_${String(state.activeReport.report_ref || "report").replace(/[^a-zA-Z0-9._-]+/g,"_")}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importJsonFile(file) {
  if (!file) return;
  if (!state.activeReport) { alert("Load a report first (Stored Inspections)."); return; }

  try {
    setSaveStatus("Importing JSON…");
    const txt = await file.text();
    const payload = JSON.parse(txt);

    const obs = payload?.observations;
    const examined = payload?.examined;

    if (obs && typeof obs === "object") {
      const keys = Object.keys(obs);
      for (const qno of keys) {
        const row = obs[qno];
        if (!row) continue;
        if (String(row.report_id || "") !== String(state.activeReport.id)) {
          row.report_id = state.activeReport.id;
        }
        row.question_no = canonicalQno(row.question_no || qno);
        row.updated_at = nowIso();
        await upsertObservationRow(row);
      }
    }

    if (examined && Array.isArray(examined.examined_questions)) {
      state.examinedQuestions = examined.examined_questions.map(canonicalQno).filter(Boolean);
      state.examinedCount = Number(examined.examined_count || state.examinedQuestions.length) || state.examinedQuestions.length;
      await persistExaminedQuestions(state.activeReport.id, state.examinedQuestions);
    }

    state.observationsByQno = await loadObservationsForReport(state.activeReport.id);
    buildExtractedItemsFromDb();
    renderObsTable();
    renderObsSummary();
    updateTopCounters();

    setSaveStatus("Imported");
  } catch (e) {
    console.error(e);
    alert("Import failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- KPIs ---------- */

function renderKpis() {
  const items = state.extractedItems || [];
  const total = items.length;
  const neg = items.filter(x => x.kind === "negative").length;
  const pos = items.filter(x => x.kind === "positive").length;
  const lae = items.filter(x => x.kind === "largely").length;
  const miss = items.filter(x => pgnoRequiredForKind(x.kind) && missingPgnoForQno(x.qno)).length;

  el("kpiQuestionsExamined").value = String(state.examinedCount || 0);
  el("kpiTotal").value = String(total);
  el("kpiNeg").value = String(neg);
  el("kpiPos").value = String(pos);
  el("kpiLae").value = String(lae);
  el("kpiMissingPgno").value = String(miss);

  el("statsDialog").showModal();
}

function finalizeCheck() {
  if (!state.activeReport) { alert("No active report."); return; }
  const missing = (state.extractedItems || []).filter(x => pgnoRequiredForKind(x.kind) && missingPgnoForQno(x.qno));
  if (!missing.length) {
    alert("Finalize check: OK.\n\nNo Negative/Largely items are missing PGNO ticks.");
    return;
  }
  renderKpis();
}

/* ---------- Header actions ---------- */

function handleNewReport() {
  state.activeReport = null;
  state.observationsByQno = {};
  state.extractedItems = [];
  state.examinedQuestions = [];
  state.examinedCount = 0;

  setActivePill("No active report");
  setSaveStatus("Not saved");

  el("vesselSelect").value = "";
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;

  el("portName").value = "";
  el("portCode").value = "";
  el("ocimfCompany").value = "";
  el("reportRef").value = "";
  el("inspectorName").value = "";
  el("inspectorCompany").value = "";
  el("pdfStatus").textContent = "No PDF linked";

  buildExtractedItemsFromDb();
  renderObsTable();
  renderObsSummary();
  updateTopCounters();
}

async function handleSaveHeader() {
  const payload = headerInputs();

  if (!payload.vessel_id) { alert("Please select a vessel first."); return; }
  if (!payload.inspection_date) { alert("Please set an inspection date."); return; }
  if (!payload.report_ref) { alert("Please enter report reference (unique)."); return; }
  if (!payload.title) { alert("Please select a Title."); return; }

  setSaveStatus("Saving…");
  try {
    let saved;
    if (!state.activeReport) {
      saved = await createReportHeader(payload);
    } else {
      saved = await updateReportHeader(state.activeReport.id, payload);
    }

    state.reports = await loadReportsFromDb();
    renderStoredTable();

    await setActiveReportById(saved.id);
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Save header failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

async function handleDeleteReport() {
  if (!state.activeReport) return;
  const ok = confirm(`Delete this report?\n\n${reportLabel(state.activeReport)}\n\nAll items will be deleted (cascade).`);
  if (!ok) return;

  setSaveStatus("Deleting…");
  try {
    await deleteReport(state.activeReport.id);

    state.activeReport = null;
    state.observationsByQno = {};
    state.extractedItems = [];
    state.examinedQuestions = [];
    state.examinedCount = 0;

    setActivePill("No active report");

    state.reports = await loadReportsFromDb();
    renderStoredTable();

    renderObsTable();
    renderObsSummary();
    updateTopCounters();

    setSaveStatus("Deleted");
  } catch (e) {
    console.error(e);
    alert("Delete failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- Auth init ---------- */

async function waitForAuth(timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.AUTH && typeof window.AUTH.requireAuth === "function") return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

async function init() {
  try { el("buildPill").textContent = `build: ${POST_INSPECTION_BUILD}`; } catch {}

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded. Ensure ./auth.js is included BEFORE ./post_inspection.js.");

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("dashboardBtn")?.addEventListener("click", () => { window.location.href = "dashboard.html"; });
  el("modeSelectBtn")?.addEventListener("click", () => { window.location.href = "mode_selection.html"; });

  state.titles = loadTitles();
  renderTitleSelect();

  el("manageTitlesBtn").addEventListener("click", openTitlesModal);
  el("addTitleBtn").addEventListener("click", () => {
    const v = String(el("newTitleInput").value || "").trim();
    if (!v) return;
    if (!state.titles.includes(v)) state.titles.push(v);
    state.titles = [...new Set(state.titles)];
    saveTitles();
    el("newTitleInput").value = "";
    renderTitleSelect();
    renderTitlesList();
  });
  el("closeTitlesBtn").addEventListener("click", () => el("titlesDialog").close());

  setSaveStatus("Loading…");

  state.vessels = await loadVessels();
  renderVesselsSelect();

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  state.libByNo = new Map();
  state.libCanonToExact = new Map();
  for (const q of state.lib) {
    const qno = getQno(q);
    if (!qno) continue;
    state.libByNo.set(qno, q);
    const canon = canonicalQno(qno);
    if (canon && !state.libCanonToExact.has(canon)) state.libCanonToExact.set(canon, qno);
  }

  state.reports = await loadReportsFromDb();
  renderStoredTable();

  document.querySelectorAll(".filter-btn[data-filter-col]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const col = btn.getAttribute("data-filter-col");
      if (!col) return;
      openStoredFilterForCol(col);
    });
  });

  el("storedFilterSearch").addEventListener("input", () => {
    const col = state.openFilterCol;
    if (!col) return;
    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    renderStoredFilterList(values, set, el("storedFilterSearch").value);
    state.storedFilters[col] = set;
  });

  el("storedFilterClearBtn").addEventListener("click", () => {
    const col = state.openFilterCol;
    if (!col) return;
    state.storedFilters[col] = new Set();
    const values = uniqueValuesForCol(col);
    renderStoredFilterList(values, state.storedFilters[col], el("storedFilterSearch").value);
  });

  el("storedFilterApplyBtn").addEventListener("click", () => {
    closeStoredFilterDialog();
    renderStoredTable();
  });

  el("clearStoredFiltersBtn").addEventListener("click", () => {
    state.storedFilters = {};
    renderStoredTable();
  });

  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  el("downloadPdfBtn").addEventListener("click", downloadActivePdf);

  el("importPdfBtn").addEventListener("click", () => el("importPdfFile").click());
  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try { if (f) await importReportPdfAiFromFile(f); }
    finally { e.target.value = ""; }
  });

  el("exportBtn").addEventListener("click", exportJson);
  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try { if (f) await importJsonFile(f); }
    finally { e.target.value = ""; }
  });

  el("statsBtn").addEventListener("click", renderKpis);
  el("finalizeBtn").addEventListener("click", finalizeCheck);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());

  el("addManualBtn").addEventListener("click", addManualItem);

  el("obsSearch").addEventListener("input", renderObsTable);
  el("obsTypeFilter").addEventListener("change", renderObsTable);
  el("obsDesignationFilter").addEventListener("change", renderObsTable);
  el("onlyMissingPgno").addEventListener("change", renderObsTable);

  el("dlgCancelBtn").addEventListener("click", closeObsDialog);
  el("dlgSaveBtn").addEventListener("click", saveObsDialog);

  if (!el("inspectionDate").value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  renderObsTable();
  renderObsSummary();
  updateTopCounters();
  setSaveStatus("Loaded");
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Post-Inspection module failed to load: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
})();