/* Incremental navigation over existing Office authorization APIs.
 * No role writes: organizational roles do not own runtime grants yet.
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
      return;
    }
    const own = users.filter(u => u.office_role_code === role.code);
    const affected = users.filter(u => u.office_access_profile_code === role.default_access_profile_code);
    const other = affected.filter(u => u.office_role_code !== role.code);
    const custom = own.filter(u => u.office_access_profile_code !== role.default_access_profile_code);
    const base = config.profiles.find(p => p.code === role.default_access_profile_code);
    text("[data-role-context]", `${role.display_name} · ${own.length} assigned user(s) · ${affected.length} user(s) across all roles use the mapped access settings · ${other.length} of those belong to other/no Office Roles · ${custom.length} role member(s) use different access settings.`);
    text("[data-role-base]", `Mapped access settings: ${base?.display_name || "Unavailable"}${base?.is_active === false ? " (inactive)" : ""}. These are configuration defaults, not a user's effective access. Company availability, account status and individual exceptions still apply.`);
    const grants = new Map(config.grants.filter(g => g.access_profile_code === role.default_access_profile_code).map(g => [g.permission_id, g]));
    const term = find("[data-role-search]").value.trim().toLowerCase();
    find("[data-role-rows]").innerHTML = config.modules.filter(m => `${m.name} ${m.code}`.toLowerCase().includes(term)).map(m => {
      const supported = config.permissions.filter(p => p.module_id === m.id);
      if (!supported.length) return "";
      return `<tr><th scope="row">${esc(m.name)}${m.is_active === false ? " (inactive)" : ""}</th>${actions.map(action => {
        const permission = supported.find(p => p.action === action), grant = permission && grants.get(permission.id);
        return `<td>${permission ? grant?.is_granted ? "Allowed in mapped defaults" : "Denied in mapped defaults" : "—"}</td>`;
      }).join("")}</tr>`;
    }).join("") || '<tr><td colspan="6">No matching modules.</td></tr>';
  }
  async function loadRoleOptions() {
    if (roleLoading) return roleLoading;
    roleLoading = (async () => {
      try {
        const options = await rpc("csvb_admin_office_creation_options");
        roles = options.roles || [];
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
        <h2>Role permissions</h2><div class="rights-readonly-note"><strong>Read-only role overview — controlled transition required.</strong>
        Office Roles currently map to shared access settings; they do not own isolated runtime permission defaults.
        Changing shared settings could affect other roles. No role changes can be saved from this section.</div>
        <div class="rights-section-controls"><label>Office Role <select data-office-role><option value="">Select Office Role</option></select></label>
        <label>Find module <input type="search" data-role-search></label><button type="button" data-role-reload>Reload role overview</button></div>
        <p data-role-context role="status">Open Rights Matrix to load the authorized role catalogue.</p><p class="rights-context-note" data-role-base></p>
        <div class="rights-table-scroll"><table class="rights-simple-table"><caption>Mapped role defaults — not individual effective access</caption>
        <thead><tr><th>Module</th>${actions.map(a => `<th>${a[0].toUpperCase() + a.slice(1)}</th>`).join("")}</tr></thead><tbody data-role-rows></tbody></table></div>
        <details class="rights-transition-plan"><summary>Controlled transition plan for genuine role-default editing</summary>
        <ol><li>Compare each role's mapped settings, current effective user access and individual exceptions.</li>
        <li>Prepare an audited role-scoped backend contract and isolate settings shared with other roles. No remapping happens here.</li>
        <li>Preview all affected current users and future defaults; obtain explicit approval for any access changes.</li>
        <li>Verify backend, route and company-scope results before enabling role-specific Save. Keep current grants unchanged until then.</li></ol></details></section>
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
    find("[data-office-role]").addEventListener("change", roleOverview);
    find("[data-role-search]").addEventListener("input", roleOverview);
    find("[data-role-reload]").addEventListener("click", () => {
      // Refresh the shared read-only configuration as well as role mappings.
      panel.querySelector("[data-reload]").click();
    });
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
      if (companyChanges.size) { event.preventDefault(); event.returnValue = ""; }
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
  window.addEventListener("csvb:rights-user", event => deletionExplanation(event.detail.user));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
