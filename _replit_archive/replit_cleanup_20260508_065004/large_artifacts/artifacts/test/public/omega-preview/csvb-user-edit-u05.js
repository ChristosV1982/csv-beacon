/* public/csvb-user-edit-u05.js */
/* C.S.V. BEACON – U-05 User Particulars Edit Extension */

(() => {
  "use strict";

  const BUILD = "CSVBEACON-USER-EDIT-U05-20260512-1";

  const local = {
    sb: null,
    companies: [],
    vessels: [],
    ranks: [],
    installed: false
  };

  const ROLE_LABELS = {
    super_admin: "Super Admin",
    platform_owner: "Platform Owner",
    company_admin: "Company Admin",
    company_superintendent: "Company Superintendent",
    vessel: "Onboard Personnel",
    inspector: "Inspector / Third Party"
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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function sb() {
    if (!local.sb) local.sb = window.AUTH.ensureSupabase();
    return local.sb;
  }

  function showOkSafe(message) {
    if (typeof showOk === "function") showOk(message);
    else alert(message);
  }

  function showWarnSafe(message) {
    if (typeof showWarn === "function") showWarn(message);
    else alert(message);
  }

  function selectedCreateMode() {
    return $("cu_creation_mode")?.value || "office";
  }

  function isOnboardCreateMode() {
    return selectedCreateMode() === "onboard";
  }

  async function loadSupportData() {
    const [companyRes, vesselRes, rankRes] = await Promise.all([
      sb().from("companies").select("id, company_name, short_name, company_code, is_active").eq("is_active", true).order("company_name"),
      sb().from("vessels").select("id, name, hull_number, imo_number, company_id, is_active").eq("is_active", true).order("name"),
      sb().from("onboard_ranks").select("id, company_id, rank_code, rank_name, department, sort_order, is_active").eq("is_active", true).order("sort_order")
    ]);

    if (!companyRes.error) local.companies = companyRes.data || [];
    if (!vesselRes.error) local.vessels = vesselRes.data || [];
    if (!rankRes.error) local.ranks = rankRes.data || [];
  }

  function companyOptions(selected = "") {
    return [
      '<option value="">No company / platform</option>',
      ...local.companies.map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        const sel = String(c.id) === String(selected) ? " selected" : "";
        return `<option value="${esc(c.id)}"${sel}>${esc(label)}</option>`;
      })
    ].join("");
  }

  function vesselOptions(selected = "", companyId = "") {
    const rows = local.vessels.filter((v) => !companyId || String(v.company_id || "") === String(companyId));

    return [
      '<option value="">No vessel</option>',
      ...rows.map((v) => {
        const label = `${v.name || "Unnamed Vessel"}${v.hull_number ? " / Hull " + v.hull_number : ""}${v.imo_number ? " / IMO " + v.imo_number : ""}`;
        const sel = String(v.id) === String(selected) ? " selected" : "";
        return `<option value="${esc(v.id)}"${sel}>${esc(label)}</option>`;
      })
    ].join("");
  }

  function rankOptions(selected = "", companyId = "") {
    const rows = local.ranks
      .filter((r) => !r.company_id || !companyId || String(r.company_id) === String(companyId));

    return [
      '<option value="">No rank selected</option>',
      ...rows.map((r) => {
        const dept = r.department ? ` — ${r.department}` : "";
        const scope = r.company_id ? "Company" : "Default";
        const sel = String(r.id) === String(selected) ? " selected" : "";
        return `<option value="${esc(r.id)}"${sel}>${esc(r.rank_name)}${esc(dept)} (${esc(scope)})</option>`;
      })
    ].join("");
  }

  function roleOptions(selected = "") {
    const roles = ["super_admin", "company_admin", "company_superintendent", "vessel", "inspector"];

    return roles.map((role) => {
      const sel = String(role) === String(selected) ? " selected" : "";
      return `<option value="${esc(role)}"${sel}>${esc(ROLE_LABELS[role] || role)}</option>`;
    }).join("");
  }

  function ensureNameFieldsInCreateForm() {
    if ($("cu_first_name")) return;

    const passwordField = $("cu_password")?.closest(".field");
    if (!passwordField) return;

    const box = document.createElement("div");
    box.id = "cu_name_fields_box";
    box.innerHTML = `
      <div style="height:10px;"></div>
      <div class="grid2">
        <div class="field">
          <label>Name</label>
          <input id="cu_first_name" placeholder="Optional" />
        </div>
        <div class="field">
          <label>Surname</label>
          <input id="cu_last_name" placeholder="Optional" />
        </div>
      </div>
    `;

    passwordField.insertAdjacentElement("afterend", box);
  }

  async function findProfileByUsernameOrDanaos(value) {
    const target = String(value || "").trim();
    if (!target) return null;

    for (let i = 0; i < 8; i += 1) {
      try {
        const { data, error } = await sb()
          .from("profiles")
          .select("*")
          .or(`username.eq.${target},danaos_credential.eq.${target}`)
          .limit(1)
          .maybeSingle();

        if (!error && data?.id) return data;
      } catch (_) {}

      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    return null;
  }

  async function updateNamesAfterCreate(profileId) {
    const first = $("cu_first_name")?.value || "";
    const last = $("cu_last_name")?.value || "";

    if (!first.trim() && !last.trim()) return;

    const { error } = await sb().rpc("csvb_update_user_particulars", {
      p_profile_id: profileId,
      p_first_name: first || null,
      p_last_name: last || null,
      p_company_id: null,
      p_vessel_id: null,
      p_role: null,
      p_position: null,
      p_danaos_credential: null,
      p_onboard_rank_id: null,
      p_onboard_status: null,
      p_onboard_access_enabled: null,
      p_read_only_after_disembarkation: null,
      p_embarkation_date: null,
      p_disembarkation_date: null,
      p_force_password_reset: null,
      p_is_active: null,
      p_is_disabled: null,
      p_reason: "Name/surname applied after user creation."
    });

    if (error) throw error;
  }

  function takeOverCreateButton() {
    const btn = $("cu_createBtn");
    if (!btn) return false;

    if (btn.getAttribute("data-u05-create-bound") === "1") return true;

    const clone = btn.cloneNode(true);
    clone.setAttribute("data-u05-create-bound", "1");
    clone.textContent = "Create user";
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", () => {
      createUserU05().catch((error) => {
        console.error(error);
        showWarnSafe(String(error?.message || error || "Create user failed."));
      });
    });

    return true;
  }

  async function createUserU05() {
    const username = ($("cu_username")?.value || "").trim();
    const password = $("cu_password")?.value || "";
    const force = $("cu_force_reset")?.checked === true;

    if (!username) throw new Error("Username / DANAOS credential is required.");
    if (!password) throw new Error("Initial password is required.");

    if (isOnboardCreateMode()) {
      if (!/^[0-9]{3,5}$/.test(username)) {
        throw new Error("DANAOS credential must be numerical and 3 to 5 digits.");
      }

      const vesselId = $("cu_vessel")?.value || "";
      const rankId = $("cu_onboard_rank")?.value || "";
      const companyId = $("cu_company")?.value || "";
      const rankName = $("cu_onboard_rank")?.selectedOptions?.[0]?.textContent?.split("—")?.[0]?.trim() || "";

      if (!companyId) throw new Error("Company is required.");
      if (!vesselId) throw new Error("Vessel is required.");
      if (!rankId) throw new Error("Rank is required.");

      const resp = await callSuAdmin({
        action: "create_user",
        username,
        password,
        role: "vessel",
        position: rankName,
        company_id: companyId,
        vessel_id: vesselId,
        force_password_reset: force
      });

      let profileId = typeof extractCreatedUserId === "function" ? extractCreatedUserId(resp) : null;

      if (!profileId) {
        const profile = await findProfileByUsernameOrDanaos(username);
        profileId = profile?.id || null;
      }

      if (!profileId) throw new Error("User created but profile could not be located.");

      const { error } = await sb().rpc("csvb_configure_onboard_personnel", {
        p_profile_id: profileId,
        p_danaos_credential: username,
        p_rank_id: rankId,
        p_vessel_id: vesselId,
        p_onboard_status: $("cu_onboard_status")?.value || "onboard",
        p_onboard_access_enabled: $("cu_onboard_access_enabled")?.checked === true,
        p_read_only_after_disembarkation: $("cu_read_only_after_disembarkation")?.checked === true,
        p_embarkation_date: $("cu_embarkation_date")?.value || todayIso(),
        p_disembarkation_date: $("cu_disembarkation_date")?.value || null,
        p_reason: $("cu_onboard_notes")?.value || "Onboard personnel created from Superuser Administration."
      });

      if (error) throw error;

      await updateNamesAfterCreate(profileId);

      showOkSafe("Onboard personnel created.");
    } else {
      const role = $("cu_role")?.value || "";
      if (!role) throw new Error("Role is required.");

      const resp = await callSuAdmin({
        action: "create_user",
        username,
        password,
        role,
        position: ($("cu_position")?.value || $("cu_position_pick")?.value || "").trim() || null,
        company_id: $("cu_company")?.value || null,
        vessel_id: $("cu_vessel")?.value || null,
        force_password_reset: force
      });

      let profileId = typeof extractCreatedUserId === "function" ? extractCreatedUserId(resp) : null;

      if (!profileId) {
        const profile = await findProfileByUsernameOrDanaos(username);
        profileId = profile?.id || null;
      }

      if (profileId) await updateNamesAfterCreate(profileId);

      showOkSafe("User created.");
    }

    if ($("cu_username")) $("cu_username").value = "";
    if ($("cu_password")) $("cu_password").value = "";
    if ($("cu_first_name")) $("cu_first_name").value = "";
    if ($("cu_last_name")) $("cu_last_name").value = "";

    if (typeof refreshUsers === "function") await refreshUsers();
    setTimeout(addEditButtons, 500);
  }

  function addStyles() {
    if ($("csvbUserEditU05Styles")) return;

    const style = document.createElement("style");
    style.id = "csvbUserEditU05Styles";
    style.textContent = `
      .csvb-u05-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(3, 27, 63, .45);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        overflow: auto;
        padding: 28px 12px;
      }

      .csvb-u05-modal {
        width: min(980px, 96vw);
        background: #fff;
        border-radius: 16px;
        border: 1px solid #C9D9EC;
        box-shadow: 0 24px 70px rgba(3, 27, 63, .28);
        padding: 14px;
      }

      .csvb-u05-modal-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        border-bottom: 1px solid #DCE8F6;
        padding-bottom: 10px;
        margin-bottom: 12px;
      }

      .csvb-u05-modal-title {
        font-size: 1.1rem;
        font-weight: 950;
        color: #062A5E;
      }

      .csvb-u05-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(240px, 1fr));
        gap: 10px;
      }

      .csvb-u05-grid-wide {
        grid-column: 1 / -1;
      }

      .csvb-u05-section-title {
        grid-column: 1 / -1;
        margin-top: 6px;
        padding-top: 10px;
        border-top: 1px solid #DCE8F6;
        color: #062A5E;
        font-weight: 950;
      }

      .csvb-u05-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid #DCE8F6;
      }

      @media(max-width:780px) {
        .csvb-u05-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function loadProfile(profileId) {
    const { data, error } = await sb()
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("Profile not found.");

    return data;
  }

  function openEditModal(profile) {
    closeEditModal();

    const isVessel = profile.role === "vessel";

    const backdrop = document.createElement("div");
    backdrop.id = "csvbUserEditModalBackdrop";
    backdrop.className = "csvb-u05-modal-backdrop";

    backdrop.innerHTML = `
      <div class="csvb-u05-modal">
        <div class="csvb-u05-modal-head">
          <div>
            <div class="csvb-u05-modal-title">Edit User Particulars</div>
            <div class="muted small">Username: <span class="mono">${esc(profile.username)}</span></div>
          </div>
          <button class="btn2 btnSmall" type="button" id="u05CloseEditBtn">Close</button>
        </div>

        <div class="csvb-u05-grid">
          <div class="field">
            <label>Name</label>
            <input id="u05_first_name" value="${esc(profile.first_name || "")}" />
          </div>

          <div class="field">
            <label>Surname</label>
            <input id="u05_last_name" value="${esc(profile.last_name || "")}" />
          </div>

          <div class="field">
            <label>User Type</label>
            <select id="u05_role">${roleOptions(profile.role)}</select>
          </div>

          <div class="field">
            <label>Company</label>
            <select id="u05_company">${companyOptions(profile.company_id || "")}</select>
          </div>

          <div class="field">
            <label>Vessel</label>
            <select id="u05_vessel">${vesselOptions(profile.vessel_id || "", profile.company_id || "")}</select>
          </div>

          <div class="field">
            <label>DANAOS Credential</label>
            <input id="u05_danaos" placeholder="3-5 digits, optional" value="${esc(profile.danaos_credential || "")}" />
          </div>

          <div class="csvb-u05-section-title">Rank / Position</div>

          <div class="field">
            <label>Onboard Rank</label>
            <select id="u05_rank">${rankOptions(profile.onboard_rank_id || "", profile.company_id || "")}</select>
          </div>

          <div class="field">
            <label>Office / Custom Position</label>
            <input id="u05_position" value="${esc(profile.position || "")}" />
          </div>

          <div class="csvb-u05-section-title">Onboard Access</div>

          <div class="field">
            <label>Onboard Status</label>
            <select id="u05_onboard_status">
              <option value="not_applicable"${profile.onboard_status === "not_applicable" ? " selected" : ""}>Not applicable</option>
              <option value="onboard"${profile.onboard_status === "onboard" ? " selected" : ""}>Onboard</option>
              <option value="temporarily_ashore"${profile.onboard_status === "temporarily_ashore" ? " selected" : ""}>Temporarily ashore</option>
              <option value="disembarked"${profile.onboard_status === "disembarked" ? " selected" : ""}>Disembarked</option>
              <option value="inactive"${profile.onboard_status === "inactive" ? " selected" : ""}>Inactive</option>
            </select>
          </div>

          <div class="field">
            <label>Embarkation Date</label>
            <input id="u05_embarkation_date" type="date" value="${esc(profile.embarkation_date || "")}" />
          </div>

          <div class="field">
            <label>Disembarkation Date</label>
            <input id="u05_disembarkation_date" type="date" value="${esc(profile.disembarkation_date || "")}" />
          </div>

          <div class="field">
            <label>Account / Access Flags</label>
            <label class="inline" style="gap:8px;">
              <input id="u05_onboard_access_enabled" type="checkbox" ${profile.onboard_access_enabled !== false ? "checked" : ""} />
              Active interaction allowed
            </label>
            <label class="inline" style="gap:8px;">
              <input id="u05_read_only_after_disembarkation" type="checkbox" ${profile.read_only_after_disembarkation === true ? "checked" : ""} />
              Read-only after disembarkation
            </label>
            <label class="inline" style="gap:8px;">
              <input id="u05_force_password_reset" type="checkbox" ${profile.force_password_reset === true ? "checked" : ""} />
              Force password reset
            </label>
          </div>

          <div class="field">
            <label>Status</label>
            <label class="inline" style="gap:8px;">
              <input id="u05_is_active" type="checkbox" ${profile.is_active !== false ? "checked" : ""} />
              Active
            </label>
            <label class="inline" style="gap:8px;">
              <input id="u05_is_disabled" type="checkbox" ${profile.is_disabled === true ? "checked" : ""} />
              Disabled
            </label>
          </div>

          <div class="field csvb-u05-grid-wide">
            <label>Change Reason / Notes</label>
            <textarea id="u05_reason" placeholder="Reason for this change"></textarea>
          </div>
        </div>

        <div class="csvb-u05-actions">
          <button class="btn2" type="button" id="u05CancelEditBtn">Cancel</button>
          <button class="btn" type="button" id="u05SaveEditBtn">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    $("u05_company").addEventListener("change", () => {
      $("u05_vessel").innerHTML = vesselOptions("", $("u05_company").value);
      $("u05_rank").innerHTML = rankOptions("", $("u05_company").value);
    });

    $("u05CloseEditBtn").addEventListener("click", closeEditModal);
    $("u05CancelEditBtn").addEventListener("click", closeEditModal);
    $("u05SaveEditBtn").addEventListener("click", () => {
      saveEdit(profile.id).catch((error) => {
        console.error(error);
        showWarnSafe(String(error?.message || error || "Could not save user particulars."));
      });
    });
  }

  function closeEditModal() {
    $("csvbUserEditModalBackdrop")?.remove();
  }

  async function saveEdit(profileId) {
    const role = $("u05_role").value;
    const isVessel = role === "vessel";

    const reason = $("u05_reason").value.trim();
    if (!reason) throw new Error("Change reason is required.");

    const { error } = await sb().rpc("csvb_update_user_particulars", {
      p_profile_id: profileId,
      p_first_name: $("u05_first_name").value || null,
      p_last_name: $("u05_last_name").value || null,
      p_company_id: $("u05_company").value || null,
      p_vessel_id: $("u05_vessel").value || null,
      p_role: role,
      p_position: isVessel ? null : ($("u05_position").value || null),
      p_danaos_credential: $("u05_danaos").value || null,
      p_onboard_rank_id: isVessel ? ($("u05_rank").value || null) : null,
      p_onboard_status: isVessel ? $("u05_onboard_status").value : "not_applicable",
      p_onboard_access_enabled: isVessel ? $("u05_onboard_access_enabled").checked : true,
      p_read_only_after_disembarkation: isVessel ? $("u05_read_only_after_disembarkation").checked : false,
      p_embarkation_date: isVessel ? ($("u05_embarkation_date").value || null) : null,
      p_disembarkation_date: isVessel ? ($("u05_disembarkation_date").value || null) : null,
      p_force_password_reset: $("u05_force_password_reset").checked,
      p_is_active: $("u05_is_active").checked,
      p_is_disabled: $("u05_is_disabled").checked,
      p_reason: reason
    });

    if (error) throw error;

    closeEditModal();
    showOkSafe("User particulars updated.");

    if (typeof refreshUsers === "function") await refreshUsers();
    setTimeout(addEditButtons, 500);
  }

  function addEditButtons() {
    const tbody = $("usersBody");
    if (!tbody) return;

    tbody.querySelectorAll("tr").forEach((tr) => {
      if (tr.getAttribute("data-u05-edit-added") === "1") return;

      const refBtn = tr.querySelector("button[data-id]");
      const profileId = refBtn?.getAttribute("data-id");

      if (!profileId) return;

      const actions = tr.querySelector(".actions");
      if (!actions) return;

      const editBtn = document.createElement("button");
      editBtn.className = "btnSmall btn2";
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", async () => {
        try {
          await loadSupportData();
          const profile = await loadProfile(profileId);
          openEditModal(profile);
        } catch (error) {
          console.error(error);
          showWarnSafe(String(error?.message || error || "Could not open user editor."));
        }
      });

      actions.appendChild(editBtn);
      tr.setAttribute("data-u05-edit-added", "1");
    });
  }

  function observeUsers() {
    const tbody = $("usersBody");
    if (!tbody) return;

    const observer = new MutationObserver(() => {
      setTimeout(addEditButtons, 120);
    });

    observer.observe(tbody, { childList: true, subtree: true });
    addEditButtons();
  }

  async function install() {
    addStyles();
    ensureNameFieldsInCreateForm();
    await loadSupportData();

    if (!takeOverCreateButton()) {
      setTimeout(install, 500);
      return;
    }

    observeUsers();

    window.CSVB_USER_EDIT_U05_BUILD = BUILD;
  }

  function start() {
    setTimeout(() => install().catch((error) => showWarnSafe(String(error?.message || error))), 1000);
    setTimeout(() => addEditButtons(), 2200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
