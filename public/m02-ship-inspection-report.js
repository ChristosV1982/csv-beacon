(() => {
  "use strict";
  const BUILD = "M02_SHIP_INSPECTION_REPORT_PHASE1B_20261209_1";
  const MODULE_KEY = "m02_ship_inspection_report";
  const COMPANY_VIEW_ID_KEY = "csvb_superuser_company_view_id";
  const OPERATIONS = ["Loading", "Discharging", "Bunkering", "Deballasting", "Ballasting", "River transit", "IGS in operation", "Major repairs/Drydock", "COW in progress", "Repairs under way", "STS operations", "Idle", "At anchor", "At sea", "Other"];
  const el = (id) => document.getElementById(id);
  const appendices = window.CSVB_M02_APPENDICES;
  const state = {
    sb: null, bundle: null, context: null, companyId: null, canEdit: false,
    reports: [], report: null, answers: new Map(), questions: [], questionVersion: null,
    companyItems: [], companyAnswers: new Map(), attachments: [], workspace: {},
    referenceCache: new Map(), referenceRequests: new Map(), mode: "home", attachmentBusy: false,
    registerMode: "all", dirty: false, saving: false, expectedRevision: null,
    questionsToken: 0, pendingNavigation: null, previousFocus: null,
    createRequestId: null,
  };
  const text = (value) => value === null || value === undefined ? "" : String(value);
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const clean = (value) => text(value).trim();
  const $all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const setHidden = (node, hidden) => { if (node) node.hidden = hidden; };

  function message(host, value = "", kind = "error") {
    if (!host) return;
    host.textContent = value;
    host.classList.toggle("is-success", kind === "success");
    host.hidden = !value;
  }
  function showGlobal(value, kind = "error") { message(el("globalMessage"), value, kind); }
  function showEditorError(value) { message(el("editorMessage"), value, "error"); }
  function rpcError(error, label) {
    if (!error) return;
    const detail = error.message || error.details || error.hint || String(error);
    throw new Error(`${label}: ${detail}`);
  }
  async function rpc(name, args) {
    const { data, error } = await state.sb.rpc(name, args);
    rpcError(error, name);
    return data;
  }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function escapeTextNode(value) { return document.createTextNode(text(value)); }

  function waitForGuard() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const guard = window.CSVB_MODULE_GUARD;
        if (guard) {
          if (guard.moduleKey !== MODULE_KEY || guard.allowed !== true) {
            reject(new Error(guard.reason || "Access to M02 Ship Inspection Report was not granted. No report data was requested."));
            return;
          }
          resolve(guard);
          return;
        }
        if (Date.now() - started > 18000) {
          reject(new Error("The M02 access guard did not finish loading. No report data was requested."));
          return;
        }
        window.setTimeout(check, 70);
      };
      check();
    });
  }
  window.CSVB_M02_GUARD_READY = waitForGuard();
  window.CSVB_M02_BUILD = BUILD;

  function dateText(value) {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }
  function dateTimeText(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function requireEditorPermission() {
    if (!state.canEdit) throw new Error("The M02 service has not granted edit permission for this Company. This report is read-only.");
  }
  function setCompanySelect() {
    const select = el("companySelect");
    const companies = asArray(state.context?.companies);
    select.replaceChildren();
    if (!companies.length) {
      const option = new Option("No Company available", "");
      select.add(option); select.disabled = true; return;
    }
    companies.forEach((company) => select.add(new Option(company.name, company.id)));
    select.value = state.companyId || state.context?.company_id || "";
    select.disabled = !companies.length || (companies.length === 1 && Boolean(state.companyId));
    $all('[data-view="new"]').forEach((button) => { button.disabled = !state.companyId || !state.canEdit; });
    el("companyContextHint").textContent = state.context?.company_name
      ? `Active Company: ${state.context.company_name}. Reports and fleet observations stay within this context.`
      : "Select a Company context before viewing reports.";
    el("registerCompany").textContent = state.context?.company_name || "";
  }
  async function loadContext(companyId = null) {
    const result = await rpc("csvb_m02_context", { p_company_id: companyId || null });
    state.context = result || {};
    state.companyId = result?.company_id || null;
    state.canEdit = result?.can_edit === true;
    setCompanySelect();
    if (!state.companyId) throw new Error("No authorised Company context is available for M02.");
    const vessels = asArray(result.vessels).filter((vessel) => vessel?.is_active !== false);
    const vesselSelect = el("vesselId");
    const current = vesselSelect.value;
    vesselSelect.replaceChildren(new Option("Select a Company vessel", ""));
    vessels.forEach((vessel) => vesselSelect.add(new Option(vessel.name || "Unnamed vessel", vessel.id)));
    if (current && vessels.some((vessel) => vessel.id === current)) vesselSelect.value = current;
    if (state.mode === "editor" && !state.report?.id) renderVesselSnapshot();
    return result;
  }
  async function loadCompanyCatalogue() {
    state.companyItems = asArray(await rpc("csvb_m02_company_items", {}))
      .map((item) => ({ item_no: Number(item.item_no), item_text: text(item.item_text) }))
      .sort((a, b) => a.item_no - b.item_no);
    if (state.mode === "editor" && !state.report?.id) {
      state.companyAnswers = new Map(state.companyItems.map((item) => [item.item_no, { response: null, comments: "" }]));
      renderCompanyItems(); progress();
    }
  }
  async function loadReports() {
    if (!state.companyId) return;
    el("reportRows").innerHTML = '<tr><td colspan="7" class="m02-table-state">Loading Company reports…</td></tr>';
    try {
      state.reports = asArray(await rpc("csvb_m02_reports_v3", { p_company_id: state.companyId }));
      renderReports();
    } catch (error) {
      el("reportRows").innerHTML = "";
      const row = document.createElement("tr"), cell = document.createElement("td");
      cell.colSpan = 7; cell.className = "m02-table-state"; cell.textContent = error.message;
      row.append(cell); el("reportRows").append(row);
      el("reportCount").textContent = "Could not load reports";
      showGlobal(error.message);
    }
  }
  function filteredReports() {
    const vessel = clean(el("filterVessel").value).toLowerCase(), status = el("filterStatus").value;
    const from = el("filterFrom").value, to = el("filterTo").value;
    const superintendent = clean(el("filterSuperintendent").value).toLowerCase();
    const search = clean(el("filterSearch").value).toLowerCase();
    return state.reports.filter((row) => {
      const inspectionFrom = text(row.inspection_from), inspectionTo = text(row.inspection_to);
      const haystack = `${row.vessel_name || ""} ${row.attending_superintendent || ""} ${row.status || ""}`.toLowerCase();
      if (vessel && !text(row.vessel_name).toLowerCase().includes(vessel)) return false;
      if (status && row.status !== status) return false;
      if (from && inspectionTo && inspectionTo < from) return false;
      if (to && inspectionFrom && inspectionFrom > to) return false;
      if (superintendent && !text(row.attending_superintendent).toLowerCase().includes(superintendent)) return false;
      if (search && !haystack.includes(search)) return false;
      if (state.registerMode === "completed" && row.status !== "completed") return false;
      return true;
    });
  }
  function renderReports() {
    const rows = filteredReports();
    el("reportRows").replaceChildren();
    el("reportCount").textContent = `${rows.length} of ${state.reports.length} report${state.reports.length === 1 ? "" : "s"}`;
    setHidden(el("registerEmpty"), rows.length > 0);
    if (!rows.length) {
      const row = document.createElement("tr"), cell = document.createElement("td");
      cell.colSpan = 7; cell.className = "m02-table-state"; cell.textContent = state.reports.length ? "No reports match these filters." : "No M02 reports are available in this Company context.";
      row.append(cell); el("reportRows").append(row); setHidden(el("registerEmpty"), true); return;
    }
    rows.forEach((report) => {
      const tr = document.createElement("tr");
      const percent = Number(report.total_count) > 0 ? Math.min(100, Math.round(Number(report.checked_count || 0) / Number(report.total_count) * 100)) : 0;
      const values = [
        `<span class="m02-vessel-name">${escapeHtml(report.vessel_name || "Vessel")}</span>`,
        `<span class="m02-period">${escapeHtml(dateText(report.inspection_from))} – ${escapeHtml(dateText(report.inspection_to))}</span>`,
        escapeHtml(report.attending_superintendent || "—"),
        `<span class="m02-status ${report.status === "completed" ? "completed" : ""}">${escapeHtml(report.status || "draft")}</span>`,
        escapeHtml(dateTimeText(report.updated_at)),
         `<span class="m02-progress"><span class="m02-progress-track"><span style="width:${percent}%"></span></span>SIRE ${Number(report.checked_count || 0)}/${Number(report.total_count || 0)} · Co. ${Number(report.company_checked_count || 0)}/${Number(report.company_total_count || 51)}</span>`,
        `<button type="button" class="m02-open-report" data-open-report="${escapeHtml(report.id)}">Open</button>`
      ];
      const labels = ["Vessel", "Inspection period", "Superintendent", "Status", "Updated", "Progress", "Action"];
      values.forEach((value, index) => { const td = document.createElement("td"); td.dataset.label = labels[index]; td.innerHTML = value; tr.append(td); });
      el("reportRows").append(tr);
    });
  }
  function showView(view) {
    state.mode = view;
    setHidden(el("taskLanding"), view !== "home");
    setHidden(el("registerView"), view !== "register" && view !== "completed");
    setHidden(el("editorView"), view !== "editor");
    if (view === "register" || view === "completed") {
      state.registerMode = view === "completed" ? "completed" : "all";
      el("registerHeading").textContent = view === "completed" ? "Review Completed M02 Inspections" : "Continue / Manage M02 Inspections";
      renderReports();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function snapshotVessel(vesselId) {
    return asArray(state.context?.vessels).find((vessel) => vessel.id === vesselId) || null;
  }
  function renderVesselSnapshot() {
    const host = el("vesselSnapshot"), vessel = snapshotVessel(el("vesselId").value);
    host.replaceChildren();
    if (!vessel) { const span = document.createElement("span"); span.textContent = "Select a vessel to display its registered particulars."; host.append(span); el("editorVesselLabel").textContent = "Select a vessel to begin."; return; }
    [
      ["Registered name", vessel.name], ["IMO", vessel.imo_number || "Not recorded"],
      ["Hull number", vessel.hull_number || "—"], ["Call sign", vessel.call_sign || "—"],
      ["Date delivered", dateText(vessel.date_delivered)]
    ].forEach(([label, value]) => {
      const span = document.createElement("span"), strong = document.createElement("strong");
      span.append(`${label}: `, strong); strong.textContent = text(value); host.append(span);
    });
    el("editorVesselLabel").textContent = `${vessel.name || "Vessel"}${vessel.imo_number ? ` · IMO ${vessel.imo_number}` : ""}`;
    el("imoOverride").disabled = Boolean(vessel.imo_number);
    if (vessel.imo_number) el("imoOverride").value = "";
  }
  function makeOperations() {
    const host = el("operationsList"); host.replaceChildren();
    OPERATIONS.forEach((operation) => {
      const label = document.createElement("label"); label.className = "m02-check";
      const input = document.createElement("input"); input.type = "checkbox"; input.value = operation; input.dataset.operation = "true";
      const span = document.createElement("span"); span.textContent = operation;
      label.append(input, span); host.append(label);
    });
  }
  function makeChapterScores() {
    const host = el("chapterScores"); host.replaceChildren();
    for (let chapter = 2; chapter <= 12; chapter += 1) {
      const label = document.createElement("label"); label.className = "m02-score";
      const name = document.createElement("span"); name.textContent = `Chapter ${chapter}`;
      const select = document.createElement("select"); select.dataset.chapterScore = String(chapter); select.setAttribute("aria-label", `Chapter ${chapter} score`);
      select.add(new Option("—", "")); ["1", "2", "3", "4", "5", "N/S"].forEach((value) => select.add(new Option(value, value)));
      label.append(name, select); host.append(label);
    }
  }
  function addRepeatRow(kind, data = {}) {
    const host = el(kind), place = kind === "inspectionPlaces", row = document.createElement("div");
    row.className = `m02-repeat-item${place ? " place-row" : ""}`;
    if (place) {
      const input = document.createElement("input"); input.type = "text"; input.maxLength = 180; input.placeholder = "Inspection place"; input.dataset.placeField = "place"; input.value = data.place || "";
      row.append(input);
    } else {
      const category = document.createElement("select"); category.dataset.openField = "category";
      category.add(new Option("Select category", "")); ["Previous audit", "Previous inspection", "Memoranda", "Conditions of Class", "Recommendations", "Notations"].forEach((v) => category.add(new Option(v, v)));
      category.value = data.category || "";
      const description = document.createElement("input"); description.type = "text"; description.maxLength = 1500; description.placeholder = "Description"; description.dataset.openField = "description"; description.value = data.description || "";
      const dueDate = document.createElement("input"); dueDate.type = "date"; dueDate.setAttribute("aria-label", "Due date"); dueDate.dataset.openField = "due_date"; dueDate.value = data.due_date || "";
      const schedule = document.createElement("input"); schedule.type = "text"; schedule.maxLength = 1000; schedule.placeholder = "Close-out schedule"; schedule.dataset.openField = "close_out_schedule"; schedule.value = data.close_out_schedule || "";
      row.append(category, description, dueDate, schedule);
    }
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "m02-remove-row"; remove.textContent = "×"; remove.setAttribute("aria-label", "Remove row");
    remove.addEventListener("click", () => { row.remove(); markDirty(); });
    row.append(remove); host.append(row); return row;
  }
  function questionType(question) {
    const payload = question.payload || {};
    const raw = firstPayload(payload, ["Question Type", "question_type", "type", "rotation", "question_category"]);
    const value = text(raw).toLowerCase();
    if (/rotational\s*1|rotation\s*1|rotational1/.test(value)) return "Rotational1";
    if (/rotational\s*2|rotation\s*2|rotational2/.test(value)) return "Rotational2";
    return "Core";
  }
  function questionChapter(question) {
    const n = Number(question.number_base);
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    const value = text(question.number_full || question.number_base);
    const match = value.match(/^(\d+)/);
    return match ? Number(match[1]) : 0;
  }
  function firstPayload(payload, keys) {
    for (const key of keys) if (payload?.[key] !== undefined && payload[key] !== null && payload[key] !== "") return payload[key];
    const wanted = keys.map((key) => key.toLowerCase().replaceAll(/[^a-z0-9]/g, ""));
    for (const [key, value] of Object.entries(payload || {})) {
      if (wanted.includes(key.toLowerCase().replaceAll(/[^a-z0-9]/g, "")) && value !== null && value !== "") return value;
    }
    return "";
  }
  function questionText(question) { return firstPayload(question.payload, ["Question", "question", "question_text", "text"]); }
  function questionTypeLabel(question) {
    const type = questionType(question);
    return type === "Core" ? "Core" : type;
  }
  function guidanceText(payload, aliases) {
    const value = firstPayload(payload, aliases);
    return Array.isArray(value) ? value.map((item) => text(item)).join("\n") : text(value);
  }
  function answerFor(questionId) { return state.answers.get(questionId) || { response: null, comments: "" }; }
  // Register future response-based sections here and in the server completion
  // sections helper when their data model is implemented (not placeholder pages).
  function responseSections() {
    const section = (key, label, rows, response, allowed) => {
      const answered = rows.filter((row) => allowed.includes(response(row))).length;
      return { key, label, total: rows.length, answered, remaining: rows.length - answered };
    };
    return [
      section("company", "Part 3", state.companyItems, (item) => companyAnswer(item.item_no).response, ["Yes", "No", "N/S"]),
      section("questions", "Part 4", state.questions, (question) => answerFor(question.id).response, ["Yes", "No", "N/A", "N/S"]),
      appendices.counts()
    ];
  }
  function progressText(section) {
    return `Answered ${section.answered} / ${section.total} · Remaining ${section.remaining}`;
  }
  function validateCompletion() {
    const sections = responseSections();
    if (sections.some((section) => !section.total)) {
      showEditorError("Required response sections are not available yet. Save Draft and retry after loading.");
      el("editorMessage").scrollIntoView({ block: "nearest" });
      return false;
    }
    const incomplete = sections.filter((section) => section.remaining > 0);
    if (!incomplete.length) return true;
    showEditorError(`Cannot mark Completed. ${incomplete.map((section) => `${section.label}: ${section.remaining} remaining`).join("; ")}. Save Draft is still available.`);
    const actions = document.createElement("div"); actions.className = "m02-completion-jumps";
    incomplete.forEach((section) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "m02-button m02-button-outline";
      button.textContent = `Go to ${section.label}`;
      button.addEventListener("click", () => navSection(section.key));
      actions.append(button);
    });
    el("editorMessage").append(actions);
    el("editorMessage").scrollIntoView({ block: "nearest" });
    return false;
  }
  function progress() {
    const [company, questions] = responseSections();
    el("questionProgress").textContent = progressText(questions);
    el("navProgress").textContent = progressText(questions);
    el("companyProgress").textContent = progressText(company);
    el("companyNavProgress").textContent = progressText(company);
    appendices.progress();
    $all(".m02-chapter").forEach((chapter) => {
      const rows = state.questions.filter((question) => String(questionChapter(question)) === chapter.dataset.chapter);
      const answered = rows.filter((question) => ["Yes", "No", "N/A", "N/S"].includes(answerFor(question.id).response)).length;
      chapter.querySelector(".m02-chapter-count").textContent = progressText({ total: rows.length, answered, remaining: rows.length - answered });
    });
    el("mobileSaveState").textContent = state.dirty ? "Unsaved changes" : "All changes saved";
    renderAppendix();
  }
  function renderAppendix() {
    const host = el("appendixRows"); host.replaceChildren();
    if (!state.questions.length) {
      const tr = document.createElement("tr"), td = document.createElement("td"); td.colSpan = 3; td.className = "m02-table-state"; td.textContent = "No eligible questions are available."; tr.append(td); host.append(tr); return;
    }
    const notChecked = state.questions.filter((question) => !answerFor(question.id).response).length;
    const notSeen = state.questions.filter((question) => answerFor(question.id).response === "N/S").length;
    el("appendixCounts").textContent = `${notChecked} Not Checked · ${notSeen} Not Seen`;
    state.questions.filter((question) => !answerFor(question.id).response || answerFor(question.id).response === "N/S").forEach((question) => {
      const answer = answerFor(question.id), tr = document.createElement("tr");
      [["Number", question.number_full || question.number_base || "—"], ["Type", questionTypeLabel(question)], ["State", answer.response === "N/S" ? "Not seen" : answer.response || "Not checked"]].forEach(([label, value]) => {
        const td = document.createElement("td"); td.dataset.label = label; td.textContent = text(value); tr.append(td);
      });
      host.append(tr);
    });
  }
  function companyAnswer(itemNo) { return state.companyAnswers.get(Number(itemNo)) || { response: null, comments: "" }; }
  function renderCompanyItems() {
    const host = el("companyItems"); host.replaceChildren();
    if (!state.companyItems.length) {
      const empty = document.createElement("div"); empty.className = "m02-empty"; empty.textContent = "Company attendance catalogue is not available."; host.append(empty); return;
    }
    state.companyItems.forEach((item) => {
      const no = Number(item.item_no), answer = companyAnswer(no), card = document.createElement("article");
      card.className = "m02-company-card"; card.dataset.companyCard = String(no);
      const head = document.createElement("div"); head.className = "m02-company-head";
      const number = document.createElement("span"); number.className = "m02-question-number"; number.textContent = String(no).padStart(2, "0");
      const wording = document.createElement("p"); wording.className = "m02-company-text"; wording.textContent = text(item.item_text);
      head.append(number, wording);
      const controls = document.createElement("div"); controls.className = "m02-company-controls";
      const label = document.createElement("label"); label.textContent = "Response";
      const select = document.createElement("select"); select.dataset.companyResponse = String(no); select.setAttribute("aria-label", `Company check ${no} response`);
      [["", "Not Checked"], ["Yes", "Yes"], ["No", "No"], ["N/S", "N/S"]].forEach(([v, t]) => select.add(new Option(t, v)));
      select.value = answer.response || ""; label.append(select);
      const commentLabel = document.createElement("label"); commentLabel.textContent = "Comments";
      const comment = document.createElement("textarea"); comment.dataset.companyComments = String(no); comment.maxLength = 4000; comment.placeholder = "Add comments…"; comment.value = answer.comments || ""; commentLabel.append(comment);
      controls.append(label, commentLabel); card.append(head, controls);
      card.insertAdjacentHTML("beforeend", attachmentMarkup(null, no));
      host.append(card);
    });
    renderAttachments();
  }
  function attachmentMarkup(questionId, companyNo, appendixId = null, appendixKind = null) {
    if (appendixId) return `<details class="m02-attachments" open data-attachment-group="a:${escapeHtml(appendixId)}" data-appendix-kind="${appendixKind}"><summary>${appendixKind === "photo" ? "Photographic record image" : "Supporting attachments"} <span>${appendixKind === "photo" ? "One image · max 10 MB" : "Optional · max 5 files / 10 MB combined"}</span></summary><span class="m02-attachment-quota"></span><div class="m02-attachment-list"></div><label class="m02-upload-button">${appendixKind === "photo" ? "Choose / take photo" : "Add attachment"}<input type="file" data-upload-file accept="${appendixKind === "photo" ? ".jpg,.jpeg,.png,.webp" : ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx"}" ${appendixKind === "photo" ? 'capture="environment"' : ""} aria-label="Add appendix attachment"></label><p class="m02-attachment-hint"></p><span class="m02-upload-status" aria-live="polite"></span></details>`;
    const key = questionId ? `q:${questionId}` : `c:${companyNo}`;
    return `<details class="m02-attachments" data-attachment-group="${escapeHtml(key)}" ${questionId ? "open" : ""}><summary>Supporting attachments${questionId ? " — this SIRE question" : ""} <span>Optional · max 5 files / 10 MB combined</span></summary><span class="m02-attachment-quota"></span><div class="m02-attachment-list"></div><label class="m02-upload-button">Add attachment<input type="file" data-upload-file data-question-id="${escapeHtml(questionId || "")}" data-company-item-no="${companyNo || ""}" aria-label="Add supporting attachment for ${questionId ? "this SIRE question" : `Company item ${companyNo}`}" accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx" /></label><p class="m02-attachment-hint"></p><span class="m02-upload-status" aria-live="polite"></span></details>`;
  }
  function renderAttachments() {
    el("saveDraft").disabled = !state.canEdit || state.saving || state.attachmentBusy;
    el("markCompleted").disabled = !state.canEdit || state.saving || state.attachmentBusy;
    $all("[data-save]").forEach((button) => { button.disabled = !state.canEdit || state.saving || state.attachmentBusy; });
    $all(".m02-attachments").forEach((group) => {
      const list = group.querySelector(".m02-attachment-list"); list.replaceChildren();
      const [kind, id] = (group.dataset.attachmentGroup || "").split(":");
      const items = state.attachments.filter((file) => kind === "a" ? file.appendix_record_id === id : kind === "q" ? file.question_id === id : Number(file.company_item_no) === Number(id));
      const photo = group.dataset.appendixKind === "photo", limit = photo ? 1 : 5;
      const totalBytes = items.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
      const quotaReached = items.length >= limit || totalBytes >= 10 * 1024 * 1024;
      group.querySelector(".m02-attachment-quota").textContent = `${items.length}/${limit} files · ${totalBytes ? formatBytes(totalBytes) : "0 KB"} / 10 MB combined · ${kind === "a" ? "This appendix record only" : kind === "q" ? "This question only" : "This Company item only"}`;
      group.querySelector(".m02-attachment-hint").textContent = !state.report?.id || (kind === "a" && !appendices.isPersisted(id))
        ? "Save Draft first to add supporting files."
        : !state.canEdit || state.report.status !== "draft"
          ? "Attachments are read-only. Available files can be downloaded."
          : quotaReached ? "Attachment limit reached. Remove a file before adding another."
            : "Allowed: JPG/JPEG, PNG, WebP, PDF, DOC/DOCX, XLS/XLSX.";
      items.forEach((file) => {
        const row = document.createElement("div"); row.className = "m02-attachment-row";
        const details = document.createElement("span");
        details.textContent = `${file.original_filename || "Attachment"} · ${formatBytes(file.size_bytes)} · ${file.mime_type || "file"} · ${file.uploaded_by_name || file.uploaded_by || "Unknown"} · ${dateTimeText(file.uploaded_at)}${file.state === "pending" ? " · Pending retry" : ""}`;
        row.append(details);
        if (state.canEdit && state.report?.status === "draft") {
          const remove = document.createElement("button"); remove.type = "button"; remove.className = "m02-attachment-action"; remove.dataset.deleteAttachment = file.id; remove.textContent = "Remove"; row.append(remove);
        }
        if (file.state === "uploaded") {
          const download = document.createElement("button"); download.type = "button"; download.className = "m02-attachment-action"; download.dataset.downloadAttachment = file.id; download.textContent = "Download"; row.append(download);
          if (photo) {
            const preview = document.createElement("button"); preview.type = "button"; preview.className = "m02-attachment-action";
            preview.dataset.downloadAttachment = file.id; preview.dataset.previewAttachment = "true"; preview.textContent = "View photo"; row.append(preview);
          }
        }
        list.append(row);
      });
      const locked = !state.report?.id || (kind === "a" && !appendices.isPersisted(id)) || !state.canEdit || state.report?.status === "completed" || state.saving || state.attachmentBusy;
      group.querySelector("input[type=file]").disabled = locked || quotaReached;
      group.querySelectorAll("[data-delete-attachment]").forEach((button) => { button.disabled = state.saving || state.attachmentBusy || !state.canEdit || state.report?.status === "completed"; });
      group.querySelectorAll("[data-download-attachment]").forEach((button) => { button.disabled = state.saving || state.attachmentBusy; });
    });
  }
  function formatBytes(value) {
    const bytes = Number(value) || 0;
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  async function refreshAttachments() {
    if (!state.report?.id) { state.attachments = []; renderAttachments(); return; }
    state.attachments = asArray(await rpc("csvb_m02_attachments", { p_report_id: state.report.id }));
    renderAttachments();
  }
  const ALLOWED_FILE = /\.(jpe?g|png|webp|pdf|docx?|xlsx?)$/i;
  async function handleAttachmentUpload(input) {
    const file = input.files?.[0]; if (!file) return;
    const group = input.closest(".m02-attachments"), status = group.querySelector(".m02-upload-status");
    try {
      if (state.saving || state.attachmentBusy) return;
      if (!state.report?.id) throw new Error("Save Draft first to attach files. A report will not be created by an upload.");
      if (!state.canEdit || state.report.status === "completed") throw new Error("Attachments are read-only for this report.");
      if (!ALLOWED_FILE.test(file.name)) throw new Error("Choose JPG, JPEG, PNG, WebP, PDF, DOC, DOCX, XLS, or XLSX.");
      if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Choose a non-empty file; maximum 10 MB combined per question/item.");
      const [kind, identity] = group.dataset.attachmentGroup.split(":");
      const active = state.attachments.filter((item) => kind === "a" ? item.appendix_record_id === identity : kind === "q" ? item.question_id === identity : Number(item.company_item_no) === Number(identity));
      if (kind === "a" && !appendices.isPersisted(identity)) throw new Error("Save Draft first to save this appendix record.");
      if (group.dataset.appendixKind === "photo" && !/\.(jpe?g|png|webp)$/i.test(file.name)) throw new Error("Choose a JPG, PNG or WebP photo.");
      const total = active.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);
      if (active.length >= (group.dataset.appendixKind === "photo" ? 1 : 5)) throw new Error("This record has reached its attachment limit.");
      if (total + file.size > 10 * 1024 * 1024) throw new Error("Attachments for this question/item cannot exceed 10 MB combined.");
      state.attachmentBusy = true; renderAttachments(); status.textContent = "Uploading…"; input.disabled = true;
      const body = new FormData();
      body.append("action", "upload"); body.append("report_id", state.report.id);
      if (kind === "q") body.append("question_id", identity);
      else if (kind === "a") body.append("appendix_record_id", identity);
      else body.append("company_item_no", identity);
      body.append("file", file);
      const { data, error } = await state.sb.functions.invoke("m02-attachments", { body });
      if (error) throw error;
      if (data?.attachment) state.attachments = [...state.attachments.filter((item) => item.id !== data.attachment.id), data.attachment];
      await refreshAttachments(); status.textContent = "Attachment uploaded.";
    } catch (error) {
      status.textContent = error.message || "Upload failed.";
      try { await refreshAttachments(); } catch (_) { /* keep upload error visible */ }
    } finally { state.attachmentBusy = false; input.value = ""; renderAttachments(); }
  }
  async function handleAttachmentAction(button, action) {
    if (state.saving || state.attachmentBusy) return;
    const previewHost = button.dataset.previewAttachment ? button.closest("[data-appendix-record]")?.querySelector("[data-photo-preview]") : null;
    try {
      if (action === "delete" && (!state.canEdit || state.report?.status === "completed")) throw new Error("Only an editable Draft report can remove attachments.");
      state.attachmentBusy = true; renderAttachments();
      const id = button.dataset[action === "delete" ? "deleteAttachment" : "downloadAttachment"];
      const { data, error } = await state.sb.functions.invoke("m02-attachments", {
        body: JSON.stringify({ action, attachment_id: id }),
        headers: { "Content-Type": "application/json" }
      });
      if (error) throw error;
      if (action === "delete") await refreshAttachments();
      else if (data?.url && previewHost) {
        const image = document.createElement("img"); image.src = data.url; image.alt = "Private M02 photographic record"; image.loading = "lazy";
        previewHost.replaceChildren(image);
      } else if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else throw new Error("The attachment service returned no download link.");
    } catch (error) { showEditorError(error.message || "Attachment action failed."); }
    finally { state.attachmentBusy = false; renderAttachments(); }
  }
  function questionHtml(question) {
    const id = escapeHtml(question.id), payload = question.payload || {};
    const guidance = guidanceText(payload, ["Inspection Guidance", "inspection_guidance", "guidance"]);
    const actions = guidanceText(payload, ["Suggested Inspector Actions", "suggested_inspector_actions", "inspector_actions"]);
    const qText = questionText(question);
    const answer = answerFor(question.id);
    const old = state.answers.get(question.id);
    return `<article class="m02-question" data-question-card="${id}" data-search="${escapeHtml(`${question.number_full || ""} ${qText}`.toLowerCase())}">
      <div class="m02-question-top"><span class="m02-question-number">${escapeHtml(question.number_full || question.number_base || "—")}</span><p class="m02-question-text">${escapeHtml(qText || "Question text is not available in the library payload.")}</p><span class="m02-question-type">${escapeHtml(questionTypeLabel(question))}</span></div>
      <div class="m02-answer-row">
        <label>Response<select data-response="${id}" aria-label="Response for question ${escapeHtml(question.number_full || "")}" aria-describedby="m02-unanswered-${id}"><option value="" disabled hidden ${!answer.response ? "selected" : ""}>Select response…</option><option value="Yes" ${answer.response === "Yes" ? "selected" : ""}>Yes</option><option value="No" ${answer.response === "No" ? "selected" : ""}>No</option><option value="N/A" ${answer.response === "N/A" ? "selected" : ""}>Not Applicable</option><option value="N/S" ${answer.response === "N/S" ? "selected" : ""}>Not Seen</option></select><span id="m02-unanswered-${id}" class="m02-unanswered" ${answer.response ? "hidden" : ""}>Unanswered · Not checked</span></label>
        <label>Question Remarks<textarea data-comments="${id}" maxlength="50000" aria-label="Question Remarks for question ${escapeHtml(question.number_full || "")}" placeholder="Add question remarks…">${escapeHtml(answer.comments || "")}</textarea></label>
      </div>
      <div class="m02-panels">
        <details><summary>Question Guidance</summary><div class="m02-panel-body">${escapeHtml(guidance || "No question guidance is provided.")}</div></details>
        <details><summary>Suggested Inspector Actions</summary><div class="m02-panel-body">${escapeHtml(actions || "No suggested inspector actions are provided.")}</div></details>
        <details data-reference-panel="evidence" data-question-id="${id}"><summary>Expected Evidence</summary><div class="m02-panel-body"><button type="button" class="m02-reference-trigger" data-reference="evidence" data-question-id="${id}">Load expected evidence</button><div class="m02-reference-content"><span class="m02-reference-status">Reference data loads when opened.</span></div></div></details>
        <details data-reference-panel="history" data-question-id="${id}"><summary>COMPANY FLEET RECORD — Recorded Vetting Observations</summary><div class="m02-panel-body"><button type="button" class="m02-reference-trigger" data-reference="history" data-question-id="${id}">Load Company fleet record</button><div class="m02-reference-content"><span class="m02-reference-status">Last 18 months of Company fleet history loads when opened. These observations are read-only.</span></div></div></details>
      </div>
      ${attachmentMarkup(question.id, null)}
    </article>`;
  }
  async function loadQuestions(reportId = null, version = null) {
    const token = ++state.questionsToken;
    el("questionChapters").innerHTML = '<div class="m02-loading-block"><span></span><span></span><span></span><b>Loading eligible questions</b></div>';
    const data = asArray(await rpc("csvb_m02_questions", {
      p_company_id: state.companyId, p_version: version || null, p_report_id: reportId || null
    }));
    if (token !== state.questionsToken) return;
    state.questions = data;
    const versionChanged = data.some((question) => question?.library_version_changed === true);
    const versionWarning = el("libraryVersionWarning");
    versionWarning.hidden = !versionChanged;
    versionWarning.textContent = versionChanged
      ? "The source question library version has changed since this report's stored version. The stored version and saved answers remain unchanged."
      : "";
    const versions = asArray(state.context?.library_versions);
    const select = el("libraryVersion"); select.replaceChildren();
    const resolvedVersion = version || state.report?.library_version || versions[0] || "";
    if (resolvedVersion && !versions.includes(resolvedVersion)) versions.unshift(resolvedVersion);
    versions.forEach((item) => select.add(new Option(item, item)));
    select.value = resolvedVersion;
    select.disabled = Boolean(state.report?.id);
    state.questionVersion = resolvedVersion;
    const byChapter = new Map();
    data.forEach((question) => {
      const chapter = questionChapter(question);
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter).push(question);
    });
    const host = el("questionChapters"); host.replaceChildren();
    if (!data.length) {
      const node = document.createElement("div"); node.className = "m02-table-state"; node.textContent = "The M02 service returned no eligible Oil / non-Photo questions for this Company and library version."; host.append(node);
    } else [...byChapter.entries()].sort((a, b) => a[0] - b[0]).forEach(([chapter, questions]) => {
      const details = document.createElement("details"); details.className = "m02-chapter"; details.dataset.chapter = String(chapter);
      const summary = document.createElement("summary"), title = document.createElement("span"), count = document.createElement("span");
      title.textContent = chapter ? `Chapter ${chapter}` : "Other questions";
      count.className = "m02-chapter-count"; count.textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
      summary.append(title, count); details.append(summary);
      questions.forEach((question) => {
        const wrapper = document.createElement("div"); wrapper.innerHTML = questionHtml(question);
        const card = wrapper.firstElementChild;
        // Assign the value directly: HTML parsing strips an initial newline in
        // textarea contents, which must not alter saved Question Remarks.
        card.querySelector("[data-comments]").value = answerFor(question.id).comments ?? "";
        details.append(card);
      });
      host.append(details);
    });
    progress();
    applyQuestionSearch();
    if (state.canEdit === false) setEditorReadonly();
  }
  function applyQuestionSearch() {
    const query = clean(el("questionSearch").value).toLowerCase();
    $all("[data-question-card]").forEach((card) => {
      const visible = !query || card.dataset.search.includes(query);
      card.hidden = !visible;
      if (query && visible) card.closest(".m02-chapter").open = true;
    });
    $all(".m02-chapter").forEach((chapter) => {
      const visibleCount = $all("[data-question-card]", chapter).filter((card) => !card.hidden).length;
      chapter.hidden = visibleCount === 0;
    });
    scheduleRemarksResize();
  }
  function resizeRemarks(field) {
    if (!field.getClientRects().length) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }
  let remarksResizeFrame = null;
  function scheduleRemarksResize() {
    if (remarksResizeFrame !== null) return;
    remarksResizeFrame = requestAnimationFrame(() => {
      remarksResizeFrame = null;
      $all("[data-comments]").forEach(resizeRemarks);
    });
  }
  function referenceKey(questionId) { return `${state.companyId || ""}|${state.report?.id || "new"}|${questionId}`; }
  async function loadReference(questionId) {
    const key = referenceKey(questionId);
    if (state.referenceCache.has(key)) return state.referenceCache.get(key);
    if (state.referenceRequests.has(key)) return state.referenceRequests.get(key);
    const promise = rpc("csvb_m02_reference", {
      p_report_id: state.report?.id || null, p_company_id: state.companyId, p_question_id: questionId
    }).then((data) => {
      state.referenceCache.set(key, data || {});
      state.referenceRequests.delete(key);
      return data || {};
    }).catch((error) => { state.referenceRequests.delete(key); throw error; });
    state.referenceRequests.set(key, promise);
    return promise;
  }
  async function showReference(button) {
    const panel = button.closest("details"), host = panel.querySelector(".m02-reference-content");
    button.disabled = true; button.textContent = "Loading…";
    try {
      const data = await loadReference(button.dataset.questionId);
      host.replaceChildren();
      if (button.dataset.reference === "evidence") {
        let rows = asArray(data.expected_evidence);
        if (!rows.length) {
          const question = state.questions.find((q) => q.id === button.dataset.questionId);
          const fallback = guidanceText(question?.payload || {}, ["expected_evidence", "Expected Evidence", "ExpEv_Bullets"]);
          if (fallback) rows = [{ evidence_text: fallback }];
        }
        if (!rows.length) { const span = document.createElement("span"); span.className = "m02-reference-status"; span.textContent = "No expected evidence is recorded."; host.append(span); }
        rows.forEach((item) => {
          const block = document.createElement("div"); block.className = "m02-panel-body";
          const line = [item.evidence_text, item.esms_references, item.esms_forms, item.remarks].filter(Boolean).map(text).join("\n");
          block.textContent = line || "Evidence reference has no descriptive text."; host.append(block);
        });
      } else {
        const history = data.history || {}, rows = asArray(history.rows);
        const window = document.createElement("span"); window.className = "m02-reference-status";
        window.textContent = history.from_date && history.to_date
          ? `Last 18 months · Inspection dates ${dateText(history.from_date)} – ${dateText(history.to_date)}`
          : "Last 18 months of Company fleet inspection history";
        host.append(window);
        if (!rows.length) { const span = document.createElement("span"); span.className = "m02-reference-status"; span.textContent = "No Company fleet vetting observations are recorded for this question in the last 18 months."; host.append(span); }
        else {
          const list = document.createElement("ul"); list.className = "m02-observation-list";
          rows.slice(0, 25).forEach((row) => {
            const li = document.createElement("li"), meta = document.createElement("span");
            meta.textContent = `${row.vessel_name || "Vessel"} · ${dateText(row.inspection_date)}${row.oil_major ? ` · ${row.oil_major}` : ""}${row.designation ? ` · ${row.designation}` : ""}`;
            li.append(meta, escapeTextNode(row.observation_text || "No observation text.")); list.append(li);
          });
          host.append(list);
          const total = document.createElement("span"); total.className = "m02-reference-status"; total.textContent = `Showing latest ${rows.length} of ${Number(history.total || rows.length)} Company-fleet observations within this 18-month window.`; host.append(total);
        }
      }
      button.remove();
    } catch (error) {
      const status = host.querySelector(".m02-reference-status");
      if (status) status.textContent = error.message;
      else { const span = document.createElement("span"); span.className = "m02-reference-status"; span.textContent = error.message; host.append(span); }
      button.disabled = false; button.textContent = "Retry";
    }
  }
  function fillDetails(details = {}) {
    const fields = {
      deadweight: "deadweight", grossTonnage: "gross_tonnage", lastPscDate: "last_psc_date",
      lastPscPlace: "last_psc_place_authority", lastPscDetails: "last_psc_details", lastVettingDate: "last_vetting_date",
      lastVettingCompany: "last_vetting_company", lastVettingPlace: "last_vetting_place", lastVettingDetails: "last_vetting_details",
      pscCloseout: "psc_closeout", pscCloseoutNotes: "psc_closeout_notes", vettingCloseout: "vetting_closeout",
      vettingCloseoutNotes: "vetting_closeout_notes", lastDryDock: "last_drydock_date", nextDryDock: "next_drydock_date",
      totalHigh: "total_high", totalMedium: "total_medium", totalLow: "total_low", overallCondition: "overall_condition",
      smsProposals: "sms_improvement_proposals", safetyCulture: "safety_culture"
    };
    Object.entries(fields).forEach(([id, key]) => { el(id).value = details[key] ?? ""; });
    $all("[data-operation]").forEach((input) => { input.checked = asArray(details.operations).includes(input.value); });
    el("openItems").replaceChildren(); asArray(details.open_items).forEach((item) => addRepeatRow("openItems", item));
    el("inspectionPlaces").replaceChildren(); asArray(details.inspection_places).forEach((place) => addRepeatRow("inspectionPlaces", typeof place === "string" ? { place } : place));
    if (!asArray(details.open_items).length) addRepeatRow("openItems");
    if (!asArray(details.inspection_places).length) addRepeatRow("inspectionPlaces");
    const chapterScores = details.chapter_scores || {};
    $all("[data-chapter-score]").forEach((select) => { select.value = chapterScores[select.dataset.chapterScore] ?? ""; });
  }
  function reportObject() {
    appendices.deriveTotals();
    const vessel = snapshotVessel(el("vesselId").value);
    const current = state.report || {};
    const details = {
      deadweight: el("deadweight").value === "" ? null : Number(el("deadweight").value),
      gross_tonnage: el("grossTonnage").value === "" ? null : Number(el("grossTonnage").value),
      last_psc_date: el("lastPscDate").value || null,
      last_psc_place_authority: clean(el("lastPscPlace").value), last_psc_details: clean(el("lastPscDetails").value),
      last_vetting_date: el("lastVettingDate").value || null, last_vetting_company: clean(el("lastVettingCompany").value),
      last_vetting_place: clean(el("lastVettingPlace").value), last_vetting_details: clean(el("lastVettingDetails").value),
      psc_closeout: el("pscCloseout").value || null, psc_closeout_notes: clean(el("pscCloseoutNotes").value),
      vetting_closeout: el("vettingCloseout").value || null, vetting_closeout_notes: clean(el("vettingCloseoutNotes").value),
      operations: $all("[data-operation]:checked").map((input) => input.value),
      open_items: $all("#openItems .m02-repeat-item").map((row) => Object.fromEntries($all("[data-open-field]", row).map((input) => [input.dataset.openField, input.value.trim()]))).filter((item) => Object.values(item).some(Boolean)),
      last_drydock_date: el("lastDryDock").value || null, next_drydock_date: el("nextDryDock").value || null,
      inspection_places: $all("#inspectionPlaces [data-place-field]").map((input) => ({ place: input.value.trim() })).filter((item) => item.place),
      total_high: el("totalHigh").value === "" ? null : Number(el("totalHigh").value),
      total_medium: el("totalMedium").value === "" ? null : Number(el("totalMedium").value),
      total_low: el("totalLow").value === "" ? null : Number(el("totalLow").value),
      overall_condition: el("overallCondition").value || null,
      sms_improvement_proposals: clean(el("smsProposals").value),
      chapter_scores: Object.fromEntries($all("[data-chapter-score]").map((select) => [select.dataset.chapterScore, select.value || null])),
      safety_culture: el("safetyCulture").value || null
    };
    return {
      id: current.id || null, company_id: state.companyId, vessel_id: vessel?.id || null,
      create_request_id: current.id ? (current.create_request_id || null) : state.createRequestId,
      vessel_snapshot: current.id ? (current.vessel_snapshot || {}) : vessel ? {
        name: vessel.name || "", imo_number: vessel.imo_number || null, hull_number: vessel.hull_number || null,
        call_sign: vessel.call_sign || null, date_delivered: vessel.date_delivered || null
      } : {},
      library_version: current.id ? current.library_version : (el("libraryVersion").value || null),
      report_date: el("reportDate").value || null, inspection_from: el("inspectionFrom").value || null,
      inspection_to: el("inspectionTo").value || null,
      attending_superintendent: clean(el("attendingSuperintendent").value),
      status: current.status === "completed" ? "completed" : "draft",
      details: { ...details, imo_override: vessel?.imo_number ? null : clean(el("imoOverride").value) || null },
      executive_summary: el("executiveSummary").value,
      part2: {
        total_high: details.total_high, total_medium: details.total_medium, total_low: details.total_low,
        overall_condition: details.overall_condition,
        sms_improvement_proposals: details.sms_improvement_proposals,
        chapter_scores: details.chapter_scores, safety_culture: details.safety_culture
      },
      revision: current.id ? state.expectedRevision : null
    };
  }
  function collectAnswers() {
    return state.questions.map((question) => {
      const answer = answerFor(question.id);
      return { question_id: question.id, response: answer.response || null, comments: answer.comments || "" };
    });
  }
  function validateReport(report) {
    if (!report.vessel_id) throw new Error("Select a Company vessel before saving this report.");
    if (report.inspection_from && report.inspection_to && report.inspection_to < report.inspection_from) throw new Error("Inspection To cannot be earlier than Inspection From.");
    if (report.details.imo_override && report.details.imo_override.length > 16) throw new Error("IMO override is too long.");
    ["deadweight", "gross_tonnage", "total_high", "total_medium", "total_low"].forEach((key) => {
      const value = report.details[key];
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`Enter a valid non-negative value for ${key.replaceAll("_", " ")}.`);
    });
    if (report.details.open_items.length > 100 || report.details.inspection_places.length > 100) throw new Error("The repeatable item limit is 100 rows.");
  }
  async function fetchSavedReport(reportId) {
    const result = await rpc("csvb_m02_get_v3", { p_report_id: reportId });
    return result || {};
  }
  function setEditorReadonly() {
    const readonly = !state.canEdit;
    $all("#reportForm input, #reportForm select, #reportForm textarea, #reportForm button").forEach((control) => {
      if (control.matches(".m02-reference-trigger, .m02-attachment-action, [data-upload-file], #questionSearch")) return;
      control.disabled = readonly;
    });
    el("vesselId").disabled = readonly || Boolean(state.report?.id);
    el("libraryVersion").disabled = readonly || Boolean(state.report?.id);
    el("imoOverride").disabled = readonly || Boolean(snapshotVessel(el("vesselId").value)?.imo_number);
    el("saveDraft").disabled = readonly; el("markCompleted").disabled = readonly;
    $all("[data-save]").forEach((button) => { button.disabled = readonly; });
    if (readonly) {
      el("saveState").textContent = "Read only";
      showEditorError("The M02 service has not granted edit permission for this Company. This report is read-only.");
    }
    renderAttachments();
  }
  async function openNewReport() {
    try {
      requireEditorPermission();
      state.createRequestId = crypto.randomUUID();
      state.report = { id: null, company_id: state.companyId, status: "draft", library_version: asArray(state.context.library_versions)[0] || null, details: {}, part2: {}, create_request_id: state.createRequestId };
      state.expectedRevision = null; state.answers = new Map(); state.companyAnswers = new Map(); state.attachments = []; state.workspace = {};
      state.dirty = false; state.referenceCache.clear(); state.referenceRequests.clear();
      el("reportForm").reset();
      el("vesselId").disabled = false; el("reportDate").value = new Date().toISOString().slice(0, 10);
      el("questionSearch").value = ""; el("appendixDetails").open = false;
      fillDetails({});
      el("editorStatus").textContent = "New report"; el("editorTitle").textContent = "Ship Inspection Report";
      message(el("editorMessage"), "");
      await loadQuestions(null, state.report.library_version);
      await appendices.newReport();
      state.companyAnswers = new Map(state.companyItems.map((item) => [Number(item.item_no), { response: null, comments: "" }]));
      renderCompanyItems(); renderAttachments();
      restoreWorkspace({});
      renderVesselSnapshot(); showView("editor"); updateSaveState();
    } catch (error) { showGlobal(error.message); }
  }
  async function openExistingReport(id) {
    message(el("globalMessage"), "");
    try {
      const result = await fetchSavedReport(id);
      const report = result.report;
      if (!report) throw new Error("The M02 service returned no report record.");
      if (typeof result.can_edit === "boolean") state.canEdit = result.can_edit;
      state.report = report; state.expectedRevision = report.revision; state.answers = new Map();
      state.workspace = result.workspace_state || report.workspace_state || {};
      state.companyAnswers = new Map();
      if (asArray(result.company_items).length) {
        const savedByNo = new Map(asArray(result.company_items).map((item) => [Number(item.item_no), item]));
        state.companyItems = state.companyItems.map((item) => ({ ...item, ...(savedByNo.get(item.item_no) || {}) }));
      }
      asArray(result.company_items).forEach((item) => state.companyAnswers.set(Number(item.item_no), { response: item.response || null, comments: item.comments || "" }));
      state.attachments = asArray(result.attachments);
      state.createRequestId = report.create_request_id || null;
      asArray(result.answers).forEach((answer) => state.answers.set(answer.question_id, { response: answer.response, comments: answer.comments || "" }));
      state.dirty = false; state.referenceCache.clear(); state.referenceRequests.clear();
      el("reportForm").reset();
      el("vesselId").value = report.vessel_id || "";
      el("vesselId").disabled = true;
      el("reportDate").value = report.report_date || "";
      el("inspectionFrom").value = report.inspection_from || "";
      el("inspectionTo").value = report.inspection_to || "";
      el("attendingSuperintendent").value = report.attending_superintendent || "";
      el("imoOverride").value = report.details?.imo_override || "";
      el("executiveSummary").value = report.executive_summary || "";
      fillDetails(report.details || {});
      el("editorStatus").textContent = report.status === "completed" ? "Completed" : "Draft";
      el("editorTitle").textContent = report.vessel_snapshot?.name || "Ship Inspection Report";
      message(el("editorMessage"), "");
      await loadQuestions(id, report.library_version || null);
      appendices.load(result);
      renderCompanyItems(); renderAttachments();
      renderVesselSnapshot();
      setEditorReadonly();
      showView("editor"); restoreWorkspace({ ...state.workspace, appendix_open: false }); updateSaveState();
    } catch (error) { showGlobal(error.message); }
  }
  function updateSaveState() {
    const savedAt = state.report?.updated_at || state.report?.saved_at;
    const stateText = state.saving ? "Saving…" : state.dirty ? "Unsaved changes" : state.report?.id ? `Saved${savedAt ? ` · ${dateTimeText(savedAt)}` : ""}` : "Not saved";
    el("saveState").textContent = stateText;
    el("mobileSaveState").textContent = state.dirty ? "Unsaved changes" : state.report?.id ? "All changes saved" : "Not saved";
  }
  function markDirty() {
    if (state.mode !== "editor" || state.saving) return;
    state.dirty = true; updateSaveState();
  }
  function workspaceState() {
    return {
      section: $all(".m02-section-nav button").find((button) => button.classList.contains("is-current"))?.dataset.section || "general",
      question_search: el("questionSearch").value || "",
      open_chapters: $all(".m02-chapter[open]").map((node) => node.dataset.chapter),
      appendix_open: el("appendixDetails").open
    };
  }
  function restoreWorkspace(workspace = {}) {
    state.workspace = workspace || {};
    el("questionSearch").value = text(state.workspace.question_search);
    applyQuestionSearch();
    const open = new Set(asArray(state.workspace.open_chapters).map(String));
    $all(".m02-chapter").forEach((chapter) => { chapter.open = open.has(chapter.dataset.chapter); });
    el("appendixDetails").open = state.workspace.appendix_open === true;
    const section = ["general", "part1", "part2", "company", "questions", "appendix", "maintenance", "critical", "findings", "photos"].includes(state.workspace.section) ? state.workspace.section : "general";
    $all(".m02-section-nav button").forEach((button) => button.classList.toggle("is-current", button.dataset.section === section));
    if (section !== "general") window.setTimeout(() => el(`section-${section}`)?.scrollIntoView({ block: "start" }), 0);
  }
  function collectCompanyItems() {
    return state.companyItems.map((item) => {
      const answer = companyAnswer(item.item_no);
      return { item_no: Number(item.item_no), response: answer.response || null, comments: answer.comments || "" };
    });
  }
  async function saveReport(targetStatus = "draft") {
    if (state.saving || state.attachmentBusy) return;
    await appendices.readyForSave();
    if (state.saving || state.attachmentBusy) return;
    let savedAlready = false;
    try {
      requireEditorPermission();
      const report = reportObject();
      report.status = targetStatus === "completed" ? "completed" : "draft";
      validateReport(report);
      if (report.status === "completed" && !validateCompletion()) return;
      state.saving = true; el("reportForm").inert = true; updateSaveState(); message(el("editorMessage"), "");
      el("saveDraft").disabled = true; el("markCompleted").disabled = true;
      const answers = collectAnswers();
      const savedWorkspace = workspaceState();
      const saved = await rpc("csvb_m02_save_v3", {
        p_report: report, p_answers: answers, p_company_items: collectCompanyItems(), p_workspace: savedWorkspace,
        p_appendices: appendices.collect()
      });
      if (!saved?.id) throw new Error("The M02 service did not return a saved report ID.");
      savedAlready = true;
      state.report = {
        ...report,
        id: saved.id,
        revision: saved.revision ?? report.revision,
        status: saved.status || report.status,
        create_request_id: report.create_request_id || saved.create_request_id || null
      };
      state.expectedRevision = state.report.revision;
      state.workspace = savedWorkspace;
      state.dirty = false;
      el("vesselId").disabled = true;
      el("editorStatus").textContent = state.report.status === "completed" ? "Completed" : "Draft";
      el("editorTitle").textContent = state.report.vessel_snapshot?.name || "Ship Inspection Report";
      updateSaveState();
      showGlobal(`Report saved as ${state.report.status}. Reloading the persisted snapshot…`, "success");
      const persisted = await fetchSavedReport(saved.id);
      if (!persisted?.report) throw new Error("The service returned no persisted report snapshot.");
      if (typeof persisted.can_edit === "boolean") state.canEdit = persisted.can_edit;
      state.report = {
        ...persisted.report,
        create_request_id: persisted.report.create_request_id || state.report.create_request_id,
        revision: persisted.report.revision ?? saved.revision
      };
      state.expectedRevision = state.report.revision;
      state.answers = new Map();
      asArray(persisted.answers).forEach((answer) => state.answers.set(answer.question_id, { response: answer.response, comments: answer.comments || "" }));
      state.companyAnswers = new Map();
      asArray(persisted.company_items).forEach((item) => state.companyAnswers.set(Number(item.item_no), { response: item.response || null, comments: item.comments || "" }));
      state.attachments = asArray(persisted.attachments);
      state.workspace = persisted.workspace_state || state.workspace;
      state.referenceCache.clear(); state.referenceRequests.clear();
      el("vesselId").value = persisted.report.vessel_id || ""; el("vesselId").disabled = true;
      el("reportDate").value = persisted.report.report_date || "";
      el("inspectionFrom").value = persisted.report.inspection_from || "";
      el("inspectionTo").value = persisted.report.inspection_to || "";
      el("attendingSuperintendent").value = persisted.report.attending_superintendent || "";
      el("editorStatus").textContent = persisted.report.status === "completed" ? "Completed" : "Draft";
      el("editorTitle").textContent = persisted.report.vessel_snapshot?.name || "Ship Inspection Report";
      fillDetails(persisted.report.details || {});
      await loadQuestions(persisted.report.id, persisted.report.library_version || state.questionVersion);
      appendices.load(persisted);
      renderCompanyItems(); renderAttachments();
      restoreWorkspace(persisted.workspace_state || savedWorkspace);
      renderVesselSnapshot();
      state.reports = asArray(await rpc("csvb_m02_reports_v3", { p_company_id: state.companyId }));
      setEditorReadonly();
      showGlobal(`Report ${persisted.report.status === "completed" ? "marked completed" : "saved as Draft"}.`, "success");
      message(el("editorMessage"), persisted.report.status === "completed" ? "Report marked Completed. Completion did not add approval or signature states." : "Draft saved. The persisted vessel snapshot and answers are now loaded.", "success");
      renderReports();
    } catch (error) {
      if (savedAlready) {
        const warning = `Saved, but reload failed: ${error.message}`;
        showGlobal(warning);
        showEditorError(`${warning} The report ID and revision are retained; retrying Save will update this report rather than create another.`);
      } else {
        showEditorError(error.message);
      }
      if (!savedAlready && /revision|conflict|stale|concurrent/i.test(error.message)) {
        const hint = document.createElement("p"); hint.textContent = "The report may have changed elsewhere. Reload the report to compare the latest revision before saving again."; el("editorMessage").append(hint);
      }
    } finally {
      state.saving = false; el("reportForm").inert = false; renderAttachments(); updateSaveState();
      renderAttachments();
    }
  }
  function requestLeave(action) {
    if (state.saving || state.attachmentBusy) return;
    if (!state.dirty) { action(); return; }
    state.pendingNavigation = action; state.previousFocus = document.activeElement;
    const dialog = el("leaveDialog");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else if (window.confirm("Discard unsaved report changes?")) action();
  }
  function closeLeaveDialog(discard) {
    const dialog = el("leaveDialog");
    if (dialog.open) dialog.close();
    if (discard && state.pendingNavigation) {
      const action = state.pendingNavigation; state.pendingNavigation = null; state.dirty = false; action();
    } else { state.pendingNavigation = null; state.previousFocus?.focus?.(); }
  }
  function navSection(name) {
    const section = el(`section-${name}`);
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    $all(".m02-section-nav button").forEach((button) => button.classList.toggle("is-current", button.dataset.section === name));
  }
  function bindEvents() {
    appendices.init({ state, rpc, markDirty, progress, showEditorError, renderAttachments, attachmentMarkup });
    $all("[data-view]").forEach((button) => button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (view === "new") { openNewReport(); return; }
      if (view === "home" || view === "register" || view === "completed") {
        requestLeave(() => { if (view === "home") showView("home"); else { showView(view); if (!state.reports.length) loadReports(); } });
      }
    }));
    el("dashboardBtn").addEventListener("click", () => requestLeave(() => { location.href = "./q-dashboard.html"; }));
    el("editorBack").addEventListener("click", () => requestLeave(() => showView("register")));
    el("reportRows").addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-report]");
      if (button) openExistingReport(button.dataset.openReport);
    });
    el("reloadReports").addEventListener("click", loadReports);
    ["filterVessel", "filterStatus", "filterFrom", "filterTo", "filterSuperintendent", "filterSearch"].forEach((id) => el(id).addEventListener("input", renderReports));
    el("clearFilters").addEventListener("click", () => {
      ["filterVessel", "filterStatus", "filterFrom", "filterTo", "filterSuperintendent", "filterSearch"].forEach((id) => { el(id).value = ""; });
      renderReports();
    });
    el("companySelect").addEventListener("change", () => {
      const selected = el("companySelect").value;
      el("companySelect").value = state.companyId || "";
      requestLeave(async () => {
        try {
          await loadContext(selected); await loadCompanyCatalogue(); state.reports = [];
          state.referenceCache.clear(); await loadReports();
          state.report = null; state.answers.clear(); state.dirty = false;
          showView("home");
        } catch (error) { showGlobal(error.message); }
      });
    });
    el("vesselId").addEventListener("change", () => { renderVesselSnapshot(); markDirty(); });
    el("reportForm").addEventListener("input", markDirty);
    el("reportForm").addEventListener("change", (event) => {
      const companyResponse = event.target.closest("[data-company-response]");
      if (companyResponse) {
        const no = Number(companyResponse.dataset.companyResponse), existing = companyAnswer(no);
        state.companyAnswers.set(no, { ...existing, response: companyResponse.value || null }); markDirty(); progress();
      }
      const select = event.target.closest("[data-response]");
      if (select) {
        const id = select.dataset.response, existing = answerFor(id);
        state.answers.set(id, { ...existing, response: select.value || null }); markDirty(); progress();
        el(`m02-unanswered-${id}`).hidden = Boolean(select.value);
      }
      const comment = event.target.closest("[data-comments]");
      if (comment) {
        const existing = answerFor(comment.dataset.comments);
        state.answers.set(comment.dataset.comments, { ...existing, comments: comment.value }); markDirty();
        resizeRemarks(comment);
      }
      const companyComment = event.target.closest("[data-company-comments]");
      if (companyComment) {
        const no = Number(companyComment.dataset.companyComments), existing = companyAnswer(no);
        state.companyAnswers.set(no, { ...existing, comments: companyComment.value }); markDirty();
      }
    });
    el("reportForm").addEventListener("input", (event) => {
      const companyComment = event.target.closest("[data-company-comments]");
      if (companyComment) {
        const no = Number(companyComment.dataset.companyComments), existing = companyAnswer(no);
        state.companyAnswers.set(no, { ...existing, comments: companyComment.value }); markDirty();
      }
      const comment = event.target.closest("[data-comments]");
      if (comment) {
        const existing = answerFor(comment.dataset.comments);
        state.answers.set(comment.dataset.comments, { ...existing, comments: comment.value }); markDirty();
        resizeRemarks(comment);
      }
    });
    el("questionChapters").addEventListener("toggle", (event) => {
      if (event.target.matches(".m02-chapter") && event.target.open) scheduleRemarksResize();
      if (event.target.matches("[data-reference-panel]") && event.target.open) {
        const button = event.target.querySelector(".m02-reference-trigger");
        if (button && !button.disabled) showReference(button);
      }
    }, true);
    el("questionChapters").addEventListener("click", (event) => {
      const button = event.target.closest("[data-reference]");
      if (button) showReference(button);
    });
    el("reportForm").addEventListener("change", (event) => {
      const input = event.target.closest("[data-upload-file]");
      if (input) handleAttachmentUpload(input);
    });
    el("reportForm").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-delete-attachment]");
      const download = event.target.closest("[data-download-attachment]");
      if (remove) handleAttachmentAction(remove, "delete");
      if (download) handleAttachmentAction(download, "download");
    });
    el("questionSearch").addEventListener("input", applyQuestionSearch);
    window.addEventListener("resize", scheduleRemarksResize);
    el("libraryVersion").addEventListener("change", async () => {
      if (state.report?.id) { el("libraryVersion").value = state.report.library_version; return; }
      state.questionVersion = el("libraryVersion").value;
      try { await loadQuestions(null, state.questionVersion); } catch (error) { showEditorError(error.message); }
    });
    $all("[data-section]").forEach((button) => button.addEventListener("click", () => navSection(button.dataset.section)));
    $all("[data-add-row]").forEach((button) => button.addEventListener("click", () => { addRepeatRow(button.dataset.addRow); markDirty(); }));
    el("saveDraft").addEventListener("click", () => saveReport("draft"));
    el("markCompleted").addEventListener("click", () => saveReport("completed"));
    $all("[data-save]").forEach((button) => button.addEventListener("click", () => saveReport(button.dataset.save)));
    el("stayEditing").addEventListener("click", () => closeLeaveDialog(false));
    el("discardChanges").addEventListener("click", () => closeLeaveDialog(true));
    window.addEventListener("beforeunload", (event) => {
      if (state.dirty || state.saving || state.attachmentBusy) { event.preventDefault(); event.returnValue = ""; }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el("leaveDialog").open) closeLeaveDialog(false);
    });
  }
  async function init() {
    window.M02_SHIP_INSPECTION_REPORT_BUILD = BUILD;
    bindEvents(); makeOperations(); makeChapterScores();
    if (!window.AUTH) throw new Error("Authentication services are unavailable.");
    const guard = await window.CSVB_M02_GUARD_READY;
    if (!guard || guard.allowed !== true) throw new Error("M02 access was not granted. No report RPC was called.");
    const bundle = await window.AUTH.requireAuth();
    if (!bundle) return;
    state.bundle = bundle;
    state.sb = await (window.AUTH.getSupabase?.() || window.AUTH.ensureSupabase?.());
    if (!state.sb) throw new Error("The authenticated Supabase client is unavailable.");
    window.AUTH.fillUserBadge?.(bundle);
    await window.AUTH.setupAuthButtons?.();
    const preferredCompany = bundle.profile?.role === "super_admin" ? localStorage.getItem(COMPANY_VIEW_ID_KEY) : null;
    let initialContext;
    try { initialContext = await rpc("csvb_m02_context", { p_company_id: preferredCompany || null }); }
    catch (error) {
      if (!preferredCompany) throw error;
      initialContext = await rpc("csvb_m02_context", { p_company_id: null });
      showGlobal("The previous dashboard Company context is unavailable. Select an authorised Company.");
    }
    state.context = initialContext || {}; state.companyId = initialContext?.company_id || null; state.canEdit = initialContext?.can_edit === true;
    setCompanySelect();
    if (!state.companyId) {
      showView("home"); showGlobal("Select a Company context before opening an M02 inspection.", "info"); return;
    }
    if (preferredCompany && preferredCompany === state.companyId) el("companyContextHint").textContent = `Inherited Company view: ${state.context.company_name}. Reports remain scoped to this Company.`;
    el("registerCompany").textContent = state.context.company_name || "";
    await loadCompanyCatalogue();
    const vessels = asArray(state.context.vessels).filter((vessel) => vessel?.is_active !== false);
    vessels.forEach((vessel) => el("vesselId").add(new Option(vessel.name || "Unnamed vessel", vessel.id)));
    await loadReports();
    showView("home");
    if (!state.canEdit) {
      showGlobal("M02 is available in read-only mode for this Company. The service did not grant edit permission.");
      $all('[data-view="new"]').forEach((button) => { button.disabled = true; button.setAttribute("aria-disabled", "true"); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init().catch((error) => showGlobal(error.message)));
  else init().catch((error) => showGlobal(error.message));
})();
