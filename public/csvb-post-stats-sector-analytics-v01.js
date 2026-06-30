// C.S.V. BEACON - Post Stats Sector Analytics v01
// Safe display helper. Reads the existing post-inspection stats snapshot.
// No database writes. No changes to post_inspection_stats.js.

(function () {
  "use strict";

  const BUILD = "POST-STATS-SECTOR-ANALYTICS-V01-20260630";
  window.CSVB_POST_STATS_SECTOR_ANALYTICS_BUILD = BUILD;

  const SOURCE_OPTIONS = [
    ["vetting_inspection", "Vetting Inspections"],
    ["audit_internal_superintendent", "Audit — Marine Superintendent"],
    ["audit_internal_master", "Audit — Master"],
    ["audit_external_contractor", "Audit — External Auditor"],
  ];

  const SOURCE_COLOURS = {
    vetting_inspection: "#2563eb",
    audit_internal_superintendent: "#dc2626",
    audit_internal_master: "#f59e0b",
    audit_external_contractor: "#16a34a",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function snap() {
    if (typeof window.CSVB_POST_STATS_GET_SNAPSHOT === "function") {
      return window.CSVB_POST_STATS_GET_SNAPSHOT();
    }
    return window.CSVB_POST_STATS_SNAPSHOT || null;
  }

  function rowsFromSnapshot() {
    const s = snap();
    if (!s) return [];
    if (Array.isArray(s.rowsIgnoreType) && s.rowsIgnoreType.length) return s.rowsIgnoreType;
    if (Array.isArray(s.rows) && s.rows.length) return s.rows;
    return [];
  }

  function currentDateRange() {
    return {
      from: String(document.getElementById("dateFrom")?.value || "").slice(0, 10),
      to: String(document.getElementById("dateTo")?.value || "").slice(0, 10),
    };
  }

  function normaliseType(value) {
    const s = String(value || "").trim().toLowerCase();
    if (s.includes("largely")) return "largely";
    if (s.includes("positive")) return "positive";
    return "negative";
  }

  function sourceKey(row) {
    return String(row?.record_source || "vetting_inspection").trim() || "vetting_inspection";
  }

  function sourceLabel(key) {
    return SOURCE_OPTIONS.find((x) => x[0] === key)?.[1] || key || "Unknown";
  }

  function sourceColour(key) {
    return SOURCE_COLOURS[key] || "#64748b";
  }

  function qno(row) {
    return String(row?.question_no || row?.question_base || row?.question_meta?.qno || "").trim();
  }

  function reportKey(row) {
    return [
      sourceKey(row),
      row?.report_id,
      row?.source_report_id,
      row?.report_ref,
      row?.vessel_name,
      row?.inspection_date,
      row?.audit_date,
    ].filter(Boolean).join("::");
  }

  function vesselKey(row) {
    return String(row?.vessel_name || row?.vessel_id || "").trim();
  }

  function eventDate(row) {
    return String(row?.inspection_date || row?.audit_date || row?.event_date || "").slice(0, 10);
  }

  function inDateRange(row) {
    const d = eventDate(row);
    const { from, to } = currentDateRange();
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function selectedSector() {
    return String(document.getElementById("csvbSectorSelect")?.value || "navigation").trim();
  }

  function selectedGrouping() {
    return String(document.getElementById("csvbSectorGrouping")?.value || "month").trim();
  }

  function selectedTypes() {
    const out = [];
    if (document.getElementById("csvbSectorTypeNegative")?.checked) out.push("negative");
    if (document.getElementById("csvbSectorTypeLargely")?.checked) out.push("largely");
    if (document.getElementById("csvbSectorTypePositive")?.checked) out.push("positive");
    return out.length ? new Set(out) : new Set(["negative"]);
  }

  function selectedSources() {
    const out = [];
    SOURCE_OPTIONS.forEach(([key]) => {
      if (document.getElementById(`csvbSectorSource_${key}`)?.checked) out.push(key);
    });
    return out.length ? new Set(out) : new Set(SOURCE_OPTIONS.map((x) => x[0]));
  }

  function includeMooring581() {
    return !!document.getElementById("csvbSectorMooring581")?.checked;
  }

  function includeMooring585() {
    return !!document.getElementById("csvbSectorMooring585")?.checked;
  }

  function topLimit() {
    const raw = String(document.getElementById("csvbSectorTopLimit")?.value || "10").trim();
    if (raw === "all") return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  function rowSector(row) {
    const q = qno(row);

    if (/^0?4\./.test(q)) return "navigation";

    if (/^0?8\./.test(q) || /^5\.8\.3(?:\.|$)/.test(q)) return "cargo";

    if (/^0?9\./.test(q)) return "mooring";

    if (includeMooring581() && /^5\.8\.1(?:\.|$)/.test(q)) return "mooring";
    if (includeMooring585() && /^5\.8\.5(?:\.|$)/.test(q)) return "mooring";

    return "other";
  }

  function sectorRows() {
    const sector = selectedSector();
    const types = selectedTypes();
    const sources = selectedSources();

    return rowsFromSnapshot().filter((row) => {
      if (!inDateRange(row)) return false;
      if (!types.has(normaliseType(row.observation_type))) return false;
      if (!sources.has(sourceKey(row))) return false;
      return rowSector(row) === sector;
    });
  }

  function bucket(row) {
    const d = eventDate(row);
    if (!d) return "—";

    const y = d.slice(0, 4);
    const m = Number(d.slice(5, 7));
    const g = selectedGrouping();

    if (g === "year") return y;
    if (g === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
    return d.slice(0, 7);
  }

  function avg(n, d) {
    return d ? (Number(n || 0) / Number(d || 0)).toFixed(2) : "0.00";
  }

  function buildSourceMetrics(rows) {
    const map = new Map();

    for (const key of selectedSources()) {
      map.set(key, {
        key,
        label: sourceLabel(key),
        observations: 0,
        reports: new Set(),
        vessels: new Set(),
        rows: [],
      });
    }

    for (const row of rows) {
      const key = sourceKey(row);
      if (!map.has(key)) continue;

      const item = map.get(key);
      item.observations += 1;
      item.reports.add(reportKey(row));
      if (vesselKey(row)) item.vessels.add(vesselKey(row));
      item.rows.push(row);
    }

    return [...map.values()].map((item) => ({
      ...item,
      report_count: item.reports.size,
      vessel_count: item.vessels.size,
      avg_obs_report: item.reports.size ? item.observations / item.reports.size : 0,
    }));
  }

  function buildTopQuestions(rows) {
    const map = new Map();

    for (const row of rows) {
      const q = qno(row) || "—";
      if (!map.has(q)) {
        map.set(q, {
          qno: q,
          observations: 0,
          reports: new Set(),
          vessels: new Set(),
          rows: [],
          last_seen: "",
        });
      }

      const item = map.get(q);
      item.observations += 1;
      item.reports.add(reportKey(row));
      if (vesselKey(row)) item.vessels.add(vesselKey(row));
      item.rows.push(row);

      const d = eventDate(row);
      if (d && (!item.last_seen || d > item.last_seen)) item.last_seen = d;
    }

    return [...map.values()]
      .map((item) => ({
        ...item,
        report_count: item.reports.size,
        vessel_count: item.vessels.size,
        avg_obs_report: item.reports.size ? item.observations / item.reports.size : 0,
      }))
      .sort((a, b) => b.observations - a.observations || a.qno.localeCompare(b.qno));
  }

  function injectStyle() {
    if (document.getElementById("csvbSectorAnalyticsV01Style")) return;

    const style = document.createElement("style");
    style.id = "csvbSectorAnalyticsV01Style";
    style.textContent = `
      #csvbSectorAnalyticsPanelV01{
        margin:12px 0;
        border:1px solid #cfe0f4;
        border-radius:16px;
        background:#fff;
        box-shadow:0 4px 18px rgba(18,44,87,.10);
        padding:12px;
        color:#0a315f;
      }
      .csvb-sector-head{
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:flex-start;
        flex-wrap:wrap;
      }
      .csvb-sector-title{
        font-size:1.08rem;
        font-weight:950;
      }
      .csvb-sector-sub{
        font-size:.84rem;
        color:#48628e;
        font-weight:850;
        margin-top:3px;
      }
      .csvb-sector-controls{
        display:grid;
        grid-template-columns:180px 180px 160px 1fr;
        gap:10px;
        margin-top:12px;
        align-items:start;
      }
      .csvb-sector-field label{
        display:block;
        font-size:.82rem;
        font-weight:950;
        margin-bottom:4px;
      }
      .csvb-sector-field select{
        width:100%;
        min-height:36px;
        border:1px solid #bcd6ee;
        border-radius:9px;
        padding:6px 8px;
        font-weight:850;
        color:#123b65;
        background:#fff;
      }
      .csvb-sector-box{
        border:1px solid #d5deef;
        border-radius:12px;
        padding:8px;
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
        gap:6px 12px;
      }
      .csvb-sector-check{
        display:flex;
        gap:6px;
        align-items:center;
        font-weight:850;
        font-size:.86rem;
      }
      .csvb-sector-kpis{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
        gap:10px;
        margin-top:12px;
      }
      .csvb-sector-kpi{
        border:1px solid #cfe0f4;
        border-left:6px solid #2563eb;
        border-radius:14px;
        background:linear-gradient(180deg,#fff,#f8fbff);
        padding:12px;
      }
      .csvb-sector-kpi-n{
        font-size:1.45rem;
        font-weight:950;
        color:#062a5e;
      }
      .csvb-sector-kpi-l{
        margin-top:6px;
        color:#48628e;
        font-weight:850;
      }
      .csvb-sector-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:12px;
        margin-top:12px;
      }
      .csvb-sector-card{
        border:1px solid #cfe0f4;
        border-radius:14px;
        background:#fff;
        padding:10px;
      }
      .csvb-sector-card-title{
        font-weight:950;
        color:#062a5e;
        margin-bottom:4px;
      }
      .csvb-sector-small{
        color:#48628e;
        font-size:.82rem;
        font-weight:850;
      }
      .csvb-sector-table{
        width:100%;
        border-collapse:collapse;
        table-layout:fixed;
      }
      .csvb-sector-table th,
      .csvb-sector-table td{
        border-bottom:1px solid #dbe8f8;
        padding:7px;
        vertical-align:top;
        white-space:normal;
        overflow-wrap:anywhere;
        text-align:left;
      }
      .csvb-sector-bar{
        height:12px;
        border-radius:999px;
        background:#e8f0fb;
        overflow:hidden;
      }
      .csvb-sector-fill{
        height:100%;
        border-radius:999px;
      }
      .csvb-sector-modal{
        width:96vw;
        max-width:96vw;
        border:1px solid #cfe0f4;
        border-radius:16px;
        padding:0;
      }
      .csvb-sector-modal table{
        width:100%;
        table-layout:fixed;
        border-collapse:collapse;
      }
      .csvb-sector-modal th,
      .csvb-sector-modal td{
        border-bottom:1px solid #dbe8f8;
        padding:7px;
        white-space:normal;
        overflow-wrap:anywhere;
        vertical-align:top;
      }
      @media(max-width:1100px){
        .csvb-sector-controls{grid-template-columns:1fr;}
        .csvb-sector-grid{grid-template-columns:1fr;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbSectorAnalyticsPanelV01");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "csvbSectorAnalyticsPanelV01";
    panel.innerHTML = `
      <div class="csvb-sector-head">
        <div>
          <div class="csvb-sector-title">Sector Analytics</div>
          <div class="csvb-sector-sub">Navigation, Cargo and Mooring comparisons: Vetting vs Superintendent Audits vs Master Audits vs External Audits.</div>
        </div>
        <div class="csvb-sector-small">build: ${esc(BUILD)}</div>
      </div>

      <div class="csvb-sector-controls">
        <div class="csvb-sector-field">
          <label for="csvbSectorSelect">Sector</label>
          <select id="csvbSectorSelect">
            <option value="navigation" selected>Navigation — Chapter 4</option>
            <option value="cargo">Cargo — Chapter 8 + Q5.8.3</option>
            <option value="mooring">Mooring — Chapter 9</option>
          </select>
        </div>

        <div class="csvb-sector-field">
          <label for="csvbSectorGrouping">Trend grouping</label>
          <select id="csvbSectorGrouping">
            <option value="month" selected>Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Annual</option>
          </select>
        </div>

        <div class="csvb-sector-field">
          <label for="csvbSectorTopLimit">Top questions</label>
          <select id="csvbSectorTopLimit">
            <option value="10" selected>Top 10</option>
            <option value="25">Top 25</option>
            <option value="50">Top 50</option>
            <option value="all">All loaded</option>
          </select>
        </div>

        <div>
          <div class="csvb-sector-field"><label>Observation types</label></div>
          <div class="csvb-sector-box">
            <label class="csvb-sector-check"><input id="csvbSectorTypeNegative" type="checkbox" checked /> Negative</label>
            <label class="csvb-sector-check"><input id="csvbSectorTypeLargely" type="checkbox" /> Largely as expected</label>
            <label class="csvb-sector-check"><input id="csvbSectorTypePositive" type="checkbox" /> Positive</label>
          </div>
        </div>
      </div>

      <div class="csvb-sector-controls" style="grid-template-columns:1fr 1fr;">
        <div>
          <div class="csvb-sector-field"><label>Record sources</label></div>
          <div class="csvb-sector-box">
            ${SOURCE_OPTIONS.map(([key, label]) => `
              <label class="csvb-sector-check">
                <input id="csvbSectorSource_${esc(key)}" type="checkbox" checked />
                ${esc(label)}
              </label>
            `).join("")}
          </div>
        </div>

        <div>
          <div class="csvb-sector-field"><label>Mooring extension options</label></div>
          <div class="csvb-sector-box">
            <label class="csvb-sector-check"><input id="csvbSectorMooring581" type="checkbox" /> Include reviewed Q5.8.1 mooring-related items</label>
            <label class="csvb-sector-check"><input id="csvbSectorMooring585" type="checkbox" /> Include reviewed Q5.8.5 mooring-related items</label>
          </div>
          <div class="csvb-sector-small" style="margin-top:6px;">Q5.8.1 and Q5.8.5 are off by default pending quality review.</div>
        </div>
      </div>

      <div class="csvb-sector-kpis">
        <div class="csvb-sector-kpi"><div class="csvb-sector-kpi-n" id="csvbSectorKpiObs">0</div><div class="csvb-sector-kpi-l">Findings / observations</div></div>
        <div class="csvb-sector-kpi"><div class="csvb-sector-kpi-n" id="csvbSectorKpiReports">0</div><div class="csvb-sector-kpi-l">Inspections / audits</div></div>
        <div class="csvb-sector-kpi"><div class="csvb-sector-kpi-n" id="csvbSectorKpiAvg">0.00</div><div class="csvb-sector-kpi-l">Avg findings per inspection/audit</div></div>
        <div class="csvb-sector-kpi"><div class="csvb-sector-kpi-n" id="csvbSectorKpiVessels">0</div><div class="csvb-sector-kpi-l">Vessels represented</div></div>
        <div class="csvb-sector-kpi"><div class="csvb-sector-kpi-n" id="csvbSectorKpiTopQ">—</div><div class="csvb-sector-kpi-l">Top recurring question</div></div>
      </div>

      <div class="csvb-sector-grid">
        <div class="csvb-sector-card">
          <div class="csvb-sector-card-title">Source Comparison</div>
          <div class="csvb-sector-small">Vetting vs Superintendent / Master / External under the selected sector.</div>
          <div id="csvbSectorSourceComparison"></div>
        </div>

        <div class="csvb-sector-card">
          <div class="csvb-sector-card-title">Pairwise Comparison</div>
          <div class="csvb-sector-controls" style="grid-template-columns:1fr 1fr;">
            <div class="csvb-sector-field">
              <label for="csvbSectorPairA">Source A</label>
              <select id="csvbSectorPairA">
                ${SOURCE_OPTIONS.map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("")}
              </select>
            </div>
            <div class="csvb-sector-field">
              <label for="csvbSectorPairB">Source B</label>
              <select id="csvbSectorPairB">
                ${SOURCE_OPTIONS.map(([key, label], idx) => `<option value="${esc(key)}" ${idx === 1 ? "selected" : ""}>${esc(label)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div id="csvbSectorPairwise"></div>
        </div>
      </div>

      <div class="csvb-sector-card" style="margin-top:12px;">
        <div class="csvb-sector-card-title">Sector Trend</div>
        <div class="csvb-sector-small">Trend by selected grouping. Values are finding / observation counts per source.</div>
        <div id="csvbSectorTrend"></div>
      </div>

      <div class="csvb-sector-card" style="margin-top:12px;">
        <div class="csvb-sector-card-title">Top Recurring Sector Questions</div>
        <div class="csvb-sector-small">Dominant questions within the selected sector and filters.</div>
        <div id="csvbSectorTopQuestions"></div>
      </div>
    `;

    const mscat = document.getElementById("mscatAnalyticsPanel");
    if (mscat && mscat.parentNode) {
      mscat.parentNode.insertBefore(panel, mscat);
    } else {
      const root = document.getElementById("csvbStatsDashboardLayoutV03") || document.body;
      root.appendChild(panel);
    }

    panel.querySelectorAll("select,input").forEach((node) => {
      node.addEventListener("change", render);
    });

    return panel;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function renderKpis(rows, topQuestions) {
    const reportSet = new Set(rows.map(reportKey).filter(Boolean));
    const vesselSet = new Set(rows.map(vesselKey).filter(Boolean));

    setText("csvbSectorKpiObs", rows.length);
    setText("csvbSectorKpiReports", reportSet.size);
    setText("csvbSectorKpiAvg", avg(rows.length, reportSet.size));
    setText("csvbSectorKpiVessels", vesselSet.size);
    setText("csvbSectorKpiTopQ", topQuestions[0]?.qno || "—");
  }

  function renderSourceComparison(rows) {
    const box = document.getElementById("csvbSectorSourceComparison");
    if (!box) return;

    const metrics = buildSourceMetrics(rows);
    const max = Math.max(...metrics.map((m) => m.observations), 1);

    box.innerHTML = `
      <table class="csvb-sector-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Obs.</th>
            <th>Reports</th>
            <th>Avg</th>
            <th>Vessels</th>
          </tr>
        </thead>
        <tbody>
          ${metrics.map((m) => {
            const pct = Math.max(3, Math.round((m.observations / max) * 100));
            return `
              <tr>
                <td>
                  <div style="font-weight:950;">${esc(m.label)}</div>
                  <div class="csvb-sector-bar"><div class="csvb-sector-fill" style="width:${pct}%;background:${esc(sourceColour(m.key))};"></div></div>
                </td>
                <td>${esc(m.observations)}</td>
                <td>${esc(m.report_count)}</td>
                <td>${esc(m.avg_obs_report.toFixed(2))}</td>
                <td>${esc(m.vessel_count)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function renderPairwise(rows) {
    const box = document.getElementById("csvbSectorPairwise");
    if (!box) return;

    const a = String(document.getElementById("csvbSectorPairA")?.value || "vetting_inspection");
    let b = String(document.getElementById("csvbSectorPairB")?.value || "audit_internal_superintendent");

    if (a === b) {
      b = SOURCE_OPTIONS.find(([key]) => key !== a)?.[0] || "audit_internal_superintendent";
      const bNode = document.getElementById("csvbSectorPairB");
      if (bNode) bNode.value = b;
    }

    const metrics = new Map(buildSourceMetrics(rows).map((m) => [m.key, m]));
    const ma = metrics.get(a) || { observations: 0, report_count: 0, avg_obs_report: 0 };
    const mb = metrics.get(b) || { observations: 0, report_count: 0, avg_obs_report: 0 };

    const diffObs = Number(ma.observations || 0) - Number(mb.observations || 0);
    const diffAvg = Number(ma.avg_obs_report || 0) - Number(mb.avg_obs_report || 0);
    const ratioAvg = Number(mb.avg_obs_report || 0) ? Number(ma.avg_obs_report || 0) / Number(mb.avg_obs_report || 0) : null;

    box.innerHTML = `
      <table class="csvb-sector-table" style="margin-top:8px;">
        <thead>
          <tr>
            <th>Metric</th>
            <th>${esc(sourceLabel(a))}</th>
            <th>${esc(sourceLabel(b))}</th>
            <th>Diff A-B</th>
            <th>Ratio A/B</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Observations</td><td>${esc(ma.observations || 0)}</td><td>${esc(mb.observations || 0)}</td><td>${esc(diffObs)}</td><td>${esc(mb.observations ? (ma.observations / mb.observations).toFixed(2) : "N/A")}</td></tr>
          <tr><td>Reports / audits</td><td>${esc(ma.report_count || 0)}</td><td>${esc(mb.report_count || 0)}</td><td>${esc((ma.report_count || 0) - (mb.report_count || 0))}</td><td>${esc(mb.report_count ? (ma.report_count / mb.report_count).toFixed(2) : "N/A")}</td></tr>
          <tr><td>Avg obs/report</td><td>${esc(Number(ma.avg_obs_report || 0).toFixed(2))}</td><td>${esc(Number(mb.avg_obs_report || 0).toFixed(2))}</td><td>${esc(diffAvg.toFixed(2))}</td><td>${esc(ratioAvg == null ? "N/A" : ratioAvg.toFixed(2))}</td></tr>
        </tbody>
      </table>
    `;
  }

  function renderTrend(rows) {
    const box = document.getElementById("csvbSectorTrend");
    if (!box) return;

    const map = new Map();

    for (const row of rows) {
      const b = bucket(row);
      const s = sourceKey(row);
      const key = `${b}::${s}`;

      if (!map.has(key)) map.set(key, { bucket: b, source: s, count: 0 });
      map.get(key).count += 1;
    }

    const buckets = [...new Set([...map.values()].map((x) => x.bucket))].sort();
    const sources = [...selectedSources()];
    const max = Math.max(...[...map.values()].map((x) => x.count), 1);

    if (!buckets.length) {
      box.innerHTML = `<div class="csvb-sector-small">No sector trend data for current filters.</div>`;
      return;
    }

    box.innerHTML = `
      <div style="display:grid;gap:8px;margin-top:8px;">
        ${buckets.map((b) => `
          <div style="display:grid;grid-template-columns:90px 1fr;gap:10px;align-items:center;">
            <div style="font-weight:950;color:#1a4170;">${esc(b)}</div>
            <div style="display:grid;gap:4px;">
              ${sources.map((s) => {
                const val = map.get(`${b}::${s}`)?.count || 0;
                const pct = val ? Math.max(3, Math.round((val / max) * 100)) : 0;
                return `
                  <div style="display:grid;grid-template-columns:150px 1fr 42px;gap:8px;align-items:center;">
                    <div class="csvb-sector-small">${esc(sourceLabel(s))}</div>
                    <div class="csvb-sector-bar"><div class="csvb-sector-fill" style="width:${pct}%;background:${esc(sourceColour(s))};"></div></div>
                    <div class="csvb-sector-small" style="text-align:right;">${esc(val)}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function ensureModal() {
    let modal = document.getElementById("csvbSectorRecordsModal");
    if (modal) return modal;

    modal = document.createElement("dialog");
    modal.id = "csvbSectorRecordsModal";
    modal.className = "csvb-sector-modal";
    modal.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #dbe8f8;display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-weight:950;color:#082d57;font-size:1.05rem;" id="csvbSectorModalTitle">Sector records</div>
          <div style="font-weight:800;color:#55708f;font-size:.86rem;" id="csvbSectorModalSub">Related observations</div>
        </div>
        <button class="btn btn-muted" type="button" id="csvbSectorModalClose">Close</button>
      </div>
      <div style="padding:12px 16px;max-height:70vh;overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>Source</th><th>Vessel</th><th>Date</th><th>Question</th><th>Type</th><th>Category</th><th>SOC</th><th>NOC</th><th>Observation</th>
            </tr>
          </thead>
          <tbody id="csvbSectorModalTbody"></tbody>
        </table>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("csvbSectorModalClose")?.addEventListener("click", () => modal.close());
    return modal;
  }

  function openRecords(title, rows) {
    const modal = ensureModal();
    const tbody = document.getElementById("csvbSectorModalTbody");

    document.getElementById("csvbSectorModalTitle").textContent = title;
    document.getElementById("csvbSectorModalSub").textContent = `${rows.length} related observation(s).`;

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(sourceLabel(sourceKey(row)))}</td>
        <td>${esc(row.vessel_name || "")}</td>
        <td>${esc(eventDate(row))}</td>
        <td>${esc(qno(row))}</td>
        <td>${esc(row.observation_type || "")}</td>
        <td>${esc(row.designation || "")}</td>
        <td>${esc(row.soc || row.nature_of_concern || "")}</td>
        <td>${esc(row.noc || row.classification_coding || "")}</td>
        <td>${esc(row.remarks || row.observation_text || "")}</td>
      </tr>
    `).join("") || `<tr><td colspan="9">No records.</td></tr>`;

    modal.showModal();
  }

  function renderTopQuestions(topRows) {
    const box = document.getElementById("csvbSectorTopQuestions");
    if (!box) return;

    const limit = topLimit();
    const rows = Number.isFinite(limit) ? topRows.slice(0, limit) : topRows;
    const max = Math.max(...rows.map((r) => r.observations), 1);

    if (!rows.length) {
      box.innerHTML = `<div class="csvb-sector-small">No recurring sector questions for current filters.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="csvb-sector-table" style="margin-top:8px;">
        <thead>
          <tr>
            <th>Question</th>
            <th>Bar</th>
            <th>Obs.</th>
            <th>Reports</th>
            <th>Avg</th>
            <th>Vessels</th>
            <th>Last seen</th>
            <th>Records</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, idx) => {
            const pct = Math.max(3, Math.round((r.observations / max) * 100));
            return `
              <tr>
                <td style="font-weight:950;">${esc(r.qno)}</td>
                <td><div class="csvb-sector-bar"><div class="csvb-sector-fill" style="width:${pct}%;background:#2563eb;"></div></div></td>
                <td>${esc(r.observations)}</td>
                <td>${esc(r.report_count)}</td>
                <td>${esc(r.avg_obs_report.toFixed(2))}</td>
                <td>${esc(r.vessel_count)}</td>
                <td>${esc(r.last_seen || "")}</td>
                <td><button class="btn btn-muted btn-small" data-csvb-sector-q-index="${esc(idx)}" type="button">View</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-csvb-sector-q-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-csvb-sector-q-index"));
        const item = rows[idx];
        openRecords(`Sector question: ${item.qno}`, item.rows || []);
      });
    });
  }

  function render() {
    injectStyle();
    ensurePanel();

    const rows = sectorRows();
    const topQuestions = buildTopQuestions(rows);

    renderKpis(rows, topQuestions);
    renderSourceComparison(rows);
    renderPairwise(rows);
    renderTrend(rows);
    renderTopQuestions(topQuestions);
  }

  function start() {
    ensurePanel();
    render();
    window.addEventListener("csvb:post-stats-snapshot", render);
    setTimeout(render, 500);
    setTimeout(render, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
