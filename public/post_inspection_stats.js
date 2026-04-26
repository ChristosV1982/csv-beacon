// public/post_inspection_stats.js
// Fleet/vessel stats via RPC functions + client-side multi-filtering.
// Current observation model: post_inspection_observation_items.obs_type = negative | positive | largely

import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const OBS_TYPES = [
  { value: "negative", label: "Negative" },
  { value: "largely", label: "Largely as expected" },
  { value: "positive", label: "Positive" },
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
  libByNo: new Map(),
  labelMap: new Map(),
  allRows: [],
  allReportRows: [],
  reportMetaByKey: new Map(),
};

function setStatus(text) {
  setText("statusPill", text || "Ready");
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
    String(row.vessel_name || "").trim(),
    String(row.inspection_date || "").trim(),
    String(row.report_ref || "").trim(),
    String(row.title || "").trim(),
  ].join("|");
}

function reportKeyFromReport(row) {
  return [
    vesselNameById(row.vessel_id),
    String(row.inspection_date || "").trim(),
    String(row.report_ref || "").trim(),
    String(row.title || "").trim(),
  ].join("|");
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
    p_from: el("dateFrom")?.value || null,
    p_to: el("dateTo")?.value || null,
    selected_types: getSelectedTypes(),
  };
}

function filterReportsBase(reportRows) {
  const { selected_vessel_ids, p_from, p_to } = getFilters();
  const vesselSet = new Set(selected_vessel_ids);

  return (reportRows || []).filter((r) => {
    if (vesselSet.size > 0 && !vesselSet.has(String(r.vessel_id))) return false;
    if (!inDateRange(r.inspection_date, p_from, p_to)) return false;
    return true;
  });
}

function filterRowsBase(rows, ignoreTypeFilter = false) {
  const { selected_vessel_names, p_from, p_to, selected_types } = getFilters();
  const typeSet = new Set(selected_types);

  return (rows || []).filter((r) => {
    const vesselName = String(r.vessel_name || "").trim();
    if (selected_vessel_names.size > 0 && !selected_vessel_names.has(vesselName)) return false;
    if (!inDateRange(r.inspection_date, p_from, p_to)) return false;
    if (!ignoreTypeFilter && typeSet.size > 0 && !typeSet.has(normalizeType(r.observation_type))) return false;
    return true;
  });
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

async function loadAllObservationRows() {
  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
      p_vessel_id: null,
      p_from: null,
      p_to: null,
      p_observation_type: null,
    });

  if (error) throw error;
  return data || [];
}

async function loadAllReportRows() {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, report_ref, title, ocimf_inspecting_company, inspector_name, inspector_company");

  if (error) throw error;
  return data || [];
}

function rebuildReportMetaMap() {
  state.reportMetaByKey = new Map();

  for (const r of state.allReportRows || []) {
    const k = reportKeyFromReport(r);
    if (!k) continue;
    state.reportMetaByKey.set(k, {
      vessel_id: r.vessel_id,
      vessel_name: vesselNameById(r.vessel_id),
      ocimf_inspecting_company: String(r.ocimf_inspecting_company || "").trim() || "—",
      inspector_name: String(r.inspector_name || "").trim() || "—",
      inspector_company: String(r.inspector_company || "").trim() || "—",
    });
  }
}

function enrichRowsWithReportMeta(rows) {
  return (rows || []).map((r) => {
    const meta = state.reportMetaByKey.get(reportKey(r)) || {};
    return {
      ...r,
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
    vessel_name: vesselNameById(r.vessel_id),
    ocimf_inspecting_company: String(r.ocimf_inspecting_company || "").trim() || "—",
    inspector_name: String(r.inspector_name || "").trim() || "—",
    inspector_company: String(r.inspector_company || "").trim() || "—",
    report_key: reportKeyFromReport(r),
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

function renderTypeSplitTable(tbodyId, rows, keyLabel, limit = 100) {
  const tbody = safeTbody(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  const list = rows.slice(0, limit);

  for (const r of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.avg_negative)}</td>
      <td>${esc(r.avg_largely)}</td>
      <td>${esc(r.avg_positive)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!list.length) ensureTbodyMessage(tbody, 7, `No ${keyLabel} data for current filters.`);
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
      });
    }

    map.get(key).observations += 1;
  }

  return [...map.values()]
    .map((x) => ({
      ...x,
      avg_per_inspection: avg(x.observations, x.inspections),
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function renderMonthlyTrend(rows, reportRows) {
  const tbody = safeTbody("monthlyTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const trendYear = String(el("trendYearFilter")?.value || "").trim();
  const grouped = buildMonthlyRows(rows, reportRows, trendYear);

  for (const r of grouped) {
    const insp = r.reports.size;
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
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 9, "No monthly data for current filters.");
}

function renderBarChart(containerId, rows, options = {}) {
  const box = safeEl(containerId);
  if (!box) return;

  const labelFn = options.labelFn || ((r) => r.key);
  const obsFn = options.obsFn || ((r) => r.observation_count ?? r.observations ?? 0);
  const inspFn = options.inspFn || ((r) => r.report_count ?? r.inspections ?? 0);
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

    return `
      <div class="barRow" title="${esc(label)}: ${esc(obs)} obs / ${esc(inspections)} insp. / avg ${esc(average)}">
        <div class="barLabel">${esc(label)}</div>
        <div class="barTrack">
          <div class="barFill" style="width:${pct}%"></div>
        </div>
        <div class="barValue">${esc(obs)} / ${esc(inspections)} / ${esc(average)}</div>
      </div>
    `;
  }).join("");
}

function rowsOfType(rows, type) {
  return (rows || []).filter((r) => normalizeType(r.observation_type) === type);
}

function renderTypeVisuals(rows, reportRows) {
  const neg = rowsOfType(rows, "negative");
  const largely = rowsOfType(rows, "largely");
  const positive = rowsOfType(rows, "positive");

  renderBarChart("chartNegCategory", groupObjectiveRows(neg, (r) => r.designation), { limit: 10 });
  renderBarChart("chartLargelyCategory", groupObjectiveRows(largely, (r) => r.designation), { limit: 10 });

  renderBarChart("chartNegMonthly", buildPeriodRows(neg, reportRows, monthKey), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 18 });
  renderBarChart("chartLargelyMonthly", buildPeriodRows(largely, reportRows, monthKey), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 18 });
  renderBarChart("chartPositiveMonthly", buildPeriodRows(positive, reportRows, monthKey), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 18 });

  renderBarChart("chartNegQuarterly", buildPeriodRows(neg, reportRows, quarterOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 16 });
  renderBarChart("chartLargelyQuarterly", buildPeriodRows(largely, reportRows, quarterOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 16 });
  renderBarChart("chartPositiveQuarterly", buildPeriodRows(positive, reportRows, quarterOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 16 });

  renderBarChart("chartNegAnnual", buildPeriodRows(neg, reportRows, yearOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 10 });
  renderBarChart("chartLargelyAnnual", buildPeriodRows(largely, reportRows, yearOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 10 });
  renderBarChart("chartPositiveAnnual", buildPeriodRows(positive, reportRows, yearOf), { labelFn: (r) => r.key, obsFn: (r) => r.observations, inspFn: (r) => r.inspections, limit: 10 });
}

function renderByVessel(rows, reportRows) {
  const tbody = safeTbody("byVesselTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const reportCountMap = reportCountsByKey(reportRows, (r) => r.vessel_name);
  const grouped = groupTypeSplitRows(rows, (r) => r.vessel_name, (key) => reportCountMap.get(key) || 0);

  const allVesselsWithReports = [...reportCountMap.keys()];
  for (const name of allVesselsWithReports) {
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
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 8, "No vessel data for current filters.");
}

function renderFleetAverage(rows, reportRows) {
  const tbody = safeTbody("avgFleetTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const counts = typeCountsFromRows(rows);
  const inspections = reportRows.length;

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
  `;
  tbody.appendChild(tr);
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
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 8, `No ${emptyLabel} data for current filters.`);
}

function renderByType(rowsIgnoreTypeFilter, reportRows) {
  const tbody = safeTbody("byTypeTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const t of OBS_TYPES) {
    const rows = rowsOfType(rowsIgnoreTypeFilter, t.value);
    const reports = new Set(rows.map((r) => reportKey(r)));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(t.label)}</td>
      <td>${esc(reports.size)}</td>
      <td>${esc(rows.length)}</td>
      <td>${esc(avg(rows.length, reportRows.length))}</td>
    `;
    tbody.appendChild(tr);
  }
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

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(qno)}</td>
      <td>${esc(ch)}</td>
      <td>${esc(sec)}</td>
      <td>${esc(sh)}</td>
      <td>${esc(label)}</td>
      <td>${esc(r.observation_count)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 6, `No recurring questions found at threshold ${minCount}.`);
}

function renderByCategory(rows, reportRows) {
  renderTypeSplitTable("byCategoryTbody", groupTypeSplitRows(rows, (r) => r.designation, () => reportRows.length), "category");
}

function renderTopSoc(rows, reportRows) {
  renderTypeSplitTable("topSocTbody", groupTypeSplitRows(rows, (r) => r.soc, () => reportRows.length), "SOC", 100);
}

function renderTopNoc(rows, reportRows) {
  renderTypeSplitTable("topNocTbody", groupTypeSplitRows(rows, (r) => r.noc, () => reportRows.length), "NOC", 100);
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

  renderBarChart("chartPgno", byPgno, {
    labelFn: (r) => r.key,
    obsFn: (r) => r.observation_count,
    inspFn: (r) => r.report_count,
    limit: 10,
    emptyText: "No assigned PGNOs for current filters.",
  });

  renderBarChart("chartPgnoQuestion", byPgnoQuestion, {
    labelFn: (r) => r.key,
    obsFn: (r) => r.observation_count,
    inspFn: (r) => r.report_count,
    limit: 10,
    emptyText: "No PGNO/question data for current filters.",
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
    limit: 18,
    emptyText: "No missing PGNOs for current filters.",
  });

  const tbody = safeTbody("pgnoTableTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const r of byPgno) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.observation_count)}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.avg_per_inspection)}</td>
      <td>${esc(r.last_seen || "")}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!byPgno.length) ensureTbodyMessage(tbody, 5, "No assigned PGNO data for current filters.");
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
}

async function renderAllStats(rows, rowsIgnoreTypeFilter, reportRows) {
  renderSummaryFromRows(rows, reportRows);

  renderTypeVisuals(rows, reportRows);
  renderByVessel(rows, reportRows);
  renderFleetAverage(rows, reportRows);
  renderByType(rowsIgnoreTypeFilter, reportRows);
  renderTopRecurringQuestions(rows);
  renderByCategory(rows, reportRows);
  renderTopSoc(rows, reportRows);
  renderTopNoc(rows, reportRows);
  renderMonthlyTrend(rows, reportRows);

  renderAverageGroupTable(
    rows,
    reportRows,
    (r) => r.ocimf_inspecting_company,
    (r) => r.ocimf_inspecting_company,
    "byOcimfTbody",
    "OCIMF company"
  );

  renderAverageGroupTable(
    rows,
    reportRows,
    (r) => r.inspector_name,
    (r) => r.inspector_name,
    "byInspectorTbody",
    "inspector"
  );

  renderAverageGroupTable(
    rows,
    reportRows,
    (r) => r.inspector_company,
    (r) => r.inspector_company,
    "byInspectorCompanyTbody",
    "inspector company"
  );

  renderPgnoAnalytics(rows, reportRows);
}

async function applyFilters() {
  setStatus("Loading…");

  const reportRows = filterReportsBase(state.allReportRows);
  const rows = filterRowsBase(state.allRows, false);
  const rowsIgnoreTypeFilter = filterRowsBase(state.allRows, true);

  await renderAllStats(rows, rowsIgnoreTypeFilter, reportRows);

  setStatus("Ready");
}

async function exportFilteredCsv() {
  setStatus("Exporting…");

  const rows = filterRowsBase(state.allRows, false);

  const header = [
    "vessel_name",
    "inspection_date",
    "report_ref",
    "title",
    "question_no",
    "observation_type",
    "designation",
    "soc",
    "noc",
    "ocimf_inspecting_company",
    "inspector_name",
    "inspector_company",
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

  const safeFrom = (el("dateFrom")?.value || "from").replace(/[^0-9-]+/g, "_");
  const safeTo = (el("dateTo")?.value || "to").replace(/[^0-9-]+/g, "_");

  a.download = `post_inspection_export_filtered_${safeFrom}_${safeTo}.csv`;
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
    if (refresh) await refresh();
  });

  bindClick(noneId, async () => {
    setAllCheckboxes(containerId, false);
    if (refresh) await refresh();
  });
}

function bindCheckboxRefresh(containerId, refresh) {
  const box = safeEl(containerId);
  if (!box) return;
  box.addEventListener("change", async (e) => {
    if (e.target && e.target.matches("input[type='checkbox']")) {
      await refresh();
    }
  });
}

async function init() {
  const R = window.AUTH?.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN]);
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  bindClick("logoutBtn", window.AUTH.logoutAndGoLogin);

  state.supabase = window.__supabaseClient;
  if (!state.supabase) {
    throw new Error("Supabase client missing. Ensure supabase-js CDN and auth.js are loaded.");
  }

  state.labelMap = new Map(OBS_TYPES.map((x) => [x.value, x.label]));

  state.vessels = await loadVessels();

  renderCheckboxList(
    "vesselCheckList",
    "vesselChk",
    state.vessels.map((v) => ({ value: v.id, label: v.name })),
    true
  );

  renderCheckboxList("typeCheckList", "typeChk", OBS_TYPES, true);
  renderCheckboxList("recurringMonthCheckList", "recMonthChk", MONTHS, true);

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

  state.allReportRows = enrichReports(await loadAllReportRows());
  rebuildReportMetaMap();
  state.allRows = enrichRowsWithReportMeta(await loadAllObservationRows());

  const years = collectYearsFromRows(state.allRows, state.allReportRows);
  const currentYear = String(new Date().getFullYear());

  renderCheckboxList(
    "recurringYearCheckList",
    "recYearChk",
    years.map((y) => ({ value: y, label: y })),
    true
  );

  renderYearSelect("trendYearFilter", years, currentYear);

  const refresh = async () => {
    try {
      await applyFilters();
    } catch (e) {
      console.error(e);
      alert("Apply filters failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  };

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

  bindAllNone("vesselAllBtn", "vesselNoneBtn", "vesselCheckList", refresh);
  bindAllNone("typeAllBtn", "typeNoneBtn", "typeCheckList", refresh);
  bindAllNone("recYearAllBtn", "recYearNoneBtn", "recurringYearCheckList", refresh);
  bindAllNone("recMonthAllBtn", "recMonthNoneBtn", "recurringMonthCheckList", refresh);

  bindCheckboxRefresh("vesselCheckList", refresh);
  bindCheckboxRefresh("typeCheckList", refresh);
  bindCheckboxRefresh("recurringYearCheckList", refresh);
  bindCheckboxRefresh("recurringMonthCheckList", refresh);

  bindChange("recurringMinCount", refresh);
  bindChange("trendYearFilter", refresh);
  bindChange("dateFrom", refresh);
  bindChange("dateTo", refresh);

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