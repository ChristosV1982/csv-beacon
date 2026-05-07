// public/company_policy_editor_import.js
// C.S.V. BEACON – Company Policy editor import
// CP-11B: import cleaned TXT / HTML / DOCX content into the Draft Editor.

(() => {
  "use strict";

  const BUILD = "CP11B-2026-05-07";
  const MODAL_ID = "policyImportModal";
  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

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

  function isAllowedImportFile(file) {
    const lower = String(file?.name || "").toLowerCase();
    const type = String(file?.type || "").toLowerCase();

    return (
      lower.endsWith(".txt") ||
      lower.endsWith(".html") ||
      lower.endsWith(".htm") ||
      lower.endsWith(".docx") ||
      type.includes("text/plain") ||
      type.includes("text/html") ||
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

  async function loadImportFile(file) {
    if (!file) {
      throw new Error("Select a TXT, HTML, or DOCX file first.");
    }

    if (!isAllowedImportFile(file)) {
      throw new Error("Unsupported file type. Use .txt, .html, .htm, or .docx only.");
    }

    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error("Import file is larger than 8 MB. Split the policy text into smaller parts.");
    }

    let cleanHtml = "";

    if (isDocxFile(file)) {
      showOk("Converting DOCX file...");
      cleanHtml = await convertDocxToCleanHtml(file);
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
      const fileType = isDocxFile(file) ? "DOCX" : "Text/HTML";
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
          <div id="policyImportModalTitle" class="policy-import-title">Import Text / HTML / DOCX into Draft Editor</div>
          <button id="policyImportCloseBtn" class="btn2" type="button">Close</button>
        </div>

        <div class="policy-import-body">
          <div class="policy-import-grid">
            <div>
              <div class="field">
                <label>Import file</label>
                <input id="policyImportFile" type="file" accept=".txt,.html,.htm,.docx,text/plain,text/html,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
                <div id="policyImportFileInfo" class="policy-import-file-info"></div>
                <div id="policyImportConverterMessages" class="policy-import-converter-messages"></div>
              </div>

              <div class="field">
                <label>Insert mode</label>
                <select id="policyImportMode">
                  <option value="cursor" selected>Insert at cursor</option>
                  <option value="append">Append to current draft</option>
                  <option value="replace">Replace current draft</option>
                </select>
              </div>

              <div class="content-box" style="min-height:0;">
                DOCX/HTML content is converted and cleaned before insertion. Imported images are removed; use Insert Image for controlled image upload.
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

    const importBtn = makeButton("Import TXT/HTML/DOCX", "Import cleaned TXT/HTML/DOCX file into Draft Editor", openModal);
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
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();