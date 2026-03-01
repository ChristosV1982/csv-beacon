import { loadLockedLibraryJson } from "./question_library_loader.js";

/**
 * HARD BUILD STAMP (you can see it on the UI + console)
 */
const POST_INSPECTION_BUILD = "post_inspection_ui_category_filter_build_2026-03-01_v5_fix_largely_save";

/**
 * Locked library JSON
 */
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

/**
 * Storage
 */
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

function normalizeQnoParts(qno, pad2) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (parts.length < 2) return String(qno || "").trim();
  const norm = parts.map(p => {
    const n = p.replace(/^0+/, "") || "0";
    return pad2 ? n.padStart(2, "0") : String(Number(n));
  });
  return norm.join(".");
}

/**
 * Canonicalize a qno by stripping leading zeros per segment and joining as numbers.
 * Examples:
 *  - "04.03.02" -> "4.3.2"
 *  - "4.03.02"  -> "4.3.2"
 *  - "4.3.2"    -> "4.3.2"
 */
function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  const canon = parts.map(p => {
    const n = String(p).replace(/^0+/, "") || "0";
    return String(Number(n));
  });
  return canon.join(".");
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

const state = {
  me: null,
  supabase: null,

  vessels: [],
  lib: [],
  libByNo: new Map(),          // exact key -> question object
  libCanonToExact: new Map(),  // canonical -> exact key (first match)

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
  const d = r.inspection_date || "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${v} | ${d}${ref}`;
}

/**
 * Find qno in library, robust to leading zeros and variants.
 * Returns the *exact key* used in state.libByNo.
 */
function findLibraryQno(qbase) {
  const raw = String(qbase || "").trim();
  if (!raw) return null;

  if (state.libByNo.has(raw)) return raw;

  const padded = normalizeQnoParts(raw, true);
  if (state.libByNo.has(padded)) return padded;

  const nonPadded = normalizeQnoParts(raw, false);
  if (state.libByNo.has(nonPadded)) return nonPadded;

  const canon = canonicalQno(raw);
  if (canon && state.libCanonToExact.has(canon)) return state.libCanonToExact.get(canon);

  const canonP = canonicalQno(padded);
  if (canonP && state.libCanonToExact.has(canonP)) return state.libCanonToExact.get(canonP);

  const canonN = canonicalQno(nonPadded);
  if (canonN && state.libCanonToExact.has(canonN)) return state.libCanonToExact.get(canonN);

  return null;
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
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, created_at, updated_at")
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

async function createReportHeader({ vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([{ vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path }])
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, { vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update({ vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path })
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, pdf_storage_path, created_at, updated_at")
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
    title: String(el("reportTitle").value || "").trim(),
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
      const d = normDesignation(it.designation);
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
      : (normDesignation(it.designation) || "—");

    return `
      <tr class="obs-row" data-qno="${esc(it.qno)}">
        <td><b>${esc(it.qno)}</b></td>
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
  const qText = q ? getQText(q) : "(Question text not found in locked library JSON for this question.)";
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
    : (normDesignation(item.designation) || "—");

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

  // IMPORTANT FIX: obs_type should be ONLY "positive" or "negative" (or null).
  // We store largely as expected as obs_type = null.
  const obs_type =
    item.kind === "negative" ? "negative" :
    item.kind === "positive" ? "positive" :
    null;

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

    designation: normDesignation(item.designation) || (item.kind === "positive" ? "Human" : null),
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
  sel.innerHTML = `<option value="">— Select report —</option>`;
  for (const r of state.reports) {
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
  el("reportTitle").value = "";
  el("pdfStatus").textContent = "No PDF linked";

  renderObsTable();
}

async function handleSaveHeader() {
  const payload = headerInputs();

  if (!payload.vessel_id) { alert("Please select a vessel first."); return; }
  if (!payload.inspection_date) { alert("Please set an inspection date."); return; }
  if (!payload.report_ref) { alert("Please enter report reference (unique)."); return; }

  setSaveStatus("Saving…");
  try {
    let saved;
    if (!state.activeReport) {
      saved = await createReportHeader(payload);
    } else {
      saved = await updateReportHeader(state.activeReport.id, payload);
    }

    state.reports = await loadReportsFromDb();
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

      designation: normDesignation(row.designation) || (kind === "positive" ? "Human" : ""),
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
  const functionVersion = String(data?.function_version || "").trim();

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

  const headerPayload = {
    vessel_id: vesselHit.id,
    inspection_date: isoDate,
    port_name: String(h.port_name || "").trim() || null,
    port_code: String(h.port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || "").trim() || null,
    report_ref,
    title: String(el("reportTitle").value || "").trim() || null,
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
  await setActiveReportById(report.id);

  el("vesselSelect").value = headerPayload.vessel_id;
  el("inspectionDate").value = headerPayload.inspection_date;
  el("portName").value = headerPayload.port_name || "";
  el("portCode").value = headerPayload.port_code || "";
  el("ocimfCompany").value = headerPayload.ocimf_inspecting_company || "";
  el("reportRef").value = headerPayload.report_ref || "";
  el("pdfStatus").textContent = `Stored: ${tempPath.split("/").pop()}`;

  const obs = Array.isArray(extracted?.observations) ? extracted.observations : [];
  const libraryMissing = [];
  const errors = [];
  let savedCount = 0;

  setSaveStatus(`Saving ${obs.length} item(s)…`);

  for (const item of obs) {
    try {
      const qbaseRaw = String(item?.question_base || "").trim();
      const qcanon = canonicalQno(qbaseRaw) || qbaseRaw || "";
      if (!qcanon) {
        errors.push({ qbase: qbaseRaw, reason: "Missing question_base from extractor" });
        continue;
      }

      const qnoExact = findLibraryQno(qbaseRaw);
      const qnoToUse = qnoExact || qcanon;

      if (!qnoExact) {
        libraryMissing.push({ qbase: qbaseRaw, used: qnoToUse });
      }

      const kind = String(item?.obs_type || "").toLowerCase();
      const observation_text = String(item?.observation_text || "").trim();

      const observation_type =
        kind === "negative" ? "negative_observation" :
        kind === "positive" ? "positive_observation" :
        "note_improvement";

      // IMPORTANT FIX: do NOT store obs_type="largely"
      const obs_type =
        kind === "negative" ? "negative" :
        kind === "positive" ? "positive" :
        null;

      const row = {
        report_id: report.id,
        question_no: qnoToUse,
        has_observation: true,
        observation_type,
        obs_type,
        question_base: qcanon,

        observation_text: observation_text || null,
        pgno_selected: [],
        remarks: observation_text || null,

        designation: normDesignation(item?.designation) || (kind === "positive" ? "Human" : null),
        positive_rank: String(item?.positive_rank || "").trim() || null,
        nature_of_concern: String(item?.nature_of_concern || "").trim() || null,
        classification_coding: String(item?.classification_coding || "").trim() || null,

        updated_at: nowIso(),
      };

      await upsertObservationRow(row);
      savedCount++;
    } catch (e) {
      errors.push({ qbase: String(item?.question_base || ""), reason: (e?.message || String(e)) });
    }
  }

  state.observationsByQno = await loadObservationsForReport(report.id);
  buildExtractedItemsFromDb();
  renderObsTable();

  const libTxt = libraryMissing.length ? `, library-missing ${libraryMissing.length}` : ", library-missing 0";
  const errTxt = errors.length ? `, errors ${errors.length}` : ", errors 0";
  setSaveStatus(`AI import done (saved ${savedCount}${libTxt}${errTxt})`);

  console.log("[Post-Inspection] BUILD:", POST_INSPECTION_BUILD);
  console.log("[Post-Inspection] Edge function_version:", functionVersion);
  if (libraryMissing.length) console.warn("[Post-Inspection] Library-missing items (still saved):", libraryMissing);
  if (errors.length) console.error("[Post-Inspection] Save errors (FULL):", errors);
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
  window.__POST_INSPECTION_BUILD = POST_INSPECTION_BUILD;

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

  el("buildPill").textContent = `build: ${POST_INSPECTION_BUILD}`;
  console.log("[Post-Inspection] Loaded build:", POST_INSPECTION_BUILD);

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
    if (canon && !state.libCanonToExact.has(canon)) {
      state.libCanonToExact.set(canon, qno);
    }
  }

  state.reports = await loadReportsFromDb();
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

  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  el("importPdfBtn").addEventListener("click", () => el("importPdfFile").click());
  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importReportPdfAiFromFile(f);
    } finally {
      e.target.value = "";
    }
  });

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