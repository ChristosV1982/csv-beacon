// public/csvb-dashboard-risq-viewer-card.js
// C.S.V. BEACON — RISQ Questions Viewer Dashboard card helper
// Adds and controls the synthetic RISQ Viewer card until q-dashboard.html is fully refactored.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-RISQ-VIEWER-CARD-20260520_2";
  window.CSVB_DASHBOARD_RISQ_VIEWER_CARD_BUILD = BUILD;

  const CARD_KEY = "risq_questions_viewer";
  const MODULE_KEY = "risq_questions_viewer";
  const MODULE_CODE = "RISQ_QUESTIONS_VIEWER";

  function cardHtml() {
    return `
      <div class="title">RISQ Questions Viewer</div>
      <div class="muted">Primary read-only operational RISQ 3.2 viewer with filters, normal search, guide text, eSMS references, print and export tools.</div>
      <div style="margin-top:12px;">
        <button class="btn2" type="button" onclick="location.href='./risq-questions-viewer.html'">Open</button>
      </div>
    `;
  }

  function areaHomeItemHtml() {
    return `
      <div class="csvb-area-home-item" data-csvb-risq-viewer-area-home="1">
        <div class="csvb-area-home-item-icon">🔎</div>
        <div class="csvb-area-home-item-main">
          <div class="csvb-area-home-item-title">RISQ Questions Viewer</div>
          <div class="csvb-area-home-item-text">Primary read-only operational RISQ 3.2 viewer with filters, normal search, guide text, eSMS references, print and export tools.</div>
          <div class="csvb-area-home-item-actions">
            <a class="csvb-area-home-action" href="./risq-questions-viewer.html">Open</a>
          </div>
        </div>
      </div>
    `;
  }

  function ensureCard() {
    let card = document.querySelector(`[data-card="${CARD_KEY}"]`);
    if (card) return card;

    const preferredGrid =
      document.querySelector('[data-platform-area-grid="inspection_libraries_vetting"]') ||
      document.querySelector(".wrap > .grid") ||
      document.querySelector(".csvb-platform-area-grid");

    if (!preferredGrid) return null;

    card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-card", CARD_KEY);
    card.innerHTML = cardHtml();

    const risqEditor = document.querySelector('[data-card="risq_questions_editor"]');
    if (risqEditor?.parentElement) risqEditor.parentElement.insertBefore(card, risqEditor);
    else preferredGrid.appendChild(card);

    return card;
  }

  function companyAllows() {
    const access = window.CSVB_DASHBOARD_MODULE_ACCESS;
    if (!access) return false;
    if (access.isPlatform === true) return true;
    return access.enabled?.has?.(MODULE_KEY) === true;
  }

  function rankAllows() {
    const rank = window.CSVB_DASHBOARD_RANK_ACCESS;
    if (!rank) return true; // wait for rank helper
    if (rank.skipped === true) return true; // platform role
    if (!Array.isArray(rank.allowedViewModules)) return false;
    return rank.allowedViewModules.includes(MODULE_CODE);
  }

  function isAllowed() {
    return companyAllows() && rankAllows();
  }

  function findInspectionLibraryGroupGrid() {
    const titleNodes = Array.from(document.querySelectorAll(".csvb-area-home-group-title"));
    const exact = titleNodes.find((node) => /inspection question libraries and preparation/i.test(node.textContent || ""));
    const fallback = titleNodes.find((node) => /question libraries/i.test(node.textContent || ""));
    const title = exact || fallback;
    return title?.parentElement?.querySelector(".csvb-area-home-group-grid") || null;
  }

  function ensureAreaHomeItem(allowed) {
    const existing = document.querySelector('[data-csvb-risq-viewer-area-home="1"]');

    if (!allowed) {
      existing?.remove();
      return;
    }

    if (existing) return;

    const grid = findInspectionLibraryGroupGrid();
    if (!grid) return;

    const sireTitle = Array.from(grid.querySelectorAll(".csvb-area-home-item-title"))
      .find((node) => /SIRE 2\.0 Questions Viewer/i.test(node.textContent || ""));

    if (sireTitle?.closest(".csvb-area-home-item")) {
      sireTitle.closest(".csvb-area-home-item").insertAdjacentHTML("afterend", areaHomeItemHtml());
    } else {
      grid.insertAdjacentHTML("afterbegin", areaHomeItemHtml());
    }
  }

  function apply() {
    const allowed = isAllowed();

    const card = ensureCard();
    if (card) card.style.display = allowed ? "block" : "none";

    ensureAreaHomeItem(allowed);

    return !!card || !!document.querySelector('[data-csvb-risq-viewer-area-home="1"]');
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      apply();
      if (tries >= 24) clearInterval(timer);
    }, 350);

    setTimeout(apply, 1500);
    setTimeout(apply, 3000);
    setTimeout(apply, 5000);
    setTimeout(apply, 8000);

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(apply);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });

    window.CSVB_DASHBOARD_RISQ_VIEWER_CARD = {
      build: BUILD,
      apply,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 700));
  } else {
    setTimeout(boot, 700);
  }
})();
