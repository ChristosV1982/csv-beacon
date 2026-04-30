#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc9d4b_company_override_page

for f in \
  public/q-company-overrides.html \
  public/q-company-overrides.js \
  public/csvb-module-guard.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc9d4b_company_override_page/$(basename "$f")
  fi
done

cat > public/q-company-overrides.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>C.S.V. BEACON — Company Question Overrides</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <link rel="stylesheet" href="./style.css?v=20260430_1" />
  <link rel="stylesheet" href="./csv-beacon-theme.css?v=20260430_1" />

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="./app-config.js?v=20260430_1"></script>
  <script src="./auth.js?v=20260430_1"></script>
  <script src="./csvb-module-guard.js?v=20260430_1"></script>

  <style>
    body{
      background:#F4F8FC;
      color:#062A5E;
      font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      margin:0;
    }
    .topbar{
      background:#062A5E;
      color:#fff;
      padding:14px 18px;
      display:flex;
      align-items:center;
      gap:14px;
      flex-wrap:wrap;
    }
    .brand{
      display:flex;
      align-items:center;
      gap:10px;
      font-weight:950;
      letter-spacing:.08em;
    }
    .brand img{
      width:44px;
      height:44px;
      object-fit:contain;
    }
    .topbar-spacer{flex:1;}
    .badge{
      border:1px solid rgba(255,255,255,.35);
      border-radius:999px;
      padding:8px 12px;
      font-weight:900;
      background:rgba(255,255,255,.08);
    }
    .btn{
      background:#062A5E;
      color:#fff;
      border:1px solid #062A5E;
      border-radius:10px;
      padding:9px 12px;
      font-weight:950;
      cursor:pointer;
    }
    .topbar .btn{
      border-color:rgba(255,255,255,.35);
      background:rgba(255,255,255,.10);
    }
    .btn.secondary{
      background:#E9F7FB;
      color:#062A5E;
      border-color:#AEE3F1;
    }
    .btn.warn{
      background:#8A5A00;
      border-color:#8A5A00;
    }
    .btn:disabled{
      opacity:.55;
      cursor:not-allowed;
    }
    .wrap{
      max-width:1280px;
      margin:18px auto;
      padding:0 14px 40px;
    }
    .panel{
      background:#fff;
      border:1px solid #D6E4F5;
      border-radius:16px;
      padding:14px;
      box-shadow:0 10px 30px rgba(3,27,63,.06);
      margin-bottom:14px;
    }
    h1,h2{
      margin:0 0 8px;
      color:#062A5E;
    }
    h1{font-size:1.35rem;}
    h2{font-size:1.05rem;}
    .muted{
      color:#5E6F86;
      font-weight:750;
      line-height:1.35;
    }
    .grid{
      display:grid;
      grid-template-columns: 1fr 1.4fr;
      gap:14px;
    }
    @media(max-width:1000px){
      .grid{grid-template-columns:1fr;}
    }
    label{
      display:block;
      font-weight:900;
      color:#062A5E;
      margin:10px 0 5px;
    }
    input, select, textarea{
      width:100%;
      box-sizing:border-box;
      border:1px solid #C8DAEF;
      border-radius:10px;
      padding:10px 11px;
      font-weight:750;
      color:#163457;
      background:#fff;
    }
    textarea{
      min-height:120px;
      resize:vertical;
      font-family:inherit;
    }
    .row{
      display:flex;
      gap:8px;
      align-items:center;
      flex-wrap:wrap;
      margin:10px 0;
    }
    .msg{
      border-radius:12px;
      padding:10px 12px;
      font-weight:850;
      white-space:pre-wrap;
      margin:10px 0;
      display:none;
    }
    .msg.ok{display:block;background:#EAF9EF;color:#087334;border:1px solid #B8E7C8;}
    .msg.warn{display:block;background:#FFF4E5;color:#8A5A00;border:1px solid #F6D58F;}
    .msg.err{display:block;background:#FFEAEA;color:#9B1C1C;border:1px solid #F2B7B7;}
    .table{
      width:100%;
      border-collapse:collapse;
      font-size:.92rem;
    }
    .table th{
      background:#EAF3FB;
      color:#062A5E;
      text-align:left;
      padding:8px;
      border-bottom:1px solid #CFE1F4;
    }
    .table td{
      padding:8px;
      border-bottom:1px solid #E1ECF7;
      vertical-align:top;
    }
    .pill{
      display:inline-block;
      border-radius:999px;
      padding:3px 8px;
      font-weight:900;
      font-size:.8rem;
      background:#E9F7FB;
      color:#062A5E;
      border:1px solid #AEE3F1;
    }
    .pill.ok{background:#EAF9EF;color:#087334;border-color:#B8E7C8;}
    .pill.warn{background:#FFF6E0;color:#8A5A00;border-color:#F6D58F;}
    .pill.bad{background:#FFEAEA;color:#9B1C1C;border-color:#F2B7B7;}
    .editor-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
    }
    @media(max-width:900px){
      .editor-grid{grid-template-columns:1fr;}
    }
    .readonly-box{
      background:#F7FAFE;
      border:1px solid #D6E4F5;
      border-radius:12px;
      padding:10px;
      color:#163457;
      white-space:pre-wrap;
      min-height:70px;
    }
  </style>
</head>

<body>
  <header class="topbar">
    <div class="brand">
      <img src="./csv-beacon-logo.png" onerror="this.style.display='none'" alt="C.S.V. BEACON" />
      <div>
        <div>C.S.V. BEACON</div>
        <div style="font-size:.78rem;color:#BFEFF4;letter-spacing:0;">Marine Assurance & Compliance Platform</div>
      </div>
    </div>

    <div class="topbar-spacer"></div>

    <div id="userBadge" class="badge">Loading…</div>
    <button id="dashboardBtn" class="btn" type="button">Dashboard</button>
    <button id="questionEditorBtn" class="btn" type="button">Questions Editor</button>
    <button id="logoutBtn" class="btn" type="button">Logout</button>
  </header>

  <main class="wrap">
    <section class="panel">
      <h1>Company Question Overrides</h1>
      <div class="muted">
        Create company-specific override drafts for assigned questions. The master question remains unchanged.
        Only questions with <b>Can edit override</b> enabled are available here.
      </div>
      <div id="msgBox" class="msg"></div>
    </section>

    <section id="platformCompanyPanel" class="panel" style="display:none;">
      <h2>Platform Company Selection</h2>
      <div class="muted">Superuser may choose which company override library to review/edit.</div>
      <label>Company</label>
      <select id="companySelect"></select>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>Assigned Questions Available for Override</h2>
        <div class="row">
          <input id="searchInput" placeholder="Search question number or text…" style="flex:1;min-width:260px;" />
          <button id="searchBtn" class="btn secondary" type="button">Search</button>
          <button id="refreshBtn" class="btn secondary" type="button">Refresh</button>
        </div>
        <div id="questionListBox" class="muted">Loading…</div>
      </section>

      <section class="panel">
        <h2>Override Editor</h2>
        <div id="selectedQuestionBox" class="muted">Select a question.</div>

        <div id="editorBox" style="display:none;">
          <div class="row">
            <span id="approvalModePill" class="pill">approval mode</span>
            <span id="pendingStatusPill" class="pill">no draft</span>
          </div>

          <div class="editor-grid">
            <div>
              <label>Master / Effective Question Text</label>
              <div id="masterQuestionText" class="readonly-box"></div>
            </div>
            <div>
              <label>Override Question Text</label>
              <textarea id="overrideQuestionText" placeholder="Company-specific question text override"></textarea>
            </div>
          </div>

          <label>Override Short Text</label>
          <input id="overrideShortText" placeholder="Optional short title/summary" />

          <label>Override Inspection Guidance</label>
          <textarea id="overrideGuidance" placeholder="Company-specific guidance"></textarea>

          <label>Override Suggested Actions</label>
          <textarea id="overrideActions" placeholder="Company-specific suggested actions"></textarea>

          <label>Override PGNO list — one item per line</label>
          <textarea id="overridePgno" placeholder="One PGNO per line"></textarea>

          <label>Override Expected Evidence — one item per line</label>
          <textarea id="overrideEvidence" placeholder="One expected evidence item per line"></textarea>

          <label>Version</label>
          <input id="overrideVersion" value="1.0" />

          <div class="row">
            <button id="saveDraftBtn" class="btn secondary" type="button">Save Draft</button>
            <button id="submitBtn" class="btn" type="button">Submit / Publish</button>
            <button id="reloadSelectedBtn" class="btn secondary" type="button">Reload Selected</button>
          </div>
        </div>
      </section>
    </div>
  </main>

  <script src="./q-company-overrides.js?v=20260430_1"></script>
</body>
</html>
HTML

cat > public/q-company-overrides.js <<'JS'
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
JS

node <<'NODE'
const fs = require("fs");

/* Patch module guard */
const guard = "public/csvb-module-guard.js";
if (fs.existsSync(guard)) {
  let s = fs.readFileSync(guard, "utf8");

  if (!s.includes('"q-company-overrides.html": "questions_editor"')) {
    s = s.replace(
      '"q-questions-editor.html": "questions_editor",',
      '"q-questions-editor.html": "questions_editor",\n    "q-company-overrides.html": "questions_editor",'
    );
  }

  fs.writeFileSync(guard, s, "utf8");
}

/* Service worker */
const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v30-mc9d4b-company-override-page";'
    );
  }

  if (!s.includes('"./q-company-overrides.html"')) {
    s = s.replace(
      '  "./q-questions-editor.html",',
      '  "./q-questions-editor.html",\n  "./q-company-overrides.html",'
    );
  }

  if (!s.includes('"./q-company-overrides.js"')) {
    s = s.replace(
      '  "./q-company-overrides.html",',
      '  "./q-company-overrides.html",\n  "./q-company-overrides.js",'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC9D4B_COMPANY_OVERRIDE_PAGE_APPLIED.txt",
  "MC-9D4B applied: Company-side question override draft/submit page added.\\n",
  "utf8"
);

console.log("DONE: MC-9D4B company override page applied.");
NODE

echo "DONE: MC-9D4B completed."
