// C.S.V. BEACON - Post Stats Cause / Category Analysis v01
// Safe display helper. Reads existing post-inspection stats snapshot.
// No database writes. Does not modify post_inspection_stats.js.

(function () {
  "use strict";

  const BUILD = "POST-STATS-CAUSE-CATEGORY-ANALYSIS-V05-FORCE-FN-FIX-20260811";
  window.CSVB_POST_STATS_CAUSE_CATEGORY_BUILD = BUILD;

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

  const DIMENSIONS = [
    ["designation", "Designation"],
    ["soc", "SOC"],
    ["noc", "NOC"],
  ];

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

  function selectedDimension() {
    return String(document.getElementById("csvbCauseCatDimension")?.value || "designation").trim();
  }

  function dimensionLabel(key = selectedDimension()) {
    return DIMENSIONS.find((x) => x[0] === key)?.[1] || key;
  }

  function selectedGrouping() {
    return String(document.getElementById("csvbCauseCatGrouping")?.value || "month").trim();
  }

  function selectedTopLimit() {
    const raw = String(document.getElementById("csvbCauseCatTopLimit")?.value || "10").trim();
    if (raw === "all") return Infinity;

    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 10;
  }

  function selectedTypes() {
    const out = [];

    if (document.getElementById("csvbCauseCatTypeNegative")?.checked) out.push("negative");
    if (document.getElementById("csvbCauseCatTypeLargely")?.checked) out.push("largely");
    if (document.getElementById("csvbCauseCatTypePositive")?.checked) out.push("positive");

    return out.length ? new Set(out) : new Set(["negative"]);
  }

  function selectedSources() {
    const out = [];

    SOURCE_OPTIONS.forEach(([key]) => {
      if (document.getElementById(`csvbCauseCatSource_${key}`)?.checked) out.push(key);
    });

    return out.length ? new Set(out) : new Set(SOURCE_OPTIONS.map((x) => x[0]));
  }

  function rawDimensionValue(row, dim = selectedDimension()) {
    if (dim === "designation") return String(row?.designation || "").trim();
    if (dim === "soc") return String(row?.soc || row?.nature_of_concern || "").trim();
    if (dim === "noc") return String(row?.noc || row?.classification_coding || "").trim();

    return "";
  }

  function dimensionValue(row, dim = selectedDimension()) {
    const raw = rawDimensionValue(row, dim);
    if (raw) return raw;
    return `Unmapped / blank ${dimensionLabel(dim)}`;
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

  function buildGroups(rows) {
    const dim = selectedDimension();
    const map = new Map();

    for (const row of rows) {
      const value = dimensionValue(row, dim);

      if (!map.has(value)) {
        map.set(value, {
          key: value,
          label: value,
          observations: 0,
          reports: new Set(),
          vessels: new Set(),
          questions: new Set(),
          sources: new Map(),
          last_seen: "",
          rows: [],
        });
      }

      const item = map.get(value);
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
      .sort((a, b) => b.observations - a.observations || a.key.localeCompare(b.key));
  }

  function buildSourceMetrics(rows) {
    const map = new Map();

    for (const [key, label] of SOURCE_OPTIONS) {
      if (!selectedSources().has(key)) continue;

      map.set(key, {
        key,
        label,
        observations: 0,
        reports: new Set(),
        vessels: new Set(),
        values: new Set(),
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
      item.values.add(dimensionValue(row));
      item.rows.push(row);
    }

    return [...map.values()].map((x) => ({
      ...x,
      report_count: x.reports.size,
      vessel_count: x.vessels.size,
      value_count: x.values.size,
      avg_obs_report: x.reports.size ? x.observations / x.reports.size : 0,
    }));
  }

  function injectStyle() {
    if (document.getElementById("csvbCauseCatStyleV01")) return;

    const style = document.createElement("style");
    style.id = "csvbCauseCatStyleV01";
    style.textContent = `
      #csvbCauseCatPanelV01{
        border:1px solid #cfe0f4;
        border-radius:16px;
        background:#fff;
        box-shadow:0 4px 18px rgba(18,44,87,.10);
        padding:8px 10px;
        color:#062A5E;
      }
      .csvb-cause-head{
        width:100%;
        border:0;
        background:linear-gradient(180deg,#fff,#f4f8ff);
        padding:8px 48px 8px 10px;
        text-align:left;
        position:relative;
        border-radius:12px;
        cursor:pointer;
      }
      .csvb-cause-title{font-size:1.05rem;font-weight:950;color:#062A5E;}
      .csvb-cause-sub{font-size:.78rem;font-weight:850;color:#48628e;line-height:1.25;margin-top:2px;}
      .csvb-cause-icon{
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
      .csvb-cause-controls{
        display:grid;
        grid-template-columns:170px 150px 130px 1fr;
        gap:7px;
        margin-top:8px;
        align-items:start;
      }
      .csvb-cause-field label{
        display:block;
        margin-bottom:3px;
        color:#1a4170;
        font-size:.76rem;
        font-weight:950;
      }
      .csvb-cause-field select{
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
      .csvb-cause-box{
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
      .csvb-cause-check{
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
      .csvb-cause-check:hover{background:#F0FBFC;}
      .csvb-cause-check input[type="checkbox"]{
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
      .csvb-cause-check input[type="checkbox"]:checked{
        border-color:#0097A7!important;
        background:#062A5E!important;
        box-shadow:0 0 0 2px rgba(0,151,167,.13)!important;
      }
      .csvb-cause-check input[type="checkbox"]:checked::after{
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
      .csvb-cause-kpis{
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(165px,1fr));
        gap:7px;
        margin-top:8px;
      }
      .csvb-cause-kpi{
        border:1px solid #cfe0f4;
        border-left:6px solid #2563eb;
        border-radius:12px;
        background:linear-gradient(180deg,#fff,#f8fbff);
        padding:8px 10px;
      }
      .csvb-cause-kpi-n{font-size:1.15rem;font-weight:950;color:#062A5E;}
      .csvb-cause-kpi-l{margin-top:4px;font-size:.78rem;color:#48628e;font-weight:850;}
      .csvb-cause-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:10px;
        margin-top:10px;
      }
      .csvb-cause-card{
        border:1px solid #cfe0f4;
        border-radius:14px;
        background:#fff;
        padding:10px;
      }
      .csvb-cause-card-title{
        font-weight:950;
        color:#062A5E;
        margin-bottom:4px;
      }
      .csvb-cause-small{
        color:#48628e;
        font-size:.76rem;
        font-weight:850;
        line-height:1.25;
      }
      .csvb-cause-table{
        width:100%;
        border-collapse:collapse;
        table-layout:fixed;
        margin-top:8px;
      }
      .csvb-cause-table th,
      .csvb-cause-table td{
        border-bottom:1px solid #dbe8f8;
        padding:7px;
        vertical-align:top;
        white-space:normal;
        overflow-wrap:anywhere;
        text-align:left;
      }
      .csvb-cause-table th{
        background:#eef6ff;
        color:#062A5E;
        font-weight:950;
      }
      .csvb-cause-bar{
        height:11px;
        border-radius:999px;
        background:#e8f0fb;
        overflow:hidden;
      }
      .csvb-cause-fill{
        height:100%;
        border-radius:999px;
      }
      .csvb-cause-modal{
        width:96vw;
        max-width:96vw;
        border:1px solid #cfe0f4;
        border-radius:16px;
        padding:0;
      }
      .csvb-cause-modal table{
        width:100%;
        table-layout:fixed;
        border-collapse:collapse;
      }
      .csvb-cause-modal th,
      .csvb-cause-modal td{
        border-bottom:1px solid #dbe8f8;
        padding:7px;
        white-space:normal;
        overflow-wrap:anywhere;
        vertical-align:top;
      }

      #csvbDashboardGroup_cause{
        display:block!important;
        visibility:visible!important;
        opacity:1!important;
        margin:10px 0!important;
      }
      #csvbDashboardGroup_cause .csvb-dashboard-group-head{
        display:block!important;
        text-align:left!important;
      }
      #csvbDashboardGroup_cause .csvb-dashboard-group-title,
      #csvbDashboardGroup_cause .csvb-dashboard-group-sub{
        display:block!important;
        text-align:left!important;
      }

      @media(max-width:1100px){
        .csvb-cause-controls{grid-template-columns:1fr;}
        .csvb-cause-grid{grid-template-columns:1fr;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureCauseDashboardGroup() {
    let group = document.getElementById("csvbDashboardGroup_cause");
    if (group) return group;

    group = document.createElement("section");
    group.id = "csvbDashboardGroup_cause";
    group.className = "csvb-dashboard-group";
    group.dataset.csvbForcedCauseGroup = "1";
    group.innerHTML = `
      <button class="csvb-dashboard-group-head" type="button" style="position:relative;display:block;width:100%;min-height:58px;padding:11px 62px 11px 13px;text-align:left;border:0;background:linear-gradient(180deg,#fff,#f4f8ff);color:#06305c;cursor:pointer;border-radius:12px;">
        <span class="csvb-dashboard-group-text">
          <span class="csvb-dashboard-group-title" style="display:block;text-align:left;font-size:1.08rem;font-weight:950;line-height:1.22;">Cause / Category Analysis</span>
          <div class="csvb-dashboard-group-sub" style="display:block;text-align:left;font-size:.84rem;font-weight:850;color:#48628e;line-height:1.32;margin-top:3px;">Designation, SOC, NOC and composition visuals for root-cause style analysis.</div>
        </span>
        <span class="csvb-dashboard-group-icon" style="position:absolute;right:13px;top:50%;transform:translateY(-50%);font-size:1rem;font-weight:950;background:#eaf5ff;border:1px solid #bfe0f5;border-radius:999px;padding:4px 10px;min-width:36px;text-align:center;">+</span>
      </button>
      <div class="csvb-dashboard-group-body" hidden></div>
    `;

    const questionGroup = document.getElementById("csvbDashboardGroup_question");
    const trendGroup = document.getElementById("csvbDashboardGroup_trend");
    const dashboardRoot =
      document.querySelector("#csvbPostStatsDashboardLayoutV03") ||
      questionGroup?.parentElement ||
      trendGroup?.parentElement ||
      document.querySelector(".wrap") ||
      document.body;

    if (questionGroup?.parentElement) {
      questionGroup.insertAdjacentElement("afterend", group);
    } else if (trendGroup?.parentElement) {
      trendGroup.parentElement.insertBefore(group, trendGroup);
    } else {
      dashboardRoot.appendChild(group);
    }

    const head = group.querySelector(".csvb-dashboard-group-head");
    const body = group.querySelector(".csvb-dashboard-group-body");
    const icon = group.querySelector(".csvb-dashboard-group-icon");

    head?.addEventListener("click", () => {
      const open = body.hidden;
      body.hidden = !open;
      if (icon) icon.textContent = open ? "−" : "+";
      group.dataset.open = open ? "1" : "0";
    });

    return group;
  }


  function repairCauseDashboardGroup(group) {
    if (!group) return null;

    group.style.setProperty("display", "", "important");
    group.style.removeProperty("visibility");
    group.style.removeProperty("opacity");
    group.dataset.csvbCauseGroupRepaired = "1";

    group.classList.add("csvb-dashboard-group");

    let head = group.querySelector(".csvb-dashboard-group-head");
    let body = group.querySelector(".csvb-dashboard-group-body");

    if (!head) {
      head = document.createElement("button");
      head.type = "button";
      head.className = "csvb-dashboard-group-head";
      group.prepend(head);
    }

    if (!body) {
      body = document.createElement("div");
      body.className = "csvb-dashboard-group-body";
      group.appendChild(body);
    }

    head.innerHTML = `
      <span class="csvb-dashboard-group-text">
        <span class="csvb-dashboard-group-title">Cause / Category Analysis</span>
        <div class="csvb-dashboard-group-sub">Designation, SOC, NOC and composition visuals for root-cause style analysis.</div>
      </span>
      <span class="csvb-dashboard-group-icon">${body.hidden ? "+" : "−"}</span>
    `;

    head.style.setProperty("position", "relative", "important");
    head.style.setProperty("display", "block", "important");
    head.style.setProperty("width", "100%", "important");
    head.style.setProperty("min-height", "58px", "important");
    head.style.setProperty("padding", "11px 62px 11px 13px", "important");
    head.style.setProperty("text-align", "left", "important");
    head.style.setProperty("border", "0", "important");
    head.style.setProperty("background", "linear-gradient(180deg,#fff,#f4f8ff)", "important");
    head.style.setProperty("color", "#06305c", "important");
    head.style.setProperty("cursor", "pointer", "important");
    head.style.setProperty("border-radius", "12px", "important");

    const text = head.querySelector(".csvb-dashboard-group-text");
    const title = head.querySelector(".csvb-dashboard-group-title");
    const sub = head.querySelector(".csvb-dashboard-group-sub");
    const icon = head.querySelector(".csvb-dashboard-group-icon");

    if (text) {
      text.style.setProperty("display", "block", "important");
      text.style.setProperty("text-align", "left", "important");
      text.style.setProperty("width", "100%", "important");
    }

    if (title) {
      title.style.setProperty("display", "block", "important");
      title.style.setProperty("text-align", "left", "important");
      title.style.setProperty("font-size", "1.08rem", "important");
      title.style.setProperty("font-weight", "950", "important");
      title.style.setProperty("line-height", "1.22", "important");
    }

    if (sub) {
      sub.style.setProperty("display", "block", "important");
      sub.style.setProperty("text-align", "left", "important");
      sub.style.setProperty("font-size", ".84rem", "important");
      sub.style.setProperty("font-weight", "850", "important");
      sub.style.setProperty("color", "#48628e", "important");
      sub.style.setProperty("line-height", "1.32", "important");
      sub.style.setProperty("margin-top", "3px", "important");
    }

    if (icon) {
      icon.style.setProperty("position", "absolute", "important");
      icon.style.setProperty("right", "13px", "important");
      icon.style.setProperty("top", "50%", "important");
      icon.style.setProperty("transform", "translateY(-50%)", "important");
      icon.style.setProperty("font-size", "1rem", "important");
      icon.style.setProperty("font-weight", "950", "important");
      icon.style.setProperty("background", "#eaf5ff", "important");
      icon.style.setProperty("border", "1px solid #bfe0f5", "important");
      icon.style.setProperty("border-radius", "999px", "important");
      icon.style.setProperty("padding", "4px 10px", "important");
      icon.style.setProperty("min-width", "36px", "important");
      icon.style.setProperty("text-align", "center", "important");
    }

    if (!head.dataset.csvbCauseRepairBound) {
      head.dataset.csvbCauseRepairBound = "1";
      head.addEventListener("click", () => {
        const open = body.hidden;
        body.hidden = !open;
        const iconNode = head.querySelector(".csvb-dashboard-group-icon");
        if (iconNode) iconNode.textContent = open ? "−" : "+";
        group.dataset.open = open ? "1" : "0";
      });
    }

    const question = document.getElementById("csvbDashboardGroup_question");
    if (question?.parentElement && group.parentElement === question.parentElement && question.nextElementSibling !== group) {
      question.insertAdjacentElement("afterend", group);
    }

    return group;
  }


  function forceCauseGroupDisplay() {
    const group = document.getElementById("csvbDashboardGroup_cause") || ensureCauseDashboardGroup();
    if (!group) return null;

    group.hidden = false;
    group.removeAttribute("hidden");
    group.style.setProperty("display", "block", "important");
    group.style.setProperty("visibility", "visible", "important");
    group.style.setProperty("opacity", "1", "important");
    group.style.setProperty("height", "auto", "important");
    group.style.setProperty("max-height", "none", "important");
    group.style.setProperty("overflow", "visible", "important");
    group.style.setProperty("margin", "10px 0", "important");
    group.dataset.csvbCauseForceDisplay = "1";

    let head = group.querySelector(".csvb-dashboard-group-head");
    let body = group.querySelector(".csvb-dashboard-group-body");

    if (!head) {
      head = document.createElement("button");
      head.type = "button";
      head.className = "csvb-dashboard-group-head";
      group.prepend(head);
    }

    if (!body) {
      body = document.createElement("div");
      body.className = "csvb-dashboard-group-body";
      body.hidden = true;
      group.appendChild(body);
    }

    if (!head.dataset.csvbCauseForceRepaired) {
      head.dataset.csvbCauseForceRepaired = "1";
      head.innerHTML = `
        <span class="csvb-dashboard-group-text">
          <span class="csvb-dashboard-group-title">Cause / Category Analysis</span>
          <div class="csvb-dashboard-group-sub">Designation, SOC, NOC and composition visuals for root-cause style analysis.</div>
        </span>
        <span class="csvb-dashboard-group-icon">${body.hidden ? "+" : "−"}</span>
      `;

      head.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const open = body.hidden;
        body.hidden = !open;

        const icon = head.querySelector(".csvb-dashboard-group-icon");
        if (icon) icon.textContent = open ? "−" : "+";

        group.dataset.open = open ? "1" : "0";
      });
    }

    head.hidden = false;
    head.removeAttribute("hidden");
    head.style.setProperty("display", "block", "important");
    head.style.setProperty("visibility", "visible", "important");
    head.style.setProperty("opacity", "1", "important");
    head.style.setProperty("position", "relative", "important");
    head.style.setProperty("width", "100%", "important");
    head.style.setProperty("min-height", "58px", "important");
    head.style.setProperty("padding", "11px 62px 11px 13px", "important");
    head.style.setProperty("text-align", "left", "important");
    head.style.setProperty("border", "0", "important");
    head.style.setProperty("background", "linear-gradient(180deg,#fff,#f4f8ff)", "important");
    head.style.setProperty("color", "#06305c", "important");
    head.style.setProperty("cursor", "pointer", "important");
    head.style.setProperty("border-radius", "12px", "important");

    const title = head.querySelector(".csvb-dashboard-group-title");
    const sub = head.querySelector(".csvb-dashboard-group-sub");
    const icon = head.querySelector(".csvb-dashboard-group-icon");

    if (title) {
      title.style.setProperty("display", "block", "important");
      title.style.setProperty("text-align", "left", "important");
      title.style.setProperty("font-size", "1.08rem", "important");
      title.style.setProperty("font-weight", "950", "important");
    }

    if (sub) {
      sub.style.setProperty("display", "block", "important");
      sub.style.setProperty("text-align", "left", "important");
      sub.style.setProperty("font-size", ".84rem", "important");
      sub.style.setProperty("font-weight", "850", "important");
      sub.style.setProperty("color", "#48628e", "important");
      sub.style.setProperty("margin-top", "3px", "important");
    }

    if (icon) {
      icon.style.setProperty("position", "absolute", "important");
      icon.style.setProperty("right", "13px", "important");
      icon.style.setProperty("top", "50%", "important");
      icon.style.setProperty("transform", "translateY(-50%)", "important");
      icon.style.setProperty("font-size", "1rem", "important");
      icon.style.setProperty("font-weight", "950", "important");
      icon.style.setProperty("background", "#eaf5ff", "important");
      icon.style.setProperty("border", "1px solid #bfe0f5", "important");
      icon.style.setProperty("border-radius", "999px", "important");
      icon.style.setProperty("padding", "4px 10px", "important");
      icon.style.setProperty("min-width", "36px", "important");
      icon.style.setProperty("text-align", "center", "important");
    }

    const question = document.getElementById("csvbDashboardGroup_question");
    if (question?.parentElement && group.parentElement === question.parentElement && question.nextElementSibling !== group) {
      question.insertAdjacentElement("afterend", group);
    }

    return group;
  }

  function causeDashboardBody() {
    const group = forceCauseGroupDisplay();
    return group?.querySelector(".csvb-dashboard-group-body") || null;
  }

  function mountPanel(panel) {
    const body = causeDashboardBody();
    if (!body || !panel) return false;

    if (panel.parentElement !== body || body.firstElementChild !== panel) {
      body.prepend(panel);
    }

    panel.style.display = "";
    return true;
  }

  function hideLegacyCauseCategory() {
    const panel = document.getElementById("csvbCauseCatPanelV01");

    const hideNode = (node) => {
      if (!node || panel?.contains(node)) return;
      node.style.display = "none";
      node.dataset.csvbCauseCatLegacyHidden = "1";
    };

    ["byCategoryTbody", "topSocTbody", "topNocTbody"].forEach((id) => {
      const tbody = document.getElementById(id);
      hideNode(tbody?.closest("table"));
    });

    [
      "csvbStatsCompositionPanelV01",
      "csvbStatsByCategoryBarsPanelV01",
      "csvbStatsTopSocBarsPanelV01",
      "csvbStatsTopNocBarsPanelV01",
    ].forEach((id) => hideNode(document.getElementById(id)));

    ["chartNegCategory", "chartLargelyCategory"].forEach((id) => {
      const node = document.getElementById(id);
      hideNode(node?.closest(".chartBox"));
    });

    const body = causeDashboardBody();
    if (body) {
      [...body.querySelectorAll("*")].forEach((node) => {
        if (!node || panel?.contains(node)) return;

        const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) return;

        const isOld =
          /^By Category \/ Designation\b/i.test(text) ||
          /^Top SOC\b/i.test(text) ||
          /^Top NOC\b/i.test(text) ||
          /^Composition \/ Share Charts\b/i.test(text);

        if (isOld) {
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

  function ensurePanel() {
    let panel = document.getElementById("csvbCauseCatPanelV01");
    if (panel) {
      mountPanel(panel);
      panel.style.display = "";
      return panel;
    }

    panel = document.createElement("section");
    panel.id = "csvbCauseCatPanelV01";
    panel.innerHTML = `
      <button class="csvb-cause-head" id="csvbCauseCatHead" type="button">
        <div class="csvb-cause-title">Cause / Category Analysis</div>
        <div class="csvb-cause-sub">Designation, SOC and NOC comparisons by source, observation type and period.</div>
        <span class="csvb-cause-icon" id="csvbCauseCatIcon">+</span>
      </button>

      <div id="csvbCauseCatBody" hidden>
        <div class="csvb-cause-small" style="text-align:right;margin-top:4px;">build: ${esc(BUILD)}</div>

        <div class="csvb-cause-controls">
          <div class="csvb-cause-field">
            <label for="csvbCauseCatDimension">Category dimension</label>
            <select id="csvbCauseCatDimension">
              <option value="designation" selected>Designation</option>
              <option value="soc">SOC</option>
              <option value="noc">NOC</option>
            </select>
          </div>

          <div class="csvb-cause-field">
            <label for="csvbCauseCatGrouping">Trend grouping</label>
            <select id="csvbCauseCatGrouping">
              <option value="month" selected>Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Annual</option>
            </select>
          </div>

          <div class="csvb-cause-field">
            <label for="csvbCauseCatTopLimit">Top list</label>
            <select id="csvbCauseCatTopLimit">
              <option value="10" selected>Top 10</option>
              <option value="25">Top 25</option>
              <option value="50">Top 50</option>
              <option value="all">All loaded</option>
            </select>
          </div>

          <div>
            <div class="csvb-cause-field"><label>Observation types</label></div>
            <div class="csvb-cause-box">
              <label class="csvb-cause-check"><input id="csvbCauseCatTypeNegative" type="checkbox" checked /> Negative</label>
              <label class="csvb-cause-check"><input id="csvbCauseCatTypeLargely" type="checkbox" /> Largely as expected</label>
              <label class="csvb-cause-check"><input id="csvbCauseCatTypePositive" type="checkbox" /> Positive</label>
            </div>
          </div>
        </div>

        <div class="csvb-cause-controls" style="grid-template-columns:1fr;">
          <div>
            <div class="csvb-cause-field"><label>Record sources</label></div>
            <div class="csvb-cause-box">
              ${SOURCE_OPTIONS.map(([key, label]) => `
                <label class="csvb-cause-check">
                  <input id="csvbCauseCatSource_${esc(key)}" type="checkbox" checked />
                  ${esc(label)}
                </label>
              `).join("")}
            </div>
          </div>
        </div>

        <div class="csvb-cause-kpis">
          <div class="csvb-cause-kpi"><div class="csvb-cause-kpi-n" id="csvbCauseCatKpiObs">0</div><div class="csvb-cause-kpi-l">Findings / observations</div></div>
          <div class="csvb-cause-kpi"><div class="csvb-cause-kpi-n" id="csvbCauseCatKpiReports">0</div><div class="csvb-cause-kpi-l">Reports / audits</div></div>
          <div class="csvb-cause-kpi"><div class="csvb-cause-kpi-n" id="csvbCauseCatKpiAvg">0.00</div><div class="csvb-cause-kpi-l">Avg findings per report</div></div>
          <div class="csvb-cause-kpi"><div class="csvb-cause-kpi-n" id="csvbCauseCatKpiDistinct">0</div><div class="csvb-cause-kpi-l">Distinct category values</div></div>
          <div class="csvb-cause-kpi"><div class="csvb-cause-kpi-n" id="csvbCauseCatKpiTop">—</div><div class="csvb-cause-kpi-l">Top category value</div></div>
        </div>

        <div class="csvb-cause-grid">
          <div class="csvb-cause-card">
            <div class="csvb-cause-card-title">Top Cause / Category Values</div>
            <div class="csvb-cause-small">Highest-volume values for the selected dimension.</div>
            <div id="csvbCauseCatTopTable"></div>
          </div>

          <div class="csvb-cause-card">
            <div class="csvb-cause-card-title">Source Comparison</div>
            <div class="csvb-cause-small">Vetting vs Superintendent / Master / External under the selected dimension.</div>
            <div id="csvbCauseCatSourceComparison"></div>
          </div>
        </div>

        <div class="csvb-cause-card" style="margin-top:10px;">
          <div class="csvb-cause-card-title">Cause / Category Trend</div>
          <div class="csvb-cause-small">Trend for the highest-volume value under the selected dimension.</div>
          <div id="csvbCauseCatTrend"></div>
        </div>
      </div>
    `;

    const body = causeDashboardBody();
    if (body) {
      body.prepend(panel);
    } else {
      const byCat = document.getElementById("byCategoryTbody");
      if (byCat?.closest("table")?.parentElement) byCat.closest("table").parentElement.insertAdjacentElement("beforebegin", panel);
      else document.body.appendChild(panel);
    }

    const head = panel.querySelector("#csvbCauseCatHead");
    const bodyNode = panel.querySelector("#csvbCauseCatBody");
    const icon = panel.querySelector("#csvbCauseCatIcon");

    head.addEventListener("click", () => {
      bodyNode.hidden = !bodyNode.hidden;
      icon.textContent = bodyNode.hidden ? "+" : "−";
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

  function renderKpis(rows, groups) {
    const reportSet = new Set(rows.map(reportKey).filter(Boolean));

    setText("csvbCauseCatKpiObs", rows.length);
    setText("csvbCauseCatKpiReports", reportSet.size);
    setText("csvbCauseCatKpiAvg", avg(rows.length, reportSet.size));
    setText("csvbCauseCatKpiDistinct", groups.length);
    setText("csvbCauseCatKpiTop", groups[0]?.label || "—");
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
              <div class="csvb-cause-small">${esc(sourceLabel(s))}</div>
              <div class="csvb-cause-bar"><div class="csvb-cause-fill" style="width:${pct}%;background:${esc(sourceColour(s))};"></div></div>
              <div class="csvb-cause-small" style="text-align:right;">${esc(val)}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function ensureModal() {
    let modal = document.getElementById("csvbCauseCatRecordsModal");
    if (modal) return modal;

    modal = document.createElement("dialog");
    modal.id = "csvbCauseCatRecordsModal";
    modal.className = "csvb-cause-modal";
    modal.innerHTML = `
      <div style="padding:14px 16px;border-bottom:1px solid #dbe8f8;display:flex;justify-content:space-between;gap:12px;align-items:center;">
        <div>
          <div style="font-weight:950;color:#082d57;font-size:1.05rem;" id="csvbCauseCatModalTitle">Cause / Category records</div>
          <div style="font-weight:800;color:#55708f;font-size:.86rem;" id="csvbCauseCatModalSub">Related observations</div>
        </div>
        <button class="btn btn-muted" type="button" id="csvbCauseCatModalClose">Close</button>
      </div>
      <div style="padding:12px 16px;max-height:70vh;overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>Source</th><th>Vessel</th><th>Date</th><th>Report Ref</th><th>Question</th><th>Type</th><th>Designation</th><th>SOC</th><th>NOC</th><th>Observation</th>
            </tr>
          </thead>
          <tbody id="csvbCauseCatModalTbody"></tbody>
        </table>
      </div>
    `;

    document.body.appendChild(modal);
    document.getElementById("csvbCauseCatModalClose")?.addEventListener("click", () => modal.close());

    return modal;
  }

  function openRecords(title, rows) {
    const modal = ensureModal();
    const tbody = document.getElementById("csvbCauseCatModalTbody");

    document.getElementById("csvbCauseCatModalTitle").textContent = title;
    document.getElementById("csvbCauseCatModalSub").textContent = `${rows.length} related observation(s).`;

    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${esc(sourceLabel(sourceKey(row)))}</td>
        <td>${esc(row.vessel_name || "")}</td>
        <td>${esc(eventDate(row))}</td>
        <td>${esc(row.report_ref || row.reference || "")}</td>
        <td>${esc(qno(row))}</td>
        <td>${esc(row.observation_type || "")}</td>
        <td>${esc(row.designation || "")}</td>
        <td>${esc(row.soc || row.nature_of_concern || "")}</td>
        <td>${esc(row.noc || row.classification_coding || "")}</td>
        <td>${esc(row.remarks || row.observation_text || "")}</td>
      </tr>
    `).join("") || `<tr><td colspan="10">No records.</td></tr>`;

    modal.showModal();
  }

  function renderTopGroups(groups) {
    const box = document.getElementById("csvbCauseCatTopTable");
    if (!box) return;

    const limit = selectedTopLimit();
    const rows = Number.isFinite(limit) ? groups.slice(0, limit) : groups;
    const max = Math.max(...rows.map((r) => r.observations), 1);

    if (!rows.length) {
      box.innerHTML = `<div class="csvb-cause-small">No cause/category data for current filters.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="csvb-cause-table">
        <thead>
          <tr>
            <th>${esc(dimensionLabel())}</th>
            <th style="width:70px;">Obs.</th>
            <th style="width:75px;">Reports</th>
            <th style="width:70px;">Avg</th>
            <th style="width:75px;">Vessels</th>
            <th style="width:95px;">Last seen</th>
            <th style="width:80px;">Records</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, idx) => `
            <tr>
              <td>
                <div style="font-weight:950;">${esc(r.label)}</div>
                <div class="csvb-cause-bar" style="margin-top:5px;"><div class="csvb-cause-fill" style="width:${Math.max(3, Math.round((r.observations / max) * 100))}%;background:#2563eb;"></div></div>
                <div style="margin-top:6px;">${sourceMiniBars(r, Math.max(...[...r.sources.values(), 1]))}</div>
              </td>
              <td>${esc(r.observations)}</td>
              <td>${esc(r.report_count)}</td>
              <td>${esc(r.avg_obs_report.toFixed(2))}</td>
              <td>${esc(r.vessel_count)}</td>
              <td>${esc(r.last_seen || "")}</td>
              <td><button class="btn btn-muted btn-small" type="button" data-cause-cat-index="${esc(idx)}">View</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-cause-cat-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = rows[Number(btn.getAttribute("data-cause-cat-index"))];
        openRecords(`${dimensionLabel()} — ${item.label}`, item.rows || []);
      });
    });
  }

  function renderSourceComparison(rows) {
    const box = document.getElementById("csvbCauseCatSourceComparison");
    if (!box) return;

    const metrics = buildSourceMetrics(rows);
    const max = Math.max(...metrics.map((m) => m.observations), 1);

    box.innerHTML = `
      <table class="csvb-cause-table">
        <thead>
          <tr>
            <th>Source</th>
            <th style="width:70px;">Obs.</th>
            <th style="width:75px;">Reports</th>
            <th style="width:70px;">Avg</th>
            <th style="width:75px;">Values</th>
            <th style="width:75px;">Vessels</th>
          </tr>
        </thead>
        <tbody>
          ${metrics.map((m) => `
            <tr>
              <td>
                <div style="font-weight:950;">${esc(m.label)}</div>
                <div class="csvb-cause-bar" style="margin-top:5px;"><div class="csvb-cause-fill" style="width:${Math.max(3, Math.round((m.observations / max) * 100))}%;background:${esc(sourceColour(m.key))};"></div></div>
              </td>
              <td>${esc(m.observations)}</td>
              <td>${esc(m.report_count)}</td>
              <td>${esc(m.avg_obs_report.toFixed(2))}</td>
              <td>${esc(m.value_count)}</td>
              <td>${esc(m.vessel_count)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderTrend(rows, groups) {
    const box = document.getElementById("csvbCauseCatTrend");
    if (!box) return;

    const focus = groups[0]?.label || "";
    if (!focus) {
      box.innerHTML = `<div class="csvb-cause-small">No trend data for current filters.</div>`;
      return;
    }

    const focusRows = rows.filter((row) => dimensionValue(row) === focus);
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

    box.innerHTML = `
      <div class="csvb-cause-small" style="margin-top:6px;">Focused trend: <b>${esc(dimensionLabel())} — ${esc(focus)}</b></div>
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
                    <div class="csvb-cause-small">${esc(sourceLabel(s))}</div>
                    <div class="csvb-cause-bar"><div class="csvb-cause-fill" style="width:${pct}%;background:${esc(sourceColour(s))};"></div></div>
                    <div class="csvb-cause-small" style="text-align:right;">${esc(val)}</div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `).join("") || `<div class="csvb-cause-small">No period data for focused value.</div>`}
      </div>
    `;
  }

  function render() {
    injectStyle();
    ensureCauseDashboardGroup();
    forceCauseGroupDisplay();
    const panel = ensurePanel();
    mountPanel(panel);
    hideLegacyCauseCategory();

    const rows = filteredRows();
    const groups = buildGroups(rows);

    renderKpis(rows, groups);
    renderTopGroups(groups);
    renderSourceComparison(rows);
    renderTrend(rows, groups);

    return panel;
  }

  function start() {
    ensureCauseDashboardGroup();
    forceCauseGroupDisplay();
    render();
    window.addEventListener("csvb:post-stats-snapshot", render);
    setTimeout(render, 500);
    setTimeout(render, 1500);
    setTimeout(render, 3000);
    setTimeout(hideLegacyCauseCategory, 6500);
    setTimeout(hideLegacyCauseCategory, 9000);
    setTimeout(forceCauseGroupDisplay, 300);
    setTimeout(forceCauseGroupDisplay, 1200);
    setTimeout(forceCauseGroupDisplay, 3000);
    setTimeout(forceCauseGroupDisplay, 6500);
    setTimeout(forceCauseGroupDisplay, 9000);
    setTimeout(forceCauseGroupDisplay, 12500);
    setTimeout(() => { ensureCauseDashboardGroup(); render(); }, 2500);
    setTimeout(() => { repairCauseDashboardGroup(ensureCauseDashboardGroup()); render(); }, 6000);
    setTimeout(() => { repairCauseDashboardGroup(ensureCauseDashboardGroup()); render(); }, 9000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
