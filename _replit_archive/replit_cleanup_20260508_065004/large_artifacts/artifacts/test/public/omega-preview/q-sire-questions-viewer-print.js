// public/q-sire-questions-viewer-print.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer print tools
// Viewer-only helper. No Supabase writes. No dependency on old library.html / app.js / print.js.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-PRINT-20260516_1";
  window.CSVB_SIRE_VIEWER_PRINT_BUILD = BUILD;

  function $(id) {
    return document.getElementById(id);
  }

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

  function textOf(selectorOrId) {
    const el = selectorOrId.startsWith("#") || selectorOrId.startsWith(".")
      ? document.querySelector(selectorOrId)
      : $(selectorOrId);
    return safeStr(el?.textContent).trim();
  }

  function warn(message) {
    const box = $("warnBox");
    if (!box) {
      alert(message);
      return;
    }
    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
  }

  function injectScreenStyles() {
    if ($("csvbSireViewerPrintStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerPrintStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-print-actions {
        margin-top: 8px;
        gap: 8px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-print-actions .btn {
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  function injectButtons() {
    if ($("csvbPrintSelectedQuestionBtn")) return;

    const reloadBtn = $("reloadBtn");
    if (!reloadBtn) return;

    const existingRow = reloadBtn.closest(".row");
    if (!existingRow || !existingRow.parentElement) return;

    const row = document.createElement("div");
    row.className = "row gap csvb-sire-viewer-print-actions";
    row.innerHTML = `
      <button id="csvbPrintSelectedQuestionBtn" class="btn light" type="button" data-csvb-help="Print the currently selected SIRE 2.0 question with visible read-only details.">Print selected question</button>
      <button id="csvbPrintFilteredQuestionListBtn" class="btn light" type="button" data-csvb-help="Print the currently filtered SIRE 2.0 question list.">Print filtered list</button>
    `;

    existingRow.insertAdjacentElement("afterend", row);

    $("csvbPrintSelectedQuestionBtn")?.addEventListener("click", printSelectedQuestion);
    $("csvbPrintFilteredQuestionListBtn")?.addEventListener("click", printFilteredList);
  }

  function printWindow(title, bodyHtml) {
    const win = window.open("", "", "width=1100,height=900");
    if (!win) {
      warn("Print window was blocked by the browser. Allow pop-ups for this site and try again.");
      return;
    }

    const css = `
      body {
        margin: 0;
        padding: 14px;
        font-family: Arial, Segoe UI, sans-serif;
        color: #111827;
        background: #fff;
        font-size: 12px;
        line-height: 1.35;
      }
      .print-header {
        border-bottom: 2px solid #062A5E;
        padding-bottom: 8px;
        margin-bottom: 12px;
      }
      .print-title {
        color: #062A5E;
        font-size: 18px;
        font-weight: 800;
        margin: 0 0 4px;
      }
      .print-subtitle {
        color: #374151;
        font-size: 11px;
      }
      .qno {
        color: #062A5E;
        font-weight: 800;
        font-size: 16px;
        margin-bottom: 4px;
      }
      .subject {
        border: 1px solid #C8DAEF;
        background: #EAF3FB;
        color: #062A5E;
        border-radius: 8px;
        padding: 6px 8px;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .section {
        margin: 10px 0;
        border: 1px solid #D6E4F5;
        border-radius: 8px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .section-title {
        background: #F2F7FD;
        color: #062A5E;
        font-weight: 800;
        padding: 6px 8px;
        border-bottom: 1px solid #D6E4F5;
      }
      .section-body {
        padding: 8px;
        white-space: pre-wrap;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: 170px 1fr 170px 1fr;
        border-top: 1px solid #D6E4F5;
        border-left: 1px solid #D6E4F5;
      }
      .meta-label, .meta-value {
        border-right: 1px solid #D6E4F5;
        border-bottom: 1px solid #D6E4F5;
        padding: 5px 7px;
      }
      .meta-label {
        background: #F2F7FD;
        color: #062A5E;
        font-weight: 800;
      }
      .item {
        border: 1px solid #D6E4F5;
        border-radius: 7px;
        padding: 7px 8px;
        margin: 7px 0;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .item-code {
        color: #062A5E;
        font-weight: 800;
        margin-bottom: 4px;
      }
      .muted {
        color: #6B7280;
      }
      .question-list {
        width: 100%;
        border-collapse: collapse;
      }
      .question-list th,
      .question-list td {
        border: 1px solid #D6E4F5;
        padding: 6px 7px;
        vertical-align: top;
      }
      .question-list th {
        background: #F2F7FD;
        color: #062A5E;
        text-align: left;
      }
      @media print {
        body { padding: 5mm; }
        @page { size: A4 portrait; margin: 7mm; }
        .section, .item, tr { break-inside: avoid; page-break-inside: avoid; }
      }
    `;

    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 300);
  }

  function section(title, content) {
    const clean = safeStr(content).trim();
    return `
      <div class="section">
        <div class="section-title">${esc(title)}</div>
        <div class="section-body">${clean ? esc(clean) : '<span class="muted">No data recorded.</span>'}</div>
      </div>
    `;
  }

  function meta(label, value) {
    return `<div class="meta-label">${esc(label)}</div><div class="meta-value">${esc(value || "—")}</div>`;
  }

  function collectMasterRows(hostId) {
    const host = $(hostId);
    if (!host) return [];

    return Array.from(host.querySelectorAll(".masterRow")).map((row) => {
      const code = safeStr(row.querySelector(".masterCode")?.textContent).trim();
      const bodies = Array.from(row.querySelectorAll(".masterBody,.masterTiny"))
        .map((el) => safeStr(el.textContent).trim())
        .filter(Boolean);
      return { code, text: bodies.join("\n") };
    }).filter((item) => item.code || item.text);
  }

  function rowsSection(title, items) {
    if (!items.length) return section(title, "No data recorded.");

    return `
      <div class="section">
        <div class="section-title">${esc(title)}</div>
        <div class="section-body">
          ${items.map((item) => `
            <div class="item">
              ${item.code ? `<div class="item-code">${esc(item.code)}</div>` : ""}
              <div>${esc(item.text || "").replaceAll("\n", "<br>")}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function collectReferenceRows(hostId) {
    const host = $(hostId);
    if (!host) return [];

    const items = Array.from(host.querySelectorAll(".csvb-sire-ref-item")).map((row) => {
      const title = safeStr(row.querySelector(".csvb-sire-ref-title")?.textContent).trim();
      const metaText = safeStr(row.querySelector(".csvb-sire-ref-meta")?.textContent).trim();
      const content = safeStr(row.querySelector(".csvb-sire-ref-content")?.textContent).trim();
      return {
        code: title,
        text: [metaText, content].filter(Boolean).join("\n")
      };
    }).filter((item) => item.code || item.text);

    if (items.length) return items;

    const emptyText = safeStr(host.querySelector(".csvb-sire-ref-empty")?.textContent).trim();
    return emptyText ? [{ code: "", text: emptyText }] : [];
  }

  function printSelectedQuestion() {
    const view = $("viewPanel");
    if (!view || view.style.display === "none") {
      warn("No SIRE question is selected for printing.");
      return;
    }

    const qNumber = textOf("vhdrNumber") || "SIRE Question";
    const shortText = textOf("vShortText");
    const now = new Date().toLocaleString();

    const attrs = `
      <div class="section">
        <div class="section-title">Question Attributes</div>
        <div class="section-body">
          <div class="meta-grid">
            ${meta("Question Type", textOf("vAttrQuestionType"))}
            ${meta("Vessel Type", textOf("vAttrVesselType"))}
            ${meta("ROVIQ List", textOf("vAttrRoviq"))}
            ${meta("Company Rank Allocation", textOf("vAttrCompanyRank"))}
            ${meta("TMSA3 Reference", textOf("vAttrTmsa3"))}
            ${meta("TMSA4 Reference", textOf("vAttrTmsa4"))}
            ${meta("Response Type", textOf("vAttrResponseType"))}
            ${meta("Version", textOf("vVersion"))}
            ${meta("Tags", textOf("vTags"))}
            ${meta("Source", textOf("vSourcePill").replace(/^source:\s*/i, ""))}
          </div>
        </div>
      </div>
    `;

    const body = `
      <div class="print-header">
        <div class="print-title">C.S.V. BEACON — SIRE 2.0 Questions Viewer</div>
        <div class="print-subtitle">Printed: ${esc(now)} • Read-only output</div>
      </div>
      <div class="qno">${esc(qNumber)}</div>
      ${shortText ? `<div class="subject">${esc(shortText)}</div>` : ""}
      ${section("Question", textOf("vQuestion"))}
      ${attrs}
      ${section("Question Guidance", textOf("vGuidance"))}
      ${section("Suggested Inspector Actions", textOf("vActions"))}
      ${rowsSection("Expected Evidence", collectMasterRows("vEeList"))}
      ${rowsSection("PGNOs", collectMasterRows("vPgnoList"))}
      ${rowsSection("Applicable Publications", collectReferenceRows("csvbSirePublicationsBody"))}
      ${rowsSection("Industry Guidance", collectReferenceRows("csvbSireIndustryGuidanceBody"))}
    `;

    printWindow(`SIRE 2.0 Question ${qNumber}`, body);
  }

  function printFilteredList() {
    const items = Array.from(document.querySelectorAll("#qList .qitem"))
      .filter((item) => !item.classList.contains("csvb-secondary-filter-hidden"));

    if (!items.length) {
      warn("No filtered SIRE question list is available for printing.");
      return;
    }

    const rows = items.map((item, index) => {
      const number = safeStr(item.querySelector(".qno")?.textContent).trim();
      const text = safeStr(item.querySelector(".qsub")?.textContent).trim();
      return `
        <tr>
          <td style="width:44px;">${index + 1}</td>
          <td style="width:90px;"><b>${esc(number)}</b></td>
          <td>${esc(text)}</td>
        </tr>
      `;
    }).join("");

    const search = safeStr($("searchInput")?.value).trim();
    const now = new Date().toLocaleString();

    const body = `
      <div class="print-header">
        <div class="print-title">C.S.V. BEACON — SIRE 2.0 Filtered Question List</div>
        <div class="print-subtitle">Printed: ${esc(now)} • Count: ${items.length}${search ? ` • Search: ${esc(search)}` : ""}</div>
      </div>
      <table class="question-list">
        <thead>
          <tr>
            <th>No.</th>
            <th>Question</th>
            <th>Displayed text</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    printWindow("SIRE 2.0 Filtered Question List", body);
  }

  function init() {
    injectScreenStyles();
    injectButtons();

    setTimeout(injectButtons, 500);
    setTimeout(injectButtons, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
