// public/csvb-post-inspection-stats-composition-v02.js
// C.S.V. BEACON — Post-Inspection Stats composition helper v02.
// Adds independent criteria controls to each composition / share chart.
// Display-only. Reads already-rendered tables/cards; does not change calculations, filters, drilldowns, exports, auth, Supabase, device, grant, or offline logic.

(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-COMPOSITION-V02-20260531";
  window.CSVB_POST_STATS_COMPOSITION_BUILD = BUILD;

  const TYPES = [
    { key: "negative", label: "Negative", color: "#c62828" },
    { key: "largely", label: "Largely as expected", color: "#b36b00" },
    { key: "positive", label: "Positive", color: "#16803a" },
  ];

  const BASES = [
    { value: "type", label: "Observation type share" },
    { value: "designation", label: "Designation share" },
    { value: "pgno", label: "PGNO assignment share" },
  ];

  const DISPLAY_MODES = [
    { value: "count_pct", label: "Count + %" },
    { value: "count", label: "Count only" },
    { value: "pct", label: "% only" },
  ];

  const DESIGNATION_COLORS = ["#295eb0", "#6d28d9", "#0f766e", "#be185d", "#b36b00", "#8a4b00", "#64748b"];
  const PGNO_COLORS = ["#16803a", "#8a4b00"];

  const cards = [
    { id: "a", title: "Composition 1", basis: "type", display: "count_pct", types: new Set(["negative", "largely", "positive"]) },
    { id: "b", title: "Composition 2", basis: "designation", display: "count_pct", types: new Set(["negative", "largely", "positive"]) },
    { id: "c", title: "Composition 3", basis: "pgno", display: "count_pct", types: new Set(["negative", "largely"]) },
  ];

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

  function selectedTypes(card) {
    return TYPES.filter((t) => card.types.has(t.key));
  }

  function displayValue(item, total, mode) {
    if (mode === "count") return String(item.value);
    if (mode === "pct") return pct(item.value, total);
    return `${item.value} · ${pct(item.value, total)}`;
  }

  function safeRows(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll("tr"));
  }

  function typeCounts() {
    const out = { negative: 0, largely: 0, positive: 0 };

    for (const tr of safeRows("byTypeTbody")) {
      const cells = Array.from(tr.children || []);
      if (cells.length < 3) continue;

      const label = String(cells[0]?.textContent || "").trim().toLowerCase();
      const value = num(cells[2]?.textContent || "");

      if (label.includes("negative")) out.negative = value;
      else if (label.includes("largely")) out.largely = value;
      else if (label.includes("positive")) out.positive = value;
    }

    return out;
  }

  function designationRows() {
    const out = [];

    for (const tr of safeRows("byCategoryTbody")) {
      const cells = Array.from(tr.children || []);
      if (cells.length < 4) continue;

      out.push({
        label: String(cells[0]?.textContent || "").trim() || "—",
        negative: num(cells[1]?.textContent || ""),
        largely: num(cells[2]?.textContent || ""),
        positive: num(cells[3]?.textContent || ""),
      });
    }

    return out;
  }

  function missingPgnoByType() {
    const text = String(document.getElementById("sumMissingSplit")?.textContent || "");
    const totalMissing = num(document.getElementById("sumMissing")?.textContent || "0");

    const negMatch = text.match(/Negative\s*:\s*(\d+)/i);
    const largelyMatch = text.match(/Largely\s*:\s*(\d+)/i);

    const negative = negMatch ? Number(negMatch[1]) : 0;
    const largely = largelyMatch ? Number(largelyMatch[1]) : Math.max(0, totalMissing - negative);

    return { negative, largely, positive: 0 };
  }

  function dataForTypeShare(card) {
    const counts = typeCounts();
    return selectedTypes(card)
      .map((type) => ({ label: type.label, value: counts[type.key] || 0, color: type.color }))
      .filter((x) => x.value > 0);
  }

  function dataForDesignationShare(card) {
    const types = selectedTypes(card).map((x) => x.key);

    return designationRows()
      .map((row, idx) => {
        const value = types.reduce((sum, key) => sum + Number(row[key] || 0), 0);
        return { label: row.label, value, color: DESIGNATION_COLORS[idx % DESIGNATION_COLORS.length] };
      })
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }

  function dataForPgnoShare(card) {
    const counts = typeCounts();
    const missing = missingPgnoByType();
    const allowed = ["negative", "largely"].filter((key) => card.types.has(key));

    const relevant = allowed.reduce((sum, key) => sum + Number(counts[key] || 0), 0);
    const missingTotal = allowed.reduce((sum, key) => sum + Number(missing[key] || 0), 0);
    const assigned = Math.max(0, relevant - missingTotal);

    if (!relevant) return [];

    return [
      { label: "Assigned PGNO", value: assigned, color: PGNO_COLORS[0] },
      { label: "Missing PGNO", value: Math.max(0, missingTotal), color: PGNO_COLORS[1] },
    ].filter((x) => x.value > 0);
  }

  function chartData(card) {
    if (card.basis === "designation") return dataForDesignationShare(card);
    if (card.basis === "pgno") return dataForPgnoShare(card);
    return dataForTypeShare(card);
  }

  function basisNote(card) {
    if (card.basis === "designation") return "Designation split uses the selected observation type columns only.";
    if (card.basis === "pgno") return "PGNO share applies to selected Negative/Largely records only. Positive has no missing-PGNO basis.";
    return "Observation type share uses selected type slices only.";
  }

  function renderDonut(data, mode) {
    const total = data.reduce((sum, x) => sum + Number(x.value || 0), 0);
    if (!total) return `<div class="csvb-composition-empty">No data for this card's criteria.</div>`;

    let start = 0;
    const segments = data.map((item) => {
      const degrees = (Number(item.value || 0) / total) * 360;
      const end = start + degrees;
      const segment = `${item.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      start = end;
      return segment;
    }).join(", ");

    const legend = data.map((item) => `
      <div class="csvb-composition-v02-legend-row">
        <span class="csvb-composition-v02-swatch" style="background:${esc(item.color)}"></span>
        <span class="csvb-composition-v02-label" title="${esc(item.label)}">${esc(item.label)}</span>
        <span class="csvb-composition-v02-value">${esc(displayValue(item, total, mode))}</span>
      </div>
    `).join("");

    return `
      <div class="csvb-composition-v02-chart-row">
        <div class="csvb-composition-v02-donut" style="background:conic-gradient(${segments})">
          <div class="csvb-composition-v02-hole">
            <div class="csvb-composition-v02-total">${esc(total)}</div>
            <div class="csvb-composition-v02-total-label">total</div>
          </div>
        </div>
        <div class="csvb-composition-v02-legend">${legend}</div>
      </div>
    `;
  }

  function injectStyle() {
    if (document.getElementById("csvbPostStatsCompositionV02Style")) return;

    const style = document.createElement("style");
    style.id = "csvbPostStatsCompositionV02Style";
    style.textContent = `
      #csvbStatsCompositionPanelV01.csvb-composition-v02{box-sizing:border-box;width:100%;margin:12px 0 0;padding:10px;border:1px solid #d5deef;border-radius:16px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 4px 18px rgba(18,44,87,.12);color:#1a4170;}
      .csvb-composition-v02-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
      .csvb-composition-v02-title{color:#1a4170;font-size:1rem;font-weight:950;}
      .csvb-composition-v02-sub{color:#48628e;font-size:.78rem;font-weight:850;line-height:1.35;margin-top:2px;}
      .csvb-composition-v02-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
      .csvb-composition-v02-card{border:1px solid #d8e5f7;border-radius:14px;background:#fff;padding:10px;min-height:300px;}
      .csvb-composition-v02-card-title{color:#1a4170;font-weight:950;font-size:.9rem;margin-bottom:6px;display:flex;justify-content:space-between;gap:8px;}
      .csvb-composition-v02-controls{display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:7px;}
      .csvb-composition-v02-field label{display:block;margin:0 0 2px;color:#1a4170;font-size:.72rem;font-weight:950;}
      .csvb-composition-v02-field select{width:100%;border:1px solid #cbd7ee;border-radius:9px;padding:6px 8px;color:#1a4170;background:#fff;font-size:.8rem;font-weight:850;}
      .csvb-composition-v02-type-box{border:1px solid #d5deef;border-radius:12px;padding:6px;background:#fff;display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:5px 8px;margin-bottom:7px;}
      .csvb-composition-v02-check{display:flex;align-items:center;gap:5px;color:#223a66;font-weight:850;font-size:.72rem;line-height:1.15;}
      .csvb-composition-v02-check input{width:auto;transform:scale(.95);}
      .csvb-composition-v02-chart-row{display:grid;grid-template-columns:112px 1fr;gap:10px;align-items:center;}
      .csvb-composition-v02-donut{width:108px;height:108px;border-radius:999px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);}
      .csvb-composition-v02-hole{width:64px;height:64px;border-radius:999px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #d8e5f7;}
      .csvb-composition-v02-total{color:#1a4170;font-weight:950;font-size:1.04rem;line-height:1;}.csvb-composition-v02-total-label{color:#48628e;font-weight:850;font-size:.64rem;}
      .csvb-composition-v02-legend{display:flex;flex-direction:column;gap:4px;min-width:0;}.csvb-composition-v02-legend-row{display:grid;grid-template-columns:11px 1fr auto;gap:5px;align-items:center;color:#223a66;font-size:.72rem;font-weight:850;}
      .csvb-composition-v02-swatch{width:9px;height:9px;border-radius:999px;}.csvb-composition-v02-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.csvb-composition-v02-value{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;color:#1a4170;font-weight:950;white-space:nowrap;}
      .csvb-composition-v02-note{color:#48628e;font-size:.7rem;font-weight:850;line-height:1.3;margin-top:7px;}.csvb-composition-empty{color:#55708f;font-weight:850;font-size:.82rem;padding:12px 0;}
      @media(max-width:1280px){.csvb-composition-v02-grid{grid-template-columns:1fr;}.csvb-composition-v02-chart-row{grid-template-columns:112px 1fr;}}
      @media(max-width:760px){.csvb-composition-v02-chart-row{grid-template-columns:1fr;}.csvb-composition-v02-donut{margin:0 auto;}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbStatsCompositionPanelV01");
    if (panel) { panel.className = "csvb-composition-v02"; return panel; }

    const compare = document.getElementById("csvbStatsComparePanelV01");
    const statGrid = document.querySelector(".statGrid");
    const anchor = compare || statGrid;
    if (!anchor) return null;

    panel = document.createElement("div");
    panel.id = "csvbStatsCompositionPanelV01";
    panel.className = "csvb-composition-v02";
    panel.innerHTML = `
      <div class="csvb-composition-v02-head"><div><div class="csvb-composition-v02-title">Composition / Share Charts</div><div class="csvb-composition-v02-sub">Each chart has its own criteria. Select what each pie chart includes.</div></div><div class="csvb-composition-v02-sub">build: ${esc(BUILD)}</div></div>
      <div class="csvb-composition-v02-grid" id="csvbStatsCompositionGridV01"></div>
      <div class="csvb-composition-v02-note">Display-only composition charts. Existing KPI calculations, filters, drilldowns and exports are not modified.</div>`;
    anchor.insertAdjacentElement("afterend", panel);
    panel.addEventListener("change", onChange);
    return panel;
  }

  function cardById(id) { return cards.find((x) => x.id === id); }

  function renderTypeChecks(card) {
    return TYPES.map((type) => `
      <label class="csvb-composition-v02-check">
        <input type="checkbox" data-card="${esc(card.id)}" data-field="type" value="${esc(type.key)}" ${card.types.has(type.key) ? "checked" : ""} />
        <span>${esc(type.label)}</span>
      </label>
    `).join("");
  }

  function renderCard(card) {
    const data = chartData(card);
    const basisLabel = BASES.find((x) => x.value === card.basis)?.label || card.basis;

    const basisOptions = BASES.map((b) => `<option value="${esc(b.value)}" ${card.basis === b.value ? "selected" : ""}>${esc(b.label)}</option>`).join("");
    const displayOptions = DISPLAY_MODES.map((m) => `<option value="${esc(m.value)}" ${card.display === m.value ? "selected" : ""}>${esc(m.label)}</option>`).join("");

    return `
      <div class="csvb-composition-v02-card">
        <div class="csvb-composition-v02-card-title"><span>${esc(card.title)}</span><span>${esc(basisLabel)}</span></div>
        <div class="csvb-composition-v02-controls">
          <div class="csvb-composition-v02-field"><label>Chart basis</label><select data-card="${esc(card.id)}" data-field="basis">${basisOptions}</select></div>
          <div class="csvb-composition-v02-field"><label>Display</label><select data-card="${esc(card.id)}" data-field="display">${displayOptions}</select></div>
        </div>
        <div class="csvb-composition-v02-type-box">${renderTypeChecks(card)}</div>
        ${renderDonut(data, card.display)}
        <div class="csvb-composition-v02-note">${esc(basisNote(card))}</div>
      </div>
    `;
  }

  function render() {
    injectStyle();
    ensurePanel();
    const grid = document.getElementById("csvbStatsCompositionGridV01");
    if (!grid) return;
    grid.innerHTML = cards.map(renderCard).join("");
  }

  function onChange(e) {
    const target = e.target;
    if (!target) return;
    const card = cardById(target.getAttribute("data-card"));
    if (!card) return;
    const field = target.getAttribute("data-field");

    if (field === "basis") card.basis = String(target.value || "type");
    if (field === "display") card.display = String(target.value || "count_pct");
    if (field === "type") {
      const value = String(target.value || "");
      if (target.checked) card.types.add(value);
      else card.types.delete(value);
      if (!card.types.size) card.types.add(value || "negative");
    }

    render();
  }

  let pending = false;
  function scheduleRender() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; render(); }, 150);
  }

  function start() {
    render();
    window.setTimeout(render, 700);
    window.setTimeout(render, 1600);

    const observer = new MutationObserver(scheduleRender);
    ["byTypeTbody", "byCategoryTbody", "sumMissing", "sumMissingSplit"].forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node, { childList: true, subtree: true, characterData: true });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
