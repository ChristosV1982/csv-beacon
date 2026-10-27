/* Existing Office users only. No Auth API calls or security-class changes. */
(() => {
  "use strict";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = id => document.getElementById(id);
  const NOTICE = "Access enforcement pending: Office Role and Access Profile are saved, but current legacy permissions remain in effect. Selecting a view-only profile does not yet restrict access.";

  async function open(profile, { sb, onSaved, onError }) {
    const { data, error } = await sb.rpc("csvb_admin_office_user_options", { p_profile_id: profile.id });
    if (error) throw error;
    if (!data?.profile || data.profile.id !== profile.id) throw Error("Selected Office user could not be verified.");
    const original = data.profile;
    const roles = data.roles || [], profiles = data.access_profiles || [];
    byId("csvbUserEditModalBackdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.id = "csvbUserEditModalBackdrop";
    backdrop.className = "csvb-u05-modal-backdrop";
    backdrop.innerHTML = `
      <section class="csvb-u05-modal" role="dialog" aria-modal="true" aria-labelledby="officeUserEditTitle">
        <header class="csvb-u05-modal-head">
          <div><div id="officeUserEditTitle" class="csvb-u05-modal-title">Edit Office User</div>
          <div class="muted small">Existing account — no new login account will be created</div></div>
          <button class="btn2 btnSmall" type="button" data-office-close>Close</button>
        </header>
        <form id="officeUserEditForm">
          <div class="csvb-u05-grid">
            <div class="csvb-u05-section-title">Account identity</div>
            <div class="field"><label>Username</label><input readonly value="${esc(original.username)}"></div>
            <div class="field"><label>Account UUID</label><input readonly value="${esc(original.id)}"></div>
            <div class="field"><label for="officeFirstName">Name</label><input id="officeFirstName" value="${esc(original.first_name)}"></div>
            <div class="field"><label for="officeLastName">Surname</label><input id="officeLastName" value="${esc(original.last_name)}"></div>
            <div class="csvb-u05-section-title">Company</div>
            <div class="field csvb-u05-grid-wide"><label>Company assignment — preserved</label>
              <input readonly value="${esc(data.company_name || original.company_id || "No company assigned")}">
              <small class="muted">Company and vessel assignments are not changed by this editor.</small>
            </div>
            <div class="csvb-u05-section-title">Office Role</div>
            <div class="field"><label for="officeRoleCode">Office Role</label>
              <select id="officeRoleCode">
                <option value="">No Office Role — legacy fallback</option>
                ${roles.map(r => `<option value="${esc(r.code)}">${esc(r.display_name)}</option>`).join("")}
              </select>
            </div>
            <div class="field"><label for="officePosition">Office / Custom Position</label>
              <input id="officePosition" value="${esc(original.position)}">
            </div>
            <div class="csvb-u05-section-title">Access Profile</div>
            <div class="field csvb-u05-grid-wide"><label for="officeAccessProfile">Access Profile</label>
              <select id="officeAccessProfile">
                <option value="">Legacy permissions — no prepared profile</option>
                ${profiles.map(p => `<option value="${esc(p.code)}">${esc(p.display_name)}</option>`).join("")}
              </select>
              <small id="officeProfileDifference" aria-live="polite"></small>
            </div>
            <div class="field csvb-u05-grid-wide">
              <p class="muted small" role="note">${esc(data.permission_notice || NOTICE)}</p>
            </div>
            <div class="csvb-u05-section-title">Status</div>
            <div class="field">
              <label class="inline"><input id="officeActive" type="checkbox" ${original.is_active !== false ? "checked" : ""}> Active</label>
              <label class="inline"><input id="officeDisabled" type="checkbox" ${original.is_disabled === true ? "checked" : ""}> Disabled</label>
            </div>
            <div class="field"><label class="inline"><input id="officeForceReset" type="checkbox" ${original.force_password_reset ? "checked" : ""}> Force password reset</label>
              <small class="muted">Unchanged unless explicitly selected.</small>
            </div>
            <div class="field csvb-u05-grid-wide"><label for="officeChangeReason">Change Reason / Notes</label>
              <textarea id="officeChangeReason" required></textarea>
            </div>
            <div id="officeSaveStatus" class="field csvb-u05-grid-wide" role="status" aria-live="polite"></div>
          </div>
          <footer class="csvb-u05-actions">
            <button class="btn2" type="button" data-office-close>Cancel</button>
            <button class="btn" type="submit" id="officeSaveChanges">Save Changes</button>
          </footer>
        </form>
      </section>`;
    document.body.appendChild(backdrop);
    const roleSelect = byId("officeRoleCode"), profileSelect = byId("officeAccessProfile");
    function setInitial(select, value, label) {
      if (value && ![...select.options].some(o => o.value === value)) {
        const option = new Option(`${label || value} — current unavailable assignment`, value);
        option.disabled = true;
        select.add(option);
      }
      select.value = value || "";
    }
    setInitial(roleSelect, original.office_role_code, data.current_office_role_name);
    setInitial(profileSelect, original.office_access_profile_code, data.current_access_profile_name);
    function showDifference() {
      const role = roles.find(r => r.code === roleSelect.value);
      profileSelect.disabled = !roleSelect.value;
      byId("officeProfileDifference").textContent = !roleSelect.value
        ? "No Office Role assigned. Existing legacy permissions remain unchanged."
        : !role ? "Current assignment retained. Choose an active role to change it."
        : profileSelect.value === role.default_access_profile_code
          ? "Using the role’s default Access Profile."
          : "Custom Access Profile selected — differs from the role default.";
    }
    roleSelect.addEventListener("change", () => {
      profileSelect.value = roles.find(r => r.code === roleSelect.value)?.default_access_profile_code || "";
      showDifference();
    });
    profileSelect.addEventListener("change", showDifference);
    showDifference();
    let pending = false;
    backdrop.querySelectorAll("[data-office-close]").forEach(button =>
      button.addEventListener("click", () => { if (!pending) backdrop.remove(); }));
    backdrop.addEventListener("keydown", event => {
      if (event.key === "Escape" && !pending) backdrop.remove();
      if (event.key !== "Tab") return;
      const nodes = [...backdrop.querySelectorAll("button,input,select,textarea")]
        .filter(n => !n.disabled && !n.hidden);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    });
    byId("officeUserEditForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (pending) return;
      const reason = byId("officeChangeReason").value.trim();
      const role = roleSelect.value || null, access = profileSelect.value || null;
      const status = byId("officeSaveStatus");
      if (!reason) { status.textContent = "Change reason is required."; return; }
      if (role && !access) { status.textContent = "Select an Access Profile."; return; }
      const changed = role !== (original.office_role_code || null) ||
        access !== (original.office_access_profile_code || null);
      if (changed && !window.confirm(`Save Office assignment for ${original.username}?\n\n${NOTICE}\n\nThe existing login, company and account UUID will be preserved.`)) return;
      const changes = {
        first_name: byId("officeFirstName").value,
        last_name: byId("officeLastName").value,
        position: byId("officePosition").value,
        is_active: byId("officeActive").checked,
        is_disabled: byId("officeDisabled").checked,
        force_password_reset: byId("officeForceReset").checked
      };
      pending = true;
      const controls = [...backdrop.querySelectorAll("button,input,select,textarea")];
      const prior = controls.map(c => c.disabled);
      controls.forEach(c => { c.disabled = true; });
      status.textContent = "Saving account particulars and audited Office assignment…";
      try {
        const response = await sb.rpc("csvb_admin_update_office_user", {
          p_profile_id: original.id, p_office_role_code: role,
          p_access_profile_code: access, p_changes: changes, p_reason: reason
        });
        if (response.error) throw response.error;
        if (!response.data?.ok || response.data.profile?.id !== original.id)
          throw Error("Save returned an unexpected account response. Reload before retrying.");
        backdrop.remove();
        await onSaved?.("Office assignment saved. Login identity and company preserved. Access-profile enforcement is still pending.");
      } catch (error) {
        status.textContent = `Save failed: ${error.message || error}`;
        onError?.(error);
      } finally {
        pending = false;
        controls.forEach((c, i) => { c.disabled = prior[i]; });
      }
    });
    roleSelect.focus();
  }
  window.CSVBOfficeUserAssignment = { open };
})();
