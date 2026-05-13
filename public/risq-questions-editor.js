/* public/risq-questions-editor.js */
/* C.S.V. BEACON – RISQ-07B RISQ Questions Editor with edit controls */

(() => {
  "use strict";

  const BUILD = "RISQ-QEDITOR-EDIT-07B-20260513-1";

  const state = {
    sb: null,
    profile: null,
    isPlatform: false,
    actorCompanyId: null,
    companies: [],
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
      }, type === "ok" ? 2500 : 5000);
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

  function statusKey(row) {
    return row.is_removed_question ? "removed" : "active";
  }

  function markerKey(row) {
    return row.inspection_marker || "blank";
  }

  function sectionLabel(row) {
    return `${row.section_code} — ${row.section_title}`;
  }

  function originLabel(row) {
    return row.question_origin === "company_specific"
      ? `Company-specific${row.company_name ? " / " + row.company_name : ""}`
      : "Standard RISQ";
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadActorContext() {
    state.isPlatform = await rpc("risq_is_platform_actor");
    state.actorCompanyId = await rpc("risq_actor_company_id");

    if (state.isPlatform) {
      const { data, error } = await state.sb
        .from("companies")
        .select("id, company_name")
        .order("company_name", { ascending: true });

      if (error) {
        console.warn("Could not load companies for RISQ editor:", error);
        state.companies = [];
      } else {
        state.companies = data || [];
      }
    }
  }

  function ensureTopCreateButton() {
    const topActions = el.exportBtn?.parentElement;
    if (!topActions) return;

    if (document.getElementById("newCompanyQuestionBtn")) return;

    const allowed = state.rows.some((row) => row.can_create_company_question === true)
      || ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(state.profile?.role);

    if (!allowed) return;

    const btn = document.createElement("button");
    btn.id = "newCompanyQuestionBtn";
    btn.className = "btn";
    btn.type = "button";
    btn.textContent = "+ New Company Question";
    btn.addEventListener("click", () => openCompanyQuestionCreateModal());

    topActions.appendChild(btn);
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
        row.question_origin,
        row.company_name,
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
    el.statActive.textContent = String(all.filter((r) => !r.is_removed_question && r.is_active !== false).length);
    el.statRemoved.textContent = String(all.filter((r) => r.is_removed_question).length);
    el.statSections.textContent = String(new Set(all.map((r) => r.section_code)).size);
    el.statNoGuide.textContent = String(all.filter((r) => !r.is_removed_question && r.guide_status === "not_provided").length);
    el.statInferred.textContent = String(all.filter((r) => r.answer_options_inferred === true).length);
  }

  function renderList() {
    const rows = state.filtered;

    el.listMeta.textContent = `${rows.length} record(s) shown from ${state.rows.length} imported/available RISQ records.`;

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
      const companySpecific = row.question_origin === "company_specific" ? `<span class="pill">Company</span>` : "";

      return `
        <div class="q-item${active}" data-risq-id="${esc(row.id)}">
          <div class="q-no">${esc(row.internal_question_no)} <span class="q-mini">(printed ${esc(row.printed_question_no)})</span></div>
          <div class="q-sub">${esc(row.question_text || "—")}</div>
          <div class="q-mini">${esc(row.section_code)} / ${esc(row.section_title)} / Marker: ${esc(displayMarker(row))}</div>
          <div class="pill-row">${companySpecific}${removed}${noGuide}${inferred}</div>
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

    const originPill = row.question_origin === "company_specific"
      ? `<span class="pill">Company-specific</span>`
      : `<span class="pill pill-muted">Standard RISQ</span>`;

    const guideText = row.guide_to_inspection
      ? esc(row.guide_to_inspection)
      : row.is_removed_question
        ? "This item is marked as removed in the RISQ publication."
        : "No Guide to Inspection text is provided for this question in the extracted RISQ source.";

    const buttons = [];
    if (row.can_edit_mapping) {
      buttons.push(`<button class="btn2" type="button" id="editMappingBtn">Edit eSMS Mapping</button>`);
    }
    if (row.can_edit_standard_question) {
      buttons.push(`<button class="btn2" type="button" id="editStandardQuestionBtn">Edit Standard Question</button>`);
    }
    if (row.can_edit_company_question) {
      buttons.push(`<button class="btn2" type="button" id="editCompanyQuestionBtn">Edit Company Question</button>`);
    }

    el.detailBody.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <div class="detail-number">${esc(row.internal_question_no)}</div>
          <div class="section-meta">Printed RISQ number: ${esc(row.printed_question_no)}</div>
        </div>
        <div class="topbar-actions">${buttons.join("")}</div>
      </div>

      <div class="pill-row">
        ${originPill}
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
          <div class="info-label">Origin</div>
          <div class="info-value">${esc(originLabel(row))}</div>
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

    $("editMappingBtn")?.addEventListener("click", () => openMappingModal(row));
    $("editStandardQuestionBtn")?.addEventListener("click", () => openStandardQuestionModal(row));
    $("editCompanyQuestionBtn")?.addEventListener("click", () => openCompanyQuestionEditModal(row));
  }

  function renderAll() {
    calculateFiltered();
    renderStats();
    renderList();
    ensureTopCreateButton();
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
      "Origin",
      "Company",
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
        row.question_origin,
        row.company_name,
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

    await loadActorContext();
    await loadRows();

    renderFilters();
    renderAll();

    showMsg("ok", `RISQ 3.2 library loaded: ${state.rows.length} records.`);
  }

  function handleError(error) {
    console.error(error);
    showMsg("warn", String(error?.message || error || "Unknown error"));
  }

  function injectModalStyles() {
    if (document.getElementById("risqEditorModalStyles")) return;

    const style = document.createElement("style");
    style.id = "risqEditorModalStyles";
    style.textContent = `
      .risq-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(3,27,63,.46);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow: auto;
        padding: 20px 10px;
      }

      .risq-modal {
        width: min(1100px, 96vw);
        background: #fff;
        border: 1px solid #c9d9ec;
        border-radius: 16px;
        box-shadow: 0 24px 72px rgba(3,27,63,.28);
        overflow: hidden;
      }

      .risq-modal-head {
        padding: 12px 14px;
        border-bottom: 1px solid #dce8f6;
        background: linear-gradient(180deg, #fbfdff, #f4f8fc);
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .risq-modal-title {
        color: #062a5e;
        font-weight: 950;
        font-size: 1.08rem;
      }

      .risq-modal-subtitle {
        color: #52677f;
        font-weight: 700;
        font-size: .84rem;
        margin-top: 3px;
      }

      .risq-modal-body {
        padding: 12px 14px;
      }

      .risq-modal-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(260px, 1fr));
        gap: 10px;
      }

      .risq-modal-wide {
        grid-column: 1 / -1;
      }

      .risq-modal label {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .risq-modal label span {
        color: #062a5e;
        font-weight: 900;
        font-size: .82rem;
      }

      .risq-modal input,
      .risq-modal select,
      .risq-modal textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #bfd5ee;
        border-radius: 10px;
        padding: 8px 10px;
        font-family: inherit;
        font-size: .88rem;
        color: #10233f;
        background: #fff;
      }

      .risq-modal textarea {
        min-height: 92px;
        resize: vertical;
      }

      .risq-modal textarea.large {
        min-height: 210px;
      }

      .risq-modal-actions {
        padding: 12px 14px;
        border-top: 1px solid #dce8f6;
        background: #f8fbfe;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .risq-check-row {
        display: flex !important;
        flex-direction: row !important;
        align-items: center;
        gap: 8px !important;
        color: #062a5e;
        font-weight: 900;
      }

      .risq-check-row input {
        width: auto;
      }

      @media(max-width: 850px) {
        .risq-modal-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    document.querySelector(".risq-modal-backdrop")?.remove();
  }

  function modalShell(title, subtitle, bodyHtml, actionsHtml) {
    injectModalStyles();
    document.querySelector(".risq-modal-backdrop")?.remove();

    document.body.insertAdjacentHTML("beforeend", `
      <div class="risq-modal-backdrop">
        <div class="risq-modal">
          <div class="risq-modal-head">
            <div>
              <div class="risq-modal-title">${esc(title)}</div>
              <div class="risq-modal-subtitle">${esc(subtitle || "")}</div>
            </div>
            <button id="risqModalCloseBtn" class="btn2" type="button">Close</button>
          </div>
          <div class="risq-modal-body">${bodyHtml}</div>
          <div class="risq-modal-actions">${actionsHtml}</div>
        </div>
      </div>
    `);

    $("risqModalCloseBtn")?.addEventListener("click", closeModal);
  }

  function currentRow() {
    return state.rows.find((row) => row.id === state.selectedId) || null;
  }

  function mappingTargetCompanyId(row) {
    if (row.question_origin === "company_specific") return row.company_id || null;
    if (state.isPlatform) return null;
    return state.actorCompanyId || null;
  }

  function openMappingModal(row) {
    const targetCompanyId = mappingTargetCompanyId(row);
    const targetLabel = targetCompanyId
      ? "Company-specific mapping"
      : "Global/default RISQ mapping";

    modalShell(
      "Edit eSMS Mapping",
      `${row.internal_question_no} / ${targetLabel}`,
      `
        <div class="risq-modal-grid">
          <label class="risq-modal-wide">
            <span>eSMS Reference(s)</span>
            <textarea id="mapEsmsRefs">${esc(row.esms_references || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>eSMS Form(s)</span>
            <textarea id="mapEsmsForms">${esc(row.esms_forms || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Remarks</span>
            <textarea id="mapRemarks">${esc(row.remarks || "")}</textarea>
          </label>
        </div>
      `,
      `
        <button id="mapCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="mapSaveBtn" class="btn" type="button">Save Mapping</button>
      `
    );

    $("mapCancelBtn").addEventListener("click", closeModal);
    $("mapSaveBtn").addEventListener("click", async () => {
      try {
        $("mapSaveBtn").disabled = true;
        $("mapSaveBtn").textContent = "Saving...";

        await rpc("risq_save_question_mapping", {
          p_question_id: row.id,
          p_company_id: targetCompanyId,
          p_esms_references: $("mapEsmsRefs").value,
          p_esms_forms: $("mapEsmsForms").value,
          p_remarks: $("mapRemarks").value
        });

        closeModal();
        await reload();
        state.selectedId = row.id;
        renderAll();
        showMsg("ok", "RISQ eSMS mapping saved.");
      } catch (error) {
        handleError(error);
        $("mapSaveBtn").disabled = false;
        $("mapSaveBtn").textContent = "Save Mapping";
      }
    });
  }

  function openStandardQuestionModal(row) {
    modalShell(
      "Edit Standard RISQ Question",
      `${row.internal_question_no} / Platform-only / audited`,
      `
        <div class="risq-modal-grid">
          <label class="risq-modal-wide">
            <span>Question Text</span>
            <textarea id="stdQuestionText" class="large">${esc(row.question_text || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Guide to Inspection</span>
            <textarea id="stdGuide" class="large">${esc(row.guide_to_inspection || "")}</textarea>
          </label>

          <label>
            <span>Inspection Marker</span>
            <select id="stdMarker">
              ${option("", "Blank", !row.inspection_marker)}
              ${option("M", "M", row.inspection_marker === "M")}
              ${option("V", "V", row.inspection_marker === "V")}
              ${option("V & M", "V & M", row.inspection_marker === "V & M")}
            </select>
          </label>

          <label>
            <span>Answer Type</span>
            <select id="stdAnswerType">
              ${option("yes_no_na_nv", "YES / NO / N/A / N/V", row.answer_type === "yes_no_na_nv")}
              ${option("removed", "Removed", row.answer_type === "removed")}
              ${option("text", "Text", row.answer_type === "text")}
            </select>
          </label>

          <label class="risq-check-row">
            <input id="stdIsActive" type="checkbox" ${row.is_active !== false ? "checked" : ""} />
            <span>Active</span>
          </label>

          <label class="risq-modal-wide">
            <span>Change Reason / Audit Note</span>
            <textarea id="stdReason" placeholder="Required for standard RISQ question changes."></textarea>
          </label>
        </div>
      `,
      `
        <button id="stdCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="stdSaveBtn" class="btn" type="button">Save Standard Question</button>
      `
    );

    $("stdCancelBtn").addEventListener("click", closeModal);
    $("stdSaveBtn").addEventListener("click", async () => {
      try {
        const reason = $("stdReason").value.trim();
        if (!reason) throw new Error("Change Reason is required for standard RISQ question edits.");

        $("stdSaveBtn").disabled = true;
        $("stdSaveBtn").textContent = "Saving...";

        const answerType = $("stdAnswerType").value;
        const answerOptions = answerType === "yes_no_na_nv" ? ["YES", "NO", "N/A", "N/V"] : [];

        await rpc("risq_update_standard_question", {
          p_question_id: row.id,
          p_question_text: $("stdQuestionText").value,
          p_guide_to_inspection: $("stdGuide").value,
          p_inspection_marker: $("stdMarker").value,
          p_answer_type: answerType,
          p_answer_options: answerOptions,
          p_is_active: $("stdIsActive").checked,
          p_change_reason: reason
        });

        closeModal();
        await reload();
        state.selectedId = row.id;
        renderAll();
        showMsg("ok", "Standard RISQ question updated.");
      } catch (error) {
        handleError(error);
        $("stdSaveBtn").disabled = false;
        $("stdSaveBtn").textContent = "Save Standard Question";
      }
    });
  }

  function sectionOptions(selectedCode = "") {
    const sections = Array.from(
      new Map(
        state.rows
          .filter((row) => row.question_origin === "standard")
          .map((row) => [row.section_code, sectionLabel(row)])
      ).entries()
    ).sort((a, b) => a[0].localeCompare(b[0]));

    return sections.map(([code, label]) => option(code, label, code === selectedCode)).join("");
  }

  function companyOptions(selectedId = "") {
    return state.companies
      .map((c) => option(c.id, c.company_name || c.id, c.id === selectedId))
      .join("");
  }

  function openCompanyQuestionCreateModal() {
    const mustSelectCompany = state.isPlatform && !state.actorCompanyId;
    const defaultCompanyId = state.actorCompanyId || "";

    modalShell(
      "Create Company-Specific RISQ Question",
      "Creates an additional company question without changing the standard RISQ dataset.",
      `
        <div class="risq-modal-grid">
          ${
            state.isPlatform
              ? `<label>
                  <span>Company</span>
                  <select id="newCompanyId">
                    <option value="">Select company...</option>
                    ${companyOptions(defaultCompanyId)}
                  </select>
                </label>`
              : `<input id="newCompanyId" type="hidden" value="${esc(defaultCompanyId)}" />`
          }

          <label>
            <span>Section</span>
            <select id="newSectionCode">${sectionOptions()}</select>
          </label>

          <label>
            <span>Inspection Marker</span>
            <select id="newMarker">
              ${option("", "Blank")}
              ${option("M", "M")}
              ${option("V", "V")}
              ${option("V & M", "V & M")}
            </select>
          </label>

          <label class="risq-modal-wide">
            <span>Question Text</span>
            <textarea id="newQuestionText" class="large"></textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Guide to Inspection</span>
            <textarea id="newGuide" class="large"></textarea>
          </label>

          <label class="risq-modal-wide">
            <span>eSMS Reference(s)</span>
            <textarea id="newEsmsRefs"></textarea>
          </label>

          <label class="risq-modal-wide">
            <span>eSMS Form(s)</span>
            <textarea id="newEsmsForms"></textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Remarks</span>
            <textarea id="newRemarks"></textarea>
          </label>
        </div>
      `,
      `
        <button id="newCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="newSaveBtn" class="btn" type="button">Create Company Question</button>
      `
    );

    $("newCancelBtn").addEventListener("click", closeModal);
    $("newSaveBtn").addEventListener("click", async () => {
      try {
        const companyId = $("newCompanyId").value || null;
        const sectionCode = $("newSectionCode").value;
        const questionText = $("newQuestionText").value.trim();

        if (mustSelectCompany && !companyId) throw new Error("Company is required.");
        if (!sectionCode) throw new Error("Section is required.");
        if (!questionText) throw new Error("Question Text is required.");

        $("newSaveBtn").disabled = true;
        $("newSaveBtn").textContent = "Creating...";

        const result = await rpc("risq_create_company_question", {
          p_company_id: companyId,
          p_section_code: sectionCode,
          p_question_text: $("newQuestionText").value,
          p_guide_to_inspection: $("newGuide").value,
          p_inspection_marker: $("newMarker").value,
          p_esms_references: $("newEsmsRefs").value,
          p_esms_forms: $("newEsmsForms").value,
          p_remarks: $("newRemarks").value
        });

        closeModal();
        await reload();
        state.selectedId = result?.question_id || "";
        renderAll();
        showMsg("ok", `Company-specific RISQ question created: ${result?.internal_question_no || ""}`);
      } catch (error) {
        handleError(error);
        $("newSaveBtn").disabled = false;
        $("newSaveBtn").textContent = "Create Company Question";
      }
    });
  }

  function openCompanyQuestionEditModal(row) {
    modalShell(
      "Edit Company-Specific RISQ Question",
      `${row.internal_question_no} / ${row.company_name || "Company"}`,
      `
        <div class="risq-modal-grid">
          <label>
            <span>Inspection Marker</span>
            <select id="cmpMarker">
              ${option("", "Blank", !row.inspection_marker)}
              ${option("M", "M", row.inspection_marker === "M")}
              ${option("V", "V", row.inspection_marker === "V")}
              ${option("V & M", "V & M", row.inspection_marker === "V & M")}
            </select>
          </label>

          <label class="risq-check-row">
            <input id="cmpIsActive" type="checkbox" ${row.is_active !== false ? "checked" : ""} />
            <span>Active</span>
          </label>

          <label class="risq-modal-wide">
            <span>Question Text</span>
            <textarea id="cmpQuestionText" class="large">${esc(row.question_text || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Guide to Inspection</span>
            <textarea id="cmpGuide" class="large">${esc(row.guide_to_inspection || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>eSMS Reference(s)</span>
            <textarea id="cmpEsmsRefs">${esc(row.esms_references || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>eSMS Form(s)</span>
            <textarea id="cmpEsmsForms">${esc(row.esms_forms || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Remarks</span>
            <textarea id="cmpRemarks">${esc(row.remarks || "")}</textarea>
          </label>

          <label class="risq-modal-wide">
            <span>Change Reason / Audit Note</span>
            <textarea id="cmpReason"></textarea>
          </label>
        </div>
      `,
      `
        <button id="cmpCancelBtn" class="btn2" type="button">Cancel</button>
        <button id="cmpSaveBtn" class="btn" type="button">Save Company Question</button>
      `
    );

    $("cmpCancelBtn").addEventListener("click", closeModal);
    $("cmpSaveBtn").addEventListener("click", async () => {
      try {
        const questionText = $("cmpQuestionText").value.trim();
        if (!questionText) throw new Error("Question Text is required.");

        $("cmpSaveBtn").disabled = true;
        $("cmpSaveBtn").textContent = "Saving...";

        await rpc("risq_update_company_question", {
          p_question_id: row.id,
          p_question_text: $("cmpQuestionText").value,
          p_guide_to_inspection: $("cmpGuide").value,
          p_inspection_marker: $("cmpMarker").value,
          p_is_active: $("cmpIsActive").checked,
          p_esms_references: $("cmpEsmsRefs").value,
          p_esms_forms: $("cmpEsmsForms").value,
          p_remarks: $("cmpRemarks").value,
          p_change_reason: $("cmpReason").value
        });

        closeModal();
        await reload();
        state.selectedId = row.id;
        renderAll();
        showMsg("ok", "Company-specific RISQ question updated.");
      } catch (error) {
        handleError(error);
        $("cmpSaveBtn").disabled = false;
        $("cmpSaveBtn").textContent = "Save Company Question";
      }
    });
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
