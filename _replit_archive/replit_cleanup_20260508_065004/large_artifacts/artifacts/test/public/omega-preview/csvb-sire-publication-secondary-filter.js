// public/csvb-sire-publication-secondary-filter.js
// C.S.V. BEACON — SIRE Questions Editor/Viewer Secondary Publication Filter
// Read-only DOM filter for Applicable Publications.

(() => {
  "use strict";

  const BUILD = "SIRE-PUB-SECONDARY-FILTER-20260520_8";
  window.CSVB_SIRE_PUBLICATION_SECONDARY_FILTER_BUILD = BUILD;

  const LS_SELECTED = "csvb_sire_publication_secondary_filter_selected_v1";
  const LS_ORIGIN = "csvb_sire_publication_secondary_filter_origin_v1";

  const ORIGIN_ORDER = [
    "All origins",
    "CDI",
    "IACS",
    "ICS",
    "IMO",
    "INTERTANKO",
    "OCIMF",
    "SIGTTO",
    "BIMCO",
    "ISO",
    "Class / Flag",
    "Industry Guidance",
    "Other / Unclassified"
  ];

  const state = {
    sb: null,
    options: [],
    selected: new Set(),
    selectedOrigin: "All origins",
    allowedNumbers: null,
    scheduled: null,
    loading: false
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

  function cleanTitle(v) {
    return safeStr(v).replace(/\s+/g, " ").trim();
  }

  function normalizeTitleForDuplicateAudit(v) {
    return cleanTitle(v)
      .toLowerCase()
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/\b(rev\.?|revision)\s*/g, "rev")
      .replace(/\b(edition|ed\.)\b/g, "ed")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ensureSireFilterLegendHelperLoaded() {
    if (window.CSVB_SIRE_FILTER_LEGEND_HELPER_BUILD) return;
    if (document.querySelector('script[data-csvb-sire-filter-legend-loader="1"]')) return;

    const script = document.createElement("script");
    script.src = "./csvb-sire-filter-and-legend-helper.js?v=20260520_3";
    script.defer = true;
    script.dataset.csvbSireFilterLegendLoader = "1";
    document.body.appendChild(script);
  }

  function normalizeQuestionNumber(raw) {
    const s = safeStr(raw).trim();
    const m = s.match(/(?:^|\b|Q\s*)(\d{1,2})\.(\d{1,2})\.(\d{1,3})(?:\b|$)/i);
    if (!m) return "";
    return `${String(Number(m[1])).padStart(2, "0")}.${String(Number(m[2])).padStart(2, "0")}.${String(Number(m[3])).padStart(2, "0")}`;
  }

  function publicationTitle(opt) {
    return cleanTitle(opt?.display_name || opt?.raw_publication_text || "");
  }

  function inferOrigin(titleValue) {
    const title = cleanTitle(titleValue);
    const upper = title.toUpperCase();

    if (/^CDI\b|\bCHEMICAL DISTRIBUTION INSTITUTE\b/.test(upper)) return "CDI";
    if (/^IACS\b|\bINTERNATIONAL ASSOCIATION OF CLASSIFICATION SOCIETIES\b/.test(upper)) return "IACS";
    if (/^ICS\b|\bINTERNATIONAL CHAMBER OF SHIPPING\b/.test(upper)) return "ICS";
    if (/^IMO\b|\bINTERNATIONAL MARITIME ORGANIZATION\b|\bSOLAS\b|\bMARPOL\b|\bSTCW\b|\bISM CODE\b|\bISPS CODE\b|\bIBC CODE\b|\bIGC CODE\b/.test(upper)) return "IMO";
    if (/^INTERTANKO\b|\bINTERTANKO\b/.test(upper)) return "INTERTANKO";
    if (/^OCIMF\b|\bOCIMF\b|\bISGOTT\b|\bSIRE\b|\bMEG\b|\bTMSA\b/.test(upper)) return "OCIMF";
    if (/^SIGTTO\b|\bSIGTTO\b/.test(upper)) return "SIGTTO";
    if (/^BIMCO\b|\bBIMCO\b/.test(upper)) return "BIMCO";
    if (/^ISO\b|\bISO\s*\d+/.test(upper)) return "ISO";
    if (/\bCLASSIFICATION SOCIETY\b|\bCLASS\b|\bFLAG STATE\b|\bABS\b|\bDNV\b|\bLR\b|\bBUREAU VERITAS\b|\bRINA\b/.test(upper)) return "Class / Flag";
    if (/\bGUIDE\b|\bGUIDELINES\b|\bRECOMMENDATIONS\b|\bBEST PRACTICE\b|\bINDUSTRY\b/.test(upper)) return "Industry Guidance";

    const prefix = upper.match(/^([A-Z0-9]{2,12})\s*[:.\-]/)?.[1] || "";
    if (prefix && ORIGIN_ORDER.includes(prefix)) return prefix;

    return "Other / Unclassified";
  }

  function enrichedOptions() {
    return state.options.map((opt) => {
      const title = publicationTitle(opt);
      return {
        ...opt,
        display_name: title,
        origin: inferOrigin(title),
        normalized_title: normalizeTitleForDuplicateAudit(title)
      };
    });
  }

  function originCounts(options) {
    const counts = new Map();
    options.forEach((opt) => {
      counts.set(opt.origin, (counts.get(opt.origin) || 0) + 1);
    });
    return counts;
  }

  function sortedOrigins(options) {
    const counts = originCounts(options);
    const known = ORIGIN_ORDER.filter((o) => o === "All origins" || counts.has(o));
    const extras = Array.from(counts.keys())
      .filter((o) => !ORIGIN_ORDER.includes(o))
      .sort((a, b) => a.localeCompare(b));
    return [...known, ...extras];
  }

  function currentVisibleOptions() {
    const options = enrichedOptions();
    if (state.selectedOrigin === "All origins") return options;
    return options.filter((opt) => opt.origin === state.selectedOrigin);
  }

  function duplicateAudit(options = enrichedOptions()) {
    const byExact = new Map();
    const byNormalized = new Map();

    options.forEach((opt) => {
      const exact = cleanTitle(opt.display_name);
      const normalized = opt.normalized_title;

      if (exact) {
        if (!byExact.has(exact)) byExact.set(exact, []);
        byExact.get(exact).push(opt);
      }

      if (normalized) {
        if (!byNormalized.has(normalized)) byNormalized.set(normalized, []);
        byNormalized.get(normalized).push(opt);
      }
    });

    const exactDuplicates = Array.from(byExact.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([title, rows]) => ({ title, count: rows.length, rows }));

    const nearDuplicates = Array.from(byNormalized.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([normalized, rows]) => ({
        normalized,
        count: rows.length,
        titles: Array.from(new Set(rows.map((r) => r.display_name))).sort(),
        rows
      }))
      .filter((group) => group.titles.length > 1);

    return {
      total: options.length,
      exactDuplicates,
      nearDuplicates,
    };
  }

  function loadSelected() {
    try {
      const raw = localStorage.getItem(LS_SELECTED);
      const arr = raw ? JSON.parse(raw) : [];
      state.selected = new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      state.selected = new Set();
    }

    try {
      const origin = localStorage.getItem(LS_ORIGIN) || "All origins";
      state.selectedOrigin = origin || "All origins";
    } catch {
      state.selectedOrigin = "All origins";
    }
  }

  function saveSelected() {
    localStorage.setItem(LS_SELECTED, JSON.stringify(Array.from(state.selected)));
    localStorage.setItem(LS_ORIGIN, state.selectedOrigin || "All origins");
  }

  function injectStyles() {
    if ($("csvbSirePublicationSecondaryFilterStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSirePublicationSecondaryFilterStyles";
    style.textContent = `
      .csvb-secondary-filter-shell {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
        position: relative;
      }

      .csvb-secondary-filter-btn {
        cursor: pointer;
      }

      .csvb-secondary-filter-panel {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 150;
        width: min(640px, 94vw);
        background: #fff;
        border: 1px solid #C8DAEF;
        border-radius: 14px;
        box-shadow: 0 16px 40px rgba(3,27,63,.16);
        padding: 10px;
      }

      .csvb-secondary-filter-panel.open {
        display: block;
      }

      .csvb-secondary-filter-title {
        color: #062A5E;
        font-weight: 750;
        margin-bottom: 4px;
      }

      .csvb-secondary-filter-note,
      .csvb-secondary-filter-note-yellow {
        margin: 0 0 7px;
        padding: 4px 6px;
        border-radius: 7px;
        background: #fff36a;
        color: #10233f;
        font-size: 11.5px;
        font-weight: 700;
        line-height: 1.25;
      }

      .csvb-secondary-filter-origin-row {
        display: grid;
        grid-template-columns: minmax(180px, 1fr) auto;
        gap: 8px;
        align-items: end;
        margin-bottom: 8px;
      }

      .csvb-secondary-filter-origin-row label {
        color: #062A5E;
        font-size: 12px;
        font-weight: 850;
        display: grid;
        gap: 3px;
      }

      .csvb-secondary-filter-origin-row select {
        border: 1px solid #bfd5ee;
        border-radius: 9px;
        min-height: 31px;
        padding: 5px 8px;
        color: #10233f;
      }

      .csvb-secondary-filter-audit-btn {
        border: 1px solid #C8DAEF;
        background: #fff;
        color: #062A5E;
        border-radius: 9px;
        padding: 7px 10px;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }

      .csvb-secondary-filter-options {
        max-height: 320px;
        overflow: auto;
        border-top: 1px solid #E1ECF7;
        padding-top: 6px;
      }

      .csvb-secondary-filter-option {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        justify-content: space-between;
        padding: 7px 4px;
        border-bottom: 1px solid #F0F5FB;
      }

      .csvb-secondary-filter-option label {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        cursor: pointer;
        line-height: 1.25;
        color: #062A5E;
        font-weight: 500;
      }

      .csvb-secondary-filter-origin-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #BFD3EF;
        background: #EEF6FF;
        color: #1A4170;
        border-radius: 999px;
        padding: 2px 7px;
        font-weight: 800;
        font-size: 10.5px;
        margin-top: 3px;
        width: fit-content;
      }

      .csvb-secondary-filter-count {
        color: #5E6F86;
        font-size: 12px;
        font-weight: 650;
        min-width: 34px;
        text-align: right;
      }

      .csvb-secondary-filter-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }

      .csvb-secondary-filter-clear {
        border: 1px solid #C8DAEF;
        background: #fff;
        color: #062A5E;
        border-radius: 9px;
        padding: 7px 10px;
        font-weight: 700;
        cursor: pointer;
      }

      .csvb-secondary-filter-status {
        color: #5E6F86;
        font-size: 12px;
        font-weight: 650;
      }

      .csvb-secondary-filter-hidden {
        display: none !important;
      }
    `;
    style.textContent += `
      /* CSVB-SIRE-PUB-FILTER-SAME-SHAPE-20260514 */
      .csvb-secondary-filter-shell {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-left: 8px;
        position: relative;
      }

      .csvb-secondary-filter-btn.facet {
        appearance: none;
        -webkit-appearance: none;
      }

      .csvb-secondary-filter-btn.facet.active {
        background: #EAF3FB !important;
        border-color: #B8D0E8 !important;
        color: #062A5E !important;
      }
    `;

    style.textContent += `
      /* CSVB-SIRE-PUB-FILTER-EXACT-PILL-20260514 */
      html[data-csvb-page="q-questions-editor.html"] .csvb-secondary-filter-shell {
        display: inline-flex !important;
        align-items: flex-start !important;
        gap: 0 !important;
        margin-left: 0 !important;
        position: relative !important;
      }

      html[data-csvb-page="q-questions-editor.html"] button.csvb-secondary-filter-btn,
      html[data-csvb-page="q-questions-editor.html"] button.csvb-secondary-filter-btn.facet {
        list-style: none !important;
        cursor: pointer !important;
        padding: 8px 12px !important;
        border: 1px solid #d0d7e2 !important;
        border-radius: 999px !important;
        background: #ffffff !important;
        color: #062A5E !important;
        font-family: inherit !important;
        font-size: 13px !important;
        line-height: normal !important;
        font-weight: 700 !important;
        user-select: none !important;
        white-space: nowrap !important;
        box-shadow: none !important;
        outline: none !important;
        appearance: none !important;
        -webkit-appearance: none !important;
      }

      html[data-csvb-page="q-questions-editor.html"] button.csvb-secondary-filter-btn.active,
      html[data-csvb-page="q-questions-editor.html"] button.csvb-secondary-filter-btn.facet.active {
        background: #e9f0ff !important;
        border-color: #b8c7e6 !important;
        color: #062A5E !important;
      }
`;

    document.head.appendChild(style);
  }

  function ensureUi() {
    const ribbon = $("filterRibbon");
    if (!ribbon) return null;

    let shell = $("csvbSirePublicationSecondaryFilterShell");
    if (shell) return shell;

    shell = document.createElement("div");
    shell.id = "csvbSirePublicationSecondaryFilterShell";
    shell.className = "csvb-secondary-filter-shell";

    shell.innerHTML = `
      <button id="csvbSecondaryFiltersBtn" class="facet csvb-secondary-filter-btn" type="button">
        Applicable Publications
      </button>

      <div id="csvbSecondaryFiltersPanel" class="csvb-secondary-filter-panel">
        <div class="csvb-secondary-filter-title">Applicable Publications</div>
        <div class="csvb-secondary-filter-note-yellow">
          Filter the current question list by linked publications. Empty selection = no secondary filter.
        </div>
        <div class="csvb-secondary-filter-origin-row">
          <label>
            Origin / publisher
            <select id="csvbSecondaryFilterOriginSelect"></select>
          </label>
          <button id="csvbSecondaryFilterAuditBtn" class="csvb-secondary-filter-audit-btn" type="button">Audit duplicates</button>
        </div>
        <div id="csvbSecondaryFilterOptions" class="csvb-secondary-filter-options">
          Loading publication options…
        </div>
        <div class="csvb-secondary-filter-actions">
          <button id="csvbSecondaryFilterClearBtn" class="csvb-secondary-filter-clear" type="button">Clear</button>
          <div id="csvbSecondaryFilterStatus" class="csvb-secondary-filter-status">—</div>
        </div>
      </div>
    `;

    const facetWrap = ribbon.querySelector(".facetWrap") || ribbon;
    facetWrap.appendChild(shell);

    $("csvbSecondaryFiltersBtn")?.addEventListener("click", () => {
      $("csvbSecondaryFiltersPanel")?.classList.toggle("open");
    });

    $("csvbSecondaryFilterOriginSelect")?.addEventListener("change", (event) => {
      state.selectedOrigin = event.target.value || "All origins";
      saveSelected();
      renderOptions();
    });

    $("csvbSecondaryFilterAuditBtn")?.addEventListener("click", () => {
      const audit = duplicateAudit();
      console.log("C.S.V. BEACON: Applicable Publications duplicate audit", audit);
      console.table(audit.exactDuplicates.map((g) => ({ type: "exact", title: g.title, count: g.count })));
      console.table(audit.nearDuplicates.map((g) => ({ type: "near", normalized: g.normalized, count: g.count, titles: g.titles.join(" | ") })));
      alert(
        "Applicable Publications duplicate audit complete.\n\n" +
        "Total publications: " + audit.total + "\n" +
        "Exact duplicate groups: " + audit.exactDuplicates.length + "\n" +
        "Near-duplicate groups: " + audit.nearDuplicates.length + "\n\n" +
        "See browser console for details. No data was changed."
      );
    });

    $("csvbSecondaryFilterClearBtn")?.addEventListener("click", async () => {
      state.selected.clear();
      saveSelected();
      state.allowedNumbers = null;
      renderOptions();
      applyFilter();
      await loadAllowedNumbers();
    });

    document.addEventListener("click", (event) => {
      const panel = $("csvbSecondaryFiltersPanel");
      const btn = $("csvbSecondaryFiltersBtn");
      if (!panel || !btn) return;
      if (panel.contains(event.target) || btn.contains(event.target)) return;
      panel.classList.remove("open");
    });

    return shell;
  }

  function renderOriginSelect() {
    const select = $("csvbSecondaryFilterOriginSelect");
    if (!select) return;

    const options = enrichedOptions();
    const counts = originCounts(options);
    const origins = sortedOrigins(options);

    if (state.selectedOrigin !== "All origins" && !counts.has(state.selectedOrigin)) {
      state.selectedOrigin = "All origins";
      saveSelected();
    }

    select.innerHTML = origins.map((origin) => {
      const count = origin === "All origins" ? options.length : (counts.get(origin) || 0);
      return `<option value="${esc(origin)}" ${origin === state.selectedOrigin ? "selected" : ""}>${esc(origin)} (${count})</option>`;
    }).join("");
  }

  function setStatus(msg) {
    const el = $("csvbSecondaryFilterStatus");
    if (el) el.textContent = msg || "";
  }

  function renderOptions() {
    const host = $("csvbSecondaryFilterOptions");
    const btn = $("csvbSecondaryFiltersBtn");
    if (!host) return;

    renderOriginSelect();

    const visibleOptions = currentVisibleOptions();

    if (!state.options.length) {
      host.innerHTML = `<div class="csvb-secondary-filter-note-yellow">No Applicable Publications have been imported yet.</div>`;
      if (btn) btn.classList.remove("active");
      setStatus("0 options");
      return;
    }

    const active = state.selected.size > 0;
    if (btn) {
      btn.classList.toggle("active", active);
      btn.textContent = active ? `Applicable Publications (${state.selected.size})` : "Applicable Publications";
    }

    const totalSelectedInVisible = visibleOptions.filter((opt) => state.selected.has(String(opt.publication_id))).length;

    host.innerHTML = [
      `<div class="csvb-secondary-filter-option">
        <label>
          <input type="checkbox" data-csvb-pub-all="1" ${!active ? "checked" : ""}>
          <span>Select All / no secondary filter</span>
        </label>
        <span class="csvb-secondary-filter-count">${state.options.length}</span>
      </div>`,
      visibleOptions.length ? "" : `<div class="csvb-secondary-filter-note-yellow">No publications found for selected origin.</div>`,
      ...visibleOptions.map((opt) => {
        const checked = state.selected.has(String(opt.publication_id));
        return `
          <div class="csvb-secondary-filter-option">
            <label>
              <input type="checkbox" data-csvb-pub-id="${esc(opt.publication_id)}" ${checked ? "checked" : ""}>
              <span>
                ${esc(opt.display_name)}
                <span class="csvb-secondary-filter-origin-pill">${esc(opt.origin)}</span>
              </span>
            </label>
            <span class="csvb-secondary-filter-count">${esc(opt.question_count)}</span>
          </div>
        `;
      })
    ].join("");

    host.querySelector("[data-csvb-pub-all]")?.addEventListener("change", async () => {
      state.selected.clear();
      saveSelected();
      state.allowedNumbers = null;
      renderOptions();
      await loadAllowedNumbers();
      applyFilter();
    });

    host.querySelectorAll("[data-csvb-pub-id]").forEach((cb) => {
      cb.addEventListener("change", async () => {
        const id = cb.getAttribute("data-csvb-pub-id");
        if (!id) return;

        if (cb.checked) state.selected.add(id);
        else state.selected.delete(id);

        saveSelected();
        renderOptions();
        await loadAllowedNumbers();
        applyFilter();
      });
    });

    const originNote = state.selectedOrigin === "All origins" ? "All origins" : state.selectedOrigin;
    setStatus(active ? `${state.selected.size} selected (${totalSelectedInVisible} visible in ${originNote})` : `No secondary filter • ${visibleOptions.length}/${state.options.length} shown in ${originNote}`);
  }

  async function getSupabase() {
    if (!window.AUTH || typeof window.AUTH.ensureSupabase !== "function") {
      throw new Error("AUTH is not ready.");
    }

    if (!state.sb) state.sb = window.AUTH.ensureSupabase();
    return state.sb;
  }

  async function loadOptions() {
    const sb = await getSupabase();

    const resp = await sb.rpc("csvb_sire_publication_secondary_filter_options");
    if (resp.error) throw resp.error;

    state.options = Array.isArray(resp.data) ? resp.data : [];
    renderOptions();
  }

  async function loadAllowedNumbers() {
    if (!state.selected.size) {
      state.allowedNumbers = null;
      applyFilter();
      return;
    }

    const sb = await getSupabase();

    const resp = await sb.rpc("csvb_sire_publication_secondary_filter_question_numbers", {
      p_publication_ids: Array.from(state.selected)
    });

    if (resp.error) throw resp.error;

    const rows = Array.isArray(resp.data) ? resp.data : [];

    state.allowedNumbers = new Set();
    rows.forEach((r) => {
      const nb = normalizeQuestionNumber(r.number_base || "");
      const nf = normalizeQuestionNumber(r.number_full || "");
      if (nb) state.allowedNumbers.add(nb);
      if (nf) state.allowedNumbers.add(nf);
    });

    applyFilter();
  }

  function applyFilter() {
    const qList = $("qList");
    if (!qList) return;

    const items = Array.from(qList.querySelectorAll(".qitem"));
    let visibleBySecondary = 0;
    let hiddenBySecondary = 0;

    items.forEach((item) => {
      item.classList.remove("csvb-secondary-filter-hidden");

      if (!state.allowedNumbers) return;

      const qno = item.querySelector(".qno");
      const number = normalizeQuestionNumber(qno?.textContent || item.textContent || "");

      if (!number || !state.allowedNumbers.has(number)) {
        item.classList.add("csvb-secondary-filter-hidden");
        hiddenBySecondary += 1;
      } else {
        visibleBySecondary += 1;
      }
    });

    if (!state.allowedNumbers) {
      const visibleOptions = currentVisibleOptions();
      const originNote = state.selectedOrigin === "All origins" ? "All origins" : state.selectedOrigin;
      setStatus(`No secondary filter • ${visibleOptions.length}/${state.options.length} shown in ${originNote}`);
      return;
    }

    setStatus(`Publication filter: ${visibleBySecondary} shown / ${hiddenBySecondary} hidden`);
  }

  function scheduleApply() {
    if (state.scheduled) clearTimeout(state.scheduled);
    state.scheduled = setTimeout(applyFilter, 120);
  }

  function wireListObserver() {
    const qList = $("qList");
    if (!qList) return;

    const obs = new MutationObserver(scheduleApply);
    obs.observe(qList, {
      childList: true,
      subtree: true
    });

    document.addEventListener("input", (event) => {
      if (event.target && event.target.id === "searchInput") scheduleApply();
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target) return;
      if (
        target.closest("#reloadBtn") ||
        target.closest(".facet") ||
        target.closest(".facetOpt") ||
        target.closest("#showFullQuestionToggle")
      ) {
        setTimeout(scheduleApply, 250);
      }
    });
  }

  async function init() {
    injectStyles();
    ensureUi();
    ensureSireFilterLegendHelperLoaded();
    loadSelected();
    wireListObserver();

    try {
      await loadOptions();
      await loadAllowedNumbers();
      applyFilter();
    } catch (error) {
      console.error("[csvb-sire-publication-secondary-filter]", error);
      setStatus("Secondary filter error: " + safeStr(error?.message || error));
    }

    window.CSVB_SIRE_PUBLICATION_SECONDARY_FILTER = {
      build: BUILD,
      getOptions: () => enrichedOptions(),
      getSelected: () => Array.from(state.selected),
      getSelectedOrigin: () => state.selectedOrigin,
      setOrigin: (origin) => {
        state.selectedOrigin = origin || "All origins";
        saveSelected();
        renderOptions();
      },
      auditDuplicates: () => duplicateAudit()
    };

    setInterval(applyFilter, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
