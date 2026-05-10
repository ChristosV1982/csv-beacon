// public/csvb-dashboard-platform-areas.js
// C.S.V. BEACON – Dashboard Platform Areas
// PA-1: group dashboard cards into configurable major platform areas.

(() => {
  "use strict";

  const BUILD = "PA1-2026-05-08";

  /*
    To add a new major platform area later:
    1. Add a new object to PLATFORM_AREAS.
    2. Add existing dashboard data-card keys to cards: [...]
    3. If the area has no modules yet, use placeholder text.

    Existing dashboard card keys:
    library, compare, vessel, tasks, company, assignments,
    post, poststats, inspector_intelligence, audit_observations,
    reports, inspector, threads, company_policy, qeditor, suadmin
  */

  const PLATFORM_AREAS = [
    {
      key: "company_policy",
      title: "Company Policy",
      description:
        "Controlled policy book, policy text, change requests, manuals, print/export and AI source-based search.",
      cards: ["company_policy"],
      defaultOpen: true,
    },

    {
      key: "sire_inspections",
      title: "SIRE Inspections",
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
      defaultOpen: true,
    },

    {
      key: "marine_applications_vessel_interaction",
      title: "Marine Applications & Vessel Interaction",
      description:
        "Future area for vessel-facing marine applications, operational interactions, vessel submissions and ship/office exchange workflows.",
      cards: [],
      placeholder:
        "No modules have been assigned to this area yet. This area is reserved for future marine applications and vessel interaction workflows.",
      defaultOpen: false,
      showWhenEmpty: true,
    },

    {
      key: "vessel_office_audits",
      title: "Vessel and Office Audits",
      description:
        "Audit observations, internal/external audits and future vessel/office audit workflows.",
      cards: ["audit_observations"],
      placeholder:
        "Audit Observations is currently the first module in this area. Additional audit modules can be added later.",
      defaultOpen: false,
      showWhenEmpty: true,
    },

    {
      key: "platform_administration",
      title: "Platform Administration",
      description:
        "Superuser administration, companies, users, module enablement and rights matrix.",
      cards: ["suadmin"],
      defaultOpen: false,
    },
  ];

  const STORAGE_KEY = "csvb_dashboard_platform_areas_open_v1";

  function loadOpenState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveOpenState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {}));
    } catch (_) {}
  }

  function visibleCardCount(area) {
    return area.cards.reduce((count, cardKey) => {
      const card = document.querySelector(`[data-card="${cardKey}"]`);
      if (!card) return count;

      const visible = card.style.display !== "none";
      return visible ? count + 1 : count;
    }, 0);
  }

  function allAreaCardKeys() {
    return new Set(PLATFORM_AREAS.flatMap((area) => area.cards || []));
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

      .csvb-platform-area {
        background: #ffffff;
        border: 1px solid #dbe6f6;
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(3,27,63,0.06);
        overflow: hidden;
      }

      .csvb-platform-area-toggle {
        width: 100%;
        border: 0;
        background: #f7fbff;
        color: #10233f;
        padding: 11px 13px;
        text-align: left;
        display: grid;
        grid-template-columns: 22px minmax(180px, 1fr) auto;
        gap: 8px;
        align-items: center;
        cursor: pointer;
      }

      .csvb-platform-area-toggle:hover {
        background: #eef6ff;
      }

      .csvb-platform-area-caret {
        color: #1a4170;
        font-weight: 700;
        font-size: .95rem;
      }

      .csvb-platform-area-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1rem;
        line-height: 1.2;
      }

      .csvb-platform-area-count {
        color: #4d6283;
        font-weight: 500;
        font-size: .86rem;
        white-space: nowrap;
      }

      .csvb-platform-area-desc {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        padding: 0 13px 10px 43px;
        font-size: .9rem;
        background: #f7fbff;
      }

      .csvb-platform-area-body {
        padding: 12px;
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

  function createAreaShell(area, openState) {
    const persisted = Object.prototype.hasOwnProperty.call(openState, area.key)
      ? openState[area.key] === true
      : area.defaultOpen === true;

    const section = document.createElement("section");
    section.className = "csvb-platform-area";
    section.setAttribute("data-platform-area", area.key);

    section.innerHTML = `
      <button class="csvb-platform-area-toggle" type="button" data-platform-area-toggle="${area.key}">
        <span class="csvb-platform-area-caret">${persisted ? "▾" : "▸"}</span>
        <span class="csvb-platform-area-title">${area.title}</span>
        <span class="csvb-platform-area-count" data-platform-area-count="${area.key}"></span>
      </button>
      <div class="csvb-platform-area-desc">${area.description || ""}</div>
      <div class="csvb-platform-area-body" data-platform-area-body="${area.key}" style="${persisted ? "" : "display:none;"}">
        <div class="csvb-platform-area-grid" data-platform-area-grid="${area.key}"></div>
      </div>
    `;

    const toggle = section.querySelector("[data-platform-area-toggle]");
    const body = section.querySelector("[data-platform-area-body]");
    const caret = section.querySelector(".csvb-platform-area-caret");

    toggle.addEventListener("click", () => {
      const isOpen = body.style.display === "none";
      body.style.display = isOpen ? "" : "none";
      caret.textContent = isOpen ? "▾" : "▸";

      const nextState = loadOpenState();
      nextState[area.key] = isOpen;
      saveOpenState(nextState);
    });

    return section;
  }

  function buildAreaLayout() {
    const originalGrid = document.querySelector(".wrap > .grid");
    if (!originalGrid) return;

    if (document.getElementById("csvbPlatformAreaRoot")) return;

    injectStyles();

    const openState = loadOpenState();

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

    root.appendChild(headline);

    PLATFORM_AREAS.forEach((area) => {
      root.appendChild(createAreaShell(area, openState));
    });

    originalGrid.parentElement.insertBefore(root, originalGrid);
    originalGrid.classList.add("csvb-dashboard-original-grid-hidden");

    moveCardsIntoAreas();
    refreshAreaVisibility();
  }

  function moveCardsIntoAreas() {
    const knownCards = allAreaCardKeys();

    PLATFORM_AREAS.forEach((area) => {
      const areaGrid = document.querySelector(`[data-platform-area-grid="${area.key}"]`);
      if (!areaGrid) return;

      (area.cards || []).forEach((cardKey) => {
        const card = document.querySelector(`[data-card="${cardKey}"]`);
        if (card && card.parentElement !== areaGrid) {
          areaGrid.appendChild(card);
        }
      });
    });

    const uncategorized = Array.from(document.querySelectorAll("[data-card]"))
      .filter((card) => !knownCards.has(card.getAttribute("data-card") || ""));

    if (uncategorized.length) {
      let area = document.querySelector('[data-platform-area="uncategorized"]');
      let grid = document.querySelector('[data-platform-area-grid="uncategorized"]');

      if (!area) {
        const root = document.getElementById("csvbPlatformAreaRoot");
        if (!root) return;

        const shell = createAreaShell({
          key: "uncategorized",
          title: "Other Modules",
          description:
            "Modules not yet assigned to a major platform area. Add them to PLATFORM_AREAS later.",
          cards: [],
          defaultOpen: false,
          showWhenEmpty: false,
        }, loadOpenState());

        root.appendChild(shell);
        grid = shell.querySelector('[data-platform-area-grid="uncategorized"]');
      }

      uncategorized.forEach((card) => grid.appendChild(card));
    }
  }

  function refreshAreaVisibility() {
    PLATFORM_AREAS.forEach((area) => {
      const section = document.querySelector(`[data-platform-area="${area.key}"]`);
      const countEl = document.querySelector(`[data-platform-area-count="${area.key}"]`);
      const grid = document.querySelector(`[data-platform-area-grid="${area.key}"]`);

      if (!section || !grid) return;

      const count = visibleCardCount(area);
      const hasAssignedCards = (area.cards || []).length > 0;
      const shouldShow = count > 0 || (area.showWhenEmpty === true && !hasAssignedCards);

      section.style.display = shouldShow ? "" : "none";

      if (countEl) {
        countEl.textContent = count === 1 ? "1 module" : `${count} modules`;
      }

      let placeholder = grid.querySelector(".csvb-platform-area-placeholder");

      if (count === 0 && area.showWhenEmpty === true) {
        if (!placeholder) {
          placeholder = document.createElement("div");
          placeholder.className = "csvb-platform-area-placeholder";
          grid.appendChild(placeholder);
        }
        placeholder.textContent = area.placeholder || "No modules assigned to this area yet.";
      } else if (placeholder) {
        placeholder.remove();
      }
    });

    const uncategorizedGrid = document.querySelector('[data-platform-area-grid="uncategorized"]');
    const uncategorizedSection = document.querySelector('[data-platform-area="uncategorized"]');

    if (uncategorizedGrid && uncategorizedSection) {
      const visible = Array.from(uncategorizedGrid.querySelectorAll("[data-card]"))
        .filter((card) => card.style.display !== "none").length;

      uncategorizedSection.style.display = visible ? "" : "none";

      const countEl = document.querySelector('[data-platform-area-count="uncategorized"]');
      if (countEl) countEl.textContent = visible === 1 ? "1 module" : `${visible} modules`;
    }
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        moveCardsIntoAreas();
        refreshAreaVisibility();
      });
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
      refresh: refreshAreaVisibility,
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