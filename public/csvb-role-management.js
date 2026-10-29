(function () {
  "use strict";

  const CATALOGUE_RPC = "csvb_role_catalogue_list";
  const CHANGE_RPC = "csvb_role_catalogue_change";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function display(value, fallback) {
    return value === null || value === undefined || value === "" ? fallback : value;
  }

  function formatCount(value) {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count.toLocaleString() : "—";
  }

  function formatTime(value) {
    if (!value) return "Time unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function errorMessage(error) {
    return error && error.message ? error.message : String(error || "Request failed.");
  }

  function isProtected(role) {
    return role.is_protected === true || role.classification === "System";
  }

  function canManage(role) {
    return ["Office", "Demo"].includes(role.classification) && !isProtected(role);
  }

  function init(options) {
    const sb = options && options.sb;
    const host = document.getElementById("roleManagementWorkspace");
    if (!host || !sb || typeof sb.rpc !== "function") return;
    if (host.dataset.roleManagementReady === "true") return;
    host.dataset.roleManagementReady = "true";

    host.innerHTML = [
      '<div class="csvb-role-workspace">',
      '  <header class="csvb-role-intro">',
      '    <div>',
      '      <div class="csvb-role-eyebrow">C.S.V. BEACON <span>/</span> SUPERUSER CONTROLS</div>',
      '      <h1>Role catalogue</h1>',
      '      <p>Review role identities separately from Access Profiles. Manual Office assignments are made in Users → Edit. Demo User is a role, not Demo Mode.</p>',
      '    </div>',
      '    <div class="csvb-role-intro-actions">',
      '      <button class="csvb-role-button csvb-role-button-secondary" type="button" data-action="refresh">Refresh</button>',
      '      <button class="csvb-role-button csvb-role-button-primary" type="button" data-action="create">Create Office Role</button>',
      '    </div>',
      '  </header>',
      '  <div class="csvb-role-boundary" role="note">',
      '    <span class="csvb-role-boundary-mark" aria-hidden="true">i</span>',
      '    <div><strong>Assignment and authorization are separate</strong><span>New catalogue entries remain draft until explicitly enabled. Assigned Access Profiles control ordinary Office access when backend enforcement is active; unassigned legacy accounts keep their existing fallback. Creating or renaming a role does not assign users.</span></div>',
      '  </div>',
      '  <div class="csvb-role-feedback" data-role-feedback role="status" aria-live="polite"></div>',
      '  <section class="csvb-role-section" aria-labelledby="csvbRoleTableHeading">',
      '    <div class="csvb-role-section-head">',
      '      <div><div class="csvb-role-section-kicker">CURRENT CATALOGUE</div><h2 id="csvbRoleTableHeading">Roles</h2></div>',
      '      <div class="csvb-role-count" data-role-count aria-live="polite"></div>',
      '    </div>',
      '    <div class="csvb-role-table-scroll" role="region" aria-label="Role catalogue table" tabindex="0">',
      '      <table class="csvb-role-table">',
      '        <thead><tr><th scope="col">Display Name</th><th scope="col">Stable Code/ID</th><th scope="col">Classification</th><th scope="col">State</th><th scope="col">Assigned User Count</th><th scope="col">Permission/Reference Count</th><th scope="col">Status / protection</th><th scope="col"><span class="csvb-role-sr-only">Actions</span></th></tr></thead>',
      '        <tbody data-role-rows><tr><td colspan="8"><div class="csvb-role-loading" aria-label="Loading role catalogue"><span></span><span></span><span></span></div></td></tr></tbody>',
      '      </table>',
      '    </div>',
      '    <div class="csvb-role-mobile-note">Swipe horizontally to review all role details.</div>',
      '  </section>',
      '  <section class="csvb-role-section csvb-role-audit" aria-labelledby="csvbRoleAuditHeading">',
      '    <div class="csvb-role-section-head"><div><div class="csvb-role-section-kicker">CHANGE HISTORY</div><h2 id="csvbRoleAuditHeading">Recent catalogue activity</h2></div></div>',
      '    <div class="csvb-role-audit-list" data-role-audit><div class="csvb-role-audit-loading">Loading activity…</div></div>',
      '  </section>',
      '  <dialog class="csvb-role-dialog" data-role-dialog aria-labelledby="csvbRoleDialogTitle"></dialog>',
      '</div>'
    ].join("");

    const rows = host.querySelector("[data-role-rows]");
    const audit = host.querySelector("[data-role-audit]");
    const feedback = host.querySelector("[data-role-feedback]");
    const count = host.querySelector("[data-role-count]");
    const dialog = host.querySelector("[data-role-dialog]");
    let catalogue = [];
    let loaded = false;
    let loading = false;
    let pending = false;
    let isolatedInitializationAvailable = false;
    let assignmentSnapshot = null;

    function announce(message, kind) {
      feedback.textContent = message || "";
      feedback.className = "csvb-role-feedback" + (kind ? " is-" + kind : "");
      feedback.hidden = !message;
    }

    function renderRoles() {
      count.textContent = catalogue.length + (catalogue.length === 1 ? " role" : " roles");
      if (!catalogue.length) {
        rows.innerHTML = '<tr><td colspan="8"><div class="csvb-role-empty"><strong>No roles in the catalogue.</strong><span>Refresh to check for newly available records.</span></div></td></tr>';
        return;
      }
      rows.innerHTML = catalogue.map(function (role) {
        const code = escapeHtml(display(role.code, "—"));
        const name = escapeHtml(display(role.display_name, "Unnamed role"));
        const classification = escapeHtml(display(role.organizational_classification || role.classification, "—"));
        const profile = role.proposed_access_profile_label
          ? '<small class="csvb-role-protection" title="' + escapeHtml(role.profile_notes || "") +
            '">Proposed access: ' + escapeHtml(role.proposed_access_profile_label) + '</small>'
          : "";
        const active = role.is_active === true;
        const protectedRole = isProtected(role);
        const editable = canManage(role);
        const status = escapeHtml(display(role.status, protectedRole ? display(role.protection_reason, "Protected role") : "Office role"));
        const protection = protectedRole && role.protection_reason
          ? '<small class="csvb-role-protection">' + escapeHtml(role.protection_reason) + "</small>"
          : "";
        const disabledDelete = role.ever_used === true || !!role.deletion_block_reason ||
          Number(role.assigned_user_count || 0) > 0 || Number(role.permission_reference_count || 0) > 0;
        let actions = '<span class="csvb-role-locked" aria-label="Protected role; no actions available">Protected</span>';
        if (editable) {
          actions = [
            '<div class="csvb-role-actions">',
            '<button class="csvb-role-action" type="button" data-action="rename" data-code="' + code + '">Rename</button>',
            '<button class="csvb-role-action" type="button" data-action="' + (active ? "deactivate" : "activate") + '" data-code="' + code + '">' + (active ? "Deactivate" : "Activate") + "</button>",
            role.can_enable_assignment === true ? '<button class="csvb-role-action" type="button" data-action="enable_assignment" data-code="' + code + '">Enable user assignment</button>' : "",
            '<button class="csvb-role-action is-danger" type="button" data-action="delete" data-code="' + code + '"' + (disabledDelete ? ' disabled title="' + escapeHtml(role.deletion_block_reason || "Remove user and permission references before deleting") + '"' : "") + '>Delete</button>',
            "</div>"
          ].join("");
        }
        return [
          "<tr>",
          '<th scope="row" class="csvb-role-name">' + name + "</th>",
          '<td><code class="csvb-role-code">' + code + "</code></td>",
          '<td><span class="csvb-role-classification">' + classification + "</span>" + profile + "</td>",
          '<td><span class="csvb-role-state ' + (active ? "is-active" : "is-inactive") + '">' + (active ? "Active" : "Inactive") + "</span></td>",
          '<td class="csvb-role-number">' + formatCount(role.assigned_user_count) + "</td>",
          '<td class="csvb-role-number">' + formatCount(role.permission_reference_count) + "</td>",
          '<td class="csvb-role-status">' + status + protection + "</td>",
          '<td class="csvb-role-action-cell">' + actions + "</td>",
          "</tr>"
        ].join("");
      }).join("");
    }

    function renderAudit(entries) {
      const events = Array.isArray(entries) ? entries : [];
      if (!events.length) {
        audit.innerHTML = '<div class="csvb-role-empty csvb-role-empty-audit"><strong>No catalogue activity yet.</strong><span>Changes will appear here, including removed roles.</span></div>';
        return;
      }
      audit.innerHTML = events.map(function (entry) {
        return [
          '<article class="csvb-role-audit-item">',
          '<span class="csvb-role-audit-marker" aria-hidden="true"></span>',
          '<div class="csvb-role-audit-main"><strong>' + escapeHtml(display(entry.display_name, "Role record")) + '</strong><span>' + escapeHtml(display(entry.action, "Catalogue change")) + " · <code>" + escapeHtml(display(entry.role_code, "ID unavailable")) + "</code></span></div>",
          '<div class="csvb-role-audit-meta"><span>' + escapeHtml(display(entry.actor_username, "Unknown actor")) + '</span><time>' + escapeHtml(formatTime(entry.changed_at)) + "</time></div>",
          "</article>"
        ].join("");
      }).join("");
    }

    async function loadCatalogue(options) {
      const quiet = options && options.quiet;
      if (loading) return;
      loading = true;
      if (!quiet) announce("Loading role catalogue…");
      try {
        const result = await sb.rpc(CATALOGUE_RPC);
        if (result && result.error) throw result.error;
        const data = result && result.data;
        if (!data || typeof data !== "object") throw new Error("The role catalogue returned an unexpected response.");
        catalogue = Array.isArray(data.roles) ? data.roles : [];
        isolatedInitializationAvailable = data.isolated_role_initialization === 1;
        renderRoles();
        renderAudit(data.audit);
        loaded = true;
        announce("Catalogue updated.", "success");
      } catch (error) {
        if (!loaded) {
          rows.innerHTML = '<tr><td colspan="8"><div class="csvb-role-empty is-error"><strong>Could not load roles.</strong><span>' + escapeHtml(errorMessage(error)) + '</span><button class="csvb-role-action" type="button" data-action="refresh">Try again</button></div></td></tr>';
          audit.innerHTML = '<div class="csvb-role-empty is-error">Activity is unavailable until the catalogue loads.</div>';
        }
        announce("Could not load the role catalogue: " + errorMessage(error), "error");
      } finally {
        loading = false;
      }
    }

    function openEditor(mode, role) {
      const currentName = role ? display(role.display_name, "") : "";
      const heading = mode === "create" ? "Create office role" : "Rename office role";
      const actionLabel = mode === "create" ? "Create role" : "Save name";
      dialog.innerHTML = [
        '<form class="csvb-role-dialog-form" data-role-form>',
        '<div class="csvb-role-dialog-eyebrow">OFFICE ROLE CATALOGUE</div>',
        '<h2 id="csvbRoleDialogTitle">' + heading + "</h2>",
        '<p class="csvb-role-dialog-copy">' + (mode === "create"
          ? isolatedInitializationAvailable
            ? "The server creates unique isolated defaults: deny by default, with the approved M02 Office View default only. Configure Role Permissions, then explicitly enable user assignment. No existing role or user is changed."
            : "A stable code will be generated by the server. New office roles are not assignable."
          : "The stable role code remains unchanged. Renaming does not change authorization or assignments.") + "</p>",
        '<label class="csvb-role-field" for="csvbRoleDisplayName">Display name</label>',
        '<input id="csvbRoleDisplayName" name="display_name" type="text" maxlength="120" required autocomplete="off" value="' + escapeHtml(currentName) + '" />',
        '<div class="csvb-role-dialog-error" data-dialog-error role="alert" hidden></div>',
        '<div class="csvb-role-dialog-actions"><button class="csvb-role-button csvb-role-button-secondary" type="button" data-action="cancel-dialog">Cancel</button><button class="csvb-role-button csvb-role-button-primary" type="submit">' + actionLabel + "</button></div>",
        "</form>"
      ].join("");
      dialog.dataset.mode = mode;
      dialog.dataset.code = role ? String(role.code || "") : "";
      dialog.showModal();
      const input = dialog.querySelector("input[name='display_name']");
      if (input) input.focus();
    }

    async function openConfirmation(action, role) {
      assignmentSnapshot = null;
      if (action === "enable_assignment") {
        pending = true;
        try {
          const result = await sb.rpc("csvb_admin_office_role_defaults", { p_role_code: role.code });
          if (result.error) throw result.error;
          if (result.data?.role_code !== role.code || !result.data.is_active || result.data.is_assignable !== false) {
            throw new Error("Reload this active draft role before enabling assignment.");
          }
          assignmentSnapshot = result.data;
        } catch (error) {
          announce("Assignment remains disabled: " + errorMessage(error), "error");
          return;
        } finally { pending = false; }
      }
      const name = escapeHtml(display(role.display_name, role.code || "this role"));
      const labels = {
        delete: ["Delete office role?", isolatedInitializationAvailable
          ? "This removes a never-used role and its exclusively owned initialized defaults only when no account or external references remain. Audit history is retained. Migrated/shared defaults remain protected."
          : "This permanently removes the catalogue record. The action is available only when no users or permission references remain.", "Delete role"],
        deactivate: ["Deactivate office role?", "This changes the catalogue active state only. It does not alter authorization or assigned users.", "Deactivate role"],
        activate: ["Activate office role?", "Activation restores catalogue availability. Assignment eligibility is managed separately; activation never grants permissions.", "Activate role"],
        enable_assignment: ["Enable user assignment?", "Review this role's saved defaults in Rights Matrix before confirming. Fetching this snapshot is not evidence of a human review. This enables future manual assignments only; no user is assigned automatically. The backend rechecks enforcement, security restrictions and the fetched revision.", "Enable user assignment"]
      };
      const copy = labels[action];
      dialog.innerHTML = [
        '<form class="csvb-role-dialog-form" data-role-confirm>',
        '<div class="csvb-role-dialog-eyebrow">CONFIRM CATALOGUE CHANGE</div>',
        '<h2 id="csvbRoleDialogTitle">' + copy[0] + "</h2>",
        '<p class="csvb-role-dialog-copy"><strong>' + name + "</strong><br>" + copy[1] + "</p>",
        assignmentSnapshot ? '<p class="csvb-role-dialog-copy">Fetched revision: ' + escapeHtml(String(assignmentSnapshot.revision)) + '</p><label class="csvb-role-field">Audit reason<input name="assignment_reason" type="text" required maxlength="1000"></label>' : "",
        '<div class="csvb-role-dialog-error" data-dialog-error role="alert" hidden></div>',
        '<div class="csvb-role-dialog-actions"><button class="csvb-role-button csvb-role-button-secondary" type="button" data-action="cancel-dialog">Cancel</button><button class="csvb-role-button ' + (action === "delete" ? "csvb-role-button-danger" : "csvb-role-button-primary") + '" type="submit">' + copy[2] + "</button></div>",
        "</form>"
      ].join("");
      dialog.dataset.mode = action;
      dialog.dataset.code = String(role.code || "");
      dialog.showModal();
      const cancel = dialog.querySelector('[data-action="cancel-dialog"]');
      if (cancel) cancel.focus();
    }

    async function mutate(action, code, name) {
      if (pending) return;
      pending = true;
      const form = dialog.querySelector("form");
      if (form) Array.from(form.elements).forEach(function (element) { element.disabled = true; });
      announce("Saving catalogue change…");
      try {
        const args = action === "enable_assignment" ? {
          p_role_code: code,
          p_expected_revision: assignmentSnapshot?.revision,
          p_expected_fingerprint: assignmentSnapshot?.fingerprint,
          p_reason: name
        } : {
          p_action: action,
          p_role_code: code || null,
          p_display_name: name == null ? null : name
        };
        const result = await sb.rpc(action === "enable_assignment"
          ? "csvb_admin_office_role_enable_assignment" : CHANGE_RPC, args);
        if (result && result.error) throw result.error;
        if (action === "enable_assignment" && (result.data?.role_code !== code || result.data.is_assignable !== true)) {
          throw new Error("Backend did not confirm assignment eligibility. Reload before retrying.");
        }
        dialog.close();
        announce("Catalogue change saved. Refreshing records…", "success");
        await loadCatalogue({ quiet: true });
        window.dispatchEvent(new CustomEvent("csvb:role-catalogue-changed"));
      } catch (error) {
        const errorBox = dialog.querySelector("[data-dialog-error]");
        if (errorBox) {
          errorBox.textContent = errorMessage(error);
          errorBox.hidden = false;
        }
        announce("Could not save the catalogue change: " + errorMessage(error), "error");
      } finally {
        pending = false;
        if (dialog.open) {
          const formNow = dialog.querySelector("form");
          if (formNow) Array.from(formNow.elements).forEach(function (element) { element.disabled = false; });
        }
      }
    }

    host.addEventListener("click", function (event) {
      const button = event.target.closest("[data-action]");
      if (!button || !host.contains(button) || pending) return;
      const action = button.dataset.action;
      if (action === "refresh") {
        loadCatalogue();
        return;
      }
      if (action === "create") {
        openEditor("create");
        return;
      }
      if (action === "cancel-dialog") {
        dialog.close();
        return;
      }
      const role = catalogue.find(function (item) { return String(item.code) === button.dataset.code; });
      if (!role || !canManage(role)) return;
      if (action === "rename") openEditor("rename", role);
      else if (action === "delete" || action === "activate" || action === "deactivate" || action === "enable_assignment") {
        if (action === "delete" && (Number(role.assigned_user_count || 0) > 0 || Number(role.permission_reference_count || 0) > 0)) return;
        openConfirmation(action, role);
      }
    });

    host.addEventListener("submit", function (event) {
      const form = event.target;
      if (!form.matches("[data-role-form], [data-role-confirm]")) return;
      event.preventDefault();
      if (pending) return;
      const mode = dialog.dataset.mode;
      if (form.matches("[data-role-form]")) {
        const input = form.elements.display_name;
        const name = String(input.value || "").trim();
        if (!name) {
          input.setCustomValidity("Enter a display name.");
          input.reportValidity();
          input.setCustomValidity("");
          return;
        }
        mutate(mode, mode === "create" ? null : dialog.dataset.code, name);
      } else {
        mutate(mode, dialog.dataset.code, mode === "enable_assignment"
          ? String(form.elements.assignment_reason.value || "").trim() : null);
      }
    });

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog && !pending) dialog.close();
    });

    document.addEventListener("click", function (event) {
      const anyTab = event.target.closest('.tab[data-tab]');
      if (anyTab && anyTab.dataset.tab !== "role-management") {
        const panel = document.getElementById("tab-role-management");
        if (panel) panel.style.display = "none";
      }
      const tab = event.target.closest('[data-tab="role-management"]');
      if (!tab || !host.isConnected || loaded || loading) return;
      loadCatalogue();
    });

    if (host.closest("#tab-role-management") && getComputedStyle(host.closest("#tab-role-management")).display !== "none") {
      loadCatalogue();
    }
  }

  window.CSVB_ROLE_MANAGEMENT = { init: init };
})();
