// public/mooring-anchoring-evidence-extension.js
// C.S.V. BEACON – MAI Evidence Upload Extension
// Adds photo evidence upload/list/delete for lifecycle events and checklist runs.

(() => {
  "use strict";

  const BUILD = "MAI-EVIDENCE-20260511-1";
  const BUCKET = "mai-evidence";

  let componentCache = null;
  let attachmentsCache = [];
  let eventsCache = [];
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

  function showMessage(type, message) {
    const box = type === "ok" ? $("okBox") : $("warnBox");
    if (!box) {
      alert(message);
      return;
    }

    box.textContent = message || "";
    box.style.display = message ? "block" : "none";

    if (type === "ok" && message) {
      window.setTimeout(() => {
        box.textContent = "";
        box.style.display = "none";
      }, 4500);
    }
  }

  function formatDate(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function formatFileSize(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

  function selectedRunIsCompletedOrVoided() {
    const text = selectedRunText().toLowerCase();
    return text.includes("completed") || text.includes("voided");
  }

  function sanitizeFileName(name) {
    const raw = String(name || "file").trim() || "file";
    return raw
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
  }

  function makeObjectPath(component, file) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random =
      window.crypto?.randomUUID?.() ||
      Math.random().toString(36).slice(2);

    const safeName = `${stamp}_${random}_${sanitizeFileName(file.name)}`;

    return `${component.company_id}/${component.vessel_id}/${component.id}/${safeName}`;
  }

  async function getComponent() {
    const uniqueId = getUniqueIdFromPage();

    if (!uniqueId || uniqueId === "Component Detail") return null;

    if (componentCache && componentCache.unique_id === uniqueId) {
      return componentCache;
    }

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb
      .from("mai_v_components_list")
      .select("id, company_id, company_name, vessel_id, vessel_name, unique_id")
      .eq("unique_id", uniqueId)
      .limit(1)
      .single();

    if (error) throw error;

    componentCache = data;
    return componentCache;
  }

  async function refreshCaches() {
    const component = await getComponent();
    if (!component) return null;

    const sb = window.AUTH.ensureSupabase();

    const [attachmentsResult, eventsResult] = await Promise.all([
      sb
        .from("mai_v_component_attachments_list")
        .select("*")
        .eq("component_id", component.id)
        .order("uploaded_at", { ascending: false }),

      sb
        .from("mai_v_lifecycle_events_list")
        .select("*")
        .eq("component_id", component.id)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
    ]);

    if (attachmentsResult.error) throw attachmentsResult.error;
    if (eventsResult.error) throw eventsResult.error;

    attachmentsCache = attachmentsResult.data || [];
    eventsCache = eventsResult.data || [];

    return component;
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
    inspectionAnswerId = null,
    evidenceContext = "general",
    remarks = null
  }) {
    const component = await getComponent();

    if (!component) {
      showMessage("warn", "No component is open.");
      return;
    }

    if (!files || !files.length) {
      showMessage("warn", "Select one or more image files first.");
      return;
    }

    const sb = window.AUTH.ensureSupabase();

    let uploaded = 0;

    for (const file of Array.from(files)) {
      if (!String(file.type || "").startsWith("image/")) {
        throw new Error(`Only image files are accepted. Rejected: ${file.name}`);
      }

      const filePath = makeObjectPath(component, file);

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
        p_attachment_type: "photo_evidence",
        p_lifecycle_event_id: lifecycleEventId,
        p_inspection_run_id: inspectionRunId,
        p_inspection_answer_id: inspectionAnswerId,
        p_evidence_context: evidenceContext,
        p_is_photo_evidence: true,
        p_remarks: remarks
      });

      if (registerError) throw registerError;

      uploaded += 1;
    }

    showMessage("ok", `${uploaded} evidence file(s) uploaded.`);

    await refreshAndRender();
  }

  async function deleteAttachment(attachmentId) {
    const reason = prompt("Reason for deleting this evidence file:", "Uploaded by mistake.");
    if (reason === null) return;

    const ok = confirm(
      "Delete this evidence record?\n\n" +
      "This is a soft delete. The file record remains auditable."
    );

    if (!ok) return;

    const sb = window.AUTH.ensureSupabase();

    const { error } = await sb.rpc("mai_soft_delete_component_attachment", {
      p_attachment_id: attachmentId,
      p_delete_reason: reason || null
    });

    if (error) throw error;

    showMessage("ok", "Evidence file deleted.");
    await refreshAndRender();
  }

  function evidenceStatusLabel(required, min, count, status) {
    if (!required) return "Not required";
    return `${count}/${min || 0} photo(s) — ${String(status || "required_missing").replaceAll("_", " ")}`;
  }

  function evidenceStatusClass(status) {
    if (status === "complete") return "lifecycle-ok";
    if (status === "required_missing") return "lifecycle-overdue";
    return "lifecycle-event-based";
  }

  async function renderAttachmentListItem(a) {
    const url = await signedUrl(a.file_path);

    return `
      <div class="mini-item" data-mai-attachment-id="${esc(a.attachment_id)}">
        <div class="mini-title">
          ${esc(a.file_name || "Evidence file")}
          <span class="lifecycle-pill lifecycle-event-based">${esc(a.evidence_context || a.attachment_type || "evidence")}</span>
        </div>

        <div class="mini-meta">
          Uploaded: ${esc(formatDate(a.uploaded_at))}
          / By: ${esc(a.uploaded_by_username || "—")}
          / Size: ${esc(formatFileSize(a.file_size_bytes))}
        </div>

        ${
          url
            ? `<div class="mini-meta"><a href="${esc(url)}" target="_blank" rel="noopener">Open evidence file</a></div>`
            : `<div class="mini-meta">Could not create file preview link.</div>`
        }

        ${a.remarks ? `<div class="mini-meta">Remarks: ${esc(a.remarks)}</div>` : ""}

        <div class="actions-row" style="margin-top:8px;">
          <button class="btnDanger compact" type="button" data-mai-delete-attachment="${esc(a.attachment_id)}">
            Delete Evidence
          </button>
        </div>
      </div>
    `;
  }

  async function renderAttachmentsBox() {
    const host = $("attachmentsBox");
    if (!host) return;

    host.setAttribute("data-mai-evidence-rendered", "1");

    if (!attachmentsCache.length) {
      host.innerHTML = `<div class="hint-text">No evidence files uploaded yet.</div>`;
      return;
    }

    const htmlParts = [];

    for (const a of attachmentsCache) {
      htmlParts.push(await renderAttachmentListItem(a));
    }

    host.innerHTML = htmlParts.join("");

    host.querySelectorAll("[data-mai-delete-attachment]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteAttachment(btn.getAttribute("data-mai-delete-attachment")).catch((error) => {
          console.error(error);
          showMessage("warn", String(error?.message || error || "Could not delete attachment."));
        });
      });
    });
  }

  function renderRunEvidenceControls() {
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

    const runFiles = attachmentsCache.filter((a) => a.inspection_run_id === runId);
    const isLocked = selectedRunIsCompletedOrVoided();

    const filesHtml = runFiles.length
      ? runFiles.map((a) => `<div class="mini-meta">• ${esc(a.file_name)} / ${esc(formatFileSize(a.file_size_bytes))}</div>`).join("")
      : `<div class="hint-text">No checklist evidence uploaded yet.</div>`;

    box.innerHTML = `
      <div class="mini-title">Checklist Run Evidence</div>
      <div class="mini-meta">
        Linked evidence files: ${esc(runFiles.length)}
        ${isLocked ? " / completed or voided run" : ""}
      </div>

      ${filesHtml}

      <div class="actions-row" style="margin-top:8px;">
        <input id="maiRunEvidenceFiles" type="file" accept="image/*" multiple ${isLocked ? "disabled" : ""} />
        <button id="maiUploadRunEvidenceBtn" class="btn2 compact" type="button" ${isLocked ? "disabled" : ""}>
          Upload Checklist Photos
        </button>
      </div>
    `;

    $("maiUploadRunEvidenceBtn")?.addEventListener("click", () => {
      const input = $("maiRunEvidenceFiles");
      uploadEvidenceFiles({
        files: input?.files || [],
        inspectionRunId: runId,
        evidenceContext: "inspection_run"
      }).catch((error) => {
        console.error(error);
        showMessage("warn", String(error?.message || error || "Could not upload checklist evidence."));
      });
    });
  }

  function renderEventEvidenceControls() {
    document.querySelectorAll("[data-mai-event-id]").forEach((card) => {
      const eventId = card.getAttribute("data-mai-event-id");
      if (!eventId) return;

      const event = eventsCache.find((e) => e.event_id === eventId);
      if (!event) return;

      let host = card.querySelector("[data-mai-event-evidence-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-mai-event-evidence-host", eventId);
        host.className = "mini-item";
        host.style.marginTop = "8px";
        card.appendChild(host);
      }

      const files = attachmentsCache.filter((a) => a.lifecycle_event_id === eventId);
      const locked = event.review_status === "reviewed";

      const statusText = evidenceStatusLabel(
        event.evidence_required,
        event.min_evidence_files,
        files.length,
        event.evidence_status
      );

      const filesHtml = files.length
        ? files.map((a) => `<div class="mini-meta">• ${esc(a.file_name)} / ${esc(formatFileSize(a.file_size_bytes))}</div>`).join("")
        : `<div class="hint-text">No event evidence uploaded yet.</div>`;

      host.innerHTML = `
        <div class="mini-title">
          Event Evidence
          <span class="lifecycle-pill ${evidenceStatusClass(event.evidence_status)}">${esc(statusText)}</span>
        </div>

        ${filesHtml}

        <div class="actions-row" style="margin-top:8px;">
          <input id="maiEventEvidenceFiles_${esc(eventId)}" type="file" accept="image/*" multiple ${locked ? "disabled" : ""} />
          <button class="btn2 compact" type="button" data-mai-upload-event-evidence="${esc(eventId)}" ${locked ? "disabled" : ""}>
            Upload Event Photos
          </button>
        </div>

        ${locked ? `<div class="hint-text">Reviewed event: vessel-side evidence changes are locked.</div>` : ""}
      `;

      host.querySelector("[data-mai-upload-event-evidence]")?.addEventListener("click", () => {
        const input = host.querySelector(`#maiEventEvidenceFiles_${CSS.escape(eventId)}`);
        uploadEvidenceFiles({
          files: input?.files || [],
          lifecycleEventId: eventId,
          evidenceContext: "lifecycle_event"
        }).catch((error) => {
          console.error(error);
          showMessage("warn", String(error?.message || error || "Could not upload event evidence."));
        });
      });
    });
  }

  async function refreshAndRender() {
    if (busy) return;
    busy = true;

    try {
      const component = await refreshCaches();
      if (!component) return;

      await renderAttachmentsBox();
      renderRunEvidenceControls();
      renderEventEvidenceControls();
    } catch (error) {
      console.error("MAI evidence extension error:", error);
    } finally {
      busy = false;
    }
  }

  function addStyles() {
    if (document.getElementById("maiEvidenceExtensionStyles")) return;

    const style = document.createElement("style");
    style.id = "maiEvidenceExtensionStyles";
    style.textContent = `
      #maiRunEvidenceBox input[type="file"],
      [data-mai-event-evidence-host] input[type="file"] {
        border: 1px solid #bfd5ee;
        border-radius: 10px;
        padding: 7px;
        background: #fff;
        max-width: 420px;
      }

      #attachmentsBox a {
        color: #062a5e;
        font-weight: 700;
      }
    `;

    document.head.appendChild(style);
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      const hasDetail = !!$("detailPanel") && !$("detailPanel").classList.contains("hidden");
      if (hasDetail) {
        window.setTimeout(refreshAndRender, 350);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    window.CSVB_MAI_EVIDENCE_EXTENSION_BUILD = BUILD;

    addStyles();
    startObserver();

    window.setInterval(() => {
      const hasDetail = !!$("detailPanel") && !$("detailPanel").classList.contains("hidden");
      if (hasDetail) refreshAndRender();
    }, 3500);

    window.setTimeout(refreshAndRender, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();