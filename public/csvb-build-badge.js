// public/csvb-build-badge.js
(() => {
  "use strict";
  const VERSION = "2026.05.28-02";
  const HELPER = "CSVB-BUILD-BADGE-20260528-01";
  window.CSVB_BUILD_INFO = {
    app: "C.S.V. BEACON",
    version: VERSION,
    helper: HELPER,
    page: location.pathname.split("/").pop() || location.pathname,
    loaded_at: new Date().toISOString()
  };
  function render() {
    if (document.getElementById("csvbBuildBadge")) return;
    const style = document.createElement("style");
    style.textContent = "#csvbBuildBadge{position:fixed;left:8px;bottom:8px;z-index:2147482500;border:1px solid rgba(6,42,94,.18);background:rgba(255,255,255,.82);color:#062A5E;border-radius:999px;padding:3px 8px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:850;box-shadow:0 6px 16px rgba(3,27,63,.10);opacity:.72;user-select:none}#csvbBuildBadge:hover{opacity:1;border-color:#00A6B7}@media print{#csvbBuildBadge{display:none!important}}";
    document.head.appendChild(style);
    const badge = document.createElement("div");
    badge.id = "csvbBuildBadge";
    badge.textContent = "Build " + VERSION;
    badge.title = "C.S.V. BEACON Build " + VERSION + " • " + HELPER;
    document.body.appendChild(badge);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
