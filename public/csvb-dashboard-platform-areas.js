// public/csvb-dashboard-platform-areas.js
// C.S.V. BEACON – Dashboard Platform Areas
// PA-2: square platform area cards with representative icons and selected-area module panel.

(() => {
  "use strict";

  const BUILD = "PA2-2026-05-10";

  /*
    To add a new major platform area later:
    1. Add a new object to PLATFORM_AREAS.
    2. Add:
       - key
       - title
       - icon
       - description
       - cards: [...]
    3. Existing dashboard module cards are identified by their data-card value.

    Existing dashboard card keys:
    library, compare, vessel, tasks, company, assignments,
    post, poststats, inspector_intelligence, audit_observations,
    reports, inspector, threads, company_policy, qeditor, suadmin
  */

  const PLATFORM_AREAS = [
    {
      key: "company_policy",
      title: "Company Policy",
      icon: "📘",
      description:
        "Controlled policy book, policy text, change requests, manuals, print/export and AI source-based search.",
      cards: ["company_policy"],
      defaultSelected: true,
    },

    {
      key: "sire_inspections",
      title: "SIRE Inspections",
      icon: "🛳️",
      description:
        "SIRE 2.0 library, pre-inspection/self-assessment, post-inspection, inspection statistics, inspector intelligence, reports and related discussion threads.",
      cards: [
        "library",
        "company",
        "assignments",
        "tasks",
        "vessel",
        "post",
        "poststats",
        "compare",
        "inspector_intelligence",
        "reports",
        "inspector",
        "qeditor",
        "threads",
      ],
    },

    {
      key: "marine_applications_vessel_interaction",
      title: "Marine Applications & Vessel Interaction",
      icon: "⚓",
      description:
        "Future area for vessel-facing marine applications, operational interactions, vessel submissions and ship/office exchange workflows.",
      cards: [],
      placeholder:
        "No modules have been assigned to this area yet. This area is reserved for future marine applications and vessel interaction workflows.",
      showWhenEmpty: true,
    },

    {
      key: "vessel_office_audits",
      title: "Vessel and Office Audits",
      icon: "📝",
      description:
        "Audit observations, internal/external audits and future vessel/office audit workflows.",
      cards: ["audit_observations"],
      placeholder:
        "Audit Observations is currently the first module in this area. Additional audit modules can be added later.",
      showWhenEmpty: true,
    },

    {
      key: "platform_administration",
      title: "Platform Administration",
      icon: "⚙️",
      description:
        "Superuser administration, companies, users, module enablement and rights matrix.",
      cards: ["suadmin"],
    },
  ];

  const SELECTED_KEY = "csvb_dashboard_selected_platform_area_v2";

  function allAreaCardKeys() {
    return new Set(PLATFORM_AREAS.flatMap((area) => area.cards || []));
  }

  function visibleCardCount(area) {
    return (area.cards || []).reduce((count, cardKey) => {
      const card = document.querySelector(`[data-card="${cardKey}"]`);
      if (!card) return count;

      const visible = card.style.display !== "none";
      return visible ? count + 1 : count;
    }, 0);
  }

  function hasVisibleModules(area) {
    return visibleCardCount(area) > 0;
  }

  function shouldShowArea(area) {
    const hasCards = (area.cards || []).length > 0;
    return hasVisibleModules(area) || (area.showWhenEmpty === true && !hasCards);
  }

  function loadSelectedKey() {
    try {
      return localStorage.getItem(SELECTED_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveSelectedKey(key) {
    try {
      localStorage.setItem(SELECTED_KEY, key || "");
    } catch (_) {}
  }

  function firstVisibleAreaKey() {
    const persisted = loadSelectedKey();
    const persistedArea = PLATFORM_AREAS.find((a) => a.key === persisted && shouldShowArea(a));
    if (persistedArea) return persistedArea.key;

    const defaultArea = PLATFORM_AREAS.find((a) => a.defaultSelected === true && shouldShowArea(a));
    if (defaultArea) return defaultArea.key;

    const first = PLATFORM_AREAS.find((a) => shouldShowArea(a));
    return first ? first.key : "";
  }

  function selectedAreaKey() {
    const active = document.querySelector(".csvb-platform-area-card.active");
    if (active) return active.getAttribute("data-platform-area-card") || "";
    return firstVisibleAreaKey();
  }

  function injectStyles() {
    if (document.getElementById("csvb-dashboard-platform-areas-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-dashboard-platform-areas-styles";
    style.textContent = `
      .csvb-platform-area-root {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 14px;
      }

      .csvb-platform-area-headline {
        background: #ffffff;
        border: 1px solid #dbe6f6;
        border-radius: 14px;
        padding: 12px 14px;
        box-shadow: 0 10px 30px rgba(3,27,63,0.06);
      }

      .csvb-platform-area-headline-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1.12rem;
      }

      .csvb-platform-area-headline-text {
        color: #4d6283;
        font-weight: 400;
        margin-top: 4px;
        line-height: 1.35;
        font-size: .92rem;
      }

      .csvb-platform-area-tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
        gap: 12px;
      }

      .csvb-platform-area-card {
        min-height: 172px;
        background: #ffffff;
        border: 1px solid #dbe6f6;
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(3,27,63,0.06);
        padding: 14px;
        text-align: left;
        cursor: pointer;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 8px;
        color: #10233f;
      }

      .csvb-platform-area-card:hover {
        background: #f7fbff;
        border-color: #bcd0ea;
      }

      .csvb-platform-area-card.active {
        border-color: #1a4170;
        box-shadow:
          0 10px 30px rgba(3,27,63,0.08),
          inset 0 0 0 2px #1a4170;
        background: #f7fbff;
      }

      .csvb-platform-area-icon {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        border: 1px solid #cbd8ea;
        background: #eaf1fb;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.55rem;
        line-height: 1;
      }

      .csvb-platform-area-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1.02rem;
        line-height: 1.22;
      }

      .csvb-platform-area-desc {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .88rem;
      }

      .csvb-platform-area-count {
        color: #1a4170;
        font-weight: 600;
        font-size: .84rem;
        border-top: 1px solid #dbe6f6;
        padding-top: 8px;
      }

      .csvb-platform-selected-panel {
        background: #ffffff;
        border: 1px solid #dbe6f6;
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(3,27,63,0.06);
        padding: 12px;
      }

      .csvb-platform-selected-header {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        border-bottom: 1px solid #dbe6f6;
        padding-bottom: 10px;
        margin-bottom: 12px;
      }

      .csvb-platform-selected-icon {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid #cbd8ea;
        background: #eaf1fb;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
      }

      .csvb-platform-selected-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1rem;
      }

      .csvb-platform-selected-text {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .9rem;
        margin-top: 2px;
      }

      .csvb-platform-area-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 12px;
      }

      .csvb-platform-area-placeholder {
        border: 1px dashed #b9c8df;
        background: #f9fbfe;
        color: #4d6283;
        border-radius: 12px;
        padding: 12px;
        line-height: 1.35;
        font-weight: 400;
      }

      .csvb-dashboard-original-grid-hidden {
        display: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  function areaCardHtml(area, selected) {
    const count = visibleCardCount(area);
    const countText = count === 1 ? "1 module" : `${count} modules`;

    return `
      <button
        type="button"
        class="csvb-platform-area-card${selected ? " active" : ""}"
        data-platform-area-card="${area.key}"
      >
        <span class="csvb-platform-area-icon">${area.icon || "▣"}</span>
        <span class="csvb-platform-area-title">${area.title}</span>
        <span class="csvb-platform-area-desc">${area.description || ""}</span>
        <span class="csvb-platform-area-count">${countText}</span>
      </button>
    `;
  }

  function buildAreaLayout() {
    const originalGrid = document.querySelector(".wrap > .grid");
    if (!originalGrid) return;

    if (document.getElementById("csvbPlatformAreaRoot")) return;

    injectStyles();

    const root = document.createElement("div");
    root.id = "csvbPlatformAreaRoot";
    root.className = "csvb-platform-area-root";

    const headline = document.createElement("div");
    headline.className = "csvb-platform-area-headline";
    headline.innerHTML = `
      <div class="csvb-platform-area-headline-title">Platform Areas</div>
      <div class="csvb-platform-area-headline-text">
        Modules are grouped by major operational area. Module permissions and company enablement continue to control what each user can see.
      </div>
    `;

    const tiles = document.createElement("div");
    tiles.id = "csvbPlatformAreaTiles";
    tiles.className = "csvb-platform-area-tiles";

    const panel = document.createElement("section");
    panel.id = "csvbPlatformSelectedPanel";
    panel.className = "csvb-platform-selected-panel";

    root.appendChild(headline);
    root.appendChild(tiles);
    root.appendChild(panel);

    originalGrid.parentElement.insertBefore(root, originalGrid);
    originalGrid.classList.add("csvb-dashboard-original-grid-hidden");

    refreshAreaLayout();
  }

  function moveVisibleCardsToSelectedArea(area) {
    const panel = document.getElementById("csvbPlatformSelectedPanel");
    if (!panel || !area) return;

    panel.innerHTML = `
      <div class="csvb-platform-selected-header">
        <span class="csvb-platform-selected-icon">${area.icon || "▣"}</span>
        <div>
          <div class="csvb-platform-selected-title">${area.title}</div>
          <div class="csvb-platform-selected-text">${area.description || ""}</div>
        </div>
      </div>
      <div class="csvb-platform-area-grid" data-platform-area-grid="${area.key}"></div>
    `;

    const grid = panel.querySelector(`[data-platform-area-grid="${area.key}"]`);
    if (!grid) return;

    const visibleCards = [];

    (area.cards || []).forEach((cardKey) => {
      const card = document.querySelector(`[data-card="${cardKey}"]`);
      if (!card) return;

      if (card.style.display !== "none") {
        visibleCards.push(card);
      }
    });

    if (!visibleCards.length) {
      const placeholder = document.createElement("div");
      placeholder.className = "csvb-platform-area-placeholder";
      placeholder.textContent =
        area.placeholder || "No modules are currently available in this platform area.";
      grid.appendChild(placeholder);
      return;
    }

    visibleCards.forEach((card) => {
      grid.appendChild(card);
    });
  }

  function parkCardsNotInSelectedArea(selectedArea) {
    const originalGrid = document.querySelector(".wrap > .grid");
    if (!originalGrid) return;

    const selectedSet = new Set(selectedArea?.cards || []);

    Array.from(document.querySelectorAll("[data-card]")).forEach((card) => {
      const key = card.getAttribute("data-card") || "";

      if (!selectedSet.has(key) && card.parentElement !== originalGrid) {
        originalGrid.appendChild(card);
      }
    });
  }

  function refreshAreaLayout() {
    const tiles = document.getElementById("csvbPlatformAreaTiles");
    if (!tiles) return;

    const visibleAreas = PLATFORM_AREAS.filter(shouldShowArea);
    let selectedKey = selectedAreaKey();

    if (!visibleAreas.some((area) => area.key === selectedKey)) {
      selectedKey = visibleAreas[0]?.key || "";
      saveSelectedKey(selectedKey);
    }

    tiles.innerHTML = visibleAreas
      .map((area) => areaCardHtml(area, area.key === selectedKey))
      .join("");

    tiles.querySelectorAll("[data-platform-area-card]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-platform-area-card") || "";
        saveSelectedKey(key);
        refreshAreaLayout();
      });
    });

    const selectedArea = PLATFORM_AREAS.find((area) => area.key === selectedKey) || visibleAreas[0];

    parkCardsNotInSelectedArea(selectedArea);
    moveVisibleCardsToSelectedArea(selectedArea);
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(refreshAreaLayout);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  function init() {
    buildAreaLayout();
    startObserver();

    window.CSVB_DASHBOARD_PLATFORM_AREAS = {
      build: BUILD,
      areas: PLATFORM_AREAS,
      refresh: refreshAreaLayout,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(init, 150);
    });
  } else {
    setTimeout(init, 150);
  }
})();