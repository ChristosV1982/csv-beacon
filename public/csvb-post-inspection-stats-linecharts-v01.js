// public/csvb-post-inspection-stats-linecharts-v01.js
// C.S.V. BEACON — Post-Inspection Stats line chart helper v01.
// Adds line-chart previews above existing trend bar rows.
// Safe layer: does not change calculations, filters, drilldown registry, buttons, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-LINECHARTS-V01-20260529";
  window.CSVB_POST_STATS_LINECHARTS_BUILD = BUILD;

  const CHARTS = {
    chartNegMonthly: { label: "Negative monthly trend", color: "#c62828" },
    chartNegQuarterly: { label: "Negative quarterly trend", color: "#c62828" },
    chartNegAnnual: { label: "Negative annual trend", color: "#c62828" },

    chartLargelyMonthly: { label: "Largely monthly trend", color: "#b36b00" },
    chartLargelyQuarterly: { label: "Largely quarterly trend", color: "#b36b00" },
    chartLargelyAnnual: { label: "Largely annual trend", color: "#b36b00" },

    chartPositiveMonthly: { label: "Positive monthly trend", color: "#16803a" },
    chartPositiveQuarterly: { label: "Positive quarterly trend", color: "#16803a" },
    chartPositiveAnnual: { label: "Positive annual trend", color: "#16803a" },

    chartPgnoMissing: { label: "Missing PGNO trend", color: "#8a4b00" },
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
    if (document.getElementById("csvbPostStatsLineChartsV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsLineChartsV01Style";
    style.textContent = `
      .csvb-line-chart-v01{
        border:1px solid #d8e5f7;
        border-radius:14px;
        background:linear-gradient(180deg,#ffffff,#f8fbff);
        padding:10px 10px 8px;
        margin:6px 0 12px;
        box-shadow:0 4px 14px rgba(18,44,87,.08);
      }
      .csvb-line-chart-v01-title{
        color:#1a4170;
        font-weight:950;
        font-size:.86rem;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-bottom:4px;
      }
      .csvb-line-chart-v01-note{
        color:#48628e;
        font-weight:850;
        font-size:.76rem;
        line-height:1.25;
      }
      .csvb-line-chart-v01 svg{
        display:block;
        width:100%;
        height:auto;
        overflow:visible;
      }
      .csvb-line-chart-v01-axis{
        stroke:#cbd7ee;
        stroke-width:1;
      }
      .csvb-line-chart-v01-grid{
        stroke:#e5eefc;
        stroke-width:1;
      }
      .csvb-line-chart-v01-text{
        fill:#35507b;
        font-family:"Segoe UI",Arial,sans-serif;
        font-size:11px;
        font-weight:800;
      }
      .csvb-line-chart-v01-value{
        fill:#1a4170;
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
        font-size:11px;
        font-weight:950;
      }
      @media(max-width:760px){
        .csvb-line-chart-v01{ padding:8px; }
        .csvb-line-chart-v01-text,
        .csvb-line-chart-v01-value{ font-size:10px; }
      }
    `;
    document.head.appendChild(style);
  }

  function parseBarRows(box) {
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

  function pointFor(row, index, rows, maxY, box) {
    const plotW = box.right - box.left;
    const plotH = box.bottom - box.top;
    const x = rows.length <= 1 ? box.left + plotW / 2 : box.left + (index * plotW) / (rows.length - 1);
    const y = box.top + ((maxY - row.observations) / maxY) * plotH;
    return { x, y };
  }

  function renderSvg(rows, cfg) {
    const width = 640;
    const height = 210;
    const box = { left: 42, right: 618, top: 18, bottom: 160 };
    const maxY = Math.max(1, ...rows.map((r) => Number(r.observations || 0)));
    const points = rows.map((r, i) => pointFor(r, i, rows, maxY, box));
    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = `${box.left},${box.bottom} ${polyline} ${box.right},${box.bottom}`;

    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = box.bottom - ratio * (box.bottom - box.top);
      const value = Math.round(ratio * maxY);
      return `
        <line class="csvb-line-chart-v01-grid" x1="${box.left}" y1="${y.toFixed(1)}" x2="${box.right}" y2="${y.toFixed(1)}"></line>
        <text class="csvb-line-chart-v01-text" x="4" y="${(y + 4).toFixed(1)}">${esc(value)}</text>
      `;
    }).join("");

    const labelIndexes = new Set();
    if (rows.length <= 6) {
      rows.forEach((_, i) => labelIndexes.add(i));
    } else {
      labelIndexes.add(0);
      labelIndexes.add(Math.floor((rows.length - 1) / 2));
      labelIndexes.add(rows.length - 1);
    }

    const xLabels = rows.map((r, i) => {
      if (!labelIndexes.has(i)) return "";
      const p = points[i];
      const anchor = i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle";
      return `<text class="csvb-line-chart-v01-text" x="${p.x.toFixed(1)}" y="188" text-anchor="${anchor}">${esc(r.bucket)}</text>`;
    }).join("");

    const dots = rows.map((r, i) => {
      const p = points[i];
      const showValue = rows.length <= 8 || i === 0 || i === rows.length - 1 || r.observations === maxY;
      return `
        <g>
          <title>${esc(r.bucket)}: ${esc(r.valueText || `${r.observations} observations`)}</title>
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.2" fill="${cfg.color}" stroke="#fff" stroke-width="2"></circle>
          ${showValue ? `<text class="csvb-line-chart-v01-value" x="${p.x.toFixed(1)}" y="${Math.max(12, p.y - 9).toFixed(1)}" text-anchor="middle">${esc(r.observations)}</text>` : ""}
        </g>
      `;
    }).join("");

    return `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(cfg.label)} line chart">
        ${grid}
        <line class="csvb-line-chart-v01-axis" x1="${box.left}" y1="${box.bottom}" x2="${box.right}" y2="${box.bottom}"></line>
        <line class="csvb-line-chart-v01-axis" x1="${box.left}" y1="${box.top}" x2="${box.left}" y2="${box.bottom}"></line>
        <polygon points="${area}" fill="${cfg.color}" opacity="0.10"></polygon>
        <polyline points="${polyline}" fill="none" stroke="${cfg.color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
        ${dots}
        ${xLabels}
      </svg>
    `;
  }

  function renderChart(id, cfg) {
    const box = document.getElementById(id);
    if (!box) return;

    const rows = parseBarRows(box);
    const signature = rows.map((r) => `${r.bucket}:${r.observations}:${r.inspections}:${r.average}`).join("|");
    const existing = box.querySelector(":scope > .csvb-line-chart-v01");

    if (rows.length < 2) {
      if (existing) existing.remove();
      box.removeAttribute("data-csvb-line-chart-v01-signature");
      return;
    }

    if (existing && box.getAttribute("data-csvb-line-chart-v01-signature") === signature) return;

    const holder = existing || document.createElement("div");
    holder.className = "csvb-line-chart-v01";
    holder.innerHTML = `
      <div class="csvb-line-chart-v01-title">
        <span>${esc(cfg.label)}</span>
        <span class="csvb-line-chart-v01-note">Line = observations. Existing rows below retain drilldown.</span>
      </div>
      ${renderSvg(rows, cfg)}
    `;

    if (!existing) box.insertBefore(holder, box.firstChild);
    box.setAttribute("data-csvb-line-chart-v01-signature", signature);
  }

  let pending = false;

  function renderAll() {
    pending = false;
    injectStyle();
    Object.entries(CHARTS).forEach(([id, cfg]) => renderChart(id, cfg));
  }

  function scheduleRender() {
    if (pending) return;
    pending = true;
    window.setTimeout(renderAll, 80);
  }

  function start() {
    injectStyle();
    renderAll();
    window.setTimeout(renderAll, 500);
    window.setTimeout(renderAll, 1500);

    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
