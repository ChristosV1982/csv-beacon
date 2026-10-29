/* User-first Office permissions. Only audited personal RPCs write user rights.
 * Shared profiles and the unchanged legacy rank/role editor are advanced tools.
 */
(() => {
  "use strict";
  const ACTIONS = ["view", "edit", "export", "admin", "review"];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const office = user => ["company_admin", "company_superintendent"].includes(user?.role || user?.role_name);
  const profileCode = user => user?.office_access_profile_code;
  const roleLabel = user => user?.office_role_label || ({
    super_admin: "Super Admin", company_admin: "Company Admin",
    company_superintendent: "Company Superintendent", vessel: "Vessel / Onboard Personnel",
    inspector: "Inspector / Third Party"
  })[user?.role || user?.role_name] || "Account";
  let config, users = [], diagnostic, panel, advanced, userSelect, profileSelect;
  let selectedId = "", selectedProfile = "", busy = false, loaded = false;
  let diagnosticValid = false, legacySection, sharedSection;
  const draft = new Map(), sharedDraft = new Map();
  const rpc = async (name, args = {}) => {
    const { data, error } = await window.AUTH.ensureSupabase().rpc(name, args);
    if (error) throw Error(error.message);
    return data;
  };
  const user = () => users.find(u => u.id === selectedId);
  const decisions = () => new Map((diagnostic?.permissions || []).map(p => [p.permission_id, p.decision]));
  const overrides = () => new Map((diagnostic?.overrides || []).map(o => [o.permission_id, o]));
  const editable = () => office(user()) && !!profileCode(user()) && diagnosticValid &&
    diagnostic?.enforcement_enabled === true;
  const message = (text, error = false) => {
    const node = panel.querySelector("[data-status]");
    node.textContent = text;
    node.setAttribute("role", error ? "alert" : "status");
  };
  function dirtyGuard() {
    return !(draft.size || sharedDraft.size) || confirm("Discard unsaved permission changes?");
  }
  function originLabel(decision) {
    return ({ hard_constraint: "System/company restriction", personal_allow: "Individual Allow",
      personal_deny: "Individual Deny", access_profile: "Assigned access settings",
      legacy_fallback: "Earlier role settings" })[decision?.source] || "Not available";
  }
  function render() {
    if (!panel) return;
    const subject = user(), ds = decisions(), os = overrides();
    panel.querySelector("[data-context]").textContent = !subject ? "Select a user to see backend-resolved permissions."
      : `${subject.username} · ${roleLabel(subject)} · ${subject.company_name || "Company scope applies"}` +
        `${diagnostic?.custom_permissions_applied ? " · Individual exceptions applied" : ""}`;
    panel.querySelector("[data-policy]").textContent = !subject ? ""
      : !office(subject) ? "Protected/non-Office account. Individual Office exceptions cannot change Super Admin, vessel-rank or Inspector permissions. Use Advanced compatibility tools where appropriate."
      : !profileCode(subject) ? "This account uses earlier role settings. Individual exceptions require a controlled access-configuration transition first. No account or access assignment will be changed here."
      : !diagnosticValid ? "Effective permissions could not be verified. Editing is disabled until Reload succeeds."
      : !diagnostic?.enforcement_enabled ? "Office enforcement is not active for this user. Editing is disabled; no legacy permissions will be bypassed."
      : "Changes affect only this user. “Same as role” removes the individual exception and uses this account’s assigned access settings—not directly editable Office Role defaults. " +
        (subject.office_profile_is_role_default === false ? "This account has a custom access assignment, different from its role’s mapped settings. " : "") +
        "Company, vessel and protected-system restrictions always apply.";
    const term = panel.querySelector("[data-search]").value.trim().toLowerCase();
    const only = panel.querySelector("[data-enabled]").checked;
    const canEdit = editable() && !busy;
    panel.querySelector("[data-modules]").innerHTML = !office(subject) || !diagnosticValid ? "" :
      config.modules.filter(m => `${m.name} ${m.code}`.toLowerCase().includes(term)).map(m => {
        const permissions = ACTIONS.flatMap(action => config.permissions.filter(p => p.module_id === m.id && p.action === action));
        if (!permissions.length || only && !permissions.some(p => ds.get(p.id)?.allowed)) return "";
        return `<article class="office-rights-module"><h3>${esc(m.name)}</h3>
          ${m.is_active === false ? '<p class="office-rights-module-note">Inactive module; grants cannot activate it.</p>' : ""}
          ${permissions.map(p => {
            const d = ds.get(p.id), old = os.get(p.id);
            const setting = draft.get(p.id) || (old ? old.is_granted ? "allow" : "deny" : "inherit");
            const hard = d?.source === "hard_constraint" && !d.allowed || m.is_active === false;
            return `<div class="office-rights-action" data-permission-row="${esc(p.id)}">
              <strong>${esc(p.action[0].toUpperCase() + p.action.slice(1))}</strong>
              <div class="office-rights-choice">
                <button type="button" class="btn2" data-permission="${esc(p.id)}" data-use-default
                  aria-pressed="${setting === "inherit"}" ${!canEdit || !old && !draft.has(p.id) ? "disabled" : ""}>Same as role</button>
                ${["allow", "deny"].map(choice => `<button type="button" class="btn2"
                  data-permission="${esc(p.id)}" data-choice="${choice}" aria-pressed="${setting === choice}"
                  ${!canEdit || hard ? "disabled" : ""}>${choice === "allow" ? "Allow" : "Deny"}</button>`).join("")}
              </div>
              <span class="office-rights-effective" data-allowed="${d?.allowed === true}">Backend: ${d?.allowed ? "Allowed" : "Denied"}</span>
              <small class="office-rights-origin">${esc(originLabel(d))}${setting === "inherit" ? " · No individual exception" : ""}${draft.has(p.id) ? ` · Proposed: ${setting === "inherit" ? "same as role" : setting} (not saved)` : ""}</small>
              ${d?.reason || hard ? `<small class="office-rights-reason">${esc(d?.reason || "Inactive module")}</small>` : ""}
            </div>`;
          }).join("")}</article>`;
      }).join("") || (office(subject) && diagnosticValid ? '<p>No modules match these filters.</p>' : "");
    panel.querySelector("[data-dirty]").textContent = draft.size ? `${draft.size} unsaved change(s). Backend results below remain the saved results until Save and verification.` : "";
    panel.querySelector("[data-save-users]").disabled = !canEdit || !draft.size;
    userSelect.disabled = busy;
    panel.querySelector("[data-reload]").disabled = busy;
    if (config) renderShared();
    window.dispatchEvent(new CustomEvent("csvb:rights-user", { detail: { user: subject } }));
  }
  function renderShared() {
    const code = profileSelect.value;
    const accessProfile = config.profiles.find(p => p.code === code);
    const affected = users.filter(u => profileCode(u) === code);
    sharedSection.querySelector("[data-affected]").textContent =
      `Shared profile: ${accessProfile?.display_name || code}. Affects ${affected.length} assigned user(s)` +
      `${affected.length ? ": " + affected.map(u => u.username).join(", ") : ""}. ` +
      `${accessProfile?.is_active ? "Profile active." : "Profile inactive."} These are profile settings, not a named user's effective access.`;
    const grants = new Map(config.grants.filter(g => g.access_profile_code === code).map(g => [g.permission_id, g]));
    sharedSection.querySelector("[data-shared-rows]").innerHTML = config.modules.flatMap(m =>
      config.permissions.filter(p => p.module_id === m.id && ACTIONS.includes(p.action)).map(p => {
        const setting = sharedDraft.get(p.id) || (grants.get(p.id)?.is_granted ? "allow" : "deny");
        return `<tr><td>${esc(m.name)}</td><td>${esc(p.action)}</td><td><select data-shared-permission="${esc(p.id)}"
          ${busy || m.code === "SU_ADMIN" || !m.is_active ? "disabled" : ""}>
          <option value="allow" ${setting === "allow" ? "selected" : ""}>Allow</option>
          <option value="deny" ${setting === "deny" ? "selected" : ""}>Deny</option></select></td></tr>`;
      })).join("");
    sharedSection.querySelector("[data-save-profile]").disabled = busy || !sharedDraft.size;
    sharedSection.querySelector("[data-shared-dirty]").textContent = sharedDraft.size ? `${sharedDraft.size} shared changes not saved` : "";
    profileSelect.disabled = busy;
  }
  async function reloadDiagnostic() {
    diagnosticValid = false;
    diagnostic = null;
    if (office(user())) {
      diagnostic = await rpc("csvb_admin_office_permission_diagnostic", { p_profile_id: selectedId });
      diagnosticValid = true;
    }
  }
  async function load() {
    if (busy) return false;
    let success = false;
    busy = true; diagnosticValid = false; render();
    try {
      const [nextConfig, nextUsers] = await Promise.all([
        rpc("csvb_admin_office_access_configuration"),
        rpc("csvb_admin_list_users_by_company_v2", { p_company_id: null })
      ]);
      config = nextConfig; users = nextUsers || [];
      userSelect.innerHTML = '<option value="">Select a user</option>' + users
        .slice().sort((a, b) => a.username.localeCompare(b.username))
        .map(u => `<option value="${esc(u.id)}">${esc(u.username)} — ${esc(roleLabel(u))}</option>`).join("");
      if (!users.some(u => u.id === selectedId)) selectedId = "";
      userSelect.value = selectedId;
      profileSelect.innerHTML = config.profiles.map(p =>
        `<option value="${esc(p.code)}">${esc(p.display_name)}${p.is_active ? "" : " (inactive)"}</option>`).join("");
      if (config.profiles.some(p => p.code === selectedProfile)) profileSelect.value = selectedProfile;
      selectedProfile = profileSelect.value;
      await reloadDiagnostic();
      loaded = true;
      success = true;
      window.dispatchEvent(new CustomEvent("csvb:rights-loaded", { detail: { config, users } }));
      message("Individual changes never update shared role settings. Saved results come from the backend permission check.");
    } catch (e) { message(`Permissions unavailable: ${e.message}`, true); }
    finally { busy = false; render(); }
    return success;
  }
  async function saveUser() {
    if (busy || !editable() || !draft.size) return;
    const reason = panel.querySelector("[data-reason]").value.trim();
    if (!reason) { message("Enter an audit reason before saving.", true); return; }
    const target = selectedId, changes = [...draft];
    busy = true; render();
    let saveError;
    const applied = [];
    try {
      for (const [permissionId, mode] of changes) {
        const old = overrides().get(permissionId);
        await rpc("csvb_admin_office_personal_override_save", {
          p_profile_id: target, p_permission_id: permissionId, p_mode: mode,
          p_scope: mode === "allow" ? old?.scope && old.scope !== "global" ? old.scope : "company" : null,
          p_reason: reason
        });
        applied.push([permissionId, mode]);
        draft.delete(permissionId);
      }
    } catch (e) { saveError = e; }
    try {
      await reloadDiagnostic();
      if (!diagnostic?.enforcement_enabled) throw Error("Office resolver is no longer enforcing this user's Access Profile");
      const ds = decisions(), os = overrides();
      const failures = applied.filter(([id, mode]) => mode === "allow" ? !ds.get(id)?.allowed
        : mode === "deny" ? ds.get(id)?.allowed || os.get(id)?.is_granted !== false : os.has(id));
      const detail = failures.map(([id]) => {
        const p = config.permissions.find(v => v.id === id), m = config.modules.find(v => v.id === p?.module_id);
        return `${m?.name || id} ${p?.action || ""}: ${ds.get(id)?.reason || "backend result did not match"}`;
      }).join("; ");
      message(saveError ? `Save stopped: ${saveError.message}. ${applied.length} change(s) saved; ${draft.size} remain unsaved. Backend reloaded.`
        : failures.length ? `Override(s) saved, but requested access was not confirmed: ${detail}. No effective grant is claimed.`
        : `Saved and backend-verified ${applied.length} user-specific change(s). Shared access settings unchanged.`,
      !!saveError || !!failures.length);
    } catch (e) {
      diagnosticValid = false;
      message(`Save ${saveError ? "stopped" : "returned"}, but backend verification failed: ${e.message}. Do not assume access changed; Reload before editing.`, true);
    }
    busy = false; render();
    window.CSVB_REFRESH_USER_DIRECTORY?.();
  }
  async function saveShared() {
    if (busy || !sharedDraft.size) return;
    const reason = sharedSection.querySelector("[data-shared-reason]").value.trim();
    if (!reason) { message("Enter an audit reason for the shared-profile change.", true); return; }
    const affected = users.filter(u => profileCode(u) === profileSelect.value);
    if (!confirm(`Change this shared Access Profile for ${affected.length} assigned user(s)? ${affected.map(u => u.username).join(", ")}. This is not a user-only change.`)) return;
    busy = true; render();
    try {
      await rpc("csvb_admin_office_access_save", {
        p_access_profile_code: profileSelect.value, p_reason: reason,
        p_changes: [...sharedDraft].map(([id, value]) => {
          const scope = config.grants.find(g => g.access_profile_code === profileSelect.value && g.permission_id === id)?.scope;
          return { permission_id: id, is_granted: value === "allow", scope: scope && scope !== "global" ? scope : "company" };
        })
      });
      sharedDraft.clear(); busy = false;
      const reloaded = await load();
      if (!reloaded) message("Shared profile saved, but its backend display could not be reloaded. Reload before editing further.", true);
      else if (diagnosticValid || !office(user())) message("Shared profile saved. Named-user backend results reloaded where applicable.");
    } catch (e) { message(`Shared profile save/reload failed: ${e.message}`, true); }
    finally { busy = false; render(); }
  }
  function install() {
    const workspace = document.getElementById("rmWorkspace");
    const selector = workspace?.querySelector(".rm-selector-panel");
    if (!selector || document.getElementById("officeRightsPanel")) return;
    const intro = workspace.querySelector(".rm-intro p");
    if (intro) intro.textContent = "Review role defaults, individual exceptions and company availability separately. Saved backend decisions remain authoritative.";
    panel = document.createElement("section");
    panel.id = "officeRightsPanel"; panel.className = "card";
    panel.innerHTML = `<div class="office-rights-heading"><h2>User permissions</h2>
      <label>Select user <select data-user><option value="">Select a user</option></select></label>
      <button type="button" class="btn2" data-reload>Reload backend permissions</button></div>
      <p class="office-rights-context" data-context></p><p class="office-rights-summary" data-policy></p>
      <p data-status role="status"></p><div class="office-rights-tools">
      <label>Find module <input type="search" data-search placeholder="Module name or code"></label>
      <label class="office-rights-only"><input type="checkbox" data-enabled> Show only modules with effective access</label></div>
      <p class="office-rights-dirty" data-dirty aria-live="polite"></p><div class="office-rights-grid" data-modules></div>
      <div class="office-rights-footer"><label>Audit reason <input data-reason maxlength="500"></label>
      <button type="button" class="btn" data-save-users disabled>Save User Rights</button></div>`;
    selector.before(panel);
    advanced = document.createElement("details"); advanced.id = "officeRightsAdvanced";
    advanced.innerHTML = `<summary>Advanced compatibility — shared Access Profiles and legacy role/rank defaults</summary>
      <p class="office-rights-warning">Shared-profile changes affect every assigned user. Legacy role/rank defaults are separate and do not control migrated Office users. Nothing here is changed by Save User Rights.</p>
      <label>Advanced configuration <select data-advanced-mode><option value="profile">Shared Access Profile</option><option value="legacy">Legacy role / rank defaults</option></select></label>`;
    panel.after(advanced);
    legacySection = document.createElement("div"); legacySection.hidden = true;
    legacySection.innerHTML = '<p class="office-rights-warning">Legacy configuration only. “Effective” below means role/position resolution, not a migrated Office user’s backend permissions.</p>';
    const oldNodes = [document.getElementById("rmContext"), selector, workspace.querySelector(".rm-controls"),
      document.getElementById("rmGroups"), document.getElementById("rmSave")?.closest("footer")].filter(Boolean);
    oldNodes.forEach(node => legacySection.append(node)); advanced.append(legacySection);
    sharedSection = document.createElement("section");
    sharedSection.innerHTML = `<h3>Shared Access Profile</h3><label>Access Profile <select data-profile></select></label>
      <p data-affected class="office-rights-warning"></p><div style="overflow:auto;max-height:55vh"><table>
      <thead><tr><th>Module</th><th>Action</th><th>Shared profile setting (not effective user access)</th></tr></thead>
      <tbody data-shared-rows></tbody></table></div><label>Shared-change audit reason <input data-shared-reason maxlength="500"></label>
      <span data-shared-dirty></span><button type="button" class="btn2" data-save-profile disabled>Save Shared Profile</button>`;
    advanced.append(sharedSection);
    userSelect = panel.querySelector("[data-user]"); profileSelect = sharedSection.querySelector("[data-profile]");
    document.addEventListener("click", event => {
      if (event.target.closest('[data-tab="rights"]') && !loaded) void load();
    });
    userSelect.addEventListener("change", async () => {
      if (busy || !dirtyGuard()) { userSelect.value = selectedId; return; }
      draft.clear(); sharedDraft.clear(); selectedId = userSelect.value;
      busy = true; diagnosticValid = false; render();
      try { await reloadDiagnostic(); message("Backend effective permissions loaded. No changes saved."); }
      catch (e) { message(`Backend verification unavailable: ${e.message}`, true); }
      finally { busy = false; render(); }
    });
    panel.querySelector("[data-reload]").addEventListener("click", () => {
      if (dirtyGuard()) { draft.clear(); sharedDraft.clear(); void load(); }
    });
    panel.querySelector("[data-search]").addEventListener("input", render);
    panel.querySelector("[data-enabled]").addEventListener("change", render);
    panel.querySelector("[data-save-users]").addEventListener("click", saveUser);
    panel.addEventListener("click", event => {
      const node = event.target.closest("[data-permission]");
      if (!node || busy || !editable() || node.disabled) return;
      const mode = node.hasAttribute("data-use-default") ? "inherit" : node.dataset.choice;
      const old = overrides().get(node.dataset.permission);
      const original = old ? old.is_granted ? "allow" : "deny" : "inherit";
      if (mode === original) draft.delete(node.dataset.permission); else draft.set(node.dataset.permission, mode);
      render();
    });
    advanced.querySelector("[data-advanced-mode]").addEventListener("change", event => {
      legacySection.hidden = event.target.value !== "legacy"; sharedSection.hidden = event.target.value !== "profile";
    });
    profileSelect.addEventListener("change", () => {
      if (sharedDraft.size && !confirm("Discard unsaved shared-profile changes?")) { profileSelect.value = selectedProfile; return; }
      sharedDraft.clear(); selectedProfile = profileSelect.value; renderShared();
    });
    sharedSection.addEventListener("change", event => {
      const node = event.target.closest("[data-shared-permission]");
      if (!node || busy) return;
      const old = config.grants.find(g => g.access_profile_code === profileSelect.value && g.permission_id === node.dataset.sharedPermission);
      if (node.value === (old?.is_granted ? "allow" : "deny")) sharedDraft.delete(node.dataset.sharedPermission);
      else sharedDraft.set(node.dataset.sharedPermission, node.value);
      renderShared();
    });
    sharedSection.querySelector("[data-save-profile]").addEventListener("click", saveShared);
    window.addEventListener("beforeunload", event => {
      if (draft.size || sharedDraft.size) { event.preventDefault(); event.returnValue = ""; }
    });
    render();
    if (document.getElementById("tab-rights")?.style.display !== "none") void load();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
