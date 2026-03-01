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

function isoToYyyyMm(isoDate) {
  const s = String(isoDate || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}`;
}

function isoToYear(isoDate) {
  const s = String(isoDate || "").trim();
  const m = s.match(/^(\d{4})-/);
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
  lib: [],
  libByNo: new Map(),

  reports: [],            // full list from DB
  reportsFiltered: [],    // filtered list (browser)
  activeReport: null,

  observationsByQno: {},
  extractedItems: [],

  dialogItem: null,

  reportFilters: {
    vessel_ids: new Set(),
    years: new Set(),
    months: new Set(),
    ocimf: new Set(),
    inspector_names: new Set(),
    inspector_companies: new Set(),
  }
};

function setSaveStatus(text) { el("saveStatus").textContent = text || "Not saved"; }
function setActivePill(text) { el("activeReportPill").textContent = text || "No active report"; }

function reportLabel(r) {
  const v = r.vessel_name || "Unknown vessel";
  const d = r.inspection_date || "No date";
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
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, inspector_name, inspector_company, created_at, updated_at")
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

async function createReportHeader({ vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, inspector_name, inspector_company }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([{
      vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company,
      report_ref, title, pdf_storage_path,
      inspector_name, inspector_company
    }])
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, inspector_name, inspector_company, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, { vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, inspector_name, inspector_company }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update({
      vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company,
      report_ref, title, pdf_storage_path,
      inspector_name, inspector_company
    })
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, inspector_name, inspector_company, created_at, updated_at")
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
// Header inputs & loading
// -------------------------
function headerInputs() {
  return {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    inspection_date: String(el("inspectionDate").value || "").trim(),
    port_name: String(el("portName").value || "").trim(),
    port_code: String(el("portCode").value || "").trim(),
    ocimf_inspecting_company: String(el("ocimfCompany").value || "").trim(),
    report_ref: String(el("reportRef").value || "").trim(),
    title: String(el("reportTitleSelect").value || "").trim(),
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
  el("reportTitleSelect").value = r.title || "";
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
// Rendering: extracted items table
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
  const designationFilter = String(el("obsDesignationFilter").value || "").trim();
  const onlyMissing = !!el("onlyMissingPgno").checked;

  return (items || []).filter(it => {
    if (type && it.kind !== type) return false;

    if (designationFilter) {
      const d = String(it.designation || "").trim();
      if (designationFilter !== d) return false;
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
        it.text || ""
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
    const pg = state.observationsByQno[it.qno]?.pgno_selected || [];
    const pgTxt = (Array.isArray(pg) && pg.length)
      ? `PGNO ${pg.map(x => x.idx).join(", ")}`
      : (it.kind === "negative" ? `<span class="muted">—</span>` : `<span class="muted">n/a</span>`);

    const designationDisplay = it.kind === "positive"
      ? (it.positive_rank ? `Human (${it.positive_rank})` : "Human")
      : (it.designation || "—");

    return `
      <tr class="obs-row" data-qno="${esc(it.qno)}">
        <td>${esc(it.qno)}</td>
        <td>${obsRowTypeLabel(it)}</td>
        <td class="muted">${esc(designationDisplay)}</td>
        <td>${esc(it.nature_of_concern || "")}</td>
        <td class="muted">${esc(it.classification_coding || "")}</td>
        <td>${esc(it.text || "")}</td>
        <td>${pgTxt}</td>
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
// Modal editor
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
  const remarksVal = String(existing?.remarks || item.text || "");

  const isNegative = item.kind === "negative";
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
                  <div style="font-weight:950; color:#143a63;">PGNO ${idx}</div>
                  <div style="font-weight:850; color:#0c1b2a;">${esc(txt)}</div>
                </div>
              `;
            }).join("")}
          </div>
        `
        : `<div class="hint">No PGNO bullets found in your locked library JSON for this question.</div>`
    );

  const designationDisplay = item.kind === "positive"
    ? (item.positive_rank ? `Human (${item.positive_rank})` : "Human")
    : (item.designation || "—");

  el("dlgBody").innerHTML = `
    <div style="font-weight:900; color:#143a63; margin-bottom:10px;">Question</div>
    <div style="font-weight:850; color:#0c1b2a; line-height:1.35; margin-bottom:12px;">${esc(qText)}</div>

    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
      <div style="flex:1 1 240px;">
        <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Category</div>
        <div style="font-weight:850; background:#f8fbff; border:1px solid #e5eefc; padding:10px 12px; border-radius:14px;">
          ${esc(designationDisplay)}
        </div>
      </div>
      <div style="flex:2 1 520px;">
        <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Nature of concern</div>
        <div style="font-weight:850; background:#f8fbff; border:1px solid #e5eefc; padding:10px 12px; border-radius:14px;">
          ${esc(item.nature_of_concern || "")}
        </div>
      </div>
    </div>

    ${(item.classification_coding || "").trim() ? `
      <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Classification coding</div>
      <div style="font-weight:850; background:#f8fbff; border:1px solid #e5eefc; padding:10px 12px; border-radius:14px; margin-bottom:10px;">
        ${esc(item.classification_coding)}
      </div>
    ` : ``}

    <div style="font-weight:900; color:#143a63; margin-bottom:6px;">Observation text</div>
    <div style="font-weight:850; background:#f8fbff; border:1px solid #e5eefc; padding:10px 12px; border-radius:14px; line-height:1.35;">
      ${esc(item.text || "")}
    </div>

    ${pgnoHtml}

    <div style="font-weight:950; color:#143a63; margin-top:12px;">Remarks (stored)</div>
    <textarea id="dlgRemarks" placeholder="Edit / paste final wording here...">${esc(remarksVal)}</textarea>

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
  const remarks = String(el("dlgRemarks").value || "").trim();

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
    remarks: remarks || null,

    obs_type,
    question_base: qno,

    observation_text: String(item.text || "").trim() || null,

    designation: String(item.designation || "").trim() || (item.kind === "positive" ? "Human" : null),
    positive_rank: String(item.positive_rank || "").trim() || null,
    nature_of_concern: String(item.nature_of_concern || "").trim() || null,
    classification_coding: String(item.classification_coding || "").trim() || null,

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

function renderReportSelect() {
  const sel = el("reportSelect");
  const list = state.reportsFiltered?.length ? state.reportsFiltered : state.reports;

  sel.innerHTML = `<option value="">— Select report —</option>`;
  for (const r of list) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = reportLabel(r);
    sel.appendChild(o);
  }
  sel.value = state.activeReport?.id || "";
}

async function setActiveReportById(id) {
  if (!id) {
    state.activeReport = null;
    state.observationsByQno = {};
    state.extractedItems = [];
    renderReportSelect();
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
  renderReportSelect();
  renderObsTable();
  setSaveStatus("Loaded");
}

function handleNewReport() {
  state.activeReport = null;
  state.observationsByQno = {};
  state.extractedItems = [];
  renderReportSelect();
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
  el("reportTitleSelect").value = "";
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
  if (!payload.title) { alert("Please select Title (mandatory)."); return; }

  setSaveStatus("Saving…");
  try {
    let saved;
    if (!state.activeReport) {
      saved = await createReportHeader(payload);
    } else {
      saved = await updateReportHeader(state.activeReport.id, payload);
    }

    state.reports = await loadReportsFromDb();
    state.reportsFiltered = [];
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
    await setActiveReportById(state.reports[0]?.id || null);
    setSaveStatus("Deleted");
  } catch (e) {
    console.error(e);
    alert("Delete failed: " + (e?.message || String(e)));
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

    out.push({
      qno,
      kind,

      designation: String(row.designation || "").trim() || (kind === "positive" ? "Human" : null),
      positive_rank: String(row.positive_rank || "").trim() || null,
      nature_of_concern: String(row.nature_of_concern || "").trim() || null,
      classification_coding: String(row.classification_coding || "").trim() || null,

      text: String(row.observation_text || "").trim(),
    });
  }

  out.sort((a, b) => String(a.qno).localeCompare(String(b.qno)));
  state.extractedItems = out;
}

// -------------------------
// PDF download helper
// -------------------------
async function downloadActivePdf() {
  if (!state.activeReport?.pdf_storage_path) {
    alert("No PDF linked.");
    return;
  }
  const path = state.activeReport.pdf_storage_path;
  const { data, error } = await state.supabase.storage.from(PDF_BUCKET_DEFAULT).download(path);
  if (error || !data) throw error || new Error("Download failed.");
  const blob = data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = path.split("/").pop() || "inspection.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// -------------------------
// Manual add
// -------------------------
async function addManualItem() {
  if (!state.activeReport) {
    alert("Save Header first (create an inspection), then add manual items.");
    return;
  }

  const qnoRaw = prompt("Enter question number (e.g. 4.2.7):");
  if (!qnoRaw) return;
  const qno = findLibraryQno(qnoRaw.trim()) || qnoRaw.trim();

  const kind = prompt('Type: enter "negative" or "positive" or "largely":', "negative");
  if (!kind) return;
  const kindLc = kind.trim().toLowerCase();
  const allowed = new Set(["negative","positive","largely"]);
  if (!allowed.has(kindLc)) {
    alert("Invalid type. Use negative / positive / largely.");
    return;
  }

  const designation = kindLc === "positive" ? "Human" : (prompt('Category: Human / Process / Hardware / Photo:', "Human") || "Human").trim();
  const nature = prompt('Nature of concern (e.g. "Not as expected." / "Largely as expected." / "Exceeded normal expectation."):', "") || "";
  const coding = prompt("Classification coding (optional):", "") || "";
  const text = prompt("Observation text:", "") || "";

  const observation_type =
    kindLc === "negative" ? "negative_observation" :
    kindLc === "positive" ? "positive_observation" :
    "note_improvement";

  const row = {
    report_id: state.activeReport.id,
    question_no: qno,
    has_observation: true,
    observation_type,
    obs_type: kindLc,
    question_base: qno,
    observation_text: text.trim() || null,
    remarks: text.trim() || null,
    pgno_selected: [],
    designation: designation || null,
    nature_of_concern: nature || null,
    classification_coding: coding || null,
    positive_rank: null,
    updated_at: nowIso(),
  };

  setSaveStatus("Saving…");
  try {
    await upsertObservationRow(row);
    state.observationsByQno = await loadObservationsForReport(state.activeReport.id);
    buildExtractedItemsFromDb();
    renderObsTable();
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Manual add failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

// -------------------------
// Reports Browser (filters + list)
// -------------------------
function uniqSorted(arr) {
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b) => String(a).localeCompare(String(b)));
}

function renderRbBox(containerId, options, selectedSet, labelFn = (x)=>x) {
  const box = el(containerId);
  box.innerHTML = "";
  for (const opt of options) {
    const id = `${containerId}_${String(opt).replace(/[^a-zA-Z0-9]+/g,"_")}`;
    const checked = selectedSet.has(opt) ? "checked" : "";
    const div = document.createElement("div");
    div.className = "rb-opt";
    div.innerHTML = `<input type="checkbox" id="${esc(id)}" data-val="${esc(opt)}" ${checked}/>
                     <label for="${esc(id)}" style="cursor:pointer; font-weight:850; color:#0c1b2a;">${esc(labelFn(opt))}</label>`;
    box.appendChild(div);
  }
}

function readRbSelections(containerId) {
  const box = el(containerId);
  const set = new Set();
  box.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    if (chk.checked) set.add(chk.getAttribute("data-val") || "");
  });
  return set;
}

function applyReportFilters() {
  const f = state.reportFilters;
  const out = (state.reports || []).filter(r => {
    // Vessel
    if (f.vessel_ids.size) {
      if (!f.vessel_ids.has(String(r.vessel_id || ""))) return false;
    }
    // Year
    if (f.years.size) {
      const y = isoToYear(r.inspection_date);
      if (!f.years.has(y)) return false;
    }
    // Month
    if (f.months.size) {
      const m = isoToYyyyMm(r.inspection_date);
      if (!f.months.has(m)) return false;
    }
    // OCIMF company
    if (f.ocimf.size) {
      const v = String(r.ocimf_inspecting_company || "");
      if (!f.ocimf.has(v)) return false;
    }
    // Inspector name
    if (f.inspector_names.size) {
      const v = String(r.inspector_name || "");
      if (!f.inspector_names.has(v)) return false;
    }
    // Inspector company
    if (f.inspector_companies.size) {
      const v = String(r.inspector_company || "");
      if (!f.inspector_companies.has(v)) return false;
    }
    return true;
  });

  state.reportsFiltered = out;
}

function renderReportsBrowserList() {
  const tbody = el("rbTableBody");
  const list = state.reportsFiltered?.length ? state.reportsFiltered : state.reports;

  if (!list?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">No reports match current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => `
    <tr class="obs-row" data-report-id="${esc(r.id)}">
      <td>${esc(r.inspection_date || "")}</td>
      <td>${esc(r.vessel_name || "")}</td>
      <td>${esc(r.ocimf_inspecting_company || "")}</td>
      <td>${esc(r.inspector_name || "")}</td>
      <td>${esc(r.inspector_company || "")}</td>
      <td>${esc(r.report_ref || "")}</td>
      <td>${esc(r.title || "")}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr.obs-row").forEach(tr => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-report-id");
      if (!id) return;
      el("reportsDialog").close();
      el("reportSelect").value = id;
      await setActiveReportById(id);
    });
  });
}

function openReportsDialog() {
  // Build options from reports
  const vessels = uniqSorted((state.reports||[]).map(r => String(r.vessel_id||"")));
  const vesselLabel = (vid) => {
    const hit = state.vessels.find(v => v.id === vid);
    return hit ? hit.name : vid;
  };

  const years = uniqSorted((state.reports||[]).map(r => isoToYear(r.inspection_date)));
  const months = uniqSorted((state.reports||[]).map(r => isoToYyyyMm(r.inspection_date)));

  const ocimf = uniqSorted((state.reports||[]).map(r => String(r.ocimf_inspecting_company||"")));
  const inspNames = uniqSorted((state.reports||[]).map(r => String(r.inspector_name||"")));
  const inspCos = uniqSorted((state.reports||[]).map(r => String(r.inspector_company||"")));

  renderRbBox("rbVessels", vessels, state.reportFilters.vessel_ids, vesselLabel);
  renderRbBox("rbYears", years, state.reportFilters.years);
  renderRbBox("rbMonths", months, state.reportFilters.months);
  renderRbBox("rbOcimf", ocimf, state.reportFilters.ocimf);
  renderRbBox("rbInspectorNames", inspNames, state.reportFilters.inspector_names);
  renderRbBox("rbInspectorCompanies", inspCos, state.reportFilters.inspector_companies);

  applyReportFilters();
  renderReportsBrowserList();

  el("reportsDialog").showModal();
}

function clearReportsFilters() {
  state.reportFilters.vessel_ids = new Set();
  state.reportFilters.years = new Set();
  state.reportFilters.months = new Set();
  state.reportFilters.ocimf = new Set();
  state.reportFilters.inspector_names = new Set();
  state.reportFilters.inspector_companies = new Set();
  state.reportsFiltered = [];
}

// -------------------------
// PDF AI import
// -------------------------
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

  const title = String(el("reportTitleSelect").value || "").trim();
  if (!title) {
    throw new Error("Title is mandatory. Select Title first, then import PDF.");
  }

  const headerPayload = {
    vessel_id: vesselHit.id,
    inspection_date: isoDate,
    port_name: String(h.port_name || "").trim() || null,
    port_code: String(h.port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || "").trim() || null,
    report_ref,
    title,
    pdf_storage_path: tempPath,
    inspector_name: String(el("inspectorName").value || "").trim() || null,
    inspector_company: String(el("inspectorCompany").value || "").trim() || null,
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
  state.reportsFiltered = [];
  await setActiveReportById(report.id);

  el("pdfStatus").textContent = `Stored: ${tempPath.split("/").pop()}`;

  const obs = Array.isArray(extracted?.observations) ? extracted.observations : [];
  setSaveStatus(`Saving ${obs.length} item(s)…`);

  let saved = 0;
  let libraryMissing = 0;
  let errors = 0;

  for (const item of obs) {
    try {
      const qbase = String(item?.question_base || "").trim();
      const qno = findLibraryQno(qbase);
      if (!qno) { libraryMissing++; continue; }

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

      await upsertObservationRow(row);
      saved++;
    } catch (e) {
      console.error(e);
      errors++;
    }
  }

  state.observationsByQno = await loadObservationsForReport(report.id);
  buildExtractedItemsFromDb();
  renderObsTable();

  setSaveStatus(`AI import done (saved ${saved}, library-missing ${libraryMissing}, errors ${errors})`);
}

// -------------------------
// Export / Import JSON (basic)
// -------------------------
async function exportJson() {
  if (!state.activeReport) { alert("No active report."); return; }
  const report = state.activeReport;
  const observations = Object.values(state.observationsByQno || {});
  const payload = { report, observations };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `post_inspection_${report.report_ref || report.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importJsonFile(file) {
  if (!file) return;
  const text = await file.text();
  const obj = JSON.parse(text);

  const report = obj?.report;
  const observations = Array.isArray(obj?.observations) ? obj.observations : [];
  if (!report?.report_ref) throw new Error("Invalid JSON: missing report.report_ref");

  // Require Title because you want mandatory
  if (!report?.title) throw new Error("Invalid JSON: missing report.title (Title is mandatory).");

  // create or update report by report_ref
  const { data: existingRep, error: findErr } = await state.supabase
    .from("post_inspection_reports")
    .select("id")
    .eq("report_ref", report.report_ref)
    .maybeSingle();
  if (findErr) throw findErr;

  const headerPayload = {
    vessel_id: report.vessel_id,
    inspection_date: report.inspection_date,
    port_name: report.port_name,
    port_code: report.port_code,
    ocimf_inspecting_company: report.ocimf_inspecting_company,
    report_ref: report.report_ref,
    title: report.title,
    pdf_storage_path: report.pdf_storage_path,
    inspector_name: report.inspector_name || null,
    inspector_company: report.inspector_company || null,
  };

  let savedReport;
  if (existingRep?.id) savedReport = await updateReportHeader(existingRep.id, headerPayload);
  else savedReport = await createReportHeader(headerPayload);

  // upsert observations
  for (const row of observations) {
    if (!row?.question_no) continue;
    await upsertObservationRow({
      ...row,
      report_id: savedReport.id,
      updated_at: nowIso(),
    });
  }

  state.reports = await loadReportsFromDb();
  await setActiveReportById(savedReport.id);
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

async function init() {
  const ok = await waitForAuth(4000);
  if (!ok) {
    throw new Error("AUTH not loaded. Ensure ./auth.js is included BEFORE ./post_inspection.js.");
  }

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  try { el("buildPill").textContent = "build: post_inspection_reports_browser_titles_inspector_company_2026-03-01"; } catch {}

  setSaveStatus("Loading…");

  state.vessels = await loadVessels();
  renderVesselsSelect();

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  state.libByNo = new Map();
  for (const q of state.lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  state.reports = await loadReportsFromDb();
  state.reportsFiltered = [];
  renderReportSelect();

  if (!el("inspectionDate").value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  el("reportSelect").addEventListener("change", async () => {
    await setActiveReportById(el("reportSelect").value || null);
  });

  el("browseReportsBtn").addEventListener("click", openReportsDialog);
  el("rbCloseBtn").addEventListener("click", () => el("reportsDialog").close());
  el("rbClearBtn").addEventListener("click", () => {
    clearReportsFilters();
    openReportsDialog();
  });
  el("rbApplyBtn").addEventListener("click", () => {
    // read selections
    state.reportFilters.vessel_ids = readRbSelections("rbVessels");
    state.reportFilters.years = readRbSelections("rbYears");
    state.reportFilters.months = readRbSelections("rbMonths");
    state.reportFilters.ocimf = readRbSelections("rbOcimf");
    state.reportFilters.inspector_names = readRbSelections("rbInspectorNames");
    state.reportFilters.inspector_companies = readRbSelections("rbInspectorCompanies");

    applyReportFilters();
    renderReportsBrowserList();
    renderReportSelect();
  });

  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  el("downloadPdfBtn").addEventListener("click", async () => {
    try { await downloadActivePdf(); } catch (e) { alert("PDF download failed: " + (e?.message || String(e))); }
  });

  el("exportBtn").addEventListener("click", exportJson);
  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try { if (f) await importJsonFile(f); }
    catch (err) { alert("Import failed: " + (err?.message || String(err))); }
    finally { e.target.value = ""; }
  });

  el("importPdfBtn").addEventListener("click", () => el("importPdfFile").click());
  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importReportPdfAiFromFile(f);
    } finally {
      e.target.value = "";
    }
  });

  el("addManualBtn").addEventListener("click", addManualItem);

  el("statsBtn").addEventListener("click", renderKpis);
  el("finalizeBtn").addEventListener("click", finalizeCheck);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());

  el("obsSearch").addEventListener("input", renderObsTable);
  el("obsTypeFilter").addEventListener("change", renderObsTable);
  el("obsDesignationFilter").addEventListener("change", renderObsTable);
  el("onlyMissingPgno").addEventListener("change", renderObsTable);

  el("dlgCancelBtn").addEventListener("click", closeObsDialog);
  el("dlgSaveBtn").addEventListener("click", saveObsDialog);

  el("dashboardBtn")?.addEventListener("click", () => { window.location.href = "dashboard.html"; });
  el("modeSelectBtn")?.addEventListener("click", () => { window.location.href = "mode_selection.html"; });

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