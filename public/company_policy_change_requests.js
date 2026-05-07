// public/company_policy_change_requests.js
// C.S.V. BEACON – Company Policy Change Requests UI
// CP-4D-2: implementation becomes automatic on publishing linked policy version.

(() => {
  "use strict";

  const STATE = {
    requests: [],
    events: [],
    selectedRequestId: "",
    selectedRequest: null,
    selectedImplementation: null,
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

  function plainTextToHtml(value) {
    return escapeHtml(value || "").replaceAll("\n", "<br />");
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

  async function ensureContext() {
    if (window.AUTH?.getSessionUserProfile) {
      try {
        await window.AUTH.getSessionUserProfile();
      } catch (_) {}
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

      .cr-pill.open { background: #eaf1fb; }

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

      .cr-detail { margin-top: 10px; }

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

      .cr-implementation-box {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 9px 10px;
        color: #213a5f;
        font-size: .9rem;
        line-height: 1.35;
      }

      .cr-helper-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 8px;
        margin-top: 8px;
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

  async function loadImplementation(requestId) {
    if (!requestId) {
      STATE.selectedImplementation = null;
      return null;
    }

    const { data, error } = await sb().rpc("csvb_company_policy_get_change_request_implementation", {
      p_request_id: requestId,
    });

    if (error) {
      throw new Error("Could not load implementation links: " + error.message);
    }

    STATE.selectedImplementation = Array.isArray(data) && data.length ? data[0] : null;
    return STATE.selectedImplementation;
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
    STATE.selectedRequest = req;

    await loadEvents(req.id);
    await loadImplementation(req.id);

    renderRequestList();
    renderRequestDetail(req);
  }

  function renderImplementationBox() {
    const impl = STATE.selectedImplementation;

    if (!impl) {
      return `
        <div class="cr-implementation-box">
          No implementation link loaded.
        </div>
      `;
    }

    return `
      <div class="cr-implementation-box">
        <div><strong>Draft link:</strong> ${
          impl.draft_version_id
            ? `v${escapeHtml(impl.draft_version_no)} / ${escapeHtml(impl.draft_version_status)}`
            : "none"
        }</div>
        <div><strong>Published link:</strong> ${
          impl.published_version_id
            ? `v${escapeHtml(impl.published_version_no)} / ${escapeHtml(impl.published_version_status)}`
            : "none"
        }</div>
        <div><strong>Implementation note:</strong> ${escapeHtml(impl.implementation_note || "none")}</div>
        <div><strong>Implemented by:</strong> ${escapeHtml(impl.implemented_by_username || "n/a")} ${impl.implemented_at ? "• " + escapeHtml(impl.implemented_at) : ""}</div>
      </div>
    `;
  }

  function renderRequestDetail(req) {
    const box = document.getElementById("crDetailBody");
    if (!box) return;

    const implementationControls = STATE.isAdmin ? `
      <div class="cr-detail-section">
        <div class="cr-detail-section-title">Implementation helpers</div>
        ${renderImplementationBox()}
        <div class="cr-note" style="margin-top:8px;">
          When the linked work version is published, this request will automatically be marked as implemented.
        </div>
        <div class="cr-helper-grid">
          <button class="btn2" id="crOpenPolicyItemBtn" type="button">Open policy item</button>
          <button class="btn2" id="crCopyRequestedBtn" type="button">Copy requested change</button>
          <button class="btn2" id="crCopyProposedBtn" type="button">Copy proposed text</button>
          <button class="btn2" id="crLoadProposedToEditorBtn" type="button">Load proposed text into Draft Editor</button>
          <button class="btn2" id="crLinkWorkVersionBtn" type="button">Link current work version</button>
        </div>
      </div>
    ` : "";

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
          <div>${plainTextToHtml(req.selected_text)}</div>
        </div>
      ` : ""}

      <div class="cr-detail-section">
        <div class="cr-detail-section-title">Requested change</div>
        <div>${plainTextToHtml(req.requested_change || "")}</div>
      </div>

      ${req.reason ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Reason</div>
          <div>${plainTextToHtml(req.reason)}</div>
        </div>
      ` : ""}

      ${req.proposed_text ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Proposed text</div>
          <div>${plainTextToHtml(req.proposed_text)}</div>
        </div>
      ` : ""}

      ${req.status_note ? `
        <div class="cr-detail-section">
          <div class="cr-detail-section-title">Latest status note</div>
          <div>${plainTextToHtml(req.status_note)}</div>
        </div>
      ` : ""}

      ${implementationControls}
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

    wireDetailButtons(req);
    renderEvents();
  }

  function wireDetailButtons(req) {
    const statusBtn = document.getElementById("crSetStatusBtn");
    if (statusBtn) {
      statusBtn.addEventListener("click", async () => {
        await guardedInline(() => setRequestStatus(req.id));
      });
    }

    const commentBtn = document.getElementById("crAddCommentBtn");
    if (commentBtn) {
      commentBtn.addEventListener("click", async () => {
        await guardedInline(() => addComment(req.id));
      });
    }

    const openBtn = document.getElementById("crOpenPolicyItemBtn");
    if (openBtn) {
      openBtn.addEventListener("click", () => openPolicyItem(req));
    }

    const copyRequestedBtn = document.getElementById("crCopyRequestedBtn");
    if (copyRequestedBtn) {
      copyRequestedBtn.addEventListener("click", () => copyToClipboard(req.requested_change || "", "Requested change copied."));
    }

    const copyProposedBtn = document.getElementById("crCopyProposedBtn");
    if (copyProposedBtn) {
      copyProposedBtn.addEventListener("click", () => copyToClipboard(req.proposed_text || "", "Proposed text copied."));
    }

    const loadProposedBtn = document.getElementById("crLoadProposedToEditorBtn");
    if (loadProposedBtn) {
      loadProposedBtn.addEventListener("click", () => loadProposedTextIntoDraftEditor(req));
    }

    const linkWorkBtn = document.getElementById("crLinkWorkVersionBtn");
    if (linkWorkBtn) {
      linkWorkBtn.addEventListener("click", async () => {
        await guardedInline(() => linkCurrentWorkVersion(req));
      });
    }
  }

  async function guardedInline(fn) {
    try {
      showWarn("");
      await fn();
    } catch (error) {
      showWarn(String(error?.message || error));
    }
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
          ${event.comment ? `<div>${plainTextToHtml(event.comment)}</div>` : ""}
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

  function openPolicyItem(req) {
    const policyBookTab = document.querySelector('[data-tab="policyBook"]');
    if (policyBookTab) policyBookTab.click();

    const directBtn = document.querySelector(`#chapterList [data-node-id="${req.node_id}"]`);

    if (directBtn) {
      directBtn.click();
      showOk("Policy item opened.");
      return;
    }

    const searchTab = document.querySelector('[data-tab="search"]');
    if (searchTab) searchTab.click();

    const searchInput = document.getElementById("searchInput");
    const searchBtn = document.getElementById("searchBtn");

    if (searchInput && searchBtn) {
      searchInput.value = req.node_code || req.node_title || "";
      searchBtn.click();

      setTimeout(() => {
        const result = document.querySelector(`[data-result-id="${req.node_id}"]`);
        if (result) {
          result.click();
          showOk("Policy item opened through search.");
        } else {
          showWarn("Policy item was not visible in the tree. Search results have been opened; select the matching item manually.");
        }
      }, 100);
    }
  }

  async function copyToClipboard(text, okMessage) {
    const value = String(text || "");

    if (!value) {
      showWarn("There is no text to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showOk(okMessage || "Copied.");
    } catch (_) {
      showWarn("Clipboard copy failed. Select and copy the text manually.");
    }
  }

  function loadProposedTextIntoDraftEditor(req) {
    const proposed = String(req.proposed_text || "").trim();

    if (!proposed) {
      showWarn("This change request has no proposed text.");
      return;
    }

    openPolicyItem(req);

    setTimeout(() => {
      const draftTab = document.querySelector('[data-content-tab="draft"]');
      if (draftTab) draftTab.click();

      const editor = document.getElementById("policyEditor");
      const summary = document.getElementById("policyChangeSummary");

      if (!editor) {
        showWarn("Draft editor was not found.");
        return;
      }

      editor.innerHTML = plainTextToHtml(proposed);

      if (summary) {
        summary.value = `${requestCode(req)} - ${req.request_type || "change request"}`;
      }

      showOk("Proposed text loaded into Draft Editor. Review it, then save the draft.");
    }, 250);
  }

  async function linkCurrentWorkVersion(req) {
    if (!STATE.isAdmin) {
      showWarn("This action is restricted to Super Admin.");
      return;
    }

    const { data, error } = await sb().rpc("csvb_company_policy_get_editor_state", {
      p_node_id: req.node_id,
    });

    if (error) {
      throw new Error("Could not load current work version: " + error.message);
    }

    const state = Array.isArray(data) && data.length ? data[0] : null;
    const workVersionId = state?.work_version_id || "";

    if (!workVersionId) {
      showWarn("No draft / pending / approved work version exists for this policy item. Save a draft first.");
      return;
    }

    const { error: linkError } = await sb().rpc("csvb_company_policy_link_change_request_version", {
      p_request_id: req.id,
      p_draft_version_id: workVersionId,
      p_published_version_id: null,
      p_implementation_note: "Linked to current work version from Change Requests UI. Request will be marked implemented automatically when the linked version is published.",
      p_mark_implemented: false,
    });

    if (linkError) {
      throw new Error("Could not link work version: " + linkError.message);
    }

    await loadRequestDetail(req.id);

    showOk("Current work version linked. The request will be marked implemented automatically when this version is published.");
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
      await ensureContext();

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
    openPolicyItem,
  };
})();