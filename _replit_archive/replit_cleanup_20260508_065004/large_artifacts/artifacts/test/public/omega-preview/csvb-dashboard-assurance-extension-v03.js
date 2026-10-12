// public/csvb-dashboard-assurance-extension-v03.js
// C.S.V. BEACON — Dashboard Inspection & Assurance extension v03.
// Adds Inspection & Assurance into Platform Area Home and corrects the area module count.
// Display-only dashboard injection. No database writes, no auth changes, no RLS changes.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-ASSURANCE-EXTENSION-V03-20260601";
  window.CSVB_DASHBOARD_ASSURANCE_EXTENSION_BUILD = BUILD;

  const AREA_KEY = "inspection_libraries_vetting";

  const ALLOWED_ROLES = new Set([
    "super_admin",
    "platform_owner",
    "company_admin",
    "company_superintendent",
  ]);

  function injectStyle() {
    if (document.getElementById("csvbDashboardAssuranceExtensionV03Style")) return;

    const style = document.createElement("style");
    style.id = "csvbDashboardAssuranceExtensionV03Style";
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
        font-weight:700;
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

  function updateAreaModuleCount() {
    const countNode = document.querySelector(`[data-platform-area-count="${AREA_KEY}"]`);
    const panel = document.querySelector(`[data-platform-area-panel="${AREA_KEY}"]`);

    if (!countNode || !panel) return 0;

    const itemCount = panel.querySelectorAll(".csvb-area-home-item").length;

    if (itemCount > 0) {
      countNode.textContent = itemCount === 1 ? "1 module" : `${itemCount} modules`;
    }

    return itemCount;
  }

  async function applyVisibility() {
    injectStyle();
    legacyCompanyBuilderLabel();

    const card = ensureBaseCard();
    const role = await getRole();
    const allowed = ALLOWED_ROLES.has(role);

    if (card) card.style.display = allowed ? "block" : "none";

    const areaInjected = allowed ? injectIntoAreaHomeConfig() : false;
    const areaCount = updateAreaModuleCount();

    window.CSVB_DASHBOARD_ASSURANCE_EXTENSION_STATE = {
      build: BUILD,
      role,
      allowed,
      card_present: !!card,
      area_home_injected: areaInjected,
      area_home_count: areaCount,
    };
  }

  function start() {
    applyVisibility();
    window.setTimeout(applyVisibility, 700);
    window.setTimeout(applyVisibility, 1600);
    window.setTimeout(applyVisibility, 2600);
    window.setTimeout(applyVisibility, 4200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
