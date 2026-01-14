// public/q-vessel.js
// Lists questionnaires for the logged-in vessel user and opens q-answer.html?qid=...

function el(id) { return document.getElementById(id); }

function showWarn(msg) {
  const w = el("warnBox");
  if (!w) return;
  w.textContent = msg || "";
  w.style.display = msg ? "block" : "none";
}

function ensureSupabase() {
  const sb = window.__supabaseClient;
  if (!sb) throw new Error("Supabase client not initialized. Ensure auth.js is loaded and AUTH.requireAuth() is called.");
  return sb;
}

function fmtDate(d) {
  if (!d) return "-";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

function pill(status) {
  const s = String(status || "unknown").toLowerCase();
  return `<span class="pill">${s}</span>`;
}

function assignedLabel(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "All roles";
  if (s === "master") return "Master";
  if (s === "chief_officer") return "Chief Officer";
  if (s === "chief_engineer") return "Chief Engineer";
  return s;
}

function normalizePosition(pos) {
  const s = String(pos || "").trim().toLowerCase();
  if (!s) return "";
  if (s === "master") return "master";
  if (s === "chief officer") return "chief_officer";
  if (s === "chiefofficer") return "chief_officer";
  if (s === "chief_officer") return "chief_officer";
  if (s === "chief engineer") return "chief_engineer";
  if (s === "chiefengineer") return "chief_engineer";
  if (s === "chief_engineer") return "chief_engineer";
  return s; // if you later extend positions, this preserves value
}

async function loadMyVesselQuestionnaires(supabase, vesselId, status, position) {
  // IMPORTANT:
  // Do NOT select "mode" unless you have a real column named "mode" in public.questionnaires.
  // If not, PostgREST may generate SQL that triggers: "WITHIN GROUP is required for ordered-set aggregate mode".
  let q = supabase
    .from("questionnaires")
    .select("id, title, status, updated_at, created_at, assigned_position, vessel_id")
    .eq("vessel_id", vesselId)
    .order("updated_at", { ascending: false });

  if (status) q = q.eq("status", status);

  const p = normalizePosition(position);

  // Master sees all for vessel
  if (p && p !== "master") {
    // CO/CE see All roles (NULL) OR their assigned role
    q = q.or(`assigned_position.is.null,assigned_position.eq.${p}`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function render(rows) {
  const body = el("rowsBody");
  if (!body) return;

  body.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="6" class="muted">No questionnaires found for this vessel.</td>`;
    body.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900; color:#1a4170;">${r.title || r.id}</div>
        <div class="muted" style="margin-top:4px;">ID: ${r.id}</div>
      </td>
      <td style="font-weight:900; color:#1a4170;">${assignedLabel(r.assigned_position)}</td>
      <td style="font-weight:900; color:#1a4170;">-</td>
      <td style="font-weight:900; color:#1a4170;">${fmtDate(r.updated_at || r.created_at)}</td>
      <td>${pill(r.status)}</td>
      <td><button class="btn2" data-open="${r.id}">Open</button></td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll("button[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.getAttribute("data-open");
      window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
    });
  });
}

async function refresh() {
  showWarn("");

  // Vessel role only
  const me = await AUTH.requireAuth([AUTH.ROLES.VESSEL]);
  if (!me) return;

  AUTH.fillUserBadge(me, "userBadge");
  el("logoutBtn")?.addEventListener("click", AUTH.logoutAndGoLogin);

  const vesselId = me?.profile?.vessel_id;
  const position = me?.profile?.position;

  if (!vesselId) {
    showWarn(
      "Your profile has no vessel_id set. This vessel account is not linked to a vessel.\n" +
      "Fix required: set public.profiles.vessel_id for this user."
    );
    render([]);
    return;
  }

  const supabase = ensureSupabase();
  const status = el("statusFilter")?.value || "";

  const rows = await loadMyVesselQuestionnaires(supabase, vesselId, status, position);
  render(rows);
}

function init() {
  el("refreshBtn")?.addEventListener("click", () => refresh());
  el("statusFilter")?.addEventListener("change", () => refresh());
  refresh().catch(e => {
    console.error(e);
    showWarn(String(e?.message || e));
  });
}

init();
