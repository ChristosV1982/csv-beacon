/* One Office creation path shared by every legacy Create-button extension. */
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  let options, loading, pending = false, attempt = null;
  const client = () => window.AUTH.ensureSupabase();
  const mode = () => el("cu_creation_mode")?.value || "office";
  function message(text, bad = false) {
    if (typeof window[bad ? "showWarn" : "showOk"] === "function")
      window[bad ? "showWarn" : "showOk"](text);
    else {
      const box = el("officeCreateNotice");
      if (box) box.textContent = text;
    }
  }
  async function loadOptions() {
    if (options) return options;
    if (!loading) loading = client().rpc("csvb_admin_office_creation_options", {}).then(({ data, error }) => {
      if (error) throw error;
      if (!Array.isArray(data?.roles) || !Array.isArray(data?.access_profiles))
        throw Error("Office creation options are unavailable.");
      options = data;
      return data;
    }).finally(() => { loading = null; });
    return loading;
  }
  function fill(select, items, prompt) {
    const selected = select.value;
    select.replaceChildren(new Option(prompt, ""));
    items.forEach(item => select.add(new Option(item.display_name, item.code)));
    select.value = selected;
  }
  function updateProfileNotice() {
    const role = options?.roles.find(r => r.code === el("cu_office_role")?.value);
    const profile = options?.access_profiles.find(p => p.code === el("cu_access_profile")?.value);
    const text = el("officeCreateProfileStatus");
    if (!text) return;
    text.textContent = !role ? "Select an Office Role. Its configured Access Profile will be selected automatically."
      : (profile?.code === role.default_access_profile_code ? "Role default. " : "Custom per-user Access Profile. ") +
        (profile?.requires_enforcement
          ? "Account will be created inactive with login locked until View-only permission enforcement is available."
          : "Prepared profile: the compatible legacy access baseline will be used until profile enforcement is available.");
  }
  async function sync() {
    const card = el("userCreateCard");
    if (!card || !el("cu_creation_mode")) return;
    card.dataset.officeCreateContext = mode();
    const help = el("cu_creation_mode_field")?.querySelector(".muted");
    if (help) help.textContent = mode() === "office"
      ? "Choose an Office Role and Access Profile. Position is optional and separate from permissions."
      : mode() === "platform_admin" ? "Protected platform account creation requires explicit confirmation."
        : "Onboard personnel are created by DANAOS credential and assigned to a vessel rank.";
    if (mode() === "onboard") return;
    // Internal compatibility value only; never submitted as Office authority.
    if (el("cu_role")) el("cu_role").value = mode() === "platform_admin" ? "super_admin" : "company_superintendent";
    if (el("cu_company")) el("cu_company").disabled = mode() === "platform_admin";
    if (el("cu_vessel")) { el("cu_vessel").value = ""; el("cu_vessel").disabled = true; }
    if (mode() !== "office") return;
    const roleSelect = el("cu_office_role"), profileSelect = el("cu_access_profile");
    roleSelect.disabled = profileSelect.disabled = true;
    try {
      const data = await loadOptions();
      fill(roleSelect, data.roles, "Select Office Role");
      fill(profileSelect, data.access_profiles, "Select Access Profile");
      updateProfileNotice();
    } catch (error) {
      el("officeCreateProfileStatus").textContent = `Unable to load Office roles: ${error.message}. Switch away and back to retry.`;
    } finally {
      roleSelect.disabled = !options;
      profileSelect.disabled = !options || !roleSelect.value;
    }
  }
  function install() {
    const card = el("userCreateCard"), type = el("cu_creation_mode"), legacy = el("cu_role");
    if (!card || !type || !legacy) return false;
    if (el("cu_office_role")) return true;
    const fields = document.createElement("div");
    fields.id = "officeCreateFields";
    fields.className = "field";
    fields.innerHTML = `<label for="cu_office_role">Office Role</label><select id="cu_office_role"></select>
      <label for="cu_access_profile">Access Profile</label><select id="cu_access_profile"></select>
      <div class="muted small" id="officeCreateProfileStatus" role="status"></div>`;
    legacy.closest(".field").insertAdjacentElement("beforebegin", fields);
    legacy.closest(".field").dataset.officeLegacyRole = "true";
    el("cu_vessel")?.closest(".field")?.setAttribute("data-office-vessel", "true");
    el("cu_company")?.closest(".field")?.setAttribute("data-office-company", "true");
    const protectedNotice = document.createElement("div");
    protectedNotice.className = "muted small"; protectedNotice.id = "officeCreateProtected";
    protectedNotice.textContent = "Protected Super Admin creation. No Office Role or Access Profile can grant this security class. Explicit confirmation is required.";
    fields.insertAdjacentElement("afterend", protectedNotice);
    const notice = document.createElement("div");
    notice.id = "officeCreateNotice"; notice.setAttribute("role", "status");
    card.appendChild(notice);
    type.add(new Option("Protected Super Admin (platform administration)", "platform_admin"));
    const style = document.createElement("style");
    style.textContent = `
      #userCreateCard [data-office-legacy-role] { display:none!important; }
      #userCreateCard:not([data-office-create-context="office"]) #officeCreateFields { display:none!important; }
      #userCreateCard:not([data-office-create-context="platform_admin"]) #officeCreateProtected { display:none!important; }
      #userCreateCard:not([data-office-create-context="onboard"]) [data-office-vessel],
      #userCreateCard:not([data-office-create-context="onboard"]) #cu_position_pick,
      #userCreateCard[data-office-create-context="platform_admin"] [data-office-company] { display:none!important; }
      #officeCreateFields { gap:7px; }
      #officeCreateProfileStatus { padding:6px 0; line-height:1.4; }`;
    document.head.appendChild(style);
    type.addEventListener("change", () => { sync(); });
    el("cu_office_role").addEventListener("change", () => {
      const role = options?.roles.find(r => r.code === el("cu_office_role").value);
      el("cu_access_profile").value = role?.default_access_profile_code || "";
      el("cu_access_profile").disabled = !role;
      updateProfileNotice();
    });
    el("cu_access_profile").addEventListener("change", updateProfileNotice);
    sync();
    return true;
  }
  async function create() {
    if (pending) return;
    if (mode() === "onboard") throw Error("Onboard creation must use the existing vessel/rank workflow.");
    const username = el("cu_username")?.value.trim(), password = el("cu_password")?.value;
    if (!username || !password) throw Error("Username and initial password are required.");
    const first_name = el("cu_first_name")?.value.trim() || null;
    const last_name = el("cu_last_name")?.value.trim() || null;
    const position = el("cu_position")?.value.trim() || null;
    const force_password_reset = el("cu_force_reset")?.checked === true;
    let payload;
    if (mode() === "platform_admin") {
      if (!window.confirm(`Create protected Super Admin account "${username}"?\n\nThis grants platform administration rights. Office Role selections never grant these rights.`)) return;
      payload = { action: "create_user", username, password, role: "super_admin",
        company_id: null, vessel_id: null, position, force_password_reset };
    } else {
      const data = await loadOptions();
      if (pending) return;
      const role = data.roles.find(r => r.code === el("cu_office_role")?.value);
      const profile = data.access_profiles.find(p => p.code === el("cu_access_profile")?.value);
      const company_id = el("cu_company")?.value;
      if (!company_id || !role || !profile) throw Error("Company, Office Role and Access Profile are required.");
      if (profile.requires_enforcement && !window.confirm(
        `Create "${username}" as an inactive prepared account?\n\nThe selected View-only profile is not yet enforced. Login will remain locked; no broader legacy access will be granted.`)) return;
      const selection = JSON.stringify({ username, company_id, role: role.code, profile: profile.code,
        first_name, last_name, position, force_password_reset });
      if (!attempt || attempt.selection !== selection) attempt = { selection, id: crypto.randomUUID() };
      payload = { action: "create_office_user", request_id: attempt.id, username, password, company_id,
        office_role_code: role.code, access_profile_code: profile.code,
        first_name, last_name, position, force_password_reset };
    }
    pending = true;
    const button = el("cu_createBtn");
    if (button) button.disabled = true;
    try {
      const result = await callSuAdmin(payload);
      if (payload.action === "create_user" && (first_name || last_name)) {
        let id = typeof extractCreatedUserId === "function" ? extractCreatedUserId(result) : null;
        if (!id) {
          const found = await client().from("profiles").select("id").eq("username", username).maybeSingle();
          if (found.error) throw found.error;
          id = found.data?.id;
        }
        if (!id) throw Error("Super Admin created, but its identity was not returned. Review Users before retrying.");
        const updated = await client().rpc("csvb_update_user_particulars", {
          p_profile_id: id, p_first_name: first_name, p_last_name: last_name,
          p_company_id: null, p_vessel_id: null, p_role: null, p_position: null,
          p_danaos_credential: null, p_onboard_rank_id: null, p_onboard_status: null,
          p_onboard_access_enabled: null, p_read_only_after_disembarkation: null,
          p_embarkation_date: null, p_disembarkation_date: null,
          p_force_password_reset: null, p_is_active: null, p_is_disabled: null,
          p_reason: "Name/surname applied to protected Super Admin creation."
        });
        if (updated.error) throw updated.error;
      }
      ["cu_username","cu_password","cu_first_name","cu_last_name"].forEach(id => { if (el(id)) el(id).value = ""; });
      attempt = null;
      message(result.message || "Protected Super Admin created.");
      try {
        if (window.CSVB_REFRESH_USER_DIRECTORY) await window.CSVB_REFRESH_USER_DIRECTORY();
        else if (typeof refreshUsers === "function") await refreshUsers();
        else throw Error("Directory refresh unavailable");
      } catch (error) { message(`Account created, but directory refresh failed: ${error.message}`, true); }
    } catch (error) {
      // Retain request ID for a retry; the server never creates a second Auth identity.
      message(error.message || "Office user creation failed.", true);
      throw error;
    } finally {
      pending = false;
      if (el("cu_createBtn")) el("cu_createBtn").disabled = false;
    }
  }
  window.CSVBOfficeUserCreate = { create, sync, install };
  function ready(remaining = 80) {
    if (!install() && remaining) setTimeout(() => ready(remaining - 1), 250);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => ready());
  else ready();
})();
