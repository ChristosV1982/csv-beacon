// public/q-sire-questions-viewer-ai-source-pack.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer AI Search Source Pack
// Phase E0: source-grounded AI-preparation panel. No external AI call yet.
// Hidden for vessel and inspector users.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-AI-SOURCE-PACK-20260519_2";
  window.CSVB_SIRE_VIEWER_AI_SOURCE_PACK_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
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

  function isAllowedRole() {
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
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-inline {
        display: none;
        margin-top: 8px;
        padding: 8px;
        border: 1px solid #D6E4F5;
        background: #F8FBFF;
        border-radius: 10px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-inline-title {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        margin-bottom:6px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-inline-title .lbl {
        margin:0;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-controls {
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:6px;
        align-items:center;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-actions {
        display:flex;
        gap:6px;
        align-items:center;
        flex-wrap:wrap;
        margin-top:6px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-results {
        display:none;
        margin-top:8px;
        max-height: 340px;
        overflow:auto;
        border-top: 1px solid #D6E4F5;
        padding-top: 8px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-result {
        border:1px solid #D6E4F5;
        background:#fff;
        border-radius:9px;
        padding:7px 8px;
        margin-bottom:7px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-result-title {
        color:#062A5E;
        font-weight:850;
        font-size:12px;
        line-height:1.3;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-result-meta {
        color:#5E6F86;
        font-size:11px;
        margin-top:3px;
        line-height:1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-section {
        margin-top:6px;
        color:#10233F;
        font-size:12px;
        line-height:1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-muted {
        color:#5E6F86;
        font-size:11px;
        line-height:1.35;
      }

      @media (max-width:900px) {
        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-ai-source-controls {
          grid-template-columns:1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function insertionAnchor() {
    const search = $("searchInput");
    return search || null;
  }

  function ensurePanel() {
    if ($("csvbAiSourceInline")) return;

    const anchor = insertionAnchor();
    if (!anchor) return;

    const panel = document.createElement("div");
    panel.id = "csvbAiSourceInline";
    panel.className = "csvb-ai-source-inline";
    panel.innerHTML = `
      <div class="csvb-ai-source-inline-title">
        <label class="lbl" for="csvbAiSourceQuery">AI Search</label>
        <span class="csvb-ai-source-muted">Source pack</span>
      </div>
      <div class="csvb-ai-source-controls">
        <input id="csvbAiSourceQuery" class="inp" type="text" placeholder="Ask topic, e.g. enclosed space / ECDIS / mooring brake" />
        <button id="csvbAiSourceRunBtn" class="btn" type="button">Build</button>
      </div>
      <div class="csvb-ai-source-actions">
        <button id="csvbAiSourceCopyBtn" class="btn light" type="button">Copy pack</button>
        <button id="csvbAiSourceClearBtn" class="btn light" type="button">Clear</button>
      </div>
      <div id="csvbAiSourceStatus" class="csvb-ai-source-muted" style="margin-top:6px;"></div>
      <div id="csvbAiSourceResults" class="csvb-ai-source-results"></div>
    `;

    anchor.insertAdjacentElement("afterend", panel);

    $("csvbAiSourceRunBtn")?.addEventListener("click", () => buildSourcePack());
    $("csvbAiSourceCopyBtn")?.addEventListener("click", () => copyPack());
    $("csvbAiSourceClearBtn")?.addEventListener("click", () => clearPack());
    $("csvbAiSourceQuery")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") buildSourcePack();
    });
  }

  function renderShell() {
    ensurePanel();
    const panel = $("csvbAiSourceInline");
    if (!panel) return;
    panel.style.display = isAllowedRole() ? "block" : "none";
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
        <div class="csvb-ai-source-section"><b>Question:</b> ${esc(truncate(question, 320))}</div>
        ${guidance ? `<div class="csvb-ai-source-section"><b>Guidance:</b> ${esc(truncate(guidance, 320))}</div>` : ""}
        ${actions ? `<div class="csvb-ai-source-section"><b>Inspector actions:</b> ${esc(truncate(actions, 220))}</div>` : ""}
        ${item.ee.length ? `<div class="csvb-ai-source-section"><b>Expected Evidence:</b><br>${item.ee.slice(0, 2).map((x) => `${x.seq}. ${esc(truncate(x.text, 160))}`).join("<br>")}</div>` : ""}
        ${item.pgno.length ? `<div class="csvb-ai-source-section"><b>PGNOs:</b><br>${item.pgno.slice(0, 2).map((x, i) => `${esc(x.code || `${qNumber}.${String(i + 1).padStart(2, "0")}`)} — ${esc(truncate(x.text, 160))}`).join("<br>")}</div>` : ""}
        ${pubs.length ? `<div class="csvb-ai-source-section"><b>Publications:</b><br>${pubs.slice(0, 2).map((x) => esc(truncate(x.display_name || x.raw_publication_text || JSON.stringify(x), 160))).join("<br>")}</div>` : ""}
        ${gids.length ? `<div class="csvb-ai-source-section"><b>Industry Guidance:</b><br>${gids.slice(0, 2).map((x) => esc(truncate([x.guidance_title, x.guidance_section, x.guidance_content].filter(Boolean).join(" — "), 180))).join("<br>")}</div>` : ""}
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

      if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) return;
      state.sb = window.AUTH.ensureSupabase();
      state.me = await window.AUTH.getSessionUserProfile();

      window.CSVB_SIRE_VIEWER_AI_SOURCE_PACK = {
        build: BUILD,
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
