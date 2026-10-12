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
  const { data, error } = await supabase.rpc("csvb_accessible_vessels_for_me");

  if (error) throw error;

  return (data || [])
    .filter((v) => v.is_active !== false)
    .map((v) => ({
      id: v.id,
      company_id: v.company_id,
      company_name: v.company_name || "",
      name: v.name,
      is_active: v.is_active
    }));
}

async function loadQuestionnairesForVessel(supabase, vesselId, status, viewerRole, viewerPosition) {
  const { data, error } = await supabase.rpc("csvb_questionnaires_for_me");

  if (error) throw error;

  let rows = (data || []).filter((r) => String(r.vessel_id || "") === String(vesselId || ""));

  if (status) {
    rows = rows.filter((r) => String(r.status || "") === String(status));
  }

  const isVesselViewer = (viewerRole === AUTH.ROLES.VESSEL);

  if (isVesselViewer) {
    const pos = String(viewerPosition || "").toLowerCase();

    if (pos && pos !== "master") {
      rows = rows.filter((r) => {
        const assigned = String(r.assigned_position || "").toLowerCase();
        return !assigned || assigned === pos;
      });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    updated_at: r.updated_at,
    created_at: r.created_at,
    mode: r.mode,
    assigned_position: r.assigned_position
  }));
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
  const me = await AUTH.requireAuth([R.VESSEL, R.SUPER_ADMIN, R.COMPANY_ADMIN, R.COMPANY_SUPERINTENDENT].filter(Boolean), {
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

  const isAdminViewer = (role === R.SUPER_ADMIN || role === R.COMPANY_ADMIN || role === R.COMPANY_SUPERINTENDENT);

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
