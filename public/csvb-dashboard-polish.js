// C.S.V. BEACON — MC-10D1 Dashboard Polish
// Visual/helper-only.

(() => {
  "use strict";

  const BUILD = "MC10D1-DASHBOARD-2026-04-30";
  window.CSVB_DASHBOARD_POLISH_BUILD = BUILD;

  const cardMeta = {
    library: {
      icon: "📚",
      purpose: "Review the locked SIRE 2.0 question library without editing.",
      help: "Open the read-only SIRE 2.0 question library."
    },
    compare: {
      icon: "📊",
      purpose: "Compare self-assessment results against post-inspection findings.",
      help: "Open comparison statistics between pre-inspection and post-inspection data."
    },
    vessel: {
      icon: "🚢",
      purpose: "View questionnaires assigned to a selected vessel.",
      help: "Open vessel questionnaire view."
    },
    tasks: {
      icon: "✅",
      purpose: "Open self-assessment tasks assigned to your role or position.",
      help: "Open your assigned self-assessment tasks."
    },
    company: {
      icon: "🏢",
      purpose: "Build questionnaires from assigned effective question libraries.",
      help: "Open Company Builder to create questionnaires."
    },
    assignments: {
      icon: "🗂️",
      purpose: "Create self-assessment campaigns and assign questionnaires.",
      help: "Open self-assessment assignment management."
    },
    post: {
      icon: "📝",
      purpose: "Import and review stored SIRE post-inspection reports.",
      help: "Open Post-Inspection Entry."
    },
    poststats: {
      icon: "📈",
      purpose: "Review post-inspection statistics and trends.",
      help: "Open Post-Inspection statistics."
    },
    inspector_intelligence: {
      icon: "🧭",
      purpose: "Review inspector history and observation patterns.",
      help: "Open Inspector Intelligence."
    },
    audit_observations: {
      icon: "🔎",
      purpose: "Record and manage internal/external audit observations.",
      help: "Open Audit Observations."
    },
    reports: {
      icon: "📑",
      purpose: "Open reporting and export tools.",
      help: "Open fleet reports and export tools."
    },
    inspector: {
      icon: "👁️",
      purpose: "Open inspector or third-party view, as permitted.",
      help: "Open Inspector / Third-Party portal."
    },
    qeditor: {
      icon: "✏️",
      purpose: "Manage master questions, company questions, PGNOs, and expected evidence.",
      help: "Open Questions Editor."
    },
    suadmin: {
      icon: "⚙️",
      purpose: "Manage companies, users, vessels, modules, assignments, and platform controls.",
      help: "Open Superuser Administration."
    }
  };

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function addHelperStrip(){
    if (document.getElementById("csvbDashboardHelperStrip")) return;

    const strip = document.createElement("div");
    strip.id = "csvbDashboardHelperStrip";
    strip.className = "csvb-dashboard-helper-strip";
    strip.innerHTML = `
      <div class="csvb-dashboard-helper-title">🧭 Dashboard Navigation</div>
      <div class="csvb-dashboard-helper-note">
        Hover over module buttons for short guidance. Visible modules depend on role and company access.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const main = document.querySelector("main,.wrap,body");
    main.prepend(strip);
  }

  function polishCards(){
    document.querySelectorAll("[data-card]").forEach((card) => {
      const key = card.getAttribute("data-card");
      const meta = cardMeta[key];
      if (!meta) return;

      card.setAttribute("data-csvb-help", meta.help);

      const openBtn = Array.from(card.querySelectorAll("button,a")).find((x) =>
        /open/i.test(String(x.textContent || ""))
      );
      if (openBtn) {
        openBtn.setAttribute("data-csvb-help", meta.help);
      }

      if (!card.querySelector(".csvb-card-purpose")) {
        const purpose = document.createElement("div");
        purpose.className = "csvb-card-purpose";
        purpose.textContent = meta.purpose;
        card.appendChild(purpose);
      }

      const title = card.querySelector("h1,h2,h3,b,.title,.cardTitle") || card.firstElementChild;
      if (title && !title.dataset.csvbDashboardIconed) {
        title.dataset.csvbDashboardIconed = "1";

        if (!title.querySelector(".csvb-card-icon")) {
          const span = document.createElement("span");
          span.className = "csvb-card-icon";
          span.textContent = meta.icon;
          title.prepend(span);
        }
      }
    });
  }

  function polish(){
    addHelperStrip();
    polishCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 800);
  setTimeout(polish, 1800);
})();
