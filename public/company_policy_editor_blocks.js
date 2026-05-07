// public/company_policy_editor_blocks.js
// C.S.V. BEACON – Company Policy controlled editor blocks
// CP-10E: insert controlled Note / Caution / Reference / Procedure Step blocks.

(() => {
  "use strict";

  const BUILD = "CP10E-2026-05-07";

  let savedRange = null;
  let activeBlock = null;

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

  function blockTheme(type) {
    const themes = {
      note: {
        title: "NOTE",
        border: "#2f78c4",
        bg: "#f1f8ff",
        titleColor: "#0b4f90",
        body: "Insert note text here."
      },
      caution: {
        title: "CAUTION",
        border: "#c87900",
        bg: "#fff8e6",
        titleColor: "#8a5a00",
        body: "Insert caution / important instruction here."
      },
      reference: {
        title: "REFERENCE",
        border: "#566b8f",
        bg: "#f5f7fb",
        titleColor: "#32496f",
        body: "Insert reference, document, regulation, form, or cross-reference here."
      },
      procedure: {
        title: "PROCEDURE STEP",
        border: "#16834a",
        bg: "#eefaf2",
        titleColor: "#11612b",
        body: "Insert procedure step / required action here."
      }
    };

    return themes[type] || themes.note;
  }

  function blockHtml(type) {
    const t = blockTheme(type);

    return `
      <div
        class="policy-block policy-block-${type}"
        data-policy-block="${type}"
        style="
          border:1px solid ${t.border};
          border-left:5px solid ${t.border};
          background:${t.bg};
          border-radius:12px;
          padding:10px 12px;
          margin:12px 0;
          color:#10233f;
          line-height:1.45;
          page-break-inside:avoid;
          break-inside:avoid;
        "
      >
        <div
          class="policy-block-title"
          style="
            font-weight:700;
            color:${t.titleColor};
            margin-bottom:5px;
            letter-spacing:.01em;
          "
        >${t.title}</div>
        <div
          class="policy-block-body"
          style="font-weight:400;"
        >${t.body}</div>
      </div>
      <p><br></p>
    `;
  }

  function dividerHtml() {
    return `
      <hr
        class="policy-divider"
        data-policy-divider="1"
        style="
          border:0;
          border-top:1px solid #cbd8ea;
          margin:16px 0;
        "
      />
      <p><br></p>
    `;
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
    range.deleteContents();

    const template = document.createElement("template");
    template.innerHTML = html.trim();

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

  function insertBlock(type) {
    insertHtmlAtCursor(blockHtml(type));
    showOk("Controlled policy block inserted.");
  }

  function insertDivider() {
    insertHtmlAtCursor(dividerHtml());
    showOk("Divider inserted.");
  }

  function clearActiveBlock() {
    if (activeBlock) {
      activeBlock.classList.remove("policy-block-active");
    }

    activeBlock = null;
  }

  function setActiveBlock(block) {
    clearActiveBlock();

    if (!block) return;

    activeBlock = block;
    activeBlock.classList.add("policy-block-active");
  }

  function removeSelectedBlock() {
    if (!activeBlock) {
      showWarn("Click inside a policy block first.");
      return;
    }

    const confirmed = window.confirm("Remove the selected policy block?");
    if (!confirmed) return;

    const block = activeBlock;
    clearActiveBlock();
    block.remove();

    showOk("Policy block removed.");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-editor-block-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-editor-block-styles";
    style.textContent = `
      .policy-block {
        position: relative;
      }

      .policy-block-active {
        outline: 3px solid #2f78c4;
        outline-offset: 2px;
      }

      .policy-block-title {
        user-select: text;
      }

      .policy-block-body {
        min-height: 20px;
      }

      .policy-divider {
        border: 0;
        border-top: 1px solid #cbd8ea;
        margin: 16px 0;
      }

      .policy-editor-block-separator {
        width: 1px;
        height: 26px;
        background: #cbd8ea;
        margin: 0 2px;
      }

      @media print {
        .policy-block {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      }
    `;

    document.head.appendChild(style);
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
        saveSelection();
        await handler();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    return btn;
  }

  function injectToolbarButtons() {
    const toolbar = document.querySelector(".editor-toolbar");

    if (!toolbar || document.getElementById("policyInsertNoteBlockBtn")) return;

    const sep = document.createElement("span");
    sep.className = "policy-editor-block-separator";

    const noteBtn = makeButton("Note Box", "Insert controlled note box", () => insertBlock("note"));
    noteBtn.id = "policyInsertNoteBlockBtn";

    const cautionBtn = makeButton("Caution Box", "Insert controlled caution box", () => insertBlock("caution"));
    const refBtn = makeButton("Reference Box", "Insert controlled reference box", () => insertBlock("reference"));
    const stepBtn = makeButton("Procedure Step", "Insert controlled procedure step block", () => insertBlock("procedure"));
    const dividerBtn = makeButton("Divider", "Insert horizontal divider", insertDivider);
    const removeBtn = makeButton("Remove Block", "Remove selected policy block", removeSelectedBlock);

    [
      sep,
      noteBtn,
      cautionBtn,
      refBtn,
      stepBtn,
      dividerBtn,
      removeBtn,
    ].forEach((el) => toolbar.appendChild(el));
  }

  function wireEditorSelection() {
    const editor = editorEl();

    if (!editor || editor.getAttribute("data-policy-blocks-wired") === "1") return;

    editor.setAttribute("data-policy-blocks-wired", "1");

    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("focus", saveSelection);

    editor.addEventListener("click", (event) => {
      const block = event.target.closest?.(".policy-block");

      if (block && editor.contains(block)) {
        setActiveBlock(block);
        return;
      }

      if (!event.target.closest?.(".policy-block")) {
        clearActiveBlock();
      }
    });
  }

  function init() {
    injectStyles();
    injectToolbarButtons();
    wireEditorSelection();

    const observer = new MutationObserver(() => {
      injectToolbarButtons();
      wireEditorSelection();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.CSVB_POLICY_EDITOR_BLOCKS = {
      build: BUILD,
      insertBlock,
      insertDivider,
      removeSelectedBlock,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();