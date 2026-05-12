// public/csvb-dashboard-marine-area-stabilizer.js
// C.S.V. BEACON – Marine Applications dashboard area stabilizer
// PLA-03D: keeps MAI + PLA shortcuts stable after all dashboard extension races.

(() => {
  "use strict";

  const BUILD = "MARINE-AREA-STABILIZER-PLA03D-20260512-1";

  const AREA_KEY = "marine_applications_vessel_interaction";

  const ITEMS = [
    {
      groupTitle: "Mooring and anchoring",
      item: {
        label: "Mooring and Anchoring Inventories",
        text:
          "Register, track, inspect and manage mooring wires, soft mooring ropes, mooring tails, shackles, messengers, anchors and anchoring equipment.",
        href: "./mooring-anchoring-inventories-v4.html",
        cardKey: "mooring_anchoring_inventories",
        icon: "⚓",
      },
    },
    {
      groupTitle: "Portable lifting appliances and wires",
      item: {
        label: "Portable Lifting Appliances & Wires",
        text:
          "Inventory and inspection control for portable lifting appliances, running wires, remote control wires, standing wires and mast stays.",
        href: "./portable-lifting-appliances-wires.html",
        cardKey: "portable_lifting_appliances_wires",
        icon: "🏗️",
      },
    },
  ];

  function card(cardKey) {
    return document.querySelector(`[data-card="${cardKey}"]`);
  }

  function makeCardVisibleIfAllowed(cardKey, statusObjectName) {
    const el = card(cardKey);
    const status = window[statusObjectName];

    if (!el || !status || status.allowed !== true) return;

    el.style.display = "block";
  }

  function ensurePlatformAreaCards() {
    const platform = window.CSVB_DASHBOARD_PLATFORM_AREAS;

    if (!platform || !Array.isArray(platform.areas)) return false;

    const area = platform.areas.find((a) => a.key === AREA_KEY);
    if (!area) return false;

    if (!Array.isArray(area.cards)) area.cards = [];

    for (const entry of ITEMS) {
      if (!area.cards.includes(entry.item.cardKey)) {
        area.cards.push(entry.item.cardKey);
      }
    }

    if (typeof platform.refresh === "function") {
      platform.refresh();
    }

    return true;
  }

  function ensureGroup(home, groupTitle) {
    if (!Array.isArray(home.groups)) home.groups = [];

    let group = home.groups.find((g) => g.title === groupTitle);

    if (!group) {
      group = {
        title: groupTitle,
        items: [],
      };
      home.groups.push(group);
    }

    if (!Array.isArray(group.items)) group.items = [];

    return group;
  }

  function ensureAreaHomeConfig() {
    const areaHome = window.CSVB_DASHBOARD_AREA_HOME;
    const config = areaHome?.config;

    if (!config) return false;

    if (!config[AREA_KEY]) {
      config[AREA_KEY] = {
        title: "Marine Applications & Vessel Interaction Home",
        text:
          "Vessel-facing operational applications, ship/office submissions and marine interaction workflows.",
        groups: [],
      };
    }

    const home = config[AREA_KEY];

    home.title = "Marine Applications & Vessel Interaction Home";
    home.text =
      "Vessel-facing operational applications, ship/office submissions and marine interaction workflows.";

    for (const entry of ITEMS) {
      const group = ensureGroup(home, entry.groupTitle);

      const exists = group.items.some((item) => item.cardKey === entry.item.cardKey);

      if (!exists) {
        group.items.push({ ...entry.item });
      } else {
        group.items = group.items.map((item) => {
          if (item.cardKey !== entry.item.cardKey) return item;
          return { ...item, ...entry.item };
        });
      }
    }

    if (typeof areaHome.render === "function") {
      areaHome.render();
    }

    return true;
  }

  function run() {
    makeCardVisibleIfAllowed("mooring_anchoring_inventories", "CSVB_MAI_DASHBOARD_CARD");
    makeCardVisibleIfAllowed("portable_lifting_appliances_wires", "CSVB_PLA_DASHBOARD_CARD");

    ensurePlatformAreaCards();
    ensureAreaHomeConfig();

    window.CSVB_DASHBOARD_MARINE_AREA_STABILIZER = {
      build: BUILD,
      platformAreas: window.CSVB_DASHBOARD_PLATFORM_AREAS?.areas?.map((a) => ({
        key: a.key,
        cards: a.cards,
      })) || [],
      areaHomeGroups:
        window.CSVB_DASHBOARD_AREA_HOME?.config?.[AREA_KEY]?.groups?.map((g) => ({
          title: g.title,
          items: (g.items || []).map((i) => i.cardKey),
        })) || [],
    };
  }

  function start() {
    const delays = [300, 800, 1500, 2500, 4000, 6000, 9000];

    for (const delay of delays) {
      setTimeout(run, delay);
    }

    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      run();

      if (ticks >= 12) {
        clearInterval(timer);
      }
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
