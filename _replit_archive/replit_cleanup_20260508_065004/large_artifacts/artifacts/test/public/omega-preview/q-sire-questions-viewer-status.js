// public/q-sire-questions-viewer-status.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer status-panel polish
// Viewer-only visual helper. No data writes. No SQL.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-STATUS-20260516_1";
  window.CSVB_SIRE_VIEWER_STATUS_BUILD = BUILD;

  function $(id) {
    return document.getElementById(id);
  }

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function textOf(id) {
    return safeStr($(id)?.textContent).trim();
  }

  function injectStyles() {
    if ($("csvbSireViewerStatusStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerStatusStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-panel {
        margin-top: 9px;
        border: 1px solid #D6E4F5;
        background: #F8FBFF;
        border-radius: 12px;
        padding: 8px;
        display: grid;
        grid-template-columns: 1fr;
        gap: 5px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-row {
        display: grid;
        grid-template-columns: 128px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        font-size: 12px;
        line-height: 1.25;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-label {
        color: #5E6F86;
        font-weight: 700;
        white-space: nowrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-value {
        color: #10233F;
        font-weight: 600;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-ok {
        color: #0B6B3A;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-working {
        color: #8A5A00;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-warn {
        color: #8B1D1D;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-viewer-status-source-lines {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($("csvbViewerStatusPanel")) return;

    const meta = document.querySelector(".sidebar .card .meta");
    if (!meta || !meta.parentElement) return;

    const panel = document.createElement("div");
    panel.id = "csvbViewerStatusPanel";
    panel.className = "csvb-viewer-status-panel";
    panel.innerHTML = `
      <div class="csvb-viewer-status-row">
        <div class="csvb-viewer-status-label">Filtered results</div>
        <div class="csvb-viewer-status-value" id="csvbViewerFilteredStatus">—</div>
      </div>
      <div class="csvb-viewer-status-row">
        <div class="csvb-viewer-status-label">Loaded library</div>
        <div class="csvb-viewer-status-value" id="csvbViewerLoadedStatus">—</div>
      </div>
      <div class="csvb-viewer-status-row">
        <div class="csvb-viewer-status-label">EE / PGNO index</div>
        <div class="csvb-viewer-status-value" id="csvbViewerEePgnoStatus">—</div>
      </div>
      <div class="csvb-viewer-status-row">
        <div class="csvb-viewer-status-label">References index</div>
        <div class="csvb-viewer-status-value" id="csvbViewerRefStatus">—</div>
      </div>
    `;

    meta.insertAdjacentElement("afterend", panel);
    meta.classList.add("csvb-viewer-status-source-lines");

    const loadHint = $("loadHint");
    if (loadHint) loadHint.classList.add("csvb-viewer-status-source-lines");
  }

  function setStatus(id, text, state) {
    const el = $(id);
    if (!el) return;

    el.textContent = text || "—";
    el.classList.remove("csvb-viewer-status-ok", "csvb-viewer-status-working", "csvb-viewer-status-warn");

    if (state === "ok") el.classList.add("csvb-viewer-status-ok");
    if (state === "working") el.classList.add("csvb-viewer-status-working");
    if (state === "warn") el.classList.add("csvb-viewer-status-warn");
  }

  function parseLoadedCount(text) {
    const m = safeStr(text).match(/Loaded\s+(\d+)\s+active\s+SIRE\s+2\.0\s+questions/i);
    return m ? Number(m[1]) : null;
  }

  function progressText(status, label) {
    if (!status || !Number.isFinite(status.total) || status.total <= 0) {
      return { text: "Not started", state: "working" };
    }

    const indexed = Number(status.indexed || 0);
    const total = Number(status.total || 0);
    const errors = Number(status.errors || 0);

    if (indexed < total) {
      return { text: `${indexed}/${total} indexed`, state: "working" };
    }

    if (errors > 0) {
      return { text: `Complete with ${errors} fallback/error record(s)`, state: "warn" };
    }

    return { text: `Complete — ${total}/${total} indexed`, state: "ok" };
  }

  function update() {
    ensurePanel();

    const countLine = textOf("countLine");
    setStatus("csvbViewerFilteredStatus", countLine || "—", "ok");

    const loadedLine = textOf("loadedLine") || textOf("loadHint");
    const loadedCount = parseLoadedCount(loadedLine);
    setStatus(
      "csvbViewerLoadedStatus",
      loadedCount !== null ? `${loadedCount} active SIRE 2.0 questions` : "Loading…",
      loadedCount !== null ? "ok" : "working"
    );

    const childStatus = window.CSVB_SIRE_QUESTIONS_VIEWER?.getChildSearchIndexStatus?.();
    const child = progressText(childStatus, "EE / PGNO");
    setStatus("csvbViewerEePgnoStatus", child.text, child.state);

    const refStatus = window.CSVB_SIRE_QUESTIONS_VIEWER?.getReferenceSearchIndexStatus?.();
    const ref = progressText(refStatus, "References");
    setStatus("csvbViewerRefStatus", ref.text, ref.state);
  }

  function observe() {
    const targets = [$("countLine"), $("loadedLine"), $("loadHint")].filter(Boolean);
    const observer = new MutationObserver(update);

    targets.forEach((el) => {
      observer.observe(el, { childList: true, characterData: true, subtree: true });
    });

    const input = $("searchInput");
    if (input) input.addEventListener("input", () => setTimeout(update, 0));

    setInterval(update, 1000);
  }

  function init() {
    injectStyles();
    ensurePanel();
    update();
    observe();

    setTimeout(update, 500);
    setTimeout(update, 1500);
    setTimeout(update, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
