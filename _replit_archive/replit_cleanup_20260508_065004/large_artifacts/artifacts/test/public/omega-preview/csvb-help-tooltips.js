// C.S.V. BEACON — MC-10B Global Help Tooltips
// Visual/helper layer only.

(() => {
  "use strict";

  const BUILD = "MC10B-2026-04-30";
  const HOVER_DELAY_MS = 1000;

  window.CSVB_HELP_TOOLTIPS_BUILD = BUILD;

  const helpRules = [
    [/^dashboard$/i, "Return to the main dashboard."],
    [/^open$/i, "Open this module, record, or selected item."],
    [/^login$/i, "Sign in with your assigned user account."],
    [/^logout$/i, "Sign out of the current session."],
    [/switch user/i, "Sign out and return to the login screen to use another account."],

    [/refresh|reload/i, "Reload the latest data from the database."],
    [/save draft/i, "Save your work as a draft without final submission."],
    [/^save$|save changes/i, "Save the current changes."],
    [/submit|submit \/ publish/i, "Submit the current item for review, or publish it if auto-publish is allowed."],
    [/publish/i, "Make the approved item active in the company effective library."],
    [/approve/i, "Approve this item so it can be used as an effective company record."],
    [/reject/i, "Reject this item and return it for correction."],
    [/archive/i, "Archive this item without deleting the historical record."],

    [/create \+ open/i, "Create the questionnaire and open it immediately for answering."],
    [/create questionnaire/i, "Create a new questionnaire using the selected vessel and question selection."],
    [/create/i, "Create a new record using the current form values."],
    [/new/i, "Start a new record or clear the current selection."],

    [/delete/i, "Delete this item. Use only when you are sure it is not needed for history or reporting."],
    [/remove/i, "Remove this item from the current list or assignment."],
    [/deactivate/i, "Disable this record without deleting its history."],
    [/activate/i, "Enable this record again."],
    [/disable/i, "Disable this user or item without permanently deleting it."],
    [/enable/i, "Enable this user or item again."],

    [/assign \/ update set/i, "Assign this question set to the selected company, or update its existing assignment settings."],
    [/assign/i, "Assign the selected item to the selected company, vessel, or workflow."],
    [/question assignments/i, "Manage which question sets or individual questions are available to each company."],
    [/question overrides/i, "Review company-specific question override drafts and approve, publish, reject, or archive them."],
    [/company question overrides/i, "Create company-specific question override drafts without changing the master question library."],

    [/search/i, "Search using the text currently entered."],
    [/filter/i, "Limit the displayed results using selected criteria."],
    [/clear filters/i, "Remove all active filters and show the full available list."],
    [/clear/i, "Clear the current form or selection."],
    [/select all filtered/i, "Select all questions currently matching the active filters."],

    [/upload/i, "Upload the selected file to the secured storage bucket."],
    [/download/i, "Create a temporary signed download link for the file."],
    [/reset password/i, "Set a new password for this user."],
    [/force password/i, "Require this user to change password at next login."],

    [/company builder/i, "Create and manage company questionnaires using assigned effective question libraries."],
    [/questions editor/i, "Manage master questions, company custom questions, PGNOs, and expected evidence."],
    [/post-inspection/i, "Import, review, and manage SIRE post-inspection reports and observations."],
    [/self-assessment/i, "Manage vessel and company self-assessment questionnaires."],
    [/audit/i, "Record and review audit observations and related report files."],
    [/inspector intelligence/i, "Review inspector history and observation patterns."],
    [/superuser/i, "Platform administration area for companies, users, vessels, modules, and assignments."]
  ];

  let tooltip = null;
  let timer = null;
  let activeEl = null;

  function normText(el) {
    return String(el?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getHelpText(el) {
    if (!el) return "";

    const explicit =
      el.getAttribute("data-csvb-help") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("title");

    if (explicit && explicit.trim()) return explicit.trim();

    const text = normText(el);
    if (!text) return "";

    for (const [rx, help] of helpRules) {
      if (rx.test(text)) return help;
    }

    return "";
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;

    tooltip = document.createElement("div");
    tooltip.className = "csvb-help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);

    return tooltip;
  }

  function placeTooltip(el) {
    const tip = ensureTooltip();
    const rect = el.getBoundingClientRect();

    tip.style.display = "block";

    const tipRect = tip.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 10;

    if (left + tipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tipRect.width - 10;
    }

    if (left < 10) left = 10;

    if (top + tipRect.height > window.innerHeight - 10) {
      top = Math.max(10, rect.top - tipRect.height - 10);
    }

    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }

  function showTooltip(el) {
    const text = getHelpText(el);
    if (!text) return;

    const tip = ensureTooltip();
    tip.textContent = text;
    placeTooltip(el);

    requestAnimationFrame(() => {
      tip.classList.add("show");
    });
  }

  function hideTooltip() {
    clearTimeout(timer);
    timer = null;
    activeEl = null;

    if (!tooltip) return;

    tooltip.classList.remove("show");
    tooltip.style.display = "none";
  }

  function scheduleTooltip(el) {
    const text = getHelpText(el);
    if (!text) return;

    clearTimeout(timer);
    activeEl = el;

    timer = setTimeout(() => {
      if (activeEl === el) showTooltip(el);
    }, HOVER_DELAY_MS);
  }

  function enrichElement(el) {
    if (!el || el.dataset.csvbHelpBound === "1") return;

    const text = getHelpText(el);
    if (!text) return;

    if (!el.getAttribute("data-csvb-help")) {
      el.setAttribute("data-csvb-help", text);
    }

    if (!el.getAttribute("aria-label")) {
      el.setAttribute("aria-label", text);
    }

    el.dataset.csvbHelpBound = "1";

    el.addEventListener("mouseenter", () => scheduleTooltip(el));
    el.addEventListener("mouseleave", hideTooltip);
    el.addEventListener("focus", () => scheduleTooltip(el));
    el.addEventListener("blur", hideTooltip);
    el.addEventListener("click", hideTooltip);
  }

  function enrichPage() {
    const selector = [
      "button",
      "a.btn",
      "a.btn2",
      ".btn",
      ".btn2",
      ".btnSmall",
      ".qa-btn",
      ".qo-btn",
      "[data-csvb-help]"
    ].join(",");

    document.querySelectorAll(selector).forEach(enrichElement);
  }

  window.addEventListener("scroll", hideTooltip, true);
  window.addEventListener("resize", hideTooltip);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideTooltip();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enrichPage);
  } else {
    enrichPage();
  }

  setTimeout(enrichPage, 700);
  setTimeout(enrichPage, 1600);
  setTimeout(enrichPage, 3000);
})();
