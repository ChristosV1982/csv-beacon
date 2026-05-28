// public/csvb-registered-devices-browser-bind.js
// C.S.V. BEACON — Registered Devices: bind selected approved device to this browser.
// Frontend-only helper. Does not approve/revoke/modify server records.

(() => {
  "use strict";

  const BUILD = "REGISTERED-DEVICES-BROWSER-BIND-20260528_1";
  window.CSVB_REGISTERED_DEVICES_BROWSER_BIND_BUILD = BUILD;

  const DEVICE_KEYS = [
    "csvb_device_public_id",
    "csvb_device_public_id_backup",
    "csvb_device_public_id_last_approved"
  ];

  function isValidDevicePublicId(value) {
    return /^csvbdev_[A-Za-z0-9][A-Za-z0-9_-]{6,}$/.test(String(value || "").trim());
  }

  function writeCookie(name, value) {
    try {
      document.cookie =
        encodeURIComponent(name) + "=" + encodeURIComponent(value) +
        "; Max-Age=31536000; Path=/; SameSite=Lax";
    } catch (_) {}
  }

  function bindDevicePublicId(devicePublicId) {
    const value = String(devicePublicId || "").trim();
    if (!isValidDevicePublicId(value)) throw new Error("Invalid device_public_id.");

    for (const key of DEVICE_KEYS) {
      localStorage.setItem(key, value);
    }

    writeCookie("csvb_device_public_id", value);

    if (window.CSVB_DEVICE?.rememberDevicePublicId) {
      try { window.CSVB_DEVICE.rememberDevicePublicId(value, "approved"); } catch (_) {}
    }

    return value;
  }

  function getAdminApi() {
    return window.CSVB_REGISTERED_DEVICES_ADMIN || null;
  }

  function getDevices() {
    const api = getAdminApi();
    if (!api?.getDevices) return [];
    try { return api.getDevices() || []; } catch (_) { return []; }
  }

  function shortId(value) {
    const s = String(value || "");
    if (s.length <= 18) return s;
    return s.slice(0, 8) + "…" + s.slice(-8);
  }

  function findDeviceForRow(row) {
    const deviceId = row?.dataset?.deviceId || "";
    if (!deviceId) return null;
    return getDevices().find((d) => String(d.device_id) === String(deviceId)) || null;
  }

  function buttonAlreadyPresent(row) {
    return !!row.querySelector("button[data-rd-browser-bind]");
  }

  function injectButton(row) {
    if (!row || buttonAlreadyPresent(row)) return;

    const device = findDeviceForRow(row);
    if (!device?.device_public_id) return;

    const actionsCell = row.querySelector("td:last-child .csvb-dev-actions") || row.querySelector("td:last-child");
    if (!actionsCell) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn2";
    btn.dataset.rdBrowserBind = "1";
    btn.textContent = "Use on this browser";
    btn.title = "Set this browser's registered device ID to this selected device.";

    btn.addEventListener("click", () => {
      const latest = findDeviceForRow(row) || device;
      const devicePublicId = latest.device_public_id || "";
      const label = latest.device_label || shortId(devicePublicId);

      const ok = confirm(
        "Use this registered device on this browser?\n\n" +
        "Device: " + label + "\n" +
        "ID: " + devicePublicId + "\n\n" +
        "This only changes this browser's local device identity. It does not approve, revoke, or modify the server device record."
      );

      if (!ok) return;

      try {
        bindDevicePublicId(devicePublicId);
        alert("This browser is now bound to:\n\n" + label + "\n" + devicePublicId + "\n\nThe page will reload.");
        location.reload();
      } catch (error) {
        alert("Browser device binding failed:\n\n" + String(error?.message || error));
      }
    });

    actionsCell.appendChild(btn);
  }

  function injectButtons() {
    if (!getAdminApi()?.getDevices) return;
    document.querySelectorAll("#rdTbody tr[data-device-id]").forEach(injectButton);
  }

  function boot() {
    window.CSVB_REGISTERED_DEVICES_BROWSER_BIND = {
      BUILD,
      bindDevicePublicId,
      injectButtons
    };

    injectButtons();
    setInterval(injectButtons, 1000);

    const target = document.getElementById("rdTbody") || document.body;
    if (target && window.MutationObserver) {
      const observer = new MutationObserver(() => injectButtons());
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
