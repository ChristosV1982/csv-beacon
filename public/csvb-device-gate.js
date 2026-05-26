// public/csvb-device-gate.js
// C.S.V. BEACON — Registered Device Access Gate
// D1 application-level gate foundation.
// Blocks application use when the logged-in user's current browser/device profile is not approved.
// No offline sync. No Supabase writes except explicit device registration request.

(() => {
  "use strict";

  const BUILD = "DEVICE-GATE-2026-05-26-D1-U01";
  const DEVICE_KEY = "csvb_device_public_id";
  const OVERLAY_ID = "csvbDeviceGateOverlay";
  const SAFE_PAGES = new Set([
    "login.html",
    "offline.html",
    "offline_diagnostics.html",
    "registered_device.html"
  ]);

  function pageName() {
    return String(location.pathname || "").split("/").pop() || "q-dashboard.html";
  }

  function isSafePage() {
    return SAFE_PAGES.has(pageName());
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function makeId() {
    if (window.crypto?.randomUUID) return "csvbdev_" + window.crypto.randomUUID();
    return "csvbdev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
  }

  function getDevicePublicId() {
    if (window.CSVB_DEVICE?.getDevicePublicId) return window.CSVB_DEVICE.getDevicePublicId();
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  }

  function shortId(value) {
    const s = String(value || "");
    if (s.length <= 18) return s || "—";
    return s.slice(0, 8) + "…" + s.slice(-8);
  }

  function detectDeviceType() {
    if (window.CSVB_DEVICE?.detectDeviceType) return window.CSVB_DEVICE.detectDeviceType();
    const ua = String(navigator.userAgent || "").toLowerCase();
    const touch = Number(navigator.maxTouchPoints || 0);
    if (/iphone|android.+mobile|mobile/.test(ua)) return "smartphone";
    if (/ipad|tablet/.test(ua)) return "tablet";
    if (/android/.test(ua) && touch > 0) return "tablet";
    if (/windows|macintosh|linux/.test(ua)) return "laptop";
    return "unknown";
  }

  function detectPlatform() {
    if (window.CSVB_DEVICE?.detectPlatform) return window.CSVB_DEVICE.detectPlatform();
    const ua = String(navigator.userAgent || "").toLowerCase();
    if (ua.includes("windows")) return "Windows";
    if (ua.includes("android")) return "Android";
    if (ua.includes("iphone")) return "iOS";
    if (ua.includes("ipad")) return "iPadOS";
    if (ua.includes("mac os") || ua.includes("macintosh")) return "macOS";
    if (ua.includes("linux")) return "Linux";
    return "unknown";
  }

  function screenSummary() {
    try { return `${screen.width}x${screen.height} / dpr ${window.devicePixelRatio || 1}`; }
    catch (_) { return ""; }
  }

  function userAgentSummary() {
    return String(navigator.userAgent || "").slice(0, 500);
  }

  function ensureSupabase() {
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not loaded.");
    return window.AUTH.ensureSupabase();
  }

  function ensureStyles() {
    if (document.getElementById("csvbDeviceGateStyles")) return;
    const style = document.createElement("style");
    style.id = "csvbDeviceGateStyles";
    style.textContent = `
      body.csvb-device-gate-active {
        overflow: hidden !important;
      }
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: rgba(244, 248, 252, .96);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        font-family: Arial, Helvetica, sans-serif;
        color: #163457;
      }
      #${OVERLAY_ID} .csvb-device-gate-card {
        width: min(860px, calc(100vw - 28px));
        border: 1px solid #D6E4F5;
        border-radius: 18px;
        background: #fff;
        box-shadow: 0 18px 48px rgba(3,27,63,.18);
        padding: 20px;
      }
      #${OVERLAY_ID} h1 {
        margin: 0;
        color: #062A5E;
        font-size: 1.45rem;
        font-weight: 950;
      }
      #${OVERLAY_ID} .note {
        margin-top: 8px;
        color: #5E6F86;
        font-weight: 750;
        line-height: 1.4;
      }
      #${OVERLAY_ID} .warn {
        margin-top: 14px;
        border: 1px solid #F6D58F;
        border-radius: 12px;
        background: #FFF6E0;
        color: #8A5A00;
        padding: 10px 12px;
        font-weight: 850;
        line-height: 1.35;
      }
      #${OVERLAY_ID} .grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 8px;
      }
      #${OVERLAY_ID} .tile {
        border: 1px solid #E1ECF7;
        background: #F7FAFE;
        border-radius: 11px;
        padding: 8px 9px;
      }
      #${OVERLAY_ID} .label {
        color: #5E6F86;
        font-size: .75rem;
        font-weight: 800;
        margin-bottom: 4px;
      }
      #${OVERLAY_ID} .value {
        color: #062A5E;
        font-size: .92rem;
        font-weight: 950;
        overflow-wrap: anywhere;
      }
      #${OVERLAY_ID} .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 16px;
      }
      #${OVERLAY_ID} button,
      #${OVERLAY_ID} a {
        border: 1px solid #AEE3F1;
        border-radius: 10px;
        background: #E9F7FB;
        color: #062A5E;
        padding: 9px 13px;
        font-weight: 900;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        box-sizing: border-box;
      }
      #${OVERLAY_ID} button.primary {
        border-color: #062A5E;
        background: #062A5E;
        color: #fff;
      }
    `;
    document.head.appendChild(style);
  }

  function tile(label, value) {
    return `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`;
  }

  function showGate(row, reasonOverride = "") {
    ensureStyles();
    const id = getDevicePublicId();
    const status = row?.status || "not_registered";
    const reason = reasonOverride || row?.access_reason || (status === "pending" ? "Device is pending approval." : "Device is not approved.");

    let overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = OVERLAY_ID;
      document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
      <section class="csvb-device-gate-card" role="dialog" aria-modal="true" aria-labelledby="csvbDeviceGateTitle">
        <h1 id="csvbDeviceGateTitle">Device approval required</h1>
        <div class="note">
          This C.S.V. BEACON installation is locked to registered devices. Your login is valid, but this browser/device profile is not approved for application access.
        </div>
        <div class="warn">${esc(reason)}</div>
        <div class="grid">
          ${tile("Device ID", shortId(id))}
          ${tile("Status", status)}
          ${tile("Device Type", row?.device_type || detectDeviceType())}
          ${tile("Platform", row?.platform || detectPlatform())}
          ${tile("Offline Allowed", row?.offline_allowed ? "Yes" : "No")}
          ${tile("Offline Modules", Array.isArray(row?.offline_allowed_modules) ? row.offline_allowed_modules.join(", ") || "—" : "—")}
        </div>
        <div class="actions">
          <button id="csvbDeviceGateRequestBtn" class="primary" type="button">Request Registration</button>
          <button id="csvbDeviceGateCheckBtn" type="button">Check Again</button>
          <a href="./registered_device.html">Device Details</a>
          <button id="csvbDeviceGateLogoutBtn" type="button">Logout</button>
        </div>
      </section>
    `;

    document.body.classList.add("csvb-device-gate-active");

    document.getElementById("csvbDeviceGateCheckBtn")?.addEventListener("click", () => checkGate({ force: true }));
    document.getElementById("csvbDeviceGateRequestBtn")?.addEventListener("click", requestRegistrationFromGate);
    document.getElementById("csvbDeviceGateLogoutBtn")?.addEventListener("click", () => {
      if (window.AUTH?.logoutAndGoLogin) window.AUTH.logoutAndGoLogin("./login.html");
      else location.href = "./login.html";
    });
  }

  function clearGate(row) {
    document.body.classList.remove("csvb-device-gate-active");
    document.getElementById(OVERLAY_ID)?.remove();
    window.CSVB_DEVICE_GATE_STATUS = {
      build: BUILD,
      checked_at: new Date().toISOString(),
      allowed: true,
      device: row || null
    };
  }

  async function requestRegistrationFromGate() {
    const id = getDevicePublicId();
    const sb = ensureSupabase();
    const label = `${detectPlatform()} ${detectDeviceType()}`.trim();

    try {
      const { data, error } = await sb.rpc("csvb_request_device_registration", {
        p_device_public_id: id,
        p_device_label: label,
        p_device_type: detectDeviceType(),
        p_platform: detectPlatform(),
        p_user_agent_summary: userAgentSummary(),
        p_browser_language: navigator.language || "",
        p_screen_summary: screenSummary(),
        p_metadata: {
          build: BUILD,
          page: location.pathname,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
        }
      });
      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
      if (row.access_allowed) clearGate(row);
      else showGate({ ...row, access_reason: "Registration requested. Awaiting administrator approval." });
    } catch (e) {
      showGate({ status: "request_failed", access_allowed: false }, "Registration request failed: " + String(e?.message || e));
    }
  }

  async function checkGate() {
    if (isSafePage()) return null;

    if (!window.AUTH?.getSessionUserProfile || !window.AUTH?.ensureSupabase) {
      return null;
    }

    let bundle = null;
    try {
      bundle = window.CSVB_CONTEXT || await window.AUTH.getSessionUserProfile();
    } catch (e) {
      showGate({ status: "context_error", access_allowed: false }, "Unable to verify login/profile context: " + String(e?.message || e));
      return null;
    }

    if (!bundle?.session?.user) return null;

    const id = getDevicePublicId();

    try {
      const { data, error } = await ensureSupabase().rpc("csvb_my_device_status", {
        p_device_public_id: id
      });
      if (error) throw error;

      const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
      window.CSVB_DEVICE_GATE_STATUS = {
        build: BUILD,
        checked_at: new Date().toISOString(),
        allowed: !!row.access_allowed,
        device: row
      };

      if (row.access_allowed) {
        clearGate(row);
      } else {
        showGate(row);
      }

      return row;
    } catch (e) {
      const row = { status: "verification_failed", access_allowed: false, access_reason: String(e?.message || e) };
      window.CSVB_DEVICE_GATE_STATUS = {
        build: BUILD,
        checked_at: new Date().toISOString(),
        allowed: false,
        device: row
      };
      showGate(row, "Device approval could not be verified. Server connection or registered-device RPC may be unavailable.");
      return row;
    }
  }

  function boot() {
    window.CSVB_DEVICE_GATE = {
      BUILD,
      checkGate,
      clearGate,
      showGate,
      getDevicePublicId
    };

    setTimeout(checkGate, 1100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
