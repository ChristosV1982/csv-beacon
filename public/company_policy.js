// public/company_policy.js
// C.S.V. BEACON – Company Policy module
// CP-3B: Policy tree + structure admin + draft/publish content editor.

let policyNodes = [];
let policyTree = [];
let archivedNodes = [];
let versionHistory = [];
let selectedNodeId = "";
let authBundle = null;

let currentEditorState = null;
let currentPublishedVersion = null;
let activeContentTab = "published";

const COLLAPSED_STORAGE_KEY = "csvb_company_policy_collapsed_nodes_v1";
let collapsedNodeIds = new Set();

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
    window.setTimeout(() => {
      el.style.display = "none";
      el.textContent = "";
    }, 2200);
  }
}

function loadCollapsedState() {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    collapsedNodeIds = new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    collapsedNodeIds = new Set();
  }
}

function saveCollapsedState() {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsedNodeIds]));
  } catch (_) {}
}

function injectTreeVisualStyles() {
  if (document.getElementById("csvb-policy-tree-visual-styles")) return;

  const style = document.createElement("style");
  style.id = "csvb-policy-tree-visual-styles";
  style.textContent = `
    #chapterList .chapter-btn {
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      min-height: 24px !important;
      transition: background .12s ease, border-color .12s ease, box-shadow .12s ease !important;
    }

    #chapterList .chapter-btn[data-depth="0"] {
      background: #f7fbff !important;
      border-left: 2px solid #dbe6f6 !important;
    }

    #chapterList .chapter-btn[data-depth="1"] {
      background: #e9f4ff !important;
      border-left: 5px solid #2f78c4 !important;
    }

    #chapterList .chapter-btn[data-depth="2"] {
      background: #f1f8ff !important;
      border-left: 5px solid #4f9bd3 !important;
    }

    #chapterList .chapter-btn[data-depth="3"] {
      background: #f7fbff !important;
      border-left: 5px solid #7eb7e5 !important;
    }

    #chapterList .chapter-btn[data-depth="4"] {
      background: #fbfdff !important;
      border-left: 5px solid #a6cee9 !important;
    }

    #chapterList .chapter-btn[data-depth="5"],
    #chapterList .chapter-btn[data-depth="6"],
    #chapterList .chapter-btn[data-depth="7"],
    #chapterList .chapter-btn[data-depth="8"] {
      background: #ffffff !important;
      border-left: 5px solid #c3ddf2 !important;
    }

    #chapterList .chapter-btn:hover {
      background: #dff0ff !important;
      border-color: #7fb3e6 !important;
    }

    #chapterList .chapter-btn.active {
      background: #d6ebff !important;
      border-color: #2f78c4 !important;
      box-shadow: inset 0 0 0 1px #2f78c4 !important;
    }

    #chapterList .tree-mark {
      width: 18px !important;
      min-width: 18px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #365a84 !important;
      font-weight: 700 !important;
    }

    #chapterList .node-title {
      white-space: nowrap !important;
      font-weight: inherit !important;
    }

    #chapterList .chapter-code {
      white-space: nowrap !important;
    }

    #chapterList .chapter-btn[data-depth="0"] .chapter-code,
    #chapterList .chapter-btn[data-depth="0"] .node-title {
      font-weight: 700 !important;
    }

    #chapterList .chapter-btn[data-depth="1"] .chapter-code,
    #chapterList .chapter-btn[data-depth="2"] .chapter-code,
    #chapterList .chapter-btn[data-depth="3"] .chapter-code,
    #chapterList .chapter-btn[data-depth="4"] .chapter-code {
      color: #0b4f90 !important;
    }

    #chapterList .chapter-btn[data-collapsed="true"] .tree-mark {
      color: #0b4f90 !important;
    }
  `;

  document.head.appendChild(style);
}

function isStructureAdmin() {
  const role = authBundle?.profile?.role || "";
  return role === "super_admin" || role === "platform_owner";
}

function nodeTypeLabel(type) {
  const map = {
    book_part: "Book part",
    chapter: "Chapter",
    subchapter: "Subchapter",
    section: "Section",
    subsection: "Subsection",
    paragraph: "Paragraph",
    annex: "Annex",
    appendix: "Appendix",
    heading: "Heading"
  };

  return map[type] || "Policy item";
}

function nodeLabel(node) {
  if (!node) return "";
  const type = nodeTypeLabel(node.node_type);
  const code = node.node_code ? ` ${node.node_code}` : "";
  return `${type}${code} - ${node.title || ""}`;
}

function normalizeNode(raw) {
  return {
    id: raw.id,
    book_id: raw.book_id,
    parent_node_id: raw.parent_node_id || null,
    node_type: raw.node_type || "heading",
    node_code: raw.node_code || "",
    title: raw.title || "",
    sort_order: Number(raw.sort_order || 0),
    depth: Number(raw.depth || 0),
    is_content_node: raw.is_content_node !== false,
    is_active: raw.is_active !== false,
    created_at: raw.created_at || null,
    updated_at: raw.updated_at || null,
    children: []
  };
}

function buildTree(nodes) {
  const byId = new Map();
  const roots = [];

  nodes.forEach((node) => {
    node.children = [];
    byId.set(node.id, node);
  });

  nodes.forEach((node) => {
    if (node.parent_node_id && byId.has(node.parent_node_id)) {
      byId.get(node.parent_node_id).children.push(node);
    } else {
      roots.push(node);
    }
  });

  function sortBranch(branch) {
    branch.sort((a, b) => {
      const s = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (s !== 0) return s;

      return String(a.node_code || "").localeCompare(String(b.node_code || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      });
    });

    branch.forEach((node) => sortBranch(node.children));
  }

  sortBranch(roots);
  return roots;
}

function flattenTree(nodes, output = []) {
  nodes.forEach((node) => {
    output.push(node);
    if (node.children?.length) flattenTree(node.children, output);
  });
  return output;
}

function findNode(nodeId) {
  return policyNodes.find((node) => node.id === nodeId) || null;
}

function getNodeDepth(node) {
  if (!node) return 0;

  let depth = 0;
  let current = node;

  while (current?.parent_node_id) {
    const parent = findNode(current.parent_node_id);
    if (!parent) break;
    depth += 1;
    current = parent;
  }

  return depth;
}

function nodeHasChildren(node) {
  return !!node?.children?.length;
}

function isNodeCollapsed(nodeId) {
  return collapsedNodeIds.has(nodeId);
}

function toggleNodeCollapsed(nodeId) {
  if (!nodeId) return;

  if (collapsedNodeIds.has(nodeId)) {
    collapsedNodeIds.delete(nodeId);
  } else {
    collapsedNodeIds.add(nodeId);
  }

  saveCollapsedState();
}

function expandNode(nodeId) {
  if (!nodeId) return;
  if (collapsedNodeIds.has(nodeId)) {
    collapsedNodeIds.delete(nodeId);
    saveCollapsedState();
  }
}

function expandAncestors(nodeId) {
  let current = findNode(nodeId);

  while (current?.parent_node_id) {
    collapsedNodeIds.delete(current.parent_node_id);
    current = findNode(current.parent_node_id);
  }

  saveCollapsedState();
}

function getDescendantIds(nodeId) {
  const ids = new Set();

  function walk(parentId) {
    policyNodes
      .filter((node) => node.parent_node_id === parentId)
      .forEach((child) => {
        ids.add(child.id);
        walk(child.id);
      });
  }

  walk(nodeId);
  return ids;
}

function parseSortOrder(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const num = Number(text);
  if (!Number.isFinite(num)) {
    throw new Error("Sort order must be a valid number.");
  }

  return num;
}

function optionLabel(node) {
  const depth = getNodeDepth(node);
  const prefix = "— ".repeat(depth);
  return `${prefix}${nodeLabel(node)}`;
}

function fillNodeSelect(selectEl, options = {}) {
  if (!selectEl) return;

  const {
    includeTopLevel = true,
    excludeNodeId = "",
    selectedValue = "",
    topLabel = "Top level",
  } = options;

  const excluded = new Set();

  if (excludeNodeId) {
    excluded.add(excludeNodeId);
    getDescendantIds(excludeNodeId).forEach((id) => excluded.add(id));
  }

  const flat = flattenTree(policyTree).filter((node) => !excluded.has(node.id));
  const html = [];

  if (includeTopLevel) {
    html.push(`<option value="">${escapeHtml(topLabel)}</option>`);
  }

  flat.forEach((node) => {
    html.push(`
      <option value="${escapeHtml(node.id)}">
        ${escapeHtml(optionLabel(node))}
      </option>
    `);
  });

  selectEl.innerHTML = html.join("");
  selectEl.value = selectedValue || "";
}

async function setupAuth() {
  if (!window.AUTH?.setupAuthButtons) {
    showWarn("AUTH helper not available. Login controls may not work.");
    return null;
  }

  const bundle = await AUTH.setupAuthButtons({
    badgeId: "userBadge",
    loginBtnId: "loginBtn",
    logoutBtnId: "logoutBtn",
    switchBtnId: "switchUserBtn"
  });

  authBundle = bundle;

  if (!bundle?.session?.user) {
    showWarn("You are logged out. Login is required to view the Company Policy module.");
    return bundle;
  }

  showWarn("");
  return bundle;
}

async function loadPolicyNodesFromSupabase() {
  if (!authBundle?.session?.user) {
    policyNodes = [];
    policyTree = [];
    return;
  }

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb.rpc("csvb_company_policy_list_nodes", {
    p_book_key: "main_policy"
  });

  if (error) {
    throw new Error("Could not load Company Policy chapters: " + error.message);
  }

  policyNodes = (data || []).map(normalizeNode);
  policyTree = buildTree(policyNodes);

  const activeIds = new Set(policyNodes.map((node) => node.id));
  collapsedNodeIds = new Set([...collapsedNodeIds].filter((id) => activeIds.has(id)));
  saveCollapsedState();

  const flat = flattenTree(policyTree);

  if (selectedNodeId && !policyNodes.some((node) => node.id === selectedNodeId)) {
    selectedNodeId = "";
  }

  if (!selectedNodeId && flat.length) {
    selectedNodeId = flat[0].id;
  }

  expandAncestors(selectedNodeId);
}

async function loadPublishedContent(nodeId) {
  if (!nodeId) return null;

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb.rpc("csvb_company_policy_get_published_content", {
    p_node_id: nodeId
  });

  if (error) {
    throw new Error("Could not load published policy text: " + error.message);
  }

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function loadEditorState(nodeId) {
  if (!isStructureAdmin() || !nodeId) {
    currentEditorState = null;
    return null;
  }

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb.rpc("csvb_company_policy_get_editor_state", {
    p_node_id: nodeId
  });

  if (error) {
    throw new Error("Could not load editor state: " + error.message);
  }

  currentEditorState = Array.isArray(data) && data.length ? data[0] : null;
  return currentEditorState;
}

async function loadVersionHistory(nodeId) {
  if (!isStructureAdmin() || !nodeId) {
    versionHistory = [];
    renderVersionHistory();
    return;
  }

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb.rpc("csvb_company_policy_list_versions", {
    p_node_id: nodeId
  });

  if (error) {
    throw new Error("Could not load version history: " + error.message);
  }

  versionHistory = data || [];
  renderVersionHistory();
}

function renderNodeButton(node) {
  const active = node.id === selectedNodeId ? " active" : "";
  const depth = getNodeDepth(node);
  const visualDepth = Math.min(depth, 8);
  const leftPadding = 8 + visualDepth * 46;
  const hasChildren = nodeHasChildren(node);
  const collapsed = hasChildren && isNodeCollapsed(node.id);
  const childMark = hasChildren ? (collapsed ? "▸" : "▾") : (depth > 0 ? "↳" : "•");

  return `
    <button
      class="chapter-btn${active}"
      type="button"
      data-node-id="${escapeHtml(node.id)}"
      data-depth="${escapeHtml(visualDepth)}"
      data-collapsed="${collapsed ? "true" : "false"}"
      title="${escapeHtml(nodeLabel(node))}"
      style="padding-left:${leftPadding}px;"
    >
      <span class="tree-mark">${escapeHtml(childMark)}</span>
      <span class="chapter-code">${escapeHtml(nodeTypeLabel(node.node_type))} ${escapeHtml(node.node_code)}</span>
      <span class="node-title">${escapeHtml(node.title)}</span>
    </button>
  `;
}

function renderNodeBranch(nodes) {
  return nodes.map((node) => {
    const own = renderNodeButton(node);
    const showChildren = node.children?.length && !isNodeCollapsed(node.id);
    const children = showChildren ? renderNodeBranch(node.children) : "";
    return own + children;
  }).join("");
}

function renderChapterList() {
  const list = document.getElementById("chapterList");
  if (!list) return;

  if (!policyTree.length) {
    list.innerHTML = `
      <div class="content-box">
        No Company Policy chapters were found.
      </div>
    `;
    return;
  }

  list.innerHTML = renderNodeBranch(policyTree);

  list.querySelectorAll("[data-node-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleTreeNodeClick(btn.getAttribute("data-node-id"));
    });
  });
}

async function handleTreeNodeClick(nodeId) {
  const node = findNode(nodeId);
  if (!node) return;

  if (nodeHasChildren(node)) {
    toggleNodeCollapsed(node.id);
  }

  selectedNodeId = node.id;
  renderChapterList();
  await renderSelectedNode();
  refreshAdminUi();
}

async function selectNode(nodeId) {
  const node = findNode(nodeId);
  if (!node) return;

  expandAncestors(node.id);
  selectedNodeId = node.id;
  renderChapterList();
  await renderSelectedNode();
  refreshAdminUi();
}

function setContentStatus(text) {
  const pill = document.getElementById("contentStatusPill");
  if (!pill) return;
  pill.textContent = text || "";
}

function renderPublishedContent(version) {
  const contentEl = document.getElementById("chapterContent");
  const node = findNode(selectedNodeId);

  if (!contentEl) return;

  if (!node) {
    contentEl.textContent = "Select a policy item from the left side.";
    setContentStatus("No item selected");
    return;
  }

  if (!version) {
    contentEl.innerHTML = `
      <div>
        <strong>${escapeHtml(nodeLabel(node))}</strong>
      </div>
      <br />
      <div>
        No published policy text has been inserted for this item yet.
      </div>
    `;
    setContentStatus("No published text");
    return;
  }

  if (version.content_html) {
    contentEl.innerHTML = version.content_html;
  } else if (version.content_text) {
    contentEl.innerHTML = escapeHtml(version.content_text).replaceAll("\n", "<br />");
  } else {
    contentEl.innerHTML = "Published version exists, but no content is stored.";
  }

  setContentStatus(`Published v${version.version_no}`);
}

function refreshEditorVisibility() {
  const denied = document.getElementById("editorDeniedBox");
  const tools = document.getElementById("editorTools");

  if (!denied || !tools) return;

  if (isStructureAdmin()) {
    denied.classList.add("hidden");
    tools.classList.remove("hidden");
  } else {
    tools.classList.add("hidden");
    denied.classList.remove("hidden");
  }
}

function renderEditorState() {
  refreshEditorVisibility();

  const box = document.getElementById("editorStateBox");
  const editor = document.getElementById("policyEditor");
  const summary = document.getElementById("policyChangeSummary");
  const editBtn = document.getElementById("editDraftBtn");

  if (editBtn) {
    editBtn.disabled = !isStructureAdmin();
  }

  if (!isStructureAdmin()) return;

  const node = findNode(selectedNodeId);

  if (!node) {
    if (box) box.textContent = "No policy item selected.";
    if (editor) editor.innerHTML = "";
    if (summary) summary.value = "";
    return;
  }

  const state = currentEditorState;
  const status = state?.work_version_status || "none";
  const workVersionId = state?.work_version_id || "";
  const workVersionNo = state?.work_version_no || "";
  const publishedVersionNo = state?.published_version_no || "";

  if (box) {
    box.innerHTML = `
      <strong>Selected item:</strong> ${escapeHtml(nodeLabel(node))}<br />
      <strong>Work version:</strong> ${workVersionId ? `v${escapeHtml(workVersionNo)} / ${escapeHtml(status)}` : "none"}<br />
      <strong>Published version:</strong> ${publishedVersionNo ? `v${escapeHtml(publishedVersionNo)}` : "none"}
    `;
  }

  if (editor) {
    if (state?.work_content_html) {
      editor.innerHTML = state.work_content_html;
    } else if (state?.published_content_html) {
      editor.innerHTML = state.published_content_html;
    } else {
      editor.innerHTML = "";
    }
  }

  if (summary) {
    summary.value = state?.work_change_summary || "";
  }

  updateWorkflowButtons();
}

function updateWorkflowButtons() {
  const state = currentEditorState;
  const status = state?.work_version_status || "";
  const hasWork = !!state?.work_version_id;

  const submitBtn = document.getElementById("submitDraftBtn");
  const approveBtn = document.getElementById("approveVersionBtn");
  const publishBtn = document.getElementById("publishVersionBtn");
  const rejectBtn = document.getElementById("rejectVersionBtn");
  const discardBtn = document.getElementById("discardWorkVersionBtn");

  if (submitBtn) submitBtn.disabled = !(hasWork && status === "draft");
  if (approveBtn) approveBtn.disabled = !(hasWork && status === "pending_approval");
  if (publishBtn) publishBtn.disabled = !(hasWork && status === "approved");
  if (rejectBtn) rejectBtn.disabled = !(hasWork && ["draft", "pending_approval", "approved"].includes(status));
  if (discardBtn) discardBtn.disabled = !(hasWork && ["draft", "pending_approval", "approved"].includes(status));
}

function renderVersionHistory() {
  const box = document.getElementById("versionHistoryBox");
  if (!box) return;

  if (!isStructureAdmin()) {
    box.innerHTML = `
      <div class="content-box">
        Version history is restricted to Super Admin.
      </div>
    `;
    return;
  }

  if (!versionHistory.length) {
    box.innerHTML = `
      <div class="content-box">
        No version history exists for this policy item.
      </div>
    `;
    return;
  }

  box.innerHTML = versionHistory.map((v) => `
    <div class="version-item">
      <div class="version-title">
        Version ${escapeHtml(v.version_no)} — ${escapeHtml(v.version_status)}${v.is_current ? " — current" : ""}
      </div>
      <div class="version-meta">
        ${v.change_summary ? `<div><strong>Summary:</strong> ${escapeHtml(v.change_summary)}</div>` : ""}
        <div>Created: ${escapeHtml(v.created_at || "")}</div>
        ${v.submitted_at ? `<div>Submitted: ${escapeHtml(v.submitted_at)}</div>` : ""}
        ${v.approved_at ? `<div>Approved: ${escapeHtml(v.approved_at)}</div>` : ""}
        ${v.published_at ? `<div>Published: ${escapeHtml(v.published_at)}</div>` : ""}
        ${v.rejected_at ? `<div>Rejected: ${escapeHtml(v.rejected_at)}</div>` : ""}
        ${v.rejection_reason ? `<div>Reason: ${escapeHtml(v.rejection_reason)}</div>` : ""}
      </div>
    </div>
  `).join("");
}

async function renderSelectedNode() {
  const node = findNode(selectedNodeId);

  const titleEl = document.getElementById("chapterTitle");
  const metaEl = document.getElementById("chapterMeta");

  if (!node) {
    if (titleEl) titleEl.textContent = "Select a policy item";
    if (metaEl) metaEl.textContent = "No policy item selected.";
    renderPublishedContent(null);
    renderEditorState();
    renderVersionHistory();
    return;
  }

  if (titleEl) {
    titleEl.textContent = nodeLabel(node);
  }

  if (metaEl) {
    const depth = getNodeDepth(node);
    const typeLabel = nodeTypeLabel(node.node_type);
    const childrenInfo = nodeHasChildren(node)
      ? ` Children: ${node.children.length}. Click the item in the tree to expand/collapse.`
      : "";
    metaEl.textContent = `Database-backed policy item. Type: ${typeLabel}. Level: ${depth}.${childrenInfo}`;
  }

  try {
    currentPublishedVersion = await loadPublishedContent(node.id);
    renderPublishedContent(currentPublishedVersion);

    if (isStructureAdmin()) {
      await loadEditorState(node.id);
      renderEditorState();
      await loadVersionHistory(node.id);
    } else {
      currentEditorState = null;
      versionHistory = [];
      renderEditorState();
      renderVersionHistory();
    }
  } catch (error) {
    showWarn(String(error?.message || error));
  }
}

function setupTabs() {
  const tabButtons = document.querySelectorAll("[data-tab]");
  const panels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `tab-${target}`);
      });

      if (target === "adminSetup") {
        refreshAdminUi();
      }
    });
  });
}

function setupContentTabs() {
  const buttons = document.querySelectorAll("[data-content-tab]");
  const panels = document.querySelectorAll(".content-panel");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-content-tab");
      activeContentTab = target;

      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      panels.forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== `contentTab-${target}`);
      });
    });
  });
}

function switchContentTab(target) {
  const btn = document.querySelector(`[data-content-tab="${target}"]`);
  if (btn) btn.click();
}

function runSearch() {
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");

  if (!input || !results) return;

  const query = String(input.value || "").trim().toLowerCase();

  if (!query) {
    results.innerHTML = `
      <div class="content-box">
        Type a chapter number or title to search the Policy Book structure.
      </div>
    `;
    return;
  }

  const flat = flattenTree(policyTree);
  const matches = flat.filter((node) => {
    const haystack = `${node.node_code} ${node.title} ${node.node_type}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!matches.length) {
    results.innerHTML = `
      <div class="content-box">
        No matching policy item found for: <strong>${escapeHtml(query)}</strong>
      </div>
    `;
    return;
  }

  results.innerHTML = matches.map((node) => `
    <div class="result-item" data-result-id="${escapeHtml(node.id)}">
      <div class="result-title">${escapeHtml(nodeLabel(node))}</div>
      <div class="result-text">
        Type: ${escapeHtml(nodeTypeLabel(node.node_type))}.
        Click to open this item in the Policy Book tab.
      </div>
    </div>
  `).join("");

  results.querySelectorAll("[data-result-id]").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.getAttribute("data-result-id");
      await selectNode(id);

      const tabBtn = document.querySelector('[data-tab="policyBook"]');
      if (tabBtn) tabBtn.click();
    });
  });
}

function setupSearch() {
  const searchBtn = document.getElementById("searchBtn");
  const clearBtn = document.getElementById("clearSearchBtn");
  const input = document.getElementById("searchInput");

  if (searchBtn) searchBtn.addEventListener("click", runSearch);

  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runSearch();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (input) input.value = "";
      runSearch();
    });
  }

  runSearch();
}

function setupPlaceholderButtons() {
  const changeBtn = document.getElementById("submitChangeRequestBtn");
  const editBtn = document.getElementById("editDraftBtn");

  if (changeBtn) {
    changeBtn.addEventListener("click", () => {
      const node = findNode(selectedNodeId);
      const label = node ? nodeLabel(node) : "the selected policy item";
      showOk(`Change request workflow will be added later for ${label}.`);
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      switchContentTab("draft");
    });
  }
}

function refreshAdminVisibility() {
  const denied = document.getElementById("adminDeniedBox");
  const tools = document.getElementById("adminTools");

  if (!denied || !tools) return;

  if (isStructureAdmin()) {
    denied.classList.add("hidden");
    tools.classList.remove("hidden");
  } else {
    tools.classList.add("hidden");
    denied.classList.remove("hidden");
  }
}

function fillAdminSelects() {
  fillNodeSelect(document.getElementById("createParentNode"), {
    includeTopLevel: true,
    selectedValue: selectedNodeId || "",
    topLabel: "Top level item"
  });

  fillNodeSelect(document.getElementById("moveParentNode"), {
    includeTopLevel: true,
    excludeNodeId: selectedNodeId || "",
    selectedValue: findNode(selectedNodeId)?.parent_node_id || "",
    topLabel: "Top level item"
  });
}

function fillEditFields() {
  const node = findNode(selectedNodeId);

  const box = document.getElementById("selectedAdminBox");
  const type = document.getElementById("editNodeType");
  const code = document.getElementById("editNodeCode");
  const title = document.getElementById("editNodeTitle");
  const sortOrder = document.getElementById("editSortOrder");
  const isContent = document.getElementById("editIsContentNode");

  if (!node) {
    if (box) box.innerHTML = "No policy item selected.";
    if (type) type.value = "chapter";
    if (code) code.value = "";
    if (title) title.value = "";
    if (sortOrder) sortOrder.value = "";
    if (isContent) isContent.checked = true;
    return;
  }

  if (box) {
    box.innerHTML = `
      <strong>Selected:</strong><br />
      ${escapeHtml(nodeLabel(node))}<br />
      <span style="color:#4d6283;">Level ${getNodeDepth(node)} • Sort ${escapeHtml(node.sort_order)}</span>
    `;
  }

  if (type) type.value = node.node_type || "heading";
  if (code) code.value = node.node_code || "";
  if (title) title.value = node.title || "";
  if (sortOrder) sortOrder.value = String(node.sort_order ?? "");
  if (isContent) isContent.checked = node.is_content_node !== false;
}

function refreshAdminUi() {
  refreshAdminVisibility();

  if (!isStructureAdmin()) return;

  fillAdminSelects();
  fillEditFields();
}

function clearCreateForm() {
  const fields = [
    "createNodeCode",
    "createNodeTitle",
    "createSortOrder"
  ];

  fields.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const type = document.getElementById("createNodeType");
  if (type) type.value = "section";

  const parent = document.getElementById("createParentNode");
  if (parent) parent.value = selectedNodeId || "";

  const isContent = document.getElementById("createIsContentNode");
  if (isContent) isContent.checked = true;
}

async function reloadPolicyTree(preferredNodeId = "") {
  await loadPolicyNodesFromSupabase();

  if (preferredNodeId && policyNodes.some((node) => node.id === preferredNodeId)) {
    selectedNodeId = preferredNodeId;
    expandAncestors(preferredNodeId);
  }

  renderChapterList();
  await renderSelectedNode();
  runSearch();
  refreshAdminUi();
}

async function createPolicyNode() {
  if (!isStructureAdmin()) {
    showWarn("Access denied. Structure administration requires Super Admin rights.");
    return;
  }

  const parentId = document.getElementById("createParentNode")?.value || null;
  const nodeType = document.getElementById("createNodeType")?.value || "section";
  const nodeCode = String(document.getElementById("createNodeCode")?.value || "").trim();
  const title = String(document.getElementById("createNodeTitle")?.value || "").trim();
  const sortOrder = parseSortOrder(document.getElementById("createSortOrder")?.value);
  const isContentNode = document.getElementById("createIsContentNode")?.checked !== false;

  if (!nodeCode) {
    showWarn("Code is required.");
    return;
  }

  if (!title) {
    showWarn("Title is required.");
    return;
  }

  if (parentId) {
    expandNode(parentId);
  }

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb.rpc("csvb_company_policy_create_node", {
    p_book_key: "main_policy",
    p_parent_node_id: parentId,
    p_node_type: nodeType,
    p_node_code: nodeCode,
    p_title: title,
    p_sort_order: sortOrder,
    p_is_content_node: isContentNode
  });

  if (error) {
    throw new Error("Create failed: " + error.message);
  }

  const created = Array.isArray(data) ? data[0] : data;
  const createdId = created?.id || "";

  selectedNodeId = createdId || selectedNodeId;
  clearCreateForm();
  await reloadPolicyTree(createdId);

  showOk("Policy item created.");
}

async function saveSelectedNode() {
  if (!isStructureAdmin()) {
    showWarn("Access denied. Structure administration requires Super Admin rights.");
    return;
  }

  const node = findNode(selectedNodeId);
  if (!node) {
    showWarn("Select a policy item first.");
    return;
  }

  const nodeType = document.getElementById("editNodeType")?.value || node.node_type;
  const nodeCode = String(document.getElementById("editNodeCode")?.value || "").trim();
  const title = String(document.getElementById("editNodeTitle")?.value || "").trim();
  const sortOrder = parseSortOrder(document.getElementById("editSortOrder")?.value);
  const isContentNode = document.getElementById("editIsContentNode")?.checked !== false;

  if (!nodeCode) {
    showWarn("Code is required.");
    return;
  }

  if (!title) {
    showWarn("Title is required.");
    return;
  }

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_update_node", {
    p_node_id: node.id,
    p_node_type: nodeType,
    p_node_code: nodeCode,
    p_title: title,
    p_sort_order: sortOrder,
    p_is_content_node: isContentNode
  });

  if (error) {
    throw new Error("Save failed: " + error.message);
  }

  await reloadPolicyTree(node.id);
  showOk("Policy item saved.");
}

async function moveSelectedNode() {
  if (!isStructureAdmin()) {
    showWarn("Access denied. Structure administration requires Super Admin rights.");
    return;
  }

  const node = findNode(selectedNodeId);
  if (!node) {
    showWarn("Select a policy item first.");
    return;
  }

  const newParentId = document.getElementById("moveParentNode")?.value || null;
  const newSortOrder = parseSortOrder(document.getElementById("moveSortOrder")?.value);

  if (newParentId) {
    expandNode(newParentId);
  }

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_move_node", {
    p_node_id: node.id,
    p_new_parent_node_id: newParentId,
    p_new_sort_order: newSortOrder
  });

  if (error) {
    throw new Error("Move failed: " + error.message);
  }

  const moveSort = document.getElementById("moveSortOrder");
  if (moveSort) moveSort.value = "";

  await reloadPolicyTree(node.id);
  showOk("Policy item moved.");
}

async function archiveSelectedNode() {
  if (!isStructureAdmin()) {
    showWarn("Access denied. Structure administration requires Super Admin rights.");
    return;
  }

  const node = findNode(selectedNodeId);
  if (!node) {
    showWarn("Select a policy item first.");
    return;
  }

  const archiveChildren = document.getElementById("archiveChildren")?.checked !== false;
  const reason = String(document.getElementById("archiveReason")?.value || "").trim();

  const confirmed = window.confirm(
    `Archive this policy item?\n\n${nodeLabel(node)}\n\nThis is not a physical delete.`
  );

  if (!confirmed) return;

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_archive_node", {
    p_node_id: node.id,
    p_archive_children: archiveChildren,
    p_reason: reason || null
  });

  if (error) {
    throw new Error("Archive failed: " + error.message);
  }

  const reasonEl = document.getElementById("archiveReason");
  if (reasonEl) reasonEl.value = "";

  collapsedNodeIds.delete(node.id);
  saveCollapsedState();

  selectedNodeId = "";
  await reloadPolicyTree();
  await loadArchivedNodes();

  showOk("Policy item archived.");
}

async function loadArchivedNodes() {
  if (!isStructureAdmin()) return;

  const list = document.getElementById("archivedNodesList");
  if (list) {
    list.innerHTML = "Loading archived items...";
  }

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb.rpc("csvb_company_policy_list_archived_nodes", {
    p_book_key: "main_policy"
  });

  if (error) {
    throw new Error("Could not load archived items: " + error.message);
  }

  archivedNodes = (data || []).map(normalizeNode);
  renderArchivedNodes();
}

function renderArchivedNodes() {
  const list = document.getElementById("archivedNodesList");
  if (!list) return;

  if (!archivedNodes.length) {
    list.innerHTML = `
      <div class="content-box" style="min-height:0;">
        No archived policy items found.
      </div>
    `;
    return;
  }

  list.innerHTML = archivedNodes.map((node) => `
    <div class="archived-item">
      <div>
        <div class="archived-title">${escapeHtml(nodeLabel(node))}</div>
        <div class="archived-meta">Level ${escapeHtml(node.depth)} • Updated ${escapeHtml(node.updated_at || "")}</div>
      </div>
      <button class="btn2" type="button" data-restore-id="${escapeHtml(node.id)}">Restore</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-restore-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await restoreArchivedNode(btn.getAttribute("data-restore-id"));
    });
  });
}

async function restoreArchivedNode(nodeId) {
  if (!isStructureAdmin()) {
    showWarn("Access denied. Structure administration requires Super Admin rights.");
    return;
  }

  const restoreChildren = document.getElementById("restoreChildren")?.checked === true;
  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_restore_node", {
    p_node_id: nodeId,
    p_restore_children: restoreChildren
  });

  if (error) {
    throw new Error("Restore failed: " + error.message);
  }

  selectedNodeId = nodeId;
  await reloadPolicyTree(nodeId);
  await loadArchivedNodes();

  showOk("Policy item restored.");
}

function editorHtml() {
  const editor = document.getElementById("policyEditor");
  return editor ? editor.innerHTML : "";
}

function editorText() {
  const editor = document.getElementById("policyEditor");
  return editor ? editor.innerText : "";
}

async function saveDraft() {
  if (!isStructureAdmin()) {
    showWarn("Access denied. Draft editing requires Super Admin rights.");
    return;
  }

  const node = findNode(selectedNodeId);
  if (!node) {
    showWarn("Select a policy item first.");
    return;
  }

  const summary = String(document.getElementById("policyChangeSummary")?.value || "").trim();
  const html = editorHtml();
  const text = editorText();

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_save_draft", {
    p_node_id: node.id,
    p_content_html: html,
    p_content_text: text,
    p_change_summary: summary || null
  });

  if (error) {
    throw new Error("Save draft failed: " + error.message);
  }

  await loadEditorState(node.id);
  renderEditorState();
  await loadVersionHistory(node.id);

  showOk("Draft saved.");
}

async function submitDraft() {
  const state = currentEditorState;
  if (!state?.work_version_id) {
    showWarn("No work version exists. Save a draft first.");
    return;
  }

  const note = String(document.getElementById("policyChangeSummary")?.value || "").trim();
  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_submit_draft", {
    p_version_id: state.work_version_id,
    p_submission_note: note || null
  });

  if (error) {
    throw new Error("Submit failed: " + error.message);
  }

  await loadEditorState(selectedNodeId);
  renderEditorState();
  await loadVersionHistory(selectedNodeId);

  showOk("Draft submitted for approval.");
}

async function approveVersion() {
  const state = currentEditorState;
  if (!state?.work_version_id) {
    showWarn("No work version selected.");
    return;
  }

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_approve_version", {
    p_version_id: state.work_version_id,
    p_approval_note: "Approved from Company Policy editor."
  });

  if (error) {
    throw new Error("Approve failed: " + error.message);
  }

  await loadEditorState(selectedNodeId);
  renderEditorState();
  await loadVersionHistory(selectedNodeId);

  showOk("Version approved.");
}

async function publishVersion() {
  const state = currentEditorState;
  if (!state?.work_version_id) {
    showWarn("No approved version selected.");
    return;
  }

  const confirmed = window.confirm("Publish this approved policy version? This will become the current published policy text.");
  if (!confirmed) return;

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_publish_version", {
    p_version_id: state.work_version_id,
    p_effective_from: new Date().toISOString().slice(0, 10)
  });

  if (error) {
    throw new Error("Publish failed: " + error.message);
  }

  await renderSelectedNode();
  switchContentTab("published");

  showOk("Policy version published.");
}

async function rejectVersion() {
  const state = currentEditorState;
  if (!state?.work_version_id) {
    showWarn("No work version selected.");
    return;
  }

  const reason = window.prompt("Enter rejection reason:");
  if (!reason || !reason.trim()) return;

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_reject_version", {
    p_version_id: state.work_version_id,
    p_rejection_reason: reason.trim()
  });

  if (error) {
    throw new Error("Reject failed: " + error.message);
  }

  await loadEditorState(selectedNodeId);
  renderEditorState();
  await loadVersionHistory(selectedNodeId);

  showOk("Version rejected.");
}

async function discardWorkVersion() {
  const state = currentEditorState;
  if (!state?.work_version_id) {
    showWarn("No work version selected.");
    return;
  }

  const confirmed = window.confirm("Discard/archive the current work version? This will not delete the published text.");
  if (!confirmed) return;

  const sb = AUTH.ensureSupabase();

  const { error } = await sb.rpc("csvb_company_policy_discard_work_version", {
    p_version_id: state.work_version_id,
    p_reason: "Discarded from Company Policy editor."
  });

  if (error) {
    throw new Error("Discard failed: " + error.message);
  }

  await loadEditorState(selectedNodeId);
  renderEditorState();
  await loadVersionHistory(selectedNodeId);

  showOk("Work version discarded.");
}

function setupEditorToolbar() {
  document.querySelectorAll("[data-editor-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.getAttribute("data-editor-cmd");
      document.execCommand(cmd, false, null);
      document.getElementById("policyEditor")?.focus();
    });
  });

  document.querySelectorAll("[data-editor-block]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const block = btn.getAttribute("data-editor-block");
      document.execCommand("formatBlock", false, block);
      document.getElementById("policyEditor")?.focus();
    });
  });

  const linkBtn = document.getElementById("insertLinkBtn");
  if (linkBtn) {
    linkBtn.addEventListener("click", () => {
      const url = window.prompt("Enter link URL:");
      if (!url) return;
      document.execCommand("createLink", false, url);
      document.getElementById("policyEditor")?.focus();
    });
  }
}

function setupContentEditorControls() {
  const saveBtn = document.getElementById("saveDraftBtn");
  const submitBtn = document.getElementById("submitDraftBtn");
  const approveBtn = document.getElementById("approveVersionBtn");
  const publishBtn = document.getElementById("publishVersionBtn");
  const rejectBtn = document.getElementById("rejectVersionBtn");
  const discardBtn = document.getElementById("discardWorkVersionBtn");
  const reloadBtn = document.getElementById("reloadEditorBtn");

  const guarded = (fn) => async () => {
    try {
      showWarn("");
      await fn();
    } catch (error) {
      showWarn(String(error?.message || error));
    }
  };

  if (saveBtn) saveBtn.addEventListener("click", guarded(saveDraft));
  if (submitBtn) submitBtn.addEventListener("click", guarded(submitDraft));
  if (approveBtn) approveBtn.addEventListener("click", guarded(approveVersion));
  if (publishBtn) publishBtn.addEventListener("click", guarded(publishVersion));
  if (rejectBtn) rejectBtn.addEventListener("click", guarded(rejectVersion));
  if (discardBtn) discardBtn.addEventListener("click", guarded(discardWorkVersion));

  if (reloadBtn) {
    reloadBtn.addEventListener("click", guarded(async () => {
      await renderSelectedNode();
      showOk("Editor reloaded.");
    }));
  }
}

function setupAdminControls() {
  const createBtn = document.getElementById("createNodeBtn");
  const useSelectedBtn = document.getElementById("createChildOfSelectedBtn");
  const clearCreateBtn = document.getElementById("clearCreateBtn");
  const saveBtn = document.getElementById("saveNodeBtn");
  const reloadBtn = document.getElementById("reloadPolicyBtn");
  const moveBtn = document.getElementById("moveNodeBtn");
  const archiveBtn = document.getElementById("archiveNodeBtn");
  const refreshArchivedBtn = document.getElementById("refreshArchivedBtn");

  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      try {
        showWarn("");
        await createPolicyNode();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
  }

  if (useSelectedBtn) {
    useSelectedBtn.addEventListener("click", () => {
      const parent = document.getElementById("createParentNode");
      if (parent) parent.value = selectedNodeId || "";
    });
  }

  if (clearCreateBtn) {
    clearCreateBtn.addEventListener("click", clearCreateForm);
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        showWarn("");
        await saveSelectedNode();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
  }

  if (reloadBtn) {
    reloadBtn.addEventListener("click", async () => {
      try {
        showWarn("");
        await reloadPolicyTree(selectedNodeId);
        showOk("Policy tree reloaded.");
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
  }

  if (moveBtn) {
    moveBtn.addEventListener("click", async () => {
      try {
        showWarn("");
        await moveSelectedNode();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
  }

  if (archiveBtn) {
    archiveBtn.addEventListener("click", async () => {
      try {
        showWarn("");
        await archiveSelectedNode();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
  }

  if (refreshArchivedBtn) {
    refreshArchivedBtn.addEventListener("click", async () => {
      try {
        showWarn("");
        await loadArchivedNodes();
        showOk("Archived list refreshed.");
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
  }
}

async function init() {
  try {
    showWarn("");
    loadCollapsedState();
    injectTreeVisualStyles();

    await setupAuth();

    setupTabs();
    setupContentTabs();
    setupSearch();
    setupPlaceholderButtons();
    setupAdminControls();
    setupEditorToolbar();
    setupContentEditorControls();

    if (!authBundle?.session?.user) {
      renderChapterList();
      await renderSelectedNode();
      refreshAdminUi();
      return;
    }

    await loadPolicyNodesFromSupabase();
    renderChapterList();
    await renderSelectedNode();
    runSearch();
    refreshAdminUi();

    if (isStructureAdmin()) {
      await loadArchivedNodes();
    }
  } catch (error) {
    showWarn(String(error?.message || error));
  }
}

document.addEventListener("DOMContentLoaded", init);