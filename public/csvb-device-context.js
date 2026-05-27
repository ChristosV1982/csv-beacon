// public/csvb-device-context.js
// C.S.V. BEACON — Registered Device Context Helper
// D1 frontend foundation.
// Dashboard display/request/check only. No module blocking yet. No offline sync.

(() => {
  "use strict";

  const BUILD = "DEVICE-CONTEXT-2026-05-27-STABLE-ID-1";
  const STORAGE_KEY = "csvb_device_public_id";
  const BACKUP_STORAGE_KEY = "csvb_device_public_id_backup";
  const LAST_APPROVED_STORAGE_KEY = "csvb_device_public_id_last_approved";
  const COOKIE_NAME = "csvb_device_public_id";
  const PANEL_ID = "csvbDeviceContextCard";
  const BODY_ID = "csvbDeviceContextBody";
  const STATUS_ID = "csvbDeviceContextStatus";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortId(value) {
    const s = String(value || "");
    if (s.length <= 18) return s;
    return s.slice(0, 8) + "…" + s.slice(-8);
  }

  function setStatus(text, kind = "") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text || "";
    el.className = "csvb-device-status " + kind;
  }

  function makeId() {
    if (window.crypto?.randomUUID) return "csvbdev_" + window.crypto.randomUUID();
    return "csvbdev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
  }

  function isValidDevicePublicId(value) {
    return /^csvbdev_[A-Za-z0-9][A-Za-z0-9_-]{6,}$/.test(String(value || "").trim());
  }

  function readCookie(name) {
    try {
      const prefix = encodeURIComponent(name) + "=";
      const parts = String(document.cookie || "").split(";").map((x) => x.trim());
      const found = parts.find((x) => x.startsWith(prefix));
      return found ? decodeURIComponent(found.slice(prefix.length)) : "";
    } catch (_) {
      return "";
    }
  }

  function writeCookie(name, value) {
    try {
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie =
        encodeURIComponent(name) + "=" + encodeURIComponent(value) +
        "; Max-Age=" + maxAge +
        "; Path=/" +
        "; SameSite=Lax";
    } catch (_) {}
  }

  function rememberDevicePublicId(id, reason = "") {
    const value = String(id || "").trim();
    if (!isValidDevicePublicId(value)) return "";

    localStorage.setItem(STORAGE_KEY, value);
    localStorage.setItem(BACKUP_STORAGE_KEY, value);
    writeCookie(COOKIE_NAME, value);

    if (reason === "approved" || !isValidDevicePublicId(localStorage.getItem(LAST_APPROVED_STORAGE_KEY))) {
      localStorage.setItem(LAST_APPROVED_STORAGE_KEY, value);
    }

    return value;
  }

  function storedDeviceCandidates() {
    const values = [
      localStorage.getItem(STORAGE_KEY),
      localStorage.getItem(LAST_APPROVED_STORAGE_KEY),
      localStorage.getItem(BACKUP_STORAGE_KEY),
      readCookie(COOKIE_NAME)
    ];

    return [...new Set(values.map((x) => String(x || "").trim()).filter(isValidDevicePublicId))];
  }

  function getDevicePublicId() {
    const candidates = storedDeviceCandidates();

    if (candidates.length) {
      const id = candidates[0];
      rememberDevicePublicId(id);
      return id;
    }

    const id = makeId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  }

  function restoreDevicePublicId(id) {
    const value = rememberDevicePublicId(id, "approved");
    if (!value) throw new Error("Invalid device public ID.");
    return value;
  }

  function autoRestoreLastApprovedDevice(currentId) {
    const lastApproved = localStorage.getItem(LAST_APPROVED_STORAGE_KEY) || readCookie(COOKIE_NAME);
    if (!isValidDevicePublicId(lastApproved)) return "";
    if (String(lastApproved) === String(currentId)) return "";

    rememberDevicePublicId(lastApproved, "approved");
    return lastApproved;
  }

  function detectDeviceType() {
    const ua = navigator.userAgent || "";
    const uaLower = ua.toLowerCase();
    const touch = Number(navigator.maxTouchPoints || 0);

    if (/iphone|android.+mobile|mobile/.test(uaLower)) return "smartphone";
    if (/ipad|tablet/.test(uaLower)) return "tablet";
    if (/android/.test(uaLower) && touch > 0) return "tablet";
    if (/windows|macintosh|linux/.test(uaLower)) return "laptop";
    return "unknown";
  }

  function detectPlatform() {
    const ua = navigator.userAgent || "";
    const uaLower = ua.toLowerCase();
    if (uaLower.includes("windows")) return "Windows";
    if (uaLower.includes("android")) return "Android";
    if (uaLower.includes("iphone")) return "iOS";
    if (uaLower.includes("ipad")) return "iPadOS";
    if (uaLower.includes("mac os") || uaLower.includes("macintosh")) return "macOS";
    if (uaLower.includes("linux")) return "Linux";
    return "unknown";
  }

  function defaultLabel() {
    const type = detectDeviceType();
    const platform = detectPlatform();
    return `${platform} ${type}`.trim();
  }

  function screenSummary() {
    try {
      return `${screen.width}x${screen.height} / dpr ${window.devicePixelRatio || 1}`;
    } catch (_) {
      return "";
    }
  }

  function userAgentSummary() {
    return String(navigator.userAgent || "").slice(0, 500);
  }

  function ensureSupabase() {
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not loaded.");
    return window.AUTH.ensureSupabase();
  }

  function ensureStyles() {
    if (document.getElementById("csvbDeviceContextStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbDeviceContextStyles";
    style.textContent = `
      #${PANEL_ID} {
        border: 1px solid #D6E4F5;
        border-radius: 14px;
        background: #FFFFFF;
        box-shadow: 0 10px 24px rgba(3,27,63,.08);
        padding: 12px;
        margin: 0 0 12px 0;
      }
      #${PANEL_ID} .csvb-device-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      #${PANEL_ID} h2 {
        margin: 0;
        color: #062A5E;
        font-size: 1.02rem;
        font-weight: 900;
      }
      #${PANEL_ID} .csvb-device-note {
        color: #5E6F86;
        font-size: .82rem;
        font-weight: 650;
        margin-top: 4px;
        line-height: 1.35;
      }
      #${PANEL_ID} .csvb-device-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${PANEL_ID} button {
        border: 1px solid #AEE3F1;
        border-radius: 9px;
        background: #E9F7FB;
        color: #062A5E;
        padding: 6px 10px;
        font-weight: 850;
        cursor: pointer;
      }
      #${PANEL_ID} button.primary {
        background: #062A5E;
        border-color: #062A5E;
        color: #fff;
      }
      #${PANEL_ID} input, #${PANEL_ID} select {
        border: 1px solid #C8DAEF;
        border-radius: 9px;
        padding: 6px 8px;
        min-height: 31px;
        color: #163457;
        background: #fff;
        font-weight: 700;
      }
      #${BODY_ID} {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
        gap: 8px;
      }
      #${PANEL_ID} .csvb-device-tile {
        border: 1px solid #E1ECF7;
        border-radius: 11px;
        background: #F7FAFE;
        padding: 8px 9px;
        min-height: 60px;
      }
      #${PANEL_ID} .csvb-device-label {
        color: #5E6F86;
        font-size: .74rem;
        font-weight: 750;
        margin-bottom: 4px;
      }
      #${PANEL_ID} .csvb-device-value {
        color: #062A5E;
        font-size: .9rem;
        font-weight: 900;
        overflow-wrap: anywhere;
      }
      #${PANEL_ID} .csvb-device-status {
        color: #5E6F86;
        font-size: .78rem;
        font-weight: 800;
      }
      #${PANEL_ID} .csvb-device-status.ok { color: #087334; }
      #${PANEL_ID} .csvb-device-status.warn { color: #8A5A00; }
      #${PANEL_ID} .csvb-device-status.err { color: #9B1C1C; }
      #${PANEL_ID} .csvb-device-form {
        margin-top: 10px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
    `;

    document.head.appendChild(style);
  }

  function tile(label, value) {
    return `
      <div class="csvb-device-tile">
        <div class="csvb-device-label">${esc(label)}</div>
        <div class="csvb-device-value">${esc(value)}</div>
      </div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="csvb-device-head">
        <div>
          <h2>Registered Device</h2>
          <div class="csvb-device-note">
            D1 foundation. All device types will be registered. Offline permission remains separate and is not active by default.
          </div>
        </div>
        <div class="csvb-device-actions">
          <span id="${STATUS_ID}" class="csvb-device-status">Not checked.</span>
          <button id="csvbDeviceCheckBtn" type="button">Check</button>
        </div>
      </div>
      <div class="csvb-device-form">
        <input id="csvbDeviceLabelInput" type="text" placeholder="Device label" />
        <select id="csvbDeviceTypeSelect">
          <option value="desktop">Desktop</option>
          <option value="laptop">Laptop</option>
          <option value="tablet">Tablet</option>
          <option value="smartphone">Smartphone</option>
          <option value="shared_workstation">Shared workstation</option>
          <option value="unknown">Unknown</option>
        </select>
        <button id="csvbDeviceRequestBtn" class="primary" type="button">Request Registration</button>
      </div>
      <div id="${BODY_ID}"></div>
    `;

    const wrap = document.querySelector(".wrap");
    const offlineCard = document.getElementById("csvbOfflineDiagnosticsCard");
    const warn = document.getElementById("warnBox");

    if (offlineCard?.parentElement) {
      offlineCard.insertAdjacentElement("afterend", panel);
    } else if (warn?.parentElement) {
      warn.parentElement.insertBefore(panel, warn.nextSibling);
    } else if (wrap) {
      wrap.prepend(panel);
    } else {
      document.body.appendChild(panel);
    }

    const label = document.getElementById("csvbDeviceLabelInput");
    if (label && !label.value) label.value = defaultLabel();

    const type = document.getElementById("csvbDeviceTypeSelect");
    if (type) type.value = detectDeviceType();

    document.getElementById("csvbDeviceCheckBtn")?.addEventListener("click", checkStatus);
    document.getElementById("csvbDeviceRequestBtn")?.addEventListener("click", requestRegistration);

    return panel;
  }

  function renderLocalOnly(message = "Backend status not checked yet.") {
    const id = getDevicePublicId();
    const body = document.getElementById(BODY_ID);
    if (!body) return;

    body.innerHTML = [
      tile("Device ID", shortId(id)),
      tile("Local Type", detectDeviceType()),
      tile("Platform", detectPlatform()),
      tile("Screen", screenSummary()),
      tile("Backend Status", message),
      tile("Offline Allowed", "No / not checked")
    ].join("");
  }

  function applyStatusToWindow(status) {
    window.CSVB_DEVICE_CONTEXT = {
      build: BUILD,
      device_public_id: getDevicePublicId(),
      status,
      checked_at: new Date().toISOString()
    };
  }

  function renderServerStatus(row) {
    const body = document.getElementById(BODY_ID);
    if (!body) return;

    body.innerHTML = [
      tile("Device ID", shortId(row.device_public_id || getDevicePublicId())),
      tile("Status", row.status || "—"),
      tile("Access Allowed", row.access_allowed ? "Yes" : "No"),
      tile("Reason", row.access_reason || "—"),
      tile("Device Label", row.device_label || "—"),
      tile("Device Type", row.device_type || detectDeviceType()),
      tile("Platform", row.platform || detectPlatform()),
      tile("Offline Allowed", row.offline_allowed ? "Yes" : "No"),
      tile("Offline Modules", Array.isArray(row.offline_allowed_modules) ? row.offline_allowed_modules.join(", ") || "—" : "—"),
      tile("Requested At", row.requested_at || "—"),
      tile("Approved At", row.approved_at || "—"),
      tile("Last Seen", row.last_seen_at || "—")
    ].join("");
  }

  async function checkStatus() {
    ensureStyles();
    ensurePanel();

    const id = getDevicePublicId();
    setStatus("Checking device status…");

    try {
      const sb = ensureSupabase();
      const { data, error } = await sb.rpc("csvb_my_device_status", {
        p_device_public_id: id
      });

      if (error) throw error;
      const row = Array.isArray(data) ? (data[0] || {}) : (data || {});

      if (row.access_allowed && isValidDevicePublicId(row.device_public_id || id)) {
        rememberDevicePublicId(row.device_public_id || id, "approved");
      }

      if (row.status === "not_registered") {
        const restored = autoRestoreLastApprovedDevice(id);
        if (restored) {
          setStatus("Restored approved device ID. Rechecking…", "warn");

          const { data: data2, error: error2 } = await sb.rpc("csvb_my_device_status", {
            p_device_public_id: restored
          });

          if (error2) throw error2;

          const row2 = Array.isArray(data2) ? (data2[0] || {}) : (data2 || {});
          if (row2.access_allowed && isValidDevicePublicId(row2.device_public_id || restored)) {
            rememberDevicePublicId(row2.device_public_id || restored, "approved");
          }

          renderServerStatus(row2);
          applyStatusToWindow(row2);
          if (row2.access_allowed) setStatus("Device approved after ID recovery.", "ok");
          else setStatus("Device recovery attempted but not approved.", "warn");
          return row2;
        }
      }

      renderServerStatus(row);
      applyStatusToWindow(row);

      if (row.access_allowed) setStatus("Device approved.", "ok");
      else if (row.status === "pending") setStatus("Device pending approval.", "warn");
      else if (row.status === "not_registered") setStatus("Device not registered.", "warn");
      else setStatus("Device not allowed: " + (row.status || "unknown"), "err");

      return row;
    } catch (error) {
      const msg = error?.message || String(error);
      renderLocalOnly("Backend unavailable / SQL not installed: " + msg);
      applyStatusToWindow({ status: "backend_unavailable", access_allowed: false, access_reason: msg });
      setStatus("Device backend unavailable.", "err");
      return null;
    }
  }

  async function requestRegistration() {
    ensureStyles();
    ensurePanel();

    const id = getDevicePublicId();
    const label = document.getElementById("csvbDeviceLabelInput")?.value || defaultLabel();
    const type = document.getElementById("csvbDeviceTypeSelect")?.value || detectDeviceType();

    setStatus("Requesting device registration…");

    try {
      const sb = ensureSupabase();
      const { data, error } = await sb.rpc("csvb_request_device_registration", {
        p_device_public_id: id,
        p_device_label: label,
        p_device_type: type,
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

      // csvb_request_device_registration does not return access_reason; add local label.
      renderServerStatus({ ...row, access_reason: row.access_allowed ? "Device approved." : "Registration requested / pending approval." });
      applyStatusToWindow(row);

      if (row.access_allowed) setStatus("Device already approved.", "ok");
      else setStatus("Registration requested. Awaiting approval.", "warn");

      return row;
    } catch (error) {
      const msg = error?.message || String(error);
      renderLocalOnly("Registration failed / SQL not installed: " + msg);
      applyStatusToWindow({ status: "request_failed", access_allowed: false, access_reason: msg });
      setStatus("Registration request failed.", "err");
      return null;
    }
  }

  async function healthCheck() {
    return {
      ok: true,
      build: BUILD,
      device_public_id: getDevicePublicId(),
      local_device_type: detectDeviceType(),
      platform: detectPlatform(),
      context: window.CSVB_DEVICE_CONTEXT || null
    };
  }

  function boot() {
    window.CSVB_DEVICE = {
      BUILD,
      STORAGE_KEY,
      BACKUP_STORAGE_KEY,
      LAST_APPROVED_STORAGE_KEY,
      COOKIE_NAME,
      getDevicePublicId,
      restoreDevicePublicId,
      rememberDevicePublicId,
      storedDeviceCandidates,
      detectDeviceType,
      detectPlatform,
      checkStatus,
      requestRegistration,
      healthCheck
    };

    ensureStyles();
    ensurePanel();
    renderLocalOnly();

    // Passive check only. No blocking yet.
    setTimeout(checkStatus, 700);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
