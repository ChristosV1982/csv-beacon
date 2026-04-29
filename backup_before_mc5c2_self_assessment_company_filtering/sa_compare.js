// public/sa_compare.js
// Admin-only: Pre/Post comparison using RPCs.

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

async function loadVessels(supabase) {
  const { data, error } = await supabase
    .from("vessels")
    .select("id, name, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadCampaigns(supabase) {
  const { data, error } = await supabase
    .from("self_assess_campaigns")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderVessels(vessels) {
  const sel = el("vesselSelect");
  if (!sel) return;

  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "Select vessel…";
  sel.appendChild(o0);

  for (const v of vessels) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

function renderCampaigns(campaigns) {
  const sel = el("campaignSelect");
  if (!sel) return;

  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "(No campaign)";
  sel.appendChild(o0);

  for (const c of campaigns) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name;
    sel.appendChild(o);
  }
}

function setSummaryRow(sum) {
  const tr = el("sumRow");
  if (!tr) return;

  const both = (sum && (sum.both ?? sum["both"])) ?? "-";

  tr.innerHTML = `
    <td>${sum?.pre_flag_only ?? "-"}</td>
    <td>${sum?.post_only ?? "-"}</td>
    <td>${both}</td>
    <td>${sum?.union_questions ?? "-"}</td>
  `;
}

async function runSummary(supabase) {
  clearWarn();

  const vesselId = el("vesselSelect")?.value || "";
  if (!vesselId) {
    showWarn("Select a vessel.");
    return;
  }

  const campaignId = el("campaignSelect")?.value || null;
  const fromDate = el("fromDate")?.value || null;
  const toDate = el("toDate")?.value || null;

  const { data, error } = await supabase.rpc("compare_pre_post_summary", {
    p_vessel_id: vesselId,
    p_from: fromDate,
    p_to: toDate,
    p_campaign_id: campaignId
  });

  if (error) {
    showWarn("compare_pre_post_summary failed: " + error.message);
    return;
  }

  const row = Array.isArray(data) ? data[0] : data;
  setSummaryRow(row || null);
  const gapBox = el("gapBox");
  if (gapBox) gapBox.textContent = "";
}

async function loadGaps(supabase, gapType) {
  clearWarn();

  const vesselId = el("vesselSelect")?.value || "";
  if (!vesselId) {
    showWarn("Select a vessel.");
    return;
  }

  const campaignId = el("campaignSelect")?.value || null;
  const fromDate = el("fromDate")?.value || null;
  const toDate = el("toDate")?.value || null;

  const { data, error } = await supabase.rpc("compare_pre_post_gaps", {
    p_vessel_id: vesselId,
    p_from: fromDate,
    p_to: toDate,
    p_campaign_id: campaignId,
    p_gap_type: gapType
  });

  if (error) {
    showWarn("compare_pre_post_gaps failed: " + error.message);
    return;
  }

  const rows = data || [];
  const gapBox = el("gapBox");
  if (!gapBox) return;

  if (!rows.length) {
    gapBox.textContent = "(No gaps found.)";
    return;
  }

  gapBox.textContent = rows.map(r => r.question_no).join(", ");
}

async function init() {
  // IMPORTANT: Post-inspection is admin-restricted in your DB (is_post_inspection_admin),
  // so this page is admin-only to avoid misleading comparisons.
  const me = await AUTH.requireAuth([AUTH.ROLES.SUPER_ADMIN, AUTH.ROLES.COMPANY_ADMIN]);
  if (!me) return;

  AUTH.fillUserBadge(me, "userBadge");
  el("logoutBtn")?.addEventListener("click", AUTH.logoutAndGoLogin);

  const supabase = ensureSupabase();

  const [vessels, campaigns] = await Promise.all([
    loadVessels(supabase),
    loadCampaigns(supabase),
  ]);

  renderVessels(vessels);
  renderCampaigns(campaigns);

  el("runBtn")?.addEventListener("click", () => runSummary(supabase));
  el("loadPostOnlyBtn")?.addEventListener("click", () => loadGaps(supabase, "post_only"));
  el("loadPreOnlyBtn")?.addEventListener("click", () => loadGaps(supabase, "pre_only"));
}

init().catch(e => {
  console.error(e);
  showWarn(String(e?.message || e));
});
