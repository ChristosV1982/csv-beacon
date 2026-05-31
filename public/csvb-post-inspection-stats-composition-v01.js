// public/csvb-post-inspection-stats-composition-v01.js
// C.S.V. BEACON — Post-Inspection Stats composition helper v01.
// Adds display-only composition / share charts based on already-rendered tables and summary cards.
// Does not change calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-COMPOSITION-V01-20260531";
  window.CSVB_POST_STATS_COMPOSITION_BUILD = BUILD;

  const PALETTE = ["#c62828", "#b36b00", "#16803a", "#295eb0", "#6d28d9", "#8a4b00", "#0f766e", "#be185d"];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function num(value) {
    const m = String(value ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : 0;
  }

  function pct(value, total) {
    if (!total) return "0.0%";
    return `${((Number(value || 0) / total) * 100).toFixed(1)}%`;
  }

  function safeRows(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr"));
  }

  function typeShareData() {
    const rows = safeRows("byTypeTbody");
    const out = [];

    for (const tr of rows) {
      const cells = Array.from(tr.children || []);
      if (cells.length < 3) continue;

      const label = String(cells[0]?.textContent || "").trim();
      const count = num(cells[2]?.textContent || "");
      if (!label || !count) continue;

      out.push({ label, value: count });
    }

    const order = ["Negative", "Largely as expected", "Positive"];
    out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    return out;
  }

  function designationShareData() {
    const rows = safeRows("byCategoryTbody");
    const out = [];

    for (const tr of rows) {
      const cells = Array.from(tr.children || []);
      if (cells.length < 4) continue;

      const label = String(cells[0]?.textContent || "").trim() || "—";
      const negative = num(cells[1]?.textContent || "");
      const largely = num(cells[2]?.textContent || "");
      const positive = num(cells[3]?.textContent || "");
      const value = negative + largely + positive;
      if (!value) continue;

      out.push({ label, value });
    }

    out.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    return out;
  }

  function pgnoAssignmentData() {
    const typeRows = typeShareData();
    const negative = typeRows.find((x) => /negative/i.test(x.label))?.value || 0;
    const largely = typeRows.find((x) => /largely/i.test(x.label))?.value || 0;
    const relevant = negative + largely;
    const missing = num(document.getElementById("sumMissing")?.textContent || "0");
    const assigned = Math.max(0, relevant - missing);

    if (!relevant) return [];

    return [
      { label: "Assigned PGNO", value: assigned },
      { label: "Missing PGNO", value: Math.max(0, missing) },
    ].filter((x) => x.value > 0);
  }

  function renderDonut(data, title, subtitle, colors = PALETTE) {
    const total = data.reduce((sum, x) => sum + Number(x.value || 0), 0);
    if (!total) {
      return `<div class="csvb-composition-empty">No data available for the current filters.</div>`;
    }

    let start = 0;
    const segments = data.map((item, idx) => {
      const degrees = (Number(item.value || 0) / total) * 360;
      const end = start + degrees;
      const segment = `${colors[idx % colors.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      start = end;
      return segment;
    }).join(", ");

    const largest = data.slice().sort((a, b) => b.value - a.value)[0];
    const legend = data.map((item, idx) => `
      <div class="csvb-composition-legend-row">
        <span class="csvb-composition-swatch" style="background:${esc(colors[idx % colors.length])}"></span>
        <span class="csvb-composition-label">${esc(item.label)}</span>
        <span class="csvb-composition-value">${esc(item.value)} · ${esc(pct(item.value, total))}</span>
      </div>
    `).join("");

    return `
      <div class="csvb-composition-chart-row">
        <div class="csvb-composition-donut" style="background:conic-gradient(${segments})">
          <div class="csvb-composition-hole">
            <div class="csvb-composition-total">${esc(total)}</div>
            <div class="csvb-composition-total-label">total</div>
          </div>
        </div>
        <div class="csvb-composition-legend">${legend}</div>
      </div>
      <div class="csvb-composition-note">Largest share: ${esc(largest.label)} (${esc(pct(largest.value, total))}).</div>
    `;
  }

  function injectStyle() {
    if (document.getElementById("csvbPostStatsCompositionV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsCompositionV01Style";
    style.textContent = `
      #csvbStatsCompositionPanelV01{
        box-sizing:border-box;
        width:100%;
        margin:12px 0 0;
        padding:10px;
        border:1px solid #d5deef;
        border-radius:16px;
        background:linear-gradient(180deg,#ffffff,#f8fbff);
        box-shadow:0 4px 18px rgba(18,44,87,.12);
        color:#1a4170;
      }
      .csvb-composition-head{
        display:flex;
        justify-content:space-between;
        gap:10px;
        flex-wrap:wrap;
        margin-bottom:10px;
      }
      .csvb-composition-title{
        color:#1a4170;
        font-size:1rem;
        font-weight:950;
      }
      .csvb-composition-sub{
        color:#48628e;
        font-size:.78rem;
        font-weight:850;
        line-height:1.35;
        margin-top:2px;
      }
      .csvb-composition-grid{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:12px;
      }
      .csvb-composition-card{
        border:1px solid #d8e5f7;
        border-radius:14px;
        background:#fff;
        padding:10px;
        min-height:220px;
      }
      .csvb-composition-card-title{
        color:#1a4170;
        font-weight:950;
        font-size:.9rem;
        margin-bottom:3px;
      }
      .csvb-composition-card-sub{
        color:#48628e;
        font-weight:850;
        font-size:.74rem;
        line-height:1.3;
        margin-bottom:8px;
      }
      .csvb-composition-chart-row{
        display:grid;
        grid-template-columns:132px 1fr;
        gap:12px;
        align-items:center;
      }
      .csvb-composition-donut{
        width:128px;
        height:128px;
        border-radius:999px;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);
      }
      .csvb-composition-hole{
        width:74px;
        height:74px;
        border-radius:999px;
        background:#fff;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        border:1px solid #d8e5f7;
      }
      .csvb-composition-total{
        color:#1a4170;
        font-weight:950;
        font-size:1.15rem;
        line-height:1;
      }
      .csvb-composition-total-label{
        color:#48628e;
        font-weight:850;
        font-size:.68rem;
      }
      .csvb-composition-legend{
        display:flex;
        flex-direction:column;
        gap:5px;
        min-width:0;
      }
      .csvb-composition-legend-row{
        display:grid;
        grid-template-columns:12px 1fr auto;
        gap:6px;
        align-items:center;
        color:#223a66;
        font-size:.76rem;
        font-weight:850;
      }
      .csvb-composition-swatch{
        width:10px;
        height:10px;
        border-radius:999px;
      }
      .csvb-composition-label{
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .csvb-composition-value{
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
        color:#1a4170;
        font-weight:950;
        white-space:nowrap;
      }
      .csvb-composition-note{
        color:#48628e;
        font-size:.72rem;
        font-weight:850;
        line-height:1.3;
        margin-top:8px;
      }
      .csvb-composition-empty{
        color:#55708f;
        font-weight:850;
        font-size:.82rem;
        padding:12px 0;
      }
      @media(max-width:1280px){
        .csvb-composition-grid{ grid-template-columns:1fr; }
        .csvb-composition-chart-row{ grid-template-columns:128px 1fr; }
      }
      @media(max-width:760px){
        .csvb-composition-chart-row{ grid-template-columns:1fr; }
        .csvb-composition-donut{ margin:0 auto; }
      }
    `;

    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbStatsCompositionPanelV01");
    if (panel) return panel;

    const compare = document.getElementById("csvbStatsComparePanelV01");
    const statGrid = document.querySelector(".statGrid");
    const anchor = compare || statGrid;
    if (!anchor) return null;

    panel = document.createElement("div");
    panel.id = "csvbStatsCompositionPanelV01";
    panel.innerHTML = `
      <div class="csvb-composition-head">
        <div>
          <div class="csvb-composition-title">Composition / Share Charts</div>
          <div class="csvb-composition-sub">Pie-style share charts based on the already filtered statistics.</div>
        </div>
        <div class="csvb-composition-sub">build: ${esc(BUILD)}</div>
      </div>
      <div class="csvb-composition-grid" id="csvbStatsCompositionGridV01"></div>
      <div class="csvb-composition-note">Display-only composition charts. Existing KPI calculations, filters, drilldowns and exports are not modified.</div>
    `;

    anchor.insertAdjacentElement("afterend", panel);
    return panel;
  }

  function render() {
    injectStyle();
    ensurePanel();
    const grid = document.getElementById("csvbStatsCompositionGridV01");
    if (!grid) return;

    const typeData = typeShareData();
    const designationData = designationShareData();
    const pgnoData = pgnoAssignmentData();

    grid.innerHTML = `
      <div class="csvb-composition-card">
        <div class="csvb-composition-card-title">Observation Type Share</div>
        <div class="csvb-composition-card-sub">Negative / Largely as expected / Positive as share of total observations.</div>
        ${renderDonut(typeData, "Observation Type Share", "")}
      </div>
      <div class="csvb-composition-card">
        <div class="csvb-composition-card-title">Designation Share</div>
        <div class="csvb-composition-card-sub">Human / Process / Hardware / Photo share of total observations, where available.</div>
        ${renderDonut(designationData, "Designation Share", "", ["#295eb0", "#6d28d9", "#0f766e", "#be185d", "#b36b00"])}
      </div>
      <div class="csvb-composition-card">
        <div class="csvb-composition-card-title">PGNO Assignment Share</div>
        <div class="csvb-composition-card-sub">Assigned vs missing PGNO for Negative and Largely as Expected records.</div>
        ${renderDonut(pgnoData, "PGNO Assignment Share", "", ["#16803a", "#8a4b00"])}
      </div>
    `;
  }

  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      render();
    }, 150);
  }

  function start() {
    render();
    window.setTimeout(render, 700);
    window.setTimeout(render, 1600);

    const watchIds = ["byTypeTbody", "byCategoryTbody", "sumMissing"];
    const observer = new MutationObserver(scheduleRender);
    watchIds.forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
