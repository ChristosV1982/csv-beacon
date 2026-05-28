// public/csvb-registered-devices-action-menu.js
// C.S.V. BEACON — Registered Devices compact action dropdown.
// UI-only helper. Preserves existing action button event handlers.

(() => {
  "use strict";

  const BUILD = "REGISTERED-DEVICES-ACTION-MENU-20260528_1";
  window.CSVB_REGISTERED_DEVICES_ACTION_MENU_BUILD = BUILD;

  function ensureStyles() {
    if (document.getElementById("csvbRegisteredDevicesActionMenuStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbRegisteredDevicesActionMenuStyles";
    style.textContent = `
      #tab-registered-devices .csvb-dev-actions {
        position: relative;
        display: inline-block !important;
        min-width: 120px;
      }

      #tab-registered-devices .csvb-dev-action-menu {
        position: relative;
        display: inline-block;
      }

      #tab-registered-devices .csvb-dev-action-menu-toggle {
        min-width: 116px;
        text-align: center;
      }

      #tab-registered-devices .csvb-dev-action-menu-panel {
        display: none;
        position: absolute;
        right: 0;
        top: calc(100% + 5px);
        z-index: 5000;
        min-width: 230px;
        max-width: 280px;
        padding: 8px;
        border: 1px solid #BFD3EF;
        border-radius: 12px;
        background: #FFFFFF;
        box-shadow: 0 16px 36px rgba(3,27,63,.22);
        gap: 6px;
      }

      #tab-registered-devices .csvb-dev-action-menu.open .csvb-dev-action-menu-panel {
        display: grid;
      }

      #tab-registered-devices .csvb-dev-action-menu-panel button {
        width: 100%;
        justify-content: flex-start;
        text-align: left;
        white-space: normal;
      }

      #tab-registered-devices .csvb-dev-action-menu-panel .csvb-grant-lifecycle-actions {
        display: grid !important;
        gap: 6px;
      }
    `;

    document.head.appendChild(style);
  }

  function closeAllMenus(exceptMenu = null) {
    document.querySelectorAll(".csvb-dev-action-menu.open").forEach((menu) => {
      if (menu !== exceptMenu) menu.classList.remove("open");
    });
  }

  function existingMenu(actions) {
    return Array.from(actions.children).find((el) => el.classList?.contains("csvb-dev-action-menu")) || null;
  }

  function attachCloseOnClick(panel) {
    panel.querySelectorAll("button").forEach((btn) => {
      if (btn.dataset.csvbActionMenuCloseBound === "1") return;
      btn.dataset.csvbActionMenuCloseBound = "1";
      btn.addEventListener("click", () => {
        setTimeout(() => closeAllMenus(), 100);
      });
    });
  }

  function compactRow(row) {
    if (!row || !row.matches("tr[data-device-id]")) return;

    const actions = row.querySelector("td:last-child .csvb-dev-actions");
    if (!actions) return;

    let menu = existingMenu(actions);
    let panel = null;

    if (!menu) {
      menu = document.createElement("div");
      menu.className = "csvb-dev-action-menu";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn2 csvb-dev-action-menu-toggle";
      toggle.textContent = "Actions ▾";
      toggle.title = "Open device actions";

      panel = document.createElement("div");
      panel.className = "csvb-dev-action-menu-panel";

      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const willOpen = !menu.classList.contains("open");
        closeAllMenus(menu);

        if (willOpen) menu.classList.add("open");
        else menu.classList.remove("open");
      });

      menu.appendChild(toggle);
      menu.appendChild(panel);
      actions.prepend(menu);
    } else {
      panel = menu.querySelector(".csvb-dev-action-menu-panel");
    }

    if (!panel) return;

    Array.from(actions.children).forEach((child) => {
      if (child === menu) return;
      panel.appendChild(child);
    });

    attachCloseOnClick(panel);
  }

  function compactAllRows() {
    ensureStyles();
    document.querySelectorAll("#rdTbody tr[data-device-id]").forEach(compactRow);
  }

  function boot() {
    window.CSVB_REGISTERED_DEVICES_ACTION_MENU = {
      BUILD,
      compactAllRows,
      closeAllMenus
    };

    document.addEventListener("click", (event) => {
      if (!event.target.closest?.(".csvb-dev-action-menu")) {
        closeAllMenus();
      }
    });

    compactAllRows();
    setInterval(compactAllRows, 1000);

    const target = document.getElementById("rdTbody") || document.body;
    if (target && window.MutationObserver) {
      const observer = new MutationObserver(() => compactAllRows());
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
