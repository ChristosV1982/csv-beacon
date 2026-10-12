// public/csvb-offline-status.js
// C.S.V. BEACON — Offline/PWA Status Indicator
// Phase 1 foundation only.
// Visual/status only. No database writes. No sync logic. No module business logic.

(() => {
  "use strict";

  const BUILD = "OFFLINE-STATUS-2026-05-22-PHASE1";
  const STORAGE_KEY_ENABLED = "csvb_offline_status_enabled";
  const ROOT_ID = "csvbOfflineStatusRoot";
  const TOAST_ID = "csvbOfflineStatusToast";

  function isEnabled() {
    const raw = localStorage.getItem(STORAGE_KEY_ENABLED);
    return raw !== "0";
  }

  function ensureStyles() {
    if (document.getElementById("csvbOfflineStatusStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbOfflineStatusStyles";
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 99980;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-height: 30px;
        max-width: min(420px, calc(100vw - 24px));
        border: 1px solid #b8dce8;
        border-radius: 999px;
        padding: 6px 10px;
        background: rgba(255,255,255,.96);
        color: #062A5E;
        box-shadow: 0 10px 24px rgba(3,27,63,.16);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        font-weight: 850;
        line-height: 1.15;
        backdrop-filter: blur(8px);
      }

      #${ROOT_ID}[data-state="online"] {
        border-color: #b8f0c9;
        background: rgba(233,255,240,.96);
        color: #0d4f2a;
      }

      #${ROOT_ID}[data-state="offline"] {
        border-color: #f6d58f;
        background: rgba(255,246,224,.97);
        color: #8a5a00;
      }

      #${ROOT_ID}[data-state="checking"] {
        border-color: #d6e4f5;
        background: rgba(248,251,255,.96);
        color: #5e6f86;
      }

      #${ROOT_ID} .csvb-offline-dot {
        width: 9px;
        height: 9px;
        min-width: 9px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 0 3px rgba(0,0,0,.06);
      }

      #${ROOT_ID} .csvb-offline-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      #${TOAST_ID} {
        position: fixed;
        right: 12px;
        bottom: 54px;
        z-index: 99981;
        display: none;
        max-width: min(460px, calc(100vw - 24px));
        border: 1px solid #d6e4f5;
        border-radius: 12px;
        padding: 8px 10px;
        background: #fff;
        color: #163457;
        box-shadow: 0 12px 28px rgba(3,27,63,.18);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        font-weight: 750;
        line-height: 1.25;
      }

      #${TOAST_ID}.show {
        display: block;
      }

      @media (max-width: 700px) {
        #${ROOT_ID} {
          left: 8px;
          right: 8px;
          bottom: 8px;
          justify-content: center;
          border-radius: 12px;
        }

        #${TOAST_ID} {
          left: 8px;
          right: 8px;
          bottom: 48px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
      <span class="csvb-offline-dot" aria-hidden="true"></span>
      <span class="csvb-offline-text">Checking connection…</span>
    `;

    document.body.appendChild(root);
    return root;
  }

  function ensureToast() {
    let toast = document.getElementById(TOAST_ID);
    if (toast) return toast;

    toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(text) {
    const toast = ensureToast();
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("show"), 4500);
  }

  function setState(state, text) {
    const root = ensureRoot();
    root.dataset.state = state;
    const label = root.querySelector(".csvb-offline-text");
    if (label) label.textContent = text;
  }

  function updateStatus({ announce = false } = {}) {
    if (!isEnabled()) {
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(TOAST_ID)?.remove();
      return;
    }

    ensureStyles();

    if (navigator.onLine) {
      setState("online", "Online — server connection available");
      if (announce) showToast("Connection restored. Offline sync is not active yet in this phase.");
    } else {
      setState("offline", "Offline — local viewing only");
      if (announce) showToast("Device is offline. No module sync is active yet in this phase.");
    }
  }

  function boot() {
    window.CSVB_OFFLINE_STATUS_BUILD = BUILD;
    updateStatus();

    window.addEventListener("online", () => updateStatus({ announce: true }));
    window.addEventListener("offline", () => updateStatus({ announce: true }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
