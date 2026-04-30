// public/csvb-question-overrides-link.js
// C.S.V. BEACON — MC-9D4C
// Adds Company Question Overrides launcher inside Questions Editor module.

(() => {
  "use strict";

  const BUILD = "MC9D4C-2026-04-30";

  function roleAllowed(role) {
    return [
      "super_admin",
      "platform_owner",
      "company_admin",
      "company_superintendent"
    ].includes(String(role || ""));
  }

  function injectStyles() {
    if (document.getElementById("csvbOverrideLinkStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbOverrideLinkStyles";
    style.textContent = `
      .csvb-override-launcher-wrap{
        display:flex;
        align-items:center;
        justify-content:flex-end;
        gap:8px;
        padding:10px 14px;
        margin:8px auto;
        max-width:1280px;
        box-sizing:border-box;
      }

      .csvb-override-launcher{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-decoration:none;
        border:1px solid #062A5E;
        background:#062A5E;
        color:#fff;
        border-radius:10px;
        padding:10px 13px;
        font-weight:950;
        box-shadow:0 8px 18px rgba(3,27,63,.12);
      }

      .csvb-override-launcher:hover{
        filter:brightness(1.08);
      }

      .csvb-override-launcher-sub{
        color:#5E6F86;
        font-weight:800;
        font-size:.88rem;
      }
    `;

    document.head.appendChild(style);
  }

  function addLauncher() {
    if (document.getElementById("csvbQuestionOverridesLauncher")) return;

    injectStyles();

    const wrap = document.createElement("div");
    wrap.className = "csvb-override-launcher-wrap";
    wrap.id = "csvbQuestionOverridesLauncherWrap";

    wrap.innerHTML = `
      <span class="csvb-override-launcher-sub">
        Company-side question override drafts
      </span>
      <a
        id="csvbQuestionOverridesLauncher"
        class="csvb-override-launcher"
        href="./q-company-overrides.html"
        title="Create or submit company-specific question overrides without changing the master question library"
      >
        Company Question Overrides
      </a>
    `;

    const header =
      document.querySelector("header") ||
      document.querySelector(".topbar") ||
      document.querySelector(".appHeader") ||
      document.querySelector(".pageHeader");

    if (header && header.parentElement) {
      header.insertAdjacentElement("afterend", wrap);
      return;
    }

    const main =
      document.querySelector("main") ||
      document.querySelector(".wrap") ||
      document.body;

    main.prepend(wrap);
  }

  async function init() {
    window.CSVB_QUESTION_OVERRIDES_LINK_BUILD = BUILD;

    /*
      If AUTH is available, show only to roles that can use override workflow.
      If AUTH is not available on this page, still add the launcher; the target
      page and module guard will enforce access.
    */
    try {
      if (window.AUTH?.getSessionUserProfile) {
        const bundle = await window.AUTH.getSessionUserProfile();
        const role = bundle?.profile?.role || "";

        if (!roleAllowed(role)) return;
      }
    } catch (_) {
      /*
        Non-fatal. q-company-overrides.html is protected by auth/module guard.
      */
    }

    addLauncher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
