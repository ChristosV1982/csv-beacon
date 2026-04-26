// public/post_inspection_stats.js
// Fleet/vessel stats via RPC functions.
// Current observation model: post_inspection_observation_items.obs_type = negative | positive | largely

import { loadLockedLibraryJson } from "./question_library_loader.js";

const LOCKED_LIBRARY_JSON = "./sire_questions_all_columns_named.json";

const OBS_TYPES = [
  { value: "", label: "All types" },
  { value: "negative", label: "Negative" },
  { value: "positive", label: "Positive" },
  { value: "largely", label: "Largely as expected" },
];

const MONTHS = [
  { value: "", label: "All months" },
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

function selectedYear(id) {
  return String(el(id)?.value || "").trim();
}

function selectedMonth(id) {
  return String(el(id)?.value || "").trim();
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

function renderVesselFilter() {
  const sel = safeEl("vesselFilter");
  if (!sel) return;
  sel.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All vessels";
  sel.appendChild(optAll);

  for (const v of state.vessels) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function renderTypeFilter() {
  const sel = safeEl("typeFilter");
  if (!sel) return;
  sel.innerHTML = "";

  for (const t of OBS_TYPES) {
    const o = document.createElement("option");
    o.value = t.value;
    o.textContent = t.label;
    sel.appendChild(o);
  }
}

function getFilters() {
  return {
    vessel_id: el("vesselFilter")?.value || null,
    p_from: el("dateFrom")?.value || null,
    p_to: el("dateTo")?.value || null,
    p_observation_type: el("typeFilter")?.value || null,
  };
}

async function loadFilteredObservationRows() {
  const { vessel_id, p_from, p_to, p_observation_type } = getFilters();

  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
      p_observation_type,
    });

  if (error) throw error;

  return enrichRowsWithReportMeta(data || []);
}

async function loadAllReportRowsForYearSelectors() {
  const { data, error } = await state.supabase
    .from("post_inspection_reports")
    .select("id, vessel_id, inspection_date, report_ref, title, ocimf_inspecting_company, inspector_name, inspector_company");

  if (error) {
    console.warn("Report rows unavailable for year selector.", error);
    return [];
  }

  return data || [];
}

function rebuildReportMetaMap() {
  state.reportMetaByKey = new Map();

  for (const r of state.allReportRows || []) {
    const k = reportKeyFromReport(r);
    if (!k) continue;
    state.reportMetaByKey.set(k, {
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
      ocimf_inspecting_company: meta.ocimf_inspecting_company || "—",
      inspector_name: meta.inspector_name || "—",
      inspector_company: meta.inspector_company || "—",
    };
  });
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

function renderYearSelect(selectId, years, includeAll, preferredYear) {
  const sel = safeEl(selectId);
  if (!sel) return;

  const existing = String(sel.value || "").trim();
  sel.innerHTML = "";

  if (includeAll) {
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All years";
    sel.appendChild(all);
  }

  for (const y of years) {
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y;
    sel.appendChild(o);
  }

  if (existing && years.includes(existing)) sel.value = existing;
  else if (preferredYear && years.includes(preferredYear)) sel.value = preferredYear;
  else if (!includeAll && years.length) sel.value = years[0];
  else sel.value = "";
}

function renderMonthSelect(selectId) {
  const sel = safeEl(selectId);
  if (!sel) return;

  const existing = String(sel.value || "").trim();
  sel.innerHTML = "";

  for (const m of MONTHS) {
    const o = document.createElement("option");
    o.value = m.value;
    o.textContent = m.label;
    sel.appendChild(o);
  }

  sel.value = MONTHS.some((m) => m.value === existing) ? existing : "";
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
      last_seen: x.last_seen,
    }))
    .sort((a, b) =>
      b.observation_count - a.observation_count ||
      b.report_count - a.report_count ||
      String(a.key).localeCompare(String(b.key))
    );
}

function buildAverageStats(rows) {
  const reports = new Set();
  let negative = 0;
  let largely = 0;
  let positive = 0;

  for (const row of rows || []) {
    reports.add(reportKey(row));
    const t = normalizeType(row.observation_type);
    if (t === "negative") negative += 1;
    if (t === "largely") largely += 1;
    if (t === "positive") positive += 1;
  }

  const inspections = reports.size;
  const total = negative + largely + positive;

  return {
    inspections,
    negative,
    largely,
    positive,
    total,
    avg_negative: avg(negative, inspections),
    avg_largely: avg(largely, inspections),
    avg_positive: avg(positive, inspections),
    avg_total: avg(total, inspections),
  };
}

function groupAverageRows(rows, keyFn) {
  const map = new Map();

  for (const row of rows || []) {
    const key = String(keyFn(row) || "—").trim() || "—";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      ...buildAverageStats(list),
    }))
    .sort((a, b) => b.total - a.total || Number(b.avg_total) - Number(a.avg_total) || a.key.localeCompare(b.key));
}

function groupSplitByType(rows, keyFn) {
  const map = new Map();

  for (const row of rows || []) {
    const key = String(keyFn(row) || "—").trim() || "—";
    const t = normalizeType(row.observation_type);

    if (!map.has(key)) {
      map.set(key, {
        key,
        negative: 0,
        largely: 0,
        positive: 0,
        total: 0,
      });
    }

    const item = map.get(key);
    item.total += 1;

    if (t === "negative") item.negative += 1;
    if (t === "largely") item.largely += 1;
    if (t === "positive") item.positive += 1;
  }

  return [...map.values()].sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)));
}

function renderSplitTable(tbodyId, rows, keyLabel, limit = 50) {
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
    `;
    tbody.appendChild(tr);
  }

  if (!list.length) ensureTbodyMessage(tbody, 4, `No ${keyLabel} data for current filters.`);
}

function buildMonthlyRows(rows, yearFilter = "") {
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

  for (const row of rows || []) {
    const y = yearOf(row);
    if (y !== year) continue;

    const key = monthKey(row);
    if (!map.has(key)) continue;

    const item = map.get(key);
    item.reports.add(reportKey(row));
    item.observations += 1;

    const t = normalizeType(row.observation_type);
    if (t === "negative") item.negative += 1;
    if (t === "positive") item.positive += 1;
    if (t === "largely") item.largely += 1;
  }

  return [...map.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
}

function buildPeriodRows(rows, keyFn) {
  const map = new Map();

  for (const row of rows || []) {
    const key = String(keyFn(row) || "—");
    if (!key || key === "—") continue;

    if (!map.has(key)) {
      map.set(key, { key, observation_count: 0 });
    }

    map.get(key).observation_count += 1;
  }

  return [...map.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function renderMonthlyTrend(rows) {
  const tbody = safeTbody("monthlyTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const trendYear = selectedYear("trendYearFilter");
  const grouped = buildMonthlyRows(rows, trendYear);

  for (const r of grouped) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(r.month)}</td>
      <td>${esc(r.reports.size)}</td>
      <td>${esc(r.observations)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.largely)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 6, "No monthly data for current filters.");
}

function renderBarChart(containerId, rows, options = {}) {
  const box = safeEl(containerId);
  if (!box) return;

  const labelFn = options.labelFn || ((r) => r.key);
  const valueFn = options.valueFn || ((r) => r.observation_count);
  const limit = Number(options.limit || 10);
  const emptyText = options.emptyText || "No chart data for current filters.";

  const chartRows = (rows || [])
    .filter((r) => Number(valueFn(r) || 0) > 0)
    .slice(0, limit);

  if (!chartRows.length) {
    box.innerHTML = `<div class="emptyChart">${esc(emptyText)}</div>`;
    return;
  }

  const max = Math.max(...chartRows.map((r) => Number(valueFn(r) || 0)), 1);

  box.innerHTML = chartRows.map((r) => {
    const label = String(labelFn(r) || "—");
    const value = Number(valueFn(r) || 0);
    const pct = Math.max(3, Math.round((value / max) * 100));

    return `
      <div class="barRow" title="${esc(label)}: ${esc(value)}">
        <div class="barLabel">${esc(label)}</div>
        <div class="barTrack">
          <div class="barFill" style="width:${pct}%"></div>
        </div>
        <div class="barValue">${esc(value)}</div>
      </div>
    `;
  }).join("");
}

function rowsOfType(rows, type) {
  return (rows || []).filter((r) => normalizeType(r.observation_type) === type);
}

function renderTypeVisuals(rows) {
  const neg = rowsOfType(rows, "negative");
  const largely = rowsOfType(rows, "largely");
  const positive = rowsOfType(rows, "positive");

  renderBarChart("chartNegCategory", groupObjectiveRows(neg, (r) => r.designation), { limit: 10 });
  renderBarChart("chartLargelyCategory", groupObjectiveRows(largely, (r) => r.designation), { limit: 10 });

  renderBarChart("chartNegMonthly", buildPeriodRows(neg, monthKey), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 18 });
  renderBarChart("chartLargelyMonthly", buildPeriodRows(largely, monthKey), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 18 });
  renderBarChart("chartPositiveMonthly", buildPeriodRows(positive, monthKey), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 18 });

  renderBarChart("chartNegQuarterly", buildPeriodRows(neg, quarterOf), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 16 });
  renderBarChart("chartLargelyQuarterly", buildPeriodRows(largely, quarterOf), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 16 });
  renderBarChart("chartPositiveQuarterly", buildPeriodRows(positive, quarterOf), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 16 });

  renderBarChart("chartNegAnnual", buildPeriodRows(neg, yearOf), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 10 });
  renderBarChart("chartLargelyAnnual", buildPeriodRows(largely, yearOf), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 10 });
  renderBarChart("chartPositiveAnnual", buildPeriodRows(positive, yearOf), { labelFn: (r) => r.key, valueFn: (r) => r.observation_count, limit: 10 });
}

function renderByVessel(rows, byVesselReportRows) {
  const tbody = safeTbody("byVesselTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const byName = new Map();

  for (const r of byVesselReportRows || []) {
    const name = String(r.vessel_name || "—").trim() || "—";
    if (!byName.has(name)) {
      byName.set(name, {
        vessel_name: name,
        report_count: Number(r.report_count || 0),
        negative: 0,
        largely: 0,
        positive: 0,
      });
    } else {
      byName.get(name).report_count = Number(r.report_count || 0);
    }
  }

  for (const row of rows || []) {
    const name = String(row.vessel_name || "—").trim() || "—";
    if (!byName.has(name)) {
      byName.set(name, {
        vessel_name: name,
        report_count: 0,
        negative: 0,
        largely: 0,
        positive: 0,
      });
    }

    const item = byName.get(name);
    const t = normalizeType(row.observation_type);
    if (t === "negative") item.negative += 1;
    if (t === "largely") item.largely += 1;
    if (t === "positive") item.positive += 1;
  }

  const list = [...byName.values()].sort((a, b) => a.vessel_name.localeCompare(b.vessel_name));

  for (const r of list) {
    const total = r.negative + r.largely + r.positive;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.vessel_name)}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(avg(r.negative, r.report_count))}</td>
      <td>${esc(avg(r.largely, r.report_count))}</td>
      <td>${esc(avg(r.positive, r.report_count))}</td>
      <td>${esc(avg(total, r.report_count))}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!list.length) ensureTbodyMessage(tbody, 9, "No vessel data for current filters.");
}

function renderFleetAverage(rows) {
  const tbody = safeTbody("avgFleetTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const s = buildAverageStats(rows);

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>Selected scope</td>
    <td>${esc(s.inspections)}</td>
    <td>${esc(s.negative)}</td>
    <td>${esc(s.largely)}</td>
    <td>${esc(s.positive)}</td>
    <td>${esc(s.total)}</td>
    <td>${esc(s.avg_negative)}</td>
    <td>${esc(s.avg_largely)}</td>
    <td>${esc(s.avg_positive)}</td>
    <td>${esc(s.avg_total)}</td>
  `;
  tbody.appendChild(tr);
}

function renderAverageGroupTable(rows, keyFn, tbodyId, emptyLabel) {
  const tbody = safeTbody(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = "";

  const grouped = groupAverageRows(rows, keyFn);

  for (const r of grouped) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.inspections)}</td>
      <td>${esc(r.negative)}</td>
      <td>${esc(r.largely)}</td>
      <td>${esc(r.positive)}</td>
      <td>${esc(r.total)}</td>
      <td>${esc(r.avg_total)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!grouped.length) ensureTbodyMessage(tbody, 7, `No ${emptyLabel} data for current filters.`);
}

function renderByType(rows) {
  const tbody = safeTbody("byTypeTbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const groups = groupObjectiveRows(rows, (r) => typeLabel(r.observation_type));

  for (const r of groups) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${esc(r.key)}</td>
      <td>${esc(r.report_count)}</td>
      <td>${esc(r.observation_count)}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!groups.length) ensureTbodyMessage(tbody, 3, "No type data for current filters.");
}

function recurringFilteredRows(rows) {
  const year = selectedYear("recurringYearFilter");
  const month = selectedMonth("recurringMonthFilter");

  return (rows || []).filter((r) => {
    if (year && yearOf(r) !== year) return false;
    if (month && monthOf(r) !== month) return false;
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

function renderByCategory(rows) {
  renderSplitTable("byCategoryTbody", groupSplitByType(rows, (r) => r.designation), "category");
}

function renderTopSoc(rows) {
  renderSplitTable("topSocTbody", groupSplitByType(rows, (r) => r.soc), "SOC", 100);
}

function renderTopNoc(rows) {
  renderSplitTable("topNocTbody", groupSplitByType(rows, (r) => r.noc), "NOC", 100);
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

function renderPgnoAnalytics(rows) {
  const pgRows = extractPgnoAnalyticsRows(rows);
  const byPgno = groupObjectiveRows(pgRows, (r) => r.pgno_label).slice(0, 50);
  const byPgnoQuestion = groupObjectiveRows(pgRows, (r) => r.question_no).slice(0, 50);

  renderBarChart("chartPgno", byPgno, {
    labelFn: (r) => r.key,
    valueFn: (r) => r.observation_count,
    limit: 10,
    emptyText: "No assigned PGNOs for current filters.",
  });

  renderBarChart("chartPgnoQuestion", byPgnoQuestion, {
    labelFn: (r) => r.key,
    valueFn: (r) => r.observation_count,
    limit: 10,
    emptyText: "No PGNO/question data for current filters.",
  });

  const missingRows = (rows || []).filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    const type = normalizeType(r.observation_type);
    return (type === "negative" || type === "largely") && arr.length === 0;
  });

  const missingMonthly = buildPeriodRows(missingRows, monthKey);

  renderBarChart("chartPgnoMissing", missingMonthly, {
    labelFn: (r) => r.key,
    valueFn: (r) => r.observation_count,
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
      <td>${esc(r.last_seen || "")}</td>
    `;
    tbody.appendChild(tr);
  }

  if (!byPgno.length) ensureTbodyMessage(tbody, 4, "No assigned PGNO data for current filters.");
}

function renderSummaryFromRows(rows, summary) {
  setText("sumReports", String(summary?.report_count ?? 0));
  setText("sumObs", String(summary?.observation_count ?? rows.length ?? 0));
  setText("sumMissing", String(summary?.missing_pgno_count ?? 0));
  setText("sumDistinct", String(summary?.distinct_questions ?? 0));

  const missingNeg = (rows || []).filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    return normalizeType(r.observation_type) === "negative" && arr.length === 0;
  }).length;

  const missingLargely = (rows || []).filter((r) => {
    const arr = Array.isArray(r.pgno_selected) ? r.pgno_selected : [];
    return normalizeType(r.observation_type) === "largely" && arr.length === 0;
  }).length;

  setText("sumMissingSplit", `Negative: ${missingNeg} | Largely: ${missingLargely}`);
}

async function renderAllStats(summary, byVesselReportRows, rows) {
  renderSummaryFromRows(rows, summary);

  renderTypeVisuals(rows);
  renderByVessel(rows, byVesselReportRows);
  renderFleetAverage(rows);
  renderByType(rows);
  renderTopRecurringQuestions(rows);
  renderByCategory(rows);
  renderTopSoc(rows);
  renderTopNoc(rows);
  renderMonthlyTrend(rows);
  renderAverageGroupTable(rows, (r) => r.ocimf_inspecting_company, "byOcimfTbody", "OCIMF company");
  renderAverageGroupTable(rows, (r) => r.inspector_name, "byInspectorTbody", "inspector");
  renderAverageGroupTable(rows, (r) => r.inspector_company, "byInspectorCompanyTbody", "inspector company");
  renderPgnoAnalytics(rows);
}

async function applyFilters() {
  setStatus("Loading…");

  const { vessel_id, p_from, p_to, p_observation_type } = getFilters();

  const { data: sum, error: sumErr } = await state.supabase
    .rpc("post_insp_stats_summary", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
      p_observation_type,
    });

  if (sumErr) throw sumErr;

  const summary = Array.isArray(sum) ? sum[0] : sum;

  const { data: byV, error: byVErr } = await state.supabase
    .rpc("post_insp_stats_by_vessel", {
      p_from,
      p_to,
      p_observation_type,
    });

  if (byVErr) throw byVErr;

  const rows = await loadFilteredObservationRows();

  await renderAllStats(summary, byV || [], rows);

  setStatus("Ready");
}

async function exportFilteredCsv() {
  setStatus("Exporting…");

  const { vessel_id, p_from, p_to, p_observation_type } = getFilters();

  const { data, error } = await state.supabase
    .rpc("post_insp_export_observations", {
      p_vessel_id: vessel_id,
      p_from,
      p_to,
      p_observation_type,
    });

  if (error) throw error;

  const rows = enrichRowsWithReportMeta(data || []);

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

  const safeV = (vessel_id ? (state.vessels.find(v => v.id === vessel_id)?.name || "vessel") : "fleet")
    .replace(/[^a-z0-9]+/gi, "_");
  const safeFrom = (p_from || "from").replace(/[^0-9-]+/g, "_");
  const safeTo = (p_to || "to").replace(/[^0-9-]+/g, "_");

  a.download = `post_inspection_export_${safeV}_${safeFrom}_${safeTo}.csv`;
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

  state.labelMap = new Map(
    OBS_TYPES.filter((x) => x.value).map((x) => [x.value, x.label])
  );

  state.vessels = await loadVessels();
  renderVesselFilter();
  renderTypeFilter();
  renderMonthSelect("recurringMonthFilter");

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

  state.allReportRows = await loadAllReportRowsForYearSelectors();
  rebuildReportMetaMap();

  state.allRows = await loadFilteredObservationRows().catch(() => []);

  const years = collectYearsFromRows(state.allRows, state.allReportRows);
  const currentYear = String(new Date().getFullYear());

  renderYearSelect("recurringYearFilter", years, true, "");
  renderYearSelect("trendYearFilter", years, false, currentYear);

  bindClick("applyBtn", async () => {
    try {
      await applyFilters();
    } catch (e) {
      console.error(e);
      alert("Apply filters failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  bindClick("exportCsvBtn", async () => {
    try {
      await exportFilteredCsv();
    } catch (e) {
      console.error(e);
      alert("Export failed: " + (e?.message || String(e)));
      setStatus("Error");
    }
  });

  const refresh = async () => {
    try {
      await applyFilters();
    } catch (e) {
      console.error(e);
      setStatus("Error");
    }
  };

  bindChange("recurringMinCount", refresh);
  bindChange("recurringYearFilter", refresh);
  bindChange("recurringMonthFilter", refresh);
  bindChange("trendYearFilter", refresh);

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