// public/company_policy_documents.js
// C.S.V. BEACON – Company Policy Manuals / Documents UI
// CP-5B: folder tree, upload/register documents, list/search/open/archive documents.

(() => {
  "use strict";

  const STATE = {
    folders: [],
    folderTree: [],
    documents: [],
    selectedFolderId: "",
    isAdmin: false,
    mode: "folder",
  };

  const BUCKET = "company-policy-documents";

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

  function sb() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }

    return window.AUTH.ensureSupabase();
  }

  async function ensureContext() {
    if (window.AUTH?.getSessionUserProfile) {
      try {
        await window.AUTH.getSessionUserProfile();
      } catch (_) {}
    }
  }

  function roleIsAdmin() {
    const role =
      window.CSVB_CONTEXT?.profile?.role ||
      window.CSVB_CONTEXT?.role ||
      "";

    return role === "super_admin" || role === "platform_owner";
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-docs-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-docs-styles";
    style.textContent = `
      .docs-layout {
        display: grid;
        grid-template-columns: minmax(320px, 430px) minmax(420px, 1fr);
        gap: 10px;
        align-items: start;
      }

      .docs-card {
        border: 1px solid #dbe6f6;
        background: #fff;
        border-radius: 12px;
        padding: 11px;
        box-sizing: border-box;
      }

      .docs-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .docs-note {
        color: #4d6283;
        font-weight: 400;
        line-height: 1.35;
        font-size: .9rem;
        margin-bottom: 10px;
      }

      .docs-folder-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 360px;
        overflow: auto;
        padding-right: 4px;
      }

      .docs-folder-btn {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        color: #173a68;
        border-radius: 9px;
        padding: 7px 9px;
        text-align: left;
        cursor: pointer;
        font-weight: 600;
        font-size: .88rem;
        line-height: 1.25;
        white-space: nowrap;
      }

      .docs-folder-btn:hover {
        background: #eef6ff;
      }

      .docs-folder-btn.active {
        border-color: #2f78c4;
        background: #dbeeff;
        box-shadow: inset 0 0 0 1px #2f78c4;
      }

      .docs-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 8px;
      }

      .docs-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin-top: 8px;
      }

      .docs-selected {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 9px 10px;
        color: #213a5f;
        font-size: .9rem;
        line-height: 1.35;
        margin-bottom: 10px;
      }

      .docs-selected strong {
        color: #1a4170;
        font-weight: 700;
      }

      .docs-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 560px;
        overflow: auto;
      }

      .docs-item {
        border: 1px solid #dbe6f6;
        background: #f7fbff;
        border-radius: 12px;
        padding: 10px;
      }

      .docs-item-title {
        color: #1a4170;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .docs-item-meta {
        color: #4d6283;
        font-size: .87rem;
        line-height: 1.35;
      }

      .docs-pill {
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

      .docs-danger-box {
        border: 1px solid #f0c2c2;
        background: #fff7f7;
        border-radius: 12px;
        padding: 10px;
      }

      @media (max-width: 980px) {
        .docs-layout {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function folderTypeLabel(value) {
    const labels = {
      company_manuals: "Company Manuals",
      vessel_manuals: "Vessel Manuals",
      maker_manuals: "Maker Manuals",
      forms: "Forms",
      circulars: "Circulars",
      certificates: "Certificates",
      plans: "Plans",
      other: "Other",
    };

    return labels[value] || value || "Other";
  }

  function documentTypeLabel(value) {
    const labels = {
      manual: "Manual",
      maker_manual: "Maker Manual",
      company_manual: "Company Manual",
      vessel_manual: "Vessel Manual",
      form: "Form",
      circular: "Circular",
      certificate: "Certificate",
      plan: "Plan",
      procedure: "Procedure",
      other: "Other",
    };

    return labels[value] || value || "Other";
  }

  function safeFileName(name) {
    return String(name || "file")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 160);
  }

  function parseTags(value) {
    return String(value || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function dateOrNull(value) {
    const text = String(value || "").trim();
    return text || null;
  }

  function buildFolderTree(folders) {
    const byId = new Map();
    const roots = [];

    folders.forEach((folder) => {
      folder.children = [];
      byId.set(folder.id, folder);
    });

    folders.forEach((folder) => {
      if (folder.parent_folder_id && byId.has(folder.parent_folder_id)) {
        byId.get(folder.parent_folder_id).children.push(folder);
      } else {
        roots.push(folder);
      }
    });

    function sortBranch(branch) {
      branch.sort((a, b) => {
        const s = Number(a.sort_order || 0) - Number(b.sort_order || 0);
        if (s !== 0) return s;
        return String(a.folder_name || "").localeCompare(String(b.folder_name || ""));
      });

      branch.forEach((folder) => sortBranch(folder.children));
    }

    sortBranch(roots);
    return roots;
  }

  function flattenFolders(branch, out = []) {
    branch.forEach((folder) => {
      out.push(folder);
      if (folder.children?.length) flattenFolders(folder.children, out);
    });
    return out;
  }

  function folderDepth(folder) {
    let depth = 0;
    let current = folder;

    while (current?.parent_folder_id) {
      const parent = STATE.folders.find((f) => f.id === current.parent_folder_id);
      if (!parent) break;
      depth += 1;
      current = parent;
    }

    return depth;
  }

  function findFolder(id) {
    return STATE.folders.find((folder) => folder.id === id) || null;
  }

  function selectedFolder() {
    return findFolder(STATE.selectedFolderId);
  }

  function renderShell() {
    const panel = document.querySelector("#tab-manuals .panel");
    if (!panel) return;

    panel.innerHTML = `
      <div class="panel-title">Manuals / Documents Repository</div>

      <div class="docs-layout">
        <div class="docs-card">
          <div class="docs-title">Folders</div>
          <div class="docs-note">
            Create folders and subfolders for company manuals, vessel manuals, maker manuals, forms, circulars, plans and other documents.
          </div>

          <div id="docsFolderList" class="docs-folder-list">
            Loading folders...
          </div>

          <div style="height:10px;"></div>

          <div id="docsAdminFolderTools">
            <div class="docs-title">Create folder</div>

            <div class="field">
              <label>Parent folder</label>
              <select id="docsParentFolder"></select>
            </div>

            <div class="docs-grid">
              <div class="field">
                <label>Folder type</label>
                <select id="docsFolderType">
                  <option value="company_manuals">Company Manuals</option>
                  <option value="vessel_manuals">Vessel Manuals</option>
                  <option value="maker_manuals">Maker Manuals</option>
                  <option value="forms">Forms</option>
                  <option value="circulars">Circulars</option>
                  <option value="certificates">Certificates</option>
                  <option value="plans">Plans</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div class="field">
                <label>Sort order</label>
                <input id="docsFolderSort" type="number" step="0.01" placeholder="Auto if blank" />
              </div>
            </div>

            <div class="field">
              <label>Folder name</label>
              <input id="docsFolderName" placeholder="New folder name" />
            </div>

            <div class="field">
              <label>Description</label>
              <textarea id="docsFolderDescription" placeholder="Optional folder description"></textarea>
            </div>

            <div class="docs-actions">
              <button class="btn" id="docsCreateFolderBtn" type="button">Create folder</button>
              <button class="btn2" id="docsUseSelectedFolderBtn" type="button">Use selected as parent</button>
              <button class="btn2" id="docsRefreshFoldersBtn" type="button">Refresh folders</button>
            </div>
          </div>
        </div>

        <div class="docs-card">
          <div class="row" style="justify-content:space-between;align-items:flex-end;">
            <div>
              <div class="docs-title">Documents</div>
              <div id="docsSelectedFolderBox" class="docs-selected">
                <strong>Selected folder:</strong><br />
                No folder selected.
              </div>
            </div>

            <div class="row">
              <input id="docsSearchInput" style="min-width:240px;" placeholder="Search documents..." />
              <button class="btn2" id="docsSearchBtn" type="button">Search</button>
              <button class="btn2" id="docsClearSearchBtn" type="button">Clear</button>
              <button class="btn2" id="docsRefreshDocsBtn" type="button">Refresh</button>
            </div>
          </div>

          <div id="docsAdminUploadTools" class="docs-card" style="margin:10px 0;">
            <div class="docs-title">Upload / register document</div>

            <div class="docs-grid">
              <div class="field">
                <label>Document type</label>
                <select id="docsDocumentType">
                  <option value="manual">Manual</option>
                  <option value="maker_manual">Maker Manual</option>
                  <option value="company_manual">Company Manual</option>
                  <option value="vessel_manual">Vessel Manual</option>
                  <option value="form">Form</option>
                  <option value="circular">Circular</option>
                  <option value="certificate">Certificate</option>
                  <option value="plan">Plan</option>
                  <option value="procedure">Procedure</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div class="field">
                <label>Revision no.</label>
                <input id="docsRevisionNo" placeholder="e.g. Rev. 1" />
              </div>

              <div class="field">
                <label>Effective date</label>
                <input id="docsEffectiveDate" type="date" />
              </div>

              <div class="field">
                <label>Review due date</label>
                <input id="docsReviewDueDate" type="date" />
              </div>

              <div class="field">
                <label>Expiry date</label>
                <input id="docsExpiryDate" type="date" />
              </div>
            </div>

            <div class="field">
              <label>Document title</label>
              <input id="docsDocumentTitle" placeholder="Document title" />
            </div>

            <div class="field">
              <label>File</label>
              <input id="docsFileInput" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp" />
            </div>

            <div class="field">
              <label>Tags</label>
              <input id="docsTags" placeholder="Comma-separated tags, e.g. ODME, maker, manual" />
            </div>

            <div class="field">
              <label>Description</label>
              <textarea id="docsDescription" placeholder="Optional document description"></textarea>
            </div>

            <div class="docs-actions">
              <button class="btn" id="docsUploadBtn" type="button">Upload document</button>
              <button class="btn2" id="docsClearUploadBtn" type="button">Clear upload form</button>
            </div>
          </div>

          <div id="docsList" class="docs-list">
            Loading documents...
          </div>
        </div>
      </div>
    `;
  }

  function renderAdminVisibility() {
    const folderTools = document.getElementById("docsAdminFolderTools");
    const uploadTools = document.getElementById("docsAdminUploadTools");

    if (folderTools) folderTools.style.display = STATE.isAdmin ? "block" : "none";
    if (uploadTools) uploadTools.style.display = STATE.isAdmin ? "block" : "none";
  }

  async function loadFolders() {
    const { data, error } = await sb().rpc("csvb_company_policy_list_document_folders", {
      p_include_archived: false,
    });

    if (error) {
      throw new Error("Could not load document folders: " + error.message);
    }

    STATE.folders = data || [];
    STATE.folderTree = buildFolderTree(STATE.folders);

    if (!STATE.selectedFolderId && STATE.folders.length) {
      const first = flattenFolders(STATE.folderTree)[0];
      STATE.selectedFolderId = first?.id || "";
    }

    if (STATE.selectedFolderId && !STATE.folders.some((f) => f.id === STATE.selectedFolderId)) {
      STATE.selectedFolderId = STATE.folders[0]?.id || "";
    }

    renderFolders();
    fillFolderSelects();
    renderSelectedFolderBox();
  }

  function renderFolders() {
    const box = document.getElementById("docsFolderList");
    if (!box) return;

    if (!STATE.folders.length) {
      box.innerHTML = `
        <div class="content-box" style="min-height:0;">
          No document folders found.
        </div>
      `;
      return;
    }

    const branchHtml = (branch) => branch.map((folder) => {
      const active = folder.id === STATE.selectedFolderId ? " active" : "";
      const depth = folderDepth(folder);
      const pad = 8 + Math.min(depth, 8) * 32;

      return `
        <button
          class="docs-folder-btn${active}"
          type="button"
          data-folder-id="${escapeHtml(folder.id)}"
          style="padding-left:${pad}px;"
          title="${escapeHtml(folder.folder_name)}"
        >
          ${depth > 0 ? "↳ " : "• "}
          ${escapeHtml(folder.folder_name)}
        </button>
        ${folder.children?.length ? branchHtml(folder.children) : ""}
      `;
    }).join("");

    box.innerHTML = branchHtml(STATE.folderTree);

    box.querySelectorAll("[data-folder-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        STATE.selectedFolderId = btn.getAttribute("data-folder-id") || "";
        renderFolders();
        fillFolderSelects();
        renderSelectedFolderBox();
        await loadDocumentsForFolder();
      });
    });
  }

  function fillFolderSelects() {
    const parent = document.getElementById("docsParentFolder");
    if (!parent) return;

    const flat = flattenFolders(STATE.folderTree);
    const options = [`<option value="">Top level</option>`];

    flat.forEach((folder) => {
      const depth = folderDepth(folder);
      const prefix = "— ".repeat(depth);
      options.push(`
        <option value="${escapeHtml(folder.id)}">
          ${escapeHtml(prefix + folder.folder_name)}
        </option>
      `);
    });

    parent.innerHTML = options.join("");
    parent.value = STATE.selectedFolderId || "";
  }

  function renderSelectedFolderBox() {
    const box = document.getElementById("docsSelectedFolderBox");
    if (!box) return;

    const folder = selectedFolder();

    if (!folder) {
      box.innerHTML = `
        <strong>Selected folder:</strong><br />
        No folder selected.
      `;
      return;
    }

    box.innerHTML = `
      <strong>Selected folder:</strong><br />
      ${escapeHtml(folder.folder_name)}
      <div style="color:#4d6283;margin-top:3px;">
        Type: ${escapeHtml(folderTypeLabel(folder.folder_type))}
        ${folder.company_name ? " • Company: " + escapeHtml(folder.company_name) : ""}
        ${folder.vessel_name ? " • Vessel: " + escapeHtml(folder.vessel_name) : ""}
      </div>
    `;
  }

  async function createFolder() {
    if (!STATE.isAdmin) {
      showWarn("Folder creation is restricted to Super Admin.");
      return;
    }

    const folderName = String(document.getElementById("docsFolderName")?.value || "").trim();
    const folderType = document.getElementById("docsFolderType")?.value || "other";
    const parentId = document.getElementById("docsParentFolder")?.value || null;
    const description = String(document.getElementById("docsFolderDescription")?.value || "").trim();
    const sortText = String(document.getElementById("docsFolderSort")?.value || "").trim();
    const sortOrder = sortText ? Number(sortText) : null;

    if (!folderName) {
      showWarn("Folder name is required.");
      return;
    }

    if (sortText && !Number.isFinite(sortOrder)) {
      showWarn("Sort order must be a valid number.");
      return;
    }

    const { data, error } = await sb().rpc("csvb_company_policy_create_document_folder", {
      p_parent_folder_id: parentId,
      p_folder_name: folderName,
      p_folder_type: folderType,
      p_company_id: null,
      p_vessel_id: null,
      p_description: description || null,
      p_sort_order: sortOrder,
      p_book_key: "main_policy",
    });

    if (error) {
      throw new Error("Could not create folder: " + error.message);
    }

    const created = Array.isArray(data) ? data[0] : data;
    STATE.selectedFolderId = created?.id || STATE.selectedFolderId;

    clearFolderForm();
    await loadFolders();
    await loadDocumentsForFolder();

    showOk("Folder created.");
  }

  function clearFolderForm() {
    ["docsFolderName", "docsFolderDescription", "docsFolderSort"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const type = document.getElementById("docsFolderType");
    if (type) type.value = "other";
  }

  function clearUploadForm() {
    [
      "docsDocumentTitle",
      "docsRevisionNo",
      "docsEffectiveDate",
      "docsReviewDueDate",
      "docsExpiryDate",
      "docsTags",
      "docsDescription",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const file = document.getElementById("docsFileInput");
    if (file) file.value = "";

    const type = document.getElementById("docsDocumentType");
    if (type) type.value = "manual";
  }

  async function loadDocumentsForFolder() {
    STATE.mode = "folder";

    const box = document.getElementById("docsList");
    if (box) box.innerHTML = "Loading documents...";

    if (!STATE.selectedFolderId) {
      STATE.documents = [];
      renderDocuments();
      return;
    }

    const { data, error } = await sb().rpc("csvb_company_policy_list_documents", {
      p_folder_id: STATE.selectedFolderId,
      p_include_archived: false,
    });

    if (error) {
      throw new Error("Could not load documents: " + error.message);
    }

    STATE.documents = data || [];
    renderDocuments();
  }

  async function searchDocuments() {
    STATE.mode = "search";

    const query = String(document.getElementById("docsSearchInput")?.value || "").trim();

    const { data, error } = await sb().rpc("csvb_company_policy_search_documents", {
      p_query: query,
      p_include_archived: false,
    });

    if (error) {
      throw new Error("Could not search documents: " + error.message);
    }

    STATE.documents = data || [];
    renderDocuments();
  }

  function renderDocuments() {
    const box = document.getElementById("docsList");
    if (!box) return;

    if (!STATE.documents.length) {
      box.innerHTML = `
        <div class="content-box" style="min-height:0;">
          No documents found.
        </div>
      `;
      return;
    }

    box.innerHTML = STATE.documents.map((doc) => `
      <div class="docs-item">
        <div class="docs-item-title">${escapeHtml(doc.document_title || "")}</div>
        <div class="docs-item-meta">
          <span class="docs-pill">${escapeHtml(documentTypeLabel(doc.document_type))}</span>
          ${doc.revision_no ? `<span class="docs-pill">${escapeHtml(doc.revision_no)}</span>` : ""}
          <div>File: ${escapeHtml(doc.original_file_name || "")}</div>
          <div>Folder: ${escapeHtml(doc.folder_name || "")}</div>
          <div>Uploaded by: ${escapeHtml(doc.uploaded_by_username || "")} • ${escapeHtml(doc.uploaded_at || "")}</div>
          ${doc.effective_date ? `<div>Effective: ${escapeHtml(doc.effective_date)}</div>` : ""}
          ${doc.review_due_date ? `<div>Review due: ${escapeHtml(doc.review_due_date)}</div>` : ""}
          ${doc.expiry_date ? `<div>Expiry: ${escapeHtml(doc.expiry_date)}</div>` : ""}
          ${doc.tags?.length ? `<div>Tags: ${escapeHtml(doc.tags.join(", "))}</div>` : ""}
          ${doc.description ? `<div>Description: ${escapeHtml(doc.description)}</div>` : ""}
        </div>
        <div class="docs-actions">
          <button class="btn2" type="button" data-open-doc="${escapeHtml(doc.id)}">Open / download</button>
          ${STATE.isAdmin ? `<button class="btnDanger" type="button" data-archive-doc="${escapeHtml(doc.id)}">Archive</button>` : ""}
        </div>
      </div>
    `).join("");

    box.querySelectorAll("[data-open-doc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await guardedInline(() => openDocument(btn.getAttribute("data-open-doc")));
      });
    });

    box.querySelectorAll("[data-archive-doc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await guardedInline(() => archiveDocument(btn.getAttribute("data-archive-doc")));
      });
    });
  }

  async function uploadDocument() {
    if (!STATE.isAdmin) {
      showWarn("Document upload is restricted to Super Admin.");
      return;
    }

    const folder = selectedFolder();
    if (!folder) {
      showWarn("Select a folder first.");
      return;
    }

    const fileInput = document.getElementById("docsFileInput");
    const file = fileInput?.files?.[0];

    if (!file) {
      showWarn("Select a file first.");
      return;
    }

    const title = String(document.getElementById("docsDocumentTitle")?.value || "").trim() || file.name;
    const docType = document.getElementById("docsDocumentType")?.value || "other";
    const revisionNo = String(document.getElementById("docsRevisionNo")?.value || "").trim();
    const effectiveDate = dateOrNull(document.getElementById("docsEffectiveDate")?.value);
    const reviewDueDate = dateOrNull(document.getElementById("docsReviewDueDate")?.value);
    const expiryDate = dateOrNull(document.getElementById("docsExpiryDate")?.value);
    const tags = parseTags(document.getElementById("docsTags")?.value);
    const description = String(document.getElementById("docsDescription")?.value || "").trim();

    const randomPart = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `folders/${folder.id}/${randomPart}/${safeFileName(file.name)}`;

    const uploadResult = await sb().storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadResult.error) {
      throw new Error("File upload failed: " + uploadResult.error.message);
    }

    const { error } = await sb().rpc("csvb_company_policy_register_document", {
      p_folder_id: folder.id,
      p_document_title: title,
      p_original_file_name: file.name,
      p_storage_path: path,
      p_mime_type: file.type || null,
      p_size_bytes: file.size,
      p_document_type: docType,
      p_revision_no: revisionNo || null,
      p_effective_date: effectiveDate,
      p_review_due_date: reviewDueDate,
      p_expiry_date: expiryDate,
      p_tags: tags,
      p_description: description || null,
      p_storage_bucket: BUCKET,
    });

    if (error) {
      throw new Error("Document metadata registration failed: " + error.message);
    }

    clearUploadForm();
    await loadDocumentsForFolder();

    showOk("Document uploaded and registered.");
  }

  async function openDocument(documentId) {
    const doc = STATE.documents.find((d) => d.id === documentId);
    if (!doc) {
      showWarn("Document not found in current list.");
      return;
    }

    const { data, error } = await sb().storage
      .from(doc.storage_bucket || BUCKET)
      .createSignedUrl(doc.storage_path, 600);

    if (error) {
      throw new Error("Could not create download link: " + error.message);
    }

    if (!data?.signedUrl) {
      throw new Error("No signed URL returned.");
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function archiveDocument(documentId) {
    if (!STATE.isAdmin) {
      showWarn("Archive is restricted to Super Admin.");
      return;
    }

    const doc = STATE.documents.find((d) => d.id === documentId);
    const label = doc?.document_title || "this document";

    const confirmed = window.confirm(`Archive ${label}? This is not a physical delete.`);
    if (!confirmed) return;

    const reason = window.prompt("Reason for archive:", "Archived from Company Policy Documents UI.") || null;

    const { error } = await sb().rpc("csvb_company_policy_archive_document", {
      p_document_id: documentId,
      p_reason: reason,
    });

    if (error) {
      throw new Error("Could not archive document: " + error.message);
    }

    if (STATE.mode === "search") {
      await searchDocuments();
    } else {
      await loadDocumentsForFolder();
    }

    showOk("Document archived.");
  }

  async function guardedInline(fn) {
    try {
      showWarn("");
      await fn();
    } catch (error) {
      showWarn(String(error?.message || error));
    }
  }

  function wireUi() {
    const createFolderBtn = document.getElementById("docsCreateFolderBtn");
    const useSelectedBtn = document.getElementById("docsUseSelectedFolderBtn");
    const refreshFoldersBtn = document.getElementById("docsRefreshFoldersBtn");
    const uploadBtn = document.getElementById("docsUploadBtn");
    const clearUploadBtn = document.getElementById("docsClearUploadBtn");
    const refreshDocsBtn = document.getElementById("docsRefreshDocsBtn");
    const searchBtn = document.getElementById("docsSearchBtn");
    const clearSearchBtn = document.getElementById("docsClearSearchBtn");

    if (createFolderBtn) createFolderBtn.addEventListener("click", () => guardedInline(createFolder));

    if (useSelectedBtn) {
      useSelectedBtn.addEventListener("click", () => {
        const parent = document.getElementById("docsParentFolder");
        if (parent) parent.value = STATE.selectedFolderId || "";
      });
    }

    if (refreshFoldersBtn) {
      refreshFoldersBtn.addEventListener("click", async () => {
        await guardedInline(async () => {
          await loadFolders();
          await loadDocumentsForFolder();
          showOk("Folders refreshed.");
        });
      });
    }

    if (uploadBtn) uploadBtn.addEventListener("click", () => guardedInline(uploadDocument));
    if (clearUploadBtn) clearUploadBtn.addEventListener("click", clearUploadForm);
    if (refreshDocsBtn) refreshDocsBtn.addEventListener("click", () => guardedInline(loadDocumentsForFolder));
    if (searchBtn) searchBtn.addEventListener("click", () => guardedInline(searchDocuments));

    const searchInput = document.getElementById("docsSearchInput");
    if (searchInput) {
      searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") guardedInline(searchDocuments);
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener("click", async () => {
        if (searchInput) searchInput.value = "";
        await guardedInline(loadDocumentsForFolder);
      });
    }
  }

  async function init() {
    try {
      await ensureContext();

      injectStyles();
      renderShell();

      STATE.isAdmin = roleIsAdmin();
      renderAdminVisibility();

      wireUi();

      await loadFolders();
      await loadDocumentsForFolder();
    } catch (error) {
      showWarn(String(error?.message || error));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }

  window.CSVB_POLICY_DOCUMENTS = {
    refreshFolders: loadFolders,
    refreshDocuments: loadDocumentsForFolder,
  };
})();