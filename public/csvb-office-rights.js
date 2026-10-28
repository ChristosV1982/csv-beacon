/* Additional Rights Matrix contexts; the existing Role/Rank workspace is intact. */
(() => {
  "use strict";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let config, users, diagnostic, busy = false, draft = new Map(), panel, mode, subject, loadedSubject = "", oldContext;
  const client = () => window.AUTH.ensureSupabase();
  async function rpc(name, args = {}) {
    const { data, error } = await client().rpc(name, args);
    if (error) throw Error(error.message);
    return data;
  }
  function status(text) { panel.querySelector("[data-status]").textContent = text; }
  function render() {
    const selected = subject.value;
    const personal = mode.value === "user";
    const grants = new Map((config.grants || []).filter(g => g.access_profile_code === selected)
      .map(g => [g.permission_id, g]));
    const overrides = new Map((diagnostic?.overrides || []).map(g => [g.permission_id, g]));
    const decisions = new Map((diagnostic?.permissions || []).map(g => [g.permission_id, g.decision]));
    panel.querySelector("[data-enforced]").textContent = personal
      ? `${diagnostic?.enforcement_enabled ? "Enforced" : "Legacy fallback / no enforced assignment"}${diagnostic?.custom_permissions_applied ? " · Custom permissions applied" : ""}`
      : config.enforcement_enabled && config.profiles.find(p => p.code === selected)?.is_active
        ? "Enforced Access Profile" : "Inactive / enforcement pending";
    mode.disabled = busy; subject.disabled = busy;
    const context = document.querySelector("#rmContext strong");
    if (context && mode.value !== "role") context.textContent =
      `${personal ? "Office user" : "Access Profile"} — ${subject.selectedOptions[0]?.textContent || ""}`;
    panel.querySelector("[data-rows]").innerHTML = config.modules.flatMap(m =>
      config.permissions.filter(p => p.module_id === m.id && ["view", "edit", "export", "admin", "review"].includes(p.action))
        .map(p => {
          const current = personal ? overrides.has(p.id)
            ? overrides.get(p.id).is_granted ? "allow" : "deny" : "inherit"
            : grants.get(p.id)?.is_granted ? "allow" : "deny";
          const value = draft.get(p.id) || current;
          const d = decisions.get(p.id);
          return `<tr><td>${esc(m.name)}</td><td>${esc(p.action)}</td><td>
            <select data-permission="${esc(p.id)}" data-original="${current}" ${m.code === "SU_ADMIN" ? "disabled" : ""}>
            ${personal ? `<option value="inherit" ${value === "inherit" ? "selected" : ""}>Inherited</option>` : ""}
            <option value="allow" ${value === "allow" ? "selected" : ""}>Allow</option>
            <option value="deny" ${value === "deny" ? "selected" : ""}>Deny</option></select></td>
            <td>${personal ? `${d?.allowed ? "Allowed" : "Denied"} · ${esc(d?.source || "")}${d?.reason ? ` · ${esc(d.reason)}` : ""}`
              : m.code === "SU_ADMIN" ? "Protected system administration" : value === "allow" ? "Allowed within company/vessel scope" : "Denied"}</td></tr>`;
        })).join("");
    panel.querySelector("[data-save]").disabled = busy || !draft.size;
    panel.querySelector("[data-dirty]").textContent = draft.size ? `${draft.size} unsaved changes` : "";
  }
  async function load() {
    if (busy) return;
    busy = true; draft.clear();
    mode.disabled = true; subject.disabled = true;
    try {
      config = await rpc("csvb_admin_office_access_configuration");
      if (mode.value === "user") {
        users = await rpc("csvb_admin_list_users_by_company_v2", { p_company_id: null });
        const old = subject.value;
        subject.innerHTML = (users || []).filter(u => ["company_admin", "company_superintendent"].includes(u.role || u.role_name))
          .map(u => `<option value="${esc(u.id)}">${esc(u.username)} — ${esc(u.office_role_label || u.role || u.role_name)}</option>`).join("");
        if ([...subject.options].some(o => o.value === old)) subject.value = old;
        diagnostic = subject.value
          ? await rpc("csvb_admin_office_permission_diagnostic", { p_profile_id: subject.value }) : null;
      } else {
        const old = subject.value;
        subject.innerHTML = config.profiles.map(p => `<option value="${esc(p.code)}">${esc(p.display_name)}</option>`).join("");
        if ([...subject.options].some(o => o.value === old)) subject.value = old;
        diagnostic = null;
      }
      loadedSubject = subject.value;
      status("Personal Deny → personal Allow → Access Profile. Hard system and company/vessel constraints always apply.");
    } catch (error) { status(error.message); }
    finally { busy = false; if (config) render(); }
  }
  async function save() {
    if (busy || !draft.size) return;
    const reason = panel.querySelector("[data-reason]").value.trim();
    if (!reason) { status("Enter an audit reason before saving."); return; }
    busy = true; render();
    try {
      if (mode.value === "profile") {
        await rpc("csvb_admin_office_access_save", {
          p_access_profile_code: subject.value, p_reason: reason,
          p_changes: [...draft].map(([permission_id, value]) => ({
            permission_id, is_granted: value === "allow",
            scope: config.grants.find(g => g.access_profile_code === subject.value &&
              g.permission_id === permission_id)?.scope === "global" ? "company" :
              config.grants.find(g => g.access_profile_code === subject.value &&
                g.permission_id === permission_id)?.scope || "company",
          })),
        });
        draft.clear();
      } else {
        // Audited per-cell RPCs; successful cells are never automatically retried.
        for (const [p_permission_id, p_mode] of [...draft]) {
          await rpc("csvb_admin_office_personal_override_save", {
            p_profile_id: subject.value, p_permission_id, p_mode,
            p_scope: p_mode === "allow" ? "company" : null, p_reason: reason,
          });
          draft.delete(p_permission_id);
        }
      }
      busy = false; await load(); status("Rights saved. Reload the affected user's module to refresh its controls.");
      window.CSVB_REFRESH_USER_DIRECTORY?.();
    } catch (error) {
      if (mode.value === "user") {
        try { diagnostic = await rpc("csvb_admin_office_permission_diagnostic", { p_profile_id: subject.value }); } catch {}
      }
      status(`Save stopped: ${error.message}. ${draft.size} changes remain unsaved.`);
    }
    finally { busy = false; render(); }
  }
  function install() {
    const workspace = document.querySelector("#rmRole")?.closest(".rm-workspace") ||
      document.querySelector("#rmRole")?.closest("section.card") ||
      document.querySelector("#rmRole")?.closest("[data-tab-panel]");
    const selector = document.querySelector("#rmRole")?.closest(".rm-selector-panel");
    if (!selector || document.getElementById("officeRightsMode")) return;
    const field = document.createElement("div");
    field.className = "rm-field";
    field.innerHTML = `<label for="officeRightsMode">Configure</label><select id="officeRightsMode">
      <option value="role">Role / Rank defaults</option><option value="profile">Access Profile</option>
      <option value="user">User overrides / Diagnostics</option></select>`;
    selector.before(field);
    const style = document.createElement("style");
    style.textContent = ".csvb-office-rights-hidden,#officeRightsPanel[hidden]{display:none!important}";
    document.head.append(style);
    mode = field.querySelector("select");
    panel = document.createElement("section");
    panel.hidden = true;
    panel.id = "officeRightsPanel";
    panel.className = "card";
    panel.innerHTML = `<div class="row"><label>Access Profile / Office user <select data-subject></select></label>
      <button type="button" data-reload>Reload</button><strong data-enforced></strong></div>
      <p data-status role="status"></p><div style="overflow:auto;max-height:65vh"><table>
      <thead><tr><th>Module</th><th>Action</th><th>Setting</th><th>Effective result / Source</th></tr></thead>
      <tbody data-rows></tbody></table></div><div class="row">
      <label>Audit reason <input data-reason type="text" maxlength="500"></label>
      <span data-dirty></span><button type="button" data-save disabled>Save Rights</button></div>`;
    field.after(panel);
    subject = panel.querySelector("[data-subject]");
    const oldElements = [selector, document.querySelector(".rm-controls"),
      document.getElementById("rmGroups"), document.getElementById("rmSave")?.closest("footer")].filter(Boolean);
    mode.addEventListener("change", async () => {
      if (draft.size && !confirm("Discard unsaved permission changes?")) { mode.value = panel.dataset.mode || "profile"; return; }
      if (!oldContext) oldContext = document.getElementById("rmContext")?.innerHTML;
      oldElements.forEach(n => {
        n.hidden = mode.value !== "role";
        n.classList.toggle("csvb-office-rights-hidden", mode.value !== "role");
      });
      if (mode.value === "role" && oldContext) document.getElementById("rmContext").innerHTML = oldContext;
      panel.hidden = mode.value === "role";
      panel.dataset.mode = mode.value;
      if (!panel.hidden) await load();
    });
    subject.addEventListener("change", async () => {
      if (draft.size && !confirm("Discard unsaved permission changes?")) {
        subject.value = loadedSubject; return;
      }
      await load();
    });
    panel.querySelector("[data-reload]").addEventListener("click", load);
    panel.querySelector("[data-save]").addEventListener("click", save);
    panel.addEventListener("change", event => {
      const n = event.target.closest("[data-permission]");
      if (!n) return;
      if (n.value === n.dataset.original) draft.delete(n.dataset.permission);
      else draft.set(n.dataset.permission, n.value);
      render();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
