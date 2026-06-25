/* public/csvb-search-highlight.js */
/* C.S.V. BEACON — shared search-term highlighter for SIRE/RISQ question viewer/editor pages */
(() => {
  "use strict";

  if (window.CSVB_SEARCH_HIGHLIGHT_LOADED) return;
  window.CSVB_SEARCH_HIGHLIGHT_LOADED = true;

  const BUILD = "CSVB_SEARCH_HIGHLIGHT_20260625_1";
  window.CSVB_SEARCH_HIGHLIGHT_BUILD = BUILD;

  const PAGE_TARGETS = {
    "q-sire-questions-viewer.html": ["#qList", "#viewPanel"],
    "q-questions-editor.html": ["#qList", "#viewPanel"],
    "risq-questions-viewer.html": ["#questionList", "#detailBody"],
    "risq-questions-editor.html": ["#questionList", "#detailBody"]
  };

  const SKIP_SELECTOR = [
    "script",
    "style",
    "noscript",
    "textarea",
    "input",
    "select",
    "option",
    "button",
    "svg",
    "canvas",
    "mark.csvb-search-highlight",
    "[contenteditable='true']"
  ].join(",");

  let observer = null;
  let applyTimer = null;
  let running = false;
  let boundInput = null;

  function pageName() {
    const attr = document.documentElement?.getAttribute("data-csvb-page") || "";
    if (attr) return attr.split("/").pop();
    return String(location.pathname || "").split("/").pop();
  }

  function targetSelectors() {
    return PAGE_TARGETS[pageName()] || ["#qList", "#viewPanel", "#questionList", "#detailBody"];
  }

  function searchTerm() {
    return String(document.getElementById("searchInput")?.value || "").trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function injectStyles() {
    if (document.getElementById("csvbSearchHighlightStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSearchHighlightStyles";
    style.textContent = `
      mark.csvb-search-highlight {
        background: #fff176 !important;
        color: #000 !important;
        border-radius: 3px;
        padding: 0 .08em;
        box-shadow: inset 0 -1px 0 rgba(0,0,0,.12);
      }

      @media print {
        mark.csvb-search-highlight {
          background: transparent !important;
          color: inherit !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getTargets() {
    const seen = new Set();
    const out = [];

    for (const selector of targetSelectors()) {
      document.querySelectorAll(selector).forEach((node) => {
        if (!node || seen.has(node)) return;
        seen.add(node);
        out.push(node);
      });
    }

    return out;
  }

  function clearHighlights(root) {
    if (!root) return;

    const marks = Array.from(root.querySelectorAll("mark.csvb-search-highlight"));
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    }
  }

  function shouldSkipTextNode(node) {
    if (!node || !node.nodeValue || !node.nodeValue.trim()) return true;
    const parent = node.parentElement;
    if (!parent) return true;
    return !!parent.closest(SKIP_SELECTOR);
  }

  function highlightTextNode(textNode, regex) {
    const text = textNode.nodeValue || "";
    regex.lastIndex = 0;

    let match;
    let lastIndex = 0;
    let found = false;
    const frag = document.createDocumentFragment();

    while ((match = regex.exec(text)) !== null) {
      const value = match[0];
      if (!value) break;

      const index = match.index;
      if (index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, index)));
      }

      const mark = document.createElement("mark");
      mark.className = "csvb-search-highlight";
      mark.textContent = value;
      frag.appendChild(mark);

      lastIndex = index + value.length;
      found = true;
    }

    if (!found) return;

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
  }

  function highlightRoot(root, regex) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldSkipTextNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    for (const textNode of textNodes) {
      highlightTextNode(textNode, regex);
    }
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function connectObserver() {
    if (observer || !document.body) return;

    observer = new MutationObserver(() => {
      if (!running) scheduleHighlight(80);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function bindSearchInput() {
    const input = document.getElementById("searchInput");
    if (!input || input === boundInput) return;

    boundInput = input;
    input.addEventListener("input", () => scheduleHighlight(30));
    input.addEventListener("change", () => scheduleHighlight(30));
  }

  function applyHighlights() {
    if (running || !document.body) return;

    running = true;
    disconnectObserver();

    try {
      bindSearchInput();

      const term = searchTerm();
      const targets = getTargets();

      for (const root of targets) {
        clearHighlights(root);
      }

      if (term) {
        const regex = new RegExp(escapeRegExp(term), "gi");
        for (const root of targets) {
          highlightRoot(root, regex);
        }
      }
    } finally {
      running = false;
      connectObserver();
    }
  }

  function scheduleHighlight(delay = 60) {
    if (applyTimer) clearTimeout(applyTimer);
    applyTimer = setTimeout(applyHighlights, delay);
  }

  function init() {
    injectStyles();
    bindSearchInput();
    connectObserver();

    scheduleHighlight(0);
    setTimeout(() => scheduleHighlight(0), 250);
    setTimeout(() => scheduleHighlight(0), 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
