// public/company_policy_search.js
// C.S.V. BEACON – Company Policy Exact Search UI
// CP-6B: search policy structure and current published policy text.

(() => {
  "use strict";

  const OPEN_NODE_SESSION_KEY = "csvb_policy_search_open_node_id";
  const COLLAPSED_STORAGE_KEY = "csvb_company_policy_collapsed_nodes_v1";

  let results = [];

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
    if (!el) return;
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

  function sb() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }

    return window.AUTH.ensureSupabase();
  }

  function matchTypeLabel(value) {
    const labels = {
      node_code: "Policy item code",
      title: "Policy item title",
      published_text: "Published policy text",
    };

    return labels[value] || value || "Match";
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-search-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-search-styles";
    style.textContent = `
      .policy-search-layout {
        display: grid;
        grid-template-columns: minmax(320px, 430px) minmax(420px, 1fr);
        gap: 10px;
        align-items: start;
      }

      .policy-search-card {
        border: 1px solid #dbe6f6;
        background: #fff;
        border-radius: 12px;
        padding: 11px;
        box-sizing: border-box;
      }

      .policy-search-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .policy-search-note {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .9rem;
        margin-bottom: 10px;
      }

      .policy-search-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 8px;
      }

      .policy-search-results {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 620px;
        overflow: auto;
      }

      .policy-search-result {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
      }

      .policy-search-result:hover {
        background: #eef6ff;
        border-color: #8fb4e8;
      }

      .policy-search-result-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .policy-search-result-meta {
        color: #4d6283;
        font-size: .87rem;
        line-height: 1.35;
      }

      .policy-search-snippet {
        margin-top: 7px;
        color: #213a5f;
        background: #fff;
        border: 1px solid #dbe6f6;
        border-radius: 10px;
        padding: 8px;
        line-height: 1.4;
        font-size: .9rem;
      }

      .policy-search-pill {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: .78rem;
        font-weight: 600;
        border: 1px solid #cbd8ea;
        background: #fff;
        color: #1a4170;
        margin-right: 5px;
      }

      @media (max-width: 980px) {
        .policy-search-layout {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renderShell() {
    const panel = document.querySelector("#tab-search .panel");
    if (!panel) return;

    panel.innerHTML = `
      <div class="panel-title">Exact Policy Search</div>

      <div class="policy-search-layout">
        <div class="policy-search-card">
          <div class="policy-search-title">Search approved policy text</div>
          <div class="policy-search-note">
            Search chapter/section code, title, and current published policy text. Results are based only on active policy items and current published versions.
          </div>

          <div class="field">
            <label>Search word or phrase</label>
            <input id="policyExactSearchInput" placeholder="Type word or phrase..." />
          </div>

          <div class="field">
            <label>Maximum results</label>
            <select id="policyExactSearchLimit">
              <option value="20">20</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>

          <div class="policy-search-actions">
            <button class="btn" id="policyExactSearchBtn" type="button">Search</button>
            <button class="btn2" id="policyExactClearBtn" type="button">Clear</button>
          </div>
        </div>

        <div class="policy-search-card">
          <div class="policy-search-title">Search results</div>
          <div id="policyExactSearchSummary" class="policy-search-note">
            Type a word or phrase and press Search.
          </div>
          <div id="policyExactSearchResults" class="policy-search-results"></div>
        </div>
      </div>
    `;
  }

  async function runExactSearch() {
    const input = document.getElementById("policyExactSearchInput");
    const limitEl = document.getElementById("policyExactSearchLimit");
    const summary = document.getElementById("policyExactSearchSummary");
    const box = document.getElementById("policyExactSearchResults");

    if (!input || !box) return;

    const query = String(input.value || "").trim();
    const limit = Number(limitEl?.value || 50);

    if (!query) {
      results = [];
      if (summary) summary.textContent = "Type a word or phrase and press Search.";
      box.innerHTML = "";
      return;
    }

    if (summary) summary.textContent = "Searching...";
    box.innerHTML = "";

    const { data, error } = await sb().rpc("csvb_company_policy_exact_search", {
      p_query: query,
      p_book_key: "main_policy",
      p_limit: limit,
    });

    if (error) {
      throw new Error("Exact policy search failed: " + error.message);
    }

    results = data || [];

    if (summary) {
      summary.textContent = `${results.length} result(s) found for: ${query}`;
    }

    renderResults();
  }

  function renderResults() {
    const box = document.getElementById("policyExactSearchResults");
    if (!box) return;

    if (!results.length) {
      box.innerHTML = `
        <div class="content-box" style="min-height:0;">
          No matching published policy text or policy item found.
        </div>
      `;
      return;
    }

    box.innerHTML = results.map((item) => `
      <div class="policy-search-result" data-search-node-id="${escapeHtml(item.node_id)}">
        <div class="policy-search-result-title">
          ${escapeHtml(item.node_type || "Policy item")} ${escapeHtml(item.node_code || "")} — ${escapeHtml(item.node_title || "")}
        </div>
        <div class="policy-search-result-meta">
          <span class="policy-search-pill">${escapeHtml(matchTypeLabel(item.match_type))}</span>
          ${item.version_no ? `<span class="policy-search-pill">Published v${escapeHtml(item.version_no)}</span>` : ""}
          ${item.published_at ? `<div>Published: ${escapeHtml(item.published_at)}</div>` : ""}
        </div>
        <div class="policy-search-snippet">
          ${escapeHtml(item.match_snippet || "No snippet available.")}
        </div>
      </div>
    `).join("");

    box.querySelectorAll("[data-search-node-id]").forEach((el) => {
      el.addEventListener("click", () => {
        openPolicyNode(el.getAttribute("data-search-node-id"));
      });
    });
  }

  function openPolicyNode(nodeId) {
    if (!nodeId) return;

    const tab = document.querySelector('[data-tab="policyBook"]');
    if (tab) tab.click();

    setTimeout(() => {
      const visibleBtn = document.querySelector(`#chapterList [data-node-id="${nodeId}"]`);
      if (visibleBtn) {
        visibleBtn.click();
        showOk("Policy item opened.");
        return;
      }

      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, "[]");
        sessionStorage.setItem(OPEN_NODE_SESSION_KEY, nodeId);
      } catch (_) {}

      location.reload();
    }, 120);
  }

  function tryOpenPendingNodeFromReload() {
    let nodeId = "";

    try {
      nodeId = sessionStorage.getItem(OPEN_NODE_SESSION_KEY) || "";
      if (nodeId) sessionStorage.removeItem(OPEN_NODE_SESSION_KEY);
    } catch (_) {
      nodeId = "";
    }

    if (!nodeId) return;

    let attempts = 0;

    const timer = setInterval(() => {
      attempts += 1;

      const tab = document.querySelector('[data-tab="policyBook"]');
      if (tab) tab.click();

      const btn = document.querySelector(`#chapterList [data-node-id="${nodeId}"]`);
      if (btn) {
        clearInterval(timer);
        btn.click();
        showOk("Policy item opened.");
      }

      if (attempts >= 20) {
        clearInterval(timer);
        showWarn("Could not automatically open the policy item. Please search the policy tree manually.");
      }
    }, 250);
  }

  function wireUi() {
    const searchBtn = document.getElementById("policyExactSearchBtn");
    const clearBtn = document.getElementById("policyExactClearBtn");
    const input = document.getElementById("policyExactSearchInput");

    const guarded = (fn) => async () => {
      try {
        showWarn("");
        await fn();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    };

    if (searchBtn) searchBtn.addEventListener("click", guarded(runExactSearch));

    if (input) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") guarded(runExactSearch)();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (input) input.value = "";
        results = [];

        const summary = document.getElementById("policyExactSearchSummary");
        const box = document.getElementById("policyExactSearchResults");

        if (summary) summary.textContent = "Type a word or phrase and press Search.";
        if (box) box.innerHTML = "";
      });
    }
  }

  function init() {
    injectStyles();
    renderShell();
    wireUi();
    tryOpenPendingNodeFromReload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }

  window.CSVB_POLICY_EXACT_SEARCH = {
    run: runExactSearch,
    openPolicyNode,
  };
})();