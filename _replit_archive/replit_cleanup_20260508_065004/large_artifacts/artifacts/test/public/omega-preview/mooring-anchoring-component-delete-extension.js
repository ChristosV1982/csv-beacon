// public/mooring-anchoring-component-delete-extension.js
// C.S.V. BEACON – MAI Component Soft Delete Button
// Adds an audited soft-delete button to the inventory list for authorized Office users.

(() => {
  "use strict";

  const BUILD = "MAI-COMPONENT-SOFT-DELETE-20260512-1";
  const ALLOWED_ROLES = new Set([
    "super_admin",
    "platform_owner",
    "company_admin",
    "company_superintendent"
  ]);

  let profile = null;
  let initialized = false;
  let observer = null;

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

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box = type === "ok" ? $("okBox") : $("warnBox");
    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
    } else if (message) {
      alert(message);
    }
  }

  function addStyles() {
    if ($("maiComponentDeleteStyles")) return;

    const style = document.createElement("style");
    style.id = "maiComponentDeleteStyles";
    style.textContent = `
      .mai-row-actions {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }

      .btnDanger,
      .mai-delete-component-btn {
        border-radius: 10px;
        padding: 4px 9px;
        min-height: 28px;
        font-size: .78rem;
        font-weight: 900;
        line-height: 1.2;
        cursor: pointer;
        white-space: nowrap;
        background: #fff3f3;
        color: #9b1c1c;
        border: 1px solid #efb4b4;
      }

      .btnDanger:hover,
      .mai-delete-component-btn:hover {
        background: #ffe8e8;
        border-color: #df8b8b;
        box-shadow: 0 7px 16px rgba(155, 28, 28, .12);
      }

      .mai-delete-component-btn:disabled {
        opacity: .55;
        cursor: not-allowed;
        box-shadow: none;
      }
    `;
    document.head.appendChild(style);
  }

  async function detectProfile() {
    if (profile) return profile;

    try {
      if (window.AUTH?.getSessionUserProfile) {
        const bundle = await window.AUTH.getSessionUserProfile();
        profile = bundle?.profile || null;
        return profile;
      }
    } catch (_) {
      // Fall through to direct auth/profile lookup.
    }

    const sb = window.AUTH?.ensureSupabase?.();
    if (!sb) return null;

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData?.user?.id) return null;

    const { data, error } = await sb
      .from("profiles")
      .select("id, role, company_id, vessel_id")
      .eq("id", userData.user.id)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    profile = data || null;
    return profile;
  }

  function canDeleteComponents() {
    return ALLOWED_ROLES.has(profile?.role || "");
  }

  function componentIdFromRow(row) {
    const openButton = Array.from(row.querySelectorAll("button"))
      .find((btn) => /open component/i.test(btn.textContent || ""));

    if (!openButton) return "";

    const onclick = openButton.getAttribute("onclick") || "";
    const match = onclick.match(/id=([0-9a-fA-F-]{36})/);

    return match ? match[1] : "";
  }

  function uniqueIdFromRow(row) {
    return row.querySelector(".id-strong")?.textContent?.trim() || "this component";
  }

  function ensureActionWrapper(cell) {
    let wrapper = cell.querySelector(".mai-row-actions");
    if (wrapper) return wrapper;

    wrapper = document.createElement("div");
    wrapper.className = "mai-row-actions";

    while (cell.firstChild) {
      wrapper.appendChild(cell.firstChild);
    }

    cell.appendChild(wrapper);
    return wrapper;
  }

  function enhanceRows() {
    if (!canDeleteComponents()) return;

    const tbody = $("componentsTbody");
    if (!tbody) return;

    tbody.querySelectorAll("tr").forEach((row) => {
      if (row.dataset.maiDeleteEnhanced === "1") return;

      const componentId = componentIdFromRow(row);
      if (!componentId) return;

      const cells = row.querySelectorAll("td");
      const actionCell = cells[cells.length - 1];
      if (!actionCell) return;

      const wrapper = ensureActionWrapper(actionCell);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mai-delete-component-btn";
      btn.textContent = "Delete";
      btn.dataset.maiDeleteComponent = componentId;
      btn.title = "Soft-delete this component. Historical records are preserved.";

      btn.addEventListener("click", () => {
        deleteComponent(componentId, uniqueIdFromRow(row), btn).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not delete component."));
        });
      });

      wrapper.appendChild(btn);
      row.dataset.maiDeleteEnhanced = "1";
    });
  }

  async function deleteComponent(componentId, uniqueId, button) {
    const reason = prompt(
      `Reason for deleting component ${uniqueId}:`,
      "Created by mistake."
    );

    if (reason === null) return;

    const cleanReason = String(reason || "").trim();
    if (!cleanReason) {
      toast("warn", "Delete reason is required.");
      return;
    }

    const ok = confirm(
      `Delete component ${uniqueId}?\n\n` +
      "This is a soft delete. The component will be hidden from the normal inventory list, " +
      "but working-hours, checklist runs, lifecycle events and evidence records will remain auditable."
    );

    if (!ok) return;

    button.disabled = true;
    button.textContent = "Deleting...";

    const sb = window.AUTH.ensureSupabase();
    const { data, error } = await sb.rpc("mai_soft_delete_component", {
      p_component_id: componentId,
      p_delete_reason: cleanReason
    });

    if (error) throw error;

    const counts = data?.dependency_counts || {};
    toast(
      "ok",
      `Component ${uniqueId} deleted / hidden. ` +
      `Linked records preserved: usage ${counts.usage_logs ?? 0}, ` +
      `inspection runs ${counts.inspection_runs ?? 0}, ` +
      `lifecycle events ${counts.lifecycle_events ?? 0}, ` +
      `attachments ${counts.attachments ?? 0}.`
    );

    const reloadBtn = $("reloadBtn");
    if (reloadBtn) reloadBtn.click();
    else window.location.reload();
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    window.CSVB_MAI_COMPONENT_SOFT_DELETE_BUILD = BUILD;
    addStyles();

    await detectProfile();

    if (!canDeleteComponents()) return;

    enhanceRows();

    const tbody = $("componentsTbody");
    if (!tbody) return;

    observer = new MutationObserver(() => enhanceRows());
    observer.observe(tbody, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(console.error));
  } else {
    init().catch(console.error);
  }
})();
