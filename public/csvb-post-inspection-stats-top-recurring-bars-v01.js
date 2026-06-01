// C.S.V. BEACON - Post-Inspection Stats Top Recurring Questions Bars v01
// Display-only helper. Uses the read-only Stats snapshot. No stored data is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-TOP-RECURRING-BARS-V01-20260601";
  window.CSVB_POST_STATS_TOP_RECURRING_BARS_BUILD = BUILD;

  const TYPES = [["negative", "Negative"], ["largely", "Largely as expected"], ["positive", "Positive"]];
  const DISPLAY = [["count_pct", "Count + %"], ["count", "Count only"], ["pct", "% only"]];
  const LIMITS = [["10", "Top 10"], ["15", "Top 15"], ["20", "Top 20"], ["30", "Top 30"]];
  const THRESHOLDS = [["1", "1+ obs"], ["2", "2+ obs"], ["3", "3+ obs"], ["5", "5+ obs"]];
  const COLORS = ["#c62828", "#b36b00", "#16803a", "#295eb0", "#6d28d9", "#0f766e", "#be185d", "#8a4b00", "#0369a1", "#9333ea", "#ca8a04", "#475569"];

  const state = { display: "count_pct", limit: 15, threshold: 2, types: new Set(["negative", "largely", "positive"]), years: new Set(), yearKey: "" };

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

  function filteredRows() {
    return rows().filter((r) => {
      const t = typeOf(r?.observation_type);
      if (!state.types.has(t)) return false;
      const y = String(r?.inspection_date || "").slice(0, 4);
      if (state.years.size && !state.years.has(y)) return false;
      return true;
    });
  }

  function recurringData() {
    const map = new Map();
    filteredRows().forEach((r) => {
      const qno = String(r?.question_no || r?.question_meta?.qno || "").trim();
      if (!qno) return;
      if (!map.has(qno)) {
        map.set(qno, { qno, value: 0, chapter: String(r?.question_meta?.chapter || qno.split(".")[0] || "").trim(), short: String(r?.question_meta?.short_text || "").trim(), section: String(r?.question_meta?.section || "").trim() });
      }
      map.get(qno).value += 1;
    });
    return Array.from(map.values()).filter((x) => x.value >= state.threshold).sort((a, b) => b.value - a.value || a.qno.localeCompare(b.qno)).slice(0, state.limit);
  }

  function displayValue(item, total) {
    if (state.display === "count") return String(item.value);
    if (state.display === "pct") return pct(item.value, total);
    return `${item.value} - ${pct(item.value, total)}`;
  }

  function barsHtml(data) {
    const total = data.reduce((s, x) => s + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-recurring-empty">No recurring question data for the selected criteria.</div>`;
    const max = Math.max(1, ...data.map((x) => x.value));
    const bars = data.map((item, idx) => {
      const color = COLORS[idx % COLORS.length];
      const h = Math.max(8, Math.round((item.value / max) * 170));
      const title = `${item.qno}${item.short ? " - " + item.short : ""}`;
      return `<div class="csvb-recurring-bar-item" title="${esc(title)}: ${esc(displayValue(item,total))}"><div class="csvb-recurring-bar-value">${esc(displayValue(item,total))}</div><div class="csvb-recurring-bar-shell"><div class="csvb-recurring-bar" style="height:${h}px;background:${esc(color)}"></div></div><div class="csvb-recurring-bar-label" title="${esc(title)}">${esc(item.qno)}</div></div>`;
    }).join("");
    const legend = data.map((item, idx) => {
      const label = `${item.qno}${item.short ? " - " + item.short : ""}`;
      return `<div class="csvb-recurring-legend-row"><span class="csvb-recurring-swatch" style="background:${esc(COLORS[idx % COLORS.length])}"></span><span class="csvb-recurring-label" title="${esc(label)}">${esc(label)}</span><span class="csvb-recurring-value">${esc(displayValue(item,total))}</span></div>`;
    }).join("");
    return `<div class="csvb-recurring-bar-wrap"><div class="csvb-recurring-bars">${bars}</div></div><div class="csvb-recurring-legend">${legend}</div><div class="csvb-recurring-note">Total observations in displayed recurring questions: ${esc(total)}. Highest recurring question: ${esc(data[0].qno)} (${esc(data[0].value)} obs).</div>`;
  }

  function injectStyle() {
    if (document.getElementById("csvbTopRecurringBarsV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbTopRecurringBarsV01Style";
    style.textContent = `
      #csvbStatsTopRecurringBarsPanelV01{box-sizing:border-box;width:100%;margin:12px 0 0;padding:10px;border:1px solid #d5deef;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 4px 18px rgba(18,44,87,.12);color:#1a4170}
      .csvb-recurring-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.csvb-recurring-title{font-size:1.08rem;font-weight:950}.csvb-recurring-sub{color:#48628e;font-size:.86rem;font-weight:850;line-height:1.35}
      .csvb-recurring-card{border:1px solid #d8e5f7;border-radius:14px;background:#fff;padding:10px}.csvb-recurring-controls{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:start;margin-bottom:10px}
      .csvb-recurring-field label{display:block;margin:0 0 3px;font-size:.86rem;font-weight:950}.csvb-recurring-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;background:#fff;color:#1a4170;font-size:.96rem;font-weight:850;min-height:40px}
      .csvb-recurring-type-box,.csvb-recurring-year-box{border:1px solid #d5deef;border-radius:12px;padding:7px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:6px 10px;min-height:42px}.csvb-recurring-check{display:flex;align-items:center;gap:6px;font-weight:850;font-size:.9rem}.csvb-recurring-check input{width:auto;transform:scale(1.04)}
      .csvb-recurring-bar-wrap{overflow-x:auto;border:1px solid #e0eaf8;border-radius:12px;background:linear-gradient(180deg,#fff,#f8fbff);padding:8px 4px 4px}.csvb-recurring-bars{display:flex;align-items:flex-end;gap:14px;min-height:245px;min-width:max-content;padding:8px 6px 0}.csvb-recurring-bar-item{width:84px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px}.csvb-recurring-bar-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;font-size:.78rem;text-align:center;min-height:28px;line-height:1.15;color:#1a4170}.csvb-recurring-bar-shell{height:178px;width:34px;display:flex;align-items:flex-end;justify-content:center;border-left:1px solid #d5e2f3;border-bottom:1px solid #d5e2f3;background:repeating-linear-gradient(to top,#fff 0,#fff 34px,#edf4ff 35px)}.csvb-recurring-bar{width:28px;border-radius:8px 8px 0 0;box-shadow:0 3px 8px rgba(18,44,87,.15)}.csvb-recurring-bar-label{width:84px;min-height:32px;font-size:.8rem;font-weight:950;text-align:center;color:#223a66}
      .csvb-recurring-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px 14px;margin-top:10px}.csvb-recurring-legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:7px;align-items:center;font-size:.9rem;font-weight:850}.csvb-recurring-swatch{width:11px;height:11px;border-radius:999px}.csvb-recurring-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.csvb-recurring-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;white-space:nowrap;color:#1a4170}.csvb-recurring-note{color:#48628e;font-size:.84rem;font-weight:850;line-height:1.35;margin-top:8px}.csvb-recurring-empty{color:#55708f;font-weight:850;font-size:.9rem;padding:12px 0}
      @media(max-width:1100px){.csvb-recurring-controls{grid-template-columns:1fr}.csvb-recurring-bars{gap:10px}.csvb-recurring-bar-item{width:78px}.csvb-recurring-bar-label{width:78px}}
    `;
    document.head.appendChild(style);
  }

  function typeChecks() { return TYPES.map(([key, label]) => `<label class="csvb-recurring-check"><input type="checkbox" data-csvb-recurring-type="1" value="${esc(key)}" ${state.types.has(key) ? "checked" : ""}/><span>${esc(label)}</span></label>`).join(""); }
  function yearChecks() { const ys = syncYears(); return ys.length ? ys.map((y) => `<label class="csvb-recurring-check"><input type="checkbox" data-csvb-recurring-year="1" value="${esc(y)}" ${state.years.has(y) ? "checked" : ""}/><span>${esc(y)}</span></label>`).join("") : `<span class="csvb-recurring-empty">No years available.</span>`; }

  function ensurePanel() {
    let panel = document.getElementById("csvbStatsTopRecurringBarsPanelV01");
    if (panel) return panel;
    const tbody = document.getElementById("topQnsTbody");
    const anchor = tbody?.closest(".panel") || document.getElementById("csvbStatsByVesselObsPanelV01") || document.querySelector(".statGrid");
    if (!anchor) return null;
    panel = document.createElement("div");
    panel.id = "csvbStatsTopRecurringBarsPanelV01";
    panel.innerHTML = `<div class="csvb-recurring-head"><div><div class="csvb-recurring-title">Top Recurring Questions - Observation Bars</div><div class="csvb-recurring-sub">Vertical bar view of recurring questions using independent year, threshold and observation type criteria.</div></div><div class="csvb-recurring-sub">build: ${esc(BUILD)}</div></div><div class="csvb-recurring-card"><div class="csvb-recurring-controls"><div class="csvb-recurring-field"><label>Display</label><select id="csvbRecurringDisplayV01">${DISPLAY.map(([v,l]) => `<option value="${esc(v)}" ${state.display === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div class="csvb-recurring-field"><label>Top limit</label><select id="csvbRecurringLimitV01">${LIMITS.map(([v,l]) => `<option value="${esc(v)}" ${state.limit === Number(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div class="csvb-recurring-field"><label>Min recurrence</label><select id="csvbRecurringThresholdV01">${THRESHOLDS.map(([v,l]) => `<option value="${esc(v)}" ${state.threshold === Number(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div><div class="csvb-recurring-field"><label>Years included</label></div><div class="csvb-recurring-year-box" id="csvbRecurringYearsV01">${yearChecks()}</div></div></div><div class="csvb-recurring-type-box" id="csvbRecurringTypesV01">${typeChecks()}</div><div id="csvbRecurringBarsChartV01"></div><div class="csvb-recurring-note">Display-only helper. It uses the read-only Stats snapshot and does not modify stored data.</div></div>`;
    anchor.insertAdjacentElement("afterend", panel);
    panel.addEventListener("change", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === "csvbRecurringDisplayV01") state.display = String(t.value || "count_pct");
      if (t.id === "csvbRecurringLimitV01") state.limit = Number(t.value || 15);
      if (t.id === "csvbRecurringThresholdV01") state.threshold = Number(t.value || 2);
      if (t.matches("input[data-csvb-recurring-type='1']")) { if (t.checked) state.types.add(String(t.value || "")); else state.types.delete(String(t.value || "")); if (!state.types.size) state.types.add(String(t.value || "negative")); }
      if (t.matches("input[data-csvb-recurring-year='1']")) { if (t.checked) state.years.add(String(t.value || "")); else state.years.delete(String(t.value || "")); if (!state.years.size) state.years.add(String(t.value || yearsAvailable()[0] || "")); }
      render();
    });
    return panel;
  }

  function render() {
    injectStyle();
    ensurePanel();
    const yearBox = document.getElementById("csvbRecurringYearsV01");
    if (yearBox) yearBox.innerHTML = yearChecks();
    const box = document.getElementById("csvbRecurringBarsChartV01");
    if (!box) return;
    if (!snap()) { box.innerHTML = `<div class="csvb-recurring-empty">Waiting for Stats snapshot...</div>`; return; }
    box.innerHTML = barsHtml(recurringData());
  }

  let pending = false;
  function scheduleRender() { if (pending) return; pending = true; window.setTimeout(() => { pending = false; state.yearKey = ""; render(); }, 130); }
  function start() { render(); window.addEventListener("csvb:post-stats-snapshot", scheduleRender); window.setTimeout(render, 700); window.setTimeout(render, 1600); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
