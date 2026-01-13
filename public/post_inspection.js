// public/post_inspection.js
import { loadLockedLibraryJson } from "./question_library_loader.js";

const SUPABASE_URL = "https://bdidrcyufazskpuwmfca.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Must stay locked to the same library source
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

// Local storage (cautious first step: no DB schema changes yet)
const STORAGE_KEY_REPORTS = "post_inspection_reports_v1";
const STORAGE_KEY_ACTIVE = "post_inspection_active_report_id_v1";

const state = {
  me: null,
  vessels: [],
  lib: [],
  libByNo: new Map(),
  chapters: [],
  reports: [],
  activeReportId: null,
  activeReport: null,
  selectedQno: null,
  saveTimer: null,
};

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

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return "pi_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
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
  const v = pick(q, ["Risk Level", "risk", "Risk"]);
  return String(v ?? "").trim();
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
  return usable.slice(0, 50);
}

// -------------------------
// LocalStorage persistence
// -------------------------
function loadReports() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveReports(reports) {
  localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(reports));
}

function setActiveReportId(id) {
  state.activeReportId = id || null;
  if (id) localStorage.setItem(STORAGE_KEY_ACTIVE, id);
  else localStorage.removeItem(STORAGE_KEY_ACTIVE);
}

function loadActiveReportId() {
  const id = localStorage.getItem(STORAGE_KEY_ACTIVE);
  return id || null;
}

function upsertReport(report) {
  const idx = state.reports.findIndex((r) => r.id === report.id);
  if (idx >= 0) state.reports[idx] = report;
  else state.reports.unshift(report);

  // Sort by updated_at desc
  state.reports.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  saveReports(state.reports);
  renderReportSelect();
}

// -------------------------
// Supabase data (vessels)
// -------------------------
async function loadVessels() {
  const { data, error } = await supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

// -------------------------
// UI rendering
// -------------------------
function setSaveStatus(text) {
  el("saveStatus").textContent = text || "Not saved";
}

function setActivePill(text) {
  el("activeReportPill").textContent = text || "No active report";
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

    const vName = r.vessel_name || "Unknown vessel";
    const dt = r.inspection_date || "No date";
    const ref = r.report_ref ? ` | ${r.report_ref}` : "";
    o.textContent = `${vName} | ${dt}${ref}`;
    sel.appendChild(o);
  }

  sel.value = state.activeReportId || "";
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

function currentReportHasObs(qno) {
  if (!state.activeReport) return false;
  const obs = state.activeReport.observations?.[qno];
  return !!(obs && obs.has_observation);
}

function renderQuestionList() {
  const list = el("questionList");
  list.innerHTML = "";

  const q = String(el("searchInput").value || "").trim().toLowerCase();
  const chap = String(el("chapterFilter").value || "").trim();
  const onlyObs = !!el("onlyObsFilter").checked;

  const rows = [];

  for (const item of state.lib) {
    const qno = getQno(item);
    if (!qno) continue;

    if (chap && String(getChap(item)) !== chap) continue;

    const hasObs = currentReportHasObs(qno);
    if (onlyObs && !hasObs) continue;

    if (q) {
      const hay = [
        qno,
        getShort(item),
        getSection(item),
        getQText(item),
        getChap(item),
      ].join(" ").toLowerCase();

      if (!hay.includes(q)) continue;
    }

    rows.push({ qno, item, hasObs });
  }

  // keep stable sort by question no (string)
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

function ensureActiveReportOrWarn() {
  if (!state.activeReport) {
    alert("No active report. Please select an existing report or create a new one, then Save Report Header.");
    return false;
  }
  return true;
}

function scheduleSaveActiveReport() {
  if (!state.activeReport) return;

  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    state.activeReport.updated_at = nowIso();
    upsertReport(state.activeReport);
    setSaveStatus("Saved");
  }, 350);
}

function setObservationEntry(qno, entry) {
  if (!state.activeReport) return;
  if (!state.activeReport.observations) state.activeReport.observations = {};
  if (!entry) delete state.activeReport.observations[qno];
  else state.activeReport.observations[qno] = entry;
}

function getObservationEntry(qno) {
  if (!state.activeReport) return null;
  return state.activeReport.observations?.[qno] || null;
}

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

  const entry = getObservationEntry(qno);
  const hasObs = !!(entry && entry.has_observation);

  const pgnoBullets = getPgnoBullets(q);
  const selected = new Set((entry?.pgno_selected || []).map((x) => Number(x.idx)));

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
        Tick the specific PGNO(s) where the observation was raised. No Y/N/NA/NS answering required.
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
      const row = document.createElement("div");
      row.className = "pgnoRow";
      row.innerHTML = `
        <input type="checkbox" class="pgChk" data-idx="${idx}" ${selected.has(idx) ? "checked" : ""} ${hasObs ? "" : "disabled"} />
        <div class="pgnoIdx">PGNO ${idx}</div>
        <div class="pgnoTxt">${esc(txt)}</div>
      `;
      pgList.appendChild(row);
    });
  }

  const toggle = pane.querySelector("#obsToggle");
  const clearBtn = pane.querySelector("#clearBtn");
  const remarks = pane.querySelector("#obsRemarks");
  const saveBtn = pane.querySelector("#saveBtn");
  const msg = pane.querySelector("#qSaveMsg");

  if (entry?.remarks) remarks.value = entry.remarks;

  toggle.addEventListener("change", () => {
    if (!ensureActiveReportOrWarn()) {
      toggle.checked = false;
      return;
    }

    const on = !!toggle.checked;

    if (!on) {
      // Disable controls (but do not delete until user confirms by Clear, or Save)
      clearBtn.disabled = true;
      remarks.disabled = true;
      pgList.querySelectorAll(".pgChk").forEach((c) => (c.disabled = true));
      msg.textContent = "Observation toggled off. Click 'Clear observation' to remove, or Save to store as not observed.";
      return;
    }

    clearBtn.disabled = false;
    remarks.disabled = false;
    pgList.querySelectorAll(".pgChk").forEach((c) => (c.disabled = false));
    msg.textContent = "";
  });

  clearBtn.addEventListener("click", () => {
    if (!ensureActiveReportOrWarn()) return;

    // Clear fully
    toggle.checked = false;
    remarks.value = "";
    remarks.disabled = true;
    pgList.querySelectorAll(".pgChk").forEach((c) => {
      c.checked = false;
      c.disabled = true;
    });
    clearBtn.disabled = true;

    setObservationEntry(qno, null);
    scheduleSaveActiveReport();
    renderQuestionList();
    msg.textContent = "Observation cleared.";
  });

  saveBtn.addEventListener("click", () => {
    if (!ensureActiveReportOrWarn()) return;

    const observed = !!toggle.checked;

    if (!observed) {
      // Store as not observed by removing entry (keeps dataset small)
      setObservationEntry(qno, null);
      scheduleSaveActiveReport();
      renderQuestionList();
      msg.textContent = "Saved (no observation).";
      return;
    }

    const selectedPg = [];
    pgList.querySelectorAll(".pgChk").forEach((c) => {
      if (c.checked) {
        const idx = Number(c.getAttribute("data-idx"));
        const txt = pgnoBullets[idx - 1] || "";
        selectedPg.push({ idx, text: String(txt || "").trim() });
      }
    });

    const newEntry = {
      has_observation: true,
      pgno_selected: selectedPg,
      remarks: String(remarks.value || ""),
      updated_at: nowIso(),
    };

    setObservationEntry(qno, newEntry);
    scheduleSaveActiveReport();
    renderQuestionList();

    if (!selectedPg.length) {
      msg.textContent = "Saved. (No PGNO ticked — allowed, but consider ticking the applicable PGNO.)";
    } else {
      msg.textContent = "Saved.";
    }
  });

  // Gentle autosave on input changes (only if observation is ON)
  remarks.addEventListener("input", () => {
    if (!toggle.checked) return;
    if (!ensureActiveReportOrWarn()) return;

    const cur = getObservationEntry(qno) || { has_observation: true, pgno_selected: [], remarks: "", updated_at: nowIso() };
    cur.has_observation = true;
    cur.remarks = String(remarks.value || "");
    cur.updated_at = nowIso();
    setObservationEntry(qno, cur);
    scheduleSaveActiveReport();
  });

  pgList.querySelectorAll(".pgChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      if (!toggle.checked) return;
      if (!ensureActiveReportOrWarn()) return;

      const bullets = pgnoBullets;
      const selectedPg = [];
      pgList.querySelectorAll(".pgChk").forEach((c) => {
        if (c.checked) {
          const idx = Number(c.getAttribute("data-idx"));
          const txt = bullets[idx - 1] || "";
          selectedPg.push({ idx, text: String(txt || "").trim() });
        }
      });

      const cur = getObservationEntry(qno) || { has_observation: true, pgno_selected: [], remarks: "", updated_at: nowIso() };
      cur.has_observation = true;
      cur.pgno_selected = selectedPg;
      cur.updated_at = nowIso();
      setObservationEntry(qno, cur);
      scheduleSaveActiveReport();
      renderQuestionList();
    });
  });
}

// -------------------------
// Report actions
// -------------------------
function reportLabel(r) {
  const vName = r.vessel_name || "Unknown vessel";
  const dt = r.inspection_date || "No date";
  const ref = r.report_ref ? ` | ${r.report_ref}` : "";
  return `${vName} | ${dt}${ref}`;
}

function loadReportIntoHeader(r) {
  el("vesselSelect").value = r.vessel_id || "";
  el("inspectionDate").value = r.inspection_date || "";
  el("reportRef").value = r.report_ref || "";
  el("reportTitle").value = r.title || "";
  setActivePill("Active: " + reportLabel(r));
}

function setActiveReportById(id) {
  const r = state.reports.find((x) => x.id === id) || null;
  state.activeReport = r;
  setActiveReportId(r ? r.id : null);

  if (r) {
    loadReportIntoHeader(r);
    setSaveStatus("Loaded");
  } else {
    setActivePill("No active report");
    setSaveStatus("Not saved");
  }

  // Reset selection
  state.selectedQno = null;
  el("detailPane").innerHTML = `
    <div style="font-weight:950; color:#35507b;">
      Select a question from the list to record post-inspection observations and tick PGNO(s).
    </div>
  `;
  renderQuestionList();
}

function createNewReportFromHeader() {
  const vessel_id = String(el("vesselSelect").value || "").trim();
  const vessel_name = (state.vessels.find((v) => v.id === vessel_id)?.name) || "";
  const inspection_date = String(el("inspectionDate").value || "").trim();
  const report_ref = String(el("reportRef").value || "").trim();
  const title = String(el("reportTitle").value || "").trim();

  if (!vessel_id) {
    alert("Please select a vessel first.");
    return null;
  }
  if (!inspection_date) {
    alert("Please set an inspection date.");
    return null;
  }

  const r = {
    id: uid(),
    vessel_id,
    vessel_name,
    inspection_date,
    report_ref,
    title,
    created_at: nowIso(),
    updated_at: nowIso(),
    observations: {},
  };

  return r;
}

function saveHeaderToActiveReport() {
  // If no active report -> create one
  if (!state.activeReport) {
    const r = createNewReportFromHeader();
    if (!r) return;
    state.activeReport = r;
    setActiveReportId(r.id);
    upsertReport(r);
    loadReportIntoHeader(r);
    setSaveStatus("Saved");
    renderQuestionList();
    return;
  }

  // Update existing
  const vessel_id = String(el("vesselSelect").value || "").trim();
  const vessel_name = (state.vessels.find((v) => v.id === vessel_id)?.name) || "";
  const inspection_date = String(el("inspectionDate").value || "").trim();
  const report_ref = String(el("reportRef").value || "").trim();
  const title = String(el("reportTitle").value || "").trim();

  if (!vessel_id) {
    alert("Please select a vessel first.");
    return;
  }
  if (!inspection_date) {
    alert("Please set an inspection date.");
    return;
  }

  state.activeReport.vessel_id = vessel_id;
  state.activeReport.vessel_name = vessel_name;
  state.activeReport.inspection_date = inspection_date;
  state.activeReport.report_ref = report_ref;
  state.activeReport.title = title;
  state.activeReport.updated_at = nowIso();

  upsertReport(state.activeReport);
  loadReportIntoHeader(state.activeReport);
  setSaveStatus("Saved");
}

function deleteActiveReport() {
  if (!state.activeReport) return;

  const ok = confirm(`Delete this report?\n\n${reportLabel(state.activeReport)}\n\nThis cannot be undone (unless you exported JSON).`);
  if (!ok) return;

  state.reports = state.reports.filter((r) => r.id !== state.activeReport.id);
  saveReports(state.reports);

  setActiveReportById(null);
  renderReportSelect();
  setSaveStatus("Deleted");
}

function exportActiveReportJson() {
  if (!state.activeReport) {
    alert("No active report to export.");
    return;
  }

  const blob = new Blob([JSON.stringify(state.activeReport, null, 2)], { type: "application/json" });
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

function importReportJsonFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result || "{}"));

      // Minimal validation
      if (!obj || typeof obj !== "object") throw new Error("Invalid JSON.");
      if (!obj.id) obj.id = uid();
      if (!obj.vessel_id || !obj.inspection_date) throw new Error("Missing vessel_id or inspection_date.");
      if (!obj.created_at) obj.created_at = nowIso();
      obj.updated_at = nowIso();
      if (!obj.observations || typeof obj.observations !== "object") obj.observations = {};

      // Enrich vessel_name from current vessels list
      obj.vessel_name = (state.vessels.find((v) => v.id === obj.vessel_id)?.name) || obj.vessel_name || "";

      upsertReport(obj);
      setActiveReportById(obj.id);

      alert("Report imported and loaded successfully.");
    } catch (e) {
      alert("Import failed: " + (e?.message || String(e)));
    }
  };
  reader.readAsText(file);
}

// -------------------------
// Statistics + CSV export
// -------------------------
function getObservedQnos() {
  if (!state.activeReport) return [];
  const obs = state.activeReport.observations || {};
  return Object.keys(obs).filter((qno) => obs[qno]?.has_observation);
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

  // by chapter
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
    const entry = state.activeReport.observations[qno];

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

// -------------------------
// Init
// -------------------------
async function init() {
  // Role guard (exactly as you requested)
  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  setSaveStatus("Loading…");

  // Load vessels
  state.vessels = await loadVessels();
  renderVesselsSelect();

  // Load locked library
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

  // Load stored reports
  state.reports = loadReports();
  renderReportSelect();

  // Restore last active report if still exists
  const last = loadActiveReportId();
  const exists = last && state.reports.some((r) => r.id === last);
  if (exists) {
    setActiveReportById(last);
  } else if (state.reports.length) {
    setActiveReportById(state.reports[0].id);
  } else {
    setActiveReportById(null);

    // Preselect vessel + date for convenience
    if (state.vessels.length) el("vesselSelect").value = state.vessels[0].id;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    el("inspectionDate").value = `${yyyy}-${mm}-${dd}`;
  }

  // Event wiring
  el("reportSelect").addEventListener("change", () => {
    const id = el("reportSelect").value || null;
    setActiveReportById(id);
  });

  el("newReportBtn").addEventListener("click", () => {
    const r = createNewReportFromHeader();
    if (!r) return;

    state.activeReport = r;
    setActiveReportId(r.id);
    upsertReport(r);
    renderReportSelect();
    setActiveReportById(r.id);

    setSaveStatus("Created");
  });

  el("saveHeaderBtn").addEventListener("click", saveHeaderToActiveReport);
  el("deleteReportBtn").addEventListener("click", deleteActiveReport);

  el("exportBtn").addEventListener("click", exportActiveReportJson);

  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importReportJsonFromFile(f);
    e.target.value = "";
  });

  el("statsBtn").addEventListener("click", renderStatsDialog);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());
  el("exportCsvBtn").addEventListener("click", exportObservationsCsv);

  el("searchInput").addEventListener("input", () => renderQuestionList());
  el("chapterFilter").addEventListener("change", () => renderQuestionList());
  el("onlyObsFilter").addEventListener("change", () => renderQuestionList());

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
