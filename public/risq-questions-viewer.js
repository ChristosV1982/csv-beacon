/* public/risq-questions-viewer.js */
/* C.S.V. BEACON – RISQ Questions Viewer read-only frontend */

(() => {
  "use strict";

  const BUILD = "RISQ-QUESTIONS-VIEWER-20260520_3";
  window.CSVB_RISQ_QUESTIONS_VIEWER_BUILD = BUILD;

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
      "warnBox", "okBox", "userBadge", "switchUserBtn", "logoutBtn",
      "statVisible", "statActive", "statRemoved", "statSections", "statNoGuide", "statInferred",
      "filterSection", "filterOrigin", "filterStatus", "filterMarker", "filterGuide", "searchInput", "clearFiltersBtn",
      "printExportMenu", "printExportMenuBtn", "copySelectedReferenceBtn", "printSelectedQuestionBtn", "printFilteredListBtn",
      "exportFilteredCsvBtn", "exportSelectedTxtBtn", "exportSelectedJsonBtn",
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

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
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
        if (box.textContent === message) {
          box.textContent = "";
          box.style.display = "none";
        }
      }, type === "ok" ? 2400 : 5200);
    }
  }

  function warn(message) {
    showMsg("warn", message);
  }

  function ok(message) {
    showMsg("ok", message);
  }

  async function writeClipboard(text) {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard API is not available in this browser/session.");
    }
    await navigator.clipboard.writeText(text);
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
    if (!select) return;
    Array.from(select.options || []).forEach((option) => {
      option.selected = false;
    });
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function option(value, label, selected = false) {
    return `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
  }

  function isDeleted(row) {
    return row?.is_deleted === true || !!row?.deleted_at;
  }

  function displayMarker(row) {
    return row?.inspection_marker || "Blank";
  }

  function statusKey(row) {
    if (isDeleted(row)) return "deleted";
    if (row?.is_removed_question) return "removed";
    return "active";
  }

  function markerKey(row) {
    return row?.inspection_marker || "blank";
  }

  function sectionLabel(row) {
    return `${row.section_code} — ${row.section_title}`;
  }

  function originLabel(row) {
    return row.question_origin === "company_specific"
      ? `Company-specific${row.company_name ? " / " + row.company_name : ""}`
      : "Standard RISQ";
  }

  function selectedRow() {
    return state.filtered.find((r) => r.id === state.selectedId) || state.filtered[0] || null;
  }

  function renderFilters() {
    const selectedSections = selectedMultiValues("filterSection");

    const sections = Array.from(
      new Map(
        state.rows.map((row) => [row.section_code, sectionLabel(row)])
      ).entries()
    ).sort((a, b) => String(a[0]).localeCompare(String(b[0])));

    if (el.filterSection) {
      el.filterSection.innerHTML = sections
        .map(([code, label]) => option(code, label, selectedSections.has(code)))
        .join("");
    }

    [el.filterSection, el.filterOrigin, el.filterStatus, el.filterMarker, el.filterGuide]
      .filter(Boolean)
      .forEach((select) => select.dispatchEvent(new Event("change", { bubbles: true })));
  }

  function rowMatches(row) {
    const sections = selectedMultiValues("filterSection");
    const origins = selectedMultiValues("filterOrigin");
    const statuses = selectedMultiValues("filterStatus");
    const markers = selectedMultiValues("filterMarker");
    const guides = selectedMultiValues("filterGuide");
    const q = norm(el.searchInput?.value);

    if (sections.size && !sections.has(row.section_code)) return false;
    if (origins.size && !origins.has(row.question_origin || "standard")) return false;
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
        row.question_origin,
        row.company_name,
        row.esms_references,
        row.esms_forms,
        row.remarks,
        row.delete_reason
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
    el.statActive.textContent = String(all.filter((r) => !r.is_removed_question && r.is_active !== false && !isDeleted(r)).length);
    el.statRemoved.textContent = String(all.filter((r) => r.is_removed_question).length);
    el.statSections.textContent = String(new Set(all.map((r) => r.section_code)).size);
    el.statNoGuide.textContent = String(all.filter((r) => !r.is_removed_question && r.guide_status === "not_provided").length);
    el.statInferred.textContent = String(all.filter((r) => r.answer_options_inferred === true).length);
  }

  function renderList() {
    const rows = state.filtered;

    el.listMeta.textContent = `${rows.length} record(s) shown from ${state.rows.length} available RISQ records.`;

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
      const deleted = isDeleted(row) ? `<span class="pill pill-danger">Deleted</span>` : "";
      const noGuide = !row.is_removed_question && row.guide_status === "not_provided" ? `<span class="pill pill-warn">No Guide</span>` : "";
      const inferred = row.answer_options_inferred ? `<span class="pill pill-warn">Inferred Answers</span>` : "";
      const companySpecific = row.question_origin === "company_specific" ? `<span class="pill">Company</span>` : "";

      return `
        <div class="q-item${active}" data-risq-id="${esc(row.id)}">
          <div class="q-no">${esc(row.internal_question_no)} <span class="q-mini">(printed ${esc(row.printed_question_no)})</span></div>
          <div class="q-sub">${esc(row.question_text || "—")}</div>
          <div class="q-mini">${esc(row.section_code)} / ${esc(row.section_title)} / Marker: ${esc(displayMarker(row))}</div>
          <div class="pill-row">${companySpecific}${removed}${deleted}${noGuide}${inferred}</div>
        </div>
      `;
    }).join("");

    el.questionList.querySelectorAll("[data-risq-id]").forEach((node) => {
      node.addEventListener("click", () => {
        state.selectedId = node.getAttribute("data-risq-id") || "";
        renderAll();
      });
    });

    renderDetail(selectedRow());
  }

  function renderDetail(row) {
    if (!row) {
      el.detailMeta.textContent = "No question selected.";
      el.detailBody.innerHTML = `<div class="empty">Select a RISQ question from the list.</div>`;
      return;
    }

    el.detailMeta.textContent = `${row.section_code} / ${row.section_title}`;

    const originPill = row.question_origin === "company_specific"
      ? `<span class="pill">Company-specific</span>`
      : `<span class="pill pill-muted">Standard RISQ</span>`;

    const deletedPill = isDeleted(row) ? `<span class="pill pill-danger">Deleted</span>` : "";
    const removedPill = row.is_removed_question ? `<span class="pill pill-danger">Removed Question</span>` : `<span class="pill">Active Question</span>`;
    const guidePill = row.guide_status === "not_provided"
      ? `<span class="pill pill-warn">Guide to Inspection Not Provided</span>`
      : row.guide_status === "removed"
        ? `<span class="pill pill-muted">Guide Removed</span>`
        : `<span class="pill">Guide Provided</span>`;
    const inferredPill = row.answer_options_inferred ? `<span class="pill pill-warn">Answer Options Inferred</span>` : "";

    const guideText = row.guide_to_inspection
      ? esc(row.guide_to_inspection)
      : row.is_removed_question
        ? "This item is marked as removed in the RISQ publication."
        : "No Guide to Inspection text is provided for this question in the extracted RISQ source.";

    el.detailBody.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <div class="detail-number">${esc(row.internal_question_no)}</div>
          <div class="section-meta">Printed RISQ number: ${esc(row.printed_question_no)}</div>
        </div>
      </div>

      <div class="pill-row">
        ${originPill}
        ${deletedPill}
        ${removedPill}
        ${guidePill}
        ${inferredPill}
        <span class="pill pill-muted">Answer: ${esc(row.answer_type || "—")}</span>
        <span class="pill pill-muted">Marker: ${esc(displayMarker(row))}</span>
      </div>

      <div class="detail-question">${esc(row.question_text || "—")}</div>

      <div class="info-grid">
        <div class="info-box"><div class="info-label">Question Set</div><div class="info-value">${esc(row.short_name || "RISQ")} ${esc(row.version || "3.2")}</div></div>
        <div class="info-box"><div class="info-label">Section</div><div class="info-value">${esc(row.section_code)}\n${esc(row.section_title)}</div></div>
        <div class="info-box"><div class="info-label">Source Pages</div><div class="info-value">${esc(row.source_page_start || "—")} - ${esc(row.source_page_end || "—")}</div></div>
        <div class="info-box"><div class="info-label">Answer Options</div><div class="info-value">${Array.isArray(row.answer_options) ? esc(row.answer_options.join(" / ")) : esc(JSON.stringify(row.answer_options || []))}</div></div>
        <div class="info-box"><div class="info-label">Mapping Source</div><div class="info-value">${esc(row.mapping_source || "none")}</div></div>
        <div class="info-box"><div class="info-label">Origin</div><div class="info-value">${esc(originLabel(row))}</div></div>
      </div>

      ${isDeleted(row) ? `<div class="content-section"><div class="content-section-title">Delete Reason</div><div class="content-section-body">${esc(row.delete_reason || "—")}</div></div>` : ""}

      <div class="content-section"><div class="content-section-title">Guide to Inspection</div><div class="content-section-body">${guideText}</div></div>
      <div class="content-section"><div class="content-section-title">eSMS Reference(s)</div><div class="content-section-body">${esc(row.esms_references || "—")}</div></div>
      <div class="content-section"><div class="content-section-title">eSMS Form(s)</div><div class="content-section-body">${esc(row.esms_forms || "—")}</div></div>
      <div class="content-section"><div class="content-section-title">Remarks</div><div class="content-section-body">${esc(row.remarks || "—")}</div></div>
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
    clearMultiSelect(el.filterOrigin);
    clearMultiSelect(el.filterStatus);
    clearMultiSelect(el.filterMarker);
    clearMultiSelect(el.filterGuide);
    if (el.searchInput) el.searchInput.value = "";
    renderAll();
  }

  function csvCell(value) {
    const s = String(value ?? "");
    return `"${s.replaceAll('"', '""')}"`;
  }

  function csvRows(rows) {
    const headers = [
      "Internal Question No",
      "Printed Question No",
      "Origin",
      "Company",
      "Deleted",
      "Delete Reason",
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

    rows.forEach((row) => {
      lines.push([
        row.internal_question_no,
        row.printed_question_no,
        row.question_origin,
        row.company_name,
        isDeleted(row) ? "Yes" : "No",
        row.delete_reason,
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

    return lines.join("\n");
  }

  function downloadText(filename, content, type = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportFilteredCsv() {
    downloadText(
      `risq_3_2_questions_${new Date().toISOString().slice(0, 10)}.csv`,
      csvRows(state.filtered),
      "text/csv;charset=utf-8"
    );
  }

  function selectedReferenceText(row) {
    if (!row) return "";
    return `${row.internal_question_no} — ${row.question_text || ""}`.trim();
  }

  async function copySelectedReference() {
    const row = selectedRow();
    if (!row) return warn("No RISQ question is selected.");

    try {
      await writeClipboard(selectedReferenceText(row));
      ok("Selected RISQ question reference copied.");
    } catch (error) {
      warn("Copy failed: " + safeStr(error?.message || error));
    }
  }

  function selectedTxt(row) {
    if (!row) return "";
    return [
      `RISQ Question: ${row.internal_question_no}`,
      `Printed No: ${row.printed_question_no}`,
      `Section: ${row.section_code} / ${row.section_title}`,
      `Origin: ${originLabel(row)}`,
      `Status: ${statusKey(row)}`,
      `Marker: ${displayMarker(row)}`,
      `Answer Type: ${row.answer_type || ""}`,
      `Answer Options: ${Array.isArray(row.answer_options) ? row.answer_options.join(" / ") : JSON.stringify(row.answer_options || [])}`,
      "",
      "Question Text:",
      row.question_text || "",
      "",
      "Guide to Inspection:",
      row.guide_to_inspection || "",
      "",
      "eSMS Reference(s):",
      row.esms_references || "",
      "",
      "eSMS Form(s):",
      row.esms_forms || "",
      "",
      "Remarks:",
      row.remarks || ""
    ].join("\n");
  }

  function exportSelectedTxt() {
    const row = selectedRow();
    if (!row) return warn("No RISQ question is selected.");
    downloadText(`RISQ_${row.internal_question_no || "question"}.txt`, selectedTxt(row));
  }

  function exportSelectedJson() {
    const row = selectedRow();
    if (!row) return warn("No RISQ question is selected.");
    downloadText(`RISQ_${row.internal_question_no || "question"}.json`, JSON.stringify(row, null, 2), "application/json;charset=utf-8");
  }

  function printWindow(title, bodyHtml) {
    const win = window.open("", "", "width=1100,height=900");
    if (!win) return warn("Print window was blocked by the browser. Allow pop-ups for this site and try again.");

    const css = `
      body { margin:0; padding:14px; font-family:Arial,Segoe UI,sans-serif; color:#111827; background:#fff; font-size:12px; line-height:1.35; }
      .print-header { border-bottom:2px solid #062A5E; padding-bottom:8px; margin-bottom:12px; }
      .print-title { color:#062A5E; font-size:18px; font-weight:800; margin:0 0 4px; }
      .print-subtitle { color:#374151; font-size:11px; }
      .section { margin:10px 0; border:1px solid #D6E4F5; border-radius:8px; break-inside:avoid; page-break-inside:avoid; }
      .section-title { background:#F2F7FD; color:#062A5E; font-weight:800; padding:6px 8px; border-bottom:1px solid #D6E4F5; }
      .section-body { padding:8px; white-space:pre-wrap; }
      table { width:100%; border-collapse:collapse; }
      th, td { border:1px solid #D6E4F5; padding:6px 7px; vertical-align:top; }
      th { background:#F2F7FD; color:#062A5E; text-align:left; }
      @media print { body { padding:5mm; } @page { size:A4 portrait; margin:7mm; } .section, tr { break-inside:avoid; page-break-inside:avoid; } }
    `;

    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function printSection(title, body) {
    return `<div class="section"><div class="section-title">${esc(title)}</div><div class="section-body">${esc(body || "—")}</div></div>`;
  }

  function printSelectedQuestion() {
    const row = selectedRow();
    if (!row) return warn("No RISQ question is selected.");

    const html = `
      <div class="print-header">
        <div class="print-title">C.S.V. BEACON – RISQ 3.2 Question</div>
        <div class="print-subtitle">Generated ${esc(new Date().toLocaleString())}</div>
      </div>
      ${printSection("Question", selectedTxt(row))}
    `;
    printWindow(`RISQ ${row.internal_question_no}`, html);
  }

  function printFilteredList() {
    const rows = state.filtered;
    const html = `
      <div class="print-header">
        <div class="print-title">C.S.V. BEACON – RISQ 3.2 Filtered Question List</div>
        <div class="print-subtitle">${rows.length} questions / Generated ${esc(new Date().toLocaleString())}</div>
      </div>
      <table>
        <thead><tr><th>No.</th><th>Printed</th><th>Section</th><th>Question</th><th>Status</th><th>Marker</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${esc(row.internal_question_no)}</td>
              <td>${esc(row.printed_question_no)}</td>
              <td>${esc(row.section_code)} / ${esc(row.section_title)}</td>
              <td>${esc(row.question_text)}</td>
              <td>${esc(statusKey(row))}</td>
              <td>${esc(displayMarker(row))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
    printWindow("RISQ filtered list", html);
  }

  function toggleActionMenu(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    el.printExportMenu?.classList.toggle("open");
  }

  function bindEvents() {
    el.clearFiltersBtn?.addEventListener("click", clearFilters);
    el.copySelectedReferenceBtn?.addEventListener("click", copySelectedReference);
    el.printSelectedQuestionBtn?.addEventListener("click", printSelectedQuestion);
    el.printFilteredListBtn?.addEventListener("click", printFilteredList);
    el.exportFilteredCsvBtn?.addEventListener("click", exportFilteredCsv);
    el.exportSelectedTxtBtn?.addEventListener("click", exportSelectedTxt);
    el.exportSelectedJsonBtn?.addEventListener("click", exportSelectedJson);
    el.printExportMenuBtn?.addEventListener("click", toggleActionMenu);

    document.addEventListener("click", (ev) => {
      if (el.printExportMenu && !el.printExportMenu.contains(ev.target)) {
        el.printExportMenu.classList.remove("open");
      }
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") el.printExportMenu?.classList.remove("open");
    });

    [el.filterSection, el.filterOrigin, el.filterStatus, el.filterMarker, el.filterGuide]
      .filter(Boolean)
      .forEach((select) => select.addEventListener("change", renderAll));

    el.searchInput?.addEventListener("input", renderAll);

    el.switchUserBtn?.addEventListener("click", async () => {
      if (window.AUTH?.switchUser) return window.AUTH.switchUser();
      window.location.href = "./login.html";
    });

    el.logoutBtn?.addEventListener("click", async () => {
      try { await state.sb.auth.signOut(); } catch (_) {}
      window.location.href = "./login.html";
    });
  }

  async function reload() {
    showMsg("warn", "");
    showMsg("ok", "");
    await loadRows();
    renderFilters();
    renderAll();
    ok(`RISQ 3.2 viewer loaded: ${state.rows.length} records.`);
  }

  function handleError(error) {
    console.error(error);
    warn(String(error?.message || error || "Unknown error"));
  }

  function ensureAiHelperLoaded() {
    if (window.CSVB_RISQ_VIEWER_AI_SEARCH_BUILD) return;
    if (document.querySelector('script[data-csvb-risq-ai-loader="1"]')) return;

    const script = document.createElement("script");
    script.src = "./risq-questions-viewer-ai.js?v=20260520_1";
    script.defer = true;
    script.dataset.csvbRisqAiLoader = "1";
    document.body.appendChild(script);
  }

  function ensurePolishHelperLoaded() {
    if (window.CSVB_RISQ_VIEWER_POLISH_BUILD) return;
    if (document.querySelector('script[data-csvb-risq-polish-loader="1"]')) return;

    const script = document.createElement("script");
    script.src = "./risq-questions-viewer-polish.js?v=20260520_1";
    script.defer = true;
    script.dataset.csvbRisqPolishLoader = "1";
    document.body.appendChild(script);
  }

  async function init() {
    cacheDom();

    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
      throw new Error("Authentication helper is not available.");
    }

    state.sb = window.AUTH.ensureSupabase();
    const bundle = await window.AUTH.getSessionUserProfile();
    state.profile = bundle?.profile || null;

    if (el.userBadge) {
      const username = state.profile?.username || bundle?.session?.user?.email || "User";
      const role = state.profile?.role || "";
      el.userBadge.textContent = `${username}${role ? " · " + role : ""}`;
    }

    bindEvents();
    await reload();

    window.CSVB_RISQ_QUESTIONS_VIEWER = {
      build: BUILD,
      reload,
      getRows: () => state.rows.slice(),
      getFiltered: () => state.filtered.slice(),
      getSelected: () => selectedRow()
    };

    ensureAiHelperLoaded();
    ensurePolishHelperLoaded();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(handleError));
  } else {
    init().catch(handleError);
  }
})();