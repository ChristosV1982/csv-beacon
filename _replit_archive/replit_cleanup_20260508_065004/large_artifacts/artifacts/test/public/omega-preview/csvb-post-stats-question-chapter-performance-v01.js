// C.S.V. BEACON - Post Stats Question / Chapter Performance v01
// Safe display helper. Reads existing post-inspection stats snapshot.
// No database writes. No changes to post_inspection_stats.js.

(function () {
  "use strict";

  const BUILD = "POST-STATS-QUESTION-CHAPTER-PERFORMANCE-V03-LEGACY-CLEANUP-20260811";
  window.CSVB_POST_STATS_QCP_BUILD = BUILD;

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

  const CHAPTER_NAMES = {
    "1": "General Information",
    "2": "Certification and Documentation",
    "3": "Crew Management",
    "4": "Navigation and Communications",
    "5": "Safety Management",
    "6": "Pollution Prevention",
    "7": "Structural Condition",
    "8": "Cargo and Ballast Systems",
    "9": "Mooring and Anchoring",
    "10": "Engine and Steering Compartments",
    "11": "General Appearance and Condition",
    "12": "Ice Operations",
    "13": "Chemical Cargo Operations",
    "14": "Liquefied Gas Cargo Operations"
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

    if (Array.isArray(s.combinedRows) && s.combinedRows.length) return s.combinedRows;
    if (Array.isArray(s.rowsIgnoreType) && s.rowsIgnoreType.length) return s.rowsIgnoreType;
    if (Array.isArray(s.allRows) && s.allRows.length) return s.allRows;
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
    const raw = String(
      row?.record_source ||
      row?.source_group ||
      row?.audit_source_key ||
      row?.audit_source ||
      ""
    ).trim().toLowerCase();

    const sourceText = [
      row?.record_source_label,
      row?.audit_source,
      row?.audit_source_name,
      row?.audit_by,
      row?.auditor,
      row?.inspector_auditor,
      row?.title,
      row?.audit_type,
      row?.audit_type_name,
      row?.report_title,
      row?.report_ref,
      row?.reference,
    ].map((x) => String(x || "").toLowerCase()).join(" ");

    if (raw === "vetting_inspection" || raw.includes("vetting")) return "vetting_inspection";
    if (raw === "audit_internal_superintendent" || sourceText.includes("superintendent") || sourceText.includes("mrn.")) return "audit_internal_superintendent";
    if (raw === "audit_internal_master" || sourceText.includes("master") || sourceText.includes("mstr.")) return "audit_internal_master";
    if (raw === "audit_external_contractor" || raw.includes("external") || sourceText.includes("external") || sourceText.includes("real-time") || sourceText.includes("real time")) return "audit_external_contractor";

    return raw || "vetting_inspection";
  }

  function sourceLabel(key) {
    return SOURCE_OPTIONS.find((x) => x[0] === key)?.[1] || key || "Unknown";
  }

  function sourceColour(key) {
    return SOURCE_COLOURS[key] || "#64748b";
  }

  function qno(row) {
    return String(
      row?.question_no ||
      row?.question_base ||
      row?.sire_question_no_normalized ||
      row?.checklist_no_raw ||
      row?.source_question_no ||
      row?.question_meta?.qno ||
      ""
    ).trim();
  }

  function qMeta(row) {
    const q = qno(row);
    const s = snap();
    return row?.question_meta || s?.questionMetaByNo?.[q] || {};
  }

  function chapterNo(row) {
    const q = qno(row);
    const meta = qMeta(row);
    const raw = String(meta?.chapter || row?.chapter || "").trim() || String(q.split(".")[0] || "").trim();

    if (!raw) return "Unknown";
    const normal = raw.replace(/^chapter\s*/i, "").replace(/^0+/, "");
    return normal || "Unknown";
  }

  function chapterLabel(rowOrChapter) {
    const ch = typeof rowOrChapter === "string" ? rowOrChapter : chapterNo(rowOrChapter);
    if (!ch || ch === "Unknown") return "Unknown chapter";
    return `Chapter ${ch}${CHAPTER_NAMES[ch] ? " — " + CHAPTER_NAMES[ch] : ""}`;
  }

  function shortText(row) {
    const meta = qMeta(row);
    return String(
      meta?.short_text ||
      meta?.shortText ||
      row?.short_text ||
      row?.question_short_text ||
      row?.inspection_marker ||
      ""
    ).trim();
  }

  function sectionText(row) {
    const meta = qMeta(row);
    return String(meta?.section || row?.section || "").trim();
  }

  function reportKey(row) {
    return [
      sourceKey(row),
      row?.report_id,
      row?.source_report_id,
      row?.report_ref,
      row?.reference,
      row?.vessel_name,
      eventDate(row),
    ].filter(Boolean).join("::");
  }

  function vesselKey(row) {
    return String(row?.vessel_name || row?.vessel_id || "").trim();
  }

  function eventDate(row) {
    return String(row?.inspection_date || row?.audit_date || row?.event_date || row?.date || "").slice(0, 10);
  }

  function inDateRange(row) {
    const d = eventDate(row);
    const { from, to } = currentDateRange();
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function selectedMode() {
    return String(document.getElementById("csvbQcpMode")?.value || "both").trim();
  }

  function selectedGrouping() {
    return String(document.getElementById("csvbQcpGrouping")?.value || "month").trim();
  }

  function selectedTopLimit() {
    const raw = String(document.getElementById("csvbQcpTopLimit")?.value || "10").trim();
    if (raw === "all") return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  function selectedTypes() {
    const out = [];
    if (document.getElementById("csvbQcpTypeNegative")?.checked) out.push("negative");
    if (document.getElementById("csvbQcpTypeLargely")?.checked) out.push("largely");
    if (document.getElementById("csvbQcpTypePositive")?.checked) out.push("positive");
    return out.length ? new Set(out) : new Set(["negative"]);
  }

  function selectedSources() {
    const out = [];
    SOURCE_OPTIONS.forEach(([key]) => {
      if (document.getElementById(`csvbQcpSource_${key}`)?.checked) out.push(key);
    });
    return out.length ? new Set(out) : new Set(SOURCE_OPTIONS.map((x) => x[0]));
  }

  function filteredRows() {
    const types = selectedTypes();
    const sources = selectedSources();

    return rowsFromSnapshot().filter((row) => {
      if (!inDateRange(row)) return false;
      if (!types.has(normaliseType(row.observation_type))) return false;
      if (!sources.has(sourceKey(row))) return false;
      return true;
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

  function buildQuestionGroups(rows) {
    const map = new Map();

    for (const row of rows) {
      const q = qno(row) || "Unmapped audit finding";
      if (!map.has(q)) {
        map.set(q, {
          key: q,
          qno: q,
          chapter: chapterNo(row),
          chapter_label: chapterLabel(row),
          section: sectionText(row),
          short: shortText(row),
          observations: 0,
          reports: new Set(),
          vessels: new Set(),
          sources: new Map(),
          last_seen: "",
          rows: [],
        });
      }

      const item = map.get(q);
      item.observations += 1;
      item.reports.add(reportKey(row));
      if (vesselKey(row)) item.vessels.add(vesselKey(row));

      const s = sourceKey(row);
      item.sources.set(s, (item.sources.get(s) || 0) + 1);

      const d = eventDate(row);
      if (d && (!item.last_seen || d > item.last_seen)) item.last_seen = d;

      item.rows.push(row);
    }

    return [...map.values()]
      .map((x) => ({
        ...x,
        report_count: x.reports.size,
        vessel_count: x.vessels.size,
        avg_obs_report: x.reports.size ? x.observations / x.reports.size : 0,
      }))
      .sort((a, b) => b.observations - a.observations || a.key.localeCompare(b.key));
  }

  function buildChapterGroups(rows) {
    const map = new Map();

    for (const row of rows) {
      const ch = chapterNo(row);
      const label = chapterLabel(ch);

      if (!map.has(ch)) {
        map.set(ch, {
          key: ch,
          label,
          observations: 0,
          reports: new Set(),
          vessels: new Set(),
          questions: new Set(),
          sources: new Map(),
          last_seen: "",
          rows: [],
        });
      }

      const item = map.get(ch);
      item.observations += 1;
      item.reports.add(reportKey(row));
      if (vesselKey(row)) item.vessels.add(vesselKey(row));
      if (qno(row)) item.questions.add(qno(row));

      const s = sourceKey(row);
      item.sources.set(s, (item.sources.get(s) || 0) + 1);

      const d = eventDate(row);
      if (d && (!item.last_seen || d > item.last_seen)) item.last_seen = d;

      item.rows.push(row);
    }

    return [...map.values()]
      .map((x) => ({
        ...x,
        report_count: x.reports.size,
        vessel_count: x.vessels.size,
        question_count: x.questions.size,
        avg_obs_report: x.reports.size ? x.observations / x.reports.size : 0,
      }))
      .sort((a, b) => b.observations - a.observations || String(a.key).localeCompare(String(b.key), undefined, { numeric: true }));
  }

  function injectStyle() {
    if (document.getElementById("csvbQcpStyleV01")) return;

    const style = document.createElement("style");
    style.id = "csvbQcpStyleV01";
    style.textContent = `
      #csvbQcpPanelV01{
        border:1px solid #cfe0f4;
        border-radius:16px;
        background:#fff;
        box-shadow:0 4px 18px rgba(18,44,87,.10);
        padding:8px 10px;
        color:#062A5E;
      }
      .csvb-qcp-head{
        width:100%;
        border:0;
        background:linear-gradient(180deg,#fff,#f4f8ff);
        padding:8px 48px 8px 10px;
        text-align:left;
        position:relative;
        border-radius:12px;
        cursor:pointer;
      }
      .csvb-qcp-title{font-size:1.05rem;font-weight:950;color:#062A5E;}
      .csvb-qcp-sub{font-size:.78rem;font-weight:850;color:#48628e;line-height:1.25;margin-top:2px;}
      .csvb-qcp-icon{
        position:absolute;
        right:12px;
        top:50%;
        transform:translateY(-50%);
        font-weight:950;
        border:1px solid #bfe0f5;
        background:#eaf5ff;
        border-radius:999px;
        padding:3px 9px;
      }
      .csvb-qcp-controls{
        display:grid;
        grid-template-columns:150px 150px 130px 1fr;
        gap:7px;
        margin-top:8px;
        align-items:start;
      }
      .csvb-qcp-field label{
        display:block;
        margin-bottom:3px;
        color:#1a4170;
        font-size:.76rem;
        font-weight:950;
      }
      .csvb-qcp-field select{
        width:100%;
        min-height:31px;
        border:1px solid #bcd6ee;
        border-radius:8px;
        padding:4px 8px;
        color:#123b65;
        background:#fff;
        font-size:.8rem;
        font-weight:850;
      }
      .csvb-qcp-box{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(185px,1fr));
        gap:5px 10px;
        padding:6px 8px;
        min-height:0;
        align-items:center;
        border:1px solid #d5deef;
        border-radius:10px;
        background:#fff;
      }
      .csvb-qcp-check{
        display:grid;
        grid-template-columns:18px minmax(0,1fr);
        gap:7px;
        align-items:center;
        min-height:26px;
        margin:0;
        padding:3px 5px;
        border-radius:9px;
        color:#062A5E;
        font-size:.78rem;
        font-weight:850;
        line-height:1.15;
        cursor:pointer;
      }
      .csvb-qcp-check:hover{background:#F0FBFC;}
      .csvb-qcp-check input[type="checkbox"]{
        appearance:none;
        -webkit-appearance:none;
        width:16px!important;
        min-width:16px!important;
        max-width:16px!important;
        height:16px!important;
        min-height:16px!important;
        max-height:16px!important;
        margin:0!important;
        padding:0!important;
        border:1px solid #AFCBE8!important;
        border-radius:5px!important;
        background:#fff!important;
        display:inline-block!important;
        position:relative!important;
        cursor:pointer!important;
      }
      .csvb-qcp-check input[type="checkbox"]:checked{
        border-color:#0097A7!important;
        background:#062A5E!important;
        box-shadow:0 0 0 2px rgba(0,151,167,.13)!important;
      }
      .csvb-qcp-check input[type="checkbox"]:checked::after{
        content:"";
        position:absolute;
        left:4px;
        top:1px;
        width:5px;
        height:9px;
        border:solid #fff;
        border-width:0 2px 2px 0;
        transform:rotate(45deg);
      }
      .csvb-qcp-kpis{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(165px,1fr));
        gap:7px;
        margin-top:8px;
      }
      .csvb-qcp-kpi{
        border:1px solid #cfe0f4;
        border-left:6px solid #2563eb;
        border-radius:12px;
        background:linear-gradient(180deg,#fff,#f8fbff);
        padding:8px 10px;
      }
      .csvb-qcp-kpi-n{font-size:1.15rem;font-weight:950;color:#062A5E;}
      .csvb-qcp-kpi-l{margin-top:4px;font-size:.78rem;color:#48628e;font-weight:850;}
      .csvb-qcp-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        margin-top:10px;
      }
      .csvb-qcp-card{
        border:1px solid #cfe0f4;
        border-radius:14px;
        background:#fff;
        padding:10px;
      }
      .csvb-qcp-card-title{
        font-weight:950;
        color:#062A5E;
        margin-bottom:4px;
      }
      .csvb-qcp-small{
        color:#48628e;
        font-size:.76rem;
        font-weight:850;
        line-height:1.25;
      }
      .csvb-qcp-table{
        width:100%;
        border-collapse:collapse;
        table-layout:fixed;
        margin-top:8px;
      }
      .csvb-qcp-table th,
      .csvb-qcp-table td{
        border-bottom:1px solid #dbe8f8;
        padding:7px;
        vertical-align:top;
        white-space:normal;
        overflow-wrap:anywhere;
        text-align:left;
      }
      .csvb-qcp-table th{
        background:#eef6ff;
        color:#062A5E;
        font-weight:950;
      }
      .csvb-qcp-bar{
        height:11px;
        border-radius:999px;
        background:#e8f0fb;
        overflow:hidden;
      }
      .csvb-qcp-fill{
        height:100%;
        border-radius:999px;
      }
      .csvb-qcp-modal{
        width:96vw;
        max-width:96vw;
        border:1px solid #cfe0f4;
        border-radius:16px;
        padding:0;
      }
      .csvb-qcp-modal table{
        width:100%;
        table-layout:fixed;
        border-collapse:collapse;
      }
      .csvb-qcp-modal th,
      .csvb-qcp-modal td{
        border-bottom:1px solid #dbe8f8;
        padding:7px;
        white-space:normal;
        overflow-wrap:anywhere;
        vertical-align:top;
      }
      @media(max-width:1100px){
        .csvb-qcp-controls{grid-template-columns:1fr;}
        .csvb-qcp-grid{grid-template-columns:1fr;}
      }
    `;
    document.head.appendChild(style);
  }

  function hideLegacyQuestionChapter() {
    /*
      Hide only legacy Question/Chapter visual helpers. Do not hide the dashboard
      group or the group body. QCP V03 replaces these legacy visuals.
    */
    const qcpPanel = document.getElementById("csvbQcpPanelV01");

    const hideNode = (node) => {
      if (!node || qcpPanel?.contains(node)) return;
      node.style.display = "none";
      node.dataset.csvbQcpLegacyHidden = "1";
    };

    const topTbody = document.getElementById("topQnsTbody");
    const topTable = topTbody?.closest("table");
    hideNode(topTable);

    const chapter = document.getElementById("csvbStatsChapterSharePanelV01");
    hideNode(chapter);

    /*
      Older helper: csvb-post-inspection-stats-top-recurring-bars-v01.js
      It has varied root markup across prior builds, so detect it by title text
      inside the Question dashboard group only.
    */
    const groupBody = qcpDashboardBody();
    if (groupBody) {
      [...groupBody.querySelectorAll("*")].forEach((node) => {
        if (!node || qcpPanel?.contains(node)) return;

        const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) return;

        const isOldTopRecurring =
          /^Top Recurring Questions\b/i.test(text) &&
          !node.closest("#csvbQcpPanelV01");

        const isOldSireChapterShare =
          /^SIRE Chapter Share\b/i.test(text) &&
          !node.closest("#csvbQcpPanelV01");

        if (isOldTopRecurring || isOldSireChapterShare) {
          const host =
            node.closest(".csvb-visual-section") ||
            node.closest(".csvb-stats-layout-collapsible") ||
            node.closest(".panel") ||
            node.closest("section") ||
            node.parentElement;

          hideNode(host);
        }
      });
    }
  }

  function qcpDashboardBody() {
    return document.querySelector("#csvbDashboardGroup_question .csvb-dashboard-group-body");
  }

  function mountQcpPanel(panel) {
    const body = qcpDashboardBody();
    if (!body || !panel) return false;

    if (panel.parentElement !== body || body.firstElementChild !== panel) {
      body.prepend(panel);
    }

    panel.style.display = "";
    return true;
  }

  function ensurePanel() {
    let panel = document.getElementById("csvbQcpPanelV01");
    if (panel) {
      mountQcpPanel(panel);
      panel.style.display = "";
      return panel;
    }

    panel = document.createElement("section");
    panel.id = "csvbQcpPanelV01";
    panel.innerHTML = `
      <button class="csvb-qcp-head" id="csvbQcpHead" type="button">
        <div class="csvb-qcp-title">Question / Chapter Performance</div>
        <div class="csvb-qcp-sub">Recurring questions, chapter distribution, source comparisons and trends for the selected scope.</div>
        <span class="csvb-qcp-icon" id="csvbQcpIcon">+</span>
      </button>

      <div id="csvbQcpBody" hidden>
        <div class="csvb-qcp-small" style="text-align:right;margin-top:4px;">build: ${esc(BUILD)}</div>

        <div class="csvb-qcp-controls">
          <div class="csvb-qcp-field">
            <label for="csvbQcpMode">Display mode</label>
            <select id="csvbQcpMode">
              <option value="both" selected>Questions + Chapters</option>
              <option value="questions">Questions only</option>
              <option value="chapters">Chapters only</option>
            </select>
          </div>

          <div class="csvb-qcp-field">
            <label for="csvbQcpGrouping">Trend grouping</label>
            <select id="csvbQcpGrouping">
              <option value="month" selected>Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Annual</option>
            </select>
          </div>

          <div class="csvb-qcp-field">
            <label for="csvbQcpTopLimit">Top list</label>
            <select id="csvbQcpTopLimit">
              <option value="10" selected>Top 10</option>
              <option value="25">Top 25</option>
              <option value="50">Top 50</option>
              <option value="all">All loaded</option>
            </select>
          </div>

          <div>
            <div class="csvb-qcp-field"><label>Observation types</label></div>
            <div class="csvb-qcp-box">
              <label class="csvb-qcp-check"><input id="csvbQcpTypeNegative" type="checkbox" checked /> Negative</label>
              <label class="csvb-qcp-check"><input id="csvbQcpTypeLargely" type="checkbox" /> Largely as expected</label>
              <label class="csvb-qcp-check"><input id="csvbQcpTypePositive" type="checkbox" /> Positive</label>
            </div>
          </div>
        </div>

        <div class="csvb-qcp-controls" style="grid-template-columns:1fr;">
          <div>
            <div class="csvb-qcp-field"><label>Record sources</label></div>
            <div class="csvb-qcp-box">
              ${SOURCE_OPTIONS.map(([key, label]) => `
                <label class="csvb-qcp-check">
                  <input id="csvbQcpSource_${esc(key)}" type="checkbox" checked />
                  ${esc(label)}
                </label>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="csvb-qcp-kpis">
          <div class="csvb-qcp-kpi"><div class="csvb-qcp-kpi-n" id="csvbQcpKpiObs">0</div><div class="csvb-qcp-kpi-l">Findings / observations</div></div>
          <div class="csvb-qcp-kpi"><div class="csvb-qcp-kpi-n" id="csvbQcpKpiReports">0</div><div class="csvb-qcp-kpi-l">Reports / audits</div></div>
          <div class="csvb-qcp-kpi"><div class="csvb-qcp-kpi-n" id="csvbQcpKpiAvg">0.00</div><div class="csvb-qcp-kpi-l">Avg findings per report</div></div>
          <div class="csvb-qcp-kpi"><div class="csvb-qcp-kpi-n" id="csvbQcpKpiQuestions">0</div><div class="csvb-qcp-kpi-l">Distinct questions</div></div>
          <div class="csvb-qcp-kpi"><div class="csvb-qcp-kpi-n" id="csvbQcpKpiTopQ">—</div><div class="csvb-qcp-kpi-l">Top recurring question</div></div>
          <div class="csvb-qcp-kpi"><div class="csvb-qcp-kpi-n" id="csvbQcpKpiTopChapter">—</div><div class="csvb-qcp-kpi-l">Top chapter</div></div>
        </div>

        <div class="csvb-qcp-grid">
          <div class="csvb-qcp-card" id="csvbQcpQuestionsCard">
            <div class="csvb-qcp-card-title">Top Recurring Questions</div>
            <div class="csvb-qcp-small">Repeated question references in the selected Vetting/Audit source scope.</div>
            <div id="csvbQcpQuestions"></div>
          </div>

          <div class="csvb-qcp-card" id="csvbQcpChaptersCard">
            <div class="csvb-qcp-card-title">Chapter Distribution</div>
            <div class="csvb-qcp-small">Chapter share and source split for selected records.</div>
            <div id="csvbQcpChapters"></div>
          </div>
        </div>

        <div class="csvb-qcp-card" style="margin-top:10px;">
          <div class="csvb-qcp-card-title">Question / Chapter Trend</div>
          <div class="csvb-qcp-small">Trend by selected grouping. Default view uses the highest-volume chapter/question depending on display mode.</div>
          <div id="csvbQcpTrend"></div>
        </div>
      </div>
    `;

    const legacyTbody = document.getElementById("topQnsTbody");
    const dashboardBody = qcpDashboardBody();

    if (dashboardBody) {
      dashboardBody.prepend(panel);
    } else if (legacyTbody?.closest("table")?.parentElement) {
      legacyTbody.closest("table").parentElement.insertAdjacentElement("beforebegin", panel);
    } else {
      const sector = document.getElementById("csvbSectorAnalyticsPanelV01");
      if (sector?.parentElement) sector.parentElement.insertBefore(panel, sector);
      else document.body.appendChild(panel);
    }

    panel.style.display = "";

    const head = panel.querySelector("#csvbQcpHead");
    const body = panel.querySelector("#csvbQcpBody");
    const icon = panel.querySelector("#csvbQcpIcon");

    head.addEventListener("click", () => {
      body.hidden = !body.hidden;
      icon.textContent = body.hidden ? "+" : "−";
    });

    panel.querySelectorAll("select,input").forEach((node) => {
      node.addEventListener("change", render);
    });

    return panel;
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
  }

  function renderKpis(rows, questions, chapters) {
    const reportSet = new Set(rows.map(reportKey).filter(Boolean));
    const questionSet = new Set(rows.map(qno).filter(Boolean));

    setText("csvbQcpKpiObs", rows.length);
    setText("csvbQcpKpiReports", reportSet.size);
    setText("csvbQcpKpiAvg", avg(rows.length, reportSet.size));
    setText("csvbQcpKpiQuestions", questionSet.size);
    setText("csvbQcpKpiTopQ", questions[0]?.qno || "—");
    setText("csvbQcpKpiTopChapter", chapters[0]?.key && chapters[0].key !== "Unknown" ? `Ch. ${chapters[0].key}` : "—");
  }

  function sourceMiniBars(item, max) {
    const sources = [...selectedSources()];
    return `
      <div style="display:grid;gap:4px;">
        ${sources.map((s) => {
          const val = item.sources?.get?.(s) || 0;
          const pct = val ? Math.max(3, Math.round((val / max) * 100)) : 0;
          return `
            <div style="display:grid;grid-template-columns:120px 1fr 32px;gap:6px;align-items:center;">
              <div class="csvb-qcp-small">${esc(sourceLabel(s))}</div>
              <div class="csvb-qcp-bar"><div class="csvb-qcp-fill" style="width:${pct}%;background:${esc(sourceColour(s))};"></div></div>
              <div class="csvb-qcp-small" style="text-align:right;">${esc(val)}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function ensureModal() {
    let modal = document.getElementById("csvbQcpRecordsModal");
    if (modal) return modal;

    modal = document.createElement("dialog");
    modal.id = "csvbQcpRecordsModal";
    modal.className = "csvb-qcp-modal";
    modal.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #dbe8f8;display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-weight:950;color:#082d57;font-size:1.05rem;" id="csvbQcpModalTitle">Question / Chapter records</div>
          <div style="font-weight:800;color:#55708f;font-size:.86rem;" id="csvbQcpModalSub">Related observations</div>
        </div>
        <button class="btn btn-muted" type="button" id="csvbQcpModalClose">Close</button>
      </div>
      <div style="padding:12px 16px;max-height:70vh;overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>Source</th><th>Vessel</th><th>Date</th><th>Report Ref</th><th>Question</th><th>Chapter</th><th>Type</th><th>Designation</th><th>SOC</th><th>NOC</th><th>Observation</th>
            </tr>
          </thead>
          <tbody id="csvbQcpModalTbody"></tbody>
        </table>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("csvbQcpModalClose")?.addEventListener("click", () => modal.close());
    return modal;
  }

  function openRecords(title, rows) {
    const modal = ensureModal();
    const tbody = document.getElementById("csvbQcpModalTbody");

    document.getElementById("csvbQcpModalTitle").textContent = title;
    document.getElementById("csvbQcpModalSub").textContent = `${rows.length} related observation(s).`;

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(sourceLabel(sourceKey(row)))}</td>
        <td>${esc(row.vessel_name || "")}</td>
        <td>${esc(eventDate(row))}</td>
        <td>${esc(row.report_ref || row.reference || "")}</td>
        <td>${esc(qno(row))}</td>
        <td>${esc(chapterLabel(row))}</td>
        <td>${esc(row.observation_type || "")}</td>
        <td>${esc(row.designation || "")}</td>
        <td>${esc(row.soc || row.nature_of_concern || "")}</td>
        <td>${esc(row.noc || row.classification_coding || "")}</td>
        <td>${esc(row.remarks || row.observation_text || "")}</td>
      </tr>
    `).join("") || `<tr><td colspan="11">No records.</td></tr>`;

    modal.showModal();
  }

  function renderQuestions(questions) {
    const box = document.getElementById("csvbQcpQuestions");
    const card = document.getElementById("csvbQcpQuestionsCard");
    if (!box || !card) return;

    const mode = selectedMode();
    card.style.display = mode === "chapters" ? "none" : "";

    if (mode === "chapters") return;

    const limit = selectedTopLimit();
    const rows = Number.isFinite(limit) ? questions.slice(0, limit) : questions;
    const max = Math.max(...rows.map((r) => r.observations), 1);

    if (!rows.length) {
      box.innerHTML = `<div class="csvb-qcp-small">No question data for current filters.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="csvb-qcp-table">
        <thead>
          <tr>
            <th style="width:105px;">Question</th>
            <th>Chapter / short text</th>
            <th style="width:70px;">Obs.</th>
            <th style="width:75px;">Reports</th>
            <th style="width:70px;">Avg</th>
            <th style="width:70px;">Vessels</th>
            <th style="width:95px;">Last seen</th>
            <th style="width:80px;">Records</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, idx) => `
            <tr>
              <td class="mono" style="font-weight:950;">${esc(r.qno)}</td>
              <td>
                <div style="font-weight:950;">${esc(r.chapter_label)}</div>
                <div class="csvb-qcp-small">${esc(r.section || "")}${r.section && r.short ? " — " : ""}${esc(r.short || "")}</div>
                <div class="csvb-qcp-bar" style="margin-top:5px;"><div class="csvb-qcp-fill" style="width:${Math.max(3, Math.round((r.observations / max) * 100))}%;background:#2563eb;"></div></div>
              </td>
              <td>${esc(r.observations)}</td>
              <td>${esc(r.report_count)}</td>
              <td>${esc(r.avg_obs_report.toFixed(2))}</td>
              <td>${esc(r.vessel_count)}</td>
              <td>${esc(r.last_seen || "")}</td>
              <td><button class="btn btn-muted btn-small" type="button" data-qcp-question-index="${esc(idx)}">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-qcp-question-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = rows[Number(btn.getAttribute("data-qcp-question-index"))];
        openRecords(`Question ${item.qno}`, item.rows || []);
      });
    });
  }

  function renderChapters(chapters) {
    const box = document.getElementById("csvbQcpChapters");
    const card = document.getElementById("csvbQcpChaptersCard");
    if (!box || !card) return;

    const mode = selectedMode();
    card.style.display = mode === "questions" ? "none" : "";

    if (mode === "questions") return;

    const max = Math.max(...chapters.map((r) => r.observations), 1);

    if (!chapters.length) {
      box.innerHTML = `<div class="csvb-qcp-small">No chapter data for current filters.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="csvb-qcp-table">
        <thead>
          <tr>
            <th>Chapter</th>
            <th style="width:70px;">Obs.</th>
            <th style="width:75px;">Reports</th>
            <th style="width:70px;">Avg</th>
            <th style="width:75px;">Questions</th>
            <th style="width:80px;">Records</th>
          </tr>
        </thead>
        <tbody>
          ${chapters.map((r, idx) => `
            <tr>
              <td>
                <div style="font-weight:950;">${esc(r.label)}</div>
                <div class="csvb-qcp-bar" style="margin-top:5px;"><div class="csvb-qcp-fill" style="width:${Math.max(3, Math.round((r.observations / max) * 100))}%;background:#2563eb;"></div></div>
                <div style="margin-top:6px;">${sourceMiniBars(r, Math.max(...[...r.sources.values(), 1]))}</div>
              </td>
              <td>${esc(r.observations)}</td>
              <td>${esc(r.report_count)}</td>
              <td>${esc(r.avg_obs_report.toFixed(2))}</td>
              <td>${esc(r.question_count)}</td>
              <td><button class="btn btn-muted btn-small" type="button" data-qcp-chapter-index="${esc(idx)}">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-qcp-chapter-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = chapters[Number(btn.getAttribute("data-qcp-chapter-index"))];
        openRecords(item.label, item.rows || []);
      });
    });
  }

  function renderTrend(rows, questions, chapters) {
    const box = document.getElementById("csvbQcpTrend");
    if (!box) return;

    let focusType = "chapter";
    let focusKey = chapters[0]?.key || "";

    if (selectedMode() === "questions") {
      focusType = "question";
      focusKey = questions[0]?.qno || "";
    }

    if (!focusKey) {
      box.innerHTML = `<div class="csvb-qcp-small">No trend data for current filters.</div>`;
      return;
    }

    const focusRows = rows.filter((row) => {
      if (focusType === "question") return (qno(row) || "Unmapped audit finding") === focusKey;
      return chapterNo(row) === focusKey;
    });

    const map = new Map();
    for (const row of focusRows) {
      const b = bucket(row);
      const s = sourceKey(row);
      const key = `${b}::${s}`;
      if (!map.has(key)) map.set(key, { bucket: b, source: s, count: 0 });
      map.get(key).count += 1;
    }

    const buckets = [...new Set([...map.values()].map((x) => x.bucket))].sort();
    const sources = [...selectedSources()];
    const max = Math.max(...[...map.values()].map((x) => x.count), 1);

    const title = focusType === "question" ? `Question ${focusKey}` : chapterLabel(focusKey);

    box.innerHTML = `
      <div class="csvb-qcp-small" style="margin-top:6px;">Focused trend: <b>${esc(title)}</b></div>
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
                    <div class="csvb-qcp-small">${esc(sourceLabel(s))}</div>
                    <div class="csvb-qcp-bar"><div class="csvb-qcp-fill" style="width:${pct}%;background:${esc(sourceColour(s))};"></div></div>
                    <div class="csvb-qcp-small" style="text-align:right;">${esc(val)}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `).join("") || `<div class="csvb-qcp-small">No period data for focused item.</div>`}
      </div>
    `;
  }

  function render() {
    injectStyle();
    const panel = ensurePanel();
    mountQcpPanel(panel);
    hideLegacyQuestionChapter();

    const rows = filteredRows();
    const questions = buildQuestionGroups(rows);
    const chapters = buildChapterGroups(rows);

    renderKpis(rows, questions, chapters);
    renderQuestions(questions);
    renderChapters(chapters);
    renderTrend(rows, questions, chapters);

    return panel;
  }

  function start() {
    render();
    window.addEventListener("csvb:post-stats-snapshot", render);
    setTimeout(render, 500);
    setTimeout(render, 1500);
    setTimeout(render, 3000);
    setTimeout(render, 5000);
    setTimeout(hideLegacyQuestionChapter, 6500);
    setTimeout(hideLegacyQuestionChapter, 9000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
