// public/mooring-anchoring-checklist-run-actions-extension.js
// C.S.V. BEACON – MAI Checklist Run Actions
// Adds per-run Load and Delete Draft buttons. Completed/finalized runs remain locked.

(() => {
  "use strict";

  const BUILD = "MAI-CHECKLIST-RUN-ACTIONS-20260511-1";

  let componentCache = null;
  let runsCache = [];
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
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
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

  function formatNumber(value, decimals = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return n.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0
    });
  }

  function runStatusClass(status) {
    if (status === "completed") return "pill-muted";
    if (status === "draft") return "pill-warn";
    if (status === "voided") return "pill-danger";
    return "";
  }

  function getComponentIdFromUrl() {
    return new URLSearchParams(location.search).get("id") || "";
  }

  function getUniqueIdFromPage() {
    const text = $("detailTitle")?.textContent || "";
    return text.trim();
  }

  async function getComponent() {
    const urlId = getComponentIdFromUrl();

    if (componentCache && (componentCache.id === urlId || componentCache.unique_id === getUniqueIdFromPage())) {
      return componentCache;
    }

    const sb = window.AUTH.ensureSupabase();

    if (urlId) {
      const { data, error } = await sb
        .from("mai_v_components_list")
        .select("id, unique_id")
        .eq("id", urlId)
        .limit(1)
        .single();

      if (error) throw error;
      componentCache = data;
      return componentCache;
    }

    const uniqueId = getUniqueIdFromPage();

    if (!uniqueId || uniqueId === "Component Detail") {
      return null;
    }

    const { data, error } = await sb
      .from("mai_v_components_list")
      .select("id, unique_id")
      .eq("unique_id", uniqueId)
      .limit(1)
      .single();

    if (error) throw error;

    componentCache = data;
    return componentCache;
  }

  async function loadRuns() {
    const component = await getComponent();
    if (!component) return [];

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb
      .from("mai_v_inspection_runs_list")
      .select("*")
      .eq("component_id", component.id)
      .order("inspection_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    runsCache = data || [];
    return runsCache;
  }

  function renderRuns() {
    const host = $("checklistRunsHistory");
    if (!host) return;

    host.setAttribute("data-mai-checklist-actions-rendered", "1");

    if (!runsCache.length) {
      host.innerHTML = `<div class="hint-text">No checklist runs yet.</div>`;
      return;
    }

    host.innerHTML = runsCache.map((r) => {
      const isDraft = r.run_status === "draft";
      const isCompleted = r.run_status === "completed";
      const isVoided = r.run_status === "voided";

      return `
        <div class="mini-item" data-mai-run-id="${esc(r.run_id)}">
          <div class="mini-title">
            ${esc(r.form_code || "")} — ${esc(r.template_title || "")}
            <span class="pill ${runStatusClass(r.run_status)}">${esc(r.run_status || "—")}</span>
          </div>

          <div class="mini-meta">
            Inspection date: ${esc(formatDate(r.inspection_date))}
            / Inspected by: ${esc(r.inspected_by || "—")}
          </div>

          <div class="mini-meta">
            Answered: ${esc(r.answered_items_count || 0)} / ${esc(r.total_score_items_count || 0)}
            / Average: ${esc(r.average_score === null || r.average_score === undefined ? "—" : formatNumber(r.average_score, 2))}
          </div>

          ${r.calculated_condition ? `<div class="mini-meta">Condition: ${esc(r.calculated_condition)}</div>` : ""}
          ${r.calculated_recommendation ? `<div class="mini-meta">Recommendation: ${esc(r.calculated_recommendation)}</div>` : ""}

          <div class="actions-row" style="margin-top:8px;">
            <button class="btn2 compact" type="button" data-mai-load-run="${esc(r.run_id)}">Load / View</button>

            ${
              isDraft
                ? `<button class="btnDanger compact" type="button" data-mai-delete-draft-run="${esc(r.run_id)}">Delete Draft</button>`
                : isCompleted
                  ? `<span class="hint-text">Completed run locked. It cannot be deleted by vessel users.</span>`
                  : isVoided
                    ? `<span class="hint-text">Draft already deleted / voided.</span>`
                    : ""
            }
          </div>
        </div>
      `;
    }).join("");

    host.querySelectorAll("[data-mai-load-run]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const runId = btn.getAttribute("data-mai-load-run");
        const select = $("checklistRunSelect");
        const loadBtn = $("loadChecklistRunBtn");

        if (select && loadBtn) {
          select.value = runId;
          loadBtn.click();
        } else {
          toast("info", "Checklist run detail loading will be connected to the separated component page in the next step.");
        }
      });
    });

    host.querySelectorAll("[data-mai-delete-draft-run]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteDraftRun(btn.getAttribute("data-mai-delete-draft-run")).catch((error) => {
          console.error(error);
          toast("warn", String(error?.message || error || "Could not delete draft checklist run."));
        });
      });
    });
  }

  async function deleteDraftRun(runId) {
    const run = runsCache.find((r) => r.run_id === runId);

    if (!run) {
      toast("warn", "Checklist run was not found.");
      return;
    }

    if (run.run_status !== "draft") {
      toast("warn", "Only draft checklist runs can be deleted. Completed/finalized runs are locked.");
      return;
    }

    const reason = prompt("Reason for deleting this draft checklist run:", "Draft checklist run deleted by user.");
    if (reason === null) return;

    const ok = confirm(
      "Delete this draft checklist run?\n\n" +
      "This is a soft delete / void action. It remains auditable and is not physically removed."
    );

    if (!ok) return;

    const sb = window.AUTH.ensureSupabase();

    const { error } = await sb.rpc("mai_void_inspection_run", {
      p_run_id: runId,
      p_void_reason: reason || null
    });

    if (error) throw error;

    toast("ok", "Draft checklist run deleted / voided.");

    await refresh();
  }

  async function refresh() {
    if (busy) return;
    busy = true;

    try {
      const host = $("checklistRunsHistory");
      if (!host) return;

      await loadRuns();
      renderRuns();
    } finally {
      busy = false;
    }
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      const host = $("checklistRunsHistory");
      const detailVisible = !$("detailPanel") || !$("detailPanel").classList.contains("hidden");

      if (!host || !detailVisible) return;

      const rendered = host.getAttribute("data-mai-checklist-actions-rendered") === "1";

      if (!rendered) {
        window.setTimeout(refresh, 300);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    window.CSVB_MAI_CHECKLIST_RUN_ACTIONS_BUILD = BUILD;

    startObserver();

    window.setTimeout(refresh, 1000);
    window.setTimeout(refresh, 2200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
