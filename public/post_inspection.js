import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";

/**
 * HARD BUILD STAMP (you can see it in the top pill)
 * Change this string every time you replace this file.
 */
const BUILD_STAMP = "post_inspection_stored_filters_tickbox_titles_examined_v1_2026-03-01";

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

function isoToYyyyMmDd(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
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

function findLibraryQno(qbase) {
  const raw = String(qbase || "").trim();
  if (!raw) return null;

  if (state.libByNo.has(raw)) return raw;

  const padded = normalizeQnoParts(raw, true);
  if (state.libByNo.has(padded)) return padded;

  const nonPadded = normalizeQnoParts(raw, false);
  if (state.libByNo.has(nonPadded)) return nonPadded;

  for (const candidate of [raw, padded, nonPadded]) {
    const alt = candidate.split(".").map(p => p.replace(/^0+/, "") || "0").join(".");
    if (state.libByNo.has(alt)) return alt;
  }

  return null;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getQno(q) { return String(pick(q, ["No.", "No", "question_no", "QuestionNo", "Question ID"])).trim(); }
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

const state = {
  me: null,
  supabase: null,

  vessels: [],
  titles: [],
  lib: [],
  libByNo: new Map(),

  // Stored inspections
  reports: [],
  activeReport: null,

  // Stored filters (tickboxes)
  storedFilters: {
    vessel: new Set(),
    year: new Set(),
    month: new Set(),
    report_ref: new Set(),
    title: new Set(),
    ocimf: new Set(),
    inspector: new Set(),
    inspector_company: new Set(),
  },
  storedFilterMode: null, // which modal is open

  observationsByQno: {},
  extractedItems: [],

  examinedQuestions: [],
  dialogItem: null,

  manualDraft: null,
};

function setSaveStatus(text) { el("saveStatus").textContent = text || "Not saved"; }
function setActivePill(text) { el("activeReportPill").textContent = text || "No active report"; }

function reportLabel(r) {
  const v = r.vessel_name || "Unknown vessel";
  const d = r.inspection_date || "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${v} | ${d}${ref}`;
}

function makeMonthLabel(mm) {
  const map = { "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun","07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec" };
  return `${mm} - ${map[mm] || mm}`;
}

// -------------------------
// Supabase DB helpers
// -------------------------
async function loadVessels() {
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadTitles() {
  const { data, error } = await state.supabase
    .from("post_inspection_titles")
    .select("id, title, is_active")
    .eq("is_active", true)
    .order("title", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function addTitle(title) {
  const t = String(title || "").trim();
  if (!t) throw new Error("Title is empty.");
  const { error } = await state.supabase
    .from("post_inspection_titles")
    .insert([{ title: t }]);
  if (error) throw error;
}

async function loadReportsFromDb() {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, report_title, inspector_name, inspector_company, pdf_storage_path, questions_examined_count, created_at, updated_at")
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

async function loadExaminedQuestions(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_examined_questions")
    .select("question_no")
    .eq("report_id", reportId);

  if (error) throw error;
  return (data || []).map(x => String(x.question_no || "").trim()).filter(Boolean);
}

async function saveExaminedQuestions(reportId, qnos) {
  const arr = Array.isArray(qnos) ? qnos.map(x => String(x || "").trim()).filter(Boolean) : [];
  const unique = [...new Set(arr)];
  // upsert rows
  if (unique.length) {
    const rows = unique.map(q => ({ report_id: reportId, question_no: q }));
    const { error } = await state.supabase
      .from("post_inspection_examined_questions")
      .upsert(rows, { onConflict: "report_id,question_no" });
    if (error) throw error;
  }
  // store count in report row
  const { error: uerr } = await state.supabase
    .from("post_inspection_reports")
    .update({ questions_examined_count: unique.length })
    .eq("id", reportId);
  if (uerr) throw uerr;

  return unique.length;
}

async function createReportHeader(payload) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([payload])
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, report_title, inspector_name, inspector_company, pdf_storage_path, questions_examined_count, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, payload) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update(payload)
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, report_title, inspector_name, inspector_company, pdf_storage_path, questions_examined_count, created_at, updated_at")
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

function headerInputs() {
  return {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    inspection_date: String(el("inspectionDate").value || "").trim(),
    port_name: String(el("portName").value || "").trim(),
    port_code: String(el("portCode").value || "").trim(),
    ocimf_inspecting_company: String(el("ocimfCompany").value || "").trim(),
    report_ref: String(el("reportRef").value || "").trim(),
    report_title: String(el("reportTitleSelect").value || "").trim(),
    inspector_name: String(el("inspectorName").value || "").trim(),
    inspector_company: String(el("inspectorCompany").value || "").trim(),
    pdf_storage_path: state.activeReport?.pdf_storage_path || null,
  };
}

function loadReportIntoHeader(r) {
  el("vesselSelect").value = r.vessel_id || "";
  el("inspectionDate").value = isoToYyyyMmDd(r.inspection_date) || r.inspection_date || "";
  el("portName").value = r.port_name || "";
  el("portCode").value = r.port_code || "";
  el("ocimfCompany").value = r.ocimf_inspecting_company || "";
  el("reportRef").value = r.report_ref || "";
  el("inspectorName").value = r.inspector_name || "";
  el("inspectorCompany").value = r.inspector_company || "";
  if (r.report_title) el("reportTitleSelect").value = r.report_title;

  setActivePill("Active: " + reportLabel(r));

  if (r.pdf_storage_path) {
    el("pdfStatus").textContent = `Stored: ${r.pdf_storage_path.split("/").pop()}`;
  } else {
    el("pdfStatus").textContent = "No PDF linked";
  }

  el("examinedCount").textContent = String(r.questions_examined_count || 0);
}

// -------------------------
// Stored inspections (table + tickbox filter modals)
// -------------------------
function buildStoredFilterUniverse() {
  // derive unique values from reports
  const u = {
    vessel: new Set(),
    year: new Set(),
    month: new Set(),
    report_ref: new Set(),
    title: new Set(),
    ocimf: new Set(),
    inspector: new Set(),
    inspector_company: new Set(),
  };

  for (const r of state.reports || []) {
    if (r.vessel_name) u.vessel.add(r.vessel_name);
    if (r.report_ref) u.report_ref.add(r.report_ref);
    if (r.report_title) u.title.add(r.report_title);
    if (r.ocimf_inspecting_company) u.ocimf.add(r.ocimf_inspecting_company);
    if (r.inspector_name) u.inspector.add(r.inspector_name);
    if (r.inspector_company) u.inspector_company.add(r.inspector_company);

    const d = String(r.inspection_date || "");
    // accept yyyy-mm-dd or dd.mm.yyyy already stored as yyyy-mm-dd in DB
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      u.year.add(m[1]);
      u.month.add(m[2]);
    }
  }

  return {
    vessel: [...u.vessel].sort(),
    year: [...u.year].sort(),
    month: [...u.month].sort(),
    report_ref: [...u.report_ref].sort(),
    title: [...u.title].sort(),
    ocimf: [...u.ocimf].sort(),
    inspector: [...u.inspector].sort(),
    inspector_company: [...u.inspector_company].sort(),
  };
}

function reportPassesStoredFilters(r) {
  const f = state.storedFilters;
  const hasAny = (set) => set && set.size > 0;

  const vesselOk = !hasAny(f.vessel) || f.vessel.has(String(r.vessel_name || ""));
  const refOk = !hasAny(f.report_ref) || f.report_ref.has(String(r.report_ref || ""));
  const titleOk = !hasAny(f.title) || f.title.has(String(r.report_title || ""));
  const ocimfOk = !hasAny(f.ocimf) || f.ocimf.has(String(r.ocimf_inspecting_company || ""));
  const inspOk = !hasAny(f.inspector) || f.inspector.has(String(r.inspector_name || ""));
  const icOk = !hasAny(f.inspector_company) || f.inspector_company.has(String(r.inspector_company || ""));

  let yearOk = true, monthOk = true;
  const d = String(r.inspection_date || "");
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const yyyy = m ? m[1] : "";
  const mm = m ? m[2] : "";

  if (hasAny(f.year)) yearOk = f.year.has(yyyy);
  if (hasAny(f.month)) monthOk = f.month.has(mm);

  return vesselOk && refOk && titleOk && ocimfOk && inspOk && icOk && yearOk && monthOk;
}

function renderStoredInspections() {
  const body = el("storedTableBody");
  const filtered = (state.reports || []).filter(reportPassesStoredFilters);

  el("storedCount").textContent = `${filtered.length} inspection(s)`;

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No inspections match the current filters.</td></tr>`;
    return;
  }

  body.innerHTML = filtered.map(r => {
    return `
      <tr class="si-row" data-id="${esc(r.id)}">
        <td title="${esc(r.vessel_name || "")}"><b>${esc(r.vessel_name || "")}</b></td>
        <td title="${esc(r.inspection_date || "")}">${esc(r.inspection_date || "")}</td>
        <td title="${esc(r.report_ref || "")}">${esc(r.report_ref || "")}</td>
        <td title="${esc(r.report_title || "")}">${esc(r.report_title || "")}</td>
        <td title="${esc(r.ocimf_inspecting_company || "")}">${esc(r.ocimf_inspecting_company || "")}</td>
        <td title="${esc(r.inspector_name || "")}">${esc(r.inspector_name || "")}</td>
        <td title="${esc(r.inspector_company || "")}">${esc(r.inspector_company || "")}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("tr.si-row").forEach(tr => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      await setActiveReportById(id);
    });
  });
}

function clearAllStoredFilters() {
  for (const k of Object.keys(state.storedFilters)) state.storedFilters[k].clear();
  renderStoredInspections();
}

function openStoredFilterModal(kind) {
  state.storedFilterMode = kind;
  const u = buildStoredFilterUniverse();

  const titleMap = {
    vessel: "Vessel (tick to include)",
    date: "Date (Years + Months)",
    report_ref: "Report Ref",
    title: "Title",
    ocimf: "OCIMF Inspecting Company",
    inspector: "Inspector Name",
    inspector_company: "Inspector’s Company",
  };

  el("sfTitle").textContent = titleMap[kind] || "Filters";
  const body = el("sfBody");

  const mkList = (values, setRef, labelFn) => {
    const sorted = values || [];
    if (!sorted.length) return `<div class="muted">No values.</div>`;
    return `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
        ${sorted.map(v => {
          const checked = setRef.has(v) ? "checked" : "";
          return `
            <label style="display:flex; gap:8px; align-items:center; font-weight:850; color:#0c1b2a;">
              <input type="checkbox" data-v="${esc(v)}" ${checked}/>
              <span>${esc(labelFn ? labelFn(v) : v)}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;
  };

  if (kind === "date") {
    const years = u.year;
    const months = u.month;
    const yearSet = state.storedFilters.year;
    const monthSet = state.storedFilters.month;

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px;">
        <div>
          <div style="font-weight:950; color:#143a63; margin-bottom:8px;">Years</div>
          <div id="sfYears">${mkList(years, yearSet)}</div>
        </div>
        <div>
          <div style="font-weight:950; color:#143a63; margin-bottom:8px;">Months</div>
          <div id="sfMonths">${mkList(months, monthSet, makeMonthLabel)}</div>
        </div>
      </div>
    `;
  } else {
    const map = {
      vessel: ["vessel", "vessel"],
      report_ref: ["report_ref", "report_ref"],
      title: ["title", "title"],
      ocimf: ["ocimf", "ocimf"],
      inspector: ["inspector", "inspector"],
      inspector_company: ["inspector_company", "inspector_company"],
    };
    const kk = map[kind] ? map[kind][0] : kind;
    const values = u[kk] || [];
    const setRef = state.storedFilters[kk] || new Set();
    body.innerHTML = mkList(values, setRef);
  }

  // attach checkbox handlers
  body.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener("change", () => {
      const v = chk.getAttribute("data-v");
      if (kind === "date") {
        // detect whether this checkbox is in years or months by container
        const parentId = chk.closest("#sfYears") ? "year" : (chk.closest("#sfMonths") ? "month" : null);
        if (!parentId || !v) return;
        const setRef = state.storedFilters[parentId];
        if (chk.checked) setRef.add(v); else setRef.delete(v);
      } else {
        const k = (kind === "vessel") ? "vessel"
          : (kind === "report_ref") ? "report_ref"
          : (kind === "title") ? "title"
          : (kind === "ocimf") ? "ocimf"
          : (kind === "inspector") ? "inspector"
          : (kind === "inspector_company") ? "inspector_company"
          : null;
        if (!k || !v) return;
        const setRef = state.storedFilters[k];
        if (chk.checked) setRef.add(v); else setRef.delete(v);
      }

      renderStoredInspections();
    });
  });

  el("storedFiltersDialog").showModal();
}

function clearCurrentStoredFilter() {
  const kind = state.storedFilterMode;
  if (!kind) return;

  if (kind === "date") {
    state.storedFilters.year.clear();
    state.storedFilters.month.clear();
  } else if (state.storedFilters[kind]) {
    state.storedFilters[kind].clear();
  } else {
    // map alias
    const map = { inspector_company: "inspector_company", report_ref:"report_ref" };
    const k = map[kind] || kind;
    if (state.storedFilters[k]) state.storedFilters[k].clear();
  }

  renderStoredInspections();
  // re-render modal to reflect cleared
  openStoredFilterModal(kind);
}

// -------------------------
// Rendering: extracted items table
// -------------------------
function obsRowTypeLabel(item) {
  if (item.kind === "negative") return `<span class="obs-badge neg">Negative</span>`;
  if (item.kind === "positive") return `<span class="obs-badge pos">Positive</span>`;
  return `<span class="obs-badge lae">Largely</span>`;
}

function missingPgnoForQno(qno) {
  const row = state.observationsByQno[qno];
  if (!row) return false;
  const isNeg = String(row.observation_type || "") === "negative_observation";
  if (!isNeg) return false;
  const arr = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
  return arr.length === 0;
}

function renderObsSummary() {
  const items = state.extractedItems || [];
  const total = items.length;
  const neg = items.filter(x => x.kind === "negative").length;
  const pos = items.filter(x => x.kind === "positive").length;
  const lae = items.filter(x => x.kind === "largely").length;
  const miss = items.filter(x => x.kind === "negative" && missingPgnoForQno(x.qno)).length;

  el("obsSummary").textContent = `Total: ${total} | Negative: ${neg} | Positive: ${pos} | Largely: ${lae} | Missing PGNO: ${miss}`;
}

function applyObsFilters(items) {
  const term = String(el("obsSearch").value || "").trim().toLowerCase();
  const type = String(el("obsTypeFilter").value || "").trim();
  const cat = String(el("obsCategoryFilter").value || "").trim();
  const onlyMissing = !!el("onlyMissingPgno").checked;

  return (items || []).filter(it => {
    if (type && it.kind !== type) return false;
    if (cat && String(it.category || "") !== cat) return false;
    if (onlyMissing && !(it.kind === "negative" && missingPgnoForQno(it.qno))) return false;

    if (term) {
      const hay = [
        it.qno,
        it.kind,
        it.category || "",
        it.nature_of_concern || "",
        it.classification_coding || "",
        it.text || "",
        it.pgno_text || ""
      ].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }

    return true;
  });
}

function renderObsTable() {
  const body = el("obsTableBody");
  const items = applyObsFilters(state.extractedItems);

  if (!state.activeReport) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No report loaded.</td></tr>`;
    el("obsSummary").textContent = "No report loaded.";
    return;
  }

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No items match the current filters.</td></tr>`;
    renderObsSummary();
    return;
  }

  body.innerHTML = items.map(it => {
    const pgArr = state.observationsByQno[it.qno]?.pgno_selected || [];
    const pgText = (Array.isArray(pgArr) && pgArr.length)
      ? pgArr.map(x => String(x.text || "").trim()).filter(Boolean).join("; ")
      : (it.kind === "negative" ? `—` : `n/a`);

    return `
      <tr class="obs-row" data-qno="${esc(it.qno)}">
        <td title="${esc(it.qno)}">${esc(it.qno)}</td>
        <td>${obsRowTypeLabel(it)}</td>
        <td title="${esc(it.category || "")}">${esc(it.category || "—")}</td>
        <td title="${esc(it.nature_of_concern || "")}">${esc(it.nature_of_concern || "")}</td>
        <td title="${esc(it.classification_coding || "")}" class="muted">${esc(it.classification_coding || "")}</td>
        <td title="${esc(it.text || "")}">${esc(it.text || "")}</td>
        <td title="${esc(pgText)}">${esc(pgText)}</td>
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
}

// -------------------------
// Modal editor (all fields editable)
// -------------------------
function openObsDialog(item) {
  state.dialogItem = item;

  const q = state.libByNo.get(item.qno);
  const shortText = q ? getShort(q) : "";
  const qText = q ? getQText(q) : "";
  const chap = q ? getChap(q) : "";
  const sect = q ? getSection(q) : "";

  el("dlgTitle").textContent = `${item.qno} — ${shortText || "Question"}`;
  el("dlgSub").textContent = `Chapter ${chap || "—"} | ${sect || "—"} | ${item.kind.toUpperCase()}`;

  const existing = state.observationsByQno[item.qno] || null;

  const isNegative = item.kind === "negative";
  const isLargely = item.kind === "largely";

  const pgnoBullets = q ? getPgnoBullets(q) : [];
  const selected = new Set((existing?.pgno_selected || []).map(x => Number(x.idx)).filter(Number.isFinite));

  const pgnoHtml = !isNegative
    ? `<div class="hint">PGNOs are <b>not applicable</b> for Positive / Largely as expected items.</div>`
    : (
      pgnoBullets.length
        ? `
          <div style="font-weight:950; color:#143a63; margin-top:8px;">PGNO tick selection (Negative only)</div>
          <div id="dlgPgnoList">
            ${pgnoBullets.map((txt, i) => {
              const idx = i + 1;
              const chk = selected.has(idx) ? "checked" : "";
              return `
                <div class="pgnoRow">
                  <input type="checkbox" class="dlgPgChk" data-idx="${idx}" ${chk}/>
                  <div style="font-weight:900; color:#143a63;">PGNO ${idx}</div>
                  <div style="font-weight:800; color:#0c1b2a;">${esc(txt)}</div>
                </div>
              `;
            }).join("")}
          </div>
        `
        : `<div class="hint">No PGNO bullets found in your locked library JSON for this question.</div>`
    );

  const categoryVal = String(existing?.designation || item.category || (item.kind === "positive" ? "Human" : "") || "").trim();
  const natureVal = String(existing?.nature_of_concern || item.nature_of_concern || "").trim();
  const codeVal = String(existing?.classification_coding || item.classification_coding || "").trim();
  const textVal = String(existing?.observation_text || item.text || "").trim();

  el("dlgBody").innerHTML = `
    <div style="font-weight:900; color:#143a63; margin-bottom:10px;">Question</div>
    <div style="font-weight:800; color:#0c1b2a; line-height:1.35; margin-bottom:12px;">${esc(qText)}</div>

    <div class="dlg-grid">
      <div class="pi-field">
        <label>Category (editable)</label>
        <select id="dlgCategory">
          <option value="">—</option>
          <option value="Human" ${categoryVal==="Human"?"selected":""}>Human</option>
          <option value="Process" ${categoryVal==="Process"?"selected":""}>Process</option>
          <option value="Hardware" ${categoryVal==="Hardware"?"selected":""}>Hardware</option>
          <option value="Photo" ${categoryVal==="Photo"?"selected":""}>Photo</option>
        </select>
      </div>
      <div class="pi-field">
        <label>Nature of concern (editable)</label>
        <input id="dlgNature" type="text" value="${esc(natureVal)}" />
      </div>
    </div>

    <div class="pi-field" style="margin-top:10px;">
      <label>Classification coding (editable)</label>
      <input id="dlgCoding" type="text" value="${esc(codeVal)}" placeholder="e.g. 5.1.2.1.1 - ..." />
    </div>

    <div class="pi-field" style="margin-top:10px;">
      <label>Observation text (editable)</label>
      <textarea id="dlgObsText" placeholder="Paste / edit the observation text here...">${esc(textVal)}</textarea>
      <div class="muted" style="margin-top:6px;">
        Tip: if AI did not extract text, paste it here and Save — it will show in the list.
      </div>
    </div>

    ${pgnoHtml}

    ${isNegative ? `<div id="dlgMissingHint" class="hint" style="display:none;">Missing PGNO tick (Finalize will flag this).</div>` : ``}
  `;

  if (isNegative) {
    const hint = el("dlgMissingHint");
    const pg = Array.isArray(existing?.pgno_selected) ? existing.pgno_selected : [];
    hint.style.display = pg.length ? "none" : "block";
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
  const isNegative = item.kind === "negative";

  const category = String(el("dlgCategory").value || "").trim() || null;
  const nature = String(el("dlgNature").value || "").trim() || null;
  const coding = String(el("dlgCoding").value || "").trim() || null;
  const obsText = String(el("dlgObsText").value || "").trim() || null;

  let pgno_selected = [];
  if (isNegative) {
    const pgList = el("dlgBody").querySelectorAll(".dlgPgChk");
    pgList.forEach(chk => {
      if (chk.checked) {
        const idx = Number(chk.getAttribute("data-idx"));
        if (!Number.isFinite(idx)) return;
        const q = state.libByNo.get(qno);
        const bullets = q ? getPgnoBullets(q) : [];
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
    pgno_selected,
    remarks: obsText, // keep aligned

    obs_type,
    question_base: qno,

    observation_text: obsText,
    designation: category || (item.kind === "positive" ? "Human" : null),
    nature_of_concern: nature,
    classification_coding: coding,
    positive_rank: item.kind === "positive" ? (item.positive_rank || null) : null,

    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);
    state.observationsByQno[qno] = { ...state.observationsByQno[qno], ...row };
    setSaveStatus("Saved");
    closeObsDialog();
    buildExtractedItemsFromDb();
    renderObsTable();
  } catch (e) {
    console.error(e);
    alert("Save failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

// -------------------------
// Manual add item
// -------------------------
function openManualDialog() {
  if (!state.activeReport) {
    alert("Load or create a report first.");
    return;
  }

  const options = [...state.libByNo.keys()].sort((a,b)=>a.localeCompare(b));
  state.manualDraft = { qno: "", type: "negative", category: "Process", nature: "Not as expected.", coding: "", text: "" };

  el("manualBody").innerHTML = `
    <div class="dlg-grid">
      <div class="pi-field">
        <label>Question No</label>
        <select id="manQno">
          <option value="">— select —</option>
          ${options.map(q=>`<option value="${esc(q)}">${esc(q)}</option>`).join("")}
        </select>
      </div>

      <div class="pi-field">
        <label>Type</label>
        <select id="manType">
          <option value="negative">Negative</option>
          <option value="positive">Positive</option>
          <option value="largely">Largely as expected</option>
        </select>
      </div>

      <div class="pi-field">
        <label>Category</label>
        <select id="manCat">
          <option value="Human">Human</option>
          <option value="Process" selected>Process</option>
          <option value="Hardware">Hardware</option>
          <option value="Photo">Photo</option>
        </select>
      </div>

      <div class="pi-field">
        <label>Nature of concern</label>
        <input id="manNature" type="text" value="Not as expected." />
      </div>
    </div>

    <div class="pi-field" style="margin-top:10px;">
      <label>Classification coding</label>
      <input id="manCode" type="text" placeholder="(optional)" />
    </div>

    <div class="pi-field" style="margin-top:10px;">
      <label>Observation text</label>
      <textarea id="manText" placeholder="Paste the observation text here..."></textarea>
    </div>
  `;

  el("manualDialog").showModal();
}

function closeManualDialog() {
  try { el("manualDialog").close(); } catch {}
}

async function saveManualDialog() {
  if (!state.activeReport) return;

  const qno = String(el("manQno").value || "").trim();
  if (!qno) { alert("Select a question number."); return; }

  const kind = String(el("manType").value || "negative").trim();
  const category = String(el("manCat").value || "").trim() || null;
  const nature = String(el("manNature").value || "").trim() || null;
  const coding = String(el("manCode").value || "").trim() || null;
  const text = String(el("manText").value || "").trim() || null;

  const observation_type =
    kind === "negative" ? "negative_observation" :
    kind === "positive" ? "positive_observation" :
    "note_improvement";

  const obs_type =
    kind === "negative" ? "negative" :
    kind === "positive" ? "positive" :
    "largely";

  const row = {
    report_id: state.activeReport.id,
    question_no: qno,
    has_observation: true,
    observation_type,
    obs_type,
    question_base: qno,
    observation_text: text,
    remarks: text,
    pgno_selected: [],
    designation: category || (kind === "positive" ? "Human" : null),
    nature_of_concern: nature,
    classification_coding: coding,
    positive_rank: null,
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);
    state.observationsByQno[qno] = { ...state.observationsByQno[qno], ...row };
    buildExtractedItemsFromDb();
    renderObsTable();
    setSaveStatus("Saved");
    closeManualDialog();
  } catch (e) {
    console.error(e);
    alert("Save failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

// -------------------------
// Report selection + header actions
// -------------------------
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

function renderTitlesSelect() {
  const sel = el("reportTitleSelect");
  sel.innerHTML = `<option value="">— Select title —</option>`;
  for (const t of state.titles) {
    const o = document.createElement("option");
    o.value = t.title;
    o.textContent = t.title;
    sel.appendChild(o);
  }
}

async function setActiveReportById(id) {
  const rid = String(id || "").trim();
  if (!rid) {
    state.activeReport = null;
    state.observationsByQno = {};
    state.extractedItems = [];
    state.examinedQuestions = [];
    setActivePill("No active report");
    renderObsTable();
    setSaveStatus("Not saved");
    el("examinedCount").textContent = "0";
    return;
  }

  const r = state.reports.find(x => x.id === rid) || null;
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

  try {
    state.examinedQuestions = await loadExaminedQuestions(r.id);
    el("examinedCount").textContent = String(state.examinedQuestions.length || r.questions_examined_count || 0);
  } catch (e) {
    console.error(e);
    state.examinedQuestions = [];
  }

  buildExtractedItemsFromDb();
  renderObsTable();
  setSaveStatus("Loaded");
}

function handleNewReport() {
  state.activeReport = null;
  state.observationsByQno = {};
  state.extractedItems = [];
  state.examinedQuestions = [];
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
  el("reportTitleSelect").value = "";
  el("pdfStatus").textContent = "No PDF linked";
  el("examinedCount").textContent = "0";

  renderObsTable();
}

async function handleSaveHeader() {
  const payload = headerInputs();

  if (!payload.vessel_id) { alert("Please select a vessel first."); return; }
  if (!payload.inspection_date) { alert("Please set an inspection date."); return; }
  if (!payload.report_ref) { alert("Please enter report reference (unique)."); return; }
  if (!payload.report_title) { alert("Please select a Title."); return; }

  setSaveStatus("Saving…");
  try {
    let saved;
    if (!state.activeReport) {
      saved = await createReportHeader(payload);
    } else {
      saved = await updateReportHeader(state.activeReport.id, payload);
    }

    // refresh reports list
    state.reports = await loadReportsFromDb();
    renderStoredInspections();

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
    state.reports = await loadReportsFromDb();
    renderStoredInspections();
    await setActiveReportById(state.reports[0]?.id || null);
    setSaveStatus("Deleted");
  } catch (e) {
    console.error(e);
    alert("Delete failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

// -------------------------
// Build extracted list from DB (including largely)
// -------------------------
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

    const category = String(row.designation || "").trim() || (kind === "positive" ? "Human" : "");

    out.push({
      qno,
      kind,
      category,
      positive_rank: String(row.positive_rank || "").trim() || null,
      nature_of_concern: String(row.nature_of_concern || "").trim() || "",
      classification_coding: String(row.classification_coding || "").trim() || "",
      text: String(row.observation_text || row.remarks || "").trim(),
    });
  }

  out.sort((a, b) => String(a.qno).localeCompare(String(b.qno)));
  state.extractedItems = out;
}

// -------------------------
// PDF AI import (observations + examined questions)
// -------------------------
async function importReportPdfAiFromFile(file) {
  if (!file) return;

  if (!state.titles.length) {
    // keep UI stable
    state.titles = await loadTitles();
    renderTitlesSelect();
  }

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

  const extractedVesselName = String(h.vessel_name || "").trim();
  const vesselHit = extractedVesselName
    ? (state.vessels || []).find(v => String(v.name || "").trim().toLowerCase() === extractedVesselName.toLowerCase())
    : null;
  if (!vesselHit?.id) {
    throw new Error(`AI import: vessel not found in vessels table: "${extractedVesselName}". Add it first, or use manual mode.`);
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

  // Title is REQUIRED: if user already selected a title, keep it; else default to first known title
  let chosenTitle = String(el("reportTitleSelect").value || "").trim();
  if (!chosenTitle) {
    chosenTitle = (state.titles[0]?.title) ? state.titles[0].title : "SIRE 2.0 Inspection";
  }

  const headerPayload = {
    vessel_id: vesselHit.id,
    inspection_date: isoDate,
    port_name: String(h.port_name || "").trim() || null,
    port_code: String(h.port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || "").trim() || null,
    report_ref,
    report_title: chosenTitle,
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

  // refresh reports list + stored table
  state.reports = await loadReportsFromDb();
  renderStoredInspections();

  await setActiveReportById(report.id);

  // apply header fields to UI
  el("vesselSelect").value = headerPayload.vessel_id;
  el("inspectionDate").value = headerPayload.inspection_date;
  el("portName").value = headerPayload.port_name || "";
  el("portCode").value = headerPayload.port_code || "";
  el("ocimfCompany").value = headerPayload.ocimf_inspecting_company || "";
  el("reportRef").value = headerPayload.report_ref || "";
  el("reportTitleSelect").value = headerPayload.report_title || "";
  el("pdfStatus").textContent = `Stored: ${tempPath.split("/").pop()}`;

  const obs = Array.isArray(extracted?.observations) ? extracted.observations : [];
  const examined = Array.isArray(extracted?.examined_questions) ? extracted.examined_questions : [];
  setSaveStatus(`Saving ${obs.length} item(s)…`);

  let saved = 0, skippedMissing = 0, errors = 0;

  for (const item of obs) {
    const qbase = String(item?.question_base || "").trim();
    const qno = findLibraryQno(qbase);
    if (!qno) { skippedMissing++; continue; }

    const kind = String(item?.obs_type || "").toLowerCase();
    const observation_text = String(item?.observation_text || "").trim();

    const observation_type =
      kind === "negative" ? "negative_observation" :
      kind === "positive" ? "positive_observation" :
      "note_improvement";

    const obs_type =
      kind === "negative" ? "negative" :
      kind === "positive" ? "positive" :
      "largely";

    const row = {
      report_id: report.id,
      question_no: qno,
      has_observation: true,
      observation_type,
      obs_type,
      question_base: qno,

      observation_text: observation_text || null,
      pgno_selected: [],
      remarks: observation_text || null,

      designation: String(item?.designation || "").trim() || (kind === "positive" ? "Human" : null),
      positive_rank: String(item?.positive_rank || "").trim() || null,
      nature_of_concern: String(item?.nature_of_concern || "").trim() || null,
      classification_coding: String(item?.classification_coding || "").trim() || null,

      updated_at: nowIso(),
    };

    try {
      await upsertObservationRow(row);
      saved++;
    } catch (e) {
      console.error(e);
      errors++;
    }
  }

  // Save examined questions + count
  try {
    const count = await saveExaminedQuestions(report.id, examined);
    state.examinedQuestions = examined;
    el("examinedCount").textContent = String(count);
  } catch (e) {
    console.error(e);
  }

  // reload all saved rows for UI
  state.observationsByQno = await loadObservationsForReport(report.id);
  buildExtractedItemsFromDb();
  renderObsTable();

  setSaveStatus(`AI import done (saved ${saved}, library-missing ${skippedMissing}, errors ${errors})`);
}

// -------------------------
// KPI + finalize
// -------------------------
function renderKpis() {
  const items = state.extractedItems || [];
  const total = items.length;
  const neg = items.filter(x => x.kind === "negative").length;
  const pos = items.filter(x => x.kind === "positive").length;
  const lae = items.filter(x => x.kind === "largely").length;
  const miss = items.filter(x => x.kind === "negative" && missingPgnoForQno(x.qno)).length;

  el("kpiTotal").value = String(total);
  el("kpiNeg").value = String(neg);
  el("kpiPos").value = String(pos);
  el("kpiLae").value = String(lae);
  el("kpiMissingPgno").value = String(miss);
  el("kpiExamined").value = String(state.examinedQuestions?.length || state.activeReport?.questions_examined_count || 0);

  el("statsDialog").showModal();
}

function finalizeCheck() {
  if (!state.activeReport) { alert("No active report."); return; }
  const missing = (state.extractedItems || []).filter(x => x.kind === "negative" && missingPgnoForQno(x.qno));
  if (!missing.length) {
    alert("Finalize check: OK.\n\nNo negative items are missing PGNO ticks.");
    return;
  }
  renderKpis();
}

// -------------------------
// Init
// -------------------------
async function waitForAuth(timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.AUTH && typeof window.AUTH.requireAuth === "function") return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

async function init() {
  // build stamp
  try { el("buildPill").textContent = "build: " + BUILD_STAMP; } catch {}

  const ok = await waitForAuth(8000);
  if (!ok) {
    throw new Error("AUTH not loaded. Ensure ./auth.js is included BEFORE ./post_inspection.js.");
  }

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("dashboardBtn")?.addEventListener("click", () => { window.location.href = "dashboard.html"; });
  el("modeSelectBtn")?.addEventListener("click", () => { window.location.href = "mode_selection.html"; });

  setSaveStatus("Loading…");

  // Vessels
  state.vessels = await loadVessels();
  renderVesselsSelect();

  // Titles
  state.titles = await loadTitles();
  renderTitlesSelect();

  // Library
  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  state.libByNo = new Map();
  for (const q of state.lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  // Reports
  state.reports = await loadReportsFromDb();
  renderStoredInspections();

  // Stored filter buttons in headers
  document.querySelectorAll('button[data-filter]').forEach(btn => {
    btn.addEventListener("click", () => {
      const kind = btn.getAttribute("data-filter");
      if (!kind) return;
      const map = {
        vessel: "vessel",
        date: "date",
        report_ref: "report_ref",
        title: "title",
        ocimf: "ocimf",
        inspector: "inspector",
        inspector_company: "inspector_company",
      };
      openStoredFilterModal(map[kind] || kind);
    });
  });

  el("sfCloseBtn").addEventListener("click", () => el("storedFiltersDialog").close());
  el("sfClearBtn").addEventListener("click", clearCurrentStoredFilter);
  el("clearStoredFiltersBtn").addEventListener("click", clearAllStoredFilters);

  // Default inspection date if empty
  if (!el("inspectionDate").value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  // Header actions
  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  // PDF import
  el("importPdfBtn").addEventListener("click", () => el("importPdfFile").click());
  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importReportPdfAiFromFile(f);
    } finally {
      e.target.value = "";
    }
  });

  // Manual item
  el("addManualBtn").addEventListener("click", openManualDialog);
  el("manualCancelBtn").addEventListener("click", closeManualDialog);
  el("manualSaveBtn").addEventListener("click", saveManualDialog);

  // KPIs
  el("statsBtn").addEventListener("click", renderKpis);
  el("finalizeBtn").addEventListener("click", finalizeCheck);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());

  // Observation table filters
  el("obsSearch").addEventListener("input", renderObsTable);
  el("obsTypeFilter").addEventListener("change", renderObsTable);
  el("obsCategoryFilter").addEventListener("change", renderObsTable);
  el("onlyMissingPgno").addEventListener("change", renderObsTable);

  // Observation editor actions
  el("dlgCancelBtn").addEventListener("click", closeObsDialog);
  el("dlgSaveBtn").addEventListener("click", saveObsDialog);

  // Manage titles
  el("manageTitlesBtn").addEventListener("click", async () => {
    await refreshTitlesModal();
    el("titlesDialog").showModal();
  });
  el("closeTitlesBtn").addEventListener("click", () => el("titlesDialog").close());
  el("addTitleBtn").addEventListener("click", async () => {
    const t = String(el("newTitleInput").value || "").trim();
    if (!t) return;
    try {
      await addTitle(t);
      el("newTitleInput").value = "";
      state.titles = await loadTitles();
      renderTitlesSelect();
      await refreshTitlesModal();
    } catch (e) {
      console.error(e);
      alert("Add title failed: " + (e?.message || String(e)));
    }
  });

  // Load first report by default
  if (state.reports.length) {
    await setActiveReportById(state.reports[0].id);
  } else {
    await setActiveReportById(null);
    if (state.vessels.length) el("vesselSelect").value = state.vessels[0].id;
  }

  renderObsTable();
  setSaveStatus(state.activeReport ? "Loaded" : "Not saved");
}

async function refreshTitlesModal() {
  const box = el("titlesList");
  const titles = await loadTitles();
  box.innerHTML = titles.length
    ? titles.map(t => `<div style="padding:8px 6px; border-bottom:1px solid #eef4ff; font-weight:850; color:#0c1b2a;">${esc(t.title)}</div>`).join("")
    : `<div class="muted">No titles.</div>`;
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