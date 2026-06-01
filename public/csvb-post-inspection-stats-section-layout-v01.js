// C.S.V. BEACON - Post-Inspection Stats Section Layout v01
// Display-only layout helper. Makes selected stats sections collapsible and moves related visual panels under their tables.
// No stored data is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-SECTION-LAYOUT-V01-20260601";
  window.CSVB_POST_STATS_SECTION_LAYOUT_BUILD = BUILD;

  function norm(v) { return String(v || "").replace(/\s+/g, " ").trim(); }

  function injectStyle() {
    if (document.getElementById("csvbStatsSectionLayoutV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbStatsSectionLayoutV01Style";
    style.textContent = `
      .csvb-stats-collapse-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #cfe0f4;border-radius:12px;background:linear-gradient(180deg,#fff,#f4f8ff);color:#06305c;padding:9px 12px;margin:0 0 10px;cursor:pointer;font-weight:950;text-align:left}
      .csvb-stats-collapse-title{font-size:1.05rem;font-weight:950}.csvb-stats-collapse-sub{font-size:.82rem;font-weight:850;color:#48628e;margin-top:2px}.csvb-stats-collapse-icon{font-size:1rem;font-weight:950;background:#eaf5ff;border:1px solid #bfe0f5;border-radius:999px;padding:4px 9px;min-width:34px;text-align:center}
      .csvb-stats-collapse-body{display:block}.csvb-stats-collapse-body[hidden]{display:none!important}.csvb-stats-moved-visual{margin-top:12px!important}
      #csvbStatsChapterSharePanelV01.csvb-stats-layout-collapsible,#csvbStatsCompositionPanelV01.csvb-stats-layout-collapsible{padding-top:10px!important}
    `;
    document.head.appendChild(style);
  }

  function panelByTitle(text) {
    const wanted = norm(text).toLowerCase();
    for (const h of document.querySelectorAll("h3.sectionTitle")) {
      if (norm(h.textContent).toLowerCase() === wanted) return h.closest(".panel");
    }
    return null;
  }

  function getBody(panel) {
    return panel?.querySelector(":scope .csvb-stats-collapse-body") || null;
  }

  function makePanelCollapsible(panel, title, sub = "", open = true) {
    if (!panel || panel.getAttribute("data-csvb-section-layout-v01") === "1") return;
    const card = panel.querySelector(":scope > .card") || panel;
    const originalTitle = card.querySelector(":scope > h3.sectionTitle");
    const originalSub = card.querySelector(":scope > .statL")?.textContent || sub || "";
    const body = document.createElement("div");
    body.className = "csvb-stats-collapse-body";
    if (!open) body.hidden = true;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "csvb-stats-collapse-head";
    header.innerHTML = `<span><span class="csvb-stats-collapse-title"></span><div class="csvb-stats-collapse-sub"></div></span><span class="csvb-stats-collapse-icon">${open ? "−" : "+"}</span>`;
    header.querySelector(".csvb-stats-collapse-title").textContent = title || norm(originalTitle?.textContent) || "Section";
    header.querySelector(".csvb-stats-collapse-sub").textContent = originalSub;

    const nodes = [];
    Array.from(card.childNodes).forEach((node) => {
      if (node === originalTitle) return;
      nodes.push(node);
    });
    nodes.forEach((node) => body.appendChild(node));
    if (originalTitle) originalTitle.remove();
    card.appendChild(header);
    card.appendChild(body);

    header.addEventListener("click", () => {
      body.hidden = !body.hidden;
      header.querySelector(".csvb-stats-collapse-icon").textContent = body.hidden ? "+" : "−";
    });

    panel.setAttribute("data-csvb-section-layout-v01", "1");
  }

  function makeStandaloneCollapsible(panel, title, sub = "", open = true) {
    if (!panel || panel.getAttribute("data-csvb-section-layout-v01") === "1") return;
    const body = document.createElement("div");
    body.className = "csvb-stats-collapse-body";
    if (!open) body.hidden = true;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "csvb-stats-collapse-head";
    header.innerHTML = `<span><span class="csvb-stats-collapse-title"></span><div class="csvb-stats-collapse-sub"></div></span><span class="csvb-stats-collapse-icon">${open ? "−" : "+"}</span>`;
    header.querySelector(".csvb-stats-collapse-title").textContent = title;
    header.querySelector(".csvb-stats-collapse-sub").textContent = sub;

    Array.from(panel.childNodes).forEach((node) => body.appendChild(node));
    panel.appendChild(header);
    panel.appendChild(body);
    panel.classList.add("csvb-stats-layout-collapsible");

    header.addEventListener("click", () => {
      body.hidden = !body.hidden;
      header.querySelector(".csvb-stats-collapse-icon").textContent = body.hidden ? "+" : "−";
    });

    panel.setAttribute("data-csvb-section-layout-v01", "1");
  }

  function moveIntoSection(sectionTitle, visualId) {
    const panel = panelByTitle(sectionTitle);
    const visual = document.getElementById(visualId);
    if (!panel || !visual) return;
    const body = getBody(panel) || panel.querySelector(":scope > .card") || panel;
    if (visual.parentElement !== body) {
      visual.classList.add("csvb-stats-moved-visual");
      body.appendChild(visual);
    }
  }

  function applyLayout() {
    injectStyle();

    makePanelCollapsible(panelByTitle("Top Recurring Questions"), "Top Recurring Questions", "Table and observation-bar statistics for recurring questions.", true);
    makePanelCollapsible(panelByTitle("By Vessel (Fleet)"), "By Vessel", "Table and vessel observation-bar statistics.", true);
    makePanelCollapsible(panelByTitle("By Category / Designation"), "By Category / Designation", "Table and designation/category statistics.", true);

    moveIntoSection("Top Recurring Questions", "csvbStatsTopRecurringBarsPanelV01");
    moveIntoSection("By Vessel (Fleet)", "csvbStatsByVesselObsPanelV01");

    makeStandaloneCollapsible(document.getElementById("csvbStatsChapterSharePanelV01"), "SIRE Chapter Share", "Chapter composition chart based on the filtered Stats snapshot.", true);
    makeStandaloneCollapsible(document.getElementById("csvbStatsCompositionPanelV01"), "Composition / Share Charts", "Configurable composition charts.", true);
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; applyLayout(); }, 120);
  }

  function start() {
    applyLayout();
    window.setTimeout(applyLayout, 700);
    window.setTimeout(applyLayout, 1600);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
