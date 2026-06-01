// public/csvb-post-inspection-stats-by-vessel-observations-v01.js
// C.S.V. BEACON — Post-Inspection Stats By Vessel Observation Share v01.
// Display-only helper based on the existing By Vessel table.
// Does not change calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-BY-VESSEL-OBS-V01-20260531";
  window.CSVB_POST_STATS_BY_VESSEL_OBS_BUILD = BUILD;

  const TYPES = [
    { key: "negative", label: "Negative", color: "#c62828" },
    { key: "largely", label: "Largely as expected", color: "#b36b00" },
    { key: "positive", label: "Positive", color: "#16803a" },
  ];

  const DISPLAY_MODES = [
    { value: "count_pct", label: "Count + %" },
    { value: "count", label: "Count only" },
    { value: "pct", label: "% only" },
  ];

  const PALETTE = [
    "#295eb0", "#6d28d9", "#0f766e", "#be185d", "#b36b00", "#8a4b00",
    "#c62828", "#16803a", "#0369a1", "#9333ea", "#0d9488", "#db2777",
    "#ca8a04", "#475569", "#7c2d12", "#1d4ed8", "#15803d", "#a21caf"
  ];

  const state = {
    display: "count_pct",
    types: new Set(["negative", "largely", "positive"]),
  };

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

  function displayValue(item, total) {
    if (state.display === "count") return String(item.value);
    if (state.display === "pct") return pct(item.value, total);
    return `${item.value} · ${pct(item.value, total)}`;
  }

  function safeRows(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr"));
  }

  function vesselRows() {
    const out = [];
    for (const tr of safeRows("byVesselTbody")) {
      const cells = Array.from(tr.children || []);
      if (cells.length < 5) continue;

      const vessel = String(cells[0]?.textContent || "").trim();
      if (!vessel || /^no\s+/i.test(vessel)) continue;

      const negative = num(cells[2]?.textContent || "");
      const largely = num(cells[3]?.textContent || "");
      const positive = num(cells[4]?.textContent || "");
      const value = (state.types.has("negative") ? negative : 0)
        + (state.types.has("largely") ? largely : 0)
        + (state.types.has("positive") ? positive : 0);

      if (!value) continue;

      out.push({ vessel, value, negative, largely, positive });
    }

    return out.sort((a, b) => b.value - a.value || a.vessel.localeCompare(b.vessel));
  }

  function renderDonut(data) {
    const total = data.reduce((sum, x) => sum + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-by-vessel-empty">No vessel observation data for the selected criteria.</div>`;

    let start = 0;
    const segments = data.map((item, idx) => {
      const degrees = (Number(item.value || 0) / total) * 360;
      const end = start + degrees;
      const segment = `${PALETTE[idx % PALETTE.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      start = end;
      return segment;
    }).join(", ");

    const legend = data.map((item, idx) => `
      <div class="csvb-by-vessel-legend-row">
        <span class="csvb-by-vessel-swatch" style="background:${esc(PALETTE[idx % PALETTE.length])}"></span>
        <span class="csvb-by-vessel-label" title="${esc(item.vessel)}">${esc(item.vessel)}</span>
        <span class="csvb-by-vessel-value">${esc(displayValue(item, total))}</span>
      </div>
    `).join("");

    const largest = data[0];

    return `
      <div class="csvb-by-vessel-chart-row">
        <div class="csvb-by-vessel-donut" style="background:conic-gradient(${segments})">
          <div class="csvb-by-vessel-hole">
            <div class="csvb-by-vessel-total">${esc(total)}</div>
            <div class="csvb-by-vessel-total-label">obs.</div>
          </div>
        </div>
        <div class="csvb-by-vessel-legend">${legend}</div>
      </div>
      <div class="csvb-by-vessel-note">Largest share: ${esc(largest.vessel)} (${esc(pct(largest.value, total))}).</div>
    `;
  }

  function injectStyle() {
    if (document.getElementById("csvbPostStatsByVesselObsV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsByVesselObsV01Style";
    style.textContent = `
      #csvbStatsByVesselObsPanelV01{box-sizing:border-box;width:100%;margin:12px 0 0;padding:10px;border:1px solid #d5deef;border-radius:16px;background:linear-gradient(180deg,#ffffff,#f8fbff);box-shadow:0 4px 18px rgba(18,44,87,.12);color:#1a4170;}
      .csvb-by-vessel-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
      .csvb-by-vessel-title{color:#1a4170;font-size:1.08rem;font-weight:950;}
      .csvb-by-vessel-sub{color:#48628e;font-size:.86rem;font-weight:850;line-height:1.35;margin-top:2px;}
      .csvb-by-vessel-card{border:1px solid #d8e5f7;border-radius:14px;background:#fff;padding:10px;}
      .csvb-by-vessel-controls{display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:10px;align-items:start;margin-bottom:10px;}
      .csvb-by-vessel-field label{display:block;margin:0 0 3px;color:#1a4170;font-size:.86rem;font-weight:950;}
      .csvb-by-vessel-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;color:#1a4170;background:#fff;font-size:.96rem;font-weight:850;min-height:40px;}
      .csvb-by-vessel-type-box{border:1px solid #d5deef;border-radius:12px;padding:7px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 10px;}
      .csvb-by-vessel-check{display:flex;align-items:center;gap:6px;color:#223a66;font-weight:850;font-size:.9rem;line-height:1.15;}
      .csvb-by-vessel-check input{width:auto;transform:scale(1.04);}
      .csvb-by-vessel-chart-row{display:grid;grid-template-columns:190px 1fr;gap:14px;align-items:center;}
      .csvb-by-vessel-donut{width:178px;height:178px;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
      .csvb-by-vessel-hole{width:98px;height:98px;border-radius:999px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #d8e5f7;}
      .csvb-by-vessel-total{color:#1a4170;font-weight:950;font-size:1.36rem;line-height:1;}.csvb-by-vessel-total-label{color:#48628e;font-weight:850;font-size:.76rem;}
      .csvb-by-vessel-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px 14px;min-width:0;}
      .csvb-by-vessel-legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:7px;align-items:center;color:#223a66;font-size:.9rem;font-weight:850;}
      .csvb-by-vessel-swatch{width:11px;height:11px;border-radius:999px;}.csvb-by-vessel-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.csvb-by-vessel-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;color:#1a4170;font-weight:950;white-space:nowrap;}
      .csvb-by-vessel-note{color:#48628e;font-size:.84rem;font-weight:850;line-height:1.35;margin-top:8px;}.csvb-by-vessel-empty{color:#55708f;font-weight:850;font-size:.9rem;padding:12px 0;}
      @media(max-width:900px){.csvb-by-vessel-controls{grid-template-columns:1fr;}.csvb-by-vessel-chart-row{grid-template-columns:1fr;}.csvb-by-vessel-donut{margin:0 auto;}.csvb-by-vessel-legend{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(style);
  }

  function renderTypeChecks() {
    return TYPES.map((type) => `
      <label class="csvb-by-vessel-check">
        <input type="checkbox" data-csvb-by-vessel-type="1" value="${esc(type.key)}" ${state.types.has(type.key) ? "checked" : ""} />
        <span>${esc(type.label)}</span>
      </label>
    `).join("");
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbStatsByVesselObsPanelV01");
    if (panel) return panel;

    const chapter = document.getElementById("csvbStatsChapterSharePanelV01");
    const composition = document.getElementById("csvbStatsCompositionPanelV01");
    const compare = document.getElementById("csvbStatsComparePanelV01");
    const statGrid = document.querySelector(".statGrid");
    const anchor = chapter || composition || compare || statGrid;
    if (!anchor) return null;

    panel = document.createElement("div");
    panel.id = "csvbStatsByVesselObsPanelV01";
    panel.innerHTML = `
      <div class="csvb-by-vessel-head">
        <div>
          <div class="csvb-by-vessel-title">By Vessel — Observation Share</div>
          <div class="csvb-by-vessel-sub">Pie-style view of observations per vessel based on the current By Vessel table.</div>
        </div>
        <div class="csvb-by-vessel-sub">build: ${esc(BUILD)}</div>
      </div>
      <div class="csvb-by-vessel-card">
        <div class="csvb-by-vessel-controls">
          <div class="csvb-by-vessel-field">
            <label for="csvbByVesselDisplayV01">Display</label>
            <select id="csvbByVesselDisplayV01">
              ${DISPLAY_MODES.map((m) => `<option value="${esc(m.value)}" ${state.display === m.value ? "selected" : ""}>${esc(m.label)}</option>`).join("")}
            </select>
          </div>
          <div>
            <div class="csvb-by-vessel-field"><label>Observation types included</label></div>
            <div class="csvb-by-vessel-type-box" id="csvbByVesselTypesV01">${renderTypeChecks()}</div>
          </div>
        </div>
        <div id="csvbByVesselObsChartV01"></div>
        <div class="csvb-by-vessel-note">Display-only helper. It reads the already-rendered By Vessel table and applies independent observation type criteria here.</div>
      </div>
    `;

    anchor.insertAdjacentElement("afterend", panel);

    panel.addEventListener("change", (e) => {
      const target = e.target;
      if (!target) return;

      if (target.id === "csvbByVesselDisplayV01") {
        state.display = String(target.value || "count_pct");
        render();
        return;
      }

      if (target.matches("input[data-csvb-by-vessel-type='1']")) {
        const value = String(target.value || "");
        if (target.checked) state.types.add(value);
        else state.types.delete(value);
        if (!state.types.size) state.types.add(value || "negative");
        render();
      }
    });

    return panel;
  }

  function render() {
    injectStyle();
    ensurePanel();
    const box = document.getElementById("csvbByVesselObsChartV01");
    if (!box) return;
    box.innerHTML = renderDonut(vesselRows());
  }

  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; render(); }, 130);
  }

  function start() {
    render();
    window.setTimeout(render, 700);
    window.setTimeout(render, 1600);

    const tbody = document.getElementById("byVesselTbody");
    if (tbody) new MutationObserver(scheduleRender).observe(tbody, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
