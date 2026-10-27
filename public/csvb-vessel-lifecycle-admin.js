(function () {
  "use strict";

  const STYLE_ID = "csvb-vessel-lifecycle-admin-style";
  const STYLE_HREF = "./csvb-vessel-lifecycle-admin.css";
  let inFlight = false;
  let activeDialog = null;

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = STYLE_HREF;
    document.head.appendChild(link);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function labelStatus(value) {
    return value === true ? "Active" : "Inactive";
  }

  function vesselName(vessel) {
    return String(vessel?.name || vessel?.vessel_name || "Unnamed vessel");
  }

  function vesselIdentity(vessel) {
    return String(vessel?.id ?? "").trim();
  }

  function showErrorText(error) {
    if (typeof error === "string") return error;
    return String(error?.message || "The request could not be completed.");
  }

  function makeButton(text, variant, onClick, type) {
    const button = element("button", "csvb-vl-btn" + (variant ? " csvb-vl-btn-" + variant : ""), text);
    button.type = type || "button";
    if (onClick) button.addEventListener("click", onClick);
    return button;
  }

  function makeVesselSummary(vessel) {
    const box = element("div", "csvb-vl-vessel");
    const identity = element("div");
    identity.appendChild(element("div", "csvb-vl-vessel-name", vesselName(vessel)));
    if (vessel?.company_name) identity.appendChild(element("div", "csvb-vl-company", vessel.company_name));
    const status = element("span", "csvb-vl-state " + (vessel?.is_active === true ? "is-active" : "is-inactive"), labelStatus(vessel?.is_active));
    box.append(identity, status);
    return box;
  }

  function createDialog({ title, subtitle, vessel, eyebrow }) {
    ensureStyles();
    if (activeDialog && activeDialog.open && !inFlight) activeDialog.close();

    const dialog = document.createElement("dialog");
    dialog.className = "csvb-vl-dialog";
    dialog.setAttribute("aria-labelledby", "csvb-vl-title");
    dialog.setAttribute("aria-modal", "true");
    const shell = element("div", "csvb-vl-shell");
    const head = element("header", "csvb-vl-head");
    const copy = element("div", "csvb-vl-headcopy");
    copy.appendChild(element("p", "csvb-vl-eyebrow", eyebrow || "C.S.V. Beacon · Admin"));
    const h = element("h2", "csvb-vl-title", title);
    h.id = "csvb-vl-title";
    copy.appendChild(h);
    if (subtitle) copy.appendChild(element("p", "csvb-vl-subtitle", subtitle));
    const close = makeButton("×", "", () => dialog.close());
    close.className = "csvb-vl-x";
    close.setAttribute("aria-label", "Close dialog");
    head.append(copy, close);
    const content = element("div", "csvb-vl-content");
    if (vessel) content.appendChild(makeVesselSummary(vessel));
    shell.append(head, content);
    dialog.appendChild(shell);
    document.body.appendChild(dialog);
    activeDialog = dialog;

    const setBusy = (busy, buttons) => {
      inFlight = busy;
      for (const button of [close, ...buttons]) button.disabled = busy;
      dialog.dataset.busy = busy ? "true" : "false";
    };
    dialog.addEventListener("cancel", (event) => {
      if (inFlight) event.preventDefault();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && !inFlight) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
    });
    dialog.showModal();
    close.focus();
    return { dialog, content, close, setBusy };
  }

  function createAlert() {
    const alert = element("div", "csvb-vl-alert");
    alert.setAttribute("role", "status");
    alert.setAttribute("aria-live", "polite");
    return alert;
  }

  function setAlert(alert, message, kind) {
    alert.className = "csvb-vl-alert is-" + kind;
    alert.textContent = message;
  }

  function field(labelText, required, helpText) {
    const wrap = element("div", "csvb-vl-field");
    const label = element("label");
    label.textContent = labelText;
    if (required) {
      const star = element("span", "required", " *");
      star.setAttribute("aria-hidden", "true");
      label.appendChild(star);
    }
    const textarea = document.createElement("textarea");
    textarea.rows = 3;
    if (required) textarea.required = true;
    wrap.append(label, textarea);
    label.htmlFor = textarea.id = "csvb-vl-field-" + Math.random().toString(36).slice(2);
    if (helpText) wrap.appendChild(element("p", "csvb-vl-help", helpText));
    return { wrap, textarea };
  }

  function rpc(client, name, args) {
    if (!client || typeof client.rpc !== "function") {
      return Promise.reject(new Error("A Supabase client is required."));
    }
    return Promise.resolve(client.rpc(name, args)).then((result) => {
      if (result?.error) throw result.error;
      return result?.data;
    });
  }

  async function openTransition({ client, vessel, onSaved } = {}) {
    if (inFlight) return false;
    const id = vesselIdentity(vessel);
    if (!id) throw new Error("A vessel with an id is required.");
    if (typeof vessel.is_active !== "boolean") {
      throw new Error("The vessel's original is_active boolean is required.");
    }
    const wasActive = vessel.is_active;
    const nextActive = !wasActive;
    const action = nextActive ? "Activate" : "Deactivate";
    const view = createDialog({
      title: action + " vessel",
      subtitle: nextActive
        ? "Confirm this vessel should return to the active registry."
        : "Record why this vessel is being marked inactive.",
      vessel
    });
    const alert = createAlert();
    const reason = field("Reason" + (nextActive ? " (optional)" : ""), !nextActive,
      nextActive ? "Optional. This note is visible only in the admin status history." : "Required. This note is visible only in the admin status history.");
    const remarks = field("Restricted internal remarks", false, "For restricted administrative context; shown only in these admin dialogs.");
    reason.textarea.maxLength = 4000;
    remarks.textarea.maxLength = 4000;
    reason.textarea.placeholder = nextActive ? "Optional reason for reactivation" : "Enter a concise reason";
    remarks.textarea.placeholder = "Optional restricted remarks";
    if (!nextActive) reason.textarea.setAttribute("aria-required", "true");
    const buttons = element("div", "csvb-vl-actions");
    const cancel = makeButton("Cancel", "", () => view.dialog.close());
    const submit = makeButton(action, nextActive ? "primary" : "danger", null, "submit");
    const history = makeButton("View status history", "", () => {
      if (inFlight) return;
      view.dialog.close();
      openHistory({ client, vessel });
    });
    const form = document.createElement("form");
    form.noValidate = true;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (inFlight) return;
      const reasonValue = reason.textarea.value.trim();
      if (!nextActive && !reasonValue) {
        setAlert(alert, "Enter a reason before deactivating this vessel.", "error");
        reason.textarea.focus();
        return;
      }
      setAlert(alert, "Saving status…", "info");
      view.setBusy(true, [cancel, submit, history]);
      reason.textarea.disabled = remarks.textarea.disabled = true;
      let saved = false;
      try {
        await rpc(client, "csvb_admin_set_vessel_active", {
          p_vessel_id: id,
          p_is_active: nextActive,
          p_reason: reasonValue || null,
          p_internal_remarks: remarks.textarea.value.trim() || null,
          p_expected_is_active: wasActive
        });
        saved = true;
        vessel.is_active = nextActive;
        const badge = view.content.querySelector(".csvb-vl-state");
        badge.textContent = labelStatus(nextActive);
        badge.className = "csvb-vl-state " + (nextActive ? "is-active" : "is-inactive");
        let refreshError = null;
        if (typeof onSaved === "function") {
          try {
            await onSaved();
          } catch (error) {
            refreshError = error;
          }
        }
        setAlert(
          alert,
          (nextActive ? "Vessel marked Active." : "Vessel marked Inactive.") +
            (refreshError
              ? " Saved, but the vessel list could not be refreshed. Linked user/account access is unchanged in Step 1. " + showErrorText(refreshError)
              : " Linked user/account access is unchanged in Step 1."),
          refreshError ? "error" : "success"
        );
        submit.disabled = true;
        reason.textarea.disabled = true;
        remarks.textarea.disabled = true;
        cancel.disabled = false;
        history.disabled = false;
      } catch (error) {
        setAlert(alert, "The status change could not be confirmed. Refresh the list/history before retrying. " + showErrorText(error), "error");
      } finally {
        inFlight = false;
        view.dialog.dataset.busy = "false";
        view.close.disabled = false;
        cancel.disabled = false;
        history.disabled = false;
         submit.disabled = saved;
         reason.textarea.disabled = remarks.textarea.disabled = saved;
      }
    });
    form.append(alert, reason.wrap, remarks.wrap, buttons);
    buttons.append(history, cancel, submit);
    view.content.appendChild(form);
    return view.dialog;
  }

  function displayDate(value) {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  function appendHistoryEntry(container, entry) {
    const card = element("article", "csvb-vl-entry");
    const top = element("div", "csvb-vl-entry-top");
    const before = labelStatus(entry.previous_is_active === true);
    const after = labelStatus(entry.new_is_active === true);
    top.appendChild(element("div", "csvb-vl-transition", before + " → " + after));
    top.appendChild(element("time", "csvb-vl-date", displayDate(entry.changed_at)));
    const actor = entry.changed_by_username || entry.changed_by || "Administrator not recorded";
    card.append(top, element("div", "csvb-vl-actor", "Changed by " + actor));
    if (entry.inactivity_reason) {
      card.appendChild(element("div", "csvb-vl-entry-label", "Reason"));
      card.appendChild(element("p", "csvb-vl-entry-text", entry.inactivity_reason));
    }
    if (entry.restricted_internal_remarks) {
      card.appendChild(element("div", "csvb-vl-entry-label", "Restricted internal remarks"));
      card.appendChild(element("p", "csvb-vl-entry-text", entry.restricted_internal_remarks));
    }
    container.appendChild(card);
  }

  async function loadHistory(client, vessel, view, alert, retryButton, closeButton) {
    if (inFlight) return;
    inFlight = true;
    view.dialog.dataset.busy = "true";
    alert.setAttribute("aria-busy", "true");
    const headerClose = view.dialog.querySelector(".csvb-vl-x");
    if (headerClose) headerClose.disabled = true;
    retryButton.disabled = true;
    closeButton.disabled = true;
    alert.replaceChildren(element("div", "csvb-vl-loading", "Loading status history…"));
    try {
      const response = await rpc(client, "csvb_admin_vessel_status_history", { p_vessel_id: vesselIdentity(vessel) });
      if (view.dialog.dataset.busy !== "true") return;
      const payload = response || {};
      const history = Array.isArray(payload.history) ? payload.history.slice() : [];
      history.sort((a, b) => {
        const at = new Date(a?.changed_at || 0).getTime() || 0;
        const bt = new Date(b?.changed_at || 0).getTime() || 0;
        return bt - at;
      });
      alert.replaceChildren();
      if (history.length) {
        const latest = history[0];
        if (latest.inactivity_reason || latest.restricted_internal_remarks) {
          const latestBox = element("section", "csvb-vl-latest");
          latestBox.appendChild(element("strong", "", "Latest restricted history"));
          if (latest.inactivity_reason) {
            latestBox.appendChild(element("div", "csvb-vl-entry-label", "Reason"));
            latestBox.appendChild(element("p", "", latest.inactivity_reason));
          }
          if (latest.restricted_internal_remarks) {
            latestBox.appendChild(element("div", "csvb-vl-entry-label", "Restricted internal remarks"));
            latestBox.appendChild(element("p", "", latest.restricted_internal_remarks));
          }
          alert.appendChild(latestBox);
        }
        const list = element("div", "csvb-vl-history");
        history.forEach((entry) => appendHistoryEntry(list, entry || {}));
        alert.appendChild(list);
      } else {
        alert.appendChild(element("div", "csvb-vl-empty", "No status history has been recorded for this vessel."));
      }
      const historyVessel = payload.vessel;
      if (historyVessel && historyVessel.is_active === true || historyVessel && historyVessel.is_active === false) {
        const summary = view.content.querySelector(".csvb-vl-vessel");
        if (summary) {
          const status = summary.querySelector(".csvb-vl-state");
          if (status) {
            status.textContent = labelStatus(historyVessel.is_active);
            status.className = "csvb-vl-state " + (historyVessel.is_active ? "is-active" : "is-inactive");
          }
        }
      }
    } catch (error) {
      alert.replaceChildren();
      const message = element("div", "csvb-vl-alert is-error");
      message.setAttribute("role", "alert");
      message.textContent = "Status history could not be loaded. " + showErrorText(error);
      alert.appendChild(message);
    } finally {
      inFlight = false;
      view.dialog.dataset.busy = "false";
      alert.setAttribute("aria-busy", "false");
      if (headerClose) headerClose.disabled = false;
      retryButton.disabled = false;
      closeButton.disabled = false;
    }
  }

  function openHistory({ client, vessel } = {}) {
    if (inFlight) return false;
    const id = vesselIdentity(vessel);
    if (!id) throw new Error("A vessel with an id is required.");
    const view = createDialog({
      title: "Vessel status history",
      subtitle: "Administrative status changes and restricted notes.",
      vessel,
      eyebrow: "C.S.V. Beacon · Restricted admin history"
    });
    const results = element("div");
    results.setAttribute("aria-live", "polite");
    results.setAttribute("aria-busy", "true");
    const actions = element("div", "csvb-vl-actions");
    const close = makeButton("Close", "", () => view.dialog.close());
    const retry = makeButton("Reload history", "primary", null);
    retry.addEventListener("click", () => loadHistory(client, vessel, { dialog: view.dialog, content: view.content }, results, retry, close));
    actions.append(close, retry);
    view.content.append(results, actions);
    // History requests share the same single-flight gate as status transitions.
    loadHistory(client, vessel, { dialog: view.dialog, content: view.content }, results, retry, close);
    return view.dialog;
  }

  window.CSVB_VESSEL_LIFECYCLE = Object.freeze({
    openTransition,
    openHistory
  });
})();
