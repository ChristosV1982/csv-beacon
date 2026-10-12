// public/company_policy_ai_search.js
// C.S.V. BEACON – Company Policy AI Search UI
// CP-7C: source-based AI Search over current published Company Policy text only.

(() => {
  "use strict";

  const EDGE_FUNCTION_NAME = "company-policy-ai-search";
  const OPEN_NODE_SESSION_KEY = "csvb_policy_ai_open_node_id";
  const COLLAPSED_STORAGE_KEY = "csvb_company_policy_collapsed_nodes_v1";

  let lastAnswer = "";
  let lastSources = [];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function textToHtml(value) {
    return escapeHtml(value || "").replaceAll("\n", "<br />");
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

  function injectStyles() {
    if (document.getElementById("csvb-policy-ai-search-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-ai-search-styles";
    style.textContent = `
      .policy-ai-layout {
        display: grid;
        grid-template-columns: minmax(320px, 430px) minmax(420px, 1fr);
        gap: 10px;
        align-items: start;
      }

      .policy-ai-card {
        border: 1px solid #dbe6f6;
        background: #fff;
        border-radius: 12px;
        padding: 11px;
        box-sizing: border-box;
      }

      .policy-ai-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .policy-ai-note {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .9rem;
        margin-bottom: 10px;
      }

      .policy-ai-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 8px;
      }

      .policy-ai-answer {
        border: 1px solid #dbe6f6;
        background: #f9fbfe;
        border-radius: 12px;
        padding: 12px;
        color: #213a5f;
        line-height: 1.45;
        min-height: 170px;
        font-size: .94rem;
      }

      .policy-ai-answer strong {
        font-weight: 700;
      }

      .policy-ai-sources {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 430px;
        overflow: auto;
        margin-top: 10px;
      }

      .policy-ai-source {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
      }

      .policy-ai-source:hover {
        background: #eef6ff;
        border-color: #8fb4e8;
      }

      .policy-ai-source-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .policy-ai-source-meta {
        color: #4d6283;
        font-size: .87rem;
        line-height: 1.35;
      }

      .policy-ai-source-excerpt {
        margin-top: 7px;
        color: #213a5f;
        background: #fff;
        border: 1px solid #dbe6f6;
        border-radius: 10px;
        padding: 8px;
        line-height: 1.4;
        font-size: .9rem;
      }

      .policy-ai-pill {
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
        .policy-ai-layout {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renderShell() {
    const panel = document.querySelector("#tab-aiSearch .panel");
    if (!panel) return;

    panel.innerHTML = `
      <div class="panel-title">AI Policy Search</div>

      <div class="policy-ai-layout">
        <div class="policy-ai-card">
          <div class="policy-ai-title">Ask a policy question</div>
          <div class="policy-ai-note">
            The answer is generated only from current approved / published Company Policy text. If no relevant approved text is found, the system must say so.
          </div>

          <div class="field">
            <label>Question</label>
            <textarea id="policyAiQuestion" placeholder="Example: What does the policy say about permit to work?"></textarea>
          </div>

          <div class="field">
            <label>Number of source sections</label>
            <select id="policyAiLimit">
              <option value="5">5</option>
              <option value="8" selected>8</option>
              <option value="12">12</option>
              <option value="15">15</option>
            </select>
          </div>

          <div class="policy-ai-actions">
            <button class="btn" id="policyAiRunBtn" type="button">Run AI Search</button>
            <button class="btn2" id="policyAiClearBtn" type="button">Clear</button>
            <button class="btn2" id="policyAiCopyAnswerBtn" type="button">Copy answer</button>
          </div>
        </div>

        <div class="policy-ai-card">
          <div class="policy-ai-title">Answer</div>
          <div id="policyAiStatus" class="policy-ai-note">
            No question submitted yet.
          </div>

          <div id="policyAiAnswer" class="policy-ai-answer">
            Ask a question to search the approved Company Policy text.
          </div>

          <div class="policy-ai-title" style="margin-top:12px;">Sources</div>
          <div id="policyAiSources" class="policy-ai-sources">
            No sources loaded.
          </div>
        </div>
      </div>
    `;
  }

  async function runAiSearch() {
    const questionEl = document.getElementById("policyAiQuestion");
    const limitEl = document.getElementById("policyAiLimit");
    const answerEl = document.getElementById("policyAiAnswer");
    const statusEl = document.getElementById("policyAiStatus");
    const sourcesEl = document.getElementById("policyAiSources");
    const runBtn = document.getElementById("policyAiRunBtn");

    const question = String(questionEl?.value || "").trim();
    const limit = Number(limitEl?.value || 8);

    if (!question || question.length < 3) {
      showWarn("Question is required and must be at least 3 characters.");
      return;
    }

    const client = sb();

    const { data: sessionData, error: sessionError } = await client.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error("You are not logged in or your session has expired.");
    }

    const token = sessionData.session.access_token;
    const url = `${window.AUTH.SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`;

    if (runBtn) runBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Searching approved policy text and generating source-based answer...";
    if (answerEl) answerEl.innerHTML = "Working...";
    if (sourcesEl) sourcesEl.innerHTML = "";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": window.AUTH.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          limit,
          excerpt_chars: 1800,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `AI Search failed with HTTP ${response.status}.`);
      }

      lastAnswer = String(payload?.answer || "");
      lastSources = Array.isArray(payload?.sources) ? payload.sources : [];

      if (statusEl) {
        statusEl.textContent = `${payload.answer_status || "completed"} • ${lastSources.length} source(s)`;
      }

      if (answerEl) {
        answerEl.innerHTML = textToHtml(lastAnswer || "No answer returned.");
      }

      renderSources();

      showOk("AI Policy Search completed.");
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  }

  function renderSources() {
    const box = document.getElementById("policyAiSources");
    if (!box) return;

    if (!lastSources.length) {
      box.innerHTML = `
        <div class="content-box" style="min-height:0;">
          No source sections returned.
        </div>
      `;
      return;
    }

    box.innerHTML = lastSources.map((source) => `
      <div class="policy-ai-source" data-ai-node-id="${escapeHtml(source.node_id || "")}">
        <div class="policy-ai-source-title">
          [S${escapeHtml(source.source_no || "")}]
          ${escapeHtml(source.node_type || "Policy item")} ${escapeHtml(source.node_code || "")} — ${escapeHtml(source.node_title || "")}
        </div>
        <div class="policy-ai-source-meta">
          ${source.version_no ? `<span class="policy-ai-pill">Published v${escapeHtml(source.version_no)}</span>` : ""}
          ${source.score !== null && source.score !== undefined ? `<span class="policy-ai-pill">Score ${escapeHtml(source.score)}</span>` : ""}
        </div>
        <div class="policy-ai-source-excerpt">
          ${escapeHtml(source.excerpt || "No excerpt returned.")}
        </div>
      </div>
    `).join("");

    box.querySelectorAll("[data-ai-node-id]").forEach((el) => {
      el.addEventListener("click", () => {
        openPolicyNode(el.getAttribute("data-ai-node-id"));
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
        showOk("Source policy item opened.");
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
        showOk("Source policy item opened.");
      }

      if (attempts >= 20) {
        clearInterval(timer);
        showWarn("Could not automatically open the source policy item. Please search the policy tree manually.");
      }
    }, 250);
  }

  async function copyAnswer() {
    if (!lastAnswer) {
      showWarn("No answer to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(lastAnswer);
      showOk("Answer copied.");
    } catch (_) {
      showWarn("Clipboard copy failed. Select and copy the answer manually.");
    }
  }

  function clearUi() {
    const q = document.getElementById("policyAiQuestion");
    const a = document.getElementById("policyAiAnswer");
    const s = document.getElementById("policyAiSources");
    const st = document.getElementById("policyAiStatus");

    if (q) q.value = "";
    if (a) a.innerHTML = "Ask a question to search the approved Company Policy text.";
    if (s) s.innerHTML = "No sources loaded.";
    if (st) st.textContent = "No question submitted yet.";

    lastAnswer = "";
    lastSources = [];
  }

  function wireUi() {
    const runBtn = document.getElementById("policyAiRunBtn");
    const clearBtn = document.getElementById("policyAiClearBtn");
    const copyBtn = document.getElementById("policyAiCopyAnswerBtn");
    const question = document.getElementById("policyAiQuestion");

    const guarded = (fn) => async () => {
      try {
        showWarn("");
        await fn();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    };

    if (runBtn) runBtn.addEventListener("click", guarded(runAiSearch));
    if (clearBtn) clearBtn.addEventListener("click", clearUi);
    if (copyBtn) copyBtn.addEventListener("click", guarded(copyAnswer));

    if (question) {
      question.addEventListener("keydown", (event) => {
        if (event.ctrlKey && event.key === "Enter") {
          guarded(runAiSearch)();
        }
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

  window.CSVB_POLICY_AI_SEARCH = {
    run: runAiSearch,
    openPolicyNode,
  };
})();