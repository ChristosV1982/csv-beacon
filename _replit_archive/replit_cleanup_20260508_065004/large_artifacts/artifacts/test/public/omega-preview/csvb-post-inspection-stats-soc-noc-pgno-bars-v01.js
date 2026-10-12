// C.S.V. BEACON - Post-Inspection Stats SOC/NOC/PGNO Bars v01
// Display-only helper. Adds configurable bar charts below existing Top SOC, Top NOC and PGNO tables.
// Also hides missing-PGNO visual widgets for now. No stored data is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-SOC-NOC-PGNO-BARS-V01-20260601";
  window.CSVB_POST_STATS_SOC_NOC_PGNO_BARS_BUILD = BUILD;

  const TYPES = [["negative", "Negative"], ["largely", "Largely as expected"], ["positive", "Positive"]];
  const DISPLAY = [["count_pct", "Count + %"], ["count", "Count only"], ["pct", "% only"]];
  const LIMITS = [["10", "Top 10"], ["15", "Top 15"], ["20", "Top 20"], ["30", "Top 30"], ["999", "All"]];
  const MINIMUMS = [["1", "1+ obs"], ["2", "2+ obs"], ["3", "3+ obs"], ["5", "5+ obs"], ["10", "10+ obs"]];
  const COLORS = ["#c62828", "#b36b00", "#16803a", "#295eb0", "#6d28d9", "#0f766e", "#be185d", "#8a4b00", "#0369a1", "#9333ea", "#ca8a04", "#475569"];

  const SECTIONS = [
    { id: "soc", title: "Top SOC", field: "soc", tbody: "topSocTbody", panel: "csvbStatsTopSocBarsPanelV01", label: "SOC" },
    { id: "noc", title: "Top NOC", field: "noc", tbody: "topNocTbody", panel: "csvbStatsTopNocBarsPanelV01", label: "NOC" },
    { id: "pgno", title: "PGNO Analytics", field: "pgno", tbody: "pgnoTableTbody", panel: "csvbStatsPgnoBarsPanelV01", label: "PGNO" }
  ];

  const state = Object.fromEntries(SECTIONS.map((s) => [s.id, { display: "count_pct", limit: 15, min: 2, types: new Set(["negative", "largely", "positive"]), designations: new Set(), desigKey: "" }]));

  const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const pct = (n, d) => d ? `${((Number(n || 0) / d) * 100).toFixed(1)}%` : "0.0%";
  const normType = (v) => { const s = String(v || "").toLowerCase(); if (s.includes("negative")) return "negative"; if (s.includes("largely")) return "largely"; if (s.includes("positive")) return "positive"; return s.trim(); };
  const snap = () => window.CSVB_POST_STATS_GET_SNAPSHOT?.() || window.CSVB_POST_STATS_SNAPSHOT || null;
  const rows = () => { const s = snap(); return !s ? [] : (Array.isArray(s.rowsIgnoreType) && s.rowsIgnoreType.length ? s.rowsIgnoreType : (Array.isArray(s.rows) ? s.rows : [])); };

  function designationsAvailable() {
    const set = new Set();
    rows().forEach((r) => { const d = String(r?.designation || "").trim(); if (d) set.add(d); });
    return Array.from(set).sort((a,b) => a.localeCompare(b));
  }

  function syncDesignations(st) {
    const ds = designationsAvailable();
    const key = ds.join("|");
    if (key !== st.desigKey) {
      const old = new Set(st.designations);
      st.designations = new Set(ds.filter((d) => old.has(d)));
      if (!st.designations.size) ds.forEach((d) => st.designations.add(d));
      st.desigKey = key;
    }
    return ds;
  }

  function filteredRows(st) {
    return rows().filter((r) => {
      if (!st.types.has(normType(r?.observation_type))) return false;
      const d = String(r?.designation || "").trim();
      if (st.designations.size && !st.designations.has(d)) return false;
      return true;
    });
  }

  function labelForRow(row, sec) {
    if (sec.id === "pgno") return "";
    return String(row?.[sec.field] || "—").trim() || "—";
  }

  function dataFor(sec) {
    const st = state[sec.id];
    const map = new Map();
    filteredRows(st).forEach((r) => {
      if (sec.id === "pgno") {
        const arr = Array.isArray(r?.pgno_selected) ? r.pgno_selected : [];
        arr.forEach((pg) => {
          const no = String(pg?.pgno_no || pg?.idx || "").trim();
          const text = String(pg?.text || "").trim();
          const label = no && text ? `${no} — ${text}` : (no || text);
          if (!label) return;
          map.set(label, (map.get(label) || 0) + 1);
        });
      } else {
        const label = labelForRow(r, sec);
        map.set(label, (map.get(label) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).filter((x) => x.value >= st.min).sort((a,b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, Number(st.limit || 15));
  }

  function displayValue(item, total, st) {
    if (st.display === "count") return String(item.value);
    if (st.display === "pct") return pct(item.value, total);
    return `${item.value} - ${pct(item.value, total)}`;
  }

  function injectStyle() {
    if (document.getElementById("csvbSocNocPgnoBarsV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbSocNocPgnoBarsV01Style";
    style.textContent = `
      .csvb-snp-bars-panel{box-sizing:border-box;width:100%;margin:12px 0 0;padding:10px;border:1px solid #d5deef;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 3px 14px rgba(18,44,87,.10);color:#1a4170}
      .csvb-snp-bars-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.csvb-snp-bars-title{font-size:1.02rem;font-weight:950}.csvb-snp-bars-sub{color:#48628e;font-size:.84rem;font-weight:850;line-height:1.35}
      .csvb-snp-controls{display:grid;grid-template-columns:minmax(170px,220px) minmax(130px,180px) minmax(130px,180px) 1fr;gap:10px;align-items:start;margin-bottom:10px}.csvb-snp-field label{display:block;margin:0 0 3px;font-size:.84rem;font-weight:950}.csvb-snp-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;background:#fff;color:#1a4170;font-size:.94rem;font-weight:850;min-height:40px}
      .csvb-snp-box{border:1px solid #d5deef;border-radius:12px;padding:7px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 10px}.csvb-snp-check{display:flex;align-items:center;gap:6px;font-weight:850;font-size:.88rem}.csvb-snp-check input{width:auto;transform:scale(1.04)}
      .csvb-snp-bar-wrap{overflow-x:auto;border:1px solid #e0eaf8;border-radius:12px;background:linear-gradient(180deg,#fff,#f8fbff);padding:8px 4px 4px}.csvb-snp-bars{display:flex;align-items:flex-end;gap:14px;min-height:245px;min-width:max-content;padding:8px 6px 0}.csvb-snp-item{width:92px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px}.csvb-snp-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;font-size:.78rem;text-align:center;min-height:28px;line-height:1.15;color:#1a4170}.csvb-snp-shell{height:178px;width:34px;display:flex;align-items:flex-end;justify-content:center;border-left:1px solid #d5e2f3;border-bottom:1px solid #d5e2f3;background:repeating-linear-gradient(to top,#fff 0,#fff 34px,#edf4ff 35px)}.csvb-snp-bar{width:28px;border-radius:8px 8px 0 0;box-shadow:0 3px 8px rgba(18,44,87,.15)}.csvb-snp-label{width:92px;min-height:42px;font-size:.72rem;font-weight:950;text-align:center;line-height:1.12;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;color:#223a66}
      .csvb-snp-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px 14px;margin-top:10px}.csvb-snp-legend-row{display:grid;grid-template-columns:12px 1fr auto;gap:7px;align-items:center;font-size:.88rem;font-weight:850}.csvb-snp-swatch{width:11px;height:11px;border-radius:999px}.csvb-snp-legend-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.csvb-snp-legend-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:950;white-space:nowrap;color:#1a4170}.csvb-snp-note{color:#48628e;font-size:.82rem;font-weight:850;line-height:1.35;margin-top:8px}.csvb-snp-empty{color:#55708f;font-weight:850;font-size:.9rem;padding:12px 0}
      @media(max-width:1200px){.csvb-snp-controls{grid-template-columns:1fr}.csvb-snp-bars{gap:10px}.csvb-snp-item{width:84px}.csvb-snp-label{width:84px}}
    `;
    document.head.appendChild(style);
  }

  function typeChecks(sec) { const st = state[sec.id]; return TYPES.map(([key,label]) => `<label class="csvb-snp-check"><input type="checkbox" data-snp-type="1" data-section="${esc(sec.id)}" value="${esc(key)}" ${st.types.has(key) ? "checked" : ""}/><span>${esc(label)}</span></label>`).join(""); }
  function designationChecks(sec) { const st = state[sec.id]; const ds = syncDesignations(st); return ds.length ? ds.map((d) => `<label class="csvb-snp-check"><input type="checkbox" data-snp-desig="1" data-section="${esc(sec.id)}" value="${esc(d)}" ${st.designations.has(d) ? "checked" : ""}/><span>${esc(d)}</span></label>`).join("") : `<span class="csvb-snp-empty">No designations available.</span>`; }

  function barsHtml(sec) {
    const st = state[sec.id];
    const data = dataFor(sec);
    const total = data.reduce((s,x) => s + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-snp-empty">No data for the selected criteria.</div>`;
    const max = Math.max(1, ...data.map((x) => x.value));
    const bars = data.map((item, idx) => { const color = COLORS[idx % COLORS.length]; const h = Math.max(8, Math.round((item.value / max) * 170)); return `<div class="csvb-snp-item" title="${esc(item.label)}: ${esc(displayValue(item,total,st))}"><div class="csvb-snp-value">${esc(displayValue(item,total,st))}</div><div class="csvb-snp-shell"><div class="csvb-snp-bar" style="height:${h}px;background:${esc(color)}"></div></div><div class="csvb-snp-label" title="${esc(item.label)}">${esc(item.label)}</div></div>`; }).join("");
    const legend = data.map((item, idx) => `<div class="csvb-snp-legend-row"><span class="csvb-snp-swatch" style="background:${esc(COLORS[idx % COLORS.length])}"></span><span class="csvb-snp-legend-label" title="${esc(item.label)}">${esc(item.label)}</span><span class="csvb-snp-legend-value">${esc(displayValue(item,total,st))}</span></div>`).join("");
    return `<div class="csvb-snp-bar-wrap"><div class="csvb-snp-bars">${bars}</div></div><div class="csvb-snp-legend">${legend}</div><div class="csvb-snp-note">Total displayed observations: ${esc(total)}. Highest: ${esc(data[0].label)} (${esc(data[0].value)} obs).</div>`;
  }

  function ensurePanel(sec) {
    let panel = document.getElementById(sec.panel);
    if (panel) return panel;
    const tbody = document.getElementById(sec.tbody);
    const table = tbody?.closest("table");
    if (!table) return null;
    panel = document.createElement("div");
    panel.id = sec.panel;
    panel.className = "csvb-snp-bars-panel";
    panel.innerHTML = `<div class="csvb-snp-bars-head"><div><div class="csvb-snp-bars-title">${esc(sec.title)} - Bars</div><div class="csvb-snp-bars-sub">Filtered ${esc(sec.label)} bar chart using type, designation and minimum-count criteria.</div></div><div class="csvb-snp-bars-sub">build: ${esc(BUILD)}</div></div><div class="csvb-snp-controls"><div class="csvb-snp-field"><label>Display</label><select data-snp-display="1" data-section="${esc(sec.id)}">${DISPLAY.map(([v,l]) => `<option value="${esc(v)}" ${state[sec.id].display === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div class="csvb-snp-field"><label>Top limit</label><select data-snp-limit="1" data-section="${esc(sec.id)}">${LIMITS.map(([v,l]) => `<option value="${esc(v)}" ${Number(state[sec.id].limit) === Number(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div class="csvb-snp-field"><label>Minimum</label><select data-snp-min="1" data-section="${esc(sec.id)}">${MINIMUMS.map(([v,l]) => `<option value="${esc(v)}" ${Number(state[sec.id].min) === Number(v) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div><div class="csvb-snp-field"><label>Observation families</label></div><div class="csvb-snp-box">${typeChecks(sec)}</div></div></div><div class="csvb-snp-field"><label>Categories / designations included</label></div><div class="csvb-snp-box" data-snp-desig-box="${esc(sec.id)}">${designationChecks(sec)}</div><div data-snp-chart="${esc(sec.id)}"></div>`;
    table.insertAdjacentElement("afterend", panel);
    panel.addEventListener("change", onChange);
    return panel;
  }

  function renderSection(sec) { const panel = ensurePanel(sec); if (!panel) return; const desigBox = panel.querySelector(`[data-snp-desig-box="${sec.id}"]`); if (desigBox) desigBox.innerHTML = designationChecks(sec); const chart = panel.querySelector(`[data-snp-chart="${sec.id}"]`); if (chart) chart.innerHTML = barsHtml(sec); }

  function onChange(e) {
    const t = e.target;
    const id = t?.getAttribute?.("data-section");
    const st = state[id];
    const sec = SECTIONS.find((x) => x.id === id);
    if (!st || !sec) return;
    if (t.matches("select[data-snp-display='1']")) st.display = String(t.value || "count_pct");
    if (t.matches("select[data-snp-limit='1']")) st.limit = Number(t.value || 15);
    if (t.matches("select[data-snp-min='1']")) st.min = Number(t.value || 2);
    if (t.matches("input[data-snp-type='1']")) { if (t.checked) st.types.add(String(t.value || "")); else st.types.delete(String(t.value || "")); if (!st.types.size) st.types.add(String(t.value || "negative")); }
    if (t.matches("input[data-snp-desig='1']")) { if (t.checked) st.designations.add(String(t.value || "")); else st.designations.delete(String(t.value || "")); if (!st.designations.size) st.designations.add(String(t.value || designationsAvailable()[0] || "")); }
    renderSection(sec);
  }

  function hideMissingPgnoVisuals() {
    const summaryCard = document.getElementById("sumMissing")?.closest(".stat");
    if (summaryCard) summaryCard.style.display = "none";
    const missingBox = document.getElementById("chartPgnoMissing")?.closest(".chartBox");
    if (missingBox) missingBox.style.display = "none";
    document.querySelectorAll(".csvb-composition-v02-card,.csvb-composition-card").forEach((card) => { if (/PGNO\s+Assignment/i.test(card.textContent || "")) card.style.display = "none"; });
  }

  function render() { injectStyle(); hideMissingPgnoVisuals(); SECTIONS.forEach(renderSection); }
  let pending = false;
  function schedule() { if (pending) return; pending = true; window.setTimeout(() => { pending = false; SECTIONS.forEach((s) => { state[s.id].desigKey = ""; }); render(); }, 140); }
  function start() { render(); window.addEventListener("csvb:post-stats-snapshot", schedule); window.setTimeout(render, 700); window.setTimeout(render, 1600); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true }); else start();
})();
