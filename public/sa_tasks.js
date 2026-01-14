// public/sa_tasks.js
// Assignee page: list self_assess_instances visible by RLS, open questionnaire, optionally mark status.

function el(id) { return document.getElementById(id); }

function showWarn(msg) {
  const w = el("warnBox");
  if (w) {
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }
}

function clearWarn() { showWarn(""); }

function ensureSupabase() {
  const sb = window.__supabaseClient;
  if (!sb) throw new Error("Supabase client not initialized. Ensure auth.js is loaded and AUTH.requireAuth() is called.");
  return sb;
}

function fmtDate(d) {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString(); } catch { return String(d); }
}

function statusPill(status) {
  const s = String(status || "").toLowerCase();
  const label = status || "unknown";

  // minimal inline style to avoid CSS edits
  const bg =
    (s === "submitted") ? "#e9fff0" :
    (s === "in_progress") ? "#fff9e8" :
    "#eef4ff";

  const border =
    (s === "submitted") ? "#a8e9b8" :
    (s === "in_progress") ? "#f1d59a" :
    "#c9d9f3";

  const color =
    (s === "submitted") ? "#1d6a33" :
    (s === "in_progress") ? "#7a5a12" :
    "#1a4170";

  return `<span class="pill" style="background:${bg}; border-color:${border}; color:${color};">${label}</span>`;
}

async function loadCampaigns(supabase) {
  // With Step 2.0 policy, assignees can see only campaigns related to their assignments.
  const { data, error } = await supabase
    .from("self_assess_campaigns")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadMyTasks(supabase, campaignIdOrNull) {
  let q = supabase
    .from("self_assess_instances")
    .select(`
      questionnaire_id,
      campaign_id,
      due_date,
      questionnaires (
        id, title, status, updated_at, vessel_id
      ),
      self_assess_campaigns (
        id, name
      )
    `)
    .order("updated_at", { ascending: false });

  if (campaignIdOrNull) q = q.eq("campaign_id", campaignIdOrNull);

  const { data, error } = await q;
  if (error) throw error;

  return data || [];
}

async function loadVesselNames(supabase, vesselIds) {
  if (!vesselIds.length) return new Map();
  const { data, error } = await supabase
    .from("vessels")
    .select("id, name")
    .in("id", vesselIds);

  if (error) return new Map();
  return new Map((data || []).map(v => [v.id, v.name]));
}

function renderCampaignFilter(campaigns) {
  const sel = el("campaignFilter");
  if (!sel) return;

  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "(All campaigns)";
  sel.appendChild(o0);

  for (const c of campaigns) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  }
}

function renderRows(rows, vesselNameMap) {
  const body = el("rowsBody");
  if (!body) return;

  body.innerHTML = "";

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">No assigned self-assessments found.</td>`;
    body.appendChild(tr);
    return;
  }

  for (const r of rows) {
    const q = r.questionnaires || {};
    const campName = r.self_assess_campaigns?.name || "(no campaign)";
    const vesselName = vesselNameMap.get(q.vessel_id) || "-";
    const title = q.title || r.questionnaire_id;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:900; color:#1a4170;">${title}</div>
        <div class="muted" style="margin-top:4px;">Campaign: ${campName}</div>
      </td>
      <td style="font-weight:900; color:#1a4170;">${vesselName}</td>
      <td style="font-weight:900; color:#1a4170;">${fmtDate(r.due_date)}</td>
      <td>${statusPill(q.status)}</td>
      <td>
        <button class="btn2" data-open="${r.questionnaire_id}">Open</button>
        <button class="btn2" data-submit="${r.questionnaire_id}" ${String(q.status||"").toLowerCase()==="submitted" ? "disabled" : ""}>Mark Submitted</button>
      </td>
    `;
    body.appendChild(tr);
  }
}

async function markSubmitted(supabase, qid) {
  // This may fail if your questionnaires UPDATE policy is limited to created_by/admin.
  const { error } = await supabase
    .from("questionnaires")
    .update({ status: "submitted" })
    .eq("id", qid);

  if (error) throw error;
}

async function refresh() {
  clearWarn();

  const me = await AUTH.requireAuth([]); // any authenticated role
  if (!me) return;

  AUTH.fillUserBadge(me, "userBadge");
  el("logoutBtn")?.addEventListener("click", AUTH.logoutAndGoLogin);

  const supabase = ensureSupabase();

  // campaigns
  const campaigns = await loadCampaigns(supabase);
  renderCampaignFilter(campaigns);

  const campaignId = el("campaignFilter")?.value || null;

  // tasks
  const rows = await loadMyTasks(supabase, campaignId);

  // vessels
  const vesselIds = [...new Set(rows.map(r => r.questionnaires?.vessel_id).filter(Boolean))];
  const vesselNameMap = await loadVesselNames(supabase, vesselIds);

  renderRows(rows, vesselNameMap);

  // wire actions
  const body = el("rowsBody");
  if (!body) return;

  body.querySelectorAll("button[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const qid = btn.getAttribute("data-open");
      window.location.href = "./q-answer.html?qid=" + encodeURIComponent(qid);
    });
  });

  body.querySelectorAll("button[data-submit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const qid = btn.getAttribute("data-submit");
      btn.disabled = true;
      try {
        await markSubmitted(supabase, qid);
        await refresh(); // reload
      } catch (e) {
        // If update is not permitted, do not block user from answering.
        console.error(e);
        showWarn(
          "Could not update questionnaire status to 'submitted'. " +
          "This is likely due to UPDATE policy on questionnaires. " +
          "You can still complete the answers normally.\n\n" +
          "Error: " + String(e?.message || e)
        );
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function init() {
  el("refreshBtn")?.addEventListener("click", () => refresh());
  el("campaignFilter")?.addEventListener("change", () => refresh());
  refresh().catch(e => {
    console.error(e);
    showWarn(String(e?.message || e));
  });
}

init();
