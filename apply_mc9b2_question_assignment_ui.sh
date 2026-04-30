#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc9b2_question_assignment_ui

for f in \
  public/su-admin.html \
  public/service-worker.js \
  public/csvb-question-admin.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc9b2_question_assignment_ui/$(basename "$f")
  fi
done

cat > public/csvb-question-admin.js <<'JS'
// public/csvb-question-admin.js
// C.S.V. BEACON — MC-9B2 Question Sets & Company Assignment UI

(() => {
  "use strict";

  const BUILD = "MC9B2-2026-04-30";

  const state = {
    sb: null,
    me: null,
    companies: [],
    summary: [],
    sets: [],
    selectedCompanyId: "",
    selectedSetId: "",
    assignments: [],
    setItems: [],
    questionResults: [],
    loaded: false,
  };

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function $(id) {
    return document.getElementById(id);
  }

  function roleIsPlatform(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function setMsg(type, msg) {
    const el = $("qaMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "qa-msg " + (type || "");
    el.style.display = msg ? "block" : "none";
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function injectStyles() {
    if (document.getElementById("csvbQuestionAdminStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbQuestionAdminStyles";
    style.textContent = `
      .qa-panel{
        max-width:1200px;
        margin:14px auto;
        background:#fff;
        border:1px solid #D6E4F5;
        border-radius:16px;
        padding:14px;
        box-shadow:0 10px 30px rgba(3,27,63,.06);
      }
      .qa-panel h2{
        margin:0 0 6px 0;
        color:#062A5E;
        font-size:1.2rem;
      }
      .qa-muted{
        color:#5E6F86;
        font-weight:750;
        line-height:1.35;
      }
      .qa-grid{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:12px;
        margin-top:12px;
      }
      @media(max-width:900px){
        .qa-grid{grid-template-columns:1fr;}
      }
      .qa-box{
        border:1px solid #D6E4F5;
        border-radius:14px;
        padding:12px;
        background:#F7FAFE;
      }
      .qa-title{
        color:#062A5E;
        font-weight:950;
        margin-bottom:8px;
      }
      .qa-row{
        display:flex;
        gap:8px;
        align-items:center;
        flex-wrap:wrap;
        margin:8px 0;
      }
      .qa-row label{
        font-weight:850;
        color:#062A5E;
      }
      .qa-input,
      .qa-select,
      .qa-textarea{
        width:100%;
        border:1px solid #C8DAEF;
        border-radius:10px;
        padding:9px 10px;
        font-weight:750;
        color:#163457;
        background:#fff;
        box-sizing:border-box;
      }
      .qa-textarea{min-height:72px;resize:vertical;}
      .qa-btn{
        background:#062A5E;
        color:#fff;
        border:1px solid #062A5E;
        border-radius:10px;
        padding:9px 12px;
        font-weight:950;
        cursor:pointer;
      }
      .qa-btn.secondary{
        background:#E9F7FB;
        color:#062A5E;
        border-color:#AEE3F1;
      }
      .qa-btn.danger{
        background:#B82727;
        border-color:#B82727;
      }
      .qa-btn:disabled{
        opacity:.55;
        cursor:not-allowed;
      }
      .qa-table{
        width:100%;
        border-collapse:collapse;
        margin-top:10px;
        font-size:.92rem;
      }
      .qa-table th{
        background:#EAF3FB;
        color:#062A5E;
        text-align:left;
        padding:8px;
        border-bottom:1px solid #CFE1F4;
      }
      .qa-table td{
        padding:8px;
        border-bottom:1px solid #E1ECF7;
        vertical-align:top;
      }
      .qa-pill{
        display:inline-block;
        border-radius:999px;
        padding:3px 8px;
        font-weight:900;
        font-size:.8rem;
        background:#E9F7FB;
        color:#062A5E;
        border:1px solid #AEE3F1;
      }
      .qa-pill.ok{background:#EAF9EF;color:#087334;border-color:#B8E7C8;}
      .qa-pill.bad{background:#FFEAEA;color:#9B1C1C;border-color:#F2B7B7;}
      .qa-msg{
        margin:10px 0;
        border-radius:12px;
        padding:10px 12px;
        font-weight:850;
        white-space:pre-wrap;
      }
      .qa-msg.ok{background:#EAF9EF;color:#087334;border:1px solid #B8E7C8;}
      .qa-msg.warn{background:#FFF4E5;color:#8A5A00;border:1px solid #F6D58F;}
      .qa-msg.err{background:#FFEAEA;color:#9B1C1C;border:1px solid #F2B7B7;}
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if ($("csvbQuestionAdminPanel")) return;

    injectStyles();

    const panel = document.createElement("section");
    panel.id = "csvbQuestionAdminPanel";
    panel.className = "qa-panel";
    panel.style.display = "none";

    panel.innerHTML = `
      <h2>Question Sets & Company Question Assignments</h2>
      <div class="qa-muted">
        Platform administration area for assigning SIRE / company question sets and individual questions to client companies.
        This controls company visibility and override permissions without modifying the master question library.
      </div>

      <div id="qaMsg" class="qa-msg" style="display:none;"></div>

      <div class="qa-row">
        <button class="qa-btn secondary" id="qaRefreshBtn" type="button">Refresh</button>
        <label for="qaCompanySelect">Company</label>
        <select id="qaCompanySelect" class="qa-select" style="max-width:360px;"></select>
      </div>

      <div class="qa-grid">
        <div class="qa-box">
          <div class="qa-title">Company Assignment Summary</div>
          <div id="qaSummaryBox" class="qa-muted">Loading…</div>
        </div>

        <div class="qa-box">
          <div class="qa-title">Assign Question Set to Selected Company</div>

          <label>Question Set</label>
          <select id="qaAssignSetSelect" class="qa-select"></select>

          <div class="qa-row">
            <label><input type="checkbox" id="qaSetCanView" checked /> Can view</label>
            <label><input type="checkbox" id="qaSetCanReview" /> Can review</label>
            <label><input type="checkbox" id="qaSetCanEditOverride" /> Can edit override</label>
          </div>

          <label>Status</label>
          <select id="qaSetStatus" class="qa-select">
            <option value="assigned">assigned</option>
            <option value="open_for_review">open_for_review</option>
            <option value="locked">locked</option>
            <option value="archived">archived</option>
            <option value="disabled">disabled</option>
          </select>

          <label>Notes</label>
          <textarea id="qaSetNotes" class="qa-textarea" placeholder="Optional notes"></textarea>

          <div class="qa-row">
            <button class="qa-btn" id="qaAssignSetBtn" type="button">Assign / Update Set</button>
          </div>
        </div>
      </div>

      <div class="qa-grid">
        <div class="qa-box">
          <div class="qa-title">Company Assignments</div>
          <div id="qaAssignmentsBox" class="qa-muted">Select a company.</div>
        </div>

        <div class="qa-box">
          <div class="qa-title">Question Sets</div>
          <div id="qaSetsBox" class="qa-muted">Loading…</div>
        </div>
      </div>

      <div class="qa-grid">
        <div class="qa-box">
          <div class="qa-title">Question Set Items</div>
          <label>Question Set</label>
          <select id="qaSetItemsSelect" class="qa-select"></select>
          <div class="qa-row">
            <button class="qa-btn secondary" id="qaLoadSetItemsBtn" type="button">Load Set Items</button>
          </div>
          <div id="qaSetItemsBox" class="qa-muted">Select a question set.</div>
        </div>

        <div class="qa-box">
          <div class="qa-title">Assign Individual Question to Company</div>

          <label>Search master question</label>
          <input id="qaQuestionSearch" class="qa-input" placeholder="Question number or text…" />

          <div class="qa-row">
            <label>Source</label>
            <select id="qaSearchSource" class="qa-select" style="max-width:180px;">
              <option value="">All</option>
              <option value="SIRE">SIRE</option>
              <option value="COMPANY_CUSTOM">COMPANY_CUSTOM</option>
            </select>

            <label>Status</label>
            <select id="qaSearchStatus" class="qa-select" style="max-width:180px;">
              <option value="">All</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>

            <button class="qa-btn secondary" id="qaSearchQuestionBtn" type="button">Search</button>
          </div>

          <div class="qa-row">
            <label><input type="checkbox" id="qaQuestionCanView" checked /> Can view</label>
            <label><input type="checkbox" id="qaQuestionCanReview" checked /> Can review</label>
            <label><input type="checkbox" id="qaQuestionCanEditOverride" /> Can edit override</label>
          </div>

          <label>Status</label>
          <select id="qaQuestionStatus" class="qa-select">
            <option value="assigned">assigned</option>
            <option value="open_for_review">open_for_review</option>
            <option value="locked">locked</option>
            <option value="archived">archived</option>
            <option value="disabled">disabled</option>
          </select>

          <div id="qaQuestionResultsBox" class="qa-muted">Search questions to assign individually.</div>
        </div>
      </div>
    `;

    const host = document.querySelector(".wrap") || document.querySelector("main") || document.body;
    host.appendChild(panel);

    wirePanel();
  }

  function addOpenButton() {
    if ($("qaOpenPanelBtn")) return;

    const btn = document.createElement("button");
    btn.id = "qaOpenPanelBtn";
    btn.type = "button";
    btn.textContent = "Question Assignments";
    btn.className = "btn2";

    btn.addEventListener("click", async () => {
      const panel = $("csvbQuestionAdminPanel");
      if (!panel) return;

      panel.style.display = panel.style.display === "none" ? "block" : "none";

      if (panel.style.display !== "none") {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        if (!state.loaded) await refreshAll();
      }
    });

    const candidates = Array.from(document.querySelectorAll("button"));
    const rightsBtn = candidates.find((b) => /rights matrix/i.test(b.textContent || ""));
    const tabHost = rightsBtn?.parentElement || document.querySelector(".row") || document.body;

    if (rightsBtn) {
      rightsBtn.insertAdjacentElement("afterend", btn);
    } else {
      tabHost.appendChild(btn);
    }
  }

  function renderCompanySelects() {
    const companySel = $("qaCompanySelect");
    if (!companySel) return;

    const previous = state.selectedCompanyId || companySel.value || "";

    companySel.innerHTML = [
      '<option value="">Select company…</option>',
      ...state.companies.map((c) => {
        const label = c.company_name || c.company_code || c.id;
        return `<option value="${esc(c.id)}">${esc(label)}</option>`;
      })
    ].join("");

    if (previous && state.companies.some((c) => String(c.id) === String(previous))) {
      companySel.value = previous;
    } else if (state.companies[0]?.id) {
      companySel.value = state.companies[0].id;
    }

    state.selectedCompanyId = companySel.value || "";
  }

  function renderSetSelects() {
    const selects = [$("qaAssignSetSelect"), $("qaSetItemsSelect")].filter(Boolean);
    const options = [
      '<option value="">Select question set…</option>',
      ...state.sets.map((s) => {
        return `<option value="${esc(s.id)}">${esc(s.set_name)} (${esc(s.active_item_count || 0)} active)</option>`;
      })
    ].join("");

    for (const sel of selects) {
      const previous = sel.value;
      sel.innerHTML = options;

      if (previous && state.sets.some((s) => String(s.id) === String(previous))) {
        sel.value = previous;
      }
    }
  }

  function renderSummary() {
    const box = $("qaSummaryBox");
    if (!box) return;

    if (!state.summary.length) {
      box.textContent = "No summary data.";
      return;
    }

    box.innerHTML = `
      <table class="qa-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Set assignments</th>
            <th>Individual</th>
            <th>Effective questions</th>
            <th>Overrides</th>
          </tr>
        </thead>
        <tbody>
          ${state.summary.map((r) => `
            <tr>
              <td>${esc(r.company_name || r.company_code || r.company_id)}</td>
              <td>${esc(r.set_assignment_count)}</td>
              <td>${esc(r.individual_assignment_count)}</td>
              <td>${esc(r.assigned_effective_question_count)}</td>
              <td>${esc(r.override_count)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderSets() {
    const box = $("qaSetsBox");
    if (!box) return;

    if (!state.sets.length) {
      box.textContent = "No question sets found.";
      return;
    }

    box.innerHTML = `
      <table class="qa-table">
        <thead>
          <tr>
            <th>Set</th>
            <th>Code</th>
            <th>Type</th>
            <th>Items</th>
            <th>Companies</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${state.sets.map((s) => `
            <tr>
              <td>${esc(s.set_name)}</td>
              <td class="mono">${esc(s.set_code)}</td>
              <td>${esc(s.set_type)}</td>
              <td>${esc(s.active_item_count)} / ${esc(s.item_count)}</td>
              <td>${esc(s.company_assignment_count)}</td>
              <td>${s.is_active ? '<span class="qa-pill ok">Active</span>' : '<span class="qa-pill bad">Inactive</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderAssignments() {
    const box = $("qaAssignmentsBox");
    if (!box) return;

    if (!state.selectedCompanyId) {
      box.textContent = "Select a company.";
      return;
    }

    if (!state.assignments.length) {
      box.textContent = "No assignments for this company.";
      return;
    }

    box.innerHTML = `
      <table class="qa-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Target</th>
            <th>Status</th>
            <th>View</th>
            <th>Review</th>
            <th>Edit Override</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.assignments.map((a) => {
            const target = a.assignment_type === "set"
              ? `${a.set_name || ""} (${a.set_item_count || 0})`
              : `${a.number_full || a.number_base || ""} — ${a.question_short_text || ""}`;

            return `
              <tr>
                <td>${esc(a.assignment_type)}</td>
                <td>${esc(target)}</td>
                <td>${esc(a.access_status)}</td>
                <td>${a.can_view ? "Yes" : "No"}</td>
                <td>${a.can_review ? "Yes" : "No"}</td>
                <td>${a.can_edit_override ? "Yes" : "No"}</td>
                <td><button class="qa-btn danger" data-delete-assignment="${esc(a.id)}" type="button">Delete</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-delete-assignment]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-assignment");
        if (!id) return;

        if (!confirm("Delete this company question assignment?")) return;

        try {
          await rpc("csvb_admin_delete_company_question_assignment", {
            p_assignment_id: id
          });

          setMsg("ok", "Assignment deleted.");
          await refreshCompanyAssignments();
          await refreshSummary();
        } catch (e) {
          setMsg("err", "Delete failed:\n" + (e?.message || String(e)));
        }
      });
    });
  }

  function renderSetItems() {
    const box = $("qaSetItemsBox");
    if (!box) return;

    if (!state.setItems.length) {
      box.textContent = "No set items loaded or set is empty.";
      return;
    }

    box.innerHTML = `
      <table class="qa-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Question</th>
            <th>Source</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${state.setItems.slice(0, 500).map((i) => `
            <tr>
              <td>${esc(i.sort_order || "")}</td>
              <td>
                <b>${esc(i.number_full || i.number_base || "")}</b><br>
                <span class="qa-muted">${esc(i.question_short_text || "")}</span>
              </td>
              <td>${esc(i.source_type)}</td>
              <td>${i.is_active ? '<span class="qa-pill ok">Active</span>' : '<span class="qa-pill bad">Inactive</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    if (state.setItems.length > 500) {
      box.innerHTML += `<div class="qa-muted" style="margin-top:8px;">Showing first 500 items.</div>`;
    }
  }

  function renderQuestionResults() {
    const box = $("qaQuestionResultsBox");
    if (!box) return;

    if (!state.questionResults.length) {
      box.textContent = "No question results.";
      return;
    }

    box.innerHTML = `
      <table class="qa-table">
        <thead>
          <tr>
            <th>Question</th>
            <th>Source</th>
            <th>Owner</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.questionResults.map((q) => `
            <tr>
              <td>
                <b>${esc(q.number_full || q.number_base || "")}</b><br>
                <span class="qa-muted">${esc(q.question_short_text || "")}</span>
              </td>
              <td>${esc(q.source_type)} ${q.is_custom ? '<span class="qa-pill">custom</span>' : ''}</td>
              <td>${esc(q.company_name || "GLOBAL")}</td>
              <td><button class="qa-btn" data-assign-question="${esc(q.id)}" type="button">Assign</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-assign-question]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const questionId = btn.getAttribute("data-assign-question");
        await assignQuestion(questionId);
      });
    });
  }

  async function refreshCompanies() {
    state.companies = await rpc("csvb_admin_list_companies");
    renderCompanySelects();
  }

  async function refreshSummary() {
    state.summary = await rpc("csvb_admin_question_assignment_summary");
    renderSummary();
  }

  async function refreshSets() {
    state.sets = await rpc("csvb_admin_list_question_sets");
    renderSets();
    renderSetSelects();
  }

  async function refreshCompanyAssignments() {
    if (!state.selectedCompanyId) {
      state.assignments = [];
      renderAssignments();
      return;
    }

    state.assignments = await rpc("csvb_admin_list_company_question_assignments", {
      p_company_id: state.selectedCompanyId
    });

    renderAssignments();
  }

  async function refreshAll() {
    setMsg("", "");

    try {
      await refreshCompanies();
      await refreshSummary();
      await refreshSets();
      await refreshCompanyAssignments();
      state.loaded = true;
      setMsg("ok", "Question assignment administration loaded.");
    } catch (e) {
      setMsg("err", "Load failed:\n" + (e?.message || String(e)));
    }
  }

  async function assignSet() {
    if (!state.selectedCompanyId) throw new Error("Select a company first.");

    const setId = $("qaAssignSetSelect")?.value || "";
    if (!setId) throw new Error("Select a question set first.");

    await rpc("csvb_admin_set_company_question_assignment", {
      p_company_id: state.selectedCompanyId,
      p_question_set_id: setId,
      p_question_id: null,
      p_access_status: $("qaSetStatus")?.value || "assigned",
      p_can_view: !!$("qaSetCanView")?.checked,
      p_can_review: !!$("qaSetCanReview")?.checked,
      p_can_edit_override: !!$("qaSetCanEditOverride")?.checked,
      p_valid_from: null,
      p_valid_to: null,
      p_notes: $("qaSetNotes")?.value || null
    });

    setMsg("ok", "Question set assignment saved.");
    await refreshCompanyAssignments();
    await refreshSummary();
  }

  async function searchQuestions() {
    const search = $("qaQuestionSearch")?.value || "";
    const source = $("qaSearchSource")?.value || "";
    const status = $("qaSearchStatus")?.value || "";

    state.questionResults = await rpc("csvb_admin_search_questions", {
      p_search: search || null,
      p_source_type: source || null,
      p_status: status || null,
      p_company_id: state.selectedCompanyId || null,
      p_limit: 100
    });

    renderQuestionResults();
  }

  async function assignQuestion(questionId) {
    if (!state.selectedCompanyId) throw new Error("Select a company first.");
    if (!questionId) throw new Error("Question id missing.");

    await rpc("csvb_admin_set_company_question_assignment", {
      p_company_id: state.selectedCompanyId,
      p_question_set_id: null,
      p_question_id: questionId,
      p_access_status: $("qaQuestionStatus")?.value || "assigned",
      p_can_view: !!$("qaQuestionCanView")?.checked,
      p_can_review: !!$("qaQuestionCanReview")?.checked,
      p_can_edit_override: !!$("qaQuestionCanEditOverride")?.checked,
      p_valid_from: null,
      p_valid_to: null,
      p_notes: "Individual question assignment from MC-9B2 UI."
    });

    setMsg("ok", "Individual question assignment saved.");
    await refreshCompanyAssignments();
    await refreshSummary();
  }

  async function loadSetItems() {
    const setId = $("qaSetItemsSelect")?.value || "";
    if (!setId) {
      state.setItems = [];
      renderSetItems();
      return;
    }

    state.setItems = await rpc("csvb_admin_list_question_set_items", {
      p_question_set_id: setId
    });

    renderSetItems();
  }

  function wirePanel() {
    $("qaRefreshBtn")?.addEventListener("click", refreshAll);

    $("qaCompanySelect")?.addEventListener("change", async () => {
      state.selectedCompanyId = $("qaCompanySelect")?.value || "";
      await refreshCompanyAssignments();
    });

    $("qaAssignSetBtn")?.addEventListener("click", async () => {
      try {
        await assignSet();
      } catch (e) {
        setMsg("err", "Set assignment failed:\n" + (e?.message || String(e)));
      }
    });

    $("qaSearchQuestionBtn")?.addEventListener("click", async () => {
      try {
        await searchQuestions();
      } catch (e) {
        setMsg("err", "Question search failed:\n" + (e?.message || String(e)));
      }
    });

    $("qaLoadSetItemsBtn")?.addEventListener("click", async () => {
      try {
        await loadSetItems();
      } catch (e) {
        setMsg("err", "Load set items failed:\n" + (e?.message || String(e)));
      }
    });
  }

  async function init() {
    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) return;

    state.sb = window.AUTH.ensureSupabase();

    try {
      state.me = await window.AUTH.getSessionUserProfile();
    } catch (_) {
      return;
    }

    const role = state.me?.profile?.role || "";
    if (!roleIsPlatform(role)) return;

    createPanel();
    addOpenButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CSVB_QUESTION_ADMIN = {
    BUILD,
    state,
    refreshAll,
  };
})();
JS

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/su-admin.html";
if (!fs.existsSync(htmlFile)) {
  throw new Error("public/su-admin.html not found.");
}

let html = fs.readFileSync(htmlFile, "utf8");

const scriptTag = '<script src="./csvb-question-admin.js?v=20260430_1"></script>';

if (!html.includes("csvb-question-admin.js")) {
  if (html.includes("</body>")) {
    html = html.replace("</body>", `  ${scriptTag}\n</body>`);
  } else {
    html += "\n" + scriptTag + "\n";
  }
}

fs.writeFileSync(htmlFile, html, "utf8");

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v24-mc9b2-question-assignment-ui";'
    );
  }

  if (!s.includes('"./csvb-question-admin.js"')) {
    s = s.replace(
      '  "./csvb-module-guard.js",',
      '  "./csvb-module-guard.js",\n  "./csvb-question-admin.js",'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC9B2_QUESTION_ASSIGNMENT_UI_APPLIED.txt",
  "MC-9B2 applied: Superuser Question Sets and Company Assignments UI added. No SQL/auth/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-9B2 Question Assignment UI applied.");
NODE

echo "DONE: MC-9B2 completed."
echo "Next: open Superuser Administration and hard refresh with Ctrl + Shift + R."
