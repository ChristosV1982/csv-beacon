// public/post_inspection_stats.js
// Fleet/vessel stats via RPC functions + client-side multi-filtering + drilldown views.
// Modes:
// 1) Post-Inspection only: uses post_insp_export_observations + post_inspection_reports.
// 2) Combined Analytics: uses fleet_obs_analytics_export view/function output normalized into same client model.

import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const STATS_BUILD = "post_inspection_stats_v16c_sector_snapshot_2026-06-30";
window.CSVB_POST_INSPECTION_STATS_BUILD = STATS_BUILD;

const OBS_TYPES = [
  { value: "negative", label: "Negative" },
  { value: "largely", label: "Largely as expected" },
  { value: "positive", label: "Positive" },
];

const RECORD_SOURCES = [
  { value: "vetting_inspection", label: "Vetting inspections" },
  { value: "audit_internal_superintendent", label: "Audit — Internal Superintendent" },
  { value: "audit_internal_master", label: "Audit — Internal Master" },
  { value: "audit_external_contractor", label: "Audit — External Contractor" },
];

const RECORD_SOURCE_LABELS = new Map(RECORD_SOURCES.map((x) => [x.value, x.label]));

const MSCAT_SOURCE_OPTIONS = [
  { value: "vetting_inspection", label: "Vetting Inspections" },
  { value: "audit_internal_superintendent", label: "Audit — Marine Superintendent" },
  { value: "audit_internal_master", label: "Audit — Master" },
  { value: "audit_external_contractor", label: "Audit — External Auditor" },
];

const MSCAT_SECTION_OPTIONS = [
  { value: "Immediate Causes", label: "Immediate Causes" },
  { value: "Basic Causes", label: "Basic Causes" },
  { value: "Control Areas", label: "Control Areas for Improvement" },
];



const MONTHS = [
  { value: "01", label: "01 — January" },
  { value: "02", label: "02 — February" },
  { value: "03", label: "03 — March" },
  { value: "04", label: "04 — April" },
  { value: "05", label: "05 — May" },
  { value: "06", label: "06 — June" },
  { value: "07", label: "07 — July" },
  { value: "08", label: "08 — August" },
  { value: "09", label: "09 — September" },
  { value: "10", label: "10 — October" },
  { value: "11", label: "11 — November" },
  { value: "12", label: "12 — December" },
];

function el(id) {
  return document.getElementById(id);
}

function safeEl(id) {
  const node = el(id);
  if (!node) console.warn(`Missing element id="${id}"`);
  return node;
}

function safeTbody(id) {
  const node = el(id);
  if (!node) {
    console.warn(`Missing tbody id="${id}"`);
    return null;
  }
  return node;
}

function setText(id, value) {
  const node = safeEl(id);
  if (node) node.textContent = String(value ?? "");
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const state = {
  me: null,
  supabase: null,
  vessels: [],
  auditTypeOptions: [],
  libByNo: new Map(),
  labelMap: new Map(),

  postRows: [],
  postReportRows: [],

  combinedRows: [],
  combinedReportRows: [],

  allRows: [],
  allReportRows: [],

  reportMetaByKey: new Map(),
  currentRows: [],
  currentRowsIgnoreType: [],
  currentReportRows: [],
  currentDrillRows: [],
  currentDrillTitle: "records",
  currentMscatRecords: [],
};


function cloneSnapshotValue(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function snapshotQuestionMeta(row) {
  const qno = String(row?.question_no || "").trim();
  const q = qno ? state.libByNo.get(qno) : null;

  return {
    qno,
    chapter: q ? getChap(q) : (qno.split(".")[0] || ""),
    section: q ? getSection(q) : "",
    short_text: q ? getShort(q) : "",
  };
}

function snapshotRows(rows) {
  return (rows || []).map((row) => {
    const cloned = cloneSnapshotValue(row) || {};
    cloned.question_meta = snapshotQuestionMeta(row);
    return cloned;
  });
}

function exposeStatsSnapshot() {
  const rows = snapshotRows(state.currentRows);
  const rowsIgnoreType = snapshotRows(state.currentRowsIgnoreType);
  const reportRows = cloneSnapshotValue(state.currentReportRows || []) || [];

  const qnos = new Set(
    [...rows, ...rowsIgnoreType]
      .map((row) => String(row?.question_no || row?.question_meta?.qno || "").trim())
      .filter(Boolean)
  );

  const questionMetaByNo = {};
  qnos.forEach((qno) => {
    const q = state.libByNo.get(qno);
    questionMetaByNo[qno] = {
      qno,
      chapter: q ? getChap(q) : (qno.split(".")[0] || ""),
      section: q ? getSection(q) : "",
      short_text: q ? getShort(q) : "",
    };
  });

  window.CSVB_POST_STATS_SNAPSHOT = Object.freeze({
    snapshot_build: "POST-STATS-SNAPSHOT-V01-20260531",
    stats_build: STATS_BUILD,
    generated_at: new Date().toISOString(),
    mode: getMode(),
    rows,
    rowsIgnoreType,
    reportRows,
    postRows: state.postRows,
    postReportRows: state.postReportRows,
    combinedRows: state.combinedRows,
    combinedReportRows: state.combinedReportRows,
    allRows: state.allRows,
    allReportRows: state.allReportRows,
    vessels: state.vessels,
    questionMetaByNo,
  });

  window.CSVB_POST_STATS_GET_SNAPSHOT = () => window.CSVB_POST_STATS_SNAPSHOT;

  window.dispatchEvent(new CustomEvent("csvb:post-stats-snapshot", {
    detail: { snapshot: window.CSVB_POST_STATS_SNAPSHOT },
  }));
}

function setStatus(text) {
  setText("statusPill", text || "Ready");
}

function getMode() {
  return String(el("statsMode")?.value || "post");
}

function isCombinedMode() {
  return getMode() === "combined";
}


function isAuditMode() {
  return getMode() === "audits";
}

function isVettingMode() {
  return getMode() === "post";
}

function isAuditRecordSource(value) {
  return String(value || "").trim().startsWith("audit_");
}

function isInternalAuditRecordSource(value) {
  const s = String(value || "").trim();
  return s === "audit_internal_superintendent" || s === "audit_internal_master";
}

function isExternalAuditRecordSource(value) {
  return String(value || "").trim() === "audit_external_contractor";
}

function auditTypeKeyFromRow(row) {
  return String(
    row?.audit_type_id ||
    row?.audit_type_name ||
    row?.title ||
    row?.report_title ||
    ""
  ).trim();
}

function auditTypeLabelFromRow(row) {
  return String(
    row?.audit_type_name ||
    row?.title ||
    row?.report_title ||
    row?.audit_type_id ||
    "Unspecified audit type"
  ).trim();
}


function normalizeAuditTypeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function auditTypeSelectedForRow(row, selectedSet) {
  if (!selectedSet || !selectedSet.size) return true;

  const values = new Set([
    row?.audit_type_id,
    row?.audit_type_name,
    row?.title,
    row?.report_title,
    auditTypeKeyFromRow(row),
    auditTypeLabelFromRow(row),
  ].map(normalizeAuditTypeValue).filter(Boolean));

  for (const selected of selectedSet) {
    const selectedNorm = normalizeAuditTypeValue(selected);
    const option = (state.auditTypeOptions || []).find((x) => normalizeAuditTypeValue(x.value) === selectedNorm);
    const optionLabel = normalizeAuditTypeValue(option?.label);

    if (values.has(selectedNorm)) return true;
    if (optionLabel && values.has(optionLabel)) return true;
  }

  return false;
}


function getSelectedAuditTypes() {
  return selectedCheckboxValues("auditTypeCheckList");
}


function sourceLabel(value) {
  return RECORD_SOURCE_LABELS.get(value) || value || "Post-Inspection";
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

function pgnoExportText(pgnoSelected) {
  const arr = Array.isArray(pgnoSelected) ? pgnoSelected : [];
  if (!arr.length) return "";

  return arr
    .map((x) => {
      const no = String(x?.pgno_no || x?.idx || "").trim();
      const text = String(x?.text || "").trim();
      if (no && text) return `${no} — ${text}`;
      if (no) return no;
      return text;
    })
    .filter(Boolean)
    .join("; ");
}

function vesselNameById(vesselId) {
  const v = (state.vessels || []).find((x) => String(x.id) === String(vesselId));
  return String(v?.name || "").trim();
}

function reportKey(row) {
  return [
    String(row.record_source || "vetting_inspection").trim(),
    String(row.source_report_id || "").trim(),
    String(row.vessel_name || "").trim(),
    String(row.inspection_date || "").trim(),
    String(row.report_ref || "").trim(),
    String(row.title || "").trim(),
  ].join("|");
}

function reportKeyFromReport(row) {
  return [
    String(row.record_source || "vetting_inspection").trim(),
    String(row.id || row.source_report_id || "").trim(),
    vesselNameById(row.vessel_id),
    String(row.inspection_date || "").trim(),
    String(row.report_ref || "").trim(),
    String(row.title || "").trim(),
  ].join("|");
}


function reportMetaKeyParts(recordSource, reportId, vesselName, inspectionDate, reportRef, title) {
  return [
    String(recordSource || "vetting_inspection").trim(),
    String(reportId || "").trim(),
    String(vesselName || "").trim(),
    String(inspectionDate || "").trim(),
    String(reportRef || "").trim(),
    String(title || "").trim(),
  ].join("|");
}

function reportMetaFallbackKey(recordSource, vesselName, inspectionDate, reportRef, title) {
  return [
    String(recordSource || "vetting_inspection").trim(),
    String(vesselName || "").trim(),
    String(inspectionDate || "").trim(),
    String(reportRef || "").trim(),
    String(title || "").trim(),
  ].join("|");
}

function reportMetaKeysFromReport(row) {
  const recordSource = String(row?.record_source || "vetting_inspection").trim();
  const vesselName = String(row?.vessel_name || vesselNameById(row?.vessel_id) || "").trim();
  const inspectionDate = String(row?.inspection_date || "").trim();
  const reportRef = String(row?.report_ref || "").trim();
  const title = String(row?.title || "").trim();

  const ids = [
    row?.id,
    row?.source_report_id,
    row?.report_id,
    "",
  ].map((x) => String(x || "").trim());

  const keys = new Set();
  ids.forEach((id) => keys.add(reportMetaKeyParts(recordSource, id, vesselName, inspectionDate, reportRef, title)));
  keys.add(reportMetaFallbackKey(recordSource, vesselName, inspectionDate, reportRef, title));

  return [...keys].filter(Boolean);
}

function reportMetaKeysFromObservation(row) {
  const recordSource = String(row?.record_source || "vetting_inspection").trim();
  const vesselName = String(row?.vessel_name || "").trim();
  const inspectionDate = String(row?.inspection_date || "").trim();
  const reportRef = String(row?.report_ref || "").trim();
  const title = String(row?.title || "").trim();

  const ids = [
    row?.source_report_id,
    row?.report_id,
    row?.post_inspection_report_id,
    "",
  ].map((x) => String(x || "").trim());

  const keys = new Set();
  ids.forEach((id) => keys.add(reportMetaKeyParts(recordSource, id, vesselName, inspectionDate, reportRef, title)));
  keys.add(reportMetaFallbackKey(recordSource, vesselName, inspectionDate, reportRef, title));

  return [...keys].filter(Boolean);
}

function findReportMetaForObservation(row) {
  for (const key of reportMetaKeysFromObservation(row)) {
    const meta = state.reportMetaByKey.get(key);
    if (meta) return meta;
  }
  return null;
}


function monthKey(row) {
  return String(row.inspection_date || "").slice(0, 7) || "—";
}

function yearOf(row) {
  return String(row.inspection_date || "").slice(0, 4);
}

function monthOf(row) {
  return String(row.inspection_date || "").slice(5, 7);
}

function quarterOf(row) {
  const y = yearOf(row);
  const m = Number(monthOf(row));
  if (!y || !m) return "—";
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

function typeLabel(type) {
  return state.labelMap.get(type) || type || "—";
}

function normalizeType(type) {
  return String(type || "").trim();
}

function avg(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);
  if (!d) return "0.00";
  return (n / d).toFixed(2);
}

function ensureTbodyMessage(tbody, colspan, message) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colspan}" class="mono">${esc(message)}</td></tr>`;
}

function inDateRange(dateStr, fromDate, toDate) {
  const d = String(dateStr || "").slice(0, 10);
  if (!d) return false;
  if (fromDate && d < fromDate) return false;
  if (toDate && d > toDate) return false;
  return true;
}

function selectedCheckboxValues(containerId) {
  const box = safeEl(containerId);
  if (!box) return [];
  return [...box.querySelectorAll("input[type='checkbox']:checked")]
    .map((x) => String(x.value || "").trim())
    .filter(Boolean);
}

function setAllCheckboxes(containerId, checked) {
  const box = safeEl(containerId);
  if (!box) return;
  box.querySelectorAll("input[type='checkbox']").forEach((x) => {
    x.checked = !!checked;
  });
}

function renderCheckboxList(containerId, className, items, checkedByDefault = true) {
  const box = safeEl(containerId);
  if (!box) return;
  box.innerHTML = "";

  for (const item of items) {
    const row = document.createElement("label");
    row.className = "checkRow";
    row.innerHTML = `
      <input type="checkbox" class="${esc(className)}" value="${esc(item.value)}" ${checkedByDefault ? "checked" : ""}/>
      <span>${esc(item.label)}</span>
    `;
    box.appendChild(row);
  }
}

function getSelectedVesselIds() {
  return selectedCheckboxValues("vesselCheckList");
}

function getSelectedVesselNames() {
  const ids = new Set(getSelectedVesselIds());
  return new Set((state.vessels || []).filter((v) => ids.has(String(v.id))).map((v) => String(v.name || "").trim()));
}

function getSelectedTypes() {
  return selectedCheckboxValues("typeCheckList");
}

function getSelectedRecordSources() {
  return selectedCheckboxValues("recordSourceCheckList");
}

function getSelectedRecurringYears() {
  return selectedCheckboxValues("recurringYearCheckList");
}

function getSelectedRecurringMonths() {
  return selectedCheckboxValues("recurringMonthCheckList");
}

function getFilters() {
  return {
    selected_vessel_ids: getSelectedVesselIds(),
    selected_vessel_names: getSelectedVesselNames(),
    selected_record_sources: getSelectedRecordSources(),
    selected_audit_types: getSelectedAuditTypes(),
    p_from: el("dateFrom")?.value || null,
    p_to: el("dateTo")?.value || null,
    selected_types: getSelectedTypes(),
  };
}

function filterReportsBase(reportRows) {
  const { selected_vessel_ids, selected_record_sources, selected_audit_types, p_from, p_to } = getFilters();
  const vesselSet = new Set(selected_vessel_ids);
  const sourceSet = new Set(selected_record_sources);
  const auditTypeSet = new Set(selected_audit_types);

  return (reportRows || []).filter((r) => {
    const recordSource = String(r.record_source || "vetting_inspection").trim();

    if (vesselSet.size > 0 && !vesselSet.has(String(r.vessel_id))) return false;
    if (!isVettingMode() && sourceSet.size > 0 && !sourceSet.has(recordSource)) return false;

    if (auditTypeSet.size > 0 && isAuditRecordSource(recordSource)) {
      if (!auditTypeSelectedForRow(r, auditTypeSet)) return false;
    }

    if (!inDateRange(r.inspection_date, p_from, p_to)) return false;
    return true;
  });
}

function filterRowsBase(rows, ignoreTypeFilter = false) {
  const { selected_vessel_names, selected_record_sources, selected_audit_types, p_from, p_to, selected_types } = getFilters();
  const typeSet = new Set(selected_types);
  const sourceSet = new Set(selected_record_sources);
  const auditTypeSet = new Set(selected_audit_types);

  return (rows || []).filter((r) => {
    const vesselName = String(r.vessel_name || "").trim();
    const recordSource = String(r.record_source || "vetting_inspection").trim();

    if (selected_vessel_names.size > 0 && !selected_vessel_names.has(vesselName)) return false;
    if (!isVettingMode() && sourceSet.size > 0 && !sourceSet.has(recordSource)) return false;

    if (auditTypeSet.size > 0 && isAuditRecordSource(recordSource)) {
      if (!auditTypeSelectedForRow(r, auditTypeSet)) return false;
    }

    if (!inDateRange(r.inspection_date, p_from, p_to)) return false;
    if (!ignoreTypeFilter && typeSet.size > 0 && !typeSet.has(normalizeType(r.observation_type))) return false;
    return true;
  });
}

async function loadVessels() {
  const { data, error } = await state.supabase.rpc("csvb_accessible_vessels_for_me");

  if (error) throw error;

  return (data || [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({
      id: v.id,
      company_id: v.company_id,
      company_name: v.company_name || "",
      name: v.name,
      is_active: v.is_active
    }));
}

async function loadPostObservationRows() {
  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
      p_vessel_id: null,
      p_from: null,
      p_to: null,
      p_observation_type: null,
    });

  if (error) throw error;

  const allowedVesselNames = new Set(
    (state.vessels || [])
      .map((v) => String(v.name || "").trim())
      .filter(Boolean)
  );

  if (!allowedVesselNames.size) return [];

  return (data || []).filter((r) => {
    const vesselName = String(r.vessel_name || "").trim();
    return allowedVesselNames.has(vesselName);
  });
}

async function loadPostReportRows() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    company_name: r.company_name || "",
    vessel_id: r.vessel_id,
    vessel_name: r.vessel_name || "",
    inspection_date: r.inspection_date,
    report_ref: r.report_ref,
    title: r.title,
    ocimf_inspecting_company: r.ocimf_inspecting_company,
    inspector_name: r.inspector_name,
    inspector_company: r.inspector_company
  }));
}

async function loadCombinedObservationRows() {
  const { data, error } = await state.supabase
    .rpc("fleet_obs_analytics_export", {
      p_vessel_id: null,
      p_from: null,
      p_to: null,
      p_record_source: null,
      p_observation_type: null,
    });

  if (error) throw error;

  const allowedVesselNames = new Set(
    (state.vessels || [])
      .map((v) => String(v.name || "").trim())
      .filter(Boolean)
  );

  if (!allowedVesselNames.size) return [];

  return normalizeCombinedRows(data || []).filter((r) => {
    const vesselName = String(r.vessel_name || "").trim();
    return allowedVesselNames.has(vesselName);
  });
}

function normalizeCombinedRows(rows) {
  return (rows || []).map((r) => {
    const recordSource = String(r.record_source || "").trim() || "vetting_inspection";
    const isAudit = recordSource.startsWith("audit_");

    const inspectingCompany =
      isAudit
        ? String(r.contractor_company || r.inspector_company || r.inspecting_company || "").trim()
        : String(r.inspecting_company || "").trim();

    const title =
      isAudit
        ? String(r.audit_type_name || r.report_title || "").trim()
        : String(r.report_title || "").trim();

    return {
      ...r,
      record_source: recordSource,
      record_source_label: sourceLabel(recordSource),

      vessel_id: r.vessel_id || null,
      vessel_name: String(r.vessel_name || "").trim(),

      inspection_date: String(r.event_date || "").slice(0, 10),
      report_ref: String(r.report_reference || "").trim(),
      title,

      observation_type: String(r.obs_type || "").trim(),
      designation: String(r.designation || "").trim(),

      soc: String(r.soc || "").trim(),
      noc: String(r.noc || "").trim(),

      ocimf_inspecting_company: inspectingCompany || "—",
      inspector_name: String(r.inspector_name || "").trim() || "—",
      inspector_company: String(r.inspector_company || r.contractor_company || "").trim() || "—",

      remarks: String(r.observation_text || "").trim(),
      pgno_selected: Array.isArray(r.pgno_selected) ? r.pgno_selected : [],
      pgno_count: Array.isArray(r.pgno_selected) ? r.pgno_selected.length : 0,
    };
  });
}

function buildReportRowsFromObservationRows(rows) {
  const map = new Map();

  for (const r of rows || []) {
    const key = reportKey(r);
    if (!map.has(key)) {
      map.set(key, {
        id: r.source_report_id || key,
        source_report_id: r.source_report_id || null,
        record_source: r.record_source || "vetting_inspection",
        record_source_label: sourceLabel(r.record_source || "vetting_inspection"),
        vessel_id: r.vessel_id || null,
        vessel_name: r.vessel_name || "",
        inspection_date: r.inspection_date || "",
        report_ref: r.report_ref || "",
        title: r.title || "",
        ocimf_inspecting_company: r.ocimf_inspecting_company || "—",
        inspector_name: r.inspector_name || "—",
        inspector_company: r.inspector_company || "—",
        report_key: key,
      });
    }
  }

  return [...map.values()];
}

function rebuildReportMetaMap() {
  state.reportMetaByKey = new Map();

  for (const r of state.postReportRows || []) {
    const vesselName = String(r.vessel_name || vesselNameById(r.vessel_id) || "").trim();

    const meta = {
      vessel_id: r.vessel_id,
      vessel_name: vesselName,
      ocimf_inspecting_company: String(r.ocimf_inspecting_company || "").trim() || "—",
      inspector_name: String(r.inspector_name || "").trim() || "—",
      inspector_company: String(r.inspector_company || "").trim() || "—",
    };

    for (const key of reportMetaKeysFromReport({
      ...r,
      vessel_name: vesselName,
      record_source: "vetting_inspection",
    })) {
      if (key) state.reportMetaByKey.set(key, meta);
    }
  }
}

function enrichRowsWithReportMeta(rows) {
  return (rows || []).map((r) => {
    const meta = findReportMetaForObservation({
      ...r,
      record_source: "vetting_inspection",
    }) || {};

    return {
      ...r,
      record_source: "vetting_inspection",
      record_source_label: "Vetting inspections",
      source_report_id: r.source_report_id || null,
      source_observation_id: r.source_observation_id || null,
      vessel_id: meta.vessel_id || null,
      ocimf_inspecting_company: meta.ocimf_inspecting_company || "—",
      inspector_name: meta.inspector_name || "—",
      inspector_company: meta.inspector_company || "—",
    };
  });
}


function enrichReports(reportRows) {
  return (reportRows || []).map((r) => ({
    ...r,
    record_source: "vetting_inspection",
    record_source_label: "Vetting inspections",
    vessel_name: vesselNameById(r.vessel_id),
    ocimf_inspecting_company: String(r.ocimf_inspecting_company || "").trim() || "—",
    inspector_name: String(r.inspector_name || "").trim() || "—",
    inspector_company: String(r.inspector_company || "").trim() || "—",
    report_key: reportKeyFromReport({
      ...r,
      record_source: "vetting_inspection",
    }),
  }));
}

function collectYearsFromRows(rows, reportRows) {
  const set = new Set();

  for (const r of rows || []) {
    const y = String(r.inspection_date || "").slice(0, 4);
    if (/^\d{4}$/.test(y)) set.add(y);
  }

  for (const r of reportRows || []) {
    const y = String(r.inspection_date || "").slice(0, 4);
    if (/^\d{4}$/.test(y)) set.add(y);
  }

  set.add(String(new Date().getFullYear()));
  return [...set].sort((a, b) => b.localeCompare(a));
}

function renderYearSelect(selectId, years, preferredYear) {
  const sel = safeEl(selectId);
  if (!sel) return;

  const existing = String(sel.value || "").trim();
  sel.innerHTML = "";

  for (const y of years) {
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    sel.appendChild(o);
  }

  if (existing && years.includes(existing)) sel.value = existing;
  else if (preferredYear && years.includes(preferredYear)) sel.value = preferredYear;
  else if (years.length) sel.value = years[0];
  else sel.value = "";
}

function groupObjectiveRows(rows, keyFn) {
  const map = new Map();

  for (const row of rows || []) {
    const key = String(keyFn(row) || "—").trim() || "—";
    if (!map.has(key)) {
      map.set(key, {
        key,
        observation_count: 0,
        reports: new Set(),
        last_seen: "",
      });
    }

    const item = map.get(key);
    item.observation_count += 1;
    item.reports.add(reportKey(row));

    const date = String(row.inspection_date || "").trim();
    if (date && (!item.last_seen || date > item.last_seen)) item.last_seen = date;
  }

  return [...map.values()]
    .map((x) => ({
      key: x.key,
      observation_count: x.observation_count,
      report_count: x.reports.size,
      avg_per_inspection: avg(x.observation_count, x.reports.size),
      last_seen: x.last_seen,
    }))
    .sort((a, b) =>
      b.observation_count - a.observation_count ||
      b.report_count - a.report_count ||
      String(a.key).localeCompare(String(b.key))
    );
}

function typeCountsFromRows(rows) {
  let negative = 0;
  let largely = 0;
  let positive = 0;

  for (const row of rows || []) {
    const t = normalizeType(row.observation_type);
    if (t === "negative") negative += 1;
    if (t === "largely") largely += 1;
    if (t === "positive") positive += 1;
  }

  return {
    negative,
    largely,
    positive,
    total: negative + largely + positive,
  };
}

function groupTypeSplitRows(rows, keyFn, reportCountFn = null) {
  const map = new Map();

  for (const row of rows || []) {
    const key = String(keyFn(row) || "—").trim() || "—";
    if (!map.has(key)) {
      map.set(key, {
        key,
        reports: new Set(),
        negative: 0,
        largely: 0,
        positive: 0,
      });
    }

    const item = map.get(key);
    item.reports.add(reportKey(row));

    const t = normalizeType(row.observation_type);
    if (t === "negative") item.negative += 1;
    if (t === "largely") item.largely += 1;
    if (t === "positive") item.positive += 1;
  }

  return [...map.values()].map((x) => {
    const inspections = reportCountFn ? Number(reportCountFn(x.key) || 0) : x.reports.size;
    return {
      key: x.key,
      inspections,
      negative: x.negative,
      largely: x.largely,
      positive: x.positive,
      total: x.negative + x.largely + x.positive,
      avg_negative: avg(x.negative, inspections),
      avg_largely: avg(x.largely, inspections),
      avg_positive: avg(x.positive, inspections),
    };
  }).sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)));
}

function reportCountsByKey(reportRows, keyFn) {
  const map = new Map();

  for (const r of reportRows || []) {
    const key = String(keyFn(r) || "—").trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

function buttonHtml(drillId) {
  return `<button class="btn btn-muted btn-small drillBtn" data-drill-id="${esc(drillId)}">View</button>`;
}

function bindDrillButtons(root = document) {
  root.querySelectorAll(".drillBtn[data-drill-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-drill-id");
      if (id) openRegisteredDrill(id);
    });
  });
}

const drillRegistry = new Map();

function registerDrill(title, rows, reportRows = null, sub = "") {
  const id = `drill_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  drillRegistry.set(id, {
    title,
    rows: Array.isArray(rows) ? rows : [],
    reportRows: Array.isArray(reportRows) ? reportRows : null,
    sub,
  });
  return id;
}

function uniqueReportCount(rows, reportRows = null) {
  if (Array.isArray(reportRows)) return reportRows.length;
  return new Set((rows || []).map(reportKey)).size;
}

function openRegisteredDrill(id) {
  const cfg = drillRegistry.get(id);
  if (!cfg) return;
  openDrilldown(cfg.title, cfg.rows, cfg.reportRows, cfg.sub);
}

function openDrilldown(title, rows, reportRows = null, sub = "") {
  state.currentDrillRows = Array.isArray(rows) ? rows : [];
  state.currentDrillTitle = title || "records";

  setText("drillTitle", title || "Records");
  setText("drillSub", sub || "Actual records used for this statistic.");

  const reports = uniqueReportCount(state.currentDrillRows, reportRows);
  const questions = new Set(state.currentDrillRows.map((r) => String(r.question_no || "").trim()).filter(Boolean)).size;

  setText("drillCountObs", String(state.currentDrillRows.length));
  setText("drillCountReports", String(reports));
  setText("drillCountQuestions", String(questions));
  setText("drillAvg", avg(state.currentDrillRows.length, reports));

  const tbody = safeTbody("drillTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!state.currentDrillRows.length) {
    ensureTbodyMessage(tbody, 15, "No records for this selection.");
  } else {
    for (const r of state.currentDrillRows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(sourceLabel(r.record_source || "vetting_inspection"))}</td>
        <td>${esc(r.vessel_name || "")}</td>
        <td>${esc(r.inspection_date || "")}</td>
        <td>${esc(r.report_ref || "")}</td>
        <td>${esc(r.title || "")}</td>
        <td class="mono">${esc(r.question_no || "")}</td>
        <td>${esc(typeLabel(r.observation_type))}</td>
        <td>${esc(r.designation || "")}</td>
        <td>${esc(r.soc || "")}</td>
        <td>${esc(r.noc || "")}</td>
        <td>${esc(r.ocimf_inspecting_company || "")}</td>
        <td>${esc(r.inspector_name || "")}</td>
        <td>${esc(r.inspector_company || "")}</td>
        <td>${esc(pgnoExportText(r.pgno_selected))}</td>
        <td class="drillRemarks">${esc(r.remarks || r.observation_text || "")}</td>
      `;
      tbody.appendChild(tr);
    }
  }

  const dlg = safeEl("drillDialog");
  if (dlg && typeof dlg.showModal === "function") dlg.showModal();
}

function exportDrillCsv() {
  const rows = state.currentDrillRows || [];

  const header = [
    "record_source",
    "vessel_name",
    "inspection_date",
    "report_ref",
    "title_or_audit_type",
    "question_no",
    "observation_type",
    "designation",
    "soc",
    "noc",
    "inspecting_or_contractor_company",
    "inspector_or_auditor",
    "inspector_or_auditor_company",
    "pgno_selected",
    "remarks",
    "updated_at",
  ];

  const csv = [header.join(",")];

  for (const r of rows) {
    const line = [
      sourceLabel(r.record_source || "vetting_inspection"),
      r.vessel_name || "",
      r.inspection_date || "",
      r.report_ref || "",
      r.title || "",
      r.question_no || "",
      typeLabel(r.observation_type),
      r.designation || "",
      r.soc || "",
      r.noc || "",
      r.ocimf_inspecting_company || "",
      r.inspector_name || "",
      r.inspector_company || "",
      pgnoExportText(r.pgno_selected),
      r.remarks || r.observation_text || "",
      r.updated_at || "",
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");

    csv.push(line);
  }

  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const safeName = String(state.currentDrillTitle || "records").replace(/[^a-z0-9]+/gi, "_").slice(0, 80);

  a.download = `fleet_observation_drilldown_${safeName}.csv`;
  a.href = URL.createObjectURL(blob);

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function renderTypeSplitTable(tbodyId, rows, sourceRows, keyFn, keyLabel, limit = 100) {
  const tbody = safeTbody(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  const list = rows.slice(0, limit);

  for (const r of list) {
    const matched = sourceRows.filter((x) => String(keyFn(x) || "—").trim() === r.key);
    const drillId = registerDrill(`${keyLabel}: ${r.key}`, matched, null, `Breakdown by ${keyLabel}.`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.avg_negative)}</td>
      <td>${esc(r.avg_largely)}</td>
      <td>${esc(r.avg_positive)}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!list.length) ensureTbodyMessage(tbody, 8, `No ${keyLabel} data for current filters.`);
  bindDrillButtons(tbody);
}

function buildMonthlyRows(rows, reportRows, yearFilter = "") {
  const selected = String(yearFilter || "").trim();
  const year = selected || String(new Date().getFullYear());

  const map = new Map();

  for (let i = 1; i <= 12; i++) {
    const mm = String(i).padStart(2, "0");
    const key = `${year}-${mm}`;
    map.set(key, {
      month: key,
      reports: new Set(),
      observations: 0,
      negative: 0,
      positive: 0,
      largely: 0,
      rows: [],
    });
  }

  for (const report of reportRows || []) {
    const y = yearOf(report);
    if (y !== year) continue;
    const key = monthKey(report);
    if (map.has(key)) map.get(key).reports.add(report.report_key || reportKeyFromReport(report));
  }

  for (const row of rows || []) {
    const y = yearOf(row);
    if (y !== year) continue;

    const key = monthKey(row);
    if (!map.has(key)) continue;

    const item = map.get(key);
    item.observations += 1;
    item.rows.push(row);

    const t = normalizeType(row.observation_type);
    if (t === "negative") item.negative += 1;
    if (t === "positive") item.positive += 1;
    if (t === "largely") item.largely += 1;
  }

  return [...map.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function buildPeriodRows(rows, reportRows, keyFn) {
  const map = new Map();

  for (const report of reportRows || []) {
    const key = String(keyFn(report) || "—");
    if (!key || key === "—") continue;

    if (!map.has(key)) {
      map.set(key, {
        key,
        observations: 0,
        inspections: 0,
        rows: [],
        reportKeys: new Set(),
      });
    }

    map.get(key).inspections += 1;
  }

  for (const row of rows || []) {
    const key = String(keyFn(row) || "—");
    if (!key || key === "—") continue;

    if (!map.has(key)) {
      map.set(key, {
        key,
        observations: 0,
        inspections: 0,
        rows: [],
        reportKeys: new Set(),
      });
    }

    const item = map.get(key);
    item.observations += 1;
    item.rows.push(row);
    item.reportKeys.add(reportKey(row));
  }

  return [...map.values()]
    .map((x) => ({
      ...x,
      avg_per_inspection: avg(x.observations, x.inspections),
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}


function collectAuditTypeOptions() {
  const map = new Map();

  const add = (row) => {
    const recordSource = String(row?.record_source || "").trim();
    if (!isAuditRecordSource(recordSource)) return;

    const key = auditTypeKeyFromRow(row);
    if (!key) return;

    const label = auditTypeLabelFromRow(row);
    if (!map.has(key)) map.set(key, label);
  };

  (state.combinedRows || []).forEach(add);
  (state.combinedReportRows || []).forEach(add);

  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

async function loadAuditTypeOptionsForStats() {
  const { data, error } = await state.supabase.rpc("csvb_audit_types_for_me");
  if (error) throw error;

  return (data || [])
    .filter((t) => t.is_active !== false)
    .map((t) => ({
      value: String(t.id || t.audit_type_name || "").trim(),
      label: String(t.audit_type_name || t.name || t.id || "Unspecified audit type").trim(),
    }))
    .filter((t) => t.value && t.label)
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function renderAuditTypeFilter() {
  const box = safeEl("auditTypeCheckList");
  if (!box) return;

  let options = [];

  try {
    options = await loadAuditTypeOptionsForStats();
  } catch (error) {
    console.warn("Audit type RPC load failed; falling back to analytics rows:", error);
    options = collectAuditTypeOptions();
  }

  if (!options.length) {
    options = collectAuditTypeOptions();
  }

  state.auditTypeOptions = options;

  if (!state.auditTypeOptions.length) {
    box.innerHTML = `<div class="muted">No audit types found. Check that active audit types exist in Vessel Audit setup.</div>`;
    updateDropSummary("auditTypeDropBtn", "Audit types", 0, 0);
    return;
  }

  renderCheckboxList("auditTypeCheckList", "auditTypeChk", state.auditTypeOptions, true);
  updateDropSummary("auditTypeDropBtn", "Audit types", state.auditTypeOptions.length, state.auditTypeOptions.length);
}

function monthRangeBetween(fromDate, toDate, fallbackRows = []) {
  let from = String(fromDate || "").slice(0, 7);
  let to = String(toDate || "").slice(0, 7);

  const rowMonths = (fallbackRows || [])
    .map((r) => String(r.inspection_date || "").slice(0, 7))
    .filter(Boolean)
    .sort();

  if (!from && rowMonths.length) from = rowMonths[0];
  if (!to && rowMonths.length) to = rowMonths[rowMonths.length - 1];

  if (!from || !to) {
    const y = String(new Date().getFullYear());
    from = `${y}-01`;
    to = `${y}-12`;
  }

  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);

  if (!y || !m || !ey || !em) return [];

  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 60) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
    guard += 1;
  }

  return out;
}

function negativeSourceGroup(row) {
  const src = String(row?.record_source || "vetting_inspection").trim();

  if (src === "vetting_inspection") return "vetting";
  if (isInternalAuditRecordSource(src)) return "internal";
  if (isExternalAuditRecordSource(src)) return "external";

  return "";
}

function renderNegativeSourceTrend(rowsIgnoreTypeFilter) {
  const box = safeEl("chartNegativeSourceTrend");
  if (!box) return;

  const { p_from, p_to } = getFilters();
  const months = monthRangeBetween(p_from, p_to, rowsIgnoreTypeFilter);

  if (!months.length) {
    box.innerHTML = `<div class="emptyChart">No month range available.</div>`;
    return;
  }

  const series = {
    vetting: { label: "Vetting Observations", values: new Map(months.map((m) => [m, 0])), css: "vetting" },
    internal: { label: "Internal Audits", values: new Map(months.map((m) => [m, 0])), css: "internal" },
    external: { label: "External Audits", values: new Map(months.map((m) => [m, 0])), css: "external" },
  };

  for (const row of rowsIgnoreTypeFilter || []) {
    if (normalizeType(row.observation_type) !== "negative") continue;

    const month = String(row.inspection_date || "").slice(0, 7);
    if (!months.includes(month)) continue;

    const group = negativeSourceGroup(row);
    if (!group || !series[group]) continue;

    series[group].values.set(month, (series[group].values.get(month) || 0) + 1);
  }

  const width = 920;
  const height = 300;
  const padL = 52;
  const padR = 22;
  const padT = 22;
  const padB = 54;

  const allValues = Object.values(series).flatMap((s) => months.map((m) => Number(s.values.get(m) || 0)));
  const maxVal = Math.max(...allValues, 1);

  const xFor = (idx) => {
    if (months.length <= 1) return padL;
    return padL + (idx * (width - padL - padR)) / (months.length - 1);
  };

  const yFor = (value) => {
    return padT + (height - padT - padB) * (1 - Number(value || 0) / maxVal);
  };

  const pointsFor = (s) => months.map((m, idx) => `${xFor(idx).toFixed(1)},${yFor(s.values.get(m) || 0).toFixed(1)}`).join(" ");

  const xLabels = months.map((m, idx) => {
    const show = months.length <= 14 || idx % Math.ceil(months.length / 12) === 0 || idx === months.length - 1;
    if (!show) return "";
    return `<text x="${xFor(idx).toFixed(1)}" y="${height - 18}" text-anchor="middle" class="oi-axis-label">${esc(m)}</text>`;
  }).join("");

  const yTicks = [0, Math.ceil(maxVal / 2), maxVal]
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .map((v) => {
      const y = yFor(v);
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" class="oi-grid-line"></line>
        <text x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="oi-axis-label">${esc(v)}</text>
      `;
    }).join("");

  const totals = Object.fromEntries(
    Object.entries(series).map(([k, s]) => [k, months.reduce((sum, m) => sum + Number(s.values.get(m) || 0), 0)])
  );

  box.innerHTML = `
    <style>
      #chartNegativeSourceTrend .oi-trend-wrap{border:1px solid #dbe8f8;border-radius:14px;background:#fff;padding:10px;overflow-x:auto;}
      #chartNegativeSourceTrend svg{min-width:760px;width:100%;height:auto;display:block;}
      #chartNegativeSourceTrend .oi-grid-line{stroke:#e4edf8;stroke-width:1;}
      #chartNegativeSourceTrend .oi-axis{stroke:#b7cbe6;stroke-width:1.2;}
      #chartNegativeSourceTrend .oi-axis-label{fill:#35507b;font-size:11px;font-weight:800;}
      #chartNegativeSourceTrend .oi-line{fill:none;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;}
      #chartNegativeSourceTrend .oi-line.vetting{stroke:#2563eb;}
      #chartNegativeSourceTrend .oi-line.internal{stroke:#dc2626;}
      #chartNegativeSourceTrend .oi-line.external{stroke:#16a34a;}
      #chartNegativeSourceTrend .oi-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:#143a63;font-weight:900;font-size:.88rem;}
      #chartNegativeSourceTrend .oi-legend span{display:inline-flex;align-items:center;gap:6px;}
      #chartNegativeSourceTrend .oi-dot{width:11px;height:11px;border-radius:999px;display:inline-block;}
      #chartNegativeSourceTrend .oi-dot.vetting{background:#2563eb;}
      #chartNegativeSourceTrend .oi-dot.internal{background:#dc2626;}
      #chartNegativeSourceTrend .oi-dot.external{background:#16a34a;}
    </style>
    <div class="oi-trend-wrap">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Negative observations source trend">
        ${yTicks}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" class="oi-axis"></line>
        <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" class="oi-axis"></line>
        <polyline class="oi-line vetting" points="${pointsFor(series.vetting)}"></polyline>
        <polyline class="oi-line internal" points="${pointsFor(series.internal)}"></polyline>
        <polyline class="oi-line external" points="${pointsFor(series.external)}"></polyline>
        ${xLabels}
      </svg>
      <div class="oi-legend">
        <span><i class="oi-dot vetting"></i> Vetting Observations: ${esc(totals.vetting)}</span>
        <span><i class="oi-dot internal"></i> Internal Audits: ${esc(totals.internal)}</span>
        <span><i class="oi-dot external"></i> External Audits: ${esc(totals.external)}</span>
      </div>
    </div>
  `;
}


function renderMonthlyTrend(rows, reportRows) {
  const tbody = safeTbody("monthlyTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const trendYear = String(el("trendYearFilter")?.value || "").trim();
  const grouped = buildMonthlyRows(rows, reportRows, trendYear);

  for (const r of grouped) {
    const insp = r.reports.size;
    const drillId = registerDrill(`Monthly Trend: ${r.month}`, r.rows, null, `Records for ${r.month}.`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(r.month)}</td>
      <td>${esc(insp)}</td>
      <td>${esc(r.observations)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(avg(r.negative, insp))}</td>
      <td>${esc(avg(r.positive, insp))}</td>
      <td>${esc(avg(r.largely, insp))}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 10, "No monthly data for current filters.");
  bindDrillButtons(tbody);
}

function renderBarChart(containerId, rows, options = {}) {
  const box = safeEl(containerId);
  if (!box) return;

  const labelFn = options.labelFn || ((r) => r.key);
  const obsFn = options.obsFn || ((r) => r.observation_count ?? r.observations ?? 0);
  const inspFn = options.inspFn || ((r) => r.report_count ?? r.inspections ?? 0);
  const rowsFn = options.rowsFn || ((r) => r.rows || []);
  const titleFn = options.titleFn || ((r) => String(labelFn(r) || "Records"));
  const limit = Number(options.limit || 10);
  const emptyText = options.emptyText || "No chart data for current filters.";

  const chartRows = (rows || [])
    .filter((r) => Number(obsFn(r) || 0) > 0)
    .slice(0, limit);

  if (!chartRows.length) {
    box.innerHTML = `<div class="emptyChart">${esc(emptyText)}</div>`;
    return;
  }

  const max = Math.max(...chartRows.map((r) => Number(obsFn(r) || 0)), 1);

  box.innerHTML = chartRows.map((r) => {
    const label = String(labelFn(r) || "—");
    const obs = Number(obsFn(r) || 0);
    const inspections = Number(inspFn(r) || 0);
    const average = avg(obs, inspections);
    const pct = Math.max(3, Math.round((obs / max) * 100));
    const drillId = registerDrill(titleFn(r), rowsFn(r), null, `Chart row: ${label}`);

    return `
      <div class="barRow" title="${esc(label)}: ${esc(obs)} obs / ${esc(inspections)} insp. / avg ${esc(average)}">
        <div class="barLabel">${esc(label)}</div>
        <div class="barTrack"><div class="barFill" style="width:${pct}%"></div></div>
        <div class="barValue">${esc(obs)} / ${esc(inspections)} / ${esc(average)}</div>
        <div>${buttonHtml(drillId)}</div>
      </div>
    `;
  }).join("");

  bindDrillButtons(box);
}

function rowsOfType(rows, type) {
  return (rows || []).filter((r) => normalizeType(r.observation_type) === type);
}

function groupChartRowsByKey(rows, keyFn) {
  const reportCountTotal = new Set(rows.map(reportKey)).size;
  return groupObjectiveRows(rows, keyFn).map((g) => ({
    ...g,
    inspections: g.report_count || reportCountTotal,
    observations: g.observation_count,
    rows: rows.filter((r) => String(keyFn(r) || "—").trim() === g.key),
  }));
}

function renderTypeVisuals(rows, reportRows) {
  const neg = rowsOfType(rows, "negative");
  const largely = rowsOfType(rows, "largely");
  const positive = rowsOfType(rows, "positive");

  renderBarChart("chartNegCategory", groupChartRowsByKey(neg, (r) => r.designation), { limit: 10, titleFn: (r) => `Negative — ${r.key}` });
  renderBarChart("chartLargelyCategory", groupChartRowsByKey(largely, (r) => r.designation), { limit: 10, titleFn: (r) => `Largely — ${r.key}` });

  renderBarChart("chartNegMonthly", buildPeriodRows(neg, reportRows, monthKey), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 18, titleFn: (r) => `Negative — ${r.key}` });
  renderBarChart("chartLargelyMonthly", buildPeriodRows(largely, reportRows, monthKey), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 18, titleFn: (r) => `Largely — ${r.key}` });
  renderBarChart("chartPositiveMonthly", buildPeriodRows(positive, reportRows, monthKey), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 18, titleFn: (r) => `Positive — ${r.key}` });

  renderBarChart("chartNegQuarterly", buildPeriodRows(neg, reportRows, quarterOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 16, titleFn: (r) => `Negative — ${r.key}` });
  renderBarChart("chartLargelyQuarterly", buildPeriodRows(largely, reportRows, quarterOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 16, titleFn: (r) => `Largely — ${r.key}` });
  renderBarChart("chartPositiveQuarterly", buildPeriodRows(positive, reportRows, quarterOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 16, titleFn: (r) => `Positive — ${r.key}` });

  renderBarChart("chartNegAnnual", buildPeriodRows(neg, reportRows, yearOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 10, titleFn: (r) => `Negative — ${r.key}` });
  renderBarChart("chartLargelyAnnual", buildPeriodRows(largely, reportRows, yearOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 10, titleFn: (r) => `Largely — ${r.key}` });
  renderBarChart("chartPositiveAnnual", buildPeriodRows(positive, reportRows, yearOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 10, titleFn: (r) => `Positive — ${r.key}` });
}

function renderByVessel(rows, reportRows) {
  const tbody = safeTbody("byVesselTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const reportCountMap = reportCountsByKey(reportRows, (r) => r.vessel_name);
  const grouped = groupTypeSplitRows(rows, (r) => r.vessel_name, (key) => reportCountMap.get(key) || 0);

  for (const name of reportCountMap.keys()) {
    if (!grouped.some((x) => x.key === name)) {
      grouped.push({
        key: name,
        inspections: reportCountMap.get(name) || 0,
        negative: 0,
        largely: 0,
        positive: 0,
        total: 0,
        avg_negative: "0.00",
        avg_largely: "0.00",
        avg_positive: "0.00",
      });
    }
  }

  grouped.sort((a, b) => String(a.key).localeCompare(String(b.key)));

  for (const r of grouped) {
    const matched = rows.filter((x) => String(x.vessel_name || "—").trim() === r.key);
    const drillId = registerDrill(`Vessel: ${r.key}`, matched, null, `All matching observations for vessel ${r.key}.`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.inspections)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.avg_negative)}</td>
      <td>${esc(r.avg_largely)}</td>
      <td>${esc(r.avg_positive)}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 9, "No vessel data for current filters.");
  bindDrillButtons(tbody);
}

function renderFleetAverage(rows, reportRows) {
  const tbody = safeTbody("avgFleetTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const counts = typeCountsFromRows(rows);
  const inspections = reportRows.length;
  const drillId = registerDrill("Selected scope — all matching observations", rows, reportRows, "All records inside the currently selected scope.");

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>Selected scope</td>
    <td>${esc(inspections)}</td>
    <td>${esc(counts.negative)}</td>
    <td>${esc(counts.largely)}</td>
    <td>${esc(counts.positive)}</td>
    <td>${esc(avg(counts.negative, inspections))}</td>
    <td>${esc(avg(counts.largely, inspections))}</td>
    <td>${esc(avg(counts.positive, inspections))}</td>
    <td>${buttonHtml(drillId)}</td>
  `;
  tbody.appendChild(tr);
  bindDrillButtons(tbody);
}

function renderAverageGroupTable(rows, reportRows, keyFnRows, keyFnReports, tbodyId, emptyLabel) {
  const tbody = safeTbody(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  const reportCountMap = reportCountsByKey(reportRows, keyFnReports);
  const grouped = groupTypeSplitRows(rows, keyFnRows, (key) => reportCountMap.get(key) || 0);

  for (const key of reportCountMap.keys()) {
    if (!grouped.some((x) => x.key === key)) {
      grouped.push({
        key,
        inspections: reportCountMap.get(key) || 0,
        negative: 0,
        largely: 0,
        positive: 0,
        total: 0,
        avg_negative: "0.00",
        avg_largely: "0.00",
        avg_positive: "0.00",
      });
    }
  }

  grouped.sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)));

  for (const r of grouped) {
    const matched = rows.filter((x) => String(keyFnRows(x) || "—").trim() === r.key);
    const drillId = registerDrill(`${emptyLabel}: ${r.key}`, matched, null, `All matching observations for ${emptyLabel}: ${r.key}.`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.inspections)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.avg_negative)}</td>
      <td>${esc(r.avg_largely)}</td>
      <td>${esc(r.avg_positive)}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 9, `No ${emptyLabel} data for current filters.`);
  bindDrillButtons(tbody);
}

function renderByType(rowsIgnoreTypeFilter, reportRows) {
  const tbody = safeTbody("byTypeTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const t of OBS_TYPES) {
    const rows = rowsOfType(rowsIgnoreTypeFilter, t.value);
    const reports = new Set(rows.map((r) => reportKey(r)));
    const drillId = registerDrill(`Observation Type: ${t.label}`, rows, null, `All ${t.label} observations for the selected vessel/date/source scope.`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(t.label)}</td>
      <td>${esc(reports.size)}</td>
      <td>${esc(rows.length)}</td>
      <td>${esc(avg(rows.length, reportRows.length))}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  bindDrillButtons(tbody);
}

function recurringFilteredRows(rows) {
  const selectedYears = new Set(getSelectedRecurringYears());
  const selectedMonths = new Set(getSelectedRecurringMonths());

  return (rows || []).filter((r) => {
    if (selectedYears.size > 0 && !selectedYears.has(yearOf(r))) return false;
    if (selectedMonths.size > 0 && !selectedMonths.has(monthOf(r))) return false;
    return true;
  });
}

function renderTopRecurringQuestions(rows) {
  const tbody = safeTbody("topQnsTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const minCount = Math.max(1, Number(el("recurringMinCount")?.value || 4));
  const filtered = recurringFilteredRows(rows);

  const grouped = groupObjectiveRows(
    filtered,
    (r) => `${r.question_no || "—"}||${normalizeType(r.observation_type)}`
  )
    .filter((r) => r.observation_count >= minCount)
    .slice(0, 100);

  for (const r of grouped) {
    const parts = String(r.key || "").split("||");
    const qno = parts[0] || "";
    const obsType = parts[1] || "";

    const meta = state.libByNo.get(qno) || null;
    const ch = meta ? getChap(meta) : "";
    const sec = meta ? getSection(meta) : "";
    const sh = meta ? getShort(meta) : "";
    const label = typeLabel(obsType);

    const matched = filtered.filter((x) => String(x.question_no || "") === qno && normalizeType(x.observation_type) === obsType);
    const drillId = registerDrill(`Recurring Question ${qno} — ${label}`, matched, null, `Threshold: ${minCount}.`);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(qno)}</td>
      <td>${esc(ch)}</td>
      <td>${esc(sec)}</td>
      <td>${esc(sh)}</td>
      <td>${esc(label)}</td>
      <td>${esc(r.observation_count)}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 7, `No recurring questions found at threshold ${minCount}.`);
  bindDrillButtons(tbody);
}

function renderByCategory(rows, reportRows) {
  renderTypeSplitTable("byCategoryTbody", groupTypeSplitRows(rows, (r) => r.designation, () => reportRows.length), rows, (r) => r.designation, "category");
}

function renderTopSoc(rows, reportRows) {
  renderTypeSplitTable("topSocTbody", groupTypeSplitRows(rows, (r) => r.soc, () => reportRows.length), rows, (r) => r.soc, "SOC", 100);
}

function renderTopNoc(rows, reportRows) {
  renderTypeSplitTable("topNocTbody", groupTypeSplitRows(rows, (r) => r.noc, () => reportRows.length), rows, (r) => r.noc, "NOC", 100);
}

function extractPgnoAnalyticsRows(rows) {
  const out = [];

  for (const row of rows || []) {
    const pgArr = Array.isArray(row.pgno_selected) ? row.pgno_selected : [];
    for (const pg of pgArr) {
      const pgnoNo = String(pg?.pgno_no || pg?.idx || "").trim();
      const pgText = String(pg?.text || "").trim();
      const label = pgnoNo && pgText ? `${pgnoNo} — ${pgText}` : (pgnoNo || pgText);

      if (!label) continue;

      out.push({
        ...row,
        pgno_label: label,
        pgno_no: pgnoNo,
        pgno_text: pgText,
      });
    }
  }

  return out;
}

function renderPgnoAnalytics(rows, reportRows) {
  const pgRows = extractPgnoAnalyticsRows(rows);
  const byPgno = groupObjectiveRows(pgRows, (r) => r.pgno_label).slice(0, 50);
  const byPgnoQuestion = groupObjectiveRows(pgRows, (r) => r.question_no).slice(0, 50);

  renderBarChart("chartPgno", byPgno.map((x) => ({ ...x, rows: pgRows.filter((r) => r.pgno_label === x.key) })), {
    labelFn: (r) => r.key,
    obsFn: (r) => r.observation_count,
    inspFn: (r) => r.report_count,
    rowsFn: (r) => r.rows,
    limit: 10,
    emptyText: "No assigned PGNOs for current filters.",
    titleFn: (r) => `PGNO: ${r.key}`,
  });

  renderBarChart("chartPgnoQuestion", byPgnoQuestion.map((x) => ({ ...x, rows: pgRows.filter((r) => r.question_no === x.key) })), {
    labelFn: (r) => r.key,
    obsFn: (r) => r.observation_count,
    inspFn: (r) => r.report_count,
    rowsFn: (r) => r.rows,
    limit: 10,
    emptyText: "No PGNO/question data for current filters.",
    titleFn: (r) => `PGNO Question: ${r.key}`,
  });

  const missingRows = (rows || []).filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    const type = normalizeType(r.observation_type);
    return (type === "negative" || type === "largely") && arr.length === 0;
  });

  renderBarChart("chartPgnoMissing", buildPeriodRows(missingRows, reportRows, monthKey), {
    labelFn: (r) => r.key,
    obsFn: (r) => r.observations,
    inspFn: (r) => r.inspections,
    rowsFn: (r) => r.rows,
    limit: 18,
    emptyText: "No missing PGNOs for current filters.",
    titleFn: (r) => `Missing PGNO: ${r.key}`,
  });

  const tbody = safeTbody("pgnoTableTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const r of byPgno) {
    const matched = pgRows.filter((x) => x.pgno_label === r.key);
    const drillId = registerDrill(`PGNO: ${r.key}`, matched, null, "Assigned PGNO records.");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.observation_count)}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.avg_per_inspection)}</td>
      <td>${esc(r.last_seen || "")}</td>
      <td>${buttonHtml(drillId)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!byPgno.length) ensureTbodyMessage(tbody, 6, "No assigned PGNO data for current filters.");
  bindDrillButtons(tbody);
}



function mscatSelectedObservationTypes() {
  const out = [];
  if (safeEl("mscatTypeNegative")?.checked) out.push("negative");
  if (safeEl("mscatTypeLargely")?.checked) out.push("largely");
  if (safeEl("mscatTypePositive")?.checked) out.push("positive");
  return out.length ? out : ["negative"];
}

function mscatSelectedSourceGroups() {
  const selected = selectedCheckboxValues("mscatSourceCheckList");
  if (selected.length) return selected;
  return [];
}

function mscatSelectedSectionKeys() {
  const selected = selectedCheckboxValues("mscatSectionCheckList");
  if (selected.length) return selected;
  return [];
}

function mscatSelectedSourceScope() {
  // Broad RPC scope. Exact source filtering is applied client-side from csvb_stats_mscat_records.
  return "combined";
}

function mscatSelectedSectionKey() {
  // Broad RPC scope. Exact section filtering is applied client-side from csvb_stats_mscat_records.
  return "all";
}

function mscatSourceGroupMatches(row, selectedSources = null) {
  const selected = selectedSources || mscatSelectedSourceGroups();
  if (!selected.length) return false;

  const sourceGroup = String(row?.source_group || "").trim();
  const sourceFamily = String(row?.source_family || "").trim();

  if (sourceFamily === "vetting") return selected.includes("vetting_inspection");
  return selected.includes(sourceGroup);
}

function mscatSectionMatches(row, selectedSections = null) {
  const selected = selectedSections || mscatSelectedSectionKeys();
  if (!selected.length) return false;

  const sectionKey = String(row?.section_key || "").trim().toLowerCase();
  const sectionLabel = String(row?.section_label || "").trim().toLowerCase();

  return selected.some((s) => {
    const x = String(s || "").trim().toLowerCase();
    return sectionKey === x || sectionLabel === x || sectionLabel.includes(x);
  });
}

function updateMscatFilterSummaries() {
  updateDropSummary("mscatSourceDropBtn", "M-SCAT sources", mscatSelectedSourceGroups().length, MSCAT_SOURCE_OPTIONS.length);
  updateDropSummary("mscatSectionDropBtn", "M-SCAT sections", mscatSelectedSectionKeys().length, MSCAT_SECTION_OPTIONS.length);
}

function mscatSelectedGrouping() {
  return String(safeEl("mscatGrouping")?.value || "month").trim() || "month";
}


function mscatItemsDisplayLimit() {
  const raw = String(safeEl("mscatItemsLimit")?.value || "10").trim();

  if (raw === "all") return Infinity;

  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function mscatItemsDisplayLimitLabel(limit, total) {
  if (!Number.isFinite(limit)) return `Showing all ${total} loaded M-SCAT item(s).`;
  return `Showing Top ${Math.min(limit, total)} of ${total} loaded M-SCAT item(s).`;
}


function mscatIncludeAi() {
  const node = safeEl("mscatIncludeAi");
  return node ? !!node.checked : true;
}

function mscatIncludeManual() {
  const node = safeEl("mscatIncludeManual");
  return node ? !!node.checked : true;
}

function mscatRpcArgs(limit = 50) {
  const f = getFilters();
  const vesselIds = Array.isArray(f.selected_vessel_ids) ? f.selected_vessel_ids.filter(Boolean) : [];
  const auditTypeIds = Array.isArray(f.selected_audit_types) ? f.selected_audit_types.filter(Boolean) : [];

  return {
    p_source_scope: mscatSelectedSourceScope(),
    p_section_key: mscatSelectedSectionKey(),
    p_from: f.p_from || null,
    p_to: f.p_to || null,
    p_vessel_ids: vesselIds.length ? vesselIds : null,
    p_observation_types: mscatSelectedObservationTypes(),
    p_include_ai: mscatIncludeAi(),
    p_include_manual: mscatIncludeManual(),
    p_audit_type_ids: auditTypeIds.length ? auditTypeIds : null,
    p_limit: limit,
  };
}

function mscatTrendRpcArgs() {
  const args = mscatRpcArgs(100);
  delete args.p_limit;
  args.p_grouping = mscatSelectedGrouping();
  return args;
}


function mscatSummaryRpcArgs() {
  const args = mscatRpcArgs(1);
  delete args.p_limit;
  return args;
}


function mscatSourceDisplay(row) {
  const sg = String(row?.source_group || "").trim();
  if (sg === "vetting_inspection") return "Vetting";
  if (sg === "audit_internal_superintendent") return "Audit — Superintendent";
  if (sg === "audit_internal_master") return "Audit — Master";
  if (sg === "audit_external_contractor") return "Audit — External";
  return sg || String(row?.source_family || "—");
}

function mscatItemDisplay(row) {
  const code = String(row?.item_code || row?.item_no || "").trim();
  const label = String(row?.item_label || "").trim();
  if (code && label) return `${code} — ${label}`;
  return label || code || "—";
}


function mscatItemAggregationKey(row) {
  return String(row?.taxonomy_id || row?.item_code || row?.item_no || row?.item_label || "").trim();
}

function mscatSourceSummary(row) {
  if (Array.isArray(row?.source_labels) && row.source_labels.length) {
    return row.source_labels.join(", ");
  }
  return mscatSourceDisplay(row);
}

function aggregateMscatItems(items) {
  const map = new Map();

  for (const row of items || []) {
    const key = mscatItemAggregationKey(row);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        ...row,
        selection_count: 0,
        observation_count: 0,
        report_count: 0,
        vessel_count: 0,
        ai_count: 0,
        manual_count: 0,
        source_labels: [],
        source_label_set: new Set(),
        first_seen: row.first_seen || "",
        last_seen: row.last_seen || "",
      });
    }

    const item = map.get(key);

    item.selection_count += Number(row.selection_count || 0);
    item.observation_count += Number(row.observation_count || 0);

    if (!item.source_counts) item.source_counts = {};
    if (row.source_counts && typeof row.source_counts === "object") {
      for (const [mergeSourceKey, mergeCount] of Object.entries(row.source_counts)) {
        item.source_counts[mergeSourceKey] = Number(item.source_counts[mergeSourceKey] || 0) + Number(mergeCount || 0);
      }
    } else {
      const mergeSourceKey = recordSourceGroupForMscat(row);
      if (mergeSourceKey) item.source_counts[mergeSourceKey] = Number(item.source_counts[mergeSourceKey] || 0) + Number(row.selection_count || 0);
    }
    item.report_count += Number(row.report_count || 0);
    item.vessel_count += Number(row.vessel_count || 0);
    item.ai_count += Number(row.ai_count || 0);
    item.manual_count += Number(row.manual_count || 0);

    const srcLabel = mscatSourceDisplay(row);
    if (srcLabel && !item.source_label_set.has(srcLabel)) {
      item.source_label_set.add(srcLabel);
      item.source_labels.push(srcLabel);
    }

    const first = String(row.first_seen || "");
    const last = String(row.last_seen || "");

    if (first && (!item.first_seen || first < item.first_seen)) item.first_seen = first;
    if (last && (!item.last_seen || last > item.last_seen)) item.last_seen = last;
  }

  return [...map.values()]
    .map((row) => {
      delete row.source_label_set;
      row.source_labels = row.source_labels || [];
      return row;
    })
    .sort((a, b) =>
      Number(b.selection_count || 0) - Number(a.selection_count || 0) ||
      Number(b.observation_count || 0) - Number(a.observation_count || 0) ||
      String(a.item_code || a.item_no || "").localeCompare(String(b.item_code || b.item_no || ""))
    );
}


function renderMscatKpis(items) {
  const rows = aggregateMscatItems(Array.isArray(items) ? items : []);
  const totals = rows.reduce((acc, row) => {
    acc.selections += Number(row.selection_count || 0);
    acc.observations += Number(row.observation_count || 0);
    acc.reports += Number(row.report_count || 0);
    acc.vessels += Number(row.vessel_count || 0);
    return acc;
  }, { selections: 0, observations: 0, reports: 0, vessels: 0 });

  const top = rows[0] || null;

  setText("mscatKpiSelections", String(totals.selections));
  setText("mscatKpiObservations", String(totals.observations));
  setText("mscatKpiReports", String(totals.reports));
  setText("mscatKpiVessels", String(totals.vessels));
  setText("mscatKpiTopItem", top ? String(top.item_code || top.item_no || "—") : "—");
  setText(
    "mscatKpiTopItemSub",
    top ? `${mscatItemDisplay(top)} / ${top.selection_count || 0} selection(s).` : "No M-SCAT data for current filters."
  );
}


function renderMscatKpisFromSummary(summaryRows, fallbackItems) {
  const row = Array.isArray(summaryRows) ? (summaryRows[0] || null) : (summaryRows || null);

  if (!row) {
    renderMscatKpis(fallbackItems || []);
    return;
  }

  const topCode = String(row.top_item_code || row.top_item_no || "—").trim() || "—";
  const topLabel = String(row.top_item_label || "").trim();
  const topCount = Number(row.top_selection_count || 0);

  setText("mscatKpiSelections", String(row.selection_count || 0));
  setText("mscatKpiObservations", String(row.observation_count || 0));
  setText("mscatKpiReports", String(row.report_count || 0));
  setText("mscatKpiVessels", String(row.vessel_count || 0));
  setText("mscatKpiTopItem", topCode);
  setText(
    "mscatKpiTopItemSub",
    topCount
      ? `${topCode}${topLabel ? " — " + topLabel : ""} / ${topCount} selection(s).`
      : "No M-SCAT data for current filters."
  );
}


function renderMscatItemsTable(items) {
  const tbody = safeTbody("mscatItemsTbody");
  if (!tbody) return;

  const rows = aggregateMscatItems(Array.isArray(items) ? items : []);
  tbody.innerHTML = "";

  if (!rows.length) {
    ensureTbodyMessage(tbody, 12, "No M-SCAT items for current filters.");
    return;
  }

  const limit = mscatItemsDisplayLimit();
  const visibleRows = Number.isFinite(limit) ? rows.slice(0, limit) : rows;

  setText("mscatItemsLimitNote", mscatItemsDisplayLimitLabel(limit, rows.length) + " Use View to open the related observation collection.");

  for (const row of visibleRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(row.section_label || row.section_key || "—")}</td>
      <td>${esc(row.subsection_label || row.subsection_key || "—")}</td>
      <td>${esc(mscatItemDisplay(row))}</td>
      <td>${esc(mscatSourceSummary(row))}</td>
      <td>${esc(row.selection_count || 0)}</td>
      <td>${esc(row.observation_count || 0)}</td>
      <td>${esc(row.report_count || 0)}</td>
      <td>${esc(row.vessel_count || 0)}</td>
      <td>${esc(row.ai_count || 0)}</td>
      <td>${esc(row.manual_count || 0)}</td>
      <td>${esc(row.last_seen || "—")}</td>
      <td>
        <button
          class="btn btn-muted btn-small mscatItemRecordsBtn"
          type="button"
          data-taxonomy-id="${esc(row.taxonomy_id || "")}"
          data-item-label="${esc(mscatItemDisplay(row))}"
        >View</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  bindMscatRecordButtons(tbody);
}



function recordSourceGroupForMscat(row) {
  const family = String(row?.source_family || "").trim();
  const group = String(row?.source_group || "").trim();

  if (family === "vetting") return "vetting_inspection";
  return group || "audit_unknown";
}

function mscatSourceGroupLabel(group) {
  if (group === "vetting_inspection") return "Vetting Inspections";
  if (group === "audit_internal_superintendent") return "Audit — Marine Superintendent";
  if (group === "audit_internal_master") return "Audit — Master";
  if (group === "audit_external_contractor") return "Audit — External Auditor";
  return group || "—";
}


function mscatSourceColor(group) {
  const key = String(group || "").trim();

  if (key === "vetting_inspection") return "#2563eb";
  if (key === "audit_internal_superintendent") return "#dc2626";
  if (key === "audit_internal_master") return "#f59e0b";
  if (key === "audit_external_contractor") return "#16a34a";

  return "#64748b";
}

function mscatSourceShortLabel(group) {
  const key = String(group || "").trim();

  if (key === "vetting_inspection") return "Vetting";
  if (key === "audit_internal_superintendent") return "Sup.";
  if (key === "audit_internal_master") return "Master";
  if (key === "audit_external_contractor") return "External";

  return key || "Other";
}

function mscatSourceOrder() {
  return [
    "vetting_inspection",
    "audit_internal_superintendent",
    "audit_internal_master",
    "audit_external_contractor",
  ];
}


function mscatRecordKey(row, field) {
  const family = String(row?.source_family || "").trim();
  return `${family}:${String(row?.[field] || "").trim()}`;
}

function recordsToMscatItemRows(records) {
  const map = new Map();

  for (const row of records || []) {
    const key = mscatItemAggregationKey(row);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        source_family: row.source_family,
        source_group: row.source_group,
        section_key: row.section_key,
        section_label: row.section_label,
        subsection_key: row.subsection_key,
        subsection_label: row.subsection_label,
        taxonomy_id: row.taxonomy_id,
        item_code: row.item_code,
        item_no: row.item_no,
        item_label: row.item_label,
        selection_count: 0,
        observation_count: 0,
        report_count: 0,
        vessel_count: 0,
        ai_count: 0,
        manual_count: 0,
        first_seen: "",
        last_seen: "",
        source_labels: [],
        source_label_set: new Set(),
        source_counts: {},
        observation_keys: new Set(),
        report_keys: new Set(),
        vessel_ids: new Set(),
      });
    }

    const item = map.get(key);

    item.selection_count += 1;
    item.observation_keys.add(mscatRecordKey(row, "source_observation_item_id"));
    item.report_keys.add(mscatRecordKey(row, "source_report_id"));
    if (row.vessel_id) item.vessel_ids.add(String(row.vessel_id));

    if (String(row.selection_source || "") === "ai_suggested") item.ai_count += 1;
    if (String(row.selection_source || "") === "manual") item.manual_count += 1;

    const sourceGroupKey = recordSourceGroupForMscat(row);
    item.source_counts[sourceGroupKey] = Number(item.source_counts[sourceGroupKey] || 0) + 1;

    const srcLabel = mscatSourceGroupLabel(sourceGroupKey);
    if (srcLabel && !item.source_label_set.has(srcLabel)) {
      item.source_label_set.add(srcLabel);
      item.source_labels.push(srcLabel);
    }

    const d = String(row.event_date || "");
    if (d && (!item.first_seen || d < item.first_seen)) item.first_seen = d;
    if (d && (!item.last_seen || d > item.last_seen)) item.last_seen = d;
  }

  return [...map.values()].map((item) => {
    item.observation_count = item.observation_keys.size;
    item.report_count = item.report_keys.size;
    item.vessel_count = item.vessel_ids.size;

    delete item.source_label_set;
    delete item.observation_keys;
    delete item.report_keys;
    delete item.vessel_ids;

    return item;
  }).sort((a, b) =>
    Number(b.selection_count || 0) - Number(a.selection_count || 0) ||
    Number(b.observation_count || 0) - Number(a.observation_count || 0) ||
    String(a.item_code || a.item_no || "").localeCompare(String(b.item_code || b.item_no || ""))
  );
}

function mscatSummaryFromRecords(records) {
  const rows = records || [];
  const obs = new Set();
  const reps = new Set();
  const vessels = new Set();

  let ai = 0;
  let manual = 0;
  let first = "";
  let last = "";

  for (const row of rows) {
    obs.add(mscatRecordKey(row, "source_observation_item_id"));
    reps.add(mscatRecordKey(row, "source_report_id"));
    if (row.vessel_id) vessels.add(String(row.vessel_id));

    if (String(row.selection_source || "") === "ai_suggested") ai += 1;
    if (String(row.selection_source || "") === "manual") manual += 1;

    const d = String(row.event_date || "");
    if (d && (!first || d < first)) first = d;
    if (d && (!last || d > last)) last = d;
  }

  const items = recordsToMscatItemRows(rows);
  const top = items[0] || {};

  return [{
    selection_count: rows.length,
    observation_count: obs.size,
    report_count: reps.size,
    vessel_count: vessels.size,
    ai_count: ai,
    manual_count: manual,
    first_seen: first,
    last_seen: last,
    top_taxonomy_id: top.taxonomy_id || null,
    top_item_code: top.item_code || "",
    top_item_no: top.item_no || "",
    top_item_label: top.item_label || "",
    top_section_key: top.section_key || "",
    top_section_label: top.section_label || "",
    top_selection_count: top.selection_count || 0,
  }];
}

function mscatBucketFromDate(dateValue, grouping) {
  const d = String(dateValue || "").slice(0, 10);
  if (!d) return "—";

  const y = d.slice(0, 4);
  const m = Number(d.slice(5, 7));

  if (grouping === "year") return y;
  if (grouping === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;

  return d.slice(0, 7);
}

function mscatTrendRowsFromRecords(records) {
  const grouping = mscatSelectedGrouping();
  const map = new Map();

  for (const row of records || []) {
    const bucket = mscatBucketFromDate(row.event_date, grouping);
    const sourceFamily = String(row.source_family || "").trim();
    const sectionKey = String(row.section_key || "").trim();
    const sectionLabel = String(row.section_label || "").trim();
    const key = `${bucket}|${sourceFamily}|${sectionKey}|${sectionLabel}`;

    if (!map.has(key)) {
      map.set(key, {
        bucket_key: bucket,
        source_family: sourceFamily,
        source_group: row.source_group || "",
        section_key: sectionKey,
        section_label: sectionLabel,
        selection_count: 0,
        observation_keys: new Set(),
        report_keys: new Set(),
        vessel_ids: new Set(),
        ai_count: 0,
        manual_count: 0,
      });
    }

    const item = map.get(key);
    item.selection_count += 1;
    item.observation_keys.add(mscatRecordKey(row, "source_observation_item_id"));
    item.report_keys.add(mscatRecordKey(row, "source_report_id"));
    if (row.vessel_id) item.vessel_ids.add(String(row.vessel_id));

    if (String(row.selection_source || "") === "ai_suggested") item.ai_count += 1;
    if (String(row.selection_source || "") === "manual") item.manual_count += 1;
  }

  return [...map.values()].map((item) => ({
    bucket_key: item.bucket_key,
    source_family: item.source_family,
    source_group: item.source_group,
    section_key: item.section_key,
    section_label: item.section_label,
    selection_count: item.selection_count,
    observation_count: item.observation_keys.size,
    report_count: item.report_keys.size,
    vessel_count: item.vessel_ids.size,
    ai_count: item.ai_count,
    manual_count: item.manual_count,
  }));
}


function buildMscatSourceMetricRows(records) {
  const map = new Map();

  for (const row of records || []) {
    const group = recordSourceGroupForMscat(row);

    if (!map.has(group)) {
      map.set(group, {
        group,
        label: mscatSourceGroupLabel(group),
        selections: 0,
        observations: new Set(),
        reports: new Set(),
        vessels: new Set(),
        ai: 0,
        manual: 0,
      });
    }

    const item = map.get(group);
    item.selections += 1;
    item.observations.add(mscatRecordKey(row, "source_observation_item_id"));
    item.reports.add(mscatRecordKey(row, "source_report_id"));
    if (row.vessel_id) item.vessels.add(String(row.vessel_id));
    if (String(row.selection_source || "") === "ai_suggested") item.ai += 1;
    if (String(row.selection_source || "") === "manual") item.manual += 1;
  }

  return mscatSourceOrder()
    .map((key) => map.get(key))
    .filter(Boolean)
    .map((row) => {
      const reportCount = row.reports.size;
      return {
        ...row,
        observation_count: row.observations.size,
        report_count: reportCount,
        vessel_count: row.vessels.size,
        avg_observations_per_report: reportCount ? row.observations.size / reportCount : 0,
        avg_selections_per_report: reportCount ? row.selections / reportCount : 0,
      };
    });
}



function ensureMscatPairwiseDifferent() {
  const aNode = safeEl("mscatPairSourceA");
  const bNode = safeEl("mscatPairSourceB");

  if (!aNode || !bNode) {
    return {
      sourceA: "vetting_inspection",
      sourceB: "audit_internal_superintendent",
    };
  }

  const sourceA = String(aNode.value || "vetting_inspection").trim();
  let sourceB = String(bNode.value || "audit_internal_superintendent").trim();

  if (sourceA === sourceB) {
    const replacement = mscatSourceOrder().find((x) => x !== sourceA) || "audit_internal_superintendent";
    sourceB = replacement;
    bNode.value = replacement;
  }

  return { sourceA, sourceB };
}


function mscatPairSourceA() {
  return String(safeEl("mscatPairSourceA")?.value || "vetting_inspection").trim();
}

function mscatPairSourceB() {
  return String(safeEl("mscatPairSourceB")?.value || "audit_internal_superintendent").trim();
}

function mscatPairMetric() {
  return String(safeEl("mscatPairMetric")?.value || "avg_observations_per_report").trim();
}

function mscatMetricLabel(metricKey) {
  const key = String(metricKey || "").trim();

  if (key === "selection_count") return "Selections";
  if (key === "observation_count") return "Observations";
  if (key === "report_count") return "Reports / Audits";
  if (key === "avg_observations_per_report") return "Avg observations / report";
  if (key === "avg_selections_per_report") return "Avg selections / report";

  return key || "Metric";
}

function mscatMetricValue(row, metricKey) {
  if (!row) return 0;

  const key = String(metricKey || "").trim();

  if (key === "selection_count") return Number(row.selections || 0);
  if (key === "observation_count") return Number(row.observation_count || 0);
  if (key === "report_count") return Number(row.report_count || 0);
  if (key === "avg_observations_per_report") return Number(row.avg_observations_per_report || 0);
  if (key === "avg_selections_per_report") return Number(row.avg_selections_per_report || 0);

  return 0;
}

function formatMscatMetric(value, metricKey) {
  const n = Number(value || 0);
  const key = String(metricKey || "").trim();

  if (key.startsWith("avg_")) return n.toFixed(2);
  return String(Math.round(n));
}

function renderMscatPairwiseComparison(records) {
  const tbody = safeTbody("mscatPairwiseComparisonTbody");
  const box = safeEl("mscatPairwiseComparisonChart");
  if (!tbody || !box) return;

  const rows = buildMscatSourceMetricRows(records);
  const byGroup = new Map(rows.map((row) => [row.group, row]));

  const pair = ensureMscatPairwiseDifferent();
  const sourceA = pair.sourceA;
  const sourceB = pair.sourceB;
  const rowA = byGroup.get(sourceA) || null;
  const rowB = byGroup.get(sourceB) || null;

  const labelA = mscatSourceGroupLabel(sourceA);
  const labelB = mscatSourceGroupLabel(sourceB);

  setText("mscatPairHeaderA", labelA);
  setText("mscatPairHeaderB", labelB);

  const metrics = [
    "observation_count",
    "report_count",
    "avg_observations_per_report",
    "selection_count",
    "avg_selections_per_report",
  ];

  tbody.innerHTML = "";

  if (!rowA && !rowB) {
    box.innerHTML = `<div class="mono">No pairwise M-SCAT data for the selected sources.</div>`;
    ensureTbodyMessage(tbody, 5, "No pairwise M-SCAT data for the selected sources.");
    return;
  }

  for (const metric of metrics) {
    const a = mscatMetricValue(rowA, metric);
    const b = mscatMetricValue(rowB, metric);
    const diff = a - b;
    const ratio = b ? (a / b) : null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(mscatMetricLabel(metric))}</td>
      <td>${esc(formatMscatMetric(a, metric))}</td>
      <td>${esc(formatMscatMetric(b, metric))}</td>
      <td>${esc(metric.startsWith("avg_") ? diff.toFixed(2) : String(Math.round(diff)))}</td>
      <td>${esc(ratio == null ? "N/A" : ratio.toFixed(2))}</td>
    `;
    tbody.appendChild(tr);
  }

  const primaryMetric = mscatPairMetric();
  const aVal = mscatMetricValue(rowA, primaryMetric);
  const bVal = mscatMetricValue(rowB, primaryMetric);
  const max = Math.max(aVal, bVal, 1);

  const bars = [
    { label: labelA, group: sourceA, value: aVal },
    { label: labelB, group: sourceB, value: bVal },
  ];

  box.innerHTML = `
    <div style="display:grid;gap:10px;">
      ${bars.map((bar) => {
        const pct = Math.max(4, Math.round((Number(bar.value || 0) / max) * 100));
        return `
          <div style="display:grid;grid-template-columns:minmax(180px,280px) 1fr 90px;gap:10px;align-items:center;">
            <div style="font-weight:900;color:#1a4170;">${esc(bar.label)}</div>
            <div style="height:14px;border-radius:999px;background:#e8f0fb;overflow:hidden;">
              <div style="width:${pct}%;height:100%;border-radius:999px;background:${esc(mscatSourceColor(bar.group))};"></div>
            </div>
            <div class="mono" style="text-align:right;">${esc(formatMscatMetric(bar.value, primaryMetric))}</div>
          </div>
        `;
      }).join("")}
      <div class="statL">Primary metric shown: ${esc(mscatMetricLabel(primaryMetric))}. Table below shows full pairwise comparison.</div>
    </div>
  `;
}


function renderMscatObservationComparison(records) {
  const box = safeEl("mscatObservationComparisonChart");
  const tbody = safeTbody("mscatObservationComparisonTbody");
  if (!box || !tbody) return;

  const rows = buildMscatSourceMetricRows(records);

  tbody.innerHTML = "";

  if (!rows.length) {
    box.innerHTML = `<div class="mono">No M-SCAT observation comparison data for current filters.</div>`;
    ensureTbodyMessage(tbody, 6, "No M-SCAT observation comparison data for current filters.");
    return;
  }

  const maxObs = Math.max(...rows.map((r) => Number(r.observation_count || 0)), 1);
  const maxAvg = Math.max(...rows.map((r) => Number(r.avg_observations_per_report || 0)), 1);

  box.innerHTML = `
    <div style="display:grid;gap:10px;">
      ${rows.map((row) => {
        const obsPct = Math.max(4, Math.round((Number(row.observation_count || 0) / maxObs) * 100));
        const avgPct = Math.max(4, Math.round((Number(row.avg_observations_per_report || 0) / maxAvg) * 100));

        return `
          <div style="display:grid;grid-template-columns:minmax(180px,260px) 1fr 120px;gap:10px;align-items:center;">
            <div style="font-weight:900;color:#1a4170;">${esc(row.label)}</div>
            <div style="display:grid;gap:5px;">
              <div style="height:12px;border-radius:999px;background:#e8f0fb;overflow:hidden;">
                <div title="Observations: ${esc(row.observation_count)}" style="width:${obsPct}%;height:100%;border-radius:999px;background:${esc(mscatSourceColor(row.group))};"></div>
              </div>
              <div style="height:8px;border-radius:999px;background:#edf2f7;overflow:hidden;">
                <div title="Avg observations/report: ${esc(row.avg_observations_per_report.toFixed(2))}" style="width:${avgPct}%;height:100%;border-radius:999px;background:${esc(mscatSourceColor(row.group))};opacity:.55;"></div>
              </div>
            </div>
            <div class="mono" style="text-align:right;">
              ${esc(row.observation_count)} obs / ${esc(row.report_count)} reports<br/>
              avg ${esc(row.avg_observations_per_report.toFixed(2))}
            </div>
          </div>
        `;
      }).join("")}
      <div class="statL">Thick bars compare linked observations. Thin bars compare average linked observations per report/audit.</div>
    </div>
  `;

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(row.label)}</td>
      <td>${esc(row.observation_count)}</td>
      <td>${esc(row.report_count)}</td>
      <td>${esc(row.avg_observations_per_report.toFixed(2))}</td>
      <td>${esc(row.selections)}</td>
      <td>${esc(row.avg_selections_per_report.toFixed(2))}</td>
    `;
    tbody.appendChild(tr);
  }
}


function renderMscatSourceComparison(records) {
  const tbody = safeTbody("mscatSourceComparisonTbody");
  if (!tbody) return;

  const rows = buildMscatSourceMetricRows(records);
  tbody.innerHTML = "";

  if (!rows.length) {
    ensureTbodyMessage(tbody, 8, "No M-SCAT source comparison data for current filters.");
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(row.label)}</td>
      <td>${esc(row.selections)}</td>
      <td>${esc(row.observation_count)}</td>
      <td>${esc(row.report_count)}</td>
      <td>${esc(row.vessel_count)}</td>
      <td>${esc(row.ai)}</td>
      <td>${esc(row.manual)}</td>
      <td>${esc(row.avg_selections_per_report.toFixed(2))}</td>
    `;
    tbody.appendChild(tr);
  }
}

function mscatAllRecordsRpcArgs(limit = 20000) {
  const f = getFilters();
  const vesselIds = Array.isArray(f.selected_vessel_ids) ? f.selected_vessel_ids.filter(Boolean) : [];
  const auditTypeIds = Array.isArray(f.selected_audit_types) ? f.selected_audit_types.filter(Boolean) : [];

  return {
    p_source_scope: "combined",
    p_section_key: "all",
    p_taxonomy_id: null,
    p_from: f.p_from || null,
    p_to: f.p_to || null,
    p_vessel_ids: vesselIds.length ? vesselIds : null,
    p_observation_types: mscatSelectedObservationTypes(),
    p_include_ai: mscatIncludeAi(),
    p_include_manual: mscatIncludeManual(),
    p_audit_type_ids: auditTypeIds.length ? auditTypeIds : null,
    p_limit: limit,
  };
}

function filterMscatRecordsForUi(records) {
  const selectedSources = mscatSelectedSourceGroups();
  const selectedSections = mscatSelectedSectionKeys();

  return (records || []).filter((row) =>
    mscatSourceGroupMatches(row, selectedSources) &&
    mscatSectionMatches(row, selectedSections)
  );
}


function mscatRecordsRpcArgs(taxonomyId, limit = 500) {
  const args = mscatRpcArgs(limit);

  return {
    p_source_scope: args.p_source_scope,
    p_section_key: args.p_section_key,
    p_taxonomy_id: taxonomyId || null,
    p_from: args.p_from,
    p_to: args.p_to,
    p_vessel_ids: args.p_vessel_ids,
    p_observation_types: args.p_observation_types,
    p_include_ai: args.p_include_ai,
    p_include_manual: args.p_include_manual,
    p_audit_type_ids: args.p_audit_type_ids,
    p_limit: limit,
  };
}

function mapMscatRecordToDrillRow(row) {
  const sourceGroup = String(row?.source_group || "").trim();
  const recordSource = sourceGroup || (row?.source_family === "vetting" ? "vetting_inspection" : "audit");
  const itemText = mscatItemDisplay(row);

  return {
    record_source: recordSource,
    record_source_label: mscatSourceDisplay(row),
    vessel_id: row?.vessel_id || null,
    vessel_name: row?.vessel_name || "",
    inspection_date: row?.event_date || "",
    source_report_id: row?.source_report_id || "",
    source_observation_id: row?.source_observation_item_id || "",
    report_ref: row?.report_ref || "",
    title: row?.section_label || "M-SCAT",
    question_no: row?.question_no || row?.question_base || "",
    observation_type: row?.obs_type || "",
    designation: row?.designation || "",
    soc: row?.soc || "",
    noc: row?.noc || "",
    ocimf_inspecting_company: row?.source_family === "vetting" ? "Vetting" : "Audit",
    inspector_name: row?.selection_source || "—",
    inspector_company: row?.source_group || "—",
    pgno_selected: [],
    remarks: `[${itemText}] ${row?.observation_text || ""}`,
  };
}

async function openMscatItemRecords(taxonomyId, itemLabel) {
  if (!taxonomyId) {
    alert("No taxonomy ID is available for this M-SCAT item.");
    return;
  }

  setStatus("Loading M-SCAT records…");

  try {
    let records = (state.currentMscatRecords || []).filter((row) => String(row.taxonomy_id || "") === String(taxonomyId));

    if (!records.length) {
      const { data, error } = await state.supabase.rpc(
        "csvb_stats_mscat_records",
        mscatRecordsRpcArgs(taxonomyId, 500)
      );

      if (error) throw error;
      records = data || [];
    }

    const mappedRows = records.map(mapMscatRecordToDrillRow);

    openDrilldown(
      `M-SCAT Records — ${itemLabel || taxonomyId}`,
      mappedRows,
      null,
      "Collection of observations where this M-SCAT item was recorded under the current filters."
    );

    setStatus("Ready");
  } catch (error) {
    console.error("M-SCAT item records failed:", error);
    setStatus("Error");
    alert("M-SCAT item record collection failed: " + (error?.message || String(error)));
  }
}

function bindMscatRecordButtons(root = document) {
  root.querySelectorAll(".mscatItemRecordsBtn").forEach((btn) => {
    if (btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", () => {
      const taxonomyId = btn.getAttribute("data-taxonomy-id") || "";
      const label = btn.getAttribute("data-item-label") || "";
      openMscatItemRecords(taxonomyId, label);
    });
  });
}


function renderMscatTopItemsChart(items) {
  const box = safeEl("mscatTopItemsChart");
  if (!box) return;

  const rows = aggregateMscatItems(Array.isArray(items) ? items : []).slice(0, 10);

  if (!rows.length) {
    box.innerHTML = `<div class="mono">No M-SCAT chart data for current filters.</div>`;
    return;
  }

  const max = Math.max(...rows.map((r) => Number(r.selection_count || 0)), 1);
  const sourceOrder = mscatSourceOrder();

  const legend = sourceOrder
    .filter((sourceKey) => rows.some((row) => Number(row.source_counts?.[sourceKey] || 0) > 0))
    .map((sourceKey) => `
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <i style="width:10px;height:10px;border-radius:999px;background:${esc(mscatSourceColor(sourceKey))};display:inline-block;"></i>
        ${esc(mscatSourceShortLabel(sourceKey))}
      </span>
    `).join("");

  box.innerHTML = `
    <div style="display:grid;gap:8px;">
      ${rows.map((row) => {
        const val = Number(row.selection_count || 0);
        const totalWidth = Math.max(4, Math.round((val / max) * 100));
        const sourceCounts = row.source_counts || {};

        const segments = sourceOrder
          .map((sourceKey) => ({
            sourceKey,
            count: Number(sourceCounts[sourceKey] || 0),
          }))
          .filter((x) => x.count > 0);

        const segmentHtml = segments.map((seg) => {
          const pct = val ? Math.max(2, (seg.count / val) * 100) : 0;
          return `
            <div
              title="${esc(mscatSourceGroupLabel(seg.sourceKey))}: ${esc(seg.count)}"
              style="width:${pct}%;height:100%;background:${esc(mscatSourceColor(seg.sourceKey))};"
            ></div>
          `;
        }).join("");

        return `
          <div style="display:grid;grid-template-columns:minmax(170px,300px) 1fr 70px;gap:8px;align-items:center;">
            <div title="${esc(mscatItemDisplay(row))}" style="font-weight:900;color:#1a4170;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${esc(row.item_code || row.item_no || "—")}
            </div>
            <div style="height:13px;border-radius:999px;background:#e8f0fb;overflow:hidden;">
              <div style="width:${totalWidth}%;height:100%;display:flex;border-radius:999px;overflow:hidden;">
                ${segmentHtml || `<div style="width:100%;height:100%;background:#235aa6;"></div>`}
              </div>
            </div>
            <div class="mono" style="text-align:right;">${esc(val)}</div>
          </div>
        `;
      }).join("")}
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-weight:900;color:#1a4170;font-size:.78rem;">
        ${legend}
      </div>
      <div class="statL">Bars show aggregated M-SCAT selection count by taxonomy item. Bar segments show the source contribution.</div>
    </div>
  `;
}

function aggregateMscatTrend(trendRows) {
  const map = new Map();

  for (const row of trendRows || []) {
    const bucket = String(row.bucket_key || "—");
    const source = String(row.source_family || "—");
    const key = `${bucket}|${source}`;

    if (!map.has(key)) {
      map.set(key, {
        bucket_key: bucket,
        source_family: source,
        selection_count: 0,
        observation_count: 0,
        report_count: 0,
        vessel_count: 0,
        ai_count: 0,
        manual_count: 0,
        sections: new Set(),
      });
    }

    const item = map.get(key);
    item.selection_count += Number(row.selection_count || 0);
    item.observation_count += Number(row.observation_count || 0);
    item.report_count += Number(row.report_count || 0);
    item.vessel_count += Number(row.vessel_count || 0);
    item.ai_count += Number(row.ai_count || 0);
    item.manual_count += Number(row.manual_count || 0);
    if (row.section_label || row.section_key) item.sections.add(String(row.section_label || row.section_key));
  }

  return [...map.values()].sort((a, b) =>
    String(a.bucket_key).localeCompare(String(b.bucket_key)) ||
    String(a.source_family).localeCompare(String(b.source_family))
  );
}

function renderMscatTrendTable(trendRows) {
  const tbody = safeTbody("mscatTrendTbody");
  if (!tbody) return;

  const rows = aggregateMscatTrend(trendRows);
  tbody.innerHTML = "";

  if (!rows.length) {
    ensureTbodyMessage(tbody, 9, "No M-SCAT trend data for current filters.");
    return;
  }

  for (const row of rows.slice(-60)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(row.bucket_key)}</td>
      <td>${esc(row.source_family === "vetting" ? "Vetting" : row.source_family === "audit" ? "Audit" : row.source_family)}</td>
      <td>${esc([...row.sections].join(", ") || "Selected")}</td>
      <td>${esc(row.selection_count)}</td>
      <td>${esc(row.observation_count)}</td>
      <td>${esc(row.report_count)}</td>
      <td>${esc(row.vessel_count)}</td>
      <td>${esc(row.ai_count)}</td>
      <td>${esc(row.manual_count)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderMscatTrendChart(trendRows) {
  const box = safeEl("mscatTrendChart");
  if (!box) return;

  const rows = aggregateMscatTrend(trendRows);
  if (!rows.length) {
    box.innerHTML = `<div class="mono">No M-SCAT trend data for current filters.</div>`;
    return;
  }

  const buckets = [...new Set(rows.map((r) => r.bucket_key))].sort();
  const sources = [...new Set(rows.map((r) => r.source_family))].sort();

  const series = sources.map((src) => ({
    key: src,
    label: src === "vetting" ? "Vetting" : src === "audit" ? "Audit" : src,
    color: src === "vetting" ? "#2563eb" : "#dc2626",
    values: buckets.map((b) => {
      const row = rows.find((x) => x.bucket_key === b && x.source_family === src);
      return Number(row?.selection_count || 0);
    }),
  }));

  const width = 620;
  const height = 220;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 42;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));

  const xFor = (idx) => buckets.length <= 1
    ? padL + (width - padL - padR) / 2
    : padL + (idx * (width - padL - padR)) / (buckets.length - 1);

  const yFor = (v) => padT + (height - padT - padB) * (1 - Number(v || 0) / maxY);

  const grid = [0, 0.5, 1].map((ratio) => {
    const y = padT + (height - padT - padB) * (1 - ratio);
    const val = Math.round(maxY * ratio);
    return `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#e5eefc"></line>
      <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#35507b" font-size="10" font-weight="800">${esc(val)}</text>
    `;
  }).join("");

  const labelIndexes = new Set();
  if (buckets.length <= 6) buckets.forEach((_, i) => labelIndexes.add(i));
  else {
    labelIndexes.add(0);
    labelIndexes.add(Math.floor((buckets.length - 1) / 2));
    labelIndexes.add(buckets.length - 1);
  }

  const xLabels = buckets.map((b, i) => labelIndexes.has(i)
    ? `<text x="${xFor(i).toFixed(1)}" y="${height - 16}" text-anchor="${i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"}" fill="#35507b" font-size="10" font-weight="800">${esc(b)}</text>`
    : ""
  ).join("");

  const polylines = series.map((s) => {
    const points = s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
    return `<polyline points="${points}" fill="none" stroke="${esc(s.color)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
  }).join("");

  const legend = series.map((s) => {
    const total = s.values.reduce((a, b) => a + Number(b || 0), 0);
    return `<span style="display:inline-flex;gap:6px;align-items:center;"><i style="width:10px;height:10px;border-radius:999px;background:${esc(s.color)};display:inline-block;"></i>${esc(s.label)}: ${esc(total)}</span>`;
  }).join("");

  box.innerHTML = `
    <div style="border:1px solid #dbe8f8;border-radius:14px;background:#fff;padding:8px;overflow:auto;">
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;max-height:230px;display:block;">
        ${grid}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${height - padB}" stroke="#b7cbe6"></line>
        <line x1="${padL}" y1="${height - padB}" x2="${width - padR}" y2="${height - padB}" stroke="#b7cbe6"></line>
        ${polylines}
        ${xLabels}
      </svg>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-weight:900;color:#1a4170;font-size:.78rem;">${legend}</div>
    </div>
  `;
}

async function renderMscatAnalyticsPanel() {
  const panel = safeEl("mscatAnalyticsPanel");
  if (!panel || !state.supabase) return;

  const itemsBox = safeTbody("mscatItemsTbody");

  try {
    if (!mscatIncludeAi() && !mscatIncludeManual()) {
      renderMscatKpis([]);
      renderMscatItemsTable([]);
      renderMscatTopItemsChart([]);
      renderMscatTrendChart([]);
      if (itemsBox) ensureTbodyMessage(itemsBox, 12, "Select AI assigned and/or Manual to display M-SCAT analytics.");
      return;
    }

    updateMscatFilterSummaries();

    const { data: rawRecords, error: recordsError } = await state.supabase.rpc(
      "csvb_stats_mscat_records",
      mscatAllRecordsRpcArgs(20000)
    );

    if (recordsError) throw recordsError;

    const records = filterMscatRecordsForUi(rawRecords || []);
    state.currentMscatRecords = records;

    const items = recordsToMscatItemRows(records);
    const summary = mscatSummaryFromRecords(records);
    const trend = mscatTrendRowsFromRecords(records);

    renderMscatKpisFromSummary(summary, items);
    renderMscatSourceComparison(records);
    renderMscatObservationComparison(records);
    renderMscatPairwiseComparison(records);
    renderMscatItemsTable(items);
    renderMscatTopItemsChart(items);
    renderMscatTrendChart(trend);
  } catch (error) {
    console.error("M-SCAT analytics failed:", error);
    renderMscatKpis([]);
    renderMscatTopItemsChart([]);
    renderMscatTrendChart([]);

    if (itemsBox) ensureTbodyMessage(itemsBox, 12, "M-SCAT analytics failed: " + (error?.message || String(error)));
  }
}


function renderSummaryFromRows(rows, reportRows) {
  const counts = typeCountsFromRows(rows);
  const questionSet = new Set((rows || []).map((r) => String(r.question_no || "").trim()).filter(Boolean));

  setText("sumReports", String(reportRows.length));
  setText("sumObs", String(counts.total));

  const missingNeg = (rows || []).filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    return normalizeType(r.observation_type) === "negative" && arr.length === 0;
  }).length;

  const missingLargely = (rows || []).filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    return normalizeType(r.observation_type) === "largely" && arr.length === 0;
  }).length;

  setText("sumMissing", String(missingNeg + missingLargely));
  setText("sumDistinct", String(questionSet.size));
  setText("sumMissingSplit", `Negative: ${missingNeg} | Largely: ${missingLargely}`);

  bindSummaryDrills(rows, reportRows);
}

function bindSummaryDrills(rows, reportRows) {
  const reportKeys = new Set(reportRows.map((r) => r.report_key));
  const reportObsRows = rows.filter((r) => reportKeys.has(reportKey(r)));

  const missingRows = rows.filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    const type = normalizeType(r.observation_type);
    return (type === "negative" || type === "largely") && arr.length === 0;
  });

  const distinctRows = [];
  const seen = new Set();
  for (const r of rows) {
    const q = String(r.question_no || "").trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    distinctRows.push(r);
  }

  const bind = (id, title, matchedRows, matchedReports, sub) => {
    const btn = safeEl(id);
    if (!btn) return;
    btn.onclick = () => openDrilldown(title, matchedRows, matchedReports, sub);
  };

  bind("viewSummaryReportsBtn", "Reports / Inspections — current scope", reportObsRows, reportRows, "Observations linked with reports/audits inside current filter scope.");
  bind("viewSummaryObsBtn", "Total Observations — current scope", rows, null, "All matching observations.");
  bind("viewSummaryMissingBtn", "Missing PGNO ticks — current scope", missingRows, null, "Negative and Largely as expected observations without PGNO tick.");
  bind("viewSummaryDistinctBtn", "Unique Questions Observed — representative records", distinctRows, null, "One representative record per unique question number.");
}

async function renderAllStats(rows, rowsIgnoreTypeFilter, reportRows) {
  drillRegistry.clear();

  state.currentRows = rows;
  state.currentRowsIgnoreType = rowsIgnoreTypeFilter;
  state.currentReportRows = reportRows;

  exposeStatsSnapshot();

  renderSummaryFromRows(rows, reportRows);

  renderTypeVisuals(rows, reportRows);
  // Step 7E: raw negative source trend removed from main layout; sector comparison will be rebuilt through dedicated analytics.
  renderByVessel(rows, reportRows);
  renderFleetAverage(rows, reportRows);
  renderByType(rowsIgnoreTypeFilter, reportRows);
  renderTopRecurringQuestions(rows);
  renderByCategory(rows, reportRows);
  renderTopSoc(rows, reportRows);
  renderTopNoc(rows, reportRows);
  renderMonthlyTrend(rows, reportRows);

  renderAverageGroupTable(rows, reportRows, (r) => r.ocimf_inspecting_company, (r) => r.ocimf_inspecting_company, "byOcimfTbody", "company");
  renderAverageGroupTable(rows, reportRows, (r) => r.inspector_name, (r) => r.inspector_name, "byInspectorTbody", "inspector/auditor");
  renderAverageGroupTable(rows, reportRows, (r) => r.inspector_company, (r) => r.inspector_company, "byInspectorCompanyTbody", "inspector/auditor company");

  renderPgnoAnalytics(rows, reportRows);
  await renderMscatAnalyticsPanel();
}

function activateCurrentDataset() {
  if (isCombinedMode()) {
    state.allRows = state.combinedRows;
    state.allReportRows = state.combinedReportRows;
    setText("modeNote", "Combined Analytics mode includes Vetting Inspections + Vessel Audit observations. Use Record Source(s) and Audit type(s) to include/exclude specific audit sources/types.");
  } else if (isAuditMode()) {
    state.allRows = (state.combinedRows || []).filter((r) => isAuditRecordSource(r.record_source));
    state.allReportRows = (state.combinedReportRows || []).filter((r) => isAuditRecordSource(r.record_source));
    setText("modeNote", "Vessel Audits mode uses only internal/external vessel audit observations. Use Record Source(s) and Audit type(s) to filter audit records.");
  } else {
    state.allRows = state.postRows;
    state.allReportRows = state.postReportRows;
    setText("modeNote", "Vetting Inspections mode uses only SIRE 2.0 vetting/post-inspection observations. Record Source and Audit type filters are ignored.");
  }
}

async function applyFilters() {
  setStatus("Loading…");

  activateCurrentDataset();

  const reportRows = filterReportsBase(state.allReportRows);
  const rows = filterRowsBase(state.allRows, false);
  const rowsIgnoreTypeFilter = filterRowsBase(state.allRows, true);

  await renderAllStats(rows, rowsIgnoreTypeFilter, reportRows);
  updateFilterSummaries();

  setStatus("Ready");
}

async function exportFilteredCsv() {
  setStatus("Exporting…");

  activateCurrentDataset();

  const rows = filterRowsBase(state.allRows, false);

  const header = [
    "record_source",
    "vessel_name",
    "inspection_date",
    "report_ref",
    "title_or_audit_type",
    "question_no",
    "observation_type",
    "designation",
    "soc",
    "noc",
    "inspecting_or_contractor_company",
    "inspector_or_auditor",
    "inspector_or_auditor_company",
    "pgno_selected",
    "pgno_count",
    "remarks",
    "updated_at",
  ];

  const csv = [header.join(",")];

  for (const r of rows) {
    const label = state.labelMap.get(r.observation_type) || r.observation_type;
    const pgTxt = pgnoExportText(r.pgno_selected);
    const pgCount = Number(r.pgno_count || 0);

    const line = [
      sourceLabel(r.record_source || "vetting_inspection"),
      r.vessel_name || "",
      r.inspection_date || "",
      r.report_ref || "",
      r.title || "",
      r.question_no || "",
      label || "",
      r.designation || "",
      r.soc || "",
      r.noc || "",
      r.ocimf_inspecting_company || "",
      r.inspector_name || "",
      r.inspector_company || "",
      pgTxt,
      String(pgCount),
      r.remarks || "",
      r.updated_at || "",
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");

    csv.push(line);
  }

  const blob = new Blob([csv.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");

  const mode = isCombinedMode() ? "combined_analytics" : "post_inspection";
  const safeFrom = (el("dateFrom")?.value || "from").replace(/[^0-9-]+/g, "_");
  const safeTo = (el("dateTo")?.value || "to").replace(/[^0-9-]+/g, "_");

  a.download = `${mode}_export_filtered_${safeFrom}_${safeTo}.csv`;
  a.href = URL.createObjectURL(blob);

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  setStatus("Ready");
}

function bindClick(id, fn) {
  const node = safeEl(id);
  if (!node) return;
  node.addEventListener("click", fn);
}

function bindChange(id, fn) {
  const node = safeEl(id);
  if (!node) return;
  node.addEventListener("change", fn);
}

function bindAllNone(allId, noneId, containerId, refresh = null) {
  bindClick(allId, async () => {
    setAllCheckboxes(containerId, true);
    updateFilterSummaries();
    if (refresh) await refresh();
  });

  bindClick(noneId, async () => {
    setAllCheckboxes(containerId, false);
    updateFilterSummaries();
    if (refresh) await refresh();
  });
}

function bindCheckboxRefresh(containerId, refresh) {
  const box = safeEl(containerId);
  if (!box) return;
  box.addEventListener("change", async (e) => {
    if (e.target && e.target.matches("input[type='checkbox']")) {
      updateFilterSummaries();
      await refresh();
    }
  });
}

function updateDropSummary(buttonId, label, selectedCount, totalCount) {
  const text = selectedCount === totalCount
    ? `${label}: all`
    : selectedCount === 0
      ? `${label}: none`
      : `${label}: ${selectedCount} selected`;

  setText(buttonId, text);
}

function updateFilterSummaries() {
  updateDropSummary("vesselDropBtn", "Vessels", getSelectedVesselIds().length, state.vessels.length);
  updateDropSummary("typeDropBtn", "Types", getSelectedTypes().length, OBS_TYPES.length);
  updateDropSummary("recordSourceDropBtn", "Sources", getSelectedRecordSources().length, RECORD_SOURCES.length);
  updateDropSummary("recYearDropBtn", "Recurring years", getSelectedRecurringYears().length, safeEl("recurringYearCheckList")?.querySelectorAll("input").length || 0);
  updateDropSummary("recMonthDropBtn", "Recurring months", getSelectedRecurringMonths().length, MONTHS.length);
}

function bindDropdown(dropId, btnId) {
  const drop = safeEl(dropId);
  const btn = safeEl(btnId);
  if (!drop || !btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    document.querySelectorAll(".filterDrop.open").forEach((x) => {
      if (x !== drop) x.classList.remove("open");
    });

    drop.classList.toggle("open");
  });

  drop.addEventListener("click", (e) => e.stopPropagation());
}

function closeAllDropdowns() {
  document.querySelectorAll(".filterDrop.open").forEach((x) => x.classList.remove("open"));
}

async function reloadAllData() {
  setStatus("Loading source data…");

  state.postReportRows = enrichReports(await loadPostReportRows());
  rebuildReportMetaMap();
  state.postRows = enrichRowsWithReportMeta(await loadPostObservationRows());

  try {
    state.combinedRows = await loadCombinedObservationRows();
    state.combinedReportRows = buildReportRowsFromObservationRows(state.combinedRows);
  } catch (e) {
    console.warn("Combined analytics load failed. Combined mode will be empty.", e);
    state.combinedRows = [];
    state.combinedReportRows = [];
  }

  activateCurrentDataset();

  setStatus("Ready");
}

function refreshYearControls() {
  const rows = [...state.postRows, ...state.combinedRows];
  const reports = [...state.postReportRows, ...state.combinedReportRows];

  const years = collectYearsFromRows(rows, reports);
  const currentYear = String(new Date().getFullYear());

  renderCheckboxList("recurringYearCheckList", "recYearChk", years.map((y) => ({ value: y, label: y })), true);
  renderYearSelect("trendYearFilter", years, currentYear);
}

async function init() {
  setText("buildPill", `build: ${STATS_BUILD}`);

  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean));
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  bindClick("logoutBtn", window.AUTH.logoutAndGoLogin);

  state.supabase = window.__supabaseClient || (window.AUTH?.ensureSupabase ? window.AUTH.ensureSupabase() : null);
  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded.");
  }

  state.labelMap = new Map(OBS_TYPES.map((x) => [x.value, x.label]));

  state.vessels = await loadVessels();

  renderCheckboxList("vesselCheckList", "vesselChk", state.vessels.map((v) => ({ value: v.id, label: v.name })), true);
  renderCheckboxList("typeCheckList", "typeChk", OBS_TYPES, true);
  renderCheckboxList("recordSourceCheckList", "recordSourceChk", RECORD_SOURCES, true);
  await renderAuditTypeFilter();
  renderCheckboxList("recurringMonthCheckList", "recMonthChk", MONTHS, true);
  renderCheckboxList("mscatSourceCheckList", "mscatSourceChk", MSCAT_SOURCE_OPTIONS, true);
  renderCheckboxList("mscatSectionCheckList", "mscatSectionChk", MSCAT_SECTION_OPTIONS, true);

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 365);

  const fromInput = safeEl("dateFrom");
  const toInput = safeEl("dateTo");
  if (fromInput) fromInput.value = ymd(from);
  if (toInput) toInput.value = ymd(to);

  const lib = await loadLockedLibraryJson(LOCKED_LIBRARY_JSON);
  for (const q of lib) {
    const qno = getQno(q);
    if (qno) state.libByNo.set(qno, q);
  }

  await reloadAllData();
  refreshYearControls();

  const refresh = async () => {
    try {
      await applyFilters();
    } catch (e) {
      console.error(e);
      alert("Apply filters failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  };

  bindDropdown("recordSourceDrop", "recordSourceDropBtn");
  bindDropdown("auditTypeDrop", "auditTypeDropBtn");
  bindDropdown("vesselDrop", "vesselDropBtn");
  bindDropdown("typeDrop", "typeDropBtn");
  bindDropdown("recYearDrop", "recYearDropBtn");
  bindDropdown("recMonthDrop", "recMonthDropBtn");
  bindDropdown("mscatSourceDrop", "mscatSourceDropBtn");
  bindDropdown("mscatSectionDrop", "mscatSectionDropBtn");

  document.addEventListener("click", closeAllDropdowns);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });

  bindChange("statsMode", refresh);

  bindClick("applyBtn", refresh);

  bindClick("exportCsvBtn", async () => {
    try {
      await exportFilteredCsv();
    } catch (e) {
      console.error(e);
      alert("Export failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  bindAllNone("recordSourceAllBtn", "recordSourceNoneBtn", "recordSourceCheckList", refresh);
  bindAllNone("auditTypeAllBtn", "auditTypeNoneBtn", "auditTypeCheckList", refresh);
  bindAllNone("vesselAllBtn", "vesselNoneBtn", "vesselCheckList", refresh);
  bindAllNone("typeAllBtn", "typeNoneBtn", "typeCheckList", refresh);
  bindAllNone("recYearAllBtn", "recYearNoneBtn", "recurringYearCheckList", refresh);
  bindAllNone("recMonthAllBtn", "recMonthNoneBtn", "recurringMonthCheckList", refresh);
  bindAllNone("mscatSourceAllBtn", "mscatSourceNoneBtn", "mscatSourceCheckList", refresh);
  bindAllNone("mscatSectionAllBtn", "mscatSectionNoneBtn", "mscatSectionCheckList", refresh);

  bindCheckboxRefresh("recordSourceCheckList", refresh);
  bindCheckboxRefresh("auditTypeCheckList", refresh);
  bindCheckboxRefresh("vesselCheckList", refresh);
  bindCheckboxRefresh("typeCheckList", refresh);
  bindCheckboxRefresh("recurringYearCheckList", refresh);
  bindCheckboxRefresh("recurringMonthCheckList", refresh);
  bindCheckboxRefresh("mscatSourceCheckList", refresh);
  bindCheckboxRefresh("mscatSectionCheckList", refresh);

  bindChange("recurringMinCount", refresh);
  bindChange("trendYearFilter", refresh);
  bindChange("dateFrom", refresh);
  bindChange("dateTo", refresh);


  ["mscatGrouping", "mscatItemsLimit", "mscatPairSourceA", "mscatPairSourceB", "mscatPairMetric", "mscatTypeNegative", "mscatTypeLargely", "mscatTypePositive", "mscatIncludeAi", "mscatIncludeManual"].forEach((id) => {
    bindChange(id, refresh);
  });

  bindClick("mscatApplyBtn", refresh);


  bindClick("drillCloseBtn", () => {
    const dlg = safeEl("drillDialog");
    if (dlg && typeof dlg.close === "function") dlg.close();
  });

  bindClick("drillExportBtn", exportDrillCsv);

  updateFilterSummaries();
  updateMscatFilterSummaries();
  await applyFilters();
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Stats page failed to load: " + (e?.message || String(e)));
    setStatus("Error");
  }
})();