// public/csvb-dashboard-assurance-extension-v05.js
// C.S.V. BEACON — Dashboard Inspection & Assurance extension v05.
// Adds Inspection & Assurance into Platform Area Home AND into the dashboard platform area source array,
// so the top area tile module count calculates correctly.
// Display-only dashboard injection. No database writes, no auth changes, no RLS changes.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-ASSURANCE-EXTENSION-V05-20260601";
  const AREA_KEY = "inspection_libraries_vetting";

  window.CSVB_DASHBOARD_ASSURANCE_EXTENSION_BUILD = BUILD;

  const ALLOWED_ROLES = new Set([
    "super_admin",
    "platform_owner",
    "company_admin",
    "company_superintendent",
  ]);

  const REQUIRED_AREA_CARDS = [
    "inspection_assurance",
    "risk_rating_profiles",
  ];

  let lastRole = "";
  let observerStarted = false;
  let updateQueued = false;

  function injectStyle() {
    if (document.getElementById("csvbDashboardAssuranceExtensionV05Style")) return;

    const style = document.createElement("style");
    style.id = "csvbDashboardAssuranceExtensionV05Style";
    style.textContent = `
      [data-card="inspection_assurance"]{
        border-color:#b9d9f2!important;
        background:linear-gradient(180deg,#ffffff,#f7fbff)!important;
      }

      .csvb-assurance-card-head{
        display:flex;
        align-items:center;
        gap:10px;
      }

      .csvb-assurance-card-icon{
        width:34px;
        height:34px;
        object-fit:contain;
        flex:0 0 auto;
      }

      .csvb-assurance-card-badge{
        display:inline-block;
        margin-top:6px;
        border:1px solid #bfe0f5;
        border-radius:999px;
        background:#eaf7ff;
        color:#06305c;
        font-size:.74rem;
        font-weight:650;
        padding:3px 8px;
      }

      .csvb-assurance-card-actions{
        margin-top:10px;
        display:flex;
        gap:8px;
        flex-wrap:wrap;
      }

      @media(max-width:620px){
        .csvb-assurance-card-actions .btn2{width:100%;}
      }
    `;
    document.head.appendChild(style);
  }

  function legacyCompanyBuilderLabel() {
    const card = document.querySelector('[data-card="company"]');
    if (!card || card.dataset.csvbLegacyLabeled === "1") return;

    const title = card.querySelector(".title");
    const muted = card.querySelector(".muted");

    if (title && !title.textContent.includes("Legacy")) {
      title.textContent = "Company Builder (Legacy)";
    }

    if (muted) {
      muted.textContent =
        "Legacy questionnaire builder retained for reference while Inspection & Assurance is developed.";
    }

    card.dataset.csvbLegacyLabeled = "1";
  }

  function ensureBaseCard() {
    const grid = document.querySelector(".grid");
    if (!grid) return null;

    let card = document.querySelector('[data-card="inspection_assurance"]');
    if (card) return card;

    card = document.createElement("div");
    card.className = "card";
    card.dataset.card = "inspection_assurance";
    card.style.display = "none";

    card.innerHTML = `
      <div class="csvb-assurance-card-head">
        <img class="csvb-assurance-card-icon" src="./assets/csv-beacon-icon.png" alt="C.S.V. BEACON" />
        <div>
          <div class="title">Inspection & Assurance</div>
          <div class="muted">Create inspection question sets, prepare onboard/pre-vetting inspections and build KPI-ready assurance records.</div>
        </div>
      </div>
      <div class="csvb-assurance-card-badge">New module foundation</div>
      <div class="csvb-assurance-card-actions">
        <button class="btn2" type="button" data-csvb-assurance-open="question_sets">Question Sets</button>
      </div>
    `;

    card.querySelector("[data-csvb-assurance-open]")?.addEventListener("click", () => {
      location.href = "./inspection-question-sets.html";
    });

    const companyCard = document.querySelector('[data-card="company"]');

    if (companyCard && companyCard.parentNode === grid) {
      grid.insertBefore(card, companyCard);
    } else {
      grid.insertBefore(card, grid.firstElementChild || null);
    }

    return card;
  }

  async function getRole() {
    try {
      if (!window.AUTH?.ensureSupabase) return "";

      const sb = window.AUTH.ensureSupabase();
      const { data: sessionData } = await sb.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) return "";

      const { data, error } = await sb
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (error) return "";
      return String(data?.role || "");
    } catch {
      return "";
    }
  }

  function ensureCardInArray(arr, key, beforeKey = null) {
    if (!Array.isArray(arr) || !key || arr.includes(key)) return false;

    if (beforeKey && arr.includes(beforeKey)) {
      arr.splice(arr.indexOf(beforeKey), 0, key);
    } else {
      arr.push(key);
    }

    return true;
  }

  function injectIntoPlatformAreaSource() {
    const platform = window.CSVB_DASHBOARD_PLATFORM_AREAS;
    const areas = platform?.areas;

    if (!Array.isArray(areas)) return false;

    const area = areas.find((x) => x?.key === AREA_KEY);
    if (!area) return false;

    area.cards = Array.isArray(area.cards) ? area.cards : [];

    let changed = false;

    changed = ensureCardInArray(area.cards, "inspection_assurance", "company") || changed;
    changed = ensureCardInArray(area.cards, "risk_rating_profiles", "compare") || changed;

    if (changed) {
      platform.refresh?.();
    }

    return true;
  }

  function injectIntoAreaHomeConfig() {
    const areaHome = window.CSVB_DASHBOARD_AREA_HOME;
    const config = areaHome?.config;
    const vetting = config?.[AREA_KEY];

    if (!vetting?.groups?.length) return false;

    let group = vetting.groups.find((g) =>
      String(g.title || "").toLowerCase().includes("pre-inspection")
    );

    if (!group) {
      group = {
        title: "Pre-inspection / self-assessment",
        items: [],
      };
      vetting.groups.splice(1, 0, group);
    }

    group.items = Array.isArray(group.items) ? group.items : [];

    const exists = group.items.some((item) => item.cardKey === "inspection_assurance");

    if (!exists) {
      group.items.unshift({
        label: "Inspection & Assurance",
        text: "Create inspection question sets, prepare onboard/pre-vetting inspections and build KPI-ready assurance records.",
        href: "./inspection-question-sets.html",
        cardKey: "inspection_assurance",
        icon: "🧭",
      });
    }

    areaHome.render?.();
    return true;
  }

  function currentAreaHomeItemCount() {
    const panel = document.querySelector(`[data-platform-area-panel="${AREA_KEY}"]`);
    if (!panel) return 0;
    return panel.querySelectorAll(".csvb-area-home-item").length;
  }

  function currentAreaTileCountText() {
    return document.querySelector(`[data-platform-area-count="${AREA_KEY}"]`)?.textContent || "";
  }

  function scheduleUpdate() {
    if (updateQueued) return;
    updateQueued = true;

    window.setTimeout(() => {
      updateQueued = false;
      applyVisibility();
    }, 180);
  }

  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;

    const mo = new MutationObserver(scheduleUpdate);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  async function applyVisibility() {
    injectStyle();
    legacyCompanyBuilderLabel();

    const card = ensureBaseCard();
    const role = lastRole || await getRole();
    lastRole = role;

    const allowed = ALLOWED_ROLES.has(role);

    if (card) card.style.display = allowed ? "block" : "none";

    const platformInjected = allowed ? injectIntoPlatformAreaSource() : false;
    const areaInjected = allowed ? injectIntoAreaHomeConfig() : false;

    window.CSVB_DASHBOARD_ASSURANCE_EXTENSION_STATE = {
      build: BUILD,
      role,
      allowed,
      card_present: !!card,
      platform_area_source_injected: platformInjected,
      area_home_injected: areaInjected,
      area_home_count: currentAreaHomeItemCount(),
      count_text: currentAreaTileCountText(),
      required_cards: REQUIRED_AREA_CARDS,
      platform_area_cards: window.CSVB_DASHBOARD_PLATFORM_AREAS?.areas
        ?.find((x) => x?.key === AREA_KEY)?.cards || [],
    };
  }

  function start() {
    applyVisibility();
    startObserver();

    [300, 700, 1200, 2000, 3200, 5000, 7500].forEach((ms) => {
      window.setTimeout(applyVisibility, ms);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
