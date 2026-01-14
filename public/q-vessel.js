// public/q-vessel.js
// Requires in q-vessel.html:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="./auth.js"></script>

const sb = window.AUTH.ensureSupabase();

function el(id) {
  return document.getElementById(id);
}

function showWarn(msg) {
  const w = el("warnBox");
  w.textContent = msg;
  w.style.display = "block";
}

function clearWarn() {
  const w = el("warnBox");
  w.textContent = "";
  w.style.display = "none";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtTs(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function assignedLabel(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "All roles";
  if (s === "master") return "Master";
  if (s === "chief_officer") return "Chief Officer";
  if (s === "chief_engineer") return "Chief Engineer";
  return s;
}

function statusPill(status) {
  const s = String(status || "");
  const label =
    s === "in_progress"
      ? "In Progress"
      : s === "pending_office_review"
      ? "Pending Office Review"
      : s === "submitted"
      ? "Submitted"
      : s || "-";
  return `<span class="pill">${esc(label)}</span>`;
}

function typeLabel(_) {
  // You had a "Type" column; without querying a `mode` column (to avoid the Postgres mode() error),
  // we show a neutral placeholder for now.
  return "—";
}

async function loadMyQuestionnaires({ vesselId, vesselPosition, isMaster, status }) {
  let q = sb
    .from("questionnaires")
    // IMPORTANT: do NOT select "mode" here (can trigger Postgres mode() aggregate error)
    .select("id, title, status, updated_at, created_at, assigned_position")
    .eq("vessel_id", vesselId)
    .order("updated_at", { ascending: false });

  if (status) q = q.eq("status", status);

  if (!isMaster) {
    // allow NULL (All roles) OR matches my position
    if (vesselPosition) {
      q = q.or(`assigned_position.is.null,assigned_position.eq.${vesselPosition}`);
    } else {
      // unknown vessel position => only All roles
      q = q.is("assigned_position", null);
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function renderRows(rows) {
  const body = el("rowsBody");
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">No questionnaires found.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      return `
        <tr>
          <td>
            <div style="font-weight:950;">${esc(r.title || "")}</div>
            <div class="muted" style="font-size:.9rem;">ID: ${esc(r.id)}</div>
          </td>
          <td>${esc(assignedLabel(r.assigned_position))}</td>
          <td>${esc(typeLabel(r))}</td>
          <td>${esc(fmtTs(r.updated_at || r.created_at))}</td>
          <td>${statusPill(r.status)}</td>
          <td>
            <button class="btn2" type="button" data-open="1" data-id="${esc(r.id)}">Open</button>
          </td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("button[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const qid = btn.getAttribute("data-id");
      if (!qid) return;
      localStorage.setItem("active_qid", qid);
      window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
    });
  });
}

async function refresh(me) {
  clearWarn();

  const vesselId = me.profile?.vessel_id;
  if (!vesselId) {
    showWarn("Your profile has no vessel_id. This vessel account cannot load questionnaires.");
    return;
  }

  const vesselPosition = window.AUTH.deriveVesselPosition(me.profile?.username);
  const isMaster = vesselPosition === "master";

  const status = el("statusFilter").value;

  const rows = await loadMyQuestionnaires({
    vesselId,
    vesselPosition,
    isMaster,
    status,
  });

  renderRows(rows);
}

async function init() {
  // Vessel page must be vessel role only
  const me = await window.AUTH.requireAuth(["vessel"], {
    unauthorizedRedirect: "./q-dashboard.html",
  });
  if (!me) return;

  el("userBadge").textContent = `User: ${me.profile?.username || "(unknown)"} | Role: ${me.profile?.role || ""}`;

  el("refreshBtn").addEventListener("click", () => refresh(me));
  el("statusFilter").addEventListener("change", () => refresh(me));

  el("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "./login.html";
  });

  await refresh(me);
}

init().catch((e) => showWarn(String(e?.message || e)));
