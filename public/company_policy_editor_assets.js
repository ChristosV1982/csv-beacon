// public/company_policy_editor_assets.js
// C.S.V. BEACON – Company Policy advanced editor assets
// CP-10C: image insertion/properties modal instead of browser prompts.

(() => {
  "use strict";

  const BUILD = "CP10C-2026-05-07";
  const BUCKET = "company-policy-assets";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const SIGNED_URL_SECONDS = 60 * 60 * 24;

  let savedRange = null;
  let activeFigure = null;
  let fileInput = null;
  let previewObjectUrl = "";

  const MODAL_ID = "policyAssetModal";

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
    if (!el) {
      alert(message);
      return;
    }
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

  function editorEl() {
    return document.getElementById("policyEditor");
  }

  function selectedNodeId() {
    const active = document.querySelector("#chapterList .chapter-btn.active");
    return active?.getAttribute("data-node-id") || "";
  }

  function safeFileName(name) {
    return String(name || "image")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 150);
  }

  function uniqueId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeChoice(value, allowed, fallback) {
    const v = String(value || "").trim().toLowerCase();
    return allowed.includes(v) ? v : fallback;
  }

  function saveSelection() {
    const editor = editorEl();
    const sel = window.getSelection();

    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedRange = range.cloneRange();
    }
  }

  function restoreSelection() {
    const editor = editorEl();
    if (!editor) return;

    editor.focus();

    if (!savedRange) return;

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  async function getImageDimensions(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const out = {
          width: img.naturalWidth || null,
          height: img.naturalHeight || null,
        };
        URL.revokeObjectURL(url);
        resolve(out);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: null, height: null });
      };

      img.src = url;
    });
  }

  async function signedUrl(bucket, path) {
    const { data, error } = await sb()
      .storage
      .from(bucket || BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);

    if (error) {
      throw new Error("Could not create image signed URL: " + error.message);
    }

    if (!data?.signedUrl) {
      throw new Error("No signed URL returned for image.");
    }

    return data.signedUrl;
  }

  async function refreshPolicyAssetImages(root = document) {
    const imgs = Array.from(root.querySelectorAll("img[data-policy-asset-path]"));

    for (const img of imgs) {
      const path = img.getAttribute("data-policy-asset-path") || "";
      const bucket = img.getAttribute("data-policy-asset-bucket") || BUCKET;

      if (!path) continue;

      const now = Date.now();
      const signedAt = Number(img.getAttribute("data-policy-signed-at") || 0);

      if (img.src && signedAt && now - signedAt < 20 * 60 * 1000) {
        continue;
      }

      try {
        const url = await signedUrl(bucket, path);
        img.src = url;
        img.setAttribute("data-policy-signed-at", String(now));
      } catch (error) {
        console.warn("Policy asset image refresh failed:", error);
      }
    }
  }

  function figureHtml(asset, url) {
    const caption = asset.caption || "";
    const alt = asset.alt_text || asset.original_file_name || "";
    const size = normalizeChoice(asset.display_size, ["small", "medium", "large", "full"], "medium");
    const alignment = normalizeChoice(asset.alignment, ["left", "center", "right", "full"], "center");

    return `
      <figure
        class="policy-figure policy-size-${escapeHtml(size)} policy-align-${escapeHtml(alignment)}"
        data-policy-asset-id="${escapeHtml(asset.id)}"
        data-policy-asset-bucket="${escapeHtml(asset.storage_bucket || BUCKET)}"
        data-policy-asset-path="${escapeHtml(asset.storage_path)}"
        data-policy-display-size="${escapeHtml(size)}"
        data-policy-alignment="${escapeHtml(alignment)}"
        contenteditable="false"
      >
        <img
          src="${escapeHtml(url)}"
          alt="${escapeHtml(alt)}"
          data-policy-asset-id="${escapeHtml(asset.id)}"
          data-policy-asset-bucket="${escapeHtml(asset.storage_bucket || BUCKET)}"
          data-policy-asset-path="${escapeHtml(asset.storage_path)}"
          data-policy-signed-at="${Date.now()}"
        />
        <figcaption>${escapeHtml(caption)}</figcaption>
      </figure>
      <p><br></p>
    `;
  }

  function insertHtmlAtCursor(html) {
    const editor = editorEl();
    if (!editor) throw new Error("Policy editor not found.");

    restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      editor.insertAdjacentHTML("beforeend", html);
      return;
    }

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const template = document.createElement("template");
    template.innerHTML = html.trim();

    const fragment = template.content;
    const lastNode = fragment.lastChild;

    range.insertNode(fragment);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  async function uploadImage(file, options) {
    const nodeId = selectedNodeId();

    if (!nodeId) {
      throw new Error("Select a policy item before inserting an image.");
    }

    if (!file) {
      throw new Error("No image selected.");
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      throw new Error("Unsupported image type. Allowed: PNG, JPEG, WEBP.");
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Image is larger than 5 MB.");
    }

    const dims = await getImageDimensions(file);
    const path = `nodes/${nodeId}/${uniqueId()}/${safeFileName(file.name)}`;

    const upload = await sb()
      .storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (upload.error) {
      throw new Error("Image upload failed: " + upload.error.message);
    }

    const rpc = await sb().rpc("csvb_company_policy_register_asset", {
      p_node_id: nodeId,
      p_storage_path: path,
      p_original_file_name: file.name,
      p_mime_type: file.type,
      p_size_bytes: file.size,
      p_width_px: dims.width,
      p_height_px: dims.height,
      p_alt_text: options.altText || file.name,
      p_caption: options.caption || null,
      p_display_size: options.displaySize || "medium",
      p_alignment: options.alignment || "center",
      p_storage_bucket: BUCKET,
    });

    if (rpc.error) {
      throw new Error("Image metadata registration failed: " + rpc.error.message);
    }

    const asset = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;

    if (!asset?.storage_path) {
      throw new Error("Image was uploaded, but asset metadata was not returned.");
    }

    const url = await signedUrl(asset.storage_bucket || BUCKET, asset.storage_path);

    return { asset, url };
  }

  function clearActiveFigure() {
    if (activeFigure) {
      activeFigure.classList.remove("policy-figure-active");
    }
    activeFigure = null;
  }

  function setActiveFigure(figure) {
    clearActiveFigure();

    if (!figure) return;

    activeFigure = figure;
    activeFigure.classList.add("policy-figure-active");
  }

  function applyFigureSizeToElement(figure, size) {
    if (!figure) return;

    ["small", "medium", "large", "full"].forEach((x) => {
      figure.classList.remove(`policy-size-${x}`);
    });

    figure.classList.add(`policy-size-${size}`);
    figure.setAttribute("data-policy-display-size", size);
  }

  function applyFigureAlignmentToElement(figure, alignment) {
    if (!figure) return;

    ["left", "center", "right", "full"].forEach((x) => {
      figure.classList.remove(`policy-align-${x}`);
    });

    figure.classList.add(`policy-align-${alignment}`);
    figure.setAttribute("data-policy-alignment", alignment);
  }

  function applyFigureSize(size) {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    applyFigureSizeToElement(activeFigure, size);
  }

  function applyFigureAlignment(alignment) {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    applyFigureAlignmentToElement(activeFigure, alignment);
  }

  function removeSelectedImage() {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    const confirmed = window.confirm("Remove this image from the editor?");
    if (!confirmed) return;

    const fig = activeFigure;
    clearActiveFigure();
    fig.remove();
  }

  function modalEl() {
    return document.getElementById(MODAL_ID);
  }

  function modalMode() {
    return modalEl()?.getAttribute("data-mode") || "insert";
  }

  function cleanupPreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = "";
    }
  }

  function modalValues() {
    return {
      caption: document.getElementById("policyAssetCaption")?.value || "",
      altText: document.getElementById("policyAssetAltText")?.value || "",
      displaySize: document.getElementById("policyAssetSize")?.value || "medium",
      alignment: document.getElementById("policyAssetAlignment")?.value || "center",
    };
  }

  function closeModal() {
    const modal = modalEl();
    if (!modal) return;

    modal.classList.add("hidden");
    modal.setAttribute("data-mode", "insert");

    const file = document.getElementById("policyAssetFile");
    if (file) file.value = "";

    const preview = document.getElementById("policyAssetPreview");
    if (preview) preview.innerHTML = "";

    cleanupPreview();
  }

  function openInsertModal() {
    saveSelection();

    const modal = modalEl();
    if (!modal) return;

    modal.setAttribute("data-mode", "insert");

    document.getElementById("policyAssetModalTitle").textContent = "Insert Image";
    document.getElementById("policyAssetFileWrap").style.display = "";
    document.getElementById("policyAssetInsertBtn").style.display = "";
    document.getElementById("policyAssetApplyBtn").style.display = "none";
    document.getElementById("policyAssetRemoveBtn").style.display = "none";

    document.getElementById("policyAssetCaption").value = "";
    document.getElementById("policyAssetAltText").value = "";
    document.getElementById("policyAssetSize").value = "medium";
    document.getElementById("policyAssetAlignment").value = "center";

    const file = document.getElementById("policyAssetFile");
    if (file) file.value = "";

    const preview = document.getElementById("policyAssetPreview");
    if (preview) preview.innerHTML = "No image selected.";

    cleanupPreview();

    modal.classList.remove("hidden");
  }

  function openPropertiesModal() {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    const modal = modalEl();
    if (!modal) return;

    const img = activeFigure.querySelector("img");
    const caption = activeFigure.querySelector("figcaption");

    modal.setAttribute("data-mode", "properties");

    document.getElementById("policyAssetModalTitle").textContent = "Image Properties";
    document.getElementById("policyAssetFileWrap").style.display = "none";
    document.getElementById("policyAssetInsertBtn").style.display = "none";
    document.getElementById("policyAssetApplyBtn").style.display = "";
    document.getElementById("policyAssetRemoveBtn").style.display = "";

    document.getElementById("policyAssetCaption").value = caption?.textContent || "";
    document.getElementById("policyAssetAltText").value = img?.getAttribute("alt") || "";
    document.getElementById("policyAssetSize").value =
      activeFigure.getAttribute("data-policy-display-size") || "medium";
    document.getElementById("policyAssetAlignment").value =
      activeFigure.getAttribute("data-policy-alignment") || "center";

    const preview = document.getElementById("policyAssetPreview");
    if (preview) {
      preview.innerHTML = img?.src
        ? `<img src="${escapeHtml(img.src)}" alt="" />`
        : "No preview available.";
    }

    modal.classList.remove("hidden");
  }

  function renderPreviewFromFile(file) {
    const preview = document.getElementById("policyAssetPreview");
    if (!preview) return;

    cleanupPreview();

    if (!file) {
      preview.innerHTML = "No image selected.";
      return;
    }

    previewObjectUrl = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${escapeHtml(previewObjectUrl)}" alt="" />`;
  }

  async function insertFromModal() {
    const file = document.getElementById("policyAssetFile")?.files?.[0];

    if (!file) {
      throw new Error("Select an image file first.");
    }

    const values = modalValues();

    showOk("Uploading policy image...");

    const { asset, url } = await uploadImage(file, values);

    insertHtmlAtCursor(figureHtml(asset, url));
    closeModal();

    showOk("Image inserted into the policy editor.");
  }

  async function applyPropertiesFromModal() {
    if (!activeFigure) {
      throw new Error("No policy image selected.");
    }

    const values = modalValues();

    const img = activeFigure.querySelector("img");
    let caption = activeFigure.querySelector("figcaption");

    if (!caption) {
      caption = document.createElement("figcaption");
      activeFigure.appendChild(caption);
    }

    caption.textContent = values.caption || "";
    if (img) img.setAttribute("alt", values.altText || "");

    applyFigureSizeToElement(activeFigure, values.displaySize);
    applyFigureAlignmentToElement(activeFigure, values.alignment);

    const assetId = activeFigure.getAttribute("data-policy-asset-id") || "";

    if (assetId) {
      const { error } = await sb().rpc("csvb_company_policy_update_asset_metadata", {
        p_asset_id: assetId,
        p_alt_text: values.altText || null,
        p_caption: values.caption || null,
        p_display_size: values.displaySize,
        p_alignment: values.alignment,
      });

      if (error) {
        throw new Error("Image properties were updated in the editor, but metadata update failed: " + error.message);
      }
    }

    closeModal();
    showOk("Image properties updated.");
  }

  function injectStyles() {
    if (document.getElementById("csvb-policy-editor-assets-styles")) return;

    const style = document.createElement("style");
    style.id = "csvb-policy-editor-assets-styles";
    style.textContent = `
      .policy-figure {
        border: 1px solid #cbd8ea;
        background: #f7fbff;
        border-radius: 12px;
        padding: 8px;
        margin: 12px auto;
        box-sizing: border-box;
      }

      .policy-figure img {
        display: block;
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        margin: 0 auto;
      }

      .policy-figure figcaption {
        margin-top: 6px;
        color: #4d6283;
        font-size: .88rem;
        text-align: center;
        font-style: italic;
      }

      .policy-figure-active {
        outline: 3px solid #2f78c4;
        outline-offset: 2px;
      }

      .policy-size-small { max-width: 300px; }
      .policy-size-medium { max-width: 540px; }
      .policy-size-large { max-width: 760px; }
      .policy-size-full { max-width: 100%; }

      .policy-align-left {
        margin-left: 0;
        margin-right: auto;
      }

      .policy-align-center {
        margin-left: auto;
        margin-right: auto;
      }

      .policy-align-right {
        margin-left: auto;
        margin-right: 0;
      }

      .policy-align-full {
        margin-left: 0;
        margin-right: 0;
        max-width: 100%;
      }

      .policy-editor-asset-separator {
        width: 1px;
        height: 26px;
        background: #cbd8ea;
        margin: 0 2px;
      }

      .policy-asset-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(3, 27, 63, .38);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
      }

      .policy-asset-modal.hidden {
        display: none;
      }

      .policy-asset-dialog {
        width: min(780px, 96vw);
        max-height: 92vh;
        overflow: auto;
        background: #ffffff;
        border: 1px solid #cbd8ea;
        border-radius: 16px;
        box-shadow: 0 22px 60px rgba(3, 27, 63, .28);
      }

      .policy-asset-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid #dbe6f6;
        background: #f7fbff;
      }

      .policy-asset-title {
        color: #1a4170;
        font-weight: 700;
        font-size: 1rem;
      }

      .policy-asset-body {
        padding: 14px;
      }

      .policy-asset-grid {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(220px, 1fr);
        gap: 12px;
      }

      .policy-asset-preview {
        border: 1px dashed #b9c8df;
        border-radius: 12px;
        min-height: 170px;
        background: #f9fbfe;
        color: #4d6283;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px;
        text-align: center;
      }

      .policy-asset-preview img {
        max-width: 100%;
        max-height: 280px;
        border-radius: 10px;
        border: 1px solid #dbe6f6;
      }

      .policy-asset-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
        padding: 12px 14px;
        border-top: 1px solid #dbe6f6;
        background: #f7fbff;
      }

      @media (max-width: 760px) {
        .policy-asset-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function injectModal() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "policy-asset-modal hidden";
    modal.setAttribute("data-mode", "insert");

    modal.innerHTML = `
      <div class="policy-asset-dialog" role="dialog" aria-modal="true" aria-labelledby="policyAssetModalTitle">
        <div class="policy-asset-head">
          <div id="policyAssetModalTitle" class="policy-asset-title">Insert Image</div>
          <button id="policyAssetCloseBtn" class="btn2" type="button">Close</button>
        </div>

        <div class="policy-asset-body">
          <div class="policy-asset-grid">
            <div>
              <div id="policyAssetFileWrap" class="field">
                <label>Image file</label>
                <input id="policyAssetFile" type="file" accept="image/png,image/jpeg,image/webp" />
              </div>

              <div class="field">
                <label>Caption</label>
                <input id="policyAssetCaption" placeholder="Optional image caption" />
              </div>

              <div class="field">
                <label>Alt text / description</label>
                <input id="policyAssetAltText" placeholder="Short image description" />
              </div>

              <div class="field">
                <label>Display size</label>
                <select id="policyAssetSize">
                  <option value="small">Small</option>
                  <option value="medium" selected>Medium</option>
                  <option value="large">Large</option>
                  <option value="full">Full width</option>
                </select>
              </div>

              <div class="field">
                <label>Alignment</label>
                <select id="policyAssetAlignment">
                  <option value="left">Left</option>
                  <option value="center" selected>Center</option>
                  <option value="right">Right</option>
                  <option value="full">Full width</option>
                </select>
              </div>
            </div>

            <div>
              <label>Preview</label>
              <div id="policyAssetPreview" class="policy-asset-preview">No image selected.</div>
            </div>
          </div>
        </div>

        <div class="policy-asset-actions">
          <button id="policyAssetRemoveBtn" class="btnDanger" type="button" style="display:none;">Remove image</button>
          <button id="policyAssetApplyBtn" class="btn" type="button" style="display:none;">Apply properties</button>
          <button id="policyAssetInsertBtn" class="btn" type="button">Insert image</button>
          <button id="policyAssetCancelBtn" class="btn2" type="button">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("policyAssetCloseBtn")?.addEventListener("click", closeModal);
    document.getElementById("policyAssetCancelBtn")?.addEventListener("click", closeModal);

    document.getElementById("policyAssetFile")?.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      renderPreviewFromFile(file);
    });

    document.getElementById("policyAssetInsertBtn")?.addEventListener("click", async () => {
      try {
        showWarn("");
        await insertFromModal();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    document.getElementById("policyAssetApplyBtn")?.addEventListener("click", async () => {
      try {
        showWarn("");
        await applyPropertiesFromModal();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    document.getElementById("policyAssetRemoveBtn")?.addEventListener("click", () => {
      removeSelectedImage();
      closeModal();
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.classList.contains("hidden")) {
        closeModal();
      }
    });
  }

  function makeButton(label, title, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tool-btn";
    btn.textContent = label;
    btn.title = title || label;
    btn.addEventListener("click", async () => {
      try {
        showWarn("");
        await handler();
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });
    return btn;
  }

  function injectToolbarButtons() {
    const toolbar = document.querySelector(".editor-toolbar");
    if (!toolbar || document.getElementById("policyInsertImageBtn")) return;

    const sep = document.createElement("span");
    sep.className = "policy-editor-asset-separator";

    const insertBtn = makeButton("Insert Image", "Upload and insert image", openInsertModal);
    insertBtn.id = "policyInsertImageBtn";

    const propsBtn = makeButton("Image Properties", "Edit selected image properties", openPropertiesModal);
    propsBtn.id = "policyImagePropertiesBtn";

    const smallBtn = makeButton("Img Small", "Set selected image small", () => applyFigureSize("small"));
    const medBtn = makeButton("Img Medium", "Set selected image medium", () => applyFigureSize("medium"));
    const largeBtn = makeButton("Img Large", "Set selected image large", () => applyFigureSize("large"));
    const fullBtn = makeButton("Img Full", "Set selected image full width", () => applyFigureSize("full"));

    const leftBtn = makeButton("Img Left", "Align selected image left", () => applyFigureAlignment("left"));
    const centerBtn = makeButton("Img Center", "Align selected image center", () => applyFigureAlignment("center"));
    const rightBtn = makeButton("Img Right", "Align selected image right", () => applyFigureAlignment("right"));

    const removeBtn = makeButton("Remove Image", "Remove selected image from editor", removeSelectedImage);

    [
      sep,
      insertBtn,
      propsBtn,
      smallBtn,
      medBtn,
      largeBtn,
      fullBtn,
      leftBtn,
      centerBtn,
      rightBtn,
      removeBtn,
    ].forEach((el) => toolbar.appendChild(el));
  }

  function wireEditorSelection() {
    const editor = editorEl();
    if (!editor || editor.getAttribute("data-policy-assets-wired") === "1") return;

    editor.setAttribute("data-policy-assets-wired", "1");

    editor.addEventListener("mouseup", saveSelection);
    editor.addEventListener("keyup", saveSelection);
    editor.addEventListener("focus", saveSelection);

    editor.addEventListener("click", (event) => {
      const fig = event.target.closest?.("figure.policy-figure");
      if (fig && editor.contains(fig)) {
        setActiveFigure(fig);
        event.preventDefault();
        return;
      }

      clearActiveFigure();
    });
  }

  function startImageRefreshObserver() {
    const refreshRoots = () => {
      const published = document.getElementById("chapterContent");
      const editor = document.getElementById("policyEditor");

      if (published) refreshPolicyAssetImages(published);
      if (editor) refreshPolicyAssetImages(editor);
    };

    refreshRoots();

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(refreshRoots);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.setInterval(refreshRoots, 10 * 60 * 1000);
  }

  function init() {
    injectStyles();
    injectModal();
    injectToolbarButtons();
    wireEditorSelection();
    startImageRefreshObserver();

    const observer = new MutationObserver(() => {
      injectToolbarButtons();
      wireEditorSelection();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.CSVB_POLICY_EDITOR_ASSETS = {
      build: BUILD,
      refreshPolicyAssetImages,
      applyFigureSize,
      applyFigureAlignment,
      openInsertModal,
      openPropertiesModal,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();