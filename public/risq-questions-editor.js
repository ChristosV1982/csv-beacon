/* public/risq-questions-editor.js */
/* C.S.V. BEACON – RISQ-06 Read-only RISQ Questions Editor */

(() => {
  "use strict";

  const BUILD = "RISQ-QEDITOR-READONLY-06-20260513-1";

  const state = {
    sb: null,
    profile: null,
    rows: [],
    filtered: [],
    selectedId: ""
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      "warnBox", "okBox", "reloadBtn", "exportBtn",
      "statVisible", "statActive", "statRemoved", "statSections", "statNoGuide", "statInferred",
      "filterSection", "filterStatus", "filterMarker", "filterGuide", "searchInput", "clearFiltersBtn",
      "listMeta", "questionList", "detailMeta", "detailBody"
    ].forEach((id) => {
      el[id] = $(id);
    });
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function showMsg(type, message) {
    const box = type === "ok" ? el.okBox : el.warnBox;
    if (!box) return;

    box.textContent = message || "";
    box.style.display = message ? "block" : "none";

    if (message) {
      setTimeout(() => {
        box.textContent = "";
        box.style.display = "none";
      }, type === "ok" ? 2400 : 4200);
    }
  }

  function selectedMultiValues(id) {
    const select = $(id);
    if (!select) return new Set();

    return new Set(
      Array.from(select.selectedOptions || [])
        .map((option) => String(option.value || ""))
        .filter(Boolean)
    );
  }

  function clearMultiSelect(select) {
    Array.from(select.options || []).forEach((option) => {
      option.selected = false;
    });
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function option(value, label, selected = false) {
    return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
  }

  function displayMarker(row) {
    return row.inspection_marker || "Blank";
  }

  function displayGuideStatus(row) {
    if (row.guide_status === "not_provided") return "Not Provided";
    if (row.guide_status === "removed") return "Removed";
    return "Provided";
  }

  function statusKey(row) {
    return row.is_removed_question ? "removed" : "active";
  }

  function markerKey(row) {
    return row.inspection_marker || "blank";
  }

  function sectionLabel(row) {
    return `${row.section_code} — ${row.section_title}`;
  }

  function renderFilters() {
    const selectedSections = selectedMultiValues("filterSection");

    const sections = Array.from(
      new Map(
        state.rows.map((row) => [row.section_code, sectionLabel(row)])
      ).entries()
    ).sort((a, b) => a[0].localeCompare(b[0]));

    el.filterSection.innerHTML = sections
      .map(([code, label]) => option(code, label, selectedSections.has(code)))
      .join("");

    el.filterSection.dispatchEvent(new Event("change", { bubbles: true }));
    el.filterStatus.dispatchEvent(new Event("change", { bubbles: true }));
    el.filterMarker.dispatchEvent(new Event("change", { bubbles: true }));
    el.filterGuide.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function rowMatches(row) {
    const sections = selectedMultiValues("filterSection");
    const statuses = selectedMultiValues("filterStatus");
    const markers = selectedMultiValues("filterMarker");
    const guides = selectedMultiValues("filterGuide");
    const q = norm(el.searchInput.value);

    if (sections.size && !sections.has(row.section_code)) return false;
    if (statuses.size && !statuses.has(statusKey(row))) return false;
    if (markers.size && !markers.has(markerKey(row))) return false;
    if (guides.size && !guides.has(row.guide_status || "provided")) return false;

    if (q) {
      const haystack = [
        row.internal_question_no,
        row.printed_question_no,
        row.section_code,
        row.section_title,
        row.question_text,
        row.guide_to_inspection,
        row.inspection_marker,
        row.answer_type,
        row.esms_references,
        row.esms_forms,
        row.remarks
      ].map(norm).join(" | ");

      if (!haystack.includes(q)) return false;
    }

    return true;
  }

  function sortRows(rows) {
    return [...rows].sort((a, b) => {
      const ak = Number(a.question_sort_key || 0);
      const bk = Number(b.question_sort_key || 0);
      if (ak !== bk) return ak - bk;
      return String(a.internal_question_no).localeCompare(String(b.internal_question_no));
    });
  }

  function calculateFiltered() {
    state.filtered = sortRows(state.rows.filter(rowMatches));
  }

  function renderStats() {
    const rows = state.filtered;
    const all = state.rows;

    el.statVisible.textContent = String(rows.length);
    el.statActive.textContent = String(all.filter((r) => !r.is_removed_question).length);
    el.statRemoved.textContent = String(all.filter((r) => r.is_removed_question).length);
    el.statSections.textContent = String(new Set(all.map((r) => r.section_code)).size);
    el.statNoGuide.textContent = String(all.filter((r) => !r.is_removed_question && r.guide_status === "not_provided").length);
    el.statInferred.textContent = String(all.filter((r) => r.answer_options_inferred === true).length);
  }

  function renderList() {
    const rows = state.filtered;

    el.listMeta.textContent = `${rows.length} record(s) shown from ${state.rows.length} imported RISQ records.`;

    if (!rows.length) {
      el.questionList.innerHTML = `<div class="empty">No RISQ questions match the current filters.</div>`;
      renderDetail(null);
      return;
    }

    if (!state.selectedId || !rows.some((r) => r.id === state.selectedId)) {
      state.selectedId = rows[0].id;
    }

    el.questionList.innerHTML = rows.map((row) => {
      const active = row.id === state.selectedId ? " active" : "";
      const removed = row.is_removed_question ? `<span class="pill pill-danger">Removed</span>` : "";
      const noGuide = !row.is_removed_question && row.guide_status === "not_provided" ? `<span class="pill pill-warn">No Guide</span>` : "";
      const inferred = row.answer_options_inferred ? `<span class="pill pill-warn">Inferred Answers</span>` : "";

      return `
        <div class="q-item${active}" data-risq-id="${esc(row.id)}">
          <div class="q-no">${esc(row.internal_question_no)} <span class="q-mini">(printed ${esc(row.printed_question_no)})</span></div>
          <div class="q-sub">${esc(row.question_text || "—")}</div>
          <div class="q-mini">${esc(row.section_code)} / ${esc(row.section_title)} / Marker: ${esc(displayMarker(row))}</div>
          <div class="pill-row">${removed}${noGuide}${inferred}</div>
        </div>
      `;
    }).join("");

    el.questionList.querySelectorAll("[data-risq-id]").forEach((node) => {
      node.addEventListener("click", () => {
        state.selectedId = node.getAttribute("data-risq-id") || "";
        renderAll();
      });
    });

    renderDetail(rows.find((r) => r.id === state.selectedId) || rows[0]);
  }

  function renderDetail(row) {
    if (!row) {
      el.detailMeta.textContent = "No question selected.";
      el.detailBody.innerHTML = `<div class="empty">Select a RISQ question from the list.</div>`;
      return;
    }

    el.detailMeta.textContent = `${row.section_code} / ${row.section_title}`;

    const removedPill = row.is_removed_question
      ? `<span class="pill pill-danger">Removed Question</span>`
      : `<span class="pill">Active Question</span>`;

    const guidePill = row.guide_status === "not_provided"
      ? `<span class="pill pill-warn">Guide to Inspection Not Provided</span>`
      : row.guide_status === "removed"
        ? `<span class="pill pill-muted">Guide Removed</span>`
        : `<span class="pill">Guide Provided</span>`;

    const inferredPill = row.answer_options_inferred
      ? `<span class="pill pill-warn">Answer Options Inferred</span>`
      : "";

    const guideText = row.guide_to_inspection
      ? esc(row.guide_to_inspection)
      : row.is_removed_question
        ? "This item is marked as removed in the RISQ publication."
        : "No Guide to Inspection text is provided for this question in the extracted RISQ source.";

    el.detailBody.innerHTML = `
      <div class="detail-number">${esc(row.internal_question_no)}</div>
      <div class="section-meta">Printed RISQ number: ${esc(row.printed_question_no)}</div>

      <div class="pill-row">
        ${removedPill}
        ${guidePill}
        ${inferredPill}
        <span class="pill pill-muted">Answer: ${esc(row.answer_type || "—")}</span>
        <span class="pill pill-muted">Marker: ${esc(displayMarker(row))}</span>
      </div>

      <div class="detail-question">${esc(row.question_text || "—")}</div>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">Question Set</div>
          <div class="info-value">${esc(row.short_name || "RISQ")} ${esc(row.version || "3.2")}</div>
        </div>

        <div class="info-box">
          <div class="info-label">Section</div>
          <div class="info-value">${esc(row.section_code)}\n${esc(row.section_title)}</div>
        </div>

        <div class="info-box">
          <div class="info-label">Source Pages</div>
          <div class="info-value">${esc(row.source_page_start || "—")} - ${esc(row.source_page_end || "—")}</div>
        </div>

        <div class="info-box">
          <div class="info-label">Answer Options</div>
          <div class="info-value">${Array.isArray(row.answer_options) ? esc(row.answer_options.join(" / ")) : esc(JSON.stringify(row.answer_options || []))}</div>
        </div>

        <div class="info-box">
          <div class="info-label">Mapping Source</div>
          <div class="info-value">${esc(row.mapping_source || "none")}</div>
        </div>

        <div class="info-box">
          <div class="info-label">Last Updated</div>
          <div class="info-value">${esc(String(row.updated_at || "").replace("T", " ").slice(0, 19) || "—")}</div>
        </div>
      </div>

      <div class="content-section">
        <div class="content-section-title">Guide to Inspection</div>
        <div class="content-section-body">${guideText}</div>
      </div>

      <div class="content-section">
        <div class="content-section-title">eSMS Reference(s)</div>
        <div class="content-section-body">${esc(row.esms_references || "—")}</div>
      </div>

      <div class="content-section">
        <div class="content-section-title">eSMS Form(s)</div>
        <div class="content-section-body">${esc(row.esms_forms || "—")}</div>
      </div>

      <div class="content-section">
        <div class="content-section-title">Remarks</div>
        <div class="content-section-body">${esc(row.remarks || "—")}</div>
      </div>
    `;
  }

  function renderAll() {
    calculateFiltered();
    renderStats();
    renderList();
  }

  async function loadRows() {
    const { data, error } = await state.sb
      .from("risq_v_questions_list")
      .select("*")
      .eq("question_set_code", "RISQ_3_2")
      .order("question_sort_key", { ascending: true });

    if (error) throw error;

    state.rows = data || [];
  }

  function clearFilters() {
    clearMultiSelect(el.filterSection);
    clearMultiSelect(el.filterStatus);
    clearMultiSelect(el.filterMarker);
    clearMultiSelect(el.filterGuide);
    el.searchInput.value = "";
    renderAll();
  }

  function csvCell(value) {
    const s = String(value ?? "");
    return `"${s.replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const headers = [
      "Internal Question No",
      "Printed Question No",
      "Section Code",
      "Section Title",
      "Question Text",
      "Answer Type",
      "Answer Options Inferred",
      "Inspection Marker",
      "Removed",
      "Guide Status",
      "Guide to Inspection",
      "eSMS References",
      "eSMS Forms",
      "Remarks",
      "Source Page Start",
      "Source Page End"
    ];

    const lines = [headers.map(csvCell).join(",")];

    state.filtered.forEach((row) => {
      lines.push([
        row.internal_question_no,
        row.printed_question_no,
        row.section_code,
        row.section_title,
        row.question_text,
        row.answer_type,
        row.answer_options_inferred ? "Yes" : "No",
        row.inspection_marker,
        row.is_removed_question ? "Yes" : "No",
        row.guide_status,
        row.guide_to_inspection,
        row.esms_references,
        row.esms_forms,
        row.remarks,
        row.source_page_start,
        row.source_page_end
      ].map(csvCell).join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `risq_3_2_questions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    el.reloadBtn.addEventListener("click", () => reload().catch(handleError));
    el.exportBtn.addEventListener("click", exportCsv);
    el.clearFiltersBtn.addEventListener("click", clearFilters);

    [el.filterSection, el.filterStatus, el.filterMarker, el.filterGuide].forEach((select) => {
      select.addEventListener("change", renderAll);
    });

    el.searchInput.addEventListener("input", renderAll);
  }

  async function reload() {
    showMsg("warn", "");
    showMsg("ok", "");

    await loadRows();

    renderFilters();
    renderAll();

    showMsg("ok", `RISQ 3.2 library loaded: ${state.rows.length} records.`);
  }

  function handleError(error) {
    console.error(error);
    showMsg("warn", String(error?.message || error || "Unknown error"));
  }

  async function init() {
    window.CSVB_RISQ_QEDITOR_BUILD = BUILD;

    cacheDom();

    state.sb = window.AUTH.ensureSupabase();

    const bundle = await window.AUTH.setupAuthButtons({
      badgeId: "userBadge",
      loginBtnId: "loginBtn",
      logoutBtnId: "logoutBtn",
      switchBtnId: "switchUserBtn"
    });

    if (!bundle?.session?.user) {
      showMsg("warn", "You are logged out. Please login.");
      return;
    }

    state.profile = bundle.profile || {};

    bindEvents();

    await reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();
