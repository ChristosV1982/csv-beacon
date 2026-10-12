// public/q-sire-offline-launcher.js
// C.S.V. BEACON — SIRE Offline Launcher logic.
// Separate from the main SIRE Viewer boot chain.

(() => {
  "use strict";

  const BUILD = "SIRE-OFFLINE-LAUNCHER-20260528_1";
  const PACKAGE_ID = "sire_questions_viewer_active_v1";
  const FORCE_KEY = "csvb_sire_viewer_force_offline";

  window.CSVB_SIRE_OFFLINE_LAUNCHER_BUILD = BUILD;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }

  function setStatus(message, kind = "warn") {
    const box = document.getElementById("statusBox");
    if (!box) return;
    box.textContent = message || "";
    box.className = "status " + kind;
    box.style.display = message ? "block" : "none";
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tile(label, value) {
    return `
      <div class="tile">
        <div class="label">${esc(label)}</div>
        <div class="value">${esc(value)}</div>
      </div>
    `;
  }

  function forcedOffline() {
    try {
      return localStorage.getItem(FORCE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function setForcedOffline(value) {
    try {
      if (value) localStorage.setItem(FORCE_KEY, "1");
      else localStorage.removeItem(FORCE_KEY);
    } catch (_) {}
  }

  function requireOfflineDb() {
    if (!window.CSVB_OFFLINE_DB) {
      throw new Error("Offline DB helper is not loaded.");
    }
    return window.CSVB_OFFLINE_DB;
  }

  async function getPackage() {
    const db = requireOfflineDb();
    return await db.get(db.STORES.PACKAGES, PACKAGE_ID);
  }

  function packageSummary(pkg) {
    const grant = pkg?.payload_json?.offline_grant || null;
    const hasPackage = !!pkg;

    return [
      tile("Package", hasPackage ? "Downloaded" : "Not downloaded"),
      tile("Forced Offline", forcedOffline() ? "Yes" : "No"),
      tile("Downloaded At", hasPackage ? formatDateTime(pkg.downloaded_at) : "—"),
      tile("Questions", hasPackage ? String(pkg.question_count ?? 0) : "0"),
      tile("PGNO Sets", hasPackage ? String(Object.keys(pkg.pgno_by_question_id || {}).length) : "0"),
      tile("Evidence Sets", hasPackage ? String(Object.keys(pkg.ee_by_question_id || {}).length) : "0"),
      tile("Reference Sets", hasPackage ? String(Object.keys(pkg.references_by_question_id || {}).length) : "0"),
      tile("Package Grant", grant?.grant_id ? "Linked" : "Not linked"),
      tile("Grant Expires", grant?.expires_at ? formatDateTime(grant.expires_at) : "—"),
      tile("Build", BUILD)
    ].join("");
  }

  async function refresh() {
    const host = document.getElementById("statusTiles");
    if (!host) return null;

    try {
      const pkg = await getPackage();
      host.innerHTML = packageSummary(pkg);

      if (pkg) {
        setStatus("Local SIRE offline package is available.", "ok");
      } else {
        setStatus("No local SIRE offline package was found on this browser.", "warn");
      }

      return pkg;
    } catch (error) {
      host.innerHTML = tile("Error", error?.message || String(error));
      setStatus("Offline package check failed.", "err");
      return null;
    }
  }

  async function openOffline() {
    const pkg = await refresh();

    if (!pkg) {
      alert(
        "Cannot open SIRE Viewer offline.\n\n" +
        "No local SIRE offline package exists on this browser.\n\n" +
        "Open the normal Viewer online and download the package first."
      );
      return;
    }

    setForcedOffline(true);
    location.href = "./q-sire-questions-viewer.html";
  }

  function openOnline() {
    setForcedOffline(false);
    location.href = "./q-sire-questions-viewer.html";
  }

  async function clearFlag() {
    setForcedOffline(false);
    await refresh();
    alert("Offline mode flag cleared.");
  }

  function boot() {
    document.getElementById("refreshBtn")?.addEventListener("click", refresh);
    document.getElementById("openOfflineBtn")?.addEventListener("click", openOffline);
    document.getElementById("openOnlineBtn")?.addEventListener("click", openOnline);
    document.getElementById("clearFlagBtn")?.addEventListener("click", clearFlag);

    refresh();

    window.CSVB_SIRE_OFFLINE_LAUNCHER = {
      BUILD,
      refresh,
      openOffline,
      openOnline,
      clearFlag,
      getPackage
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
