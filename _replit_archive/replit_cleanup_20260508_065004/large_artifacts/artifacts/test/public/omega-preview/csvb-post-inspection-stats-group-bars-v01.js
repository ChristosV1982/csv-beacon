// C.S.V. BEACON - Post-Inspection Stats Group Bars v01
// Display-only helper. Adds bar charts below existing group tables.
// No stored data, calculations, filters, drilldowns, exports, auth, Supabase, device or offline logic is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-GROUP-BARS-V01-20260601";
  window.CSVB_POST_STATS_GROUP_BARS_BUILD = BUILD;

  const TYPES = [["negative", "Negative"], ["largely", "Largely as expected"], ["positive", "Positive"]];
  const DISPLAY = [["count_pct", "Count + %"], ["count", "Count only"], ["pct", "% only"]];
  const LIMITS = [["10", "Top 10"], ["15", "Top 15"], ["20", "Top 20"], ["30", "Top 30"], ["999", "All"]];
  const COLORS = ["#295eb0", "#6d28d9", "#0f766e", "#be185d", "#b36b00", "#8a4b00", "#c62828", "#16803a", "#0369a1", "#9333ea", "#0d9488", "#db2777", "#ca8a04", "#475569"];

  const SECTIONS = [
    { id: "category", title: "By Category / Designation", tbody: "byCategoryTbody", label: "Category", cols: { negative: 1, largely: 2, positive: 3 }, panel: "csvbStatsByCategoryBarsPanelV01" },
    { id: "ocimf", title: "By OCIMF / Inspecting Company", tbody: "byOcimfTbody", label: "Company", cols: { negative: 2, largely: 3, positive: 4 }, panel: "csvbStatsByOcimfBarsPanelV01" },
    { id: "inspector", title: "By Inspector / Auditor", tbody: "byInspectorTbody", label: "Inspector / Auditor", cols: { negative: 2, largely: 3, positive: 4 }, panel: "csvbStatsByInspectorBarsPanelV01" },
    { id: "inspectorCompany", title: "By Inspector / Auditor Company", tbody: "byInspectorCompanyTbody", label: "Inspector / Auditor Company", cols: { negative: 2, largely: 3, positive: 4 }, panel: "csvbStatsByInspectorCompanyBarsPanelV01" }
  ];

  const state = Object.fromEntries(SECTIONS.map((s) => [s.id, { display: "count_pct", limit: 15, types: new Set(["negative", "largely", "positive"]) }]));

  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const num = (v) => { const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : 0; };
  const pct = (n, d) => d ? `${((Number(n || 0) / d) * 100).toFixed(1)}%` : "0.0%";

  function displayValue(item, total, st) {
    if (st.display === "count") return String(item.value);
    if (st.display === "pct") return pct(item.value, total);
    return `${item.value} - ${pct(item.value, total)}`;
  }

  function injectStyle() {
    if (document.getElementById("csvbGroupBarsV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbGroupBarsV01Style";
    style.textContent = `
      .csvb-group-bars-panel{box-sizing:border-box;width:100%;margin:12px 0 0;padding:10px;border:1px solid #d5deef;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 3px 14px rgba(18,44,87,.10);color:#1a4170}
      .csvb-group-bars-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.csvb-group-bars-title{font-size:1.02rem;font-weight:950}.csvb-group-bars-sub{color:#48628e;font-size:.84rem;font-weight:850;line-height:1.35}
      .csvb-group-bars-controls{display:grid;grid-template-columns:minmax(180px,260px) minmax(150px,220px) 1fr;gap:10px;align-items:start;margin-bottom:10px}.csvb-group-bars-field label{display:block;margin:0 0 3px;font-size:.84rem;font-weight:950}.csvb-group-bars-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;background:#fff;color:#1a4170;font-size:.94rem;font-weight:850;min-height:40px}
      .csvb-group-bars-type-box{border:1px solid #d5deef;border-radius:12px;padding:7px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 10px}.csvb-group-bars-check{display:flex;align-items:center;gap:6px;font-weight:850;font-size:.88rem}.csvb-group-bars-check input{width:auto;transform:scale(1.04)}
      .csvb-group-bars-wrap{overflow-x:auto;border:1px solid #e0eaf8;border-radius:12px;background:linear-gradient(180deg,#fff,#f8fbff);padding:8px 4px 4px}.csvb-group-bars{display:flex;align-items:flex-end;gap:14px;min-height:245px;min-width:max-content;padding:8px 6px 0}.csvb-group-bar-item{width:96px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px}.csvb-group-bar-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;font-size:.78rem;text-align:center;min-height:28px;line-height:1.15;color:#1a4170}.csvb-group-bar-shell{height:178px;width:34px;display:flex;align-items:flex-end;justify-content:center;border-left:1px solid #d5e2f3;border-bottom:1px solid #d5e2f3;background:repeating-linear-gradient(to top,#fff 0,#fff 34px,#edf4ff 35px)}.csvb-group-bar{width:28px;border-radius:8px 8px 0 0;box-shadow:0 3px 8px rgba(18,44,87,.15)}.csvb-group-bar-label{width:96px;min-height:42px;font-size:.72rem;font-weight:950;text-align:center;line-height:1.12;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;color:#223a66}
      .csvb-group-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:6px 14px;margin-top:10px}.csvb-group-legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:7px;align-items:center;font-size:.88rem;font-weight:850}.csvb-group-swatch{width:11px;height:11px;border-radius:999px}.csvb-group-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.csvb-group-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;white-space:nowrap;color:#1a4170}.csvb-group-note{color:#48628e;font-size:.82rem;font-weight:850;line-height:1.35;margin-top:8px}.csvb-group-empty{color:#55708f;font-weight:850;font-size:.9rem;padding:12px 0}
      @media(max-width:1100px){.csvb-group-bars-controls{grid-template-columns:1fr}.csvb-group-bars{gap:10px}.csvb-group-bar-item{width:84px}.csvb-group-bar-label{width:84px}}
    `;
    document.head.appendChild(style);
  }

  function rowsFor(sec) {
    const tbody = document.getElementById(sec.tbody);
    if (!tbody) return [];
    const st = state[sec.id];
    return Array.from(tbody.querySelectorAll("tr")).map((tr) => {
      const cells = Array.from(tr.children || []);
      const label = String(cells[0]?.textContent || "").trim();
      if (!label || /^no\s+/i.test(label)) return null;
      const negative = num(cells[sec.cols.negative]?.textContent || "");
      const largely = num(cells[sec.cols.largely]?.textContent || "");
      const positive = num(cells[sec.cols.positive]?.textContent || "");
      const value = (st.types.has("negative") ? negative : 0) + (st.types.has("largely") ? largely : 0) + (st.types.has("positive") ? positive : 0);
      return { label, value, negative, largely, positive };
    }).filter(Boolean).filter((x) => x.value > 0).sort((a,b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, Number(st.limit || 15));
  }

  function typeChecks(sec) {
    const st = state[sec.id];
    return TYPES.map(([key, label]) => `<label class="csvb-group-bars-check"><input type="checkbox" data-csvb-group-type="1" data-section="${esc(sec.id)}" value="${esc(key)}" ${st.types.has(key) ? "checked" : ""}/><span>${esc(label)}</span></label>`).join("");
  }

  function barsHtml(sec) {
    const st = state[sec.id];
    const data = rowsFor(sec);
    const total = data.reduce((s,x) => s + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-group-empty">No data for the selected criteria.</div>`;
    const max = Math.max(1, ...data.map((x) => x.value));
    const bars = data.map((item, idx) => {
      const color = COLORS[idx % COLORS.length];
      const h = Math.max(8, Math.round((item.value / max) * 170));
      return `<div class="csvb-group-bar-item" title="${esc(item.label)}: ${esc(displayValue(item,total,st))}"><div class="csvb-group-bar-value">${esc(displayValue(item,total,st))}</div><div class="csvb-group-bar-shell"><div class="csvb-group-bar" style="height:${h}px;background:${esc(color)}"></div></div><div class="csvb-group-bar-label" title="${esc(item.label)}">${esc(item.label)}</div></div>`;
    }).join("");
    const legend = data.map((item, idx) => `<div class="csvb-group-legend-row"><span class="csvb-group-swatch" style="background:${esc(COLORS[idx % COLORS.length])}"></span><span class="csvb-group-label" title="${esc(item.label)}">${esc(item.label)}</span><span class="csvb-group-value">${esc(displayValue(item,total,st))}</span></div>`).join("");
    return `<div class="csvb-group-bars-wrap"><div class="csvb-group-bars">${bars}</div></div><div class="csvb-group-legend">${legend}</div><div class="csvb-group-note">Total displayed observations: ${esc(total)}. Highest: ${esc(data[0].label)} (${esc(data[0].value)} obs).</div>`;
  }

  function ensurePanel(sec) {
    let panel = document.getElementById(sec.panel);
    if (panel) return panel;
    const tbody = document.getElementById(sec.tbody);
    const table = tbody?.closest("table");
    const anchor = tbody?.closest(".csvb-stat-section-body") || tbody?.closest(".card");
    if (!table || !anchor) return null;
    panel = document.createElement("div");
    panel.id = sec.panel;
    panel.className = "csvb-group-bars-panel";
    panel.innerHTML = `<div class="csvb-group-bars-head"><div><div class="csvb-group-bars-title">${esc(sec.title)} - Observation Bars</div><div class="csvb-group-bars-sub">Vertical bar chart based on the table above.</div></div><div class="csvb-group-bars-sub">build: ${esc(BUILD)}</div></div><div class="csvb-group-bars-controls"><div class="csvb-group-bars-field"><label>Display</label><select data-csvb-group-display="1" data-section="${esc(sec.id)}">${DISPLAY.map(([v,l]) => `<option value="${esc(v)}" ${state[sec.id].display === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div class="csvb-group-bars-field"><label>Top limit</label><select data-csvb-group-limit="1" data-section="${esc(sec.id)}">${LIMITS.map(([v,l]) => `<option value="${esc(v)}" ${Number(state[sec.id].limit) === Number(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div><div class="csvb-group-bars-field"><label>Observation types included</label></div><div class="csvb-group-bars-type-box">${typeChecks(sec)}</div></div></div><div data-csvb-group-chart="${esc(sec.id)}"></div>`;
    table.insertAdjacentElement("afterend", panel);
    panel.addEventListener("change", onChange);
    return panel;
  }

  function renderSection(sec) {
    const panel = ensurePanel(sec);
    if (!panel) return;
    const chart = panel.querySelector(`[data-csvb-group-chart="${sec.id}"]`);
    if (chart) chart.innerHTML = barsHtml(sec);
  }

  function onChange(e) {
    const t = e.target;
    if (!t) return;
    const id = t.getAttribute("data-section");
    const st = state[id];
    const sec = SECTIONS.find((x) => x.id === id);
    if (!st || !sec) return;
    if (t.matches("select[data-csvb-group-display='1']")) st.display = String(t.value || "count_pct");
    if (t.matches("select[data-csvb-group-limit='1']")) st.limit = Number(t.value || 15);
    if (t.matches("input[data-csvb-group-type='1']")) { if (t.checked) st.types.add(String(t.value || "")); else st.types.delete(String(t.value || "")); if (!st.types.size) st.types.add(String(t.value || "negative")); }
    renderSection(sec);
  }

  function render() { injectStyle(); SECTIONS.forEach(renderSection); }
  let pending = false;
  function schedule() { if (pending) return; pending = true; window.setTimeout(() => { pending = false; render(); }, 140); }
  function start() { render(); window.setTimeout(render, 700); window.setTimeout(render, 1600); SECTIONS.forEach((s) => { const n = document.getElementById(s.tbody); if (n) new MutationObserver(schedule).observe(n, { childList:true, subtree:true, characterData:true }); }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true }); else start();
})();
