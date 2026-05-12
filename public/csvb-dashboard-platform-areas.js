// public/csvb-dashboard-platform-areas.js
// C.S.V. BEACON – Dashboard Platform Areas
// PA-6B: load platform areas from Supabase, with hardcoded fallback.

(() => {
  "use strict";

  const BUILD = "PA6C-2026-05-12-MARINE-MODULES-STABLE";
  const SELECTED_KEY = "csvb_dashboard_selected_platform_area_v6";

  /*
    Database source:
      public.csvb_dashboard_list_platform_areas()

    Fallback:
      DEFAULT_PLATFORM_AREAS below.

    To add/edit platform areas later:
      Prefer Supabase data via dashboard_platform_areas and dashboard_platform_area_modules.
      This file remains the fallback only.
  */

  const DEFAULT_PLATFORM_AREAS = [
    {
      key: "company_policy",
      title: "Company Policy",
      icon: "📘",
      description:
        "Controlled policy book, policy text, change requests, manuals, print/export and AI source-based search.",
      cards: ["company_policy"],
      defaultSelected: true,
      placeholder: "No Company Policy module is currently available to this user.",
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
      placeholder: "No SIRE Inspection modules are currently available to this user.",
    },

    {
      key: "marine_applications_vessel_interaction",
      title: "Marine Applications & Vessel Interaction",
      icon: "⚓",
      description:
        "Future area for vessel-facing marine applications, operational interactions, vessel submissions and ship/office exchange workflows.",
      cards: ["mooring_anchoring_inventories", "portable_lifting_appliances_wires"],
      placeholder:
        "No modules have been assigned to this area yet. This area is reserved for future marine applications and vessel interaction workflows.",
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
    },

    {
      key: "platform_administration",
      title: "Platform Administration",
      icon: "⚙️",
      description:
        "Superuser administration, companies, users, module enablement and rights matrix.",
      cards: ["suadmin"],
      placeholder: "No administration modules are currently available to this user.",
    },
  ];

  let platformAreas = DEFAULT_PLATFORM_AREAS.slice();
  let platformAreaSource = "fallback";
  let observer = null;
  let refreshQueued = false;

  function safeText(value) {
    return String(value ?? "");
  }

  function normalizeModuleCards(value) {
    if (Array.isArray(value)) {
      return value
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .filter((x) => x.toLowerCase() !== "null");
    }

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (!trimmed || trimmed === "[null]") return [];

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .filter((x) => x.toLowerCase() !== "null");
        }
      } catch (_) {}

      return trimmed
        .replace(/^\{/, "")
        .replace(/\}$/, "")
        .split(",")
        .map((x) => x.replace(/^"|"$/g, "").trim())
        .filter(Boolean)
        .filter((x) => x.toLowerCase() !== "null");
    }

    return [];
  }

  function normalizeDbArea(row) {
    return {
      key: String(row.area_key || "").trim(),
      title: String(row.title || row.area_key || "Untitled Area").trim(),
      icon: String(row.icon || "▣").trim(),
      description: String(row.description || "").trim(),
      placeholder: String(row.placeholder || "No modules are currently available in this platform area.").trim(),
      cards: normalizeModuleCards(row.module_cards),
      defaultSelected: row.default_selected === true,
    };
  }

  async function loadPlatformAreasFromSupabase() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb.rpc("csvb_dashboard_list_platform_areas");

    if (error) {
      throw new Error(error.message || "Could not load dashboard platform areas.");
    }

    const rows = Array.isArray(data) ? data : [];

    const areas = rows
      .map(normalizeDbArea)
      .filter((area) => area.key && area.title);

    if (!areas.length) {
      throw new Error("No active dashboard platform areas returned by Supabase.");
    }

    return areas;
  }

  async function loadPlatformAreas() {
    try {
      const dbAreas = await loadPlatformAreasFromSupabase();
      platformAreas = dbAreas;
      platformAreaSource = "supabase";
    } catch (error) {
      console.warn("C.S.V. BEACON dashboard platform areas using fallback:", error);
      platformAreas = DEFAULT_PLATFORM_AREAS.slice();
      platformAreaSource = "fallback";
    }
  }

  function getCard(cardKey) {
    return document.querySelector(`[data-card="${cardKey}"]`);
  }

  function isCardAvailable(cardKey) {
    const card = getCard(cardKey);
    if (!card) return false;

    // Dashboard role/module logic uses inline style.display.
    return card.style.display !== "none";
  }

  function availableCardCount(area) {
    return (area.cards || []).reduce((count, cardKey) => {
      return count + (isCardAvailable(cardKey) ? 1 : 0);
    }, 0);
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

  function selectedAreaKey() {
    const saved = loadSelectedKey();

    if (platformAreas.some((area) => area.key === saved)) {
      return saved;
    }

    const defaultArea = platformAreas.find((area) => area.defaultSelected === true);
    return defaultArea?.key || platformAreas[0]?.key || "";
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

      .csvb-platform-area-source {
        color: #6b7890;
        font-weight: 400;
        font-size: .78rem;
        margin-top: 5px;
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

      .csvb-platform-panels {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .csvb-platform-selected-panel {
        background: #ffffff;
        border: 1px solid #dbe6f6;
        border-radius: 14px;
        box-shadow: 0 10px 30px rgba(3,27,63,0.06);
        padding: 12px;
      }

      .csvb-platform-selected-panel.hidden {
        display: none !important;
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

  function areaTileHtml(area, active) {
    const count = availableCardCount(area);
    const countText = count === 1 ? "1 module" : `${count} modules`;

    return `
      <button
        type="button"
        class="csvb-platform-area-card${active ? " active" : ""}"
        data-platform-area-card="${safeText(area.key)}"
      >
        <span class="csvb-platform-area-icon">${safeText(area.icon || "▣")}</span>
        <span class="csvb-platform-area-title">${safeText(area.title)}</span>
        <span class="csvb-platform-area-desc">${safeText(area.description || "")}</span>
        <span class="csvb-platform-area-count" data-platform-area-count="${safeText(area.key)}">${safeText(countText)}</span>
      </button>
    `;
  }

  function areaPanelHtml(area) {
    return `
      <section
        class="csvb-platform-selected-panel hidden"
        data-platform-area-panel="${safeText(area.key)}"
      >
        <div class="csvb-platform-selected-header">
          <span class="csvb-platform-selected-icon">${safeText(area.icon || "▣")}</span>
          <div>
            <div class="csvb-platform-selected-title">${safeText(area.title)}</div>
            <div class="csvb-platform-selected-text">${safeText(area.description || "")}</div>
          </div>
        </div>
        <div class="csvb-platform-area-grid" data-platform-area-grid="${safeText(area.key)}"></div>
      </section>
    `;
  }

  function createRoot() {
    const originalGrid = document.querySelector(".wrap > .grid");
    if (!originalGrid) return null;

    let root = document.getElementById("csvbPlatformAreaRoot");
    if (root) return root;

    injectStyles();

    root = document.createElement("div");
    root.id = "csvbPlatformAreaRoot";
    root.className = "csvb-platform-area-root";

    root.innerHTML = `
      <div class="csvb-platform-area-headline">
        <div class="csvb-platform-area-headline-title">Platform Areas</div>
        <div class="csvb-platform-area-headline-text">
          Modules are grouped by major operational area. Module permissions and company enablement continue to control what each user can see.
        </div>
        <div id="csvbPlatformAreaSource" class="csvb-platform-area-source"></div>
      </div>

      <div id="csvbPlatformAreaTiles" class="csvb-platform-area-tiles"></div>

      <div id="csvbPlatformAreaPanels" class="csvb-platform-panels"></div>
    `;

    originalGrid.parentElement.insertBefore(root, originalGrid);
    originalGrid.classList.add("csvb-dashboard-original-grid-hidden");

    const tiles = root.querySelector("#csvbPlatformAreaTiles");
    tiles.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-platform-area-card]");
      if (!btn) return;

      const key = btn.getAttribute("data-platform-area-card") || "";
      if (!key) return;

      saveSelectedKey(key);
      refreshDisplay();
    });

    renderStaticShell();
    moveCardsOnce();

    return root;
  }

  function renderStaticShell() {
    const tiles = document.getElementById("csvbPlatformAreaTiles");
    const panels = document.getElementById("csvbPlatformAreaPanels");

    if (!tiles || !panels) return;

    const activeKey = selectedAreaKey();

    tiles.innerHTML = platformAreas
      .map((area) => areaTileHtml(area, area.key === activeKey))
      .join("");

    panels.innerHTML = platformAreas
      .map((area) => areaPanelHtml(area))
      .join("");

    const source = document.getElementById("csvbPlatformAreaSource");
    if (source) {
      source.textContent =
        platformAreaSource === "supabase"
          ? "Platform area configuration loaded from Supabase."
          : "Platform area configuration loaded from local fallback.";
    }
  }

  function moveCardsOnce() {
    platformAreas.forEach((area) => {
      const grid = document.querySelector(`[data-platform-area-grid="${area.key}"]`);
      if (!grid) return;

      (area.cards || []).forEach((cardKey) => {
        const card = getCard(cardKey);
        if (!card) return;

        if (card.parentElement !== grid) {
          grid.appendChild(card);
        }
      });
    });
  }

  function updateAreaCounts() {
    platformAreas.forEach((area) => {
      const count = availableCardCount(area);
      const countText = count === 1 ? "1 module" : `${count} modules`;
      const countEl = document.querySelector(`[data-platform-area-count="${area.key}"]`);

      if (countEl) {
        countEl.textContent = countText;
      }
    });
  }

  function updateSelectedTile() {
    const key = selectedAreaKey();

    document.querySelectorAll("[data-platform-area-card]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-platform-area-card") === key);
    });
  }

  function updatePanels() {
    const key = selectedAreaKey();

    document.querySelectorAll("[data-platform-area-panel]").forEach((panel) => {
      const panelKey = panel.getAttribute("data-platform-area-panel") || "";
      panel.classList.toggle("hidden", panelKey !== key);
    });

    platformAreas.forEach((area) => {
      const grid = document.querySelector(`[data-platform-area-grid="${area.key}"]`);
      if (!grid) return;

      grid.querySelectorAll(".csvb-platform-area-placeholder").forEach((el) => el.remove());

      const count = availableCardCount(area);

      if (count === 0) {
        const placeholder = document.createElement("div");
        placeholder.className = "csvb-platform-area-placeholder";
        placeholder.textContent =
          area.placeholder || "No modules are currently available in this platform area.";
        grid.appendChild(placeholder);
      }
    });
  }

  function refreshDisplay() {
    createRoot();
    moveCardsOnce();
    updateAreaCounts();
    updateSelectedTile();
    updatePanels();
  }

  function scheduleRefresh() {
    if (refreshQueued) return;

    refreshQueued = true;

    window.requestAnimationFrame(() => {
      refreshQueued = false;
      refreshDisplay();
    });
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver(() => {
      scheduleRefresh();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  async function init() {
    await loadPlatformAreas();

    refreshDisplay();
    startObserver();

    setTimeout(refreshDisplay, 400);
    setTimeout(refreshDisplay, 1000);
    setTimeout(refreshDisplay, 1800);

    window.CSVB_DASHBOARD_PLATFORM_AREAS = {
      build: BUILD,
      source: platformAreaSource,
      areas: platformAreas,
      refresh: refreshDisplay,
      reload: async () => {
        await loadPlatformAreas();
        location.reload();
      },
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();