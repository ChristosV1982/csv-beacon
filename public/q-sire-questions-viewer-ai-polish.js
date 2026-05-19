// public/q-sire-questions-viewer-ai-polish.js
// C.S.V. BEACON — SIRE Viewer AI Search UI polish
// UI-only helper. No backend/API calls.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-AI-POLISH-20260519_1";
  window.CSVB_SIRE_VIEWER_AI_POLISH_BUILD = BUILD;

  function $(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if ($("csvbSireViewerAiPolishStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerAiPolishStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] #csvbAiAskBtn {
        order: -20;
        background: #062A5E;
        color: #fff;
        border-color: #062A5E;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] #csvbAiOpenAnswerBtn,
      html[data-csvb-page="q-sire-questions-viewer.html"] #csvbAiAnswerOpenModalBtn {
        order: -10;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] #csvbAiSourceRunBtn {
        white-space: nowrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal-note b {
        color: #062A5E;
      }
    `;

    document.head.appendChild(style);
  }

  function polishControls() {
    const sourceBtn = $("csvbAiSourceRunBtn");
    const askBtn = $("csvbAiAskBtn");
    const copyPackBtn = $("csvbAiSourceCopyBtn");
    const clearBtn = $("csvbAiSourceClearBtn");
    const title = $("csvbAiSourceModalTitle");
    const query = $("csvbAiSourceQuery");

    if (sourceBtn) {
      sourceBtn.textContent = "Find sources";
      sourceBtn.title = "Find matching SIRE Viewer source questions without generating an AI answer.";
      sourceBtn.classList.add("light");
    }

    if (askBtn) {
      askBtn.textContent = "Ask AI";
      askBtn.title = "Generate a grounded answer from the matched SIRE Viewer source pack.";
    }

    if (copyPackBtn) {
      copyPackBtn.textContent = "Copy sources";
      copyPackBtn.title = "Copy the full source pack used for the AI answer.";
    }

    if (clearBtn) {
      clearBtn.textContent = "Clear";
    }

    if (title) {
      title.textContent = "SIRE 2.0 AI Search";
    }

    const note = document.querySelector(".csvb-ai-source-modal-note");
    if (note) {
      note.innerHTML = "Ask a SIRE 2.0 topic or operational question. <b>Ask AI</b> generates the answer from matched Viewer sources only; <b>Find sources</b> only displays the source pack.";
    }

    if (query) {
      query.placeholder = "Ask topic, e.g. gas instruments / enclosed space / ECDIS safety depth";
    }
  }

  function wireEnterToAskAi() {
    document.addEventListener("keydown", (ev) => {
      const target = ev.target;
      if (!target || target.id !== "csvbAiSourceQuery" || ev.key !== "Enter") return;

      const askBtn = $("csvbAiAskBtn");
      if (!askBtn) return;

      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      askBtn.click();
    }, true);
  }

  function boot() {
    injectStyles();
    polishControls();
    wireEnterToAskAi();

    const observer = new MutationObserver(() => polishControls());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1500));
  } else {
    setTimeout(boot, 1500);
  }
})();
