// public/q-sire-questions-viewer-export.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer export/copy tools
// Viewer-only helper. No Supabase writes. No dependency on old library.html / app.js / print.js.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-EXPORT-20260516_1";
  window.CSVB_SIRE_VIEWER_EXPORT_BUILD = BUILD;

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

  function textOf(idOrSelector) {
    const el = idOrSelector.startsWith("#") || idOrSelector.startsWith(".")
      ? document.querySelector(idOrSelector)
      : $(idOrSelector);
    return safeStr(el?.textContent).trim();
  }

  function warn(message) {
    const box = $("warnBox");
    const ok = $("okBox");
    if (ok) ok.style.display = "none";
    if (!box) {
      alert(message);
      return;
    }
    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
  }

  function ok(message) {
    const box = $("okBox");
    const warnBox = $("warnBox");
    if (warnBox) warnBox.style.display = "none";
    if (!box) return;
    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
    if (message) setTimeout(() => {
      if (box.textContent === message) {
        box.textContent = "";
        box.style.display = "none";
      }
    }, 2500);
  }

  function injectScreenStyles() {
    if ($("csvbSireViewerExportStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerExportStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-export-actions {
        margin-top: 8px;
        gap: 8px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-viewer-export-actions .btn {
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  function injectButtons() {
    if ($("csvbCopySelectedQuestionRefBtn")) return;

    const printRow = document.querySelector(".csvb-sire-viewer-print-actions");
    const reloadBtn = $("reloadBtn");
    const anchor = printRow || reloadBtn?.closest(".row");
    if (!anchor || !anchor.parentElement) return;

    const row = document.createElement("div");
    row.className = "row gap csvb-sire-viewer-export-actions";
    row.innerHTML = `
      <button id="csvbCopySelectedQuestionRefBtn" class="btn light" type="button" data-csvb-help="Copy the selected question number and short text to clipboard.">Copy selected reference</button>
      <button id="csvbExportFilteredCsvBtn" class="btn light" type="button" data-csvb-help="Export the currently filtered SIRE 2.0 question list to CSV.">Export filtered CSV</button>
      <button id="csvbExportSelectedTxtBtn" class="btn light" type="button" data-csvb-help="Export the selected SIRE 2.0 question as a plain text file.">Export selected TXT</button>
      <button id="csvbExportSelectedJsonBtn" class="btn light" type="button" data-csvb-help="Export the selected SIRE 2.0 question payload as JSON.">Export selected JSON</button>
    `;

    anchor.insertAdjacentElement("afterend", row);

    $("csvbCopySelectedQuestionRefBtn")?.addEventListener("click", copySelectedReference);
    $("csvbExportFilteredCsvBtn")?.addEventListener("click", exportFilteredCsv);
    $("csvbExportSelectedTxtBtn")?.addEventListener("click", exportSelectedTxt);
    $("csvbExportSelectedJsonBtn")?.addEventListener("click", exportSelectedJson);
  }

  function selectedQuestionNumber() {
    return textOf("vhdrNumber") || textOf("#qList .qitem.active .qno");
  }

  function selectedShortText() {
    return textOf("vShortText") || textOf("#qList .qitem.active .qsub");
  }

  function getSelectedRaw() {
    try {
      const selected = window.CSVB_SIRE_QUESTIONS_VIEWER?.getSelected?.();
      return selected || null;
    } catch {
      return null;
    }
  }

  function getSelectedPayload() {
    const selected = getSelectedRaw();
    return selected?.payload && typeof selected.payload === "object" ? selected.payload : {};
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

  function collectReferenceRows(hostId) {
    const host = $(hostId);
    if (!host) return [];

    const items = Array.from(host.querySelectorAll(".csvb-sire-ref-item")).map((row) => {
      const title = safeStr(row.querySelector(".csvb-sire-ref-title")?.textContent).trim();
      const meta = safeStr(row.querySelector(".csvb-sire-ref-meta")?.textContent).trim();
      const content = safeStr(row.querySelector(".csvb-sire-ref-content")?.textContent).trim();
      return { code: title, text: [meta, content].filter(Boolean).join("\n") };
    }).filter((item) => item.code || item.text);

    if (items.length) return items;

    const emptyText = safeStr(host.querySelector(".csvb-sire-ref-empty")?.textContent).trim();
    return emptyText ? [{ code: "", text: emptyText }] : [];
  }

  async function writeClipboard(text) {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API is not available in this browser/session.");
    }
    await navigator.clipboard.writeText(text);
  }

  async function copySelectedReference() {
    const number = selectedQuestionNumber();
    const shortText = selectedShortText();

    if (!number) {
      warn("No SIRE question is selected.");
      return;
    }

    const ref = shortText ? `${number} — ${shortText}` : number;

    try {
      await writeClipboard(ref);
      ok("Selected question reference copied to clipboard.");
    } catch (error) {
      warn("Copy failed: " + safeStr(error?.message || error));
    }
  }

  function csvEscape(value) {
    const text = safeStr(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 700);
  }

  function safeFilenamePart(value) {
    return safeStr(value)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "sire_2_0";
  }

  function visibleQuestionItems() {
    return Array.from(document.querySelectorAll("#qList .qitem"))
      .filter((item) => !item.classList.contains("csvb-secondary-filter-hidden"));
  }

  function exportFilteredCsv() {
    const items = visibleQuestionItems();
    if (!items.length) {
      warn("No filtered question list is available for export.");
      return;
    }

    const search = safeStr($("searchInput")?.value).trim();
    const lines = [];
    lines.push(["sequence", "question_number", "displayed_text", "search_term", "exported_at"].map(csvEscape).join(","));

    const exportedAt = new Date().toISOString();

    items.forEach((item, index) => {
      const number = safeStr(item.querySelector(".qno")?.textContent).trim();
      const text = safeStr(item.querySelector(".qsub")?.textContent).trim();
      lines.push([
        index + 1,
        number,
        text,
        search,
        exportedAt
      ].map(csvEscape).join(","));
    });

    downloadText("sire_2_0_filtered_question_list.csv", lines.join("\n"), "text/csv;charset=utf-8");
    ok(`Exported ${items.length} filtered question(s) to CSV.`);
  }

  function selectedQuestionTextExport() {
    const number = selectedQuestionNumber();
    if (!number) return "";

    const sections = [];
    const pushSection = (title, value) => {
      const clean = safeStr(value).trim();
      sections.push(`${title}\n${"=".repeat(title.length)}\n${clean || "No data recorded."}`);
    };

    pushSection("Question Number", number);
    pushSection("Short Text", selectedShortText());
    pushSection("Question", textOf("vQuestion"));

    const attrs = [
      ["Question Type", textOf("vAttrQuestionType")],
      ["Vessel Type", textOf("vAttrVesselType")],
      ["ROVIQ List", textOf("vAttrRoviq")],
      ["Company Rank Allocation", textOf("vAttrCompanyRank")],
      ["TMSA3 Reference", textOf("vAttrTmsa3")],
      ["TMSA4 Reference", textOf("vAttrTmsa4")],
      ["Response Type", textOf("vAttrResponseType")],
      ["Tags", textOf("vTags")],
      ["Version", textOf("vVersion")],
      ["Source", textOf("vSourcePill").replace(/^source:\s*/i, "")],
      ["Status", textOf("vStatusPill").replace(/^status:\s*/i, "")]
    ].map(([k, v]) => `${k}: ${v || "—"}`).join("\n");

    pushSection("Question Attributes", attrs);
    pushSection("Question Guidance", textOf("vGuidance"));
    pushSection("Suggested Inspector Actions", textOf("vActions"));

    const ee = collectMasterRows("vEeList").map((item) => `${item.code ? item.code + "\n" : ""}${item.text}`).join("\n\n");
    pushSection("Expected Evidence", ee);

    const pgno = collectMasterRows("vPgnoList").map((item) => `${item.code ? item.code + "\n" : ""}${item.text}`).join("\n\n");
    pushSection("PGNOs", pgno);

    const publications = collectReferenceRows("csvbSirePublicationsBody").map((item) => `${item.code ? item.code + "\n" : ""}${item.text}`).join("\n\n");
    pushSection("Applicable Publications", publications);

    const guidance = collectReferenceRows("csvbSireIndustryGuidanceBody").map((item) => `${item.code ? item.code + "\n" : ""}${item.text}`).join("\n\n");
    pushSection("Industry Guidance", guidance);

    pushSection("Export Info", `Exported from C.S.V. BEACON SIRE 2.0 Questions Viewer\nExported at: ${new Date().toISOString()}`);

    return sections.join("\n\n---\n\n");
  }

  function exportSelectedTxt() {
    const number = selectedQuestionNumber();
    if (!number) {
      warn("No SIRE question is selected for export.");
      return;
    }

    const content = selectedQuestionTextExport();
    const filename = `${safeFilenamePart(number)}_sire_2_0_question.txt`;
    downloadText(filename, content, "text/plain;charset=utf-8");
    ok("Selected question exported to TXT.");
  }

  function exportSelectedJson() {
    const number = selectedQuestionNumber();
    if (!number) {
      warn("No SIRE question is selected for export.");
      return;
    }

    const selected = getSelectedRaw() || {};
    const payload = getSelectedPayload();

    const out = {
      exported_from: "C.S.V. BEACON — SIRE 2.0 Questions Viewer",
      exported_at: new Date().toISOString(),
      question_number: number,
      short_text: selectedShortText(),
      selected_row: selected,
      payload,
      displayed_sections: {
        question: textOf("vQuestion"),
        question_guidance: textOf("vGuidance"),
        suggested_inspector_actions: textOf("vActions"),
        attributes: {
          question_type: textOf("vAttrQuestionType"),
          vessel_type: textOf("vAttrVesselType"),
          roviq_list: textOf("vAttrRoviq"),
          company_rank_allocation: textOf("vAttrCompanyRank"),
          tmsa3_reference: textOf("vAttrTmsa3"),
          tmsa4_reference: textOf("vAttrTmsa4"),
          response_type: textOf("vAttrResponseType"),
          tags: textOf("vTags"),
          version: textOf("vVersion"),
          source: textOf("vSourcePill").replace(/^source:\s*/i, ""),
          status: textOf("vStatusPill").replace(/^status:\s*/i, "")
        },
        expected_evidence: collectMasterRows("vEeList"),
        pgnos: collectMasterRows("vPgnoList"),
        applicable_publications: collectReferenceRows("csvbSirePublicationsBody"),
        industry_guidance: collectReferenceRows("csvbSireIndustryGuidanceBody")
      }
    };

    const filename = `${safeFilenamePart(number)}_sire_2_0_question.json`;
    downloadText(filename, JSON.stringify(out, null, 2), "application/json;charset=utf-8");
    ok("Selected question exported to JSON.");
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
