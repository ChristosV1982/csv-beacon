// public/q-sire-questions-viewer-ai-answer-modal.js
// C.S.V. BEACON — SIRE Viewer AI Answer Modal UI
// UI-only helper. It does not call external services.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-AI-ANSWER-MODAL-20260519_1";
  window.CSVB_SIRE_VIEWER_AI_ANSWER_MODAL_BUILD = BUILD;

  function $(id) {
    return document.getElementById(id);
  }

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function setStatus(message) {
    const el = $("csvbAiSourceStatus");
    if (el) el.textContent = message || "";
  }

  function injectStyles() {
    if ($("csvbAiAnswerModalStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbAiAnswerModalStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-box {
        display: none !important;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background: rgba(3, 27, 63, .52);
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal {
        width: min(1120px, 96vw);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        background: #fff;
        border: 1px solid #BFD3EF;
        border-radius: 14px;
        box-shadow: 0 24px 70px rgba(3,27,63,.28);
        overflow: hidden;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid #D6E4F5;
        background: #F8FBFF;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-title {
        color: #062A5E;
        font-weight: 900;
        font-size: 15px;
        line-height: 1.25;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-meta {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 3px;
        line-height: 1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-actions {
        display: flex;
        gap: 7px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-body {
        padding: 14px;
        overflow: auto;
        color: #10233F;
        font-size: 14px;
        line-height: 1.52;
        white-space: pre-wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-foot {
        padding: 9px 14px;
        border-top: 1px solid #D6E4F5;
        color: #5E6F86;
        font-size: 12px;
        background: #F8FBFF;
      }

      @media (max-width: 760px) {
        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-backdrop {
          padding: 10px;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-head {
          flex-direction: column;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-modal-actions {
          justify-content: flex-start;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureModal() {
    if ($("csvbAiAnswerModalBackdrop")) return;

    const modal = document.createElement("div");
    modal.id = "csvbAiAnswerModalBackdrop";
    modal.className = "csvb-ai-answer-modal-backdrop";
    modal.innerHTML = `
      <div class="csvb-ai-answer-modal" role="dialog" aria-modal="true" aria-labelledby="csvbAiAnswerModalTitle">
        <div class="csvb-ai-answer-modal-head">
          <div>
            <div id="csvbAiAnswerModalTitle" class="csvb-ai-answer-modal-title">SIRE Viewer AI Answer</div>
            <div id="csvbAiAnswerModalMeta" class="csvb-ai-answer-modal-meta">Grounded answer from selected SIRE 2.0 Viewer source pack.</div>
          </div>
          <div class="csvb-ai-answer-modal-actions">
            <button id="csvbAiAnswerModalCopyAnswerBtn" class="btn light" type="button">Copy answer</button>
            <button id="csvbAiAnswerModalCopyPackBtn" class="btn light" type="button">Copy source pack</button>
            <button id="csvbAiAnswerModalCloseBtn" class="btn" type="button">Close</button>
          </div>
        </div>
        <div id="csvbAiAnswerModalBody" class="csvb-ai-answer-modal-body"></div>
        <div class="csvb-ai-answer-modal-foot">
          Generated from the SIRE Viewer source pack. Verify critical conclusions against the referenced SIRE question numbers.
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    $("csvbAiAnswerModalCloseBtn")?.addEventListener("click", closeModal);
    $("csvbAiAnswerModalCopyAnswerBtn")?.addEventListener("click", copyModalAnswer);
    $("csvbAiAnswerModalCopyPackBtn")?.addEventListener("click", copySourcePack);

    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closeModal();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeModal();
    });
  }

  function currentAnswerText() {
    return safeStr($("csvbAiAnswerText")?.textContent || "").trim();
  }

  function currentAnswerMeta() {
    return safeStr($("csvbAiAnswerMeta")?.textContent || "").trim();
  }

  function openModal() {
    ensureModal();
    const answer = currentAnswerText();
    const meta = currentAnswerMeta();

    if (!answer) {
      setStatus("No AI answer available yet.");
      return;
    }

    const body = $("csvbAiAnswerModalBody");
    const metaEl = $("csvbAiAnswerModalMeta");
    const backdrop = $("csvbAiAnswerModalBackdrop");

    if (body) body.textContent = answer;
    if (metaEl) metaEl.textContent = meta || "Grounded answer from selected SIRE 2.0 Viewer source pack.";
    if (backdrop) backdrop.style.display = "flex";
  }

  function closeModal() {
    const backdrop = $("csvbAiAnswerModalBackdrop");
    if (backdrop) backdrop.style.display = "none";
  }

  async function copyModalAnswer() {
    const answer = safeStr($("csvbAiAnswerModalBody")?.textContent || currentAnswerText()).trim();
    if (!answer) {
      setStatus("No AI answer to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(answer);
      setStatus("AI answer copied to clipboard.");
    } catch (_) {
      setStatus("Copy failed. Browser blocked clipboard access.");
    }
  }

  async function copySourcePack() {
    const pack = window.CSVB_SIRE_VIEWER_AI_SOURCE_PACK?.getLastPackText?.() || "";
    if (!pack) {
      setStatus("No source pack to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(pack);
      setStatus("Source pack copied to clipboard.");
    } catch (_) {
      setStatus("Copy failed. Browser blocked clipboard access.");
    }
  }

  function ensureOpenButton() {
    if ($("csvbAiAnswerOpenModalBtn")) return;
    const actions = document.querySelector(".csvb-ai-source-actions");
    if (!actions) return;

    const btn = document.createElement("button");
    btn.id = "csvbAiAnswerOpenModalBtn";
    btn.className = "btn light";
    btn.type = "button";
    btn.textContent = "Open answer";
    btn.addEventListener("click", openModal);

    actions.insertBefore(btn, actions.firstChild);
  }

  function observeExistingAnswerBox() {
    const answerBox = $("csvbAiAnswerBox");
    const text = $("csvbAiAnswerText");
    if (!answerBox || !text) return false;

    let previous = "";

    const check = () => {
      const answer = currentAnswerText();
      if (!answer || answer === previous) return;
      previous = answer;
      openModal();
    };

    const observer = new MutationObserver(check);
    observer.observe(answerBox, { childList: true, subtree: true, characterData: true, attributes: true });
    observer.observe(text, { childList: true, subtree: true, characterData: true });

    check();
    return true;
  }

  function boot() {
    injectStyles();
    ensureModal();
    ensureOpenButton();

    if (!observeExistingAnswerBox()) {
      setTimeout(boot, 700);
      return;
    }

    window.CSVB_SIRE_VIEWER_AI_ANSWER_MODAL = {
      build: BUILD,
      open: openModal,
      close: closeModal
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1500));
  } else {
    setTimeout(boot, 1500);
  }
})();
