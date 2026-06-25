/* public/csvb-search-highlight.js */
/* C.S.V. BEACON — shared search-term highlighter + next/previous navigation */
(() => {
  "use strict";

  if (window.CSVB_SEARCH_HIGHLIGHT_LOADED) return;
  window.CSVB_SEARCH_HIGHLIGHT_LOADED = true;

  const BUILD = "CSVB_SEARCH_HIGHLIGHT_20260625_2_NAV";
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
  let matches = [];
  let currentIndex = -1;
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

      mark.csvb-search-highlight.csvb-search-highlight-current {
        background: #ffb300 !important;
        color: #000 !important;
        outline: 2px solid #b45309;
        box-shadow: 0 0 0 3px rgba(255, 193, 7, .35);
      }

      .csvb-search-nav {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        flex-wrap: wrap;
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
        min-width: 58px;
        text-align: center;
        color: #062a5e;
        font-size: 12px;
        font-weight: 900;
        border: 1px solid #d7e6f5;
        background: #f8fbff;
        border-radius: 999px;
        padding: 4px 8px;
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
      `;

      prevBtn = navEl.querySelector("#csvbSearchPrevBtn");
      nextBtn = navEl.querySelector("#csvbSearchNextBtn");
      countEl = navEl.querySelector("#csvbSearchCount");

      prevBtn?.addEventListener("click", () => goToMatch(-1));
      nextBtn?.addEventListener("click", () => goToMatch(1));
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

  function collectMatches(targets) {
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

  function updateCurrentClass() {
    matches.forEach((mark, idx) => {
      mark.classList.toggle("csvb-search-highlight-current", idx === currentIndex);
    });
  }

  function updateNavUi() {
    ensureNavUi();

    const hasTerm = !!searchTerm();
    const total = matches.length;
    const active = hasTerm && total > 0 && currentIndex >= 0;

    if (countEl) {
      countEl.textContent = active ? `${currentIndex + 1} / ${total}` : `0 / ${total}`;
    }

    if (prevBtn) prevBtn.disabled = !active;
    if (nextBtn) nextBtn.disabled = !active;

    if (navEl) {
      navEl.style.display = hasTerm ? "flex" : "none";
    }
  }

  function scrollCurrentIntoView() {
    const mark = matches[currentIndex];
    if (!mark) return;

    updateCurrentClass();

    try {
      mark.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });
    } catch (_) {
      mark.scrollIntoView();
    }
  }

  function goToMatch(direction) {
    if (!matches.length) return;

    currentIndex += direction;
    if (currentIndex < 0) currentIndex = matches.length - 1;
    if (currentIndex >= matches.length) currentIndex = 0;

    updateNavUi();
    scrollCurrentIntoView();
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

    input.addEventListener("input", () => {
      currentIndex = -1;
      scheduleHighlight(30);
    });

    input.addEventListener("change", () => {
      currentIndex = -1;
      scheduleHighlight(30);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (!searchTerm()) return;

      event.preventDefault();
      goToMatch(event.shiftKey ? -1 : 1);
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

      matches = [];

      if (term) {
        const regex = new RegExp(escapeRegExp(term), "gi");

        for (const root of targets) {
          highlightRoot(root, regex);
        }

        matches = collectMatches(targets);

        if (matches.length) {
          if (termChanged || currentIndex < 0) currentIndex = 0;
          if (currentIndex >= matches.length) currentIndex = matches.length - 1;
        } else {
          currentIndex = -1;
        }
      } else {
        currentIndex = -1;
      }

      updateCurrentClass();
      updateNavUi();

      if (termChanged && matches.length && currentIndex >= 0) {
        setTimeout(scrollCurrentIntoView, 40);
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
