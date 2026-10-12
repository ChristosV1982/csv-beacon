/* public/csvb-onboard-personnel-terminology-u04.js */
/* C.S.V. BEACON – U-04 Onboard Personnel Terminology Migration */
/*
  Purpose:
  - Remove old visible "vessel user" mentality from Superuser Administration UI.
  - Keep internal role value = vessel for compatibility.
  - Display vessel role as "Onboard Personnel".
  - Replace Position wording with Rank / Position.
  - Remove old fixed vessel-position creation dropdown mentality.
*/

(() => {
  "use strict";

  const BUILD = "CSVBEACON-ONBOARD-PERSONNEL-TERMINOLOGY-U04-20260512-1";

  const ROLE_LABELS = {
    super_admin: "Super Admin",
    platform_owner: "Platform Owner",
    company_admin: "Company Admin",
    company_superintendent: "Company Superintendent",
    vessel: "Onboard Personnel",
    inspector: "Inspector / Third Party"
  };

  const LEGACY_POSITION_VALUES = new Set([
    "Master",
    "Chief Officer",
    "Chief Engineer",
    "Navigating Officer"
  ]);

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isDanaos(value) {
    return /^[0-9]{3,5}$/.test(String(value || "").trim());
  }

  function normalized(text) {
    return String(text || "").trim().toLowerCase();
  }

  function labelForRole(value) {
    return ROLE_LABELS[String(value || "").trim()] || String(value || "").trim();
  }

  function addStyles() {
    if ($("csvbOnboardTerminologyU04Styles")) return;

    const style = document.createElement("style");
    style.id = "csvbOnboardTerminologyU04Styles";
    style.textContent = `
      .csvb-u04-info {
        margin: 10px 0 12px;
        padding: 10px 12px;
        border: 1px solid #D6E4F5;
        border-left: 5px solid #0097A7;
        border-radius: 12px;
        background: #F4F8FC;
        color: #14223A;
      }

      .csvb-u04-info-title {
        color: #062A5E;
        font-weight: 950;
        margin-bottom: 4px;
      }

      .csvb-u04-info-text {
        color: #4D6283;
        font-weight: 700;
        font-size: .88rem;
        line-height: 1.35;
      }

      .csvb-u04-badge {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 3px 8px;
        margin-left: 6px;
        border-radius: 999px;
        border: 1px solid #BCE3EC;
        background: #EEF8FB;
        color: #062A5E;
        font-size: .72rem;
        font-weight: 950;
        white-space: nowrap;
      }

      .csvb-u04-role-pill {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid #BCE3EC;
        background: #EEF8FB;
        color: #062A5E;
        font-size: .78rem;
        font-weight: 950;
        white-space: nowrap;
      }

      .csvb-u04-rank-missing {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid #F6D58F;
        background: #FFF6E0;
        color: #8A5A00;
        font-size: .78rem;
        font-weight: 950;
      }

      .csvb-u04-muted-note {
        color: #4D6283;
        font-size: .84rem;
        font-weight: 700;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(style);
  }

  function patchRoleSelectOptions(select) {
    if (!select) return;

    Array.from(select.options || []).forEach((option) => {
      const value = String(option.value || "").trim();

      if (ROLE_LABELS[value]) {
        option.textContent = ROLE_LABELS[value];
      }
    });
  }

  function patchAllRoleSelects() {
    patchRoleSelectOptions($("cu_role"));
    patchRoleSelectOptions($("u_filter_role"));
    patchRoleSelectOptions($("rmRole"));
  }

  function removeLegacyPositionDropdownEntries() {
    const select = $("cu_position_pick");
    if (!select) return;

    Array.from(select.querySelectorAll("option")).forEach((option) => {
      if (LEGACY_POSITION_VALUES.has(option.value) || LEGACY_POSITION_VALUES.has(option.textContent.trim())) {
        option.remove();
      }
    });

    Array.from(select.querySelectorAll("optgroup")).forEach((group) => {
      const label = normalized(group.getAttribute("label"));
      if (label.includes("vessel position") || label.includes("vessel positions")) {
        group.remove();
      }
    });
  }

  function patchCreationPanelLabels() {
    const tabUsers = $("tab-users");
    if (!tabUsers) return;

    if (!$("csvbU04OnboardInfo")) {
      const intro = tabUsers.querySelector(".muted");
      const box = document.createElement("div");
      box.id = "csvbU04OnboardInfo";
      box.className = "csvb-u04-info";
      box.innerHTML = `
        <div class="csvb-u04-info-title">Onboard Personnel Model</div>
        <div class="csvb-u04-info-text">
          Onboard users are now created as individual persons using their DANAOS numerical credential.
          Access is controlled by assigned vessel, onboard rank, onboard status, and the onboard access switch.
          The internal technical role remains <span class="mono">vessel</span> only for compatibility with existing modules.
        </div>
      `;

      if (intro) {
        intro.insertAdjacentElement("afterend", box);
      } else {
        tabUsers.insertAdjacentElement("afterbegin", box);
      }
    }

    const createTitle = Array.from(tabUsers.querySelectorAll("div"))
      .find((el) => el.textContent.trim() === "Create user");

    if (createTitle) {
      createTitle.textContent = "Create Person / User";
    }

    const roleField = $("cu_role")?.closest(".field");
    const roleLabel = roleField?.querySelector("label");
    if (roleLabel) roleLabel.textContent = "Technical Role";

    const positionLabel = $("cu_position")?.closest(".field")?.querySelector("label");
    if (positionLabel) positionLabel.textContent = "Office Position / Custom Position";

    const vesselLabel = $("cu_vessel")?.closest(".field")?.querySelector("label");
    if (vesselLabel) vesselLabel.textContent = "Assigned Vessel";

    const companyLabel = $("cu_company")?.closest(".field")?.querySelector("label");
    if (companyLabel) companyLabel.textContent = "Company / Tenant";

    removeLegacyPositionDropdownEntries();
  }

  function patchUserFilterLabels() {
    const roleFilter = $("u_filter_role");
    const roleLabel = roleFilter?.closest(".field")?.querySelector("label");
    if (roleLabel) roleLabel.textContent = "User Type";

    const vesselFilter = $("u_filter_vessel");
    const vesselLabel = vesselFilter?.closest(".field")?.querySelector("label");
    if (vesselLabel) vesselLabel.textContent = "Vessel";

    patchRoleSelectOptions(roleFilter);
  }

  function getColumnIndexes(table) {
    const headers = Array.from(table?.querySelectorAll("thead th") || []);
    const indexes = {};

    headers.forEach((th, index) => {
      const text = normalized(th.textContent);

      if (text === "role" || text === "user type") indexes.role = index;
      if (text === "position" || text === "rank / position" || text === "rank") indexes.position = index;
      if (text === "username" || text === "danaos / username") indexes.username = index;
      if (text === "force reset" || text === "first-login reset") indexes.forceReset = index;
      if (text === "vessel") indexes.vessel = index;
    });

    return indexes;
  }

  function patchUserTableHeaders() {
    const tbody = $("usersBody");
    const table = tbody?.closest("table");
    if (!table) return;

    const headers = Array.from(table.querySelectorAll("thead th"));

    headers.forEach((th) => {
      const text = normalized(th.textContent);

      if (text === "username" || text === "danaos / username") {
        th.textContent = "DANAOS / Username";
      }

      if (text === "role" || text === "user type") {
        th.textContent = "User Type";
      }

      if (text === "position" || text === "rank / position") {
        th.textContent = "Rank / Position";
      }

      if (text === "force reset" || text === "first-login reset") {
        th.textContent = "First-login Reset";
      }
    });
  }

  function patchUserTableRows() {
    const tbody = $("usersBody");
    const table = tbody?.closest("table");
    if (!tbody || !table) return;

    const idx = getColumnIndexes(table);

    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
      const cells = Array.from(tr.children || []);
      if (!cells.length) return;

      const usernameCell = Number.isInteger(idx.username) ? cells[idx.username] : null;
      const roleCell = Number.isInteger(idx.role) ? cells[idx.role] : null;
      const positionCell = Number.isInteger(idx.position) ? cells[idx.position] : null;

      if (usernameCell && usernameCell.getAttribute("data-u04-username-patched") !== "1") {
        const raw = usernameCell.textContent.trim();

        if (isDanaos(raw)) {
          usernameCell.innerHTML = `${esc(raw)} <span class="csvb-u04-badge">DANAOS</span>`;
        }

        usernameCell.setAttribute("data-u04-username-patched", "1");
      }

      if (roleCell) {
        const roleRaw = roleCell.textContent.trim();

        if (roleRaw === "vessel") {
          roleCell.innerHTML = `<span class="csvb-u04-role-pill">Onboard Personnel</span>`;
        } else if (ROLE_LABELS[roleRaw]) {
          roleCell.textContent = ROLE_LABELS[roleRaw];
        }
      }

      if (positionCell && roleCell) {
        const roleText = normalized(roleCell.textContent);
        const pos = positionCell.textContent.trim();

        if (roleText.includes("onboard personnel") && !pos) {
          positionCell.innerHTML = `<span class="csvb-u04-rank-missing">Rank not set</span>`;
        }
      }
    });
  }

  function patchRightsMatrixTerminology() {
    patchRoleSelectOptions($("rmRole"));

    const rmRole = $("rmRole");
    const roleLabel = rmRole?.closest("div")?.querySelector("label");
    if (roleLabel) roleLabel.textContent = "User Type";

    const rmPosition = $("rmPosition");
    const positionLabel = rmPosition?.closest("div")?.querySelector("label");
    if (positionLabel) positionLabel.textContent = "Rank / Position";

    document.querySelectorAll(".rmTable th, .rmTable td, #rmStatus").forEach((node) => {
      if (!node || node.children.length) return;
      const text = node.textContent.trim();
      if (text === "vessel") node.textContent = "Onboard Personnel";
    });
  }

  function patchCompanyUserLists() {
    ["companyUsersBody", "usersBody"].forEach((id) => {
      const tbody = $(id);
      const table = tbody?.closest("table");
      if (!table) return;

      Array.from(table.querySelectorAll("thead th")).forEach((th) => {
        const text = normalized(th.textContent);

        if (text === "role") th.textContent = "User Type";
        if (text === "position") th.textContent = "Rank / Position";
        if (text === "username") th.textContent = "DANAOS / Username";
      });
    });
  }

  function patchTextNodesConservatively() {
    // Only exact standalone UI text, not values/attributes.
    document.querySelectorAll("option").forEach((option) => {
      if (option.value === "vessel") {
        option.textContent = "Onboard Personnel";
      }
    });
  }

  function applyAll() {
    addStyles();
    patchAllRoleSelects();
    patchCreationPanelLabels();
    patchUserFilterLabels();
    patchUserTableHeaders();
    patchUserTableRows();
    patchRightsMatrixTerminology();
    patchCompanyUserLists();
    patchTextNodesConservatively();

    window.CSVB_ONBOARD_PERSONNEL_TERMINOLOGY_U04_BUILD = BUILD;
  }

  function observe() {
    const observer = new MutationObserver(() => {
      window.setTimeout(applyAll, 80);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function start() {
    applyAll();
    observe();

    window.setTimeout(applyAll, 600);
    window.setTimeout(applyAll, 1400);
    window.setTimeout(applyAll, 2600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
