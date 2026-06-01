// C.S.V. BEACON - Post-Inspection Stats Section Layout v02
// Groups each stat section under one collapsible header. Moves related graph panels directly under their respective tables.
// Display-only helper. No stored data or calculations are changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-SECTION-LAYOUT-V02-20260601";
  window.CSVB_POST_STATS_SECTION_LAYOUT_BUILD = BUILD;

  const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();

  function injectStyle() {
    if (document.getElementById("csvbStatsSectionLayoutV02Style")) return;
    const style = document.createElement("style");
    style.id = "csvbStatsSectionLayoutV02Style";
    style.textContent = `
      .csvb-stat-section-header{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #cfe0f4;border-radius:14px;background:linear-gradient(180deg,#fff,#f3f8ff);color:#06305c;padding:10px 12px;margin:0 0 10px;cursor:pointer;text-align:left}
      .csvb-stat-section-title{font-size:1.1rem;font-weight:950;line-height:1.2}.csvb-stat-section-sub{font-size:.86rem;font-weight:850;color:#48628e;line-height:1.32;margin-top:2px}.csvb-stat-section-icon{font-size:1.02rem;font-weight:950;background:#eaf5ff;border:1px solid #bfe0f5;border-radius:999px;padding:4px 10px;min-width:36px;text-align:center}
      .csvb-stat-section-body{display:block}.csvb-stat-section-body[hidden]{display:none!important}.csvb-stat-attached-visual{margin-top:12px!important}.csvb-stat-attached-visual>.csvb-recurring-head,.csvb-stat-attached-visual>.csvb-by-vessel-head{display:none!important}
      .csvb-stat-attached-visual#csvbStatsTopRecurringBarsPanelV01,.csvb-stat-attached-visual#csvbStatsByVesselObsPanelV01{box-shadow:none!important;background:#fff!important}
      .csvb-visual-section>.csvb-chapter-share-head,.csvb-visual-section>.csvb-composition-v02-head,.csvb-visual-section>.csvb-composition-head{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function findPanelByTitle(title) {
    const wanted = norm(title).toLowerCase();
    for (const h of document.querySelectorAll("h3.sectionTitle")) {
      if (norm(h.textContent).toLowerCase() === wanted) return h.closest(".panel");
    }
    return null;
  }

  function makeTableSection(title, cleanTitle) {
    const panel = findPanelByTitle(title);
    if (!panel || panel.dataset.csvbLayoutV02 === "1") return panel;
    const card = panel.querySelector(":scope > .card") || panel;
    const h3 = card.querySelector(":scope > h3.sectionTitle");
    const statL = card.querySelector(":scope > .statL");
    const sub = norm(statL?.textContent || "");

    const header = document.createElement("button");
    header.type = "button";
    header.className = "csvb-stat-section-header";
    header.innerHTML = `<span><span class="csvb-stat-section-title"></span><div class="csvb-stat-section-sub"></div></span><span class="csvb-stat-section-icon">−</span>`;
    header.querySelector(".csvb-stat-section-title").textContent = cleanTitle || title;
    header.querySelector(".csvb-stat-section-sub").textContent = sub;

    const body = document.createElement("div");
    body.className = "csvb-stat-section-body";

    Array.from(card.childNodes).forEach((node) => {
      if (node === h3 || node === statL) return;
      body.appendChild(node);
    });
    if (h3) h3.remove();
    if (statL) statL.remove();
    card.appendChild(header);
    card.appendChild(body);

    header.addEventListener("click", () => {
      body.hidden = !body.hidden;
      header.querySelector(".csvb-stat-section-icon").textContent = body.hidden ? "+" : "−";
    });

    panel.dataset.csvbLayoutV02 = "1";
    return panel;
  }

  function bodyOf(panel) {
    return panel?.querySelector(":scope .csvb-stat-section-body") || panel?.querySelector(":scope > .card") || panel;
  }

  function attachVisualToTableSection(sectionTitle, visualId) {
    const panel = makeTableSection(sectionTitle, sectionTitle === "By Vessel (Fleet)" ? "By Vessel" : sectionTitle);
    const body = bodyOf(panel);
    const visual = document.getElementById(visualId);
    if (!body || !visual) return;
    if (visual.parentElement !== body) body.appendChild(visual);
    visual.classList.add("csvb-stat-attached-visual");
  }

  function makeVisualSection(visualId, title, sub) {
    const panel = document.getElementById(visualId);
    if (!panel || panel.dataset.csvbLayoutV02 === "1") return;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "csvb-stat-section-header";
    header.innerHTML = `<span><span class="csvb-stat-section-title"></span><div class="csvb-stat-section-sub"></div></span><span class="csvb-stat-section-icon">−</span>`;
    header.querySelector(".csvb-stat-section-title").textContent = title;
    header.querySelector(".csvb-stat-section-sub").textContent = sub || "";

    const body = document.createElement("div");
    body.className = "csvb-stat-section-body";
    Array.from(panel.childNodes).forEach((node) => body.appendChild(node));
    panel.appendChild(header);
    panel.appendChild(body);
    panel.classList.add("csvb-visual-section");

    header.addEventListener("click", () => {
      body.hidden = !body.hidden;
      header.querySelector(".csvb-stat-section-icon").textContent = body.hidden ? "+" : "−";
    });

    panel.dataset.csvbLayoutV02 = "1";
  }

  function applyLayout() {
    injectStyle();

    attachVisualToTableSection("Top Recurring Questions", "csvbStatsTopRecurringBarsPanelV01");
    attachVisualToTableSection("By Vessel (Fleet)", "csvbStatsByVesselObsPanelV01");
    makeTableSection("By Category / Designation", "By Category / Designation");

    makeVisualSection("csvbStatsChapterSharePanelV01", "SIRE Chapter Share", "Chapter share graph based on the current filtered Stats snapshot.");
    makeVisualSection("csvbStatsCompositionPanelV01", "Composition / Share Charts", "Configurable composition charts.");
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    window.setTimeout(() => { pending = false; applyLayout(); }, 140);
  }

  function start() {
    applyLayout();
    window.setTimeout(applyLayout, 700);
    window.setTimeout(applyLayout, 1600);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
})();
