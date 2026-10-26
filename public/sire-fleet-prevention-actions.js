(() => {
  "use strict";

  const contextCache = new Map();
  let dialog = null;
  let activeTrigger = null;
  let busy = false;
  let current = null;
  const text = (value) => value === null || value === undefined ? "" : String(value);
  const first = (value) => Array.isArray(value) ? value[0] : value;
  const fields = [
    ["Vessel", "vessel_name"],
    ["Inspection Date", "inspection_date"],
    ["Oil Major", "oil_major"],
    ["Category / Designation", "designation"],
    ["Observation", "observation_text"]
  ];

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function actionStatus(action) {
    return text(action?.status).toLowerCase() === "issued" ? "Issued" : "Draft";
  }

  function issueDate(action) {
    if (!action?.issued_at) return "";
    const date = new Date(action.issued_at);
    return Number.isNaN(date.getTime()) ? text(action.issued_at) : date.toLocaleDateString();
  }

  function targetSummary(action) {
    const count = action?.target_count === null || action?.target_count === undefined
      ? Number.NaN
      : Number(action.target_count);
    const vesselCount = Number.isFinite(count) ? count : (action?.targets || []).length;
    if (action?.target_mode === "all") return `All company vessels (${vesselCount})`;
    return `Selected vessels (${vesselCount})`;
  }

  function render(host, row, options) {
    host.replaceChildren();
    const actions = Array.isArray(row.prevention_actions) ? row.prevention_actions : [];
    host.hidden = !options.canEdit && !actions.length;
    if (host.hidden) return;
    const section = element("section", "fpa-section");
    section.setAttribute("aria-label", "Office prevention actions");
    const heading = element("div", "fpa-heading");
    heading.append(element("span", "fpa-kicker", "OFFICE PREVENTION"));
    if (options.canEdit && !actions.length) {
      const create = element("button", "fpa-button fpa-button-primary", "Create Prevention Action");
      create.type = "button";
      create.id = "fpaCreateAction";
      create.dataset.testid = "prevention-create";
      create.addEventListener("click", () => openEditor(row, options, null, create));
      heading.appendChild(create);
    } else if (options.canEdit && actions.length) {
      const action = actions[0];
      const view = element("button", "fpa-button", "View Prevention Action");
      view.type = "button";
      view.dataset.testid = "prevention-view";
      view.addEventListener("click", () => openEditor(row, options, action, view, true));
      const edit = element("button", "fpa-button fpa-button-primary", "Edit Prevention Action");
      edit.type = "button";
      edit.dataset.testid = "prevention-edit";
      edit.addEventListener("click", () => openEditor(row, options, action, edit));
      heading.append(view, edit);
    }
    section.appendChild(heading);
    if (!actions.length) {
      section.appendChild(element("p", "fpa-empty", options.canEdit
        ? "No prevention action recorded for this observation."
        : "No issued prevention action is available for this observation."));
    }
    actions.forEach((action) => {
      const details = element("details", "fpa-summary");
      const summary = document.createElement("summary");
      const name = element("span", "fpa-summary-title", `${actionStatus(action)} prevention action`);
      const meta = element("span", "fpa-summary-meta", `${targetSummary(action)}${action?.due_date ? ` · Due ${text(action.due_date)}` : ""}`);
      summary.append(name, meta);
      details.appendChild(summary);
      const body = element("div", "fpa-summary-body");
      const statusLine = element("div", "fpa-summary-status", actionStatus(action));
      statusLine.dataset.status = text(action?.status).toLowerCase() || "draft";
      body.appendChild(statusLine);
      if (action?.issued_at) body.appendChild(element("p", "fpa-detail-line", `Issued ${issueDate(action)}`));
      body.appendChild(element("p", "fpa-detail-line", `Targets: ${targetSummary(action)}`));
      if (action?.due_date) body.appendChild(element("p", "fpa-detail-line", `Due date: ${text(action.due_date)}`));
      body.appendChild(element("p", "fpa-instruction", text(action?.preventative_actions_required_by_vessel) || "No instruction supplied."));
      details.appendChild(body);
      section.appendChild(details);
      if (text(action?.status).toLowerCase() === "issued") {
        window.CSVB_FVE_RESPONSES?.attach(section, action, {
          companyId: options.companyId,
          client: options.client,
          onSaved: options.onSaved
        });
      }
    });
    host.appendChild(section);
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = element("div", "fpa-overlay");
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    const panel = element("section", "fpa-dialog");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "fpaDialogTitle");
    panel.tabIndex = -1;
    const header = element("header", "fpa-dialog-header");
    const title = element("h2", "", "Prevention action");
    title.id = "fpaDialogTitle";
    const close = element("button", "fpa-close", "Close");
    close.type = "button";
    close.addEventListener("click", closeDialog);
    header.append(title, close);
    const content = element("div", "fpa-dialog-content");
    content.id = "fpaDialogContent";
    panel.append(header, content);
    dialog.appendChild(panel);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && !busy) closeDialog();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        closeDialog();
      }
      if (event.key === "Tab") trapFocus(event);
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function trapFocus(event) {
    const focusable = Array.from(dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex='0']"))
      .filter((node) => node.getClientRects().length > 0);
    if (!focusable.length) return;
    const firstNode = focusable[0];
    const lastNode = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === firstNode) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      firstNode.focus();
    }
  }

  function closeDialog() {
    if (!dialog || busy) return;
    dialog.hidden = true;
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("fpa-dialog-open");
    activeTrigger?.focus?.();
    current = null;
  }

  function setMessage(message, kind = "info") {
    const host = dialog?.querySelector("#fpaInlineMessage");
    if (!host) return;
    host.hidden = !message;
    host.textContent = message || "";
    host.dataset.kind = kind;
  }

  async function getCompanyContext(client, companyId) {
    if (contextCache.has(companyId)) return contextCache.get(companyId);
    const promise = (async () => {
      const { data, error } = await client.rpc("csvb_fve_prevention_context", { p_company_id: companyId });
      if (error) throw error;
      const result = first(data);
      if (!result || typeof result !== "object") throw new Error("Company vessel context was empty.");
      return result;
    })();
    contextCache.set(companyId, promise);
    try {
      const result = await promise;
      contextCache.set(companyId, result);
      return result;
    } catch (error) {
      contextCache.delete(companyId);
      throw error;
    }
  }

  function buildSourceSnapshot(row, action) {
    const snapshot = action?.source_snapshot || {};
    const result = element("div", "fpa-source-grid");
    fields.forEach(([label, key]) => {
      const item = element("div", "fpa-source-item");
      item.append(element("span", "fpa-source-label", label), element("span", "fpa-source-value", text(snapshot[key] ?? row[key]) || "—"));
      result.appendChild(item);
    });
    return result;
  }

  function makeField(labelText, control) {
    const label = element("label", "fpa-field");
    label.append(element("span", "fpa-field-label", labelText), control);
    return label;
  }

  async function openEditor(row, options, action, trigger, readOnly = false) {
    if (busy) return;
    const shell = ensureDialog();
    activeTrigger = trigger;
    const content = shell.querySelector("#fpaDialogContent");
    content.replaceChildren();
    current = { row, options, action, readOnly: readOnly || !options.canEdit };
    const title = shell.querySelector("#fpaDialogTitle");
    title.textContent = action ? `${actionStatus(action)} prevention action` : "Create Prevention Action";
    shell.hidden = false;
    shell.setAttribute("aria-hidden", "false");
    document.body.classList.add("fpa-dialog-open");
    shell.querySelector(".fpa-dialog")?.focus();
    const loading = element("div", "fpa-loading", "Loading active company vessels…");
    content.append(buildSourceSnapshot(row, action), loading);
    setMessage("");
    try {
      // The backend context is authoritative; fetch it only when an editor/view is opened.
      const context = await getCompanyContext(options.client, options.companyId);
      if (!current || current.row !== row) return;
      loading.remove();
      if (current.readOnly) {
        content.append(readOnlyBody(action, context));
      } else if (context.can_edit !== true) {
        content.append(element("div", "fpa-inline-message", "This company context is read-only. No changes can be made."));
      } else {
        content.append(editorForm(row, action, context));
      }
      content.querySelector("textarea, button, input, select")?.focus();
    } catch (error) {
      loading.textContent = `Company vessel context could not be loaded. ${text(error?.message || error)}`;
      loading.dataset.kind = "error";
      const retry = element("button", "fpa-button", "Retry");
      retry.type = "button";
      retry.addEventListener("click", () => {
        contextCache.delete(options.companyId);
        openEditor(row, options, action, trigger, readOnly);
      });
      content.appendChild(retry);
    }
  }

  function readOnlyBody(action, context) {
    const body = element("div", "fpa-editor");
    if (!action) {
      body.appendChild(element("p", "fpa-empty", "There is no issued prevention action to view."));
      return body;
    }
    body.append(
      element("div", "fpa-summary-status", actionStatus(action)),
      element("p", "fpa-detail-line", `Targets: ${targetSummary(action)}`),
      ...(action.issued_at ? [element("p", "fpa-detail-line", `Issued ${issueDate(action)}`)] : []),
      ...(action.due_date ? [element("p", "fpa-detail-line", `Due date: ${text(action.due_date)}`)] : []),
      element("p", "fpa-instruction", text(action.preventative_actions_required_by_vessel) || "No instruction supplied.")
    );
    const targetNames = (action.targets || []).map((target) => target.vessel_name).filter(Boolean);
    if (targetNames.length) body.appendChild(element("p", "fpa-detail-line", `Selected vessels: ${targetNames.join(", ")}`));
    if (context.can_edit !== true) body.appendChild(element("p", "fpa-help", "Viewing only — this company context does not permit editing."));
    return body;
  }

  function editorForm(row, action, context) {
    const form = element("form", "fpa-editor");
    const issued = text(action?.status).toLowerCase() === "issued";
    let deleteRetryAllowed = false;
    let pendingActionDeletion = action?.delete_info?.pending === true;
    const instruction = document.createElement("textarea");
    instruction.required = true;
    instruction.rows = 5;
    instruction.maxLength = 10000;
    instruction.value = text(action?.preventative_actions_required_by_vessel);
    instruction.disabled = pendingActionDeletion;
    instruction.id = "fpaInstruction";
    instruction.dataset.testid = "prevention-instruction";
    instruction.setAttribute("aria-label", "Preventative Actions Required by the Vessel");
    form.appendChild(makeField("Preventative Actions Required by the Vessel", instruction));

    const mode = action?.target_mode === "selected" ? "selected" : "all";
    const modeGroup = element("fieldset", "fpa-target-mode");
    const legend = document.createElement("legend");
    legend.textContent = "Target vessels";
    modeGroup.appendChild(legend);
    const allLabel = document.createElement("label");
    const allRadio = document.createElement("input");
    allRadio.type = "radio";
    allRadio.name = "fpaTargetMode";
    allRadio.value = "all";
    allRadio.id = "fpaTargetAll";
    allRadio.dataset.testid = "prevention-target-all";
    allRadio.checked = mode === "all";
    allRadio.disabled = issued || pendingActionDeletion;
    allLabel.append(allRadio, document.createTextNode(" All company vessels"));
    const selectedLabel = document.createElement("label");
    const selectedRadio = document.createElement("input");
    selectedRadio.type = "radio";
    selectedRadio.name = "fpaTargetMode";
    selectedRadio.value = "selected";
    selectedRadio.id = "fpaTargetSelected";
    selectedRadio.dataset.testid = "prevention-target-selected";
    selectedRadio.checked = mode === "selected";
    selectedRadio.disabled = issued || pendingActionDeletion;
    selectedLabel.append(selectedRadio, document.createTextNode(" Selected vessels"));
    modeGroup.append(allLabel, selectedLabel);
    form.appendChild(modeGroup);

    const vesselBox = element("div", "fpa-vessel-list");
    vesselBox.setAttribute("aria-label", "Select vessels to receive this action");
    const existingTargets = new Set((action?.targets || []).map((target) => text(target.vessel_id)));
    const vessels = Array.isArray(context.vessels) ? context.vessels : [];
    if (!vessels.length) vesselBox.appendChild(element("p", "fpa-help", "No active vessels are available."));
    vessels.forEach((vessel) => {
      const label = element("label", "fpa-vessel-option");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = text(vessel.id);
      checkbox.dataset.testid = "prevention-vessel";
      checkbox.checked = existingTargets.has(text(vessel.id));
      checkbox.disabled = issued || pendingActionDeletion;
      label.append(checkbox, document.createTextNode(` ${text(vessel.name) || "Unnamed vessel"}`));
      vesselBox.appendChild(label);
    });
    modeGroup.insertAdjacentElement("afterend", vesselBox);
    const syncTargetMode = () => {
      const selected = selectedRadio.checked;
      vesselBox.hidden = !selected;
      vesselBox.querySelectorAll("input").forEach((input) => { input.disabled = issued || pendingActionDeletion || !selected; });
    };
    allRadio.addEventListener("change", syncTargetMode);
    selectedRadio.addEventListener("change", syncTargetMode);
    syncTargetMode();

    const dueDate = document.createElement("input");
    dueDate.type = "date";
    dueDate.value = text(action?.due_date).slice(0, 10);
    dueDate.disabled = pendingActionDeletion;
    dueDate.id = "fpaDueDate";
    dueDate.dataset.testid = "prevention-due-date";
    form.appendChild(makeField("Optional due date", dueDate));
    if (issued) form.appendChild(element("p", "fpa-help", "Issued actions keep their original issue date and target vessels. Targeting is locked; instruction and due date can still be updated."));
    const message = element("div", "fpa-inline-message");
    message.id = "fpaInlineMessage";
    message.hidden = true;
    message.setAttribute("role", "status");
    form.appendChild(message);
    const footer = element("div", "fpa-actions");
    if (action?.id) {
      const deleteInfo = action.delete_info && typeof action.delete_info === "object"
        ? action.delete_info
        : { can_delete: false, reason: "Deletion eligibility is unavailable.", pending: false };
      const deleteButton = element("button", "fpa-button fpa-button-danger",
        deleteRetryAllowed || deleteInfo.pending === true ? "Retry Delete" : "Delete Action");
      deleteButton.type = "button";
      deleteButton.dataset.testid = "prevention-delete";
      deleteButton.dataset.fpaCanDelete = String(deleteInfo.can_delete === true);
      deleteButton.disabled = deleteInfo.can_delete !== true && !deleteRetryAllowed;
      deleteButton.addEventListener("click", () => {
        if (busy) return;
        const issuedConfirmation = "Delete this issued prevention action? Its issued tasks and targets will be removed, together with any unsubmitted draft responses and temporary evidence. The source observation remains unchanged. Submitted history cannot be deleted.";
        const draftConfirmation = "Delete this draft prevention action? Its targets, unsubmitted drafts, and evidence will be removed. The source observation will remain unchanged.";
        if (!window.confirm(issued ? issuedConfirmation : draftConfirmation)) return;
        void deleteAction(row, action, current.options, deleteButton, () => {
          deleteRetryAllowed = true;
          pendingActionDeletion = true;
          deleteButton.dataset.fpaRetryAllowed = "true";
          form.querySelectorAll("input, textarea, select").forEach((control) => { control.disabled = true; });
          form.querySelectorAll('[data-fpa-mutation="true"]').forEach((control) => {
            control.dataset.fpaPending = "true";
            control.disabled = true;
          });
        });
      });
      const deleteControls = element("div", "fpa-delete-controls");
      deleteControls.appendChild(deleteButton);
      if (deleteInfo.can_delete !== true && !deleteRetryAllowed) {
        deleteControls.appendChild(element("p", "fpa-help fpa-delete-reason",
          text(deleteInfo.reason) || "This action cannot be deleted."));
      } else if (deleteRetryAllowed || deleteInfo.pending === true) {
        deleteControls.appendChild(element("p", "fpa-help fpa-delete-reason", "Deletion is pending. Retry to finish cleanup."));
      }
      form.appendChild(deleteControls);
    }
    const close = element("button", "fpa-button", "Close");
    close.type = "button";
    close.addEventListener("click", closeDialog);
    footer.appendChild(close);
      const save = element("button", "fpa-button fpa-button-primary", issued ? "Save Changes" : "Save Draft");
      save.type = "button";
      save.dataset.testid = issued ? "prevention-save-changes" : "prevention-save-draft";
      save.dataset.fpaMutation = "true";
      save.dataset.fpaPending = String(pendingActionDeletion);
      save.disabled = pendingActionDeletion;
      save.addEventListener("click", async () => {
        if (busy || pendingActionDeletion) return;
        if (!instruction.value.trim()) {
          setMessage("Enter the preventative action instruction before saving.", "error");
          instruction.focus();
          return;
        }
        if (selectedRadio.checked && vesselBox.querySelectorAll("input:checked").length === 0) {
          setMessage("Select at least one active vessel, or choose all company vessels.", "error");
          return;
        }
        await saveAction({ row, action, options: current.options, instruction, allRadio, dueDate, vesselBox, issuedAfter: false });
      });
      footer.appendChild(save);
    if (!issued) {
      const issue = element("button", "fpa-button fpa-button-issue", "Issue to Vessels");
      issue.type = "button";
      issue.dataset.testid = "prevention-save-and-issue";
      issue.dataset.fpaMutation = "true";
      issue.dataset.fpaPending = String(pendingActionDeletion);
      issue.disabled = pendingActionDeletion;
      issue.addEventListener("click", async () => {
        if (busy || pendingActionDeletion) return;
        if (!instruction.value.trim()) {
          setMessage("Enter the preventative action instruction before issuing.", "error");
          instruction.focus();
          return;
        }
        if (selectedRadio.checked && vesselBox.querySelectorAll("input:checked").length === 0) {
          setMessage("Select at least one active vessel, or choose all company vessels.", "error");
          return;
        }
        const prompt = action?.id
          ? "Save these changes and issue this prevention action to its selected vessels? Issued targets cannot be changed."
          : "Save and issue this prevention action to the selected vessels? This cannot be undone.";
        if (!window.confirm(prompt)) return;
        await saveAction({ row, action, options: current.options, instruction, allRadio, dueDate, vesselBox, issuedAfter: true });
      });
      footer.appendChild(issue);
    }
    form.appendChild(footer);
    form.addEventListener("submit", (event) => event.preventDefault());
    return form;
  }

  function setBusy(value) {
    busy = value;
    dialog?.querySelectorAll("button").forEach((button) => {
      button.disabled = value;
      if (!value && button.dataset.testid === "prevention-delete") {
        button.disabled = button.dataset.fpaCanDelete !== "true" && button.dataset.fpaRetryAllowed !== "true";
      }
      if (!value && button.dataset.fpaMutation === "true" && button.dataset.fpaPending === "true") {
        button.disabled = true;
      }
    });
  }

  async function saveAction({ row, action, options, instruction, allRadio, dueDate, vesselBox, issuedAfter }) {
    setBusy(true);
    setMessage(issuedAfter ? "Saving the draft before issue…" : "Saving prevention action…");
    try {
      const params = {
        p_company_id: options.companyId,
        p_source_observation_item_id: row.source_observation_item_id,
        p_action_id: action?.id || null,
        p_instruction: instruction.value.trim(),
        p_target_mode: action?.status === "issued" ? action.target_mode : (allRadio.checked ? "all" : "selected"),
        p_vessel_ids: action?.status === "issued"
          ? (action.targets || []).map((target) => text(target.vessel_id))
          : (allRadio.checked ? [] : Array.from(vesselBox.querySelectorAll("input:checked")).map((input) => input.value)),
        p_due_date: dueDate.value || null,
        p_expected_revision: action?.revision ?? null
      };
      const { data, error } = await options.client.rpc("csvb_fve_prevention_action_save", params);
      if (error) throw error;
      let saved = first(data);
      if (!saved || typeof saved !== "object") throw new Error("The save response was empty.");
      if (issuedAfter) {
        setMessage("Draft saved. Issuing action…");
        const { data: issuedData, error: issueError } = await options.client.rpc("csvb_fve_prevention_action_issue", {
          p_company_id: options.companyId,
          p_action_id: saved.id,
          p_expected_revision: saved.revision
        });
        if (issueError) {
          applySavedAction(row, saved, options);
          const message = `The draft was saved, but issuing failed. Your saved draft is open and can be edited. ${text(issueError.message || issueError)}`;
          setBusy(false);
          await openEditor(row, options, saved, activeTrigger, false);
          setMessage(message, "error");
          return;
        }
        saved = first(issuedData);
        if (!saved || typeof saved !== "object") {
          const draft = first(data);
          applySavedAction(row, draft, options);
          const message = "The draft was saved, but the issue response was empty. Your saved draft is open and can be edited.";
          setBusy(false);
          await openEditor(row, options, draft, activeTrigger, false);
          setMessage(message, "error");
          return;
        }
      }
      applySavedAction(row, saved, options);
      setBusy(false);
      closeDialog();
    } catch (error) {
      setBusy(false);
      const message = text(error?.message || error);
      const conflict = /revision|conflict|stale|changed|reload/i.test(message);
      setMessage(conflict ? `This action changed elsewhere. Reload the history before editing again. ${message}` : message, "error");
      if (conflict) {
        const reload = element("button", "fpa-button", "Reload history");
        reload.type = "button";
        reload.addEventListener("click", () => {
          const onSaved = current?.options?.onSaved;
          closeDialog();
          onSaved?.({ reload: true });
        });
        dialog?.querySelector("#fpaInlineMessage")?.insertAdjacentElement("afterend", reload);
      }
    }
  }

  async function deleteAction(row, action, options, button, markRetryable) {
    if (busy) return;
    setBusy(true);
    setMessage("Preparing secure action cleanup…");
    let operationPrepared = false;
    try {
      const issued = text(action.status).toLowerCase() === "issued";
      const { data, error } = await options.client.rpc("csvb_fve_cleanup_prepare", {
        p_company_id: options.companyId,
        p_kind: "action",
        p_object_id: action.id,
        p_confirm_issued: issued,
        p_expected_revision: action.revision
      });
      if (error) throw error;
      operationPrepared = true;
      markRetryable();
      button.textContent = "Retry Delete";
      const operation = first(data);
      if (!operation || typeof operation !== "object" ||
          text(operation.kind) !== "action" ||
          text(operation.object_id) !== text(action.id) ||
          !operation.id || !["pending", "completed"].includes(operation.status) ||
          !Array.isArray(operation.storage_paths) ||
          operation.storage_paths.some((path) => typeof path !== "string")) {
        throw new Error("The cleanup service returned an invalid action operation.");
      }
      setMessage("Removing action evidence…");
      if (operation.storage_paths.length) {
        if (!options.client?.storage?.from) throw new Error("Secure evidence cleanup is unavailable.");
        for (let offset = 0; offset < operation.storage_paths.length; offset += 100) {
          const paths = operation.storage_paths.slice(offset, offset + 100);
          const { error: storageError } = await options.client.storage.from("fve-response-evidence").remove(paths);
          if (storageError) throw storageError;
        }
      }
      setMessage("Finalizing action deletion…");
      const { data: finishData, error: finishError } = await options.client.rpc("csvb_fve_cleanup_finish", {
        p_company_id: options.companyId,
        p_cleanup_id: operation.id
      });
      if (finishError) throw finishError;
      const result = first(finishData);
      if (!result || result.deleted !== true ||
          text(result.kind) !== "action" ||
          text(result.object_id) !== text(action.id)) {
        throw new Error("The cleanup service did not confirm action deletion.");
      }
      const actions = Array.isArray(row.prevention_actions) ? row.prevention_actions : [];
      row.prevention_actions = actions.filter((item) => text(item.id) !== text(action.id));
      if (options.host) render(options.host, row, options);
      setBusy(false);
      closeDialog();
      try { options.onSaved?.({ reload: true }); } catch (_) { /* deletion is already finalized */ }
    } catch (error) {
      setBusy(false);
      if (operationPrepared) {
        markRetryable();
        button.textContent = "Retry Delete";
        setMessage(`Action deletion could not be completed. A pending cleanup may be resumed here; retry Delete. ${text(error?.message || error)}`, "error");
      } else {
        setMessage(`Action deletion could not be prepared. No deletion was started; the editor remains available. ${text(error?.message || error)}`, "error");
      }
    }
  }

  function applySavedAction(row, action, options) {
    const actions = Array.isArray(row.prevention_actions) ? row.prevention_actions.slice() : [];
    const index = actions.findIndex((item) => text(item.id) === text(action.id));
    if (index >= 0) actions[index] = action;
    else actions.unshift(action);
    row.prevention_actions = actions;
    if (options.host) render(options.host, row, options);
    options.onSaved?.({ action, row });
  }

  function attach(card, row, options) {
    const host = element("div", "fpa-host");
    card.appendChild(host);
    const settings = {
      companyId: text(options?.companyId),
      canEdit: options?.canEdit === true,
      client: options?.client,
      onSaved: options?.onSaved,
      host
    };
    render(host, row || {}, settings);
    return { host, refresh: () => render(host, row || {}, settings) };
  }

  window.CSVB_FVE_PREVENTION = { attach };
})();
