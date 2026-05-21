const POST_INSPECTION_INDEX_BUILD =
  "post_inspection_index_v5_risk_average_colour_2026-05-21";

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

function parseDateParts(anyDate) {
  const s = String(anyDate || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { year: m[1], month: m[2], day: m[3], iso: s };

  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return { year: m[3], month: m[2], day: m[1], iso: `${m[3]}-${m[2]}-${m[1]}` };

  return { year: "", month: "", day: "", iso: "" };
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

const state = {
  me: null,
  supabase: null,
  reports: [],
  riskScoresByReport: new Map(),
  riskAverages: {
    ytdAverage: null,
    ytdTotal: 0,
    ytdCount: 0,
    last12Average: null,
    last12Total: 0,
    last12Count: 0,
    basisAverage: null,
    unscoredCount: 0,
  },
  storedFilters: {},
  storedDateYears: new Set(),
  storedDateMonths: new Set(),
  openFilterCol: null,
};

async function loadReportsFromDb() {
  const { data, error } = await state.supabase.rpc("csvb_post_inspection_reports_for_me");

  if (error) throw error;

  return (data || []).map((r) => ({
    ...r,
    vessel_name: r.vessel_name || "",
    company_name: r.company_name || ""
  }));
}

function uniqueValuesForCol(col) {
  const vals = (state.reports || [])
    .map((r) => r?.[col] ?? "")
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const uniq = [...new Set(vals)];
  uniq.sort((a, b) => a.localeCompare(b));
  return uniq;
}

function uniqueYearsForDate() {
  const yrs = [];
  for (const r of state.reports || []) {
    const p = parseDateParts(r?.inspection_date);
    if (p.year) yrs.push(p.year);
  }
  return [...new Set(yrs)].sort((a, b) => a.localeCompare(b));
}

function uniqueMonthsForDate() {
  const mos = [];
  for (const r of state.reports || []) {
    const p = parseDateParts(r?.inspection_date);
    if (p.month) mos.push(p.month);
  }
  return [...new Set(mos)].sort((a, b) => a.localeCompare(b));
}

function reportPassesStoredFilters(r) {
  const p = parseDateParts(r?.inspection_date);
  if (state.storedDateYears.size > 0) {
    if (!p.year || !state.storedDateYears.has(p.year)) return false;
  }
  if (state.storedDateMonths.size > 0) {
    if (!p.month || !state.storedDateMonths.has(p.month)) return false;
  }

  for (const col of Object.keys(state.storedFilters)) {
    if (col === "inspection_date") continue;
    const set = state.storedFilters[col];
    if (!(set instanceof Set) || set.size === 0) continue;
    const v = String(r?.[col] ?? "").trim();
    if (!v) return false;
    if (!set.has(v)) return false;
  }
  return true;
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
  if (s === "photo" || s === "photograph") return "Photo";
  return String(d || "").trim();
}

const STORED_KPI_HUMAN_PIF_OPTIONS = [
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

function normalizeStoredKpiHumanPifText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function storedKpiKind(item) {
  const k = String(item?.obs_type || "").trim().toLowerCase();
  if (k === "negative" || k === "positive" || k === "largely") return k;

  const ot = String(item?.observation_type || "").trim().toLowerCase();
  if (ot === "negative_observation") return "negative";
  if (ot === "positive_observation") return "positive";
  if (ot === "note_improvement") return "largely";
  return "";
}

function storedKpiHumanSoc(item) {
  const rank = String(item?.positive_rank || "").trim();
  if (rank) return rank;

  const sx = String(item?.source_excerpt || "").trim();
  const m = sx.match(/^Human\s+(.+?):/i);
  if (m) return String(m[1] || "").trim();

  return "";
}

function storedKpiHumanPifs(item) {
  const candidates = [];
  const cc = String(item?.classification_coding || "").trim();
  const noc = String(item?.nature_of_concern || "").trim();

  if (cc) candidates.push(...cc.split("|").map((x) => x.trim()).filter(Boolean));
  if (noc) candidates.push(...noc.split("|").map((x) => x.trim()).filter(Boolean));

  const set = new Set(candidates.map(normalizeStoredKpiHumanPifText));

  return STORED_KPI_HUMAN_PIF_OPTIONS.filter((opt) => set.has(normalizeStoredKpiHumanPifText(opt)));
}

function storedKpiSoc(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return storedKpiHumanSoc(item);
  return String(item?.classification_coding || "").trim();
}

function storedKpiNoc(item) {
  const d = normDesignation(item?.designation);
  if (d === "Human") return storedKpiHumanPifs(item).join(" | ");
  return String(item?.nature_of_concern || "").trim();
}

function storedKpiUniqueCountMap(items, getter) {
  const map = new Map();
  for (const it of items || []) {
    const val = String(getter(it) || "").trim();
    if (!val) continue;
    map.set(val, (map.get(val) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function storedKpiTopLines(items, getter, limit = 20) {
  const pairs = storedKpiUniqueCountMap(items, getter).slice(0, limit);
  if (!pairs.length) return "—";
  return pairs.map(([k, v]) => `${v} × ${k}`).join("\n");
}

function storedKpiSetValue(id, value) {
  const node = el(id);
  if (node) node.value = String(value ?? "");
}

async function loadStoredKpiReportHeader(reportId) {
  let fallback = (state.reports || []).find((r) => String(r.id) === String(reportId)) || null;

  try {
    const { data, error } = await state.supabase.rpc("csvb_post_inspection_report_by_id_for_me", {
      p_report_id: reportId
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return row || fallback;
  } catch (e) {
    console.warn("Stored KPI report header RPC unavailable; using list row fallback.", e);
    return fallback;
  }
}

async function loadStoredKpiItems(reportId) {
  const { data, error } = await state.supabase
    .from("post_inspection_observation_items")
    .select("id, report_id, question_no, question_base, observation_type, obs_type, designation, positive_rank, classification_coding, nature_of_concern, observation_text, remarks, source_excerpt, pgno_selected")
    .eq("report_id", reportId);

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    qno: canonicalQno(row.question_no || row.question_base || ""),
    kind: storedKpiKind(row),
    designation: normDesignation(row.designation),
  }));
}

function storedKpiExaminedCount(report, items) {
  const direct = Number(report?.examined_count || 0);
  if (direct > 0) return direct;

  const arr = Array.isArray(report?.examined_questions) ? report.examined_questions : [];
  if (arr.length) return arr.length;

  const uniqueQ = new Set((items || []).map((x) => x.qno).filter(Boolean));
  return uniqueQ.size;
}

function renderStoredKpiDialog(report, items) {
  const byKind = {
    positive: items.filter((x) => x.kind === "positive"),
    largely: items.filter((x) => x.kind === "largely"),
    negative: items.filter((x) => x.kind === "negative"),
  };

  const title = String(report?.report_ref || "").trim() || "Inspection";
  const vessel = String(report?.vessel_name || "").trim() || "—";
  const date = String(report?.inspection_date || "").trim() || "—";
  const company = String(report?.ocimf_inspecting_company || "").trim() || "—";

  el("storedKpiTitle").textContent = `Single Inspection KPIs — ${title}`;
  el("storedKpiSubtitle").textContent = `${vessel} • ${date} • ${company}`;

  storedKpiSetValue("storedKpiQuestionsExamined", storedKpiExaminedCount(report, items));
  storedKpiSetValue("storedKpiTotal", items.length);
  storedKpiSetValue("storedKpiNeg", byKind.negative.length);
  storedKpiSetValue("storedKpiPos", byKind.positive.length);
  storedKpiSetValue("storedKpiLae", byKind.largely.length);

  storedKpiSetValue("storedKpiQuestionsPositive", storedKpiTopLines(byKind.positive, (x) => x.qno));
  storedKpiSetValue("storedKpiQuestionsLargely", storedKpiTopLines(byKind.largely, (x) => x.qno));
  storedKpiSetValue("storedKpiQuestionsNegative", storedKpiTopLines(byKind.negative, (x) => x.qno));

  storedKpiSetValue("storedKpiCategoriesPositive", storedKpiTopLines(byKind.positive, (x) => normDesignation(x.designation)));
  storedKpiSetValue("storedKpiCategoriesLargely", storedKpiTopLines(byKind.largely, (x) => normDesignation(x.designation)));
  storedKpiSetValue("storedKpiCategoriesNegative", storedKpiTopLines(byKind.negative, (x) => normDesignation(x.designation)));

  storedKpiSetValue("storedKpiSocPositive", storedKpiTopLines(byKind.positive, (x) => storedKpiSoc(x)));
  storedKpiSetValue("storedKpiSocLargely", storedKpiTopLines(byKind.largely, (x) => storedKpiSoc(x)));
  storedKpiSetValue("storedKpiSocNegative", storedKpiTopLines(byKind.negative, (x) => storedKpiSoc(x)));

  storedKpiSetValue("storedKpiNocPositive", storedKpiTopLines(byKind.positive, (x) => storedKpiNoc(x)));
  storedKpiSetValue("storedKpiNocLargely", storedKpiTopLines(byKind.largely, (x) => storedKpiNoc(x)));
  storedKpiSetValue("storedKpiNocNegative", storedKpiTopLines(byKind.negative, (x) => storedKpiNoc(x)));

  const openBtn = el("storedKpiOpenInspectionBtn");
  if (openBtn) {
    openBtn.onclick = () => {
      if (!report?.id) return;
      window.location.href = `./post_inspection_detail.html?report_id=${encodeURIComponent(report.id)}`;
    };
  }

  el("storedKpiDialog").showModal();
}

async function openStoredInspectionKpis(reportId) {
  const report = await loadStoredKpiReportHeader(reportId);
  if (!report) throw new Error("Report not found or access denied.");

  const items = await loadStoredKpiItems(reportId);
  renderStoredKpiDialog(report, items);
}



function fmtRiskScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function riskScoreForReport(reportId) {
  return state.riskScoresByReport instanceof Map
    ? state.riskScoresByReport.get(String(reportId))
    : null;
}

function riskMiniGaugeHtml(reportId) {
  const r = riskScoreForReport(reportId);
  if (!r) {
    return '<div class="csvb-risk-mini no-risk"><span class="csvb-risk-mini-label">Risk</span><span class="csvb-risk-mini-value">—</span></div>';
  }

  const rawScore = riskScoreNumber(r);
  const score = fmtRiskScore(rawScore);
  const profile = String(r.profile_name || "Risk").trim();
  const avg = state.riskAverages?.basisAverage;
  const ratio = Number.isFinite(rawScore) && Number.isFinite(Number(avg)) && Number(avg) > 0
    ? rawScore / Number(avg)
    : null;

  const title =
    profile +
    " / " +
    String(r.version_label || "") +
    " | Score: " +
    score +
    " | Average basis: " +
    fmtAvgRisk(avg) +
    (ratio == null ? "" : " | Ratio: " + ratio.toFixed(2) + "x") +
    " | Eligible: " +
    String(r.eligible_risk_observations ?? "—") +
    " | Max: " +
    fmtRiskScore(r.max_observation_risk);

  return (
    '<div class="csvb-risk-mini" style="' + esc(riskColourStyle(rawScore)) + '" title="' + esc(title) + '">' +
      '<span class="csvb-risk-mini-label">' + esc(profile) + '</span>' +
      '<span class="csvb-risk-mini-value">' + esc(score) + '</span>' +
      '<span class="csvb-risk-mini-ratio">' + esc(ratio == null ? "avg —" : ratio.toFixed(2) + "× avg") + '</span>' +
    '</div>'
  );
}

async function loadCurrentRiskScoresForStoredReports() {
  state.riskScoresByReport = new Map();

  const { data, error } = await state.supabase.rpc("csvb_post_inspection_current_risk_scores_for_me");
  if (error) {
    console.warn("Current risk scores failed to load", error);
    return;
  }

  for (const row of data || []) {
    if (!row?.report_id) continue;
    state.riskScoresByReport.set(String(row.report_id), row);
  }
}



function parseInspectionDateForRisk(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  return null;
}

function riskScoreNumber(row) {
  const n = Number(row?.inspection_risk_score);
  return Number.isFinite(n) ? n : null;
}

function computeRiskAverages() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const last12Start = new Date(now);
  last12Start.setMonth(last12Start.getMonth() - 12);

  const scored = [];
  let unscoredCount = 0;

  for (const report of state.reports || []) {
    const risk = riskScoreForReport(report.id);
    const score = riskScoreNumber(risk);
    const date = parseInspectionDateForRisk(report.inspection_date);

    if (score == null) {
      unscoredCount++;
      continue;
    }

    scored.push({ report, risk, score, date });
  }

  const ytd = scored.filter((x) => x.date && x.date.getFullYear() === currentYear);
  const last12 = scored.filter((x) => x.date && x.date >= last12Start && x.date <= now);

  const sum = (arr) => arr.reduce((acc, x) => acc + x.score, 0);
  const avg = (arr) => arr.length ? sum(arr) / arr.length : null;

  const ytdTotal = sum(ytd);
  const last12Total = sum(last12);

  state.riskAverages = {
    ytdAverage: avg(ytd),
    ytdTotal,
    ytdCount: ytd.length,
    last12Average: avg(last12),
    last12Total,
    last12Count: last12.length,
    basisAverage: avg(ytd) ?? avg(last12) ?? avg(scored),
    unscoredCount,
  };

  return state.riskAverages;
}

function fmtAvgRisk(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function riskColourStyle(score) {
  const avg = Number(state.riskAverages?.basisAverage);

  if (!Number.isFinite(score) || !Number.isFinite(avg) || avg <= 0) {
    return "--csvb-risk-bg:#f8fbff;--csvb-risk-border:#d6e4f5;--csvb-risk-text:#5e6f86;";
  }

  /*
    Relative colour scale:
    0.00 × avg      = green
    1.00 × avg      = yellow
    2.00 × avg+     = red
  */
  const ratio = Math.max(0, Math.min(2, score / avg));
  const hue = Math.round(120 - (ratio / 2) * 120);

  return [
    `--csvb-risk-bg:hsl(${hue} 95% 84%)`,
    `--csvb-risk-border:hsl(${hue} 78% 42%)`,
    `--csvb-risk-text:#031b3f`
  ].join(";") + ";";
}

function ensureRiskAveragePanel() {
  let panel = el("riskAveragePanel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "riskAveragePanel";
  panel.className = "csvb-risk-average-panel";

  const storedCount = el("storedCount");
  const anchor = storedCount?.parentElement || document.querySelector(".card");
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(panel, anchor.nextSibling);
  } else {
    document.body.prepend(panel);
  }

  return panel;
}

function renderRiskAveragePanel() {
  const a = state.riskAverages || computeRiskAverages();
  const panel = ensureRiskAveragePanel();

  panel.innerHTML = `
    <div class="csvb-risk-average-title">Risk / Inspection Average</div>
    <div class="csvb-risk-average-grid">
      <div class="csvb-risk-average-box">
        <span>Current Calendar Year</span>
        <strong>${fmtAvgRisk(a.ytdAverage)}</strong>
        <em>${a.ytdCount || 0} scored inspection(s) • total ${fmtAvgRisk(a.ytdTotal)}</em>
      </div>
      <div class="csvb-risk-average-box">
        <span>Last 12 Months</span>
        <strong>${fmtAvgRisk(a.last12Average)}</strong>
        <em>${a.last12Count || 0} scored inspection(s) • total ${fmtAvgRisk(a.last12Total)}</em>
      </div>
      <div class="csvb-risk-average-box">
        <span>Colour Basis</span>
        <strong>${fmtAvgRisk(a.basisAverage)}</strong>
        <em>Green below average • red above average</em>
      </div>
      <div class="csvb-risk-average-box">
        <span>Unscored Inspections</span>
        <strong>${a.unscoredCount || 0}</strong>
        <em>Use Refresh Risk to include them</em>
      </div>
    </div>
  `;
}

function renderStoredTable() {
  const body = el("storedTableBody");
  const rows = (state.reports || []).filter(reportPassesStoredFilters);

  renderRiskAveragePanel();

  el("storedCount").textContent = `${rows.length} inspection(s)`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" class="muted">No inspections found.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((r) => `
      <tr class="stored-row" data-id="${esc(r.id)}">
        <td class="vessel-bold" title="${esc(r.vessel_name || "")}">${esc(r.vessel_name || "—")}</td>
        <td>${esc(r.inspection_date || "—")}</td>
        <td title="${esc(r.report_ref || "")}">${esc(r.report_ref || "—")}</td>
        <td title="${esc(r.title || "")}">${esc(r.title || "—")}</td>
        <td title="${esc(r.ocimf_inspecting_company || "")}">${esc(r.ocimf_inspecting_company || "—")}</td>
        <td title="${esc(r.inspector_name || "")}">${esc(r.inspector_name || "—")}</td>
        <td title="${esc(r.inspector_company || "")}">${esc(r.inspector_company || "—")}</td>
        <td>${riskMiniGaugeHtml(r.id)}</td>
        <td>
          <button class="btn muted stored-kpi-btn" type="button" data-kpi-id="${esc(r.id)}" title="Quick KPI view for this inspection.">KPIs</button>
        </td>
      </tr>
    `)
    .join("");

  body.querySelectorAll(".stored-kpi-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const reportId = btn.getAttribute("data-kpi-id");
      if (!reportId) return;

      try {
        btn.disabled = true;
        btn.textContent = "Loading…";
        await openStoredInspectionKpis(reportId);
      } catch (err) {
        console.error(err);
        alert("KPI quick view failed: " + (err?.message || String(err)));
      } finally {
        btn.disabled = false;
        btn.textContent = "KPIs";
      }
    });
  });

  body.querySelectorAll("tr.stored-row").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      window.location.href = `./post_inspection_detail.html?report_id=${encodeURIComponent(id)}`;
    });
  });
}

function closeStoredFilterDialog() {
  try {
    el("storedFilterDialog").close();
  } catch {}
  state.openFilterCol = null;
}

function renderStoredDateFilterUI() {
  const wrap = el("storedFilterList");
  const years = uniqueYearsForDate();
  const months = uniqueMonthsForDate();

  const monthName = (mm) => {
    const map = {
      "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun",
      "07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"
    };
    return map[mm] || mm;
  };

  const yearHtml = years.length
    ? years.map((y) => `
      <label class="chk-row">
        <input type="checkbox" class="storedDateYearChk" data-year="${esc(y)}" ${state.storedDateYears.has(y) ? "checked" : ""}/>
        <span>${esc(y)}</span>
      </label>
    `).join("")
    : `<div class="muted" style="padding:8px;">No years.</div>`;

  const monthHtml = months.length
    ? months.map((m) => `
      <label class="chk-row">
        <input type="checkbox" class="storedDateMonthChk" data-month="${esc(m)}" ${state.storedDateMonths.has(m) ? "checked" : ""}/>
        <span>${esc(m)} — ${esc(monthName(m))}</span>
      </label>
    `).join("")
    : `<div class="muted" style="padding:8px;">No months.</div>`;

  wrap.innerHTML = `
    <div class="date-filter-grid">
      <div class="date-filter-card">
        <h4>Year</h4>
        <div class="chk-list">${yearHtml}</div>
      </div>
      <div class="date-filter-card">
        <h4>Month</h4>
        <div class="chk-list">${monthHtml}</div>
      </div>
    </div>
  `;

  wrap.querySelectorAll(".storedDateYearChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const y = chk.getAttribute("data-year");
      if (!y) return;
      if (chk.checked) state.storedDateYears.add(y);
      else state.storedDateYears.delete(y);
    });
  });

  wrap.querySelectorAll(".storedDateMonthChk").forEach((chk) => {
    const m = chk.getAttribute("data-month");
    chk.addEventListener("change", () => {
      if (!m) return;
      if (chk.checked) state.storedDateMonths.add(m);
      else state.storedDateMonths.delete(m);
    });
  });
}

function renderStoredFilterList(values, selectedSet, searchTerm) {
  const box = el("storedFilterList");
  box.className = "chk-list";

  const term = String(searchTerm || "").trim().toLowerCase();
  const filtered = !term ? values : values.filter((v) => String(v).toLowerCase().includes(term));

  if (!filtered.length) {
    box.innerHTML = `<div class="muted" style="padding:8px;">No values.</div>`;
    return;
  }

  box.innerHTML = filtered.map((v) => `
    <label class="chk-row">
      <input type="checkbox" class="storedFilterChk" data-val="${esc(v)}" ${selectedSet.has(v) ? "checked" : ""}/>
      <span>${esc(v)}</span>
    </label>
  `).join("");

  box.querySelectorAll(".storedFilterChk").forEach((chk) => {
    chk.addEventListener("change", () => {
      const v = chk.getAttribute("data-val");
      if (!v) return;
      if (chk.checked) selectedSet.add(v);
      else selectedSet.delete(v);
    });
  });
}

function openStoredFilterForCol(col) {
  if (state.openFilterCol === col && el("storedFilterDialog").open) {
    closeStoredFilterDialog();
    return;
  }

  state.openFilterCol = col;

  const titleMap = {
    vessel_name: "Vessel",
    inspection_date: "Date (Year + Month)",
    title: "Title",
    ocimf_inspecting_company: "OCIMF Inspecting Company",
    inspector_name: "Inspector Name",
    inspector_company: "Inspector’s Company",
  };

  el("storedFilterTitle").textContent = titleMap[col] || "Filters";

  if (col === "inspection_date") {
    el("storedFilterSub").textContent = "Tick Year and/or Month. Leave both empty = no filtering.";
    el("storedFilterSearch").style.display = "none";
    renderStoredDateFilterUI();
  } else {
    el("storedFilterSub").textContent = "Select values to include. Leave empty = no filtering.";
    el("storedFilterSearch").style.display = "block";
    el("storedFilterSearch").value = "";
    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    state.storedFilters[col] = set;
    renderStoredFilterList(values, set, "");
  }

  el("storedFilterDialog").showModal();
}

async function init() {
  el("buildPill").textContent = `build: ${POST_INSPECTION_INDEX_BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded.");

  state.supabase = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES;
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean));
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");
  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);

  el("dashboardBtn").addEventListener("click", async () => {
    await safeNavigate(["./q-dashboard.html", "./dashboard.html", "./su-admin.html", "./index.html", "./"]);
  });

  el("modeSelectBtn").addEventListener("click", async () => {
    await safeNavigate(["./mode_selection.html", "./mode-selection.html", "./index.html", "./"]);
  });

  el("newReportBtn").addEventListener("click", () => {
    window.location.href = "./post_inspection_detail.html";
  });

  el("clearStoredFiltersBtn").addEventListener("click", () => {
    state.storedFilters = {};
    state.storedDateYears = new Set();
    state.storedDateMonths = new Set();
    renderStoredTable();
  });

  document.querySelectorAll(".filter-btn[data-filter-col]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const col = btn.getAttribute("data-filter-col");
      if (!col) return;
      openStoredFilterForCol(col);
    });
  });

  el("storedFilterSearch").addEventListener("input", () => {
    const col = state.openFilterCol;
    if (!col || col === "inspection_date") return;
    const values = uniqueValuesForCol(col);
    const set = state.storedFilters[col] instanceof Set ? state.storedFilters[col] : new Set();
    renderStoredFilterList(values, set, el("storedFilterSearch").value);
    state.storedFilters[col] = set;
  });

  el("storedFilterClearBtn").addEventListener("click", () => {
    const col = state.openFilterCol;
    if (!col) return;
    if (col === "inspection_date") {
      state.storedDateYears = new Set();
      state.storedDateMonths = new Set();
      renderStoredDateFilterUI();
      return;
    }
    state.storedFilters[col] = new Set();
    renderStoredFilterList(uniqueValuesForCol(col), state.storedFilters[col], el("storedFilterSearch").value);
  });

  el("storedFilterApplyBtn").addEventListener("click", () => {
    closeStoredFilterDialog();
    renderStoredTable();
  });

  state.reports = await loadReportsFromDb();
  await loadCurrentRiskScoresForStoredReports();
  computeRiskAverages();
  renderRiskAveragePanel();
  renderStoredTable();
}

(async () => {
  try {
    await init();
  } catch (e) {
    console.error(e);
    alert("Post-Inspection index failed to load: " + (e?.message || String(e)));
  }
})();