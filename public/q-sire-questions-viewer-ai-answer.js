// public/q-sire-questions-viewer-ai-answer.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer AI Answer Connector
// Calls Supabase Edge Function: sire-viewer-ai-search
// Requires OPENAI_API_KEY configured as a Supabase function secret.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-AI-ANSWER-20260527_OFFLINE_DISABLED_1";
  window.CSVB_SIRE_VIEWER_AI_ANSWER_BUILD = BUILD;

  const state = {
    sb: null,
    lastAnswer: "",
    busy: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function esc(value) {
    return safeStr(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value) {
    return safeStr(value).replace(/\s+/g, " ").trim();
  }

  function offlinePackageModeActive() {
    return window.CSVB_SIRE_VIEWER_OFFLINE_ACTIVE === true ||
      document.documentElement.getAttribute("data-csvb-sire-offline") === "1";
  }

  function setStatus(message) {
    const el = $("csvbAiSourceStatus");
    if (el) el.textContent = message || "";
  }

  function injectStyles() {
    if ($("csvbSireViewerAiAnswerStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerAiAnswerStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-box {
        display:none;
        margin-top:8px;
        border:1px solid #BFD3EF;
        background:#FFFFFF;
        border-radius:9px;
        padding:8px;
        color:#10233F;
        font-size:12px;
        line-height:1.4;
        white-space:pre-wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-title {
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:8px;
        margin-bottom:6px;
        color:#062A5E;
        font-weight:850;
        white-space:normal;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-answer-meta {
        color:#5E6F86;
        font-size:11px;
        margin-bottom:6px;
        white-space:normal;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureUi() {
    if ($("csvbAiAskBtn")) return true;

    const actions = document.querySelector(".csvb-ai-source-actions");
    const results = $("csvbAiSourceResults");

    if (!actions || !results) return false;

    const askBtn = document.createElement("button");
    askBtn.id = "csvbAiAskBtn";
    askBtn.className = "btn";
    askBtn.type = "button";
    askBtn.textContent = "Ask AI";

    const copyAnswerBtn = document.createElement("button");
    copyAnswerBtn.id = "csvbAiCopyAnswerBtn";
    copyAnswerBtn.className = "btn light";
    copyAnswerBtn.type = "button";
    copyAnswerBtn.textContent = "Copy answer";

    actions.insertBefore(askBtn, actions.firstChild);
    actions.insertBefore(copyAnswerBtn, askBtn.nextSibling);

    const answerBox = document.createElement("div");
    answerBox.id = "csvbAiAnswerBox";
    answerBox.className = "csvb-ai-answer-box";
    answerBox.innerHTML = `
      <div class="csvb-ai-answer-title">
        <span>AI Answer</span>
      </div>
      <div id="csvbAiAnswerMeta" class="csvb-ai-answer-meta"></div>
      <div id="csvbAiAnswerText"></div>
    `;

    results.insertAdjacentElement("beforebegin", answerBox);

    askBtn.addEventListener("click", () => askAi());
    copyAnswerBtn.addEventListener("click", () => copyAnswer());

    return true;
  }

  function renderAnswer(answer, metaText) {
    const box = $("csvbAiAnswerBox");
    const meta = $("csvbAiAnswerMeta");
    const text = $("csvbAiAnswerText");

    if (!box || !meta || !text) return;

    box.style.display = "block";
    meta.textContent = metaText || "";
    text.textContent = answer || "";
  }

  async function getAccessToken() {
    const sb = state.sb || window.AUTH.ensureSupabase();
    state.sb = sb;

    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) throw new Error("No active session token. Log in again.");

    return token;
  }

  async function askAi() {
    if (state.busy) return;

    if (offlinePackageModeActive()) {
      setStatus("AI Search is disabled in offline package mode.");
      renderAnswer("", "AI Search disabled while offline.");
      const text = $("csvbAiAnswerText");
      if (text) text.textContent = "Reconnect and reload the Viewer to use AI Search.";
      return;
    }

    try {
      state.busy = true;

      const askBtn = $("csvbAiAskBtn");
      if (askBtn) askBtn.disabled = true;

      const query = normalizeText($("csvbAiSourceQuery")?.value || "");
      if (!query) {
        setStatus("Enter a topic/question first.");
        return;
      }

      const sourcePackApi = window.CSVB_SIRE_VIEWER_AI_SOURCE_PACK;
      if (!sourcePackApi?.buildSourcePack || !sourcePackApi?.getLastPackText) {
        throw new Error("AI source-pack helper is not available. Hard refresh and try again.");
      }

      setStatus("Building source pack before AI answer…");
      await sourcePackApi.buildSourcePack();

      const sourcePack = sourcePackApi.getLastPackText();
      if (!sourcePack || sourcePack.length < 40) {
        throw new Error("No usable source pack was generated.");
      }

      const token = await getAccessToken();
      const url = `${window.AUTH.SUPABASE_URL}/functions/v1/sire-viewer-ai-search`;

      setStatus("Asking AI from grounded SIRE source pack…");
      renderAnswer("Working…", "Request sent to secure backend AI function.");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: window.AUTH.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query,
          source_pack: sourcePack,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `AI request failed (${response.status}).`);
      }

      const answer = safeStr(data.answer).trim();
      if (!answer) throw new Error("AI function returned no answer.");

      state.lastAnswer = answer;
      renderAnswer(
        answer,
        `Model: ${data.model || "—"} • Source pack: ${data.source_pack_chars || 0} characters`
      );
      setStatus("AI answer generated from SIRE Viewer source pack.");
    } catch (error) {
      const msg = safeStr(error?.message || error);
      console.error(error);
      renderAnswer("", "AI Search failed.");
      const text = $("csvbAiAnswerText");
      if (text) text.textContent = msg;
      setStatus("AI Search failed: " + msg);
    } finally {
      state.busy = false;
      const askBtn = $("csvbAiAskBtn");
      if (askBtn) askBtn.disabled = false;
    }
  }

  async function copyAnswer() {
    if (!state.lastAnswer) {
      setStatus("No AI answer to copy yet.");
      return;
    }

    try {
      await navigator.clipboard.writeText(state.lastAnswer);
      setStatus("AI answer copied to clipboard.");
    } catch (_) {
      setStatus("Copy failed. Browser blocked clipboard access.");
    }
  }

  function boot() {
    try {
      if (offlinePackageModeActive()) return;

      injectStyles();
      if (!ensureUi()) {
        setTimeout(boot, 700);
        return;
      }

      state.sb = window.AUTH?.ensureSupabase?.() || null;

      window.CSVB_SIRE_VIEWER_AI_ANSWER = {
        build: BUILD,
        ask: askAi,
        getLastAnswer: () => state.lastAnswer,
      };
    } catch (error) {
      console.warn("SIRE Viewer AI answer connector boot failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1300));
  } else {
    setTimeout(boot, 1300);
  }
})();
