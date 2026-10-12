/* public/csvb-rights-matrix-ranks-u06.js */
/* C.S.V. BEACON – U-06 Rights Matrix Rank Alignment */
/*
  Purpose:
  - User-facing role label: vessel -> Onboard Personnel
  - User-facing position label: Rank / Position
  - When role = vessel, position selector is populated from onboard_ranks.
  - Internal save remains compatible:
      role = vessel
      position = rank_name
*/

(() => {
  "use strict";

  const BUILD = "CSVBEACON-RIGHTS-MATRIX-RANKS-U06-20260512-1";

  const local = {
    sb: null,
    ranks: [],
    installed: false
  };

  const ROLE_LABELS = {
    super_admin: "Super Admin",
    platform_owner: "Platform Owner",
    company_admin: "Company Admin",
    company_superintendent: "Company Superintendent",
    vessel: "Onboard Personnel",
    inspector: "Inspector / Third Party"
  };

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

  function sb() {
    if (!local.sb) local.sb = window.AUTH.ensureSupabase();
    return local.sb;
  }

  function selectedRole() {
    return $("rmRole")?.value || "";
  }

  function isVesselRole() {
    return selectedRole() === "vessel";
  }

  async function loadRanks() {
    const { data, error } = await sb()
      .from("onboard_ranks")
      .select("id, company_id, rank_code, rank_name, department, sort_order, is_active")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("rank_name", { ascending: true });

    if (error) throw error;

    local.ranks = data || [];
  }

  function addStyles() {
    if ($("csvbRightsMatrixRanksU06Styles")) return;

    const style = document.createElement("style");
    style.id = "csvbRightsMatrixRanksU06Styles";
    style.textContent = `
      .csvb-u06-rights-hint {
        margin-top: 8px;
        padding: 8px 10px;
        border: 1px solid #D6E4F5;
        border-left: 4px solid #0097A7;
        border-radius: 10px;
        background: #F4F8FC;
        color: #4D6283;
        font-size: .84rem;
        font-weight: 700;
        line-height: 1.35;
      }

      .csvb-u06-role-badge {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 3px 8px;
        border-radius: 999px;
        border: 1px solid #BCE3EC;
        background: #EEF8FB;
        color: #062A5E;
        font-weight: 950;
        font-size: .74rem;
        white-space: nowrap;
      }
    `;

    document.head.appendChild(style);
  }

  function patchRoleOptions() {
    const roleSel = $("rmRole");
    if (!roleSel) return;

    Array.from(roleSel.options || []).forEach((option) => {
      const value = String(option.value || "").trim();
      if (ROLE_LABELS[value]) {
        option.textContent = ROLE_LABELS[value];
      }
    });
  }

  function patchLabels() {
    const roleSel = $("rmRole");
    const positionSel = $("rmPosition");

    const roleLabel = roleSel?.closest("div")?.querySelector("label");
    if (roleLabel) roleLabel.textContent = "User Type";

    const positionLabel = positionSel?.closest("div")?.querySelector("label");
    if (positionLabel) positionLabel.textContent = isVesselRole() ? "Onboard Rank" : "Rank / Position";
  }

  function groupedRanks() {
    const groups = new Map();

    for (const rank of local.ranks) {
      const department = rank.department || "Other";
      if (!groups.has(department)) groups.set(department, []);
      groups.get(department).push(rank);
    }

    return groups;
  }

  function renderVesselRankOptions() {
    const sel = $("rmPosition");
    if (!sel) return;

    if (!isVesselRole()) return;

    const current = sel.value || "";

    const parts = [
      '<option value="">All Onboard Personnel / All ranks</option>'
    ];

    const groups = groupedRanks();

    for (const [department, ranks] of groups.entries()) {
      parts.push(`<optgroup label="${esc(department)}">`);

      for (const rank of ranks) {
        const selected = String(current) === String(rank.rank_name) ? " selected" : "";
        const code = rank.rank_code ? ` / ${rank.rank_code}` : "";
        parts.push(
          `<option value="${esc(rank.rank_name)}"${selected}>${esc(rank.rank_name)}${esc(code)}</option>`
        );
      }

      parts.push("</optgroup>");
    }

    sel.innerHTML = parts.join("");

    if (current && Array.from(sel.options).some((o) => String(o.value) === String(current))) {
      sel.value = current;
    }
  }

  function addRightsHint() {
    const positionSel = $("rmPosition");
    if (!positionSel) return;

    const host = positionSel.closest("div");
    if (!host) return;

    let hint = $("csvbU06RightsHint");

    if (!hint) {
      hint = document.createElement("div");
      hint.id = "csvbU06RightsHint";
      hint.className = "csvb-u06-rights-hint";
      host.appendChild(hint);
    }

    if (isVesselRole()) {
      hint.style.display = "";
      hint.innerHTML =
        'For <span class="csvb-u06-role-badge">Onboard Personnel</span>, this selector is the onboard rank. ' +
        'Permissions are saved internally as <span class="mono">role = vessel</span> and <span class="mono">position = rank name</span>.';
    } else {
      hint.style.display = "";
      hint.textContent =
        "For office users, this selector remains a position filter. Leave blank for role-wide defaults.";
    }
  }

  function patchRoleTextInMatrix() {
    document.querySelectorAll(".rmTable th, .rmTable td, #rmStatus, .muted, .small").forEach((node) => {
      if (!node || node.children.length) return;

      const text = String(node.textContent || "").trim();

      if (text === "vessel") {
        node.textContent = "Onboard Personnel";
      }
    });
  }

  function apply() {
    addStyles();
    patchRoleOptions();
    patchLabels();

    if (isVesselRole()) {
      renderVesselRankOptions();
    }

    addRightsHint();
    patchRoleTextInMatrix();

    window.CSVB_RIGHTS_MATRIX_RANKS_U06_BUILD = BUILD;
  }

  function bindEvents() {
    const roleSel = $("rmRole");
    const positionSel = $("rmPosition");
    const reloadBtn = $("rmReload");
    const saveBtn = $("rmSave");

    if (roleSel && roleSel.getAttribute("data-u06-bound") !== "1") {
      roleSel.addEventListener("change", () => {
        window.setTimeout(apply, 80);
        window.setTimeout(apply, 400);
      });
      roleSel.setAttribute("data-u06-bound", "1");
    }

    if (positionSel && positionSel.getAttribute("data-u06-bound") !== "1") {
      positionSel.addEventListener("focus", () => {
        if (isVesselRole()) renderVesselRankOptions();
      });
      positionSel.setAttribute("data-u06-bound", "1");
    }

    if (reloadBtn && reloadBtn.getAttribute("data-u06-bound") !== "1") {
      reloadBtn.addEventListener("click", () => {
        window.setTimeout(apply, 250);
        window.setTimeout(apply, 800);
      });
      reloadBtn.setAttribute("data-u06-bound", "1");
    }

    if (saveBtn && saveBtn.getAttribute("data-u06-bound") !== "1") {
      saveBtn.addEventListener("click", () => {
        window.setTimeout(apply, 500);
      });
      saveBtn.setAttribute("data-u06-bound", "1");
    }
  }

  function observe() {
    const observer = new MutationObserver(() => {
      window.setTimeout(() => {
        bindEvents();
        apply();
      }, 80);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function install() {
    await loadRanks();

    bindEvents();
    apply();
    observe();

    window.setTimeout(apply, 500);
    window.setTimeout(apply, 1400);
    window.setTimeout(apply, 2600);

    local.installed = true;
  }

  function start() {
    install().catch((error) => {
      console.error("U-06 Rights Matrix rank alignment failed:", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
