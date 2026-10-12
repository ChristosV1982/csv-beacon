// public/company_policy_editor_paste_cleanup.js
// C.S.V. BEACON – Company Policy paste cleanup
// CP-10F: clean pasted Word/HTML content before insertion into the policy editor.

(() => {
  "use strict";

  const BUILD = "CP10F-2026-05-07";

  let lastPasteWarning = "";

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function hasBlockChild(el) {
    const blockTags = new Set([
      "P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6",
      "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TR",
      "BLOCKQUOTE", "SECTION", "ARTICLE"
    ]);

    return Array.from(el.children || []).some((child) => blockTags.has(child.tagName));
  }

  function validHref(href) {
    const value = String(href || "").trim();

    if (!value) return "";

    if (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:") ||
      value.startsWith("#")
    ) {
      return value;
    }

    return "";
  }

  function appendSanitizedChildren(source, target) {
    Array.from(source.childNodes || []).forEach((child) => {
      const cleaned = sanitizeNode(child);

      if (!cleaned) return;

      target.appendChild(cleaned);
    });
  }

  function sanitizeInlineChildren(source, target) {
    Array.from(source.childNodes || []).forEach((child) => {
      const cleaned = sanitizeNode(child);

      if (!cleaned) return;

      target.appendChild(cleaned);
    });

    if (!target.childNodes.length) {
      target.appendChild(document.createElement("br"));
    }
  }

  function cleanEmptyBlock(el) {
    const tag = el.tagName;

    if (!["P", "H1", "H2", "H3", "H4", "LI", "TH", "TD"].includes(tag)) {
      return el;
    }

    const text = (el.textContent || "").replace(/\u00a0/g, " ").trim();
    const hasStructure = !!el.querySelector("br, table, ul, ol");

    if (!text && !hasStructure) {
      return null;
    }

    return el;
  }

  function copyTableCellSpanAttributes(source, target) {
    const colspan = Number(source.getAttribute("colspan") || "1");
    const rowspan = Number(source.getAttribute("rowspan") || "1");

    if (Number.isFinite(colspan) && colspan > 1 && colspan <= 20) {
      target.setAttribute("colspan", String(colspan));
    }

    if (Number.isFinite(rowspan) && rowspan > 1 && rowspan <= 20) {
      target.setAttribute("rowspan", String(rowspan));
    }
  }

  function sanitizeNode(node) {
    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      return document.createTextNode(text.replace(/\u00a0/g, " "));
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      return document.createDocumentFragment();
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return document.createDocumentFragment();
    }

    const tag = node.tagName.toLowerCase();

    if (
      tag.includes(":") ||
      [
        "script", "style", "meta", "link", "title", "xml",
        "object", "embed", "iframe", "canvas", "svg", "form",
        "input", "button", "select", "textarea"
      ].includes(tag)
    ) {
      return document.createDocumentFragment();
    }

    if (tag === "img") {
      lastPasteWarning = "Images from pasted content were removed. Use Insert Image to upload images in a controlled way.";
      return document.createDocumentFragment();
    }

    if (["span", "font", "body", "html", "main", "section", "article", "header", "footer", "center"].includes(tag)) {
      const frag = document.createDocumentFragment();
      appendSanitizedChildren(node, frag);
      return frag;
    }

    if (tag === "div") {
      if (hasBlockChild(node)) {
        const frag = document.createDocumentFragment();
        appendSanitizedChildren(node, frag);
        return frag;
      }

      const p = document.createElement("p");
      sanitizeInlineChildren(node, p);
      return cleanEmptyBlock(p) || document.createDocumentFragment();
    }

    if (tag === "p") {
      const p = document.createElement("p");
      sanitizeInlineChildren(node, p);
      return cleanEmptyBlock(p) || document.createDocumentFragment();
    }

    if (tag === "br") {
      return document.createElement("br");
    }

    if (["b", "strong"].includes(tag)) {
      const strong = document.createElement("strong");
      appendSanitizedChildren(node, strong);
      return strong;
    }

    if (["i", "em"].includes(tag)) {
      const em = document.createElement("em");
      appendSanitizedChildren(node, em);
      return em;
    }

    if (tag === "u") {
      const u = document.createElement("u");
      appendSanitizedChildren(node, u);
      return u;
    }

    if (tag === "a") {
      const href = validHref(node.getAttribute("href"));

      if (!href) {
        const frag = document.createDocumentFragment();
        appendSanitizedChildren(node, frag);
        return frag;
      }

      const a = document.createElement("a");
      a.setAttribute("href", href);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      appendSanitizedChildren(node, a);
      return a;
    }

    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
      const mapped = tag === "h5" || tag === "h6" ? "h4" : tag;
      const h = document.createElement(mapped);
      appendSanitizedChildren(node, h);
      return cleanEmptyBlock(h) || document.createDocumentFragment();
    }

    if (tag === "ul" || tag === "ol") {
      const list = document.createElement(tag);
      appendSanitizedChildren(node, list);
      return list;
    }

    if (tag === "li") {
      const li = document.createElement("li");
      appendSanitizedChildren(node, li);
      return cleanEmptyBlock(li) || document.createDocumentFragment();
    }

    if (tag === "table") {
      const table = document.createElement("table");
      table.className = "policy-table";
      table.setAttribute("data-policy-table", "1");

      appendSanitizedChildren(node, table);

      if (!table.querySelector("tr")) {
        return document.createDocumentFragment();
      }

      return table;
    }

    if (tag === "thead" || tag === "tbody") {
      const section = document.createElement(tag);
      appendSanitizedChildren(node, section);
      return section;
    }

    if (tag === "tfoot") {
      const tbody = document.createElement("tbody");
      appendSanitizedChildren(node, tbody);
      return tbody;
    }

    if (tag === "tr") {
      const tr = document.createElement("tr");
      appendSanitizedChildren(node, tr);

      if (!tr.querySelector("td,th")) {
        return document.createDocumentFragment();
      }

      return tr;
    }

    if (tag === "th" || tag === "td") {
      const cell = document.createElement(tag);
      copyTableCellSpanAttributes(node, cell);
      sanitizeInlineChildren(node, cell);
      return cell;
    }

    if (tag === "blockquote") {
      const div = document.createElement("div");
      div.className = "policy-block policy-block-reference";
      div.setAttribute("data-policy-block", "reference");
      div.setAttribute(
        "style",
        "border:1px solid #566b8f;border-left:5px solid #566b8f;background:#f5f7fb;border-radius:12px;padding:10px 12px;margin:12px 0;color:#10233f;line-height:1.45;"
      );

      const title = document.createElement("div");
      title.className = "policy-block-title";
      title.setAttribute("style", "font-weight:700;color:#32496f;margin-bottom:5px;");
      title.textContent = "REFERENCE";

      const body = document.createElement("div");
      body.className = "policy-block-body";
      appendSanitizedChildren(node, body);

      div.appendChild(title);
      div.appendChild(body);

      return div;
    }

    const frag = document.createDocumentFragment();
    appendSanitizedChildren(node, frag);
    return frag;
  }

  function unwrapMicrosoftConditionalComments(html) {
    return String(html || "")
      .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");
  }

  function cleanPastedHtml(html) {
    lastPasteWarning = "";

    const raw = unwrapMicrosoftConditionalComments(html);

    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");

    const output = document.createDocumentFragment();

    Array.from(doc.body.childNodes || []).forEach((child) => {
      const cleaned = sanitizeNode(child);
      if (cleaned) output.appendChild(cleaned);
    });

    const box = document.createElement("div");
    box.appendChild(output);

    box.querySelectorAll("table").forEach((table) => {
      table.classList.add("policy-table");
      table.setAttribute("data-policy-table", "1");

      if (!table.querySelector("tbody") && !table.querySelector("thead")) {
        const tbody = document.createElement("tbody");

        Array.from(table.querySelectorAll(":scope > tr")).forEach((tr) => {
          tbody.appendChild(tr);
        });

        if (tbody.children.length) {
          table.appendChild(tbody);
        }
      }
    });

    box.querySelectorAll("p, h1, h2, h3, h4, li, th, td").forEach((el) => {
      const text = (el.textContent || "").replace(/\u00a0/g, " ").trim();
      const hasStructure = !!el.querySelector("br, table, ul, ol");

      if (!text && !hasStructure) {
        el.remove();
      }
    });

    return box.innerHTML.trim();
  }

  function cleanPlainText(text) {
    const raw = String(text || "").replace(/\r/g, "");
    const blocks = raw.split(/\n{2,}/g).map((x) => x.trim()).filter(Boolean);

    if (!blocks.length) return "";

    return blocks.map((block) => {
      const lines = block.split(/\n/g).map((line) => escapeHtml(line));
      return `<p>${lines.join("<br>")}</p>`;
    }).join("");
  }

  function insertHtmlAtCursor(html) {
    const editor = editorEl();

    if (!editor) {
      throw new Error("Policy editor not found.");
    }

    editor.focus();

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

  function hasClipboardImageFiles(clipboardData) {
    const items = Array.from(clipboardData?.items || []);
    return items.some((item) => String(item.type || "").startsWith("image/"));
  }

  function handlePaste(event) {
    const editor = editorEl();

    if (!editor || !editor.contains(event.target)) return;

    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const html = clipboard.getData("text/html") || "";
    const text = clipboard.getData("text/plain") || "";
    const hasImages = hasClipboardImageFiles(clipboard) || /<img[\s>]/i.test(html);

    if (!html && !text && hasImages) {
      event.preventDefault();
      showWarn("Pasted images are not inserted directly. Use Insert Image so the image is uploaded and controlled.");
      return;
    }

    if (!html && !text) return;

    event.preventDefault();

    const cleanHtml = html ? cleanPastedHtml(html) : cleanPlainText(text);

    if (!cleanHtml) {
      if (hasImages) {
        showWarn("Pasted content did not contain usable text. Use Insert Image for images.");
      } else {
        showWarn("Pasted content was empty after cleanup.");
      }
      return;
    }

    insertHtmlAtCursor(cleanHtml);

    if (hasImages || lastPasteWarning) {
      showWarn(lastPasteWarning || "Images from pasted content were removed. Use Insert Image to upload images in a controlled way.");
      return;
    }

    showOk("Pasted content cleaned and inserted.");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-paste-cleanup-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-paste-cleanup-styles";
    style.textContent = `
      .policy-paste-clean-note {
        color: #4d6283;
        font-size: .82rem;
        line-height: 1.3;
      }
    `;

    document.head.appendChild(style);
  }

  function addToolbarNote() {
    const toolbar = document.querySelector(".editor-toolbar");

    if (!toolbar || document.getElementById("policyPasteCleanupNote")) return;

    const note = document.createElement("span");
    note.id = "policyPasteCleanupNote";
    note.className = "policy-paste-clean-note";
    note.textContent = "Paste cleanup active";

    toolbar.appendChild(note);
  }

  function wireEditor() {
    const editor = editorEl();

    if (!editor || editor.getAttribute("data-policy-paste-cleanup-wired") === "1") return;

    editor.setAttribute("data-policy-paste-cleanup-wired", "1");
    editor.addEventListener("paste", handlePaste);
  }

  function init() {
    injectStyles();
    wireEditor();
    addToolbarNote();

    const observer = new MutationObserver(() => {
      wireEditor();
      addToolbarNote();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.CSVB_POLICY_PASTE_CLEANUP = {
      build: BUILD,
      cleanPastedHtml,
      cleanPlainText,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();