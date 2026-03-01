import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";

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

function isoToLabel(iso) {
  const s = String(iso || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s || "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function isoYear(iso) {
  const m = String(iso || "").match(/^(\d{4})-/);
  return m ? m[1] : "";
}

function isoMonth(iso) {
  const m = String(iso || "").match(/^\d{4}-(\d{2})-/);
  return m ? m[1] : "";
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

function getQno(q) {
  return String(pick(q, ["No.", "No", "question_no", "QuestionNo", "Question ID"])).trim();
}
function getChap(q) { return String(pick(q, ["Chap", "chapter", "Chapter"])).trim(); }
function getSection(q) { return String(pick(q, ["Section Name", "Sect", "section", "Section"])).trim(); }
function getShort(q) { return String(pick(q, ["Short Text", "short_text", "ShortText"])).trim(); }
function getQText(q) { return String(pick(q, ["Question", "question"])).trim(); }

function getPgnoBullets(q) {
  const bullets = Array.isArray(q?.NegObs_Bullets) ? q.NegObs_Bullets : null;
  if (bullets && bullets.length) return bullets.map(t => String(t || "").trim()).filter(Boolean);

  const pgTxt = String(q?.["Potential Grounds for Negative Observations"] || "").trim();
  if (!pgTxt) return [];

  const lines = pgTxt.split("\n").map(s => s.trim()).filter(Boolean);
  const usable = lines.filter(s => s.length > 6);
  return usable.slice(0, 120);
}

function normCategory(cat) {
  const c = String(cat || "").trim();
  if (!c) return "";
  const low = c.toLowerCase();
  if (low === "human") return "Human";
  if (low === "process") return "Process";
  if (low === "hardware") return "Hardware";
  if (low === "photo") return "Photo";
  return c;
}

const state = {
  me: null,
  supabase: null,

  vessels: [],
  lib: [],
  libByNo: new Map(),

  reports: [],
  activeReport: null,

  observationsByQno: {},
  extractedItems: [],

  dialogItem: null,
};

function setSaveStatus(text) { el("saveStatus").textContent = text || "Not saved"; }
function setActivePill(text) { el("activeReportPill").textContent = text || "No active report"; }

function reportLabel(r) {
  const v = r.vessel_name || "Unknown vessel";
  const d = r.inspection_date ? isoToLabel(r.inspection_date) : "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${v} | ${d}${ref}`;
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
    .select("report_id, question_no, has_observation, observation_type, pgno_selected, remarks, updated_at, obs_type, observation_text, question_base, pgno_full, designation, nature_of_concern, classification_coding, positive_rank")
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

// -------------------------
// Header helpers
// -------------------------
function headerInputs() {
  return {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    inspection_date: String(el("inspectionDate").value || "").trim(),
    port_name: String(el("portName").value || "").trim(),
    port_code: String(el("portCode").value || "").trim(),
    ocimf_inspecting_company: String(el("ocimfCompany").value || "").trim(),
    report_ref: String(el("reportRef").value || "").trim(),
    title: String(el("reportTitle").value || "").trim(),
    inspector_name: String(el("inspectorName").value || "").trim(),
    inspector_company: String(el("inspectorCompany").value || "").trim(),
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
  el("reportTitle").value = r.title || "";
  el("inspectorName").value = r.inspector_name || "";
  el("inspectorCompany").value = r.inspector_company || "";

  setActivePill("Active: " + reportLabel(r));

  if (r.pdf_storage_path) {
    el("pdfStatus").textContent = `Stored: ${r.pdf_storage_path.split("/").pop()}`;
  } else {
    el("pdfStatus").textContent = "No PDF linked";
  }
}

// -------------------------
// Stored inspections (table + column filters)
// -------------------------
function monthOptions() {
  return [
    ["01","Jan"],["02","Feb"],["03","Mar"],["04","Apr"],["05","May"],["06","Jun"],
    ["07","Jul"],["08","Aug"],["09","Sep"],["10","Oct"],["11","Nov"],["12","Dec"],
  ];
}

function refreshStoredDateFilters() {
  const years = new Set();
  for (const r of state.reports || []) {
    const y = isoYear(r.inspection_date);
    if (y) years.add(y);
  }
  const yearSel = el("siFilterYear");
  const monthSel = el("siFilterMonth");

  const currentYear = String(yearSel.value || "");
  const currentMonth = String(monthSel.value || "");

  yearSel.innerHTML = `<option value="">Year</option>` + [...years].sort((a,b)=>b.localeCompare(a)).map(y => {
    const sel = (y === currentYear) ? "selected" : "";
    return `<option value="${esc(y)}" ${sel}>${esc(y)}</option>`;
  }).join("");

  monthSel.innerHTML = `<option value="">Month</option>` + monthOptions().map(([m,label]) => {
    const sel = (m === currentMonth) ? "selected" : "";
    return `<option value="${esc(m)}" ${sel}>${esc(label)}</option>`;
  }).join("");
}

function storedFilters() {
  return {
    vessel: String(el("siFilterVessel").value || "").trim().toLowerCase(),
    year: String(el("siFilterYear").value || "").trim(),
    month: String(el("siFilterMonth").value || "").trim(),
    ref: String(el("siFilterRef").value || "").trim().toLowerCase(),
    title: String(el("siFilterTitle").value || "").trim().toLowerCase(),
    ocimf: String(el("siFilterOcimf").value || "").trim().toLowerCase(),
    inspector: String(el("siFilterInspector").value || "").trim().toLowerCase(),
    inspectorCompany: String(el("siFilterInspectorCompany").value || "").trim().toLowerCase(),
  };
}

function applyStoredFilters(list) {
  const f = storedFilters();
  return (list || []).filter(r => {
    const vessel = String(r.vessel_name || "").toLowerCase();
    const ref = String(r.report_ref || "").toLowerCase();
    const title = String(r.title || "").toLowerCase();
    const ocimf = String(r.ocimf_inspecting_company || "").toLowerCase();
    const ins = String(r.inspector_name || "").toLowerCase();
    const insc = String(r.inspector_company || "").toLowerCase();

    if (f.vessel && !vessel.includes(f.vessel)) return false;
    if (f.ref && !ref.includes(f.ref)) return false;
    if (f.title && !title.includes(f.title)) return false;
    if (f.ocimf && !ocimf.includes(f.ocimf)) return false;
    if (f.inspector && !ins.includes(f.inspector)) return false;
    if (f.inspectorCompany && !insc.includes(f.inspectorCompany)) return false;

    if (f.year) {
      const y = isoYear(r.inspection_date);
      if (y !== f.year) return false;
    }
    if (f.month) {
      const m = isoMonth(r.inspection_date);
      if (m !== f.month) return false;
    }

    return true;
  });
}

function renderStoredInspections() {
  const tbody = el("storedTbody");
  const filtered = applyStoredFilters(state.reports || []);

  el("siCount").textContent = `${filtered.length} inspections`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="si-muted" style="padding:12px 10px;">No inspections match the current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => {
    const vessel = String(r.vessel_name || "—").trim();
    const date = r.inspection_date ? isoToLabel(r.inspection_date) : "—";
    const ref = String(r.report_ref || "—").trim();
    const title = String(r.title || "—").trim();
    const ocimf = String(r.ocimf_inspecting_company || "—").trim();
    const insp = String(r.inspector_name || "—").trim();
    const inspC = String(r.inspector_company || "—").trim();

    return `
      <tr data-id="${esc(r.id)}" title="Click to load">
        <td class="si-vessel">${esc(vessel)}</td>
        <td>${esc(date)}</td>
        <td>${esc(ref)}</td>
        <td>${esc(title)}</td>
        <td>${esc(ocimf)}</td>
        <td>${esc(insp)}</td>
        <td>${esc(inspC)}</td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("tr[data-id]").forEach(tr => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-id");
      if (id) await setActiveReportById(id);
    });
  });
}

// -------------------------
// Extracted items table (unchanged logic)
// -------------------------
function obsRowTypeLabel(item) {
  if (item.kind === "negative") return `<span class="obs-badge neg">Negative</span>`;
  if (item.kind === "positive") return `<span class="obs-badge pos">Positive</span>`;
  return `<span class="obs-badge lae">Largely as expected</span>`;
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
  const categoryFilter = String(el("obsCategoryFilter").value || "").trim();
  const onlyMissing = !!el("onlyMissingPgno").checked;

  return (items || []).filter(it => {
    if (type && it.kind !== type) return false;

    if (categoryFilter) {
      const d = normCategory(it.designation || "");
      if (categoryFilter !== d) return false;
    }

    if (onlyMissing && !(it.kind === "negative" && missingPgnoForQno(it.qno))) return false;

    if (term) {
      const hay = [
        it.qno,
        it.kind,
        it.designation || "",
        it.positive_rank || "",
        it.nature_of_concern || "",
        it.classification_coding || "",
        it.text || "",
        it.pgno_selected_text || ""
      ].join(" ").toLowerCase();
      if (!hay.includes(term)) return false;
    }

    return true;
  });
}

function buildPgnoSelectedText(qno) {
  const row = state.observationsByQno[qno];
  const pg = Array.isArray(row?.pgno_selected) ? row.pgno_selected : [];
  if (!pg.length) return "";
  return pg.map(x => String(x?.text || "").trim()).filter(Boolean).join(" • ");
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
    const pgText = it.kind === "negative"
      ? (buildPgnoSelectedText(it.qno) || "—")
      : "n/a";

    const catDisplay = it.kind === "positive"
      ? (it.positive_rank ? `Human (${it.positive_rank})` : "Human")
      : (normCategory(it.designation) || "—");

    const noc = String(it.nature_of_concern || "").trim();
    const coding = String(it.classification_coding || "").trim();
    const obsText = String(it.text || "").trim();

    return `
      <tr class="obs-row" data-qno="${esc(it.qno)}" title="Click to edit">
        <td>${esc(it.qno)}</td>
        <td>${obsRowTypeLabel(it)}</td>
        <td class="cell-ellipsis" title="${esc(catDisplay)}">${esc(catDisplay)}</td>
        <td class="cell-ellipsis" title="${esc(noc)}">${esc(noc)}</td>
        <td class="cell-ellipsis wide muted" title="${esc(coding)}">${esc(coding || "—")}</td>
        <td class="cell-ellipsis wide" title="${esc(obsText)}">${esc(obsText || "—")}</td>
        <td class="cell-pgno" title="${esc(pgText)}">${esc(pgText)}</td>
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
// Modal editor (editable fields) — same as previous build
// -------------------------
function buildCategorySelect(selected, disabled=false) {
  const s = normCategory(selected);
  const dis = disabled ? "disabled" : "";
  return `
    <select id="dlgCategory" ${dis}>
      <option value="">—</option>
      <option value="Human" ${s==="Human"?"selected":""}>Human</option>
      <option value="Process" ${s==="Process"?"selected":""}>Process</option>
      <option value="Hardware" ${s==="Hardware"?"selected":""}>Hardware</option>
      <option value="Photo" ${s==="Photo"?"selected":""}>Photo</option>
    </select>
  `;
}

function openObsDialog(item) {
  state.dialogItem = item;

  const q = state.libByNo.get(item.qno);
  const shortText = q ? getShort(q) : "";
  const qText = q ? getQText(q) : "";
  const chap = q ? getChap(q) : "";
  const sect = q ? getSection(q) : "";

  el("dlgTitle").textContent = `${item.qno} — ${shortText || "Question"}`;
  el("dlgSub").textContent = `Chapter ${chap || "—"} | ${sect || "—"} | ${item.kind.toUpperCase()} (click Save after edits)`;

  const existing = state.observationsByQno[item.qno] || {};
  const isNegative = item.kind === "negative";
  const isPositive = item.kind === "positive";

  const categoryVal = normCategory(existing.designation || item.designation || (isPositive ? "Human" : ""));
  const positiveRankVal = String(existing.positive_rank || item.positive_rank || "").trim();
  const nocVal = String(existing.nature_of_concern || item.nature_of_concern || "").trim();
  const codingVal = String(existing.classification_coding || item.classification_coding || "").trim();
  const obsTextVal = String(existing.observation_text || item.text || existing.remarks || "").trim();

  const pgnoBullets = q ? getPgnoBullets(q) : [];
  const selected = new Set((existing.pgno_selected || []).map(x => Number(x.idx)).filter(Number.isFinite));

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
                  <div style="font-weight:950; color:#143a63;">PGNO ${idx}</div>
                  <div style="font-weight:850; color:#0c1b2a;">${esc(txt)}</div>
                </div>
              `;
            }).join("")}
          </div>
        `
        : `<div class="hint">No PGNO bullets found in your locked library JSON for this question.</div>`
    );

  el("dlgBody").innerHTML = `
    <div style="font-weight:900; color:#143a63; margin-bottom:10px;">Question</div>
    <div style="font-weight:700; color:#0c1b2a; line-height:1.35; margin-bottom:12px;">${esc(qText)}</div>

    <div class="dlg-grid" style="margin-bottom:12px;">
      <div class="pi-field">
        <label>Category</label>
        ${buildCategorySelect(categoryVal, isPositive)}
        ${isPositive ? `<div class="muted" style="margin-top:6px;">Positive observations are always Human.</div>` : ``}
      </div>

      <div class="pi-field">
        <label>Positive rank (Human)</label>
        <input id="dlgPositiveRank" type="text" placeholder="e.g. Senior Deck Officer" value="${esc(positiveRankVal)}" ${isPositive ? "" : "disabled"} />
        ${!isPositive ? `<div class="muted" style="margin-top:6px;">Applicable only to Positive observations.</div>` : ``}
      </div>

      <div class="pi-field pi-span2" style="grid-column: 1 / -1;">
        <label>Nature of concern</label>
        <input id="dlgNature" type="text" placeholder="e.g. Not as expected – procedure and/or document deficient." value="${esc(nocVal)}" />
      </div>

      <div class="pi-field pi-span2" style="grid-column: 1 / -1;">
        <label>Classification coding</label>
        <input id="dlgCoding" type="text" placeholder="e.g. 5.1.2.1.1 - Procedures may include..." value="${esc(codingVal)}" />
      </div>
    </div>

    <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Observation text (editable)</div>
    <textarea id="dlgObservationText" placeholder="Enter / edit the observation text here...">${esc(obsTextVal)}</textarea>

    ${pgnoHtml}

    ${isNegative ? `<div id="dlgMissingHint" class="hint" style="display:none;">Missing PGNO tick (Finalize will flag this).</div>` : ``}
  `;

  if (isNegative) {
    const hint = el("dlgMissingHint");
    const pg = Array.isArray(existing.pgno_selected) ? existing.pgno_selected : [];
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
  if (!state.activeReport) { alert("No active report."); return; }

  const qno = item.qno;
  const isNegative = item.kind === "negative";
  const isPositive = item.kind === "positive";

  const category = isPositive ? "Human" : normCategory(el("dlgCategory").value || "");
  const positive_rank = isPositive ? String(el("dlgPositiveRank").value || "").trim() : null;

  const nature_of_concern = String(el("dlgNature").value || "").trim();
  const classification_coding = String(el("dlgCoding").value || "").trim();
  const observation_text = String(el("dlgObservationText").value || "").trim();

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

    obs_type,
    question_base: qno,
    observation_text: observation_text || null,

    designation: category || null,
    positive_rank: positive_rank || null,
    nature_of_concern: nature_of_concern || null,
    classification_coding: classification_coding || null,

    remarks: observation_text || null,
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);
    state.observationsByQno[qno] = { ...(state.observationsByQno[qno] || {}), ...row };
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
// Build extracted list from DB
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

    const obsText = String(row.observation_text || row.remarks || "").trim();

    out.push({
      qno,
      kind,
      designation: normCategory(row.designation || (kind === "positive" ? "Human" : "")),
      positive_rank: String(row.positive_rank || "").trim() || null,
      nature_of_concern: String(row.nature_of_concern || "").trim() || null,
      classification_coding: String(row.classification_coding || "").trim() || null,
      text: obsText,
    });
  }

  out.sort((a, b) => String(a.qno).localeCompare(String(b.qno)));
  state.extractedItems = out;
}

// -------------------------
// Report selection + header actions
// -------------------------
async function setActiveReportById(id) {
  if (!id) {
    state.activeReport = null;
    state.observationsByQno = {};
    state.extractedItems = [];
    setActivePill("No active report");
    renderObsTable();
    setSaveStatus("Not saved");
    return;
  }

  const r = (state.reports || []).find(x => x.id === id) || null;
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

  buildExtractedItemsFromDb();
  renderObsTable();
  setSaveStatus("Loaded");
}

function handleNewReport() {
  state.activeReport = null;
  state.observationsByQno = {};
  state.extractedItems = [];
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
  el("reportTitle").value = "";
  el("inspectorName").value = "";
  el("inspectorCompany").value = "";
  el("pdfStatus").textContent = "No PDF linked";

  renderObsTable();
}

async function handleSaveHeader() {
  const payload = headerInputs();

  if (!payload.vessel_id) { alert("Please select a vessel first."); return; }
  if (!payload.inspection_date) { alert("Please set an inspection date."); return; }
  if (!payload.report_ref) { alert("Please enter report reference (unique)."); return; }
  if (!payload.title) { alert("Please select Title."); return; }

  setSaveStatus("Saving…");
  try {
    let saved;
    if (!state.activeReport) saved = await createReportHeader(payload);
    else saved = await updateReportHeader(state.activeReport.id, payload);

    state.reports = await loadReportsFromDb();
    refreshStoredDateFilters();
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
    refreshStoredDateFilters();
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
// Manual item
// -------------------------
async function addManualItem() {
  if (!state.activeReport) { alert("Load or create a report first."); return; }

  const qnoRaw = prompt("Enter Question No (e.g. 4.2.7). It must exist in the locked question library.");
  const qno = findLibraryQno(qnoRaw || "");
  if (!qno) { alert("Question number not found in locked library."); return; }

  const type = prompt("Type? Enter: negative / positive / largely", "negative");
  const kind = String(type || "").trim().toLowerCase();
  const kindNorm = (kind === "positive" || kind === "negative" || kind === "largely") ? kind : "negative";

  const observation_type =
    kindNorm === "negative" ? "negative_observation" :
    kindNorm === "positive" ? "positive_observation" :
    "note_improvement";

  const row = {
    report_id: state.activeReport.id,
    question_no: qno,
    has_observation: true,
    observation_type,
    obs_type: kindNorm === "positive" ? "positive" : (kindNorm === "negative" ? "negative" : "largly"),
    question_base: qno,
    pgno_selected: [],
    designation: kindNorm === "positive" ? "Human" : null,
    nature_of_concern: kindNorm === "positive" ? "Exceeded normal expectation." : (kindNorm === "negative" ? "Not as expected." : "Largely as expected."),
    observation_text: null,
    remarks: null,
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);
    state.observationsByQno = await loadObservationsForReport(state.activeReport.id);
    buildExtractedItemsFromDb();
    renderObsTable();

    const item = state.extractedItems.find(x => x.qno === qno);
    if (item) openObsDialog(item);

    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Failed to add manual item: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

// -------------------------
// PDF download
// -------------------------
async function downloadPdf() {
  if (!state.activeReport?.pdf_storage_path) { alert("No PDF linked for this report."); return; }
  try {
    const bucket = PDF_BUCKET_DEFAULT;
    const path = state.activeReport.pdf_storage_path;
    const { data, error } = await state.supabase.storage.from(bucket).createSignedUrl(path, 60 * 5);
    if (error) throw error;
    const url = data?.signedUrl;
    if (!url) throw new Error("No signed URL returned");
    window.open(url, "_blank");
  } catch (e) {
    console.error(e);
    alert("Download PDF failed: " + (e?.message || String(e)));
  }
}

// -------------------------
// KPI + finalize (simple)
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
async function waitForAuth(timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (window.AUTH && typeof window.AUTH.requireAuth === "function") return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

function wireStoredFilters() {
  const ids = [
    "siFilterVessel","siFilterYear","siFilterMonth","siFilterRef","siFilterTitle",
    "siFilterOcimf","siFilterInspector","siFilterInspectorCompany"
  ];
  ids.forEach(id => {
    const node = el(id);
    if (!node) return;
    node.addEventListener(node.tagName === "SELECT" ? "change" : "input", () => renderStoredInspections());
  });
}

async function init() {
  const ok = await waitForAuth(4000);
  if (!ok) throw new Error("AUTH not loaded. Ensure ./auth.js is included BEFORE ./post_inspection.js.");

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  try { el("buildPill").textContent = "build: post_inspection_stored_table_filters_2026-03-01"; } catch {}

  setSaveStatus("Loading…");

  state.vessels = await loadVessels();
  const vesselSelect = el("vesselSelect");
  vesselSelect.innerHTML = `<option value="">— Select vessel —</option>` + state.vessels.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join("");

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  state.libByNo = new Map();
  for (const q of state.lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  state.reports = await loadReportsFromDb();
  refreshStoredDateFilters();
  wireStoredFilters();
  renderStoredInspections();

  // Default date
  if (!el("inspectionDate").value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  el("downloadPdfBtn")?.addEventListener("click", downloadPdf);

  el("addManualBtn").addEventListener("click", addManualItem);

  el("statsBtn").addEventListener("click", renderKpis);
  el("finalizeBtn").addEventListener("click", finalizeCheck);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());

  el("kpiDashBtn")?.addEventListener("click", () => { window.location.href = "post_inspection_kpi_dashboard.html"; });

  el("obsSearch").addEventListener("input", renderObsTable);
  el("obsTypeFilter").addEventListener("change", renderObsTable);
  el("obsCategoryFilter").addEventListener("change", renderObsTable);
  el("onlyMissingPgno").addEventListener("change", renderObsTable);

  el("dlgCancelBtn").addEventListener("click", closeObsDialog);
  el("dlgSaveBtn").addEventListener("click", saveObsDialog);

  el("dashboardBtn")?.addEventListener("click", () => { window.location.href = "dashboard.html"; });
  el("modeSelectBtn")?.addEventListener("click", () => { window.location.href = "mode_selection.html"; });

  // Load most recent report, if any
  if (state.reports.length) {
    await setActiveReportById(state.reports[0].id);
  } else {
    await setActiveReportById(null);
    if (state.vessels.length) el("vesselSelect").value = state.vessels[0].id;
  }

  renderObsTable();
  setSaveStatus(state.activeReport ? "Loaded" : "Not saved");
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