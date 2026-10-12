// public/q-company-overrides.js
// C.S.V. BEACON — MC-9D4B Company-side Question Override Draft/Submit UI

(() => {
  "use strict";

  const BUILD = "MC9D4B-2026-04-30";

  const state = {
    sb: null,
    me: null,
    companies: [],
    selectedCompanyId: "",
    questions: [],
    selectedQuestion: null,
    selectedOverride: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function msg(type, text) {
    const box = $("msgBox");
    if (!box) return;

    box.className = "msg " + (type || "");
    box.textContent = text || "";
    box.style.display = text ? "block" : "none";
  }

  function roleIsPlatform(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function roleAllowed(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role);
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function safeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function payloadText(payload, ...keys) {
    if (!payload || typeof payload !== "object") return "";
    for (const k of keys) {
      if (payload[k] !== null && payload[k] !== undefined && String(payload[k]).trim()) {
        return String(payload[k]);
      }
    }
    return "";
  }

  function linesToPgno(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x, idx) => ({
        seq: idx + 1,
        text: x,
        pgno_text: x,
        remarks: ""
      }));
  }

  function linesToEvidence(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x, idx) => ({
        seq: idx + 1,
        text: x,
        evidence_text: x,
        esms_references: "",
        esms_forms: "",
        remarks: ""
      }));
  }

  function pgnoToLines(rows) {
    return safeArray(rows)
      .map((r) => String(r?.text || r?.pgno_text || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function evidenceToLines(rows) {
    return safeArray(rows)
      .map((r) => String(r?.text || r?.evidence_text || "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();

    if (!s) return '<span class="pill">no draft</span>';
    if (s === "published" || s === "approved") return `<span class="pill ok">${esc(status)}</span>`;
    if (s === "submitted_for_review") return `<span class="pill warn">${esc(status)}</span>`;
    if (s === "rejected") return `<span class="pill bad">${esc(status)}</span>`;
    return `<span class="pill">${esc(status)}</span>`;
  }

  async function loadCompaniesForPlatform() {
    const panel = $("platformCompanyPanel");
    const sel = $("companySelect");

    if (!panel || !sel) return;

    const role = state.me?.profile?.role || "";

    if (!roleIsPlatform(role)) {
      panel.style.display = "none";
      return;
    }

    panel.style.display = "block";

    state.companies = await rpc("csvb_admin_list_companies");

    sel.innerHTML = [
      '<option value="">Select company…</option>',
      ...state.companies.map((c) => {
        const label = c.company_name || c.company_code || c.id;
        return `<option value="${esc(c.id)}">${esc(label)}</option>`;
      })
    ].join("");

    if (state.companies[0]?.id) {
      sel.value = state.companies[0].id;
      state.selectedCompanyId = sel.value;
    }
  }

  function effectiveCompanyArg() {
    const role = state.me?.profile?.role || "";

    if (roleIsPlatform(role)) {
      return state.selectedCompanyId || null;
    }

    return null;
  }

  async function loadQuestions() {
    msg("", "");

    const companyId = effectiveCompanyArg();

    if (roleIsPlatform(state.me?.profile?.role || "") && !companyId) {
      $("questionListBox").textContent = "Select a company first.";
      return;
    }

    const search = $("searchInput")?.value || "";

    state.questions = await rpc("csvb_override_workbench_questions_for_me", {
      p_company_id: companyId,
      p_search: search || null,
      p_only_editable: true
    });

    renderQuestions();

    if (!state.questions.length) {
      msg("warn", "No editable override questions found. Enable can_edit_override in Superuser → Question Assignments.");
    }
  }

  function renderQuestions() {
    const box = $("questionListBox");
    if (!box) return;

    if (!state.questions.length) {
      box.innerHTML = `<div class="muted">No questions available for override.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Approval</th>
            <th>Override</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.questions.map((q) => `
            <tr>
              <td>
                <b>${esc(q.number_full || q.number_base || "")}</b><br>
                <span class="muted">${esc(q.question_short_text || "")}</span>
              </td>
              <td><span class="pill">${esc(q.override_approval_mode)}</span></td>
              <td>
                Current: ${statusPill(q.current_override_status)}<br>
                Pending: ${statusPill(q.pending_override_status)}
              </td>
              <td><button class="btn secondary" data-select-question="${esc(q.question_id)}" type="button">Select</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-select-question]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-select-question");
        const row = state.questions.find((q) => String(q.question_id) === String(id));
        if (row) await selectQuestion(row);
      });
    });
  }

  async function loadExistingOverride(questionId) {
    const companyId = effectiveCompanyArg();

    const rows = await rpc("csvb_company_question_overrides_for_me", {
      p_company_id: companyId,
      p_master_question_id: questionId
    });

    const preferred =
      rows.find((r) => ["draft", "rejected"].includes(String(r.status))) ||
      rows.find((r) => String(r.status) === "submitted_for_review") ||
      rows.find((r) => r.is_current === true) ||
      null;

    return preferred;
  }

  async function selectQuestion(row) {
    state.selectedQuestion = row;
    state.selectedOverride = await loadExistingOverride(row.question_id);

    const payload = state.selectedOverride?.override_payload || row.effective_payload || {};
    const pgno = state.selectedOverride?.override_pgno?.length ? state.selectedOverride.override_pgno : row.effective_pgno || [];
    const evidence = state.selectedOverride?.override_expected_evidence?.length
      ? state.selectedOverride.override_expected_evidence
      : row.effective_expected_evidence || [];

    $("selectedQuestionBox").innerHTML = `
      <b>${esc(row.number_full || row.number_base || "")}</b><br>
      <span class="muted">${esc(row.question_short_text || "")}</span>
    `;

    $("editorBox").style.display = "block";

    $("approvalModePill").textContent = "approval: " + (row.override_approval_mode || "platform_review_required");
    $("pendingStatusPill").outerHTML = statusPill(state.selectedOverride?.status || "");

    $("masterQuestionText").textContent = payloadText(row.effective_payload, "question", "Question", "short_text", "ShortText");

    $("overrideQuestionText").value = payloadText(payload, "question", "Question");
    $("overrideShortText").value = payloadText(payload, "short_text", "ShortText", "shortText");
    $("overrideGuidance").value = payloadText(payload, "inspection_guidance", "Inspection_Guidance", "guidance");
    $("overrideActions").value = payloadText(payload, "suggested_inspector_actions", "Suggested_Inspector_Actions", "actions");
    $("overridePgno").value = pgnoToLines(pgno);
    $("overrideEvidence").value = evidenceToLines(evidence);
    $("overrideVersion").value = state.selectedOverride?.version || "1.0";

    msg("ok", "Selected question loaded.");
  }

  function overridePayloadFromForm() {
    const payload = {};

    const q = $("overrideQuestionText")?.value || "";
    const st = $("overrideShortText")?.value || "";
    const guidance = $("overrideGuidance")?.value || "";
    const actions = $("overrideActions")?.value || "";

    if (q.trim()) {
      payload.question = q.trim();
      payload.Question = q.trim();
    }

    if (st.trim()) {
      payload.short_text = st.trim();
      payload.ShortText = st.trim();
    }

    if (guidance.trim()) {
      payload.inspection_guidance = guidance.trim();
    }

    if (actions.trim()) {
      payload.suggested_inspector_actions = actions.trim();
    }

    return payload;
  }

  async function saveDraft() {
    if (!state.selectedQuestion) throw new Error("Select a question first.");

    const companyId = effectiveCompanyArg();

    const row = await rpc("csvb_save_company_question_override_draft", {
      p_master_question_id: state.selectedQuestion.question_id,
      p_company_id: companyId,
      p_override_payload: overridePayloadFromForm(),
      p_override_pgno: linesToPgno($("overridePgno")?.value || ""),
      p_override_expected_evidence: linesToEvidence($("overrideEvidence")?.value || ""),
      p_version: $("overrideVersion")?.value || "1.0"
    });

    state.selectedOverride = Array.isArray(row) ? row[0] : row;

    msg("ok", "Override draft saved.");
    await loadQuestions();
    return state.selectedOverride;
  }

  async function submitOrPublish() {
    let override = state.selectedOverride;

    if (!override?.id) {
      override = await saveDraft();
    }

    if (!override?.id) {
      throw new Error("Could not determine override id.");
    }

    const updated = await rpc("csvb_submit_company_question_override", {
      p_override_id: override.id
    });

    state.selectedOverride = Array.isArray(updated) ? updated[0] : updated;

    const status = state.selectedOverride?.status || "submitted";
    msg("ok", "Override " + status + ".");

    await loadQuestions();
    await selectQuestion(state.questions.find((q) => q.question_id === state.selectedQuestion.question_id) || state.selectedQuestion);
  }

  function wire() {
    $("dashboardBtn")?.addEventListener("click", () => window.location.href = "./q-dashboard.html");
    $("questionEditorBtn")?.addEventListener("click", () => window.location.href = "./q-questions-editor.html");

    $("logoutBtn")?.addEventListener("click", async () => {
      await state.sb.auth.signOut();
      window.location.href = "./login.html";
    });

    $("refreshBtn")?.addEventListener("click", loadQuestions);
    $("searchBtn")?.addEventListener("click", loadQuestions);
    $("searchInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadQuestions();
    });

    $("companySelect")?.addEventListener("change", async () => {
      state.selectedCompanyId = $("companySelect")?.value || "";
      state.selectedQuestion = null;
      state.selectedOverride = null;
      $("editorBox").style.display = "none";
      $("selectedQuestionBox").textContent = "Select a question.";
      await loadQuestions();
    });

    $("saveDraftBtn")?.addEventListener("click", async () => {
      try {
        await saveDraft();
      } catch (e) {
        msg("err", "Save draft failed:\n" + (e?.message || String(e)));
      }
    });

    $("submitBtn")?.addEventListener("click", async () => {
      try {
        const mode = state.selectedQuestion?.override_approval_mode || "platform_review_required";
        const ok = confirm(
          mode === "auto_publish"
            ? "This override will be published immediately. Continue?"
            : "This override will be submitted for review. Continue?"
        );

        if (!ok) return;

        await submitOrPublish();
      } catch (e) {
        msg("err", "Submit/publish failed:\n" + (e?.message || String(e)));
      }
    });

    $("reloadSelectedBtn")?.addEventListener("click", async () => {
      if (!state.selectedQuestion) return;
      await selectQuestion(state.selectedQuestion);
    });
  }

  async function init() {
    state.sb = window.AUTH.ensureSupabase();

    const R = window.AUTH.ROLES || {};
    state.me = await window.AUTH.requireAuth(
      [R.SUPER_ADMIN, "platform_owner", R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean)
    );

    const role = state.me?.profile?.role || "";

    if (!roleAllowed(role)) {
      msg("err", "Access denied for this role.");
      return;
    }

    const user = state.me?.profile?.username || state.me?.user?.email || "user";
    const roleText = role || "";
    const companyText = state.me?.company?.company_name || state.me?.company?.short_name || "Platform";

    $("userBadge").textContent = user + " • " + roleText + " • " + companyText;

    wire();

    if (roleIsPlatform(role)) {
      await loadCompaniesForPlatform();
    }

    await loadQuestions();

    window.CSVB_COMPANY_OVERRIDES = {
      BUILD,
      state
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((e) => msg("err", String(e?.message || e)));
    });
  } else {
    init().catch((e) => msg("err", String(e?.message || e)));
  }
})();
