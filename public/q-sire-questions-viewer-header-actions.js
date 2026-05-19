// public/q-sire-questions-viewer-header-actions.js
// C.S.V. BEACON — SIRE Viewer header action layout
// Moves compact log buttons beside the Read-only pill.
// UI-only helper. No backend calls.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-HEADER-ACTIONS-20260519_1";
  window.CSVB_SIRE_VIEWER_HEADER_ACTIONS_BUILD = BUILD;

  function $(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if ($("csvbSireViewerHeaderActionsStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerHeaderActionsStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-helper {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 7px;
        flex-wrap: wrap;
        min-width: fit-content;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-sire-viewer-helper-badge {
        margin: 0;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-sire-change-log-trigger,
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-ai-usage-trigger {
        width: auto !important;
        margin: 0 !important;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-sire-change-log-trigger .btn,
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-ai-usage-trigger .btn,
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-sire-viewer-helper-badge {
        padding: 7px 10px;
        white-space: nowrap;
      }

      @media (max-width: 900px) {
        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-helper {
          align-items: stretch;
          flex-direction: column;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions {
          margin-left: 0;
          justify-content: flex-start;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureHeaderActionWrap() {
    const helper = document.querySelector(".csvb-sire-viewer-helper");
    if (!helper) return null;

    let wrap = $("csvbSireViewerHeaderActions");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "csvbSireViewerHeaderActions";
      wrap.className = "csvb-sire-viewer-header-actions";
      helper.appendChild(wrap);
    }

    const badge = helper.querySelector(".csvb-sire-viewer-helper-badge");
    if (badge && badge.parentElement !== wrap) {
      wrap.appendChild(badge);
    }

    return wrap;
  }

  function moveButton(id, wrap) {
    const el = $(id);
    if (!el || !wrap) return false;
    if (el.parentElement !== wrap) wrap.insertBefore(el, wrap.firstChild);
    return true;
  }

  function alignActions() {
    const wrap = ensureHeaderActionWrap();
    if (!wrap) return false;

    const movedChangeLog = moveButton("csvbSireViewerChangeLogTrigger", wrap);
    const movedAiUsage = moveButton("csvbAiUsageLogTrigger", wrap);

    return movedChangeLog || movedAiUsage;
  }

  function boot() {
    injectStyles();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const moved = alignActions();
      const hasChange = !!$("csvbSireViewerChangeLogTrigger");
      const hasUsage = !!$("csvbAiUsageLogTrigger");

      if (tries >= 20 || (moved && hasChange && hasUsage)) {
        clearInterval(timer);
      }
    }, 350);

    setTimeout(alignActions, 1200);
    setTimeout(alignActions, 2500);
    setTimeout(alignActions, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 900));
  } else {
    setTimeout(boot, 900);
  }
})();
