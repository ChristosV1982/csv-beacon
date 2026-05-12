// public/mooring-anchoring-checklist-run-actions-extension.js
// C.S.V. BEACON – MAI Checklist Workspace Restoration
// Restores MSMP checklist template selection, run loading, answer editing,
// completion, and draft void/delete on the dedicated component detail page.

(() => {
  "use strict";

  const BUILD = "MAI-CHECKLIST-WORKSPACE-20260512-1";

  const state = {
    sb: null,
    profile: null,
    component: null,
    templates: [],
    runs: [],
    activeRun: null,
    activeItems: [],
    activeAnswers: [],
    busy: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box = type === "ok" ? $("okBox") : $("warnBox");
    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
    } else if (message) {
      alert(message);
    }
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function formatNumber(value, decimals = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  }

  function runStatusClass(status) {
    if (status === "completed") return "pill-muted";
    if (status === "draft") return "pill-warn";
    if (status === "voided") return "pill-danger";
    return "";
  }

  function normalizeOptions(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  function optionId(option) {
    return option.option_id || option.id || option.selected_option_id || "";
  }

  function optionLabel(option) {
    const score = option.score_value !== null && option.score_value !== undefined && option.score_value !== ""
      ? `${option.score_value} — `
      : "";

    const label = option.option_label || option.label || "";
    const desc = option.option_description || option.description || "";

    if (label && desc) return `${score}${label} / ${desc}`;
    if (label) return `${score}${label}`;
    if (desc) return `${score}${desc}`;
    return optionId(option) || "Option";
  }

  function selectedActorText() {
    const p = state.profile || {};
    const name = p.username || p.full_name || p.email || "";
    const role = p.role || "";
    return [name, role].filter(Boolean).join(" / ");
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  function getComponentIdFromUrl() {
    return new URLSearchParams(location.search).get("id") || "";
  }

  function getUniqueIdFromPage() {
    const text = $("detailTitle")?.textContent || "";
    return text.trim();
  }

  async function getProfileSafe() {
    try {
      if (window.AUTH?.getSessionUserProfile) {
        const bundle = await window.AUTH.getSessionUserProfile();
        return bundle?.profile || null;
      }
    } catch (_) {}

    return null;
  }

  async function loadComponent() {
    const urlId = getComponentIdFromUrl();
    const uniqueId = getUniqueIdFromPage();

    if (state.component && (state.component.id === urlId || state.component.unique_id === uniqueId)) {
      return state.component;
    }

    let query = state.sb
      .from("mai_v_components_list")
      .select("*")
      .limit(1);

    if (urlId) {
      query = query.eq("id", urlId);
    } else if (uniqueId && uniqueId !== "Component Detail") {
      query = query.eq("unique_id", uniqueId);
    } else {
      return null;
    }

    const { data, error } = await query.single();
    if (error) throw error;

    state.component = data;
    return state.component;
  }

  async function loadTemplates() {
    const component = await loadComponent();
    if (!component) return [];

    try {
      const rows = await rpc("mai_get_available_inspection_templates", {
        p_component_id: component.id
      });

      state.templates = (rows || [])
        .filter((t) => t.is_active !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

      if (state.templates.length) return state.templates;
    } catch (error) {
      console.warn("Falling back to mai_v_inspection_templates_list:", error);
    }

    const { data, error } = await state.sb
      .from("mai_v_inspection_templates_list")
      .select("*")
      .eq("component_type_id", component.component_type_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    state.templates = (data || []).filter((t) =>
      !t.company_id || !component.company_id || t.company_id === component.company_id
    );

    return state.templates;
  }

  async function loadRuns() {
    const component = await loadComponent();
    if (!component) return [];

    const { data, error } = await state.sb
      .from("mai_v_inspection_runs_list")
      .select("*")
      .eq("component_id", component.id)
      .order("inspection_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    state.runs = data || [];

    if (state.activeRun && !state.runs.some((r) => r.run_id === state.activeRun.run_id)) {
      state.activeRun = null;
      state.activeItems = [];
      state.activeAnswers = [];
    }

    return state.runs;
  }

  async function loadRunDetail(runId) {
    const run = state.runs.find((r) => r.run_id === runId);
    if (!run) {
      toast("warn", "Selected checklist run was not found.");
      return;
    }

    const [itemsRes, answersRes] = await Promise.all([
      state.sb
        .from("mai_v_inspection_template_items_detail")
        .select("*")
        .eq("template_id", run.template_id)
        .order("item_no", { ascending: true })
        .order("sort_order", { ascending: true }),

      state.sb
        .from("mai_v_inspection_run_answers_detail")
        .select("*")
        .eq("run_id", run.run_id)
        .order("item_no", { ascending: true })
    ]);

    if (itemsRes.error) throw itemsRes.error;
    if (answersRes.error) throw answersRes.error;

    state.activeRun = run;
    state.activeItems = itemsRes.data || [];
    state.activeAnswers = answersRes.data || [];

    const select = $("checklistRunSelect");
    if (select) select.value = runId;

    await renderWorkspace();
  }

  function answerForItem(itemId) {
    return state.activeAnswers.find((a) => a.item_id === itemId) || null;
  }

  function activeRunIsLocked() {
    return ["completed", "voided"].includes(state.activeRun?.run_status);
  }

  function renderTemplateOptions() {
    if (!state.templates.length) {
      return `<option value="">No checklist template available for this component type</option>`;
    }

    return `<option value="">Select template...</option>` + state.templates.map((t) => `
      <option value="${esc(t.template_id)}">
        ${esc(t.form_code || "")} — ${esc(t.template_title || t.template_key || "Checklist Template")}
      </option>
    `).join("");
  }

  function renderRunOptions() {
    if (!state.runs.length) {
      return `<option value="">No checklist runs recorded yet</option>`;
    }

    return `<option value="">Select existing run...</option>` + state.runs.map((r) => `
      <option value="${esc(r.run_id)}">
        ${esc(formatDate(r.inspection_date))} / ${esc(r.form_code || "")} / ${esc(r.run_status || "—")}
        / ${esc(r.answered_items_count || 0)}-${esc(r.total_score_items_count || 0)}
      </option>
    `).join("");
  }

  function renderSummary() {
    const r = state.activeRun;

    if (!r) {
      return `<div id="checklistRunSummary" class="checklist-summary hidden"></div>`;
    }

    const status = r.run_status || "—";

    return `
      <div id="checklistRunSummary" class="checklist-summary">
        <div class="mai-checklist-summary-grid">
          <div><strong>Run:</strong> ${esc(r.form_code || "")} — ${esc(r.template_title || "")}</div>
          <div><strong>Status:</strong> <span class="pill ${runStatusClass(status)}">${esc(status)}</span></div>
          <div><strong>Date:</strong> ${esc(formatDate(r.inspection_date))}</div>
          <div><strong>Inspected by:</strong> ${esc(r.inspected_by || "—")}</div>
          <div><strong>Answered:</strong> ${esc(r.answered_items_count || 0)} / ${esc(r.total_score_items_count || 0)}</div>
          <div><strong>Average:</strong> ${esc(r.average_score === null || r.average_score === undefined ? "—" : formatNumber(r.average_score, 2))}</div>
          <div><strong>Condition:</strong> ${esc(r.calculated_condition || "—")}</div>
          <div><strong>Recommendation:</strong> ${esc(r.calculated_recommendation || "—")}</div>
          <div><strong>Final decision:</strong> ${esc(r.final_decision || "—")}</div>
          <div><strong>Marine review required:</strong> ${r.marine_department_review_required ? "Yes" : "No"}</div>
        </div>
      </div>
    `;
  }

  function renderChecklistItems() {
    if (!state.activeRun) {
      return `
        <div id="checklistWorkArea" class="hidden">
          <div class="hint-text">Load or start a checklist run first.</div>
        </div>
      `;
    }

    if (!state.activeItems.length) {
      return `
        <div id="checklistWorkArea">
          <div class="hint-text">No checklist items were found for this template.</div>
        </div>
      `;
    }

    const locked = activeRunIsLocked();

    const rows = state.activeItems.map((item) => {
      const answer = answerForItem(item.item_id);
      const selected = answer?.selected_option_id || "";
      const options = normalizeOptions(item.options);

      const optionSelect = options.length
        ? `
          <select data-mai-answer-option="${esc(item.item_id)}" ${locked ? "disabled" : ""}>
            <option value="">Select...</option>
            ${options.map((o) => `
              <option value="${esc(optionId(o))}" ${String(optionId(o)) === String(selected) ? "selected" : ""}>
                ${esc(optionLabel(o))}
              </option>
            `).join("")}
          </select>
        `
        : `<div class="hint-text">No scoring options configured.</div>`;

      return `
        <tr>
          <td>${esc(item.item_no || "")}</td>
          <td>
            <strong>${esc(item.item_title || item.item_key || "Checkpoint")}</strong>
            ${item.question_text ? `<div class="mini-meta">${esc(item.question_text)}</div>` : ""}
            ${item.help_text ? `<div class="field-help">${esc(item.help_text)}</div>` : ""}
            ${item.is_mandatory ? `<div class="field-help">Mandatory item</div>` : ""}
          </td>
          <td>${optionSelect}</td>
          <td>
            <textarea
              data-mai-answer-remarks="${esc(item.item_id)}"
              ${locked ? "disabled" : ""}
              placeholder="Remarks"
            >${esc(answer?.answer_remarks || "")}</textarea>
            ${answer?.discard_recommended ? `<div class="field-help"><strong>Discard trigger selected.</strong></div>` : ""}
          </td>
        </tr>
      `;
    }).join("");

    return `
      <div id="checklistWorkArea">
        <div class="table-wrap checklist-table-wrap">
          <table class="data-table checklist-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Checkpoint</th>
                <th>Score / Evaluation</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody id="checklistItemsTbody">
              ${rows}
            </tbody>
          </table>
        </div>

        <div class="form-grid two-col checklist-complete-grid">
          <label class="field">
            <span>Final Decision</span>
            <input
              id="checklistFinalDecision"
              value="${esc(state.activeRun.final_decision || "")}"
              placeholder="e.g. Continue / Monitor / Discard / Review"
              ${locked ? "disabled" : ""}
            />
          </label>

          <label class="field field-wide">
            <span>Final Decision Remarks</span>
            <textarea
              id="checklistFinalRemarks"
              placeholder="Final decision remarks"
              ${locked ? "disabled" : ""}
            >${esc(state.activeRun.final_decision_remarks || "")}</textarea>
          </label>
        </div>

        <div class="actions-row">
          <button id="saveChecklistAnswersBtn" class="btn2" type="button" ${locked ? "disabled" : ""}>Save Checklist Answers</button>
          <button id="completeChecklistRunBtn" class="btn" type="button" ${locked ? "disabled" : ""}>Complete Checklist</button>
        </div>

        ${locked ? `<div class="hint-text">This run is ${esc(state.activeRun.run_status)} and is read-only.</div>` : ""}
      </div>
    `;
  }

  function renderRunHistory() {
    if (!state.runs.length) {
      return `<div class="hint-text">No checklist runs yet.</div>`;
    }

    return state.runs.map((r) => {
      const isDraft = r.run_status === "draft";
      const isCompleted = r.run_status === "completed";
      const isVoided = r.run_status === "voided";

      return `
        <div class="mini-item" data-mai-run-id="${esc(r.run_id)}">
          <div class="mini-title">
            ${esc(r.form_code || "")} — ${esc(r.template_title || "")}
            <span class="pill ${runStatusClass(r.run_status)}">${esc(r.run_status || "—")}</span>
          </div>

          <div class="mini-meta">
            Inspection date: ${esc(formatDate(r.inspection_date))}
            / Inspected by: ${esc(r.inspected_by || "—")}
          </div>

          <div class="mini-meta">
            Answered: ${esc(r.answered_items_count || 0)} / ${esc(r.total_score_items_count || 0)}
            / Average: ${esc(r.average_score === null || r.average_score === undefined ? "—" : formatNumber(r.average_score, 2))}
          </div>

          ${r.calculated_condition ? `<div class="mini-meta">Condition: ${esc(r.calculated_condition)}</div>` : ""}
          ${r.calculated_recommendation ? `<div class="mini-meta">Recommendation: ${esc(r.calculated_recommendation)}</div>` : ""}
          ${r.final_decision ? `<div class="mini-meta">Final decision: ${esc(r.final_decision)}</div>` : ""}

          <div class="actions-row" style="margin-top:8px;">
            <button class="btn2 compact" type="button" data-mai-load-run="${esc(r.run_id)}">Load / View</button>

            ${
              isDraft
                ? `<button class="btnDanger compact" type="button" data-mai-delete-draft-run="${esc(r.run_id)}">Delete Draft</button>`
                : isCompleted
                  ? `<span class="hint-text">Completed run locked.</span>`
                  : isVoided
                    ? `<span class="hint-text">Draft already deleted / voided.</span>`
                    : ""
            }
          </div>
        </div>
      `;
    }).join("");
  }

  async function renderWorkspace() {
    const host = $("checklistRunsHistory");
    if (!host) return;

    host.setAttribute("data-mai-checklist-workspace-rendered", "1");

    const actor = selectedActorText();

    host.innerHTML = `
      <div class="mai-checklist-workspace">
        <div class="mai-checklist-head">
          <div>
            <h3>MSMP Checklist Inspection Workspace</h3>
            <div class="hint-text">
              Existing inspection forms were not lost. This workspace loads the stored template runs for the selected component.
            </div>
          </div>
          <button id="reloadChecklistRunsBtn" class="btn2 compact" type="button">Reload Checklist Runs</button>
        </div>

        <div class="checklist-start-grid">
          <label class="field">
            <span>Available Checklist Template</span>
            <select id="checklistTemplateSelect">${renderTemplateOptions()}</select>
          </label>

          <label class="field">
            <span>Inspection Date</span>
            <input id="checklistInspectionDate" type="date" value="${esc(todayIso())}" />
          </label>

          <label class="field">
            <span>Inspected By</span>
            <input id="checklistInspectedBy" value="${esc(actor)}" placeholder="Name / rank" />
          </label>

          <label class="field">
            <span>Template Run</span>
            <select id="checklistRunSelect">${renderRunOptions()}</select>
          </label>

          <label class="field field-wide">
            <span>Start Remarks</span>
            <input id="checklistRemarks" placeholder="Optional start remarks" />
          </label>
        </div>

        <div class="actions-row">
          <button id="startChecklistBtn" class="btn" type="button">Start New Checklist</button>
          <button id="loadChecklistRunBtn" class="btn2" type="button">Load Selected Run</button>
        </div>

        ${renderSummary()}

        ${renderChecklistItems()}

        <h3 class="subhead">Checklist Run History</h3>
        <div class="mini-list">
          ${renderRunHistory()}
        </div>
      </div>
    `;

    const runSelect = $("checklistRunSelect");
    if (runSelect && state.activeRun) {
      runSelect.value = state.activeRun.run_id;
    }

    bindWorkspaceEvents();
  }

  function bindWorkspaceEvents() {
    $("reloadChecklistRunsBtn")?.addEventListener("click", () => refresh().catch(handleError));
    $("startChecklistBtn")?.addEventListener("click", () => startChecklistRun().catch(handleError));
    $("loadChecklistRunBtn")?.addEventListener("click", () => loadSelectedRun().catch(handleError));
    $("saveChecklistAnswersBtn")?.addEventListener("click", () => saveChecklistAnswers().catch(handleError));
    $("completeChecklistRunBtn")?.addEventListener("click", () => completeChecklistRun().catch(handleError));

    $("checklistRunSelect")?.addEventListener("change", () => {
      const runId = $("checklistRunSelect")?.value || "";
      if (!runId) {
        state.activeRun = null;
        state.activeItems = [];
        state.activeAnswers = [];
        renderWorkspace().catch(handleError);
        return;
      }

      loadRunDetail(runId).catch(handleError);
    });

    document.querySelectorAll("[data-mai-load-run]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const runId = btn.getAttribute("data-mai-load-run");
        loadRunDetail(runId).catch(handleError);
      });
    });

    document.querySelectorAll("[data-mai-delete-draft-run]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const runId = btn.getAttribute("data-mai-delete-draft-run");
        deleteDraftRun(runId).catch(handleError);
      });
    });
  }

  async function startChecklistRun() {
    const component = await loadComponent();
    if (!component) {
      toast("warn", "No component is open.");
      return;
    }

    const templateId = $("checklistTemplateSelect")?.value || "";
    const inspectionDate = $("checklistInspectionDate")?.value || todayIso();
    const inspectedBy = $("checklistInspectedBy")?.value || null;
    const remarks = $("checklistRemarks")?.value || null;

    if (!templateId) {
      toast("warn", "Select an available checklist template first.");
      return;
    }

    const data = await rpc("mai_start_inspection_run", {
      p_component_id: component.id,
      p_template_id: templateId,
      p_inspection_date: inspectionDate,
      p_inspected_by: inspectedBy,
      p_remarks: remarks
    });

    const runId = typeof data === "string" ? data : (data?.run_id || data?.id || "");

    toast("ok", "Checklist run started.");

    await loadRuns();

    const newRunId = runId || state.runs[0]?.run_id || "";
    if (newRunId) {
      await loadRunDetail(newRunId);
    } else {
      await renderWorkspace();
    }
  }

  async function loadSelectedRun() {
    const runId = $("checklistRunSelect")?.value || "";
    if (!runId) {
      toast("warn", "Select a checklist run first.");
      return;
    }

    await loadRunDetail(runId);
  }

  async function saveChecklistAnswers() {
    if (!state.activeRun) {
      toast("warn", "Load a checklist run first.");
      return;
    }

    if (activeRunIsLocked()) {
      toast("warn", "This checklist run is locked and cannot be edited.");
      return;
    }

    let saved = 0;

    for (const item of state.activeItems) {
      const optionInput = document.querySelector(`[data-mai-answer-option="${CSS.escape(item.item_id)}"]`);
      const remarksInput = document.querySelector(`[data-mai-answer-remarks="${CSS.escape(item.item_id)}"]`);

      const selectedOptionId = optionInput?.value || null;
      const answerRemarks = remarksInput?.value || null;
      const existing = answerForItem(item.item_id);

      if (!selectedOptionId && !answerRemarks && !existing) {
        continue;
      }

      await rpc("mai_save_inspection_run_answer", {
        p_run_id: state.activeRun.run_id,
        p_item_id: item.item_id,
        p_selected_option_id: selectedOptionId,
        p_answer_remarks: answerRemarks
      });

      saved += 1;
    }

    toast("ok", `Checklist answers saved. Items processed: ${saved}.`);

    await loadRuns();
    await loadRunDetail(state.activeRun.run_id);
  }

  async function completeChecklistRun() {
    if (!state.activeRun) {
      toast("warn", "Load a checklist run first.");
      return;
    }

    if (activeRunIsLocked()) {
      toast("warn", "This checklist run is already locked.");
      return;
    }

    await saveChecklistAnswers();

    const finalDecision = $("checklistFinalDecision")?.value || null;
    const finalRemarks = $("checklistFinalRemarks")?.value || null;

    const ok = confirm(
      "Complete this checklist run?\n\n" +
      "After completion it becomes locked/read-only and cannot be deleted by vessel users."
    );

    if (!ok) return;

    await rpc("mai_complete_inspection_run", {
      p_run_id: state.activeRun.run_id,
      p_final_decision: finalDecision,
      p_final_decision_remarks: finalRemarks
    });

    toast("ok", "Checklist run completed.");

    await loadRuns();
    await loadRunDetail(state.activeRun.run_id);
  }

  async function deleteDraftRun(runId) {
    const run = state.runs.find((r) => r.run_id === runId);

    if (!run) {
      toast("warn", "Checklist run was not found.");
      return;
    }

    if (run.run_status !== "draft") {
      toast("warn", "Only draft checklist runs can be deleted. Completed/finalized runs are locked.");
      return;
    }

    const reason = prompt("Reason for deleting this draft checklist run:", "Draft checklist run deleted by user.");
    if (reason === null) return;

    const ok = confirm(
      "Delete this draft checklist run?\n\n" +
      "This is a soft delete / void action. It remains auditable and is not physically removed."
    );

    if (!ok) return;

    await rpc("mai_void_inspection_run", {
      p_run_id: runId,
      p_void_reason: reason || null
    });

    toast("ok", "Draft checklist run deleted / voided.");

    if (state.activeRun?.run_id === runId) {
      state.activeRun = null;
      state.activeItems = [];
      state.activeAnswers = [];
    }

    await refresh();
  }

  function handleError(error) {
    console.error(error);
    toast("warn", String(error?.message || error || "Checklist workspace error."));
  }

  function addStyles() {
    if ($("maiChecklistWorkspaceStyles")) return;

    const style = document.createElement("style");
    style.id = "maiChecklistWorkspaceStyles";
    style.textContent = `
      .mai-checklist-workspace {
        border: 2px solid #9fc6ef;
        border-radius: 14px;
        padding: 10px;
        background: #f8fbff;
      }

      .mai-checklist-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .mai-checklist-head h3 {
        margin: 0;
        color: #062a5e;
      }

      .checklist-start-grid {
        display: grid;
        grid-template-columns: minmax(260px, 1.2fr) 150px minmax(180px, .8fr) minmax(260px, 1.2fr);
        gap: 8px;
        margin-bottom: 8px;
      }

      .mai-checklist-summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 6px;
        border: 1px solid #bfd5ee;
        border-radius: 12px;
        background: #fff;
        padding: 10px;
        margin: 10px 0;
      }

      .checklist-table-wrap {
        max-height: 560px;
        overflow: auto;
        margin-top: 10px;
      }

      .checklist-table th:nth-child(1),
      .checklist-table td:nth-child(1) {
        width: 56px;
      }

      .checklist-table th:nth-child(3),
      .checklist-table td:nth-child(3) {
        min-width: 260px;
      }

      .checklist-table th:nth-child(4),
      .checklist-table td:nth-child(4) {
        min-width: 260px;
      }

      .checklist-table textarea {
        min-height: 72px;
      }

      .checklist-complete-grid {
        margin-top: 10px;
      }

      .subhead {
        margin: 12px 0 8px;
        color: #062a5e;
      }

      @media (max-width: 1100px) {
        .checklist-start-grid,
        .checklist-complete-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function refresh() {
    if (state.busy) return;
    state.busy = true;

    try {
      addStyles();

      state.sb = state.sb || window.AUTH.ensureSupabase();
      state.profile = state.profile || await getProfileSafe();

      const component = await loadComponent();
      if (!component) return;

      await Promise.all([
        loadTemplates(),
        loadRuns()
      ]);

      await renderWorkspace();
    } finally {
      state.busy = false;
    }
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      const host = $("checklistRunsHistory");
      if (!host) return;

      const rendered = host.getAttribute("data-mai-checklist-workspace-rendered") === "1";
      if (!rendered) {
        window.setTimeout(() => refresh().catch(handleError), 250);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    window.CSVB_MAI_CHECKLIST_WORKSPACE_BUILD = BUILD;

    startObserver();

    window.setTimeout(() => refresh().catch(handleError), 800);
    window.setTimeout(() => refresh().catch(handleError), 1800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
