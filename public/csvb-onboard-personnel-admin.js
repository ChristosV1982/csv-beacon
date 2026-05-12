/* public/csvb-onboard-personnel-admin.js */
/* C.S.V. BEACON – Onboard Personnel / Rank-Based User Creation Extension */
/* U-02: non-destructive transition from fixed vessel-user positions to onboard personnel ranks. */

(() => {
  "use strict";

  const BUILD = "CSVBEACON-ONBOARD-PERSONNEL-U02B-20260512-1";

  const stateLocal = {
    sb: null,
    ranks: [],
    companies: [],
    vessels: [],
    installed: false
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

  function slug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function showOkSafe(message) {
    if (typeof showOk === "function") showOk(message);
    else alert(message);
  }

  function showWarnSafe(message) {
    if (typeof showWarn === "function") showWarn(message);
    else alert(message);
  }

  function clearMessagesSafe() {
    if (typeof clearWarn === "function") clearWarn();
    if (typeof clearOk === "function") clearOk();
  }

  function companyId() {
    return $("cu_company")?.value || "";
  }

  function vesselId() {
    return $("cu_vessel")?.value || "";
  }

  async function loadCompaniesAndVesselsForUsersTab() {
    const sb = stateLocal.sb || window.AUTH.ensureSupabase();
    stateLocal.sb = sb;

    // Try existing Superuser Administration loaders first, if available.
    if (typeof ensureCompaniesLoaded === "function") {
      try {
        await ensureCompaniesLoaded();
      } catch (_) {}
    }

    const globalCompanies = Array.isArray(window.state?.companies)
      ? window.state.companies
      : (typeof state !== "undefined" && Array.isArray(state.companies) ? state.companies : []);

    const globalVessels = Array.isArray(window.state?.vessels)
      ? window.state.vessels
      : (typeof state !== "undefined" && Array.isArray(state.vessels) ? state.vessels : []);

    stateLocal.companies = globalCompanies.filter((c) => c && c.is_active !== false);
    stateLocal.vessels = globalVessels.filter((v) => v && v.is_active !== false);

    // Fallback direct reads. These are read-only and used only to populate dropdowns.
    if (!stateLocal.companies.length) {
      const { data, error } = await sb
        .from("companies")
        .select("id, company_name, short_name, company_code, is_active")
        .eq("is_active", true)
        .order("company_name", { ascending: true });

      if (!error) stateLocal.companies = data || [];
    }

    if (!stateLocal.vessels.length) {
      const { data, error } = await sb
        .from("vessels")
        .select("id, name, hull_number, imo_number, company_id, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (!error) stateLocal.vessels = data || [];
    }

    renderCompanyDropdownFallback();
    renderVesselDropdownFallback();
  }

  function renderCompanyDropdownFallback() {
    const sel = $("cu_company");
    if (!sel) return;

    const companies = stateLocal.companies || [];
    const current = sel.value || "";

    if (!companies.length) {
      sel.innerHTML = '<option value="">No companies available</option>';
      renderVesselDropdownFallback();
      return;
    }

    sel.innerHTML = [
      '<option value="">Select company...</option>',
      ...companies.map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return '<option value="' + esc(c.id) + '">' + esc(label) + '</option>';
      })
    ].join("");

    if (current && companies.some((c) => String(c.id) === String(current))) {
      sel.value = current;
    }

    renderVesselDropdownFallback();
  }

  function renderVesselDropdownFallback() {
    const sel = $("cu_vessel");
    if (!sel) return;

    const cid = companyId();
    const current = sel.value || "";

    let vessels = stateLocal.vessels || [];

    if (cid) {
      vessels = vessels.filter((v) => String(v.company_id || "") === String(cid));
    }

    sel.innerHTML = [
      '<option value="">Select vessel...</option>',
      ...vessels.map((v) => {
        const hull = v.hull_number ? " / Hull " + v.hull_number : "";
        const imo = v.imo_number ? " / IMO " + v.imo_number : "";
        const label = (v.name || "Unnamed Vessel") + hull + imo;
        return '<option value="' + esc(v.id) + '">' + esc(label) + '</option>';
      })
    ].join("");

    if (current && vessels.some((v) => String(v.id) === String(current))) {
      sel.value = current;
    }
  }

  function selectedCreationMode() {
    return $("cu_creation_mode")?.value || "onboard";
  }

  function isOnboardMode() {
    return selectedCreationMode() === "onboard";
  }

  function setFieldLabel(inputId, labelText) {
    const input = $(inputId);
    const label = input?.closest(".field")?.querySelector("label");
    if (label) label.textContent = labelText;
  }

  function fieldOf(inputId) {
    return $(inputId)?.closest(".field") || null;
  }

  function setVisible(node, visible) {
    if (!node) return;
    node.style.display = visible ? "" : "none";
  }

  async function loadRanks() {
    const sb = stateLocal.sb || window.AUTH.ensureSupabase();
    stateLocal.sb = sb;

    const { data, error } = await sb
      .from("onboard_ranks")
      .select("id, company_id, rank_code, rank_name, department, sort_order, is_system, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("rank_name", { ascending: true });

    if (error) throw error;

    stateLocal.ranks = data || [];
    renderRankDropdown();
  }

  function effectiveRanks() {
    const cid = companyId();

    return (stateLocal.ranks || [])
      .filter((rank) => !rank.company_id || !cid || String(rank.company_id) === String(cid))
      .sort((a, b) => {
        const order = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (order !== 0) return order;
        return String(a.rank_name || "").localeCompare(String(b.rank_name || ""));
      });
  }

  function renderRankDropdown() {
    const sel = $("cu_onboard_rank");
    if (!sel) return;

    const current = sel.value || "";
    const ranks = effectiveRanks();

    sel.innerHTML = [
      '<option value="">Select onboard rank…</option>',
      ...ranks.map((rank) => {
        const department = rank.department ? ` — ${rank.department}` : "";
        const systemTag = rank.company_id ? "Company" : "Default";
        return `
          <option
            value="${esc(rank.id)}"
            data-rank-name="${esc(rank.rank_name)}"
            data-rank-code="${esc(rank.rank_code)}"
          >
            ${esc(rank.rank_name)}${esc(department)} (${esc(systemTag)})
          </option>
        `;
      })
    ].join("");

    if (current && ranks.some((rank) => String(rank.id) === String(current))) {
      sel.value = current;
    }
  }

  function selectedRankName() {
    const sel = $("cu_onboard_rank");
    const opt = sel?.options?.[sel.selectedIndex];
    return opt?.getAttribute("data-rank-name") || "";
  }

  function ensureOnboardCreateFields() {
    if ($("cu_creation_mode")) return;

    const usernameField = fieldOf("cu_username");
    const vesselField = fieldOf("cu_vessel");
    const forceResetLine = $("cu_force_reset")?.closest(".inline");

    if (!usernameField || !vesselField) return;

    const modeBox = document.createElement("div");
    modeBox.className = "field";
    modeBox.id = "cu_creation_mode_field";
    modeBox.innerHTML = `
      <label>Creation Type</label>
      <select id="cu_creation_mode">
        <option value="onboard" selected>Onboard Personnel / Vessel Crew</option>
        <option value="office">Office / Platform User</option>
      </select>
      <div class="muted small">
        Onboard personnel are created by DANAOS credential and assigned to a vessel rank.
      </div>
    `;

    usernameField.insertAdjacentElement("beforebegin", modeBox);

    const onboardBlock = document.createElement("div");
    onboardBlock.id = "cu_onboard_personnel_block";
    onboardBlock.className = "card";
    onboardBlock.style.boxShadow = "none";
    onboardBlock.style.marginTop = "10px";
    onboardBlock.style.border = "1px solid #D6E4F5";
    onboardBlock.style.background = "#F4F8FC";

    onboardBlock.innerHTML = `
      <div style="font-weight:950;color:#062A5E;">Onboard Personnel Assignment</div>
      <div class="muted small" style="margin-top:6px;">
        Assign the person to a vessel rank and control whether they can actively interact with vessel modules.
      </div>

      <div style="height:10px;"></div>

      <div class="grid2">
        <div class="field">
          <label>Onboard Rank</label>
          <select id="cu_onboard_rank">
            <option value="">Loading ranks…</option>
          </select>
        </div>

        <div class="field">
          <label>Onboard Status</label>
          <select id="cu_onboard_status">
            <option value="onboard" selected>Onboard</option>
            <option value="temporarily_ashore">Temporarily ashore</option>
            <option value="disembarked">Disembarked</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div style="height:10px;"></div>

      <div class="grid2">
        <div class="field">
          <label>Embarkation Date</label>
          <input id="cu_embarkation_date" type="date" />
        </div>

        <div class="field">
          <label>Disembarkation Date</label>
          <input id="cu_disembarkation_date" type="date" />
        </div>
      </div>

      <div style="height:10px;"></div>

      <div class="inline" style="gap:14px;align-items:flex-start;">
        <label class="inline" style="gap:8px;font-weight:900;">
          <input id="cu_onboard_access_enabled" type="checkbox" checked />
          Allow active application interaction while onboard
        </label>

        <label class="inline" style="gap:8px;font-weight:900;">
          <input id="cu_read_only_after_disembarkation" type="checkbox" />
          Keep read-only access after disembarkation
        </label>
      </div>

      <div style="height:10px;"></div>

      <div class="field">
        <label>Access / Assignment Notes</label>
        <textarea id="cu_onboard_notes" placeholder="Optional note, e.g. created for current contract / vessel assignment."></textarea>
      </div>

      <div style="height:10px;"></div>

      <div class="card" style="box-shadow:none;background:#fff;">
        <div style="font-weight:950;color:#062A5E;">Rank catalogue</div>
        <div class="muted small" style="margin-top:6px;">
          Default ranks are platform-wide. Company-specific ranks can be added when required.
        </div>
        <div style="height:8px;"></div>
        <div class="actions">
          <button class="btn2 btnSmall" id="cu_reload_ranks_btn" type="button">Reload ranks</button>
          <button class="btn2 btnSmall" id="cu_add_rank_btn" type="button">Add company rank</button>
        </div>
      </div>
    `;

    vesselField.insertAdjacentElement("afterend", onboardBlock);

    if (forceResetLine) {
      const note = document.createElement("div");
      note.className = "muted small";
      note.id = "cu_onboard_force_reset_note";
      note.textContent = "For onboard personnel, first-login password reset should normally remain enabled.";
      forceResetLine.insertAdjacentElement("afterend", note);
    }

    $("cu_embarkation_date").value = todayIso();

    $("cu_creation_mode").addEventListener("change", applyModeUi);
    $("cu_company")?.addEventListener("change", () => {
      renderVesselDropdownFallback();
      window.setTimeout(() => {
        renderRankDropdown();
      }, 150);
    });

    $("cu_reload_ranks_btn")?.addEventListener("click", () => {
      loadRanks()
        .then(() => showOkSafe("Onboard ranks reloaded."))
        .catch((error) => showWarnSafe(String(error?.message || error)));
    });

    $("cu_add_rank_btn")?.addEventListener("click", () => {
      addCompanyRank().catch((error) => showWarnSafe(String(error?.message || error)));
    });

    applyModeUi();
  }

  function applyModeUi() {
    const onboard = isOnboardMode();

    const roleField = fieldOf("cu_role");
    const positionPick = $("cu_position_pick");
    const positionInput = $("cu_position");
    const positionField = positionInput?.closest(".field");
    const onboardBlock = $("cu_onboard_personnel_block");

    setVisible(onboardBlock, onboard);

    if (roleField) {
      roleField.style.display = onboard ? "none" : "";
    }

    if (positionField) {
      positionField.style.display = onboard ? "none" : "";
    }

    if (onboard) {
      setFieldLabel("cu_username", "DANAOS Credential (3–5 digits)");
      $("cu_username").placeholder = "e.g. 1234";
      setFieldLabel("cu_password", "Initial Password");

      const roleSel = $("cu_role");
      if (roleSel) roleSel.value = "vessel";

      if (positionPick) positionPick.value = "";
      if (positionInput) positionInput.value = selectedRankName() || "";

      const force = $("cu_force_reset");
      if (force) force.checked = true;
    } else {
      setFieldLabel("cu_username", "Username (without @domain)");
      $("cu_username").placeholder = "e.g. csv / hsqe_abc / superintendent_01";
      setFieldLabel("cu_password", "Password");
    }
  }

  async function addCompanyRank() {
    const cid = companyId();

    if (!cid) {
      throw new Error("Select a company first before adding a company-specific rank.");
    }

    const rankName = prompt("New rank name:");
    if (!rankName) return;

    const department = prompt("Department / group for this rank:", "Custom") || "Custom";
    const rankCode = slug(rankName);

    if (!rankCode) {
      throw new Error("Rank code could not be generated from the rank name.");
    }

    const sb = stateLocal.sb || window.AUTH.ensureSupabase();
    stateLocal.sb = sb;

    const { error } = await sb
      .from("onboard_ranks")
      .insert({
        company_id: cid,
        rank_code: rankCode,
        rank_name: rankName.trim(),
        department: department.trim(),
        sort_order: 900,
        is_system: false,
        is_active: true
      });

    if (error) throw error;

    await loadRanks();
    showOkSafe("Company-specific onboard rank added.");
  }

  function replaceCreateButtonHandler() {
    const btn = $("cu_createBtn");
    if (!btn) return false;

    if (btn.getAttribute("data-onboard-extension-bound") === "1") return true;

    const clone = btn.cloneNode(true);
    clone.setAttribute("data-onboard-extension-bound", "1");
    clone.textContent = "Create user";
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", () => {
      createUserFromCurrentMode().catch((error) => {
        console.error(error);
        showWarnSafe(String(error?.message || error || "Create user failed."));
      });
    });

    return true;
  }

  async function createUserFromCurrentMode() {
    clearMessagesSafe();

    if (isOnboardMode()) {
      await createOnboardPersonnel();
    } else {
      await createOfficeOrPlatformUser();
    }
  }

  async function createOfficeOrPlatformUser() {
    const username = ($("cu_username")?.value || "").trim();
    const password = $("cu_password")?.value || "";
    const role = $("cu_role")?.value || "";
    const company = $("cu_company")?.value || null;
    const vessel = $("cu_vessel")?.value || null;
    const position = ($("cu_position")?.value || $("cu_position_pick")?.value || "").trim() || null;
    const force = $("cu_force_reset")?.checked === true;

    if (!username) throw new Error("Username is required.");
    if (!password) throw new Error("Password is required.");
    if (!role) throw new Error("Role is required.");

    const payload = {
      action: "create_user",
      username,
      password,
      role,
      position,
      company_id: company,
      vessel_id: vessel,
      force_password_reset: force
    };

    if (typeof callSuAdmin !== "function") {
      throw new Error("Superuser create-user function is not available on this page.");
    }

    await callSuAdmin(payload);

    showOkSafe("User created.");
    await safeRefreshUsers();
    clearCreateFormAfterSuccess();
  }

  async function createOnboardPersonnel() {
    const danaos = ($("cu_username")?.value || "").trim();
    const password = $("cu_password")?.value || "";
    const cid = companyId();
    const vid = vesselId();
    const rankId = $("cu_onboard_rank")?.value || "";
    const rankName = selectedRankName();

    if (!/^[0-9]{3,5}$/.test(danaos)) {
      throw new Error("DANAOS credential must be numerical and 3 to 5 digits.");
    }

    if (!password) throw new Error("Initial password is required.");
    if (!cid) throw new Error("Company is required for onboard personnel.");
    if (!vid) throw new Error("Vessel is required for onboard personnel.");
    if (!rankId) throw new Error("Onboard rank is required.");

    const force = $("cu_force_reset")?.checked !== false;

    const createPayload = {
      action: "create_user",
      username: danaos,
      password,
      role: "vessel",
      position: rankName,
      company_id: cid,
      vessel_id: vid,
      force_password_reset: force
    };

    if (typeof callSuAdmin !== "function") {
      throw new Error("Superuser create-user function is not available on this page.");
    }

    const createResp = await callSuAdmin(createPayload);

    let profileId =
      (typeof extractCreatedUserId === "function" ? extractCreatedUserId(createResp) : null) ||
      await findProfileIdForUsername(danaos);

    if (!profileId) {
      await safeRefreshUsers();
      profileId = await findProfileIdForUsername(danaos);
    }

    if (!profileId) {
      throw new Error("User was created, but the new profile ID could not be located. Refresh the Users list and configure rank manually if needed.");
    }

    const sb = stateLocal.sb || window.AUTH.ensureSupabase();
    stateLocal.sb = sb;

    const { error } = await sb.rpc("csvb_configure_onboard_personnel", {
      p_profile_id: profileId,
      p_danaos_credential: danaos,
      p_rank_id: rankId,
      p_vessel_id: vid,
      p_onboard_status: $("cu_onboard_status")?.value || "onboard",
      p_onboard_access_enabled: $("cu_onboard_access_enabled")?.checked === true,
      p_read_only_after_disembarkation: $("cu_read_only_after_disembarkation")?.checked === true,
      p_embarkation_date: $("cu_embarkation_date")?.value || null,
      p_disembarkation_date: $("cu_disembarkation_date")?.value || null,
      p_reason: $("cu_onboard_notes")?.value || "Onboard personnel created from Superuser Administration."
    });

    if (error) throw error;

    showOkSafe(`Onboard personnel created: ${danaos} / ${rankName}.`);
    await safeRefreshUsers();
    clearCreateFormAfterSuccess();
  }

  async function findProfileIdForUsername(username) {
    const target = String(username || "").trim();
    if (!target) return null;

    if (typeof findUserIdByUsername === "function") {
      try {
        const id = await findUserIdByUsername(target);
        if (id) return id;
      } catch (_) {}
    }

    const sb = stateLocal.sb || window.AUTH.ensureSupabase();
    stateLocal.sb = sb;

    try {
      const { data, error } = await sb
        .from("profiles")
        .select("id, username")
        .eq("username", target)
        .limit(1)
        .maybeSingle();

      if (!error && data?.id) return data.id;
    } catch (_) {}

    try {
      const { data, error } = await sb
        .from("profiles")
        .select("id, username")
        .ilike("username", `${target}%`)
        .limit(1)
        .maybeSingle();

      if (!error && data?.id) return data.id;
    } catch (_) {}

    return null;
  }

  async function safeRefreshUsers() {
    if (typeof refreshUsers === "function") {
      await refreshUsers();
    } else {
      window.setTimeout(() => location.reload(), 800);
    }
  }

  function clearCreateFormAfterSuccess() {
    const username = $("cu_username");
    const password = $("cu_password");
    const notes = $("cu_onboard_notes");

    if (username) username.value = "";
    if (password) password.value = "";
    if (notes) notes.value = "";

    const disembark = $("cu_disembarkation_date");
    if (disembark) disembark.value = "";

    const embark = $("cu_embarkation_date");
    if (embark) embark.value = todayIso();
  }

  function patchUserListHeaders() {
    const usersBody = $("usersBody");
    const table = usersBody?.closest("table");
    if (!table) return;

    const headers = table.querySelectorAll("thead th");
    headers.forEach((th) => {
      const text = th.textContent.trim().toLowerCase();

      if (text === "username") {
        th.textContent = "DANAOS / Username";
      }

      if (text === "position") {
        th.textContent = "Rank / Position";
      }
    });
  }

  function enhanceUserRows() {
    const tbody = $("usersBody");
    if (!tbody) return;

    tbody.querySelectorAll("tr").forEach((tr) => {
      if (tr.getAttribute("data-onboard-access-enhanced") === "1") return;

      const idBtn = tr.querySelector("button[data-id]");
      const profileId = idBtn?.getAttribute("data-id");

      if (!profileId) return;

      const user = findStateUser(profileId);
      const isVesselPerson =
        String(user?.role || "") === "vessel" ||
        !!user?.vessel_id ||
        !!user?.onboard_rank_id ||
        user?.onboard_status === "onboard";

      if (!isVesselPerson) return;

      const actions = tr.querySelector(".actions");
      if (!actions) return;

      const btn = document.createElement("button");
      btn.className = "btnSmall btn2";
      btn.type = "button";
      btn.textContent = "Onboard Access";
      btn.addEventListener("click", () => {
        configureExistingOnboardAccess(profileId).catch((error) => {
          console.error(error);
          showWarnSafe(String(error?.message || error || "Could not update onboard access."));
        });
      });

      actions.appendChild(btn);
      tr.setAttribute("data-onboard-access-enhanced", "1");
    });
  }

  function findStateUser(profileId) {
    try {
      if (typeof state !== "undefined" && Array.isArray(state.users)) {
        return state.users.find((u) => String(u.id) === String(profileId)) || null;
      }
    } catch (_) {}
    return null;
  }

  async function configureExistingOnboardAccess(profileId) {
    const user = findStateUser(profileId);

    const currentStatus = user?.onboard_status || "onboard";
    const status = prompt(
      "Set onboard status: onboard / disembarked / temporarily_ashore / inactive",
      currentStatus
    );

    if (status === null) return;

    const cleanStatus = status.trim();

    if (!["onboard", "disembarked", "temporarily_ashore", "inactive", "not_applicable"].includes(cleanStatus)) {
      throw new Error("Invalid onboard status.");
    }

    const enabled = confirm("Allow active application interaction?");
    const readOnly = confirm("Keep read-only access after disembarkation?");
    const reason = prompt("Reason / note:", "Onboard access updated from Superuser Administration.") || null;

    const sb = stateLocal.sb || window.AUTH.ensureSupabase();
    stateLocal.sb = sb;

    const { error } = await sb.rpc("csvb_set_onboard_access", {
      p_profile_id: profileId,
      p_onboard_status: cleanStatus,
      p_onboard_access_enabled: enabled,
      p_read_only_after_disembarkation: readOnly,
      p_embarkation_date: null,
      p_disembarkation_date: cleanStatus === "disembarked" ? todayIso() : null,
      p_reason: reason
    });

    if (error) throw error;

    showOkSafe("Onboard access updated.");
    await safeRefreshUsers();
  }

  function observeUsersTable() {
    const tbody = $("usersBody");
    if (!tbody) return;

    const observer = new MutationObserver(() => {
      patchUserListHeaders();
      enhanceUserRows();
    });

    observer.observe(tbody, { childList: true, subtree: true });

    patchUserListHeaders();
    enhanceUserRows();
  }

  async function install() {
    if (stateLocal.installed) return;

    stateLocal.sb = window.AUTH.ensureSupabase();

    ensureOnboardCreateFields();

    const bound = replaceCreateButtonHandler();
    if (!bound) {
      window.setTimeout(install, 500);
      return;
    }

    observeUsersTable();

    await loadCompaniesAndVesselsForUsersTab();
    await loadRanks();

    stateLocal.installed = true;
    window.CSVB_ONBOARD_PERSONNEL_ADMIN_BUILD = BUILD;
  }

  function start() {
    window.setTimeout(() => install().catch((error) => showWarnSafe(String(error?.message || error))), 900);
    window.setTimeout(() => install().catch(() => {}), 1800);
    window.setTimeout(() => {
      patchUserListHeaders();
      enhanceUserRows();
    }, 2600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
