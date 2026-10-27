(() => {
  "use strict";

  const wrap = document.querySelector(".wrap");
  const usersTab = document.getElementById("tab-users");
  const formCard = document.getElementById("userCreateCard");
  const formSlot = document.getElementById("usersCreateFormSlot");
  const backdrop = document.getElementById("userCreateDialog");
  const dialog = backdrop?.querySelector('[role="dialog"]');
  const openButton = document.getElementById("usersOpenCreate");
  const closeButton = document.getElementById("usersCloseCreate");
  const feedback = document.getElementById("usersModalFeedback");
  const usersBody = document.getElementById("usersBody");
  const resultCount = document.getElementById("usersResultCount");

  if (!wrap || !usersTab || !formCard || !formSlot || !backdrop || !dialog) return;

  // Move the original form node; all existing IDs and su-admin.js listeners stay intact.
  formSlot.appendChild(formCard);

  let returnFocusTo = null;
  let isOpen = false;

  function updateWorkspaceWidth(tab = document.querySelector(".tab.active")?.dataset.tab) {
    wrap.classList.toggle("users-workspace-active", tab === "users");
  }

  function syncFeedback() {
    if (!feedback) return;
    const warning = document.getElementById("warnBox");
    const success = document.getElementById("okBox");
    const warningVisible = warning && getComputedStyle(warning).display !== "none";
    const successVisible = success && getComputedStyle(success).display !== "none";
    const source = warningVisible ? warning : successVisible ? success : null;

    if (!source || !source.textContent.trim()) {
      feedback.hidden = true;
      feedback.textContent = "";
      feedback.classList.remove("is-error", "is-success");
      feedback.removeAttribute("role");
      return;
    }

    feedback.textContent = source.textContent;
    feedback.hidden = false;
    feedback.classList.toggle("is-error", source === warning);
    feedback.classList.toggle("is-success", source === success);
    feedback.setAttribute("role", source === warning ? "alert" : "status");
  }

  function updateResultCount() {
    if (!usersBody || !resultCount) return;
    const rows = Array.from(usersBody.querySelectorAll(":scope > tr"));
    const empty = rows.length === 0 || (rows.length === 1 && rows[0].querySelector("td[colspan]"));
    if (empty) {
      const message = usersBody.textContent.trim();
      resultCount.textContent = message.includes("Loading") ? "Loading accounts…" : "No matching accounts";
      return;
    }
    resultCount.textContent = `${rows.length} ${rows.length === 1 ? "account" : "accounts"} shown`;
  }

  function openDialog() {
    if (isOpen) return;
    isOpen = true;
    returnFocusTo = document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body ? document.activeElement : openButton;
    backdrop.hidden = false;
    document.body.classList.add("users-dialog-open");
    openButton?.setAttribute("aria-expanded", "true");
    syncFeedback();
    window.requestAnimationFrame(() => {
      if (!isOpen) return;
      const firstField = formCard.querySelector("select:not(:disabled), input:not(:disabled), button");
      (firstField || dialog).focus();
    });
  }

  function closeDialog({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    backdrop.hidden = true;
    document.body.classList.remove("users-dialog-open");
    openButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus && returnFocusTo?.isConnected) returnFocusTo.focus();
    returnFocusTo = null;
  }

  openButton?.addEventListener("click", openDialog);
  closeButton?.addEventListener("click", () => closeDialog());
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeDialog();
  });

  document.addEventListener("keydown", (event) => {
    if (!isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.querySelectorAll(".tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      updateWorkspaceWidth(tab.dataset.tab);
      if (tab.dataset.tab !== "users") closeDialog({ restoreFocus: false });
    });
  });
  updateWorkspaceWidth();

  const feedbackObserver = new MutationObserver(syncFeedback);
  ["warnBox", "okBox"].forEach((id) => {
    const node = document.getElementById(id);
    if (node) feedbackObserver.observe(node, { attributes: true, childList: true, characterData: true, subtree: true });
  });

  if (usersBody) {
    new MutationObserver(updateResultCount).observe(usersBody, { childList: true, subtree: true });
    updateResultCount();
  }

  // Public, read-only test hooks for browser fixtures; no account calls are made here.
  window.__SU_ADMIN_USERS_WORKSPACE__ = {
    open: openDialog,
    close: () => closeDialog(),
    isOpen: () => isOpen,
  };
})();
