const DETAIL_BUILD = "post_inspection_detail_v1_page_split_2026-04-07";
const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";
const HUMAN_POSITIVE_FIXED_NOC = "Exceeded normal expectation.";

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForAuth(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (window.AUTH && window.AUTH.ensureSupabase) return true;
    await sleep(50);
  }
  return false;
}

function nowIso() {
  return new Date().toISOString();
}

function ddmmyyyyToIso(ddmmyyyy) {
  const s = String(ddmmyyyy || "").trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function canonicalQno(qno) {
  const parts = String(qno || "").trim().split(".").filter(Boolean);
  if (!parts.length) return "";
  return parts.map((p) => String(Number((p.replace(/^0+/, "") || "0")))).join(".");
}

function normDesignation(d) {
  const s = String(d || "").trim().toLowerCase();
  if (s === "human") return "Human";
  if (s === "process") return "Process";
  if (s === "hardware") return "Hardware";
  if (s === "photo") return "Photo";
  return String(d || "").trim();
}

function obsRowTypeLabel(kind) {
  if (kind === "negative") return `<span class="obs-badge neg">Negative</span>`;
  if (kind === "positive") return `<span class="obs-badge pos">Positive</span>`;
  return `<span class="obs-badge lae">Largely</span>`;
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const HARDWARE_NOC_OPTIONS = [
  "Maintenance task available – not completed",
  "Maintenance task available – records incompatible with condition seen",
  "No maintenance task developed",
  "Maintenance deferred – awaiting spares",
  "Maintenance deferred – awaiting technician",
  "Maintenance deferred – awaiting out of service / gas free",
  "Sudden failure – maintenance tasks available and up to date",
  "Other - text",
];

const PROCESS_NOC_OPTIONS = [
  "No procedure",
  "Procedure not present/available/accessible",
  "Too many/conflicting procedures",
  "Procedure clarity and understandability",
  "Procedure accuracy/correctness",
  "Procedure realism/feasibility/suitability",
  "Procedure completeness/validity/version",
  "Communication of procedure/practice updates",
  "Other - text",
];

const HUMAN_PIF_OPTIONS = [
  "1. Recognition of safety criticality of the task or associated steps",
  "2. Custom and practice surrounding use of procedures",
  "3. Procedures accessible, helpful, understood and accurate for task",
  "4. Team dynamics, communications and coordination with others",
  "5. Evidence of stress, workload, fatigue, time constraints",
  "6. Factors such as morale, motivation, nervousness",
  "7. Workplace ergonomics incl. signage, tools, layout, space, noise, light, heat, etc.",
  "8. Human-Machine Interface (E.g.: Controls, Alarms, etc.)",
  "9. Opportunity to learn or practice",
  "10. Not Identified",
];

function isHumanPositive(item) {
  return normDesignation(item?.designation) === "Human" &&
         String(item?.obs_type || "").trim().toLowerCase() === "positive";
}

function humanSocFromItem(item) {
  const direct = String(item?.positive_rank || "").trim();
  if (direct) return direct;

  const sx = String(item?.source_excerpt || "").trim();
  const m = sx.match(/^Human\s+(.+?):/i);
  if (m) return String(m[1] || "").trim();

  return "";
}

function humanPifsFromItem(item) {
  if (isHumanPositive(item)) return [];
  const candidates = [];
  const cc = String(item?.classification_coding || "").trim();
  const noc = String(item?.nature_of_concern || "").trim();
  if (cc) candidates.push(...cc.split("|").map((x) => x.trim()).filter(Boolean));
  if (noc) candidates.push(...noc.split("|").map((x) => x.trim()).filter(Boolean));
  return HUMAN_PIF_OPTIONS.filter((opt) => candidates.includes(opt));
}

function socDisplay(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return humanSocFromItem(item);
  return String(item?.classification_coding || "").trim();
}

function nocDisplay(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") {
    if (isHumanPositive(item)) return HUMAN_POSITIVE_FIXED_NOC;
    return humanPifsFromItem(item).join(" | ");
  }
  return String(item?.nature_of_concern || "").trim();
}

function supportingCommentDisplay(item) {
  return String(item?.observation_text || item?.remarks || "").trim();
}

function selectedPgnoText(pgno_selected) {
  const arr = Array.isArray(pgno_selected) ? pgno_selected : [];
  if (!arr.length) return "";
  return arr.map((x) => String(x?.text || "").trim()).filter(Boolean).join(" • ");
}

function itemNeedsPgno(item) {
  return item?.obs_type === "negative" || item?.obs_type === "largely";
}

function missingPgnoForItem(item) {
  if (!itemNeedsPgno(item)) return false;
  const arr = Array.isArray(item.pgno_selected) ? item.pgno_selected : [];
  return arr.length === 0;
}

const state = {
  me: null,
  supabase: null,
  vessels: [],
  activeReport: null,
  observationItems: [],
  extractedItems: [],
};

function setSaveStatus(text) {
  el("saveStatus").textContent = text || "Not saved";
}

function setActivePill(text) {
  el("activeReportPill").textContent = text || "No active report";
}

async function loadVessels() {
  const { data, error } = await state.supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
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

async function loadReportById(reportId) {
  const selectA =
    "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at";
  const selectB =
    "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at";

  try {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .select(selectA)
      .eq("id", reportId)
      .single();
    if (error) throw error;
    return data;
  } catch {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .select(selectB)
      .eq("id", reportId)
      .single();
    if (error) throw error;
    return data;
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
  el("reportTitle").value = r.title || "";
  el("inspectorName").value = r.inspector_name || "";
  el("inspectorCompany").value = r.inspector_company || "";
  el("pdfStatus").textContent = r.pdf_storage_path
    ? `Stored: ${r.pdf_storage_path.split("/").pop()}`
    : "No PDF linked";
}

function headerInputs() {
  return {
    vessel_id: String(el("vesselSelect").value || "").trim(),
    inspection_date: String(el("inspectionDate").value || "").trim(),
    port_name: String(el("portName").value || "").trim() || null,
    port_code: String(el("portCode").value || "").trim() || null,
    ocimf_inspecting_company: String(el("ocimfCompany").value || "").trim() || null,
    report_ref: String(el("reportRef").value || "").trim(),
    title: String(el("reportTitle").value || "").trim() || null,
    inspector_name: String(el("inspectorName").value || "").trim() || null,
    inspector_company: String(el("inspectorCompany").value || "").trim() || null,
    pdf_storage_path: state.activeReport?.pdf_storage_path || null,
  };
}

async function createReportHeader(payload) {
  try {
    const { data, error } = await state.supabase
      .from("post_inspection_reports")
      .insert([payload])
      .select(
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at"
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
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at"
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
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, examined_questions, examined_count, created_at, updated_at"
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
        "id, vessel_id, inspection_date, port_name, port_code, ocimf_inspecting_company, report_ref, title, inspector_name, inspector_company, pdf_storage_path, created_at, updated_at"
      )
      .single();
    if (error) throw error;
    return data;
  }
}

async function deleteReport(reportId) {
  const { error } = await state.supabase
    .from("post_inspection_reports")
    .delete()
    .eq("id", reportId);
  if (error) throw error;
}

async function loadObservationItemsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .select("*")
    .eq("report_id", reportId)
    .order("question_no", { ascending: true })
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadLegacyObservationsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .select("*")
    .eq("report_id", reportId);
  if (error) throw error;

  return (data || []).map((row, idx) => ({
    id: `legacy-${reportId}-${row.question_no}-${idx}`,
    report_id: row.report_id,
    question_no: canonicalQno(row.question_no || row.question_base || ""),
    question_base: canonicalQno(row.question_base || row.question_no || ""),
    question_full: null,
    has_observation: row.has_observation !== false,
    observation_type: row.observation_type,
    obs_type: row.obs_type ||
      (row.observation_type === "negative_observation" ? "negative" :
       row.observation_type === "positive_observation" ? "positive" : "largely"),
    designation: normDesignation(row.designation),
    positive_rank: row.positive_rank || null,
    nature_of_concern: row.nature_of_concern || null,
    classification_coding: row.classification_coding || null,
    observation_text: row.observation_text || null,
    remarks: row.remarks || null,
    pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
    sort_index: idx
  }));
}

function rebuildExtractedItems() {
  const items = (state.observationItems || [])
    .filter((x) => x.has_observation !== false)
    .map((x) => ({
      ...x,
      qno: canonicalQno(x.question_no || x.question_base || ""),
      kind: x.obs_type,
      designation: normDesignation(x.designation),
    }));

  items.sort((a, b) => {
    const qCmp = String(a.qno).localeCompare(String(b.qno), undefined, { numeric: true });
    if (qCmp !== 0) return qCmp;
    return Number(a.sort_index || 0) - Number(b.sort_index || 0);
  });

  state.extractedItems = items;
  updateCounters();
}

function examinedCountFromActive() {
  const r = state.activeReport || {};
  const c = Number(r.examined_count || 0);
  if (Number.isFinite(c) && c > 0) return c;
  const arr = Array.isArray(r.examined_questions) ? r.examined_questions : null;
  if (arr && arr.length) return arr.length;
  return 0;
}

function updateCounters() {
  const items = state.extractedItems || [];
  el("questionsExaminedVal").textContent = String(examinedCountFromActive());
  el("itemsExtractedVal").textContent = String(items.length);
  el("cntNeg").textContent = String(items.filter((x) => x.kind === "negative").length);
  el("cntPos").textContent = String(items.filter((x) => x.kind === "positive").length);
  el("cntLae").textContent = String(items.filter((x) => x.kind === "largely").length);
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
        socDisplay(it),
        nocDisplay(it),
        supportingCommentDisplay(it),
        it.question_full || "",
        it.source_excerpt || "",
      ].join(" ").toLowerCase();
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
    return;
  }

  const items = applyObsFilters(state.extractedItems || []);
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="7" class="muted">No items match the current filters.</td></tr>`;
    renderObsSummary();
    return;
  }

  body.innerHTML = items.map((it) => {
    const pgRequired = itemNeedsPgno(it);
    const pgText = selectedPgnoText(it.pgno_selected);
    return `
      <tr class="obs-row" data-id="${esc(it.id)}">
        <td>${esc(it.qno)}</td>
        <td>${obsRowTypeLabel(it.kind)}</td>
        <td>${esc(normDesignation(it.designation) || "—")}</td>
        <td title="${esc(socDisplay(it))}">${esc(socDisplay(it) || "—")}</td>
        <td title="${esc(nocDisplay(it))}">${esc(nocDisplay(it) || "—")}</td>
        <td title="${esc(supportingCommentDisplay(it))}">${esc(supportingCommentDisplay(it))}</td>
        <td>${pgRequired ? esc(pgText || "—") : "n/a"}</td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll(".obs-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const itemId = tr.getAttribute("data-id");
      if (!itemId || !state.activeReport?.id) return;
      window.location.href =
        `./post_inspection_observation_detail.html?report_id=${encodeURIComponent(state.activeReport.id)}&item_id=${encodeURIComponent(itemId)}`;
    });
  });

  renderObsSummary();
}

function uniqueCountMap(items, getter) {
  const map = new Map();
  for (const it of items || []) {
    const val = String(getter(it) || "").trim();
    if (!val) continue;
    map.set(val, (map.get(val) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function topLines(items, getter, limit = 12) {
  const pairs = uniqueCountMap(items, getter).slice(0, limit);
  if (!pairs.length) return "—";
  return pairs.map(([k, v]) => `${v} × ${k}`).join("\n");
}

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

  const topQ = topLines(items, (x) => x.qno);
  const topCat = topLines(items, (x) => normDesignation(x.designation));
  const topSoc = topLines(items, (x) => socDisplay(x));
  const topNoc = topLines(items, (x) => nocDisplay(x));
  const topHumanSoc = topLines(items.filter((x) => normDesignation(x.designation) === "Human"), (x) => humanSocFromItem(x));

  const humanPifCounts = new Map();
  for (const it of items.filter((x) => normDesignation(x.designation) === "Human")) {
    for (const p of humanPifsFromItem(it)) {
      humanPifCounts.set(p, (humanPifCounts.get(p) || 0) + 1);
    }
  }
  const topHumanPif = [...humanPifCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([k, v]) => `${v} × ${k}`)
    .join("\n") || "—";

  el("kpiTopQuestions").value = topQ;
  el("kpiTopCategories").value = topCat;
  el("kpiTopSoc").value = topSoc;
  el("kpiTopNoc").value = topNoc;
  el("kpiTopHumanSoc").value = topHumanSoc;
  el("kpiTopHumanPif").value = topHumanPif;

  el("statsDialog").showModal();
}

function finalizeCheck() {
  if (!state.activeReport) return alert("No active report.");

  const missing = (state.extractedItems || []).filter((x) => itemNeedsPgno(x) && missingPgnoForItem(x));
  if (!missing.length) {
    return alert("Finalize check: OK.\n\nNo Negative/Largely items are missing PGNO ticks.");
  }

  const lines = missing.slice(0, 30)
    .map((x) => `- ${x.qno} (${x.kind} / ${x.designation || "—"})`)
    .join("\n");

  alert(
    `Finalize check: NOT OK.\n\nMissing PGNO tick(s) for:\n${lines}` +
    (missing.length > 30 ? `\n… plus ${missing.length - 30} more.` : "")
  );
}

async function downloadActivePdf() {
  if (!state.activeReport?.pdf_storage_path) {
    return alert("This report has no linked PDF.");
  }

  try {
    setSaveStatus("Preparing PDF…");
    const { data, error } = await state.supabase
      .storage
      .from(PDF_BUCKET_DEFAULT)
      .createSignedUrl(state.activeReport.pdf_storage_path, 60);

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

async function importReportPdfAiFromFile(file) {
  if (!file) return;

  setSaveStatus("Uploading PDF…");
  const safeName = String(file.name || "report.pdf").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const tempPath = `${PDF_FOLDER_PREFIX}/tmp/${Date.now()}_${safeName}`;

  const { error: upErr } = await state.supabase
    .storage
    .from(PDF_BUCKET_DEFAULT)
    .upload(tempPath, file, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw upErr;

  setSaveStatus("Extracting via AI…");
  const { data, error } = await state.supabase.functions.invoke(
    "import-post-inspection-pdf",
    { body: { report_id: state.activeReport?.id || "temp", pdf_storage_path: tempPath } }
  );

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "AI import failed");

  const extracted = data.extracted || {};
  const h = extracted.header || {};
  const obs = Array.isArray(extracted.observations) ? extracted.observations : [];
  const examined_questions = Array.isArray(extracted.examined_questions) ? extracted.examined_questions : [];
  const examined_count = Number(extracted.examined_count || examined_questions.length || 0);

  const payload = {
    ...headerInputs(),
    port_name: String(h.port_name || headerInputs().port_name || "").trim() || null,
    port_code: String(h.port_code || headerInputs().port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || headerInputs().ocimf_inspecting_company || "").trim() || null,
    report_ref: String(h.report_reference || headerInputs().report_ref || "").trim(),
    inspection_date: ddmmyyyyToIso(h.inspection_date) || headerInputs().inspection_date,
    pdf_storage_path: tempPath,
    examined_questions,
    examined_count,
  };

  if (!payload.vessel_id) throw new Error("Select vessel first.");

  let report;
  if (state.activeReport?.id) {
    report = await updateReportHeader(state.activeReport.id, payload);
  } else {
    report = await createReportHeader(payload);
  }

  state.activeReport = report;
  loadReportIntoHeader(report);
  setActivePill("Loaded");

  await state.supabase.from("post_inspection_observation_items").delete().eq("report_id", report.id);

  for (let i = 0; i < obs.length; i++) {
    const item = obs[i];
    const designation = normDesignation(item.designation) || (item.obs_type === "positive" ? "Human" : null);

    let classification_coding = String(item.classification_coding || "").trim() || null;
    let nature_of_concern = String(item.nature_of_concern || "").trim() || null;

    if (designation === "Human" && item.obs_type === "positive") {
      classification_coding = null;
      nature_of_concern = HUMAN_POSITIVE_FIXED_NOC;
    } else if (designation !== "Human" && classification_coding && classification_coding.includes(":")) {
      const idx = classification_coding.indexOf(":");
      nature_of_concern = classification_coding.slice(idx + 1).trim() || nature_of_concern;
      classification_coding = classification_coding.slice(0, idx).trim() || classification_coding;
    }

    const row = {
      report_id: report.id,
      question_no: canonicalQno(item.question_base || ""),
      question_base: canonicalQno(item.question_base || ""),
      question_full: String(item.question_full || "").trim() || null,
      has_observation: true,
      observation_type: item.obs_type === "negative"
        ? "negative_observation"
        : item.obs_type === "positive"
          ? "positive_observation"
          : "note_improvement",
      obs_type: String(item.obs_type || "").trim(),
      designation,
      positive_rank: String(item.positive_rank || "").trim() || null,
      nature_of_concern,
      classification_coding,
      observation_text: String(item.observation_text || "").trim() || null,
      remarks: String(item.observation_text || "").trim() || null,
      pgno_selected: [],
      page_hint: item.page_hint ?? null,
      source_excerpt: String(item.source_excerpt || "").trim() || null,
      confidence: item.confidence ?? null,
      sort_index: i,
    };

    const { error: insErr } = await state.supabase
      .from("post_inspection_observation_items")
      .insert([row]);
    if (insErr) throw insErr;
  }

  const fresh = await loadReportById(report.id);
  state.activeReport = fresh;
  loadReportIntoHeader(fresh);

  let items = [];
  try {
    items = await loadObservationItemsForReport(report.id);
  } catch {}
  if (!items.length) {
    items = await loadLegacyObservationsForReport(report.id);
  }

  state.observationItems = items;
  rebuildExtractedItems();
  renderObsTable();
  renderObsSummary();
  setSaveStatus("AI import done");
}

function buildExportPayload() {
  if (!state.activeReport) return null;
  return {
    export_version: "post_inspection_export_v2_multi_items",
    exported_at: nowIso(),
    report_header: { ...state.activeReport },
    observation_items: state.observationItems || [],
  };
}

function exportJson() {
  const payload = buildExportPayload();
  if (!payload) return alert("No active report.");

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
  if (!state.activeReport?.id) return alert("Load or save a report first.");

  const txt = await file.text();
  const payload = JSON.parse(txt);

  await state.supabase.from("post_inspection_observation_items").delete().eq("report_id", state.activeReport.id);

  const items = Array.isArray(payload?.observation_items) ? payload.observation_items : [];
  for (const x of items) {
    const row = { ...x, report_id: state.activeReport.id };
    delete row.id;
    const { error } = await state.supabase.from("post_inspection_observation_items").insert([row]);
    if (error) throw error;
  }

  let freshItems = [];
  try {
    freshItems = await loadObservationItemsForReport(state.activeReport.id);
  } catch {}
  if (!freshItems.length) freshItems = await loadLegacyObservationsForReport(state.activeReport.id);

  state.observationItems = freshItems;
  rebuildExtractedItems();
  renderObsTable();
  renderObsSummary();
  setSaveStatus("Imported");
}

async function saveHeader() {
  const payload = headerInputs();

  if (!payload.vessel_id) return alert("Select vessel.");
  if (!payload.inspection_date) return alert("Inspection date is required.");
  if (!payload.report_ref) return alert("Report Reference is required.");

  setSaveStatus("Saving…");

  let report;
  if (state.activeReport?.id) {
    report = await updateReportHeader(state.activeReport.id, payload);
  } else {
    report = await createReportHeader(payload);
  }

  state.activeReport = report;
  loadReportIntoHeader(report);
  setActivePill("Loaded");
  setSaveStatus("Saved");

  if (!getUrlParam("report_id") && report.id) {
    window.history.replaceState({}, "", `./post_inspection_detail.html?report_id=${encodeURIComponent(report.id)}`);
  }
}

async function deleteCurrentReport() {
  if (!state.activeReport?.id) return alert("No active report.");
  const ok = confirm("Delete this report and its extracted items?");
  if (!ok) return;
  await deleteReport(state.activeReport.id);
  window.location.href = "./post_inspection.html";
}

async function init() {
  el("buildPill").textContent = `build: ${DETAIL_BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded.");

  state.supabase = window.AUTH.ensureSupabase();
  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("backToListBtn").addEventListener("click", () => {
    window.location.href = "./post_inspection.html";
  });

  el("dashboardBtn").addEventListener("click", async () => {
    await safeNavigate(["./dashboard.html", "./su-admin.html", "./index.html", "./"]);
  });

  el("modeSelectBtn").addEventListener("click", async () => {
    await safeNavigate(["./mode_selection.html", "./mode-selection.html", "./index.html", "./"]);
  });

  state.vessels = await loadVessels();
  renderVesselsSelect();

  el("newReportBtn").addEventListener("click", () => {
    window.location.href = "./post_inspection_detail.html";
  });

  el("saveHeaderBtn").addEventListener("click", async () => {
    try {
      await saveHeader();
    } catch (e) {
      console.error(e);
      alert("Save header failed: " + (e?.message || String(e)));
      setSaveStatus("Error");
    }
  });

  el("deleteReportBtn").addEventListener("click", async () => {
    try {
      await deleteCurrentReport();
    } catch (e) {
      console.error(e);
      alert("Delete failed: " + (e?.message || String(e)));
      setSaveStatus("Error");
    }
  });

  el("downloadPdfBtn").addEventListener("click", downloadActivePdf);
  el("importPdfBtn").addEventListener("click", () => el("importPdfFile").click());
  el("importPdfFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importReportPdfAiFromFile(f);
    } catch (err) {
      console.error(err);
      alert("AI import failed:\n\n" + (err?.message || String(err)));
      setSaveStatus("Error");
    } finally {
      e.target.value = "";
    }
  });

  el("exportBtn").addEventListener("click", exportJson);
  el("importBtn").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    try {
      if (f) await importJsonFile(f);
    } catch (err) {
      console.error(err);
      alert("Import failed: " + (err?.message || String(err)));
      setSaveStatus("Error");
    } finally {
      e.target.value = "";
    }
  });

  el("statsBtn").addEventListener("click", renderKpis);
  el("closeStatsBtn").addEventListener("click", () => el("statsDialog").close());
  el("finalizeBtn").addEventListener("click", finalizeCheck);

  el("obsSearch").addEventListener("input", renderObsTable);
  el("obsTypeFilter").addEventListener("change", renderObsTable);
  el("obsDesignationFilter").addEventListener("change", renderObsTable);
  el("onlyMissingPgno").addEventListener("change", renderObsTable);

  const reportId = getUrlParam("report_id");
  if (reportId) {
    state.activeReport = await loadReportById(reportId);
    loadReportIntoHeader(state.activeReport);
    setActivePill("Loaded");

    let items = [];
    try {
      items = await loadObservationItemsForReport(reportId);
    } catch {}
    if (!items.length) items = await loadLegacyObservationsForReport(reportId);

    state.observationItems = items;
    rebuildExtractedItems();
    renderObsTable();
    renderObsSummary();
    setSaveStatus("Loaded");
  } else {
    setActivePill("New unsaved report");
    setSaveStatus("Not saved");
    rebuildExtractedItems();
    renderObsTable();
    renderObsSummary();
  }
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Inspection detail page failed to load: " + (e?.message || String(e)));
  }
})();