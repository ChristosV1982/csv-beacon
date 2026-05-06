// public/company_policy.js
// C.S.V. BEACON – Company Policy module
// CP-2B: Load Policy Book chapter/node structure from Supabase.
// Supports unlimited hierarchy through parent_node_id.

let policyNodes = [];
let policyTree = [];
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
    }, 1800);
  }
}

function nodeLabel(node) {
  if (!node) return "";
  const code = node.node_code ? `Chapter ${node.node_code}` : "Policy node";
  return `${code} - ${node.title || ""}`;
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

  if (!selectedNodeId && policyNodes.length) {
    selectedNodeId = flattenTree(policyTree)[0]?.id || "";
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
  const indent = Math.min(depth, 8) * 18;
  const childMark = node.children?.length ? "▸" : "•";

  return `
    <button
      class="chapter-btn${active}"
      type="button"
      data-node-id="${escapeHtml(node.id)}"
      style="padding-left:${8 + indent}px;"
      title="${escapeHtml(nodeLabel(node))}"
    >
      <span class="tree-mark">${escapeHtml(childMark)}</span>
      <span class="chapter-code">Chapter ${escapeHtml(node.node_code)}</span>
      ${escapeHtml(node.title)}
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
}

async function renderSelectedNode() {
  const node = findNode(selectedNodeId);

  const titleEl = document.getElementById("chapterTitle");
  const metaEl = document.getElementById("chapterMeta");
  const contentEl = document.getElementById("chapterContent");

  if (!node) {
    if (titleEl) titleEl.textContent = "Select a chapter";
    if (metaEl) metaEl.textContent = "No chapter selected.";
    if (contentEl) contentEl.textContent = "Select a chapter from the left side.";
    return;
  }

  if (titleEl) {
    titleEl.textContent = nodeLabel(node);
  }

  if (metaEl) {
    const depth = getNodeDepth(node);
    const typeLabel = String(node.node_type || "heading").replaceAll("_", " ");
    metaEl.textContent = `Database-backed policy node. Type: ${typeLabel}. Level: ${depth}.`;
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
        The structure is now loaded from Supabase. Later, this area will show the approved rich-text policy content, including sections, images, tables, revision control, exact search, AI source-based search, and change requests.
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
          The chapter was loaded, but the published text could not be checked.
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
        Type: ${escapeHtml(String(node.node_type || "heading").replaceAll("_", " "))}.
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

async function init() {
  try {
    showWarn("");

    await setupAuth();
    setupTabs();
    setupSearch();
    setupPlaceholderButtons();

    if (!authBundle?.session?.user) {
      renderChapterList();
      await renderSelectedNode();
      return;
    }

    await loadPolicyNodesFromSupabase();
    renderChapterList();
    await renderSelectedNode();
    runSearch();
  } catch (error) {
    showWarn(String(error?.message || error));
  }
}

document.addEventListener("DOMContentLoaded", init);