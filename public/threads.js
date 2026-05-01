// public/threads.js
// C.S.V. BEACON — Threads module frontend

(() => {
  "use strict";

  const BUILD = "THREADS-FRONTEND-2026-05-01";

  const state = {
    sb: null,
    me: null,
    companies: [],
    vessels: [],
    threads: [],
    selectedThread: null,
    messages: [],
    selectedCompanyId: ""
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

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function roleAllowed(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent", "vessel"].includes(String(role || ""));
  }

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function fmtDate(v) {
    if (!v) return "";
    try {
      return new Date(v).toLocaleString();
    } catch (_) {
      return String(v);
    }
  }

  function pill(value, extra = "") {
    const cls = String(value || "").toLowerCase();
    return `<span class="pill ${esc(cls)} ${esc(extra)}">${esc(value || "—")}</span>`;
  }

  function activeCompanyId() {
    if (isPlatformRole(state.me?.profile?.role)) return state.selectedCompanyId || null;
    return null;
  }

  function filteredVesselsForCompany() {
    const cid = activeCompanyId();
    if (!cid) return state.vessels || [];
    return (state.vessels || []).filter((v) => String(v.company_id || "") === String(cid));
  }

  function renderVesselSelects() {
    const vessels = filteredVesselsForCompany();

    const opts = [
      '<option value="">All / none</option>',
      ...vessels.map((v) => `<option value="${esc(v.id)}">${esc(v.name || v.vessel_name || v.id)}</option>`)
    ].join("");

    for (const id of ["vesselFilter", "createVessel"]) {
      const sel = $(id);
      if (sel) sel.innerHTML = opts;
    }
  }

  function renderCompanySelect() {
    const panel = $("platformCompanyCard");
    const sel = $("platformCompanySelect");

    if (!panel || !sel) return;

    const role = state.me?.profile?.role;

    if (!isPlatformRole(role)) {
      panel.style.display = "none";
      return;
    }

    panel.style.display = "block";

    sel.innerHTML = [
      '<option value="">Select company…</option>',
      ...state.companies.map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return `<option value="${esc(c.id)}">${esc(label)}</option>`;
      })
    ].join("");

    if (!state.selectedCompanyId && state.companies[0]?.id) {
      state.selectedCompanyId = state.companies[0].id;
    }

    sel.value = state.selectedCompanyId || "";
  }

  async function loadBootstrap() {
    const role = state.me?.profile?.role;

    if (isPlatformRole(role)) {
      state.companies = await rpc("csvb_admin_list_companies");
    }

    state.vessels = await rpc("csvb_accessible_vessels_for_me");

    renderCompanySelect();
    renderVesselSelects();
  }

  async function loadThreads() {
    const role = state.me?.profile?.role;

    if (isPlatformRole(role) && !state.selectedCompanyId) {
      state.threads = [];
      renderThreads();
      msg("warn", "Select a company to view/create threads.");
      return;
    }

    const rows = await rpc("csvb_threads_for_me", {
      p_company_id: activeCompanyId(),
      p_status: $("statusFilter")?.value || null,
      p_vessel_id: $("vesselFilter")?.value || null,
      p_search: $("searchInput")?.value || null
    });

    state.threads = rows || [];
    renderThreads();
    msg("", "");
  }

  function renderThreads() {
    const body = $("threadsTbody");
    if (!body) return;

    if (!state.threads.length) {
      body.innerHTML = `<tr><td colspan="8" class="muted">No threads found for current filters.</td></tr>`;
      return;
    }

    body.innerHTML = state.threads.map((t) => {
      const qp = [
        t.question_no ? `Q: ${t.question_no}` : "",
        t.pgno_code ? `PGNO: ${t.pgno_code}` : "",
        t.pgno_index ? `#${t.pgno_index}` : ""
      ].filter(Boolean).join("<br>");

      return `
        <tr>
          <td>
            <div class="thread-title">${esc(t.title)}</div>
            <div class="muted">${esc(t.thread_type || "")} ${t.source_module ? "• " + esc(t.source_module) : ""}</div>
          </td>
          <td>${pill(t.status || "open")}</td>
          <td>${pill(t.priority || "normal", t.priority || "")}</td>
          <td>${esc(t.vessel_name || "—")}</td>
          <td>${qp || "—"}</td>
          <td>${esc(t.message_count || 0)}</td>
          <td>${esc(fmtDate(t.last_message_at || t.updated_at || t.created_at))}</td>
          <td><button class="secondary" data-open-thread="${esc(t.id)}" type="button">Open</button></td>
        </tr>
      `;
    }).join("");

    body.querySelectorAll("[data-open-thread]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await openThread(btn.getAttribute("data-open-thread"));
      });
    });
  }

  function renderThreadDetail() {
    const box = $("threadDetailBox");
    const actions = $("threadDetailActions");

    if (!box || !actions) return;

    const t = state.selectedThread;

    if (!t) {
      box.className = "muted";
      box.textContent = "Select a thread to open it.";
      actions.style.display = "none";
      return;
    }

    const meta = [
      t.company_id ? `Company: ${t.company_id}` : "",
      t.vessel_id ? `Vessel: ${t.vessel_id}` : "",
      t.question_no ? `Question: ${t.question_no}` : "",
      t.pgno_code ? `PGNO: ${t.pgno_code}` : "",
      t.target_date ? `Target: ${t.target_date}` : ""
    ].filter(Boolean).join(" • ");

    box.className = "";
    box.innerHTML = `
      <div class="thread-detail-head">
        <div>
          <div class="thread-title">${esc(t.title)}</div>
          <div class="muted">${esc(meta)}</div>
          ${t.pgno_text ? `<div class="compact-note" style="margin-top:6px;">${esc(t.pgno_text)}</div>` : ""}
        </div>
        <div>${pill(t.status)} ${pill(t.priority, t.priority)}</div>
      </div>
    `;

    actions.style.display = "block";
    $("statusUpdateSelect").value = t.status || "open";

    renderMessages();
  }

  function renderMessages() {
    const box = $("messagesBox");
    if (!box) return;

    if (!state.messages.length) {
      box.innerHTML = `<div class="muted">No messages yet.</div>`;
      return;
    }

    box.innerHTML = state.messages.map((m) => `
      <div class="message">
        <div class="message-meta">
          ${esc(m.created_by_username || "Unknown")} • ${esc(m.created_by_role || "")} • ${esc(fmtDate(m.created_at))}
          ${m.is_system ? " • system" : ""}
        </div>
        <div class="message-text">${esc(m.message_text || "")}</div>
      </div>
    `).join("");

    box.scrollTop = box.scrollHeight;
  }

  async function openThread(id) {
    if (!id) return;

    const t = await rpc("csvb_get_thread_for_me", {
      p_thread_id: id
    });

    state.selectedThread = Array.isArray(t) ? t[0] : t;

    state.messages = await rpc("csvb_thread_messages_for_me", {
      p_thread_id: id
    });

    renderThreadDetail();
  }

  async function createThread() {
    const title = $("createTitle")?.value || "";
    const initial = $("createInitialMessage")?.value || "";

    if (!title.trim()) {
      msg("warn", "Thread title is required.");
      return;
    }

    const pgnoIndexRaw = $("createPgnoIndex")?.value || "";
    const pgnoIndex = pgnoIndexRaw ? Number(pgnoIndexRaw) : null;

    const thread = await rpc("csvb_create_thread", {
      p_company_id: activeCompanyId(),
      p_vessel_id: $("createVessel")?.value || null,
      p_title: title,
      p_thread_type: $("createType")?.value || "general",
      p_source_module: "threads",
      p_source_record_id: null,
      p_questionnaire_id: null,
      p_question_no: $("createQuestionNo")?.value || null,
      p_pgno_index: pgnoIndex,
      p_pgno_code: $("createPgnoCode")?.value || null,
      p_pgno_text: $("createPgnoText")?.value || null,
      p_priority: $("createPriority")?.value || "normal",
      p_responsible_user_id: null,
      p_verifier_user_id: null,
      p_target_date: null,
      p_initial_message: initial || null
    });

    msg("ok", "Thread created.");

    clearCreateForm();
    await loadThreads();

    const created = Array.isArray(thread) ? thread[0] : thread;
    if (created?.id) await openThread(created.id);
  }

  function clearCreateForm() {
    for (const id of [
      "createTitle",
      "createQuestionNo",
      "createPgnoIndex",
      "createPgnoCode",
      "createPgnoText",
      "createInitialMessage"
    ]) {
      const el = $(id);
      if (el) el.value = "";
    }

    if ($("createType")) $("createType").value = "general";
    if ($("createPriority")) $("createPriority").value = "normal";
  }

  async function addMessage() {
    if (!state.selectedThread?.id) {
      msg("warn", "Open a thread first.");
      return;
    }

    const text = $("newMessageText")?.value || "";

    if (!text.trim()) {
      msg("warn", "Message text is required.");
      return;
    }

    await rpc("csvb_add_thread_message", {
      p_thread_id: state.selectedThread.id,
      p_message_text: text,
      p_message_type: "comment"
    });

    $("newMessageText").value = "";

    await openThread(state.selectedThread.id);
    await loadThreads();
    msg("ok", "Message added.");
  }

  async function updateStatus() {
    if (!state.selectedThread?.id) {
      msg("warn", "Open a thread first.");
      return;
    }

    const status = $("statusUpdateSelect")?.value || "open";

    await rpc("csvb_update_thread_status", {
      p_thread_id: state.selectedThread.id,
      p_status: status,
      p_closeout_date: status === "closed" ? new Date().toISOString().slice(0, 10) : null
    });

    await openThread(state.selectedThread.id);
    await loadThreads();
    msg("ok", "Status updated.");
  }

  function wire() {
    $("dashboardBtn")?.addEventListener("click", () => {
      window.location.href = "./q-dashboard.html";
    });

    $("logoutBtn")?.addEventListener("click", async () => {
      await state.sb.auth.signOut();
      window.location.href = "./login.html";
    });

    $("refreshBtn")?.addEventListener("click", async () => {
      await loadBootstrap();
      await loadThreads();
    });

    $("applyFilterBtn")?.addEventListener("click", loadThreads);
    $("statusFilter")?.addEventListener("change", loadThreads);
    $("vesselFilter")?.addEventListener("change", loadThreads);
    $("searchInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadThreads();
    });

    $("platformCompanySelect")?.addEventListener("change", async () => {
      state.selectedCompanyId = $("platformCompanySelect").value || "";
      renderVesselSelects();
      await loadThreads();
      state.selectedThread = null;
      state.messages = [];
      renderThreadDetail();
    });

    $("createThreadBtn")?.addEventListener("click", async () => {
      try {
        await createThread();
      } catch (e) {
        msg("err", "Create thread failed:\n" + (e?.message || String(e)));
      }
    });

    $("clearCreateBtn")?.addEventListener("click", clearCreateForm);

    $("addMessageBtn")?.addEventListener("click", async () => {
      try {
        await addMessage();
      } catch (e) {
        msg("err", "Add message failed:\n" + (e?.message || String(e)));
      }
    });

    $("updateStatusBtn")?.addEventListener("click", async () => {
      try {
        await updateStatus();
      } catch (e) {
        msg("err", "Update status failed:\n" + (e?.message || String(e)));
      }
    });
  }

  async function init() {
    window.CSVB_THREADS_BUILD = BUILD;

    state.sb = window.AUTH.ensureSupabase();

    const R = window.AUTH.ROLES || {};
    state.me = await window.AUTH.requireAuth([
      R.SUPER_ADMIN,
      "platform_owner",
      R.COMPANY_ADMIN,
      R.COMPANY_SUPERINTENDENT,
      R.VESSEL
    ].filter(Boolean));

    const role = state.me?.profile?.role || "";
    if (!roleAllowed(role)) {
      msg("err", "Access denied for this role.");
      return;
    }

    const user = state.me?.profile?.username || state.me?.user?.email || "user";
    const company = state.me?.company?.company_name || state.me?.company?.short_name || "Platform";
    $("userBadge").textContent = `${user} • ${role} • ${company}`;

    wire();
    await loadBootstrap();
    await loadThreads();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((e) => msg("err", String(e?.message || e)));
    });
  } else {
    init().catch((e) => msg("err", String(e?.message || e)));
  }
})();
