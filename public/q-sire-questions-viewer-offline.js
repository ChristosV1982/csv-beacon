// public/q-sire-questions-viewer-offline.js
// C.S.V. BEACON — SIRE Questions Viewer Offline Package Helper
// Phase 2A foundation.
// Read-only package download/status/delete only. No server writes. No sync execution.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-OFFLINE-PACKAGE-20260527-GRANT-SOFT-ENFORCE-1";
  const PACKAGE_ID = "sire_questions_viewer_active_v1";
  const MODULE_CODE = "SIRE_QUESTIONS_VIEWER";
  const PANEL_ID = "csvbSireViewerOfflinePanel";
  const STATUS_ID = "csvbSireViewerOfflineStatus";
  const BODY_ID = "csvbSireViewerOfflineBody";

  let lastGrantCheck = {
    checked_at: null,
    device_public_id: "",
    active_grant: null,
    grants: [],
    error: "",
    override_used: false,
    override_role: ""
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function setStatus(text, kind = "") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text || "";
    el.className = "csvb-sire-offline-status " + kind;
  }

  function requireOfflineDb() {
    if (!window.CSVB_OFFLINE_DB) {
      throw new Error("Offline DB helper is not loaded.");
    }
    return window.CSVB_OFFLINE_DB;
  }

  function requireSupabase() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH/Supabase helper is not loaded.");
    }
    return window.AUTH.ensureSupabase();
  }

  function getDevicePublicId() {
    try {
      return window.CSVB_DEVICE?.getDevicePublicId?.() ||
        localStorage.getItem("csvb_device_public_id") ||
        "";
    } catch (_) {
      return "";
    }
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatDateTime(value) {
    const d = parseDate(value);
    return d ? d.toLocaleString() : "—";
  }

  function isGrantActive(grant) {
    if (!grant) return false;
    if (String(grant.effective_status || "").toLowerCase() !== "active") return false;
    const expires = parseDate(grant.expires_at);
    return !expires || expires.getTime() > Date.now();
  }

  function selectActiveSireGrant(grants) {
    return (grants || [])
      .filter((g) => String(g.module_code || "").toUpperCase() === MODULE_CODE)
      .filter(isGrantActive)
      .sort((a, b) => String(b.expires_at || "").localeCompare(String(a.expires_at || "")))[0] || null;
  }

  async function getCurrentAuthContext() {
    try {
      if (window.AUTH?.getSessionUserProfile) {
        return await window.AUTH.getSessionUserProfile();
      }
      return window.CSVB_CONTEXT || {};
    } catch (_) {
      return window.CSVB_CONTEXT || {};
    }
  }

  function isPlatformAdminContext(ctx) {
    const role = String(ctx?.profile?.role || ctx?.role || "").trim();
    return ctx?.isPlatformAdmin === true ||
      role === "super_admin" ||
      role === "platform_owner";
  }

  async function canOverrideMissingOfflineGrant() {
    const ctx = await getCurrentAuthContext();
    return isPlatformAdminContext(ctx) ? ctx : null;
  }

  async function refreshGrantStatus() {
    const deviceId = getDevicePublicId();
    lastGrantCheck = {
      checked_at: nowIso(),
      device_public_id: deviceId,
      active_grant: null,
      grants: [],
      error: "",
      override_used: false,
      override_role: ""
    };

    if (!navigator.onLine) {
      lastGrantCheck.error = "Offline. Grant status cannot be refreshed.";
      return lastGrantCheck;
    }

    if (!deviceId) {
      lastGrantCheck.error = "No registered device ID found in this browser.";
      return lastGrantCheck;
    }

    try {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc("csvb_my_device_offline_grants", {
        p_device_public_id: deviceId
      });

      if (error) throw error;

      const grants = Array.isArray(data) ? data : [];
      const active = selectActiveSireGrant(grants);

      lastGrantCheck = {
        checked_at: nowIso(),
        device_public_id: deviceId,
        active_grant: active,
        grants,
        error: active ? "" : "No active SIRE_QUESTIONS_VIEWER offline grant found for this device."
      };

      return lastGrantCheck;
    } catch (error) {
      lastGrantCheck.error = error?.message || String(error);
      return lastGrantCheck;
    }
  }

  function grantSummaryTiles() {
    const active = lastGrantCheck.active_grant;
    const err = lastGrantCheck.error;

    if (active) {
      return [
        tile("Offline Grant", "Active"),
        tile("Grant Module", active.module_code || MODULE_CODE),
        tile("Grant Expires", formatDateTime(active.expires_at)),
        tile("Grant ID", active.grant_id || "—")
      ].join("");
    }

    return [
      tile("Offline Grant", err ? "Warning" : "None"),
      tile("Grant Note", err || "No active grant loaded yet."),
      tile("Device ID", lastGrantCheck.device_public_id || getDevicePublicId() || "—")
    ].join("");
  }


  function ensureStyles() {
    if (document.getElementById("csvbSireViewerOfflineStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerOfflineStyles";
    style.textContent = `
      #${PANEL_ID} {
        border: 1px solid #D6E4F5;
        border-radius: 12px;
        background: #F7FAFE;
        padding: 10px 12px;
        margin: 8px 0 10px;
        box-shadow: 0 8px 18px rgba(3,27,63,.05);
      }
      #${PANEL_ID} .csvb-sire-offline-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      #${PANEL_ID} .csvb-sire-offline-title {
        color: #062A5E;
        font-weight: 900;
        font-size: .92rem;
      }
      #${PANEL_ID} .csvb-sire-offline-note {
        color: #5E6F86;
        font-weight: 650;
        font-size: .78rem;
        margin-top: 3px;
      }
      #${PANEL_ID} .csvb-sire-offline-actions {
        display: inline-flex;
        gap: 7px;
        flex-wrap: wrap;
      }
      #${PANEL_ID} button {
        border: 1px solid #AEE3F1;
        border-radius: 9px;
        background: #E9F7FB;
        color: #062A5E;
        padding: 6px 10px;
        font-size: .78rem;
        font-weight: 850;
        cursor: pointer;
      }
      #${PANEL_ID} button.primary {
        border-color: #062A5E;
        background: #062A5E;
        color: #fff;
      }
      #${PANEL_ID} button.danger {
        border-color: #F2B7B7;
        background: #FFEAEA;
        color: #9B1C1C;
      }
      #${BODY_ID} {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 7px;
        margin-top: 8px;
      }
      #${PANEL_ID} .csvb-sire-offline-tile {
        border: 1px solid #E1ECF7;
        border-radius: 10px;
        background: #fff;
        padding: 7px 8px;
      }
      #${PANEL_ID} .csvb-sire-offline-label {
        color: #5E6F86;
        font-size: .72rem;
        font-weight: 750;
        margin-bottom: 3px;
      }
      #${PANEL_ID} .csvb-sire-offline-value {
        color: #062A5E;
        font-size: .86rem;
        font-weight: 900;
        overflow-wrap: anywhere;
      }
      #${PANEL_ID} .csvb-sire-offline-status {
        color: #5E6F86;
        font-size: .76rem;
        font-weight: 800;
      }
      #${PANEL_ID} .csvb-sire-offline-status.ok { color: #087334; }
      #${PANEL_ID} .csvb-sire-offline-status.warn { color: #8A5A00; }
      #${PANEL_ID} .csvb-sire-offline-status.err { color: #9B1C1C; }
    `;

    document.head.appendChild(style);
  }

  function tile(label, value) {
    return `
      <div class="csvb-sire-offline-tile">
        <div class="csvb-sire-offline-label">${esc(label)}</div>
        <div class="csvb-sire-offline-value">${esc(value)}</div>
      </div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="csvb-sire-offline-head">
        <div>
          <div class="csvb-sire-offline-title">Offline Package — SIRE Questions Viewer</div>
          <div class="csvb-sire-offline-note">Read-only package for local viewing. No offline editing and no sync execution.</div>
        </div>
        <div class="csvb-sire-offline-actions">
          <span id="${STATUS_ID}" class="csvb-sire-offline-status">Not checked.</span>
          <button id="csvbSireOfflineCheckBtn" type="button">Check</button>
          <button id="csvbSireOfflineDownloadBtn" class="primary" type="button">Download Package</button>
          <button id="csvbSireOfflineDeleteBtn" class="danger" type="button">Delete Package</button>
        </div>
      </div>
      <div id="${BODY_ID}"></div>
    `;

    const helper = document.querySelector(".csvb-sire-viewer-helper");
    if (helper?.parentElement) helper.insertAdjacentElement("afterend", panel);
    else document.body.prepend(panel);

    document.getElementById("csvbSireOfflineCheckBtn")?.addEventListener("click", renderPackageStatus);
    document.getElementById("csvbSireOfflineDownloadBtn")?.addEventListener("click", downloadPackage);
    document.getElementById("csvbSireOfflineDeleteBtn")?.addEventListener("click", deletePackage);

    return panel;
  }

  async function getPackage() {
    const offlineDb = requireOfflineDb();
    return await offlineDb.get(offlineDb.STORES.PACKAGES, PACKAGE_ID);
  }

  async function putPackage(pkg) {
    const offlineDb = requireOfflineDb();
    await offlineDb.put(offlineDb.STORES.PACKAGES, pkg);
    return pkg;
  }

  async function deletePackage() {
    const ok = confirm("Delete the local SIRE Questions Viewer offline package from this device?");
    if (!ok) return;

    try {
      const offlineDb = requireOfflineDb();
      await offlineDb.remove(offlineDb.STORES.PACKAGES, PACKAGE_ID);
      setStatus("Offline package deleted.", "ok");
      await renderPackageStatus();
    } catch (error) {
      setStatus("Delete failed: " + (error?.message || String(error)), "err");
    }
  }

  function packageSummary(pkg) {
    if (!pkg) {
      return [
        tile("Package", "Not downloaded"),
        tile("Module", MODULE_CODE),
        ...[grantSummaryTiles()],
        tile("Pending Sync", "Not applicable")
      ].join("");
    }

    return [
      tile("Package", "Downloaded"),
      tile("Downloaded At", pkg.downloaded_at || "—"),
      tile("Questions", pkg.question_count ?? 0),
      tile("PGNO Sets", Object.keys(pkg.pgno_by_question_id || {}).length),
      tile("Evidence Sets", Object.keys(pkg.ee_by_question_id || {}).length),
      tile("Reference Sets", Object.keys(pkg.references_by_question_id || {}).length),
      tile("Package Version", pkg.package_version || "v1"),
      tile("Package Grant", pkg.payload_json?.offline_grant?.grant_id ? "Linked" : "Not linked"),
      tile("Grant Expires", pkg.payload_json?.offline_grant?.expires_at ? formatDateTime(pkg.payload_json.offline_grant.expires_at) : "—"),
      tile("Build", BUILD)
    ].join("");
  }

  async function renderPackageStatus() {
    ensureStyles();
    ensurePanel();

    const body = document.getElementById(BODY_ID);
    if (!body) return null;

    try {
      await refreshGrantStatus();
      const pkg = await getPackage();
      body.innerHTML = packageSummary(pkg);

      if (lastGrantCheck.active_grant) {
        setStatus(pkg ? "Local package available. Active offline grant found." : "Active offline grant found. No local package.", "ok");
      } else {
        setStatus(pkg ? "Local package available. No active grant for current device." : "No local package. Active grant required for download.", "warn");
      }

      return pkg;
    } catch (error) {
      body.innerHTML = tile("Error", error?.message || String(error));
      setStatus("Status check failed.", "err");
      return null;
    }
  }

  async function fetchPgno(sb, questionId) {
    const { data, error } = await sb.rpc("csvb_pgno_master_for_question_for_me", { p_question_id: questionId });
    if (error) throw error;
    return (data || []).map((x) => ({ text: String(x.pgno_text || ""), remarks: String(x.remarks || "") })).filter((x) => x.text.trim());
  }

  async function fetchEe(sb, questionId) {
    const { data, error } = await sb.rpc("csvb_expected_evidence_for_question_for_me", { p_question_id: questionId });
    if (error) throw error;
    return (data || []).map((x) => ({
      text: String(x.evidence_text || ""),
      esms_references: String(x.esms_references || ""),
      esms_forms: String(x.esms_forms || ""),
      remarks: String(x.remarks || "")
    })).filter((x) => x.text.trim());
  }

  async function fetchReferences(sb, questionId) {
    const { data, error } = await sb.rpc("csvb_sire_question_references_for_question", { p_question_id: questionId });
    if (error) throw error;
    return Array.isArray(data) ? (data[0] || {}) : (data || {});
  }

  async function downloadPackage() {
    ensureStyles();
    ensurePanel();

    if (!navigator.onLine) {
      setStatus("Cannot download while offline.", "err");
      return;
    }

    try {
      const grantCheck = await refreshGrantStatus();

      if (!grantCheck.active_grant) {
        const overrideCtx = await canOverrideMissingOfflineGrant();

        if (!overrideCtx) {
          alert(
            "SIRE offline package download blocked.\n\n" +
            "No active SIRE_QUESTIONS_VIEWER offline grant was found for this registered device.\n\n" +
            "Ask a Super Admin / Company Admin to issue a SIRE offline grant from Registered Devices."
          );

          setStatus("Download blocked. Active SIRE offline grant required.", "err");
          await renderPackageStatus();
          return;
        }

        const proceed = confirm(
          "No active SIRE_QUESTIONS_VIEWER offline grant was found for this device.\n\n" +
          "You are allowed to override because you are a platform administrator.\n\n" +
          "This override will be recorded inside the local package metadata.\n\n" +
          "Grant warning:\n" + (grantCheck.error || "No active grant.") + "\n\n" +
          "Proceed with administrator override?"
        );

        if (!proceed) {
          setStatus("Download cancelled. No active offline grant.", "warn");
          await renderPackageStatus();
          return;
        }

        lastGrantCheck.override_used = true;
        lastGrantCheck.override_role = String(overrideCtx?.profile?.role || "platform_admin");
      }

      const sb = requireSupabase();
      const offlineDb = requireOfflineDb();

      setStatus("Loading SIRE questions from server…");

      const { data, error } = await sb.rpc("csvb_questions_master_for_me");
      if (error) throw error;

      const rows = (data || [])
        .filter((row) => String(row.source_type || "").trim() === "SIRE")
        .filter((row) => {
          const status = String(row.status || "").trim().toLowerCase();
          return !status || status === "active";
        });

      const pgnoByQuestionId = {};
      const eeByQuestionId = {};
      const referencesByQuestionId = {};
      let completed = 0;
      let errors = 0;
      let next = 0;
      const workers = Math.min(4, Math.max(1, rows.length));

      async function worker() {
        while (next < rows.length) {
          const row = rows[next++];
          const qid = row.id;

          try {
            const results = await Promise.allSettled([
              qid ? fetchPgno(sb, qid) : Promise.resolve([]),
              qid ? fetchEe(sb, qid) : Promise.resolve([]),
              qid ? fetchReferences(sb, qid) : Promise.resolve({})
            ]);

            pgnoByQuestionId[qid] = results[0].status === "fulfilled" ? results[0].value : [];
            eeByQuestionId[qid] = results[1].status === "fulfilled" ? results[1].value : [];
            referencesByQuestionId[qid] = results[2].status === "fulfilled" ? results[2].value : {};

            if (results.some((r) => r.status === "rejected")) errors += 1;
          } catch (_) {
            errors += 1;
            if (qid) {
              pgnoByQuestionId[qid] = [];
              eeByQuestionId[qid] = [];
              referencesByQuestionId[qid] = {};
            }
          } finally {
            completed += 1;
            if (completed % 10 === 0 || completed === rows.length) {
              setStatus(`Downloading package… ${completed}/${rows.length}`);
            }
          }
        }
      }

      await Promise.all(Array.from({ length: workers }, worker));

      const enrichedRows = rows.map((row) => ({
        ...row,
        payload: {
          ...(row.payload || {}),
          __offline_pgno: pgnoByQuestionId[row.id] || [],
          __offline_ee: eeByQuestionId[row.id] || [],
          __offline_references: referencesByQuestionId[row.id] || {}
        }
      }));

      const pkg = {
        package_id: PACKAGE_ID,
        module_code: MODULE_CODE,
        package_version: "v1",
        downloaded_at: nowIso(),
        question_count: rows.length,
        error_count: errors,
        rows: enrichedRows,
        pgno_by_question_id: pgnoByQuestionId,
        ee_by_question_id: eeByQuestionId,
        references_by_question_id: referencesByQuestionId,
        sync_status: "readonly_package",
        payload_json: {
          purpose: "SIRE Questions Viewer read-only offline package",
          no_offline_editing: true,
          no_sync_execution: true,
          offline_grant: lastGrantCheck.active_grant ? {
            grant_id: lastGrantCheck.active_grant.grant_id || null,
            module_code: lastGrantCheck.active_grant.module_code || MODULE_CODE,
            grant_type: lastGrantCheck.active_grant.grant_type || "readonly_package",
            issued_at: lastGrantCheck.active_grant.issued_at || null,
            expires_at: lastGrantCheck.active_grant.expires_at || null,
            checked_at: lastGrantCheck.checked_at || nowIso()
          } : null,
          offline_grant_warning: lastGrantCheck.active_grant ? "" : (lastGrantCheck.error || "No active offline grant found at download time."),
          offline_grant_override: lastGrantCheck.override_used ? {
            override_used: true,
            override_role: lastGrantCheck.override_role || "",
            override_at: nowIso()
          } : null
        }
      };

      await offlineDb.put(offlineDb.STORES.PACKAGES, pkg);
      setStatus(`Package saved. ${rows.length} questions. ${errors} child-load warning(s).`, errors ? "" : "ok");
      await renderPackageStatus();
    } catch (error) {
      setStatus("Download failed: " + (error?.message || String(error)), "err");
    }
  }

  async function healthCheck() {
    const pkg = await getPackage();
    return {
      ok: true,
      build: BUILD,
      package_id: PACKAGE_ID,
      has_package: !!pkg,
      question_count: pkg?.question_count || 0,
      downloaded_at: pkg?.downloaded_at || null
    };
  }

  function boot() {
    window.CSVB_SIRE_VIEWER_OFFLINE = {
      BUILD,
      PACKAGE_ID,
      MODULE_CODE,
      getPackage,
      renderPackageStatus,
      downloadPackage,
      deletePackage,
      healthCheck,
      refreshGrantStatus,
      getLastGrantCheck: () => JSON.parse(JSON.stringify(lastGrantCheck))
    };

    ensureStyles();
    ensurePanel();
    setTimeout(renderPackageStatus, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
