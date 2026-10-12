// public/mooring-anchoring-evidence-upload-fix.js
// C.S.V. BEACON – MAI Evidence Upload Stabilizer
// Keeps selected files in memory if the event workspace re-renders the file input.

(() => {
  "use strict";

  const BUILD = "MAI-EVIDENCE-UPLOAD-FIX-20260511-1";
  const BUCKET = "mai-evidence";

  const ALLOWED_EXTENSIONS = new Set([
    "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
    "pdf", "doc", "docx"
  ]);

  const ALLOWED_MIMES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

  let componentCache = null;
  let pendingEventFiles = new Map();
  let pendingRunFiles = [];
  let uploading = false;

  function $(id) {
    return document.getElementById(id);
  }

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box = type === "ok" ? $("okBox") : $("warnBox");
    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
    } else {
      alert(message);
    }
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getFileExtension(fileName) {
    const parts = String(fileName || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
  }

  function isAllowedEvidenceFile(file) {
    const mime = String(file.type || "").toLowerCase();
    const ext = getFileExtension(file.name);

    if (mime.startsWith("image/")) return true;
    if (ALLOWED_MIMES.has(mime)) return true;
    if (ALLOWED_EXTENSIONS.has(ext)) return true;

    return false;
  }

  function isImageFile(file) {
    const mime = String(file.type || "").toLowerCase();
    const ext = getFileExtension(file.name);

    return mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext);
  }

  function sanitizeFileName(name) {
    return String(name || "file")
      .trim()
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120) || "file";
  }

  function getUniqueIdFromPage() {
    const text = $("detailTitle")?.textContent || "";
    return text.trim();
  }

  async function getComponent() {
    const uniqueId = getUniqueIdFromPage();

    if (!uniqueId || uniqueId === "Component Detail") {
      throw new Error("No component is open.");
    }

    if (componentCache && componentCache.unique_id === uniqueId) {
      return componentCache;
    }

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb
      .from("mai_v_components_list")
      .select("id, company_id, vessel_id, unique_id")
      .eq("unique_id", uniqueId)
      .limit(1)
      .single();

    if (error) throw error;

    componentCache = data;
    return componentCache;
  }

  function makeObjectPath(component, file) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const safeName = `${stamp}_${random}_${sanitizeFileName(file.name)}`;

    return `${component.company_id}/${component.vessel_id}/${component.id}/${safeName}`;
  }

  function findEventIdNearInput(input) {
    const box = input.closest(".mai-evidence-upload-box");
    const btn = box?.querySelector("[data-mai-upload-selected-event]");
    return btn?.getAttribute("data-mai-upload-selected-event") || "";
  }

  function showSelectedFiles(input, files) {
    const box = input.closest(".mai-evidence-upload-box") || input.parentElement;
    if (!box) return;

    let msg = box.querySelector(".mai-file-selection-memory");
    if (!msg) {
      msg = document.createElement("div");
      msg.className = "hint-text mai-file-selection-memory";
      msg.style.marginTop = "6px";
      box.appendChild(msg);
    }

    if (!files.length) {
      msg.textContent = "No evidence file selected.";
      return;
    }

    msg.innerHTML = `<strong>Selected:</strong> ${files.map((f) => esc(f.name)).join(", ")}`;
  }

  function captureSelectedFiles(event) {
    const input = event.target;

    if (!(input instanceof HTMLInputElement)) return;
    if (input.type !== "file") return;

    const files = Array.from(input.files || []);

    if (input.id === "maiSelectedEventEvidenceFiles") {
      const eventId = findEventIdNearInput(input);

      if (eventId) {
        pendingEventFiles.set(eventId, files);
        showSelectedFiles(input, files);
      }
    }

    if (input.id === "maiRunEvidenceFiles") {
      pendingRunFiles = files;
      showSelectedFiles(input, files);
    }
  }

  async function uploadFiles({ files, lifecycleEventId = null, inspectionRunId = null, evidenceContext }) {
    if (uploading) return;

    const selectedFiles = Array.from(files || []);

    if (!selectedFiles.length) {
      toast("warn", "Select one or more evidence files first.");
      return;
    }

    for (const file of selectedFiles) {
      if (!isAllowedEvidenceFile(file)) {
        throw new Error(`Unsupported file type: ${file.name}. Allowed: images, PDF, DOC, DOCX.`);
      }
    }

    uploading = true;

    try {
      const component = await getComponent();
      const sb = window.AUTH.ensureSupabase();

      let uploaded = 0;

      for (const file of selectedFiles) {
        const filePath = makeObjectPath(component, file);
        const imageEvidence = isImageFile(file);

        const { error: uploadError } = await sb
          .storage
          .from(BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || "application/octet-stream"
          });

        if (uploadError) throw uploadError;

        const { error: registerError } = await sb.rpc("mai_register_component_attachment", {
          p_component_id: component.id,
          p_file_name: file.name,
          p_file_path: filePath,
          p_mime_type: file.type || null,
          p_file_size_bytes: file.size || null,
          p_attachment_type: imageEvidence ? "photo_evidence" : "document_evidence",
          p_lifecycle_event_id: lifecycleEventId,
          p_inspection_run_id: inspectionRunId,
          p_inspection_answer_id: null,
          p_evidence_context: evidenceContext,
          p_is_photo_evidence: imageEvidence,
          p_remarks: null
        });

        if (registerError) throw registerError;

        uploaded += 1;
      }

      toast("ok", `${uploaded} evidence file(s) uploaded.`);

      if (lifecycleEventId) {
        pendingEventFiles.delete(lifecycleEventId);
      }

      if (inspectionRunId) {
        pendingRunFiles = [];
      }

      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    } finally {
      uploading = false;
    }
  }

  function interceptUploadClicks(event) {
    const eventBtn = event.target.closest?.("[data-mai-upload-selected-event]");
    const runBtn = event.target.closest?.("#maiUploadRunEvidenceBtn");

    if (!eventBtn && !runBtn) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (eventBtn) {
      const eventId = eventBtn.getAttribute("data-mai-upload-selected-event");
      const input = $("maiSelectedEventEvidenceFiles");
      const filesFromInput = Array.from(input?.files || []);
      const filesFromMemory = pendingEventFiles.get(eventId) || [];
      const files = filesFromInput.length ? filesFromInput : filesFromMemory;

      uploadFiles({
        files,
        lifecycleEventId: eventId,
        inspectionRunId: null,
        evidenceContext: "lifecycle_event"
      }).catch((error) => {
        console.error(error);
        toast("warn", String(error?.message || error || "Could not upload event evidence."));
      });
    }

    if (runBtn) {
      const runId = $("checklistRunSelect")?.value || "";
      const input = $("maiRunEvidenceFiles");
      const filesFromInput = Array.from(input?.files || []);
      const files = filesFromInput.length ? filesFromInput : pendingRunFiles;

      if (!runId) {
        toast("warn", "Select a checklist run first.");
        return;
      }

      uploadFiles({
        files,
        lifecycleEventId: null,
        inspectionRunId: runId,
        evidenceContext: "inspection_run"
      }).catch((error) => {
        console.error(error);
        toast("warn", String(error?.message || error || "Could not upload checklist evidence."));
      });
    }
  }

  function init() {
    window.CSVB_MAI_EVIDENCE_UPLOAD_FIX_BUILD = BUILD;

    document.addEventListener("change", captureSelectedFiles, true);
    document.addEventListener("click", interceptUploadClicks, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
