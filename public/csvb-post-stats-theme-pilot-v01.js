(() => {
  const BUILD = "CSVB_POST_STATS_THEME_PILOT_V01_STEP8B1E_INLINE_DARK_REPAIR_20260813";

  if (window.__csvbPostStatsThemePilotV01 === BUILD) return;
  window.__csvbPostStatsThemePilotV01 = BUILD;

  const PAGE = "post_inspection_stats.html";
  const root = document.documentElement;

  function isPilotPage() {
    return root?.dataset?.csvbPage === PAGE;
  }

  function isDark() {
    return root.getAttribute("data-theme") === "dark";
  }

  function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function unique(nodes) {
    return Array.from(new Set(nodes.filter(Boolean)));
  }

  function saveOriginal(el) {
    if (!el || el.dataset.csvbPostStatsThemeOriginalStyle !== undefined) return;
    el.dataset.csvbPostStatsThemeOriginalStyle = el.getAttribute("style") || "";
  }

  function restoreOriginal(el) {
    if (!el || el.dataset.csvbPostStatsThemeOriginalStyle === undefined) return;

    const original = el.dataset.csvbPostStatsThemeOriginalStyle || "";
    if (original) el.setAttribute("style", original);
    else el.removeAttribute("style");

    delete el.dataset.csvbPostStatsThemeOriginalStyle;
    delete el.dataset.csvbPostStatsThemePilotFixed;
  }

  function setImportant(el, prop, value) {
    if (!el) return;
    saveOriginal(el);
    el.style.setProperty(prop, value, "important");
    el.dataset.csvbPostStatsThemePilotFixed = BUILD;
  }

  function containsLightBackground(styleText) {
    const s = String(styleText || "").toLowerCase().replace(/\s+/g, "");
    return (
      s.includes("background:#fff") ||
      s.includes("background:#ffffff") ||
      s.includes("background:#f8fbff") ||
      s.includes("background:#f4f8ff") ||
      s.includes("background:#eaf5ff") ||
      s.includes("background:linear-gradient(180deg,#fff,#f4f8ff)") ||
      s.includes("background:linear-gradient(180deg,#fff,#f8fbff)")
    );
  }

  function containsNavyText(styleText) {
    const s = String(styleText || "").toLowerCase().replace(/\s+/g, "");
    return (
      s.includes("color:#000") ||
      s.includes("color:#06305c") ||
      s.includes("color:#062a5e") ||
      s.includes("color:#082d57") ||
      s.includes("color:#1a4170") ||
      s.includes("color:#223a66") ||
      s.includes("color:#35507b")
    );
  }

  function darkHeadNodes() {
    return unique([
      document.getElementById("csvbMscatCollapseHead"),
      document.querySelector("#csvbDashboardGroup_cause .csvb-dashboard-group-head"),
      document.querySelector("#csvbDashboardGroup_mscat .csvb-dashboard-group-head"),
      document.querySelector("#csvbDashboardGroup_qcp .csvb-dashboard-group-head"),
      document.querySelector("#csvbDashboardGroup_question .csvb-dashboard-group-head"),
      ...qsa("#csvbMscatCollapseHead *"),
      ...qsa("#csvbDashboardGroup_cause .csvb-dashboard-group-head *"),
      ...qsa("#csvbDashboardGroup_mscat .csvb-dashboard-group-head *")
    ]);
  }

  function generatedInlineNodes() {
    return unique([
      ...qsa("#mscatAnalyticsPanel [style]"),
      ...qsa("#csvbDashboardGroup_cause [style]"),
      ...qsa("#csvbCauseCatPanelV01 [style]"),
      ...qsa("#csvbQcpPanelV01 [style]"),
      ...qsa("#csvbSectorAnalyticsPanelV01 [style]"),
      ...qsa(".chartBox [style]"),
      ...qsa(".csvb-stat-attached-visual [style]"),
      ...qsa("#chartNegativeSourceTrend [style]")
    ]);
  }

  function repairDark() {
    if (!isPilotPage()) return;

    const surface = "#0B2447";
    const surface2 = "#071D3A";
    const border = "#20466F";
    const text = "#EAF3FB";
    const muted = "#9EB7D3";
    const headBg = "linear-gradient(180deg, #102B4D, #071D3A)";

    darkHeadNodes().forEach((el) => {
      if (!el) return;
      setImportant(el, "color", text);

      if (
        el.id === "csvbMscatCollapseHead" ||
        el.classList.contains("csvb-dashboard-group-head")
      ) {
        setImportant(el, "background", headBg);
        setImportant(el, "border-color", border);
      }

      if (
        el.classList.contains("csvb-dashboard-group-icon") ||
        el.id === "csvbMscatCollapseIcon" ||
        el.id === "csvbSectorCollapseIcon" ||
        el.id === "csvbCauseCatIcon"
      ) {
        setImportant(el, "background", "rgba(234,243,251,.14)");
        setImportant(el, "border-color", border);
        setImportant(el, "color", text);
      }
    });

    generatedInlineNodes().forEach((el) => {
      const styleText = el.getAttribute("style") || "";

      if (containsLightBackground(styleText)) {
        setImportant(el, "background", surface2);
        setImportant(el, "background-color", surface2);
        setImportant(el, "border-color", border);
      }

      if (containsNavyText(styleText)) {
        setImportant(el, "color", text);
      }

      if (
        el.classList.contains("chartBox") ||
        el.classList.contains("csvb-cause-card") ||
        el.classList.contains("csvb-cause-box") ||
        el.classList.contains("csvb-qcp-card") ||
        el.classList.contains("csvb-sector-card")
      ) {
        setImportant(el, "background", surface);
        setImportant(el, "color", text);
        setImportant(el, "border-color", border);
      }
    });

    qsa("svg text, svg tspan").forEach((el) => {
      saveOriginal(el);
      el.style.setProperty("fill", text, "important");
      el.style.setProperty("color", text, "important");
      el.dataset.csvbPostStatsThemePilotFixed = BUILD;
    });

    qsa(".csvb-line-chart-v01-title, .csvb-line-chart-v01-sub, .barLabel, .barValue, .sectionTitle").forEach((el) => {
      setImportant(el, "color", text);
    });

    qsa(".chartSub, .statSub, .csvb-cause-sub, .csvb-qcp-sub, .csvb-sector-sub").forEach((el) => {
      setImportant(el, "color", muted);
    });
  }

  function restoreLight() {
    qsa("[data-csvb-post-stats-theme-pilot-fixed]").forEach(restoreOriginal);
  }

  function apply() {
    if (!isPilotPage()) return;
    if (isDark()) repairDark();
    else restoreLight();
  }

  function scheduleApply() {
    requestAnimationFrame(() => {
      apply();
      setTimeout(apply, 150);
      setTimeout(apply, 500);
      setTimeout(apply, 1200);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  } else {
    scheduleApply();
  }

  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  if (document.body) {
    const bodyObserver = new MutationObserver(() => {
      if (isDark()) scheduleApply();
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
  }

  [250, 1000, 2500, 5000, 9000, 14000].forEach((delay) => setTimeout(apply, delay));

  console.log(BUILD + " loaded");
})();
