// public/company_policy_editor_assets.js
// C.S.V. BEACON – Company Policy advanced editor assets
// CP-10B: insert private Supabase Storage images into policy editor.

(() => {
  "use strict";

  const BUILD = "CP10B-2026-05-07";
  const BUCKET = "company-policy-assets";
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const SIGNED_URL_SECONDS = 60 * 60 * 24;

  let savedRange = null;
  let activeFigure = null;
  let fileInput = null;

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

  async function handleImageFile(file) {
    const caption = window.prompt("Image caption (optional):", "") || "";
    const altText = window.prompt("Alt text / description (optional):", caption || file?.name || "") || file?.name || "";

    const displaySize = normalizeChoice(
      window.prompt("Display size: small, medium, large, full", "medium"),
      ["small", "medium", "large", "full"],
      "medium"
    );

    const alignment = normalizeChoice(
      window.prompt("Alignment: left, center, right, full", "center"),
      ["left", "center", "right", "full"],
      "center"
    );

    showOk("Uploading policy image...");

    const { asset, url } = await uploadImage(file, {
      caption,
      altText,
      displaySize,
      alignment,
    });

    insertHtmlAtCursor(figureHtml(asset, url));
    showOk("Image inserted into the policy editor.");
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

  function applyFigureSize(size) {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    ["small", "medium", "large", "full"].forEach((x) => {
      activeFigure.classList.remove(`policy-size-${x}`);
    });

    activeFigure.classList.add(`policy-size-${size}`);
    activeFigure.setAttribute("data-policy-display-size", size);
  }

  function applyFigureAlignment(alignment) {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    ["left", "center", "right", "full"].forEach((x) => {
      activeFigure.classList.remove(`policy-align-${x}`);
    });

    activeFigure.classList.add(`policy-align-${alignment}`);
    activeFigure.setAttribute("data-policy-alignment", alignment);
  }

  function editCaption() {
    if (!activeFigure) {
      showWarn("Click an inserted policy image first.");
      return;
    }

    let cap = activeFigure.querySelector("figcaption");

    if (!cap) {
      cap = document.createElement("figcaption");
      activeFigure.appendChild(cap);
    }

    const next = window.prompt("Image caption:", cap.textContent || "") ?? cap.textContent;
    cap.textContent = next;
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
    `;

    document.head.appendChild(style);
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

    const insertBtn = makeButton("Insert Image", "Upload and insert image", () => {
      saveSelection();
      fileInput.click();
    });
    insertBtn.id = "policyInsertImageBtn";

    const smallBtn = makeButton("Img Small", "Set selected image small", () => applyFigureSize("small"));
    const medBtn = makeButton("Img Medium", "Set selected image medium", () => applyFigureSize("medium"));
    const largeBtn = makeButton("Img Large", "Set selected image large", () => applyFigureSize("large"));
    const fullBtn = makeButton("Img Full", "Set selected image full width", () => applyFigureSize("full"));

    const leftBtn = makeButton("Img Left", "Align selected image left", () => applyFigureAlignment("left"));
    const centerBtn = makeButton("Img Center", "Align selected image center", () => applyFigureAlignment("center"));
    const rightBtn = makeButton("Img Right", "Align selected image right", () => applyFigureAlignment("right"));

    const captionBtn = makeButton("Caption", "Edit selected image caption", editCaption);
    const removeBtn = makeButton("Remove Image", "Remove selected image from editor", removeSelectedImage);

    [
      sep,
      insertBtn,
      smallBtn,
      medBtn,
      largeBtn,
      fullBtn,
      leftBtn,
      centerBtn,
      rightBtn,
      captionBtn,
      removeBtn,
    ].forEach((el) => toolbar.appendChild(el));
  }

  function ensureFileInput() {
    if (fileInput) return;

    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/png,image/jpeg,image/webp";
    fileInput.style.display = "none";

    fileInput.addEventListener("change", async () => {
      try {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;

        await handleImageFile(file);
      } catch (error) {
        showWarn(String(error?.message || error));
      }
    });

    document.body.appendChild(fileInput);
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
    ensureFileInput();
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
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();