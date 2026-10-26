(() => {
  "use strict";

  const BUCKET = "fve-response-evidence";
  const MAX_FILES = 5;
  const MAX_BYTES = 10 * 1024 * 1024;
  const TYPES = {
    jpg: ["image/jpeg", "JPEG image"], jpeg: ["image/jpeg", "JPEG image"],
    png: ["image/png", "PNG image"], webp: ["image/webp", "WebP image"],
    pdf: ["application/pdf", "PDF"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word document"],
    xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel spreadsheet"],
    pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "PowerPoint presentation"],
    txt: ["text/plain", "Text file"], csv: ["text/csv", "CSV"]
  };
  const STATUS = {
    pending: "Pending", response_submitted: "Response Submitted",
    office_review: "Office Review", returned: "Returned to Vessel", closed: "Closed"
  };
  const str = (value) => value === null || value === undefined ? "" : String(value);
  const first = (value) => Array.isArray(value) ? value[0] : value;
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  };
  const statusLabel = (status) => STATUS[str(status).toLowerCase()] || "Pending";
  const prettyDate = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? str(value) : date.toLocaleString();
  };
  const fileBytes = (evidence) => (Array.isArray(evidence) ? evidence : [])
    .reduce((sum, item) => sum + (Number(item.size_bytes) || 0), 0);
  const evidenceLabel = (item) => `${str(item.original_filename) || "Evidence"}${item.size_bytes ? ` · ${formatBytes(item.size_bytes)}` : ""}`;
  function formatBytes(value) {
    const bytes = Number(value) || 0;
    return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function attach(host, action, options = {}) {
    if (!host || !action || str(action.status).toLowerCase() !== "issued") return null;
    const config = {
      companyId: str(options.companyId), client: options.client,
      onSaved: options.onSaved
    };
    const section = el("section", "fvr-section");
    section.setAttribute("aria-label", "Vessel responses");
    host.appendChild(section);
    let dialog = null;
    let trigger = null;
    let activeTargetId = null;
    let workflow = null;
    let busy = false;
    let composerOpen = false;
    let draftDeletePending = false;
    let draftText = "";
    let savedDraftText = "";

    function summary() {
      const info = action.workflow_summary || {};
      const counts = info.counts || {};
      const targets = Array.isArray(info.targets) ? info.targets : [];
      section.replaceChildren();
      const head = el("div", "fvr-heading");
      head.append(el("span", "fvr-kicker", "VESSEL RESPONSES"));
      if (action.due_date) head.append(el("span", "fvr-due", `Action due ${str(action.due_date)}`));
      section.appendChild(head);
      const countLine = el("div", "fvr-counts");
      [
        ["Pending", "pending"], ["Submitted", "response_submitted"],
        ["Office review", "office_review"], ["Returned", "returned"], ["Closed", "closed"]
      ].forEach(([label, key]) => {
        const chip = el("span", "fvr-count", `${label} ${Number(counts[key]) || 0}`);
        chip.dataset.status = key;
        countLine.appendChild(chip);
      });
      section.appendChild(countLine);
      if (!targets.length) {
        section.appendChild(el("p", "fvr-empty", "No vessel response targets are available."));
        return;
      }
      const list = el("div", "fvr-target-list");
      targets.forEach((target) => {
        const targetRow = el("div", "fvr-target-wrap");
        targetRow.dataset.testid = "workflow-target";
        const button = el("button", "fvr-target", "");
        button.type = "button";
        button.dataset.testid = "workflow-target/open";
        button.setAttribute("aria-label", `Open response workflow for ${str(target.vessel_name) || "vessel"}`);
        const top = el("span", "fvr-target-top");
        top.append(el("strong", "", str(target.vessel_name) || "Vessel"));
        top.append(el("span", "fvr-status", statusLabel(target.status)));
        button.appendChild(top);
        const meta = el("span", "fvr-target-meta", action.due_date ? `Due ${str(action.due_date)}` : "No due date");
        button.appendChild(meta);
        if (target.overdue === true) button.appendChild(el("span", "fvr-overdue", "Overdue"));
        button.addEventListener("click", () => openWorkflow(target, button));
        targetRow.appendChild(button);
        list.appendChild(targetRow);
      });
      if (targets.length > 1) {
        const picker = el("details", "fvr-target-picker");
        picker.append(el("summary", "", `Target vessels (${targets.length})`), list);
        section.appendChild(picker);
      } else section.appendChild(list);
    }

    async function rpc(name, params) {
      if (!config.client?.rpc) throw new Error("Secure workflow service is unavailable.");
      const { data, error } = await config.client.rpc(name, params);
      if (error) throw error;
      const result = first(data);
      if (!result || typeof result !== "object") throw new Error("The workflow service returned no data.");
      return result;
    }

    function ensureDialog() {
      if (dialog) return dialog;
      dialog = el("div", "fvr-overlay");
      dialog.hidden = true;
      dialog.setAttribute("aria-hidden", "true");
      const panel = el("section", "fvr-dialog");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-labelledby", "fvrDialogTitle");
      panel.tabIndex = -1;
      const header = el("header", "fvr-dialog-header");
      const title = el("h2", "", "Vessel response");
      title.id = "fvrDialogTitle";
      const close = el("button", "fvr-close", "Close");
      close.type = "button";
      close.addEventListener("click", closeDialog);
      header.append(title, close);
      const content = el("div", "fvr-dialog-content");
      content.id = "fvrDialogContent";
      panel.append(header, content);
      dialog.appendChild(panel);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog && !busy) void closeDialog();
      });
      dialog.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          void closeDialog();
        }
        if (event.key === "Tab") trapFocus(event);
      });
      document.body.appendChild(dialog);
      return dialog;
    }

    function trapFocus(event) {
      const items = Array.from(dialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex='0']"))
        .filter((node) => node.getClientRects().length);
      if (!items.length) return;
      const firstNode = items[0], lastNode = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault(); lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault(); firstNode.focus();
      }
    }

    async function closeDialog() {
      if (!dialog || busy) return;
      if (composerOpen && !draftDeletePending) {
        if (!window.confirm("Save your current response text and close? The draft and uploaded evidence will remain available.")) return;
        setBusy(true, "Saving response draft…");
        try {
          await persistDraftText();
        } catch (error) {
          setBusy(false);
          showMessage(`Draft text could not be saved. ${str(error?.message || error)}`);
          return;
        }
        setBusy(false);
      }
      dialog.hidden = true;
      dialog.setAttribute("aria-hidden", "true");
      document.body.classList.remove("fvr-dialog-open");
      dialog.remove();
      dialog = null;
      trigger?.focus?.();
      activeTargetId = null;
      workflow = null;
      composerOpen = false;
      draftText = "";
      savedDraftText = "";
    }

    function showMessage(message, kind = "error") {
      const content = dialog?.querySelector("#fvrDialogContent");
      if (!content) return;
      let note = content.querySelector(".fvr-message");
      if (!note) {
        note = el("div", "fvr-message");
        note.setAttribute("role", "alert");
        content.prepend(note);
      }
      note.textContent = message || "";
      note.dataset.kind = kind;
      note.hidden = !message;
    }

    function setBusy(value, message = "") {
      busy = value;
      syncControls();
      if (message) showMessage(message, "info");
    }

    function syncControls() {
      dialog?.querySelectorAll("button, input, textarea").forEach((node) => {
        const needsResponse = node.dataset.fvrRequiresResponse === "true" && !draftText.trim();
        const commentField = dialog.querySelector('[data-testid="review-comment"]');
        const needsComment = node.dataset.fvrRequiresComment === "true" && !commentField?.value.trim();
        const frozenMutation = draftDeletePending && node.dataset.fvrMutation === "true";
        node.disabled = busy || frozenMutation || node.dataset.fvrDisabled === "true" || needsResponse || needsComment;
      });
    }

    function currentUnsubmittedDraft() {
      const draft = workflow?.draft;
      const status = str(draft?.status).toLowerCase();
      if (!draft?.id || draft.submitted_at || status === "response_submitted" || status === "submitted") return null;
      const submittedIds = new Set((Array.isArray(workflow?.responses) ? workflow.responses : [])
        .map((response) => str(response.id)));
      return submittedIds.has(str(draft.id)) ? null : draft;
    }

    async function openWorkflow(target, source) {
      if (busy) return;
      trigger = source;
      activeTargetId = target.id;
      workflow = null;
      composerOpen = false;
      const shell = ensureDialog();
      shell.hidden = false;
      shell.setAttribute("aria-hidden", "false");
      document.body.classList.add("fvr-dialog-open");
      shell.querySelector("#fvrDialogTitle").textContent = str(target.vessel_name) || "Vessel response";
      const content = shell.querySelector("#fvrDialogContent");
      content.replaceChildren(el("div", "fvr-loading", "Loading response history…"));
      shell.querySelector(".fvr-dialog")?.focus();
      try {
        workflow = await rpc("csvb_fve_target_workflow", {
          p_company_id: config.companyId, p_target_id: activeTargetId
        });
        if (activeTargetId !== target.id || shell.hidden) return;
        if (!workflow.draft) draftDeletePending = false;
        draftText = str(workflow.draft?.response_text || "");
        savedDraftText = draftText;
        renderWorkflow();
      } catch (error) {
        if (activeTargetId !== target.id || shell.hidden) return;
        content.replaceChildren();
        showMessage(`Response workflow could not be loaded. ${str(error?.message || error)}`);
        const retry = el("button", "fvr-button", "Retry");
        retry.type = "button";
        retry.addEventListener("click", () => openWorkflow(target, source));
        content.appendChild(retry);
      }
    }

    function renderWorkflow() {
      const content = dialog.querySelector("#fvrDialogContent");
      content.replaceChildren();
      const target = workflow.target || {};
      const meta = el("div", "fvr-workflow-meta");
      meta.append(el("span", "fvr-status", statusLabel(target.status)));
      if (target.overdue === true) meta.appendChild(el("span", "fvr-overdue", "Overdue"));
      if (workflow.action?.due_date) meta.appendChild(el("span", "fvr-meta-text", `Action due ${str(workflow.action.due_date)}`));
      content.appendChild(meta);
      const instruction = el("details", "fvr-instruction-details");
      const summaryNode = document.createElement("summary");
      summaryNode.textContent = "Office instruction";
      const instructionText = el("p", "fvr-instruction", str(workflow.action?.instruction) || "No instruction supplied.");
      instruction.append(summaryNode, instructionText);
      content.appendChild(instruction);
      content.appendChild(renderHistory(workflow));
      if (composerOpen) {
        content.appendChild(renderComposer());
      } else if (draftDeletePending && currentUnsubmittedDraft()) {
        const resume = el("button", "fvr-button fvr-button-primary", "Resume draft deletion");
        resume.type = "button";
        resume.addEventListener("click", () => {
          composerOpen = true;
          draftText = str(workflow.draft?.response_text || "");
          savedDraftText = draftText;
          renderWorkflow();
        });
        content.appendChild(resume);
      } else if (workflow.can_respond === true) {
        const compose = el("button", "fvr-button fvr-button-primary", workflow.draft ? "Continue response draft" : "Compose vessel response");
        compose.type = "button";
        compose.disabled = draftDeletePending;
        compose.addEventListener("click", beginComposer);
        content.appendChild(compose);
      }
      if (workflow.can_review === true) content.appendChild(renderReviewControls());
      content.querySelector("textarea, button")?.focus();
      syncControls();
    }

    function renderHistory(data) {
      const block = el("section", "fvr-history");
      block.append(el("h3", "", "Response history"));
      const items = [];
      const responses = Array.isArray(data.responses) ? data.responses : [];
      const responseIds = new Set(responses.map((response) => str(response.id)));
      responses.forEach((response) => {
        items.push({ kind: "response", at: response.submitted_at, value: response });
      });
      (Array.isArray(data.events) ? data.events : []).forEach((event) => {
        if (str(event.event).toLowerCase() === "response_submitted" && responseIds.has(str(event.response_id))) return;
        items.push({ kind: "event", at: event.occurred_at, value: event });
      });
      items.sort((a, b) => (new Date(a.at || 0).getTime() || 0) - (new Date(b.at || 0).getTime() || 0));
      if (!items.length) block.appendChild(el("p", "fvr-empty", "No submitted responses or office decisions yet."));
      items.forEach((entry) => {
        const item = el("article", `fvr-history-item ${entry.kind}`);
        const value = entry.value;
        if (entry.kind === "response") {
          item.append(el("div", "fvr-history-title", `Vessel response ${Number(value.response_no) || ""}`.trim()));
          item.appendChild(el("time", "fvr-time", prettyDate(value.submitted_at)));
          item.appendChild(el("p", "fvr-response-text", str(value.response_text)));
          appendEvidence(item, value.evidence || []);
        } else {
          item.appendChild(el("div", "fvr-history-title", eventTitle(value.event)));
          item.appendChild(el("time", "fvr-time", prettyDate(value.occurred_at)));
          if (value.comment) item.appendChild(el("p", "fvr-response-text", str(value.comment)));
        }
        block.appendChild(item);
      });
      return block;
    }

    function eventTitle(event) {
      const labels = {
        issued: "Prevention action issued",
        response_submitted: "Response submitted",
        office_review: "Office review started",
        returned: "Returned to vessel",
        closed: "Response closed"
      };
      return labels[str(event).toLowerCase()] || "Office workflow event";
    }

    function appendEvidence(parent, evidence) {
      if (!evidence.length) return;
      const list = el("div", "fvr-evidence-list");
      evidence.forEach((item) => {
        const link = el("button", "fvr-evidence-link", evidenceLabel(item));
        link.type = "button";
        link.addEventListener("click", () => downloadEvidence(item));
        list.appendChild(link);
      });
      parent.appendChild(list);
    }

    async function downloadEvidence(item) {
      try {
        if (!config.client?.storage) throw new Error("Secure evidence downloads are unavailable.");
        const { data, error } = await config.client.storage.from(BUCKET)
          .createSignedUrl(item.storage_path, 120, { download: item.original_filename });
        if (error) throw error;
        if (!data?.signedUrl) throw new Error("A temporary download link could not be created.");
        window.open(data.signedUrl, "_blank", "noopener");
      } catch (error) {
        showMessage(`Evidence could not be opened. ${str(error?.message || error)}`);
      }
    }

    async function beginComposer() {
      if (busy || draftDeletePending) return;
      setBusy(true, "Opening response draft…");
      try {
        workflow = await rpc("csvb_fve_response_draft", {
          p_company_id: config.companyId, p_target_id: activeTargetId
        });
        draftText = str(workflow.draft?.response_text || "");
        savedDraftText = draftText;
        composerOpen = true;
        renderWorkflow();
      } catch (error) {
        setBusy(false);
        showMessage(`Draft could not be opened. ${str(error?.message || error)}`);
      } finally {
        setBusy(false);
      }
    }

    function renderComposer() {
      const form = el("section", "fvr-composer");
      form.appendChild(el("h3", "", "Vessel Response"));
      form.appendChild(el("p", "fvr-help", "Response text is saved when you close this composer or manage evidence. Your draft and evidence remain available."));
      const label = el("label", "fvr-field");
      label.appendChild(el("span", "", "Vessel Response"));
      const textarea = document.createElement("textarea");
      textarea.rows = 6;
      textarea.maxLength = 30000;
      textarea.value = draftText;
      textarea.dataset.testid = "response-text";
      textarea.dataset.fvrMutation = "true";
      textarea.setAttribute("aria-label", "Vessel response");
      textarea.addEventListener("input", () => {
        draftText = textarea.value;
        syncControls();
      });
      label.appendChild(textarea);
      form.appendChild(label);
      const draft = currentUnsubmittedDraft();
      const evidence = Array.isArray(draft?.evidence) ? draft.evidence : [];
      const total = fileBytes(evidence);
      form.appendChild(el("p", "fvr-quota", `${evidence.length} of ${MAX_FILES} files · ${formatBytes(total)} of 10 MB`));
      const list = el("div", "fvr-evidence-list");
      evidence.forEach((item) => {
        const row = el("div", "fvr-evidence-row");
        row.append(el("span", "", evidenceLabel(item)));
        const remove = el("button", "fvr-button fvr-button-small", "Remove");
        remove.type = "button";
        remove.dataset.testid = "evidence-remove";
        remove.dataset.fvrMutation = "true";
        remove.addEventListener("click", () => removeDraftEvidence(item));
        row.appendChild(remove);
        list.appendChild(row);
      });
      form.appendChild(list);
      const inputLabel = el("label", "fvr-field");
      inputLabel.appendChild(el("span", "", "Add evidence (up to 5 files, 10 MB combined)"));
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = ".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv";
      input.dataset.testid = "evidence-file";
      input.dataset.fvrMutation = "true";
      input.setAttribute("aria-label", "Add response evidence");
      input.addEventListener("change", () => uploadFiles(Array.from(input.files || []), input));
      inputLabel.appendChild(input);
      form.appendChild(inputLabel);
      const actions = el("div", "fvr-actions");
      const close = el("button", "fvr-button", "Close and keep draft");
      close.type = "button";
      close.addEventListener("click", () => void closeComposer());
      let deleteButton = null;
      if (draft) {
        deleteButton = el("button", "fvr-button fvr-button-danger", "Delete Draft Response");
        deleteButton.type = "button";
        deleteButton.dataset.testid = "response-delete-draft";
        deleteButton.addEventListener("click", () => deleteDraftResponse());
      }
      const submit = el("button", "fvr-button fvr-button-primary", "Submit Response");
      submit.type = "button";
      submit.dataset.testid = "response-submit";
      submit.dataset.fvrRequiresResponse = "true";
      submit.dataset.fvrMutation = "true";
      submit.addEventListener("click", () => submitResponse(textarea.value));
      actions.append(close);
      if (deleteButton) actions.appendChild(deleteButton);
      actions.appendChild(submit);
      form.appendChild(actions);
      syncControls();
      return form;
    }

    async function persistDraftText() {
      if (draftDeletePending) throw new Error("The draft is locked while deletion cleanup is pending.");
      if (!workflow?.draft?.id) throw new Error("The editable response draft is unavailable.");
      if (draftText.length > 30000) throw new Error("Response text cannot exceed 30,000 characters.");
      if (draftText === savedDraftText) return;
      workflow = await rpc("csvb_fve_response_draft_text_save", {
        p_company_id: config.companyId,
        p_response_id: workflow.draft.id,
        p_response_text: draftText
      });
      savedDraftText = draftText;
    }

    async function closeComposer() {
      if (busy) return;
      if (draftDeletePending) {
        composerOpen = false;
        renderWorkflow();
        return;
      }
      setBusy(true, "Saving response draft…");
      try {
        await persistDraftText();
        composerOpen = false;
        renderWorkflow();
      } catch (error) {
        showMessage(`Draft text could not be saved. ${str(error?.message || error)}`);
      } finally {
        setBusy(false);
      }
    }

    function fileInfo(file) {
      const extension = str(file.name).split(".").pop().toLowerCase();
      const mapping = TYPES[extension];
      if (!mapping) throw new Error("That file type is not allowed. Choose an image, PDF, Office document, TXT, or CSV file.");
      const browserType = str(file.type).toLowerCase().split(";")[0];
      // Trust only the approved extension mapping for the upload content type.
      return { mime: mapping[0], type: mapping, browserType };
    }

    async function uploadFiles(files, input) {
      if (!files.length || busy || draftDeletePending) return;
      const currentFiles = Array.isArray(workflow.draft?.evidence) ? workflow.draft.evidence : [];
      try {
        if (currentFiles.length + files.length > MAX_FILES) throw new Error("A response can include no more than five evidence files.");
        const existingBytes = fileBytes(currentFiles);
        const addedBytes = files.reduce((sum, file) => sum + file.size, 0);
        if (existingBytes + addedBytes > MAX_BYTES) throw new Error("Evidence files must total no more than 10 MB.");
        files.forEach(fileInfo);
      } catch (error) {
        showMessage(str(error.message || error));
        input.value = "";
        return;
      }
      setBusy(true, "Saving response text…");
      try {
        await persistDraftText();
      } catch (error) {
        setBusy(false);
        showMessage(`Draft text could not be saved. Evidence was not changed. ${str(error?.message || error)}`);
        input.value = "";
        return;
      }
      setBusy(true, "Uploading evidence securely…");
      try {
        for (const file of files) {
          const { mime } = fileInfo(file);
          const reserved = await rpc("csvb_fve_evidence_reserve", {
            p_company_id: config.companyId, p_response_id: workflow.draft.id,
            p_filename: file.name, p_mime_type: mime, p_size_bytes: file.size
          });
          const evidence = reserved.evidence || reserved;
          const path = evidence.storage_path;
          try {
            const { error } = await config.client.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
              contentType: mime, upsert: false
            });
            if (error) throw error;
          } catch (uploadError) {
            if (path) await config.client.storage.from(BUCKET).remove([path]).catch(() => {});
            try {
              await rpc("csvb_fve_evidence_cancel", { p_company_id: config.companyId, p_evidence_id: evidence.id });
            } catch (_) { /* best-effort reservation cleanup */ }
            throw uploadError;
          }
        }
        workflow = await loadWorkflow(activeTargetId);
        renderWorkflow();
        showMessage("Evidence uploaded.", "info");
      } catch (error) {
        const message = `Evidence upload failed. ${str(error?.message || error)}`;
        try { workflow = await loadWorkflow(activeTargetId); renderWorkflow(); } catch (_) { /* retain current view */ }
        showMessage(message);
      } finally {
        setBusy(false);
        const picker = dialog?.querySelector('[data-testid="evidence-file"]');
        if (picker) picker.value = "";
      }
    }

    async function loadWorkflow(targetId) {
      return rpc("csvb_fve_target_workflow", {
        p_company_id: config.companyId, p_target_id: targetId
      });
    }

    async function deleteEvidence(item) {
      if (item.storage_path) {
        const { error } = await config.client.storage.from(BUCKET).remove([item.storage_path]);
        if (error) throw error;
      }
      await rpc("csvb_fve_evidence_cancel", {
        p_company_id: config.companyId, p_evidence_id: item.id
      });
    }

    async function removeDraftEvidence(item) {
      if (busy || draftDeletePending) return;
      setBusy(true, "Saving response text…");
      try {
        await persistDraftText();
        setBusy(true, "Removing draft evidence…");
        await deleteEvidence(item);
        workflow = await loadWorkflow(activeTargetId);
        renderWorkflow();
      } catch (error) {
        showMessage(`Draft text or evidence could not be saved/removed. ${str(error?.message || error)}`);
      } finally {
        setBusy(false);
      }
    }

    async function deleteDraftResponse() {
      const draft = currentUnsubmittedDraft();
      if (busy || !draft || !window.confirm(
        "Delete this unsubmitted response draft and its temporary evidence? Earlier submissions and office history will be preserved."
      )) return;
      setBusy(true, "Preparing secure draft cleanup…");
      let deletionFinalized = false;
      let operationPrepared = false;
      let savedNotificationSent = false;
      const notifyDeleteSaved = () => {
        if (savedNotificationSent) return;
        savedNotificationSent = true;
        try { notifySaved(); } catch (_) { /* deletion is already finalized */ }
      };
      try {
        const operation = await rpc("csvb_fve_cleanup_prepare", {
          p_company_id: config.companyId,
          p_kind: "draft",
          p_object_id: draft.id
        });
        operationPrepared = true;
        draftDeletePending = true;
        syncControls();
        if (str(operation.kind) !== "draft" ||
            str(operation.object_id) !== str(draft.id) ||
            !operation.id || !["pending", "completed"].includes(operation.status) ||
            !Array.isArray(operation.storage_paths) ||
            operation.storage_paths.some((path) => typeof path !== "string")) {
          throw new Error("The cleanup service returned an invalid draft operation.");
        }
        setBusy(true, "Removing temporary draft evidence…");
        if (operation.storage_paths.length) {
          if (!config.client?.storage?.from) throw new Error("Secure evidence cleanup is unavailable.");
          for (let offset = 0; offset < operation.storage_paths.length; offset += 100) {
            const paths = operation.storage_paths.slice(offset, offset + 100);
            const { error } = await config.client.storage.from(BUCKET).remove(paths);
            if (error) throw error;
          }
        }
        setBusy(true, "Finalizing draft deletion…");
        const result = await rpc("csvb_fve_cleanup_finish", {
          p_company_id: config.companyId,
          p_cleanup_id: operation.id
        });
        if (result.deleted !== true ||
            str(result.kind) !== "draft" ||
            str(result.object_id) !== str(draft.id)) {
          throw new Error("The cleanup service did not confirm draft deletion.");
        }
        deletionFinalized = true;
        draftDeletePending = false;
        composerOpen = false;
        draftText = "";
        savedDraftText = "";
        workflow.draft = null;
        setBusy(false);
        try {
          workflow = await loadWorkflow(activeTargetId);
          renderWorkflow();
          showMessage("Draft deleted. Earlier submissions and office history are unchanged.", "info");
        } catch (error) {
          renderWorkflow();
          showMessage(`Draft was deleted, but the response workflow could not be refreshed. ${str(error?.message || error)}`);
          const retry = el("button", "fvr-button", "Retry workflow");
          retry.type = "button";
          retry.addEventListener("click", async () => {
            if (busy) return;
            setBusy(true, "Refreshing response workflow…");
            try {
              workflow = await loadWorkflow(activeTargetId);
              renderWorkflow();
            } catch (refreshError) {
              showMessage(`Response workflow could not be refreshed. ${str(refreshError?.message || refreshError)}`);
            } finally {
              setBusy(false);
            }
          });
          dialog?.querySelector("#fvrDialogContent")?.appendChild(retry);
        }
        notifyDeleteSaved();
      } catch (error) {
        if (deletionFinalized) {
          showMessage(`Draft was deleted, but response workflow finalization failed. ${str(error?.message || error)}`);
          notifyDeleteSaved();
        } else if (operationPrepared) {
          showMessage(`Draft deletion could not be completed. Cleanup is pending; retry Delete Draft Response to resume. ${str(error?.message || error)}`);
        } else {
          showMessage(`Draft deletion could not be prepared. No deletion was started; the composer remains available. ${str(error?.message || error)}`);
        }
      } finally {
        setBusy(false);
      }
    }

    async function submitResponse(responseText) {
      if (busy || draftDeletePending || !str(responseText).trim()) return;
      setBusy(true, "Submitting response…");
      try {
        workflow = await rpc("csvb_fve_response_submit", {
          p_company_id: config.companyId,
          p_response_id: workflow.draft.id,
          p_response_text: str(responseText).trim()
        });
        composerOpen = false;
        renderWorkflow();
        notifySaved();
      } catch (error) {
        showMessage(`Response could not be submitted. ${str(error?.message || error)}`);
      } finally {
        setBusy(false);
      }
    }

    function renderReviewControls() {
      const controls = el("section", "fvr-review");
      controls.appendChild(el("h3", "", "Office review"));
      const commentLabel = el("label", "fvr-field");
      commentLabel.appendChild(el("span", "", "Review comment"));
      const comment = document.createElement("textarea");
      comment.rows = 3;
      comment.maxLength = 5000;
      comment.dataset.testid = "review-comment";
      comment.setAttribute("aria-label", "Review comment");
      comment.addEventListener("input", syncControls);
      commentLabel.appendChild(comment);
      controls.appendChild(commentLabel);
      const actions = el("div", "fvr-actions");
      const status = str(workflow.target?.status).toLowerCase();
      if (status === "response_submitted") {
        const start = el("button", "fvr-button fvr-button-primary", "Start review");
        start.type = "button";
        start.addEventListener("click", () => review("start_review", null));
        actions.appendChild(start);
      }
      if (status === "office_review") {
        const back = el("button", "fvr-button fvr-button-danger", "Return to vessel");
        back.type = "button";
        back.dataset.testid = "review-return";
        back.dataset.fvrRequiresComment = "true";
        back.addEventListener("click", () => {
          if (!comment.value.trim()) {
            comment.focus();
            showMessage("Add a comment before returning this response.");
            return;
          }
          review("return", comment.value.trim());
        });
        const close = el("button", "fvr-button fvr-button-primary", "Close response");
        close.type = "button";
        close.dataset.testid = "review-close";
        close.addEventListener("click", () => review("close", comment.value.trim() || null));
        actions.append(back, close);
      }
      controls.appendChild(actions);
      return controls;
    }

    async function review(decision, comment) {
      if (busy) return;
      const responses = Array.isArray(workflow.responses) ? workflow.responses : [];
      const latest = responses.reduce((a, b) =>
        (Number(a.response_no) || 0) > (Number(b.response_no) || 0) ? a : b, responses[0] || {});
      if (!latest.id) {
        showMessage("No submitted response is available for review.");
        return;
      }
      setBusy(true, "Saving office decision…");
      try {
        workflow = await rpc("csvb_fve_target_review", {
          p_company_id: config.companyId, p_target_id: activeTargetId,
          p_decision: decision, p_comment: comment,
          p_expected_response_id: latest.id
        });
        renderWorkflow();
        notifySaved();
      } catch (error) {
        showMessage(`Office decision could not be saved. ${str(error?.message || error)}`);
      } finally {
        setBusy(false);
      }
    }

    function notifySaved() {
      config.onSaved?.({ reload: true });
    }

    summary();
    return { host: section, refresh: summary };
  }

  window.CSVB_FVE_RESPONSES = { attach };
})();
