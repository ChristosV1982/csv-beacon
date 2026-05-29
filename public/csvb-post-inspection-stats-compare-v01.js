// public/csvb-post-inspection-stats-compare-v01.js
// C.S.V. BEACON — Post-Inspection Stats comparison helper v01.
// Adds comparison controls for year / quarter / month trend review.
// Safe layer: reads the already-rendered trend rows; does not change calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-COMPARE-V01-20260529";
  window.CSVB_POST_STATS_COMPARE_BUILD = BUILD;

  const FAMILIES = {
    negative: {
      label: "Negative",
      color: "#c62828",
      colours: ["#c62828", "#ef5350", "#8e0000", "#ff8a80", "#ad1457"],
      monthly: "chartNegMonthly",
      quarterly: "chartNegQuarterly",
      annual: "chartNegAnnual",
    },
    largely: {
      label: "Largely as expected",
      color: "#b36b00",
      colours: ["#b36b00", "#f59e0b", "#7c3f00", "#ffb74d", "#92400e"],
      monthly: "chartLargelyMonthly",
      quarterly: "chartLargelyQuarterly",
      annual: "chartLargelyAnnual",
    },
    positive: {
      label: "Positive",
      color: "#16803a",
      colours: ["#16803a", "#22c55e", "#0b5d2a", "#86efac", "#047857"],
      monthly: "chartPositiveMonthly",
      quarterly: "chartPositiveQuarterly",
      annual: "chartPositiveAnnual",
    },
    missing_pgno: {
      label: "Missing PGNO",
      color: "#8a4b00",
      colours: ["#8a4b00", "#a16207", "#d97706", "#f59e0b", "#7c2d12"],
      monthly: "chartPgnoMissing",
      quarterly: null,
      annual: null,
    },
  };

  const MODES = [
    { value: "years", label: "Compare years" },
    { value: "quarters", label: "Compare quarters" },
    { value: "months", label: "Compare selected months" },
  ];

  const METRICS = [
    { value: "observations", label: "Observations" },
    { value: "inspections", label: "Inspections" },
    { value: "average", label: "Average obs / inspection" },
  ];

  const state = {
    family: "negative",
    mode: "years",
    metric: "observations",
    selected: new Set(),
    lastOptionKey: "",
    observerStarted: false,
    pending: false,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function metricLabel(metric = state.metric) {
    return METRICS.find((x) => x.value === metric)?.label || metric;
  }

  function injectStyle() {
    if (document.getElementById("csvbPostStatsCompareV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsCompareV01Style";
    style.textContent = `
      .csvb-stats-compare-v01{
        margin-top:12px;
        border:1px solid #d5deef;
        border-radius:16px;
        background:linear-gradient(180deg,#ffffff,#f8fbff);
        padding:12px;
        box-shadow:0 4px 18px rgba(18,44,87,.12);
        color:#1a4170;
      }
      .csvb-stats-compare-v01-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:10px;
      }
      .csvb-stats-compare-v01-title{
        font-weight:950;
        font-size:1.02rem;
        color:#1a4170;
      }
      .csvb-stats-compare-v01-sub{
        color:#48628e;
        font-weight:850;
        font-size:.86rem;
        line-height:1.35;
        margin-top:3px;
      }
      .csvb-stats-compare-v01-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(170px,1fr));
        gap:10px;
        align-items:end;
      }
      .csvb-stats-compare-v01-field label{
        display:block;
        margin:0 0 5px;
        color:#1a4170;
        font-size:.82rem;
        font-weight:950;
      }
      .csvb-stats-compare-v01-field select{
        width:100%;
        border:1px solid #cbd7ee;
        border-radius:10px;
        padding:9px 10px;
        color:#1a4170;
        background:#fff;
        font-weight:850;
      }
      .csvb-stats-compare-v01-options{
        margin-top:10px;
        border:1px solid #d5deef;
        border-radius:14px;
        padding:8px;
        background:#fff;
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(110px,1fr));
        gap:6px 10px;
        max-height:145px;
        overflow:auto;
      }
      .csvb-stats-compare-v01-check{
        display:flex;
        align-items:center;
        gap:7px;
        color:#223a66;
        font-weight:850;
        font-size:.85rem;
        line-height:1.2;
      }
      .csvb-stats-compare-v01-check input{
        width:auto;
        transform:scale(1.05);
      }
      .csvb-stats-compare-v01-chart{
        margin-top:12px;
        border:1px solid #d8e5f7;
        border-radius:14px;
        background:#ffffff;
        padding:10px;
        overflow:hidden;
      }
      .csvb-stats-compare-v01-chart svg{
        display:block;
        width:100%;
        height:auto;
        overflow:visible;
      }
      .csvb-stats-compare-v01-note{
        color:#48628e;
        font-weight:850;
        font-size:.8rem;
        margin-top:8px;
        line-height:1.35;
      }
      .csvb-stats-compare-v01-empty{
        color:#55708f;
        font-weight:850;
        padding:10px;
      }
      .csvb-stats-compare-v01-gridline{ stroke:#e5eefc; stroke-width:1; }
      .csvb-stats-compare-v01-axis{ stroke:#cbd7ee; stroke-width:1; }
      .csvb-stats-compare-v01-text{
        fill:#35507b;
        font-family:"Segoe UI",Arial,sans-serif;
        font-size:11px;
        font-weight:800;
      }
      .csvb-stats-compare-v01-legend{
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        margin-top:8px;
        color:#223a66;
        font-weight:850;
        font-size:.82rem;
      }
      .csvb-stats-compare-v01-swatch{
        display:inline-block;
        width:12px;
        height:12px;
        border-radius:999px;
        margin-right:5px;
        vertical-align:-1px;
      }
      @media(max-width:760px){
        .csvb-stats-compare-v01-grid{ grid-template-columns:1fr; }
        .csvb-stats-compare-v01-options{ grid-template-columns:repeat(auto-fill,minmax(95px,1fr)); }
        .csvb-stats-compare-v01-text{ font-size:10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function parseBarRows(containerId) {
    const box = el(containerId);
    if (!box) return [];

    return Array.from(box.querySelectorAll(":scope > .barRow"))
      .map((row) => {
        const cells = Array.from(row.children || []);
        const bucket = String(cells[0]?.textContent || "").trim();
        const valueText = String(cells[2]?.textContent || "").trim();
        const nums = valueText.match(/-?\d+(?:\.\d+)?/g) || [];

        return {
          bucket,
          observations: Number(nums[0] || 0),
          inspections: Number(nums[1] || 0),
          average: Number(nums[2] || 0),
          valueText,
        };
      })
      .filter((x) => x.bucket);
  }

  function familyConfig() {
    return FAMILIES[state.family] || FAMILIES.negative;
  }

  function dataRowsForMode(mode = state.mode) {
    const cfg = familyConfig();
    if (mode === "quarters") return parseBarRows(cfg.quarterly);
    if (mode === "months") return parseBarRows(cfg.monthly);
    return parseBarRows(cfg.monthly);
  }

  function availableOptions() {
    const rows = dataRowsForMode();
    const set = new Set();

    for (const r of rows) {
      const b = String(r.bucket || "");
      if (state.mode === "years") {
        const m = b.match(/^(\d{4})-\d{2}$/);
        if (m) set.add(m[1]);
      } else if (state.mode === "quarters") {
        const m = b.match(/^(\d{4})-Q[1-4]$/);
        if (m) set.add(m[1]);
      } else {
        if (/^\d{4}-\d{2}$/.test(b)) set.add(b);
      }
    }

    return Array.from(set).sort();
  }

  function defaultSelection(options) {
    if (state.mode === "months") return options.slice(-12);
    return options.slice(-3);
  }

  function ensurePanel() {
    let panel = el("csvbStatsComparePanelV01");
    if (panel) return panel;

    const statGrid = document.querySelector(".statGrid");
    if (!statGrid) return null;

    panel = document.createElement("div");
    panel.id = "csvbStatsComparePanelV01";
    panel.className = "csvb-stats-compare-v01";
    panel.innerHTML = `
      <div class="csvb-stats-compare-v01-head">
        <div>
          <div class="csvb-stats-compare-v01-title">Comparison Chart</div>
          <div class="csvb-stats-compare-v01-sub">Compare selected years, quarters or months using the already filtered statistics.</div>
        </div>
        <div class="csvb-stats-compare-v01-sub">build: ${esc(BUILD)}</div>
      </div>
      <div class="csvb-stats-compare-v01-grid">
        <div class="csvb-stats-compare-v01-field">
          <label for="csvbStatsCompareFamilyV01">Observation family</label>
          <select id="csvbStatsCompareFamilyV01"></select>
        </div>
        <div class="csvb-stats-compare-v01-field">
          <label for="csvbStatsCompareModeV01">Compare by</label>
          <select id="csvbStatsCompareModeV01"></select>
        </div>
        <div class="csvb-stats-compare-v01-field">
          <label for="csvbStatsCompareMetricV01">Metric</label>
          <select id="csvbStatsCompareMetricV01"></select>
        </div>
      </div>
      <div class="csvb-stats-compare-v01-options" id="csvbStatsCompareOptionsV01"></div>
      <div class="csvb-stats-compare-v01-chart" id="csvbStatsCompareChartV01"></div>
      <div class="csvb-stats-compare-v01-note">This comparison panel is display-only. It does not store data and does not alter the existing KPI calculations or drilldown rows.</div>
    `;

    statGrid.insertAdjacentElement("afterend", panel);

    const fam = el("csvbStatsCompareFamilyV01");
    fam.innerHTML = Object.entries(FAMILIES).map(([value, cfg]) => `<option value="${esc(value)}">${esc(cfg.label)}</option>`).join("");
    fam.value = state.family;

    const mode = el("csvbStatsCompareModeV01");
    mode.innerHTML = MODES.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
    mode.value = state.mode;

    const metric = el("csvbStatsCompareMetricV01");
    metric.innerHTML = METRICS.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
    metric.value = state.metric;

    panel.addEventListener("change", (e) => {
      const target = e.target;
      if (!target) return;

      if (target.id === "csvbStatsCompareFamilyV01") {
        state.family = String(target.value || "negative");
        state.lastOptionKey = "";
        refreshPanel();
        return;
      }

      if (target.id === "csvbStatsCompareModeV01") {
        state.mode = String(target.value || "years");
        state.lastOptionKey = "";
        refreshPanel();
        return;
      }

      if (target.id === "csvbStatsCompareMetricV01") {
        state.metric = String(target.value || "observations");
        renderChart();
        return;
      }

      if (target.matches("input[data-csvb-compare-option='1']")) {
        const value = String(target.value || "");
        if (target.checked) state.selected.add(value);
        else state.selected.delete(value);
        renderChart();
      }
    });

    return panel;
  }

  function refreshOptions() {
    const box = el("csvbStatsCompareOptionsV01");
    if (!box) return;

    const options = availableOptions();
    const key = `${state.family}|${state.mode}|${options.join(",")}`;

    if (key !== state.lastOptionKey) {
      const previous = new Set(state.selected);
      state.selected = new Set(options.filter((x) => previous.has(x)));
      if (!state.selected.size) defaultSelection(options).forEach((x) => state.selected.add(x));
      state.lastOptionKey = key;
    }

    const label = state.mode === "months" ? "Month" : "Year";
    box.innerHTML = options.length
      ? options.map((value) => `
          <label class="csvb-stats-compare-v01-check">
            <input type="checkbox" data-csvb-compare-option="1" value="${esc(value)}" ${state.selected.has(value) ? "checked" : ""} />
            <span>${esc(value)}</span>
          </label>
        `).join("")
      : `<div class="csvb-stats-compare-v01-empty">No ${esc(label.toLowerCase())} options available for this selection.</div>`;
  }

  function valueOf(row) {
    return Number(row?.[state.metric] || 0);
  }

  function buildSeries() {
    const cfg = familyConfig();
    const selected = Array.from(state.selected).sort();

    if (state.mode === "years") {
      const rows = parseBarRows(cfg.monthly);
      const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
      return {
        labels: months,
        series: selected.map((year, idx) => ({
          name: year,
          color: cfg.colours[idx % cfg.colours.length],
          values: months.map((month) => valueOf(rows.find((r) => r.bucket === `${year}-${month}`))),
        })),
      };
    }

    if (state.mode === "quarters") {
      if (!cfg.quarterly) return { labels: [], series: [], message: "Quarter comparison is not available for this family yet." };
      const rows = parseBarRows(cfg.quarterly);
      const quarters = ["Q1", "Q2", "Q3", "Q4"];
      return {
        labels: quarters,
        series: selected.map((year, idx) => ({
          name: year,
          color: cfg.colours[idx % cfg.colours.length],
          values: quarters.map((quarter) => valueOf(rows.find((r) => r.bucket === `${year}-${quarter}`))),
        })),
      };
    }

    const rows = parseBarRows(cfg.monthly);
    const months = selected;
    return {
      labels: months,
      series: [{
        name: metricLabel(),
        color: cfg.color,
        values: months.map((month) => valueOf(rows.find((r) => r.bucket === month))),
      }],
    };
  }

  function renderSvg(labels, series) {
    const width = 820;
    const height = 285;
    const box = { left: 48, right: 792, top: 22, bottom: 205 };
    const values = series.flatMap((s) => s.values.map((v) => Number(v || 0)));
    const maxY = Math.max(1, ...values);
    const plotW = box.right - box.left;
    const plotH = box.bottom - box.top;

    function xFor(i) {
      return labels.length <= 1 ? box.left + plotW / 2 : box.left + (i * plotW) / (labels.length - 1);
    }

    function yFor(v) {
      return box.top + ((maxY - Number(v || 0)) / maxY) * plotH;
    }

    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = box.bottom - ratio * plotH;
      const value = Math.round(ratio * maxY * 100) / 100;
      return `
        <line class="csvb-stats-compare-v01-gridline" x1="${box.left}" y1="${y.toFixed(1)}" x2="${box.right}" y2="${y.toFixed(1)}"></line>
        <text class="csvb-stats-compare-v01-text" x="5" y="${(y + 4).toFixed(1)}">${esc(value)}</text>
      `;
    }).join("");

    const labelIndexes = new Set();
    if (labels.length <= 8) labels.forEach((_, i) => labelIndexes.add(i));
    else {
      labelIndexes.add(0);
      labelIndexes.add(Math.floor((labels.length - 1) / 2));
      labelIndexes.add(labels.length - 1);
    }

    const xLabels = labels.map((label, i) => {
      if (!labelIndexes.has(i)) return "";
      const anchor = i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle";
      return `<text class="csvb-stats-compare-v01-text" x="${xFor(i).toFixed(1)}" y="236" text-anchor="${anchor}">${esc(label)}</text>`;
    }).join("");

    const lines = series.map((s) => {
      const points = s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
      const dots = s.values.map((v, i) => {
        const x = xFor(i);
        const y = yFor(v);
        return `
          <g>
            <title>${esc(s.name)} / ${esc(labels[i])}: ${esc(v)}</title>
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.7" fill="${s.color}" stroke="#fff" stroke-width="1.8"></circle>
          </g>
        `;
      }).join("");

      return `
        <polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${dots}
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparison line chart">
        ${grid}
        <line class="csvb-stats-compare-v01-axis" x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}"></line>
        <line class="csvb-stats-compare-v01-axis" x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}"></line>
        ${lines}
        ${xLabels}
      </svg>
    `;
  }

  function renderChart() {
    const chart = el("csvbStatsCompareChartV01");
    if (!chart) return;

    const cfg = familyConfig();
    const { labels, series, message } = buildSeries();
    const activeSeries = series.filter((s) => s.values.some((v) => Number(v || 0) !== 0));

    if (message) {
      chart.innerHTML = `<div class="csvb-stats-compare-v01-empty">${esc(message)}</div>`;
      return;
    }

    if (!labels.length || !series.length) {
      chart.innerHTML = `<div class="csvb-stats-compare-v01-empty">No comparison data available for the current filters.</div>`;
      return;
    }

    const finalSeries = activeSeries.length ? activeSeries : series;
    const legend = finalSeries.map((s) => `
      <span><span class="csvb-stats-compare-v01-swatch" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>
    `).join("");

    chart.innerHTML = `
      <div class="csvb-stats-compare-v01-title">${esc(cfg.label)} — ${esc(metricLabel())}</div>
      ${renderSvg(labels, finalSeries)}
      <div class="csvb-stats-compare-v01-legend">${legend}</div>
    `;
  }

  function refreshPanel() {
    ensurePanel();
    refreshOptions();
    renderChart();
  }

  function scheduleRefresh() {
    if (state.pending) return;
    state.pending = true;
    window.setTimeout(() => {
      state.pending = false;
      refreshPanel();
    }, 140);
  }

  function startObservers() {
    if (state.observerStarted) return;
    state.observerStarted = true;

    const observer = new MutationObserver(scheduleRefresh);
    Object.values(FAMILIES).forEach((cfg) => {
      [cfg.monthly, cfg.quarterly, cfg.annual].filter(Boolean).forEach((id) => {
        const node = el(id);
        if (node) observer.observe(node, { childList: true, subtree: true });
      });
    });
  }

  function start() {
    injectStyle();
    refreshPanel();
    startObservers();
    window.setTimeout(refreshPanel, 500);
    window.setTimeout(refreshPanel, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
