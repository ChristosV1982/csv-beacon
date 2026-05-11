// public/mooring-anchoring-governance-extension.js
// C.S.V. BEACON – MAI Governance Extension
// Adds lifecycle event review/delete/evidence display and hides manual name/rank fields.

(() => {
  "use strict";

  const BUILD = "MAI-GOV-20260511-1";

  let currentUser = null;
  let isOfficeOrPlatform = false;
  let refreshBusy = false;

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

  function getUniqueIdFromPage() {
    const text = $("detailTitle")?.textContent || "";
    return text.trim();
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

  function actorLine(row) {
    const parts = [
      row.created_by_username,
      row.created_by_position,
      row.created_by_role
    ].filter(Boolean);

    if (parts.length) return parts.join(" / ");
    return row.performed_by || "Recorded user not available";
  }

  async function loadEvents(uniqueId) {
    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb
      .from("mai_v_lifecycle_events_list")
      .select("*")
      .eq("unique_id", uniqueId)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  }

  function renderEnhancedLifecycleEvents(rows) {
    const host = $("lifecycleEventHistory");
    if (!host) return;

    host.setAttribute("data-mai-governance-rendered", "1");

    if (!rows.length) {
      host.innerHTML = `<div class="hint-text">No lifecycle events yet.</div>`;
      return;
    }

    host.innerHTML = rows.map((r) => {
      const canReview = isOfficeOrPlatform && r.review_status === "pending";
      const canDelete = r.review_status !== "reviewed" || isOfficeOrPlatform;

      return `
        <div class="mini-item" data-mai-event-id="${esc(r.event_id)}">
          <div class="mini-title">
            ${esc(r.event_type || "event")} — ${esc(formatDate(r.event_date))}
            ${statusPill(r.review_status)}
            ${r.evidence_required ? evidencePill(r.evidence_status) : ""}
          </div>

          <div class="mini-meta">
            Recorded by: ${esc(actorLine(r))}
          </div>

          <div class="mini-meta">
            Event date: ${esc(formatDate(r.event_date))}
            / Hours at event: ${esc(r.hours_at_event === null || r.hours_at_event === undefined ? "—" : formatNumber(r.hours_at_event))}
          </div>

          <div class="mini-meta">
            Evidence: ${
              r.evidence_required
                ? esc(`Required, minimum ${r.min_evidence_files || 0} file(s)`)
                : "Not required"
            }
          </div>

          ${
            r.review_status === "reviewed" || r.review_status === "rejected"
              ? `<div class="mini-meta">Reviewed by: ${esc(r.reviewed_by_username || "—")} / ${esc(formatDateTime(r.reviewed_at))}</div>`
              : `<div class="mini-meta">Review: Pending Office review</div>`
          }

          ${r.review_remarks ? `<div class="mini-meta">Review remarks: ${esc(r.review_remarks)}</div>` : ""}
          ${r.remarks ? `<div class="mini-meta">Remarks: ${esc(r.remarks)}</div>` : ""}

          <div class="actions-row" style="margin-top:8px;">
            ${
              canReview
                ? `<button class="btn2 compact" type="button" data-mai-review-event="${esc(r.event_id)}">Office Review</button>`
                : ""
            }
            ${
              canDelete
                ? `<button class="btnDanger compact" type="button" data-mai-delete-event="${esc(r.event_id)}">Delete Event</button>`
                : `<span class="hint-text">Reviewed event locked for vessel deletion.</span>`
            }
          </div>
        </div>
      `;
    }).join("");

    host.querySelectorAll("[data-mai-review-event]").forEach((btn) => {
      btn.addEventListener("click", () => reviewEvent(btn.getAttribute("data-mai-review-event")));
    });

    host.querySelectorAll("[data-mai-delete-event]").forEach((btn) => {
      btn.addEventListener("click", () => deleteEvent(btn.getAttribute("data-mai-delete-event")));
    });
  }

  function formatDate(value) {
    if (!value) return "—";
    const raw = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value);
    const [y, m, d] = raw.split("-");
    return `${d}.${m}.${y}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return String(value);
    }
  }

  function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  async function refreshEnhancedLifecycleEvents() {
    if (refreshBusy) return;

    const uniqueId = getUniqueIdFromPage();
    const host = $("lifecycleEventHistory");

    if (!uniqueId || !host || uniqueId === "Component Detail") return;

    refreshBusy = true;

    try {
      const rows = await loadEvents(uniqueId);
      renderEnhancedLifecycleEvents(rows);
    } catch (error) {
      console.error("MAI governance event refresh error:", error);
    } finally {
      refreshBusy = false;
    }
  }

  async function reviewEvent(eventId) {
    const remarks = prompt("Office review remarks:", "Reviewed by Office.");

    try {
      const sb = window.AUTH.ensureSupabase();

      const { error } = await sb.rpc("mai_review_lifecycle_event", {
        p_event_id: eventId,
        p_review_status: "reviewed",
        p_review_remarks: remarks || null
      });

      if (error) throw error;

      showMessage("ok", "Lifecycle event reviewed.");
      await refreshEnhancedLifecycleEvents();
    } catch (error) {
      console.error("Review lifecycle event error:", error);
      showMessage("warn", String(error?.message || error || "Could not review lifecycle event."));
    }
  }

  async function deleteEvent(eventId) {
    const reason = prompt(
      "Reason for deleting this lifecycle event:",
      "Recorded by mistake."
    );

    if (reason === null) return;

    const ok = confirm(
      "Delete this lifecycle event?\n\n" +
      "This is a soft delete. The event remains auditable in the database."
    );

    if (!ok) return;

    try {
      const sb = window.AUTH.ensureSupabase();

      const { error } = await sb.rpc("mai_soft_delete_lifecycle_event", {
        p_event_id: eventId,
        p_delete_reason: reason || null
      });

      if (error) throw error;

      showMessage("ok", "Lifecycle event deleted.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error("Delete lifecycle event error:", error);
      showMessage("warn", String(error?.message || error || "Could not delete lifecycle event."));
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

  async function detectUser() {
    try {
      const bundle = await window.AUTH.getSessionUserProfile();
      currentUser = bundle?.profile || null;

      const role = currentUser?.role || "";
      isOfficeOrPlatform = ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role);
    } catch (_) {
      currentUser = null;
      isOfficeOrPlatform = false;
    }
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      softenIdentityFields();

      const host = $("lifecycleEventHistory");
      if (host && host.getAttribute("data-mai-governance-rendered") !== "1") {
        window.setTimeout(refreshEnhancedLifecycleEvents, 250);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async function init() {
    window.CSVB_MAI_GOVERNANCE_EXTENSION_BUILD = BUILD;

    await detectUser();

    softenIdentityFields();
    startObserver();

    window.setInterval(() => {
      softenIdentityFields();
      refreshEnhancedLifecycleEvents();
    }, 2500);

    window.setTimeout(refreshEnhancedLifecycleEvents, 800);
    window.setTimeout(refreshEnhancedLifecycleEvents, 1600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init().catch(console.error));
  } else {
    init().catch(console.error);
  }
})();