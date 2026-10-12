// public/csvb-question-overrides-admin.js
// C.S.V. BEACON — MC-9D2 Superuser Override Review UI

(() => {
  "use strict";

  const BUILD = "MC9D2-2026-04-30";

  const state = {
    sb: null,
    me: null,
    companies: [],
    summary: [],
    overrides: [],
    loaded: false
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

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function setMsg(type, msg) {
    const el = $("qoMsg");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "qo-msg " + (type || "");
    el.style.display = msg ? "block" : "none";
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function injectStyles() {
    if (document.getElementById("csvbQuestionOverrideAdminStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbQuestionOverrideAdminStyles";
    style.textContent = `
      .qo-panel{
        max-width:1200px;
        margin:14px auto;
        background:#fff;
        border:1px solid #D6E4F5;
        border-radius:16px;
        padding:14px;
        box-shadow:0 10px 30px rgba(3,27,63,.06);
      }
      .qo-panel h2{
        margin:0 0 6px 0;
        color:#062A5E;
        font-size:1.2rem;
      }
      .qo-muted{
        color:#5E6F86;
        font-weight:750;
        line-height:1.35;
      }
      .qo-row{
        display:flex;
        gap:8px;
        align-items:center;
        flex-wrap:wrap;
        margin:8px 0;
      }
      .qo-row label{
        font-weight:850;
        color:#062A5E;
      }
      .qo-box{
        border:1px solid #D6E4F5;
        border-radius:14px;
        padding:12px;
        background:#F7FAFE;
        margin-top:12px;
      }
      .qo-title{
        color:#062A5E;
        font-weight:950;
        margin-bottom:8px;
      }
      .qo-select,
      .qo-input,
      .qo-textarea{
        border:1px solid #C8DAEF;
        border-radius:10px;
        padding:9px 10px;
        font-weight:750;
        color:#163457;
        background:#fff;
        box-sizing:border-box;
      }
      .qo-select{min-width:220px;}
      .qo-textarea{width:100%;min-height:70px;resize:vertical;}
      .qo-btn{
        background:#062A5E;
        color:#fff;
        border:1px solid #062A5E;
        border-radius:10px;
        padding:9px 12px;
        font-weight:950;
        cursor:pointer;
      }
      .qo-btn.secondary{
        background:#E9F7FB;
        color:#062A5E;
        border-color:#AEE3F1;
      }
      .qo-btn.warn{
        background:#8A5A00;
        border-color:#8A5A00;
      }
      .qo-btn.danger{
        background:#B82727;
        border-color:#B82727;
      }
      .qo-btn:disabled{
        opacity:.55;
        cursor:not-allowed;
      }
      .qo-table{
        width:100%;
        border-collapse:collapse;
        margin-top:10px;
        font-size:.92rem;
      }
      .qo-table th{
        background:#EAF3FB;
        color:#062A5E;
        text-align:left;
        padding:8px;
        border-bottom:1px solid #CFE1F4;
      }
      .qo-table td{
        padding:8px;
        border-bottom:1px solid #E1ECF7;
        vertical-align:top;
      }
      .qo-pill{
        display:inline-block;
        border-radius:999px;
        padding:3px 8px;
        font-weight:900;
        font-size:.8rem;
        background:#E9F7FB;
        color:#062A5E;
        border:1px solid #AEE3F1;
      }
      .qo-pill.draft{background:#EEF4FF;color:#234F96;border-color:#BFD2F3;}
      .qo-pill.submitted{background:#FFF6E0;color:#8A5A00;border-color:#F6D58F;}
      .qo-pill.approved{background:#EAF9EF;color:#087334;border-color:#B8E7C8;}
      .qo-pill.published{background:#EAF9EF;color:#087334;border-color:#B8E7C8;}
      .qo-pill.rejected{background:#FFEAEA;color:#9B1C1C;border-color:#F2B7B7;}
      .qo-pill.archived{background:#F1F1F1;color:#555;border-color:#CCC;}
      .qo-msg{
        margin:10px 0;
        border-radius:12px;
        padding:10px 12px;
        font-weight:850;
        white-space:pre-wrap;
      }
      .qo-msg.ok{background:#EAF9EF;color:#087334;border:1px solid #B8E7C8;}
      .qo-msg.warn{background:#FFF4E5;color:#8A5A00;border:1px solid #F6D58F;}
      .qo-msg.err{background:#FFEAEA;color:#9B1C1C;border:1px solid #F2B7B7;}
      .qo-details{
        max-height:120px;
        overflow:auto;
        background:#fff;
        border:1px solid #D6E4F5;
        border-radius:10px;
        padding:8px;
        font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size:.82rem;
        color:#163457;
      }
    `;
    document.head.appendChild(style);
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    const cls =
      s === "submitted_for_review" ? "submitted" :
      s === "approved" ? "approved" :
      s === "published" ? "published" :
      s === "rejected" ? "rejected" :
      s === "archived" ? "archived" :
      "draft";

    return `<span class="qo-pill ${cls}">${esc(status || "draft")}</span>`;
  }

  function createPanel() {
    if ($("csvbQuestionOverridesAdminPanel")) return;

    injectStyles();

    const panel = document.createElement("section");
    panel.id = "csvbQuestionOverridesAdminPanel";
    panel.className = "qo-panel";
    panel.style.display = "none";

    panel.innerHTML = `
      <h2>Company Question Overrides — Superuser Review</h2>
      <div class="qo-muted">
        Review company-specific question override drafts/submissions. Approved or published overrides become part of that company's effective question library without modifying the master question.
      </div>

      <div id="qoMsg" class="qo-msg" style="display:none;"></div>

      <div class="qo-row">
        <button class="qo-btn secondary" id="qoRefreshBtn" type="button">Refresh</button>

        <label for="qoCompanyFilter">Company</label>
        <select id="qoCompanyFilter" class="qo-select">
          <option value="">All companies</option>
        </select>

        <label for="qoStatusFilter">Status</label>
        <select id="qoStatusFilter" class="qo-select">
          <option value="">All statuses</option>
          <option value="draft">draft</option>
          <option value="submitted_for_review">submitted_for_review</option>
          <option value="approved">approved</option>
          <option value="published">published</option>
          <option value="rejected">rejected</option>
          <option value="archived">archived</option>
        </select>
      </div>

      <div class="qo-box">
        <div class="qo-title">Override Summary</div>
        <div id="qoSummaryBox" class="qo-muted">Loading…</div>
      </div>

      <div class="qo-box">
        <div class="qo-title">Override List</div>
        <div id="qoListBox" class="qo-muted">Loading…</div>
      </div>
    `;

    const host = document.querySelector(".wrap") || document.querySelector("main") || document.body;
    host.appendChild(panel);

    wirePanel();
  }

  function addOpenButton() {
    if ($("qoOpenPanelBtn")) return;

    const btn = document.createElement("button");
    btn.id = "qoOpenPanelBtn";
    btn.type = "button";
    btn.textContent = "Question Overrides";
    btn.className = "btn2";

    btn.addEventListener("click", async () => {
      const panel = $("csvbQuestionOverridesAdminPanel");
      if (!panel) return;

      panel.style.display = panel.style.display === "none" ? "block" : "none";

      if (panel.style.display !== "none") {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
        if (!state.loaded) await refreshAll();
      }
    });

    const qaBtn = $("qaOpenPanelBtn");
    if (qaBtn) {
      qaBtn.insertAdjacentElement("afterend", btn);
      return;
    }

    const candidates = Array.from(document.querySelectorAll("button"));
    const rightsBtn = candidates.find((b) => /rights matrix/i.test(b.textContent || ""));
    if (rightsBtn) {
      rightsBtn.insertAdjacentElement("afterend", btn);
    } else {
      document.body.prepend(btn);
    }
  }

  function renderCompanyFilter() {
    const sel = $("qoCompanyFilter");
    if (!sel) return;

    const current = sel.value || "";

    sel.innerHTML = [
      '<option value="">All companies</option>',
      ...state.companies.map((c) => {
        const label = c.company_name || c.company_code || c.id;
        return `<option value="${esc(c.id)}">${esc(label)}</option>`;
      })
    ].join("");

    if (current && state.companies.some((c) => String(c.id) === String(current))) {
      sel.value = current;
    }
  }

  function renderSummary() {
    const box = $("qoSummaryBox");
    if (!box) return;

    if (!state.summary.length) {
      box.textContent = "No override summary rows.";
      return;
    }

    box.innerHTML = `
      <table class="qo-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Draft</th>
            <th>Submitted</th>
            <th>Approved</th>
            <th>Published</th>
            <th>Rejected</th>
            <th>Archived</th>
            <th>Current Effective</th>
          </tr>
        </thead>
        <tbody>
          ${state.summary.map((r) => `
            <tr>
              <td>${esc(r.company_name || r.company_id)}</td>
              <td>${esc(r.draft_count)}</td>
              <td>${esc(r.submitted_count)}</td>
              <td>${esc(r.approved_count)}</td>
              <td>${esc(r.published_count)}</td>
              <td>${esc(r.rejected_count)}</td>
              <td>${esc(r.archived_count)}</td>
              <td>${esc(r.current_effective_count)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderOverrideList() {
    const box = $("qoListBox");
    if (!box) return;

    if (!state.overrides.length) {
      box.innerHTML = `<div class="qo-muted">No overrides found for the selected filters.</div>`;
      return;
    }

    box.innerHTML = `
      <table class="qo-table">
        <thead>
          <tr>
            <th>Company</th>
            <th>Question</th>
            <th>Status</th>
            <th>Current</th>
            <th>Updated</th>
            <th>Override Snapshot</th>
            <th>Review Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.overrides.map((o) => {
            const payloadPreview = JSON.stringify({
              override_payload: o.override_payload || {},
              override_pgno_count: Array.isArray(o.override_pgno) ? o.override_pgno.length : null,
              override_expected_evidence_count: Array.isArray(o.override_expected_evidence) ? o.override_expected_evidence.length : null
            }, null, 2);

            return `
              <tr>
                <td>${esc(o.company_name || o.company_id)}</td>
                <td>
                  <b>${esc(o.number_full || o.number_base || "")}</b><br>
                  <span class="qo-muted">${esc(o.question_short_text || "")}</span>
                </td>
                <td>${statusPill(o.status)}</td>
                <td>${o.is_current ? '<span class="qo-pill published">Yes</span>' : '<span class="qo-pill">No</span>'}</td>
                <td>${esc(o.updated_at || "")}</td>
                <td><pre class="qo-details">${esc(payloadPreview)}</pre></td>
                <td>
                  <div class="qo-row">
                    <button class="qo-btn secondary" data-review="${esc(o.id)}" data-decision="approved" type="button">Approve</button>
                    <button class="qo-btn" data-review="${esc(o.id)}" data-decision="published" type="button">Publish</button>
                    <button class="qo-btn warn" data-review="${esc(o.id)}" data-decision="archived" type="button">Archive</button>
                  </div>
                  <textarea class="qo-textarea" data-reason="${esc(o.id)}" placeholder="Rejection reason, if rejecting"></textarea>
                  <div class="qo-row">
                    <button class="qo-btn danger" data-review="${esc(o.id)}" data-decision="rejected" type="button">Reject</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    box.querySelectorAll("[data-review]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-review");
        const decision = btn.getAttribute("data-decision");

        if (!id || !decision) return;

        let reason = "";
        if (decision === "rejected") {
          const reasonEl = box.querySelector(`[data-reason="${CSS.escape(id)}"]`);
          reason = reasonEl?.value || "";

          if (!reason.trim()) {
            const okNoReason = confirm("Reject without a rejection reason?");
            if (!okNoReason) return;
          }
        }

        const ok = confirm(`Apply decision "${decision}" to this override?`);
        if (!ok) return;

        try {
          await rpc("csvb_admin_review_company_question_override", {
            p_override_id: id,
            p_decision: decision,
            p_rejection_reason: reason || null
          });

          setMsg("ok", `Override ${decision}.`);
          await refreshAll();
        } catch (e) {
          setMsg("err", "Review action failed:\n" + (e?.message || String(e)));
        }
      });
    });
  }

  async function refreshCompanies() {
    const result = await rpc("csvb_admin_list_companies");
    state.companies = result || [];
    renderCompanyFilter();
  }

  async function refreshSummary() {
    state.summary = await rpc("csvb_admin_company_question_override_summary");
    renderSummary();
  }

  async function refreshOverrideList() {
    const companyId = $("qoCompanyFilter")?.value || null;
    const status = $("qoStatusFilter")?.value || null;

    state.overrides = await rpc("csvb_admin_list_company_question_overrides", {
      p_company_id: companyId || null,
      p_status: status || null
    });

    renderOverrideList();
  }

  async function refreshAll() {
    setMsg("", "");

    try {
      await refreshCompanies();
      await refreshSummary();
      await refreshOverrideList();
      state.loaded = true;
      setMsg("ok", "Company question override review loaded.");
    } catch (e) {
      setMsg("err", "Load failed:\n" + (e?.message || String(e)));
    }
  }

  function wirePanel() {
    $("qoRefreshBtn")?.addEventListener("click", refreshAll);

    $("qoCompanyFilter")?.addEventListener("change", async () => {
      try {
        await refreshOverrideList();
      } catch (e) {
        setMsg("err", "Filter failed:\n" + (e?.message || String(e)));
      }
    });

    $("qoStatusFilter")?.addEventListener("change", async () => {
      try {
        await refreshOverrideList();
      } catch (e) {
        setMsg("err", "Filter failed:\n" + (e?.message || String(e)));
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

    if (!isPlatformRole(role)) return;

    createPanel();

    setTimeout(addOpenButton, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.CSVB_QUESTION_OVERRIDES_ADMIN = {
    BUILD,
    state,
    refreshAll
  };
})();
