// public/company_policy_editor_import_splitter.js
// C.S.V. BEACON – Company Policy import splitter / mapping assistant
// CP-11D: split imported TXT/HTML/DOCX/PDF preview into detected sections and insert one selected section.

(() => {
  "use strict";

  const BUILD = "CP11D-2026-05-07";
  const MODAL_ID = "policyImportSplitModal";

  const STATE = {
    sections: [],
    selectedIndex: 0,
    savedRange: null,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  function editorEl() {
    return document.getElementById("policyEditor");
  }

  function previewEl() {
    return document.getElementById("policyImportPreview");
  }

  function currentPolicyItemLabel() {
    const title = document.getElementById("chapterTitle")?.textContent || "";
    return title.trim() || "No policy item selected";
  }

  function saveSelection() {
    const editor = editorEl();
    const sel = window.getSelection();

    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (editor.contains(range.commonAncestorContainer)) {
      STATE.savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorEl();
    if (!editor) return;

    editor.focus();

    if (!STATE.savedRange) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(STATE.savedRange);
  }

  function textOfNode(node) {
    return String(node?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPdfPageHeader(text) {
    return /^pdf\s+page\s+\d+$/i.test(String(text || "").trim());
  }

  function looksLikeNumericHeading(text) {
    const s = String(text || "").trim();

    if (!s || s.length > 180) return false;

    return (
      /^chapter\s+[0-9ivxlcdm]+(\s|[-–—:])/i.test(s) ||
      /^section\s+[0-9]+(\.[0-9]+)*(\s|[-–—:])/i.test(s) ||
      /^part\s+[0-9ivxlcdm]+(\s|[-–—:])/i.test(s) ||
      /^[0-9]+(\.[0-9]+){1,7}(\s|[-–—:])/.test(s) ||
      /^[0-9]+(\s+[-–—:]?\s+)[A-Za-zΑ-Ωα-ω]/.test(s)
    );
  }

  function isSplitHeading(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

    const tag = node.tagName.toLowerCase();
    const text = textOfNode(node);

    if (!text || isPdfPageHeader(text)) return false;

    if (["h1", "h2", "h3", "h4"].includes(tag)) return true;

    if (["p", "div"].includes(tag) && looksLikeNumericHeading(text)) {
      return true;
    }

    return false;
  }

  function extractCode(title) {
    const s = String(title || "").trim();

    const m =
      s.match(/^(?:chapter|section|part)\s+([0-9]+(?:\.[0-9]+)*)/i) ||
      s.match(/^([0-9]+(?:\.[0-9]+){0,7})\b/);

    return m ? m[1] : "";
  }

  function nodeToHtml(node) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      const text = textOfNode(node);
      return text ? `<p>${escapeHtml(text)}</p>` : "";
    }

    const host = document.createElement("div");
    host.appendChild(node.cloneNode(true));
    return host.innerHTML;
  }

  function sectionFromNodes(index, title, nodes) {
    const host = document.createElement("div");

    nodes.forEach((node) => {
      if (!node) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const text = textOfNode(node);
        if (text) {
          const p = document.createElement("p");
          p.textContent = text;
          host.appendChild(p);
        }
        return;
      }

      host.appendChild(node.cloneNode(true));
    });

    const html = host.innerHTML.trim();
    const text = host.textContent.replace(/\s+/g, " ").trim();

    if (!text && !host.querySelector("table")) return null;

    return {
      index,
      title: title || `Detected section ${index + 1}`,
      code: extractCode(title || ""),
      html,
      text,
      length: text.length,
    };
  }

  function parseSectionsFromImportPreview() {
    const preview = previewEl();

    if (!preview) {
      throw new Error("Import preview is not available. Open Import TXT/HTML/DOCX/PDF first.");
    }

    const previewText = textOfNode(preview);

    if (!previewText || previewText === "No import file loaded.") {
      throw new Error("Load an import file first, then use Split / Map.");
    }

    const nodes = Array.from(preview.childNodes || []).filter((node) => {
      if (node.nodeType === Node.TEXT_NODE) return !!textOfNode(node);
      if (node.nodeType === Node.ELEMENT_NODE) return !!textOfNode(node) || !!node.querySelector("table");
      return false;
    });

    if (!nodes.length) {
      throw new Error("No usable imported content was found to split.");
    }

    const sections = [];
    let currentTitle = "Opening content";
    let currentNodes = [];
    let headingFound = false;

    function flush() {
      const section = sectionFromNodes(sections.length, currentTitle, currentNodes);
      if (section) sections.push(section);
      currentNodes = [];
    }

    nodes.forEach((node) => {
      const text = textOfNode(node);

      if (isPdfPageHeader(text)) {
        return;
      }

      if (isSplitHeading(node)) {
        if (currentNodes.length) flush();

        headingFound = true;
        currentTitle = text;
        currentNodes = [node.cloneNode(true)];
        return;
      }

      currentNodes.push(node.cloneNode(true));
    });

    if (currentNodes.length) flush();

    if (!sections.length) {
      throw new Error("No sections were detected.");
    }

    if (!headingFound && sections.length === 1) {
      sections[0].title = "Full imported content";
    }

    return sections;
  }

  function modalEl() {
    return document.getElementById(MODAL_ID);
  }

  function closeModal() {
    const modal = modalEl();
    if (modal) modal.classList.add("hidden");
  }

  function openModal() {
    STATE.sections = parseSectionsFromImportPreview();
    STATE.selectedIndex = 0;

    renderModal();
    modalEl()?.classList.remove("hidden");
  }

  function selectedSection() {
    return STATE.sections[STATE.selectedIndex] || null;
  }

  function renderSectionList() {
    const list = document.getElementById("policyImportSplitList");
    const summary = document.getElementById("policyImportSplitSummary");

    if (summary) {
      summary.textContent = `${STATE.sections.length} detected section(s). Target policy item: ${currentPolicyItemLabel()}`;
    }

    if (!list) return;

    list.innerHTML = STATE.sections.map((section, index) => {
      const active = index === STATE.selectedIndex ? " active" : "";
      const code = section.code ? `<span class="policy-split-code">${escapeHtml(section.code)}</span>` : "";

      return `
        <button
          type="button"
          class="policy-split-item${active}"
          data-split-index="${index}"
          title="${escapeHtml(section.title)}"
        >
          <div class="policy-split-item-title">${code}${escapeHtml(section.title)}</div>
          <div class="policy-split-item-meta">${section.length} characters</div>
        </button>
      `;
    }).join("");

    list.querySelectorAll("[data-split-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        STATE.selectedIndex = Number(btn.getAttribute("data-split-index") || 0);
        renderSectionList();
        renderSectionPreview();
      });
    });
  }

  function renderSectionPreview() {
    const section = selectedSection();
    const box = document.getElementById("policyImportSplitPreview");
    const title = document.getElementById("policyImportSplitSelectedTitle");

    if (title) {
      title.textContent = section ? section.title : "No section selected";
    }

    if (!box) return;

    if (!section) {
      box.innerHTML = "No section selected.";
      return;
    }

    box.innerHTML = section.html || "No preview available.";
  }

  function renderModal() {
    injectModal();
    renderSectionList();
    renderSectionPreview();
  }

  function closeImportModal() {
    const importModal = document.getElementById("policyImportModal");
    if (importModal) importModal.classList.add("hidden");
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

  function setChangeSummaryFromSection(section) {
    const summary = document.getElementById("policyChangeSummary");
    if (!summary) return;

    if (!String(summary.value || "").trim()) {
      summary.value = `Imported section: ${section.title}`;
    }
  }

  function insertSelectedSection(mode) {
    const section = selectedSection();
    const editor = editorEl();

    if (!section) {
      throw new Error("Select a detected section first.");
    }

    if (!editor) {
      throw new Error("Policy editor not found.");
    }

    if (mode === "replace") {
      const confirmed = window.confirm("Replace the entire current draft editor content with the selected detected section?");
      if (!confirmed) return;

      editor.innerHTML = section.html;
    } else if (mode === "append") {
      editor.insertAdjacentHTML("beforeend", section.html);
    } else {
      insertHtmlAtCursor(section.html);
    }

    setChangeSummaryFromSection(section);
    closeModal();
    closeImportModal();

    showOk("Detected section inserted into Draft Editor. Review before saving.");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-import-split-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-import-split-styles";
    style.textContent = `
      .policy-import-split-modal {
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: rgba(3, 27, 63, .38);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .policy-import-split-modal.hidden {
        display: none;
      }

      .policy-import-split-dialog {
        width: min(1120px, 97vw);
        max-height: 94vh;
        overflow: auto;
        background: #fff;
        border: 1px solid #cbd8ea;
        border-radius: 16px;
        box-shadow: 0 22px 60px rgba(3, 27, 63, .28);
      }

      .policy-import-split-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid #dbe6f6;
        background: #f7fbff;
      }

      .policy-import-split-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1rem;
      }

      .policy-import-split-body {
        padding: 14px;
      }

      .policy-import-split-summary {
        color: #4d6283;
        font-size: .9rem;
        margin-bottom: 10px;
      }

      .policy-import-split-grid {
        display: grid;
        grid-template-columns: minmax(280px, 370px) minmax(420px, 1fr);
        gap: 12px;
        align-items: start;
      }

      .policy-import-split-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
        max-height: 620px;
        overflow: auto;
        border: 1px solid #dbe6f6;
        border-radius: 12px;
        background: #f9fbfe;
        padding: 8px;
      }

      .policy-split-item {
        text-align: left;
        border: 1px solid #dbe6f6;
        background: #fff;
        color: #10233f;
        border-radius: 10px;
        padding: 8px 9px;
        cursor: pointer;
      }

      .policy-split-item:hover {
        background: #eef6ff;
      }

      .policy-split-item.active {
        border-color: #2f78c4;
        background: #dbeeff;
        box-shadow: inset 0 0 0 1px #2f78c4;
      }

      .policy-split-item-title {
        color: #1a4170;
        font-weight: 700;
        line-height: 1.25;
      }

      .policy-split-code {
        display: inline-block;
        background: #eaf1fb;
        border: 1px solid #cbd8ea;
        color: #1a4170;
        border-radius: 999px;
        padding: 2px 7px;
        margin-right: 6px;
        font-size: .8rem;
      }

      .policy-split-item-meta {
        color: #4d6283;
        font-size: .82rem;
        margin-top: 3px;
      }

      .policy-import-split-preview-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 7px;
      }

      .policy-import-split-preview {
        border: 1px dashed #b9c8df;
        border-radius: 12px;
        min-height: 420px;
        max-height: 620px;
        overflow: auto;
        background: #f9fbfe;
        color: #10233f;
        padding: 12px;
        line-height: 1.45;
      }

      .policy-import-split-preview table {
        width: 100%;
        border-collapse: collapse;
        margin: 8px 0;
      }

      .policy-import-split-preview th,
      .policy-import-split-preview td {
        border: 1px solid #cbd8ea;
        padding: 6px 8px;
        vertical-align: top;
      }

      .policy-import-split-preview th {
        background: #eaf1fb;
        color: #1a4170;
        font-weight: 700;
      }

      .policy-import-split-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        padding: 12px 14px;
        border-top: 1px solid #dbe6f6;
        background: #f7fbff;
      }

      @media (max-width: 880px) {
        .policy-import-split-grid {
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
    modal.className = "policy-import-split-modal hidden";

    modal.innerHTML = `
      <div class="policy-import-split-dialog" role="dialog" aria-modal="true" aria-labelledby="policyImportSplitTitle">
        <div class="policy-import-split-head">
          <div id="policyImportSplitTitle" class="policy-import-split-title">Import Split / Mapping Assistant</div>
          <button id="policyImportSplitCloseBtn" class="btn2" type="button">Close</button>
        </div>

        <div class="policy-import-split-body">
          <div id="policyImportSplitSummary" class="policy-import-split-summary"></div>

          <div class="policy-import-split-grid">
            <div>
              <label>Detected sections</label>
              <div id="policyImportSplitList" class="policy-import-split-list"></div>
            </div>

            <div>
              <div id="policyImportSplitSelectedTitle" class="policy-import-split-preview-title">No section selected</div>
              <div id="policyImportSplitPreview" class="policy-import-split-preview"></div>
            </div>
          </div>
        </div>

        <div class="policy-import-split-actions">
          <button id="policyImportSplitInsertCursorBtn" class="btn" type="button">Insert selected at cursor</button>
          <button id="policyImportSplitAppendBtn" class="btn2" type="button">Append selected</button>
          <button id="policyImportSplitReplaceBtn" class="btnDanger" type="button">Replace draft with selected</button>
          <button id="policyImportSplitCancelBtn" class="btn2" type="button">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("policyImportSplitCloseBtn")?.addEventListener("click", closeModal);
    document.getElementById("policyImportSplitCancelBtn")?.addEventListener("click", closeModal);

    document.getElementById("policyImportSplitInsertCursorBtn")?.addEventListener("click", () => {
      try {
        showWarn("");
        insertSelectedSection("cursor");
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    document.getElementById("policyImportSplitAppendBtn")?.addEventListener("click", () => {
      try {
        showWarn("");
        insertSelectedSection("append");
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    document.getElementById("policyImportSplitReplaceBtn")?.addEventListener("click", () => {
      try {
        showWarn("");
        insertSelectedSection("replace");
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

  function injectImportModalButton() {
    const actions = document.querySelector(".policy-import-actions");

    if (!actions || document.getElementById("policyImportSplitBtn")) return;

    const btn = document.createElement("button");
    btn.id = "policyImportSplitBtn";
    btn.className = "btn2";
    btn.type = "button";
    btn.textContent = "Split / Map Sections";
    btn.title = "Detect sections from the cleaned import preview";

    btn.addEventListener("click", () => {
      try {
        showWarn("");
        openModal();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    actions.insertBefore(btn, actions.firstChild);
  }

  function wireEditorSelection() {
    const editor = editorEl();

    if (!editor || editor.getAttribute("data-policy-import-splitter-wired") === "1") return;

    editor.setAttribute("data-policy-import-splitter-wired", "1");

    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("focus", saveSelection);
  }

  function init() {
    injectStyles();
    injectModal();
    injectImportModalButton();
    wireEditorSelection();

    const observer = new MutationObserver(() => {
      injectImportModalButton();
      wireEditorSelection();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.CSVB_POLICY_IMPORT_SPLITTER = {
      build: BUILD,
      parseSectionsFromImportPreview,
      openModal,
      insertSelectedSection,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();