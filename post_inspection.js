// public/post_inspection.js
// Post-Inspection module (v9)
// - matches your DB schema: post_inspection_reports.ocimf_company, inspector_name, pdf_bucket/pdf_path/pdf_filename
// - fixes report_ref UNIQUE issue by storing NULL when empty
// - fixes PDF import wiring (button -> hidden file input)
// - if module JS fails, nothing works; this file contains only plain ASCII to avoid "Invalid token" copy issues

import { loadLockedLibraryJson } from "./question_library_loader.js";

const POST_INSPECTION_BUILD = "post_inspection_v9_2026-02-18";

// Locked library JSON used by Questions Editor as well
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

// Storage bucket + folder where PDFs are stored
const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";

// Observation types (you can extend later)
const OBS_TYPES = [
  { value: "negative_observation", label: "Negative observation" },
  { value: "positive_observation", label: "Positive observation" },
  { value: "observation_comment", label: "Observation / comment" },
  { value: "note_improvement", label: "Note / improvement" },
  { value: "best_practice", label: "Best practice" },
  { value: "office_finding", label: "Office finding" },
  { value: "other", label: "Other" },
];

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

// dd.mm.yyyy -> yyyy-mm-dd
function ddmmyyyyToIso(ddmmyyyy) {
  const s = String(ddmmyyyy || "").trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  const dd = m[1], mm = m[2], yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

// Normalize question number for matching: supports "2.2.1" vs "02.02.01"
function normalizeQnoParts(qno, pad2) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (parts.length < 2) return String(qno || "").trim();
  const norm = parts.map(p => {
    const n = p.replace(/^0+/, "") || "0";
    return pad2 ? n.padStart(2, "0") : String(Number(n));
  });
  return norm.join(".");
}

const state = {
  me: null,
  supabase: null,

  vessels: [],
  lib: [],
  libByNo: new Map(),
  chapters: [],

  reports: [],
  activeReport: null,          // report header row
  observations: {},            // map: question_no -> observation row
  selectedQno: null,

  flushTimer: null,
  pendingUpserts: new Map(),   // question_no -> payload
  pendingDeletes: new Set(),   // question_no
};

function setSaveStatus(text) {
  const n = el("saveStatus");
  if (n) n.textContent = text || "Not saved";
}

function setActivePill(text) {
  const n = el("activeReportPill");
  if (n) n.textContent = text || "No active report";
}

function setPdfInfo(report) {
  const box = el("pdfInfo");
  if (!box) return;
  if (report?.pdf_bucket && report?.pdf_path) {
    box.textContent = `${report.pdf_filename || "PDF"} (${report.pdf_bucket}/${report.pdf_path})`;
  } else {
    box.textContent = "No PDF linked";
  }
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
  if (bullets && bullets.length) {
    return bullets.map((t) => String(t || "").trim()).filter(Boolean);
  }
  const pgTxt = String(q?.["Potential Grounds for Negative Observations"] || "").trim();
  if (!pgTxt) return [];
  const lines = pgTxt.split("\n").map((s) => s.trim()).filter(Boolean);
  const usable = lines.filter((s) => s.length > 6);
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

function normalizeNullIfEmpty(s) {
  const t = String(s ?? "").trim();
  return t === "" ? null : t;
}

// Map extracted "question_base" (2.2.1) into library key ("02.02.01" or "2.2.1" depending on your library)
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

/* -------------------------
   Supabase access
------------------------- */

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

  const map = new Map((vessels || []).map(v => [v.id, v.name]));
  if (vErr) return rows.map(r => ({ ...r, vessel_name: "" }));

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

async function createReportHeader(payload) {
  const insertRow = {
    vessel_id: payload.vessel_id,
    inspection_date: payload.inspection_date,
    port_name: normalizeNullIfEmpty(payload.port_name),
    port_code: normalizeNullIfEmpty(payload.port_code),
    ocimf_company: normalizeNullIfEmpty(payload.ocimf_company),
    inspector_name: normalizeNullIfEmpty(payload.inspector_name),
    report_ref: normalizeNullIfEmpty(payload.report_ref),
    title: normalizeNullIfEmpty(payload.title),
    pdf_bucket: normalizeNullIfEmpty(payload.pdf_bucket),
    pdf_path: normalizeNullIfEmpty(payload.pdf_path),
    pdf_filename: normalizeNullIfEmpty(payload.pdf_filename),
  };

  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([insertRow])
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title, pdf_bucket, pdf_path, pdf_filename, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, payload) {
  const updateRow = {
    vessel_id: payload.vessel_id,
    inspection_date: payload.inspection_date,
    port_name: normalizeNullIfEmpty(payload.port_name),
    port_code: normalizeNullIfEmpty(payload.port_code),
    ocimf_company: normalizeNullIfEmpty(payload.ocimf_company),
    inspector_name: normalizeNullIfEmpty(payload.inspector_name),
    report_ref: normalizeNullIfEmpty(payload.report_ref),
    title: normalizeNullIfEmpty(payload.title),
    pdf_bucket: normalizeNullIfEmpty(payload.pdf_bucket),
    pdf_path: normalizeNullIfEmpty(payload.pdf_path),
    pdf_filename: normalizeNullIfEmpty(payload.pdf_filename),
  };

  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update(updateRow)
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title, pdf_bucket, pdf_path, pdf_filename, created_at, updated_at")
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

/* -------------------------
   Batched save queue
------------------------- */

function hasPending() {
  return state.pendingUpserts.size > 0 || state.pendingDeletes.size > 0;
}

function scheduleFlush(delayMs = 850) {
  if (!state.activeReport) return;

  clearTimeout(state.flushTimer);
  setSaveStatus(hasPending() ? "Pending changes…" : "Saved");

  state.flushTimer = setTimeout(async () => {
    try {
      await flushPending();
    } catch (e) {
      console.error(e);
      setSaveStatus("Error");
    }
  }, delayMs);
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

  if (hasPending()) {
    setSaveStatus("Pending changes…");
    scheduleFlush(650);
  } else {
    setSaveStatus("Saved");
  }
}

/* -------------------------
   UI rendering
------------------------- */

function renderVesselsSelect() {
  const sel = el("vesselSelect");
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
  const sel = el("chapterFilter");
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
  const sel = el("reportSelect");
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

function loadReportIntoHeader(r) {
  el("vesselSelect").value = r.vessel_id || "";
  el("inspectionDate").value = r.inspection_date || "";
  el("portName").value = r.port_name || "";
  el("portCode").value = r.port_code || "";
  el("ocimfCompany").value = r.ocimf_company || "";
  el("inspectorName").value = r.inspector_name || "";
  el("reportRef").value = r.report_ref || "";
  el("reportTitle").value = r.title || "";

  setActivePill("Active: " + reportLabel(r));
  setPdfInfo(r);
}

function clearDetailPane() {
  el("detailPane").innerHTML = `
    <div style="font-weight:950; color:#35507b;">
      Select a question from the list to record post-inspection observations and tick PGNO(s).
    </div>
  `;
}

function ensureActiveReportOrWarn() {
  if (!state.activeReport) {
    alert("No active report. Either select an existing report, or Import PDF, or Save Report Header to create one.");
    return false;
  }
  return true;
}

function renderQuestionList() {
  const list = el("questionList");
  list.innerHTML = "";

  const term = String(el("searchInput").value || "").trim().toLowerCase();
  const chap = String(el("chapterFilter").value || "").trim();
  const onlyObs = !!el("onlyObsFilter").checked;
  const onlyMissing = !!el("missingPgnoFilter").checked;

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
      <div class="itemTop">
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
    empty.textContent = "No questions match current filters.";
    list.appendChild(empty);
  }
}

/* -------------------------
   Detail pane
------------------------- */

function renderDetailPane(qno) {
  const pane = el("detailPane");
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
    <h3 class="detailTitle">${esc(qno)} — ${esc(shortText)}</h3>
    <div class="meta">
      Chapter: ${esc(chap)} | Section: ${esc(sect)} | Risk: ${esc(risk)} | Type: ${esc(typ)}
    </div>

    <div class="qtext">${esc(qText)}</div>

    <div class="toggleRow">
      <label style="font-weight:900;">
        <input type="checkbox" id="obsToggle" ${hasObs ? "checked" : ""}/>
        Observation received for this question
      </label>

      <button class="btn btn-muted" id="clearBtn" ${hasObs ? "" : "disabled"}>Clear observation</button>
      <div id="missingHint" style="font-weight:900; color:#8a4b00; display:${hasObs && isMissingPgno(existing) ? "block" : "none"};">
        Missing PGNO tick (Finalize check will flag this)
      </div>
    </div>

    <label for="obsType" style="margin-top:12px;">Observation type</label>
    <select id="obsType" ${hasObs ? "" : "disabled"}>
      ${typeOptions}
    </select>

    <div class="pgnoBox">
      <div class="pgnoTitle">PGNO Tick Selection (only for observed questions)</div>
      <div style="font-weight:850; color:#35507b; line-height:1.35;">
        Tick the specific PGNO(s) where the observation was raised. Full PGNO answering is not required.
      </div>

      <div class="pgnoList" id="pgnoList"></div>

      <label for="obsRemarks" style="margin-top:12px;">Observation remarks (optional)</label>
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
    if (!ensureActiveReportOrWarn()) {
      toggle.checked = false;
      return;
    }
    const on = !!toggle.checked;
    setControlsEnabled(on);

    if (!on) {
      msg.textContent = "Observation toggled off. Save will remove it from the database.";
      upsertLocalAndQueue();
    } else {
      msg.textContent = "";
      if (!existing) obsType.value = "negative_observation";
      upsertLocalAndQueue();
    }
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
    if (!observed) {
      msg.textContent = "Saved (no observation).";
      return;
    }

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

  remarks.addEventListener("input", () => {
    if (!toggle.checked) return;
    upsertLocalAndQueue();
  });

  obsType.addEventListener("change", () => {
    if (!toggle.checked) return;
    upsertLocalAndQueue();
  });

  pgList.querySelectorAll(".pgChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      if (!toggle.checked) return;
      upsertLocalAndQueue();
    });
  });
}

/* -------------------------
   Header helpers + actions
------------------------- */

function headerInputs() {
  const vessel_id = String(el("vesselSelect").value || "").trim();
  const inspection_date = String(el("inspectionDate").value || "").trim(); // yyyy-mm-dd
  const port_name = String(el("portName").value || "").trim();
  const port_code = String(el("portCode").value || "").trim();
  const ocimf_company = String(el("ocimfCompany").value || "").trim();
  const inspector_name = String(el("inspectorName").value || "").trim();
  const report_ref = String(el("reportRef").value || "").trim();
  const title = String(el("reportTitle").value || "").trim();

  return { vessel_id, inspection_date, port_name, port_code, ocimf_company, inspector_name, report_ref, title };
}

async function setActiveReportById(id) {
  if (state.activeReport && hasPending()) {
    try { await flushPending(); } catch { /* ignore */ }
  }

  if (!id) {
    state.activeReport = null;
    state.observations = {};
    state.selectedQno = null;

    renderReportSelect();
    setActivePill("No active report");
    setPdfInfo(null);
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
  // IMPORTANT: Do NOT insert to DB here.
  // We only create a DB report when user clicks Save Header or imports a PDF.
  el("reportSelect").value = "";
  state.activeReport = null;
  state.observations = {};
  state.selectedQno = null;

  // Clear fields that caused UNIQUE issues previously
  el("reportRef").value = "";
  el("reportTitle").value = "";
  el("portName").value = "";
  el("portCode").value = "";
  el("ocimfCompany").value = "";
  el("inspectorName").value = "";

  setActivePill("No active report");
  setPdfInfo(null);
  clearDetailPane();
  renderQuestionList();
  setSaveStatus("New report (not saved) — Import PDF or Save Header");
}

async function handleSaveHeader() {
  const { vessel_id, inspection_date } = headerInputs();
  if (!vessel_id) { alert("Please select a vessel first."); return; }
  if (!inspection_date) { alert("Please set an inspection date."); return; }

  setSaveStatus("Saving…");

  try {
    if (!state.activeReport) {
      const created = await createReportHeader({ ...headerInputs(), pdf_bucket: null, pdf_path: null, pdf_filename: null });
      state.reports = await loadReportsFromDb();
      await setActiveReportById(created.id);
      setSaveStatus("Saved");
      return;
    }

    const updated = await updateReportHeader(state.activeReport.id, headerInputs());
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
      try { await flushPending(); } catch { /* ignore */ }
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

/* -------------------------
   Export / Import JSON
------------------------- */

async function exportActiveReportJson() {
  if (!state.activeReport) {
    alert("No active report to export.");
    return;
  }

  if (hasPending()) {
    const ok = confirm("There are pending changes. Flush to database before export?");
    if (ok) {
      try { await flushPending(); } catch { /* continue */ }
    }
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

    const vessel_id = String(rep.vessel_id || "").trim();
    const inspection_date = String(rep.inspection_date || "").trim();

    if (!vessel_id) throw new Error("Import: report.vessel_id missing.");
    if (!inspection_date) throw new Error("Import: report.inspection_date missing.");

    setSaveStatus("Importing…");

    const created = await createReportHeader({
      vessel_id,
      inspection_date,
      port_name: rep.port_name || "",
      port_code: rep.port_code || "",
      ocimf_company: rep.ocimf_company || "",
      inspector_name: rep.inspector_name || "",
      report_ref: rep.report_ref || "",
      title: rep.title || "",
      pdf_bucket: rep.pdf_bucket || null,
      pdf_path: rep.pdf_path || null,
      pdf_filename: rep.pdf_filename || null,
    });

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

/* -------------------------
   PDF import (AI)
------------------------- */

async function upsertObservationsDirect(reportId, rows) {
  const chunkSize = 150;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await state.supabase
      .from("post_inspection_observations")
      .upsert(chunk, { onConflict: "report_id,question_no" });
    if (error) throw error;
  }
}

async function ensureReportForPdfImport() {
  // Create a placeholder report so we can store the PDF under report.id and then overwrite header from extracted data.
  if (state.activeReport?.id) return state.activeReport;

  const vessels = state.vessels || [];
  const vessel_id = String(el("vesselSelect").value || vessels[0]?.id || "").trim();
  if (!vessel_id) throw new Error("Please select a vessel before importing PDF (needed to create the placeholder report).");

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const inspection_date = `${yyyy}-${mm}-${dd}`;

  const created = await createReportHeader({
    vessel_id,
    inspection_date,
    port_name: "",
    port_code: "",
    ocimf_company: "",
    inspector_name: "",
    report_ref: "",
    title: "",
    pdf_bucket: null,
    pdf_path: null,
    pdf_filename: null,
  });

  state.reports = await loadReportsFromDb();
  await setActiveReportById(created.id);
  return state.activeReport;
}

async function importReportPdfAiFromFile(file) {
  if (!file) return;

  // Create placeholder report if needed
  const report = await ensureReportForPdfImport();

  // Upload PDF
  const bucket = PDF_BUCKET_DEFAULT;
  const safeName = String(file.name || "report.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const path = `${PDF_FOLDER_PREFIX}/${report.id}/${Date.now()}_${safeName}`;

  setSaveStatus("Uploading PDF…");
  const { error: upErr } = await state.supabase
    .storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: "application/pdf" });

  if (upErr) throw upErr;

  // Link PDF to report immediately (so it can be downloaded even if AI fails)
  setSaveStatus("Linking PDF…");
  const linked = await updateReportHeader(report.id, {
    ...headerInputs(),
    pdf_bucket: bucket,
    pdf_path: path,
    pdf_filename: safeName,
  });
  state.activeReport = linked;
  setPdfInfo(linked);

  // Call Edge Function
  setSaveStatus("Extracting via AI…");
  const { data, error } = await state.supabase.functions.invoke("import-post-inspection-pdf", {
    body: { report_id: report.id, pdf_storage_path: path },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "AI import failed");

  const extracted = data.extracted || {};
  const h = extracted.header || {};

  // Apply header fields
  // - vessel: match by name if possible
  // - date: dd.mm.yyyy -> yyyy-mm-dd
  const isoDate = ddmmyyyyToIso(h.inspection_date);

  let vessel_id = el("vesselSelect").value || null;
  if (h.vessel_name) {
    const hit = (state.vessels || []).find(v =>
      String(v.name || "").trim().toLowerCase() === String(h.vessel_name).trim().toLowerCase()
    );
    if (hit?.id) vessel_id = hit.id;
  }

  if (vessel_id) el("vesselSelect").value = vessel_id;
  if (isoDate) el("inspectionDate").value = isoDate;
  if (h.port_name) el("portName").value = h.port_name;
  if (h.port_code) el("portCode").value = h.port_code;
  if (h.ocimf_inspecting_company) el("ocimfCompany").value = h.ocimf_inspecting_company;
  if (h.report_reference) el("reportRef").value = h.report_reference;

  // Save header (inspector_name stays manual)
  setSaveStatus("Saving extracted header…");
  const updatedHeader = await updateReportHeader(report.id, {
    ...headerInputs(),
    pdf_bucket: bucket,
    pdf_path: path,
    pdf_filename: safeName,
  });

  state.reports = await loadReportsFromDb();
  state.activeReport = updatedHeader;
  renderReportSelect();
  el("reportSelect").value = updatedHeader.id;
  loadReportIntoHeader(updatedHeader);

  // Insert observations
  const obs = Array.isArray(extracted.observations) ? extracted.observations : [];
  const rows = [];

  for (const item of obs) {
    const qbase = item?.question_base;
    const qno = findLibraryQno(qbase);
    if (!qno) continue;

    const isNeg = String(item?.obs_type || "").toLowerCase() === "negative";
    const isPos = String(item?.obs_type || "").toLowerCase() === "positive";

    const observation_type = isNeg
      ? "negative_observation"
      : isPos
        ? "positive_observation"
        : "observation_comment";

    const remarks = String(item?.observation_text || "").trim();

    rows.push({
      report_id: report.id,
      question_no: qno,
      has_observation: true,
      observation_type,
      pgno_selected: [], // PGNO selection remains manual
      remarks,
    });
  }

  if (rows.length) {
    setSaveStatus(`Saving ${rows.length} observation(s)…`);
    await upsertObservationsDirect(report.id, rows);
  }

  state.observations = await loadObservationsForReport(report.id);
  renderQuestionList();
  clearDetailPane();
  setSaveStatus(`AI import done (${rows.length} observation(s))`);
}

async function downloadLinkedPdf() {
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
    alert("Download failed: " + (error?.message || String(error)));
    setSaveStatus("Error");
    return;
  }

  const url = data?.signedUrl;
  if (!url) {
    alert("Download failed: signed URL missing.");
    setSaveStatus("Error");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
  setSaveStatus("Ready");
}

/* -------------------------
   Stats / Finalize
------------------------- */

function renderStatsDialog() {
  if (!state.activeReport) {
    alert("No active report. Please select or create a report first.");
    return;
  }

  const total = state.lib.length;
  const observed = getObservedQnos().sort((a, b) => String(a).localeCompare(String(b)));
  const missing = getMissingPgnoQnos().sort((a, b) => String(a).localeCompare(String(b)));

  const obsCount = observed.length;
  const missCount = missing.length;
  const pct = total ? Math.round((obsCount / total) * 1000) / 10 : 0;

  el("statTotalQ").textContent = String(total);
  el("statObservedQ").textContent = String(obsCount);
  el("statMissingPgno").textContent = String(missCount);
  el("statPct").textContent = String(pct) + "%";

  const byChap = new Map();
  for (const qno of observed) {
    const q = state.libByNo.get(qno);
    const ch = q ? String(getChap(q) || "—") : "—";
    byChap.set(ch, (byChap.get(ch) || 0) + 1);
  }
  const byChapLines = [...byChap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => `Chapter ${ch}: ${n}`);
  el("statByChapter").textContent = byChapLines.length ? byChapLines.join("\n") : "-";

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
  el("statByType").textContent = byTypeLines.length ? byTypeLines.join("\n") : "-";

  el("statObsList").textContent = observed.length ? observed.join(", ") : "-";
  el("statMissingList").textContent = missing.length ? missing.join(", ") : "-";

  el("statsDialog").showModal();
}

function exportObservationsCsv() {
  if (!state.activeReport) {
    alert("No active report.");
    return;
  }

  const observed = getObservedQnos().sort((a, b) => String(a).localeCompare(String(b)));

  const lines = [];
  const header = [
    "vessel_name",
    "inspection_date",
    "report_ref",
    "question_no",
    "chapter",
    "section_name",
    "short_text",
    "observation_type",
    "pgno_selected",
    "pgno_count",
    "remarks",
  ];
  lines.push(header.join(","));

  const labelMap = new Map(OBS_TYPES.map(o => [o.value, o.label]));

  for (const qno of observed) {
    const q = state.libByNo.get(qno);
    const entry = state.observations[qno];

    const pg = Array.isArray(entry?.pgno_selected)
      ? entry.pgno_selected.map((x) => `PGNO ${x.idx}`).join("; ")
      : "";

    const pgCount = Array.isArray(entry?.pgno_selected) ? entry.pgno_selected.length : 0;

    const row = [
      state.activeReport.vessel_name || "",
      state.activeReport.inspection_date || "",
      state.activeReport.report_ref || "",
      qno,
      q ? getChap(q) : "",
      q ? getSection(q) : "",
      q ? getShort(q) : "",
      labelMap.get(entry?.observation_type) || (entry?.observation_type || ""),
      pg,
      String(pgCount),
      entry?.remarks || "",
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`);

    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");

  const safeV = String(state.activeReport.vessel_name || "vessel").replace(/[^a-z0-9]+/gi, "_");
  const safeD = String(state.activeReport.inspection_date || "date").replace(/[^0-9-]+/g, "_");
  a.download = `post_inspection_observations_${safeV}_${safeD}.csv`;

  a.href = URL.createObjectURL(blob);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function finalizeCheck() {
  if (!state.activeReport) {
    alert("No active report.");
    return;
  }
  const missing = getMissingPgnoQnos().sort((a, b) => String(a).localeCompare(String(b)));
  if (!missing.length) {
    alert("Finalize check: OK.\n\nNo observed questions are missing PGNO ticks.");
    return;
  }
  renderStatsDialog();
}

/* -------------------------
   Init
------------------------- */

async function init() {
  // Build pill
  const b = el("buildPill");
  if (b) b.textContent = `build: ${POST_INSPECTION_BUILD}`;
  console.log("[Post-Inspection] Loaded", POST_INSPECTION_BUILD);

  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");

  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);
  el("dashboardBtn").addEventListener("click", () => window.location.href = "./q-dashboard.html");
  el("modeBtn").addEventListener("click", () => window.location.href = "./mode_selection.html");

  state.supabase = window.__supabaseClient;
  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded before post_inspection.js.");
  }

  setSaveStatus("Loading…");

  // Vessels
  state.vessels = await loadVessels();
  renderVesselsSelect();

  // Locked question library
  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  state.libByNo = new Map();
  for (const q of state.lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  // Chapters
  const chSet = new Set();
  for (const q of state.lib) {
    const ch = getChap(q);
    if (ch) chSet.add(ch);
  }
  state.chapters = [...chSet].sort((a, b) => String(a).localeCompare(String(b)));
  renderChapterFilter();

  // Reports
  state.reports = await loadReportsFromDb();
  renderReportSelect();

  // Default date
  if (!el("inspectionDate").value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  // Wiring
  el("reportSelect").addEventListener("change", async () => {
    const id = el("reportSelect").value || null;
    await setActiveReportById(id);
  });

  el("newReportBtn").addEventListener("click", handleNewReport);
  el("saveHeaderBtn").addEventListener("click", handleSaveHeader);
  el("deleteReportBtn").addEventListener("click", handleDeleteReport);

  el("exportBtn").addEventListener("click", exportActiveReportJson);

  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) await importReportJsonFromFile(f);
    e.target.value = "";
  });

  // PDF button -> hidden input
  el("importPdfBtn").addEventListener("click", () => {
    const input = el("importPdfFile");
    if (!input) return alert("PDF input is missing from HTML (importPdfFile).");
    input.click();
  });

  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importReportPdfAiFromFile(f);
    } catch (err) {
      console.error(err);
      alert("PDF import failed: " + (err?.message || String(err)));
      setSaveStatus("Error");
    } finally {
      e.target.value = "";
    }
  });

  el("downloadPdfBtn").addEventListener("click", downloadLinkedPdf);

  el("statsBtn").addEventListener("click", renderStatsDialog);
  el("finalizeBtn").addEventListener("click", finalizeCheck);

  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());
  el("exportCsvBtn").addEventListener("click", exportObservationsCsv);

  el("searchInput").addEventListener("input", renderQuestionList);
  el("chapterFilter").addEventListener("change", renderQuestionList);
  el("onlyObsFilter").addEventListener("change", renderQuestionList);
  el("missingPgnoFilter").addEventListener("change", renderQuestionList);

  // Auto-load first report
  if (state.reports.length) {
    await setActiveReportById(state.reports[0].id);
  } else {
    await setActiveReportById(null);
    if (state.vessels.length) el("vesselSelect").value = state.vessels[0].id;
  }

  renderQuestionList();
  setSaveStatus(state.activeReport ? "Loaded" : "Not saved");

  window.addEventListener("beforeunload", (e) => {
    if (hasPending()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
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
