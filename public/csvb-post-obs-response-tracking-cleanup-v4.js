// public/csvb-post-obs-response-tracking-cleanup-v4.js
// C.S.V. BEACON — Post-Inspection Observation Detail Response Tracking cleanup v4.
// Correctly scopes cleanup to the actual Response Tracking card.
// UI-only helper. No backend/auth/device/offline logic.

(() => {
  "use strict";

  const BUILD = "POST-OBS-RESPONSE-TRACKING-CLEANUP-20260528_4";
  window.CSVB_POST_OBS_RESPONSE_TRACKING_CLEANUP_BUILD = BUILD;

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function responseTrackingCard() {
    const field = document.getElementById("responseStatus");
    if (!field) return null;
    return field.closest(".pi-card") || field.closest(".card") || field.closest("section");
  }

  function isInsideRealControlArea(el) {
    return !!el.closest(".pi-field,.response-block,.save-row,.pgno-list,.grid-2,.grid-3,label,select,input,textarea,option");
  }

  function cleanTitleText(el) {
    return norm(el?.textContent)
      .replace(/[▾▼▴▲⌄⌃⌵˅∨∧]/g, "")
      .trim()
      .toLowerCase();
  }

  function isResponseTrackingTitle(el) {
    if (!el) return false;
    if (el.querySelector?.("select,input,textarea,option,label")) return false;
    return cleanTitleText(el) === "response tracking";
  }

  function hideElement(el, reason) {
    if (!el) return;
    el.setAttribute("data-csvb-response-tracking-cleanup", `${BUILD}:${reason}`);
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function normalizeTitles(card) {
    const candidates = Array.from(card.querySelectorAll("h1,h2,h3,h4,.card-title,.section-title,summary,button,span,div"))
      .filter((el) => !isInsideRealControlArea(el))
      .filter(isResponseTrackingTitle);

    if (!candidates.length) return;

    const keeper = candidates.find((el) => el.tagName === "H2") || candidates[0];
    keeper.textContent = "Response Tracking";
    keeper.setAttribute("data-csvb-response-tracking-title", "canonical");
    keeper.style.setProperty("cursor", "default", "important");

    // Stop click bubbling from the visible title if an outer collapse handler exists.
    if (!keeper.dataset.csvbResponseTrackingClickGuard) {
      keeper.dataset.csvbResponseTrackingClickGuard = "1";
      keeper.addEventListener("click", (ev) => {
        ev.stopPropagation();
      }, true);
    }

    candidates.forEach((el) => {
      if (el !== keeper) hideElement(el, "duplicate-title");
    });
  }

  function hasImportantText(el) {
    const combined = [el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
      .map(norm)
      .filter(Boolean)
      .join(" ");
    return /(subsequent|comment|save|reload|select|status|responsible|date|closed|open|progress|cause|action|verifier|target|dashboard|logout|inspection)/i.test(combined);
  }

  function arrowLike(el) {
    if (hasImportantText(el)) return false;
    const combined = [el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")]
      .map(norm)
      .filter(Boolean)
      .join(" ")
      .trim();
    return !combined || /^[▾▼▴▲⌄⌃⌵˅∨∧vV<>›‹\-]+$/.test(combined);
  }

  function hideStrayArrowControls(card) {
    const cardRect = card.getBoundingClientRect();

    card.querySelectorAll("button,a,[role='button'],span,div,i,svg").forEach((el) => {
      if (!el || !document.body.contains(el)) return;
      if (el.matches("select,input,textarea,option,label,summary")) return;
      if (isInsideRealControlArea(el)) return;
      if (!arrowLike(el)) return;

      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const small = rect.width <= 90 && rect.height <= 80;
      const nearTop = rect.top >= cardRect.top - 40 && rect.top <= cardRect.top + 180;
      const nearRight = rect.left >= cardRect.right - 150 && rect.left <= cardRect.right + 40;

      if (small && nearTop && nearRight) hideElement(el, "stray-arrow");
    });
  }

  function forceOpen(card) {
    card.classList.remove("collapsed", "is-collapsed", "closed", "is-closed");
    card.removeAttribute("aria-expanded");
    card.removeAttribute("data-collapsed");

    card.querySelectorAll(".grid-3,.response-block,.save-row").forEach((el) => {
      el.hidden = false;
      el.removeAttribute("aria-hidden");
      if (el.style.display === "none") el.style.removeProperty("display");
    });
  }

  function cleanup() {
    const card = responseTrackingCard();
    if (!card) return;
    normalizeTitles(card);
    hideStrayArrowControls(card);
    forceOpen(card);
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
