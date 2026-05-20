// public/csvb-dashboard-risq-viewer-card.js
// C.S.V. BEACON — RISQ Questions Viewer Dashboard card helper
// Adds and controls the synthetic RISQ Viewer card until q-dashboard.html is fully refactored.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-RISQ-VIEWER-CARD-20260520_1";
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

  function ensureCard() {
    let card = document.querySelector(`[data-card="${CARD_KEY}"]`);
    if (card) return card;

    const originalGrid = document.querySelector(".wrap > .grid") || document.querySelector(".csvb-platform-area-grid");
    if (!originalGrid) return null;

    card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-card", CARD_KEY);
    card.innerHTML = cardHtml();

    const risqEditor = document.querySelector('[data-card="risq_questions_editor"]');
    if (risqEditor?.parentElement) risqEditor.parentElement.insertBefore(card, risqEditor);
    else originalGrid.appendChild(card);

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

  function apply() {
    const card = ensureCard();
    if (!card) return false;

    const allowed = companyAllows() && rankAllows();
    card.style.display = allowed ? "block" : "none";
    return true;
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      apply();
      if (tries >= 18) clearInterval(timer);
    }, 350);

    setTimeout(apply, 1500);
    setTimeout(apply, 3000);
    setTimeout(apply, 5000);

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
