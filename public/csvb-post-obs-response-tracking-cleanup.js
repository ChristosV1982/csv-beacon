// public/csvb-post-obs-response-tracking-cleanup.js
// C.S.V. BEACON — Post-Inspection Observation Detail response-tracking cleanup.
// Removes stray arrow-only toggle buttons rendered near Response Tracking.
// UI-only helper. No backend/auth/device/offline logic.

(() => {
  "use strict";

  const BUILD = "POST-OBS-RESPONSE-TRACKING-CLEANUP-20260528_1";
  window.CSVB_POST_OBS_RESPONSE_TRACKING_CLEANUP_BUILD = BUILD;

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isArrowOnly(el) {
    const text = norm(el.textContent);
    const aria = norm(el.getAttribute("aria-label"));
    const title = norm(el.getAttribute("title"));
    const value = norm(el.getAttribute("value"));
    const combined = [text, aria, title, value].filter(Boolean).join(" ");

    if (!combined) return false;
    if (/(subsequent|comment|save|reload|select|status|responsible|date|closed|open|progress)/i.test(combined)) return false;
    return /^[▾▼▴▲⌄⌃⌵˅∨∧vV<>›‹⌄\-]+$/.test(combined);
  }

  function responseTrackingCard() {
    const headings = Array.from(document.querySelectorAll("h2,h3,.card-title,.section-title"));
    const h = headings.find((x) => norm(x.textContent).toLowerCase() === "response tracking");
    return h?.closest(".pi-card,.card,.response-card,section,div") || null;
  }

  function shouldRemove(el, card) {
    if (!el || !card || !card.contains(el)) return false;
    if (el.matches("select,input,textarea,option,label,summary")) return false;
    if (el.closest(".pi-field,.response-block,.save-row,.pgno-list,.grid-2,.grid-3")) return false;
    if (!isArrowOnly(el)) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width > 90 || rect.height > 70) return false;

    return true;
  }

  function cleanup() {
    const card = responseTrackingCard();
    if (!card) return;

    card.querySelectorAll("button,a,[role='button'],span,div").forEach((el) => {
      if (shouldRemove(el, card)) {
        el.setAttribute("data-csvb-removed-stray-response-arrow", "1");
        el.style.display = "none";
        el.style.visibility = "hidden";
        el.style.pointerEvents = "none";
      }
    });
  }

  function boot() {
    cleanup();
    [250, 700, 1200, 2200, 4000].forEach((ms) => setTimeout(cleanup, ms));

    if (window.MutationObserver) {
      const mo = new MutationObserver(() => cleanup());
      mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
