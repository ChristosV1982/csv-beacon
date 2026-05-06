// public/csvb-rights-matrix-friendly-ui.js
// C.S.V. BEACON — RM-1B Rights Matrix friendly labels.
// UI-only. Does not change option values or save logic.

(() => {
  "use strict";

  const BUILD = "RM1B-RIGHTS-MATRIX-FRIENDLY-UI-2026-05-06";

  const LABELS = new Map([
    ["", "Off"],
    ["no_access", "Off"],
    ["no access", "Off"],
    ["none", "Off"],
    ["false", "Off"],
    ["vessel_assigned", "Own vessel"],
    ["vessel assigned", "Own vessel"],
    ["vessel_any", "Any vessel"],
    ["vessel any", "Any vessel"],
    ["company", "Company-wide"],
    ["global", "Platform-wide"]
  ]);

  const HELP = new Map([
    ["off", "No access. The action is not allowed."],
    ["own", "Access only to the user’s assigned vessel."],
    ["any", "Access to any permitted vessel within the company scope."],
    ["company", "Access within the user’s own company."],
    ["platform", "Platform-wide access across companies. Normally only for Super Admin."]
  ]);

  function el(id) {
    return document.getElementById(id);
  }

  function norm(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function scopeClass(valueOrText) {
    const v = norm(valueOrText);

    if (v === "" || v === "no_access" || v === "no access" || v === "none" || v === "false") return "off";
    if (v === "vessel_assigned" || v === "vessel assigned") return "own";
    if (v === "vessel_any" || v === "vessel any") return "any";
    if (v === "company") return "company";
    if (v === "global") return "platform";

    return "";
  }

  function friendlyLabel(option) {
    const byValue = LABELS.get(norm(option.value));
    if (byValue) return byValue;

    const byText = LABELS.get(norm(option.textContent));
    if (byText) return byText;

    return option.textContent;
  }

  function injectLegend() {
    if (el("csvbRightsMatrixLegend")) return;

    const tab = el("tab-rights");
    const table = tab?.querySelector(".rmTable");
    const tableCard = table?.closest(".card");

    if (!tab || !tableCard) return;

    const legend = document.createElement("div");
    legend.id = "csvbRightsMatrixLegend";
    legend.innerHTML = `
      <div class="rm-legend-title">Permission scope guide</div>
      <div class="rm-legend-grid">
        <span class="rm-scope-pill off">Off — no access</span>
        <span class="rm-scope-pill own">Own vessel — assigned vessel only</span>
        <span class="rm-scope-pill own">Any vessel — permitted vessels</span>
        <span class="rm-scope-pill company">Company-wide — own company</span>
        <span class="rm-scope-pill platform">Platform-wide — all companies</span>
      </div>
    `;

    tableCard.insertAdjacentElement("beforebegin", legend);
  }

  function updateSelectAppearance(select) {
    const cls = scopeClass(select.value || select.options[select.selectedIndex]?.textContent || "");

    select.classList.remove(
      "rm-scope-off",
      "rm-scope-own",
      "rm-scope-any",
      "rm-scope-company",
      "rm-scope-platform"
    );

    if (cls) select.classList.add("rm-scope-" + cls);

    const label = select.options[select.selectedIndex]?.textContent || "";
    const help = HELP.get(cls) || "Permission scope.";
    select.title = `${label}\n${help}\nInternal value: ${select.value}`;
  }

  function prettifyRightsMatrix() {
    const tab = el("tab-rights");
    if (!tab) return;

    injectLegend();

    const tbody = el("rmTbody");
    if (!tbody) return;

    const selects = Array.from(tbody.querySelectorAll("select"));

    for (const select of selects) {
      select.classList.add("rm-friendly-select");

      Array.from(select.options).forEach((opt) => {
        if (!opt.dataset.rawLabel) opt.dataset.rawLabel = opt.textContent;
        if (!opt.dataset.rawValue) opt.dataset.rawValue = opt.value;

        const friendly = friendlyLabel(opt);
        opt.textContent = friendly;
      });

      updateSelectAppearance(select);

      if (select.dataset.rmFriendlyBound !== "1") {
        select.dataset.rmFriendlyBound = "1";
        select.addEventListener("change", () => updateSelectAppearance(select));
      }
    }

    const note = tab.querySelector(".muted.small");
    if (note && note.textContent.includes("Each cell controls")) {
      note.innerHTML = `
        Each cell controls whether the action is allowed and at what scope.
        <span class="mono">Off</span> means no access.
        The underlying technical value is preserved when saving.
      `;
    }
  }

  function init() {
    window.CSVB_RIGHTS_MATRIX_FRIENDLY_UI_BUILD = BUILD;

    prettifyRightsMatrix();

    const observer = new MutationObserver(() => {
      prettifyRightsMatrix();
    });

    const target = el("rmTbody") || document.body;
    observer.observe(target, { childList: true, subtree: true });

    setInterval(prettifyRightsMatrix, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
