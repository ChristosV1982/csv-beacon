// public/csvb-dashboard-mai-extension.js
// C.S.V. BEACON – Dashboard extension for Mooring and Anchoring Inventories
// U-08E: rank-aware MAI dashboard visibility and correct v4 entry point.

(() => {
  "use strict";

  const BUILD = "MAI-DASH-PLA-AWARE-20260512-1";

  const CARD_KEY = "mooring_anchoring_inventories";
  const COMPANY_MODULE_KEY = "mooring_anchoring_inventories";
  const APP_MODULE_CODE = "MOORING_ANCHORING_INVENTORIES";
  const TARGET_AREA_KEY = "marine_applications_vessel_interaction";
  const TARGET_HREF = "./mooring-anchoring-inventories-v4.html";

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function cardExists() {
    return !!document.querySelector(`[data-card="${CARD_KEY}"]`);
  }

  function getOriginalGrid() {
    return document.querySelector(".wrap > .grid");
  }

  function createOrRepairCard() {
    let card = document.querySelector(`[data-card="${CARD_KEY}"]`);

    if (!card) {
      const originalGrid = getOriginalGrid();
      if (!originalGrid) return null;

      card = document.createElement("div");
      card.className = "card";
      card.setAttribute("data-card", CARD_KEY);
      originalGrid.appendChild(card);
    }

    card.innerHTML = `
      <div class="title">Mooring and Anchoring Inventories</div>
      <div class="muted">
        Register, track, inspect and manage mooring wires, soft mooring ropes, mooring tails,
        shackles, messengers, anchors and anchoring equipment.
      </div>
      <div style="margin-top:12px;">
        <button class="btn2" type="button" onclick="location.href='${TARGET_HREF}'">Open</button>
      </div>
    `;

    return card;
  }

  async function allowedByEffectiveRankPermissions(sb) {
    try {
      const { data, error } = await sb.rpc("csvb_my_effective_app_permissions");

      if (error) {
        console.warn("MAI dashboard rank permission check failed:", error);
        return false;
      }

      return (data || []).some((row) => {
        return row.module_code === APP_MODULE_CODE &&
          row.permission_action === "view" &&
          row.is_granted === true;
      });
    } catch (error) {
      console.warn("MAI dashboard rank permission exception:", error);
      return false;
    }
  }

  async function allowedByCompanyModule(sb) {
    try {
      const { data, error } = await sb.rpc("csvb_my_company_modules");

      if (error) {
        console.warn("MAI dashboard company module check failed:", error);
        return false;
      }

      return (data || []).some((m) => {
        return m.module_key === COMPANY_MODULE_KEY && m.is_enabled === true;
      });
    } catch (error) {
      console.warn("MAI dashboard company module exception:", error);
      return false;
    }
  }

  async function getModuleAccess() {
    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
      return { allowed: false, reason: "AUTH unavailable" };
    }

    const bundle = await window.AUTH.getSessionUserProfile();

    if (!bundle?.session?.user) {
      return { allowed: false, reason: "not logged in" };
    }

    const profile = bundle.profile || {};
    const role = profile.role || "";
    const sb = window.AUTH.ensureSupabase();

    if (isPlatformRole(role)) {
      return { allowed: true, reason: "platform role" };
    }

    const rankAllowed = await allowedByEffectiveRankPermissions(sb);

    if (rankAllowed) {
      return { allowed: true, reason: "rank permission" };
    }

    const companyAllowed = await allowedByCompanyModule(sb);

    if (companyAllowed) {
      return { allowed: true, reason: "company module enabled" };
    }

    return { allowed: false, reason: "not permitted by rank or company module" };
  }

  function ensureMaiInPlatformAreas() {
    const platform = window.CSVB_DASHBOARD_PLATFORM_AREAS;

    if (!platform || !Array.isArray(platform.areas)) return false;

    const target = platform.areas.find((area) => area.key === TARGET_AREA_KEY);
    if (!target) return false;

    if (!Array.isArray(target.cards)) target.cards = [];

    if (!target.cards.includes(CARD_KEY)) {
      target.cards.push(CARD_KEY);
    }

    if (typeof platform.refresh === "function") {
      platform.refresh();
    }

    return true;
  }

  function updateAreaHomeConfig() {
    const home = window.CSVB_DASHBOARD_AREA_HOME;
    const config = home?.config;

    if (!config || !config[TARGET_AREA_KEY]) return false;

    const area = config[TARGET_AREA_KEY];

    area.title = "Marine Applications & Vessel Interaction Home";
    area.text =
      "Vessel-facing operational applications, ship/office submissions and interaction workflows.";

    if (!Array.isArray(area.groups)) area.groups = [];

    function ensureGroup(title) {
      let group = area.groups.find((g) => g.title === title);
      if (!group) {
        group = { title, items: [] };
        area.groups.push(group);
      }
      if (!Array.isArray(group.items)) group.items = [];
      return group;
    }

    const mooringGroup = ensureGroup("Mooring and anchoring");

    if (!mooringGroup.items.some((item) => item.cardKey === CARD_KEY)) {
      mooringGroup.items.push({
        label: "Mooring and Anchoring Inventories",
        text:
          "Register, track, inspect and manage mooring wires, soft mooring ropes, mooring tails, shackles, messengers, anchors and anchoring equipment.",
        href: "./mooring-anchoring-inventories-v4.html",
        cardKey: CARD_KEY,
        icon: "⚓",
      });
    }

    const plaGroup = ensureGroup("Portable lifting appliances and wires");

    if (!plaGroup.items.some((item) => item.cardKey === "portable_lifting_appliances_wires")) {
      plaGroup.items.push({
        label: "Portable Lifting Appliances & Wires",
        text:
          "Inventory and inspection control for portable lifting appliances, running wires, remote control wires, standing wires and mast stays.",
        href: "./portable-lifting-appliances-wires.html",
        cardKey: "portable_lifting_appliances_wires",
        icon: "🏗️",
      });
    }

    if (typeof home.render === "function") {
      home.render();
    }

    return true;
  }

  function retryAreaHomeConfig() {
    let attempts = 0;

    const timer = window.setInterval(() => {
      attempts += 1;

      const okHome = updateAreaHomeConfig();
      const okArea = ensureMaiInPlatformAreas();

      if ((okHome && okArea) || attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  async function applyCardVisibility() {
    const card = createOrRepairCard();
    if (!card) return;

    const access = await getModuleAccess();

    card.style.display = access.allowed ? "block" : "none";

    window.CSVB_MAI_DASHBOARD_CARD = {
      build: BUILD,
      allowed: access.allowed,
      reason: access.reason,
    };

    if (access.allowed) {
      ensureMaiInPlatformAreas();
      updateAreaHomeConfig();

      if (window.CSVB_DASHBOARD_PLATFORM_AREAS?.refresh) {
        window.CSVB_DASHBOARD_PLATFORM_AREAS.refresh();
      }

      if (window.CSVB_DASHBOARD_AREA_HOME?.render) {
        window.CSVB_DASHBOARD_AREA_HOME.render();
      }
    }
  }

  async function refreshAll() {
    await applyCardVisibility();
    retryAreaHomeConfig();
  }

  function init() {
    window.CSVB_DASHBOARD_MAI_EXTENSION_BUILD = BUILD;

    refreshAll().catch((error) => {
      console.error("MAI dashboard extension error:", error);
    });

    window.setTimeout(() => refreshAll().catch(console.error), 700);
    window.setTimeout(() => refreshAll().catch(console.error), 1500);
    window.setTimeout(() => refreshAll().catch(console.error), 2500);
    window.setTimeout(() => refreshAll().catch(console.error), 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
