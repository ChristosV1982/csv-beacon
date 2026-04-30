// public/csvb-ui-polish.js
// C.S.V. BEACON — MC-10A Global Interface Polish
// Visual-only. Adds small icons and compact UI affordances.

(() => {
  "use strict";

  const BUILD = "MC10A-2026-04-30";

  const cardIcons = {
    library: "📚",
    compare: "📊",
    vessel: "🚢",
    tasks: "✅",
    company: "🏢",
    assignments: "🗂️",
    post: "📝",
    poststats: "📈",
    inspector_intelligence: "🧭",
    audit_observations: "🔎",
    reports: "📑",
    inspector: "👁️",
    qeditor: "✏️",
    suadmin: "⚙️"
  };

  const buttonIconRules = [
    [/dashboard/i, "⌂"],
    [/login/i, "↪"],
    [/logout/i, "↩"],
    [/switch user/i, "⇄"],
    [/refresh|reload/i, "↻"],
    [/save/i, "✓"],
    [/create|new/i, "+"],
    [/open/i, "›"],
    [/delete|remove/i, "×"],
    [/assign/i, "→"],
    [/upload/i, "↑"],
    [/download/i, "↓"],
    [/search/i, "⌕"],
    [/filter/i, "⛃"],
    [/question assignments/i, "🗂️"],
    [/question overrides/i, "✏️"],
    [/company question overrides/i, "✏️"]
  ];

  function markBuild() {
    window.CSVB_UI_POLISH_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-ui-polish", BUILD);
  }

  function addCardIcons() {
    document.querySelectorAll("[data-card]").forEach((card) => {
      const key = card.getAttribute("data-card");
      const icon = cardIcons[key];

      if (!icon || card.querySelector(".csvb-card-icon")) return;

      const title =
        card.querySelector("h1,h2,h3,h4,.title,.cardTitle,.sectionTitle,b") ||
        card.firstElementChild;

      const badge = document.createElement("span");
      badge.className = "csvb-card-icon";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = icon;

      if (title) {
        title.classList.add("csvb-card-title-icon-wrap");
        title.prepend(badge);
      } else {
        card.prepend(badge);
      }
    });
  }

  function addButtonIcons() {
    document.querySelectorAll("button, a.btn, a.btn2, .qa-btn, .qo-btn").forEach((btn) => {
      if (btn.dataset.csvbIconed === "1") return;

      const text = String(btn.textContent || "").trim();
      if (!text) return;

      let icon = "";

      for (const [rx, ico] of buttonIconRules) {
        if (rx.test(text)) {
          icon = ico;
          break;
        }
      }

      if (!icon) return;

      const span = document.createElement("span");
      span.className = "csvb-button-icon";
      span.setAttribute("aria-hidden", "true");
      span.textContent = icon;

      btn.prepend(span);
      btn.dataset.csvbIconed = "1";
    });
  }

  function polish() {
    markBuild();
    addCardIcons();
    addButtonIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  // Re-apply lightly after late-rendered admin panels load.
  setTimeout(polish, 800);
  setTimeout(polish, 1800);
})();
