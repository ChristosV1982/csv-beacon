// C.S.V. BEACON — Port Call Intelligence application interface v3.
(() => {
  "use strict";

  const BUILD = "PCI-UI-2026-09-04-V03";
  const BUCKET = "port-call-intelligence-private";
  const MAX_FILE = 5 * 1024 * 1024;
  const MAX_CALL = 100 * 1024 * 1024;
  const OFFICE_LABELS = {
    regulation: "Regulation", incident: "Incident", operational_note: "Operational note",
    master_guidance: "Master guidance", superintendent_note: "Superintendent note", other: "Other"
  };
  const HAZARD_CATEGORIES = [
    ["navigation_ukc", "Navigation / UKC"], ["pilotage", "Pilotage"], ["weather", "Weather"],
    ["mooring", "Mooring"], ["cargo", "Cargo"], ["security", "Security"],
    ["environmental", "Environmental"], ["other", "Other"]
  ];

  const state = {
    sb: null, bundle: null, permissions: null, countries: [], ports: [], facilities: [], vessels: [], selectedCountryCode: "",
    selectedPortId: "", selectedFacilityId: "", activeTab: "profile",
    profiles: [], calls: [], officeItems: [], officeRevisions: [], profileValues: [], proposals: [],
    fields: [], options: [], selectedCallId: "", callDetails: new Map(), busy: 0
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const attr = esc;
  const clean = (value) => String(value ?? "").trim();
  const isoDate = (value) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "—";
  const localDate = (value) => value ? String(value).replace("T", " ").slice(0, 16) : "—";
  const statusLabel = (value) => String(value || "").replace(/^office_info_/, "").replaceAll("_", " ");
  const bytes = (n) => n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
  const selectedPort = () => state.ports.find((p) => p.port_id === state.selectedPortId) || null;
  const selectedFacility = () => state.facilities.find((f) => f.port_facility_id === state.selectedFacilityId) || null;
  const facilityName = (facility) => clean(facility?.facility_name || facility?.berth_or_terminal_name);
  const fieldById = (id) => state.fields.find((f) => f.id === id) || null;

  function showMessage(kind, message) {
    const ok = $("okBox"), warn = $("warnBox");
    ok.hidden = true; warn.hidden = true; ok.style.display = "none"; warn.style.display = "none";
    const target = kind === "ok" ? ok : warn;
    target.textContent = message; target.hidden = !message; target.style.display = message ? "block" : "none";
    if (message) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setBusy(on, label = "Working…") {
    state.busy = Math.max(0, state.busy + (on ? 1 : -1));
    $("pciBusy").hidden = state.busy === 0;
    $("pciBusy").querySelector("span").textContent = label;
  }

  async function task(label, fn) {
    setBusy(true, label);
    try { return await fn(); }
    catch (error) { console.error(error); showMessage("warn", error?.message || String(error)); throw error; }
    finally { setBusy(false); }
  }

  function dbError(error, fallback) {
    if (!error) return;
    throw new Error(error.message || fallback || "The database operation failed.");
  }

  function button(label, className, tip, action, disabled = false) {
    return `<button type="button" class="${attr(className)}" data-action="${attr(action)}" data-pci-tip="${attr(tip)}"${disabled ? " disabled" : ""}>${esc(label)}</button>`;
  }

  function statusPill(status) {
    return `<span class="pci-status pci-status--${attr(status)}">${esc(statusLabel(status))}</span>`;
  }

  function bindActionRoot(root = document) {
    root.querySelectorAll("[data-action]").forEach((node) => {
      if (node.dataset.pciBound) return;
      node.dataset.pciBound = "1";
      node.addEventListener("click", () => dispatchAction(node.dataset.action, node));
    });
  }

  async function dispatchAction(action, node) {
    const id = node.dataset.id || "";
    if (action === "open-call") return openCall(id);
    if (action === "edit-call") return openCallEditor(state.calls.find((c) => c.id === id));
    if (action === "delete-call") return confirmDeleteCall(id);
    if (action === "submit-call") return submitCall(id);
    if (action === "retract-call") return retractCall(id);
    if (action === "start-review") return changeCallStatus(id, "under_review");
    if (action === "return-call") return openReturnCall(id);
    if (action === "finalise-call") return confirmFinaliseCall(id);
    if (action === "request-amendment") return openAmendmentRequest(id);
    if (action === "download-attachment") return downloadAttachment(id);
    if (action === "delete-attachment") return confirmDeleteAttachment(id);
    if (action === "edit-office") return openOfficeEditor(id, false);
    if (action === "revise-office") return openOfficeEditor(id, true);
    if (action === "publish-office") return publishOfficeInfo(id);
    if (action === "delete-office") return confirmDeleteOfficeInfo(id);
    if (action === "withdraw-office") return openWithdrawOfficeInfo(id);
    if (action === "decide-proposal") return openProposalDecision(id);
    if (action === "add-terminal") return openAddTerminal();
    if (action === "edit-terminal") return openEditTerminal();
  }

  function installTooltips() {
    const tip = $("pciTooltip"); let active = null;
    const tipText = (target) => clean(target?.dataset?.pciTip || target?.getAttribute?.("aria-label") || target?.getAttribute?.("title") || (target?.tagName === "BUTTON" ? `Operation: ${clean(target.textContent)}` : ""));
    const move = (event) => {
      if (!active) return;
      const pad = 12, width = Math.min(310, window.innerWidth - 24);
      let x = event.clientX + 15, y = event.clientY + 17;
      if (x + width > window.innerWidth - pad) x = Math.max(pad, event.clientX - width - 12);
      if (y + 60 > window.innerHeight - pad) y = Math.max(pad, event.clientY - 70);
      tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.maxWidth = `${width}px`;
    };
    document.addEventListener("pointerover", (event) => {
      const target = event.target.closest?.("button,[data-pci-tip]");
      const message = tipText(target); if (!target || !message) return;
      active = target; tip.textContent = message; tip.hidden = false; move(event);
    });
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerout", (event) => {
      if (!active || event.target.closest?.("button,[data-pci-tip]") !== active) return;
      active = null; tip.hidden = true;
    });
    document.addEventListener("focusin", (event) => {
      const target = event.target.closest?.("button,[data-pci-tip]");
      const message = tipText(target); if (!target || !message) return;
      tip.textContent = message; tip.hidden = false;
      const r = target.getBoundingClientRect(); tip.style.left = `${Math.min(r.left, window.innerWidth - 322)}px`; tip.style.top = `${Math.min(r.bottom + 8, window.innerHeight - 70)}px`;
    });
    document.addEventListener("focusout", () => { active = null; tip.hidden = true; });
  }

  function openDrawer(kicker, title, bodyHtml, actionsHtml = "") {
    $("drawerKicker").textContent = kicker; $("drawerTitle").textContent = title;
    $("drawerBody").innerHTML = bodyHtml; $("drawerActions").innerHTML = actionsHtml;
    $("pciDrawerBackdrop").hidden = false; $("pciDrawer").hidden = false;
    document.body.style.overflow = "hidden"; bindActionRoot($("pciDrawer"));
    setTimeout(() => $("pciDrawer").querySelector("input,select,textarea,button")?.focus(), 20);
  }

  function closeDrawer() {
    $("pciDrawerBackdrop").hidden = true; $("pciDrawer").hidden = true;
    document.body.style.overflow = "";
  }

  function confirmAction({ title, message, label = "Delete", danger = true }) {
    return new Promise((resolve) => {
      $("confirmTitle").textContent = title; $("confirmMessage").textContent = message;
      $("confirmActionBtn").textContent = label;
      $("confirmActionBtn").className = danger ? "pci-danger" : "btn";
      $("confirmBackdrop").hidden = false; $("confirmDialog").hidden = false;
      const done = (answer) => { $("confirmBackdrop").hidden = true; $("confirmDialog").hidden = true; resolve(answer); };
      $("confirmCancelBtn").onclick = () => done(false); $("confirmActionBtn").onclick = () => done(true);
      setTimeout(() => $("confirmCancelBtn").focus(), 10);
    });
  }

  async function loadDefinitions() {
    const [{ data: fields, error: fieldError }, { data: options, error: optionError }] = await Promise.all([
      state.sb.from("pci_field_definitions").select("*").eq("version", 1).eq("is_active", true).order("sort_order"),
      state.sb.from("pci_field_options").select("*").eq("is_active", true).order("sort_order")
    ]);
    dbError(fieldError); dbError(optionError); state.fields = fields || []; state.options = options || [];
  }

  async function loadCountries() {
    const { data, error } = await state.sb.from("pci_v_countries_list").select("*").order("country_name");
    dbError(error, "Could not load the controlled country register.");
    state.countries = data || [];
    if (state.selectedCountryCode && !state.countries.some((country) => country.country_code === state.selectedCountryCode)) state.selectedCountryCode = "";
    renderCountryOptions();
  }

  async function loadPortsForCountry(countryCode) {
    state.ports = [];
    if (!countryCode) { renderPortOptions(); return; }
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await state.sb.from("pci_v_ports_list").select("*").eq("country_code", countryCode).order("port_name").order("port_id").range(from, from + pageSize - 1);
      dbError(error, "Could not load the selected country's controlled port register.");
      const page = data || [];
      state.ports.push(...page);
      if (page.length < pageSize) break;
    }
    renderPortOptions();
  }

  async function loadCompanyVessels() {
    state.vessels = [];
    if (!state.permissions.canCreateOfficeCall) return;
    const { data, error } = await state.sb.rpc("pci_list_company_vessels", { p_company_id: state.permissions.companyId });
    dbError(error, "Could not load the Company's active vessel register.");
    state.vessels = data || [];
  }

  function renderCountryOptions() {
    $("countrySelect").innerHTML = '<option value="">Select a country…</option>' + state.countries.map((country) => `<option value="${attr(country.country_code)}"${country.country_code === state.selectedCountryCode ? " selected" : ""}>${esc(country.country_name || country.country_code)} (${esc(country.country_code)})</option>`).join("");
  }

  function renderPortOptions() {
    const rows = state.ports.filter((p) => p.country_code === state.selectedCountryCode);
    $("portSelect").disabled = !state.selectedCountryCode;
    $("portSelect").innerHTML = state.selectedCountryCode
      ? '<option value="">Select a port…</option>' + rows.map((p) => `<option value="${attr(p.port_id)}"${p.port_id === state.selectedPortId ? " selected" : ""}>${esc(p.port_name)}${p.unlocode ? ` (${esc(p.unlocode)})` : ""}</option>`).join("")
      : '<option value="">Select a country first…</option>';
  }

  function visibleFacilities() {
    return state.facilities.filter((f) => f.company_id === null || f.company_id === state.permissions.companyId);
  }

  function renderTerminalOptions() {
    const rows = visibleFacilities().sort((a, b) => facilityName(a).localeCompare(facilityName(b), undefined, { sensitivity: "base" }));
    $("terminalSelect").disabled = !state.selectedPortId;
    $("terminalSelect").innerHTML = state.selectedPortId
      ? '<option value="">All terminals / port-wide</option>' + rows.map((f) => `<option value="${attr(f.port_facility_id)}"${f.port_facility_id === state.selectedFacilityId ? " selected" : ""}>${esc(facilityName(f))}${f.company_id ? " — Company entry" : ""}</option>`).join("")
      : '<option value="">Select a port first…</option>';
    updateTerminalActions();
  }

  function updateTerminalActions() {
    const facility = selectedFacility();
    $("addTerminalBtn").hidden = !(state.selectedPortId && state.permissions.canAddTerminal);
    $("editTerminalBtn").hidden = !(facility && state.permissions.canManageTerminals && facility.company_id === state.permissions.companyId);
  }

  async function loadFacilities(portId) {
    if (!portId) { state.facilities = []; renderTerminalOptions(); return; }
    let query = state.sb.from("pci_v_port_facilities_list").select("*").eq("port_id", portId).order("facility_name");
    query = state.permissions.companyId
      ? query.or(`company_id.is.null,company_id.eq.${state.permissions.companyId}`)
      : query.is("company_id", null);
    const { data, error } = await query;
    dbError(error, "Could not load the controlled terminal register.");
    state.facilities = data || [];
    if (state.selectedFacilityId && !state.facilities.some((f) => f.port_facility_id === state.selectedFacilityId)) state.selectedFacilityId = "";
    renderTerminalOptions();
  }

  async function selectCountry(countryCode) {
    state.selectedCountryCode = countryCode || "";
    state.selectedPortId = ""; state.selectedFacilityId = ""; state.facilities = [];
    state.ports = []; renderPortOptions(); renderTerminalOptions(); clearPortPanels();
    $("portMeta").textContent = state.selectedCountryCode ? "Select a port." : "Select a country, then a port.";
    if (state.selectedCountryCode) await task("Loading ports for the selected country…", () => loadPortsForCountry(state.selectedCountryCode));
  }

  async function selectPort(portId) {
    state.selectedPortId = portId || ""; state.selectedFacilityId = ""; state.selectedCallId = ""; state.callDetails.clear();
    const p = selectedPort();
    $("portMeta").textContent = p ? [p.port_name, p.country_name, p.unlocode].filter(Boolean).join(" • ") : "Select a port to view its Company information.";
    if (!p) { state.facilities = []; renderTerminalOptions(); clearPortPanels(); return; }
    await task("Loading port and terminal information…", async () => { await loadFacilities(portId); await loadSelectedPort(); });
  }

  function selectTerminal(facilityId) {
    state.selectedFacilityId = facilityId || "";
    updateTerminalActions(); renderProfile(); renderCalls(); renderOfficeInfo(); updateCounts();
    const p = selectedPort(), f = selectedFacility();
    $("portMeta").textContent = [p?.port_name, p?.country_name, p?.unlocode, f ? facilityName(f) : "All terminals / port-wide"].filter(Boolean).join(" • ");
  }

  function openAddTerminal() {
    if (!state.permissions.companyContextReady) return showMessage("warn", "Select a Company context before adding a terminal.");
    if (!state.selectedPortId) return showMessage("warn", "Select a port before adding a terminal.");
    openDrawer("Shared Company terminal register", `Add terminal — ${selectedPort()?.port_name || "Port"}`, `<form class="pci-form"><section class="pci-form-section"><h3>New terminal</h3><div class="pci-form-grid">${inputField({ id: "pciNewTerminalName", label: "Terminal name", required: true, wide: true, help: "The terminal will become available to authorised users in this Company after it is saved." })}</div></section></form>`, `<button id="cancelTerminalBtn" class="btn2" type="button" data-pci-tip="Close without adding a terminal.">Cancel</button><button id="saveTerminalBtn" class="btn" type="button" data-pci-tip="Add this terminal to the selected port's shared Company terminal list.">Add Terminal</button>`);
    $("cancelTerminalBtn").onclick = closeDrawer;
    $("saveTerminalBtn").onclick = async () => {
      const name = clean($("pciNewTerminalName").value);
      if (!name) { $("pciNewTerminalName").classList.add("pci-form-error"); return; }
      await task("Adding terminal…", async () => {
        const { data, error } = await state.sb.rpc("pci_add_company_terminal", { p_company_id: state.permissions.companyId, p_port_id: state.selectedPortId, p_terminal_name: name });
        dbError(error, "Could not add the terminal.");
        const saved = Array.isArray(data) ? data[0] : data;
        closeDrawer(); await loadFacilities(state.selectedPortId);
        state.selectedFacilityId = saved?.port_facility_id || ""; renderTerminalOptions(); selectTerminal(state.selectedFacilityId);
        showMessage("ok", `${name} is now available in the shared Company terminal list.`);
      });
    };
  }

  function openEditTerminal() {
    const facility = selectedFacility();
    if (!facility || facility.company_id !== state.permissions.companyId || !state.permissions.canManageTerminals) return showMessage("warn", "Only authorised office users may manage Company-added terminals.");
    openDrawer("Shared Company terminal register", "Correct terminal name", `<form class="pci-form"><section class="pci-form-section"><h3>Terminal details</h3><div class="pci-form-grid">${inputField({ id: "pciEditTerminalName", label: "Correct terminal name", value: facilityName(facility), required: true, wide: true, help: "The corrected name will be used for future selections. Existing vessel-call report snapshots will remain unchanged." })}</div></section></form>`, `<button id="cancelEditTerminalBtn" class="btn2" type="button" data-pci-tip="Close without changing the terminal.">Cancel</button><button id="deactivateTerminalBtn" class="pci-danger" type="button" data-pci-tip="Deactivate this Company-added terminal so it is no longer available for future selection. Historical reports remain unchanged.">Deactivate Terminal</button><button id="saveTerminalNameBtn" class="btn" type="button" data-pci-tip="Save the corrected terminal name for future Company use.">Save Corrected Name</button>`);
    $("cancelEditTerminalBtn").onclick = closeDrawer;
    $("saveTerminalNameBtn").onclick = async () => {
      const name = clean($("pciEditTerminalName").value);
      if (!name) { $("pciEditTerminalName").classList.add("pci-form-error"); return; }
      await task("Correcting terminal name…", async () => {
        const { error } = await state.sb.rpc("pci_manage_company_terminal", { p_company_id: state.permissions.companyId, p_port_facility_id: facility.port_facility_id, p_terminal_name: name, p_is_active: true });
        dbError(error, "Could not correct the terminal name.");
        closeDrawer(); await loadFacilities(state.selectedPortId); state.selectedFacilityId = facility.port_facility_id; renderTerminalOptions(); selectTerminal(state.selectedFacilityId);
        showMessage("ok", "The terminal name was corrected. Historical call reports were not changed.");
      });
    };
    $("deactivateTerminalBtn").onclick = async () => {
      if (!await confirmAction({ title: "Deactivate terminal?", message: `“${facilityName(facility)}” will no longer be available for future selection. Existing reports and audit evidence will remain unchanged.`, label: "Deactivate Terminal" })) return;
      await task("Deactivating terminal…", async () => {
        const { error } = await state.sb.rpc("pci_manage_company_terminal", { p_company_id: state.permissions.companyId, p_port_facility_id: facility.port_facility_id, p_terminal_name: facilityName(facility), p_is_active: false });
        dbError(error, "Could not deactivate the terminal.");
        closeDrawer(); state.selectedFacilityId = ""; await loadFacilities(state.selectedPortId); selectTerminal("");
        showMessage("ok", "The terminal was deactivated. Historical reports remain unchanged.");
      });
    };
  }

  function clearPortPanels() {
    state.profiles = []; state.calls = []; state.officeItems = []; state.officeRevisions = []; state.profileValues = []; state.proposals = [];
    $("profileContent").innerHTML = '<div class="pci-empty">Select a port.</div>';
    $("callList").innerHTML = '<div class="pci-empty">Select a port.</div>';
    $("callDetail").innerHTML = '<div class="pci-empty">Select a call report to read it.</div>';
    $("officeList").innerHTML = '<div class="pci-empty">Select a port.</div>'; updateCounts();
  }

  async function loadSelectedPort() {
    const portId = state.selectedPortId;
    if (!state.permissions.companyContextReady) {
      state.profiles = []; state.calls = []; state.officeItems = []; state.officeRevisions = []; state.profileValues = []; state.proposals = [];
      renderProfile(); renderCalls(); renderOfficeInfo(); updateCounts();
      return;
    }
    const [profilesR, callsR, officeR] = await Promise.all([
      state.sb.from("pci_port_profiles").select("*").eq("company_id", state.permissions.companyId).eq("port_id", portId).order("terminal_name").order("berth_name"),
      state.sb.from("pci_port_calls").select("*").eq("company_id", state.permissions.companyId).eq("port_id", portId).order("all_lines_fast_utc", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      state.sb.from("pci_port_information_items").select("*").eq("company_id", state.permissions.companyId).eq("port_id", portId).order("updated_at", { ascending: false })
    ]);
    [profilesR, callsR, officeR].forEach((r) => dbError(r.error));
    state.profiles = profilesR.data || []; state.calls = callsR.data || []; state.officeItems = officeR.data || [];
    const profileIds = state.profiles.map((x) => x.id), itemIds = state.officeItems.map((x) => x.id);
    const [valuesR, proposalsR, revisionsR] = await Promise.all([
      profileIds.length ? state.sb.from("pci_profile_values").select("*").in("profile_id", profileIds).order("updated_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      profileIds.length ? state.sb.from("pci_profile_change_proposals").select("*").in("profile_id", profileIds).in("status", ["pending", "clarification_requested"]).order("created_at") : Promise.resolve({ data: [], error: null }),
      itemIds.length ? state.sb.from("pci_port_information_revisions").select("*").in("information_item_id", itemIds).order("revision_number", { ascending: false }) : Promise.resolve({ data: [], error: null })
    ]);
    [valuesR, proposalsR, revisionsR].forEach((r) => dbError(r.error));
    state.profileValues = valuesR.data || []; state.proposals = proposalsR.data || []; state.officeRevisions = revisionsR.data || [];
    renderProfile(); renderCalls(); renderOfficeInfo(); updateCounts();
    $("newCallBtn").hidden = !state.permissions.canCreateCall;
    $("newOfficeInfoBtn").hidden = !state.permissions.canManageOfficeInfo;
  }

  function updateCounts() {
    const profileIds = new Set(filteredProfiles().map((p) => p.id));
    $("profileCount").textContent = String(state.profileValues.filter((v) => profileIds.has(v.profile_id)).length);
    $("callCount").textContent = String(filteredCalls().length);
    $("officeCount").textContent = String(filteredOfficeItems().filter((x) => x.status !== "office_info_withdrawn" || state.permissions?.officeRole).length);
  }

  function filteredProfiles() {
    return state.profiles.filter((p) => !state.selectedFacilityId || p.port_facility_id === state.selectedFacilityId);
  }

  function profileScopeLabel(profile) {
    if (!profile) return "Port-wide";
    const directoryFacility = state.facilities.find((f) => f.port_facility_id === profile.port_facility_id);
    return [facilityName(directoryFacility) || profile.terminal_name || "Port-wide", profile.berth_name].filter(Boolean).join(" / ");
  }

  function renderProfile() {
    const profiles = filteredProfiles();
    const scopes = [{ id: "", label: state.selectedFacilityId ? "All berths" : "All scopes" }, ...profiles.map((p) => ({ id: p.id, label: profileScopeLabel(p) }))];
    $("profileScope").innerHTML = scopes.map((s, i) => `<button type="button" class="pci-chip${i === 0 ? " is-active" : ""}" data-profile-scope="${attr(s.id)}">${esc(s.label)}</button>`).join("");
    $("profileScope").querySelectorAll("[data-profile-scope]").forEach((b) => b.addEventListener("click", () => {
      $("profileScope").querySelectorAll(".pci-chip").forEach((x) => x.classList.toggle("is-active", x === b));
      renderProfileValues(b.dataset.profileScope);
    }));
    renderProfileValues(""); renderProposals();
  }

  function renderProfileValues(scopeId = "") {
    const profileIds = new Set(filteredProfiles().map((p) => p.id));
    const values = state.profileValues.filter((v) => profileIds.has(v.profile_id) && (!scopeId || v.profile_id === scopeId));
    if (!values.length) { $("profileContent").innerHTML = '<div class="pci-empty">No approved consolidated information has been published for this scope yet. Finalised call evidence remains available under Call Reports.</div>'; return; }
    $("profileContent").innerHTML = values.map((v) => {
      const f = fieldById(v.field_definition_id), p = state.profiles.find((x) => x.id === v.profile_id), source = state.calls.find((x) => x.id === v.source_call_id);
      return `<article class="pci-info-card"><h3>${esc(f?.section_label || "Port information")}</h3><div class="pci-field-label">${esc(f?.field_label || "Controlled information")}${v.condition_label ? ` — ${esc(v.condition_label)}` : ""}</div><div class="pci-info-value">${esc(v.display_value || displayJson(v.value_jsonb))}${v.unit_key ? ` ${esc(v.unit_key)}` : ""}</div><div class="pci-source">${esc(profileScopeLabel(p))}${source ? ` • Source ${esc(source.call_reference)} / ${esc(source.vessel_name_snapshot)}` : " • Office-approved"} • Approved ${esc(isoDate(v.approved_at))}</div></article>`;
    }).join("");
  }

  function renderProposals() {
    const profileIds = new Set(filteredProfiles().map((p) => p.id));
    const pending = state.proposals.filter((p) => profileIds.has(p.profile_id));
    $("conflictBanner").hidden = pending.length === 0;
    $("conflictBanner").textContent = pending.length ? `${pending.length} new or conflicting report item${pending.length === 1 ? " is" : "s are"} awaiting office review. The approved profile remains in force.` : "";
    $("proposalPanel").hidden = !pending.length || !state.permissions.canReview;
    $("proposalList").innerHTML = pending.map((p) => {
      const f = fieldById(p.field_definition_id), existing = state.profileValues.find((v) => v.id === p.existing_profile_value_id), call = state.calls.find((c) => c.id === p.source_call_id);
      return `<article class="pci-info-card"><h3>${esc(f?.section_label || "Profile difference")}</h3><div class="pci-field-label">${esc(f?.field_label || "Controlled field")}</div><div><strong>Approved:</strong> ${esc(existing?.display_value || (existing ? displayJson(existing.value_jsonb) : "No approved value"))}</div><div><strong>Reported:</strong> ${esc(p.proposed_display_value || displayJson(p.proposed_value_jsonb))}</div><div class="pci-source">${call ? `${esc(call.vessel_name_snapshot)} • ${esc(call.call_reference)}` : "Source call"}</div><div class="pci-office-actions">${button("Review difference", "btn", "Review the approved and newly reported values and record an office decision.", "decide-proposal")}</div></article>`;
    }).join("");
    $("proposalList").querySelectorAll("[data-action='decide-proposal']").forEach((b, i) => b.dataset.id = pending[i].id); bindActionRoot($("proposalList"));
  }

  function displayJson(value) {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(displayJson).join(", ");
    return Object.entries(value).map(([k, v]) => `${k.replaceAll("_", " ")}: ${displayJson(v)}`).join("; ");
  }

  function filteredCalls() {
    const status = $("callStatusFilter").value, term = clean($("callSearch").value).toLowerCase();
    const profileIds = new Set(filteredProfiles().map((p) => p.id));
    return state.calls.filter((c) => (!state.selectedFacilityId || profileIds.has(c.profile_id)) && (!status || c.status === status) && (!term || [c.call_reference, c.vessel_name_snapshot, c.terminal_name_snapshot, c.berth_name_snapshot].some((v) => String(v || "").toLowerCase().includes(term))));
  }

  function renderCalls() {
    const calls = filteredCalls();
    $("callList").innerHTML = calls.length ? calls.map((c) => `<button type="button" class="pci-list-item${c.id === state.selectedCallId ? " is-selected" : ""}" data-action="open-call" data-id="${attr(c.id)}" data-pci-tip="Open this vessel call as a separate report."><div class="pci-list-title"><span>${esc(c.vessel_name_snapshot)}</span>${statusPill(c.status)}</div><div class="pci-list-sub">${esc(c.call_reference)} • ${esc(c.terminal_name_snapshot)} / ${esc(c.berth_name_snapshot)}</div><div class="pci-list-sub">${c.report_origin === "office" ? "Office-entered • " : ""}All Lines Fast: ${esc(c.all_lines_fast_utc ? isoDate(c.all_lines_fast_utc) : "not entered")}</div></button>`).join("") : '<div class="pci-empty">No visible call reports match these filters.</div>';
    bindActionRoot($("callList"));
  }

  async function loadCallDetails(callId, force = false) {
    if (!force && state.callDetails.has(callId)) return state.callDetails.get(callId);
    const [valuesR, repeatRowsR, repeatValuesR, sectionsR, hazardsR, attachmentsR, amendmentsR] = await Promise.all([
      state.sb.from("pci_call_values").select("*").eq("call_id", callId).order("created_at"),
      state.sb.from("pci_call_repeat_rows").select("*").eq("call_id", callId).order("group_key").order("row_number"),
      state.sb.from("pci_call_repeat_values").select("*").eq("call_id", callId).order("created_at"),
      state.sb.from("pci_call_section_confirmations").select("*").eq("call_id", callId).order("section_key"),
      state.sb.from("pci_call_hazards").select("*").eq("call_id", callId).order("created_at"),
      state.sb.from("pci_call_attachments").select("*").eq("call_id", callId).order("uploaded_at"),
      state.sb.from("pci_call_amendments").select("*").eq("call_id", callId).order("requested_at", { ascending: false })
    ]);
    [valuesR, repeatRowsR, repeatValuesR, sectionsR, hazardsR, attachmentsR, amendmentsR].forEach((r) => dbError(r.error));
    const detail = { values: valuesR.data || [], repeatRows: repeatRowsR.data || [], repeatValues: repeatValuesR.data || [], sections: sectionsR.data || [], hazards: hazardsR.data || [], attachments: attachmentsR.data || [], amendments: amendmentsR.data || [] };
    state.callDetails.set(callId, detail); return detail;
  }

  async function openCall(callId) {
    state.selectedCallId = callId; renderCalls();
    $("callDetail").innerHTML = '<div class="pci-empty">Loading call report…</div>';
    await task("Loading call report…", async () => {
      const call = state.calls.find((c) => c.id === callId); if (!call) return;
      const detail = await loadCallDetails(callId); renderCallDetail(call, detail);
    });
  }

  function canAuthorEdit(call) {
    if (call.created_by !== state.permissions.userId || !["draft", "submitted"].includes(call.status)) return false;
    if (call.report_origin === "office") return state.permissions.canCreateOfficeCall;
    return state.permissions.canCreateVesselCall && call.vessel_id === state.permissions.vesselId;
  }
  function callActions(call) {
    const out = [];
    if (canAuthorEdit(call) && call.status === "draft") {
      out.push(button("Edit Draft", "btn", "Edit and save this Draft report.", "edit-call"));
      out.push(button("Submit", "btn", "Validate the core fields and all section confirmations, then submit this report to the office.", "submit-call"));
      out.push(button("Delete Draft", "pci-danger", "Permanently delete this Draft report after confirmation. Finalised reports cannot be deleted.", "delete-call"));
    } else if (canAuthorEdit(call) && call.status === "submitted" && !call.review_started_at) {
      out.push(button("Return to Draft", "btn2", "Withdraw this unreviewed submission back to Draft for further editing.", "retract-call"));
    }
    if (state.permissions.canReview && call.status === "submitted") {
      out.push(button("Start Review", "btn", "Mark this submitted report as under office review.", "start-review"));
      if (!canAuthorEdit(call)) out.push(button("Return", "btn2", "Return this report to its author with a required reason.", "return-call"));
    }
    if (state.permissions.canReview && call.status === "under_review") {
      out.push(button("Return", "btn2", "Return this report to its author with a required reason.", "return-call"));
      out.push(button("Finalise", "btn", "Lock this report as permanent call evidence and generate profile differences for review.", "finalise-call"));
    }
    if (call.status === "finalised" && (state.permissions.canReview || (state.permissions.canCreateVesselCall && call.vessel_id === state.permissions.vesselId))) {
      out.push(button("Request Amendment", "btn2", "Create a controlled amendment request without altering the finalised evidence.", "request-amendment"));
    }
    return out.map((html) => html.replace('data-action="', `data-id="${attr(call.id)}" data-action="`)).join("");
  }

  function renderCallDetail(call, detail) {
    const grouped = new Map();
    detail.values.forEach((v) => {
      const f = fieldById(v.field_definition_id); if (!f) return;
      if (!grouped.has(f.section_label)) grouped.set(f.section_label, []); grouped.get(f.section_label).push({ f, v });
    });
    detail.repeatRows.forEach((row) => {
      const values = detail.repeatValues.filter((v) => v.repeat_row_id === row.id).map((v) => ({ f: fieldById(v.field_definition_id), v })).filter((x) => x.f);
      const label = values[0]?.f?.section_label || row.group_key.replaceAll("_", " ");
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label).push({ repeat: row, values });
    });
    const sectionsHtml = [...grouped.entries()].map(([section, items]) => `<section class="pci-section"><h3>${esc(section)}</h3>${items.map((item) => item.repeat ? `<div class="pci-field-row"><div class="pci-field-label">${esc(item.repeat.row_label || `${item.repeat.group_key} ${item.repeat.row_number}`)}</div><div class="pci-field-value">${item.values.map((x) => `<div><strong>${esc(x.f.field_label)}:</strong> ${esc(x.v.display_value || displayJson(x.v.value_jsonb))}</div>`).join("")}</div></div>` : `<div class="pci-field-row"><div class="pci-field-label">${esc(item.f.field_label)}</div><div class="pci-field-value">${esc(item.v.display_value || displayJson(item.v.value_jsonb))}${item.v.unit_key ? ` ${esc(item.v.unit_key)}` : ""}</div></div>`).join("")}</section>`).join("");
    const hazardHtml = detail.hazards.length ? `<section class="pci-section"><h3>Hazards, precautions and lessons learned</h3>${detail.hazards.map((h) => `<div class="pci-hazard"><strong>${esc(h.category_label)}</strong><div>${esc(h.hazard_narrative)}</div><div><em>Precautions / lessons:</em> ${esc(h.precautions_lessons)}</div></div>`).join("")}</section>` : "";
    const attachmentHtml = detail.attachments.length ? `<section class="pci-section"><h3>Attachments</h3>${detail.attachments.map((a) => `<div class="pci-attachment"><div><strong>${esc(a.original_file_name)}</strong><div class="pci-source">${esc(a.category_key)} • ${bytes(a.size_bytes)}${a.description ? ` • ${esc(a.description)}` : ""}</div></div><div>${button("Download", "btn2", "Create a short-lived secure link and download this attachment.", "download-attachment").replace('data-action="', `data-id="${attr(a.id)}" data-action="`)}</div></div>`).join("")}</section>` : "";
    const amendmentHtml = detail.amendments.length ? `<section class="pci-section"><h3>Controlled amendments</h3>${detail.amendments.map((a) => `<div class="pci-field-row"><div>${statusPill(a.status)}</div><div><strong>${esc(a.request_origin)} request:</strong> ${esc(a.reason)}<div class="pci-source">${esc(isoDate(a.requested_at))}</div></div></div>`).join("")}</section>` : "";
    $("callDetail").innerHTML = `<header class="pci-detail-head"><div><div class="pci-kicker">${esc(call.call_reference)}</div><h2>${esc(call.vessel_name_snapshot)} — ${esc(call.port_name_snapshot)}</h2><div>${statusPill(call.status)}</div></div><div class="pci-actions">${callActions(call)}</div></header>
      <div class="pci-summary-grid"><div class="pci-summary-cell"><span>Report source</span>${call.report_origin === "office" ? "Office-entered on behalf of vessel" : "Vessel Master"}</div><div class="pci-summary-cell"><span>Terminal / Berth</span>${esc(call.terminal_name_snapshot)} / ${esc(call.berth_name_snapshot)}</div><div class="pci-summary-cell"><span>All Lines Fast</span>${esc(localDate(call.all_lines_fast_local))} (UTC ${formatOffset(call.all_lines_fast_utc_offset_minutes)})</div><div class="pci-summary-cell"><span>All Lines Clear</span>${esc(localDate(call.all_lines_clear_local))} (UTC ${formatOffset(call.all_lines_clear_utc_offset_minutes)})</div><div class="pci-summary-cell"><span>Cargo operation</span>${esc(call.cargo_operation_type || "—")}</div></div>
      ${call.return_reason ? `<div class="pci-conflict"><strong>Returned for correction:</strong> ${esc(call.return_reason)}</div>` : ""}
      ${coreCallDetail(call)}${sectionsHtml || '<div class="pci-empty">No detailed values have been entered for this call.</div>'}${hazardHtml}${attachmentHtml}${amendmentHtml}`;
    bindActionRoot($("callDetail"));
  }

  function coreCallDetail(call) {
    const rows = [
      ["Port entry", `${localDate(call.port_entry_local)} (UTC ${formatOffset(call.port_entry_utc_offset_minutes)})`],
      ["Arrival draught F / A", `${call.arrival_draught_forward ?? "—"} / ${call.arrival_draught_aft ?? "—"} m`],
      ["Controlling depth", call.controlling_depth == null ? "—" : `${call.controlling_depth} m`],
      ["Tide height at entry", call.tide_height_at_entry == null ? "—" : `${call.tide_height_at_entry} m`],
      ["UKC method / result", `${call.ukc_method || "—"} / ${call.ukc_result ?? "—"} m`], ["UKC notes", call.ukc_notes || "—"]
    ];
    return `<section class="pci-section"><h3>Core call information</h3>${rows.map(([k, v]) => `<div class="pci-field-row"><div class="pci-field-label">${esc(k)}</div><div class="pci-field-value">${esc(v)}</div></div>`).join("")}</section>`;
  }

  function formatOffset(minutes) {
    if (minutes === null || minutes === undefined || minutes === "") return "—";
    const n = Number(minutes), sign = n >= 0 ? "+" : "-", abs = Math.abs(n);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  }

  function offsetOptions(selected) {
    let html = '<option value="">Select UTC offset…</option>';
    for (let n = -840; n <= 840; n += 15) html += `<option value="${n}"${Number(selected) === n ? " selected" : ""}>UTC ${formatOffset(n)}</option>`;
    return html;
  }

  function formValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function inputField({ id, label, type = "text", value = "", required = false, wide = false, help = "", step = "any", options = null, rows = 3 }) {
    const labelHtml = `${esc(label)}${required ? ' <span class="pci-required">*</span>' : ""}`;
    let control;
    if (options) control = `<select id="${attr(id)}"${required ? " required" : ""}>${options}</select>`;
    else if (type === "textarea") control = `<textarea id="${attr(id)}" rows="${rows}"${required ? " required" : ""}>${esc(value)}</textarea>`;
    else if (type === "checkbox") control = `<label class="pci-check"><input id="${attr(id)}" type="checkbox"${value ? " checked" : ""} /> <span>${esc(help || label)}</span></label>`;
    else control = `<input id="${attr(id)}" type="${attr(type)}" value="${attr(value)}"${type === "number" ? ` step="${attr(step)}"` : ""}${required ? " required" : ""} />`;
    return `<div class="pci-form-field${wide ? " is-wide" : ""}">${type === "checkbox" ? "" : `<label for="${attr(id)}">${labelHtml}</label>`}${control}${help && type !== "checkbox" ? `<div class="pci-help">${esc(help)}</div>` : ""}</div>`;
  }

  function dynamicInput(f, current, prefix = "pciField") {
    const id = `${prefix}_${f.id}`, value = current?.value_jsonb ?? "", required = f.requirement_rule === "core";
    const optionRows = state.options.filter((o) => o.field_definition_id === f.id);
    let control;
    if (optionRows.length) {
      control = `<select id="${attr(id)}" data-pci-field-id="${attr(f.id)}" data-value-type="${attr(f.value_type)}"><option value="">Select…</option>${optionRows.map((o) => `<option value="${attr(o.option_key)}"${String(value) === String(o.option_key) ? " selected" : ""}>${esc(o.option_label)}</option>`).join("")}</select>`;
    } else if (f.value_type === "boolean") {
      control = `<select id="${attr(id)}" data-pci-field-id="${attr(f.id)}" data-value-type="boolean"><option value="">Select…</option><option value="true"${value === true ? " selected" : ""}>Yes</option><option value="false"${value === false ? " selected" : ""}>No</option></select>`;
    } else {
      const type = f.value_type === "number" ? "number" : f.value_type === "date" ? "date" : f.value_type === "time" ? "time" : f.value_type === "local_datetime" ? "datetime-local" : "text";
      const long = type === "text" && /narrative|remarks|description|details|comment|lessons|precautions|explain|specify|text area/i.test(`${f.control_type} ${f.field_label}`);
      control = long ? `<textarea id="${attr(id)}" rows="3" data-pci-field-id="${attr(f.id)}" data-value-type="${attr(f.value_type)}">${esc(formValue(value))}</textarea>` : `<input id="${attr(id)}" type="${type}"${type === "number" ? ' step="any"' : ""} value="${attr(formValue(value))}" data-pci-field-id="${attr(f.id)}" data-value-type="${attr(f.value_type)}" />`;
    }
    return `<div class="pci-form-field${/narrative|remarks|description|details|comment|lessons|precautions/i.test(`${f.control_type} ${f.field_label}`) ? " is-wide" : ""}"><label for="${attr(id)}">${esc(f.field_label)}${required ? ' <span class="pci-required">*</span>' : ""}</label>${control}<div class="pci-help">${esc([f.unit_format, f.condition_notes].filter(Boolean).join(" • "))}</div></div>`;
  }

  async function openCallEditor(call = null) {
    if (!state.selectedPortId) return showMessage("warn", "Select a port before creating a report.");
    if (!state.facilities.length) return showMessage("warn", "No terminal is registered for this port. Use Add Terminal before creating the report.");
    const officeAuthored = call ? call.report_origin === "office" : state.permissions.canCreateOfficeCall;
    if (!call && officeAuthored && !state.vessels.length) return showMessage("warn", "No active Company vessel is available for this office-entered call report.");
    const detail = call ? await task("Opening Draft…", () => loadCallDetails(call.id, true)) : { values: [], repeatRows: [], repeatValues: [], sections: [], hazards: [], attachments: [] };
    const valueMap = new Map(detail.values.map((v) => [v.field_definition_id, v]));
    const fields = state.fields.filter((f) => f.storage_target === "call_value");
    const sections = new Map(); fields.forEach((f) => { if (!sections.has(f.section_label)) sections.set(f.section_label, []); sections.get(f.section_label).push(f); });
    const callProfile = call ? state.profiles.find((p) => p.id === call.profile_id) : null;
    const selectedTerminalId = callProfile?.port_facility_id || state.selectedFacilityId || "";
    const terminalOptions = '<option value="">Select a terminal…</option>' + visibleFacilities().map((f) => `<option value="${attr(f.port_facility_id)}"${f.port_facility_id === selectedTerminalId ? " selected" : ""}>${esc(facilityName(f))}${f.company_id ? " — Company entry" : ""}</option>`).join("");
    const selectedVesselId = call?.vessel_id || "";
    const vesselOptions = '<option value="">Select the vessel that made the call…</option>' + state.vessels.map((vessel) => `<option value="${attr(vessel.vessel_id)}"${vessel.vessel_id === selectedVesselId ? " selected" : ""}>${esc(vessel.vessel_name)}${vessel.imo_number ? ` — IMO ${esc(vessel.imo_number)}` : ""}</option>`).join("");
    const vesselField = officeAuthored ? `<div class="pci-form-field"><label for="pciVessel">Vessel <span class="pci-required">*</span></label><select id="pciVessel" required${call ? " disabled" : ""}>${vesselOptions}</select><div class="pci-help">The office is entering this report on behalf of the selected Company vessel. This association cannot be changed after the Draft is created.</div></div>` : "";
    const core = `<section class="pci-form-section"><h3>Core call details</h3><div class="pci-form-grid">
      ${vesselField}
      ${inputField({ id: "pciTerminal", label: "Terminal", required: true, options: terminalOptions, help: "If the terminal is missing, close this panel and use Add Terminal beside the main terminal selector." })}
      ${inputField({ id: "pciBerth", label: "Berth", value: call?.berth_name_snapshot || "", required: true })}
      ${inputField({ id: "pciALF", label: "Arrival — All Lines Fast (local)", type: "datetime-local", value: call?.all_lines_fast_local || "", required: true })}
      ${inputField({ id: "pciALFOffset", label: "All Lines Fast UTC offset", required: true, options: offsetOptions(call?.all_lines_fast_utc_offset_minutes) })}
      ${inputField({ id: "pciALC", label: "Departure — All Lines Clear (local)", type: "datetime-local", value: call?.all_lines_clear_local || "", required: true })}
      ${inputField({ id: "pciALCOffset", label: "All Lines Clear UTC offset", required: true, options: offsetOptions(call?.all_lines_clear_utc_offset_minutes) })}
      ${inputField({ id: "pciEntry", label: "Port entry time used for UKC (local)", type: "datetime-local", value: call?.port_entry_local || "", required: true })}
      ${inputField({ id: "pciEntryOffset", label: "Port entry UTC offset", required: true, options: offsetOptions(call?.port_entry_utc_offset_minutes) })}
      ${inputField({ id: "pciDraftF", label: "Arrival draught forward (m)", type: "number", value: call?.arrival_draught_forward ?? "", required: true })}
      ${inputField({ id: "pciDraftA", label: "Arrival draught aft (m)", type: "number", value: call?.arrival_draught_aft ?? "", required: true })}
      ${inputField({ id: "pciDepth", label: "Controlling depth (m)", type: "number", value: call?.controlling_depth ?? "" })}
      ${inputField({ id: "pciTide", label: "Tide height at entry (m)", type: "number", value: call?.tide_height_at_entry ?? "" })}
      ${inputField({ id: "pciUkcMethod", label: "UKC method", value: call?.ukc_method || "" })}
      ${inputField({ id: "pciUkcResult", label: "UKC result (m)", type: "number", value: call?.ukc_result ?? "" })}
      ${inputField({ id: "pciUkcNotes", label: "UKC notes", type: "textarea", value: call?.ukc_notes || "", wide: true })}
      ${inputField({ id: "pciCargo", label: "Cargo-operation type", value: call?.cargo_operation_type || "", required: true })}
      ${inputField({ id: "pciMasterConfirm", label: officeAuthored ? "Office completion confirmation" : "Master completion confirmation", type: "checkbox", value: call?.master_completion_confirmed === true, wide: true, help: officeAuthored ? "I confirm that the Office has entered this report on behalf of the selected vessel and reviewed it for completeness." : "I confirm that this report reflects the vessel's actual call experience and has been reviewed for completeness." })}
    </div></section>`;
    const dynamic = [...sections.entries()].map(([label, list]) => `<section class="pci-form-section"><h3>${esc(label)}</h3><div class="pci-form-grid">${list.map((f) => dynamicInput(f, valueMap.get(f.id))).join("")}</div></section>`).join("");
    const repeats = renderRepeatEditor(detail);
    const confirmations = renderSectionConfirmationEditor(detail);
    const hazards = renderHazardEditor(detail);
    const attachments = call ? renderAttachmentEditor(call, detail) : '<section class="pci-form-section"><h3>Attachments</h3><div class="pci-repeat-note">Save the Draft first, then reopen it to upload attachments securely.</div></section>';
    openDrawer(officeAuthored ? "Office-entered vessel call report" : "Vessel call report", call ? `Edit ${call.call_reference}` : `New Draft — ${selectedPort()?.port_name || "Port"}`, `<form id="pciCallForm" class="pci-form" novalidate>${core}${dynamic}${repeats}${confirmations}${hazards}${attachments}</form>`, `<button id="cancelCallBtn" class="btn2" type="button" data-pci-tip="Close without saving unsaved changes.">Cancel</button><button id="saveCallBtn" class="btn" type="button" data-pci-tip="Save all entered information as a Draft. You can continue later.">Save Draft</button>`);
    $("cancelCallBtn").onclick = closeDrawer; $("saveCallBtn").onclick = () => saveCallEditor(call);
    installRepeatAndHazardControls(); if (call) installUploadControl(call, detail);
  }

  function renderRepeatEditor(detail) {
    const repeatFields = state.fields.filter((f) => f.storage_target === "repeat_value" && f.repeating_group_key);
    const groups = [...new Set(repeatFields.map((f) => f.repeating_group_key))];
    if (!groups.length) return "";
    return groups.map((group) => {
      const defs = repeatFields.filter((f) => f.repeating_group_key === group), rows = detail.repeatRows.filter((r) => r.group_key === group);
      return `<section class="pci-form-section pci-repeat-group" data-repeat-group="${attr(group)}"><h3>${esc(defs[0]?.section_label || group.replaceAll("_", " "))} — repeating entries</h3><div class="pci-repeat-rows">${rows.map((r) => repeatRowHtml(group, defs, r, detail.repeatValues.filter((v) => v.repeat_row_id === r.id))).join("")}</div><div class="pci-form-grid"><button type="button" class="btn2 pci-add-repeat" data-pci-tip="Add another entry to this repeating section.">+ Add entry</button></div></section>`;
    }).join("");
  }

  function repeatRowHtml(group, defs, row = null, values = []) {
    const map = new Map(values.map((v) => [v.field_definition_id, v]));
    return `<div class="pci-hazard-edit pci-repeat-row" data-original-row-id="${attr(row?.id || "")}"><div class="pci-form-grid">${inputField({ id: `rowLabel_${crypto.randomUUID()}`, label: "Entry label (optional)", value: row?.row_label || "", wide: true }).replace("<input", '<input data-repeat-row-label="1"')}${defs.map((f) => dynamicInput(f, map.get(f.id), `repeat_${group}`)).join("")}<div class="pci-form-field is-wide"><button type="button" class="pci-danger pci-remove-repeat" data-pci-tip="Delete this unsaved repeating entry from the Draft when you save.">Delete Entry</button></div></div></div>`;
  }

  function majorSections() {
    const map = new Map();
    state.fields.filter((f) => !["record_control", "section_completion"].includes(f.section_key)).forEach((f) => map.set(f.section_key, f.section_label));
    return [...map.entries()];
  }

  function renderSectionConfirmationEditor(detail) {
    const map = new Map(detail.sections.map((s) => [s.section_key, s]));
    return `<section class="pci-form-section"><h3>Section completion</h3><div class="pci-form-grid" style="display:block">${majorSections().map(([key, label]) => { const row = map.get(key); return `<div class="pci-section-confirm" data-section-key="${attr(key)}"><strong>${esc(label)}</strong><select data-section-status><option value="">Not reviewed</option><option value="completed"${row?.completion_status === "completed" ? " selected" : ""}>Completed</option><option value="not_available"${row?.completion_status === "not_available" ? " selected" : ""}>Not available</option><option value="not_applicable"${row?.completion_status === "not_applicable" ? " selected" : ""}>Not applicable</option></select><input data-section-remarks type="text" value="${attr(row?.remarks || "")}" placeholder="Remarks (required if not available)" /></div>`; }).join("")}</div></section>`;
  }

  function renderHazardEditor(detail) {
    return `<section class="pci-form-section"><h3>Hazards, precautions and lessons learned</h3><div id="pciHazardRows">${detail.hazards.map(hazardRowHtml).join("")}</div><div class="pci-form-grid"><button id="addHazardBtn" type="button" class="btn2" data-pci-tip="Add a practical hazard, precaution or lesson learned from this call.">+ Add Hazard</button></div></section>`;
  }

  function hazardRowHtml(h = {}) {
    return `<div class="pci-hazard-edit"><div class="pci-form-grid"><div class="pci-form-field"><label>Category</label><select data-hazard-category>${HAZARD_CATEGORIES.map(([k, l]) => `<option value="${k}"${h.category_key === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></div><div class="pci-form-field is-wide"><label>Hazard</label><textarea data-hazard-narrative rows="3">${esc(h.hazard_narrative || "")}</textarea></div><div class="pci-form-field is-wide"><label>Precautions / lessons learned</label><textarea data-hazard-precautions rows="3">${esc(h.precautions_lessons || "")}</textarea></div><div class="pci-form-field is-wide"><button type="button" class="pci-danger pci-remove-hazard" data-pci-tip="Delete this hazard entry from the Draft when you save.">Delete Hazard</button></div></div></div>`;
  }

  function renderAttachmentEditor(call, detail) {
    const total = detail.attachments.reduce((sum, a) => sum + Number(a.size_bytes || 0), 0);
    return `<section class="pci-form-section"><h3>Attachments — ${bytes(total)} of 100 MB</h3><div class="pci-form-grid"><div class="pci-form-field"><label>Category</label><input id="pciUploadCategory" value="supporting_evidence" /></div><div class="pci-form-field"><label>Description (optional)</label><input id="pciUploadDescription" /></div><div class="pci-form-field is-wide"><div class="pci-upload-drop"><input id="pciUploadFile" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /><div class="pci-help">JPG, PNG, WebP, PDF, DOCX or XLSX. Maximum 5 MB per file and 100 MB per call.</div><button id="pciUploadBtn" class="btn2" type="button" data-pci-tip="Upload the selected file to private storage and attach it to this Draft.">Upload Attachment</button><div id="pciUploadProgress" class="pci-progress" hidden><span style="width:0%"></span></div></div></div><div class="pci-form-field is-wide" id="pciAttachmentList">${detail.attachments.map((a) => `<div class="pci-attachment"><div><strong>${esc(a.original_file_name)}</strong><div class="pci-source">${esc(a.category_key)} • ${bytes(a.size_bytes)}</div></div>${button("Delete Attachment", "pci-danger", "Permanently delete this attachment from private Storage and this Draft after confirmation.", "delete-attachment").replace('data-action="', `data-id="${attr(a.id)}" data-action="`)}</div>`).join("") || '<div class="pci-help">No attachments uploaded.</div>'}</div></div></section>`;
  }

  function installRepeatAndHazardControls() {
    $("pciDrawer").querySelectorAll(".pci-add-repeat").forEach((b) => b.onclick = () => { const g = b.closest("[data-repeat-group]"), key = g.dataset.repeatGroup, defs = state.fields.filter((f) => f.storage_target === "repeat_value" && f.repeating_group_key === key); g.querySelector(".pci-repeat-rows").insertAdjacentHTML("beforeend", repeatRowHtml(key, defs)); installRepeatAndHazardControls(); });
    $("pciDrawer").querySelectorAll(".pci-remove-repeat").forEach((b) => b.onclick = () => b.closest(".pci-repeat-row").remove());
    if ($("addHazardBtn")) $("addHazardBtn").onclick = () => { $("pciHazardRows").insertAdjacentHTML("beforeend", hazardRowHtml()); installRepeatAndHazardControls(); };
    $("pciDrawer").querySelectorAll(".pci-remove-hazard").forEach((b) => b.onclick = () => b.closest(".pci-hazard-edit").remove());
  }

  function nullable(id) { const v = clean($(id)?.value); return v === "" ? null : v; }
  function nullableNumber(id) { const v = nullable(id); return v === null ? null : Number(v); }

  function validateCallForm() {
    const required = ["pciTerminal", "pciBerth", "pciALF", "pciALFOffset", "pciALC", "pciALCOffset", "pciEntry", "pciEntryOffset", "pciDraftF", "pciDraftA", "pciCargo"];
    if ($("pciVessel")) required.unshift("pciVessel");
    let first = null;
    required.forEach((id) => { const el = $(id), bad = !clean(el?.value); el?.classList.toggle("pci-form-error", bad); if (bad && !first) first = el; });
    if (nullable("pciALF") && nullable("pciALC")) {
      const bad = new Date(nullable("pciALC")) < new Date(nullable("pciALF")); $("pciALC").classList.toggle("pci-form-error", bad); if (bad && !first) first = $("pciALC");
    }
    if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); first.focus(); throw new Error("Complete the highlighted core fields before saving the Draft."); }
  }

  async function ensureProfile(facility, berth) {
    const terminal = facilityName(facility);
    const match = state.profiles.find((p) => p.port_facility_id === facility.port_facility_id && clean(p.berth_name).toLowerCase() === berth.toLowerCase());
    if (match) return match;
    let result = await state.sb.from("pci_port_profiles").insert({ company_id: state.permissions.companyId, port_id: state.selectedPortId, port_facility_id: facility.port_facility_id, terminal_name: terminal, berth_name: berth }).select("*").single();
    if (result.error?.code === "23505") result = await state.sb.from("pci_port_profiles").select("*").eq("port_id", state.selectedPortId).eq("port_facility_id", facility.port_facility_id).ilike("berth_name", berth).single();
    dbError(result.error, "Could not create the terminal/berth profile scope."); return result.data;
  }

  function callHeaderPayload(profile, existingCall = null) {
    const vesselId = existingCall?.vessel_id || (state.permissions.canCreateOfficeCall ? nullable("pciVessel") : state.permissions.vesselId);
    return {
      company_id: state.permissions.companyId, vessel_id: vesselId, port_id: state.selectedPortId, profile_id: profile.id,
      status: "draft", all_lines_fast_local: nullable("pciALF"), all_lines_fast_utc_offset_minutes: nullableNumber("pciALFOffset"),
      all_lines_clear_local: nullable("pciALC"), all_lines_clear_utc_offset_minutes: nullableNumber("pciALCOffset"),
      port_entry_local: nullable("pciEntry"), port_entry_utc_offset_minutes: nullableNumber("pciEntryOffset"),
      arrival_draught_forward: nullableNumber("pciDraftF"), arrival_draught_aft: nullableNumber("pciDraftA"),
      controlling_depth: nullableNumber("pciDepth"), tide_height_at_entry: nullableNumber("pciTide"), ukc_method: nullable("pciUkcMethod"),
      ukc_result: nullableNumber("pciUkcResult"), ukc_notes: nullable("pciUkcNotes"), cargo_operation_type: nullable("pciCargo"),
      master_completion_confirmed: $("pciMasterConfirm").checked === true
    };
  }

  function typedValue(el) {
    const raw = clean(el.value); if (raw === "") return null;
    if (el.dataset.valueType === "number") return Number(raw);
    if (el.dataset.valueType === "boolean") return raw === "true";
    return raw;
  }

  async function saveCallEditor(existingCall) {
    await task("Saving Draft…", async () => {
      validateCallForm();
      const facility = state.facilities.find((f) => f.port_facility_id === $("pciTerminal").value), berth = clean($("pciBerth").value);
      if (!facility) throw new Error("Select a valid terminal from the controlled list.");
      const profile = await ensureProfile(facility, berth);
      let call;
      if (existingCall) {
        const { data, error } = await state.sb.from("pci_port_calls").update(callHeaderPayload(profile, existingCall)).eq("id", existingCall.id).select("*").single(); dbError(error); call = data;
      } else {
        const { data, error } = await state.sb.from("pci_port_calls").insert(callHeaderPayload(profile)).select("*").single(); dbError(error); call = data;
      }
      await saveCallValues(call); await saveRepeatRows(call); await saveSectionConfirmations(call); await saveHazards(call);
      closeDrawer(); showMessage("ok", `${call.call_reference} was saved as a Draft.`);
      state.callDetails.delete(call.id); await loadSelectedPort(); switchTab("calls"); await openCall(call.id);
    });
  }

  async function saveCallValues(call) {
    const controls = [...$("pciCallForm").querySelectorAll("[data-pci-field-id]")].filter((el) => !el.closest(".pci-repeat-row"));
    const filled = controls.map((el) => ({ el, value: typedValue(el) })).filter((x) => x.value !== null);
    const records = filled.map(({ el, value }) => ({ company_id: call.company_id, call_id: call.id, field_definition_id: el.dataset.pciFieldId, value_jsonb: value, display_value: String(value), unit_key: null, created_by: state.permissions.userId }));
    if (records.length) { const { error } = await state.sb.from("pci_call_values").upsert(records, { onConflict: "call_id,field_definition_id" }); dbError(error); }
    const emptyIds = controls.filter((el) => typedValue(el) === null).map((el) => el.dataset.pciFieldId);
    if (emptyIds.length) { const { error } = await state.sb.from("pci_call_values").delete().eq("call_id", call.id).in("field_definition_id", emptyIds); dbError(error); }
  }

  async function saveRepeatRows(call) {
    const { error: deleteError } = await state.sb.from("pci_call_repeat_rows").delete().eq("call_id", call.id); dbError(deleteError);
    for (const group of $("pciCallForm").querySelectorAll("[data-repeat-group]")) {
      let rowNo = 0;
      for (const row of group.querySelectorAll(".pci-repeat-row")) {
        const entries = [...row.querySelectorAll("[data-pci-field-id]")].map((el) => ({ el, value: typedValue(el) })).filter((x) => x.value !== null);
        const label = clean(row.querySelector("[data-repeat-row-label]")?.value);
        if (!entries.length && !label) continue;
        rowNo += 1;
        const { data: savedRow, error } = await state.sb.from("pci_call_repeat_rows").insert({ company_id: call.company_id, call_id: call.id, group_key: group.dataset.repeatGroup, row_number: rowNo, row_label: label || null, created_by: state.permissions.userId }).select("*").single(); dbError(error);
        if (entries.length) {
          const records = entries.map(({ el, value }) => ({ company_id: call.company_id, call_id: call.id, repeat_row_id: savedRow.id, field_definition_id: el.dataset.pciFieldId, value_jsonb: value, display_value: String(value), unit_key: null, created_by: state.permissions.userId }));
          const { error: valuesError } = await state.sb.from("pci_call_repeat_values").insert(records); dbError(valuesError);
        }
      }
    }
  }

  async function saveSectionConfirmations(call) {
    const rows = [...$("pciCallForm").querySelectorAll("[data-section-key]")];
    const records = rows.filter((r) => clean(r.querySelector("[data-section-status]").value)).map((r) => ({ company_id: call.company_id, call_id: call.id, section_key: r.dataset.sectionKey, completion_status: r.querySelector("[data-section-status]").value, remarks: clean(r.querySelector("[data-section-remarks]").value) || null, confirmed_by: state.permissions.userId }));
    const invalid = records.find((r) => r.completion_status === "not_available" && !r.remarks); if (invalid) throw new Error("A remark is required for every section marked Not available.");
    if (records.length) { const { error } = await state.sb.from("pci_call_section_confirmations").upsert(records, { onConflict: "call_id,section_key" }); dbError(error); }
    const emptyKeys = rows.filter((r) => !clean(r.querySelector("[data-section-status]").value)).map((r) => r.dataset.sectionKey);
    if (emptyKeys.length) { const { error } = await state.sb.from("pci_call_section_confirmations").delete().eq("call_id", call.id).in("section_key", emptyKeys); dbError(error); }
  }

  async function saveHazards(call) {
    const { error: deleteError } = await state.sb.from("pci_call_hazards").delete().eq("call_id", call.id); dbError(deleteError);
    const records = [...$("pciCallForm").querySelectorAll("#pciHazardRows .pci-hazard-edit")].map((row) => {
      const key = row.querySelector("[data-hazard-category]").value, label = HAZARD_CATEGORIES.find(([k]) => k === key)?.[1] || key;
      return { company_id: call.company_id, call_id: call.id, category_key: key, category_label: label, hazard_narrative: clean(row.querySelector("[data-hazard-narrative]").value), precautions_lessons: clean(row.querySelector("[data-hazard-precautions]").value), created_by: state.permissions.userId };
    }).filter((r) => r.hazard_narrative || r.precautions_lessons);
    const invalid = records.find((r) => !r.hazard_narrative || !r.precautions_lessons); if (invalid) throw new Error("Each hazard entry requires both the hazard and the precautions / lessons learned.");
    if (records.length) { const { error } = await state.sb.from("pci_call_hazards").insert(records); dbError(error); }
  }

  function installUploadControl(call, detail) {
    bindActionRoot($("pciAttachmentList"));
    $("pciUploadBtn").onclick = () => uploadAttachment(call, detail);
  }

  async function uploadAttachment(call, detail) {
    const file = $("pciUploadFile").files?.[0]; if (!file) return showMessage("warn", "Choose a file before uploading.");
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    if (!allowed.includes(file.type)) return showMessage("warn", "This file type is not permitted. Use JPG, PNG, WebP, PDF, DOCX or XLSX.");
    if (file.size > MAX_FILE) return showMessage("warn", "The selected file is larger than the 5 MB per-file limit.");
    if (detail.attachments.reduce((s, a) => s + Number(a.size_bytes || 0), 0) + file.size > MAX_CALL) return showMessage("warn", "This upload would exceed the 100 MB combined limit for the call.");
    await task("Uploading attachment…", async () => {
      const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-140), path = `${call.company_id}/${call.id}/draft/${crypto.randomUUID()}/${safe}`;
      const progress = $("pciUploadProgress"); progress.hidden = false; progress.querySelector("span").style.width = "35%";
      const { error: storageError } = await state.sb.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type }); dbError(storageError, "The private attachment upload failed."); progress.querySelector("span").style.width = "75%";
      const { error: rowError } = await state.sb.from("pci_call_attachments").insert({ company_id: call.company_id, call_id: call.id, object_path: path, original_file_name: file.name, mime_type: file.type, size_bytes: file.size, category_key: clean($("pciUploadCategory").value) || "supporting_evidence", description: clean($("pciUploadDescription").value) || null, uploaded_by: state.permissions.userId });
      if (rowError) { await state.sb.storage.from(BUCKET).remove([path]); dbError(rowError); }
      progress.querySelector("span").style.width = "100%"; state.callDetails.delete(call.id); const fresh = await loadCallDetails(call.id, true); closeDrawer(); showMessage("ok", `${file.name} was uploaded securely.`); await openCallEditor(call); return fresh;
    });
  }

  async function downloadAttachment(id) {
    const call = state.calls.find((c) => c.id === state.selectedCallId), detail = call ? await loadCallDetails(call.id) : null, a = detail?.attachments.find((x) => x.id === id); if (!a) return;
    await task("Preparing secure download…", async () => { const { data, error } = await state.sb.storage.from(BUCKET).createSignedUrl(a.object_path, 60); dbError(error); window.location.href = data.signedUrl; });
  }

  async function confirmDeleteAttachment(id) {
    const call = state.calls.find((c) => c.id === state.selectedCallId), detail = call ? await loadCallDetails(call.id) : null, a = detail?.attachments.find((x) => x.id === id); if (!a) return;
    if (!await confirmAction({ title: "Delete Draft attachment?", message: `${a.original_file_name} will be permanently removed from private Storage and this Draft.`, label: "Delete Attachment" })) return;
    await task("Deleting attachment…", async () => { const { error: storageError } = await state.sb.storage.from(BUCKET).remove([a.object_path]); dbError(storageError); const { error } = await state.sb.from("pci_call_attachments").delete().eq("id", id); dbError(error); state.callDetails.delete(call.id); closeDrawer(); showMessage("ok", "The Draft attachment was deleted."); await openCall(call.id); });
  }

  async function submitCall(id) {
    const call = state.calls.find((c) => c.id === id), detail = await loadCallDetails(id, true); if (!call) return;
    const missing = majorSections().filter(([key]) => !detail.sections.some((s) => s.section_key === key));
    if (missing.length) return showMessage("warn", `Submission is blocked: ${missing.length} section${missing.length === 1 ? " has" : "s have"} not been confirmed. Edit the Draft and complete the Section completion area.`);
    if (!call.master_completion_confirmed) return showMessage("warn", `Submission is blocked until the ${call.report_origin === "office" ? "Office" : "Master"} completion confirmation is selected.`);
    if (!await confirmAction({ title: "Submit vessel-call report?", message: call.report_origin === "office" ? "This office-entered report will move to Submitted and can then enter the controlled office review workflow." : "The office will receive this report for review. You can return it to Draft only until office review begins.", label: "Submit Report", danger: false })) return;
    await changeCallStatus(id, "submitted", "Report submitted to the office.");
  }

  async function retractCall(id) {
    if (!await confirmAction({ title: "Return submission to Draft?", message: "The report has not entered office review. It will become editable again for your vessel.", label: "Return to Draft", danger: false })) return;
    await changeCallStatus(id, "draft", "The report was returned to Draft.");
  }

  async function changeCallStatus(id, status, success = "Call status updated.", extra = {}) {
    await task("Updating report status…", async () => {
      const { error } = await state.sb.from("pci_port_calls").update({ status, ...extra }).eq("id", id); dbError(error);
      state.callDetails.delete(id); await loadSelectedPort(); showMessage("ok", success); await openCall(id);
    });
  }

  function openReturnCall(id) {
    openDrawer("Office review", "Return report to the Master", `<form class="pci-form"><section class="pci-form-section"><h3>Required correction</h3><div class="pci-form-grid">${inputField({ id: "pciReturnReason", label: "Reason for return", type: "textarea", required: true, wide: true, help: "State exactly what the Master must correct or clarify." })}</div></section></form>`, `<button id="cancelReturnBtn" class="btn2" type="button">Cancel</button><button id="returnCallBtn" class="btn" type="button" data-pci-tip="Return the report to Draft and record this reason in its audit history.">Return to Master</button>`);
    $("cancelReturnBtn").onclick = closeDrawer; $("returnCallBtn").onclick = async () => { const reason = clean($("pciReturnReason").value); if (!reason) return $("pciReturnReason").classList.add("pci-form-error"); closeDrawer(); await changeCallStatus(id, "draft", "The report was returned to the Master for correction.", { return_reason: reason }); };
  }

  async function confirmFinaliseCall(id) {
    if (!await confirmAction({ title: "Finalise and lock report?", message: "This will make the vessel-call report read-only. Any later correction must use a controlled amendment. Profile differences will be created for separate office approval.", label: "Finalise Report", danger: false })) return;
    await changeCallStatus(id, "finalised", "The vessel-call report was finalised and locked.");
  }

  async function confirmDeleteCall(id) {
    const call = state.calls.find((c) => c.id === id), detail = call ? await loadCallDetails(id, true) : null; if (!call) return;
    if (!await confirmAction({ title: "Delete Draft report?", message: `${call.call_reference} and all of its Draft notes and attachments will be permanently deleted. This cannot be undone.`, label: "Delete Draft" })) return;
    await task("Deleting Draft report…", async () => {
      const paths = (detail?.attachments || []).map((a) => a.object_path);
      if (paths.length) { const { error } = await state.sb.storage.from(BUCKET).remove(paths); dbError(error, "Draft attachments could not be removed, so the report was not deleted."); const { error: rowsError } = await state.sb.from("pci_call_attachments").delete().eq("call_id", id); dbError(rowsError); }
      const { error } = await state.sb.from("pci_port_calls").delete().eq("id", id); dbError(error);
      state.selectedCallId = ""; state.callDetails.delete(id); $("callDetail").innerHTML = '<div class="pci-empty">Select a call report to read it.</div>'; await loadSelectedPort(); showMessage("ok", "The Draft report and its Draft attachments were deleted.");
    });
  }

  function openAmendmentRequest(id) {
    openDrawer("Controlled amendment", "Request an amendment", `<form class="pci-form"><section class="pci-form-section"><h3>Reason</h3><div class="pci-form-grid">${inputField({ id: "pciAmendmentReason", label: "Reason for amendment", type: "textarea", required: true, wide: true, help: "The finalised report will remain unchanged. The office must review and apply any controlled correction." })}</div></section></form>`, `<button id="cancelAmendmentBtn" class="btn2" type="button">Cancel</button><button id="submitAmendmentBtn" class="btn" type="button" data-pci-tip="Send this controlled amendment request to the office without changing the finalised report.">Submit Request</button>`);
    $("cancelAmendmentBtn").onclick = closeDrawer; $("submitAmendmentBtn").onclick = async () => { const reason = clean($("pciAmendmentReason").value); if (!reason) return $("pciAmendmentReason").classList.add("pci-form-error"); await task("Submitting amendment request…", async () => { const call = state.calls.find((c) => c.id === id); let r = await state.sb.from("pci_call_amendments").insert({ company_id: call.company_id, call_id: id, request_origin: state.permissions.officeRole ? "office" : "master", reason, status: "amendment_draft", requested_by: state.permissions.userId }).select("*").single(); dbError(r.error); if (!state.permissions.officeRole) { r = await state.sb.from("pci_call_amendments").update({ status: "amendment_submitted" }).eq("id", r.data.id); dbError(r.error); } closeDrawer(); state.callDetails.delete(id); showMessage("ok", state.permissions.officeRole ? "The controlled office amendment Draft was created." : "The controlled amendment request was submitted."); await openCall(id); }); };
  }

  function openProposalDecision(id) {
    const p = state.proposals.find((x) => x.id === id), f = p && fieldById(p.field_definition_id); if (!p) return;
    const options = '<option value="accepted">Accept as approved profile value</option><option value="kept_existing">Keep existing approved value</option><option value="condition_dependent">Keep both with a condition</option><option value="rejected">Reject reported value</option><option value="clarification_requested">Request clarification</option>';
    openDrawer("Profile governance", f?.field_label || "Review profile difference", `<form class="pci-form"><section class="pci-form-section"><h3>Reported difference</h3><div class="pci-form-grid"><div class="pci-form-field is-wide"><label>Newly reported value</label><div class="pci-info-card">${esc(p.proposed_display_value || displayJson(p.proposed_value_jsonb))}</div></div>${inputField({ id: "pciProposalDecision", label: "Office decision", required: true, options })}${inputField({ id: "pciProposalCondition", label: "Condition label (when keeping both)", value: p.proposed_condition_label || "" })}${inputField({ id: "pciProposalReason", label: "Decision reason", type: "textarea", required: true, wide: true })}</div></section></form>`, `<button id="cancelProposalBtn" class="btn2" type="button">Cancel</button><button id="saveProposalBtn" class="btn" type="button" data-pci-tip="Record the office decision, reviewer and date in the profile audit history.">Record Decision</button>`);
    $("cancelProposalBtn").onclick = closeDrawer; $("saveProposalBtn").onclick = async () => { const decision = $("pciProposalDecision").value, reason = clean($("pciProposalReason").value), condition = clean($("pciProposalCondition").value); if (!reason && decision !== "clarification_requested") return $("pciProposalReason").classList.add("pci-form-error"); if (decision === "condition_dependent" && !condition) return $("pciProposalCondition").classList.add("pci-form-error"); await task("Recording profile decision…", async () => { const { error } = await state.sb.rpc("pci_decide_profile_proposal", { p_proposal_id: id, p_decision: decision, p_reason: reason || "Clarification requested", p_condition_label: condition || null }); dbError(error); closeDrawer(); await loadSelectedPort(); showMessage("ok", "The profile decision was recorded with its source and reviewer."); }); };
  }

  function currentOfficeRevision(item) {
    const rows = state.officeRevisions.filter((r) => r.information_item_id === item.id);
    return rows.find((r) => r.revision_number === item.current_revision_number) || rows[0] || null;
  }

  function filteredOfficeItems() {
    if (!state.selectedFacilityId) return state.officeItems;
    const facility = selectedFacility(), name = facilityName(facility).toLowerCase();
    return state.officeItems.filter((i) => i.port_facility_id === state.selectedFacilityId || (!i.port_facility_id && clean(i.terminal_name).toLowerCase() === name));
  }

  function renderOfficeInfo() {
    const cat = $("officeCategoryFilter").value;
    const items = filteredOfficeItems().filter((i) => (!cat || i.category_key === cat) && (state.permissions.officeRole || i.status === "office_info_published"));
    $("officeList").innerHTML = items.length ? items.map((item) => {
      const rev = currentOfficeRevision(item), directoryFacility = state.facilities.find((f) => f.port_facility_id === item.port_facility_id), scope = [facilityName(directoryFacility) || item.terminal_name || "Port-wide", item.berth_name].filter(Boolean).join(" / ");
      const actions = [];
      if (state.permissions.canManageOfficeInfo && item.status === "office_info_draft") { actions.push(button("Edit Draft", "btn2", "Edit this unpublished office information Draft.", "edit-office"), button("Publish", "btn", "Publish the current revision to authorised Company users.", "publish-office"), button("Delete Draft", "pci-danger", "Permanently delete this unpublished office information Draft after confirmation.", "delete-office")); }
      if (state.permissions.canManageOfficeInfo && item.status === "office_info_published") { actions.push(button("Revise", "btn2", "Create a new controlled revision while preserving the published version history.", "revise-office"), button("Withdraw", "pci-danger", "Withdraw this published information with a required reason; retain its audit history.", "withdraw-office")); }
      return `<article class="pci-office-card"><div class="pci-office-top">${statusPill(item.status)}<span class="pci-source">${esc(OFFICE_LABELS[item.category_key] || item.category_key)}</span></div><h3>${esc(rev?.title || "Untitled Draft")}</h3><div class="pci-source">${esc(scope)}${rev?.effective_from ? ` • Effective ${esc(rev.effective_from)}` : ""}${rev?.effective_to ? ` to ${esc(rev.effective_to)}` : ""}</div><p>${esc(rev?.narrative || "No narrative saved.")}</p>${rev?.master_guidance ? `<div class="pci-hazard"><strong>For Masters</strong><div>${esc(rev.master_guidance)}</div></div>` : ""}${rev?.superintendent_guidance ? `<div class="pci-info-card"><strong>For Superintendents</strong><div>${esc(rev.superintendent_guidance)}</div></div>` : ""}${item.withdrawal_reason ? `<div class="pci-conflict"><strong>Withdrawn:</strong> ${esc(item.withdrawal_reason)}</div>` : ""}<div class="pci-source">Revision ${esc(rev?.revision_number || "—")} • Updated ${esc(isoDate(item.updated_at))}</div><div class="pci-office-actions">${actions.map((x) => x.replace('data-action="', `data-id="${attr(item.id)}" data-action="`)).join("")}</div></article>`;
    }).join("") : '<div class="pci-empty">No office information is available for this port and filter.</div>';
    bindActionRoot($("officeList"));
  }

  function officeFormHtml(item, revision, isRevision) {
    const categories = Object.entries(OFFICE_LABELS).map(([k, l]) => `<option value="${k}"${item?.category_key === k ? " selected" : ""}>${esc(l)}</option>`).join("");
    const selectedId = item?.port_facility_id || state.selectedFacilityId || "";
    const terminalOptions = '<option value="">Port-wide (no terminal)</option>' + visibleFacilities().map((f) => `<option value="${attr(f.port_facility_id)}"${f.port_facility_id === selectedId ? " selected" : ""}>${esc(facilityName(f))}${f.company_id ? " — Company entry" : ""}</option>`).join("");
    return `<form id="pciOfficeForm" class="pci-form"><section class="pci-form-section"><h3>${isRevision ? "New controlled revision" : "Information scope"}</h3><div class="pci-form-grid">
      ${inputField({ id: "pciOfficeCategory", label: "Category", required: true, options: categories })}
      ${inputField({ id: "pciOfficeTerminal", label: "Terminal (optional)", options: terminalOptions })}
      ${inputField({ id: "pciOfficeBerth", label: "Berth (requires terminal)", value: item?.berth_name || "" })}
      ${inputField({ id: "pciOfficeTitle", label: "Title", value: revision?.title || "", required: true, wide: true })}
      ${inputField({ id: "pciOfficeNarrative", label: "Information / incident / regulation", type: "textarea", value: revision?.narrative || "", required: true, wide: true, rows: 6 })}
      ${inputField({ id: "pciOfficeReference", label: "Reference", value: revision?.reference_text || "" })}
      ${inputField({ id: "pciOfficeUrl", label: "Reference URL", type: "url", value: revision?.reference_url || "" })}
      ${inputField({ id: "pciOfficeFrom", label: "Effective from", type: "date", value: revision?.effective_from || "" })}
      ${inputField({ id: "pciOfficeTo", label: "Effective to", type: "date", value: revision?.effective_to || "" })}
      ${inputField({ id: "pciOfficeMasterGuidance", label: "Specific guidance for Masters", type: "textarea", value: revision?.master_guidance || "", wide: true })}
      ${inputField({ id: "pciOfficeSupGuidance", label: "Specific guidance for Superintendents", type: "textarea", value: revision?.superintendent_guidance || "", wide: true })}
    </div></section></form>`;
  }

  function openOfficeEditor(id = "", isRevision = false) {
    if (!state.selectedPortId) return showMessage("warn", "Select a port before adding office information.");
    const item = id ? state.officeItems.find((x) => x.id === id) : null, current = item ? currentOfficeRevision(item) : null;
    const revision = isRevision && current ? { ...current, id: null, revision_number: null } : current;
    openDrawer("Office-authored port information", item ? (isRevision ? "Create controlled revision" : "Edit office information Draft") : `Add information — ${selectedPort()?.port_name || "Port"}`, officeFormHtml(item, revision, isRevision), `<button id="cancelOfficeBtn" class="btn2" type="button">Cancel</button><button id="saveOfficeDraftBtn" class="btn2" type="button" data-pci-tip="Save this information as an unpublished office Draft.">Save Draft</button><button id="savePublishOfficeBtn" class="btn" type="button" data-pci-tip="Save and publish this controlled information to authorised Company users.">Save &amp; Publish</button>`);
    if (isRevision) { $("pciOfficeCategory").disabled = true; $("pciOfficeTerminal").disabled = true; $("pciOfficeBerth").disabled = true; }
    $("cancelOfficeBtn").onclick = closeDrawer; $("saveOfficeDraftBtn").onclick = () => saveOfficeEditor(item, revision, isRevision, false); $("savePublishOfficeBtn").onclick = () => saveOfficeEditor(item, revision, isRevision, true);
  }

  function validateOfficeForm() {
    const required = ["pciOfficeTitle", "pciOfficeNarrative"], first = required.find((id) => !clean($(id).value));
    required.forEach((id) => $(id).classList.toggle("pci-form-error", !clean($(id).value)));
    if (first) { $(first).focus(); throw new Error("Enter both a title and the office information narrative."); }
    if (clean($("pciOfficeBerth").value) && !clean($("pciOfficeTerminal").value)) { $("pciOfficeTerminal").classList.add("pci-form-error"); throw new Error("A terminal is required when a berth is specified."); }
    if (nullable("pciOfficeFrom") && nullable("pciOfficeTo") && nullable("pciOfficeTo") < nullable("pciOfficeFrom")) { $("pciOfficeTo").classList.add("pci-form-error"); throw new Error("Effective to cannot be earlier than Effective from."); }
  }

  async function saveOfficeEditor(item, revision, isRevision, publish) {
    await task(publish ? "Publishing office information…" : "Saving office Draft…", async () => {
      validateOfficeForm(); let savedItem = item;
      const facilityId = clean($("pciOfficeTerminal").value) || null;
      const facility = facilityId ? state.facilities.find((f) => f.port_facility_id === facilityId) : null;
      if (facilityId && !facility) throw new Error("Select a valid terminal from the controlled list.");
      const terminalName = facility ? facilityName(facility) : "";
      if (!savedItem) {
        const { data, error } = await state.sb.from("pci_port_information_items").insert({ company_id: state.permissions.companyId, port_id: state.selectedPortId, profile_id: null, port_facility_id: facilityId, terminal_name: terminalName, berth_name: clean($("pciOfficeBerth").value), category_key: $("pciOfficeCategory").value, status: "office_info_draft", created_by: state.permissions.userId }).select("*").single(); dbError(error); savedItem = data;
      } else if (!isRevision && savedItem.status === "office_info_draft") {
        const { data, error } = await state.sb.from("pci_port_information_items").update({ port_facility_id: facilityId, terminal_name: terminalName, berth_name: clean($("pciOfficeBerth").value), category_key: $("pciOfficeCategory").value }).eq("id", savedItem.id).select("*").single(); dbError(error); savedItem = data;
      }
      const existingRows = state.officeRevisions.filter((r) => r.information_item_id === savedItem.id), nextNumber = existingRows.reduce((m, r) => Math.max(m, r.revision_number), 0) + 1;
      const revPayload = { company_id: savedItem.company_id, information_item_id: savedItem.id, revision_number: revision?.id ? revision.revision_number : nextNumber, title: clean($("pciOfficeTitle").value), narrative: clean($("pciOfficeNarrative").value), reference_text: nullable("pciOfficeReference"), reference_url: nullable("pciOfficeUrl"), effective_from: nullable("pciOfficeFrom"), effective_to: nullable("pciOfficeTo"), master_guidance: nullable("pciOfficeMasterGuidance"), superintendent_guidance: nullable("pciOfficeSupGuidance"), created_by: state.permissions.userId };
      let savedRevision;
      if (revision?.id && !revision.published_at) { const { data, error } = await state.sb.from("pci_port_information_revisions").update(revPayload).eq("id", revision.id).select("*").single(); dbError(error); savedRevision = data; }
      else { const { data, error } = await state.sb.from("pci_port_information_revisions").insert(revPayload).select("*").single(); dbError(error); savedRevision = data; }
      if (publish) await publishRevisionAndItem(savedItem, savedRevision);
      closeDrawer(); await loadSelectedPort(); switchTab("office"); showMessage("ok", publish ? "The office information was published with its controlled revision." : "The office information was saved as a Draft.");
    });
  }

  async function publishRevisionAndItem(item, revision) {
    let r = await state.sb.from("pci_port_information_revisions").update({ published_by: state.permissions.userId, published_at: new Date().toISOString() }).eq("id", revision.id); dbError(r.error);
    r = await state.sb.from("pci_port_information_items").update({ status: "office_info_published", current_revision_number: revision.revision_number }).eq("id", item.id); dbError(r.error);
  }

  async function publishOfficeInfo(id) {
    const item = state.officeItems.find((x) => x.id === id), revision = item && currentOfficeRevision(item); if (!item || !revision) return showMessage("warn", "This office Draft has no revision to publish.");
    if (!await confirmAction({ title: "Publish office information?", message: "This revision will become visible to authorised Company vessels and office personnel. It will be preserved in the audit history.", label: "Publish", danger: false })) return;
    await task("Publishing office information…", async () => { await publishRevisionAndItem(item, revision); await loadSelectedPort(); showMessage("ok", "The office information was published."); });
  }

  async function confirmDeleteOfficeInfo(id) {
    const item = state.officeItems.find((x) => x.id === id), rev = item && currentOfficeRevision(item); if (!item) return;
    if (!await confirmAction({ title: "Delete office Draft?", message: `The unpublished Draft “${rev?.title || "Untitled"}” will be permanently deleted. Published information cannot be deleted.`, label: "Delete Draft" })) return;
    await task("Deleting office Draft…", async () => { const { error } = await state.sb.from("pci_port_information_items").delete().eq("id", id); dbError(error); await loadSelectedPort(); showMessage("ok", "The unpublished office Draft was deleted."); });
  }

  function openWithdrawOfficeInfo(id) {
    const item = state.officeItems.find((x) => x.id === id), rev = item && currentOfficeRevision(item); if (!item) return;
    openDrawer("Office information lifecycle", `Withdraw “${rev?.title || "Office information"}”`, `<form class="pci-form"><section class="pci-form-section"><h3>Withdrawal record</h3><div class="pci-form-grid">${inputField({ id: "pciWithdrawalReason", label: "Reason for withdrawal", type: "textarea", required: true, wide: true, help: "The published item will no longer be current, but its content and audit history will be preserved." })}</div></section></form>`, `<button id="cancelWithdrawBtn" class="btn2" type="button">Cancel</button><button id="withdrawOfficeBtn" class="pci-danger" type="button" data-pci-tip="Withdraw this published item and preserve it with the reason in the audit history.">Withdraw Information</button>`);
    $("cancelWithdrawBtn").onclick = closeDrawer; $("withdrawOfficeBtn").onclick = async () => { const reason = clean($("pciWithdrawalReason").value); if (!reason) return $("pciWithdrawalReason").classList.add("pci-form-error"); await task("Withdrawing information…", async () => { const { error } = await state.sb.from("pci_port_information_items").update({ status: "office_info_withdrawn", withdrawal_reason: reason }).eq("id", id); dbError(error); closeDrawer(); await loadSelectedPort(); showMessage("ok", "The office information was withdrawn and retained in the audit history."); }); };
  }

  function switchTab(tab) {
    state.activeTab = tab; document.querySelectorAll(".pci-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
    document.querySelectorAll("[data-panel]").forEach((p) => p.hidden = p.dataset.panel !== tab);
  }

  function bindStaticEvents() {
    document.querySelectorAll(".pci-tab").forEach((b) => b.onclick = () => switchTab(b.dataset.tab));
    $("countrySelect").onchange = () => selectCountry($("countrySelect").value);
    $("portSelect").onchange = () => selectPort($("portSelect").value);
    $("terminalSelect").onchange = () => selectTerminal($("terminalSelect").value);
    $("addTerminalBtn").onclick = openAddTerminal; $("editTerminalBtn").onclick = openEditTerminal;
    $("reloadBtn").onclick = async () => task("Reloading…", async () => {
      const countryCode = state.selectedCountryCode, portId = state.selectedPortId;
      await Promise.all([loadCountries(), loadCompanyVessels()]);
      if (countryCode && state.countries.some((country) => country.country_code === countryCode)) {
        state.selectedCountryCode = countryCode; await loadPortsForCountry(countryCode);
      }
      if (portId && state.ports.some((port) => port.port_id === portId)) {
        state.selectedPortId = portId; await loadFacilities(portId); await loadSelectedPort();
      }
      showMessage("ok", "Port Call Intelligence was reloaded.");
    });
    $("newCallBtn").onclick = () => openCallEditor(); $("newOfficeInfoBtn").onclick = () => openOfficeEditor();
    $("callStatusFilter").onchange = renderCalls; $("callSearch").oninput = renderCalls; $("officeCategoryFilter").onchange = renderOfficeInfo;
    $("closeDrawerBtn").onclick = closeDrawer; $("pciDrawerBackdrop").onclick = closeDrawer;
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("confirmDialog").hidden) $("confirmCancelBtn").click(); else if (event.key === "Escape" && !$("pciDrawer").hidden) closeDrawer(); });
  }

  async function init() {
    window.PCI_UI_BUILD = BUILD; installTooltips(); bindStaticEvents();
    const bundle = await window.AUTH.requireAuth(); if (!bundle) return;
    state.bundle = bundle; state.sb = window.AUTH.ensureSupabase(); window.AUTH.fillUserBadge(bundle);
    await window.AUTH.setupAuthButtons(); state.permissions = await window.PCI_PERMISSIONS.load(bundle);
    if (!state.permissions.canView) throw new Error("Your current Rights Matrix permissions do not allow Port Call Intelligence viewing.");
    await task("Loading Port Call Intelligence…", async () => { await Promise.all([loadDefinitions(), loadCountries(), loadCompanyVessels()]); });
    $("newCallBtn").hidden = !state.permissions.canCreateCall; $("newOfficeInfoBtn").hidden = !state.permissions.canManageOfficeInfo;
    updateTerminalActions();
    if (state.permissions.platform && !state.permissions.companyContextReady) showMessage("warn", "Platform view is read-only until you select a Company context from the dashboard. Company office information and Company terminal changes are disabled.");
    if (!state.countries.length) showMessage("warn", "No countries or ports are available to this Company and user.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init().catch((e) => showMessage("warn", e?.message || String(e))));
  else init().catch((e) => showMessage("warn", e?.message || String(e)));
})();
