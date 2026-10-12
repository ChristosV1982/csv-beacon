/*
  csvb-global-busy.js
  Global non-blocking visual indicator for background processing.
  Build: CSVB_GLOBAL_BUSY_V01_20260629

  Purpose:
  - Shows a top loading bar and compact status panel during background network activity.
  - Automatically wraps fetch(), therefore covering Supabase REST calls and Edge Functions.
  - Avoids flicker by only showing if the operation lasts longer than AUTO_DELAY_MS.
  - Exposes window.CSVB_BUSY for explicit use by modules when required.
*/

(function () {
  "use strict";

  if (window.CSVB_BUSY && window.CSVB_BUSY.__build === "CSVB_GLOBAL_BUSY_V01_20260629") {
    return;
  }

  const BUILD = "CSVB_GLOBAL_BUSY_V01_20260629";
  const AUTO_DELAY_MS = 600;
  const MIN_VISIBLE_MS = 350;

  let activeCount = 0;
  let autoTimer = null;
  let visibleSince = 0;
  let lastTitle = "Processing…";
  let lastDetail = "Please wait while the application completes the background operation.";

  function now() {
    return Date.now();
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureStyle() {
    if (document.getElementById("csvbGlobalBusyStyle")) return;

    const style = document.createElement("style");
    style.id = "csvbGlobalBusyStyle";
    style.textContent = `
      .csvb-global-busy-topbar{
        position:fixed;
        top:0;
        left:0;
        right:0;
        height:4px;
        z-index:2147483000;
        background:transparent;
        pointer-events:none;
        opacity:0;
        transition:opacity .16s ease;
      }

      .csvb-global-busy-topbar.is-visible{
        opacity:1;
      }

      .csvb-global-busy-topbar-inner{
        height:100%;
        width:38%;
        background:#062a5e;
        border-radius:0 999px 999px 0;
        animation:csvbGlobalBusySlide 1.15s infinite ease-in-out;
        box-shadow:0 0 14px rgba(6,42,94,.35);
      }

      @keyframes csvbGlobalBusySlide{
        0%{ transform:translateX(-105%); }
        50%{ transform:translateX(120%); }
        100%{ transform:translateX(280%); }
      }

      .csvb-global-busy-panel{
        position:fixed;
        right:18px;
        bottom:18px;
        z-index:2147483000;
        min-width:280px;
        max-width:min(440px, calc(100vw - 36px));
        border:1px solid #bcd3ee;
        border-radius:14px;
        background:#ffffff;
        box-shadow:0 12px 36px rgba(2,24,55,.24);
        padding:12px 14px;
        color:#062a5e;
        opacity:0;
        transform:translateY(8px);
        pointer-events:none;
        transition:opacity .16s ease, transform .16s ease;
        font-family:inherit;
      }

      .csvb-global-busy-panel.is-visible{
        opacity:1;
        transform:translateY(0);
      }

      .csvb-global-busy-title{
        font-weight:950;
        font-size:.92rem;
        margin-bottom:4px;
      }

      .csvb-global-busy-detail{
        color:#35507b;
        font-weight:800;
        font-size:.82rem;
        line-height:1.35;
      }

      .csvb-global-busy-dots::after{
        content:"";
        animation:csvbGlobalBusyDots 1.2s infinite;
      }

      @keyframes csvbGlobalBusyDots{
        0%{ content:""; }
        33%{ content:"."; }
        66%{ content:".."; }
        100%{ content:"..."; }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureDom() {
    ensureStyle();

    let topbar = document.getElementById("csvbGlobalBusyTopbar");
    if (!topbar) {
      topbar = document.createElement("div");
      topbar.id = "csvbGlobalBusyTopbar";
      topbar.className = "csvb-global-busy-topbar";
      topbar.innerHTML = '<div class="csvb-global-busy-topbar-inner"></div>';
      document.body.appendChild(topbar);
    }

    let panel = document.getElementById("csvbGlobalBusyPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "csvbGlobalBusyPanel";
      panel.className = "csvb-global-busy-panel";
      panel.innerHTML = `
        <div class="csvb-global-busy-title csvb-global-busy-dots" id="csvbGlobalBusyTitle">Processing</div>
        <div class="csvb-global-busy-detail" id="csvbGlobalBusyDetail">Please wait.</div>
      `;
      document.body.appendChild(panel);
    }

    return { topbar, panel };
  }

  function showNow(title, detail) {
    lastTitle = title || lastTitle;
    lastDetail = detail || lastDetail;

    if (!document.body) return;

    const { topbar, panel } = ensureDom();
    const titleNode = document.getElementById("csvbGlobalBusyTitle");
    const detailNode = document.getElementById("csvbGlobalBusyDetail");

    if (titleNode) titleNode.textContent = lastTitle;
    if (detailNode) detailNode.innerHTML = esc(lastDetail);

    topbar.classList.add("is-visible");
    panel.classList.add("is-visible");

    if (!visibleSince) visibleSince = now();
  }

  function hideNow() {
    const topbar = document.getElementById("csvbGlobalBusyTopbar");
    const panel = document.getElementById("csvbGlobalBusyPanel");

    if (topbar) topbar.classList.remove("is-visible");
    if (panel) panel.classList.remove("is-visible");

    visibleSince = 0;
  }

  function scheduleShow(title, detail) {
    lastTitle = title || "Processing";
    lastDetail = detail || "The application is working in the background.";

    if (autoTimer) return;

    autoTimer = window.setTimeout(() => {
      autoTimer = null;
      if (activeCount > 0) {
        const suffix = activeCount > 1 ? ` (${activeCount} active requests)` : "";
        showNow(lastTitle, `${lastDetail}${suffix}`);
      }
    }, AUTO_DELAY_MS);
  }

  function begin(title, detail) {
    activeCount += 1;
    scheduleShow(title, detail);
  }

  function end() {
    activeCount = Math.max(0, activeCount - 1);

    if (activeCount > 0) {
      const detail = `${lastDetail.replace(/\s+\(\d+ active requests\)$/i, "")} (${activeCount} active requests)`;
      showNow(lastTitle, detail);
      return;
    }

    if (autoTimer) {
      window.clearTimeout(autoTimer);
      autoTimer = null;
    }

    const elapsed = visibleSince ? now() - visibleSince : 0;
    const delay = visibleSince && elapsed < MIN_VISIBLE_MS ? MIN_VISIBLE_MS - elapsed : 0;

    window.setTimeout(() => {
      if (activeCount === 0) hideNow();
    }, delay);
  }

  function describeFetch(input) {
    const raw = typeof input === "string"
      ? input
      : input && typeof input.url === "string"
        ? input.url
        : "";

    const url = String(raw || "");

    if (url.includes("/functions/v1/")) {
      if (url.includes("mscat")) return ["AI / M-SCAT processing", "The application is requesting learning-assisted M-SCAT results."];
      if (url.includes("import")) return ["Import processing", "The application is processing an import request."];
      return ["Processing request", "The application is running a server-side operation."];
    }

    if (url.includes("/rest/v1/")) {
      return ["Loading / saving records", "The application is communicating with the database."];
    }

    if (url.includes("/auth/v1/")) {
      return ["Checking session", "The application is verifying your session."];
    }

    return ["Loading", "The application is working in the background."];
  }

  const originalFetch = window.fetch ? window.fetch.bind(window) : null;

  if (originalFetch && !window.fetch.__csvbBusyWrapped) {
    const wrappedFetch = async function csvbBusyFetch(input, init) {
      const [title, detail] = describeFetch(input);
      begin(title, detail);

      try {
        return await originalFetch(input, init);
      } finally {
        end();
      }
    };

    wrappedFetch.__csvbBusyWrapped = true;
    window.fetch = wrappedFetch;
  }

  window.CSVB_BUSY = {
    __build: BUILD,

    show(title = "Processing", detail = "The application is working in the background.") {
      activeCount += 1;
      showNow(title, detail);
      return () => this.hide();
    },

    update(title = lastTitle, detail = lastDetail) {
      showNow(title, detail);
    },

    hide() {
      end();
    },

    async track(promise, title = "Processing", detail = "The application is working in the background.") {
      this.show(title, detail);
      try {
        return await promise;
      } finally {
        this.hide();
      }
    },

    activeCount() {
      return activeCount;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDom, { once: true });
  } else {
    ensureDom();
  }

  console.info(`${BUILD} loaded`);
})();
