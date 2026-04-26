import { loadLockedLibraryJson } from "./question_library_loader.js";

const DETAIL_BUILD = "post_inspection_detail_v4_auto_pgno_match_on_import_2026-04-25";
const PDF_BUCKET_DEFAULT = "inspection-reports";
const PDF_FOLDER_PREFIX = "post_inspections";
const HUMAN_POSITIVE_FIXED_NOC = "Exceeded normal expectation.";
const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

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

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function getQno(q) {
  return String(pick(q, ["No.", "No", "question_no", "QuestionNo", "Question ID"])).trim();
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

function examinedCacheKey(reportId) {
  return `post_inspection_examined_cache_${reportId}`;
}

function saveExaminedCache(reportId, examined_questions, examined_count) {
  if (!reportId) return;
  try {
    localStorage.setItem(
      examinedCacheKey(reportId),
      JSON.stringify({
        examined_questions: Array.isArray(examined_questions) ? examined_questions : [],
        examined_count: Number(examined_count || 0),
        saved_at: nowIso(),
      })
    );
  } catch (e) {
    console.warn("saveExaminedCache failed", e);
  }
}

function loadExaminedCache(reportId) {
  if (!reportId) return null;
  try {
    const raw = localStorage.getItem(examinedCacheKey(reportId));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return {
      examined_questions: Array.isArray(obj?.examined_questions) ? obj.examined_questions : [],
      examined_count: Number(obj?.examined_count || 0),
    };
  } catch (e) {
    console.warn("loadExaminedCache failed", e);
    return null;
  }
}

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

const STOP_WORDS = new Set([
  "the", "and", "or", "to", "of", "in", "on", "for", "with", "as", "by", "at",
  "from", "was", "were", "is", "are", "be", "been", "being", "had", "has",
  "have", "that", "this", "these", "those", "it", "its", "an", "a", "any",
  "not", "no", "but", "however", "where", "which", "who", "whom", "when",
  "then", "there", "their", "such", "per", "into", "within", "without",
  "available", "provided", "evidence", "operator", "vessel", "ship", "system",
]);

function tokenizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[“”‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3)
    .filter((x) => !STOP_WORDS.has(x));
}

function uniqueTokens(text) {
  return [...new Set(tokenizeForMatch(text))];
}

function textMatchScore(observationText, pgnoText) {
  const obsTokens = uniqueTokens(observationText);
  const pgnoTokens = uniqueTokens(pgnoText);

  if (!obsTokens.length || !pgnoTokens.length) return 0;

  const obsSet = new Set(obsTokens);
  const pgnoSet = new Set(pgnoTokens);

  let overlap = 0;
  for (const t of pgnoSet) {
    if (obsSet.has(t)) overlap++;
  }

  const pgnoCoverage = overlap / pgnoSet.size;
  const obsCoverage = overlap / obsSet.size;

  return (pgnoCoverage * 0.75) + (obsCoverage * 0.25);
}

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

function splitSocNocFromCombinedCoding(raw) {
  const s = String(raw || "").trim();
  if (!s) return { soc: "", noc: "" };
  const idx = s.indexOf(":");
  if (idx < 0) return { soc: s, noc: "" };
  return {
    soc: s.slice(0, idx).trim(),
    noc: s.slice(idx + 1).trim(),
  };
}

function normalizeImportedSocNocFields(designation, obsType, classificationCoding, natureOfConcern) {
  const d = normDesignation(designation);
  const k = String(obsType || "").trim().toLowerCase();
  const cc = String(classificationCoding || "").trim();
  const noc = String(natureOfConcern || "").trim();

  if (d === "Human") {
    if (k === "positive") {
      return {
        classification_coding: null,
        nature_of_concern: HUMAN_POSITIVE_FIXED_NOC,
      };
    }
    return {
      classification_coding: cc || null,
      nature_of_concern: noc || null,
    };
  }

  const split = splitSocNocFromCombinedCoding(cc);
  if (split.soc && split.noc) {
    return {
      classification_coding: split.soc || null,
      nature_of_concern: split.noc || null,
    };
  }

  return {
    classification_coding: cc || null,
    nature_of_concern: noc || null,
  };
}

function getPgnoBullets(questionObj) {
  const bullets = Array.isArray(questionObj?.NegObs_Bullets) ? questionObj.NegObs_Bullets : null;
  if (bullets && bullets.length) {
    return bullets.map((t) => String(t || "").trim()).filter(Boolean);
  }

  const pgTxt = String(questionObj?.["Potential Grounds for Negative Observations"] || "").trim();
  if (!pgTxt) return [];

  const rawLines = pgTxt
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const merged = [];
  let current = "";

  function startsNewPgno(line) {
    return (
      /^[-•*]\s+/.test(line) ||
      /^\d+[\).]\s+/.test(line) ||
      /^PGNO\s*\d+/i.test(line)
    );
  }

  function cleanPgnoLine(line) {
    return String(line || "")
      .replace(/^[-•*]\s+/, "")
      .replace(/^\d+[\).]\s+/, "")
      .replace(/^PGNO\s*\d+\s*[:.)-]?\s*/i, "")
      .trim();
  }

  for (const line of rawLines) {
    const cleaned = cleanPgnoLine(line);
    if (!cleaned) continue;

    if (!current) {
      current = cleaned;
      continue;
    }

    if (startsNewPgno(line)) {
      merged.push(current.trim());
      current = cleaned;
    } else {
      current = `${current} ${cleaned}`.trim();
    }
  }

  if (current) merged.push(current.trim());

  return merged.filter((s) => s.length > 6);
}

function findQuestionFromLibrary(qnoCanon) {
  const exact = state.libCanonToExact.get(qnoCanon) || qnoCanon;
  return state.libByNo.get(exact) || null;
}

function buildPgnoOptions(questionObj, item) {
  const exactQno = getQno(questionObj) || canonicalQno(item.question_no || item.question_base || "");
  const bullets = getPgnoBullets(questionObj);

  return bullets.map((text, idx) => ({
    pgno_no: `${exactQno}.${String(idx + 1).padStart(2, "0")}`,
    text: String(text || "").trim(),
  }));
}

function autoMatchPgnoForImportedItem(item) {
  if (!itemNeedsPgno(item)) return [];

  const qnoCanon = canonicalQno(item.question_no || item.question_base || "");
  const questionObj = findQuestionFromLibrary(qnoCanon);
  if (!questionObj) return [];

  const options = buildPgnoOptions(questionObj, item);
  if (!options.length) return [];

  const observationMatchText = [
    item.question_full || "",
    item.designation || "",
    item.classification_coding || "",
    item.nature_of_concern || "",
    item.observation_text || "",
    item.remarks || "",
    item.source_excerpt || "",
  ].join(" ");

  let best = null;
  for (const opt of options) {
    const score = textMatchScore(observationMatchText, opt.text);
    if (!best || score > best.score) {
      best = { ...opt, score };
    }
  }

  if (!best) return [];

  /*
    Conservative threshold:
    - If score is weak, leave unchecked for user assignment.
    - This avoids false PGNO pre-selections.
  */
  if (best.score < 0.28) return [];

  return [{
    pgno_no: best.pgno_no,
    text: best.text,
    auto_matched: true,
    match_score: Number(best.score.toFixed(3)),
  }];
}

const state = {
  me: null,
  supabase: null,
  vessels: [],
  activeReport: null,
  observationItems: [],
  extractedItems: [],
  lib: [],
  libByNo: new Map(),
  libCanonToExact: new Map(),
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

function findVesselByName(name) {
  const target = String(name || "").trim().toLowerCase();
  if (!target) return null;
  return (state.vessels || []).find(
    (v) => String(v.name || "").trim().toLowerCase() === target
  ) || null;
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

async function persistExaminedFields(reportId, examined_questions, examined_count) {
  saveExaminedCache(reportId, examined_questions, examined_count);
  try {
    const { error } = await state.supabase
      .from("post_inspection_reports")
      .update({
        examined_questions,
        examined_count,
      })
      .eq("id", reportId);
    if (error) throw error;
  } catch (e) {
    console.warn("Could not persist examined fields", e);
  }
}

function applyExaminedFallback(report) {
  if (!report?.id) return report;
  const count = Number(report.examined_count || 0);
  const arr = Array.isArray(report.examined_questions) ? report.examined_questions : [];
  if (count > 0 || arr.length > 0) return report;

  const cached = loadExaminedCache(report.id);
  if (!cached) return report;

  return {
    ...report,
    examined_questions: cached.examined_questions,
    examined_count: Number(cached.examined_count || cached.examined_questions.length || 0),
  };
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
  return (data || []).map((row) => {
    const normalized = normalizeImportedSocNocFields(
      row.designation,
      row.obs_type,
      row.classification_coding,
      row.nature_of_concern
    );
    return {
      ...row,
      question_no: canonicalQno(row.question_no || row.question_base || ""),
      question_base: canonicalQno(row.question_base || row.question_no || ""),
      designation: normDesignation(row.designation),
      classification_coding: normalized.classification_coding,
      nature_of_concern: normalized.nature_of_concern,
    };
  });
}

async function loadLegacyObservationsForReport(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observations")
    .select("*")
    .eq("report_id", reportId);
  if (error) throw error;

  return (data || []).map((row, idx) => {
    const obs_type =
      row.obs_type ||
      (row.observation_type === "negative_observation"
        ? "negative"
        : row.observation_type === "positive_observation"
          ? "positive"
          : "largely");

    const normalized = normalizeImportedSocNocFields(
      row.designation,
      obs_type,
      row.classification_coding,
      row.nature_of_concern
    );

    return {
      id: `legacy-${reportId}-${row.question_no}-${idx}`,
      report_id: row.report_id,
      question_no: canonicalQno(row.question_no || row.question_base || ""),
      question_base: canonicalQno(row.question_base || row.question_no || ""),
      question_full: null,
      has_observation: row.has_observation !== false,
      observation_type: row.observation_type,
      obs_type,
      designation: normDesignation(row.designation),
      positive_rank: row.positive_rank || null,
      nature_of_concern: normalized.nature_of_concern,
      classification_coding: normalized.classification_coding,
      observation_text: row.observation_text || null,
      remarks: row.remarks || null,
      pgno_selected: Array.isArray(row.pgno_selected) ? row.pgno_selected : [],
      sort_index: idx,
      page_hint: null,
      source_excerpt: null,
      confidence: null,
    };
  });
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

  const extractedVesselName = String(h.vessel_name || "").trim();
  const matchedVessel = findVesselByName(extractedVesselName);

  if (extractedVesselName && !matchedVessel) {
    throw new Error(
      `Vessel from PDF not found in vessels table: "${extractedVesselName}". Add it first or correct the vessel list.`
    );
  }

  const payload = {
    ...headerInputs(),
    vessel_id: matchedVessel?.id || headerInputs().vessel_id,
    port_name: String(h.port_name || headerInputs().port_name || "").trim() || null,
    port_code: String(h.port_code || headerInputs().port_code || "").trim() || null,
    ocimf_inspecting_company: String(h.ocimf_inspecting_company || headerInputs().ocimf_inspecting_company || "").trim() || null,
    report_ref: String(h.report_reference || headerInputs().report_ref || "").trim(),
    inspection_date: ddmmyyyyToIso(h.inspection_date) || headerInputs().inspection_date,
    pdf_storage_path: tempPath,
    examined_questions,
    examined_count,
  };

  if (!payload.vessel_id) {
    throw new Error("No vessel selected or matched from PDF.");
  }

  let report;
  if (state.activeReport?.id) {
    report = await updateReportHeader(state.activeReport.id, payload);
  } else {
    report = await createReportHeader(payload);
  }

  await persistExaminedFields(report.id, examined_questions, examined_count);

  state.activeReport = {
    ...report,
    vessel_id: payload.vessel_id,
    port_name: payload.port_name,
    port_code: payload.port_code,
    ocimf_inspecting_company: payload.ocimf_inspecting_company,
    report_ref: payload.report_ref,
    inspection_date: payload.inspection_date,
    pdf_storage_path: payload.pdf_storage_path,
    examined_questions,
    examined_count,
  };

  saveExaminedCache(report.id, examined_questions, examined_count);

  loadReportIntoHeader(state.activeReport);
  setActivePill("Loaded");

  await state.supabase.from("post_inspection_observation_items").delete().eq("report_id", report.id);

  for (let i = 0; i < obs.length; i++) {
    const item = obs[i];
    const designation = normDesignation(item.designation) || (item.obs_type === "positive" ? "Human" : null);

    const normalized = normalizeImportedSocNocFields(
      designation,
      item.obs_type,
      item.classification_coding,
      item.nature_of_concern
    );

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
      nature_of_concern: normalized.nature_of_concern,
      classification_coding: normalized.classification_coding,
      observation_text: String(item.observation_text || "").trim() || null,
      remarks: String(item.observation_text || "").trim() || null,
      pgno_selected: [],
      page_hint: item.page_hint ?? null,
      source_excerpt: String(item.source_excerpt || "").trim() || null,
      confidence: item.confidence ?? null,
      sort_index: i,
    };

    row.pgno_selected = autoMatchPgnoForImportedItem(row);

    const { error: insErr } = await state.supabase
      .from("post_inspection_observation_items")
      .insert([row]);
    if (insErr) throw insErr;
  }

  const fresh = await loadReportById(report.id);
  state.activeReport = applyExaminedFallback({
    ...fresh,
    vessel_id: payload.vessel_id,
  });

  loadReportIntoHeader(state.activeReport);

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

  if (!getUrlParam("report_id") && report.id) {
    window.history.replaceState({}, "", `./post_inspection_detail.html?report_id=${encodeURIComponent(report.id)}`);
  }
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

  if (payload?.report_header?.examined_questions || payload?.report_header?.examined_count) {
    const examined_questions = Array.isArray(payload.report_header.examined_questions)
      ? payload.report_header.examined_questions
      : [];
    const examined_count = Number(payload.report_header.examined_count || examined_questions.length || 0);

    await persistExaminedFields(state.activeReport.id, examined_questions, examined_count);
    state.activeReport.examined_questions = examined_questions;
    state.activeReport.examined_count = examined_count;
    saveExaminedCache(state.activeReport.id, examined_questions, examined_count);
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

  const examined_questions = state.activeReport?.examined_questions || [];
  const examined_count = Number(state.activeReport?.examined_count || examined_questions.length || 0);

  let report;
  if (state.activeReport?.id) {
    report = await updateReportHeader(state.activeReport.id, {
      ...payload,
      examined_questions,
      examined_count,
    });
  } else {
    report = await createReportHeader({
      ...payload,
      examined_questions,
      examined_count,
    });
  }

  state.activeReport = applyExaminedFallback({
    ...state.activeReport,
    ...report,
    examined_questions,
    examined_count,
  });

  saveExaminedCache(report.id, examined_questions, examined_count);

  loadReportIntoHeader(state.activeReport);
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

  state.lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  for (const q of state.lib) {
    const qno = getQno(q);
    if (!qno) continue;
    state.libByNo.set(qno, q);
    const canon = canonicalQno(qno);
    if (canon && !state.libCanonToExact.has(canon)) {
      state.libCanonToExact.set(canon, qno);
    }
  }

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
    const loaded = await loadReportById(reportId);
    state.activeReport = applyExaminedFallback(loaded);
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