// public/csvb-registered-devices-grant-lifecycle.js
// C.S.V. BEACON — Registered Devices offline grant lifecycle controls.
// Frontend helper for SIRE_QUESTIONS_VIEWER grant revoke/renew actions.

(() => {
  "use strict";

  const BUILD = "REGISTERED-DEVICES-GRANT-LIFECYCLE-20260528_1";
  const MODULE_CODE = "SIRE_QUESTIONS_VIEWER";
  const PACKAGE_ID = "SIRE_QUESTIONS_VIEWER";

  window.CSVB_REGISTERED_DEVICES_GRANT_LIFECYCLE_BUILD = BUILD;

  function sb() {
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not loaded.");
    return window.AUTH.ensureSupabase();
  }

  function api() {
    return window.CSVB_REGISTERED_DEVICES_ADMIN || null;
  }

  function devices() {
    try {
      return api()?.getDevices?.() || [];
    } catch (_) {
      return [];
    }
  }

  function deviceForRow(row) {
    const id = row?.dataset?.deviceId || "";
    if (!id) return null;
    return devices().find((d) => String(d.device_id) === String(id)) || null;
  }

  function shortId(value) {
    const s = String(value || "");
    return s.length <= 18 ? s : s.slice(0, 8) + "…" + s.slice(-8);
  }

  function labelForDevice(device) {
    return device?.device_label || shortId(device?.device_public_id) || device?.device_id || "selected device";
  }

  function rowHasActiveSireGrant(row) {
    const text = String(row?.innerText || "").replace(/\s+/g, " ").toLowerCase();
    return text.includes("offline grant: active") && text.includes("sire_questions_viewer");
  }

  function canGrant(device) {
    const modules = Array.isArray(device?.offline_allowed_modules) ? device.offline_allowed_modules : [];
    return String(device?.status || "") === "approved" &&
      device?.offline_allowed === true &&
      modules.map((x) => String(x || "").toUpperCase()).includes(MODULE_CODE);
  }

  function grantDays(device) {
    const n = Number(device?.offline_grant_validity_days);
    return Number.isInteger(n) && n > 0 ? n : 7;
  }

  async function reloadDevices() {
    try {
      if (api()?.loadDevices) await api().loadDevices();
    } catch (error) {
      console.warn("Registered Devices grant lifecycle reload failed:", error);
    }
  }

  async function revokeGrant(device) {
    const label = labelForDevice(device);

    const ok = confirm(
      "Revoke active SIRE offline grant?\n\n" +
      "Device: " + label + "\n" +
      "Module: " + MODULE_CODE + "\n\n" +
      "This does not revoke the registered device itself. It only revokes the current SIRE offline package grant."
    );

    if (!ok) return;

    const { data, error } = await sb().rpc("csvb_admin_revoke_latest_device_offline_grant", {
      p_device_id: device.device_id,
      p_module_code: MODULE_CODE,
      p_notes: "Revoked active SIRE_QUESTIONS_VIEWER offline grant from Registered Devices lifecycle controls."
    });

    if (error) throw error;

    alert(data?.revoked === true ? "SIRE offline grant revoked." : "No active SIRE offline grant was found to revoke.");
    await reloadDevices();
  }

  async function renewGrant(device) {
    const label = labelForDevice(device);
    const days = grantDays(device);

    const ok = confirm(
      "Renew SIRE offline grant?\n\n" +
      "Device: " + label + "\n" +
      "Module: " + MODULE_CODE + "\n" +
      "Validity: " + days + " day(s)\n\n" +
      "Process:\n" +
      "1. Revoke latest active SIRE grant, if any.\n" +
      "2. Issue a new SIRE grant.\n\n" +
      "This avoids leaving duplicate active grants where possible."
    );

    if (!ok) return;

    const revokeResult = await sb().rpc("csvb_admin_revoke_latest_device_offline_grant", {
      p_device_id: device.device_id,
      p_module_code: MODULE_CODE,
      p_notes: "Renewal: revoked previous active SIRE_QUESTIONS_VIEWER offline grant."
    });

    if (revokeResult.error) throw revokeResult.error;

    const issueResult = await sb().rpc("csvb_admin_issue_device_offline_grant", {
      p_device_id: device.device_id,
      p_module_code: MODULE_CODE,
      p_grant_type: "readonly_package",
      p_validity_days: days,
      p_package_id: PACKAGE_ID,
      p_package_hash: null,
      p_notes: "Renewed SIRE_QUESTIONS_VIEWER read-only offline grant for " + days + " day(s)."
    });

    if (issueResult.error) throw issueResult.error;

    alert("SIRE offline grant renewed for " + days + " day(s).");
    await reloadDevices();
  }

  function hideIssueButtonWhenActive(row, active) {
    const btn = row.querySelector('button[data-rd-action="issue_sire_grant"]');
    if (btn) btn.style.display = active ? "none" : "";
  }

  function injectLifecycle(row) {
    if (!row || !row.matches("tr[data-device-id]")) return;

    const device = deviceForRow(row);
    if (!device || !canGrant(device)) return;

    const active = rowHasActiveSireGrant(row);
    hideIssueButtonWhenActive(row, active);

    let wrap = row.querySelector(".csvb-grant-lifecycle-actions");

    if (!active) {
      if (wrap) wrap.remove();
      return;
    }

    if (wrap) return;

    const actions = row.querySelector("td:last-child .csvb-dev-actions") || row.querySelector("td:last-child");
    if (!actions) return;

    wrap = document.createElement("span");
    wrap.className = "csvb-grant-lifecycle-actions";
    wrap.style.display = "contents";

    const renew = document.createElement("button");
    renew.type = "button";
    renew.className = "btn2";
    renew.textContent = "Renew SIRE Grant";
    renew.title = "Revoke the active SIRE grant and issue a fresh one.";
    renew.addEventListener("click", async () => {
      try {
        await renewGrant(device);
      } catch (error) {
        alert("Renew SIRE grant failed:\n\n" + String(error?.message || error));
      }
    });

    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "btnDanger";
    revoke.textContent = "Revoke SIRE Grant";
    revoke.title = "Revoke the active SIRE offline grant only.";
    revoke.addEventListener("click", async () => {
      try {
        await revokeGrant(device);
      } catch (error) {
        alert("Revoke SIRE grant failed:\n\n" + String(error?.message || error));
      }
    });

    wrap.appendChild(renew);
    wrap.appendChild(revoke);
    actions.appendChild(wrap);
  }

  function injectAll() {
    if (!api()?.getDevices) return;
    document.querySelectorAll("#rdTbody tr[data-device-id]").forEach(injectLifecycle);
  }

  function boot() {
    window.CSVB_REGISTERED_DEVICES_GRANT_LIFECYCLE = {
      BUILD,
      injectAll,
      revokeGrant,
      renewGrant
    };

    injectAll();
    setInterval(injectAll, 1000);

    const target = document.getElementById("rdTbody") || document.body;
    if (target && window.MutationObserver) {
      const observer = new MutationObserver(() => injectAll());
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
