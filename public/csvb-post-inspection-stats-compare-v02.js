// public/csvb-post-inspection-stats-compare-v02.js
// C.S.V. BEACON — Post-Inspection Stats comparison helper v02.
// Replaces the single large comparison chart with one compact controls panel and three metric cards:
// Observations, Inspections, Average obs / inspection.
// Safe layer: reads already-rendered trend rows; does not alter calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-COMPARE-V02-20260529";
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

  function injectStyle() {
    if (document.getElementById("csvbPostStatsCompareV02Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsCompareV02Style";
    style.textContent = `
      #csvbStatsComparePanelV01.csvb-stats-compare-v02{
        box-sizing:border-box!important;
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
        display:block!important;
        margin:12px 0 0!important;
        padding:10px!important;
        border:1px solid #d5deef;
        border-radius:16px;
        background:linear-gradient(180deg,#ffffff,#f8fbff);
        box-shadow:0 4px 18px rgba(18,44,87,.12);
        color:#1a4170;
      }
      .csvb-stats-compare-v02-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:10px;
        flex-wrap:wrap;
        margin-bottom:8px;
      }
      .csvb-stats-compare-v02-title{
        color:#1a4170;
        font-weight:950;
        font-size:1rem;
      }
      .csvb-stats-compare-v02-sub{
        color:#48628e;
        font-weight:850;
        font-size:.78rem;
        line-height:1.35;
        margin-top:2px;
      }
      .csvb-stats-compare-v02-controls{
        display:grid;
        grid-template-columns:minmax(180px,1fr) minmax(180px,1fr);
        gap:8px;
        margin-bottom:8px;
        max-width:760px;
      }
      .csvb-stats-compare-v02-field label{
        display:block;
        margin:0 0 3px;
        color:#1a4170;
        font-size:.78rem;
        font-weight:950;
      }
      .csvb-stats-compare-v02-field select{
        width:100%;
        border:1px solid #cbd7ee;
        border-radius:10px;
        padding:7px 9px;
        color:#1a4170;
        background:#fff;
        font-size:.84rem;
        font-weight:850;
      }
      .csvb-stats-compare-v02-options{
        border:1px solid #d5deef;
        border-radius:14px;
        padding:7px;
        background:#fff;
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(82px,1fr));
        gap:6px 10px;
        max-height:86px;
        overflow:auto;
        margin-bottom:10px;
      }
      .csvb-stats-compare-v02-check{
        display:flex;
        align-items:center;
        gap:7px;
        color:#223a66;
        font-weight:850;
        font-size:.78rem;
        line-height:1.2;
      }
      .csvb-stats-compare-v02-check input{
        width:auto;
        transform:scale(1.05);
      }
      .csvb-stats-compare-v02-card-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
      .csvb-stats-compare-v02-card{
        border:1px solid #d8e5f7;
        border-radius:14px;
        background:#fff;
        padding:9px;
        min-height:238px;
        overflow:hidden;
      }
      .csvb-stats-compare-v02-card-title{
        color:#1a4170;
        font-weight:950;
        font-size:.9rem;
        line-height:1.25;
        margin-bottom:6px;
      }
      .csvb-stats-compare-v02-card svg{
        display:block;
        width:100%;
        height:auto;
        max-height:190px;
        overflow:visible;
      }
      .csvb-stats-compare-v02-gridline{ stroke:#e5eefc; stroke-width:1; }
      .csvb-stats-compare-v02-axis{ stroke:#cbd7ee; stroke-width:1; }
      .csvb-stats-compare-v02-text{
        fill:#35507b;
        font-family:"Segoe UI",Arial,sans-serif;
        font-size:10.5px;
        font-weight:800;
      }
      .csvb-stats-compare-v02-legend{
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        margin-top:5px;
        color:#223a66;
        font-weight:850;
        font-size:.74rem;
      }
      .csvb-stats-compare-v02-swatch{
        display:inline-block;
        width:11px;
        height:11px;
        border-radius:999px;
        margin-right:4px;
        vertical-align:-1px;
      }
      .csvb-stats-compare-v02-note{
        color:#48628e;
        font-weight:850;
        font-size:.75rem;
        margin-top:8px;
        line-height:1.35;
      }
      .csvb-stats-compare-v02-empty{
        color:#55708f;
        font-weight:850;
        padding:10px;
      }
      @media(max-width:1280px){
        .csvb-stats-compare-v02-card-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); }
      }
      @media(max-width:760px){
        .csvb-stats-compare-v02-controls{ grid-template-columns:1fr; max-width:none; }
        .csvb-stats-compare-v02-options{ grid-template-columns:repeat(auto-fill,minmax(80px,1fr)); }
        .csvb-stats-compare-v02-card-grid{ grid-template-columns:1fr; }
        .csvb-stats-compare-v02-card svg{ max-height:210px; }
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
      } else if (/^\d{4}-\d{2}$/.test(b)) {
        set.add(b);
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
    if (panel) {
      panel.className = "csvb-stats-compare-v02";
      return panel;
    }

    const statGrid = document.querySelector(".statGrid");
    if (!statGrid) return null;

    panel = document.createElement("div");
    panel.id = "csvbStatsComparePanelV01";
    panel.className = "csvb-stats-compare-v02";
    panel.innerHTML = `
      <div class="csvb-stats-compare-v02-head">
        <div>
          <div class="csvb-stats-compare-v02-title">Comparison Charts</div>
          <div class="csvb-stats-compare-v02-sub">Compare selected years, quarters or months using the already filtered statistics.</div>
        </div>
        <div class="csvb-stats-compare-v02-sub">build: ${esc(BUILD)}</div>
      </div>
      <div class="csvb-stats-compare-v02-controls">
        <div class="csvb-stats-compare-v02-field">
          <label for="csvbStatsCompareFamilyV01">Observation family</label>
          <select id="csvbStatsCompareFamilyV01"></select>
        </div>
        <div class="csvb-stats-compare-v02-field">
          <label for="csvbStatsCompareModeV01">Compare by</label>
          <select id="csvbStatsCompareModeV01"></select>
        </div>
      </div>
      <div class="csvb-stats-compare-v02-options" id="csvbStatsCompareOptionsV01"></div>
      <div class="csvb-stats-compare-v02-card-grid" id="csvbStatsCompareCardGridV02"></div>
      <div class="csvb-stats-compare-v02-note">Display-only comparison cards. Existing KPI calculations, filters, drilldowns and exports are not modified.</div>
    `;

    statGrid.insertAdjacentElement("afterend", panel);

    const fam = el("csvbStatsCompareFamilyV01");
    fam.innerHTML = Object.entries(FAMILIES).map(([value, cfg]) => `<option value="${esc(value)}">${esc(cfg.label)}</option>`).join("");
    fam.value = state.family;

    const mode = el("csvbStatsCompareModeV01");
    mode.innerHTML = MODES.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("");
    mode.value = state.mode;

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

      if (target.matches("input[data-csvb-compare-option='1']")) {
        const value = String(target.value || "");
        if (target.checked) state.selected.add(value);
        else state.selected.delete(value);
        renderCards();
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

    const label = state.mode === "months" ? "month" : "year";
    box.innerHTML = options.length
      ? options.map((value) => `
          <label class="csvb-stats-compare-v02-check">
            <input type="checkbox" data-csvb-compare-option="1" value="${esc(value)}" ${state.selected.has(value) ? "checked" : ""} />
            <span>${esc(value)}</span>
          </label>
        `).join("")
      : `<div class="csvb-stats-compare-v02-empty">No ${esc(label)} options available for this selection.</div>`;
  }

  function valueOf(row, metric) {
    return Number(row?.[metric] || 0);
  }

  function buildSeries(metric) {
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
          values: months.map((month) => valueOf(rows.find((r) => r.bucket === `${year}-${month}`), metric)),
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
          values: quarters.map((quarter) => valueOf(rows.find((r) => r.bucket === `${year}-${quarter}`), metric)),
        })),
      };
    }

    const rows = parseBarRows(cfg.monthly);
    const months = selected;
    return {
      labels: months,
      series: [{
        name: METRICS.find((x) => x.value === metric)?.label || metric,
        color: cfg.color,
        values: months.map((month) => valueOf(rows.find((r) => r.bucket === month), metric)),
      }],
    };
  }

  function renderSvg(labels, series) {
    const width = 520;
    const height = 230;
    const box = { left: 42, right: 500, top: 18, bottom: 160 };
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

    const grid = [0, 0.5, 1].map((ratio) => {
      const y = box.bottom - ratio * plotH;
      const value = Math.round(ratio * maxY * 100) / 100;
      return `
        <line class="csvb-stats-compare-v02-gridline" x1="${box.left}" y1="${y.toFixed(1)}" x2="${box.right}" y2="${y.toFixed(1)}"></line>
        <text class="csvb-stats-compare-v02-text" x="5" y="${(y + 4).toFixed(1)}">${esc(value)}</text>
      `;
    }).join("");

    const labelIndexes = new Set();
    if (labels.length <= 6) labels.forEach((_, i) => labelIndexes.add(i));
    else {
      labelIndexes.add(0);
      labelIndexes.add(Math.floor((labels.length - 1) / 2));
      labelIndexes.add(labels.length - 1);
    }

    const xLabels = labels.map((label, i) => {
      if (!labelIndexes.has(i)) return "";
      const anchor = i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle";
      return `<text class="csvb-stats-compare-v02-text" x="${xFor(i).toFixed(1)}" y="192" text-anchor="${anchor}">${esc(label)}</text>`;
    }).join("");

    const lines = series.map((s) => {
      const points = s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
      const dots = s.values.map((v, i) => {
        const x = xFor(i);
        const y = yFor(v);
        return `
          <g>
            <title>${esc(s.name)} / ${esc(labels[i])}: ${esc(v)}</title>
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="${s.color}" stroke="#fff" stroke-width="1.5"></circle>
          </g>
        `;
      }).join("");

      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${dots}`;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparison line chart">
        ${grid}
        <line class="csvb-stats-compare-v02-axis" x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}"></line>
        <line class="csvb-stats-compare-v02-axis" x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}"></line>
        ${lines}
        ${xLabels}
      </svg>
    `;
  }

  function renderMetricCard(metric) {
    const cfg = familyConfig();
    const meta = METRICS.find((x) => x.value === metric) || { value: metric, label: metric };
    const { labels, series, message } = buildSeries(metric);
    const activeSeries = series.filter((s) => s.values.some((v) => Number(v || 0) !== 0));
    const finalSeries = activeSeries.length ? activeSeries : series;

    if (message) {
      return `<div class="csvb-stats-compare-v02-card"><div class="csvb-stats-compare-v02-card-title">${esc(cfg.label)} — ${esc(meta.label)}</div><div class="csvb-stats-compare-v02-empty">${esc(message)}</div></div>`;
    }

    if (!labels.length || !finalSeries.length) {
      return `<div class="csvb-stats-compare-v02-card"><div class="csvb-stats-compare-v02-card-title">${esc(cfg.label)} — ${esc(meta.label)}</div><div class="csvb-stats-compare-v02-empty">No comparison data available for the current filters.</div></div>`;
    }

    const legend = finalSeries.map((s) => `<span><span class="csvb-stats-compare-v02-swatch" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>`).join("");

    return `
      <div class="csvb-stats-compare-v02-card">
        <div class="csvb-stats-compare-v02-card-title">${esc(cfg.label)} — ${esc(meta.label)}</div>
        ${renderSvg(labels, finalSeries)}
        <div class="csvb-stats-compare-v02-legend">${legend}</div>
      </div>
    `;
  }

  function renderCards() {
    const grid = el("csvbStatsCompareCardGridV02");
    if (!grid) return;
    grid.innerHTML = METRICS.map((m) => renderMetricCard(m.value)).join("");
  }

  function refreshPanel() {
    ensurePanel();
    refreshOptions();
    renderCards();
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
