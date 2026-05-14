// public/csvb-sire-publication-secondary-filter.js
// C.S.V. BEACON — SIRE Questions Editor Secondary Publication Filter
// Read-only DOM filter for Applicable Publications.

(() => {
  "use strict";

  const BUILD = "SIRE-PUB-SECONDARY-FILTER-20260514_2";
  window.CSVB_SIRE_PUBLICATION_SECONDARY_FILTER_BUILD = BUILD;

  const LS_SELECTED = "csvb_sire_publication_secondary_filter_selected_v1";

  const state = {
    sb: null,
    options: [],
    selected: new Set(),
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

  function normalizeQuestionNumber(raw) {
    const s = safeStr(raw).trim();
    const m = s.match(/(?:^|\b|Q\s*)(\d{1,2})\.(\d{1,2})\.(\d{1,3})(?:\b|$)/i);
    if (!m) return "";
    return `${String(Number(m[1])).padStart(2, "0")}.${String(Number(m[2])).padStart(2, "0")}.${String(Number(m[3])).padStart(2, "0")}`;
  }

  function loadSelected() {
    try {
      const raw = localStorage.getItem(LS_SELECTED);
      const arr = raw ? JSON.parse(raw) : [];
      state.selected = new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      state.selected = new Set();
    }
  }

  function saveSelected() {
    localStorage.setItem(LS_SELECTED, JSON.stringify(Array.from(state.selected)));
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
        background: #EAF3FB;
        color: #062A5E;
        border: 1px solid #C8DAEF;
        border-radius: 999px;
        padding: 8px 12px;
        font-weight: 750;
        cursor: pointer;
      }

      .csvb-secondary-filter-btn.active {
        background: #062A5E;
        color: #fff;
        border-color: #062A5E;
      }

      .csvb-secondary-filter-panel {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        z-index: 150;
        width: min(520px, 92vw);
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

      .csvb-secondary-filter-note {
        color: #5E6F86;
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 8px;
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
      <button id="csvbSecondaryFiltersBtn" class="csvb-secondary-filter-btn" type="button">
        Applicable Publications
      </button>

      <div id="csvbSecondaryFiltersPanel" class="csvb-secondary-filter-panel">
        <div class="csvb-secondary-filter-title">Applicable Publications</div>
        <div class="csvb-secondary-filter-note">
          Filter the current question list by linked publications. Empty selection = no secondary filter.
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

  function setStatus(msg) {
    const el = $("csvbSecondaryFilterStatus");
    if (el) el.textContent = msg || "";
  }

  function renderOptions() {
    const host = $("csvbSecondaryFilterOptions");
    const btn = $("csvbSecondaryFiltersBtn");
    if (!host) return;

    if (!state.options.length) {
      host.innerHTML = `<div class="csvb-secondary-filter-note">No Applicable Publications have been imported yet.</div>`;
      if (btn) btn.classList.remove("active");
      setStatus("0 options");
      return;
    }

    const active = state.selected.size > 0;
    if (btn) {
      btn.classList.toggle("active", active);
      btn.textContent = active ? `Applicable Publications (${state.selected.size})` : "Applicable Publications";
    }

    host.innerHTML = [
      `<div class="csvb-secondary-filter-option">
        <label>
          <input type="checkbox" data-csvb-pub-all="1" ${!active ? "checked" : ""}>
          <span>Select All / no secondary filter</span>
        </label>
        <span class="csvb-secondary-filter-count">${state.options.length}</span>
      </div>`,
      ...state.options.map((opt) => {
        const checked = state.selected.has(String(opt.publication_id));
        return `
          <div class="csvb-secondary-filter-option">
            <label>
              <input type="checkbox" data-csvb-pub-id="${esc(opt.publication_id)}" ${checked ? "checked" : ""}>
              <span>${esc(opt.display_name)}</span>
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

    setStatus(active ? `${state.selected.size} selected` : "No secondary filter");
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
      setStatus("No secondary filter");
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

    setInterval(applyFilter, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
