// public/inspection-events-list-v01.js
// C.S.V. BEACON - Inspection Events List v01

const BUILD = "assurance_inspection_events_list_v01_20260602";

const sb = window.AUTH.ensureSupabase();

let PROFILE = null;
let EVENTS = [];

function el(id) {
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

function showWarn(msg) {
  const n = el("warnBox");
  if (!n) return;
  n.textContent = msg || "";
  n.style.display = msg ? "block" : "none";
}

function showOk(msg) {
  const n = el("okBox");
  if (!n) return;
  n.textContent = msg || "";
  n.style.display = msg ? "block" : "none";
}

function clearMessages() {
  showWarn("");
  showOk("");
}

function labelFromSnake(value) {
  return String(value || "-")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function fmtDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function statusPill(status) {
  const v = String(status || "draft").toLowerCase();
  return `<span class="pill ${esc(v)}">${esc(labelFromSnake(v))}</span>`;
}

function currentRows() {
  const term = String(el("searchInput")?.value || "").trim().toLowerCase();
  if (!term) return EVENTS;

  return EVENTS.filter(row => {
    const hay = [
      row.inspection_title,
      row.vessel_name,
      row.question_set_name,
      row.question_set_code,
      row.inspection_type,
      row.event_status,
      row.company_name,
      row.assigned_to_username,
      row.reviewer_username,
      row.remarks
    ].join(" ").toLowerCase();

    return hay.includes(term);
  });
}

function renderEvents() {
  const body = el("eventsBody");
  const count = el("countPill");
  if (!body) return;

  const rows = currentRows();
  if (count) count.textContent = `${rows.length} record${rows.length === 1 ? "" : "s"}`;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="11">No inspection events found.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(row => {
    const qsLine = [
      row.question_set_code ? `<span class="mono">${esc(row.question_set_code)}</span>` : "",
      esc(row.question_set_name || "-")
    ].filter(Boolean).join(" · ");

    const itemLine = `${Number(row.active_item_count || 0)} active / ${Number(row.item_count || 0)} total`;
    const assignedLine = [
      row.assigned_to_username ? `Assigned: ${esc(row.assigned_to_username)}` : "",
      row.reviewer_username ? `Reviewer: ${esc(row.reviewer_username)}` : ""
    ].filter(Boolean).join("<br>") || "-";

    return `
      <tr>
        <td>${statusPill(row.event_status)}</td>
        <td>
          <div><strong>${esc(row.inspection_title || "-")}</strong></div>
          <div class="small mono">${esc(row.id)}</div>
        </td>
        <td>${esc(row.vessel_name || "-")}</td>
        <td>${qsLine}<div class="small">${esc(labelFromSnake(row.question_set_type || ""))} · ${esc(row.source_scope || "")}</div></td>
        <td>${esc(labelFromSnake(row.inspection_type || ""))}</td>
        <td>${esc(fmtDate(row.planned_date))}</td>
        <td>${esc(fmtDate(row.due_date))}</td>
        <td>${esc(itemLine)}</td>
        <td>${assignedLine}</td>
        <td>
          <div>${esc(fmtDateTime(row.created_at))}</div>
          <div class="small">${row.created_by_username ? "By " + esc(row.created_by_username) : ""}</div>
        </td>
        <td>
          <div class="actions">
            <button class="btn secondary" type="button" data-action="copy-id" data-id="${esc(row.id)}">Copy ID</button>
            <button class="btn secondary" type="button" disabled title="Event answering workspace will be added next.">Open</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadEvents() {
  clearMessages();

  const { data, error } = await sb.rpc("csvb_assurance_events_for_me");
  if (error) throw error;

  EVENTS = data || [];
  renderEvents();

  window.CSVB_INSPECTION_EVENTS_LIST = {
    build: BUILD,
    loaded: true,
    event_count: EVENTS.length
  };
}

async function copyEventId(id) {
  try {
    await navigator.clipboard.writeText(id);
    showOk("Inspection event ID copied.");
  } catch {
    showWarn(`Copy failed. Event ID:\n${id}`);
  }
}

function bind() {
  el("logoutBtn")?.addEventListener("click", async () => {
    await window.AUTH.logout();
  });

  el("refreshBtn")?.addEventListener("click", () => {
    loadEvents().catch(e => showWarn(e.message || String(e)));
  });

  el("createPageBtn")?.addEventListener("click", () => {
    location.href = "./inspection-event-create.html";
  });

  el("searchInput")?.addEventListener("input", renderEvents);

  el("eventsBody")?.addEventListener("click", e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    if (btn.dataset.action === "copy-id") {
      copyEventId(btn.dataset.id || "");
    }
  });
}

async function init() {
  try {
    bind();

    const auth = await window.AUTH.setupAuthButtons({ logoutBtnId: "logoutBtn" });
    PROFILE = auth?.profile || null;

    if (el("subLine")) {
      el("subLine").textContent = PROFILE?.username
        ? `${PROFILE.username} · ${PROFILE.role}`
        : "Inspection Events";
    }

    await loadEvents();
  } catch (e) {
    showWarn(e.message || String(e));
    if (el("subLine")) el("subLine").textContent = "Not ready.";
  }
}

init();
