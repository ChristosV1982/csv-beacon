// public/company_policy.js
// C.S.V. BEACON – Company Policy module
// CP-2C-3: Database-backed policy tree with clearer visual hierarchy.

let policyNodes = [];
let policyTree = [];
let archivedNodes = [];
let selectedNodeId = "";
let authBundle = null;

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
    }, 2000);
  }
}

function injectTreeVisualStyles() {
  if (document.getElementById("csvb-policy-tree-visual-styles")) return;

  const style = document.createElement("style");
  style.id = "csvb-policy-tree-visual-styles";
  style.textContent = `
    #chapterList .chapter-btn {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
      min-height: 22px !important;
    }

    #chapterList .chapter-btn[data-depth="0"] {
      background: #f7fbff !important;
      border-left: 1px solid #dbe6f6 !important;
    }

    #chapterList .chapter-btn[data-depth="1"] {
      background: #eef7ff !important;
      border-left: 4px solid #2f78c4 !important;
    }

    #chapterList .chapter-btn[data-depth="2"] {
      background: #f5fbff !important;
      border-left: 4px solid #58a6da !important;
    }

    #chapterList .chapter-btn[data-depth="3"] {
      background: #fbfdff !important;
      border-left: 4px solid #8dbdea !important;
    }

    #chapterList .chapter-btn[data-depth="4"],
    #chapterList .chapter-btn[data-depth="5"],
    #chapterList .chapter-btn[data-depth="6"],
    #chapterList .chapter-btn[data-depth="7"],
    #chapterList .chapter-btn[data-depth="8"] {
      background: #ffffff !important;
      border-left: 4px solid #b9d7f2 !important;
    }

    #chapterList .chapter-btn.active {
      background: #dbeeff !important;
      border-color: #2f78c4 !important;
      box-shadow: inset 0 0 0 1px #2f78c4 !important;
    }

    #chapterList .tree-mark {
      width: 16px !important;
      min-width: 16px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: #4d6283 !important;
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
    #chapterList .chapter-btn[data-depth="3"] .chapter-code {
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

  const flat = flattenTree(policyTree);

  if (selectedNodeId && !policyNodes.some((node) => node.id === selectedNodeId)) {
    selectedNodeId = "";
  }

  if (!selectedNodeId && flat.length) {
    selectedNodeId = flat[0].id;
  }
}

async function loadCurrentPublishedVersion(nodeId) {
  if (!nodeId) return null;

  const sb = AUTH.ensureSupabase();

  const { data, error } = await sb
    .from("company_policy_node_versions")
    .select("id, version_no, version_label, version_status, is_current, content_html, content_text, published_at, effective_from")
    .eq("node_id", nodeId)
    .eq("version_status", "published")
    .eq("is_current", true)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load published policy text: " + error.message);
  }

  return data || null;
}

function renderNodeButton(node) {
  const active = node.id === selectedNodeId ? " active" : "";
  const depth = getNodeDepth(node);
  const visualDepth = Math.min(depth, 8);
  const leftPadding = 8 + visualDepth * 34;
  const childMark = node.children?.length ? "▾" : (depth > 0 ? "↳" : "•");

  return `
    <button
      class="chapter-btn${active}"
      type="button"
      data-node-id="${escapeHtml(node.id)}"
      data-depth="${escapeHtml(visualDepth)}"
      style="padding-left:${leftPadding}px;"
      title="${escapeHtml(nodeLabel(node))}"
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
    const children = node.children?.length ? renderNodeBranch(node.children) : "";
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
      selectNode(btn.getAttribute("data-node-id"));
    });
  });
}

async function selectNode(nodeId) {
  const node = findNode(nodeId);
  if (!node) return;

  selectedNodeId = node.id;
  renderChapterList();
  await renderSelectedNode();
  refreshAdminUi();
}

async function renderSelectedNode() {
  const node = findNode(selectedNodeId);

  const titleEl = document.getElementById("chapterTitle");
  const metaEl = document.getElementById("chapterMeta");
  const contentEl = document.getElementById("chapterContent");

  if (!node) {
    if (titleEl) titleEl.textContent = "Select a policy item";
    if (metaEl) metaEl.textContent = "No policy item selected.";
    if (contentEl) contentEl.textContent = "Select a policy item from the left side.";
    return;
  }

  if (titleEl) {
    titleEl.textContent = nodeLabel(node);
  }

  if (metaEl) {
    const depth = getNodeDepth(node);
    const typeLabel = nodeTypeLabel(node.node_type);
    metaEl.textContent = `Database-backed policy item. Type: ${typeLabel}. Level: ${depth}.`;
  }

  if (contentEl) {
    contentEl.innerHTML = `
      <div>
        <strong>${escapeHtml(nodeLabel(node))}</strong>
      </div>
      <br />
      <div>
        Loading published policy text...
      </div>
    `;
  }

  try {
    const version = await loadCurrentPublishedVersion(node.id);

    if (!contentEl) return;

    if (version?.content_html) {
      contentEl.innerHTML = version.content_html;
      return;
    }

    if (version?.content_text) {
      contentEl.innerHTML = `
        <div>
          <strong>${escapeHtml(nodeLabel(node))}</strong>
        </div>
        <br />
        <div>${escapeHtml(version.content_text).replaceAll("\n", "<br />")}</div>
      `;
      return;
    }

    contentEl.innerHTML = `
      <div>
        <strong>${escapeHtml(nodeLabel(node))}</strong>
      </div>
      <br />
      <div>
        No published policy text has been inserted for this item yet.
      </div>
      <br />
      <div>
        The structure is loaded from Supabase. Later, this area will show approved rich-text policy content, including sections, images, tables, revision control, exact search, AI source-based search, and change requests.
      </div>
    `;
  } catch (error) {
    if (contentEl) {
      contentEl.innerHTML = `
        <div>
          <strong>${escapeHtml(nodeLabel(node))}</strong>
        </div>
        <br />
        <div>
          The policy item was loaded, but the published text could not be checked.
        </div>
        <br />
        <div>${escapeHtml(String(error?.message || error))}</div>
      `;
    }
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
      showOk("Draft editing will be added after the editor/versioning phase.");
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
    injectTreeVisualStyles();

    await setupAuth();
    setupTabs();
    setupSearch();
    setupPlaceholderButtons();
    setupAdminControls();

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