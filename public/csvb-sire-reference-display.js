// public/csvb-sire-reference-display.js
// C.S.V. BEACON — SIRE Questions Editor Reference Display + View Layout Tuning
// Read-only display for Applicable Publications and Industry Guidance.
// This file performs UI-only work. It does not write to Supabase.

(() => {
  "use strict";

  const BUILD = "SIRE-REF-DISPLAY-20260514_2";
  window.CSVB_SIRE_REFERENCE_DISPLAY_BUILD = BUILD;

  const state = {
    lastQuestionNumber: "",
    lastQuestionId: "",
    lastLayoutQuestionNumber: "",
    loading: false,
    scheduled: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeStr(v) {
    return v === null || v === undefined ? "" : String(v);
  }

  function esc(v) {
    return safeStr(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeArray(v) {
    if (Array.isArray(v)) return v;

    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }

  function injectStyles() {
    if ($("csvbSireReferenceDisplayStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireReferenceDisplayStyles";
    style.textContent = `
      html[data-csvb-page="q-questions-editor.html"] #viewPanel {
        overflow: visible;
      }

      html[data-csvb-page="q-questions-editor.html"] #viewPanel details.coll {
        margin: 6px 0;
        border: 1px solid var(--line, #D6E4F5);
        border-radius: 12px;
        background: #fff;
        padding: 0;
      }

      html[data-csvb-page="q-questions-editor.html"] #viewPanel details.coll > summary {
        min-height: 34px;
        padding: 7px 10px;
        border-radius: 12px;
        color: #062A5E;
        background: #F7FAFE;
        border-bottom: 1px solid transparent;
        font-weight: 650;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      html[data-csvb-page="q-questions-editor.html"] #viewPanel details.coll[open] > summary {
        border-bottom-color: #D6E4F5;
        border-radius: 12px 12px 0 0;
      }

      html[data-csvb-page="q-questions-editor.html"] #viewPanel .collTitle {
        font-weight: 650;
        color: #062A5E;
      }

      html[data-csvb-page="q-questions-editor.html"] #viewPanel .collBody {
        padding: 8px 10px 10px;
      }

      .csvb-sire-ref-display {
        margin-top: 8px;
      }

      .csvb-sire-ref-status {
        margin: 6px 0 8px;
        color: #5E6F86;
        font-size: 12px;
        font-weight: 600;
      }

      .csvb-sire-ref-block {
        display: grid;
        gap: 7px;
      }

      .csvb-sire-ref-item {
        border: 1px solid var(--line, #D6E4F5);
        border-radius: 10px;
        background: #fff;
        padding: 8px 10px;
      }

      .csvb-sire-ref-title {
        color: #062A5E;
        font-weight: 650;
        line-height: 1.28;
      }

      .csvb-sire-ref-meta {
        color: #5E6F86;
        font-size: 12px;
        font-weight: 600;
        margin-top: 4px;
      }

      .csvb-sire-ref-content {
        color: #000;
        margin-top: 7px;
        white-space: pre-wrap;
        line-height: 1.38;
        font-size: 13px;
        font-weight: 400;
      }

      .csvb-sire-ref-empty {
        border: 1px dashed #C8DAEF;
        border-radius: 10px;
        background: #F7FAFE;
        color: #5E6F86;
        padding: 8px 10px;
        font-weight: 600;
      }

      .csvb-sire-ref-count {
        margin-left: auto;
        color: #5E6F86;
        font-size: 12px;
        font-weight: 650;
      }

      .csvb-sire-ref-readonly {
        display: none;
      }

      html[data-csvb-page="q-questions-editor.html"] #vCollAttrs {
        margin-top: 8px;
        margin-bottom: 8px;
      }

      html[data-csvb-page="q-questions-editor.html"] #vCollAttrs > summary {
        background: #FFFDF6;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureContainer() {
    const viewPanel = $("viewPanel");
    if (!viewPanel) return null;

    let wrap = $("csvbSireReferenceDisplay");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "csvbSireReferenceDisplay";
    wrap.className = "csvb-sire-ref-display";

    wrap.innerHTML = `
      <div id="csvbSireReferenceStatus" class="csvb-sire-ref-status">
        SIRE reference display loading…
      </div>

      <details class="coll" id="csvbSirePublicationsColl" open>
        <summary>
          <span class="collTitle">Applicable Publications</span>
          <span class="csvb-sire-ref-count" id="csvbSirePublicationsCount">—</span>
          <span class="csvb-sire-ref-readonly">read-only</span>
        </summary>
        <div class="collBody">
          <div id="csvbSirePublicationsBody" class="csvb-sire-ref-block"></div>
        </div>
      </details>

      <details class="coll" id="csvbSireIndustryGuidanceColl" open>
        <summary>
          <span class="collTitle">Industry Guidance</span>
          <span class="csvb-sire-ref-count" id="csvbSireIndustryGuidanceCount">—</span>
          <span class="csvb-sire-ref-readonly">read-only</span>
        </summary>
        <div class="collBody">
          <div id="csvbSireIndustryGuidanceBody" class="csvb-sire-ref-block"></div>
        </div>
      </details>
    `;

    const pgno = $("vCollPgno");
    if (pgno && pgno.parentElement) {
      pgno.insertAdjacentElement("afterend", wrap);
    } else {
      viewPanel.appendChild(wrap);
    }

    return wrap;
  }

  function setStatus(msg) {
    const el = $("csvbSireReferenceStatus");
    if (el) el.textContent = msg || "";
  }

  function getCurrentQuestionNumber() {
    const candidates = [];

    const viewNo = $("vhdrNumber");
    const editNo = $("hdrNumber");
    const activeListNo = document.querySelector(".qitem.active .qno");

    if (viewNo) candidates.push(viewNo.textContent || "");
    if (editNo) candidates.push(editNo.textContent || "");
    if (activeListNo) candidates.push(activeListNo.textContent || "");

    for (const raw of candidates) {
      const s = safeStr(raw).trim();
      const m = s.match(/(?:^|\b|Q\s*)(\d{1,2})\.(\d{1,2})\.(\d{1,3})(?:\b|$)/i);
      if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    }

    return "";
  }

  function moveQuestionAttributesNearTop() {
    const viewPanel = $("viewPanel");
    const attrs = $("vCollAttrs");
    if (!viewPanel || !attrs) return;

    const firstQuestionSection = Array.from(viewPanel.querySelectorAll(":scope > .section"))
      .find((section) => section.textContent && section.textContent.includes("Question"));

    if (firstQuestionSection && attrs.previousElementSibling !== firstQuestionSection.previousElementSibling) {
      firstQuestionSection.insertAdjacentElement("beforebegin", attrs);
    }
  }

  function applyDefaultOpenState(questionNumber) {
    if (!questionNumber) return;

    moveQuestionAttributesNearTop();

    if (state.lastLayoutQuestionNumber === questionNumber) return;
    state.lastLayoutQuestionNumber = questionNumber;

    const viewPanel = $("viewPanel");
    if (!viewPanel) return;

    const attrs = $("vCollAttrs");

    viewPanel.querySelectorAll("details.coll").forEach((details) => {
      if (details === attrs) {
        details.open = false;
      } else {
        details.open = true;
      }
    });

    const pubs = $("csvbSirePublicationsColl");
    const guid = $("csvbSireIndustryGuidanceColl");

    if (pubs) pubs.open = true;
    if (guid) guid.open = true;
  }

  function renderEmpty(publicationsMsg, guidanceMsg) {
    const pubBody = $("csvbSirePublicationsBody");
    const guidBody = $("csvbSireIndustryGuidanceBody");

    if (pubBody) {
      pubBody.innerHTML = `<div class="csvb-sire-ref-empty">${esc(publicationsMsg || "No Applicable Publications recorded for this question.")}</div>`;
    }

    if (guidBody) {
      guidBody.innerHTML = `<div class="csvb-sire-ref-empty">${esc(guidanceMsg || "No Industry Guidance recorded for this question.")}</div>`;
    }

    const pubCount = $("csvbSirePublicationsCount");
    const guidCount = $("csvbSireIndustryGuidanceCount");

    if (pubCount) pubCount.textContent = "0";
    if (guidCount) guidCount.textContent = "0";
  }

  function renderReferences(questionNumber, matchRow, refRow) {
    const publications = normalizeArray(refRow?.applicable_publications);
    const guidance = normalizeArray(refRow?.industry_guidance);

    const pubBody = $("csvbSirePublicationsBody");
    const guidBody = $("csvbSireIndustryGuidanceBody");
    const pubCount = $("csvbSirePublicationsCount");
    const guidCount = $("csvbSireIndustryGuidanceCount");

    if (pubCount) pubCount.textContent = String(publications.length);
    if (guidCount) guidCount.textContent = String(guidance.length);

    if (pubBody) {
      if (!publications.length) {
        pubBody.innerHTML = `<div class="csvb-sire-ref-empty">No Applicable Publications recorded for this question.</div>`;
      } else {
        pubBody.innerHTML = publications.map((p, index) => {
          const title = p.display_name || p.raw_publication_text || "Publication";
          const raw = p.raw_publication_text && p.raw_publication_text !== title ? p.raw_publication_text : "";

          return `
            <div class="csvb-sire-ref-item">
              <div class="csvb-sire-ref-title">${index + 1}. ${esc(title)}</div>
              ${raw ? `<div class="csvb-sire-ref-content">${esc(raw)}</div>` : ""}
            </div>
          `;
        }).join("");
      }
    }

    if (guidBody) {
      if (!guidance.length) {
        guidBody.innerHTML = `<div class="csvb-sire-ref-empty">No Industry Guidance recorded for this question.</div>`;
      } else {
        guidBody.innerHTML = guidance.map((g, index) => {
          const title = g.guidance_title || "Industry Guidance";
          const section = [g.guidance_section, g.guidance_subsection]
            .map(safeStr)
            .map((x) => x.trim())
            .filter(Boolean)
            .join(" / ");

          const content = safeStr(g.guidance_content).trim();

          return `
            <div class="csvb-sire-ref-item">
              <div class="csvb-sire-ref-title">${index + 1}. ${esc(title)}</div>
              ${section ? `<div class="csvb-sire-ref-meta">Section: ${esc(section)}</div>` : ""}
              ${content ? `<div class="csvb-sire-ref-content">${esc(content)}</div>` : ""}
            </div>
          `;
        }).join("");
      }
    }

    setStatus(
      `References loaded for ${matchRow?.number_full || matchRow?.number_base || questionNumber}. ` +
      `Applicable Publications: ${publications.length}. Industry Guidance: ${guidance.length}.`
    );

    applyDefaultOpenState(questionNumber);
  }

  async function getSupabase() {
    if (!window.AUTH || typeof window.AUTH.ensureSupabase !== "function") {
      throw new Error("AUTH is not ready.");
    }

    return window.AUTH.ensureSupabase();
  }

  async function loadReferencesNow() {
    ensureContainer();

    const viewPanel = $("viewPanel");
    if (!viewPanel || viewPanel.style.display === "none") return;

    const questionNumber = getCurrentQuestionNumber();

    if (!questionNumber) {
      state.lastQuestionNumber = "";
      state.lastQuestionId = "";
      renderEmpty("Select a SIRE question to view Applicable Publications.", "Select a SIRE question to view Industry Guidance.");
      setStatus("No question selected.");
      return;
    }

    applyDefaultOpenState(questionNumber);

    if (state.loading) return;

    if (questionNumber === state.lastQuestionNumber && state.lastQuestionId) {
      return;
    }

    state.loading = true;
    state.lastQuestionNumber = questionNumber;
    state.lastQuestionId = "";

    setStatus(`Loading SIRE references for ${questionNumber}…`);

    try {
      const sb = await getSupabase();

      const matchResp = await sb.rpc("csvb_sire_match_question_number", {
        p_question_number: questionNumber
      });

      if (matchResp.error) throw matchResp.error;

      const matches = Array.isArray(matchResp.data) ? matchResp.data : [];
      const matched = matches.find((m) =>
        m.match_status === "matched" &&
        Number(m.match_count) === 1 &&
        m.question_id
      );

      if (!matched) {
        renderEmpty("No Applicable Publications loaded because the question number could not be matched.", "No Industry Guidance loaded because the question number could not be matched.");
        setStatus(`Could not match SIRE question number: ${questionNumber}.`);
        return;
      }

      state.lastQuestionId = matched.question_id;

      const refResp = await sb.rpc("csvb_sire_question_references_for_question", {
        p_question_id: matched.question_id
      });

      if (refResp.error) throw refResp.error;

      const rows = Array.isArray(refResp.data) ? refResp.data : [];
      const refRow = rows[0] || {
        applicable_publications: [],
        industry_guidance: []
      };

      renderReferences(questionNumber, matched, refRow);
    } catch (error) {
      renderEmpty("Could not load Applicable Publications.", "Could not load Industry Guidance.");
      setStatus("SIRE reference display error: " + safeStr(error?.message || error));
      console.error("[csvb-sire-reference-display]", error);
    } finally {
      state.loading = false;
    }
  }

  function scheduleLoad() {
    if (state.scheduled) clearTimeout(state.scheduled);
    state.scheduled = setTimeout(loadReferencesNow, 180);
  }

  function wireObservers() {
    const numberEls = [$("vhdrNumber"), $("hdrNumber")].filter(Boolean);

    numberEls.forEach((el) => {
      const obs = new MutationObserver(scheduleLoad);
      obs.observe(el, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });

    const viewPanel = $("viewPanel");
    if (viewPanel) {
      const obs = new MutationObserver(scheduleLoad);
      obs.observe(viewPanel, {
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target) return;

      if (
        target.closest(".qitem") ||
        target.closest("#btnView") ||
        target.closest("#btnEdit") ||
        target.closest("#reloadBtn")
      ) {
        scheduleLoad();
      }
    });

    setInterval(scheduleLoad, 1500);
  }

  function init() {
    injectStyles();
    ensureContainer();
    wireObservers();
    scheduleLoad();

    setTimeout(scheduleLoad, 700);
    setTimeout(scheduleLoad, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();