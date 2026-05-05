// public/threads.js
// C.S.V. BEACON — Threads module frontend v2

(() => {
  "use strict";

  const BUILD = "THREADS-FRONTEND-V2-2026-05-01";

  const state = {
    sb: null,
    me: null,
    companies: [],
    vessels: [],
    participants: [],
    questions: [],
    selectedCompanyId: "",
    selectedQuestion: null,
    pgnoItems: [],
    selectedPgno: null,
    threads: [],
    selectedThread: null,
    messages: [],
    threadParticipants: [],
    notifications: [],
    prefillThreadType: null,
    prefillSourceModule: null
  };

  const $ = (id) => document.getElementById(id);

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

  async function rpc(name, args = {}) {
    const { data, error } = await state.sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function roleAllowed(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent", "vessel"].includes(String(role || ""));
  }

  function activeCompanyId() {
    if (isPlatformRole(state.me?.profile?.role)) return state.selectedCompanyId || null;
    return state.me?.profile?.company_id || state.me?.company?.id || null;
  }

  function fmtDate(v) {
    if (!v) return "";
    try { return new Date(v).toLocaleString(); }
    catch (_) { return String(v); }
  }

  function pill(value, extra = "") {
    const cls = String(value || "").toLowerCase();
    return `<span class="pill ${esc(cls)} ${esc(extra)}">${esc(value || "—")}</span>`;
  }

  function normalizePayload(row) {
    const p = row?.effective_payload || row?.payload || row?.question_json || {};
    return (typeof p === "object" && p !== null) ? p : {};
  }

  function pick(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  }

  function normalizeQuestion(row) {
    const p = normalizePayload(row);

    const number = String(
      row.number_full ||
      row.number_base ||
      row.question_no ||
      p.number_full ||
      p.number ||
      p.question_no ||
      p["Question No"] ||
      ""
    ).trim();

    const text = String(
      row.question_text ||
      pick(p, ["question", "Question", "question_text", "Question Text", "short_text", "Short Text", "text", "Text"])
    ).trim();

    const pgno =
      row.effective_pgno ||
      row.pgno ||
      row.pgnos ||
      p.effective_pgno ||
      p.pgno ||
      p.PGNO ||
      p.pgnos ||
      p["Potential Grounds for Negative Observations"] ||
      [];

    return {
      raw: row,
      id: String(row.question_id || row.id || p.id || ""),
      number,
      text,
      source_type: String(row.source_type || p.source_type || ""),
      is_custom: row.is_custom === true,
      pgno
    };
  }

  function normalizePgnoList(value, qno = "") {
    let arr = value;

    if (typeof arr === "string") {
      try {
        arr = JSON.parse(arr);
      } catch (_) {
        arr = arr.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      }
    }

    if (!Array.isArray(arr)) arr = [];

    return arr.map((item, idx) => {
      if (typeof item === "string") {
        const n = idx + 1;
        return {
          index: n,
          code: qno ? `${qno}.${String(n).padStart(2, "0")}` : String(n),
          text: item
        };
      }

      const o = item || {};
      const n = Number(o.pgno_index || o.seq || o.index || idx + 1);
      return {
        index: n,
        code: String(o.pgno_code || o.code || o.number || (qno ? `${qno}.${String(n).padStart(2, "0")}` : n)),
        text: String(o.pgno_text || o.text || o.PGNO || o.description || o.value || "").trim(),
        raw: o
      };
    }).filter((x) => x.text || x.code);
  }

  function selectedParticipantIds() {
    return Array.from($("participantList")?.querySelectorAll("input[type='checkbox']:checked") || [])
      .map((x) => x.value)
      .filter(Boolean);
  }

  function vesselsForActiveCompany() {
    const cid = activeCompanyId();

    if (!isPlatformRole(state.me?.profile?.role)) return state.vessels || [];
    if (!cid) return [];

    return (state.vessels || []).filter((v) => String(v.company_id || "") === String(cid));
  }

  function renderCompanies() {
    const panel = $("platformCompanyCard");
    const sel = $("platformCompanySelect");

    if (!panel || !sel) return;

    if (!isPlatformRole(state.me?.profile?.role)) {
      panel.style.display = "none";
      return;
    }

    panel.style.display = "block";

    sel.innerHTML = [
      `<option value="">Select company…</option>`,
      ...state.companies.map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return `<option value="${esc(c.id)}">${esc(label)}</option>`;
      })
    ].join("");

    if (!state.selectedCompanyId && state.companies[0]?.id) state.selectedCompanyId = state.companies[0].id;
    sel.value = state.selectedCompanyId || "";
  }

  function renderVessels() {
    const vessels = vesselsForActiveCompany();

    const opts = [
      `<option value="">All / none</option>`,
      ...vessels.map((v) => `<option value="${esc(v.id)}">${esc(v.name || v.vessel_name || v.id)}</option>`)
    ].join("");

    for (const id of ["vesselFilter", "createVessel"]) {
      const sel = $(id);
      if (sel) sel.innerHTML = opts;
    }
  }

  function renderParticipantsPicker() {
    const box = $("participantList");
    const responsible = $("responsibleSelect");
    const verifier = $("verifierSelect");

    if (!box) return;

    if (!state.participants.length) {
      box.innerHTML = `<div class="muted">No company users available.</div>`;
    } else {
      box.innerHTML = state.participants.map((p) => {
        const meta = [p.role, p.profile_position, p.vessel_name].filter(Boolean).join(" • ");
        return `
          <label class="participant-row">
            <input type="checkbox" value="${esc(p.id)}" />
            <span>
              <span class="participant-name">${esc(p.username || p.id)}</span>
              <span class="participant-meta">${esc(meta)}</span>
            </span>
          </label>
        `;
      }).join("");
    }

    const userOpts = [
      `<option value="">None</option>`,
      ...state.participants.map((p) => {
        const label = [p.username, p.role, p.vessel_name].filter(Boolean).join(" • ");
        return `<option value="${esc(p.id)}">${esc(label)}</option>`;
      })
    ].join("");

    if (responsible) responsible.innerHTML = userOpts;
    if (verifier) verifier.innerHTML = userOpts;
  }

  async function loadParticipants() {
    const cid = activeCompanyId();

    if (isPlatformRole(state.me?.profile?.role) && !cid) {
      state.participants = [];
      renderParticipantsPicker();
      return;
    }

    state.participants = await rpc("csvb_thread_available_participants", {
      p_company_id: cid,
      p_search: null
    });

    renderParticipantsPicker();
  }

  async function loadNotifications() {
    try {
      state.notifications = await rpc("csvb_thread_notifications_for_me", { p_only_unread: true });
    } catch (_) {
      state.notifications = [];
    }

    const btn = $("notificationsBtn");
    if (btn) btn.textContent = `Alerts: ${state.notifications.length}`;

    const list = $("notificationsList");
    if (!list) return;

    if (!state.notifications.length) {
      list.innerHTML = `<div class="muted">No unread alerts.</div>`;
      return;
    }

    list.innerHTML = state.notifications.map((n) => `
      <div class="notification-item">
        <div class="thread-title">${esc(n.title)}</div>
        <div class="muted">${esc(n.body || "")}</div>
        <div class="message-meta">${esc(n.event_type)} • ${esc(fmtDate(n.created_at))}</div>
      </div>
    `).join("");
  }

  async function loadBootstrap() {
    if (isPlatformRole(state.me?.profile?.role)) {
      state.companies = await rpc("csvb_admin_list_companies");
    }

    state.vessels = await rpc("csvb_accessible_vessels_for_me");

    renderCompanies();
    renderVessels();
    await loadParticipants();
    await loadNotifications();
  }

  async function loadThreads() {
    const role = state.me?.profile?.role;

    if (isPlatformRole(role) && !state.selectedCompanyId) {
      state.threads = [];
      renderThreads();
      msg("warn", "Select a company to view/create threads.");
      return;
    }

    state.threads = await rpc("csvb_threads_for_me", {
      p_company_id: isPlatformRole(role) ? activeCompanyId() : null,
      p_status: $("statusFilter")?.value || null,
      p_vessel_id: $("vesselFilter")?.value || null,
      p_search: $("searchInput")?.value || null
    });

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
      btn.addEventListener("click", () => openThread(btn.getAttribute("data-open-thread")));
    });
  }

  async function loadQuestions() {
    const cid = activeCompanyId();

    if (!cid) {
      state.questions = [];
      renderQuestionResults("Select a company first.");
      return;
    }

    const rows = await rpc("csvb_effective_question_library_for_company", { p_company_id: cid });
    const s = ($("questionSearchInput")?.value || "").trim().toLowerCase();

    state.questions = (rows || [])
      .map(normalizeQuestion)
      .filter((q) => !s || q.number.toLowerCase().includes(s) || q.text.toLowerCase().includes(s))
      .slice(0, 100);

    renderQuestionResults();
  }

  function renderQuestionResults(empty = "No questions found.") {
    const body = $("questionResultsTbody");
    if (!body) return;

    if (!state.questions.length) {
      body.innerHTML = `<tr><td colspan="4" class="muted">${esc(empty)}</td></tr>`;
      return;
    }

    body.innerHTML = state.questions.map((q, idx) => `
      <tr>
        <td>${esc(q.number || "—")}</td>
        <td>${esc(q.text || "No question text found")}</td>
        <td>${esc(q.source_type || "")}${q.is_custom ? " / custom" : ""}</td>
        <td><button class="secondary" data-select-question="${idx}" type="button">Select</button></td>
      </tr>
    `).join("");

    body.querySelectorAll("[data-select-question]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectQuestion(state.questions[Number(btn.getAttribute("data-select-question"))]);
      });
    });
  }

  function selectQuestion(q) {
    state.selectedQuestion = q || null;
    state.selectedPgno = null;
    state.pgnoItems = q ? normalizePgnoList(q.pgno, q.number) : [];

    const qBox = $("selectedQuestionBox");
    if (qBox) {
      qBox.className = q ? "selected-box" : "selected-box muted";
      qBox.innerHTML = q ? `<strong>${esc(q.number)}</strong> — ${esc(q.text || "")}` : "No question selected.";
    }

    renderPgnoSelect();
  }

  function renderPgnoSelect() {
    const sel = $("pgnoSelect");
    const box = $("selectedPgnoBox");

    if (!sel) return;

    if (!state.pgnoItems.length) {
      sel.innerHTML = `<option value="">No PGNOs found for selected question</option>`;
      if (box) {
        box.className = "selected-box muted";
        box.textContent = "No PGNO selected.";
      }
      return;
    }

    sel.innerHTML = [
      `<option value="">Select PGNO…</option>`,
      ...state.pgnoItems.map((p, idx) => `<option value="${idx}">${esc(`${p.code || p.index} — ${p.text}`.slice(0, 180))}</option>`)
    ].join("");

    if (box) {
      box.className = "selected-box muted";
      box.textContent = "No PGNO selected.";
    }
  }

  function updatePgnoSelection() {
    const idx = $("pgnoSelect")?.value;
    state.selectedPgno = idx !== "" && idx !== undefined ? state.pgnoItems[Number(idx)] : null;

    const box = $("selectedPgnoBox");
    if (!box) return;

    if (!state.selectedPgno) {
      box.className = "selected-box muted";
      box.textContent = "No PGNO selected.";
      return;
    }

    box.className = "selected-box";
    box.innerHTML = `<strong>${esc(state.selectedPgno.code)}</strong> — ${esc(state.selectedPgno.text)}`;
  }

  function applyIncomingPrefill() {
    const params = new URLSearchParams(window.location.search || "");
    const source = params.get("source") || "";

    if (source !== "questionnaire_pgno") return;

    const qno = params.get("question_no") || "";
    const qText = params.get("question_text") || "";
    const pgnoIndex = Number(params.get("pgno_index") || 0);
    const pgnoCode = params.get("pgno_code") || "";
    const pgnoText = params.get("pgno_text") || "";

    const title = params.get("title") || (qno ? `Q ${qno} / PGNO ${pgnoIndex || ""}` : "Questionnaire PGNO thread");
    const initial = params.get("initial_message") || "";

    if ($("createSourceMode")) $("createSourceMode").value = "pgno";
    if ($("createTitle")) $("createTitle").value = title;
    if ($("createInitialMessage")) $("createInitialMessage").value = initial;

    state.selectedQuestion = {
      id: "",
      number: qno,
      text: qText,
      source_type: "questionnaire",
      is_custom: false,
      pgno: []
    };

    state.selectedPgno = {
      index: pgnoIndex || 1,
      code: pgnoCode || (qno ? `${qno}.${String(pgnoIndex || 1).padStart(2, "0")}` : String(pgnoIndex || 1)),
      text: pgnoText
    };

    state.pgnoItems = [state.selectedPgno];

    updateCreateModeUI();

    const qBox = $("selectedQuestionBox");
    if (qBox) {
      qBox.className = "selected-box";
      qBox.innerHTML = `<strong>${esc(qno || "Question")}</strong>${qText ? " — " + esc(qText) : ""}`;
    }

    renderPgnoSelect();

    const sel = $("pgnoSelect");
    if (sel) {
      sel.value = "0";
      updatePgnoSelection();
    }
  }

  function applyIncomingPostInspectionPrefill() {
    const params = new URLSearchParams(window.location.search || "");
    const source = params.get("source") || "";

    if (source !== "post_inspection_observation") return;

    const qno = params.get("question_no") || "";
    const qText = params.get("question_text") || "";
    const pgnoText = params.get("pgno_text") || "";
    const title = params.get("title") || (qno ? `Post-inspection observation — Q ${qno}` : "Post-inspection observation thread");
    const initial = params.get("initial_message") || "";

    state.prefillThreadType = "post_inspection_observation";
    state.prefillSourceModule = "post_inspection";

    if ($("createSourceMode")) $("createSourceMode").value = pgnoText ? "pgno" : "question";
    if ($("createTitle")) $("createTitle").value = title;
    if ($("createInitialMessage")) $("createInitialMessage").value = initial;

    state.selectedQuestion = {
      id: "",
      number: qno,
      text: qText,
      source_type: "post_inspection",
      is_custom: false,
      pgno: []
    };

    if (pgnoText) {
      state.selectedPgno = {
        index: 1,
        code: qno ? `${qno}.PGNO` : "PGNO",
        text: pgnoText
      };
      state.pgnoItems = [state.selectedPgno];
    } else {
      state.selectedPgno = null;
      state.pgnoItems = [];
    }

    updateCreateModeUI();

    const qBox = $("selectedQuestionBox");
    if (qBox) {
      qBox.className = "selected-box";
      qBox.innerHTML = `<strong>${esc(qno || "Post-inspection observation")}</strong>${qText ? " — " + esc(qText) : ""}`;
    }

    renderPgnoSelect();

    if (pgnoText && $("pgnoSelect")) {
      $("pgnoSelect").value = "0";
      updatePgnoSelection();
    }
  }

  function updateCreateModeUI() {
    const mode = $("createSourceMode")?.value || "general";

    $("questionSelectorBlock").style.display = mode === "question" || mode === "pgno" ? "block" : "none";
    $("pgnoSelectorBlock").style.display = mode === "pgno" ? "block" : "none";

    if (mode === "general") {
      state.selectedQuestion = null;
      state.selectedPgno = null;
      state.pgnoItems = [];
      $("selectedQuestionBox").className = "selected-box muted";
      $("selectedQuestionBox").textContent = "No question selected.";
      $("selectedPgnoBox").className = "selected-box muted";
      $("selectedPgnoBox").textContent = "No PGNO selected.";
    } else if (!state.questions.length) {
      loadQuestions().catch((e) => msg("err", "Question load failed:\n" + (e?.message || String(e))));
    }
  }

  async function openThread(id) {
    if (!id) return;

    const t = await rpc("csvb_get_thread_for_me", { p_thread_id: id });
    state.selectedThread = Array.isArray(t) ? t[0] : t;

    state.messages = await rpc("csvb_thread_messages_for_me", { p_thread_id: id });
    state.threadParticipants = await rpc("csvb_thread_participants_for_me", { p_thread_id: id });

    renderThreadDetail();
  }

  function renderThreadDetail() {
    const box = $("threadDetailBox");
    const actions = $("threadDetailActions");

    if (!state.selectedThread) {
      box.className = "muted";
      box.textContent = "Select a thread to open it.";
      actions.style.display = "none";
      return;
    }

    const t = state.selectedThread;
    const meta = [
      t.question_no ? `Question: ${t.question_no}` : "",
      t.pgno_code ? `PGNO: ${t.pgno_code}` : "",
      t.target_date ? `Target: ${t.target_date}` : ""
    ].filter(Boolean).join(" • ");

    box.className = "";
    box.innerHTML = `
      <div class="thread-detail-head">
        <div>
          <div class="thread-title">${esc(t.title)}</div>
          <div class="muted">${esc(meta || "General thread")}</div>
          ${t.pgno_text ? `<div class="compact-note" style="margin-top:6px;">${esc(t.pgno_text)}</div>` : ""}
        </div>
        <div>${pill(t.status)} ${pill(t.priority, t.priority)}</div>
      </div>
    `;

    actions.style.display = "block";
    $("statusUpdateSelect").value = t.status || "open";
    renderThreadParticipants();
    renderMessages();
  }

  function renderThreadParticipants() {
    const box = $("threadParticipantsBox");
    if (!box) return;

    if (!state.threadParticipants.length) {
      box.innerHTML = `<div class="muted">No participants.</div>`;
      return;
    }

    box.innerHTML = state.threadParticipants.map((p) => {
      const meta = [p.role, p.profile_position, p.vessel_name].filter(Boolean).join(" • ");
      return `
        <div class="participant-chip">
          <strong>${esc(p.username || p.user_id)}</strong>
          <span>${esc(p.participant_role)}</span>
          <small>${esc(meta)}</small>
        </div>
      `;
    }).join("");
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

  async function createThread() {
    const title = $("createTitle")?.value || "";
    const initial = $("createInitialMessage")?.value || "";
    const mode = $("createSourceMode")?.value || "general";

    if (!title.trim()) {
      msg("warn", "Thread title is required.");
      return;
    }

    if ((mode === "question" || mode === "pgno") && !state.selectedQuestion) {
      msg("warn", "Select a question first.");
      return;
    }

    if (mode === "pgno" && !state.selectedPgno) {
      msg("warn", "Select a PGNO first.");
      return;
    }

    const thread = await rpc("csvb_create_thread", {
      p_company_id: isPlatformRole(state.me?.profile?.role) ? activeCompanyId() : null,
      p_vessel_id: $("createVessel")?.value || null,
      p_title: title,
      p_thread_type: state.prefillThreadType || (mode === "general" ? "general" : mode),
      p_source_module: state.prefillSourceModule || (mode === "general" ? "threads" : "questions"),
      p_source_record_id: null,
      p_questionnaire_id: null,
      p_question_no: state.selectedQuestion?.number || null,
      p_pgno_index: state.selectedPgno?.index || null,
      p_pgno_code: state.selectedPgno?.code || null,
      p_pgno_text: state.selectedPgno?.text || null,
      p_priority: $("createPriority")?.value || "normal",
      p_responsible_user_id: $("responsibleSelect")?.value || null,
      p_verifier_user_id: $("verifierSelect")?.value || null,
      p_target_date: null,
      p_initial_message: initial || null
    });

    const created = Array.isArray(thread) ? thread[0] : thread;

    if (created?.id) {
      await rpc("csvb_set_thread_participants", {
        p_thread_id: created.id,
        p_user_ids: selectedParticipantIds(),
        p_responsible_user_id: $("responsibleSelect")?.value || null,
        p_verifier_user_id: $("verifierSelect")?.value || null
      });
    }

    msg("ok", "Thread created.");
    clearCreateForm();
    await loadThreads();
    await loadNotifications();
    if (created?.id) await openThread(created.id);
  }

  function clearCreateForm() {
    ["createTitle", "questionSearchInput", "createInitialMessage"].forEach((id) => {
      const x = $(id);
      if (x) x.value = "";
    });

    $("createSourceMode").value = "general";
    $("createPriority").value = "normal";
    $("responsibleSelect").value = "";
    $("verifierSelect").value = "";

    state.questions = [];
    state.selectedQuestion = null;
    state.pgnoItems = [];
    state.selectedPgno = null;
    state.prefillThreadType = null;
    state.prefillSourceModule = null;

    renderQuestionResults("Search or select source to load questions.");
    renderPgnoSelect();
    updateCreateModeUI();

    $("participantList")?.querySelectorAll("input[type='checkbox']").forEach((x) => x.checked = false);
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
    await loadNotifications();
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
    await loadNotifications();
    msg("ok", "Status updated.");
  }

  async function markAlertsRead() {
    await rpc("csvb_mark_thread_notifications_read", { p_notification_ids: null });
    await loadNotifications();
  }

  function wire() {
    $("dashboardBtn")?.addEventListener("click", () => window.location.href = "./q-dashboard.html");
    $("logoutBtn")?.addEventListener("click", async () => {
      await state.sb.auth.signOut();
      window.location.href = "./login.html";
    });

    $("refreshBtn")?.addEventListener("click", async () => {
      await loadBootstrap();
      await loadThreads();
      await loadNotifications();
    });

    $("notificationsBtn")?.addEventListener("click", () => {
      const c = $("notificationsCard");
      if (c) c.style.display = c.style.display === "none" ? "block" : "none";
    });

    $("markAlertsReadBtn")?.addEventListener("click", () => markAlertsRead().catch((e) => msg("err", e.message || String(e))));

    $("applyFilterBtn")?.addEventListener("click", loadThreads);
    $("statusFilter")?.addEventListener("change", loadThreads);
    $("vesselFilter")?.addEventListener("change", loadThreads);
    $("searchInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") loadThreads(); });

    $("platformCompanySelect")?.addEventListener("change", async () => {
      state.selectedCompanyId = $("platformCompanySelect").value || "";
      renderVessels();
      await loadParticipants();
      await loadQuestions();
      await loadThreads();
      state.selectedThread = null;
      state.messages = [];
      state.threadParticipants = [];
      renderThreadDetail();
    });

    $("createSourceMode")?.addEventListener("change", updateCreateModeUI);
    $("questionSearchBtn")?.addEventListener("click", () => loadQuestions().catch((e) => msg("err", "Question search failed:\n" + (e.message || String(e)))));
    $("questionSearchInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadQuestions().catch((err) => msg("err", "Question search failed:\n" + (err.message || String(err))));
    });
    $("pgnoSelect")?.addEventListener("change", updatePgnoSelection);

    $("createThreadBtn")?.addEventListener("click", () => createThread().catch((e) => msg("err", "Create thread failed:\n" + (e.message || String(e)))));
    $("clearCreateBtn")?.addEventListener("click", clearCreateForm);
    $("addMessageBtn")?.addEventListener("click", () => addMessage().catch((e) => msg("err", "Add message failed:\n" + (e.message || String(e)))));
    $("updateStatusBtn")?.addEventListener("click", () => updateStatus().catch((e) => msg("err", "Update status failed:\n" + (e.message || String(e)))));
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
    applyIncomingPrefill();
    applyIncomingPostInspectionPrefill();
    await loadThreads();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch((e) => msg("err", String(e.message || e))));
  } else {
    init().catch((e) => msg("err", String(e.message || e)));
  }
})();
