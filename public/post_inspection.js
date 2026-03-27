import { loadLockedLibraryJson } from "./question_library_loader.js";

/**
 * HARD BUILD STAMP
 */
const POST_INSPECTION_BUILD =
  "post_inspection_ui_v32_multi_observation_items_2026-03-03";

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

function el(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function yieldUI() {
  await sleep(0);
}

function ddmmyyyyToIso(ddmmyyyy) {
  const s = String(ddmmyyyy || "").trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  const dd = m[1], mm = m[2], yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateParts(anyDate) {
  const s = String(anyDate || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { year: m[1], month: m[2], day: m[3], iso: s };

  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return { year: m[3], month: m[2], day: m[1], iso: `${m[3]}-${m[2]}-${m[1]}` };

  return { year: "", month: "", day: "", iso: "" };
}

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  const canon = parts.map((p) => {
    const n = String(p).replace(/^0+/, "") || "0";
    return String(Number(n));
  });
  return canon.join(".");
}

function normalizeQnoParts(qno, pad2) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (parts.length < 2) return String(qno || "").trim();
  const norm = parts.map((p) => {
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

function obsRowTypeLabel(kind) {
  if (kind === "negative") return `<span class="obs-badge neg">Negative</span>`;
  if (kind === "positive") return `<span class="obs-badge pos">Positive</span>`;
  return `<span class="obs-badge lae">Largely</span>`;
}

async function safeNavigate(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const url of list) {
    try {
      const r = await fetch(url, { method: "GET", cache: "no-store" });
      if (r && r.ok) {
        window.location.href = url;
        return;
      }
    } catch {}
  }
  alert(
    "Navigation failed.\n\nNone of these pages were found:\n" +
      list.map((x) => `- ${x}`).join("\n"),
  );
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

  // NEW canonical in-app model
  observationItems: [],
  extractedItems: [],
  dialogItemId: null,

  storedFilters: {},
  storedDateYears: new Set(),
  storedDateMonths: new Set(),
  openFilterCol: null,

  titles: [],
};

/* ---------- UI helpers ---------- */

function setSaveStatus(text) {
  el("saveStatus").textContent = text || "Not saved";
}

function setActivePill(text) {
  el("activeReportPill").textContent = text || "No active report";
}

/* ---------- Titles ---------- */

function loadTitles() {
  try {
    const raw = localStorage.getItem(TITLES_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr.map((x) => String(x)).filter(Boolean);
    }
  } catch {}
  return [...DEFAULT_TITLES];
}

function saveTitles() {
  try {
    localStorage.setItem(TITLES_STORAGE_KEY, JSON.stringify(state.titles));
  } catch {}
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
  box.querySelectorAll("button[data-title]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.getAttribute("data-title");
      state.titles = state.titles.filter((x) => x !== t);
      if (!state.titles.length) state.titles = [...DEFAULT_TITLES];
      saveTitles();
      renderTitleSelect();
      renderTitlesList();
    });
  });
}

/* ---------- DB helpers ---------- */

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
  const selectA =
    "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at";
  const selectB =
    "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at";

  let rows = [];
  try {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .select(selectA)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    rows = data || [];
  } catch {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .select(selectB)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    rows = data || [];
  }

  const vesselIds = [...new Set(rows.map((r) => r.vessel_id).filter(Boolean))];
  if (!vesselIds.length) return rows.map((r) => ({ ...r, vessel_name: "" }));

  const { data: vessels } = await state.supabase.from("vessels").select("id, name").in("id", vesselIds);

  const map = new Map((vessels || []).map((v) => [v.id, v.name]));
  return rows.map((r) => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
}

async function createReportHeader(payload) {
  try {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .insert([payload])
      .select(
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return data;
  } catch {
    const safe = { ...payload };
    delete safe.examined_questions;
    delete safe.examined_count;

    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .insert([safe])
      .select(
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return data;
  }
}

async function updateReportHeader(reportId, payload) {
  try {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .update(payload)
      .eq("id", reportId)
      .select(
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return data;
  } catch {
    const safe = { ...payload };
    delete safe.examined_questions;
    delete safe.examined_count;

    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .update(safe)
      .eq("id", reportId)
      .select(
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    return data;
  }
}

async function deleteReport(reportId) {
  const { error } = await state.supabase.from("post_inspection_reports").delete().eq("id", reportId);
  if (error) throw error;
}

/* ---------- NEW multi-item table helpers ---------- */

async function loadObservationItemsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .select("*")
    .eq("report_id", reportId)
    .order("question_no", { ascending: true })
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeObservationItemFromDb);
}

async function loadLegacyObservationsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .select(
      "report_id, question_no, has_observation, observation_type, pgno_selected, remarks, updated_at, obs_type, observation_text, question_base, designation, nature_of_concern, classification_coding, positive_rank",
    )
    .eq("report_id", reportId);

  if (error) throw error;

  return (data || []).map((row, idx) =>
    normalizeObservationItemFromDb({
      id: `legacy-${reportId}-${row.question_no}-${idx}`,
      report_id: row.report_id,
      question_no: row.question_no,
      question_base: row.question_base || row.question_no,
      question_full: null,
      has_observation: !!row.has_observation,
      observation_type: row.observation_type,
      obs_type: row.obs_type ||
        (row.observation_type === "negative_observation"
          ? "negative"
          : row.observation_type === "positive_observation"
            ? "positive"
            : "largely"),
      designation: row.designation,
      positive_rank: row.positive_rank,
      nature_of_concern: row.nature_of_concern,
      classification_coding: row.classification_coding,
      observation_text: row.observation_text,
      remarks: row.remarks,
      pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
      page_hint: null,
      source_excerpt: null,
      confidence: null,
      sort_index: idx,
      created_at: row.updated_at || nowIso(),
      updated_at: row.updated_at || nowIso(),
      __legacy: true,
    }),
  );
}

function normalizeObservationItemFromDb(row) {
  return {
    id: row.id,
    report_id: row.report_id,
    question_no: canonicalQno(row.question_no || row.question_base || ""),
    question_base: canonicalQno(row.question_base || row.question_no || ""),
    question_full: String(row.question_full || "").trim() || null,
    has_observation: row.has_observation !== false,
    observation_type: String(row.observation_type || "").trim(),
    obs_type: String(row.obs_type || "").trim(),
    designation: normDesignation(row.designation),
    positive_rank: String(row.positive_rank || "").trim() || null,
    nature_of_concern: String(row.nature_of_concern || "").trim() || null,
    classification_coding: String(row.classification_coding || "").trim() || null,
    observation_text: String(row.observation_text || "").trim() || null,
    remarks: String(row.remarks || "").trim() || null,
    pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
    page_hint: Number.isFinite(Number(row.page_hint)) ? Number(row.page_hint) : null,
    source_excerpt: String(row.source_excerpt || "").trim() || null,
    confidence: row.confidence == null ? null : Number(row.confidence),
    sort_index: Number.isFinite(Number(row.sort_index)) ? Number(row.sort_index) : 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    __legacy: !!row.__legacy,
  };
}

async function deleteObservationItemsForReport(reportId) {
  const { error } = await state.supabase
    .from("post_inspection_observation_items")
    .delete()
    .eq("report_id", reportId);
  if (error) throw error;
}

async function insertObservationItem(row) {
  const payload = {
    report_id: row.report_id,
    question_no: row.question_no,
    question_base: row.question_base || row.question_no,
    question_full: row.question_full || null,
    has_observation: row.has_observation !== false,
    observation_type: row.observation_type,
    obs_type: row.obs_type,
    designation: row.designation || null,
    positive_rank: row.positive_rank || null,
    nature_of_concern: row.nature_of_concern || null,
    classification_coding: row.classification_coding || null,
    observation_text: row.observation_text || null,
    remarks: row.remarks || null,
    pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
    page_hint: row.page_hint ?? null,
    source_excerpt: row.source_excerpt || null,
    confidence: row.confidence ?? null,
    sort_index: row.sort_index ?? 0,
  };

  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .insert([payload])
    .select("*")
    .single();

  if (error) throw error;
  return normalizeObservationItemFromDb(data);
}

async function updateObservationItem(row) {
  if (!row.id || String(row.id).startsWith("legacy-")) {
    return await insertObservationItem(row);
  }

  const payload = {
    question_no: row.question_no,
    question_base: row.question_base || row.question_no,
    question_full: row.question_full || null,
    has_observation: row.has_observation !== false,
    observation_type: row.observation_type,
    obs_type: row.obs_type,
    designation: row.designation || null,
    positive_rank: row.positive_rank || null,
    nature_of_concern: row.nature_of_concern || null,
    classification_coding: row.classification_coding || null,
    observation_text: row.observation_text || null,
    remarks: row.remarks || null,
    pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
    page_hint: row.page_hint ?? null,
    source_excerpt: row.source_excerpt || null,
    confidence: row.confidence ?? null,
    sort_index: row.sort_index ?? 0,
  };

  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .update(payload)
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeObservationItemFromDb(data);
}

/* ---------- Stored inspections filters ---------- */

function uniqueValuesForCol(col) {
  const vals = (state.reports || [])
    .map((r) => r?.[col] ?? "")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const uniq = [...new Set(vals)];
  uniq.sort((a, b) => a.localeCompare(b));
  return uniq;
}

function uniqueYearsForDate() {
  const yrs = [];
  for (const r of state.reports || []) {
    const p = parseDateParts(r?.inspection_date);
    if (p.year) yrs.push(p.year);
  }
  return [...new Set(yrs)].sort((a, b) => a.localeCompare(b));
}

function uniqueMonthsForDate() {
  const mos = [];
  for (const r of state.reports || []) {
    const p = parseDateParts(r?.inspection_date);
    if (p.month) mos.push(p.month);
  }
  return [...new Set(mos)].sort((a, b) => a.localeCompare(b));
}

function reportPassesStoredFilters(r) {
  {
    const p = parseDateParts(r?.inspection_date);
    if (state.storedDateYears.size > 0) {
      if (!p.year || !state.storedDateYears.has(p.year)) return false;
    }
    if (state.storedDateMonths.size > 0) {
      if (!p.month || !state.storedDateMonths.has(p.month)) return false;
    }
  }

  for (const col of Object.keys(state.storedFilters)) {
    if (col === "inspection_date") continue;
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

  body.innerHTML = rows
    .map((r) => {
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
    })
    .join("");

  body.querySelectorAll("tr.stored-row").forEach((tr) => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      await setActiveReportById(id);
    });
  });
}

function closeStoredFilterDialog() {
  try {
    el("storedFilterDialog").close();
  } catch {}
  state.openFilterCol = null;
}

function renderStoredDateFilterUI() {
  const wrap = el("storedFilterList");
  const years = uniqueYearsForDate();
  const months = uniqueMonthsForDate();

  const monthName = (mm) => {
    const map = {
      "01": "Jan",
      "02": "Feb",
      "03": "Mar",
      "04": "Apr",
      "05": "May",
      "06": "Jun",
      "07": "Jul",
      "08": "Aug",
      "09": "Sep",
      "10": "Oct",
      "11": "Nov",
      "12": "Dec",
    };
    return map[mm] || mm;
  };

  const yearHtml = years.length
    ? years
        .map((y) => {
          const checked = state.storedDateYears.has(y) ? "checked" : "";
          return `
      <label class="chk-row">
        <input type="checkbox" class="storedDateYearChk" data-year="${esc(y)}" ${checked} />
        <span>${esc(y)}</span>
      </label>
    `;
        })
        .join("")
    : `<div class="muted" style="padding:8px;">No years.</div>`;

  const monthHtml = months.length
    ? months
        .map((m) => {
          const checked = state.storedDateMonths.has(m) ? "checked" : "";
          return `
      <label class="chk-row">
        <input type="checkbox" class="storedDateMonthChk" data-month="${esc(m)}" ${checked} />
        <span>${esc(m)} — ${esc(monthName(m))}</span>
      </label>
    `;
        })
        .join("")
    : `<div class="muted" style="padding:8px;">No months.</div>`;

  wrap.innerHTML = `
    <div class="date-filter-grid">
      <div class="date-filter-card">
        <h4>Year</h4>
        <div class="chk-list">${yearHtml}</div>
      </div>
      <div class="date-filter-card">
        <h4>Month</h4>
        <div class="chk-list">${monthHtml}</div>
      </div>
    </div>
  `;

  wrap.querySelectorAll(".storedDateYearChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const y = chk.getAttribute("data-year");
      if (!y) return;
      if (chk.checked) state.storedDateYears.add(y);
      else state.storedDateYears.delete(y);
    });
  });

  wrap.querySelectorAll(".storedDateMonthChk").forEach((chk) => {
    const m = chk.getAttribute("data-month");
    chk.addEventListener("change", () => {
      if (!m) return;
      if (chk.checked) state.storedDateMonths.add(m);
      else state.storedDateMonths.delete(m);
    });
  });
}

function renderStoredFilterList(values, selectedSet, searchTerm) {
  const box = el("storedFilterList");
  box.className = "chk-list";

  const term = String(searchTerm || "").trim().toLowerCase();
  const filtered = !term ? values : values.filter((v) => String(v).toLowerCase().includes(term));

  if (!filtered.length) {
    box.innerHTML = `<div class="muted" style="padding:8px;">No values.</div>`;
    return;
  }

  box.innerHTML = filtered
    .map((v) => {
      const checked = selectedSet.has(v) ? "checked" : "";
      return `
      <label class="chk-row">
        <input type="checkbox" class="storedFilterChk" data-val="${esc(v)}" ${checked} />
        <span>${esc(v)}</span>
      </label>
    `;
    })
    .join("");

  box.querySelectorAll(".storedFilterChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const v = chk.getAttribute("data-val");
      if (!v) return;
      if (chk.checked) selectedSet.add(v);
      else selectedSet.delete(v);
    });
  });
}

function openStoredFilterForCol(col) {
  if (state.openFilterCol === col && el("storedFilterDialog").open) {
    closeStoredFilterDialog();
    return;
  }

  state.openFilterCol = col;

  const titleMap = {
    vessel_name: "Vessel",
    inspection_date: "Date (Year + Month)",
    title: "Title",
    ocimf_inspecting_company: "OCIMF Inspecting Company",
    inspector_name: "Inspector Name",
    inspector_company: "Inspector’s Company",
  };

  el("storedFilterTitle").textContent = `${titleMap[col] || "Filters"}`;

  if (col === "inspection_date") {
    el("storedFilterSub").textContent = "Tick Year and/or Month. Leave both empty = no filtering.";
    el("storedFilterSearch").style.display = "none";
    renderStoredDateFilterUI();
  } else {
    el("storedFilterSub").textContent = "Select values to include. Leave empty = no filtering.";
    el("storedFilterSearch").style.display = "block";
    el("storedFilterSearch").value = "";

    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    renderStoredFilterList(values, set, "");
    state.storedFilters[col] = set;
  }

  el("storedFilterDialog").showModal();

  el("storedFilterDialog").addEventListener(
    "click",
    (e) => {
      const rect = el("storedFilterDialog").getBoundingClientRect();
      const inDialog =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inDialog) closeStoredFilterDialog();
    },
    { once: true },
  );
}

/* ---------- Active report / header ---------- */

function headerInputs() {
  return {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    inspection_date: String(el("inspectionDate").value || "").trim(),
    port_name: String(el("portName").value || "").trim() || null,
    port_code: String(el("portCode").value || "").trim() || null,
    ocimf_inspecting_company: String(el("ocimfCompany").value || "").trim() || null,
    report_ref: String(el("reportRef").value || "").trim(),
    title: String(el("reportTitle").value || "").trim(),
    inspector_name: String(el("inspectorName").value || "").trim() || null,
    inspector_company: String(el("inspectorCompany").value || "").trim() || null,
    pdf_storage_path: state.activeReport?.pdf_storage_path || null,
  };
}

function renderVesselsSelect() {
  const sel = el("vesselSelect");
  sel.innerHTML = "";
  for (const v of state.vessels || []) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function loadReportIntoHeader(r) {
  if (!r) return;

  el("vesselSelect").value = r.vessel_id || "";
  el("inspectionDate").value = r.inspection_date || "";
  el("portName").value = r.port_name || "";
  el("portCode").value = r.port_code || "";
  el("ocimfCompany").value = r.ocimf_inspecting_company || "";
  el("reportRef").value = r.report_ref || "";
  el("reportTitle").value = r.title || state.titles[0] || "";
  el("inspectorName").value = r.inspector_name || "";
  el("inspectorCompany").value = r.inspector_company || "";

  if (r.pdf_storage_path) {
    el("pdfStatus").textContent = `Stored: ${r.pdf_storage_path.split("/").pop()}`;
  } else {
    el("pdfStatus").textContent = "No PDF linked";
  }
}

function examinedCountFromActive() {
  const r = state.activeReport || {};
  const c = Number(r.examined_count || 0);
  if (Number.isFinite(c) && c > 0) return c;
  const arr = Array.isArray(r.examined_questions) ? r.examined_questions : null;
  if (arr && arr.length) return arr.length;
  return 0;
}

async function setActiveReportById(reportId) {
  const rep = (state.reports || []).find((r) => r.id === reportId);
  if (!rep) return;

  state.activeReport = rep;
  setActivePill("Loaded");
  setSaveStatus("Loading report…");
  await yieldUI();

  loadReportIntoHeader(rep);

  // NEW table first
  let items = [];
  try {
    items = await loadObservationItemsForReport(rep.id);
  } catch (e) {
    console.error("loadObservationItemsForReport failed", e);
  }

  // fallback to legacy only if new table empty
  if (!items.length) {
    try {
      items = await loadLegacyObservationsForReport(rep.id);
    } catch (e) {
      console.error("loadLegacyObservationsForReport failed", e);
    }
  }

  state.observationItems = items;
  rebuildExtractedItems();
  renderObsTable();
  renderObsSummary();

  setSaveStatus("Loaded");
}

async function handleNewReport() {
  state.activeReport = null;
  state.observationItems = [];
  state.extractedItems = [];
  state.dialogItemId = null;

  setActivePill("No active report");
  setSaveStatus("Not saved");

  if (state.vessels?.[0]?.id) el("vesselSelect").value = state.vessels[0].id;
  el("portName").value = "";
  el("portCode").value = "";
  el("ocimfCompany").value = "";
  el("reportRef").value = "";
  el("inspectorName").value = "";
  el("inspectorCompany").value = "";
  el("pdfStatus").textContent = "No PDF linked";

  rebuildExtractedItems();
  renderObsTable();
  renderObsSummary();
}

async function handleSaveHeader() {
  const inp = headerInputs();

  if (!inp.vessel_id) return alert("Select vessel.");
  if (!inp.inspection_date) return alert("Inspection date is required.");
  if (!inp.report_ref) return alert("Report Reference is required.");

  setSaveStatus("Saving…");
  await yieldUI();

  try {
    let rep;
    if (!state.activeReport?.id) rep = await createReportHeader(inp);
    else rep = await updateReportHeader(state.activeReport.id, inp);

    state.reports = await loadReportsFromDb();
    renderStoredTable();

    await setActiveReportById(rep.id);
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Save header failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

async function handleDeleteReport() {
  if (!state.activeReport?.id) return alert("No active report.");
  const ok = confirm("Delete this report and all its observations?");
  if (!ok) return;

  setSaveStatus("Deleting…");
  await yieldUI();

  try {
    await deleteReport(state.activeReport.id);

    state.activeReport = null;
    state.observationItems = [];
    state.extractedItems = [];
    state.dialogItemId = null;

    state.reports = await loadReportsFromDb();
    renderStoredTable();

    setActivePill("No active report");
    setSaveStatus("Deleted");

    rebuildExtractedItems();
    renderObsTable();
    renderObsSummary();
  } catch (e) {
    console.error(e);
    alert("Delete failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- Observation item model ---------- */

function itemNeedsPgno(item) {
  return item?.obs_type === "negative" || item?.obs_type === "largely";
}

function missingPgnoForItem(item) {
  if (!itemNeedsPgno(item)) return false;
  const arr = Array.isArray(item.pgno_selected) ? item.pgno_selected : [];
  return arr.length === 0;
}

function selectedPgnoText(pgno_selected) {
  const arr = Array.isArray(pgno_selected) ? pgno_selected : [];
  if (!arr.length) return "";
  return arr
    .map((x) => String(x?.text || "").trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" • ");
}

function rebuildExtractedItems() {
  const items = (state.observationItems || [])
    .filter((x) => x.has_observation !== false)
    .map((x) => ({
      ...x,
      qno: canonicalQno(x.question_no || x.question_base || ""),
      kind: x.obs_type,
    }));

  items.sort((a, b) => {
    const qCmp = String(a.qno).localeCompare(String(b.qno), undefined, { numeric: true });
    if (qCmp !== 0) return qCmp;
    const sCmp = Number(a.sort_index || 0) - Number(b.sort_index || 0);
    if (sCmp !== 0) return sCmp;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  state.extractedItems = items;
  updateCounters();
}

function updateCounters() {
  const items = state.extractedItems || [];
  const neg = items.filter((x) => x.kind === "negative").length;
  const pos = items.filter((x) => x.kind === "positive").length;
  const lae = items.filter((x) => x.kind === "largely").length;

  el("itemsExtractedVal").textContent = String(items.length);
  el("questionsExaminedVal").textContent = String(examinedCountFromActive());

  el("cntNeg").textContent = String(neg);
  el("cntPos").textContent = String(pos);
  el("cntLae").textContent = String(lae);
}

function applyObsFilters(items) {
  const term = String(el("obsSearch").value || "").trim().toLowerCase();
  const type = String(el("obsTypeFilter").value || "").trim();
  const designationFilter = String(el("obsDesignationFilter").value || "").trim();
  const onlyMissing = !!el("onlyMissingPgno").checked;

  return (items || []).filter((it) => {
    if (type && it.kind !== type) return false;
    if (designationFilter && normDesignation(it.designation) !== designationFilter) return false;
    if (onlyMissing && !missingPgnoForItem(it)) return false;

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
        it.question_full || "",
      ]
        .join(" ")
        .toLowerCase();

      if (!hay.includes(term)) return false;
    }

    return true;
  });
}

function renderObsSummary() {
  if (!state.activeReport) {
    el("obsSummary").textContent = "No report loaded.";
    return;
  }

  const items = applyObsFilters(state.extractedItems || []);
  const total = items.length;
  const neg = items.filter((x) => x.kind === "negative").length;
  const pos = items.filter((x) => x.kind === "positive").length;
  const lae = items.filter((x) => x.kind === "largely").length;

  el("obsSummary").textContent =
    `Total Items Extracted: ${total} | Negative: ${neg} | Positive: ${pos} | Largely: ${lae}`;
}

function renderObsTable() {
  const body = el("obsTableBody");

  if (!state.activeReport) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No report loaded.</td></tr>`;
    el("obsSummary").textContent = "No report loaded.";
    updateCounters();
    return;
  }

  const items = applyObsFilters(state.extractedItems || []);

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No items match the current filters.</td></tr>`;
    renderObsSummary();
    updateCounters();
    return;
  }

  body.innerHTML = items
    .map((it) => {
      const pgRequired = itemNeedsPgno(it);
      const pgText = selectedPgnoText(it.pgno_selected);

      const pgCell = pgRequired
        ? (pgText ? pgText : `<span class="muted">—</span>`)
        : `<span class="muted">n/a</span>`;

      const catDisplay =
        it.kind === "positive"
          ? (it.positive_rank ? `Human (${it.positive_rank})` : "Human")
          : (it.designation || "—");

      const obsText = (it.observation_text || it.remarks || "").trim();

      return `
      <tr class="obs-row" data-id="${esc(it.id)}">
        <td title="${esc(it.qno)}">${esc(it.qno)}</td>
        <td>${obsRowTypeLabel(it.kind)}</td>
        <td title="${esc(catDisplay)}">${esc(catDisplay)}</td>
        <td title="${esc(it.nature_of_concern || "")}">${esc(it.nature_of_concern || "")}</td>
        <td title="${esc(it.classification_coding || "")}">${esc(it.classification_coding || "")}</td>
        <td title="${esc(obsText)}">${esc(obsText)}</td>
        <td title="${esc(pgRequired ? pgText : "")}">${pgCell}</td>
      </tr>
    `;
    })
    .join("");

  body.querySelectorAll("tr.obs-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      openObsDialog(id);
    });
  });

  renderObsSummary();
  updateCounters();
}

function findQuestionFromLib(qnoCanon) {
  const exact = state.libCanonToExact.get(qnoCanon) || qnoCanon;
  return state.libByNo.get(exact) || null;
}

/* ---------- Observation editor ---------- */

function closeObsDialog() {
  try {
    el("obsDialog").close();
  } catch {}
  state.dialogItemId = null;
}

function pgnoCheckboxList(qObj, selectedArr) {
  const bullets = getPgnoBullets(qObj);
  const selected = Array.isArray(selectedArr) ? selectedArr : [];
  const selectedSet = new Set(selected.map((x) => String(x?.text || "").trim()).filter(Boolean));

  if (!bullets.length) {
    return `<div class="muted">No PGNO bullets found for this question in the library.</div>`;
  }

  return bullets
    .map((t, idx) => {
      const isOn = selectedSet.has(String(t).trim());
      const checked = isOn ? "checked" : "";
      return `
      <label class="chk-row">
        <input type="checkbox" class="pgnoChk" data-idx="${idx}" data-text="${esc(t)}" ${checked}/>
        <span>${esc(t)}</span>
      </label>
    `;
    })
    .join("");
}

function openObsDialog(itemId) {
  if (!state.activeReport?.id) return;

  const item = (state.extractedItems || []).find((x) => String(x.id) === String(itemId));
  if (!item) return alert("Item not found.");

  const qObj = findQuestionFromLib(item.qno);
  const qShort = qObj ? String(qObj["Short Text"] || qObj["short_text"] || "").trim() : "";

  const requiresPgno = itemNeedsPgno(item);

  el("dlgTitle").textContent = `Question ${item.qno}`;
  el("dlgSub").innerHTML = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <span>${obsRowTypeLabel(item.kind)}</span>
      <span class="muted">${esc(qShort || "")}</span>
      <span class="muted">${esc(item.designation || "")}</span>
      ${requiresPgno ? `<span class="muted">• PGNO required</span>` : `<span class="muted">• PGNO not required</span>`}
    </div>
  `;

  const pgnoHtml = requiresPgno
    ? `
    <div class="pi-field" style="margin-top:10px;">
      <label>PGNO tickbox selection (required for Negative + Largely)</label>
      <div class="chk-list" id="pgnoList">${pgnoCheckboxList(qObj, item.pgno_selected)}</div>
    </div>
  `
    : `<div class="muted" style="margin-top:10px;">PGNO not required for Positive items.</div>`;

  el("dlgBody").innerHTML = `
    <div class="pi-field">
      <label>Question</label>
      <textarea readonly style="min-height:90px; background:#f8fbff;">${esc(item.question_full || "")}</textarea>
    </div>

    <div class="pi-field" style="margin-top:10px;">
      <label>Observation text</label>
      <textarea id="dlgObsText" placeholder="Observation text...">${esc(String(item.observation_text || item.remarks || ""))}</textarea>
    </div>

    ${pgnoHtml}
  `;

  state.dialogItemId = item.id;
  el("obsDialog").showModal();
}

async function saveObsDialog() {
  if (!state.dialogItemId) return;
  if (!state.activeReport?.id) return;

  const item = (state.extractedItems || []).find((x) => String(x.id) === String(state.dialogItemId));
  if (!item) return;

  const text = String(el("dlgObsText")?.value || "").trim();

  let selected = Array.isArray(item.pgno_selected) ? item.pgno_selected : [];

  if (itemNeedsPgno(item)) {
    selected = [];
    document.querySelectorAll("#pgnoList .pgnoChk").forEach((chk) => {
      if (!chk.checked) return;
      const t = String(chk.getAttribute("data-text") || "").trim();
      if (!t) return;
      selected.push({ text: t });
    });
  }

  const updated = {
    ...item,
    observation_text: text || null,
    remarks: text || null,
    pgno_selected: selected,
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  await yieldUI();

  try {
    const saved = await updateObservationItem(updated);

    const idx = state.observationItems.findIndex((x) => String(x.id) === String(item.id));
    if (idx >= 0) state.observationItems[idx] = saved;
    else state.observationItems.push(saved);

    rebuildExtractedItems();
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
  if (!state.activeReport?.id) {
    alert("No active report.");
    return;
  }

  const qno = prompt("Question number (e.g. 4.2.7):", "") || "";
  const qCanon = canonicalQno(qno);
  if (!qCanon) return;

  const k = (prompt("Type (negative/positive/largely):", "negative") || "").trim().toLowerCase();
  const kind = (k === "negative" || k === "positive" || k === "largely") ? k : "negative";

  const observation_type =
    kind === "negative" ? "negative_observation" :
    kind === "positive" ? "positive_observation" :
    "note_improvement";

  const obs_type =
    kind === "negative" ? "negative" :
    kind === "positive" ? "positive" :
    "largely";

  const designation = kind === "positive"
    ? "Human"
    : (prompt("Category (Human/Process/Hardware/Photo):", "Human") || "");

  const nature = prompt(
    "Nature of concern:",
    kind === "negative"
      ? "Not as expected."
      : kind === "positive"
        ? "Exceeded normal expectation."
        : "Largely as expected.",
  ) || "";

  const text = prompt("Observation text:", "") || "";

  const row = {
    report_id: state.activeReport.id,
    question_no: qCanon,
    question_base: qCanon,
    question_full: null,
    has_observation: true,
    observation_type,
    obs_type,
    designation: normDesignation(designation) || null,
    positive_rank: null,
    nature_of_concern: String(nature).trim() || null,
    classification_coding: null,
    observation_text: String(text).trim() || null,
    remarks: String(text).trim() || null,
    pgno_selected: [],
    page_hint: null,
    source_excerpt: null,
    confidence: null,
    sort_index: (state.observationItems || []).filter((x) => x.question_no === qCanon).length,
  };

  setSaveStatus("Saving…");
  await yieldUI();

  try {
    const saved = await insertObservationItem(row);
    state.observationItems.push(saved);
    rebuildExtractedItems();
    renderObsTable();
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Manual add failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

/* ---------- AI Import ---------- */

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

async function invokeWithTimeout(functionName, payload, timeoutMs) {
  const p = state.supabase.functions.invoke(functionName, { body: payload });
  const t = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`Edge Function timeout after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs),
  );
  return await Promise.race([p, t]);
}

async function importReportPdfAiFromFile(file) {
  setSaveStatus("Uploading PDF…");
  await yieldUI();

  const bucket = PDF_BUCKET_DEFAULT;
  const safeName = String(file.name || "report.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const tempPath = `${PDF_FOLDER_PREFIX}/tmp/${Date.now()}_${safeName}`;

  const { error: upErr } = await state.supabase
    .storage
    .from(bucket)
    .upload(tempPath, file, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw upErr;

  setSaveStatus("Extracting via AI…");
  await yieldUI();

  const { data, error } = await invokeWithTimeout(
    "import-post-inspection-pdf",
    { report_id: "temp", pdf_storage_path: tempPath },
    180000,
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "AI import failed");

  const extracted = data.extracted;
  const h = extracted?.header || {};
  const obs = Array.isArray(extracted?.observations) ? extracted.observations : [];

  const examined_questions = Array.isArray(extracted?.examined_questions) ? extracted.examined_questions : [];
  const examined_count = Number(extracted?.examined_count || examined_questions.length || 0);

  const extractedVesselName = String(h.vessel_name || "").trim();
  const vesselHit = extractedVesselName
    ? (state.vessels || []).find((v) => String(v.name || "").trim().toLowerCase() === extractedVesselName.toLowerCase())
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

  const isNew = !existingRep?.id;

  const headerPayload = {
    vessel_id: vesselHit.id,
    inspection_date: isoDate,
    port_name: String(h.port_name || "").trim() || null,
    port_code: String(h.port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || "").trim() || null,
    report_ref,
    title: String(el("reportTitle").value || "").trim() || state.titles[0] || null,
    inspector_name: isNew ? null : (String(el("inspectorName").value || "").trim() || null),
    inspector_company: isNew ? null : (String(el("inspectorCompany").value || "").trim() || null),
    pdf_storage_path: tempPath,
    examined_questions,
    examined_count,
  };

  setSaveStatus("Saving header…");
  await yieldUI();

  let report;
  if (existingRep?.id) {
    const ok = confirm(
      `Report ref already exists:\n\n${report_ref}\n\nImport into existing report and replace existing extracted items?`,
    );
    if (!ok) {
      setSaveStatus("Cancelled");
      return;
    }
    report = await updateReportHeader(existingRep.id, headerPayload);
  } else {
    report = await createReportHeader(headerPayload);
  }

  state.reports = await loadReportsFromDb();
  renderStoredTable();

  await setActiveReportById(report.id);

  state.activeReport.examined_questions = examined_questions;
  state.activeReport.examined_count = examined_count;
  el("questionsExaminedVal").textContent = String(examined_count);

  if (isNew) {
    el("inspectorName").value = "";
    el("inspectorCompany").value = "";
  }

  // clear current items for this report in NEW table only
  setSaveStatus("Replacing extracted items…");
  await yieldUI();
  await deleteObservationItemsForReport(report.id);

  // now insert all extracted items
  setSaveStatus(`Saving ${obs.length} item(s)…`);
  await yieldUI();

  let saved = 0;
  let skipped = 0;
  let errors = 0;
  const inserted = [];

  for (let i = 0; i < obs.length; i++) {
    const item = obs[i];
    try {
      const qbase = String(item?.question_base || "").trim();
      const qno = findLibraryQno(qbase) || canonicalQno(qbase);
      if (!qno) {
        skipped++;
        continue;
      }

      const kindRaw = String(item?.obs_type || "").toLowerCase();
      const k = (kindRaw === "negative" || kindRaw === "positive" || kindRaw === "largely")
        ? kindRaw
        : "largely";

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
        question_base: canonicalQno(item?.question_base || qno),
        question_full: String(item?.question_full || "").trim() || null,
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
        page_hint: Number.isFinite(Number(item?.page_hint)) ? Number(item.page_hint) : null,
        source_excerpt: String(item?.source_excerpt || "").trim() || null,
        confidence: item?.confidence == null ? null : Number(item.confidence),
        sort_index: i,
      };

      const savedRow = await insertObservationItem(row);
      inserted.push(savedRow);
      saved++;

      if (i % 10 === 0) {
        setSaveStatus(`Saving items… (${saved}/${obs.length})`);
        await yieldUI();
      }
    } catch (e) {
      console.error("save item failed", e);
      errors++;
    }
  }

  state.observationItems = inserted;
  rebuildExtractedItems();
  renderObsTable();
  renderObsSummary();

  setSaveStatus(`AI import done (saved ${saved}, skipped ${skipped}, errors ${errors})`);
}

/* ---------- PDF download ---------- */

async function downloadActivePdf() {
  if (!state.activeReport) {
    alert("No active report.");
    return;
  }
  const path = state.activeReport.pdf_storage_path;
  if (!path) {
    alert("This report has no linked PDF.");
    return;
  }

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
    export_version: "post_inspection_export_v2_multi_items",
    exported_at: nowIso(),
    report_header: {
      ...report,
      vessel_name: report.vessel_name || "",
    },
    examined: {
      examined_count: examinedCountFromActive(),
      examined_questions: Array.isArray(report.examined_questions) ? report.examined_questions : [],
    },
    observation_items: state.observationItems || [],
  };
}

function exportJson() {
  if (!state.activeReport) {
    alert("No active report.");
    return;
  }
  const payload = buildExportPayload();
  if (!payload) return;

  const name =
    `post_inspection_${String(state.activeReport.report_ref || "report").replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`;

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
  if (!state.activeReport) {
    alert("Load a report first (Stored Inspections).");
    return;
  }

  try {
    setSaveStatus("Importing JSON…");
    const txt = await file.text();
    const payload = JSON.parse(txt);

    const items = Array.isArray(payload?.observation_items) ? payload.observation_items : [];
    const examined = payload?.examined;

    // replace current new-table items for this report
    await deleteObservationItemsForReport(state.activeReport.id);

    const inserted = [];
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      const row = {
        report_id: state.activeReport.id,
        question_no: canonicalQno(x.question_no || x.question_base || ""),
        question_base: canonicalQno(x.question_base || x.question_no || ""),
        question_full: String(x.question_full || "").trim() || null,
        has_observation: x.has_observation !== false,
        observation_type: String(x.observation_type || "").trim(),
        obs_type: String(x.obs_type || "").trim(),
        designation: normDesignation(x.designation),
        positive_rank: String(x.positive_rank || "").trim() || null,
        nature_of_concern: String(x.nature_of_concern || "").trim() || null,
        classification_coding: String(x.classification_coding || "").trim() || null,
        observation_text: String(x.observation_text || "").trim() || null,
        remarks: String(x.remarks || "").trim() || null,
        pgno_selected: Array.isArray(x.pgno_selected) ? x.pgno_selected : [],
        page_hint: Number.isFinite(Number(x.page_hint)) ? Number(x.page_hint) : null,
        source_excerpt: String(x.source_excerpt || "").trim() || null,
        confidence: x.confidence == null ? null : Number(x.confidence),
        sort_index: Number.isFinite(Number(x.sort_index)) ? Number(x.sort_index) : i,
      };

      const saved = await insertObservationItem(row);
      inserted.push(saved);
    }

    if (examined && Array.isArray(examined.examined_questions)) {
      state.activeReport.examined_questions = examined.examined_questions;
      state.activeReport.examined_count =
        Number(examined.examined_count || examined.examined_questions.length) || examined.examined_questions.length;

      try {
        await updateReportHeader(state.activeReport.id, {
          ...headerInputs(),
          examined_questions: state.activeReport.examined_questions,
          examined_count: state.activeReport.examined_count,
        });
      } catch (e) {
        console.warn("Could not persist examined fields on import JSON", e);
      }
    }

    state.observationItems = inserted;
    rebuildExtractedItems();
    renderObsTable();
    renderObsSummary();

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
  const neg = items.filter((x) => x.kind === "negative").length;
  const pos = items.filter((x) => x.kind === "positive").length;
  const lae = items.filter((x) => x.kind === "largely").length;
  const miss = items.filter((x) => itemNeedsPgno(x) && missingPgnoForItem(x)).length;

  el("kpiQuestionsExamined").value = String(examinedCountFromActive());
  el("kpiTotal").value = String(total);
  el("kpiNeg").value = String(neg);
  el("kpiPos").value = String(pos);
  el("kpiLae").value = String(lae);
  el("kpiMissingPgno").value = String(miss);

  el("statsDialog").showModal();
}

function finalizeCheck() {
  if (!state.activeReport) {
    alert("No active report.");
    return;
  }

  const missing = (state.extractedItems || []).filter((x) => itemNeedsPgno(x) && missingPgnoForItem(x));
  if (!missing.length) {
    alert("Finalize check: OK.\n\nNo Negative/Largely items are missing PGNO ticks.");
    return;
  }

  const lines = missing.slice(0, 30).map((x) => `- ${x.qno} (${x.kind} / ${x.designation || "—"})`).join("\n");

  alert(
    `Finalize check: NOT OK.\n\nMissing PGNO tick(s) for:\n${lines}` +
      (missing.length > 30 ? `\n… plus ${missing.length - 30} more.` : ""),
  );
}

/* ---------- Init ---------- */

async function waitForAuth(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (window.AUTH && window.AUTH.ensureSupabase) return true;
    await sleep(50);
  }
  return false;
}

async function init() {
  el("buildPill").textContent = `build: ${POST_INSPECTION_BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded. Ensure ./auth.js is included BEFORE ./post_inspection.js.");

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("dashboardBtn")?.addEventListener("click", async () => {
    await safeNavigate(["./dashboard.html", "./su-admin.html", "./index.html", "./"]);
  });
  el("modeSelectBtn")?.addEventListener("click", async () => {
    await safeNavigate(["./mode_selection.html", "./mode-selection.html", "./index.html", "./"]);
  });

  // titles
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
  await yieldUI();

  state.vessels = await loadVessels();
  renderVesselsSelect();

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  for (const q of state.lib) {
    const qno = getQno(q);
    if (!qno) continue;
    state.libByNo.set(qno, q);
    const canon = canonicalQno(qno);
    if (canon && !state.libCanonToExact.has(canon)) state.libCanonToExact.set(canon, qno);
  }

  state.reports = await loadReportsFromDb();
  renderStoredTable();

  document.querySelectorAll(".filter-btn[data-filter-col]").forEach((btn) => {
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
    if (col === "inspection_date") return;

    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    renderStoredFilterList(values, set, el("storedFilterSearch").value);
    state.storedFilters[col] = set;
  });

  el("storedFilterClearBtn").addEventListener("click", () => {
    const col = state.openFilterCol;
    if (!col) return;

    if (col === "inspection_date") {
      state.storedDateYears = new Set();
      state.storedDateMonths = new Set();
      renderStoredDateFilterUI();
      return;
    }

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
    state.storedDateYears = new Set();
    state.storedDateMonths = new Set();
    renderStoredTable();
  });

  // header buttons
  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  // download PDF
  el("downloadPdfBtn").addEventListener("click", downloadActivePdf);

  // import PDF
  el("importPdfBtn").addEventListener("click", () => el("importPdfFile").click());
  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (!f) return;
      await importReportPdfAiFromFile(f);
    } catch (err) {
      console.error("AI import failed", err);
      alert("AI import failed:\n\n" + (err?.message || String(err)));
      setSaveStatus("Error");
    } finally {
      e.target.value = "";
    }
  });

  // export / import JSON
  el("exportBtn").addEventListener("click", exportJson);
  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importJsonFile(f);
    } finally {
      e.target.value = "";
    }
  });

  // KPIs + finalize
  el("statsBtn").addEventListener("click", renderKpis);
  el("finalizeBtn").addEventListener("click", finalizeCheck);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());

  // manual
  el("addManualBtn").addEventListener("click", addManualItem);

  // extracted filters
  el("obsSearch").addEventListener("input", renderObsTable);
  el("obsTypeFilter").addEventListener("change", renderObsTable);
  el("obsDesignationFilter").addEventListener("change", renderObsTable);
  el("onlyMissingPgno").addEventListener("change", renderObsTable);

  // dialog
  el("dlgCancelBtn").addEventListener("click", closeObsDialog);
  el("dlgSaveBtn").addEventListener("click", saveObsDialog);

  if (!el("inspectionDate").value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  state.observationItems = [];
  rebuildExtractedItems();
  renderObsTable();
  renderObsSummary();
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