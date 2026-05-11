// public/csvb-dashboard-mai-extension.js
// C.S.V. BEACON – Dashboard extension for Mooring and Anchoring Inventories

(() => {
  "use strict";

  const BUILD = "MAI-DASH-20260511-1";
  const CARD_KEY = "mooring_anchoring_inventories";
  const MODULE_KEY = "mooring_anchoring_inventories";
  const TARGET_AREA_KEY = "marine_applications_vessel_interaction";

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function getOriginalGrid() {
    return document.querySelector(".wrap > .grid");
  }

  function cardExists() {
    return !!document.querySelector(`[data-card="${CARD_KEY}"]`);
  }

  function createCard() {
    if (cardExists()) return;

    const originalGrid = getOriginalGrid();
    if (!originalGrid) return;

    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-card", CARD_KEY);
    card.style.display = "none";

    card.innerHTML = `
      <div class="title">Mooring and Anchoring Inventories</div>
      <div class="muted">
        Register, track, inspect and manage mooring wires, soft mooring ropes, mooring tails,
        shackles, messengers, anchors and anchoring equipment.
      </div>
      <div style="margin-top:12px;">
        <button class="btn2" type="button" onclick="location.href='./mooring-anchoring-inventories.html'">Open</button>
      </div>
    `;

    originalGrid.appendChild(card);
  }

  async function getModuleAccess() {
    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
      return { allowed: false, reason: "AUTH unavailable" };
    }

    const bundle = await window.AUTH.getSessionUserProfile();

    if (!bundle?.session?.user) {
      return { allowed: false, reason: "not logged in" };
    }

    const role = bundle?.profile?.role || "";
    const sb = window.AUTH.ensureSupabase();

    if (isPlatformRole(role)) {
      return { allowed: true, reason: "platform role" };
    }

    const { data, error } = await sb.rpc("csvb_my_company_modules");

    if (error) {
      console.warn("Could not load company modules for MAI dashboard card:", error);
      return { allowed: false, reason: error.message || "module check failed" };
    }

    const allowed = (data || []).some((m) => {
      return m.module_key === MODULE_KEY && m.is_enabled === true;
    });

    return { allowed, reason: allowed ? "company enabled" : "company disabled" };
  }

  async function applyCardVisibility() {
    createCard();

    const card = document.querySelector(`[data-card="${CARD_KEY}"]`);
    if (!card) return;

    const access = await getModuleAccess();

    card.style.display = access.allowed ? "block" : "none";

    window.CSVB_MAI_DASHBOARD_CARD = {
      build: BUILD,
      allowed: access.allowed,
      reason: access.reason,
    };
  }

  function updateAreaHomeConfig() {
    const home = window.CSVB_DASHBOARD_AREA_HOME;
    const config = home?.config;

    if (!config || !config[TARGET_AREA_KEY]) return false;

    config[TARGET_AREA_KEY] = {
      title: "Marine Applications & Vessel Interaction Home",
      text:
        "Vessel-facing operational applications, ship/office submissions and interaction workflows.",
      groups: [
        {
          title: "Mooring and anchoring",
          items: [
            {
              label: "Mooring and Anchoring Inventories",
              text:
                "Register, track, inspect and manage mooring wires, soft mooring ropes, mooring tails, shackles, messengers, anchors and anchoring equipment.",
              href: "./mooring-anchoring-inventories.html",
              cardKey: CARD_KEY,
              icon: "⚓",
            },
          ],
        },
      ],
    };

    if (typeof home.render === "function") {
      home.render();
    }

    return true;
  }

  function retryAreaHomeConfig() {
    let attempts = 0;

    const timer = window.setInterval(() => {
      attempts += 1;

      const ok = updateAreaHomeConfig();

      if (ok || attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  async function refreshAll() {
    await applyCardVisibility();
    retryAreaHomeConfig();

    if (window.CSVB_DASHBOARD_PLATFORM_AREAS?.refresh) {
      window.CSVB_DASHBOARD_PLATFORM_AREAS.refresh();
    }

    if (window.CSVB_DASHBOARD_AREA_HOME?.render) {
      window.CSVB_DASHBOARD_AREA_HOME.render();
    }
  }

  function init() {
    window.CSVB_DASHBOARD_MAI_EXTENSION_BUILD = BUILD;

    refreshAll().catch((error) => {
      console.error("MAI dashboard extension error:", error);
    });

    window.setTimeout(() => refreshAll().catch(console.error), 700);
    window.setTimeout(() => refreshAll().catch(console.error), 1500);
    window.setTimeout(() => refreshAll().catch(console.error), 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();