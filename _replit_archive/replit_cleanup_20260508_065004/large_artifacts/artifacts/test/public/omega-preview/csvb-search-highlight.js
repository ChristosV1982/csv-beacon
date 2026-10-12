/* public/csvb-search-highlight.js */
/* C.S.V. BEACON — shared search highlighter + result-row navigation */
(() => {
  "use strict";

  if (window.CSVB_SEARCH_HIGHLIGHT_LOADED) return;
  window.CSVB_SEARCH_HIGHLIGHT_LOADED = true;

  const BUILD = "CSVB_SEARCH_HIGHLIGHT_20260625_3_RESULT_NAV";
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
  let navEl = null;
  let prevBtn = null;
  let nextBtn = null;
  let countEl = null;
  let markMatches = [];
  let resultRows = [];
  let currentResultIndex = -1;
  let lastTerm = "";

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

      .csvb-search-result-current {
        outline: 3px solid #ffb300 !important;
        box-shadow: 0 0 0 4px rgba(255, 193, 7, .34) !important;
      }

      .csvb-search-nav {
        position: sticky;
        top: 6px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        margin-bottom: 8px;
        flex-wrap: wrap;
        padding: 6px;
        border: 1px solid #d6e4f5;
        border-radius: 10px;
        background: rgba(248, 251, 255, .98);
        box-shadow: 0 8px 22px rgba(3,27,63,.08);
      }

      .csvb-search-nav button {
        border: 1px solid #b7cde7;
        background: #fff;
        color: #062a5e;
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 850;
        cursor: pointer;
        line-height: 1.1;
      }

      .csvb-search-nav button:hover:not(:disabled) {
        background: #eef7ff;
        border-color: #7db7d8;
      }

      .csvb-search-nav button:disabled {
        opacity: .45;
        cursor: not-allowed;
      }

      .csvb-search-nav-count {
        min-width: 76px;
        text-align: center;
        color: #062a5e;
        font-size: 12px;
        font-weight: 900;
        border: 1px solid #d7e6f5;
        background: #fff;
        border-radius: 999px;
        padding: 4px 8px;
      }

      .csvb-search-nav-note {
        color: #52677f;
        font-size: 11px;
        font-weight: 800;
        flex-basis: 100%;
        line-height: 1.2;
      }

      @media print {
        mark.csvb-search-highlight {
          background: transparent !important;
          color: inherit !important;
          box-shadow: none !important;
          outline: none !important;
          padding: 0 !important;
        }

        .csvb-search-nav {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureNavUi() {
    const input = document.getElementById("searchInput");
    if (!input) return;

    if (!navEl) {
      navEl = document.createElement("div");
      navEl.id = "csvbSearchNav";
      navEl.className = "csvb-search-nav";
      navEl.innerHTML = `
        <button type="button" id="csvbSearchPrevBtn" title="Previous search result">◀ Previous</button>
        <span class="csvb-search-nav-count" id="csvbSearchCount">0 / 0</span>
        <button type="button" id="csvbSearchNextBtn" title="Next search result">Next ▶</button>
        <div class="csvb-search-nav-note">Result navigation follows the filtered question list. Yellow marks show visible text matches.</div>
      `;

      prevBtn = navEl.querySelector("#csvbSearchPrevBtn");
      nextBtn = navEl.querySelector("#csvbSearchNextBtn");
      countEl = navEl.querySelector("#csvbSearchCount");

      prevBtn?.addEventListener("click", () => goToResult(-1));
      nextBtn?.addEventListener("click", () => goToResult(1));
    }

    if (!navEl.parentNode) {
      input.insertAdjacentElement("afterend", navEl);
    }
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

  function getListRoot() {
    return document.querySelector("#qList") || document.querySelector("#questionList");
  }

  function collectResultRows() {
    const root = getListRoot();
    if (!root) return [];

    const rows = Array.from(root.querySelectorAll(".qitem, .q-item"))
      .filter((node) => node instanceof HTMLElement);

    return rows;
  }

  function clearResultCurrentClass() {
    document.querySelectorAll(".csvb-search-result-current").forEach((node) => {
      node.classList.remove("csvb-search-result-current");
    });
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

  function collectMarkMatches(targets) {
    const seen = new Set();
    const out = [];

    for (const root of targets) {
      root.querySelectorAll("mark.csvb-search-highlight").forEach((mark) => {
        if (seen.has(mark)) return;
        seen.add(mark);
        out.push(mark);
      });
    }

    return out;
  }

  function activeResultIndex() {
    const idx = resultRows.findIndex((row) => row.classList.contains("active"));
    return idx >= 0 ? idx : -1;
  }

  function normalizeCurrentResultIndex(termChanged) {
    if (!resultRows.length) {
      currentResultIndex = -1;
      return;
    }

    const activeIdx = activeResultIndex();

    if (termChanged) {
      currentResultIndex = activeIdx >= 0 ? activeIdx : 0;
      return;
    }

    if (activeIdx >= 0 && activeIdx < resultRows.length) {
      currentResultIndex = activeIdx;
      return;
    }

    if (currentResultIndex < 0) currentResultIndex = 0;
    if (currentResultIndex >= resultRows.length) currentResultIndex = resultRows.length - 1;
  }

  function updateCurrentResultClass() {
    clearResultCurrentClass();

    const row = resultRows[currentResultIndex];
    if (row) row.classList.add("csvb-search-result-current");
  }

  function updateNavUi() {
    ensureNavUi();

    const hasTerm = !!searchTerm();
    const total = resultRows.length;
    const active = hasTerm && total > 0 && currentResultIndex >= 0;

    if (countEl) {
      countEl.textContent = active ? `${currentResultIndex + 1} / ${total}` : `0 / ${total}`;
      countEl.title = `${markMatches.length} visible highlighted word occurrence(s) on the current screen`;
    }

    if (prevBtn) prevBtn.disabled = !active;
    if (nextBtn) nextBtn.disabled = !active;

    if (navEl) {
      navEl.style.display = hasTerm ? "flex" : "none";
    }
  }

  function scrollResultIntoView(row) {
    if (!row) return;

    try {
      row.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });
    } catch (_) {
      row.scrollIntoView();
    }
  }

  function goToResult(direction) {
    if (!resultRows.length) return;

    currentResultIndex += direction;
    if (currentResultIndex < 0) currentResultIndex = resultRows.length - 1;
    if (currentResultIndex >= resultRows.length) currentResultIndex = 0;

    const row = resultRows[currentResultIndex];
    updateCurrentResultClass();
    updateNavUi();
    scrollResultIntoView(row);

    if (row) {
      row.click();
      setTimeout(() => scheduleHighlight(40), 60);
      setTimeout(() => scheduleHighlight(40), 250);
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
      if (!running) scheduleHighlight(100);
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

    input.addEventListener("input", () => {
      currentResultIndex = -1;
      scheduleHighlight(40);
    });

    input.addEventListener("change", () => {
      currentResultIndex = -1;
      scheduleHighlight(40);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (!searchTerm()) return;

      event.preventDefault();
      goToResult(event.shiftKey ? -1 : 1);
    });
  }

  function applyHighlights() {
    if (running || !document.body) return;

    running = true;
    disconnectObserver();

    try {
      bindSearchInput();
      ensureNavUi();

      const term = searchTerm();
      const termChanged = term !== lastTerm;
      lastTerm = term;

      const targets = getTargets();

      for (const root of targets) {
        clearHighlights(root);
      }

      markMatches = [];

      if (term) {
        const regex = new RegExp(escapeRegExp(term), "gi");

        for (const root of targets) {
          highlightRoot(root, regex);
        }

        markMatches = collectMarkMatches(targets);
      } else {
        currentResultIndex = -1;
      }

      resultRows = term ? collectResultRows() : [];
      normalizeCurrentResultIndex(termChanged);
      updateCurrentResultClass();
      updateNavUi();
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
    ensureNavUi();
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
