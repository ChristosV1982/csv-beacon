// public/company_policy_change_requests.js
// C.S.V. BEACON – Company Policy Change Requests UI
// CP-4B: submit, list, review, comment, and status-control change requests.

(() => {
  "use strict";

  const STATE = {
    requests: [],
    events: [],
    selectedRequestId: "",
    isAdmin: false,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showWarn(message) {
    const el = document.getElementById("warnBox");
    if (!el) return;
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function showOk(message) {
    const el = document.getElementById("okBox");
    if (!el) return;
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";

    if (message) {
      setTimeout(() => {
        el.style.display = "none";
        el.textContent = "";
      }, 2200);
    }
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-cr-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-cr-styles";
    style.textContent = `
      .cr-layout {
        display: grid;
        grid-template-columns: minmax(320px, 430px) minmax(380px, 1fr);
        gap: 10px;
        align-items: start;
      }

      .cr-card {
        border: 1px solid #dbe6f6;
        background: #fff;
        border-radius: 12px;
        padding: 11px;
        box-sizing: border-box;
      }

      .cr-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .cr-note {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .9rem;
        margin-bottom: 10px;
      }

      .cr-selected {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 9px 10px;
        color: #213a5f;
        font-size: .9rem;
        line-height: 1.35;
        margin-bottom: 10px;
      }

      .cr-selected strong {
        color: #1a4170;
        font-weight: 700;
      }

      .cr-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 8px;
      }

      .cr-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 8px;
      }

      .cr-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 470px;
        overflow: auto;
      }

      .cr-item {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
      }

      .cr-item:hover {
        background: #eef6ff;
      }

      .cr-item.active {
        border-color: #2f78c4;
        background: #dbeeff;
        box-shadow: inset 0 0 0 1px #2f78c4;
      }

      .cr-item-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .cr-item-meta,
      .cr-detail-meta {
        color: #4d6283;
        font-size: .87rem;
        line-height: 1.35;
      }

      .cr-pill {
        display: inline-block;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: .78rem;
        font-weight: 600;
        border: 1px solid #cbd8ea;
        background: #fff;
        color: #1a4170;
        margin-right: 5px;
      }

      .cr-pill.open {
        background: #eaf1fb;
      }

      .cr-pill.under_review {
        background: #fff6e0;
        color: #8a5a00;
        border-color: #f6d58f;
      }

      .cr-pill.approved {
        background: #e9fff0;
        color: #11612b;
        border-color: #bce9c9;
      }

      .cr-pill.rejected {
        background: #ffeaea;
        color: #8b1d1d;
        border-color: #ffc7c7;
      }

      .cr-pill.implemented {
        background: #ecfdfd;
        color: #00616b;
        border-color: #9edfe5;
      }

      .cr-pill.closed {
        background: #f2f4f7;
        color: #4d6283;
        border-color: #d5dbe5;
      }

      .cr-detail {
        margin-top: 10px;
      }

      .cr-detail-section {
        border-top: 1px solid #dbe6f6;
        padding-top: 9px;
        margin-top: 9px;
      }

      .cr-detail-section-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 5px;
      }

      .cr-event-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
        max-height: 280px;
        overflow: auto;
      }

      .cr-event {
        border: 1px solid #dbe6f6;
        background: #f9fbfe;
        border-radius: 10px;
        padding: 8px;
      }

      .cr-event-title {
        color: #1a4170;
        font-weight: 700;
        font-size: .9rem;
      }

      .cr-event-text {
        color: #4d6283;
        font-size: .86rem;
        line-height: 1.35;
        margin-top: 3px;
      }

      @media (max-width: 980px) {
        .cr-layout {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function roleIsAdmin() {
    const role =
      window.CSVB_CONTEXT?.profile?.role ||
      window.CSVB_CONTEXT?.role ||
      "";

    return role === "super_admin" || role === "platform_owner";
  }

  function getActiveNodeId() {
    const active = document.querySelector("#chapterList .chapter-btn.active");
    return active?.getAttribute("data-node-id") || "";
  }

  function getActiveNodeLabel() {
    const title = document.getElementById("chapterTitle")?.textContent || "";
    return title.trim() || "No policy item selected";
  }

  function selectedTextFromPage() {
    try {
      return String(window.getSelection?.().toString() || "").trim();
    } catch (_) {
      return "";
    }
  }

  function sb() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }

    return window.AUTH.ensureSupabase();
  }

  function renderShell() {
    const panel = document.querySelector("#tab-changeRequests .panel");
    if (!panel) return;

    panel.innerHTML = `
      <div class="panel-title">Change Requests</div>

      <div class="cr-layout">
        <div class="cr-card">
          <div class="cr-title">Submit change request</div>
          <div class="cr-note">
            Submit a correction, addition, deletion, clarification, or other request against the selected policy item.
          </div>

          <div id="crSelectedNodeBox" class="cr-selected">
            <strong>Selected policy item:</strong><br />
            <span id="crSelectedNodeLabel">No policy item selected</span>
          </div>

          <div class="cr-grid">
            <div class="field">
              <label>Request type</label>
              <select id="crType">
                <option value="correction">Correction</option>
                <option value="addition">Addition</option>
                <option value="deletion">Deletion</option>
                <option value="clarification">Clarification</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="field">
              <label>Selected text</label>
              <button class="btn2" id="crUseSelectedTextBtn" type="button">Use highlighted text</button>
            </div>
          </div>

          <div class="field">
            <label>Selected text / reference</label>
            <textarea id="crSelectedText" placeholder="Optional. Paste the exact text or reference paragraph here."></textarea>
          </div>

          <div class="field">
            <label>Requested change</label>
            <textarea id="crRequestedChange" placeholder="Describe what should be changed." required></textarea>
          </div>

          <div class="field">
            <label>Reason</label>
            <textarea id="crReason" placeholder="Explain why the change is required."></textarea>
          </div>

          <div class="field">
            <label>Proposed text</label>
            <textarea id="crProposedText" placeholder="Optional proposed replacement/additional wording."></textarea>
          </div>

          <div class="cr-actions">
            <button class="btn" id="crSubmitBtn" type="button">Submit request</button>
            <button class="btn2" id="crClearFormBtn" type="button">Clear</button>
            <button class="btn2" id="crRefreshSelectedBtn" type="button">Refresh selected item</button>
          </div>
        </div>

        <div class="cr-card">
          <div class="row" style="justify-content:space-between;align-items:flex-end;">
            <div>
              <div class="cr-title">Request list</div>
              <div class="cr-note" id="crListScopeNote">Loading access scope...</div>
            </div>

            <div class="row">
              <select id="crStatusFilter" style="min-width:160px;">
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="under_review">Under review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="implemented">Implemented</option>
                <option value="closed">Closed</option>
              </select>
              <button class="btn2" id="crRefreshListBtn" type="button">Refresh</button>
            </div>
          </div>

          <div id="crList" class="cr-list">
            Loading change requests...
          </div>
        </div>
      </div>

      <div class="cr-card cr-detail" id="crDetailCard">
        <div class="cr-title">Request details</div>
        <div id="crDetailBody" class="cr-note">
          Select a change request from the list.
        </div>
      </div>
    `;
  }

  function statusLabel(value) {
    const labels = {
      open: "Open",
      under_review: "Under review",
      approved: "Approved",
      rejected: "Rejected",
      implemented: "Implemented",
      closed: "Closed",
    };

    return labels[value] || value || "";
  }

  function requestCode(req) {
    return req.request_code || `CPCR-${String(req.request_no || "").padStart(6, "0")}`;
  }

  function renderSelectedNodeBox() {
    const label = document.getElementById("crSelectedNodeLabel");
    if (label) label.textContent = getActiveNodeLabel();
  }

  function clearForm() {
    ["crSelectedText", "crRequestedChange", "crReason", "crProposedText"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const type = document.getElementById("crType");
    if (type) type.value = "correction";
  }

  async function createRequest() {
    const nodeId = getActiveNodeId();

    if (!nodeId) {
      showWarn("Select a policy item first.");
      return;
    }

    const requestType = document.getElementById("crType")?.value || "correction";
    const selectedText = String(document.getElementById("crSelectedText")?.value || "").trim();
    const requestedChange = String(document.getElementById("crRequestedChange")?.value || "").trim();
    const reason = String(document.getElementById("crReason")?.value || "").trim();
    const proposedText = String(document.getElementById("crProposedText")?.value || "").trim();

    if (!requestedChange) {
      showWarn("Requested change is required.");
      return;
    }

    const { data, error } = await sb().rpc("csvb_company_policy_create_change_request", {
      p_node_id: nodeId,
      p_request_type: requestType,
      p_requested_change: requestedChange,
      p_reason: reason || null,
      p_selected_text: selectedText || null,
      p_proposed_text: proposedText || null,
    });

    if (error) {
      throw new Error("Change request submission failed: " + error.message);
    }

    const created = Array.isArray(data) ? data[0] : data;
    STATE.selectedRequestId = created?.id || "";

    clearForm();
    await loadRequests();

    if (STATE.selectedRequestId) {
      await loadRequestDetail(STATE.selectedRequestId);
    }

    showOk("Change request submitted.");
  }

  async function loadRequests() {
    const filter = document.getElementById("crStatusFilter")?.value || "all";

    const { data, error } = await sb().rpc("csvb_company_policy_list_change_requests", {
      p_status: filter,
    });

    if (error) {
      throw new Error("Could not load change requests: " + error.message);
    }

    STATE.requests = data || [];
    renderRequestList();
  }

  function renderRequestList() {
    const list = document.getElementById("crList");
    const scope = document.getElementById("crListScopeNote");

    if (scope) {
      scope.textContent = STATE.isAdmin
        ? "Super Admin view: all change requests."
        : "User view: your own change requests.";
    }

    if (!list) return;

    if (!STATE.requests.length) {
      list.innerHTML = `
        <div class="content-box" style="min-height:0;">
          No change requests found.
        </div>
      `;
      return;
    }

    list.innerHTML = STATE.requests.map((req) => {
      const active = req.id === STATE.selectedRequestId ? " active" : "";

      return `
        <div class="cr-item${active}" data-cr-id="${escapeHtml(req.id)}">
          <div class="cr-item-title">
            ${escapeHtml(requestCode(req))} — ${escapeHtml(statusLabel(req.status))}
          </div>
          <div class="cr-item-meta">
            <span class="cr-pill ${escapeHtml(req.status)}">${escapeHtml(statusLabel(req.status))}</span>
            <span>${escapeHtml(req.request_type || "")}</span>
            <div>${escapeHtml(req.node_type || "")} ${escapeHtml(req.node_code || "")} — ${escapeHtml(req.node_title || "")}</div>
            <div>Submitted by: ${escapeHtml(req.submitted_by_username || "")} • ${escapeHtml(req.submitted_at || "")}</div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-cr-id]").forEach((item) => {
      item.addEventListener("click", async () => {
        await loadRequestDetail(item.getAttribute("data-cr-id"));
      });
    });
  }

  async function loadEvents(requestId) {
    const { data, error } = await sb().rpc("csvb_company_policy_list_change_request_events", {
      p_request_id: requestId,
    });

    if (error) {
      throw new Error("Could not load request events: " + error.message);
    }

    STATE.events = data || [];
  }

  async function loadRequestDetail(requestId) {
    if (!requestId) return;

    const { data, error } = await sb().rpc("csvb_company_policy_get_change_request", {
      p_request_id: requestId,
    });

    if (error) {
      throw new Error("Could not load change request detail: " + error.message);
    }

    const req = Array.isArray(data) ? data[0] : data;
    if (!req) return;

    STATE.selectedRequestId = req.id;

    await loadEvents(req.id);

    renderRequestList();
    renderRequestDetail(req);
  }

  function renderRequestDetail(req) {
    const box = document.getElementById("crDetailBody");
    if (!box) return;

    const adminControls = STATE.isAdmin ? `
      <div class="cr-detail-section">
        <div class="cr-detail-section-title">Admin status control</div>
        <div class="cr-grid">
          <div class="field">
            <label>New status</label>
            <select id="crNewStatus">
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="implemented">Implemented</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div class="field">
            <label>Status note</label>
            <input id="crStatusNote" placeholder="Optional status note" />
          </div>
        </div>
        <div class="cr-actions">
          <button class="btn" id="crSetStatusBtn" type="button">Set status</button>
        </div>
      </div>
    ` : "";

    box.innerHTML = `
      <div>
        <div class="cr-item-title">
          ${escapeHtml(requestCode(req))} — ${escapeHtml(statusLabel(req.status))}
        </div>
        <div class="cr-detail-meta">
          <span class="cr-pill ${escapeHtml(req.status)}">${escapeHtml(statusLabel(req.status))}</span>
          <span>${escapeHtml(req.request_type || "")}</span>
          <div>${escapeHtml(req.node_type || "")} ${escapeHtml(req.node_code || "")} — ${escapeHtml(req.node_title || "")}</div>
          <div>Company: ${escapeHtml(req.company_name || "n/a")}</div>
          <div>Submitted by: ${escapeHtml(req.submitted_by_username || "")} • ${escapeHtml(req.submitted_at || "")}</div>
        </div>
      </div>

      ${req.selected_text ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Selected text / reference</div>
          <div>${escapeHtml(req.selected_text).replaceAll("\n", "<br />")}</div>
        </div>
      ` : ""}

      <div class="cr-detail-section">
        <div class="cr-detail-section-title">Requested change</div>
        <div>${escapeHtml(req.requested_change || "").replaceAll("\n", "<br />")}</div>
      </div>

      ${req.reason ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Reason</div>
          <div>${escapeHtml(req.reason).replaceAll("\n", "<br />")}</div>
        </div>
      ` : ""}

      ${req.proposed_text ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Proposed text</div>
          <div>${escapeHtml(req.proposed_text).replaceAll("\n", "<br />")}</div>
        </div>
      ` : ""}

      ${req.status_note ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Latest status note</div>
          <div>${escapeHtml(req.status_note).replaceAll("\n", "<br />")}</div>
        </div>
      ` : ""}

      ${adminControls}

      <div class="cr-detail-section">
        <div class="cr-detail-section-title">Add comment</div>
        <textarea id="crCommentText" placeholder="Add comment to this request"></textarea>
        <div class="cr-actions">
          <button class="btn2" id="crAddCommentBtn" type="button">Add comment</button>
        </div>
      </div>

      <div class="cr-detail-section">
        <div class="cr-detail-section-title">Event history</div>
        <div id="crEvents" class="cr-event-list"></div>
      </div>
    `;

    const statusSel = document.getElementById("crNewStatus");
    if (statusSel) statusSel.value = req.status || "open";

    const setStatusBtn = document.getElementById("crSetStatusBtn");
    if (setStatusBtn) {
      setStatusBtn.addEventListener("click", async () => {
        await setRequestStatus(req.id);
      });
    }

    const addCommentBtn = document.getElementById("crAddCommentBtn");
    if (addCommentBtn) {
      addCommentBtn.addEventListener("click", async () => {
        await addComment(req.id);
      });
    }

    renderEvents();
  }

  function renderEvents() {
    const box = document.getElementById("crEvents");
    if (!box) return;

    if (!STATE.events.length) {
      box.innerHTML = `
        <div class="content-box" style="min-height:0;">
          No events recorded.
        </div>
      `;
      return;
    }

    box.innerHTML = STATE.events.map((event) => `
      <div class="cr-event">
        <div class="cr-event-title">
          ${escapeHtml(event.event_type || "")}
          ${event.old_status || event.new_status ? ` — ${escapeHtml(event.old_status || "")} → ${escapeHtml(event.new_status || "")}` : ""}
        </div>
        <div class="cr-event-text">
          <div>By: ${escapeHtml(event.actor_username || "")} • ${escapeHtml(event.created_at || "")}</div>
          ${event.comment ? `<div>${escapeHtml(event.comment).replaceAll("\n", "<br />")}</div>` : ""}
        </div>
      </div>
    `).join("");
  }

  async function addComment(requestId) {
    const comment = String(document.getElementById("crCommentText")?.value || "").trim();

    if (!comment) {
      showWarn("Comment is required.");
      return;
    }

    const { error } = await sb().rpc("csvb_company_policy_add_change_request_comment", {
      p_request_id: requestId,
      p_comment: comment,
    });

    if (error) {
      throw new Error("Could not add comment: " + error.message);
    }

    await loadRequestDetail(requestId);

    showOk("Comment added.");
  }

  async function setRequestStatus(requestId) {
    if (!STATE.isAdmin) {
      showWarn("Status control is restricted to Super Admin.");
      return;
    }

    const status = document.getElementById("crNewStatus")?.value || "open";
    const note = String(document.getElementById("crStatusNote")?.value || "").trim();

    const { error } = await sb().rpc("csvb_company_policy_set_change_request_status", {
      p_request_id: requestId,
      p_status: status,
      p_status_note: note || null,
    });

    if (error) {
      throw new Error("Could not set request status: " + error.message);
    }

    await loadRequests();
    await loadRequestDetail(requestId);

    showOk("Status updated.");
  }

  function wireUi() {
    const submitBtn = document.getElementById("crSubmitBtn");
    const clearBtn = document.getElementById("crClearFormBtn");
    const refreshSelectedBtn = document.getElementById("crRefreshSelectedBtn");
    const selectedTextBtn = document.getElementById("crUseSelectedTextBtn");
    const refreshListBtn = document.getElementById("crRefreshListBtn");
    const statusFilter = document.getElementById("crStatusFilter");

    const guarded = (fn) => async () => {
      try {
        showWarn("");
        await fn();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    };

    if (submitBtn) submitBtn.addEventListener("click", guarded(createRequest));
    if (clearBtn) clearBtn.addEventListener("click", clearForm);
    if (refreshSelectedBtn) refreshSelectedBtn.addEventListener("click", renderSelectedNodeBox);

    if (selectedTextBtn) {
      selectedTextBtn.addEventListener("click", () => {
        const text = selectedTextFromPage();
        const target = document.getElementById("crSelectedText");
        if (target && text) target.value = text;
      });
    }

    if (refreshListBtn) refreshListBtn.addEventListener("click", guarded(loadRequests));
    if (statusFilter) statusFilter.addEventListener("change", guarded(loadRequests));

    const mainRequestBtn = document.getElementById("submitChangeRequestBtn");
    if (mainRequestBtn) {
      mainRequestBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const tab = document.querySelector('[data-tab="changeRequests"]');
        if (tab) tab.click();

        renderSelectedNodeBox();
      }, true);
    }
  }

  async function init() {
    try {
      injectStyles();
      renderShell();

      STATE.isAdmin = roleIsAdmin();

      wireUi();
      renderSelectedNodeBox();

      await loadRequests();
    } catch (error) {
      showWarn(String(error?.message || error));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }

  window.CSVB_POLICY_CHANGE_REQUESTS = {
    refresh: loadRequests,
    renderSelectedNodeBox,
  };
})();