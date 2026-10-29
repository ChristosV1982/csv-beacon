/* Role defaults, personal exceptions and company availability use their
 * respective audited backend APIs; a fetched snapshot is not a human review.
 */
(() => {
  "use strict";
  const actions = ["view", "edit", "export", "admin", "review"];
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rpc = async (name, args = {}) => {
    const { data, error } = await window.AUTH.ensureSupabase().rpc(name, args);
    if (error) throw Error(error.message);
    return data;
  };
  let root, rolePanel, companyPanel, safety, config, users = [], roles = [], companies = [];
  let roleLoading, companyListLoading, companyLoading = false, companyVerified = false, selectedCompany = "";
  let companyRows = [], companyChanges = new Map(), lastData;
  let roleSnapshot = null, roleBusy = false, roleError = "";
  const roleChanges = new Map();
  const find = selector => root.querySelector(selector);
  const text = (selector, value) => { find(selector).textContent = value; };
  function status(message, error = false) {
    const node = find("[data-company-status]");
    node.textContent = message; node.setAttribute("role", error ? "alert" : "status");
  }
  function roleOverview() {
    const role = roles.find(r => r.code === find("[data-office-role]").value);
    if (!role || !config) {
      text("[data-role-context]", "Select an Office Role to review its mapped defaults.");
      text("[data-role-base]", ""); find("[data-role-rows]").innerHTML = "";
      find("[data-role-save]").disabled = true;
      return;
    }
    const ready = roleSnapshot?.role_code === role.code;
    const followers = (roleSnapshot?.users || []).filter(u => u.follows_role);
    const custom = (roleSnapshot?.users || []).filter(u => !u.follows_role);
    const enabled = ready && roleSnapshot.is_active && !roleBusy;
    find("[data-office-role]").disabled = roleBusy;
    find("[data-role-reload]").disabled = roleBusy;
    find("[data-role-save]").disabled = !enabled || !roleChanges.size;
    text("[data-role-context]", roleError || (ready
      ? `${role.display_name} · ${followers.length} user(s) use these defaults · ${custom.length} custom assignment(s) · Revision ${roleSnapshot.revision}. Other role defaults are not changed.${roleSnapshot.is_assignable === false ? " Draft: configure rights here, then enable user assignment in Role Management." : ""}`
      : roleBusy ? "Loading authoritative role defaults…" : "Select or reload a role to verify its backend defaults."));
    text("[data-role-base]", ready
      ? "Role defaults apply to accounts following this Office Role and future default assignments. Personal Allow/Deny exceptions and company/system restrictions still win. Explicit custom access assignments remain separate and are not silently converted."
      : "Editing is disabled until the isolated role-default backend is verified. No UI-only grant is possible.");
    text("[data-role-dirty]", roleChanges.size ? `${roleChanges.size} unsaved role permission change(s).` : "No role changes pending.");
    const grants = new Map((ready ? roleSnapshot.grants : []).map(g => [g.permission_id, g]));
    const term = find("[data-role-search]").value.trim().toLowerCase();
    find("[data-role-rows]").innerHTML = config.modules.filter(m => `${m.name} ${m.code}`.toLowerCase().includes(term)).map(m => {
      const supported = config.permissions.filter(p => p.module_id === m.id);
      if (!supported.length) return "";
      return `<tr><th scope="row">${esc(m.name)}${m.is_active === false ? " (inactive)" : ""}</th>${actions.map(action => {
        const permission = supported.find(p => p.action === action), grant = permission && grants.get(permission.id);
        if (!permission) return "<td>—</td>";
        const value = roleChanges.has(permission.id) ? roleChanges.get(permission.id) : !!grant?.is_granted;
        const protectedAction = m.code === "SU_ADMIN" || m.is_active === false ||
          (["Q_DASHBOARD", "MODE_SELECTION"].includes(m.code) && action === "view");
        return `<td><span class="muted small">${ready ? grant?.is_granted ? "Saved: Allowed" : "Saved: Denied" : "Not verified"}</span>
          <select data-role-permission="${esc(permission.id)}" aria-label="${esc(m.name)} ${esc(action)}"
            ${!enabled || protectedAction ? "disabled" : ""}>
            <option value="allow" ${value ? "selected" : ""}>Allow</option><option value="deny" ${!value ? "selected" : ""}>Deny</option></select>
          ${protectedAction ? '<small>System-controlled or inactive</small>' : roleChanges.has(permission.id) ? '<small>Unsaved</small>' : ""}</td>`;
      }).join("")}</tr>`;
    }).join("") || '<tr><td colspan="6">No matching modules.</td></tr>';
  }
  async function loadSelectedRole() {
    if (roleBusy) return;
    const code = find("[data-office-role]").value;
    roleSnapshot = null; roleError = ""; roleChanges.clear();
    if (!code) { roleOverview(); return; }
    roleBusy = true; roleOverview();
    try {
      roleSnapshot = await rpc("csvb_admin_office_role_defaults", { p_role_code: code });
      if (roleSnapshot?.role_code !== code) throw Error("Backend returned a different role.");
    } catch (error) { roleSnapshot = null; roleError = `Role defaults unavailable: ${error.message}. No permission changed.`; }
    finally { roleBusy = false; roleOverview(); }
  }
  async function saveRole() {
    if (roleBusy || !roleSnapshot?.is_active || !roleChanges.size) return;
    const reason = find("[data-role-reason]").value.trim();
    if (!reason) { text("[data-role-context]", "Enter an audit reason before saving role defaults."); return; }
    const followers = roleSnapshot.users.filter(u => u.follows_role);
    const custom = roleSnapshot.users.filter(u => !u.follows_role);
    if (!confirm(`Save ${roleChanges.size} default permission change(s) for ${roleSnapshot.role_label}?\n` +
      `${followers.length} current user(s) use these defaults, including inactive accounts and explicit custom borrowers, plus future default assignments.\n` +
      `${custom.length} custom assignment(s) using other defaults remain unchanged. Personal exceptions and hard security restrictions still apply.\nOther role defaults are not changed.`)) return;
    const changes = [...roleChanges].map(([id, allowed]) => {
      const old = roleSnapshot.grants.find(g => g.permission_id === id);
      return { permission_id: id, is_granted: allowed, scope: old?.scope && old.scope !== "global" ? old.scope : "company" };
    });
    roleBusy = true; roleOverview();
    let saved = false;
    try {
      await rpc("csvb_admin_office_role_defaults_save", {
        p_role_code: roleSnapshot.role_code, p_changes: changes, p_expected_revision: roleSnapshot.revision,
        p_expected_fingerprint: roleSnapshot.fingerprint, p_reason: reason
      });
      saved = true;
      const actual = await rpc("csvb_admin_office_role_defaults", { p_role_code: roleSnapshot.role_code });
      if (changes.some(c => !!actual.grants.find(g => g.permission_id === c.permission_id)?.is_granted !== c.is_granted))
        throw Error("Requested defaults do not match the backend result.");
      roleSnapshot = actual; roleChanges.clear();
      roleError = `Saved and backend-verified ${changes.length} role default change(s). Revision ${actual.revision}. Personal exceptions and security gates remain effective.`;
      window.dispatchEvent(new CustomEvent("csvb:role-defaults-saved"));
    } catch (error) {
      roleError = `${saved ? "Role save returned, but verification failed" : "Role save failed"}: ${error.message}. Reload before further editing.`;
      roleSnapshot = null;
    } finally { roleBusy = false; roleOverview(); }
  }
  async function loadRoleOptions() {
    if (roleLoading) return roleLoading;
    roleLoading = (async () => {
      try {
        // Creation options intentionally exclude drafts. Catalogue visibility is
        // not authorization: the role-default RPC must still verify each choice.
        const options = await rpc("csvb_role_catalogue_list");
        roles = (options.roles || []).filter(r => !r.is_protected &&
          r.is_active !== false && r.has_isolated_defaults !== false);
        const old = find("[data-office-role]").value;
        find("[data-office-role]").innerHTML = '<option value="">Select Office Role</option>' +
          roles.map(r => `<option value="${esc(r.code)}">${esc(r.display_name)}</option>`).join("");
        if (roles.some(r => r.code === old)) find("[data-office-role]").value = old;
        roleOverview();
      } catch (e) { text("[data-role-context]", `Role overview unavailable: ${e.message}. No settings changed.`); }
      finally { roleLoading = null; }
    })();
    return roleLoading;
  }
  function companyRender() {
    const term = find("[data-company-search]").value.trim().toLowerCase();
    find("[data-company-rows]").innerHTML = companyRows.filter(m =>
      `${m.module_label} ${m.module_key} ${m.module_group}`.toLowerCase().includes(term)).map(m => {
      const enabled = companyChanges.has(m.module_key) ? companyChanges.get(m.module_key) : !!m.is_enabled;
      return `<tr><th scope="row">${esc(m.module_label || m.module_key)}<small>${esc(m.module_group)}</small></th>
        <td>${m.is_enabled ? "Enabled" : "Not enabled"}</td><td><label><input type="checkbox"
        data-company-key="${esc(m.module_key)}" ${enabled ? "checked" : ""} ${companyLoading || !companyVerified ? "disabled" : ""}> Available to company</label>
        ${companyChanges.has(m.module_key) ? "<small>Unsaved change</small>" : ""}</td></tr>`;
    }).join("") || '<tr><td colspan="3">Select a company or refine the search.</td></tr>';
    const builderCovered = companyRows.some(m => ["company", "company_builder"].includes(m.module_key) || /company builder/i.test(m.module_label));
    find("[data-company-builder-note]").hidden = builderCovered;
    find("[data-company-select]").disabled = companyLoading;
    find("[data-company-reload]").disabled = companyLoading || !selectedCompany;
    find("[data-company-save]").disabled = companyLoading || !companyVerified || !companyChanges.size;
    text("[data-company-dirty]", companyChanges.size ? `${companyChanges.size} unsaved availability change(s). No user permission grants will be changed.` : "No availability changes pending.");
  }
  async function loadCompanies() {
    if (companies.length) return;
    if (companyListLoading) return companyListLoading;
    companyListLoading = (async () => { try {
      companies = await rpc("csvb_admin_list_companies") || [];
      find("[data-company-select]").innerHTML = '<option value="">Select company</option>' +
        companies.map(c => `<option value="${esc(c.id)}">${esc(c.company_name)}${c.is_active === false ? " (inactive)" : ""}</option>`).join("");
    } catch (e) { status(`Company list unavailable: ${e.message}`, true); }
    finally { companyListLoading = null; } })();
    return companyListLoading;
  }
  async function companyReload() {
    if (companyLoading || !selectedCompany) return false;
    companyLoading = true; companyVerified = false; companyRender();
    try {
      const rows = await rpc("csvb_admin_list_company_modules", { p_company_id: selectedCompany });
      companyRows = rows || []; companyVerified = true;
      status("Saved company availability loaded. Checking a box only stages a change; Save and confirmation are required.");
      return true;
    } catch (e) { status(`Company availability could not be verified: ${e.message}. Editing is disabled until Reload succeeds.`, true); return false; }
    finally { companyLoading = false; companyRender(); }
  }
  async function companySave() {
    if (companyLoading || !companyVerified || !companyChanges.size) return;
    const company = companies.find(c => c.id === selectedCompany);
    if (!company) { status("Select a server-authorized company first.", true); return; }
    const changes = [...companyChanges], description = changes.map(([key, enabled]) =>
      `${companyRows.find(r => r.module_key === key)?.module_label || key}: ${enabled ? "enable" : "disable"}`).join("\n");
    if (!confirm(`Change module availability for ${company.company_name}?\n${description}\nThis affects the company, not individual permission grants.`)) return;
    const target = selectedCompany, saved = [];
    let failure;
    companyLoading = true; companyRender();
    try {
      for (const [key, enabled] of changes) {
        // Only keys returned by the existing authorized directory are admitted.
        if (!companyRows.some(r => r.module_key === key)) throw Error("Unknown company module; Reload before editing.");
        await rpc("csvb_admin_set_company_module", { p_company_id: target, p_module_key: key, p_is_enabled: enabled });
        saved.push([key, enabled]); companyChanges.delete(key);
      }
    } catch (e) { failure = e; }
    companyLoading = false;
    if (!await companyReload()) return;
    const mismatch = saved.filter(([key, enabled]) => {
      const row = companyRows.find(r => r.module_key === key);
      return !row || !!row.is_enabled !== enabled;
    });
    if (mismatch.length) {
      mismatch.forEach(([key, enabled]) => companyChanges.set(key, enabled));
      status("The backend did not confirm all requested availability changes. Review saved values; no full success is claimed.", true);
    } else if (failure) status(`Save stopped: ${failure.message}. ${saved.length} changes verified; ${companyChanges.size} remain unsaved.`, true);
    else status(`${saved.length} company availability change(s) saved and backend-verified. User grants unchanged. Reload User Permissions to refresh effective access.`);
    companyRender();
  }
  function deletionExplanation(user) {
    if (!safety) return;
    safety.hidden = !user;
    if (!user) return;
    const disabled = user.is_disabled || user.is_active === false;
    safety.querySelector("p").textContent = `${user.username}: ${disabled ? "Disabled" : "Active"}. Deletion eligibility: not verified by this screen. Disabled does not mean safe to delete.`;
  }
  function install() {
    const panel = document.getElementById("officeRightsPanel"), advanced = document.getElementById("officeRightsAdvanced");
    if (!panel || !advanced || document.getElementById("csvbRightsSections")) return;
    root = document.createElement("div"); root.id = "csvbRightsSections";
    root.innerHTML = `<div class="rights-section-tabs" role="tablist" aria-label="Permission configuration">
      <button type="button" role="tab" id="rightsRoleTab" data-rights-section="role" aria-controls="rightsRolePanel" aria-selected="false" tabindex="-1">ROLE PERMISSIONS</button>
      <button type="button" role="tab" id="rightsUserTab" data-rights-section="user" aria-controls="rightsUserPanel" aria-selected="true" tabindex="0">USER PERMISSIONS</button>
      <button type="button" role="tab" id="rightsCompanyTab" data-rights-section="company" aria-controls="rightsCompanyPanel" aria-selected="false" tabindex="-1">COMPANY MODULES</button></div>
      <section class="rights-section-panel" role="tabpanel" id="rightsRolePanel" aria-labelledby="rightsRoleTab" hidden>
        <h2>Role permissions</h2><div class="rights-readonly-note"><strong>Office Role defaults — isolated and audited.</strong>
        Each migrated Office Role has its own backend defaults. Save changes only after reviewing affected users.
        Personal exceptions, company availability and hard security limits remain authoritative.</div>
        <div class="rights-section-controls"><label>Office Role <select data-office-role><option value="">Select Office Role</option></select></label>
        <label>Find module <input type="search" data-role-search></label><button type="button" data-role-reload>Reload role defaults</button></div>
        <p data-role-context role="status">Open Rights Matrix to load the authorized role catalogue.</p><p class="rights-context-note" data-role-base></p>
        <div class="rights-table-scroll"><table class="rights-simple-table"><caption>Office Role defaults — individual exceptions and security restrictions can change effective access</caption>
        <thead><tr><th>Module</th>${actions.map(a => `<th>${a[0].toUpperCase() + a.slice(1)}</th>`).join("")}</tr></thead><tbody data-role-rows></tbody></table></div>
        <div class="rights-section-actions"><span data-role-dirty>No role changes pending.</span>
        <label>Audit reason <input type="text" data-role-reason maxlength="1000"></label>
        <button type="button" data-role-save disabled>Save Role Rights</button></div></section>
      <section class="rights-section-panel" role="tabpanel" id="rightsUserPanel" aria-labelledby="rightsUserTab"></section>
      <section class="rights-section-panel" role="tabpanel" id="rightsCompanyPanel" aria-labelledby="rightsCompanyTab" hidden>
        <h2>Company modules</h2><p class="rights-context-note">Company availability is separate from permission to View, Edit, Export, Admin or Review.
        Enabling a module never grants a user access by itself. Nothing changes until you Save and confirm.</p>
        <div class="rights-section-controls"><label>Company <select data-company-select><option value="">Select company</option></select></label>
        <label>Find module <input type="search" data-company-search></label><button type="button" data-company-reload disabled>Reload availability</button>
        <a class="btn2" href="./q-company.html" data-open-builder>Open Company Builder</a></div>
        <p class="rights-context-note" data-company-builder-note>Company Builder is the existing questionnaire-building module.
        The current company-module API does not list its availability, so this screen cannot safely offer a company-level switch for it.
        Its View/Edit permissions remain managed in User Permissions and the existing compatibility tools. No new enablement key will be invented.</p>
        <p data-company-status role="status">Select a company to load its saved availability.</p>
        <div class="rights-table-scroll"><table class="rights-simple-table"><thead><tr><th>Module</th><th>Saved availability</th><th>Proposed availability</th></tr></thead><tbody data-company-rows></tbody></table></div>
        <div class="rights-section-actions"><span data-company-dirty></span><button type="button" data-company-save disabled>Save Company Modules</button></div></section>`;
    panel.before(root);
    rolePanel = find("#rightsRolePanel"); companyPanel = find("#rightsCompanyPanel");
    find("#rightsUserPanel").append(panel);
    safety = document.createElement("details"); safety.className = "rights-blocker-card"; safety.hidden = true;
    safety.innerHTML = `<summary>Account deletion safety — history preserved</summary><p></p>
      <p>Linked thread assignments, memberships, notifications, audit records or evidence can block deletion.
      Deleting an identity can otherwise clear actor links or cascade account history. The existing backend guard remains authoritative.</p>
      <p>There is no read-only dependency/preflight API in this workspace. This explanation is not permission to delete.
      Keep a retired account disabled and retain its identity where history is linked. Do not reassign or anonymize records to bypass a blocker.
      Application disablement and authentication-level bans are separate.</p><strong>No deletion or account change is performed here.</strong>`;
    find("#rightsUserPanel").append(safety);
    root.querySelectorAll("[data-rights-section]").forEach(button => {
      button.addEventListener("click", () => {
        root.querySelectorAll("[data-rights-section]").forEach(b => {
          const active = b === button; b.setAttribute("aria-selected", String(active)); b.tabIndex = active ? 0 : -1;
          find(`#${b.getAttribute("aria-controls")}`).hidden = !active;
        });
        if (button.dataset.rightsSection === "company" && config) void loadCompanies();
      });
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const tabs = [...root.querySelectorAll("[data-rights-section]")], i = tabs.indexOf(button);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click(); tabs[next].focus();
      });
    });
    let lastRole = "";
    find("[data-office-role]").addEventListener("change", event => {
      if (roleChanges.size && !confirm("Discard unsaved role permission changes?")) { event.target.value = lastRole; return; }
      lastRole = event.target.value; void loadSelectedRole();
    });
    find("[data-role-search]").addEventListener("input", roleOverview);
    find("[data-role-reload]").addEventListener("click", () => {
      if (roleChanges.size && !confirm("Discard unsaved role changes and reload?")) return;
      void loadSelectedRole();
    });
    find("[data-role-rows]").addEventListener("change", event => {
      const id = event.target.dataset.rolePermission;
      if (!id || roleBusy || !roleSnapshot) return;
      const allowed = event.target.value === "allow";
      const old = roleSnapshot.grants.find(g => g.permission_id === id);
      if (!!old?.is_granted === allowed) roleChanges.delete(id); else roleChanges.set(id, allowed);
      roleOverview();
    });
    find("[data-role-save]").addEventListener("click", saveRole);
    find("[data-company-select]").addEventListener("change", async event => {
      if (companyChanges.size && !confirm("Discard unsaved company availability changes?")) { event.target.value = selectedCompany; return; }
      selectedCompany = event.target.value; companyRows = []; companyChanges.clear(); companyVerified = false;
      companyRender();
      if (selectedCompany) await companyReload();
      else status("Select a company to load its saved availability.");
    });
    find("[data-company-search]").addEventListener("input", companyRender);
    find("[data-company-reload]").addEventListener("click", () => {
      if (companyChanges.size && !confirm("Discard unsaved company availability changes and reload?")) return;
      companyChanges.clear(); void companyReload();
    });
    find("[data-company-rows]").addEventListener("change", event => {
      const key = event.target.dataset.companyKey;
      if (!key || companyLoading || !companyVerified) return;
      const row = companyRows.find(r => r.module_key === key); if (!row) return;
      if (!!row.is_enabled === event.target.checked) companyChanges.delete(key);
      else companyChanges.set(key, event.target.checked);
      companyRender();
    });
    find("[data-company-save]").addEventListener("click", companySave);
    window.addEventListener("beforeunload", event => {
      if (companyChanges.size || roleChanges.size) { event.preventDefault(); event.returnValue = ""; }
    });
    companyRender(); if (lastData) acceptData(lastData);
  }
  function acceptData(data) {
    lastData = data; if (!root) return;
    config = data.config; users = data.users || [];
    void loadRoleOptions();
    if (!companyPanel.hidden) void loadCompanies();
  }
  window.addEventListener("csvb:rights-loaded", event => acceptData(event.detail));
  window.addEventListener("csvb:role-catalogue-changed", () => {
    if (!roleBusy && !roleChanges.size) void loadRoleOptions();
  });
  window.addEventListener("csvb:rights-user", event => deletionExplanation(event.detail.user));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
