// public/sa_assignments.js
// Admin page: create campaigns + bulk-create SA questionnaires + insert self_assess_instances metadata.

function el(id) { return document.getElementById(id); }

function setStatus(msg) {
  const s = el("statusLine");
  if (s) s.textContent = msg || "";
}

function showWarn(msg) {
  const w = el("warnBox");
  const ok = el("okBox");
  if (ok) ok.style.display = "none";
  if (w) {
    w.textContent = msg || "";
    w.style.display = msg ? "block" : "none";
  }
}

function showOk(msg) {
  const w = el("warnBox");
  const ok = el("okBox");
  if (w) w.style.display = "none";
  if (ok) {
    ok.textContent = msg || "";
    ok.style.display = msg ? "block" : "none";
  }
}

function clearMessages() {
  showWarn("");
  showOk("");
}

function ensureSupabase() {
  const sb = window.__supabaseClient;
  if (!sb) throw new Error("Supabase client not initialized. Ensure auth.js is loaded and AUTH.requireAuth() is called.");
  return sb;
}

// ----- Roles you requested (tokens must match profiles.position and si.assignee_role) -----
const VESSEL_ROLES = [
  { label: "Master",         role: "master" },
  { label: "Chief Officer",  role: "chief_officer" },
  { label: "Chief Engineer", role: "chief_engineer" },
];

const OFFICE_ROLES = [
  { label: "Marine Superintendent",   role: "marine_superintendent" },
  { label: "Technical Superintendent", role: "technical_superintendent" },
  { label: "HSQE Superintendent",     role: "hsqe_superintendent" },
];

function renderRoleCheckboxes(containerId, roles, groupType) {
  const box = el(containerId);
  if (!box) return;
  box.innerHTML = "";
  for (const r of roles) {
    const id = `${groupType}_${r.role}`;
    const row = document.createElement("div");
    row.style.margin = "6px 0";
    row.innerHTML = `
      <label style="display:flex; gap:10px; align-items:center; font-weight:900;">
        <input type="checkbox" id="${id}" data-assignee-type="${groupType}" data-assignee-role="${r.role}" />
        ${r.label}
      </label>
    `;
    box.appendChild(row);
  }
}

function setAllRoleCheckboxes(containerId, checked) {
  const box = el(containerId);
  if (!box) return;
  const inputs = box.querySelectorAll('input[type="checkbox"]');
  inputs.forEach(i => { i.checked = checked; });
}

function getSelectedAssignees() {
  const all = [];
  const vesselBox = el("vesselRolesBox");
  const officeBox = el("officeRolesBox");

  const take = (box) => {
    if (!box) return;
    const inputs = box.querySelectorAll('input[type="checkbox"]');
    inputs.forEach(i => {
      if (i.checked) {
        all.push({
          assignee_type: i.getAttribute("data-assignee-type"),
          assignee_role: i.getAttribute("data-assignee-role"),
        });
      }
    });
  };

  take(vesselBox);
  take(officeBox);
  return all;
}

function multiselectValues(selectId) {
  const sel = el(selectId);
  if (!sel) return [];
  return Array.from(sel.options).filter(o => o.selected).map(o => o.value);
}

function multiselectSelectAll(selectId, selected) {
  const sel = el(selectId);
  if (!sel) return;
  Array.from(sel.options).forEach(o => { o.selected = selected; });
}

function templateOptionText(t) {
  const desc = (t.description || "").trim();
  return desc ? `${t.name} — ${desc}` : t.name;
}

function formatTitle(pattern, campaignName, vesselName, roleLabel) {
  return String(pattern || "")
    .replaceAll("{{campaign}}", campaignName || "")
    .replaceAll("{{vessel}}", vesselName || "")
    .replaceAll("{{role}}", roleLabel || "");
}

function addCreatedItemToLog(item) {
  const host = el("createdList");
  if (!host) return;

  const div = document.createElement("div");
  div.style.marginTop = "8px";
  div.style.padding = "10px 10px";
  div.style.borderRadius = "12px";
  div.style.border = "1px solid rgba(255,255,255,0.18)";
  div.style.background = "rgba(0,0,0,0.18)";
  div.innerHTML = `
    <div style="font-weight:900;">${item.title}</div>
    <div style="opacity:0.9; font-weight:800; margin-top:4px;">
      Vessel: ${item.vesselName} | Assignee: ${item.assigneeLabel} | Campaign: ${item.campaignName || "(none)"} 
    </div>
    <div style="margin-top:8px;">
      <a href="./q-answer.html?qid=${encodeURIComponent(item.qid)}" style="color:#fff; font-weight:900;">Open Questionnaire</a>
    </div>
  `;
  host.prepend(div);
}

async function loadCampaigns(supabase) {
  const { data, error } = await supabase
    .from("self_assess_campaigns")
    .select("id, name, due_date, open_from, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadTemplates(supabase) {
  const { data, error } = await supabase
    .from("questionnaire_templates")
    .select("id, name, description, is_active, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
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

function renderCampaignSelect(campaigns) {
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
    o.textContent = c.due_date ? `${c.name} (Due: ${c.due_date})` : c.name;
    sel.appendChild(o);
  }
}

function renderTemplateSelect(templates) {
  const sel = el("templateSelect");
  if (!sel) return;

  sel.innerHTML = "";
  const o0 = document.createElement("option");
  o0.value = "";
  o0.textContent = "Select template…";
  sel.appendChild(o0);

  for (const t of templates) {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = templateOptionText(t);
    sel.appendChild(o);
  }
}

function renderVesselMulti(vessels) {
  const sel = el("vesselMulti");
  if (!sel) return;

  sel.innerHTML = "";
  for (const v of vessels) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = v.name;
    sel.appendChild(o);
  }
}

async function refreshAll(supabase, state) {
  clearMessages();
  setStatus("Loading campaigns, templates, vessels…");

  const [campaigns, templates, vessels] = await Promise.all([
    loadCampaigns(supabase),
    loadTemplates(supabase),
    loadVessels(supabase),
  ]);

  state.campaigns = campaigns;
  state.templates = templates;
  state.vessels = vessels;

  renderCampaignSelect(campaigns);
  renderTemplateSelect(templates);
  renderVesselMulti(vessels);

  setStatus(`Ready. Campaigns=${campaigns.length}, Templates=${templates.length}, Vessels=${vessels.length}`);
}

async function createCampaign(supabase, me, state) {
  clearMessages();

  const name = (el("campaignName")?.value || "").trim();
  const description = (el("campaignDesc")?.value || "").trim() || null;
  const open_from = el("campaignOpenFrom")?.value || null;
  const due_date = el("campaignDueDate")?.value || null;

  if (!name) {
    showWarn("Campaign name is required.");
    return;
  }

  setStatus("Creating campaign…");

  const { data, error } = await supabase
    .from("self_assess_campaigns")
    .insert({
      name,
      description,
      open_from,
      due_date,
      created_by: me.user.id,
    })
    .select("id, name, due_date, created_at")
    .single();

  if (error) {
    showWarn("Create campaign failed: " + error.message);
    setStatus("Ready.");
    return;
  }

  showOk(`Campaign created: ${data.name}`);
  el("campaignName").value = "";
  el("campaignDesc").value = "";
  el("campaignOpenFrom").value = "";
  el("campaignDueDate").value = "";

  await refreshAll(supabase, state);
  el("campaignSelect").value = data.id;

  setStatus("Ready.");
}

function assigneeLabelFromMeta(meta) {
  const all = [
    ...VESSEL_ROLES.map(r => ({ type: "vessel_role", role: r.role, label: r.label })),
    ...OFFICE_ROLES.map(r => ({ type: "office_role", role: r.role, label: r.label })),
  ];
  const m = all.find(x => x.type === meta.assignee_type && x.role === meta.assignee_role);
  return m ? m.label : `${meta.assignee_type}:${meta.assignee_role}`;
}

async function createAssignments(supabase, me, state) {
  clearMessages();

  const campaignId = el("campaignSelect")?.value || null;
  const templateId = el("templateSelect")?.value || "";
  const vesselIds = multiselectValues("vesselMulti");
  const assignees = getSelectedAssignees();
  const dueDate = el("assignmentDueDate")?.value || null;
  const titlePattern = (el("titlePattern")?.value || "").trim();

  if (!templateId) {
    showWarn("Select a template first.");
    return;
  }
  if (vesselIds.length < 1) {
    showWarn("Select at least one vessel.");
    return;
  }
  if (assignees.length < 1) {
    showWarn("Select at least one assignee role.");
    return;
  }
  if (!titlePattern) {
    showWarn("Title pattern cannot be empty.");
    return;
  }

  const campaignName =
    campaignId ? (state.campaigns.find(c => c.id === campaignId)?.name || "") : "";

  const vesselsById = new Map(state.vessels.map(v => [v.id, v.name]));

  const total = vesselIds.length * assignees.length;
  let ok = 0;
  let fail = 0;

  const btn = el("createAssignmentsBtn");
  if (btn) btn.disabled = true;

  try {
    setStatus(`Creating ${total} assignment(s)…`);

    // sequential loop to avoid rate limits and to keep logs understandable
    for (const vesselId of vesselIds) {
      const vesselName = vesselsById.get(vesselId) || vesselId;

      for (const a of assignees) {
        const assigneeLabel = assigneeLabelFromMeta(a);
        const title = formatTitle(titlePattern, campaignName, vesselName, assigneeLabel);

        setStatus(`Creating (${ok + fail + 1}/${total}) — ${vesselName} — ${assigneeLabel}`);

        // 1) Create questionnaire from template (server RPC)
        const { data: qid, error: qErr } = await supabase.rpc("create_questionnaire_from_template", {
          p_template_id: templateId,
          p_vessel_id: vesselId,
          p_title: title,
        });

        if (qErr || !qid) {
          fail++;
          showWarn(
            `Create failed for Vessel="${vesselName}", Assignee="${assigneeLabel}". ` +
            `RPC error: ${(qErr && qErr.message) || "No questionnaire id returned."}`
          );
          continue;
        }

        // 2) Insert assignment metadata
        const { error: iErr } = await supabase
          .from("self_assess_instances")
          .insert({
            questionnaire_id: qid,
            campaign_id: campaignId,
            assignee_type: a.assignee_type,
            assignee_role: a.assignee_role,
            due_date: dueDate,
            created_by: me.user.id,
          });

        if (iErr) {
          fail++;
          showWarn(
            `Assignment insert failed for qid=${qid}. ` +
            `The questionnaire exists but is not assigned. Error: ${iErr.message}`
          );
          continue;
        }

        ok++;
        addCreatedItemToLog({
          qid,
          title,
          vesselName,
          assigneeLabel,
          campaignName,
        });
      }
    }

    showOk(`Done. Created ${ok} assignment(s). Failures: ${fail}.`);
    setStatus("Ready.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function init() {
  // Admin-only
  const me = await AUTH.requireAuth([AUTH.ROLES.SUPER_ADMIN, AUTH.ROLES.COMPANY_ADMIN]);
  if (!me) return;

  AUTH.fillUserBadge(me, "userBadge");

  const supabase = ensureSupabase();
  const state = { campaigns: [], templates: [], vessels: [] };

  renderRoleCheckboxes("vesselRolesBox", VESSEL_ROLES, "vessel_role");
  renderRoleCheckboxes("officeRolesBox", OFFICE_ROLES, "office_role");

  el("refreshCampaignsBtn")?.addEventListener("click", () => refreshAll(supabase, state));

  el("selectAllVesselsBtn")?.addEventListener("click", () => multiselectSelectAll("vesselMulti", true));
  el("clearVesselsBtn")?.addEventListener("click", () => multiselectSelectAll("vesselMulti", false));

  el("selectAllVesselRolesBtn")?.addEventListener("click", () => setAllRoleCheckboxes("vesselRolesBox", true));
  el("clearVesselRolesBtn")?.addEventListener("click", () => setAllRoleCheckboxes("vesselRolesBox", false));

  el("selectAllOfficeRolesBtn")?.addEventListener("click", () => setAllRoleCheckboxes("officeRolesBox", true));
  el("clearOfficeRolesBtn")?.addEventListener("click", () => setAllRoleCheckboxes("officeRolesBox", false));

  el("createCampaignBtn")?.addEventListener("click", () => createCampaign(supabase, me, state));
  el("createAssignmentsBtn")?.addEventListener("click", () => createAssignments(supabase, me, state));

  await refreshAll(supabase, state);
}

init().catch((e) => {
  console.error(e);
  showWarn(String(e?.message || e));
  setStatus("Ready.");
});
