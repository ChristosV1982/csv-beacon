// public/q-sire-questions-viewer-ai-source-pack.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer AI Search Source Pack
// Builds a source-grounded pack from the Viewer. The actual AI call is handled by q-sire-questions-viewer-ai-answer.js.
// Hidden for vessel and inspector users.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-AI-SOURCE-PACK-20260527_OFFLINE_DISABLED_1";
  window.CSVB_SIRE_VIEWER_AI_SOURCE_PACK_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
    open: false,
    lastPackText: "",
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

  function role() {
    return safeStr(state.me?.profile?.role || "");
  }

  function offlinePackageModeActive() {
    return window.CSVB_SIRE_VIEWER_OFFLINE_ACTIVE === true ||
      document.documentElement.getAttribute("data-csvb-sire-offline") === "1";
  }

  function isAllowedRole() {
    if (offlinePackageModeActive()) return false;

    const r = role();
    return r === "super_admin" || r === "platform_owner" || r === "company_admin" || r === "company_superintendent";
  }

  function pget(payload, keys) {
    if (!payload || typeof payload !== "object") return "";
    for (const key of keys) {
      const value = payload[key];
      if (value === null || value === undefined) continue;
      const out = safeStr(value);
      if (out.trim()) return out;
    }
    return "";
  }

  function normalizeText(value) {
    return safeStr(value).replace(/\s+/g, " ").trim();
  }

  function truncate(value, max = 400) {
    const text = normalizeText(value);
    if (text.length <= max) return text;
    return text.slice(0, max - 1).trimEnd() + "…";
  }

  function qno(row) {
    const sourceType = safeStr(row?.source_type || "SIRE").trim();
    const base = normalizeNumber(sourceType, row?.number_base);
    const suffix = safeStr(row?.number_suffix).trim();
    if (base) return suffix ? `${base}-${suffix}` : base;
    return safeStr(row?.number_full || "—").replace(/-$/, "");
  }

  function normalizeNumber(sourceType, numberBase) {
    const raw = safeStr(numberBase).trim();
    const m = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return raw;
    const p2 = (n) => String(Number(n)).padStart(2, "0");
    const p3 = (n) => String(Number(n)).padStart(3, "0");
    return sourceType === "SIRE"
      ? `${p2(m[1])}.${p2(m[2])}.${p2(m[3])}`
      : `${p2(m[1])}.${p2(m[2])}.${p3(m[3])}`;
  }

  function responseTypes(payload) {
    const out = [];
    const nonNone = (v) => {
      const s = safeStr(v).trim();
      return s && s.toLowerCase() !== "none";
    };
    if (nonNone(pget(payload, ["Human Response Type", "Human_Response_Type", "human_response_type"]))) out.push("Human");
    if (nonNone(pget(payload, ["Hardware Response Type", "Hardware_Response_Type", "hardware_response_type"]))) out.push("Hardware");
    if (nonNone(pget(payload, ["Process Response Type", "Process_Response_Type", "process_response_type"]))) out.push("Process");
    if (safeStr(pget(payload, ["Photo Response", "Photo_Response", "photo_response"])).trim().toUpperCase() === "Y") out.push("Photo");
    return out.join(", ");
  }

  function rowSearchText(row) {
    const p = row?.payload || {};
    return [
      qno(row),
      row?.version,
      Array.isArray(row?.tags) ? row.tags.join(" ") : row?.tags,
      pget(p, ["short_text", "Short Text", "shortText"]),
      pget(p, ["question", "Question"]),
      pget(p, ["inspection_guidance", "Inspection Guidance", "guidance"]),
      pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "actions"]),
      pget(p, ["Question Type", "question_type", "questionType"]),
      pget(p, ["Vessel Type", "vessel_type", "vesselType"]),
      pget(p, ["Company Rank Allocation", "company_rank_allocation"]),
      pget(p, ["TMSA3 Reference", "TMSA3", "tmsa3_reference"]),
      pget(p, ["TMSA4 Reference", "TMSA4", "tmsa4_reference"]),
      responseTypes(p)
    ].map(safeStr).join(" ").toLowerCase();
  }

  function scoreRow(row, query) {
    const text = rowSearchText(row);
    const cleanQuery = query.toLowerCase().trim();
    const terms = cleanQuery.split(/\s+/).filter((t) => t.length >= 2);
    let score = 0;

    if (!cleanQuery) return 0;
    if (text.includes(cleanQuery)) score += 25;
    if (qno(row).toLowerCase().includes(cleanQuery)) score += 40;

    for (const term of terms) {
      if (text.includes(term)) score += 4;
      if (qno(row).toLowerCase().includes(term)) score += 12;
    }

    const p = row?.payload || {};
    const question = pget(p, ["question", "Question"]).toLowerCase();
    const guidance = pget(p, ["inspection_guidance", "Inspection Guidance", "guidance"]).toLowerCase();

    for (const term of terms) {
      if (question.includes(term)) score += 3;
      if (guidance.includes(term)) score += 2;
    }

    return score;
  }

  function getViewerRows() {
    const rows = window.CSVB_SIRE_QUESTIONS_VIEWER?.getRows?.() || [];
    return Array.isArray(rows) ? rows : [];
  }

  async function loadPgno(questionId) {
    if (!questionId) return [];
    const { data, error } = await state.sb.rpc("csvb_pgno_master_for_question_for_me", {
      p_question_id: questionId
    });
    if (error) return [];
    return (data || []).map((x, i) => ({
      seq: i + 1,
      code: safeStr(x.pgno_code || ""),
      text: safeStr(x.pgno_text || ""),
      remarks: safeStr(x.remarks || "")
    })).filter((x) => x.text.trim());
  }

  async function loadEe(questionId) {
    if (!questionId) return [];
    const { data, error } = await state.sb.rpc("csvb_expected_evidence_for_question_for_me", {
      p_question_id: questionId
    });
    if (error) return [];
    return (data || []).map((x, i) => ({
      seq: i + 1,
      text: safeStr(x.evidence_text || ""),
      esms_references: safeStr(x.esms_references || ""),
      esms_forms: safeStr(x.esms_forms || ""),
      remarks: safeStr(x.remarks || "")
    })).filter((x) => x.text.trim());
  }

  async function loadRefs(questionId) {
    if (!questionId) return { publications: [], guidance: [] };
    const { data, error } = await state.sb.rpc("csvb_sire_question_references_for_question", {
      p_question_id: questionId
    });
    if (error) return { publications: [], guidance: [] };

    const row = Array.isArray(data) ? (data[0] || {}) : (data || {});

    const normalizeArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    };

    return {
      publications: normalizeArray(row.applicable_publications),
      guidance: normalizeArray(row.industry_guidance)
    };
  }

  function injectStyles() {
    if ($("csvbSireViewerAiSourcePackStyles")) return;
    const style = document.createElement("style");
    style.id = "csvbSireViewerAiSourcePackStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] #filterRibbon {
        position: relative;
        padding-right: 150px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-launcher {
        position: absolute;
        top: 50%;
        right: 14px;
        transform: translateY(-50%);
        display: none;
        z-index: 6;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-launcher .btn {
        min-width: 112px;
        padding: 9px 14px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(3, 27, 63, .50);
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal {
        width: min(1180px, 96vw);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        background: #FFFFFF;
        border: 1px solid #BFD3EF;
        border-radius: 14px;
        box-shadow: 0 24px 70px rgba(3,27,63,.28);
        overflow: hidden;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid #D6E4F5;
        background: #F8FBFF;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal-title {
        color: #062A5E;
        font-weight: 900;
        font-size: 15px;
        line-height: 1.25;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal-note {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 3px;
        line-height: 1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-modal-body {
        padding: 12px 14px;
        overflow: auto;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-controls {
        display: grid;
        grid-template-columns: minmax(260px, 1fr) auto;
        gap: 8px;
        align-items: center;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-actions {
        display: flex;
        gap: 7px;
        align-items: center;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-results {
        display: none;
        margin-top: 10px;
        max-height: 48vh;
        overflow: auto;
        border-top: 1px solid #D6E4F5;
        padding-top: 9px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"][data-csvb-sire-offline="1"] #csvbAiSourceLauncher,
      html[data-csvb-page="q-sire-questions-viewer.html"][data-csvb-sire-offline="1"] #csvbAiSourceModalBackdrop,
      html[data-csvb-page="q-sire-questions-viewer.html"][data-csvb-sire-offline="1"] .csvb-ai-source-launcher,
      html[data-csvb-page="q-sire-questions-viewer.html"][data-csvb-sire-offline="1"] .csvb-ai-source-modal-backdrop {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-result {
        border: 1px solid #D6E4F5;
        background: #fff;
        border-radius: 9px;
        padding: 8px 9px;
        margin-bottom: 8px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-result-title {
        color: #062A5E;
        font-weight: 850;
        font-size: 13px;
        line-height: 1.3;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-result-meta {
        color: #5E6F86;
        font-size: 11px;
        margin-top: 3px;
        line-height: 1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-section {
        margin-top: 6px;
        color: #10233F;
        font-size: 12px;
        line-height: 1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-muted {
        color: #5E6F86;
        font-size: 12px;
        line-height: 1.35;
      }

      @media (max-width: 900px) {
        html[data-csvb-page="q-sire-questions-viewer.html"] #filterRibbon {
          padding-right: 12px;
          padding-bottom: 54px;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-launcher {
          top: auto;
          right: 12px;
          bottom: 10px;
          transform: none;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-controls {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($("csvbAiSourceModalBackdrop")) return;

    const filterRibbon = $("filterRibbon") || document.body;

    const launcher = document.createElement("div");
    launcher.id = "csvbAiSourceLauncher";
    launcher.className = "csvb-ai-source-launcher";
    launcher.innerHTML = `<button id="csvbAiSourceOpenBtn" class="btn" type="button">AI Search</button>`;
    filterRibbon.appendChild(launcher);

    const modal = document.createElement("div");
    modal.id = "csvbAiSourceModalBackdrop";
    modal.className = "csvb-ai-source-modal-backdrop";
    modal.innerHTML = `
      <div class="csvb-ai-source-modal" role="dialog" aria-modal="true" aria-labelledby="csvbAiSourceModalTitle">
        <div class="csvb-ai-source-modal-head">
          <div>
            <div id="csvbAiSourceModalTitle" class="csvb-ai-source-modal-title">SIRE 2.0 AI Search</div>
            <div class="csvb-ai-source-modal-note">Ask against the active SIRE 2.0 Viewer database. The system first builds a source pack from matching questions, Expected Evidence, PGNOs, publications and industry guidance.</div>
          </div>
          <button id="csvbAiSourceCloseBtn" class="btn" type="button">Close</button>
        </div>
        <div class="csvb-ai-source-modal-body">
          <div class="csvb-ai-source-controls">
            <input id="csvbAiSourceQuery" class="inp" type="text" placeholder="Ask topic, e.g. gas instruments / enclosed space / ECDIS safety depth" />
            <button id="csvbAiSourceRunBtn" class="btn" type="button">Build source pack</button>
          </div>
          <div class="csvb-ai-source-actions">
            <button id="csvbAiSourceCopyBtn" class="btn light" type="button">Copy source pack</button>
            <button id="csvbAiSourceClearBtn" class="btn light" type="button">Clear</button>
          </div>
          <div id="csvbAiSourceStatus" class="csvb-ai-source-muted" style="margin-top:8px;"></div>
          <div id="csvbAiSourceResults" class="csvb-ai-source-results"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    $("csvbAiSourceOpenBtn")?.addEventListener("click", openPanel);
    $("csvbAiSourceCloseBtn")?.addEventListener("click", closePanel);
    $("csvbAiSourceRunBtn")?.addEventListener("click", () => buildSourcePack());
    $("csvbAiSourceCopyBtn")?.addEventListener("click", () => copyPack());
    $("csvbAiSourceClearBtn")?.addEventListener("click", () => clearPack());
    $("csvbAiSourceQuery")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") buildSourcePack();
    });

    modal.addEventListener("click", (ev) => {
      if (ev.target === modal) closePanel();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closePanel();
    });
  }

  function openPanel() {
    state.open = true;
    renderShell();
    setTimeout(() => $("csvbAiSourceQuery")?.focus(), 60);
  }

  function closePanel() {
    state.open = false;
    renderShell();
  }

  function renderShell() {
    ensurePanel();
    const launcher = $("csvbAiSourceLauncher");
    const modal = $("csvbAiSourceModalBackdrop");

    if (!launcher || !modal) return;

    if (offlinePackageModeActive() || !isAllowedRole()) {
      state.open = false;
      launcher.style.display = "none";
      launcher.setAttribute("aria-hidden", "true");
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      return;
    }

    launcher.removeAttribute("aria-hidden");
    modal.removeAttribute("aria-hidden");
    launcher.style.display = "block";
    modal.style.display = state.open ? "flex" : "none";
  }

  function setStatus(message) {
    const el = $("csvbAiSourceStatus");
    if (el) el.textContent = message || "";
  }

  function basePackHeader(query, results) {
    return [
      "C.S.V. BEACON — SIRE 2.0 Questions Viewer Source Pack",
      `Query: ${query}`,
      `Generated: ${new Date().toISOString()}`,
      `Source count: ${results.length}`,
      "Note: This is source-grounded material for AI-assisted review. It is not a final AI answer.",
      ""
    ].join("\n");
  }

  function renderResultHtml(item) {
    const row = item.row;
    const p = row.payload || {};
    const qNumber = qno(row);
    const shortText = pget(p, ["short_text", "Short Text", "shortText"]);
    const question = pget(p, ["question", "Question"]);
    const guidance = pget(p, ["inspection_guidance", "Inspection Guidance", "guidance"]);
    const actions = pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "actions"]);
    const pubs = item.refs.publications || [];
    const gids = item.refs.guidance || [];

    return `
      <div class="csvb-ai-source-result">
        <div class="csvb-ai-source-result-title">${esc(qNumber)} — ${esc(shortText || question || "SIRE question")}</div>
        <div class="csvb-ai-source-result-meta">Score: ${item.score} • Type: ${esc(pget(p, ["Question Type", "question_type", "questionType"]))} • Response: ${esc(responseTypes(p))}</div>
        <div class="csvb-ai-source-section"><b>Question:</b> ${esc(truncate(question, 360))}</div>
        ${guidance ? `<div class="csvb-ai-source-section"><b>Guidance:</b> ${esc(truncate(guidance, 360))}</div>` : ""}
        ${actions ? `<div class="csvb-ai-source-section"><b>Inspector actions:</b> ${esc(truncate(actions, 260))}</div>` : ""}
        ${item.ee.length ? `<div class="csvb-ai-source-section"><b>Expected Evidence:</b><br>${item.ee.slice(0, 3).map((x) => `${x.seq}. ${esc(truncate(x.text, 180))}`).join("<br>")}</div>` : ""}
        ${item.pgno.length ? `<div class="csvb-ai-source-section"><b>PGNOs:</b><br>${item.pgno.slice(0, 3).map((x, i) => `${esc(x.code || `${qNumber}.${String(i + 1).padStart(2, "0")}`)} — ${esc(truncate(x.text, 180))}`).join("<br>")}</div>` : ""}
        ${pubs.length ? `<div class="csvb-ai-source-section"><b>Publications:</b><br>${pubs.slice(0, 3).map((x) => esc(truncate(x.display_name || x.raw_publication_text || JSON.stringify(x), 180))).join("<br>")}</div>` : ""}
        ${gids.length ? `<div class="csvb-ai-source-section"><b>Industry Guidance:</b><br>${gids.slice(0, 3).map((x) => esc(truncate([x.guidance_title, x.guidance_section, x.guidance_content].filter(Boolean).join(" — "), 220))).join("<br>")}</div>` : ""}
      </div>
    `;
  }

  function resultToPackText(item, index) {
    const row = item.row;
    const p = row.payload || {};
    const qNumber = qno(row);
    const shortText = pget(p, ["short_text", "Short Text", "shortText"]);
    const question = pget(p, ["question", "Question"]);
    const guidance = pget(p, ["inspection_guidance", "Inspection Guidance", "guidance"]);
    const actions = pget(p, ["suggested_inspector_actions", "Suggested Inspector Actions", "actions"]);
    const pubs = item.refs.publications || [];
    const gids = item.refs.guidance || [];

    const lines = [];
    lines.push(`SOURCE ${index + 1}: ${qNumber} — ${shortText || "SIRE question"}`);
    lines.push(`Score: ${item.score}`);
    lines.push(`Question Type: ${pget(p, ["Question Type", "question_type", "questionType"])}`);
    lines.push(`Vessel Type: ${pget(p, ["Vessel Type", "vessel_type", "vesselType"])}`);
    lines.push(`Response Type: ${responseTypes(p)}`);
    lines.push(`Company Rank Allocation: ${pget(p, ["Company Rank Allocation", "company_rank_allocation"])}`);
    lines.push(`Question: ${question}`);
    if (guidance) lines.push(`Guidance: ${guidance}`);
    if (actions) lines.push(`Suggested Inspector Actions: ${actions}`);

    if (item.ee.length) {
      lines.push("Expected Evidence:");
      item.ee.forEach((x) => lines.push(`- ${x.seq}. ${x.text}${x.remarks ? ` [Remarks: ${x.remarks}]` : ""}`));
    }

    if (item.pgno.length) {
      lines.push("PGNOs:");
      item.pgno.forEach((x, i) => lines.push(`- ${x.code || `${qNumber}.${String(i + 1).padStart(2, "0")}`}: ${x.text}${x.remarks ? ` [Remarks: ${x.remarks}]` : ""}`));
    }

    if (pubs.length) {
      lines.push("Applicable Publications:");
      pubs.forEach((x) => lines.push(`- ${x.display_name || x.raw_publication_text || JSON.stringify(x)}`));
    }

    if (gids.length) {
      lines.push("Industry Guidance:");
      gids.forEach((x) => lines.push(`- ${[x.guidance_title, x.guidance_section, x.guidance_subsection, x.guidance_content].filter(Boolean).join(" — ") || JSON.stringify(x)}`));
    }

    return lines.join("\n");
  }

  async function buildSourcePack() {
    if (offlinePackageModeActive()) {
      setStatus("AI Search is disabled in offline package mode.");
      clearPack();
      return;
    }

    try {
      const resultsHost = $("csvbAiSourceResults");
      const query = normalizeText($("csvbAiSourceQuery")?.value || "");
      if (!query) {
        setStatus("Enter a topic or question first.");
        return;
      }

      const rows = getViewerRows();
      if (!rows.length) {
        setStatus("The SIRE Viewer question list is not loaded yet. Reload the Viewer and try again.");
        return;
      }

      setStatus("Building source pack…");
      if (resultsHost) {
        resultsHost.style.display = "block";
        resultsHost.innerHTML = `<div class="csvb-ai-source-muted">Loading source matches…</div>`;
      }

      const scored = rows
        .map((row) => ({ row, score: scoreRow(row, query) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      if (!scored.length) {
        state.lastResults = [];
        state.lastPackText = basePackHeader(query, []) + "No matching SIRE 2.0 Viewer sources found.";
        if (resultsHost) resultsHost.innerHTML = `<div class="csvb-ai-source-muted">No matching SIRE 2.0 Viewer sources found.</div>`;
        setStatus("No sources found.");
        return;
      }

      const enriched = [];

      for (const item of scored) {
        const questionId = item.row.id;
        const [ee, pgno, refs] = await Promise.all([
          loadEe(questionId),
          loadPgno(questionId),
          loadRefs(questionId)
        ]);
        enriched.push({ ...item, ee, pgno, refs });
      }

      state.lastResults = enriched;
      state.lastPackText = [
        basePackHeader(query, enriched),
        ...enriched.map(resultToPackText)
      ].join("\n---\n");

      if (resultsHost) {
        resultsHost.style.display = "block";
        resultsHost.innerHTML = enriched.map(renderResultHtml).join("");
      }
      setStatus(`Source pack built from ${enriched.length} source question(s).`);
    } catch (error) {
      console.error(error);
      setStatus("Source pack failed: " + safeStr(error?.message || error));
    }
  }

  async function copyPack() {
    if (!state.lastPackText) {
      setStatus("Build a source pack first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(state.lastPackText);
      setStatus("Source pack copied to clipboard.");
    } catch (error) {
      setStatus("Copy failed. Browser blocked clipboard access.");
    }
  }

  function clearPack() {
    state.lastPackText = "";
    state.lastResults = [];
    const q = $("csvbAiSourceQuery");
    const r = $("csvbAiSourceResults");
    if (q) q.value = "";
    if (r) {
      r.innerHTML = "";
      r.style.display = "none";
    }
    setStatus("");
  }

  async function boot() {
    try {
      injectStyles();
      ensurePanel();

      if (offlinePackageModeActive()) {
        renderShell();
        return;
      }

      if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) return;
      state.sb = window.AUTH.ensureSupabase();
      state.me = await window.AUTH.getSessionUserProfile();

      window.CSVB_SIRE_VIEWER_AI_SOURCE_PACK = {
        build: BUILD,
        open: openPanel,
        close: closePanel,
        buildSourcePack,
        clear: clearPack,
        getLastPackText: () => state.lastPackText,
        getLastResults: () => state.lastResults.slice()
      };

      renderShell();
    } catch (error) {
      console.warn("SIRE Viewer AI source pack boot failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1000));
  } else {
    setTimeout(boot, 1000);
  }
})();
