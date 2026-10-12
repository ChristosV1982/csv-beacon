// C.S.V. BEACON — MC-10D1 Superuser Administration Polish
// Visual/helper-only.

(() => {
  "use strict";

  const BUILD = "MC10D1-SUADMIN-2026-04-30";
  window.CSVB_SU_ADMIN_POLISH_BUILD = BUILD;

  const tabMeta = [
    { rx:/companies/i, icon:"🏢", help:"Manage company tenants, company details, enabled modules, and linked vessels/users." },
    { rx:/users/i, icon:"👤", help:"Create, disable, enable, reset, and assign users to companies or vessels." },
    { rx:/vessels/i, icon:"🚢", help:"Create, activate, deactivate, delete unused vessels, and assign vessels to companies." },
    { rx:/rights matrix/i, icon:"🛡️", help:"Review role and module access rights." },
    { rx:/question assignments/i, icon:"🗂️", help:"Assign question sets or individual questions to companies and control override permissions." },
    { rx:/question overrides/i, icon:"✏️", help:"Review, approve, publish, reject, or archive company question override submissions." }
  ];

  const actionHelp = [
    { rx:/new company/i, help:"Start a new company/tenant record." },
    { rx:/save company/i, help:"Save company details and status." },
    { rx:/create user/i, help:"Create a new user account and profile." },
    { rx:/reset password/i, help:"Set a new password for this user." },
    { rx:/disable/i, help:"Disable this user/item without permanently deleting history." },
    { rx:/activate/i, help:"Activate this vessel or user again." },
    { rx:/deactivate/i, help:"Deactivate this vessel or item while preserving history." },
    { rx:/delete/i, help:"Delete only if you are sure this item is unused and not needed for history." },
    { rx:/assign \/ update set/i, help:"Save or update question set assignment settings for the selected company." },
    { rx:/refresh/i, help:"Reload the latest administration data from the database." }
  ];

  function addHelperStrip(){
    if (document.getElementById("csvbSuAdminHelperStrip")) return;

    const strip = document.createElement("div");
    strip.id = "csvbSuAdminHelperStrip";
    strip.className = "csvb-su-helper-strip";
    strip.innerHTML = `
      <div class="csvb-su-helper-title">⚙️ Superuser Administration</div>
      <div class="csvb-su-helper-note">
        Manage platform companies, users, vessels, module access, question assignments, and approvals. Hover over actions for guidance.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const host = document.querySelector(".wrap,main,body");
    host.prepend(strip);
  }

  function polishTabs(){
    const buttons = Array.from(document.querySelectorAll("button"));

    buttons.forEach((btn) => {
      const text = String(btn.textContent || "").trim();

      for (const meta of tabMeta) {
        if (!meta.rx.test(text)) continue;

        btn.setAttribute("data-csvb-help", meta.help);

        if (!btn.classList.contains("csvb-su-tab-iconed")) {
          btn.classList.add("csvb-su-tab-iconed");

          const span = document.createElement("span");
          span.className = "csvb-su-tab-icon";
          span.textContent = meta.icon;
          btn.prepend(span);
        }

        const parent = btn.parentElement;
        if (parent && buttons.filter((b) => b.parentElement === parent).length >= 3) {
          parent.classList.add("csvb-su-tabbar-polished");
        }

        break;
      }
    });
  }

  function polishActions(){
    document.querySelectorAll("button").forEach((btn) => {
      const text = String(btn.textContent || "").trim();

      for (const rule of actionHelp) {
        if (rule.rx.test(text)) {
          btn.setAttribute("data-csvb-help", rule.help);
          break;
        }
      }
    });
  }

  function addDangerNote(){
    if (document.getElementById("csvbSuAdminDangerNote")) return;

    const anyDelete = Array.from(document.querySelectorAll("button")).find((b) =>
      /delete/i.test(String(b.textContent || ""))
    );

    if (!anyDelete) return;

    const note = document.createElement("div");
    note.id = "csvbSuAdminDangerNote";
    note.className = "csvb-admin-danger-note";
    note.textContent = "Deletion actions should be used only for unused records. Prefer deactivate/disable when historical records may exist.";

    const panel = anyDelete.closest(".panel,.qa-panel,.qo-panel,section,div");
    if (panel) {
      panel.prepend(note);
    }
  }

  function polish(){
    addHelperStrip();
    polishTabs();
    polishActions();
    addDangerNote();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 700);
  setTimeout(polish, 1600);
  setTimeout(polish, 3000);
})();
