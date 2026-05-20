// public/q-sire-questions-viewer-action-menu.js
// C.S.V. BEACON — SIRE Viewer compact action menu
// UI-only helper. Moves existing controls; does not recreate click handlers.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-ACTION-MENU-20260519_1";
  window.CSVB_SIRE_VIEWER_ACTION_MENU_BUILD = BUILD;

  const ACTION_BUTTON_IDS = [
    "csvbPrintSelectedQuestionBtn",
    "csvbPrintFilteredQuestionListBtn",
    "csvbCopySelectedQuestionRefBtn",
    "csvbExportFilteredCsvBtn",
    "csvbExportSelectedTxtBtn",
    "csvbExportSelectedJsonBtn"
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if ($("csvbSireViewerActionMenuStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerActionMenuStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] #filterRibbon {
        padding-right: 315px !important;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-top-action-toolbar {
        position: absolute;
        top: 50%;
        right: 12px;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        z-index: 8;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-top-action-toolbar #csvbAiSourceLauncher {
        position: static !important;
        top: auto !important;
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        display: block !important;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-top-action-toolbar .btn {
        white-space: nowrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-print-export-menu {
        position: relative;
        display: inline-flex;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-print-export-menu-panel {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        min-width: 255px;
        display: none;
        z-index: 999;
        padding: 8px;
        border: 1px solid #BFD3EF;
        border-radius: 12px;
        background: #FFFFFF;
        box-shadow: 0 18px 44px rgba(3,27,63,.18);
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-print-export-menu.open .csvb-print-export-menu-panel {
        display: grid;
        gap: 7px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-print-export-menu-panel .btn {
        width: 100%;
        justify-content: flex-start;
        text-align: left;
        border-radius: 9px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-print-export-menu-title {
        color: #5E6F86;
        font-size: 11px;
        font-weight: 850;
        text-transform: uppercase;
        letter-spacing: .03em;
        padding: 2px 3px 4px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-actions-source-row-hidden {
        display: none !important;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-header-actions .csvb-sire-viewer-lock {
        margin: 0;
      }

      @media (max-width: 950px) {
        html[data-csvb-page="q-sire-questions-viewer.html"] #filterRibbon {
          padding-right: 12px !important;
          padding-bottom: 56px !important;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-top-action-toolbar {
          top: auto;
          right: 12px;
          bottom: 8px;
          transform: none;
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
    if (badge && badge.parentElement !== wrap) wrap.appendChild(badge);

    return wrap;
  }

  function moveLockPillToHeader() {
    const wrap = ensureHeaderActionWrap();
    const lock = document.querySelector(".csvb-sire-viewer-lock");
    const badge = document.querySelector(".csvb-sire-viewer-helper-badge");

    if (!wrap || !lock) return false;

    if (lock.parentElement !== wrap) {
      if (badge && badge.parentElement === wrap) wrap.insertBefore(lock, badge);
      else wrap.appendChild(lock);
    }

    return true;
  }

  function ensureToolbar() {
    const ribbon = $("filterRibbon");
    if (!ribbon) return null;

    let toolbar = $("csvbViewerTopActionToolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "csvbViewerTopActionToolbar";
      toolbar.className = "csvb-viewer-top-action-toolbar";
      ribbon.appendChild(toolbar);
    }

    return toolbar;
  }

  function ensureMenu(toolbar) {
    if (!toolbar) return null;

    let menu = $("csvbPrintExportMenu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "csvbPrintExportMenu";
      menu.className = "csvb-print-export-menu";
      menu.innerHTML = `
        <button id="csvbPrintExportMenuBtn" class="btn light" type="button">Print / Export Actions ▾</button>
        <div id="csvbPrintExportMenuPanel" class="csvb-print-export-menu-panel">
          <div class="csvb-print-export-menu-title">Print</div>
          <div id="csvbPrintExportMenuPrintHost"></div>
          <div class="csvb-print-export-menu-title">Copy / Export</div>
          <div id="csvbPrintExportMenuExportHost"></div>
        </div>
      `;
      toolbar.appendChild(menu);

      $("csvbPrintExportMenuBtn")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        menu.classList.toggle("open");
      });

      document.addEventListener("click", (ev) => {
        if (!menu.contains(ev.target)) menu.classList.remove("open");
      });

      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") menu.classList.remove("open");
      });
    }

    return menu;
  }

  function moveAiLauncher(toolbar) {
    const ai = $("csvbAiSourceLauncher");
    if (!toolbar || !ai) return false;

    if (ai.parentElement !== toolbar) {
      toolbar.insertBefore(ai, toolbar.firstChild);
    }

    return true;
  }

  function moveActionButtons() {
    const printHost = $("csvbPrintExportMenuPrintHost");
    const exportHost = $("csvbPrintExportMenuExportHost");
    if (!printHost || !exportHost) return false;

    let moved = false;

    ACTION_BUTTON_IDS.forEach((id) => {
      const btn = $(id);
      if (!btn) return;

      const host = id.includes("Print") ? printHost : exportHost;
      if (btn.parentElement !== host) {
        host.appendChild(btn);
        moved = true;
      }
    });

    document.querySelectorAll(".csvb-sire-viewer-print-actions, .csvb-sire-viewer-export-actions").forEach((row) => {
      if (!row.querySelector("button")) row.classList.add("csvb-actions-source-row-hidden");
    });

    return moved;
  }

  function applyLayout() {
    injectStyles();
    moveLockPillToHeader();

    const toolbar = ensureToolbar();
    if (!toolbar) return false;

    moveAiLauncher(toolbar);
    ensureMenu(toolbar);
    moveActionButtons();

    return true;
  }

  function boot() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      applyLayout();

      const allReady =
        !!$("csvbAiSourceLauncher") &&
        ACTION_BUTTON_IDS.every((id) => !!$(id)) &&
        !!document.querySelector(".csvb-sire-viewer-lock");

      if (tries >= 18 || allReady) {
        clearInterval(timer);
        applyLayout();
      }
    }, 350);

    setTimeout(applyLayout, 1500);
    setTimeout(applyLayout, 3000);

    window.CSVB_SIRE_VIEWER_ACTION_MENU = {
      build: BUILD,
      apply: applyLayout,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 900));
  } else {
    setTimeout(boot, 900);
  }
})();
