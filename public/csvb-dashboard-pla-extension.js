// public/csvb-dashboard-pla-extension.js
// C.S.V. BEACON – Dashboard extension for Portable Lifting Appliances & Wires
// PLA-03B

(() => {
  "use strict";

  const BUILD = "PLA-DASH-03B-20260512-1";

  const CARD_KEY = "portable_lifting_appliances_wires";
  const COMPANY_MODULE_KEY = "portable_lifting_appliances_wires";
  const APP_MODULE_CODE = "PORTABLE_LIFTING_APPLIANCES_WIRES";
  const TARGET_AREA_KEY = "marine_applications_vessel_interaction";
  const TARGET_HREF = "./portable-lifting-appliances-wires.html";

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function getOriginalGrid() {
    return document.querySelector(".wrap > .grid");
  }

  function createOrRepairCard() {
    let card = document.querySelector(`[data-card="${CARD_KEY}"]`);

    if (!card) {
      const grid = getOriginalGrid();
      if (!grid) return null;

      card = document.createElement("div");
      card.className = "card";
      card.setAttribute("data-card", CARD_KEY);
      card.style.display = "none";
      grid.appendChild(card);
    }

    card.innerHTML = `
      <div class="title">Portable Lifting Appliances & Wires</div>
      <div class="muted">
        Inventory and inspection control for portable lifting appliances, running wires,
        remote control wires, standing wires and mast stays.
      </div>
      <div style="margin-top:12px;">
        <button class="btn2" type="button" onclick="location.href='${TARGET_HREF}'">Open</button>
      </div>
    `;

    return card;
  }

  async function allowedByEffectivePermissions(sb) {
    try {
      const { data, error } = await sb.rpc("csvb_my_effective_app_permissions");

      if (error) {
        console.warn("PLA dashboard permission check failed:", error);
        return false;
      }

      return (data || []).some((row) => {
        return row.module_code === APP_MODULE_CODE &&
          row.permission_action === "view" &&
          row.is_granted === true;
      });
    } catch (error) {
      console.warn("PLA dashboard permission exception:", error);
      return false;
    }
  }

  async function allowedByCompanyModule(sb) {
    try {
      const { data, error } = await sb.rpc("csvb_my_company_modules");

      if (error) {
        console.warn("PLA company module check failed:", error);
        return false;
      }

      return (data || []).some((m) => {
        return m.module_key === COMPANY_MODULE_KEY && m.is_enabled === true;
      });
    } catch (error) {
      console.warn("PLA company module exception:", error);
      return false;
    }
  }

  async function getAccess() {
    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
      return { allowed: false, reason: "AUTH unavailable" };
    }

    const bundle = await window.AUTH.getSessionUserProfile();

    if (!bundle?.session?.user) {
      return { allowed: false, reason: "not logged in" };
    }

    const profile = bundle.profile || {};
    const sb = window.AUTH.ensureSupabase();

    if (isPlatformRole(profile.role)) {
      return { allowed: true, reason: "platform role" };
    }

    const permissionAllowed = await allowedByEffectivePermissions(sb);
    if (permissionAllowed) {
      return { allowed: true, reason: "effective permission" };
    }

    const companyAllowed = await allowedByCompanyModule(sb);
    if (companyAllowed) {
      return { allowed: true, reason: "company module enabled" };
    }

    return { allowed: false, reason: "not permitted" };
  }

  function ensureInPlatformAreas() {
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

    if (!Array.isArray(area.groups)) {
      area.groups = [];
    }

    let group = area.groups.find((g) => g.title === "Portable lifting appliances and wires");

    if (!group) {
      group = {
        title: "Portable lifting appliances and wires",
        items: []
      };
      area.groups.push(group);
    }

    if (!group.items.some((item) => item.cardKey === CARD_KEY)) {
      group.items.push({
        label: "Portable Lifting Appliances & Wires",
        text:
          "Inventory and inspection control for portable lifting appliances, running wires, remote control wires, standing wires and mast stays.",
        href: TARGET_HREF,
        cardKey: CARD_KEY,
        icon: "🏗️"
      });
    }

    if (typeof home.render === "function") {
      home.render();
    }

    return true;
  }

  async function refresh() {
    const card = createOrRepairCard();
    if (!card) return;

    const access = await getAccess();

    card.style.display = access.allowed ? "block" : "none";

    window.CSVB_PLA_DASHBOARD_CARD = {
      build: BUILD,
      allowed: access.allowed,
      reason: access.reason
    };

    if (access.allowed) {
      ensureInPlatformAreas();
      updateAreaHomeConfig();

      if (window.CSVB_DASHBOARD_PLATFORM_AREAS?.refresh) {
        window.CSVB_DASHBOARD_PLATFORM_AREAS.refresh();
      }

      if (window.CSVB_DASHBOARD_AREA_HOME?.render) {
        window.CSVB_DASHBOARD_AREA_HOME.render();
      }
    }
  }

  function init() {
    window.CSVB_DASHBOARD_PLA_EXTENSION_BUILD = BUILD;

    refresh().catch(console.error);
    setTimeout(() => refresh().catch(console.error), 700);
    setTimeout(() => refresh().catch(console.error), 1500);
    setTimeout(() => refresh().catch(console.error), 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
