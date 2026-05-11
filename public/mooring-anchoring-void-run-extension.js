// public/mooring-anchoring-void-run-extension.js
// C.S.V. BEACON – MAI Checklist Void Draft Run Extension
// Adds a safe "Void Selected Draft Run" control without touching the main MAI JS.

(() => {
  "use strict";

  const BUILD = "MAI-VOID-RUN-20260511-1";

  function $(id) {
    return document.getElementById(id);
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

  function selectedRunText() {
    const select = $("checklistRunSelect");
    if (!select || !select.value) return "";
    return select.options[select.selectedIndex]?.textContent || "";
  }

  function selectedRunId() {
    const select = $("checklistRunSelect");
    return select?.value || "";
  }

  function isSelectedRunDraft() {
    const text = selectedRunText().toLowerCase();
    return text.includes("draft") && !text.includes("completed") && !text.includes("voided");
  }

  function refreshVoidButtonState() {
    const btn = $("voidChecklistRunBtn");
    const reason = $("voidChecklistReason");

    if (!btn) return;

    const hasRun = !!selectedRunId();
    const isDraft = isSelectedRunDraft();

    btn.disabled = !(hasRun && isDraft);

    if (reason) {
      reason.disabled = !(hasRun && isDraft);
    }

    if (!hasRun) {
      btn.title = "Select a checklist run first.";
    } else if (!isDraft) {
      btn.title = "Only draft checklist runs can be voided.";
    } else {
      btn.title = "Void / cancel the selected draft checklist run.";
    }
  }

  function insertControls() {
    if ($("voidChecklistRunBtn")) return;

    const runSelect = $("checklistRunSelect");
    const reloadBtn = $("reloadChecklistRunsBtn");

    if (!runSelect || !reloadBtn) return;

    const host = reloadBtn.closest(".actions-row");
    if (!host) return;

    const wrapper = document.createElement("div");
    wrapper.id = "voidChecklistRunControls";
    wrapper.className = "actions-row";
    wrapper.style.marginTop = "8px";
    wrapper.innerHTML = `
      <label class="field" style="min-width:320px; flex:1;">
        <span>Void Reason</span>
        <input id="voidChecklistReason" placeholder="Reason for voiding selected draft checklist run" />
      </label>
      <button id="voidChecklistRunBtn" class="btnDanger" type="button">
        Void Selected Draft Run
      </button>
    `;

    host.insertAdjacentElement("afterend", wrapper);

    runSelect.addEventListener("change", refreshVoidButtonState);

    $("voidChecklistRunBtn").addEventListener("click", async () => {
      const runId = selectedRunId();

      if (!runId) {
        showMessage("warn", "Select a checklist run first.");
        return;
      }

      if (!isSelectedRunDraft()) {
        showMessage("warn", "Only draft checklist runs can be voided. Completed runs are locked.");
        return;
      }

      const reason = $("voidChecklistReason")?.value || "";

      const ok = confirm(
        "Void the selected draft checklist run?\n\n" +
        "This will not delete the run. It will be marked as voided and kept for audit trail."
      );

      if (!ok) return;

      try {
        const sb = window.AUTH.ensureSupabase();

        const { error } = await sb.rpc("mai_void_inspection_run", {
          p_run_id: runId,
          p_void_reason: reason || null
        });

        if (error) throw error;

        showMessage("ok", "Draft checklist run voided.");

        // Reload the page to force the main MAI module to reload all lists and run history cleanly.
        window.setTimeout(() => {
          window.location.reload();
        }, 700);
      } catch (error) {
        console.error("Void checklist run error:", error);
        showMessage("warn", String(error?.message || error || "Could not void checklist run."));
      }
    });

    refreshVoidButtonState();

    window.CSVB_MAI_VOID_RUN_EXTENSION = {
      build: BUILD,
      refresh: refreshVoidButtonState
    };
  }

  function init() {
    // The main MAI page builds some controls asynchronously, so retry briefly.
    let attempts = 0;

    const timer = window.setInterval(() => {
      attempts += 1;
      insertControls();

      if ($("voidChecklistRunBtn") || attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();