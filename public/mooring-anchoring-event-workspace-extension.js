// public/mooring-anchoring-event-workspace-extension.js
// C.S.V. BEACON – MAI Event Workspace Extension
// Event-specific view/edit/delete/review/evidence upload.

(() => {
  "use strict";

  const BUILD = "MAI-EVENT-WORKSPACE-20260511-2";
  const BUCKET = "mai-evidence";

  const ACCEPT_STRING = [
    "image/*",
    ".heic",
    ".heif",
    ".pdf",
    ".doc",
    ".docx",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ].join(",");

  const ALLOWED_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "heic",
    "heif",
    "pdf",
    "doc",
    "docx"
  ]);

  const ALLOWED_MIMES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]);

  let currentUser = null;
  let isOfficeOrPlatform = false;

  let component = null;
  let events = [];
  let attachments = [];
  let selectedEventId = "";
  let busy = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box = type === "ok" ? $("okBox") : $("warnBox");
    if (box) {
      box.textContent = message;
      box.style.display = "block";
    } else {
      alert(message);
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function formatDateInput(value) {
    if (!value) return "";
    const raw = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function formatFileSize(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
    return mime.startsWith("image/") || ["heic", "heif"].includes(ext);
  }

  function fileTypeLabel(rowOrFile) {
    const mime = String(rowOrFile.mime_type || rowOrFile.type || "").toLowerCase();
    const name = rowOrFile.file_name || rowOrFile.name || "";
    const ext = getFileExtension(name);

    if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext)) return "Image";
    if (mime === "application/pdf" || ext === "pdf") return "PDF";
    if (
      mime === "application/msword" ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ["doc", "docx"].includes(ext)
    ) return "Word";

    return ext ? ext.toUpperCase() : "File";
  }

  function statusPill(status) {
    const s = String(status || "pending");
    const cls =
      s === "reviewed" ? "lifecycle-ok" :
      s === "rejected" ? "lifecycle-overdue" :
      "lifecycle-due-soon";

    return `<span class="lifecycle-pill ${cls}">${esc(s.replaceAll("_", " "))}</span>`;
  }

  function evidencePill(status) {
    const s = String(status || "not_required");
    const cls =
      s === "complete" ? "lifecycle-ok" :
      s === "required_missing" ? "lifecycle-overdue" :
      "lifecycle-event-based";

    return `<span class="lifecycle-pill ${cls}">${esc(s.replaceAll("_", " "))}</span>`;
  }

  function getUniqueIdFromPage() {
    const text = $("detailTitle")?.textContent || "";
    return text.trim();
  }

  function selectedRunId() {
    return $("checklistRunSelect")?.value || "";
  }

  function selectedRunText() {
    const select = $("checklistRunSelect");
    if (!select || !select.value) return "";
    return select.options[select.selectedIndex]?.textContent || "";
  }

  function selectedRunIsVoided() {
    return selectedRunText().toLowerCase().includes("voided");
  }

  function sanitizeFileName(name) {
    return String(name || "file")
      .trim()
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120) || "file";
  }

  function makeObjectPath(file) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    const safeName = `${stamp}_${random}_${sanitizeFileName(file.name)}`;
    return `${component.company_id}/${component.vessel_id}/${component.id}/${safeName}`;
  }

  async function detectUser() {
    try {
      const bundle = await window.AUTH.getSessionUserProfile();
      currentUser = bundle?.profile || null;

      const role = currentUser?.role || "";
      isOfficeOrPlatform = [
        "super_admin",
        "platform_owner",
        "company_admin",
        "company_superintendent"
      ].includes(role);
    } catch (_) {
      currentUser = null;
      isOfficeOrPlatform = false;
    }
  }

  async function loadComponent() {
    const uniqueId = getUniqueIdFromPage();

    if (!uniqueId || uniqueId === "Component Detail") return null;

    if (component?.unique_id === uniqueId) return component;

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb
      .from("mai_v_components_list")
      .select("id, company_id, company_name, vessel_id, vessel_name, unique_id")
      .eq("unique_id", uniqueId)
      .limit(1)
      .single();

    if (error) throw error;

    component = data;
    return component;
  }

  async function loadData() {
    const comp = await loadComponent();
    if (!comp) return false;

    const sb = window.AUTH.ensureSupabase();

    const [eventRes, attachmentRes] = await Promise.all([
      sb
        .from("mai_v_lifecycle_events_list")
        .select("*")
        .eq("component_id", comp.id)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false }),

      sb
        .from("mai_v_component_attachments_list")
        .select("*")
        .eq("component_id", comp.id)
        .order("uploaded_at", { ascending: false })
    ]);

    if (eventRes.error) throw eventRes.error;
    if (attachmentRes.error) throw attachmentRes.error;

    events = eventRes.data || [];
    attachments = attachmentRes.data || [];

    if (selectedEventId && !events.some((e) => e.event_id === selectedEventId)) {
      selectedEventId = "";
    }

    if (!selectedEventId && events.length) {
      selectedEventId = events[0].event_id;
    }

    return true;
  }

  async function signedUrl(filePath) {
    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb
      .storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 60);

    if (error) return null;
    return data?.signedUrl || null;
  }

  async function uploadEvidenceFiles({
    files,
    lifecycleEventId = null,
    inspectionRunId = null,
    evidenceContext = "general"
  }) {
    if (!component) throw new Error("No component is open.");

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

    const sb = window.AUTH.ensureSupabase();
    let uploaded = 0;

    for (const file of selectedFiles) {
      const filePath = makeObjectPath(file);
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
    await refreshWorkspace();
  }

  async function deleteAttachment(attachmentId) {
    const reason = prompt("Reason for deleting this evidence file:", "Uploaded by mistake.");
    if (reason === null) return;

    const ok = confirm("Delete this evidence file?\n\nThis is a soft delete and remains auditable.");
    if (!ok) return;

    const sb = window.AUTH.ensureSupabase();

    const { error } = await sb.rpc("mai_soft_delete_component_attachment", {
      p_attachment_id: attachmentId,
      p_delete_reason: reason || null
    });

    if (error) throw error;

    toast("ok", "Evidence file deleted.");
    await refreshWorkspace();
  }

  async function deleteEvent(eventId) {
    const reason = prompt("Reason for deleting this lifecycle event:", "Recorded by mistake.");
    if (reason === null) return;

    const ok = confirm("Delete this lifecycle event?\n\nThis is a soft delete and remains auditable.");
    if (!ok) return;

    const sb = window.AUTH.ensureSupabase();

    const { error } = await sb.rpc("mai_soft_delete_lifecycle_event", {
      p_event_id: eventId,
      p_delete_reason: reason || null
    });

    if (error) throw error;

    toast("ok", "Lifecycle event deleted.");
    selectedEventId = "";
    await refreshWorkspace();
  }

  async function reviewEvent(eventId) {
    const remarks = prompt("Office review remarks:", "Reviewed by Office.");
    if (remarks === null) return;

    const sb = window.AUTH.ensureSupabase();

    const { error } = await sb.rpc("mai_review_lifecycle_event", {
      p_event_id: eventId,
      p_review_status: "reviewed",
      p_review_remarks: remarks || null
    });

    if (error) throw error;

    toast("ok", "Lifecycle event reviewed.");
    await refreshWorkspace();
  }

  async function saveEventEdit(eventId) {
    const dateInput = document.getElementById("maiEventEditDate");
    const remarksInput = document.getElementById("maiEventEditRemarks");

    const sb = window.AUTH.ensureSupabase();

    const { error } = await sb.rpc("mai_update_lifecycle_event", {
      p_event_id: eventId,
      p_event_date: dateInput?.value || null,
      p_remarks: remarksInput?.value || null
    });

    if (error) throw error;

    toast("ok", "Lifecycle event updated.");
    await refreshWorkspace();
  }

  function ensureWorkspace() {
    const host = $("lifecycleEventHistory");
    if (!host) return null;

    host.setAttribute("data-mai-event-workspace", "1");

    return host;
  }

  function eventEvidenceFiles(eventId) {
    return attachments.filter((a) => a.lifecycle_event_id === eventId);
  }

  function runEvidenceFiles(runId) {
    return attachments.filter((a) => a.inspection_run_id === runId);
  }

  function canModifyEvent(event) {
    if (!event) return false;
    if (event.review_status === "reviewed" && !isOfficeOrPlatform) return false;
    return true;
  }

  function renderEventCards() {
    if (!events.length) {
      return `<div class="hint-text">No lifecycle events yet.</div>`;
    }

    return events.map((event) => {
      const files = eventEvidenceFiles(event.event_id);
      const selected = selectedEventId === event.event_id;

      return `
        <div class="mai-event-card ${selected ? "mai-event-selected" : ""}" data-mai-event-card="${esc(event.event_id)}">
          <div class="mai-event-card-main">
            <div>
              <div class="mai-event-title">
                ${esc(event.event_type || "event")} — ${esc(formatDate(event.event_date))}
                ${statusPill(event.review_status)}
                ${evidencePill(event.evidence_status)}
              </div>
              <div class="mini-meta">
                Recorded by: ${esc(event.created_by_username || event.performed_by || "—")}
                / Hours: ${esc(formatNumber(event.hours_at_event))}
              </div>
              <div class="mini-meta">
                Evidence: ${esc(files.length)} file(s)
                ${event.evidence_required ? ` / required minimum ${esc(event.min_evidence_files || 0)}` : ""}
              </div>
            </div>

            <div class="mai-event-actions">
              <button class="btn2 compact" type="button" data-mai-view-event="${esc(event.event_id)}">View</button>
              <button class="btn2 compact" type="button" data-mai-edit-event="${esc(event.event_id)}">Edit</button>
              ${
                isOfficeOrPlatform && event.review_status === "pending"
                  ? `<button class="btn2 compact" type="button" data-mai-review-event="${esc(event.event_id)}">Office Review</button>`
                  : ""
              }
              <button class="btnDanger compact" type="button" data-mai-delete-event="${esc(event.event_id)}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function renderEvidenceFile(a) {
    const url = await signedUrl(a.file_path);

    return `
      <div class="mai-evidence-card">
        <div class="mai-evidence-title">
          ${esc(a.file_name)}
          <span class="lifecycle-pill lifecycle-event-based">${esc(fileTypeLabel(a))}</span>
        </div>
        <div class="mini-meta">
          Uploaded: ${esc(formatDate(a.uploaded_at))}
          / By: ${esc(a.uploaded_by_username || "—")}
          / Size: ${esc(formatFileSize(a.file_size_bytes))}
        </div>
        <div class="actions-row">
          ${url ? `<a class="btn2 compact" href="${esc(url)}" target="_blank" rel="noopener">Open</a>` : ""}
          <button class="btnDanger compact" type="button" data-mai-delete-attachment="${esc(a.attachment_id)}">Delete Evidence</button>
        </div>
      </div>
    `;
  }

  async function renderEventDetail() {
    const event = events.find((e) => e.event_id === selectedEventId);

    if (!event) {
      return `<div class="mai-event-detail"><div class="hint-text">Select a lifecycle event to view details.</div></div>`;
    }

    const files = eventEvidenceFiles(event.event_id);
    const locked = !canModifyEvent(event);

    const fileHtmlParts = [];
    for (const file of files) {
      fileHtmlParts.push(await renderEvidenceFile(file));
    }

    return `
      <div class="mai-event-detail">
        <div class="mai-event-detail-head">
          <div>
            <h4>${esc(event.event_type || "event")} — ${esc(formatDate(event.event_date))}</h4>
            <div class="mini-meta">
              ${statusPill(event.review_status)}
              ${evidencePill(event.evidence_status)}
            </div>
          </div>
        </div>

        <div class="form-grid two-col">
          <label class="field">
            <span>Event Date</span>
            <input id="maiEventEditDate" type="date" value="${esc(formatDateInput(event.event_date))}" ${locked ? "disabled" : ""} />
          </label>

          <label class="field">
            <span>Recorded By</span>
            <input value="${esc(event.created_by_username || event.performed_by || "—")}" disabled />
          </label>

          <label class="field field-wide">
            <span>Remarks</span>
            <textarea id="maiEventEditRemarks" ${locked ? "disabled" : ""}>${esc(event.remarks || "")}</textarea>
          </label>
        </div>

        <div class="mini-meta">
          Evidence requirement:
          ${event.evidence_required ? `Minimum ${esc(event.min_evidence_files || 0)} file(s)` : "Not required"}
          / Uploaded ${esc(files.length)}
        </div>

        <div class="actions-row">
          <button class="btn2 compact" type="button" data-mai-save-event="${esc(event.event_id)}" ${locked ? "disabled" : ""}>Save Event</button>
          ${
            isOfficeOrPlatform && event.review_status === "pending"
              ? `<button class="btn2 compact" type="button" data-mai-review-event="${esc(event.event_id)}">Office Review</button>`
              : ""
          }
          <button class="btnDanger compact" type="button" data-mai-delete-event="${esc(event.event_id)}">Delete Event</button>
        </div>

        <div class="mai-evidence-upload-box">
          <div class="mai-evidence-title">Evidence for this event</div>
          <div class="hint-text">Allowed evidence files: images, PDF, DOC, DOCX.</div>
          <div class="actions-row">
            <input id="maiSelectedEventEvidenceFiles" type="file" accept="${esc(ACCEPT_STRING)}" multiple ${locked ? "disabled" : ""} />
            <button class="btn2 compact" type="button" data-mai-upload-selected-event="${esc(event.event_id)}" ${locked ? "disabled" : ""}>Upload Evidence to This Event</button>
          </div>
        </div>

        <div class="mai-evidence-list">
          ${fileHtmlParts.length ? fileHtmlParts.join("") : `<div class="hint-text">No evidence files attached to this event.</div>`}
        </div>

        ${locked ? `<div class="hint-text">Reviewed event: vessel-side editing and evidence changes are locked.</div>` : ""}
      </div>
    `;
  }

  function renderRunEvidenceBox() {
    let box = $("maiRunEvidenceBox");
    const summary = $("checklistRunSummary");

    if (!summary) return;

    if (!box) {
      box = document.createElement("div");
      box.id = "maiRunEvidenceBox";
      box.className = "checklist-summary";
      box.style.marginTop = "8px";
      summary.insertAdjacentElement("afterend", box);
    }

    const runId = selectedRunId();

    if (!runId) {
      box.innerHTML = `<div class="hint-text">Select a checklist run to upload inspection evidence.</div>`;
      return;
    }

    const files = runEvidenceFiles(runId);
    const isVoided = selectedRunIsVoided();

    box.innerHTML = `
      <div class="mini-title">Checklist Run Evidence</div>
      <div class="mini-meta">Linked evidence files: ${esc(files.length)}</div>
      ${files.length ? files.map((a) => `<div class="mini-meta">• ${esc(a.file_name)} / ${esc(fileTypeLabel(a))} / ${esc(formatFileSize(a.file_size_bytes))}</div>`).join("") : `<div class="hint-text">No checklist evidence uploaded yet.</div>`}

      <div class="actions-row" style="margin-top:8px;">
        <input id="maiRunEvidenceFiles" type="file" accept="${esc(ACCEPT_STRING)}" multiple ${isVoided ? "disabled" : ""} />
        <button id="maiUploadRunEvidenceBtn" class="btn2 compact" type="button" ${isVoided ? "disabled" : ""}>Upload Checklist Evidence</button>
      </div>

      <div class="hint-text">Allowed evidence files: images, PDF, DOC, DOCX.</div>
    `;

    $("maiUploadRunEvidenceBtn")?.addEventListener("click", () => {
      const input = $("maiRunEvidenceFiles");

      uploadEvidenceFiles({
        files: input?.files || [],
        inspectionRunId: runId,
        evidenceContext: "inspection_run"
      }).catch((error) => {
        console.error(error);
        toast("warn", String(error?.message || error || "Could not upload checklist evidence."));
      });
    });
  }

  async function renderWorkspace() {
    const host = ensureWorkspace();
    if (!host) return;

    const eventDetail = await renderEventDetail();

    host.setAttribute("data-mai-event-workspace-rendered-for", getUniqueIdFromPage());

    host.innerHTML = `
      <div class="mai-workspace">
        <div class="mai-workspace-head">
          <div>
            <h3>Lifecycle Event Workspace</h3>
            <div class="hint-text">Open one event at a time. Evidence is attached to the selected event, not generally to the component.</div>
          </div>
          <button class="btn2 compact" type="button" id="maiRefreshEventWorkspaceBtn">Refresh Events</button>
        </div>

        <div class="mai-event-layout">
          <div class="mai-event-list">
            ${renderEventCards()}
          </div>
          ${eventDetail}
        </div>
      </div>
    `;

    host.querySelectorAll("[data-mai-view-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedEventId = btn.getAttribute("data-mai-view-event");
        refreshWorkspace().catch(console.error);
      });
    });

    host.querySelectorAll("[data-mai-edit-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedEventId = btn.getAttribute("data-mai-edit-event");
        refreshWorkspace().catch(console.error);
      });
    });

    host.querySelectorAll("[data-mai-review-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        reviewEvent(btn.getAttribute("data-mai-review-event")).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not review event."));
        });
      });
    });

    host.querySelectorAll("[data-mai-delete-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteEvent(btn.getAttribute("data-mai-delete-event")).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not delete event."));
        });
      });
    });

    host.querySelectorAll("[data-mai-save-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        saveEventEdit(btn.getAttribute("data-mai-save-event")).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not update event."));
        });
      });
    });

    host.querySelectorAll("[data-mai-upload-selected-event]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const eventId = btn.getAttribute("data-mai-upload-selected-event");
        const input = $("maiSelectedEventEvidenceFiles");

        uploadEvidenceFiles({
          files: input?.files || [],
          lifecycleEventId: eventId,
          evidenceContext: "lifecycle_event"
        }).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not upload event evidence."));
        });
      });
    });

    host.querySelectorAll("[data-mai-delete-attachment]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteAttachment(btn.getAttribute("data-mai-delete-attachment")).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not delete evidence file."));
        });
      });
    });

    $("maiRefreshEventWorkspaceBtn")?.addEventListener("click", () => {
      refreshWorkspace().catch(console.error);
    });
  }

  async function refreshWorkspace() {
    if (busy) return;
    busy = true;

    try {
      const ok = await loadData();
      if (!ok) return;

      await renderWorkspace();
      renderRunEvidenceBox();
    } finally {
      busy = false;
    }
  }

  function softenIdentityFields() {
    const mapping = [
      ["lifecyclePerformedBy", "Recorder is captured automatically from the signed-in user."],
      ["checklistInspectedBy", "Inspector is captured automatically from the signed-in user."],
      ["inspectionBy", "Inspector is captured automatically from the signed-in user."]
    ];

    mapping.forEach(([id, text]) => {
      const input = $(id);
      if (!input) return;

      input.value = "";
      input.placeholder = text;
      input.disabled = true;

      const field = input.closest(".field");
      if (field && !field.querySelector(".auto-actor-note")) {
        const note = document.createElement("div");
        note.className = "field-help auto-actor-note";
        note.textContent = text;
        field.appendChild(note);
      }
    });
  }

  function addStyles() {
    if ($("maiEventWorkspaceStyles")) return;

    const style = document.createElement("style");
    style.id = "maiEventWorkspaceStyles";
    style.textContent = `
      .mai-workspace {
        border: 2px solid #9fc6ef;
        border-radius: 14px;
        padding: 10px;
        background: #f8fbff;
      }

      .mai-workspace-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 10px;
      }

      .mai-event-layout {
        display: grid;
        grid-template-columns: minmax(360px, .9fr) minmax(420px, 1.1fr);
        gap: 10px;
      }

      .mai-event-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 520px;
        overflow: auto;
      }

      .mai-event-card,
      .mai-event-detail,
      .mai-evidence-card,
      .mai-evidence-upload-box {
        border: 1px solid #b7d3f1;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px;
      }

      .mai-event-selected {
        border: 2px solid #062a5e;
        background: #eef6ff;
      }

      .mai-event-card-main {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
      }

      .mai-event-actions {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .mai-event-title,
      .mai-evidence-title {
        color: #062a5e;
        font-weight: 900;
        line-height: 1.25;
      }

      .mai-event-detail h4 {
        margin: 0 0 6px;
        color: #062a5e;
      }

      .mai-event-detail-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }

      .mai-evidence-upload-box {
        margin-top: 10px;
      }

      .mai-evidence-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 10px;
      }

      .mai-evidence-card a {
        color: #062a5e;
        font-weight: 800;
      }

      #maiRunEvidenceBox input[type="file"],
      .mai-evidence-upload-box input[type="file"] {
        border: 1px solid #bfd5ee;
        border-radius: 10px;
        padding: 7px;
        background: #fff;
        max-width: 520px;
      }

      @media (max-width: 1100px) {
        .mai-event-layout {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      softenIdentityFields();

      const hasDetail = !!$("detailPanel") && !$("detailPanel").classList.contains("hidden");
      const host = $("lifecycleEventHistory");
      const currentUniqueId = getUniqueIdFromPage();

      // Important:
      // Do not re-render continuously. Re-rendering destroys selected files in file inputs.
      // Only initialize the workspace when it is missing or when another component is opened.
      const alreadyRenderedFor = host?.getAttribute("data-mai-event-workspace-rendered-for") || "";
      const needsInitialRender =
        hasDetail &&
        host &&
        currentUniqueId &&
        currentUniqueId !== "Component Detail" &&
        alreadyRenderedFor !== currentUniqueId;

      if (needsInitialRender) {
        window.setTimeout(refreshWorkspace, 350);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function init() {
    window.CSVB_MAI_EVENT_WORKSPACE_BUILD = BUILD;

    addStyles();

    try {
      const bundle = await window.AUTH.getSessionUserProfile();
      currentUser = bundle?.profile || null;

      const role = currentUser?.role || "";
      isOfficeOrPlatform = [
        "super_admin",
        "platform_owner",
        "company_admin",
        "company_superintendent"
      ].includes(role);
    } catch (_) {
      currentUser = null;
      isOfficeOrPlatform = false;
    }

    softenIdentityFields();
    startObserver();

    // Keep auto-actor field softening, but do not auto-refresh the event workspace.
    // Auto-refresh destroys selected files in browser file inputs.
    window.setInterval(() => {
      softenIdentityFields();
    }, 4500);

    window.setTimeout(refreshWorkspace, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(console.error));
  } else {
    init().catch(console.error);
  }
})();