// public/csvb-dashboard-area-home.js
// C.S.V. BEACON – Dashboard Area Home / Landing Navigation
// PA-7: selected Platform Area gets structured landing shortcuts.

(() => {
  "use strict";

  const BUILD = "PA7-2026-05-10";

  const AREA_HOME = {
    company_policy: {
      title: "Company Policy Home",
      text:
        "Controlled policy book, policy change requests, manuals/documents, published-text search and AI source-based search.",
      groups: [
        {
          title: "Policy control",
          items: [
            {
              label: "Open Company Policy",
              text: "Policy Book, Search, AI Search, Change Requests and Manuals/Documents.",
              href: "./company_policy.html",
              cardKey: "company_policy",
              icon: "📘",
            },
          ],
        },
      ],
    },

    sire_inspections: {
      title: "SIRE Inspections Home",
      text:
        "SIRE 2.0 preparation, self-assessment, post-inspection handling, inspector intelligence, reporting and related discussions.",
      groups: [
        {
          title: "Question library and preparation",
          items: [
            {
              label: "Read-Only Library",
              text: "Locked SIRE 2.0 question library for study and reference.",
              href: "./library.html?mode=study",
              cardKey: "library",
              icon: "📚",
            },
            {
              label: "Questions Editor",
              text: "Question library, PGNOs and expected evidence management.",
              href: "./q-questions-editor.html",
              cardKey: "qeditor",
              icon: "🖊️",
            },
          ],
        },
        {
          title: "Pre-inspection / self-assessment",
          items: [
            {
              label: "Company Builder",
              text: "Create questionnaires from filters/templates and assign roles.",
              href: "./q-company.html",
              cardKey: "company",
              icon: "🏢",
            },
            {
              label: "Self-Assessment Assignments",
              text: "Create campaigns and assign questionnaires to vessel/company roles.",
              href: "./sa_assignments.html",
              cardKey: "assignments",
              icon: "🗂️",
            },
            {
              label: "My Self-Assessment Tasks",
              text: "Open self-assessment tasks assigned to your role or position.",
              href: "./sa_tasks.html",
              cardKey: "tasks",
              icon: "✅",
            },
            {
              label: "Vessel Questionnaires",
              text: "Vessel view for assigned questionnaires.",
              href: "./q-vessel.html",
              cardKey: "vessel",
              icon: "🚢",
            },
          ],
        },
        {
          title: "Post-inspection and intelligence",
          items: [
            {
              label: "Post-Inspection Entry",
              text: "Import and review stored SIRE post-inspection reports.",
              href: "./post_inspection.html",
              cardKey: "post",
              icon: "📄",
            },
            {
              label: "Post-Inspection Stats",
              text: "Statistics and trends for post-inspection findings.",
              href: "./post_inspection_stats.html",
              cardKey: "poststats",
              icon: "📈",
            },
            {
              label: "Pre/Post Compare",
              text: "Compare self-assessment results against post-inspection findings.",
              href: "./sa_compare.html",
              cardKey: "compare",
              icon: "⚖️",
            },
            {
              label: "Inspector Intelligence",
              text: "Inspector records, observation history and third-party intelligence.",
              href: "./inspector_intelligence.html",
              cardKey: "inspector_intelligence",
              icon: "🧭",
            },
          ],
        },
        {
          title: "Follow-up and reporting",
          items: [
            {
              label: "Reports",
              text: "Reporting and export tools.",
              href: "./q-report.html",
              cardKey: "reports",
              icon: "📑",
            },
            {
              label: "Inspector / Third-Party",
              text: "Inspector or third-party access area, as permitted.",
              href: "./q-inspector.html",
              cardKey: "inspector",
              icon: "👁️",
            },
            {
              label: "Threads",
              text: "Discussion threads for questions, PGNOs, observations and follow-up.",
              href: "./threads.html",
              cardKey: "threads",
              icon: "💬",
            },
          ],
        },
      ],
    },

    marine_applications_vessel_interaction: {
      title: "Marine Applications & Vessel Interaction Home",
      text:
        "Reserved for vessel-facing operational applications, ship/office submissions and interaction workflows.",
      groups: [
        {
          title: "Planned area",
          items: [
            {
              label: "Future marine applications",
              text:
                "No modules have been assigned yet. This area is ready for vessel interaction workflows when the next module is built.",
              href: "",
              cardKey: "",
              icon: "⚓",
              disabled: true,
            },
          ],
        },
      ],
    },

    vessel_office_audits: {
      title: "Vessel and Office Audits Home",
      text:
        "Audit observations, internal/external audit workflows and future office/vessel audit management.",
      groups: [
        {
          title: "Audit management",
          items: [
            {
              label: "Audit Observations",
              text: "Record and manage internal/external audit observations.",
              href: "./audit_observations.html",
              cardKey: "audit_observations",
              icon: "📝",
            },
          ],
        },
      ],
    },

    platform_administration: {
      title: "Platform Administration Home",
      text:
        "Superuser controls for companies, users, vessels, module access, rights matrix and platform areas.",
      groups: [
        {
          title: "Platform control",
          items: [
            {
              label: "Superuser Administration",
              text: "Manage companies, users, vessels, modules, rights and platform area configuration.",
              href: "./su-admin.html",
              cardKey: "suadmin",
              icon: "⚙️",
            },
          ],
        },
      ],
    },
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isModuleAvailable(cardKey) {
    if (!cardKey) return true;

    const card = document.querySelector(`[data-card="${cardKey}"]`);
    if (!card) return false;

    return card.style.display !== "none";
  }

  function visibleItemsForGroup(group) {
    return (group.items || []).filter((item) => {
      if (item.disabled) return true;
      return isModuleAvailable(item.cardKey);
    });
  }

  function homeSignature(areaKey, home) {
    const parts = [areaKey];

    (home.groups || []).forEach((group) => {
      parts.push(group.title || "");
      visibleItemsForGroup(group).forEach((item) => {
        parts.push(`${item.label}:${item.cardKey}:${item.disabled ? "disabled" : "active"}`);
      });
    });

    return parts.join("|");
  }

  function renderItem(item) {
    const disabled = item.disabled || !item.href;
    const button = disabled
      ? `<span class="csvb-area-home-action disabled">Planned</span>`
      : `<a class="csvb-area-home-action" href="${esc(item.href)}">Open</a>`;

    return `
      <div class="csvb-area-home-item">
        <div class="csvb-area-home-item-icon">${esc(item.icon || "▣")}</div>
        <div class="csvb-area-home-item-main">
          <div class="csvb-area-home-item-title">${esc(item.label || "")}</div>
          <div class="csvb-area-home-item-text">${esc(item.text || "")}</div>
          <div class="csvb-area-home-item-actions">${button}</div>
        </div>
      </div>
    `;
  }

  function renderHome(areaKey) {
    const home = AREA_HOME[areaKey];

    if (!home) {
      return {
        signature: `default:${areaKey}`,
        html: `
          <div class="csvb-area-home">
            <div class="csvb-area-home-title">Area Home</div>
            <div class="csvb-area-home-text">Available modules for this platform area are shown below.</div>
          </div>
        `,
      };
    }

    const groups = (home.groups || [])
      .map((group) => {
        const items = visibleItemsForGroup(group);

        if (!items.length) return "";

        return `
          <div class="csvb-area-home-group">
            <div class="csvb-area-home-group-title">${esc(group.title || "")}</div>
            <div class="csvb-area-home-group-grid">
              ${items.map(renderItem).join("")}
            </div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");

    return {
      signature: homeSignature(areaKey, home),
      html: `
        <div class="csvb-area-home">
          <div class="csvb-area-home-title">${esc(home.title || "Area Home")}</div>
          <div class="csvb-area-home-text">${esc(home.text || "")}</div>
          ${groups || '<div class="csvb-area-home-empty">No shortcuts are currently available for this area.</div>'}
        </div>
      `,
    };
  }

  function injectStyles() {
    if (document.getElementById("csvb-dashboard-area-home-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-dashboard-area-home-styles";
    style.textContent = `
      .csvb-area-home {
        border: 1px solid #dbe6f6;
        border-radius: 14px;
        background: #f9fbfe;
        padding: 12px;
        margin-bottom: 12px;
      }

      .csvb-area-home-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1rem;
      }

      .csvb-area-home-text {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        margin-top: 4px;
        font-size: .9rem;
      }

      .csvb-area-home-group {
        margin-top: 12px;
      }

      .csvb-area-home-group-title {
        color: #062A5E;
        font-weight: 700;
        font-size: .94rem;
        margin-bottom: 8px;
      }

      .csvb-area-home-group-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 10px;
      }

      .csvb-area-home-item {
        border: 1px solid #dbe6f6;
        background: #ffffff;
        border-radius: 12px;
        padding: 10px;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 9px;
        min-height: 102px;
      }

      .csvb-area-home-item-icon {
        width: 34px;
        height: 34px;
        border-radius: 11px;
        border: 1px solid #cbd8ea;
        background: #eaf1fb;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1.18rem;
        line-height: 1;
      }

      .csvb-area-home-item-title {
        color: #062A5E;
        font-weight: 700;
        line-height: 1.25;
      }

      .csvb-area-home-item-text {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .86rem;
        margin-top: 4px;
      }

      .csvb-area-home-item-actions {
        margin-top: 9px;
      }

      .csvb-area-home-action {
        display: inline-block;
        background: #eaf6fb;
        color: #062A5E;
        border: 1px solid #9fd8ec;
        border-radius: 9px;
        padding: 6px 10px;
        font-weight: 700;
        font-size: .86rem;
        text-decoration: none;
      }

      .csvb-area-home-action:hover {
        background: #dff2fa;
      }

      .csvb-area-home-action.disabled {
        color: #6b7890;
        border-color: #cbd8ea;
        background: #f3f6fa;
        cursor: default;
      }

      .csvb-area-home-empty {
        margin-top: 10px;
        border: 1px dashed #b9c8df;
        background: #ffffff;
        border-radius: 12px;
        padding: 10px;
        color: #4d6283;
        font-weight: 400;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureAreaHome(panel) {
    const areaKey = panel.getAttribute("data-platform-area-panel") || "";
    if (!areaKey) return;

    const grid = panel.querySelector(".csvb-platform-area-grid");
    const header = panel.querySelector(".csvb-platform-selected-header");

    if (!grid || !header) return;

    const rendered = renderHome(areaKey);

    let home = panel.querySelector(".csvb-area-home-host");

    if (!home) {
      home = document.createElement("div");
      home.className = "csvb-area-home-host";
      header.insertAdjacentElement("afterend", home);
    }

    if (home.getAttribute("data-signature") !== rendered.signature) {
      home.innerHTML = rendered.html;
      home.setAttribute("data-signature", rendered.signature);
    }
  }

  function renderAllHomes() {
    injectStyles();

    document.querySelectorAll("[data-platform-area-panel]").forEach((panel) => {
      ensureAreaHome(panel);
    });
  }

  function init() {
    renderAllHomes();

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(renderAllHomes);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    window.CSVB_DASHBOARD_AREA_HOME = {
      build: BUILD,
      render: renderAllHomes,
      config: AREA_HOME,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(init, 350);
    });
  } else {
    setTimeout(init, 350);
  }
})();