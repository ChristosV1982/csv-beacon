// public/post_inspection.js
import { loadLockedLibraryJson } from "./question_library_loader.js";

const POST_INSPECTION_BUILD = "post_inspection_fixed_2026-02-25";

// IMPORTANT: must match your bucket name
const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";

// Locked library JSON
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const OBS_TYPES = [
  { value: "negative_observation", label: "Negative observation" },
  { value: "positive_observation", label: "Positive observation" },
  { value: "observation_comment", label: "Observation / comment" },
  { value: "note_improvement", label: "Note / improvement" },
  { value: "best_practice", label: "Best practice" },
  { value: "office_finding", label: "Office finding" },
  { value: "other", label: "Other" },
];

function log(...a){ console.log("[Post-Inspection]", ...a); }
function nowIso(){ return new Date().toISOString(); }

function mustEl(id){
  const n = document.getElementById(id);
  if (!n) throw new Error(`Missing element #${id} in post_inspection.html`);
  return n;
}
function el(id){ return document.getElementById(id); }

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

function findLibraryQno(qbase, libByNo) {
  const raw = String(qbase || "").trim();
  if (!raw) return null;
  if (libByNo.has(raw)) return raw;

  const padded = normalizeQnoParts(raw, true);
  if (libByNo.has(padded)) return padded;

  const nonPadded = normalizeQnoParts(raw, false);
  if (libByNo.has(nonPadded)) return nonPadded;

  for (const candidate of [raw, padded, nonPadded]) {
    const alt = candidate.split(".").map(p => p.replace(/^0+/, "") || "0").join(".");
    if (libByNo.has(alt)) return alt;
  }
  return null;
}

const state = {
  me: null,
  supabase: null,

  vessels: [],
  lib: [],
  libByNo: new Map(),
  chapters: [],

  reports: [],
  activeReport: null,
  observations: {},

  selectedQno: null,

  // batching
  flushTimer: null,
  pendingUpserts: new Map(),
  pendingDeletes: new Set(),

  // UI
  extracting: false,
};

function setSaveStatus(t){
  mustEl("saveStatus").textContent = t || "Not saved";
}
function setActivePill(t){
  mustEl("activeReportPill").textContent = t || "No active report";
}
function setBuildPill(){
  const b = el("buildPill");
  if (b) b.textContent = `build: ${POST_INSPECTION_BUILD}`;
}
function setExtracting(on){
  state.extracting = !!on;
  const s = mustEl("saveStatus");
  if (on) s.textContent = "Extracting via AI…";
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
function getChap(q) {
  return String(pick(q, ["Chap", "chapter", "Chapter"])).trim();
}
function getSection(q) {
  return String(pick(q, ["Section Name", "Sect", "section", "Section"])).trim();
}
function getShort(q) {
  return String(pick(q, ["Short Text", "short_text", "ShortText"])).trim();
}
function getQText(q) {
  return String(pick(q, ["Question", "question"])).trim();
}
function getRisk(q) {
  return String(pick(q, ["Risk Level", "risk", "Risk"])).trim();
}
function getType(q) {
  return String(pick(q, ["Question Type", "question_type", "Type"])).trim();
}

function getPgnoBullets(q) {
  const bullets = Array.isArray(q?.NegObs_Bullets) ? q.NegObs_Bullets : null;
  if (bullets && bullets.length) return bullets.map(t => String(t||"").trim()).filter(Boolean);

  const pgTxt = String(q?.["Potential Grounds for Negative Observations"] || "").trim();
  if (!pgTxt) return [];
  const lines = pgTxt.split("\n").map(s => s.trim()).filter(Boolean);
  const usable = lines.filter(s => s.length > 6);
  return usable.slice(0, 80);
}

function reportLabel(r) {
  const v = r.vessel_name || "Unknown vessel";
  const d = r.inspection_date || "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${v} | ${d}${ref}`;
}

function isMissingPgno(row) {
  if (!row || !row.has_observation) return false;
  const arr = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
  return arr.length === 0;
}

function getObservedQnos() {
  const obs = state.observations || {};
  return Object.keys(obs).filter(qno => obs[qno]?.has_observation);
}
function getMissingPgnoQnos() {
  const obs = state.observations || {};
  return Object.keys(obs).filter(qno => isMissingPgno(obs[qno]));
}

// -------------------------
// Supabase access
// -------------------------
async function loadVessels() {
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active, imo_number")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadReportsFromDb() {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title, pdf_bucket, pdf_path, pdf_filename, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const rows = data || [];
  const vesselIds = [...new Set(rows.map(r => r.vessel_id).filter(Boolean))];
  if (!vesselIds.length) return rows.map(r => ({ ...r, vessel_name: "" }));

  const { data: vessels, error: vErr } = await state.supabase
    .from("vessels")
    .select("id, name")
    .in("id", vesselIds);
  if (vErr) return rows.map(r => ({ ...r, vessel_name: "" }));

  const map = new Map((vessels || []).map(v => [v.id, v.name]));
  return rows.map(r => ({ ...r, vessel_name: map.get(r.vessel_id) || "" }));
}

async function loadObservationsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .select("report_id, question_no, has_observation, observation_type, pgno_selected, remarks, updated_at")
    .eq("report_id", reportId);
  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    const pg = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
    map[row.question_no] = { ...row, pgno_selected: pg };
  }
  return map;
}

async function createReportHeader({ vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title }) {
  const payload = {
    vessel_id,
    inspection_date,
    port_name,
    port_code,
    ocimf_company,
    inspector_name,
    report_ref: report_ref || null,
    title: title || null,
  };

  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([payload])
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title, pdf_bucket, pdf_path, pdf_filename, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, fields) {
  const payload = {
    vessel_id: fields.vessel_id,
    inspection_date: fields.inspection_date,
    port_name: fields.port_name || null,
    port_code: fields.port_code || null,
    ocimf_company: fields.ocimf_company || null,
    inspector_name: fields.inspector_name || null,
    report_ref: fields.report_ref || null,
    title: fields.title || null,
  };

  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update(payload)
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title, pdf_bucket, pdf_path, pdf_filename, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateReportPdfFields(reportId, { pdf_bucket, pdf_path, pdf_filename }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update({ pdf_bucket, pdf_path, pdf_filename })
    .eq("id", reportId)
    .select("id, pdf_bucket, pdf_path, pdf_filename")
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

// -------------------------
// UI helpers
// -------------------------
function renderVesselsSelect() {
  const sel = mustEl("vesselSelect");
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Select vessel —";
  sel.appendChild(opt0);

  for (const v of state.vessels) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function renderChapterFilter() {
  const sel = mustEl("chapterFilter");
  sel.innerHTML = "";

  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "All chapters";
  sel.appendChild(o0);

  for (const ch of state.chapters) {
    const o = document.createElement("option");
    o.value = ch;
    o.textContent = `Chapter ${ch}`;
    sel.appendChild(o);
  }
}

function renderReportSelect() {
  const sel = mustEl("reportSelect");
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Select report —";
  sel.appendChild(opt0);

  for (const r of state.reports) {
    const o = document.createElement("option");
    o.value = r.id;
    o.textContent = reportLabel(r);
    sel.appendChild(o);
  }

  sel.value = state.activeReport?.id || "";
}

function updatePdfStatus(r){
  const st = mustEl("pdfStatus");
  const btn = mustEl("downloadPdfBtn");
  if (r?.pdf_bucket && r?.pdf_path) {
    st.textContent = r.pdf_filename ? `Stored: ${r.pdf_filename}` : "PDF linked";
    btn.disabled = false;
  } else {
    st.textContent = "No PDF linked";
    btn.disabled = true;
  }
}

function loadReportIntoHeader(r) {
  mustEl("vesselSelect").value = r.vessel_id || "";
  mustEl("inspectionDate").value = r.inspection_date || "";
  mustEl("portName").value = r.port_name || "";
  mustEl("portCode").value = r.port_code || "";
  mustEl("ocimfCompany").value = r.ocimf_company || "";
  mustEl("reportRef").value = r.report_ref || "";
  mustEl("reportTitle").value = r.title || "";
  mustEl("inspectorName").value = r.inspector_name || "";
  setActivePill("Active: " + reportLabel(r));
  updatePdfStatus(r);
}

function clearDetailPane() {
  mustEl("detailPane").innerHTML = `
    <div style="font-weight:950; color:#35507b;">
      Select a question from the list to record post-inspection observations and tick PGNO(s).
    </div>
  `;
}

function headerInputs() {
  return {
    vessel_id: String(mustEl("vesselSelect").value || "").trim(),
    inspection_date: String(mustEl("inspectionDate").value || "").trim(),
    port_name: String(mustEl("portName").value || "").trim(),
    port_code: String(mustEl("portCode").value || "").trim(),
    ocimf_company: String(mustEl("ocimfCompany").value || "").trim(),
    inspector_name: String(mustEl("inspectorName").value || "").trim(),
    report_ref: String(mustEl("reportRef").value || "").trim(),
    title: String(mustEl("reportTitle").value || "").trim(),
  };
}

function ensureActiveReportOrWarn() {
  if (!state.activeReport) {
    alert("No active report. Please select an existing report or create a new one, then Save Report Header.");
    return false;
  }
  return true;
}

// -------------------------
// Question list + detail pane
// -------------------------
function renderQuestionList() {
  const list = mustEl("questionList");
  list.innerHTML = "";

  const term = String(mustEl("searchInput").value || "").trim().toLowerCase();
  const chap = String(mustEl("chapterFilter").value || "").trim();
  const onlyObs = !!mustEl("onlyObsFilter").checked;
  const onlyMissing = !!mustEl("missingPgnoFilter").checked;

  const rows = [];

  for (const item of state.lib) {
    const qno = getQno(item);
    if (!qno) continue;

    if (chap && String(getChap(item)) !== chap) continue;

    const row = state.observations[qno] || null;
    const hasObs = !!(row && row.has_observation);
    const missing = isMissingPgno(row);

    if (onlyObs && !hasObs) continue;
    if (onlyMissing && !missing) continue;

    if (term) {
      const hay = [qno, getShort(item), getSection(item), getQText(item), getChap(item)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(term)) continue;
    }

    rows.push({ qno, item, hasObs, missing });
  }

  rows.sort((a, b) => String(a.qno).localeCompare(String(b.qno)));

  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "item" + (state.selectedQno === r.qno ? " active" : "");

    let badgeHtml = `<span class="badge">No Obs</span>`;
    if (r.hasObs && r.missing) badgeHtml = `<span class="badge warn">Missing PGNO</span>`;
    else if (r.hasObs) badgeHtml = `<span class="badge obs">Observed</span>`;

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <div>
          <div class="qno">${esc(r.qno)} — ${esc(getShort(r.item))}</div>
          <div class="qst">${esc(getSection(r.item))}</div>
        </div>
        <div>${badgeHtml}</div>
      </div>
    `;

    div.addEventListener("click", () => {
      state.selectedQno = r.qno;
      renderQuestionList();
      renderDetailPane(r.qno);
    });

    list.appendChild(div);
  }

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.style.padding = "10px";
    empty.style.border = "1px dashed #d5deef";
    empty.style.borderRadius = "12px";
    empty.style.background = "#f8fbff";
    empty.style.color = "#35507b";
    empty.style.fontWeight = "900";
    empty.textContent = onlyObs
      ? "No observed questions were found for this report."
      : "No questions match current filters.";
    list.appendChild(empty);
  }
}

function queueUpsert(question_no, payload) {
  if (!state.activeReport) return;
  state.pendingDeletes.delete(question_no);
  state.pendingUpserts.set(question_no, payload);
  setSaveStatus("Pending changes…");
  scheduleFlush();
}
function queueDelete(question_no) {
  if (!state.activeReport) return;
  state.pendingUpserts.delete(question_no);
  state.pendingDeletes.add(question_no);
  setSaveStatus("Pending changes…");
  scheduleFlush();
}
function hasPending() {
  return state.pendingUpserts.size > 0 || state.pendingDeletes.size > 0;
}
function scheduleFlush(delayMs = 850) {
  if (!state.activeReport) return;
  clearTimeout(state.flushTimer);
  state.flushTimer = setTimeout(async () => {
    try { await flushPending(); } catch (e) {
      console.error(e);
      setSaveStatus("Error");
    }
  }, delayMs);
}

async function flushPending() {
  if (!state.activeReport) return;
  if (!hasPending()) return;

  const report_id = state.activeReport.id;
  const deletes = Array.from(state.pendingDeletes);
  const upserts = Array.from(state.pendingUpserts.values());

  setSaveStatus("Saving…");

  if (deletes.length) {
    const chunkSize = 200;
    for (let i = 0; i < deletes.length; i += chunkSize) {
      const chunk = deletes.slice(i, i + chunkSize);
      const { error } = await state.supabase
        .from("post_inspection_observations")
        .delete()
        .eq("report_id", report_id)
        .in("question_no", chunk);
      if (error) throw error;
    }
    for (const qno of deletes) {
      delete state.observations[qno];
      state.pendingDeletes.delete(qno);
    }
  }

  if (upserts.length) {
    const chunkSize = 200;
    for (let i = 0; i < upserts.length; i += chunkSize) {
      const chunk = upserts.slice(i, i + chunkSize);
      const { data, error } = await state.supabase
        .from("post_inspection_observations")
        .upsert(chunk, { onConflict: "report_id,question_no" })
        .select("report_id, question_no, has_observation, observation_type, pgno_selected, remarks, updated_at");
      if (error) throw error;

      for (const row of data || []) {
        const pg = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
        state.observations[row.question_no] = { ...row, pgno_selected: pg };
        state.pendingUpserts.delete(row.question_no);
      }
    }
  }

  renderQuestionList();
  setSaveStatus(hasPending() ? "Pending changes…" : "Saved");
}

function renderDetailPane(qno) {
  const pane = mustEl("detailPane");
  const q = state.libByNo.get(qno);
  if (!q) {
    pane.innerHTML = `<div style="font-weight:950; color:#35507b;">Question not found in library: ${esc(qno)}</div>`;
    return;
  }

  const chap = getChap(q);
  const sect = getSection(q);
  const risk = getRisk(q);
  const typ = getType(q);
  const shortText = getShort(q);
  const qText = getQText(q);

  const existing = state.observations[qno] || null;
  const hasObs = !!(existing && existing.has_observation);

  const pgnoBullets = getPgnoBullets(q);
  const selected = new Set(
    (existing?.pgno_selected || []).map(x => Number(x.idx)).filter(n => Number.isFinite(n))
  );

  const typeValue = existing?.observation_type || "negative_observation";
  const typeOptions = OBS_TYPES.map(o =>
    `<option value="${esc(o.value)}" ${o.value === typeValue ? "selected" : ""}>${esc(o.label)}</option>`
  ).join("");

  pane.innerHTML = `
    <h3 style="margin:0 0 6px; color:#143a63;">${esc(qno)} — ${esc(shortText)}</h3>
    <div style="font-weight:850; color:#55708f; margin-bottom:10px;">
      Chapter: ${esc(chap)} | Section: ${esc(sect)} | Risk: ${esc(risk)} | Type: ${esc(typ)}
    </div>
    <div style="font-weight:850; margin-bottom:12px;">${esc(qText)}</div>

    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
      <label style="font-weight:900;">
        <input type="checkbox" id="obsToggle" ${hasObs ? "checked" : ""}/>
        Observation received for this question
      </label>
      <button class="btn btn-muted" id="clearBtn" ${hasObs ? "" : "disabled"}>Clear observation</button>
      <div id="missingHint" style="font-weight:900; color:#8a4b00; display:${hasObs && isMissingPgno(existing) ? "block" : "none"};">
        Missing PGNO tick (Finalize check will flag this)
      </div>
    </div>

    <label for="obsType" style="display:block; margin-top:12px; font-weight:900; color:#143a63;">Observation type</label>
    <select id="obsType" ${hasObs ? "" : "disabled"} style="width:100%; padding:10px 12px; border:1px solid #cfe0f4; border-radius:12px; font-weight:800;">
      ${typeOptions}
    </select>

    <div style="margin-top:12px; padding:12px; border:1px solid #cfe0f4; border-radius:14px; background:#f8fbff;">
      <div style="font-weight:950; color:#143a63;">PGNO Tick Selection (only for observed questions)</div>
      <div style="font-weight:850; color:#35507b; margin-top:6px;">
        Tick the specific PGNO(s) where the observation was raised. Full PGNO answering is not required.
      </div>

      <div class="pgnoList" id="pgnoList" style="margin-top:10px;"></div>

      <label for="obsRemarks" style="display:block; margin-top:12px; font-weight:900; color:#143a63;">Observation remarks (optional)</label>
      <textarea id="obsRemarks" placeholder="Paste/enter the observation wording from the vetting inspection report..." ${hasObs ? "" : "disabled"}></textarea>
    </div>

    <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
      <button class="btn" id="saveBtn">Save This Question</button>
      <button class="btn btn-muted" id="saveNowBtn">Save now (flush)</button>
      <div style="font-weight:900; color:#35507b;" id="qSaveMsg"></div>
    </div>
  `;

  const pgList = pane.querySelector("#pgnoList");
  const toggle = pane.querySelector("#obsToggle");
  const clearBtn = pane.querySelector("#clearBtn");
  const remarks = pane.querySelector("#obsRemarks");
  const saveBtn = pane.querySelector("#saveBtn");
  const saveNowBtn = pane.querySelector("#saveNowBtn");
  const msg = pane.querySelector("#qSaveMsg");
  const obsType = pane.querySelector("#obsType");
  const missingHint = pane.querySelector("#missingHint");

  if (existing?.remarks) remarks.value = existing.remarks;

  if (!pgnoBullets.length) {
    const noPg = document.createElement("div");
    noPg.style.fontWeight = "900";
    noPg.style.color = "#7a4a00";
    noPg.style.marginTop = "10px";
    noPg.textContent = "No PGNO bullets available for this question in the library JSON.";
    pgList.appendChild(noPg);
  } else {
    pgnoBullets.forEach((txt, i) => {
      const idx = i + 1;
      const rowDiv = document.createElement("div");
      rowDiv.className = "pgnoRow";
      rowDiv.innerHTML = `
        <input type="checkbox" class="pgChk" data-idx="${idx}" ${selected.has(idx) ? "checked" : ""} ${hasObs ? "" : "disabled"} />
        <div class="pgnoIdx">PGNO ${idx}</div>
        <div class="pgnoTxt">${esc(txt)}</div>
      `;
      pgList.appendChild(rowDiv);
    });
  }

  function setControlsEnabled(on) {
    obsType.disabled = !on;
    remarks.disabled = !on;
    clearBtn.disabled = !on;
    pgList.querySelectorAll(".pgChk").forEach((c) => (c.disabled = !on));
  }
  setControlsEnabled(hasObs);

  function getSelectedPgno() {
    const selectedPg = [];
    if (!pgnoBullets.length) return selectedPg;
    pgList.querySelectorAll(".pgChk").forEach((c) => {
      if (c.checked) {
        const idx = Number(c.getAttribute("data-idx"));
        const txt = pgnoBullets[idx - 1] || "";
        selectedPg.push({ idx, text: String(txt || "").trim() });
      }
    });
    return selectedPg;
  }

  function upsertLocalAndQueue() {
    if (!ensureActiveReportOrWarn()) return;

    const observed = !!toggle.checked;
    if (!observed) {
      if (state.observations[qno]) {
        queueDelete(qno);
        missingHint.style.display = "none";
        renderQuestionList();
      }
      return;
    }

    const pg = getSelectedPgno();
    const rem = String(remarks.value || "");
    const ot = String(obsType.value || "negative_observation");

    state.observations[qno] = {
      report_id: state.activeReport.id,
      question_no: qno,
      has_observation: true,
      observation_type: ot,
      pgno_selected: pg,
      remarks: rem,
      updated_at: nowIso(),
    };

    queueUpsert(qno, {
      report_id: state.activeReport.id,
      question_no: qno,
      has_observation: true,
      observation_type: ot,
      pgno_selected: pg,
      remarks: rem,
    });

    missingHint.style.display = (pg.length === 0) ? "block" : "none";
    renderQuestionList();
  }

  toggle.addEventListener("change", () => {
    if (!ensureActiveReportOrWarn()) { toggle.checked = false; return; }
    const on = !!toggle.checked;
    setControlsEnabled(on);
    upsertLocalAndQueue();
    msg.textContent = on ? "" : "Observation toggled off. Save will remove it from the database.";
  });

  clearBtn.addEventListener("click", async () => {
    if (!ensureActiveReportOrWarn()) return;
    const ok = confirm("Clear this observation (remove from database)?");
    if (!ok) return;

    toggle.checked = false;
    remarks.value = "";
    obsType.value = "negative_observation";
    setControlsEnabled(false);
    missingHint.style.display = "none";

    queueDelete(qno);
    msg.textContent = "Observation cleared (pending save).";
    renderQuestionList();
  });

  saveBtn.addEventListener("click", () => {
    upsertLocalAndQueue();
    const observed = !!toggle.checked;
    if (!observed) { msg.textContent = "Saved (no observation)."; return; }
    const pg = getSelectedPgno();
    msg.textContent = pg.length ? "Saved (pending flush)." : "Saved (pending flush). Missing PGNO tick.";
  });

  saveNowBtn.addEventListener("click", async () => {
    upsertLocalAndQueue();
    try {
      await flushPending();
      msg.textContent = "Saved to database.";
    } catch (e) {
      console.error(e);
      alert("Save now failed: " + (e?.message || String(e)));
      setSaveStatus("Error");
    }
  });

  remarks.addEventListener("input", () => { if (toggle.checked) upsertLocalAndQueue(); });
  obsType.addEventListener("change", () => { if (toggle.checked) upsertLocalAndQueue(); });
  pgList.querySelectorAll(".pgChk").forEach((chk) => {
    chk.addEventListener("change", () => { if (toggle.checked) upsertLocalAndQueue(); });
  });
}

// -------------------------
// Report actions
// -------------------------
async function setActiveReportById(id) {
  if (state.activeReport && hasPending()) {
    try { await flushPending(); } catch {}
  }

  if (!id) {
    state.activeReport = null;
    state.observations = {};
    state.selectedQno = null;
    renderReportSelect();
    setActivePill("No active report");
    updatePdfStatus(null);
    clearDetailPane();
    renderQuestionList();
    setSaveStatus("Not saved");
    return;
  }

  const r = state.reports.find(x => x.id === id) || null;
  if (!r) return;

  state.activeReport = r;
  state.selectedQno = null;

  loadReportIntoHeader(r);
  setSaveStatus("Loading…");

  try {
    state.observations = await loadObservationsForReport(r.id);
    setSaveStatus("Loaded");
  } catch (e) {
    console.error(e);
    alert("Failed to load observations: " + (e?.message || String(e)));
    state.observations = {};
    setSaveStatus("Error");
  }

  renderReportSelect();
  clearDetailPane();
  renderQuestionList();
}

async function handleNewReport() {
  const inputs = headerInputs();
  if (!inputs.vessel_id) { alert("Please select a vessel first."); return; }
  if (!inputs.inspection_date) { alert("Please set an inspection date."); return; }

  setSaveStatus("Saving…");

  try {
    const created = await createReportHeader(inputs);
    state.reports = await loadReportsFromDb();
    await setActiveReportById(created.id);
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Create report failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

async function handleSaveHeader() {
  const inputs = headerInputs();
  if (!inputs.vessel_id) { alert("Please select a vessel first."); return; }
  if (!inputs.inspection_date) { alert("Please set an inspection date."); return; }

  setSaveStatus("Saving…");

  try {
    if (!state.activeReport) {
      const created = await createReportHeader(inputs);
      state.reports = await loadReportsFromDb();
      await setActiveReportById(created.id);
      setSaveStatus("Saved");
      return;
    }

    const updated = await updateReportHeader(state.activeReport.id, inputs);
    state.reports = await loadReportsFromDb();
    await setActiveReportById(updated.id);
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Save header failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

async function handleDeleteReport() {
  if (!state.activeReport) return;

  if (hasPending()) {
    const okPending = confirm("There are pending changes. Flush them before deleting this report?");
    if (okPending) {
      try { await flushPending(); } catch {}
    }
  }

  const ok = confirm(`Delete this report?\n\n${reportLabel(state.activeReport)}\n\nAll observations will be deleted (cascade).`);
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
// Export / Import JSON
// -------------------------
async function exportActiveReportJson() {
  if (!state.activeReport) { alert("No active report to export."); return; }
  if (hasPending()) {
    const ok = confirm("There are pending changes. Flush to database before export?");
    if (ok) { try { await flushPending(); } catch {} }
  }

  const payload = {
    report: state.activeReport,
    observations: Object.values(state.observations || {}),
    exported_at: nowIso(),
    module: "post_inspection",
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");

  const safeV = String(state.activeReport.vessel_name || "vessel").replace(/[^a-z0-9]+/gi, "_");
  const safeD = String(state.activeReport.inspection_date || "date").replace(/[^0-9-]+/g, "_");
  a.download = `post_inspection_${safeV}_${safeD}.json`;

  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function importReportJsonFromFile(file) {
  const text = await file.text();
  try {
    const obj = JSON.parse(text);
    if (!obj || typeof obj !== "object") throw new Error("Invalid JSON.");
    if (!obj.report || !obj.observations) throw new Error("JSON must contain { report, observations }.");

    const rep = obj.report;
    const obs = obj.observations;

    const inputs = {
      vessel_id: String(rep.vessel_id || "").trim(),
      inspection_date: String(rep.inspection_date || "").trim(),
      port_name: String(rep.port_name || "").trim(),
      port_code: String(rep.port_code || "").trim(),
      ocimf_company: String(rep.ocimf_company || "").trim(),
      inspector_name: String(rep.inspector_name || "").trim(),
      report_ref: String(rep.report_ref || "").trim(),
      title: String(rep.title || "").trim(),
    };

    if (!inputs.vessel_id) throw new Error("Import: report.vessel_id missing.");
    if (!inputs.inspection_date) throw new Error("Import: report.inspection_date missing.");

    setSaveStatus("Importing…");

    const created = await createReportHeader(inputs);

    const rows = Array.isArray(obs) ? obs : [];
    const payload = rows
      .filter(r => r && r.question_no)
      .map(r => ({
        report_id: created.id,
        question_no: String(r.question_no),
        has_observation: true,
        observation_type: String(r.observation_type || "negative_observation"),
        pgno_selected: Array.isArray(r.pgno_selected) ? r.pgno_selected : [],
        remarks: r.remarks ?? null,
      }));

    const batchSize = 500;
    for (let i = 0; i < payload.length; i += batchSize) {
      const chunk = payload.slice(i, i + batchSize);
      const { error } = await state.supabase
        .from("post_inspection_observations")
        .upsert(chunk, { onConflict: "report_id,question_no" });
      if (error) throw error;
    }

    state.reports = await loadReportsFromDb();
    await setActiveReportById(created.id);

    setSaveStatus("Imported");
    alert("Import completed successfully.");
  } catch (e) {
    console.error(e);
    alert("Import failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

// -------------------------
// Stats
// -------------------------
function renderStatsDialog() {
  if (!state.activeReport) { alert("No active report. Please select or create a report first."); return; }

  const total = state.lib.length;
  const observed = getObservedQnos().sort((a, b) => String(a).localeCompare(String(b)));
  const missing = getMissingPgnoQnos().sort((a, b) => String(a).localeCompare(String(b)));

  const obsCount = observed.length;
  const missCount = missing.length;
  const pct = total ? Math.round((obsCount / total) * 1000) / 10 : 0;

  mustEl("statTotalQ").value = String(total);
  mustEl("statObservedQ").value = String(obsCount);
  mustEl("statMissingPgno").value = String(missCount);
  mustEl("statPct").value = String(pct) + "%";

  const byChap = new Map();
  for (const qno of observed) {
    const q = state.libByNo.get(qno);
    const ch = q ? String(getChap(q) || "—") : "—";
    byChap.set(ch, (byChap.get(ch) || 0) + 1);
  }
  const byChapLines = [...byChap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => `Chapter ${ch}: ${n}`);
  mustEl("statByChapter").textContent = byChapLines.length ? byChapLines.join("\n") : "-";

  const byType = new Map();
  for (const qno of observed) {
    const r = state.observations[qno];
    const t = String(r?.observation_type || "negative_observation");
    byType.set(t, (byType.get(t) || 0) + 1);
  }
  const labelMap = new Map(OBS_TYPES.map(o => [o.value, o.label]));
  const byTypeLines = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${labelMap.get(t) || t}: ${n}`);
  mustEl("statByType").textContent = byTypeLines.length ? byTypeLines.join("\n") : "-";

  mustEl("statObsList").textContent = observed.length ? observed.join(", ") : "-";
  mustEl("statMissingList").textContent = missing.length ? missing.join(", ") : "-";

  mustEl("statsDialog").showModal();
}

function finalizeCheck() {
  if (!state.activeReport) { alert("No active report."); return; }
  const missing = getMissingPgnoQnos().sort((a, b) => String(a).localeCompare(String(b)));
  if (!missing.length) {
    alert("Finalize check: OK.\n\nNo observed questions are missing PGNO ticks.");
    return;
  }
  renderStatsDialog();
}

// -------------------------
// PDF download
// -------------------------
async function downloadActivePdf() {
  if (!state.activeReport?.pdf_bucket || !state.activeReport?.pdf_path) {
    alert("No PDF linked to this report.");
    return;
  }

  const bucket = state.activeReport.pdf_bucket;
  const path = state.activeReport.pdf_path;

  setSaveStatus("Preparing PDF download…");
  const { data, error } = await state.supabase
    .storage
    .from(bucket)
    .createSignedUrl(path, 60);

  if (error) {
    console.error(error);
    alert("Failed to create signed URL: " + (error.message || String(error)));
    setSaveStatus("Error");
    return;
  }

  const url = data?.signedUrl;
  if (!url) {
    alert("No signed URL returned.");
    setSaveStatus("Error");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  setSaveStatus("Loaded");
}

// -------------------------
// PDF import (AI)
// -------------------------
async function ensureDraftReportExists() {
  if (state.activeReport?.id) return state.activeReport;

  const v = String(mustEl("vesselSelect").value || "").trim() || (state.vessels[0]?.id || "");
  if (!v) throw new Error("No vessels exist in DB.");

  const d = String(mustEl("inspectionDate").value || "").trim() || new Date().toISOString().slice(0,10);

  const created = await createReportHeader({
    vessel_id: v,
    inspection_date: d,
    port_name: "",
    port_code: "",
    ocimf_company: "",
    inspector_name: "",
    report_ref: "",
    title: "",
  });

  state.reports = await loadReportsFromDb();
  await setActiveReportById(created.id);
  return state.activeReport;
}

async function upsertObservationsDirect(reportId, rows) {
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await state.supabase
      .from("post_inspection_observations")
      .upsert(chunk, { onConflict: "report_id,question_no" });
    if (error) throw error;
  }
}

function focusObservedAfterImport() {
  // make it obvious to the user where the imported items are
  const onlyObs = mustEl("onlyObsFilter");
  const missing = mustEl("missingPgnoFilter");
  const search = mustEl("searchInput");
  onlyObs.checked = true;
  missing.checked = false;
  search.value = "";

  const observed = getObservedQnos().sort((a, b) => String(a).localeCompare(String(b)));
  if (observed.length) {
    state.selectedQno = observed[0];
    renderQuestionList();
    renderDetailPane(observed[0]);
  } else {
    renderQuestionList();
    clearDetailPane();
  }
}

async function importReportPdfAiFromFile(file) {
  if (!file) return;

  setExtracting(true);

  try {
    const report = await ensureDraftReportExists();

    // upload PDF
    const bucket = PDF_BUCKET_DEFAULT;
    const safeName = String(file.name || "report.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${PDF_FOLDER_PREFIX}/${report.id}/${Date.now()}_${safeName}`;

    setSaveStatus("Uploading PDF…");
    const { error: upErr } = await state.supabase
      .storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: "application/pdf" });
    if (upErr) throw upErr;

    await updateReportPdfFields(report.id, { pdf_bucket: bucket, pdf_path: path, pdf_filename: safeName });

    // refresh active report row
    state.reports = await loadReportsFromDb();
    const refreshed = state.reports.find(r => r.id === report.id);
    if (refreshed) {
      state.activeReport = refreshed;
      loadReportIntoHeader(refreshed);
      renderReportSelect();
    }

    // call edge function
    setSaveStatus("Extracting via AI…");
    const { data, error } = await state.supabase.functions.invoke("import-post-inspection-pdf", {
      body: { report_id: report.id, pdf_storage_path: path },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "AI import failed");

    const extracted = data.extracted;

    // apply header
    const h = extracted?.header || {};
    const isoDate = ddmmyyyyToIso(h.inspection_date);

    let vessel_id = mustEl("vesselSelect").value || null;
    if (h.vessel_name) {
      const hit = (state.vessels || []).find(v =>
        String(v.name || "").trim().toLowerCase() === String(h.vessel_name).trim().toLowerCase()
      );
      if (hit?.id) vessel_id = hit.id;
    }

    if (vessel_id) mustEl("vesselSelect").value = vessel_id;
    if (isoDate) mustEl("inspectionDate").value = isoDate;
    if (h.port_name) mustEl("portName").value = h.port_name;
    if (h.port_code) mustEl("portCode").value = h.port_code;
    if (h.ocimf_inspecting_company) mustEl("ocimfCompany").value = h.ocimf_inspecting_company;
    if (h.report_reference) mustEl("reportRef").value = h.report_reference;

    // persist header
    try {
      const updated = await updateReportHeader(report.id, headerInputs());
      state.activeReport = updated;
    } catch (e) {
      // if report_ref unique violates, auto-suffix it
      const msg = String(e?.message || e);
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        const ref = String(mustEl("reportRef").value || "").trim();
        if (ref) {
          const alt = `${ref}__${String(report.id).slice(0,8)}`;
          mustEl("reportRef").value = alt;
          const updated2 = await updateReportHeader(report.id, headerInputs());
          state.activeReport = updated2;
          alert(`Report Reference already existed.\n\nStored as:\n${alt}`);
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    state.reports = await loadReportsFromDb();
    renderReportSelect();
    mustEl("reportSelect").value = report.id;
    updatePdfStatus(state.reports.find(r => r.id === report.id));

    // observations
    const obs = Array.isArray(extracted?.observations) ? extracted.observations : [];
    const rows = [];

    for (const item of obs) {
      const qbase = item?.question_base;
      const qno = findLibraryQno(qbase, state.libByNo);
      if (!qno) continue;

      const obsType = String(item?.obs_type || "").toLowerCase();
      const isNeg = obsType === "negative";
      const isPos = obsType === "positive";

      // IMPORTANT:
      // - keep observation_type compatible with your existing UI + DB constraint
      // - store obs_type separately for future reporting
      const observation_type = isNeg ? "negative_observation" : (isPos ? "best_practice" : "observation_comment");
      const observation_text = String(item?.observation_text || item?.source_excerpt || "").trim();

      const row = {
        report_id: report.id,
        question_no: qno,
        has_observation: true,
        observation_type,
        obs_type: isNeg ? "negative" : (isPos ? "positive" : null),
        question_base: qbase ? String(qbase) : null,
        observation_text: observation_text || null,
        negative_category: item?.negative_category ? String(item.negative_category) : null,
        positive_rank: item?.positive_rank ? String(item.positive_rank) : null,
        pgno_selected: [],
        remarks: observation_text || null,
      };

      rows.push(row);
    }

    if (rows.length) {
      setSaveStatus(`Saving ${rows.length} observation(s)…`);
      await upsertObservationsDirect(report.id, rows);
    }

    state.observations = await loadObservationsForReport(report.id);

    // If DB rejected columns (because they don't exist), surface it clearly:
    const observedNow = getObservedQnos();

    setSaveStatus(`AI import done (${observedNow.length} observation(s))`);

    // Make imported items visible immediately
    focusObservedAfterImport();

    if (!observedNow.length && obs.length) {
      alert(
        "AI returned observations but none were saved/loaded.\n\n" +
        "Next check: in Supabase table post_inspection_observations, confirm rows exist for this report_id."
      );
    }
  } finally {
    setExtracting(false);
  }
}

// -------------------------
// Init
// -------------------------
async function init() {
  [
    "reportSelect","vesselSelect","inspectionDate","portName","portCode",
    "ocimfCompany","reportRef","reportTitle","inspectorName",
    "downloadPdfBtn","pdfStatus",
    "newReportBtn","saveHeaderBtn","deleteReportBtn",
    "exportBtn","importBtn","importFile",
    "importPdfBtn","importPdfFile",
    "statsBtn","finalizeBtn",
    "searchInput","chapterFilter","onlyObsFilter","missingPgnoFilter",
    "questionList","detailPane","statsDialog","closeStatsBtn","exportCsvBtn",
    "saveStatus","activeReportPill","buildPill","logoutBtn","userBadge"
  ].forEach(mustEl);

  const R = window.AUTH?.ROLES;
  if (!R) throw new Error("AUTH roles missing (window.AUTH.ROLES not found)");

  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  mustEl("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("dashboardBtn")?.addEventListener("click", () => window.location.href = "./dashboard.html");
  el("modeSelectBtn")?.addEventListener("click", () => window.location.href = "./mode_selection.html");

  state.supabase = window.__supabaseClient;
  if (!state.supabase) throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded before post_inspection.js.");

  setBuildPill();
  setSaveStatus("Loading…");

  state.vessels = await loadVessels();
  renderVesselsSelect();

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  state.libByNo = new Map();
  for (const q of state.lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  const chSet = new Set();
  for (const q of state.lib) {
    const ch = getChap(q);
    if (ch) chSet.add(ch);
  }
  state.chapters = [...chSet].sort((a, b) => String(a).localeCompare(String(b)));
  renderChapterFilter();

  state.reports = await loadReportsFromDb();
  renderReportSelect();

  if (!mustEl("inspectionDate").value) {
    mustEl("inspectionDate").value = new Date().toISOString().slice(0,10);
  }

  mustEl("reportSelect").addEventListener("change", async () => {
    const id = mustEl("reportSelect").value || null;
    await setActiveReportById(id);
  });

  mustEl("newReportBtn").addEventListener("click", handleNewReport);
  mustEl("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  mustEl("deleteReportBtn").addEventListener("click", handleDeleteReport);

  mustEl("exportBtn").addEventListener("click", exportActiveReportJson);

  mustEl("importBtn").addEventListener("click", () => mustEl("importFile").click());
  mustEl("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) await importReportJsonFromFile(f);
    e.target.value = "";
  });

  mustEl("importPdfBtn").addEventListener("click", () => mustEl("importPdfFile").click());
  mustEl("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try { if (f) await importReportPdfAiFromFile(f); }
    finally { e.target.value = ""; }
  });

  mustEl("downloadPdfBtn").addEventListener("click", downloadActivePdf);

  mustEl("statsBtn").addEventListener("click", renderStatsDialog);
  mustEl("finalizeBtn").addEventListener("click", finalizeCheck);
  mustEl("closeStatsBtn").addEventListener("click", () => mustEl("statsDialog").close());

  mustEl("exportCsvBtn").addEventListener("click", () => {
    alert("CSV export: not enabled in this build yet.");
  });

  mustEl("searchInput").addEventListener("input", renderQuestionList);
  mustEl("chapterFilter").addEventListener("change", renderQuestionList);
  mustEl("onlyObsFilter").addEventListener("change", renderQuestionList);
  mustEl("missingPgnoFilter").addEventListener("change", renderQuestionList);

  if (state.reports.length) {
    await setActiveReportById(state.reports[0].id);
  } else {
    await setActiveReportById(null);
    if (state.vessels.length) mustEl("vesselSelect").value = state.vessels[0].id;
  }

  renderQuestionList();
  setSaveStatus(state.activeReport ? "Loaded" : "Not saved");

  window.addEventListener("beforeunload", (e) => {
    if (hasPending()) { e.preventDefault(); e.returnValue = ""; }
  });

  log("Loaded", POST_INSPECTION_BUILD);
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Post-Inspection module failed to load: " + (e?.message || String(e)));
    try { setSaveStatus("Error"); } catch {}
  }
})();
