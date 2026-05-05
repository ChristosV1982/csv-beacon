// public/csvb-threads-related-delete.js
// C.S.V. BEACON — T-10B related threads + soft-delete UI.
// Separate extension. Minimal coupling to threads.js.

(() => {
  "use strict";

  const BUILD = "T10B-THREADS-RELATED-DELETE-2026-05-05";

  let sb = null;
  let currentUserRole = "";

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

  function isDeleteRole(role) {
    return ["super_admin", "platform_owner", "company_admin"].includes(String(role || ""));
  }

  function activeCompanyId() {
    const sel = el("platformCompanySelect");
    return sel?.value || null;
  }

  function urlParams() {
    return new URLSearchParams(window.location.search || "");
  }

  function relevantContextExists() {
    const p = urlParams();
    return !!(
      p.get("source") ||
      p.get("qid") ||
      p.get("question_no") ||
      p.get("pgno_text") ||
      p.get("origin_id") ||
      p.get("origin_observation_id")
    );
  }

  function pgnoIndexParam() {
    const raw = urlParams().get("pgno_index");
    const n = Number(raw || 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function ensureRelatedCard() {
    let card = el("csvbRelatedThreadsCard");
    if (card) return card;

    card = document.createElement("section");
    card.id = "csvbRelatedThreadsCard";
    card.className = "card";
    card.style.display = "none";
    card.innerHTML = `
      <div class="section-head">
        <h2>Existing related threads</h2>
        <button class="secondary" id="csvbReloadRelatedThreadsBtn" type="button">Reload related</button>
      </div>
      <div class="compact-note">
        Existing threads found for the source question / PGNO / observation. Open one instead of creating a duplicate.
      </div>
      <div id="csvbRelatedThreadsList" class="notification-list muted">No related threads loaded.</div>
    `;

    const platformCard = el("platformCompanyCard");
    if (platformCard) {
      platformCard.insertAdjacentElement("afterend", card);
    } else {
      const hero = document.querySelector(".hero");
      hero?.insertAdjacentElement("afterend", card);
    }

    el("csvbReloadRelatedThreadsBtn")?.addEventListener("click", loadRelatedThreads);

    return card;
  }

  async function loadRelatedThreads() {
    if (!relevantContextExists()) return;

    const p = urlParams();
    const card = ensureRelatedCard();
    const list = el("csvbRelatedThreadsList");

    if (!list) return;

    const companyId = activeCompanyId();

    try {
      const rows = await rpc("csvb_related_threads_for_me", {
        p_company_id: companyId,
        p_source_module: p.get("source") === "post_inspection_observation" ? "post_inspection" : "questions",
        p_source_record_id: p.get("origin_id") || p.get("origin_observation_id") || null,
        p_questionnaire_id: p.get("qid") || null,
        p_question_no: p.get("question_no") || null,
        p_pgno_index: pgnoIndexParam(),
        p_pgno_text: p.get("pgno_text") || null
      });

      if (!rows.length) {
        card.style.display = "block";
        list.innerHTML = `<div class="muted">No existing related threads found.</div>`;
        return;
      }

      card.style.display = "block";
      list.innerHTML = rows.map((r) => `
        <div class="notification-item">
          <div class="thread-title">${esc(r.title)}</div>
          <div class="muted">
            ${esc(r.status)} • ${esc(r.priority)} • ${esc(r.question_no || "")}
            ${r.pgno_code ? " • " + esc(r.pgno_code) : ""}
            • ${esc(r.message_count || 0)} message(s)
          </div>
          <div class="message-meta">
            Updated: ${esc(r.last_message_at || r.updated_at || r.created_at || "")}
          </div>
          <div style="margin-top:6px;">
            <button class="secondary" type="button" data-related-open="${esc(r.id)}">Open existing</button>
          </div>
        </div>
      `).join("");

      list.querySelectorAll("[data-related-open]").forEach((btn) => {
        btn.addEventListener("click", () => openThreadById(btn.getAttribute("data-related-open")));
      });
    } catch (e) {
      card.style.display = "block";
      list.innerHTML = `<div class="msg err" style="display:block;">Could not load related threads:\n${esc(e?.message || e)}</div>`;
    }
  }

  function openThreadById(id) {
    if (!id) return;

    if (typeof window.CSVB_THREADS_OPEN_THREAD === "function") {
      window.CSVB_THREADS_OPEN_THREAD(id);
      return;
    }

    const btn = document.querySelector(`[data-open-thread="${CSS.escape(id)}"]`);
    if (btn) btn.click();
  }

  async function deleteThread(id) {
    if (!id) return;

    const reason = prompt(
      "Delete/archive this thread?\n\nThis is a controlled soft-delete. The thread will be removed from normal lists but retained in the database audit trail.\n\nReason (optional):",
      ""
    );

    if (reason === null) return;

    const ok = confirm("Confirm delete/archive of this thread?");
    if (!ok) return;

    try {
      await rpc("csvb_delete_thread", {
        p_thread_id: id,
        p_reason: reason || null
      });

      if (typeof window.CSVB_THREADS_RELOAD === "function") {
        await window.CSVB_THREADS_RELOAD();
      } else {
        window.location.reload();
      }
    } catch (e) {
      alert("Delete failed:\n" + (e?.message || String(e)));
    }
  }

  function addDeleteButtons() {
    if (!isDeleteRole(currentUserRole)) return;

    document.querySelectorAll("[data-open-thread]").forEach((openBtn) => {
      const id = openBtn.getAttribute("data-open-thread");
      const td = openBtn.closest("td");
      if (!td || !id) return;

      if (td.querySelector(`[data-delete-thread="${CSS.escape(id)}"]`)) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "secondary";
      btn.textContent = "Delete";
      btn.setAttribute("data-delete-thread", id);
      btn.setAttribute("data-csvb-help", "Delete/archive this thread. Available only to superadmin/platform owner/company admin.");
      btn.style.marginLeft = "6px";

      btn.addEventListener("click", () => deleteThread(id));

      td.appendChild(btn);
    });
  }

  async function init() {
    window.CSVB_THREADS_RELATED_DELETE_BUILD = BUILD;

    if (!window.AUTH?.ensureSupabase) return;

    sb = window.AUTH.ensureSupabase();

    try {
      const bundle = await window.AUTH.getSessionUserProfile?.();
      currentUserRole = bundle?.profile?.role || "";
    } catch (_) {
      currentUserRole = "";
    }

    /* Wait for main threads.js to render. */
    setTimeout(addDeleteButtons, 800);
    setTimeout(addDeleteButtons, 1800);
    setInterval(addDeleteButtons, 1500);

    setTimeout(loadRelatedThreads, 1200);

    el("platformCompanySelect")?.addEventListener("change", () => {
      setTimeout(loadRelatedThreads, 400);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
