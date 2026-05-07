// public/company_policy_editor_import.js
// C.S.V. BEACON – Company Policy editor import
// CP-11C: import cleaned TXT / HTML / DOCX / PDF content into the Draft Editor.

(() => {
  "use strict";

  const BUILD = "CP11C-2026-05-07";
  const MODAL_ID = "policyImportModal";
  const MAX_IMPORT_BYTES = 16 * 1024 * 1024;

  let savedRange = null;
  let importedCleanHtml = "";
  let importedFileName = "";

  function showWarn(message) {
    const el = document.getElementById("warnBox");
    if (!el) {
      alert(message);
      return;
    }

    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function showOk(message) {
    const el = document.getElementById("okBox");
    if (!el) return;

    el.textContent = message || "";
    el.style.display = message ? "block" : "none";

    if (message) {
      setTimeout(() => {
        el.style.display = "none";
        el.textContent = "";
      }, 2200);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function editorEl() {
    return document.getElementById("policyEditor");
  }

  function modalEl() {
    return document.getElementById(MODAL_ID);
  }

  function saveSelection() {
    const editor = editorEl();
    const sel = window.getSelection();

    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (editor.contains(range.commonAncestorContainer)) {
      savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorEl();
    if (!editor) return;

    editor.focus();

    if (!savedRange) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  function fallbackCleanPlainText(text) {
    const raw = String(text || "").replace(/\r/g, "");
    const blocks = raw.split(/\n{2,}/g).map((x) => x.trim()).filter(Boolean);

    if (!blocks.length) return "";

    return blocks.map((block) => {
      const lines = block.split(/\n/g).map((line) => escapeHtml(line));
      return `<p>${lines.join("<br>")}</p>`;
    }).join("");
  }

  function fallbackCleanHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(html || ""), "text/html");

    doc.querySelectorAll(
      "script, style, meta, link, iframe, object, embed, img, svg, form, input, button, select, textarea"
    ).forEach((el) => el.remove());

    doc.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();

        if (
          name.startsWith("on") ||
          name === "style" ||
          name === "class" ||
          name.startsWith("data-") ||
          name === "id"
        ) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return doc.body.innerHTML.trim();
  }

  function cleanImportedText(rawText, fileName, mimeType) {
    const lower = String(fileName || "").toLowerCase();
    const type = String(mimeType || "").toLowerCase();

    const isHtml =
      lower.endsWith(".html") ||
      lower.endsWith(".htm") ||
      type.includes("text/html");

    if (isHtml) {
      if (window.CSVB_POLICY_PASTE_CLEANUP?.cleanPastedHtml) {
        return window.CSVB_POLICY_PASTE_CLEANUP.cleanPastedHtml(rawText);
      }

      return fallbackCleanHtml(rawText);
    }

    if (window.CSVB_POLICY_PASTE_CLEANUP?.cleanPlainText) {
      return window.CSVB_POLICY_PASTE_CLEANUP.cleanPlainText(rawText);
    }

    return fallbackCleanPlainText(rawText);
  }

  function cleanConvertedDocxHtml(html) {
    if (window.CSVB_POLICY_PASTE_CLEANUP?.cleanPastedHtml) {
      return window.CSVB_POLICY_PASTE_CLEANUP.cleanPastedHtml(html);
    }

    return fallbackCleanHtml(html);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read file."));

      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Could not read file."));

      reader.readAsArrayBuffer(file);
    });
  }

  function isDocxFile(file) {
    const lower = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();

    return (
      lower.endsWith(".docx") ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  function isPdfFile(file) {
    const lower = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();

    return lower.endsWith(".pdf") || type === "application/pdf";
  }

  function isAllowedImportFile(file) {
    const lower = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();

    return (
      lower.endsWith(".txt") ||
      lower.endsWith(".html") ||
      lower.endsWith(".htm") ||
      lower.endsWith(".docx") ||
      lower.endsWith(".pdf") ||
      type.includes("text/plain") ||
      type.includes("text/html") ||
      type === "application/pdf" ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  }

  async function convertDocxToCleanHtml(file) {
    if (!window.mammoth?.convertToHtml) {
      throw new Error(
        "DOCX converter is not loaded. Check internet access/CDN loading, then refresh and try again."
      );
    }

    const arrayBuffer = await readFileAsArrayBuffer(file);

    const result = await window.mammoth.convertToHtml(
      { arrayBuffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Quote'] => blockquote:fresh"
        ],
        includeDefaultStyleMap: true
      }
    );

    const messages = Array.isArray(result?.messages) ? result.messages : [];
    const html = String(result?.value || "");

    const cleaned = cleanConvertedDocxHtml(html);

    const messageBox = document.getElementById("policyImportConverterMessages");
    if (messageBox) {
      if (messages.length) {
        messageBox.innerHTML = `
          <div><strong>DOCX conversion notes:</strong></div>
          ${messages.slice(0, 8).map((m) => `<div>${escapeHtml(m.message || String(m))}</div>`).join("")}
        `;
        messageBox.style.display = "block";
      } else {
        messageBox.innerHTML = "";
        messageBox.style.display = "none";
      }
    }

    return cleaned;
  }

  function groupPdfItemsIntoLines(items) {
    const textItems = (items || [])
      .map((item) => {
        const transform = item.transform || [];
        return {
          text: String(item.str || "").trim(),
          x: Number(transform[4] || 0),
          y: Number(transform[5] || 0),
        };
      })
      .filter((item) => item.text);

    const groups = [];

    textItems.forEach((item) => {
      let group = groups.find((g) => Math.abs(g.y - item.y) <= 3);

      if (!group) {
        group = { y: item.y, items: [] };
        groups.push(group);
      }

      group.items.push(item);
    });

    groups.sort((a, b) => b.y - a.y);

    return groups.map((group) => {
      group.items.sort((a, b) => a.x - b.x);
      return group.items.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
    }).filter(Boolean);
  }

  function pdfLinesToHtml(pageBlocks, includePageHeaders) {
    const parts = [];

    pageBlocks.forEach((page) => {
      if (includePageHeaders) {
        parts.push(`<h3>PDF Page ${page.pageNo}</h3>`);
      }

      if (!page.lines.length) {
        return;
      }

      let paragraphLines = [];

      function flushParagraph() {
        if (!paragraphLines.length) return;

        const text = paragraphLines.join(" ").replace(/\s+/g, " ").trim();

        if (text) {
          parts.push(`<p>${escapeHtml(text)}</p>`);
        }

        paragraphLines = [];
      }

      page.lines.forEach((line) => {
        const clean = String(line || "").trim();

        if (!clean) {
          flushParagraph();
          return;
        }

        const isLikelyHeading =
          clean.length <= 90 &&
          (
            /^[0-9]+(\.[0-9]+)*\s+/.test(clean) ||
            clean === clean.toUpperCase()
          );

        if (isLikelyHeading) {
          flushParagraph();
          parts.push(`<h3>${escapeHtml(clean)}</h3>`);
          return;
        }

        paragraphLines.push(clean);

        if (/[.!?:;)]$/.test(clean) && paragraphLines.join(" ").length > 160) {
          flushParagraph();
        }
      });

      flushParagraph();
    });

    return parts.join("\n");
  }

  async function convertPdfToCleanHtml(file) {
    if (!window.pdfjsLib?.getDocument) {
      throw new Error(
        "PDF converter is not loaded. Check internet access/CDN loading, then refresh and try again."
      );
    }

    const includePageHeaders =
      document.getElementById("policyImportPdfPageHeaders")?.checked !== false;

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageBlocks = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const textContent = await page.getTextContent();
      const lines = groupPdfItemsIntoLines(textContent.items || []);

      pageBlocks.push({
        pageNo,
        lines,
      });
    }

    const rawHtml = pdfLinesToHtml(pageBlocks, includePageHeaders);
    const cleaned = cleanImportedText(rawHtml, "converted.html", "text/html");

    const extractedTextCount = pageBlocks.reduce((sum, page) => {
      return sum + page.lines.join(" ").trim().length;
    }, 0);

    const messageBox = document.getElementById("policyImportConverterMessages");
    if (messageBox) {
      messageBox.innerHTML = `
        <div><strong>PDF extraction notes:</strong></div>
        <div>Pages processed: ${escapeHtml(pdf.numPages)}</div>
        <div>Text characters extracted: ${escapeHtml(extractedTextCount)}</div>
        <div>Images, signatures, stamps and scanned pages are not extracted. Use Insert Image for controlled image upload.</div>
      `;
      messageBox.style.display = "block";
    }

    if (!extractedTextCount) {
      throw new Error(
        "No selectable text was extracted from this PDF. It may be scanned/image-only. OCR is not included in this import step."
      );
    }

    return cleaned;
  }

  async function loadImportFile(file) {
    if (!file) {
      throw new Error("Select a TXT, HTML, DOCX, or PDF file first.");
    }

    if (!isAllowedImportFile(file)) {
      throw new Error("Unsupported file type. Use .txt, .html, .htm, .docx, or .pdf only.");
    }

    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error("Import file is larger than 16 MB. Split the policy text into smaller parts.");
    }

    let cleanHtml = "";

    if (isDocxFile(file)) {
      showOk("Converting DOCX file...");
      cleanHtml = await convertDocxToCleanHtml(file);
    } else if (isPdfFile(file)) {
      showOk("Extracting text from PDF file...");
      cleanHtml = await convertPdfToCleanHtml(file);
    } else {
      const raw = await readFileAsText(file);
      cleanHtml = cleanImportedText(raw, file.name, file.type);

      const messageBox = document.getElementById("policyImportConverterMessages");
      if (messageBox) {
        messageBox.innerHTML = "";
        messageBox.style.display = "none";
      }
    }

    importedCleanHtml = cleanHtml;
    importedFileName = file.name || "Imported file";

    const preview = document.getElementById("policyImportPreview");
    const fileInfo = document.getElementById("policyImportFileInfo");

    if (fileInfo) {
      const fileType = isDocxFile(file)
        ? "DOCX"
        : isPdfFile(file)
          ? "PDF"
          : "Text/HTML";

      fileInfo.textContent = `${importedFileName} • ${fileType} • ${Math.round(file.size / 1024)} KB`;
    }

    if (preview) {
      preview.innerHTML = cleanHtml || `<div class="policy-import-empty">No usable content was found after cleanup.</div>`;
    }

    showOk("Import file loaded and cleaned.");
  }

  function insertHtmlAtCursor(html) {
    const editor = editorEl();

    if (!editor) {
      throw new Error("Policy editor not found.");
    }

    restoreSelection();

    const sel = window.getSelection();

    if (!sel || sel.rangeCount === 0) {
      editor.insertAdjacentHTML("beforeend", html);
      return;
    }

    const range = sel.getRangeAt(0);

    if (!editor.contains(range.commonAncestorContainer)) {
      editor.insertAdjacentHTML("beforeend", html);
      return;
    }

    range.deleteContents();

    const template = document.createElement("template");
    template.innerHTML = html;

    const fragment = template.content;
    const lastNode = fragment.lastChild;

    range.insertNode(fragment);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);

      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function applyImport() {
    const editor = editorEl();

    if (!editor) {
      throw new Error("Policy editor not found.");
    }

    if (!importedCleanHtml) {
      throw new Error("No cleaned import content is loaded.");
    }

    const mode = document.getElementById("policyImportMode")?.value || "cursor";

    if (mode === "replace") {
      const confirmed = window.confirm("Replace the entire current draft editor content?");
      if (!confirmed) return;

      editor.innerHTML = importedCleanHtml;
    } else if (mode === "append") {
      editor.insertAdjacentHTML("beforeend", importedCleanHtml);
    } else {
      insertHtmlAtCursor(importedCleanHtml);
    }

    closeModal();
    showOk("Imported content inserted into Draft Editor. Review before saving the draft.");
  }

  function clearImportState() {
    importedCleanHtml = "";
    importedFileName = "";

    const input = document.getElementById("policyImportFile");
    const preview = document.getElementById("policyImportPreview");
    const fileInfo = document.getElementById("policyImportFileInfo");
    const messageBox = document.getElementById("policyImportConverterMessages");

    if (input) input.value = "";
    if (preview) preview.innerHTML = "No import file loaded.";
    if (fileInfo) fileInfo.textContent = "";
    if (messageBox) {
      messageBox.innerHTML = "";
      messageBox.style.display = "none";
    }
  }

  function openModal() {
    saveSelection();

    const modal = modalEl();
    if (!modal) return;

    clearImportState();
    modal.classList.remove("hidden");
  }

  function closeModal() {
    const modal = modalEl();
    if (!modal) return;

    modal.classList.add("hidden");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-import-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-import-styles";
    style.textContent = `
      .policy-import-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(3, 27, 63, .38);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .policy-import-modal.hidden {
        display: none;
      }

      .policy-import-dialog {
        width: min(980px, 96vw);
        max-height: 92vh;
        overflow: auto;
        background: #ffffff;
        border: 1px solid #cbd8ea;
        border-radius: 16px;
        box-shadow: 0 22px 60px rgba(3, 27, 63, .28);
      }

      .policy-import-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid #dbe6f6;
        background: #f7fbff;
      }

      .policy-import-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1rem;
      }

      .policy-import-body {
        padding: 14px;
      }

      .policy-import-grid {
        display: grid;
        grid-template-columns: minmax(260px, 360px) minmax(320px, 1fr);
        gap: 12px;
        align-items: start;
      }

      .policy-import-preview {
        border: 1px dashed #b9c8df;
        border-radius: 12px;
        min-height: 320px;
        max-height: 560px;
        overflow: auto;
        background: #f9fbfe;
        color: #10233f;
        padding: 12px;
        line-height: 1.45;
      }

      .policy-import-preview table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0;
      }

      .policy-import-preview th,
      .policy-import-preview td {
        border: 1px solid #cbd8ea;
        padding: 6px 8px;
        vertical-align: top;
      }

      .policy-import-preview th {
        background: #eaf1fb;
        color: #1a4170;
        font-weight: 700;
      }

      .policy-import-empty {
        color: #6b7890;
        font-style: italic;
      }

      .policy-import-file-info {
        color: #4d6283;
        font-size: .86rem;
        margin-top: 6px;
      }

      .policy-import-converter-messages {
        display: none;
        color: #8a5a00;
        background: #fff8e6;
        border: 1px solid #f6d58f;
        border-radius: 10px;
        padding: 8px;
        font-size: .84rem;
        line-height: 1.3;
        margin-top: 8px;
      }

      .policy-import-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        padding: 12px 14px;
        border-top: 1px solid #dbe6f6;
        background: #f7fbff;
      }

      .policy-editor-import-separator {
        width: 1px;
        height: 26px;
        background: #cbd8ea;
        margin: 0 2px;
      }

      @media (max-width: 820px) {
        .policy-import-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function injectModal() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "policy-import-modal hidden";

    modal.innerHTML = `
      <div class="policy-import-dialog" role="dialog" aria-modal="true" aria-labelledby="policyImportModalTitle">
        <div class="policy-import-head">
          <div id="policyImportModalTitle" class="policy-import-title">Import Text / HTML / DOCX / PDF into Draft Editor</div>
          <button id="policyImportCloseBtn" class="btn2" type="button">Close</button>
        </div>

        <div class="policy-import-body">
          <div class="policy-import-grid">
            <div>
              <div class="field">
                <label>Import file</label>
                <input id="policyImportFile" type="file" accept=".txt,.html,.htm,.docx,.pdf,text/plain,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                <div id="policyImportFileInfo" class="policy-import-file-info"></div>
                <div id="policyImportConverterMessages" class="policy-import-converter-messages"></div>
              </div>

              <label class="checkbox-line">
                <input id="policyImportPdfPageHeaders" type="checkbox" checked />
                Add page headers when importing PDF text
              </label>

              <div class="field">
                <label>Insert mode</label>
                <select id="policyImportMode">
                  <option value="cursor" selected>Insert at cursor</option>
                  <option value="append">Append to current draft</option>
                  <option value="replace">Replace current draft</option>
                </select>
              </div>

              <div class="content-box" style="min-height:0;">
                DOCX/HTML/PDF content is converted and cleaned before insertion. Imported images are removed; use Insert Image for controlled image upload. PDF import works only for selectable text, not scanned PDFs.
              </div>
            </div>

            <div>
              <label>Cleaned preview</label>
              <div id="policyImportPreview" class="policy-import-preview">No import file loaded.</div>
            </div>
          </div>
        </div>

        <div class="policy-import-actions">
          <button id="policyImportClearBtn" class="btn2" type="button">Clear</button>
          <button id="policyImportInsertBtn" class="btn" type="button">Insert cleaned content</button>
          <button id="policyImportCancelBtn" class="btn2" type="button">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("policyImportCloseBtn")?.addEventListener("click", closeModal);
    document.getElementById("policyImportCancelBtn")?.addEventListener("click", closeModal);
    document.getElementById("policyImportClearBtn")?.addEventListener("click", clearImportState);

    document.getElementById("policyImportFile")?.addEventListener("change", async (event) => {
      try {
        showWarn("");
        const file = event.target.files?.[0] || null;
        await loadImportFile(file);
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    document.getElementById("policyImportInsertBtn")?.addEventListener("click", () => {
      try {
        showWarn("");
        applyImport();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.classList.contains("hidden")) {
        closeModal();
      }
    });
  }

  function makeButton(label, title, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-btn";
    btn.textContent = label;
    btn.title = title || label;

    btn.addEventListener("click", async () => {
      try {
        showWarn("");
        await handler();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    return btn;
  }

  function injectToolbarButton() {
    const toolbar = document.querySelector(".editor-toolbar");

    if (!toolbar || document.getElementById("policyImportContentBtn")) return;

    const sep = document.createElement("span");
    sep.className = "policy-editor-import-separator";

    const importBtn = makeButton("Import TXT/HTML/DOCX/PDF", "Import cleaned TXT/HTML/DOCX/PDF file into Draft Editor", openModal);
    importBtn.id = "policyImportContentBtn";

    toolbar.appendChild(sep);
    toolbar.appendChild(importBtn);
  }

  function wireEditorSelection() {
    const editor = editorEl();

    if (!editor || editor.getAttribute("data-policy-import-wired") === "1") return;

    editor.setAttribute("data-policy-import-wired", "1");

    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("focus", saveSelection);
  }

  function init() {
    injectStyles();
    injectModal();
    injectToolbarButton();
    wireEditorSelection();

    const observer = new MutationObserver(() => {
      injectToolbarButton();
      wireEditorSelection();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.CSVB_POLICY_EDITOR_IMPORT = {
      build: BUILD,
      openModal,
      cleanImportedText,
      convertDocxToCleanHtml,
      convertPdfToCleanHtml,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();