// public/csvb-registered-device-compact-page.js
// C.S.V. BEACON — Compact Registered Device Detail Page
// D1 visual refinement. One registered device = one compact row.
// No global device gate. No offline sync activation.

(() => {
  "use strict";

  const BUILD = "REGISTERED-DEVICE-COMPACT-PAGE-2026-05-26-U01";
  const ROOT_ID = "csvbRegisteredDeviceCompactRoot";
  const TBODY_ID = "csvbRegisteredDeviceCompactTbody";
  const STATUS_ID = "csvbRegisteredDeviceCompactStatus";

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
    if (s.length <= 18) return s || "—";
    return s.slice(0, 8) + "…" + s.slice(-8);
  }

  function fmtDate(value) {
    if (!value) return "—";
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
    } catch (_) {
      return String(value);
    }
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "approved") return "ok";
    if (s === "pending" || s === "not_registered") return "warn";
    if (s === "blocked" || s === "revoked" || s === "backend_unavailable" || s === "request_failed") return "err";
    return "";
  }

  function setStatus(text, kind = "") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text || "";
    el.className = "csvb-registered-device-status " + kind;
  }

  function ensureStyles() {
    if (document.getElementById("csvbRegisteredDeviceCompactStyles")) return;
    const style = document.createElement("style");
    style.id = "csvbRegisteredDeviceCompactStyles";
    style.textContent = `
      #csvbDeviceContextCard { display: none !important; }
      #${ROOT_ID} {
        border: 1px solid #D6E4F5;
        border-radius: 14px;
        background: #fff;
        box-shadow: 0 10px 24px rgba(3,27,63,.08);
        padding: 12px;
        margin-bottom: 12px;
      }
      #${ROOT_ID} .csvb-registered-device-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }
      #${ROOT_ID} .csvb-registered-device-title {
        color: #062A5E;
        font-size: 1.02rem;
        font-weight: 950;
      }
      #${ROOT_ID} .csvb-registered-device-note {
        color: #5E6F86;
        font-size: .82rem;
        font-weight: 700;
        margin-top: 3px;
      }
      #${ROOT_ID} .csvb-registered-device-controls {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      #${ROOT_ID} input,
      #${ROOT_ID} select {
        width: auto;
        min-width: 135px;
        max-width: 220px;
        border: 1px solid #C8DAEF;
        border-radius: 9px;
        padding: 7px 8px;
        color: #163457;
        background: #fff;
        font-weight: 800;
      }
      #${ROOT_ID} button {
        border: 1px solid #AEE3F1;
        border-radius: 9px;
        background: #E9F7FB;
        color: #062A5E;
        padding: 7px 10px;
        font-weight: 900;
        cursor: pointer;
      }
      #${ROOT_ID} button.primary {
        border-color: #062A5E;
        background: #062A5E;
        color: #fff;
      }
      #${ROOT_ID} .csvb-registered-device-status {
        font-size: .8rem;
        font-weight: 900;
        color: #5E6F86;
      }
      #${ROOT_ID} .csvb-registered-device-status.ok { color: #087334; }
      #${ROOT_ID} .csvb-registered-device-status.warn { color: #8A5A00; }
      #${ROOT_ID} .csvb-registered-device-status.err { color: #9B1C1C; }
      #${ROOT_ID} .csvb-registered-device-table-wrap {
        overflow-x: auto;
        border: 1px solid #E1ECF7;
        border-radius: 12px;
      }
      #${ROOT_ID} table {
        width: 100%;
        min-width: 1280px;
        border-collapse: collapse;
        table-layout: fixed;
      }
      #${ROOT_ID} th,
      #${ROOT_ID} td {
        border-bottom: 1px solid #E6EEF7;
        padding: 8px 7px;
        text-align: left;
        vertical-align: middle;
        font-size: .84rem;
      }
      #${ROOT_ID} th {
        color: #35507B;
        background: #F7FAFE;
        font-weight: 950;
        white-space: nowrap;
      }
      #${ROOT_ID} td {
        color: #062A5E;
        font-weight: 820;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .csvb-device-status-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 3px 8px;
        border: 1px solid #D6E4F5;
        background: #F7FAFE;
        font-weight: 950;
        font-size: .78rem;
      }
      #${ROOT_ID} .csvb-device-status-pill.ok { background: #EAF9EF; border-color: #B8E7C8; color: #087334; }
      #${ROOT_ID} .csvb-device-status-pill.warn { background: #FFF6E0; border-color: #F6D58F; color: #8A5A00; }
      #${ROOT_ID} .csvb-device-status-pill.err { background: #FFEAEA; border-color: #F2B7B7; color: #9B1C1C; }
      #${ROOT_ID} .csvb-device-id {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: .78rem;
      }
      #${ROOT_ID} .csvb-device-actions {
        display: inline-flex;
        gap: 6px;
      }
      @media (max-width: 850px) {
        #${ROOT_ID} .csvb-registered-device-toolbar { align-items: stretch; }
        #${ROOT_ID} .csvb-registered-device-controls { width: 100%; }
        #${ROOT_ID} input,
        #${ROOT_ID} select,
        #${ROOT_ID} button { min-width: 0; flex: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function localFallbackRow() {
    const dev = window.CSVB_DEVICE || {};
    const id = dev.getDevicePublicId ? dev.getDevicePublicId() : localStorage.getItem("csvb_device_public_id") || "—";
    return {
      device_public_id: id,
      status: "not_checked",
      access_allowed: false,
      access_reason: "Status not checked yet.",
      device_label: "—",
      device_type: dev.detectDeviceType ? dev.detectDeviceType() : "unknown",
      platform: dev.detectPlatform ? dev.detectPlatform() : "unknown",
      offline_allowed: false,
      offline_allowed_modules: [],
      requested_at: null,
      approved_at: null,
      last_seen_at: null
    };
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="csvb-registered-device-toolbar">
        <div>
          <div class="csvb-registered-device-title">Registered Device</div>
          <div class="csvb-registered-device-note">Compact status for this browser/device profile. D1: access blocking is not active yet.</div>
        </div>
        <div class="csvb-registered-device-controls">
          <span id="${STATUS_ID}" class="csvb-registered-device-status">Not checked.</span>
          <input id="csvbRegisteredDeviceCompactLabel" type="text" placeholder="Device label" />
          <select id="csvbRegisteredDeviceCompactType">
            <option value="desktop">Desktop</option>
            <option value="laptop">Laptop</option>
            <option value="tablet">Tablet</option>
            <option value="smartphone">Smartphone</option>
            <option value="shared_workstation">Shared workstation</option>
            <option value="unknown">Unknown</option>
          </select>
          <button id="csvbRegisteredDeviceCompactCheck" type="button">Check</button>
          <button id="csvbRegisteredDeviceCompactRequest" class="primary" type="button">Request</button>
        </div>
      </div>
      <div class="csvb-registered-device-table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:90px;">Status</th>
              <th style="width:125px;">Device ID</th>
              <th style="width:165px;">Label</th>
              <th style="width:95px;">Type</th>
              <th style="width:105px;">Platform</th>
              <th style="width:90px;">Access</th>
              <th style="width:220px;">Reason</th>
              <th style="width:90px;">Offline</th>
              <th style="width:180px;">Modules</th>
              <th style="width:155px;">Requested</th>
              <th style="width:155px;">Approved</th>
              <th style="width:155px;">Last Seen</th>
            </tr>
          </thead>
          <tbody id="${TBODY_ID}">
            <tr><td colspan="12">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const wrap = document.querySelector(".wrap");
    const pageTitle = document.querySelector(".pageTitle");

    if (pageTitle?.parentElement) pageTitle.insertAdjacentElement("afterend", root);
    else if (wrap) wrap.prepend(root);
    else document.body.prepend(root);

    const dev = window.CSVB_DEVICE || {};
    const label = document.getElementById("csvbRegisteredDeviceCompactLabel");
    if (label) label.value = "Windows laptop";
    const type = document.getElementById("csvbRegisteredDeviceCompactType");
    if (type && dev.detectDeviceType) type.value = dev.detectDeviceType();

    document.getElementById("csvbRegisteredDeviceCompactCheck")?.addEventListener("click", refresh);
    document.getElementById("csvbRegisteredDeviceCompactRequest")?.addEventListener("click", requestRegistration);

    return root;
  }

  function renderRow(row) {
    const tbody = document.getElementById(TBODY_ID);
    if (!tbody) return;
    const modules = Array.isArray(row.offline_allowed_modules) ? row.offline_allowed_modules.join(", ") : "";
    const stClass = statusClass(row.status);

    tbody.innerHTML = `
      <tr>
        <td><span class="csvb-device-status-pill ${esc(stClass)}">${esc(row.status || "—")}</span></td>
        <td class="csvb-device-id" title="${esc(row.device_public_id || "")}">${esc(shortId(row.device_public_id))}</td>
        <td title="${esc(row.device_label || "—")}">${esc(row.device_label || "—")}</td>
        <td>${esc(row.device_type || "—")}</td>
        <td>${esc(row.platform || "—")}</td>
        <td>${row.access_allowed ? "Yes" : "No"}</td>
        <td title="${esc(row.access_reason || "—")}">${esc(row.access_reason || "—")}</td>
        <td>${row.offline_allowed ? "Yes" : "No"}</td>
        <td title="${esc(modules || "—")}">${esc(modules || "—")}</td>
        <td title="${esc(row.requested_at || "")}">${esc(fmtDate(row.requested_at))}</td>
        <td title="${esc(row.approved_at || "")}">${esc(fmtDate(row.approved_at))}</td>
        <td title="${esc(row.last_seen_at || "")}">${esc(fmtDate(row.last_seen_at))}</td>
      </tr>
    `;
  }

  async function refresh() {
    ensureStyles();
    ensureRoot();
    document.getElementById("csvbDeviceContextCard")?.classList.add("csvb-dashboard-panel-collapsed");

    setStatus("Checking…");
    try {
      if (!window.CSVB_DEVICE?.checkStatus) throw new Error("Device context helper is not loaded.");
      const row = await window.CSVB_DEVICE.checkStatus();
      const status = window.CSVB_DEVICE_CONTEXT?.status || row || localFallbackRow();
      renderRow(status);
      setStatus(status.access_allowed ? "Device approved." : "Device not approved.", status.access_allowed ? "ok" : "warn");
    } catch (error) {
      const row = { ...localFallbackRow(), status: "error", access_reason: error?.message || String(error) };
      renderRow(row);
      setStatus("Status check failed.", "err");
    }
  }

  async function requestRegistration() {
    ensureStyles();
    ensureRoot();
    try {
      const labelInput = document.getElementById("csvbRegisteredDeviceCompactLabel");
      const typeSelect = document.getElementById("csvbRegisteredDeviceCompactType");
      const hiddenLabel = document.getElementById("csvbDeviceLabelInput");
      const hiddenType = document.getElementById("csvbDeviceTypeSelect");
      if (hiddenLabel && labelInput) hiddenLabel.value = labelInput.value;
      if (hiddenType && typeSelect) hiddenType.value = typeSelect.value;

      if (!window.CSVB_DEVICE?.requestRegistration) throw new Error("Device context helper is not loaded.");
      setStatus("Requesting…");
      const row = await window.CSVB_DEVICE.requestRegistration();
      const status = window.CSVB_DEVICE_CONTEXT?.status || row || localFallbackRow();
      renderRow({ ...status, access_reason: status.access_reason || (status.access_allowed ? "Device approved." : "Registration requested / pending approval.") });
      setStatus(status.access_allowed ? "Device approved." : "Registration requested.", status.access_allowed ? "ok" : "warn");
    } catch (error) {
      const row = { ...localFallbackRow(), status: "error", access_reason: error?.message || String(error) };
      renderRow(row);
      setStatus("Registration failed.", "err");
    }
  }

  function boot() {
    window.CSVB_REGISTERED_DEVICE_COMPACT_BUILD = BUILD;
    ensureStyles();
    ensureRoot();
    setTimeout(refresh, 750);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
