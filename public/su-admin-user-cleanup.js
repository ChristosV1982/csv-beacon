(() => {
  "use strict";

  const selectedIds = new Set();
  let visibleUsers = [];
  let api = null;
  let refreshUsers = null;
  let getCurrentUser = () => null;
  let canDelete = () => false;
  let actorId = null;
  let storageKey = "";
  let activeJob = null;
  let activeEntries = [];
  let confirmationToken = null;
  let busy = false;
  let preparing = false;
  let initialized = false;

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const idOf = (user) => String(user?.id ?? user?.user_id ?? "");
  const roleOf = (user) => String(user?.role ?? user?.role_name ?? "").trim().toLowerCase();
  const vesselOnly = (user) => roleOf(user) === "vessel";
  const isActor = (user) => !!actorId && idOf(user) === String(actorId);

  function readStoredJob() {
    try {
      return storageKey ? sessionStorage.getItem(storageKey) : null;
    } catch {
      return null;
    }
  }

  function userLabel(user) {
    const identity = user?.identity || user || {};
    return {
      id: idOf(identity),
      username: identity.username || identity.email || "Unknown account",
      role: identity.role || identity.role_name || "Unknown role",
      vessel: identity.vessel_name || "No vessel",
    };
  }

  function userCheckbox(user) {
    const id = idOf(user);
    const eligible = vesselOnly(user) && !isActor(user) && !!canDelete();
    const checked = selectedIds.has(id) ? " checked" : "";
    const disabled = eligible ? "" : " disabled";
    const why = !vesselOnly(user) ? "Office and non-vessel accounts cannot be selected" :
      isActor(user) ? "Your own account cannot be selected" :
        !canDelete() ? "Super Admin access required" : "Select vessel account";
    return '<td class="su-user-cleanup-select-cell"' + (canDelete() ? "" : " hidden") + '><input type="checkbox" data-su-cleanup-id="' +
      escapeHtml(id) + '"' + checked + disabled + ' aria-label="' + escapeHtml(why) +
      '" title="' + escapeHtml(why) + '"></td>';
  }

  function renderToolbar() {
    const allowed = !!canDelete();
    const toolbar = byId("suUserCleanupToolbar");
    if (toolbar) toolbar.hidden = !allowed;
    document.querySelectorAll(".su-user-cleanup-select-heading, .su-user-cleanup-select-cell")
      .forEach((cell) => { cell.hidden = !allowed; });
    const count = byId("suCleanupSelectionCount");
    const deleteButton = byId("suCleanupDeleteSelected");
    const resumeButton = byId("suCleanupResume");
    if (count) count.textContent = `${selectedIds.size} selected`;
    if (deleteButton) deleteButton.disabled = !selectedIds.size || !canDelete() || busy || preparing;
    if (resumeButton) {
      const savedJob = readStoredJob();
      resumeButton.hidden = !savedJob;
      resumeButton.disabled = busy || !canDelete();
    }
  }

  function setVisibleUsers(users) {
    visibleUsers = (Array.isArray(users) ? users : []).filter((user) => idOf(user));
    const selectable = new Set(visibleUsers.filter((user) => vesselOnly(user) && !isActor(user)).map(idOf));
    for (const id of Array.from(selectedIds)) {
      if (!selectable.has(id)) selectedIds.delete(id);
    }
    const body = byId("usersBody");
    if (body) {
      body.querySelectorAll("input[data-su-cleanup-id]").forEach((checkbox) => {
        checkbox.checked = selectedIds.has(checkbox.dataset.suCleanupId);
      });
    }
    renderToolbar();
  }

  function closeDialog() {
    const backdrop = byId("suCleanupDialog");
    if (!backdrop || busy) return;
    backdrop.hidden = true;
    document.body.classList.remove("su-cleanup-open");
    activeJob = null;
    activeEntries = [];
    confirmationToken = null;
  }

  function openDialog() {
    const backdrop = byId("suCleanupDialog");
    const dialog = backdrop?.querySelector('[role="dialog"]');
    if (!backdrop || !dialog) return;
    backdrop.hidden = false;
    document.body.classList.add("su-cleanup-open");
    window.requestAnimationFrame(() => dialog.focus());
  }

  function setProgress(text) {
    const progress = byId("suCleanupProgress");
    if (progress) progress.textContent = text || "";
  }

  function setSummary(text) {
    const summary = byId("suCleanupSummary");
    if (summary) summary.textContent = text || "";
  }

  function setRows(entries) {
    const list = byId("suCleanupUserList");
    if (!list) return;
    list.replaceChildren();
    for (const entry of entries) {
      const user = userLabel(entry.identity || entry);
      const row = document.createElement("li");
      const username = document.createElement("strong");
      const role = document.createElement("span");
      const vessel = document.createElement("span");
      username.textContent = user.username;
      role.textContent = user.role;
      vessel.textContent = user.vessel;
      row.append(username, role, vessel);
      list.appendChild(row);
    }
  }

  function resetResults() {
    const list = byId("suCleanupResults");
    if (list) list.replaceChildren();
  }

  function addResult(entry, status, detail) {
    const list = byId("suCleanupResults");
    if (!list) return;
    const identity = userLabel(entry.identity || entry);
    const item = document.createElement("li");
    const successful = status === "completed" || status === "already_deleted";
    item.classList.toggle("is-failed", !successful);
    item.textContent = `${identity.username} — ${status.replaceAll("_", " ")}${detail ? `: ${detail}` : ""}`;
    list.appendChild(item);
  }

  function setModalMode(mode) {
    const confirmButton = byId("suCleanupConfirm");
    const cancelButton = byId("suCleanupCancel");
    const closeButton = byId("suCleanupClose");
    const intro = byId("suCleanupIntro");
    const title = byId("suCleanupTitle");
    if (mode === "processing") {
      if (title) title.textContent = "Cleanup in progress";
      if (intro) intro.textContent = "Accounts are processed one at a time. Completed accounts will be skipped if you resume this job.";
      if (confirmButton) confirmButton.hidden = true;
      if (cancelButton) cancelButton.hidden = true;
      if (closeButton) closeButton.disabled = true;
    } else {
      if (title) title.textContent = "Review selected accounts";
      if (intro) intro.textContent = "Only the listed user accounts are in scope. Vessel and fleet records will not be changed.";
      if (confirmButton) {
        confirmButton.hidden = false;
        confirmButton.disabled = false;
        confirmButton.textContent = "Confirm deletion";
      }
      if (cancelButton) cancelButton.hidden = false;
      if (closeButton) closeButton.disabled = false;
    }
  }

  function showReview(entries, { jobId, token, confirmed = false, heading } = {}) {
    activeJob = jobId || null;
    activeEntries = Array.isArray(entries) ? entries : [];
    confirmationToken = token || null;
    setModalMode("review");
    resetResults();
    setRows(activeEntries);
    setSummary(`${activeEntries.length} ${activeEntries.length === 1 ? "account" : "accounts"} prepared for deletion`);
    setProgress(heading || (confirmed ? "This confirmed job is ready to resume." : "Review the exact accounts before confirming."));
    const confirmButton = byId("suCleanupConfirm");
    if (confirmButton) confirmButton.textContent = confirmed ? "Resume cleanup" : "Confirm deletion";
    openDialog();
  }

  function persistJob(jobId) {
    if (!storageKey) return;
    try {
      if (jobId) sessionStorage.setItem(storageKey, String(jobId));
    } catch {}
    renderToolbar();
  }

  function clearPersistedJob() {
    try {
      if (storageKey) sessionStorage.removeItem(storageKey);
    } catch {}
    renderToolbar();
  }

  function fatalHttpError(error) {
    const match = String(error?.message || error).match(/HTTP\s+(\d{3})/i);
    return !!match && Number(match[1]) >= 400 && Number(match[1]) < 500;
  }

  async function reloadUsersOnce() {
    try {
      await refreshUsers();
    } catch (error) {
      setProgress(`Cleanup finished, but Users could not be reloaded: ${String(error?.message || error)}`);
    }
  }

  async function processJob(job, entries) {
    busy = true;
    setModalMode("processing");
    resetResults();
    const items = Array.isArray(entries) ? entries : [];
    const total = items.length;
    let complete = 0;
    let issues = 0;
    let stopped = false;
    for (let index = 0; index < items.length; index += 1) {
      const entry = items[index];
      const identity = userLabel(entry.identity || entry);
      const status = String(entry.status || "pending");
      if (status === "completed" || status === "already_deleted") {
        complete += 1;
        addResult(entry, "completed", "already completed; skipped");
        setProgress(`${complete + issues} of ${total} accounted for · ${identity.username} was already complete`);
        continue;
      }
      setProgress(`Processing ${index + 1} of ${total} · ${identity.username}`);
      try {
        const response = await api({ action: "delete_user", job_id: job, user_id: identity.id });
        const resultStatus = String(response?.status || (response?.ok ? "completed" : "failed"));
        if (response?.ok && (resultStatus === "completed" || resultStatus === "already_deleted")) {
          complete += 1;
          addResult(entry, resultStatus, "");
        } else {
          issues += 1;
          addResult(entry, resultStatus, response?.error || "The account was not completed.");
        }
      } catch (error) {
        issues += 1;
        addResult(entry, "failed", String(error?.message || error));
        if (fatalHttpError(error)) {
          stopped = true;
          for (const remaining of items.slice(index + 1)) {
            if (!["completed", "already_deleted"].includes(String(remaining.status || ""))) {
              addResult(remaining, "not attempted", "authorization or job validation stopped this run");
            }
          }
          break;
        }
      }
      setProgress(`${complete + issues} of ${total} accounted for · ${complete} completed, ${issues} with issues`);
    }

    if (!stopped && issues === 0 && complete === total) {
      clearPersistedJob();
      setProgress(`Complete · ${total} ${total === 1 ? "account" : "accounts"} removed or already complete. Vessel and fleet data were not changed.`);
    } else {
      persistJob(job);
      setProgress(`${complete} completed · ${issues} with issues. Use Resume cleanup to continue; completed rows will be skipped.`);
    }

    await reloadUsersOnce();
    busy = false;
    setModalMode("review");
    const closeButton = byId("suCleanupClose");
    if (closeButton) closeButton.disabled = false;
    const cancelButton = byId("suCleanupCancel");
    if (cancelButton) cancelButton.hidden = false;
    const confirmButton = byId("suCleanupConfirm");
    if (confirmButton) confirmButton.hidden = true;
    renderToolbar();
  }

  async function verifyPrepared(response, requestedIds) {
    if (!response?.ok || !response.job_id || !response.confirmation_token || !Array.isArray(response.users)) {
      throw new Error("The server did not return a complete deletion review. No account was deleted.");
    }
    const requested = new Set(requestedIds.map(String));
    const users = response.users;
    const returned = new Set(users.map(idOf));
    if (users.length !== requested.size || returned.size !== requested.size ||
        Array.from(requested).some((id) => !returned.has(id))) {
      throw new Error("The server's review did not match the selected accounts. No account was deleted.");
    }
    if (users.some((user) => !idOf(user) || !user.username || !user.role)) {
      throw new Error("The server returned incomplete account identities. No account was deleted.");
    }
    persistJob(response.job_id);
    showReview(users, { jobId: response.job_id, token: response.confirmation_token });
  }

  async function prepareSelection(ids) {
    if (busy || preparing) return;
    if (!canDelete()) throw new Error("Super Admin access required.");
    if (!ids.length) return;
    const uniqueIds = Array.from(new Set(ids.map(String)));
    const requestedUsers = uniqueIds.map((id) => visibleUsers.find((user) => idOf(user) === id)).filter(Boolean);
    if (requestedUsers.length !== uniqueIds.length) throw new Error("Selection changed. Review the visible vessel accounts and try again.");
    if (requestedUsers.some((user) => !vesselOnly(user) || isActor(user))) {
      throw new Error("Only other vessel accounts can be selected for bulk cleanup.");
    }
    preparing = true;
    renderToolbar();
    try {
      const response = await api({ action: "prepare_user_deletions", user_ids: uniqueIds });
      await verifyPrepared(response, uniqueIds);
    } finally {
      preparing = false;
      renderToolbar();
    }
  }

  async function deleteOne(id) {
    if (!canDelete()) throw new Error("Super Admin access required.");
    const user = (visibleUsers.find((entry) => idOf(entry) === String(id))) ||
      (window.__SU_ADMIN_USERS__?.find?.((entry) => idOf(entry) === String(id)));
    const response = await api({ action: "prepare_user_deletion", user_id: String(id) });
    if (!response?.ok || !response.job_id || !response.confirmation_token || !Array.isArray(response.users) ||
        response.users.length !== 1 || idOf(response.users[0]) !== String(id)) {
      throw new Error("Could not verify the selected account. No user was deleted.");
    }
    persistJob(response.job_id);
    showReview(response.users, { jobId: response.job_id, token: response.confirmation_token });
    return user || response.users[0];
  }

  async function confirmAndRun() {
    if (busy || !activeJob) return;
    const confirmButton = byId("suCleanupConfirm");
    if (confirmButton) confirmButton.disabled = true;
    try {
      if (confirmationToken) {
        const confirmed = await api({
          action: "confirm_user_deletions",
          job_id: activeJob,
          confirmation_token: confirmationToken,
        });
        if (!confirmed?.ok) throw new Error("The deletion job could not be confirmed. No account was deleted.");
        confirmationToken = null;
      }
      const response = await api({ action: "get_user_deletion_job", job_id: activeJob });
      if (!response?.ok || !response?.job?.confirmed_at || !Array.isArray(response.job.items)) {
        throw new Error("The confirmed deletion job could not be verified. No account was deleted.");
      }
      activeEntries = response.job.items;
      setRows(activeEntries);
      setSummary(`${activeEntries.length} ${activeEntries.length === 1 ? "account" : "accounts"} in this cleanup job`);
      await processJob(activeJob, activeEntries);
    } catch (error) {
      setProgress(String(error?.message || error));
      if (confirmButton) confirmButton.disabled = false;
    }
  }

  async function resumeJob() {
    if (busy || !canDelete() || !storageKey) return;
    const jobId = readStoredJob();
    if (!jobId) {
      renderToolbar();
      return;
    }
    openDialog();
    setSummary("Loading saved cleanup job…");
    setProgress("No deletion will begin until you choose Resume cleanup.");
    resetResults();
    try {
      const response = await api({ action: "get_user_deletion_job", job_id: jobId });
      if (!response?.ok || !response.job || !Array.isArray(response.job.items)) {
        throw new Error("The saved cleanup job could not be loaded.");
      }
      const items = response.job.items;
      if (response.job.confirmed_at) {
        activeJob = jobId;
        activeEntries = items;
        confirmationToken = null;
        setRows(items);
        setSummary(`${items.length} ${items.length === 1 ? "account" : "accounts"} in this cleanup job`);
        setProgress("Confirmed job loaded. Select Resume cleanup to continue; completed rows will be skipped.");
        setModalMode("review");
        const button = byId("suCleanupConfirm");
        if (button) button.textContent = "Resume cleanup";
        openDialog();
      } else if (response.confirmation_token) {
        showReview(items, {
          jobId,
          token: response.confirmation_token,
          heading: "This saved job was not confirmed. Review the accounts, then confirm to begin.",
        });
      } else {
        throw new Error("This saved job is not confirmed and cannot be resumed.");
      }
    } catch (error) {
      setProgress(String(error?.message || error));
      setSummary("Saved job unavailable");
      setRows([]);
      setModalMode("review");
      const button = byId("suCleanupConfirm");
      if (button) button.hidden = true;
      openDialog();
    }
  }

  function attachHandlers() {
    byId("usersBody")?.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-su-cleanup-id]");
      if (!checkbox || checkbox.disabled) return;
      const id = checkbox.dataset.suCleanupId;
      if (checkbox.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      renderToolbar();
    });

    byId("suCleanupSelectVisible")?.addEventListener("click", () => {
      if (!canDelete() || busy || preparing) return;
      for (const user of visibleUsers) {
        if (vesselOnly(user) && !isActor(user)) selectedIds.add(idOf(user));
      }
      byId("usersBody")?.querySelectorAll("input[data-su-cleanup-id]").forEach((checkbox) => {
        if (!checkbox.disabled) checkbox.checked = true;
      });
      renderToolbar();
    });
    byId("suCleanupClearSelection")?.addEventListener("click", () => {
      selectedIds.clear();
      byId("usersBody")?.querySelectorAll("input[data-su-cleanup-id]").forEach((checkbox) => {
        checkbox.checked = false;
      });
      renderToolbar();
    });
    byId("suCleanupDeleteSelected")?.addEventListener("click", async () => {
      try {
        await prepareSelection(Array.from(selectedIds));
      } catch (error) {
        if (typeof window.showWarn === "function") window.showWarn(String(error?.message || error));
        else console.error(error);
      }
    });
    byId("suCleanupResume")?.addEventListener("click", resumeJob);
    byId("suCleanupConfirm")?.addEventListener("click", confirmAndRun);
    byId("suCleanupCancel")?.addEventListener("click", closeDialog);
    byId("suCleanupClose")?.addEventListener("click", closeDialog);
    byId("suCleanupDialog")?.addEventListener("click", (event) => {
      if (event.target === byId("suCleanupDialog")) closeDialog();
    });
    document.addEventListener("keydown", (event) => {
      if (byId("suCleanupDialog")?.hidden) return;
      if (event.key === "Escape") {
        if (busy) {
          event.preventDefault();
          return;
        }
        closeDialog();
      }
      if (event.key === "Tab") {
        const dialog = byId("suCleanupDialog").querySelector('[role="dialog"]');
        const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
          .filter((element) => element.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        if (!controls.length) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && index <= 0) {
          event.preventDefault();
          controls[controls.length - 1].focus();
        } else if (!event.shiftKey && index === controls.length - 1) {
          event.preventDefault();
          controls[0].focus();
        }
      }
    });
  }

  function init(options = {}) {
    api = options.callApi;
    refreshUsers = options.refreshUsers;
    getCurrentUser = options.getCurrentUser || (() => null);
    canDelete = options.canDelete || (() => false);
    actorId = options.actorId ? String(options.actorId) : "";
    storageKey = actorId ? `csvb.su-user-cleanup.${actorId}` : "";
    if (!api || !refreshUsers) return;
    if (!initialized) {
      attachHandlers();
      initialized = true;
    }
    renderToolbar();
  }

  window.SU_USER_CLEANUP = {
    init,
    setVisibleUsers,
    rowCheckbox: userCheckbox,
    deleteOne,
    getCurrentUser: () => getCurrentUser(),
    canDelete: () => !!canDelete(),
    getActorId: () => actorId,
  };
})();
