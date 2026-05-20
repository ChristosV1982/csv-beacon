/* public/risq-questions-viewer-ai.js */
/* C.S.V. BEACON – RISQ Questions Viewer AI Search frontend */

(() => {
  "use strict";

  const BUILD = "RISQ-VIEWER-AI-SEARCH-20260520_1";
  window.CSVB_RISQ_VIEWER_AI_SEARCH_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
    open: false,
    busy: false,
    lastPackText: "",
    lastAnswer: "",
    lastResults: []
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

  function truncate(value, max = 460) {
    const text = normalizeText(value);
    if (text.length <= max) return text;
    return text.slice(0, max - 1).trimEnd() + "…";
  }

  function role() {
    return safeStr(state.me?.profile?.role || "");
  }

  function isAllowedRole() {
    const r = role();
    return r === "super_admin" || r === "platform_owner" || r === "company_admin" || r === "company_superintendent";
  }

  function rowNo(row) {
    return safeStr(row?.internal_question_no || row?.printed_question_no || "—");
  }

  function rowSearchText(row) {
    return [
      row?.internal_question_no,
      row?.printed_question_no,
      row?.section_code,
      row?.section_title,
      row?.question_text,
      row?.guide_to_inspection,
      row?.inspection_marker,
      row?.answer_type,
      Array.isArray(row?.answer_options) ? row.answer_options.join(" ") : JSON.stringify(row?.answer_options || []),
      row?.question_origin,
      row?.company_name,
      row?.esms_references,
      row?.esms_forms,
      row?.remarks,
      row?.delete_reason
    ].map(safeStr).join(" ").toLowerCase();
  }

  function scoreRow(row, query) {
    const text = rowSearchText(row);
    const cleanQuery = query.toLowerCase().trim();
    const terms = cleanQuery.split(/\s+/).filter((t) => t.length >= 2);
    let score = 0;

    if (!cleanQuery) return 0;
    if (text.includes(cleanQuery)) score += 25;
    if (rowNo(row).toLowerCase().includes(cleanQuery)) score += 45;

    for (const term of terms) {
      if (text.includes(term)) score += 4;
      if (rowNo(row).toLowerCase().includes(term)) score += 14;
    }

    const question = safeStr(row?.question_text).toLowerCase();
    const guide = safeStr(row?.guide_to_inspection).toLowerCase();

    for (const term of terms) {
      if (question.includes(term)) score += 4;
      if (guide.includes(term)) score += 3;
    }

    return score;
  }

  function getRows() {
    const rows = window.CSVB_RISQ_QUESTIONS_VIEWER?.getRows?.() || [];
    return Array.isArray(rows) ? rows : [];
  }

  function getFilteredRows() {
    const rows = window.CSVB_RISQ_QUESTIONS_VIEWER?.getFiltered?.() || [];
    return Array.isArray(rows) ? rows : [];
  }

  function buildRowSource(row, idx) {
    return [
      `SOURCE ${idx + 1}: [RISQ ${rowNo(row)}]`,
      `Printed RISQ no: ${safeStr(row.printed_question_no || "—")}`,
      `Section: ${safeStr(row.section_code)} — ${safeStr(row.section_title)}`,
      `Origin: ${safeStr(row.question_origin || "standard")}${row.company_name ? " / " + row.company_name : ""}`,
      `Status: ${row.is_removed_question ? "removed" : "active"}`,
      `Marker: ${safeStr(row.inspection_marker || "Blank")}`,
      `Answer type: ${safeStr(row.answer_type || "—")}`,
      `Answer options: ${Array.isArray(row.answer_options) ? row.answer_options.join(" / ") : JSON.stringify(row.answer_options || [])}`,
      "Question:",
      truncate(row.question_text, 900),
      "Guide to Inspection:",
      truncate(row.guide_to_inspection, 1400),
      "eSMS References:",
      truncate(row.esms_references, 500),
      "eSMS Forms:",
      truncate(row.esms_forms, 500),
      "Remarks:",
      truncate(row.remarks, 500),
    ].join("\n");
  }

  function injectStyles() {
    if ($("csvbRisqViewerAiStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbRisqViewerAiStyles";
    style.textContent = `
      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-launcher {
        display: none;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-launcher.visible {
        display: inline-flex;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(3, 27, 63, .52);
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal {
        width: min(1180px, 97vw);
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        background: #fff;
        border: 1px solid #bfd3ef;
        border-radius: 14px;
        box-shadow: 0 24px 70px rgba(3,27,63,.28);
        overflow: hidden;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 13px;
        border-bottom: 1px solid #d6e4f5;
        background: #f8fbff;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal-title {
        color: #062a5e;
        font-weight: 950;
        font-size: 15px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal-meta {
        color: #5e6f86;
        font-size: 12px;
        margin-top: 3px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal-actions,
      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-source-actions {
        display: flex;
        gap: 7px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-modal-body {
        padding: 12px 13px;
        overflow: auto;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-query-row {
        display: grid;
        grid-template-columns: minmax(250px, 1fr) auto auto auto;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-status {
        color: #5e6f86;
        font-size: 12px;
        font-weight: 700;
        margin: 6px 0 8px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-answer {
        border: 1px solid #d6e4f5;
        border-radius: 11px;
        background: #fff;
        margin-bottom: 10px;
        overflow: hidden;
        display: none;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-answer-title {
        color: #062a5e;
        background: #f1f7ff;
        border-bottom: 1px solid #d6e4f5;
        padding: 7px 10px;
        font-size: 13px;
        font-weight: 950;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-answer-meta {
        color: #5e6f86;
        font-size: 12px;
        padding: 7px 10px 0;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-answer-text {
        padding: 8px 10px 10px;
        color: #10233f;
        font-size: 13px;
        line-height: 1.45;
        white-space: pre-wrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-sources {
        border: 1px solid #d6e4f5;
        border-radius: 11px;
        background: #f8fbff;
        padding: 8px;
        max-height: 300px;
        overflow: auto;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-source-item {
        border: 1px solid #d6e4f5;
        border-radius: 9px;
        background: #fff;
        padding: 7px 8px;
        margin-bottom: 7px;
        font-size: 12px;
        line-height: 1.35;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-source-title {
        color: #062a5e;
        font-weight: 950;
        margin-bottom: 3px;
      }

      @media (max-width: 850px) {
        html[data-csvb-page="risq-questions-viewer.html"] .risq-ai-query-row {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureLauncher() {
    if ($("risqAiLauncher")) return true;

    const toolbar = document.querySelector(".top-action-toolbar");
    if (!toolbar) return false;

    const btn = document.createElement("button");
    btn.id = "risqAiLauncher";
    btn.className = "btn risq-ai-launcher";
    btn.type = "button";
    btn.textContent = "AI Search";
    btn.addEventListener("click", openModal);

    toolbar.insertBefore(btn, toolbar.firstChild);
    return true;
  }

  function ensureModal() {
    if ($("risqAiModalBackdrop")) return true;

    const modal = document.createElement("div");
    modal.id = "risqAiModalBackdrop";
    modal.className = "risq-ai-modal-backdrop";
    modal.innerHTML = `
      <div class="risq-ai-modal" role="dialog" aria-modal="true">
        <div class="risq-ai-modal-head">
          <div>
            <div class="risq-ai-modal-title">RISQ Viewer AI Search</div>
            <div class="risq-ai-modal-meta">Grounded search using the active RISQ Viewer question source pack only.</div>
          </div>
          <div class="risq-ai-modal-actions">
            <button id="risqAiCloseBtn" class="btn" type="button">Close</button>
          </div>
        </div>
        <div class="risq-ai-modal-body">
          <div class="risq-ai-query-row">
            <input id="risqAiQuery" type="text" placeholder="Ask topic, e.g. class status / enclosed space / navigation" />
            <button id="risqAiBuildBtn" class="btn2" type="button">Build pack</button>
            <button id="risqAiAskBtn" class="btn" type="button">Ask AI</button>
            <button id="risqAiClearBtn" class="btn2" type="button">Clear</button>
          </div>
          <div class="risq-ai-source-actions">
            <button id="risqAiCopyAnswerBtn" class="btn2" type="button">Copy answer</button>
            <button id="risqAiCopyPackBtn" class="btn2" type="button">Copy source pack</button>
          </div>
          <div id="risqAiStatus" class="risq-ai-status"></div>
          <div id="risqAiAnswer" class="risq-ai-answer">
            <div class="risq-ai-answer-title">AI Answer</div>
            <div id="risqAiAnswerMeta" class="risq-ai-answer-meta"></div>
            <div id="risqAiAnswerText" class="risq-ai-answer-text"></div>
          </div>
          <div id="risqAiSources" class="risq-ai-sources"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    $("risqAiCloseBtn")?.addEventListener("click", closeModal);
    $("risqAiBuildBtn")?.addEventListener("click", () => buildSourcePack());
    $("risqAiAskBtn")?.addEventListener("click", () => askAi());
    $("risqAiClearBtn")?.addEventListener("click", clearAi);
    $("risqAiCopyAnswerBtn")?.addEventListener("click", copyAnswer);
    $("risqAiCopyPackBtn")?.addEventListener("click", copyPack);

    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closeModal();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeModal();
    });

    return true;
  }

  function setStatus(message) {
    const el = $("risqAiStatus");
    if (el) el.textContent = message || "";
  }

  function openModal() {
    ensureModal();
    const el = $("risqAiModalBackdrop");
    if (el) el.style.display = "flex";
  }

  function closeModal() {
    const el = $("risqAiModalBackdrop");
    if (el) el.style.display = "none";
  }

  function clearAi() {
    const q = $("risqAiQuery");
    if (q) q.value = "";
    state.lastPackText = "";
    state.lastAnswer = "";
    state.lastResults = [];
    renderSources([]);
    renderAnswer("", "");
    setStatus("");
  }

  function renderSources(rows) {
    const box = $("risqAiSources");
    if (!box) return;

    if (!rows.length) {
      box.innerHTML = `<div class="risq-ai-source-item">No source pack built yet.</div>`;
      return;
    }

    box.innerHTML = rows.map((row, idx) => `
      <div class="risq-ai-source-item">
        <div class="risq-ai-source-title">${idx + 1}. RISQ ${esc(rowNo(row))} — ${esc(row.section_code || "")}</div>
        <div><b>Question:</b> ${esc(truncate(row.question_text, 260))}</div>
        <div><b>Guide:</b> ${esc(truncate(row.guide_to_inspection, 260))}</div>
      </div>
    `).join("");
  }

  function renderAnswer(answer, meta) {
    const box = $("risqAiAnswer");
    const metaEl = $("risqAiAnswerMeta");
    const textEl = $("risqAiAnswerText");
    if (!box || !metaEl || !textEl) return;

    box.style.display = answer || meta ? "block" : "none";
    metaEl.textContent = meta || "";
    textEl.textContent = answer || "";
  }

  function buildSourcePack() {
    const query = normalizeText($("risqAiQuery")?.value || "");
    if (!query) {
      setStatus("Enter a topic/question first.");
      return "";
    }

    const rows = getRows();
    const candidates = rows
      .map((row) => ({ row, score: scoreRow(row, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.row);

    const fallback = !candidates.length
      ? getFilteredRows().slice(0, 8)
      : candidates;

    state.lastResults = fallback;

    const pack = [
      "C.S.V. BEACON RISQ 3.2 Viewer AI Source Pack",
      `Generated: ${new Date().toISOString()}`,
      `User query: ${query}`,
      `Source count: ${fallback.length}`,
      "Rules: Answer only from these RISQ Viewer sources. Do not use outside knowledge. Cite RISQ question numbers.",
      "",
      ...fallback.map(buildRowSource)
    ].join("\n\n---\n\n");

    state.lastPackText = pack;
    renderSources(fallback);
    setStatus(`Source pack built from ${fallback.length} RISQ question(s).`);
    return pack;
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

    try {
      state.busy = true;
      const askBtn = $("risqAiAskBtn");
      if (askBtn) askBtn.disabled = true;

      const query = normalizeText($("risqAiQuery")?.value || "");
      if (!query) {
        setStatus("Enter a topic/question first.");
        return;
      }

      setStatus("Building RISQ source pack before AI answer…");
      const pack = buildSourcePack();
      if (!pack || pack.length < 40) throw new Error("No usable RISQ source pack was generated.");

      const token = await getAccessToken();
      const url = `${window.AUTH.SUPABASE_URL}/functions/v1/sire-viewer-ai-search`;

      setStatus("Asking AI from grounded RISQ source pack…");
      renderAnswer("Working…", "Request sent to secure backend AI function.");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: window.AUTH.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          viewer_type: "RISQ",
          query,
          source_pack: pack,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || `AI request failed (${response.status}).`);
      }

      const answer = safeStr(data.answer).trim();
      if (!answer) throw new Error("AI function returned no answer.");

      state.lastAnswer = answer;
      renderAnswer(answer, `Viewer: ${data.viewer_type || "RISQ"} • Model: ${data.model || "—"} • Source pack: ${data.source_pack_chars || 0} characters`);
      setStatus("AI answer generated from RISQ Viewer source pack.");
    } catch (error) {
      const msg = safeStr(error?.message || error);
      console.error(error);
      state.lastAnswer = "";
      renderAnswer(msg, "AI Search failed.");
      setStatus("AI Search failed: " + msg);
    } finally {
      state.busy = false;
      const askBtn = $("risqAiAskBtn");
      if (askBtn) askBtn.disabled = false;
    }
  }

  async function copyAnswer() {
    if (!state.lastAnswer) return setStatus("No AI answer to copy yet.");
    try {
      await navigator.clipboard.writeText(state.lastAnswer);
      setStatus("AI answer copied to clipboard.");
    } catch (_) {
      setStatus("Copy failed. Browser blocked clipboard access.");
    }
  }

  async function copyPack() {
    if (!state.lastPackText) return setStatus("No source pack to copy yet.");
    try {
      await navigator.clipboard.writeText(state.lastPackText);
      setStatus("RISQ source pack copied to clipboard.");
    } catch (_) {
      setStatus("Copy failed. Browser blocked clipboard access.");
    }
  }

  async function loadMe() {
    if (!window.AUTH?.getSessionUserProfile) return null;
    state.me = await window.AUTH.getSessionUserProfile();
    state.sb = window.AUTH.ensureSupabase();
    return state.me;
  }

  async function boot() {
    injectStyles();
    ensureLauncher();
    ensureModal();
    renderSources([]);

    await loadMe().catch(() => null);

    const launcher = $("risqAiLauncher");
    if (launcher) launcher.classList.toggle("visible", isAllowedRole());

    window.CSVB_RISQ_VIEWER_AI_SEARCH = {
      build: BUILD,
      open: openModal,
      buildSourcePack,
      ask: askAi,
      getLastPackText: () => state.lastPackText,
      getLastAnswer: () => state.lastAnswer,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(() => boot().catch(console.error), 1000));
  } else {
    setTimeout(() => boot().catch(console.error), 1000);
  }
})();
