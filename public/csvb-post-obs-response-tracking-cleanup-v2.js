// public/csvb-post-obs-response-tracking-cleanup-v2.js
// C.S.V. BEACON — stronger Post-Inspection Observation Detail response-tracking cleanup.
// Removes stray small arrow/collapse controls beside the Response Tracking card.
// UI-only helper. No backend/auth/device/offline logic.

(() => {
  "use strict";

  const BUILD = "POST-OBS-RESPONSE-TRACKING-CLEANUP-20260528_2";
  window.CSVB_POST_OBS_RESPONSE_TRACKING_CLEANUP_BUILD = BUILD;

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function responseTrackingCard() {
    const h = Array.from(document.querySelectorAll("h2,h3,.card-title,.section-title"))
      .find((x) => norm(x.textContent).toLowerCase() === "response tracking");
    return h?.closest(".pi-card,.card,section,div") || null;
  }

  function hasImportantText(el) {
    const text = norm(el.textContent);
    const aria = norm(el.getAttribute("aria-label"));
    const title = norm(el.getAttribute("title"));
    const combined = [text, aria, title].filter(Boolean).join(" ");
    return /(subsequent|comment|save|reload|select|status|responsible|date|closed|open|progress|cause|action|verifier|target)/i.test(combined);
  }

  function isInsideRealField(el) {
    return !!el.closest(".pi-field,.response-block,.save-row,.pgno-list,.grid-2,.grid-3,label,select,input,textarea,option,summary");
  }

  function isSuspiciousSmallControl(el, card) {
    if (!el || !card || !card.contains(el)) return false;
    if (el.matches("select,input,textarea,option,label,summary")) return false;
    if (isInsideRealField(el)) return false;
    if (hasImportantText(el)) return false;

    const rect = el.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;

    const small = rect.width <= 72 && rect.height <= 72;
    const nearRightEdge = rect.left >= cardRect.right - 120;
    const nearTopHalf = rect.top <= cardRect.top + Math.max(220, cardRect.height * 0.45);

    const text = norm(el.textContent);
    const arrowLike = !text || /^[▾▼▴▲⌄⌃⌵˅∨∧vV<>›‹\-]+$/.test(text);

    return small && nearRightEdge && nearTopHalf && arrowLike;
  }

  function hide(el) {
    el.setAttribute("data-csvb-removed-stray-response-arrow", BUILD);
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function cleanup() {
    const card = responseTrackingCard();
    if (!card) return;

    const candidates = card.querySelectorAll("button,a,[role='button'],span,div,i,svg");
    candidates.forEach((el) => {
      if (isSuspiciousSmallControl(el, card)) hide(el);
    });
  }

  function boot() {
    cleanup();
    [100, 300, 700, 1200, 2200, 4000, 7000].forEach((ms) => setTimeout(cleanup, ms));

    if (window.MutationObserver) {
      const mo = new MutationObserver(() => cleanup());
      mo.observe(document.body, { childList: true, subtree: true, attributes: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
