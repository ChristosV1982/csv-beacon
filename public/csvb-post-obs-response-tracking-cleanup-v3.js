// public/csvb-post-obs-response-tracking-cleanup-v3.js
// C.S.V. BEACON — Post-Inspection Observation Detail Response Tracking de-duplication.
// Removes duplicated/collapsible Response Tracking header and stray arrow controls.
// UI-only helper. No backend/auth/device/offline logic.

(() => {
  "use strict";

  const BUILD = "POST-OBS-RESPONSE-TRACKING-CLEANUP-20260528_3";
  window.CSVB_POST_OBS_RESPONSE_TRACKING_CLEANUP_BUILD = BUILD;

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isResponseTrackingTitle(el) {
    if (!el) return false;
    if (el.querySelector?.("select,input,textarea,option,label")) return false;

    const text = norm(el.textContent)
      .replace(/[▾▼▴▲⌄⌃⌵˅∨∧]+/g, "")
      .trim()
      .toLowerCase();

    return text === "response tracking";
  }

  function responseTrackingCard() {
    const field = document.getElementById("responseStatus");
    return field?.closest(".pi-card,.card,section,div") || null;
  }

  function hideElement(el, reason) {
    if (!el) return;
    el.setAttribute("data-csvb-response-tracking-cleanup", `${BUILD}:${reason}`);
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }

  function keepCanonicalTitle(card) {
    const directChildren = Array.from(card.children || []);

    const canonical =
      directChildren.find((el) => el.tagName === "H2" && isResponseTrackingTitle(el)) ||
      directChildren.find((el) => isResponseTrackingTitle(el));

    if (canonical) {
      canonical.textContent = "Response Tracking";
      canonical.style.setProperty("cursor", "default", "important");
      canonical.style.setProperty("pointer-events", "none", "important");
      canonical.setAttribute("data-csvb-response-tracking-title", "canonical");

      // Remove direct event listeners by replacing with a clean clone.
      if (!canonical.dataset.csvbCleanTitleCloned) {
        const clone = canonical.cloneNode(true);
        clone.dataset.csvbCleanTitleCloned = "1";
        canonical.replaceWith(clone);
      }
    }

    directChildren.forEach((el) => {
      if (el === canonical) return;
      if (isResponseTrackingTitle(el)) {
        hideElement(el, "duplicate-title");
      }
    });
  }

  function isInsideRealFormArea(el) {
    return !!el.closest(
      ".pi-field,.response-block,.save-row,.pgno-list,.grid-2,.grid-3,label,select,input,textarea,option,summary"
    );
  }

  function hasImportantText(el) {
    const text = norm(el.textContent);
    const aria = norm(el.getAttribute("aria-label"));
    const title = norm(el.getAttribute("title"));
    const combined = [text, aria, title].filter(Boolean).join(" ");

    return /(subsequent|comment|save|reload|select|status|responsible|date|closed|open|progress|cause|action|verifier|target|dashboard|logout|inspection)/i.test(combined);
  }

  function isSmallArrowLike(el) {
    const text = norm(el.textContent);
    const aria = norm(el.getAttribute("aria-label"));
    const title = norm(el.getAttribute("title"));
    const combined = [text, aria, title].filter(Boolean).join(" ").trim();

    if (hasImportantText(el)) return false;
    if (!combined) return true;

    return /^[▾▼▴▲⌄⌃⌵˅∨∧vV<>›‹\-]+$/.test(combined);
  }

  function hideStrayArrows(card) {
    const cardRect = card.getBoundingClientRect();

    document.querySelectorAll("button,a,[role='button'],span,div,i,svg").forEach((el) => {
      if (!el || !document.body.contains(el)) return;
      if (el.matches("select,input,textarea,option,label,summary")) return;
      if (isInsideRealFormArea(el)) return;
      if (!isSmallArrowLike(el)) return;

      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const small = rect.width <= 80 && rect.height <= 80;
      const nearResponseTop =
        rect.top >= cardRect.top - 50 &&
        rect.top <= cardRect.top + 160;
      const nearRightEdge =
        rect.left >= cardRect.right - 130 &&
        rect.left <= cardRect.right + 40;

      if (small && nearResponseTop && nearRightEdge) {
        hideElement(el, "stray-arrow");
      }
    });
  }

  function forceOpen(card) {
    card.classList.remove("collapsed", "is-collapsed", "closed", "is-closed");
    card.removeAttribute("aria-expanded");
    card.removeAttribute("data-collapsed");

    const grid = card.querySelector(".grid-3");
    if (grid) {
      grid.hidden = false;
      grid.removeAttribute("aria-hidden");
      grid.style.removeProperty("display");
    }

    card.querySelectorAll(".response-block,.save-row").forEach((el) => {
      el.hidden = false;
      el.removeAttribute("aria-hidden");
      el.style.removeProperty("display");
    });
  }

  function cleanup() {
    const card = responseTrackingCard();
    if (!card) return;

    keepCanonicalTitle(card);
    hideStrayArrows(card);
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
