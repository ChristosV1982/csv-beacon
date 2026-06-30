// public/csvb-post-inspection-stats-compare-v03.js
// C.S.V. BEACON — Post-Inspection Stats comparison helper v03.
// Three independent comparison cards. Each card has its own family, period, metric and selected comparison values.
// Safe layer: reads already-rendered trend rows. Does not change calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-COMPARE-V04-20260630";
  window.CSVB_POST_STATS_COMPARE_BUILD = BUILD;

  const FAMILIES = {
    negative: { label: "Negative", color: "#c62828", colours: ["#c62828", "#ef5350", "#8e0000", "#ff8a80"], monthly: "chartNegMonthly", quarterly: "chartNegQuarterly" },
    largely: { label: "Largely as expected", color: "#b36b00", colours: ["#b36b00", "#f59e0b", "#7c3f00", "#ffb74d"], monthly: "chartLargelyMonthly", quarterly: "chartLargelyQuarterly" },
    positive: { label: "Positive", color: "#16803a", colours: ["#16803a", "#22c55e", "#0b5d2a", "#86efac"], monthly: "chartPositiveMonthly", quarterly: "chartPositiveQuarterly" },
    missing_pgno: { label: "Missing PGNO", color: "#8a4b00", colours: ["#8a4b00", "#a16207", "#d97706", "#f59e0b"], monthly: "chartPgnoMissing", quarterly: null },
  };

  const MODES = [
    { value: "years", label: "Years" },
    { value: "quarters", label: "Quarters" },
    { value: "months", label: "Months" },
  ];

  const METRICS = [
    { value: "observations", label: "Observations" },
    { value: "inspections", label: "Inspections" },
    { value: "average", label: "Avg obs / insp." },
  ];

  const cards = [
    { id: "a", title: "Comparison 1", family: "negative", mode: "years", metric: "observations", selected: new Set(), lastOptionKey: "" },
    { id: "b", title: "Comparison 2", family: "largely", mode: "years", metric: "observations", selected: new Set(), lastOptionKey: "" },
    { id: "c", title: "Comparison 3", family: "positive", mode: "years", metric: "observations", selected: new Set(), lastOptionKey: "" },
  ];

  let observerStarted = false;
  let pending = false;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function el(id) { return document.getElementById(id); }
  function familyConfig(card) { return FAMILIES[card.family] || FAMILIES.negative; }
  function metricLabel(metric) { return METRICS.find((x) => x.value === metric)?.label || metric; }

  function injectStyle() {
    if (document.getElementById("csvbPostStatsCompareV03Style")) return;
    const style = document.createElement("style");
    style.id = "csvbPostStatsCompareV03Style";
    style.textContent = `
      #csvbStatsComparePanelV01.csvb-stats-compare-v03{box-sizing:border-box!important;width:100%!important;max-width:none!important;min-width:0!important;display:block!important;margin:12px 0 0!important;padding:10px!important;border:1px solid #d5deef;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 4px 18px rgba(18,44,87,.12);color:#1a4170;}
      .csvb-stats-compare-v03-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
      .csvb-stats-compare-v03-title{color:#1a4170;font-weight:950;font-size:1rem;}
      .csvb-stats-compare-v03-sub{color:#48628e;font-weight:850;font-size:.78rem;line-height:1.35;margin-top:2px;}
      .csvb-stats-compare-v03-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start;}
      .csvb-stats-compare-v03-card{border:1px solid #d8e5f7;border-radius:14px;background:#fff;padding:9px;min-height:315px;overflow:hidden;}
      .csvb-stats-compare-v03-card-title{color:#1a4170;font-weight:950;font-size:.9rem;line-height:1.25;margin-bottom:7px;display:flex;justify-content:space-between;gap:8px;}
      .csvb-stats-compare-v03-controls{display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:7px;}
      .csvb-stats-compare-v03-field label{display:block;margin:0 0 2px;color:#1a4170;font-size:.72rem;font-weight:950;}
      .csvb-stats-compare-v03-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:6px 8px;color:#1a4170;background:#fff;font-size:.8rem;font-weight:850;}
      .csvb-stats-compare-v03-options{border:1px solid #d5deef;border-radius:12px;padding:6px;background:#fff;display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:5px 8px;max-height:74px;overflow:auto;margin-bottom:7px;}
      .csvb-stats-compare-v03-check{display:flex;align-items:center;gap:5px;color:#223a66;font-weight:850;font-size:.72rem;line-height:1.15;}
      .csvb-stats-compare-v03-check input{width:auto;transform:scale(.95);}
      .csvb-stats-compare-v03-chart svg{display:block;width:100%;height:auto;max-height:170px;overflow:visible;}
      .csvb-stats-compare-v03-gridline{stroke:#e5eefc;stroke-width:1;}.csvb-stats-compare-v03-axis{stroke:#cbd7ee;stroke-width:1;}
      .csvb-stats-compare-v03-text{fill:#35507b;font-family:"Segoe UI",Arial,sans-serif;font-size:10px;font-weight:800;}
      .csvb-stats-compare-v03-legend{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;color:#223a66;font-weight:850;font-size:.7rem;}
      .csvb-stats-compare-v03-swatch{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:4px;vertical-align:-1px;}
      .csvb-stats-compare-v03-empty{color:#55708f;font-weight:850;padding:8px;font-size:.78rem;}
      .csvb-stats-compare-v03-note{color:#48628e;font-weight:850;font-size:.75rem;margin-top:8px;line-height:1.35;}
      @media(max-width:1280px){.csvb-stats-compare-v03-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
      @media(max-width:760px){.csvb-stats-compare-v03-grid{grid-template-columns:1fr;}.csvb-stats-compare-v03-card svg{max-height:210px;}}
    `;
    document.head.appendChild(style);
  }

  function parseBarRows(containerId) {
    const box = el(containerId);
    if (!box) return [];
    return Array.from(box.querySelectorAll(":scope > .barRow")).map((row) => {
      const cells = Array.from(row.children || []);
      const bucket = String(cells[0]?.textContent || "").trim();
      const valueText = String(cells[2]?.textContent || "").trim();
      const nums = valueText.match(/-?\d+(?:\.\d+)?/g) || [];
      return { bucket, observations: Number(nums[0] || 0), inspections: Number(nums[1] || 0), average: Number(nums[2] || 0), valueText };
    }).filter((x) => x.bucket);
  }

  function dataRowsForCard(card) {
    const cfg = familyConfig(card);
    if (card.mode === "quarters") return parseBarRows(cfg.quarterly);
    return parseBarRows(cfg.monthly);
  }

  function availableOptions(card) {
    const rows = dataRowsForCard(card);
    const set = new Set();
    for (const r of rows) {
      const b = String(r.bucket || "");
      if (card.mode === "years") {
        const m = b.match(/^(\d{4})-\d{2}$/);
        if (m) set.add(m[1]);
      } else if (card.mode === "quarters") {
        const m = b.match(/^(\d{4})-Q[1-4]$/);
        if (m) set.add(m[1]);
      } else if (/^\d{4}-\d{2}$/.test(b)) set.add(b);
    }
    return Array.from(set).sort();
  }

  function defaultSelection(card, options) { return card.mode === "months" ? options.slice(-8) : options.slice(-2); }

  function ensurePanel() {
    let panel = el("csvbStatsComparePanelV01");
    if (panel) {
      panel.className = "csvb-stats-compare-v03";
      return panel;
    }
    const advancedAnchor = document.getElementById("advancedComparisonAnchor");
    const statGrid = document.querySelector(".statGrid");
    if (!advancedAnchor && !statGrid) return null;
    panel = document.createElement("div");
    panel.id = "csvbStatsComparePanelV01";
    panel.className = "csvb-stats-compare-v03";
    panel.innerHTML = `
      <div class="csvb-stats-compare-v03-head"><div><div class="csvb-stats-compare-v03-title">Advanced Comparison Charts</div><div class="csvb-stats-compare-v03-sub">Optional advanced cross-checking. Each card has its own family, period and metric criteria.</div></div><div class="csvb-stats-compare-v03-sub">build: ${esc(BUILD)}</div></div>
      <div class="csvb-stats-compare-v03-grid" id="csvbStatsCompareCardGridV03"></div>
      <div class="csvb-stats-compare-v03-note">Display-only comparison cards. Existing KPI calculations, filters, drilldowns and exports are not modified.</div>`;
    if (advancedAnchor) {
      advancedAnchor.insertAdjacentElement("afterend", panel);
    } else {
      statGrid.insertAdjacentElement("afterend", panel);
    }
    panel.addEventListener("change", onChange);
    return panel;
  }

  function ensureCardSelections(card) {
    const options = availableOptions(card);
    const key = `${card.family}|${card.mode}|${options.join(",")}`;
    if (key !== card.lastOptionKey) {
      const prev = new Set(card.selected);
      card.selected = new Set(options.filter((x) => prev.has(x)));
      if (!card.selected.size) defaultSelection(card, options).forEach((x) => card.selected.add(x));
      card.lastOptionKey = key;
    }
    return options;
  }

  function valueOf(row, metric) { return Number(row?.[metric] || 0); }

  function buildSeries(card) {
    const cfg = familyConfig(card);
    const selected = Array.from(card.selected).sort();
    if (card.mode === "years") {
      const rows = parseBarRows(cfg.monthly);
      const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
      return { labels: months, series: selected.map((year, idx) => ({ name: year, color: cfg.colours[idx % cfg.colours.length], values: months.map((m) => valueOf(rows.find((r) => r.bucket === `${year}-${m}`), card.metric)) })) };
    }
    if (card.mode === "quarters") {
      if (!cfg.quarterly) return { labels: [], series: [], message: "Quarter comparison not available for this family." };
      const rows = parseBarRows(cfg.quarterly);
      const quarters = ["Q1", "Q2", "Q3", "Q4"];
      return { labels: quarters, series: selected.map((year, idx) => ({ name: year, color: cfg.colours[idx % cfg.colours.length], values: quarters.map((q) => valueOf(rows.find((r) => r.bucket === `${year}-${q}`), card.metric)) })) };
    }
    const rows = parseBarRows(cfg.monthly);
    return { labels: selected, series: [{ name: metricLabel(card.metric), color: cfg.color, values: selected.map((m) => valueOf(rows.find((r) => r.bucket === m), card.metric)) }] };
  }

  function renderSvg(labels, series) {
    const width = 520, height = 218;
    const box = { left: 38, right: 500, top: 16, bottom: 150 };
    const vals = series.flatMap((s) => s.values.map((v) => Number(v || 0)));
    const maxY = Math.max(1, ...vals);
    const plotW = box.right - box.left, plotH = box.bottom - box.top;
    const xFor = (i) => labels.length <= 1 ? box.left + plotW / 2 : box.left + (i * plotW) / (labels.length - 1);
    const yFor = (v) => box.top + ((maxY - Number(v || 0)) / maxY) * plotH;
    const grid = [0, .5, 1].map((ratio) => {
      const y = box.bottom - ratio * plotH;
      const val = Math.round(ratio * maxY * 100) / 100;
      return `<line class="csvb-stats-compare-v03-gridline" x1="${box.left}" y1="${y.toFixed(1)}" x2="${box.right}" y2="${y.toFixed(1)}"></line><text class="csvb-stats-compare-v03-text" x="4" y="${(y + 4).toFixed(1)}">${esc(val)}</text>`;
    }).join("");
    const labelIndexes = new Set();
    if (labels.length <= 6) labels.forEach((_, i) => labelIndexes.add(i)); else { labelIndexes.add(0); labelIndexes.add(Math.floor((labels.length - 1) / 2)); labelIndexes.add(labels.length - 1); }
    const xLabels = labels.map((label, i) => !labelIndexes.has(i) ? "" : `<text class="csvb-stats-compare-v03-text" x="${xFor(i).toFixed(1)}" y="181" text-anchor="${i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}">${esc(label)}</text>`).join("");
    const lines = series.map((s) => {
      const points = s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
      const dots = s.values.map((v, i) => `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3.2" fill="${s.color}" stroke="#fff" stroke-width="1.4"><title>${esc(s.name)} / ${esc(labels[i])}: ${esc(v)}</title></circle>`).join("");
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></polyline>${dots}`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Independent comparison line chart">${grid}<line class="csvb-stats-compare-v03-axis" x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}"></line><line class="csvb-stats-compare-v03-axis" x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}"></line>${lines}${xLabels}</svg>`;
  }

  function renderOneCard(card) {
    const cfg = familyConfig(card);
    const options = ensureCardSelections(card);
    const { labels, series, message } = buildSeries(card);
    const active = series.filter((s) => s.values.some((v) => Number(v || 0) !== 0));
    const finalSeries = active.length ? active : series;
    const controls = `
      <div class="csvb-stats-compare-v03-controls">
        <div class="csvb-stats-compare-v03-field"><label>Family</label><select data-card="${card.id}" data-field="family">${Object.entries(FAMILIES).map(([v, c]) => `<option value="${esc(v)}" ${v === card.family ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></div>
        <div class="csvb-stats-compare-v03-field"><label>Compare by</label><select data-card="${card.id}" data-field="mode">${MODES.map((m) => `<option value="${esc(m.value)}" ${m.value === card.mode ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>
        <div class="csvb-stats-compare-v03-field"><label>Metric</label><select data-card="${card.id}" data-field="metric">${METRICS.map((m) => `<option value="${esc(m.value)}" ${m.value === card.metric ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select></div>
      </div>`;
    const checks = options.length ? options.map((value) => `<label class="csvb-stats-compare-v03-check"><input type="checkbox" data-card="${card.id}" data-field="selection" value="${esc(value)}" ${card.selected.has(value) ? "checked" : ""}/><span>${esc(value)}</span></label>`).join("") : `<div class="csvb-stats-compare-v03-empty">No options available.</div>`;
    const chart = message ? `<div class="csvb-stats-compare-v03-empty">${esc(message)}</div>` : (!labels.length || !finalSeries.length ? `<div class="csvb-stats-compare-v03-empty">No comparison data.</div>` : renderSvg(labels, finalSeries));
    const legend = finalSeries.map((s) => `<span><span class="csvb-stats-compare-v03-swatch" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>`).join("");
    return `<div class="csvb-stats-compare-v03-card"><div class="csvb-stats-compare-v03-card-title"><span>${esc(card.title)}</span><span>${esc(cfg.label)} / ${esc(metricLabel(card.metric))}</span></div>${controls}<div class="csvb-stats-compare-v03-options">${checks}</div><div class="csvb-stats-compare-v03-chart">${chart}</div><div class="csvb-stats-compare-v03-legend">${legend}</div></div>`;
  }

  function renderCards() {
    const grid = el("csvbStatsCompareCardGridV03");
    if (!grid) return;
    grid.innerHTML = cards.map(renderOneCard).join("");
  }

  function onChange(e) {
    const t = e.target;
    if (!t) return;
    const card = cards.find((c) => c.id === t.getAttribute("data-card"));
    if (!card) return;
    const field = t.getAttribute("data-field");
    if (field === "family") { card.family = String(t.value || "negative"); card.lastOptionKey = ""; renderCards(); return; }
    if (field === "mode") { card.mode = String(t.value || "years"); card.lastOptionKey = ""; renderCards(); return; }
    if (field === "metric") { card.metric = String(t.value || "observations"); renderCards(); return; }
    if (field === "selection") { const value = String(t.value || ""); if (t.checked) card.selected.add(value); else card.selected.delete(value); renderCards(); }
  }

  function refreshPanel() { ensurePanel(); renderCards(); }
  function scheduleRefresh() { if (pending) return; pending = true; window.setTimeout(() => { pending = false; cards.forEach((c) => { c.lastOptionKey = ""; }); refreshPanel(); }, 140); }

  function startObservers() {
    if (observerStarted) return;
    observerStarted = true;
    const observer = new MutationObserver(scheduleRefresh);
    Object.values(FAMILIES).forEach((cfg) => [cfg.monthly, cfg.quarterly].filter(Boolean).forEach((id) => { const node = el(id); if (node) observer.observe(node, { childList: true, subtree: true }); }));
  }

  function start() { injectStyle(); refreshPanel(); startObservers(); window.setTimeout(refreshPanel, 500); window.setTimeout(refreshPanel, 1500); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
