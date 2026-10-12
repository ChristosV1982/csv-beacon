// public/csvb-offline-diagnostics-compact-page.js
// C.S.V. BEACON — Compact Offline Diagnostics Detail Page
(() => {
  "use strict";
  const BUILD = "OFFLINE-DIAGNOSTICS-COMPACT-PAGE-2026-05-26-U01";
  const ROOT_ID = "csvbOfflineDiagnosticsCompactRoot";
  const BODY_ID = "csvbOfflineDiagnosticsCompactBody";

  function esc(v) {
    return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function ensureStyles() {
    if (document.getElementById("csvbOfflineDiagnosticsCompactStyles")) return;
    const st = document.createElement("style");
    st.id = "csvbOfflineDiagnosticsCompactStyles";
    st.textContent = `
      #csvbOfflineDiagnosticsCard{display:none!important;}
      #${ROOT_ID}{border:1px solid #D6E4F5;border-radius:14px;background:#fff;box-shadow:0 10px 24px rgba(3,27,63,.08);padding:12px;margin-bottom:12px;}
      #${ROOT_ID} .head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
      #${ROOT_ID} .title{color:#062A5E;font-size:1.02rem;font-weight:950;}
      #${ROOT_ID} .note{color:#5E6F86;font-size:.82rem;font-weight:700;margin-top:3px;}
      #${ROOT_ID} .actions{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;}
      #${ROOT_ID} button{border:1px solid #AEE3F1;border-radius:9px;background:#E9F7FB;color:#062A5E;padding:7px 10px;font-weight:900;cursor:pointer;}
      #${ROOT_ID} .status{font-size:.8rem;font-weight:900;color:#087334;}
      #${ROOT_ID} .wrap{overflow-x:auto;border:1px solid #E1ECF7;border-radius:12px;}
      #${ROOT_ID} table{width:100%;min-width:1280px;border-collapse:collapse;table-layout:fixed;}
      #${ROOT_ID} th,#${ROOT_ID} td{border-bottom:1px solid #E6EEF7;padding:8px 7px;text-align:left;vertical-align:middle;font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #${ROOT_ID} th{color:#35507B;background:#F7FAFE;font-weight:950;}
      #${ROOT_ID} td{color:#062A5E;font-weight:820;}
      #${ROOT_ID} .pill{display:inline-flex;border-radius:999px;padding:3px 8px;border:1px solid #D6E4F5;background:#F7FAFE;font-weight:950;font-size:.78rem;}
      #${ROOT_ID} .ok{background:#EAF9EF;border-color:#B8E7C8;color:#087334;}
      #${ROOT_ID} .warn{background:#FFF6E0;border-color:#F6D58F;color:#8A5A00;}
      #${ROOT_ID} .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.78rem;}
    `;
    document.head.appendChild(st);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `<div class="head"><div><div class="title">Offline Diagnostics</div><div class="note">Compact PWA/offline shell diagnostics. Read-only. No sync execution.</div></div><div class="actions"><span id="csvbOfflineDiagnosticsCompactStatus" class="status">Not checked.</span><button id="csvbOfflineDiagnosticsCompactRefresh" type="button">Refresh</button></div></div><div class="wrap"><table><thead><tr><th>Connection</th><th>Offline Status</th><th>Offline DB</th><th>Stores</th><th>Sync Queue</th><th>Pending</th><th>Total Ops</th><th>Service Worker</th><th>Caches</th><th>Build</th></tr></thead><tbody id="${BODY_ID}"><tr><td colspan="10">Loading…</td></tr></tbody></table></div>`;
    const wrap = document.querySelector(".wrap");
    const pageTitle = document.querySelector(".pageTitle");
    if (pageTitle?.parentElement) pageTitle.insertAdjacentElement("afterend", root);
    else if (wrap) wrap.prepend(root);
    else document.body.prepend(root);
    document.getElementById("csvbOfflineDiagnosticsCompactRefresh")?.addEventListener("click", refresh);
    return root;
  }

  async function collect() {
    const db = window.CSVB_OFFLINE_DB?.healthCheck ? await window.CSVB_OFFLINE_DB.healthCheck() : null;
    const q = window.CSVB_SYNC_QUEUE?.healthCheck ? await window.CSVB_SYNC_QUEUE.healthCheck() : null;
    const regs = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    const controlled = !!navigator.serviceWorker?.controller;
    const cacheKeys = window.caches?.keys ? await caches.keys() : [];
    return {
      connection: navigator.onLine ? "Online" : "Offline",
      offlineStatus: window.CSVB_OFFLINE_STATUS_BUILD || "Not loaded",
      offlineDb: db?.build || "Not loaded",
      stores: Array.isArray(db?.stores) ? db.stores.length : "—",
      syncQueue: q?.build || "Not loaded",
      pending: q?.pending_count ?? "—",
      totalOps: q?.total_operations ?? "—",
      serviceWorker: `${regs.length} registration(s), controlled: ${controlled ? "Yes" : "No"}`,
      controlled,
      caches: cacheKeys.length,
      build: BUILD
    };
  }

  function render(row) {
    const body = document.getElementById(BODY_ID);
    if (!body) return;
    body.innerHTML = `<tr><td><span class="pill ${row.connection === "Online" ? "ok" : "warn"}">${esc(row.connection)}</span></td><td class="mono" title="${esc(row.offlineStatus)}">${esc(row.offlineStatus)}</td><td class="mono" title="${esc(row.offlineDb)}">${esc(row.offlineDb)}</td><td>${esc(row.stores)}</td><td class="mono" title="${esc(row.syncQueue)}">${esc(row.syncQueue)}</td><td>${esc(row.pending)}</td><td>${esc(row.totalOps)}</td><td title="${esc(row.serviceWorker)}"><span class="pill ${row.controlled ? "ok" : "warn"}">${esc(row.serviceWorker)}</span></td><td>${esc(row.caches)}</td><td class="mono" title="${esc(row.build)}">${esc(row.build)}</td></tr>`;
  }

  async function refresh() {
    ensureStyles();
    ensureRoot();
    try {
      document.getElementById("csvbOfflineDiagnosticsCompactStatus").textContent = "Checking…";
      const row = await collect();
      window.CSVB_OFFLINE_DIAGNOSTICS_COMPACT_LAST = row;
      render(row);
      document.getElementById("csvbOfflineDiagnosticsCompactStatus").textContent = "Diagnostics OK.";
    } catch (e) {
      document.getElementById(BODY_ID).innerHTML = `<tr><td colspan="10">Diagnostics failed: ${esc(e?.message || e)}</td></tr>`;
    }
  }

  function boot() {
    window.CSVB_OFFLINE_DIAGNOSTICS_COMPACT_BUILD = BUILD;
    ensureStyles();
    ensureRoot();
    setTimeout(refresh, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
