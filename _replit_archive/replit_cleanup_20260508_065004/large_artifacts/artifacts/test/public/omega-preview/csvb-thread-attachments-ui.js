// public/csvb-thread-attachments-ui.js
// C.S.V. BEACON — T-11B Thread attachment upload UI.
// Adds thread-level attachments to Threads module.

(() => {
  "use strict";

  const BUILD = "T11B-THREAD-ATTACHMENTS-UI-2026-05-05";
  const BUCKET = "thread-attachments";

  let sb = null;
  let currentThreadId = null;
  let uploadBusy = false;

  function el(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function selectedThread() {
    if (typeof window.CSVB_THREADS_GET_SELECTED_THREAD === "function") {
      return window.CSVB_THREADS_GET_SELECTED_THREAD();
    }
    return null;
  }

  function safeFileName(name) {
    return String(name || "attachment")
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160) || "attachment";
  }

  function formatSize(bytes) {
    const n = Number(bytes || 0);
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function setStatus(text, kind = "") {
    const box = el("threadAttachmentStatus");
    if (!box) return;
    box.className = "compact-note thread-attachment-status " + kind;
    box.textContent = text || "";
  }

  function ensurePanel() {
    if (el("threadAttachmentsPanel")) return;

    const messageBox = el("messagesBox");
    if (!messageBox) return;

    const panel = document.createElement("div");
    panel.id = "threadAttachmentsPanel";
    panel.className = "thread-attachments-panel";
    panel.innerHTML = `
      <h2 style="margin-top:12px;">Attachments / Evidence</h2>
      <div class="compact-note">
        Upload PDF, image or office document evidence for the selected thread.
      </div>

      <div class="thread-attachment-upload-row">
        <input id="threadAttachmentInput" type="file" multiple />
        <button class="secondary" id="threadAttachmentUploadBtn" type="button"
          data-csvb-help="Upload selected files to this thread.">
          Upload Attachment(s)
        </button>
      </div>

      <div id="threadAttachmentStatus" class="compact-note thread-attachment-status"></div>
      <div id="threadAttachmentList" class="thread-attachment-list muted">Open a thread to view attachments.</div>
    `;

    messageBox.insertAdjacentElement("afterend", panel);

    el("threadAttachmentUploadBtn")?.addEventListener("click", uploadSelectedFiles);
  }

  async function loadAttachments() {
    ensurePanel();

    const t = selectedThread();
    const list = el("threadAttachmentList");

    if (!list) return;

    if (!t?.id) {
      currentThreadId = null;
      list.innerHTML = `<div class="muted">Open a thread to view attachments.</div>`;
      return;
    }

    currentThreadId = t.id;

    try {
      const rows = await rpc("csvb_thread_attachments_for_me", {
        p_thread_id: t.id
      });

      renderAttachments(rows || []);
    } catch (e) {
      list.innerHTML = `<div class="msg err" style="display:block;">Could not load attachments:\n${esc(e?.message || e)}</div>`;
    }
  }

  function renderAttachments(rows) {
    const list = el("threadAttachmentList");
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = `<div class="muted">No attachments uploaded for this thread.</div>`;
      return;
    }

    list.innerHTML = rows.map((a) => `
      <div class="thread-attachment-item">
        <div>
          <div class="thread-title">${esc(a.file_name)}</div>
          <div class="muted">
            ${esc(a.mime_type || "")}
            ${a.size_bytes ? " • " + esc(formatSize(a.size_bytes)) : ""}
            ${a.uploaded_by_username ? " • uploaded by " + esc(a.uploaded_by_username) : ""}
            ${a.created_at ? " • " + esc(new Date(a.created_at).toLocaleString()) : ""}
          </div>
        </div>
        <div class="thread-attachment-actions">
          <button class="secondary" type="button" data-open-attachment="${esc(a.storage_path)}">
            Open
          </button>
          <button class="secondary thread-attachment-delete" type="button" data-delete-attachment="${esc(a.id)}">
            Delete
          </button>
        </div>
      </div>
    `).join("");

    list.querySelectorAll("[data-open-attachment]").forEach((btn) => {
      btn.addEventListener("click", () => openAttachment(btn.getAttribute("data-open-attachment")));
    });

    list.querySelectorAll("[data-delete-attachment]").forEach((btn) => {
      btn.addEventListener("click", () => deleteAttachment(btn.getAttribute("data-delete-attachment")));
    });
  }

  async function openAttachment(path) {
    if (!path) return;

    try {
      const { data, error } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 10);

      if (error) throw error;

      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      alert("Could not open attachment:\n" + (e?.message || String(e)));
    }
  }

  async function uploadSelectedFiles() {
    if (uploadBusy) return;

    const t = selectedThread();
    const input = el("threadAttachmentInput");

    if (!t?.id) {
      setStatus("Open a thread first.", "err");
      return;
    }

    const files = Array.from(input?.files || []);

    if (!files.length) {
      setStatus("Select one or more files first.", "err");
      return;
    }

    uploadBusy = true;
    setStatus(`Uploading ${files.length} file(s)…`);

    try {
      let uploaded = 0;

      for (const file of files) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const rand = Math.random().toString(36).slice(2, 8);
        const name = safeFileName(file.name);
        const path = `${t.id}/thread/${ts}_${rand}_${name}`;

        const { error: uploadError } = await sb.storage
          .from(BUCKET)
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream"
          });

        if (uploadError) throw uploadError;

        await rpc("csvb_register_thread_attachment", {
          p_thread_id: t.id,
          p_message_id: null,
          p_storage_path: path,
          p_file_name: file.name,
          p_mime_type: file.type || null,
          p_size_bytes: file.size || null
        });

        uploaded += 1;
        setStatus(`Uploaded ${uploaded}/${files.length} file(s)…`);
      }

      if (input) input.value = "";
      setStatus(`Uploaded ${uploaded} attachment(s).`, "ok");

      await loadAttachments();
    } catch (e) {
      setStatus("Upload failed:\n" + String(e?.message || e), "err");
    } finally {
      uploadBusy = false;
    }
  }

  async function deleteAttachment(id) {
    if (!id) return;

    const ok = confirm("Delete/archive this attachment from the thread?");
    if (!ok) return;

    try {
      await rpc("csvb_delete_thread_attachment", {
        p_attachment_id: id,
        p_reason: "Deleted from Threads UI"
      });

      await loadAttachments();
      setStatus("Attachment deleted.", "ok");
    } catch (e) {
      alert("Delete attachment failed:\n" + (e?.message || String(e)));
    }
  }

  function hookOpenThread() {
    const original = window.CSVB_THREADS_OPEN_THREAD;

    if (typeof original !== "function" || original.__attachmentsHooked) return;

    const wrapped = async function(id) {
      const result = await original(id);
      setTimeout(loadAttachments, 250);
      return result;
    };

    wrapped.__attachmentsHooked = true;
    window.CSVB_THREADS_OPEN_THREAD = wrapped;
  }

  function init() {
    window.CSVB_THREAD_ATTACHMENTS_UI_BUILD = BUILD;

    if (!window.AUTH?.ensureSupabase) return;

    sb = window.AUTH.ensureSupabase();

    ensurePanel();

    setInterval(() => {
      hookOpenThread();

      const t = selectedThread();
      if (t?.id && t.id !== currentThreadId) {
        loadAttachments();
      }
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
