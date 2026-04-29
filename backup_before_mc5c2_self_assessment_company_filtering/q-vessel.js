// public/q-vessel.js
// Lists questionnaires for the logged-in vessel user.
// Super Admin / Company Admin can select a vessel and view its questionnaires.

function el(id) { return document.getElementById(id); }

function showWarn(msg) {
  const w = el("warnBox");
  if (!w) return;
  w.textContent = msg || "";
  w.style.display = msg ? "block" : "none";
}

function ensureSupabase() {
  const sb = window.__supabaseClient || window.__SUPABASE_CLIENT;
  if (!sb) throw new Error("Supabase client not initialized. Ensure auth.js is loaded.");
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

async function loadVessels(supabase) {
  const { data, error } = await supabase
    .from("vessels")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function loadQuestionnairesForVessel(supabase, vesselId, status, viewerRole, viewerPosition) {
  let q = supabase
    .from("questionnaires")
    .select("id, title, status, updated_at, created_at, mode, assigned_position")
    .eq("vessel_id", vesselId)
    .order("updated_at", { ascending: false });

  if (status) q = q.eq("status", status);

  // If the viewer is a vessel user, enforce assignment filtering:
  // - master: sees all
  // - others: sees assigned_position IS NULL (all roles) OR assigned_position == their position
  const isVesselViewer = (viewerRole === AUTH.ROLES.VESSEL);
  if (isVesselViewer) {
    const pos = String(viewerPosition || "").toLowerCase();
    if (pos && pos !== "master") {
      q = q.or(`assigned_position.is.null,assigned_position.eq.${pos}`);
    }
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
    tr.innerHTML = `<td colspan="5" class="muted">No questionnaires found for this vessel.</td>`;
    body.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900; color:#1a4170;">${r.title || r.id}</div>
        <div class="muted" style="margin-top:4px;">ID: ${r.id}</div>
        <div class="muted" style="margin-top:4px;">Assigned: ${r.assigned_position || "ALL"}</div>
      </td>
      <td style="font-weight:900; color:#1a4170;">${r.mode || "-"}</td>
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

  const R = AUTH.ROLES;

  // Allow vessel + super_admin + company_admin to enter this page
  const me = await AUTH.requireAuth([R.VESSEL, R.SUPER_ADMIN, R.COMPANY_ADMIN], {
    redirectTo: "./login.html",
    unauthorizedRedirect: "./q-dashboard.html"
  });
  if (!me) return;

  AUTH.fillUserBadge(me, "userBadge");

  const supabase = ensureSupabase();
  const role = me.profile?.role;
  const position = me.profile?.position || me.vesselPosition;

  // Vessel selection logic:
  // - Vessel users: fixed to profile.vessel_id
  // - Super/Admin: can pick a vessel from dropdown (and can also default to their profile.vessel_id if set)
  let vesselId = me.profile?.vessel_id || null;

  const isAdminViewer = (role === R.SUPER_ADMIN || role === R.COMPANY_ADMIN);

  const pickerWrap = el("adminVesselPicker");
  const picker = el("vesselPicker");

  if (isAdminViewer) {
    if (pickerWrap) pickerWrap.style.display = "flex";

    const vessels = await loadVessels(supabase);
    if (picker) {
      picker.innerHTML = vessels.map(v => `<option value="${v.id}">${v.name}</option>`).join("");

      // Default selection: profile vessel_id if present, else first vessel
      if (vesselId && vessels.some(v => v.id === vesselId)) picker.value = vesselId;
      else if (vessels.length) {
        vesselId = vessels[0].id;
        picker.value = vesselId;
      }

      // Changing the picker updates vesselId and refreshes
      picker.onchange = () => refresh().catch(e => showWarn(String(e?.message || e)));
      vesselId = picker.value || vesselId;
    }
  } else {
    if (pickerWrap) pickerWrap.style.display = "none";
  }

  if (!vesselId) {
    showWarn(
      "This account has no vessel_id set and you are not in an admin role.\n" +
      "Fix required: set public.profiles.vessel_id for this user."
    );
    render([]);
    return;
  }

  const status = el("statusFilter")?.value || "";
  const rows = await loadQuestionnairesForVessel(supabase, vesselId, status, role, position);
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
