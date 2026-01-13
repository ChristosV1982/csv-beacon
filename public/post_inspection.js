// public/post_inspection.js
// Supabase-backed Post-Inspection module (no localStorage)
// Tables:
//   post_inspection_reports
//   post_inspection_observations

import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

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

const state = {
  me: null,
  supabase: null,

  vessels: [],
  lib: [],
  libByNo: new Map(),
  chapters: [],

  reports: [],
  activeReport: null,          // header row
  observations: {},            // map: question_no -> row (has_observation, pgno_selected, remarks, updated_at)
  selectedQno: null,

  saveTimer: null,
};

// ---------- Library helpers ----------
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
  return usable.slice(0, 60);
}

// ---------- UI ----------
function setSaveStatus(text) {
  el("saveStatus").textContent = text || "Not saved";
}
function setActivePill(text) {
  el("activeReportPill").textContent = text || "No active report";
}

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

function reportLabel(r) {
  const v = r.vessel_name || "Unknown vessel";
  const d = r.inspection_date || "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${v} | ${d}${ref}`;
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

function currentReportHasObs(qno) {
  const row = state.observations?.[qno];
  return !!(row && row.has_observation);
}

function renderQuestionList() {
  const list = el("questionList");
  list.innerHTML = "";

  const term = String(el("searchInput").value || "").trim().toLowerCase();
  const chap = String(el("chapterFilter").value || "").trim();
  const onlyObs = !!el("onlyObsFilter").checked;

  const rows = [];

  for (const item of state.lib) {
    const qno = getQno(item);
    if (!qno) continue;

    if (chap && String(getChap(item)) !== chap) continue;

    const hasObs = currentReportHasObs(qno);
    if (onlyObs && !hasObs) continue;

    if (term) {
      const hay = [qno, getShort(item), getSection(item), getQText(item), getChap(item)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(term)) continue;
    }

    rows.push({ qno, item, hasObs });
  }

  rows.sort((a, b) => String(a.qno).localeCompare(String(b.qno)));

  for (const r of rows) {
    const div = document.createElement("div");
    div.className = "item" + (state.selectedQno === r.qno ? " active" : "");

    const badge = r.hasObs
      ? `<span class="badge obs">Observed</span>`
      : `<span class="badge">No Obs</span>`;

    div.innerHTML = `
      <div class="itemTop">
        <div>
          <div class="qno">${esc(r.qno)} — ${esc(getShort(r.item))}</div>
          <div class="qst">${esc(getSection(r.item))}</div>
        </div>
        <div>${badge}</div>
      </div>
    `;

    div.addEventListener("click", async () => {
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

function ensureActiveReportOrWarn() {
  if (!state.activeReport) {
    alert("No active post-inspection report. Please select an existing report or create a new one, then Save Report Header.");
    return false;
  }
  return true;
}

function loadReportIntoHeader(r) {
  el("vesselSelect").value = r.vessel_id || "";
  el("inspectionDate").value = r.inspection_date || "";
  el("reportRef").value = r.report_ref || "";
  el("reportTitle").value = r.title || "";
  setActivePill("Active: " + reportLabel(r));
}

function clearDetailPane() {
  el("detailPane").innerHTML = `
    <div style="font-weight:950; color:#35507b;">
      Select a question from the list to record post-inspection observations and tick PGNO(s).
    </div>
  `;
}

// ---------- Supabase data access ----------
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
  // Avoid joins to reduce RLS surprises; map vessel names in a second query.
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, report_ref, title, created_at, updated_at")
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
    .select("report_id, question_no, has_observation, pgno_selected, remarks, updated_at")
    .eq("report_id", reportId);

  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    map[row.question_no] = row;
  }
  return map;
}

async function createReportHeader({ vessel_id, inspection_date, report_ref, title }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .insert([{ vessel_id, inspection_date, report_ref, title }])
    .select("id, vessel_id, inspection_date, report_ref, title, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function updateReportHeader(reportId, { vessel_id, inspection_date, report_ref, title }) {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .update({ vessel_id, inspection_date, report_ref, title })
    .eq("id", reportId)
    .select("id, vessel_id, inspection_date, report_ref, title, created_at, updated_at")
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

async function upsertObservation({ report_id, question_no, has_observation, pgno_selected, remarks }) {
  const payload = {
    report_id,
    question_no,
    has_observation: !!has_observation,
    pgno_selected: Array.isArray(pgno_selected) ? pgno_selected : [],
    remarks: remarks ?? null,
  };

  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .upsert(payload, { onConflict: "report_id,question_no" })
    .select("report_id, question_no, has_observation, pgno_selected, remarks, updated_at")
    .single();

  if (error) throw error;
  return data;
}

async function deleteObservation(report_id, question_no) {
  const { error } = await state.supabase
    .from("post_inspection_observations")
    .delete()
    .eq("report_id", report_id)
    .eq("question_no", question_no);

  if (error) throw error;
}

// ---------- Detail pane (record obs + PGNO ticks) ----------
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

  const row = state.observations[qno] || null;
  const hasObs = !!(row && row.has_observation);

  const pgnoBullets = getPgnoBullets(q);
  const selected = new Set(
    (row?.pgno_selected || []).map(x => Number(x.idx)).filter(n => Number.isFinite(n))
  );

  pane.innerHTML = `
    <h3 class="detailTitle">${esc(qno)} — ${esc(shortText)}</h3>
    <div class="meta">
      Chapter: ${esc(chap)} | Section: ${esc(sect)} | Risk: ${esc(risk)} | Type: ${esc(typ)}
    </div>

    <div class="qtext">${esc(qText)}</div>

    <div class="toggleRow">
      <label>
        <input type="checkbox" id="obsToggle" ${hasObs ? "checked" : ""}/>
        Observation received for this question
      </label>

      <button class="btn btn-muted" id="clearBtn" ${hasObs ? "" : "disabled"}>Clear observation</button>
    </div>

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
      <div style="font-weight:900; color:#35507b;" id="qSaveMsg"></div>
    </div>
  `;

  const pgList = pane.querySelector("#pgnoList");
  const toggle = pane.querySelector("#obsToggle");
  const clearBtn = pane.querySelector("#clearBtn");
  const remarks = pane.querySelector("#obsRemarks");
  const saveBtn = pane.querySelector("#saveBtn");
  const msg = pane.querySelector("#qSaveMsg");

  if (row?.remarks) remarks.value = row.remarks;

  // Populate PGNO list
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

  async function doSave(immediateMessage = true) {
    if (!ensureActiveReportOrWarn()) return;

    const observed = !!toggle.checked;

    if (!observed) {
      // If not observed -> delete row if exists
      if (state.observations[qno]) {
        setSaveStatus("Saving…");
        await deleteObservation(state.activeReport.id, qno);
        delete state.observations[qno];
        renderQuestionList();
        setSaveStatus("Saved");
      }
      if (immediateMessage) msg.textContent = "Saved (no observation).";
      return;
    }

    const pg = getSelectedPgno();
    const rem = String(remarks.value || "");

    setSaveStatus("Saving…");
    const saved = await upsertObservation({
      report_id: state.activeReport.id,
      question_no: qno,
      has_observation: true,
      pgno_selected: pg,
      remarks: rem,
    });

    state.observations[qno] = saved;
    renderQuestionList();
    setSaveStatus("Saved");

    if (immediateMessage) {
      msg.textContent = pg.length
        ? "Saved."
        : "Saved. (No PGNO ticked — allowed, but consider ticking the applicable PGNO.)";
    }
  }

  function setControlsEnabled(on) {
    remarks.disabled = !on;
    clearBtn.disabled = !on;
    pgList.querySelectorAll(".pgChk").forEach((c) => (c.disabled = !on));
  }

  setControlsEnabled(hasObs);

  toggle.addEventListener("change", () => {
    if (!ensureActiveReportOrWarn()) {
      toggle.checked = false;
      return;
    }

    const on = !!toggle.checked;
    setControlsEnabled(on);

    if (!on) {
      msg.textContent = "Observation toggled off. Click Save to remove from database, or Clear to remove immediately.";
    } else {
      msg.textContent = "";
    }
  });

  clearBtn.addEventListener("click", async () => {
    if (!ensureActiveReportOrWarn()) return;

    const ok = confirm("Clear this observation (remove from database)?");
    if (!ok) return;

    setSaveStatus("Saving…");
    await deleteObservation(state.activeReport.id, qno);
    delete state.observations[qno];

    toggle.checked = false;
    remarks.value = "";
    setControlsEnabled(false);

    renderQuestionList();
    setSaveStatus("Saved");
    msg.textContent = "Observation cleared.";
  });

  saveBtn.addEventListener("click", async () => {
    try {
      await doSave(true);
    } catch (e) {
      console.error(e);
      alert("Save failed: " + (e?.message || String(e)));
      setSaveStatus("Error");
    }
  });

  // Debounced autosave on remarks + PGNO ticks (only when observation ON)
  function debounceAutosave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      try {
        if (!toggle.checked) return;
        await doSave(false);
      } catch (e) {
        console.error(e);
        setSaveStatus("Error");
      }
    }, 650);
  }

  remarks.addEventListener("input", () => {
    if (!toggle.checked) return;
    debounceAutosave();
  });

  pgList.querySelectorAll(".pgChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      if (!toggle.checked) return;
      debounceAutosave();
    });
  });
}

// ---------- Report actions ----------
async function setActiveReportById(id) {
  if (!id) {
    state.activeReport = null;
    state.observations = {};
    state.selectedQno = null;
    renderReportSelect();
    setActivePill("No active report");
    setSaveStatus("Not saved");
    clearDetailPane();
    renderQuestionList();
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

function headerInputs() {
  const vessel_id = String(el("vesselSelect").value || "").trim();
  const inspection_date = String(el("inspectionDate").value || "").trim();
  const report_ref = String(el("reportRef").value || "").trim();
  const title = String(el("reportTitle").value || "").trim();

  return { vessel_id, inspection_date, report_ref, title };
}

async function handleNewReport() {
  const { vessel_id, inspection_date, report_ref, title } = headerInputs();

  if (!vessel_id) { alert("Please select a vessel first."); return; }
  if (!inspection_date) { alert("Please set an inspection date."); return; }

  setSaveStatus("Saving…");

  try {
    const created = await createReportHeader({ vessel_id, inspection_date, report_ref, title });

    // Enrich vessel_name locally
    const vessel_name = state.vessels.find(v => v.id === vessel_id)?.name || "";
    const enriched = { ...created, vessel_name };

    // refresh list from DB (source of truth)
    state.reports = await loadReportsFromDb();

    // Set active
    await setActiveReportById(enriched.id);
    setSaveStatus("Saved");
  } catch (e) {
    console.error(e);
    alert("Create report failed: " + (e?.message || String(e)));
    setSaveStatus("Error");
  }
}

async function handleSaveHeader() {
  const { vessel_id, inspection_date, report_ref, title } = headerInputs();

  if (!vessel_id) { alert("Please select a vessel first."); return; }
  if (!inspection_date) { alert("Please set an inspection date."); return; }

  setSaveStatus("Saving…");

  try {
    if (!state.activeReport) {
      // create
      const created = await createReportHeader({ vessel_id, inspection_date, report_ref, title });
      state.reports = await loadReportsFromDb();
      await setActiveReportById(created.id);
      setSaveStatus("Saved");
      return;
    }

    // update
    const updated = await updateReportHeader(state.activeReport.id, { vessel_id, inspection_date, report_ref, title });

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

async function exportActiveReportJson() {
  if (!state.activeReport) {
    alert("No active report to export.");
    return;
  }

  // Export header + current obs map (exact DB content)
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
    const report_ref = String(rep.report_ref || "").trim();
    const title = String(rep.title || "").trim();

    if (!vessel_id) throw new Error("Import: report.vessel_id missing.");
    if (!inspection_date) throw new Error("Import: report.inspection_date missing.");

    setSaveStatus("Importing…");

    // Create a NEW report record (do not reuse old ID)
    const created = await createReportHeader({ vessel_id, inspection_date, report_ref, title });

    // Insert observations in batches
    const rows = Array.isArray(obs) ? obs : [];
    const payload = rows
      .filter(r => r && r.question_no)
      .map(r => ({
        report_id: created.id,
        question_no: String(r.question_no),
        has_observation: true,
        pgno_selected: Array.isArray(r.pgno_selected) ? r.pgno_selected : [],
        remarks: r.remarks ?? null,
      }));

    // Batch upsert
    const batchSize = 500;
    for (let i = 0; i < payload.length; i += batchSize) {
      const chunk = payload.slice(i, i + batchSize);
      const { error } = await state.supabase
        .from("post_inspection_observations")
        .upsert(chunk, { onConflict: "report_id,question_no" });
      if (error) throw error;
    }

    // Refresh
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

// ---------- Statistics + CSV ----------
function getObservedQnos() {
  const obs = state.observations || {};
  return Object.keys(obs).filter(qno => obs[qno]?.has_observation);
}

function renderStatsDialog() {
  if (!state.activeReport) {
    alert("No active report. Please select or create a report first.");
    return;
  }

  const total = state.lib.length;
  const observed = getObservedQnos().sort((a, b) => String(a).localeCompare(String(b)));
  const obsCount = observed.length;
  const pct = total ? Math.round((obsCount / total) * 1000) / 10 : 0;

  el("statTotalQ").textContent = String(total);
  el("statObservedQ").textContent = String(obsCount);
  el("statPct").textContent = String(pct) + "%";

  // By chapter counts
  const by = new Map();
  for (const qno of observed) {
    const q = state.libByNo.get(qno);
    const ch = q ? String(getChap(q) || "—") : "—";
    by.set(ch, (by.get(ch) || 0) + 1);
  }
  const byLines = [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ch, n]) => `Chapter ${ch}: ${n}`);

  el("statByChapter").textContent = byLines.length ? byLines.join("\n") : "-";
  el("statObsList").textContent = observed.length ? observed.join(", ") : "-";

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
    "pgno_selected",
    "remarks",
  ];
  lines.push(header.join(","));

  for (const qno of observed) {
    const q = state.libByNo.get(qno);
    const entry = state.observations[qno];

    const pg = Array.isArray(entry?.pgno_selected)
      ? entry.pgno_selected.map((x) => `PGNO ${x.idx}`).join("; ")
      : "";

    const row = [
      state.activeReport.vessel_name || "",
      state.activeReport.inspection_date || "",
      state.activeReport.report_ref || "",
      qno,
      q ? getChap(q) : "",
      q ? getSection(q) : "",
      q ? getShort(q) : "",
      pg,
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

// ---------- Init ----------
async function init() {
  // Auth guard: admin-only
  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  // Reuse client created by auth.js (preferred)
  state.supabase = window.__supabaseClient;
  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded before post_inspection.js.");
  }

  setSaveStatus("Loading…");

  // Vessels
  state.vessels = await loadVessels();
  renderVesselsSelect();

  // Library (locked)
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

  // Reports from DB
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

  // Wire events
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

  el("statsBtn").addEventListener("click", renderStatsDialog);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());
  el("exportCsvBtn").addEventListener("click", exportObservationsCsv);

  el("searchInput").addEventListener("input", renderQuestionList);
  el("chapterFilter").addEventListener("change", renderQuestionList);
  el("onlyObsFilter").addEventListener("change", renderQuestionList);

  // If reports exist, auto-load first; otherwise show empty
  if (state.reports.length) {
    await setActiveReportById(state.reports[0].id);
  } else {
    await setActiveReportById(null);
    // preselect first vessel for convenience
    if (state.vessels.length) el("vesselSelect").value = state.vessels[0].id;
  }

  renderQuestionList();
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
