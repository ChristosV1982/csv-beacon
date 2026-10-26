(() => {
  "use strict";

  const BUILD = "SIRE_FLEET_VETTING_EXPERIENCE-20261029_vessel_responses_v1";
  const ROOT = document.getElementById("viewerRuntime");
  const MODULE_KEY = "sire_fleet_vetting_experience";
  const COMPANY_VIEW_ID_KEY = "csvb_superuser_company_view_id";
  const PAGE_SIZE = 25;
  const $ = (id) => document.getElementById(id);
  const asText = (value) => value === null || value === undefined ? "" : String(value);
  const state = {
    client: null,
    context: null,
    isPlatform: false,
    selectedCompanyId: "",
    selectedQuestion: null,
    page: 0,
    rows: [],
    total: 0,
    last12: 0,
    canEdit: false,
    countBadges: {},
    countsReady: false,
    requestToken: 0,
    countsToken: 0,
    contextToken: 0,
    historyLoadingKey: "",
    historyLoadedKey: "",
    debounce: null,
    filtersReady: false,
    shellReady: false
  };

  function setMessage(host, message, kind = "info") {
    if (!host) return;
    host.replaceChildren();
    const node = document.createElement("div");
    node.className = `fleet-message fleet-message-${kind}`;
    node.setAttribute("role", kind === "error" ? "alert" : "status");
    node.textContent = message;
    host.appendChild(node);
  }

  function appendRetry(host, label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn light fleet-retry";
    button.textContent = label;
    button.addEventListener("click", callback);
    host?.appendChild(button);
  }

  function waitForGuard() {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const guard = window.CSVB_MODULE_GUARD;
        if (guard) {
          if (guard.moduleKey !== MODULE_KEY || guard.allowed !== true) {
            reject(new Error(guard.reason || "Module access was not granted by the access guard."));
            return;
          }
          resolve(guard);
          return;
        }
        if (Date.now() - started > 18000) {
          reject(new Error("Access guard did not finish loading. Fleet data was not requested."));
          return;
        }
        window.setTimeout(check, 60);
      };
      check();
    });
  }

  window.CSVB_FLEET_EXPERIENCE_GUARD_READY = waitForGuard();
  window.CSVB_FLEET_EXPERIENCE_BUILD = BUILD;

  async function loadRuntimeShell() {
    try {
      const response = await fetch("./q-sire-questions-viewer.html?v=20261026_observation_filter_v1", {
        credentials: "same-origin",
        cache: "no-cache"
      });
      if (!response.ok) throw new Error(`Question viewer template request failed (${response.status}).`);
      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const sourcePage = parsed.querySelector("body > .page");
      if (!sourcePage) throw new Error("The live SIRE question viewer template is missing its page shell.");

      parsed.querySelectorAll("script").forEach((script) => script.remove());
      parsed.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const href = link.getAttribute("href") || "";
        if (!href.startsWith("./") || document.querySelector(`link[data-fleet-template-style="${CSS.escape(href)}"]`)) return;
        const copy = document.createElement("link");
        copy.rel = "stylesheet";
        copy.href = href;
        copy.dataset.fleetTemplateStyle = href;
        document.head.appendChild(copy);
      });
      const sharedViewerStyles = parsed.querySelector('link[href*="q-sire-questions-viewer.css"]')?.getAttribute("href");
      if (sharedViewerStyles) {
        const stylesResponse = await fetch(sharedViewerStyles, { credentials: "same-origin", cache: "no-cache" });
        if (!stylesResponse.ok) throw new Error("The shared question viewer styles could not be loaded.");
        const sharedCss = await stylesResponse.text();
        const aliasCss = sharedCss.replaceAll(
          'html[data-csvb-page="q-sire-questions-viewer.html"]',
          'html[data-csvb-page="sire-fleet-vetting-experience.html"]'
        );
        const alias = document.createElement("style");
        alias.id = "fleetSharedViewerStyleAlias";
        alias.textContent = aliasCss;
        document.head.appendChild(alias);
      }
      const moduleStyles = $("fleetModuleStyles");
      if (moduleStyles) document.head.appendChild(moduleStyles);

      const clone = document.importNode(sourcePage, true);
      ROOT.replaceChildren(clone);
      addFleetControls(clone);
      addObservationSection(clone);
      window.CSVB_SIRE_QUESTIONS_VIEWER_CONFIG = {
        collapseSupportingSections: true,
        filterQuestionsWithObservations: true
      };
      state.shellReady = true;

      const viewer = document.createElement("script");
      viewer.src = "./q-sire-questions-viewer.js?v=20261026_observation_filter_v1";
      viewer.async = true;
      viewer.onerror = () => showFatal("The shared SIRE question viewer could not be loaded.");
      document.body.appendChild(viewer);
    } catch (error) {
      showFatal(`Unable to open the shared SIRE question library. ${asText(error?.message || error)}`);
    }
  }

  function addFleetControls(page) {
    const layout = page.querySelector(".layout");
    if (!layout) return;
    const panel = document.createElement("section");
    panel.className = "fleet-controls";
    panel.setAttribute("aria-label", "Fleet observation filters");
    panel.innerHTML = `
      <div class="fleet-controls-heading">
        <div><div class="fleet-controls-kicker">FLEET CONTEXT</div><h2>Observation history</h2></div>
        <span class="fleet-filter-note">Applied to the question list and records</span>
      </div>
      <div class="fleet-filter-grid">
        <label class="fleet-field fleet-company-field" for="fleetCompany"><span>Company</span><select id="fleetCompany" class="inp" aria-describedby="fleetCompanyHint"><option value="">Choose a company</option></select><small id="fleetCompanyHint">Choose a company to view its fleet records.</small></label>
        <label class="fleet-field" for="fleetRange"><span>History range</span><select id="fleetRange" class="inp">
          <option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="24">Last 24 months</option><option value="36">Last 36 months</option><option value="all">All available history</option><option value="custom">Custom From/To</option>
        </select></label>
        <label class="fleet-field" for="fleetFrom"><span>Inspection date from</span><input id="fleetFrom" class="inp" type="date"></label>
        <label class="fleet-field" for="fleetTo"><span>Inspection date to</span><input id="fleetTo" class="inp" type="date"></label>
        <label class="fleet-field" for="fleetOil"><span>Oil major</span><select id="fleetOil" class="inp"><option value="">All oil majors</option></select></label>
        <label class="fleet-field" for="fleetCategory"><span>Category</span><select id="fleetCategory" class="inp">
          <option value="">All categories</option><option value="Human">Human</option><option value="Hardware">Hardware</option><option value="Process">Process</option>
        </select></label>
      </div>
      <div id="fleetDataStatus" class="fleet-data-status" aria-live="polite"></div>
    `;
    page.insertBefore(panel, layout);
    const fullQuestionRow = page.querySelector("#showFullQuestionToggle")?.closest(".row");
    if (fullQuestionRow) {
      fullQuestionRow.classList.add("fleet-list-control");
      const observationToggle = document.createElement("label");
      observationToggle.className = "fleet-observation-filter fleet-list-control";
      observationToggle.htmlFor = "fleetOnlyObservedToggle";
      observationToggle.innerHTML = `<input id="fleetOnlyObservedToggle" type="checkbox"><span>Show only questions with recorded observations</span>`;
      fullQuestionRow.insertAdjacentElement("afterend", observationToggle);
    }
    $("fleetCompany").addEventListener("change", onCompanyChanged);
    $("fleetRange").addEventListener("change", onRangeChanged);
    $("fleetFrom").addEventListener("change", onCustomDateChanged);
    $("fleetTo").addEventListener("change", onCustomDateChanged);
    $("fleetOil").addEventListener("change", onFilterChanged);
    $("fleetCategory").addEventListener("change", onFilterChanged);
  }

  function addObservationSection(page) {
    const viewPanel = page.querySelector("#viewPanel");
    const questionSection = viewPanel?.querySelector(".section");
    if (!viewPanel || !questionSection) return;
    const section = document.createElement("section");
    section.className = "fleet-observations";
    section.id = "fleetObservations";
    section.setAttribute("aria-labelledby", "fleetObservationsTitle");
    section.innerHTML = `
      <header class="fleet-observations-header">
        <div>
          <div class="fleet-controls-kicker">COMPANY FLEET RECORD</div>
          <h2 id="fleetObservationsTitle">Recorded Vetting Observations</h2>
          <p id="fleetRecurrence" class="fleet-recurrence" hidden></p>
        </div>
        <span id="fleetResultCount" class="fleet-result-count">—</span>
      </header>
      <div id="fleetRecords" class="fleet-records" aria-live="polite"><div class="fleet-record-placeholder">Select a company and question to view recorded observations.</div></div>
      <nav id="fleetPagination" class="fleet-pagination" aria-label="Observation result pages" hidden>
        <button id="fleetPrev" class="btn light" type="button">Previous</button><span id="fleetPageLabel"></span><button id="fleetNext" class="btn light" type="button">Next</button>
      </nav>
    `;
    viewPanel.appendChild(section);
    $("fleetPrev").addEventListener("click", () => { if (state.page > 0) { state.page -= 1; requestHistory(); } });
    $("fleetNext").addEventListener("click", () => { if ((state.page + 1) * PAGE_SIZE < state.total) { state.page += 1; requestHistory(); } });
  }

  function showFatal(message) {
    setMessage(ROOT, message, "error");
  }

  function normalizeQuestionNo(value) {
    const match = asText(value).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return "";
    return `${String(Number(match[1])).padStart(2, "0")}.${String(Number(match[2])).padStart(2, "0")}.${String(Number(match[3])).padStart(2, "0")}`;
  }

  function selectedQuestionNo() {
    const selected = state.selectedQuestion;
    if (!selected) return "";
    const base = normalizeQuestionNo(selected.question_no);
    if (!base) return asText(selected.question_no);
    const suffix = asText(selected.number_suffix).trim();
    return suffix ? `${base}-${suffix}` : base;
  }

  function dateOnly(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function shiftMonths(dateString, months) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() - months);
    const finalDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, finalDay));
    return dateOnly(date);
  }

  function currentFilters() {
    return {
      p_company_id: state.selectedCompanyId || null,
      p_from_date: $("fleetFrom")?.value || null,
      p_to_date: $("fleetTo")?.value || null,
      p_oil_major: $("fleetOil")?.value || null,
      p_category: $("fleetCategory")?.value || null
    };
  }

  function setRangeDates(range) {
    if (!state.context?.today) return;
    const today = state.context.today;
    if (range === "all") {
      $("fleetFrom").value = "";
      $("fleetTo").value = today;
    } else if (range === "custom") {
      if (!$("fleetTo").value) $("fleetTo").value = today;
    } else {
      $("fleetFrom").value = shiftMonths(today, Number(range));
      $("fleetTo").value = today;
    }
  }

  function onRangeChanged() {
    if ($("fleetRange").value !== "custom") setRangeDates($("fleetRange").value);
    onFilterChanged();
  }

  function onCustomDateChanged() {
    $("fleetRange").value = "custom";
    onFilterChanged();
  }

  function onFilterChanged() {
    state.page = 0;
    invalidateFleetRequests();
    setMessage($("fleetDataStatus"), "Updating question counts for the selected filters…");
    state.countBadges = {};
    state.countsReady = false;
    applyBadges();
    state.rows = [];
    state.total = 0;
    state.last12 = 0;
    $("fleetResultCount").textContent = "—";
    $("fleetRecurrence").hidden = true;
    $("fleetPagination").hidden = true;
    setMessage($("fleetRecords"), "Updating observations for the selected filters…");
    state.historyLoadedKey = "";
    if (state.debounce) clearTimeout(state.debounce);
    state.debounce = window.setTimeout(() => refreshFilterContext(), 280);
  }

  async function onCompanyChanged() {
    const nextId = $("fleetCompany").value;
    if (!nextId) {
      state.selectedCompanyId = "";
      clearCompanyRecords();
      return;
    }
    clearCompanyRecords();
    state.selectedCompanyId = nextId;
    state.page = 0;
    state.historyLoadedKey = "";
    await refreshContext(nextId);
  }

  function invalidateFleetRequests() {
    state.requestToken += 1;
    state.countsToken += 1;
    state.historyLoadingKey = "";
  }

  function cancelHistoryRequest() {
    state.requestToken += 1;
    state.historyLoadingKey = "";
    state.historyLoadedKey = "";
  }

  function clearCompanyRecords() {
    state.contextToken += 1;
    state.filtersReady = false;
    invalidateFleetRequests();
    state.historyLoadedKey = "";
    state.countBadges = {};
    state.countsReady = false;
    state.total = 0;
    state.last12 = 0;
    state.rows = [];
    applyBadges();
    setMessage($("fleetDataStatus"), "Choose a company before fleet observations can be requested.");
    setMessage($("fleetRecords"), "Select a company and question to view recorded observations.");
    $("fleetResultCount").textContent = "—";
    $("fleetRecurrence").hidden = true;
    $("fleetPagination").hidden = true;
  }

  async function refreshContext(companyId) {
    state.filtersReady = false;
    clearCompanyRecords();
    const token = state.contextToken;
    state.selectedCompanyId = state.isPlatform ? (companyId || "") : "";
    try {
      setMessage($("fleetDataStatus"), "Loading company context…");
      const { data, error } = await state.client.rpc("csvb_fleet_vetting_experience_context", {
        p_company_id: state.isPlatform ? (companyId || null) : null
      });
      if (token !== state.contextToken) return;
      if (error) throw error;
      const context = Array.isArray(data) ? data[0] : data;
      if (!context || typeof context !== "object") throw new Error("The company context response was empty.");
      state.context = context;
      state.selectedCompanyId = state.isPlatform ? (companyId || "") : asText(context.company_id);
      renderCompanies(context.companies);
      renderOilMajors(context.oil_majors);
      if (context.today) setRangeDates($("fleetRange").value || "6");
      state.filtersReady = !!state.selectedCompanyId;
      if (!state.selectedCompanyId) {
        state.countBadges = {};
        applyBadges();
        setMessage($("fleetDataStatus"), "Choose a company to continue. No company is selected by default.", "info");
        setMessage($("fleetRecords"), "Select a company and question to view recorded observations.");
        return;
      }
      $("fleetCompany").value = state.selectedCompanyId;
      const selectedCompany = (context.companies || []).find((item) => asText(item.id) === state.selectedCompanyId);
      $("fleetCompanyHint").textContent = selectedCompany?.name || context.company_name || "Company context is ready.";
      setMessage($("fleetDataStatus"), `Company context ready · ${selectedCompany?.name || context.company_name || "Selected company"}.`);
      await refreshFilterContext();
    } catch (error) {
      if (token !== state.contextToken) return;
      state.filtersReady = false;
      state.countBadges = {};
      state.countsReady = false;
      applyBadges();
      state.rows = [];
      state.total = 0;
      state.last12 = 0;
      setMessage($("fleetDataStatus"), `Company context could not be loaded. ${asText(error?.message || error)}`, "error");
      appendRetry($("fleetDataStatus"), "Retry company context", () => refreshContext(companyId));
      setMessage($("fleetRecords"), "Fleet observations are unavailable until company context loads.", "error");
    }
  }

  function renderCompanies(companies) {
    const select = $("fleetCompany");
    const options = Array.isArray(companies) ? companies : [];
    select.replaceChildren(new Option(state.isPlatform ? "Choose a company" : "Company context", ""));
    options.forEach((company) => {
      const option = new Option(asText(company?.name || company?.company_name || "Company"), asText(company?.id));
      select.add(option);
    });
    const resolvedId = asText(state.context?.company_id);
    if (state.isPlatform && resolvedId && !Array.from(select.options).some((option) => option.value === resolvedId)) {
      select.add(new Option(asText(state.context?.company_name || "Selected company"), resolvedId));
    }
    select.disabled = !state.isPlatform;
    if (!state.isPlatform && state.context?.company_id) {
      const found = options.some((company) => asText(company.id) === asText(state.context.company_id));
      if (!found) select.add(new Option(asText(state.context.company_name || "Your company"), asText(state.context.company_id)));
      select.value = asText(state.context.company_id);
    }
  }

  function renderOilMajors(values) {
    const select = $("fleetOil");
    const current = select.value;
    select.replaceChildren(new Option("All oil majors", ""));
    (Array.isArray(values) ? values : []).forEach((value) => {
      select.add(new Option(asText(value), asText(value)));
    });
    select.value = Array.from(select.options).some((option) => option.value === current) ? current : "";
  }

  async function refreshFilterContext() {
    if (!state.filtersReady || !state.selectedCompanyId) return;
    const token = ++state.countsToken;
    const filter = currentFilters();
    try {
      const { data, error } = await state.client.rpc("csvb_fleet_vetting_experience_counts", filter);
      if (error) throw error;
      if (token !== state.countsToken) return;
      const rows = Array.isArray(data) ? data : [];
      const counts = {};
      rows.forEach((row) => {
        const key = normalizeQuestionNo(row?.question_no);
        const count = Number(row?.count);
        if (key && Number.isFinite(count) && count > 0) counts[key] = count;
      });
      state.countBadges = counts;
      state.countsReady = true;
      applyBadges();
      setMessage($("fleetDataStatus"), "Filters applied. Counts reflect negative records only.");
    } catch (error) {
      if (token !== state.countsToken) return;
      state.countBadges = {};
      state.countsReady = true;
      applyBadges();
      setMessage($("fleetDataStatus"), `Question counts could not be loaded. ${asText(error?.message || error)}`, "error");
      appendRetry($("fleetDataStatus"), "Retry filters", () => refreshFilterContext());
      state.rows = [];
      state.total = 0;
      state.last12 = 0;
      setMessage($("fleetRecords"), "Observation counts are unavailable for the selected filters.", "error");
      $("fleetResultCount").textContent = "Unavailable";
      $("fleetRecurrence").hidden = true;
      $("fleetPagination").hidden = true;
    }
    if (state.selectedQuestion) requestHistory();
  }

  function applyBadges() {
    const api = window.CSVB_SIRE_QUESTIONS_VIEWER;
    if (api?.setQuestionBadges) api.setQuestionBadges(state.countBadges, state.countsReady);
  }

  function appendRecordValue(card, label, value, className = "") {
    const field = document.createElement("div");
    field.className = `fleet-record-field ${className}`.trim();
    const caption = document.createElement("div");
    caption.className = "fleet-record-label";
    caption.textContent = label;
    const content = document.createElement("div");
    content.className = "fleet-record-value";
    content.textContent = asText(value) || "—";
    field.append(caption, content);
    card.appendChild(field);
  }

  function renderRecords(rows) {
    const host = $("fleetRecords");
    host.replaceChildren();
    if (!rows.length) {
      setMessage(host, "No recorded vetting observations match this question and filter set.");
      return;
    }
    rows.forEach((row) => {
      const card = document.createElement("article");
      card.className = "fleet-record";
      const metadata = document.createElement("div");
      metadata.className = "fleet-record-meta";
      appendRecordValue(metadata, "Vessel", row?.vessel_name);
      appendRecordValue(metadata, "Inspection Date", row?.inspection_date);
      appendRecordValue(metadata, "Oil Major", row?.oil_major);
      appendRecordValue(metadata, "Category / Designation", row?.designation);
      card.appendChild(metadata);
      appendRecordValue(card, "Observation", row?.observation_text, "fleet-observation-text");
      const prevention = window.CSVB_FVE_PREVENTION;
      if (prevention?.attach) {
        prevention.attach(card, row, {
          companyId: state.selectedCompanyId,
          canEdit: state.canEdit,
          client: state.client,
          onSaved: (change) => {
            if (change?.reload) {
              state.historyLoadedKey = "";
              requestHistory();
            }
          }
        });
      }
      host.appendChild(card);
    });
  }

  async function requestHistory() {
    if (!state.filtersReady || !state.selectedCompanyId || !state.selectedQuestion) return;
    // A list reconciliation may still be loading the newly selected question.
    // Its selection event will request history once; do not reload the old one.
    const viewerSelection = window.CSVB_SIRE_QUESTIONS_VIEWER?.getSelected?.();
    if (viewerSelection?.id !== state.selectedQuestion.question?.id) return;
    const questionNo = selectedQuestionNo();
    if (!questionNo) return;
    const filter = currentFilters();
    const params = {
      ...filter,
      p_question_no: questionNo,
      p_offset: state.page * PAGE_SIZE,
      p_limit: PAGE_SIZE
    };
    const historyKey = JSON.stringify(params);
    if (state.historyLoadingKey === historyKey || state.historyLoadedKey === historyKey) return;
    const token = ++state.requestToken;
    state.historyLoadingKey = historyKey;
    $("fleetPagination").hidden = true;
    setMessage($("fleetRecords"), "Loading recorded observations…");
    $("fleetResultCount").textContent = "Loading";
    try {
      const { data, error } = await state.client.rpc("csvb_fve_prevention_history", params);
      if (error) throw error;
      if (token !== state.requestToken) return;
      state.historyLoadingKey = "";
      state.historyLoadedKey = historyKey;
      const result = Array.isArray(data) ? data[0] : data;
      state.canEdit = result?.can_edit === true;
      state.rows = Array.isArray(result?.rows) ? result.rows : [];
      state.total = Math.max(0, Number(result?.total) || 0);
      state.last12 = Math.max(0, Number(result?.last_12_months) || 0);
      renderRecords(state.rows);
      $("fleetResultCount").textContent = `${state.total} ${state.total === 1 ? "record" : "records"}`;
      const recurrence = $("fleetRecurrence");
      recurrence.hidden = false;
      recurrence.textContent = `Recorded observations: ${state.total}  |  Last 12 months: ${state.last12}`;
      recurrence.title = "Last 12 months is a rolling 12-month count for the selected company, oil major, and category; it is independent of the selected history date range.";
      const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
      $("fleetPagination").hidden = state.total <= PAGE_SIZE;
      $("fleetPageLabel").textContent = `Page ${state.page + 1} of ${pages}`;
      $("fleetPrev").disabled = state.page <= 0;
      $("fleetNext").disabled = (state.page + 1) * PAGE_SIZE >= state.total;
    } catch (error) {
      if (token !== state.requestToken) return;
      state.historyLoadingKey = "";
      state.historyLoadedKey = "";
      state.rows = [];
      state.total = 0;
      state.last12 = 0;
      state.countBadges = {};
      applyBadges();
      setMessage($("fleetRecords"), `Observation history could not be loaded. ${asText(error?.message || error)}`, "error");
      appendRetry($("fleetRecords"), "Retry", requestHistory);
      $("fleetResultCount").textContent = "Unavailable";
      $("fleetRecurrence").hidden = true;
    }
  }

  async function initialize() {
    try {
      await window.CSVB_FLEET_EXPERIENCE_GUARD_READY;
      if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
        throw new Error("Authentication services are unavailable.");
      }
      const bundle = await window.AUTH.getSessionUserProfile();
      if (!bundle?.session?.user) throw new Error("Sign in to view fleet vetting observations.");
      state.client = window.AUTH.ensureSupabase();
      const role = asText(bundle.profile?.role);
      state.isPlatform = role === "super_admin" || role === "platform_owner";
      $("modeLine").textContent = `Role: ${role} • Mode: Read-only • Module: SIRE_FLEET_VETTING_EXPERIENCE`;
      if (state.isPlatform) {
        let simulatedCompany = "";
        try { simulatedCompany = localStorage.getItem(COMPANY_VIEW_ID_KEY) || ""; } catch (_) {}
        await refreshContext(simulatedCompany);
      } else {
        await refreshContext("");
      }
    } catch (error) {
      setMessage($("fleetDataStatus"), `Fleet experience is not available. ${asText(error?.message || error)}`, "error");
      setMessage($("fleetRecords"), "No fleet data was requested.", "info");
    }
  }

  document.addEventListener("csvb:sire-viewer-question-selected", (event) => {
    state.selectedQuestion = event.detail || null;
    state.page = 0;
    state.historyLoadedKey = "";
    if (state.selectedQuestion && state.filtersReady) {
      requestHistory();
      return;
    }
    cancelHistoryRequest();
    state.rows = [];
    state.total = 0;
    state.last12 = 0;
    $("fleetResultCount").textContent = "0 records";
    $("fleetRecurrence").hidden = true;
    $("fleetPagination").hidden = true;
    setMessage(
      $("fleetRecords"),
      "No question with recorded observations is selected. Adjust the question search or filters to see matching observations."
    );
  });
  document.addEventListener("csvb:sire-viewer-list-rendered", applyBadges);
  document.addEventListener("DOMContentLoaded", () => {
    loadRuntimeShell().then(() => initialize());
  }, { once: true });
})();
