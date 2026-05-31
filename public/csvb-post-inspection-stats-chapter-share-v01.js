// public/csvb-post-inspection-stats-chapter-share-v01.js
// C.S.V. BEACON — Post-Inspection Stats SIRE Chapter Share helper v01.
// Display-only helper using window.CSVB_POST_STATS_SNAPSHOT.
// Does not change calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-CHAPTER-SHARE-V01-20260531";
  window.CSVB_POST_STATS_CHAPTER_SHARE_BUILD = BUILD;

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
    "#ca8a04", "#475569", "#7c2d12"
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

  function pct(value, total) {
    if (!total) return "0.0%";
    return `${((Number(value || 0) / total) * 100).toFixed(1)}%`;
  }

  function normalizeType(value) {
    const v = String(value || "").trim().toLowerCase();
    if (v.includes("negative")) return "negative";
    if (v.includes("largely")) return "largely";
    if (v.includes("positive")) return "positive";
    return v;
  }

  function displayValue(item, total) {
    if (state.display === "count") return String(item.value);
    if (state.display === "pct") return pct(item.value, total);
    return `${item.value} · ${pct(item.value, total)}`;
  }

  function chapterSortKey(label) {
    const m = String(label || "").match(/\d+/);
    return m ? Number(m[0]) : 9999;
  }

  function snapshot() {
    return window.CSVB_POST_STATS_GET_SNAPSHOT?.() || window.CSVB_POST_STATS_SNAPSHOT || null;
  }

  function rowsForChapterShare() {
    const snap = snapshot();
    if (!snap) return [];

    // rowsIgnoreType respects vessel/date/source filters but allows this helper to apply its own type criteria.
    const rows = Array.isArray(snap.rowsIgnoreType) && snap.rowsIgnoreType.length
      ? snap.rowsIgnoreType
      : (Array.isArray(snap.rows) ? snap.rows : []);

    return rows.filter((row) => state.types.has(normalizeType(row?.observation_type)));
  }

  function chapterLabelFor(row) {
    const meta = row?.question_meta || {};
    const qno = String(row?.question_no || meta?.qno || "").trim();
    const rawChapter = String(meta?.chapter || "").trim() || String(qno.split(".")[0] || "").trim();
    if (!rawChapter) return "Unknown chapter";
    return /^chapter\b/i.test(rawChapter) ? rawChapter : `Chapter ${rawChapter}`;
  }

  function buildChapterData() {
    const map = new Map();

    for (const row of rowsForChapterShare()) {
      const label = chapterLabelFor(row);
      if (!map.has(label)) {
        map.set(label, {
          label,
          value: 0,
          questions: new Set(),
        });
      }

      const item = map.get(label);
      item.value += 1;
      const qno = String(row?.question_no || row?.question_meta?.qno || "").trim();
      if (qno) item.questions.add(qno);
    }

    return Array.from(map.values())
      .map((x, idx) => ({
        label: x.label,
        value: x.value,
        questionCount: x.questions.size,
        color: PALETTE[idx % PALETTE.length],
      }))
      .sort((a, b) => chapterSortKey(a.label) - chapterSortKey(b.label) || a.label.localeCompare(b.label));
  }

  function renderDonut(data) {
    const total = data.reduce((sum, x) => sum + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-chapter-share-empty">No chapter data for the selected criteria.</div>`;

    let start = 0;
    const segments = data.map((item) => {
      const degrees = (Number(item.value || 0) / total) * 360;
      const end = start + degrees;
      const segment = `${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      start = end;
      return segment;
    }).join(", ");

    const legend = data.map((item) => `
      <div class="csvb-chapter-share-legend-row">
        <span class="csvb-chapter-share-swatch" style="background:${esc(item.color)}"></span>
        <span class="csvb-chapter-share-label" title="${esc(item.label)}">${esc(item.label)}</span>
        <span class="csvb-chapter-share-value">${esc(displayValue(item, total))}</span>
      </div>
    `).join("");

    const largest = data.slice().sort((a, b) => b.value - a.value)[0];

    return `
      <div class="csvb-chapter-share-chart-row">
        <div class="csvb-chapter-share-donut" style="background:conic-gradient(${segments})">
          <div class="csvb-chapter-share-hole">
            <div class="csvb-chapter-share-total">${esc(total)}</div>
            <div class="csvb-chapter-share-total-label">obs.</div>
          </div>
        </div>
        <div class="csvb-chapter-share-legend">${legend}</div>
      </div>
      <div class="csvb-chapter-share-note">Largest share: ${esc(largest.label)} (${esc(pct(largest.value, total))}).</div>
    `;
  }

  function injectStyle() {
    if (document.getElementById("csvbPostStatsChapterShareV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsChapterShareV01Style";
    style.textContent = `
      #csvbStatsChapterSharePanelV01{
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
      .csvb-chapter-share-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
      .csvb-chapter-share-title{color:#1a4170;font-size:1rem;font-weight:950;}
      .csvb-chapter-share-sub{color:#48628e;font-size:.78rem;font-weight:850;line-height:1.35;margin-top:2px;}
      .csvb-chapter-share-card{border:1px solid #d8e5f7;border-radius:14px;background:#fff;padding:10px;}
      .csvb-chapter-share-controls{display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:10px;align-items:start;margin-bottom:10px;}
      .csvb-chapter-share-field label{display:block;margin:0 0 3px;color:#1a4170;font-size:.76rem;font-weight:950;}
      .csvb-chapter-share-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:7px 9px;color:#1a4170;background:#fff;font-size:.82rem;font-weight:850;}
      .csvb-chapter-share-type-box{border:1px solid #d5deef;border-radius:12px;padding:7px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px 10px;}
      .csvb-chapter-share-check{display:flex;align-items:center;gap:6px;color:#223a66;font-weight:850;font-size:.78rem;line-height:1.15;}
      .csvb-chapter-share-check input{width:auto;transform:scale(.98);}
      .csvb-chapter-share-chart-row{display:grid;grid-template-columns:180px 1fr;gap:14px;align-items:center;}
      .csvb-chapter-share-donut{width:170px;height:170px;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
      .csvb-chapter-share-hole{width:94px;height:94px;border-radius:999px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #d8e5f7;}
      .csvb-chapter-share-total{color:#1a4170;font-weight:950;font-size:1.25rem;line-height:1;}
      .csvb-chapter-share-total-label{color:#48628e;font-weight:850;font-size:.68rem;}
      .csvb-chapter-share-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:5px 12px;min-width:0;}
      .csvb-chapter-share-legend-row{display:grid;grid-template-columns:11px 1fr auto;gap:6px;align-items:center;color:#223a66;font-size:.76rem;font-weight:850;}
      .csvb-chapter-share-swatch{width:10px;height:10px;border-radius:999px;}
      .csvb-chapter-share-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .csvb-chapter-share-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;color:#1a4170;font-weight:950;white-space:nowrap;}
      .csvb-chapter-share-note{color:#48628e;font-size:.74rem;font-weight:850;line-height:1.3;margin-top:8px;}
      .csvb-chapter-share-empty{color:#55708f;font-weight:850;font-size:.84rem;padding:12px 0;}
      @media(max-width:900px){.csvb-chapter-share-controls{grid-template-columns:1fr;}.csvb-chapter-share-chart-row{grid-template-columns:1fr;}.csvb-chapter-share-donut{margin:0 auto;}.csvb-chapter-share-legend{grid-template-columns:1fr;}}
    `;

    document.head.appendChild(style);
  }

  function renderTypeChecks() {
    return TYPES.map((type) => `
      <label class="csvb-chapter-share-check">
        <input type="checkbox" data-csvb-chapter-type="1" value="${esc(type.key)}" ${state.types.has(type.key) ? "checked" : ""} />
        <span>${esc(type.label)}</span>
      </label>
    `).join("");
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbStatsChapterSharePanelV01");
    if (panel) return panel;

    const composition = document.getElementById("csvbStatsCompositionPanelV01");
    const compare = document.getElementById("csvbStatsComparePanelV01");
    const statGrid = document.querySelector(".statGrid");
    const anchor = composition || compare || statGrid;
    if (!anchor) return null;

    panel = document.createElement("div");
    panel.id = "csvbStatsChapterSharePanelV01";
    panel.innerHTML = `
      <div class="csvb-chapter-share-head">
        <div>
          <div class="csvb-chapter-share-title">SIRE Chapter Share</div>
          <div class="csvb-chapter-share-sub">Chapter composition based on the current filtered Stats snapshot.</div>
        </div>
        <div class="csvb-chapter-share-sub">build: ${esc(BUILD)}</div>
      </div>
      <div class="csvb-chapter-share-card">
        <div class="csvb-chapter-share-controls">
          <div class="csvb-chapter-share-field">
            <label for="csvbChapterShareDisplayV01">Display</label>
            <select id="csvbChapterShareDisplayV01">
              ${DISPLAY_MODES.map((m) => `<option value="${esc(m.value)}" ${state.display === m.value ? "selected" : ""}>${esc(m.label)}</option>`).join("")}
            </select>
          </div>
          <div>
            <div class="csvb-chapter-share-field"><label>Observation types included</label></div>
            <div class="csvb-chapter-share-type-box" id="csvbChapterShareTypesV01">${renderTypeChecks()}</div>
          </div>
        </div>
        <div id="csvbChapterShareChartV01"></div>
        <div class="csvb-chapter-share-note">Uses rowsIgnoreType from the read-only Stats snapshot. This respects vessel/date/source filters but allows independent type criteria here.</div>
      </div>
    `;

    anchor.insertAdjacentElement("afterend", panel);

    panel.addEventListener("change", (e) => {
      const target = e.target;
      if (!target) return;

      if (target.id === "csvbChapterShareDisplayV01") {
        state.display = String(target.value || "count_pct");
        render();
        return;
      }

      if (target.matches("input[data-csvb-chapter-type='1']")) {
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

    const chart = document.getElementById("csvbChapterShareChartV01");
    if (!chart) return;

    const snap = snapshot();
    if (!snap) {
      chart.innerHTML = `<div class="csvb-chapter-share-empty">Waiting for Stats snapshot…</div>`;
      return;
    }

    const data = buildChapterData();
    chart.innerHTML = renderDonut(data);
  }

  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      render();
    }, 120);
  }

  function start() {
    render();
    window.addEventListener("csvb:post-stats-snapshot", scheduleRender);
    window.setTimeout(render, 700);
    window.setTimeout(render, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
