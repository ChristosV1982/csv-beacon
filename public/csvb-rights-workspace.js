/* Rights Matrix presentation only. Server RPCs remain authoritative.
 * The vessel ceiling mirrors csvb_vessel_rank_policy; this is not authorization.
 */
(function (root) {
  "use strict";
  const ACTIONS = ["view", "edit", "export", "admin"];
  const LABELS = { super_admin: "Super Admin", platform_owner: "Platform Owner",
    company_admin: "Company Admin", company_superintendent: "Company Superintendent",
    vessel: "Vessel / Onboard Personnel", inspector: "Inspector / Third Party" };
  const SCOPES = { vessel_assigned: "Assigned Vessel", vessel_any: "Permitted Vessels",
    company: "Company", global: "Platform" };
  // Dashboard card aliases; ordinary card keys already match lower-case module codes.
  const CARD_CODES = { library: "QUESTION_LIBRARY", compare: "PRE_POST_COMPARE",
    vessel: "VESSEL_QUESTIONNAIRES", tasks: "SELF_ASSESSMENT_TASKS", company: "COMPANY_BUILDER",
    assignments: "SELF_ASSESSMENT_ASSIGNMENTS", post: "POST_INSPECTION",
    vetting_planner: "VETTING_INSPECTION_PLANNER", poststats: "POST_INSPECTION_STATS",
    inspector: "INSPECTOR_THIRD_PARTY", qeditor: "QUESTIONS_EDITOR", suadmin: "SU_ADMIN" };
  function canonicalRank(value) {
    return ({ master: "master", chiefofficer: "chief_officer", chiefengineer: "chief_engineer",
      secondengineer: "second_engineer", "2ndengineer": "second_engineer" })[
      String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "")] || "";
  }
  function vesselCeiling(code, action, rank) {
    if (code === "SIRE_QUESTIONS_VIEWER") return action === "view";
    if (!["view", "edit"].includes(action)) return false;
    if (code === "SIRE_FLEET_VETTING_EXPERIENCE")
      return ["master", "chief_officer", "chief_engineer", "second_engineer"].includes(rank);
    return ["MOORING_ANCHORING_INVENTORIES", "PORT_CALL_INTELLIGENCE",
      "PORTABLE_LIFTING_APPLIANCES_WIRES"].includes(code) && ["master", "chief_officer"].includes(rank);
  }
  const valueOf = grant => grant ? { mode: grant.is_granted ? "allow" : "deny",
    scope: grant.scope || "global" } : { mode: "inherit", scope: "global" };
  const same = (a, b) => a.mode === b.mode && (a.mode !== "allow" || a.scope === b.scope);
  function resolve({ role, position, rank, module, action, base, override }) {
    if (module.is_active === false) return { allowed: false, reason: "Module inactive" };
    if (["super_admin", "platform_owner"].includes(role))
      return { allowed: true, scope: "global", reason: "Built-in platform access" };
    const canonical = canonicalRank(rank);
    const ignoresOverride = role === "vessel" && !canonical;
    const grant = position && !ignoresOverride && override?.mode !== "inherit" ? override : base;
    if (role === "vessel" && !vesselCeiling(module.code, action, canonical))
      return { allowed: false, reason: position ? "Blocked by vessel-rank policy" : "Rank-specific policy applies" };
    const allowed = grant?.mode === "allow";
    return { allowed, scope: role === "vessel"
      ? (["SIRE_QUESTIONS_VIEWER", "SIRE_FLEET_VETTING_EXPERIENCE"].includes(module.code) &&
        action === "view" ? "company" : "vessel_assigned") : grant?.scope,
      reason: ignoresOverride && position ? "Role default applies; backend ignores overrides for this rank" :
        position && override?.mode === "inherit" ? "Inherited" : "" };
  }

  function create({ getClient, callAdmin, onRoles }) {
    const $ = id => document.getElementById(id);
    let meta, defaults = new Map(), overrides = new Map(), draft = new Map();
    let role = "", position = "", busy = false, ready = false, generation = 0, bound = false, loadPromise;
    const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const status = text => { $("rmStatus").textContent = text; };
    const platform = () => ["super_admin", "platform_owner"].includes(role);
    const baseline = id => valueOf((position ? overrides : defaults).get(String(id)));
    const current = id => draft.get(String(id)) || baseline(id);
    const label = value => value?.mode === "allow" ? `Allowed · ${SCOPES[value.scope] || value.scope}` : "Denied";
    const rankCode = () => meta.ranks.find(r => r.rank_name === position)?.rank_code || position;
    const result = (mod, perm) => resolve({ role, position, rank: rankCode(), module: mod,
      action: perm.action, base: valueOf(defaults.get(String(perm.id))),
      override: position ? current(perm.id) : { mode: "inherit" },
      // Role defaults being edited must participate in preview too.
      ...(position ? {} : { base: current(perm.id) }) });
    function buttons() {
      $("rmSave").disabled = busy || !ready || !draft.size || platform();
      $("rmReload").disabled = busy;
      $("rmRole").disabled = busy;
      $("rmPosition").disabled = busy;
      $("rmReset").disabled = busy || !ready || !position || platform() || (!overrides.size && !draft.size);
      $("rmDirty").hidden = !draft.size;
      $("rmDirty").classList.toggle("is-dirty", !!draft.size);
      $("rmDirty").textContent = draft.size ? `${draft.size} unsaved change${draft.size === 1 ? "" : "s"}` : "";
    }
    function stage(id, value) {
      id = String(id);
      if (same(value, baseline(id))) draft.delete(id); else draft.set(id, value);
      render();
    }
    function render() {
      if (!meta || !ready) { buttons(); return; }
      $("rmContext").textContent = `Editing: ${LABELS[role] || role} / ${position || "Role defaults"}`;
      $("rmPolicyNote").textContent = platform()
        ? "Platform administrators have built-in access to active modules. Matrix grants cannot restrict that access."
        : role === "vessel"
          ? "Rights apply across companies. Deny by default: the vessel-rank allowlist still applies and cannot be bypassed. Company enablement, vessel assignment and onboard restrictions apply separately."
          : "Rights apply across companies. Position overrides take precedence over role defaults; inherited rights follow future defaults. Company enablement and account restrictions apply separately.";
      const term = $("rmSearch").value.trim().toLowerCase();
      const enabledOnly = $("rmEnabledOnly").checked;
      const groups = new Map(meta.areas.map(a => [a.area_key, { title: a.title, modules: [] }]));
      groups.set("_other", { title: "Other registered modules", modules: [] });
      for (const mod of meta.modules) {
        const perms = meta.permissions.filter(p => String(p.module_id) === String(mod.id) && ACTIONS.includes(p.action));
        const allowed = perms.some(p => result(mod, p).allowed);
        if (!`${mod.name} ${mod.code}`.toLowerCase().includes(term) || (enabledOnly && !allowed)) continue;
        const area = meta.areas.find(a => (a.module_cards || []).some(key =>
          (CARD_CODES[key] || key.toUpperCase()) === mod.code));
        groups.get(area?.area_key || "_other").modules.push({ mod, perms, allowed });
      }
      const blocks = [];
      for (const group of groups.values()) {
        if (!group.modules.length) continue;
        blocks.push(`<section class="rm-area"><h2 class="rm-area-heading">${esc(group.title)} <small>${group.modules.length} modules</small></h2>`);
        for (const { mod, perms, allowed } of group.modules) {
          blocks.push(`<article class="rm-module ${allowed ? "is-allowed" : "is-denied"}"><div class="rm-module-head"><h3 class="rm-module-title">${esc(mod.name || mod.code)}</h3><span class="rm-module-state">${allowed ? "Rights enabled" : "No access"}</span></div><div class="rm-actions-grid">`);
          if (!perms.length) blocks.push("<p>No supported View / Edit / Export / Admin permissions are registered.</p>");
          for (const action of ACTIONS) {
            const p = perms.find(p => p.action === action);
            if (!p) continue;
            const id = String(p.id), base = valueOf(defaults.get(id)), cur = current(id), effective = result(mod, p);
            const inherited = !!position && cur.mode === "inherit";
            const blocked = role === "vessel" && (!vesselCeiling(mod.code, action, canonicalRank(rankCode())) ||
              (!!position && !canonicalRank(rankCode())));
            const disabled = busy || platform() || blocked || mod.is_active === false;
            blocks.push(`<div class="rm-action ${effective.allowed ? "is-allowed" : "is-denied"} ${inherited ? "is-inherited" : ""} ${blocked ? "is-blocked" : ""} ${draft.has(id) ? "is-dirty" : ""}">
              <strong class="rm-action-label">${esc(action[0].toUpperCase() + action.slice(1))}</strong>
              <div class="rm-default">Role default: ${esc(label(base))}</div>
              <label class="rm-control">${position ? (role === "vessel" ? "Rank override" : "Position override") : "Role default"}
                <select data-right="${esc(id)}" aria-label="${esc(mod.name || mod.code)} — ${esc(action)}" ${disabled ? "disabled" : ""}>
                  ${position || baseline(id).mode === "inherit" ? `<option value="inherit" ${inherited || cur.mode === "inherit" ? "selected" : ""}>${position ? "Inherited · use role default" : "Denied · no default grant"}</option>` : ""}
                  <option value="deny" ${cur.mode === "deny" ? "selected" : ""}>Denied</option>
                  <option value="allow" ${cur.mode === "allow" ? "selected" : ""}>Allowed</option>
                </select></label>
              ${cur.mode === "allow" ? `<label class="rm-scope">Scope <select data-scope="${esc(id)}" aria-label="${esc(mod.name || mod.code)} — ${esc(action)} scope" ${disabled ? "disabled" : ""}>${Object.entries(SCOPES).map(([s, l]) =>
                `<option value="${s}" ${s === cur.scope ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
              <div class="rm-effective">Effective: <strong>${esc(effective.allowed ? `Allowed · ${SCOPES[effective.scope] || effective.scope}` : "Denied")}</strong>${effective.reason ? `<small>${esc(effective.reason)}</small>` : ""}</div>
            </div>`);
          }
          blocks.push("</div></article>");
        }
        blocks.push("</section>");
      }
      $("rmGroups").innerHTML = blocks.join("") || '<p class="rm-empty">No modules match these filters.</p>';
      buttons();
    }
    function positions(selected = "") {
      const vessel = $("rmRole").value === "vessel";
      const values = vessel ? [...new Set(meta.ranks.map(r => r.rank_name))] : meta.positions;
      $("rmPosition").innerHTML = `<option value="">${vessel ? "All ranks · role defaults" : "Role defaults · no position"}</option>` +
        values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      $("rmPosition").value = values.includes(selected) ? selected : "";
      const field = $("rmPosition").closest(".rm-field");
      field.hidden = !vessel && !values.length;
      field.querySelector("label").textContent = vessel ? "Onboard Rank" : "Position (optional)";
    }
    async function loadMeta() {
      if (meta) return;
      const [mp, rp, areas, ranks] = await Promise.all([
        callAdmin({ action: "list_modules_permissions" }), callAdmin({ action: "list_roles_positions" }),
        getClient().rpc("csvb_dashboard_list_platform_areas"),
        getClient().from("onboard_ranks").select("id,rank_code,rank_name,sort_order").eq("is_active", true).order("sort_order")
      ]);
      if (areas.error || ranks.error) throw areas.error || ranks.error;
      meta = { modules: mp.modules || [], permissions: mp.permissions || [], roles: rp.roles || [],
        positions: rp.positions || [], ranks: ranks.data || [], areas: areas.data || [] };
      onRoles?.(meta.roles);
      $("rmRole").innerHTML = meta.roles.map(r => `<option value="${esc(r)}">${esc(LABELS[r] || r)}</option>`).join("");
      positions();
    }
    async function reload() {
      if (busy) return;
      busy = true;
      ready = false;
      buttons();
      const token = ++generation;
      try {
        await loadMeta();
        role = $("rmRole").value;
        position = $("rmPosition").value;
        status("Loading role defaults and overrides…");
        const [base, selected] = await Promise.all([
          callAdmin({ action: "get_role_permissions", role, position: null }),
          position ? callAdmin({ action: "get_role_permissions", role, position }) : Promise.resolve({ grants: [] })
        ]);
        if (token !== generation) return;
        defaults = new Map((base.grants || []).map(g => [String(g.permission_id), g]));
        overrides = new Map((selected.grants || []).map(g => [String(g.permission_id), g]));
        draft.clear();
        ready = true;
        status("Loaded · company/account restrictions apply separately");
      } catch (e) {
        $("rmGroups").textContent = "Permissions could not be loaded. Reload before making changes.";
        status(`Load failed: ${e.message || e}`);
        // Never permit saving stale data under a newly selected context.
        draft.clear();
        return false;
      } finally { busy = false; buttons(); }
      render();
      return true;
    }
    async function save() {
      if (busy || !ready || !draft.size || platform()) return;
      busy = true;
      render();
      const grants = [...draft].map(([permission_id, v]) => v.mode === "inherit"
        ? { permission_id, inherit: true }
        : { permission_id, scope: v.mode === "allow" ? v.scope : "global", is_granted: v.mode === "allow" });
      try {
        status("Saving changed rights with audit trail…");
        const { error } = await getClient().rpc("csvb_set_role_permissions_audited",
          { p_role: role, p_position: position || null, p_grants: grants });
        if (error) throw error;
        busy = false;
        const reloaded = await reload();
        status(reloaded ? "Saved and reloaded · audit trail recorded" :
          "Rights saved, but display reload failed. Reload before editing.");
      } catch (e) { status(`Save failed: ${e.message || e}. Changes remain unsaved.`); }
      finally { busy = false; render(); }
    }
    function bind() {
      if (bound) return;
      bound = true;
      $("rmGroups").addEventListener("change", e => {
        const id = e.target.dataset.right || e.target.dataset.scope;
        if (!id || busy) return;
        const old = current(id);
        stage(id, e.target.dataset.scope
          ? { mode: "allow", scope: e.target.value }
          : { mode: e.target.value, scope: old.mode === "allow" ? old.scope : role === "vessel" ? "vessel_assigned" : "company" });
      });
      const discard = () => !draft.size || root.confirm("Discard unsaved Rights Matrix changes?");
      $("rmRole").addEventListener("change", () => {
        if (!discard()) { $("rmRole").value = role; return; }
        positions();
        void reload();
      });
      $("rmPosition").addEventListener("change", () => {
        if (!discard()) { $("rmPosition").value = position; return; }
        void reload();
      });
      $("rmReload").addEventListener("click", () => { if (discard()) void reload(); });
      $("rmSave").addEventListener("click", () => { void save(); });
      $("rmReset").addEventListener("click", () => {
        if (busy || !position || platform()) return;
        if (!root.confirm(`Reset ${LABELS[role] || role} / ${position} to role defaults? This stages removal of its explicit overrides across all modules. It affects this role/position across companies. Press Save Rights to apply with audit logging.`)) return;
        draft.clear();
        for (const id of overrides.keys()) draft.set(id, { mode: "inherit", scope: "global" });
        render();
      });
      $("rmSearch").addEventListener("input", render);
      $("rmEnabledOnly").addEventListener("change", render);
      root.addEventListener("beforeunload", e => { if (draft.size) { e.preventDefault(); e.returnValue = ""; } });
      buttons();
    }
    return { bind, load: () => {
      if (!loadPromise) loadPromise = reload().finally(() => { loadPromise = null; });
      return loadPromise;
    }, reload, save };
  }
  const api = { create, resolve, vesselCeiling, canonicalRank };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CSVBRightsWorkspace = api;
})(typeof window !== "undefined" ? window : globalThis);
