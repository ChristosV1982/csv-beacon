// public/risq-questions-compact-detail.js
// C.S.V. BEACON — Shared RISQ detail compaction helper
// Frontend display only. Keeps all RISQ data in place; hides non-essential info boxes, top statistics cards and default metadata pills.

(() => {
  "use strict";

  const BUILD = "RISQ-COMPACT-DETAIL-20260520_3";
  window.CSVB_RISQ_COMPACT_DETAIL_BUILD = BUILD;

  const HIDE_LABELS = new Set([
    "question set",
    "source pages",
    "mapping source",
    "origin",
    "section",
    "answer options"
  ]);

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function esc(value) {
    return safeStr(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function compactSpaces(value) {
    return safeStr(value).replace(/\s+/g, " ").trim();
  }

  function normalizeSection(value) {
    const raw = safeStr(value).trim();
    if (!raw) return "";

    const lines = raw.split(/\n+/).map((x) => compactSpaces(x)).filter(Boolean);
    if (lines.length >= 2) return `${lines[0]} — ${lines.slice(1).join(" ")}`;
    return compactSpaces(raw);
  }

  function normalizeAnswers(value) {
    const raw = safeStr(value).trim();
    if (!raw) return "";

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.join(" / ");
    } catch (_) {}

    return compactSpaces(raw);
  }

  function injectStyles() {
    if (document.getElementById("csvbRisqCompactDetailStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbRisqCompactDetailStyles";
    style.textContent = `
      body:has(.detail-card) .stats-grid {
        display: none !important;
      }

      .csvb-risq-hidden-info-box,
      .csvb-risq-hidden-default-pill {
        display: none !important;
      }

      .info-grid.csvb-risq-info-grid-empty {
        display: none !important;
      }

      .csvb-risq-detail-compact-pills {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin: 7px 0 4px;
        width: 100%;
      }

      .csvb-risq-detail-compact-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        max-width: min(640px, 100%);
        border: 1px solid #BFD3EF;
        background: #EEF6FF;
        color: #1A4170;
        border-radius: 999px;
        padding: 4px 9px;
        font-weight: 850;
        font-size: 11px;
        line-height: 1.2;
        white-space: normal;
      }

      .csvb-risq-detail-compact-pill strong {
        margin-right: 4px;
        color: #062A5E;
      }

      .csvb-risq-detail-compact-pill.answers {
        border-color: #BDE8D0;
        background: #ECFDF3;
        color: #067647;
      }

      .csvb-risq-detail-compact-pill.answers strong {
        color: #055D3C;
      }

      @media (max-width: 900px) {
        .csvb-risq-detail-compact-pills {
          justify-content: flex-start;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function labelText(box) {
    return compactSpaces(box?.querySelector(".info-label")?.textContent || "").toLowerCase();
  }

  function valueText(box) {
    return safeStr(box?.querySelector(".info-value")?.textContent || "").trim();
  }

  function detailBodyForGrid(grid) {
    return grid.closest(".detail-body") || grid.parentElement;
  }

  function insertOrUpdatePills(detailBody, sectionText, answerText) {
    if (!detailBody) return;

    let row = detailBody.querySelector(":scope > .csvb-risq-detail-compact-pills");

    if (!sectionText && !answerText) {
      row?.remove();
      return;
    }

    if (!row) {
      row = document.createElement("div");
      row.className = "csvb-risq-detail-compact-pills";

      const questionBox = detailBody.querySelector(".detail-question");
      const firstInfoGrid = detailBody.querySelector(".info-grid");

      if (questionBox) questionBox.insertAdjacentElement("beforebegin", row);
      else if (firstInfoGrid) firstInfoGrid.insertAdjacentElement("beforebegin", row);
      else detailBody.prepend(row);
    }

    const parts = [];

    if (sectionText) {
      parts.push(`<span class="csvb-risq-detail-compact-pill section"><strong>Section:</strong>${esc(sectionText)}</span>`);
    }

    if (answerText) {
      parts.push(`<span class="csvb-risq-detail-compact-pill answers"><strong>Answers:</strong>${esc(answerText)}</span>`);
    }

    row.innerHTML = parts.join("");
  }

  function shouldHideDefaultPill(text) {
    const raw = compactSpaces(text);
    const lower = raw.toLowerCase();

    if (!raw) return false;

    // Duplicates the clearer compact Answers pill.
    if (lower.startsWith("answer:")) return true;

    // Default/non-action metadata.
    if (lower === "standard risq") return true;
    if (lower === "active question") return true;
    if (lower === "guide provided") return true;

    // Marker remains visible only when not blank.
    if (lower === "marker: blank") return true;

    return false;
  }

  function processDefaultPills(detailBody) {
    if (!detailBody) return;

    detailBody.querySelectorAll(".pill-row .pill").forEach((pill) => {
      const text = compactSpaces(pill.textContent || "");

      if (shouldHideDefaultPill(text)) {
        pill.classList.add("csvb-risq-hidden-default-pill");
      } else {
        pill.classList.remove("csvb-risq-hidden-default-pill");
      }
    });
  }

  function processInfoGrid(grid) {
    if (!grid || grid.dataset.csvbRisqCompactProcessing === "1") return;

    grid.dataset.csvbRisqCompactProcessing = "1";

    try {
      const boxes = Array.from(grid.querySelectorAll(":scope > .info-box"));
      if (!boxes.length) return;

      let sectionText = "";
      let answerText = "";

      boxes.forEach((box) => {
        const label = labelText(box);
        const value = valueText(box);

        if (label === "section") sectionText = normalizeSection(value);
        if (label === "answer options") answerText = normalizeAnswers(value);

        if (HIDE_LABELS.has(label)) {
          box.classList.add("csvb-risq-hidden-info-box");
        }
      });

      const visibleBoxes = boxes.filter((box) => !box.classList.contains("csvb-risq-hidden-info-box"));

      if (!visibleBoxes.length) {
        grid.classList.add("csvb-risq-info-grid-empty");
      } else {
        grid.classList.remove("csvb-risq-info-grid-empty");
      }

      const detailBody = detailBodyForGrid(grid);
      insertOrUpdatePills(detailBody, sectionText, answerText);
      processDefaultPills(detailBody);
    } finally {
      grid.dataset.csvbRisqCompactProcessing = "0";
    }
  }

  function apply() {
    injectStyles();
    document.querySelectorAll(".detail-body .info-grid").forEach(processInfoGrid);
    document.querySelectorAll(".detail-body").forEach(processDefaultPills);
  }

  function boot() {
    apply();

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(apply);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(apply, 500);
    setTimeout(apply, 1200);
    setTimeout(apply, 2500);

    window.CSVB_RISQ_COMPACT_DETAIL = {
      build: BUILD,
      apply,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 150));
  } else {
    setTimeout(boot, 150);
  }
})();
