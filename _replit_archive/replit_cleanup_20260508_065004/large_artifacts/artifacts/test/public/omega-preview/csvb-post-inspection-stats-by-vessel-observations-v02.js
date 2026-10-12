// C.S.V. BEACON - Post-Inspection Stats By Vessel Observation Bars v02
// Display-only helper. Uses the read-only Stats snapshot. No stored data is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-BY-VESSEL-OBS-BARS-V02-20260601";
  window.CSVB_POST_STATS_BY_VESSEL_OBS_BUILD = BUILD;

  const TYPES = [
    ["negative", "Negative"],
    ["largely", "Largely as expected"],
    ["positive", "Positive"],
  ];
  const DISPLAY = [["count_pct", "Count + %"], ["count", "Count only"], ["pct", "% only"]];
  const COLORS = ["#295eb0", "#6d28d9", "#0f766e", "#be185d", "#b36b00", "#8a4b00", "#c62828", "#16803a", "#0369a1", "#9333ea", "#0d9488", "#db2777", "#ca8a04", "#475569", "#7c2d12", "#1d4ed8"];

  const state = { display: "count_pct", types: new Set(["negative", "largely", "positive"]), years: new Set(), yearKey: "" };

  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const pct = (n, d) => d ? `${((Number(n || 0) / d) * 100).toFixed(1)}%` : "0.0%";
  const typeOf = (v) => {
    const s = String(v || "").toLowerCase();
    if (s.includes("negative")) return "negative";
    if (s.includes("largely")) return "largely";
    if (s.includes("positive")) return "positive";
    return s.trim();
  };
  const snap = () => window.CSVB_POST_STATS_GET_SNAPSHOT?.() || window.CSVB_POST_STATS_SNAPSHOT || null;
  const rows = () => {
    const s = snap();
    if (!s) return [];
    return Array.isArray(s.rowsIgnoreType) && s.rowsIgnoreType.length ? s.rowsIgnoreType : (Array.isArray(s.rows) ? s.rows : []);
  };

  function yearsAvailable() {
    const set = new Set();
    rows().forEach((r) => {
      const y = String(r?.inspection_date || "").slice(0, 4);
      if (/^\d{4}$/.test(y)) set.add(y);
    });
    return Array.from(set).sort();
  }

  function syncYears() {
    const ys = yearsAvailable();
    const key = ys.join("|");
    if (key !== state.yearKey) {
      const old = new Set(state.years);
      state.years = new Set(ys.filter((y) => old.has(y)));
      if (!state.years.size) ys.forEach((y) => state.years.add(y));
      state.yearKey = key;
    }
    return ys;
  }

  function vesselData() {
    const map = new Map();
    rows().forEach((r) => {
      const t = typeOf(r?.observation_type);
      if (!state.types.has(t)) return;
      const y = String(r?.inspection_date || "").slice(0, 4);
      if (state.years.size && !state.years.has(y)) return;
      const vessel = String(r?.vessel_name || "-").trim() || "-";
      if (!map.has(vessel)) map.set(vessel, { vessel, value: 0 });
      map.get(vessel).value += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value || a.vessel.localeCompare(b.vessel));
  }

  function displayValue(item, total) {
    if (state.display === "count") return String(item.value);
    if (state.display === "pct") return pct(item.value, total);
    return `${item.value} - ${pct(item.value, total)}`;
  }

  function injectStyle() {
    if (document.getElementById("csvbByVesselBarsV02Style")) return;
    const style = document.createElement("style");
    style.id = "csvbByVesselBarsV02Style";
    style.textContent = `
      #csvbStatsByVesselObsPanelV01{box-sizing:border-box;width:100%;margin:12px 0 0;padding:10px;border:1px solid #d5deef;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 4px 18px rgba(18,44,87,.12);color:#1a4170}
      .csvb-by-vessel-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.csvb-by-vessel-title{font-size:1.08rem;font-weight:950}.csvb-by-vessel-sub{color:#48628e;font-size:.86rem;font-weight:850;line-height:1.35}
      .csvb-by-vessel-card{border:1px solid #d8e5f7;border-radius:14px;background:#fff;padding:10px}.csvb-by-vessel-controls{display:grid;grid-template-columns:minmax(180px,260px) 1fr 1fr;gap:10px;align-items:start;margin-bottom:10px}
      .csvb-by-vessel-field label{display:block;margin:0 0 3px;font-size:.86rem;font-weight:950}.csvb-by-vessel-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;background:#fff;color:#1a4170;font-size:.96rem;font-weight:850;min-height:40px}
      .csvb-by-vessel-type-box,.csvb-by-vessel-year-box{border:1px solid #d5deef;border-radius:12px;padding:7px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px 10px;min-height:42px}.csvb-by-vessel-check{display:flex;align-items:center;gap:6px;font-weight:850;font-size:.9rem}.csvb-by-vessel-check input{width:auto;transform:scale(1.04)}
      .csvb-by-vessel-bar-wrap{overflow-x:auto;border:1px solid #e0eaf8;border-radius:12px;background:linear-gradient(180deg,#fff,#f8fbff);padding:8px 4px 4px}.csvb-by-vessel-bars{display:flex;align-items:flex-end;gap:14px;min-height:245px;min-width:max-content;padding:8px 6px 0}
      .csvb-by-vessel-bar-item{width:92px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px}.csvb-by-vessel-bar-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;font-size:.78rem;text-align:center;min-height:28px;line-height:1.15;color:#1a4170}.csvb-by-vessel-bar-shell{height:178px;width:34px;display:flex;align-items:flex-end;justify-content:center;border-left:1px solid #d5e2f3;border-bottom:1px solid #d5e2f3;background:repeating-linear-gradient(to top,#fff 0,#fff 34px,#edf4ff 35px)}.csvb-by-vessel-bar{width:28px;border-radius:8px 8px 0 0;box-shadow:0 3px 8px rgba(18,44,87,.15)}.csvb-by-vessel-bar-label{width:92px;min-height:40px;font-size:.74rem;font-weight:950;text-align:center;line-height:1.12;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;color:#223a66}
      .csvb-by-vessel-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px 14px;margin-top:10px}.csvb-by-vessel-legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:7px;align-items:center;font-size:.9rem;font-weight:850}.csvb-by-vessel-swatch{width:11px;height:11px;border-radius:999px}.csvb-by-vessel-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.csvb-by-vessel-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;white-space:nowrap;color:#1a4170}.csvb-by-vessel-note{color:#48628e;font-size:.84rem;font-weight:850;line-height:1.35;margin-top:8px}.csvb-by-vessel-empty{color:#55708f;font-weight:850;font-size:.9rem;padding:12px 0}
      @media(max-width:1100px){.csvb-by-vessel-controls{grid-template-columns:1fr}.csvb-by-vessel-bars{gap:10px}.csvb-by-vessel-bar-item{width:84px}.csvb-by-vessel-bar-label{width:84px}}
    `;
    document.head.appendChild(style);
  }

  function typeChecks() {
    return TYPES.map(([key, label]) => `<label class="csvb-by-vessel-check"><input type="checkbox" data-csvb-by-vessel-type="1" value="${esc(key)}" ${state.types.has(key) ? "checked" : ""}/><span>${esc(label)}</span></label>`).join("");
  }

  function yearChecks() {
    const ys = syncYears();
    if (!ys.length) return `<span class="csvb-by-vessel-empty">No years available.</span>`;
    return ys.map((y) => `<label class="csvb-by-vessel-check"><input type="checkbox" data-csvb-by-vessel-year="1" value="${esc(y)}" ${state.years.has(y) ? "checked" : ""}/><span>${esc(y)}</span></label>`).join("");
  }

  function barsHtml(data) {
    const total = data.reduce((s, x) => s + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-by-vessel-empty">No vessel observation data for the selected criteria.</div>`;
    const max = Math.max(1, ...data.map((x) => x.value));
    const bars = data.map((item, idx) => {
      const color = COLORS[idx % COLORS.length];
      const h = Math.max(8, Math.round((item.value / max) * 170));
      return `<div class="csvb-by-vessel-bar-item" title="${esc(item.vessel)}: ${esc(displayValue(item,total))}"><div class="csvb-by-vessel-bar-value">${esc(displayValue(item,total))}</div><div class="csvb-by-vessel-bar-shell"><div class="csvb-by-vessel-bar" style="height:${h}px;background:${esc(color)}"></div></div><div class="csvb-by-vessel-bar-label" title="${esc(item.vessel)}">${esc(item.vessel)}</div></div>`;
    }).join("");
    const legend = data.map((item, idx) => `<div class="csvb-by-vessel-legend-row"><span class="csvb-by-vessel-swatch" style="background:${esc(COLORS[idx % COLORS.length])}"></span><span class="csvb-by-vessel-label" title="${esc(item.vessel)}">${esc(item.vessel)}</span><span class="csvb-by-vessel-value">${esc(displayValue(item,total))}</span></div>`).join("");
    return `<div class="csvb-by-vessel-bar-wrap"><div class="csvb-by-vessel-bars">${bars}</div></div><div class="csvb-by-vessel-legend">${legend}</div><div class="csvb-by-vessel-note">Total selected observations: ${esc(total)}. Largest share: ${esc(data[0].vessel)} (${esc(pct(data[0].value,total))}).</div>`;
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbStatsByVesselObsPanelV01");
    if (panel) return panel;
    const anchor = document.getElementById("csvbStatsChapterSharePanelV01") || document.getElementById("csvbStatsCompositionPanelV01") || document.getElementById("csvbStatsComparePanelV01") || document.querySelector(".statGrid");
    if (!anchor) return null;
    panel = document.createElement("div");
    panel.id = "csvbStatsByVesselObsPanelV01";
    panel.innerHTML = `<div class="csvb-by-vessel-head"><div><div class="csvb-by-vessel-title">By Vessel - Observation Bars</div><div class="csvb-by-vessel-sub">Vertical bar view by vessel with independent year and observation type criteria.</div></div><div class="csvb-by-vessel-sub">build: ${esc(BUILD)}</div></div><div class="csvb-by-vessel-card"><div class="csvb-by-vessel-controls"><div class="csvb-by-vessel-field"><label>Display</label><select id="csvbByVesselDisplayV01">${DISPLAY.map(([v,l]) => `<option value="${esc(v)}" ${state.display === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div><div class="csvb-by-vessel-field"><label>Observation types included</label></div><div class="csvb-by-vessel-type-box" id="csvbByVesselTypesV01">${typeChecks()}</div></div><div><div class="csvb-by-vessel-field"><label>Years included</label></div><div class="csvb-by-vessel-year-box" id="csvbByVesselYearsV01">${yearChecks()}</div></div></div><div id="csvbByVesselObsChartV01"></div><div class="csvb-by-vessel-note">Display-only helper. It uses the read-only Stats snapshot and does not modify stored data.</div></div>`;
    anchor.insertAdjacentElement("afterend", panel);
    panel.addEventListener("change", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === "csvbByVesselDisplayV01") state.display = String(t.value || "count_pct");
      if (t.matches("input[data-csvb-by-vessel-type='1']")) {
        if (t.checked) state.types.add(String(t.value || "")); else state.types.delete(String(t.value || ""));
        if (!state.types.size) state.types.add(String(t.value || "negative"));
      }
      if (t.matches("input[data-csvb-by-vessel-year='1']")) {
        if (t.checked) state.years.add(String(t.value || "")); else state.years.delete(String(t.value || ""));
        if (!state.years.size) state.years.add(String(t.value || yearsAvailable()[0] || ""));
      }
      render();
    });
    return panel;
  }

  function render() {
    injectStyle();
    ensurePanel();
    const yearBox = document.getElementById("csvbByVesselYearsV01");
    if (yearBox) yearBox.innerHTML = yearChecks();
    const box = document.getElementById("csvbByVesselObsChartV01");
    if (!box) return;
    if (!snap()) { box.innerHTML = `<div class="csvb-by-vessel-empty">Waiting for Stats snapshot...</div>`; return; }
    box.innerHTML = barsHtml(vesselData());
  }

  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; state.yearKey = ""; render(); }, 130);
  }

  function start() {
    render();
    window.addEventListener("csvb:post-stats-snapshot", scheduleRender);
    window.setTimeout(render, 700);
    window.setTimeout(render, 1600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
