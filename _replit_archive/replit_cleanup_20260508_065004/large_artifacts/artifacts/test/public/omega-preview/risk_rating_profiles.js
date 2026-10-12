const BUILD = "risk_rating_profiles_v1_2026-05-21";

const state = {
  sb: null,
  me: null,
  config: null,
  selectedProfileId: null,
  selectedVersionId: null,
};

function el(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showWarn(msg) {
  const box = el("warnBox");
  box.textContent = msg || "";
  box.style.display = msg ? "block" : "none";
}

function showOk(msg) {
  const box = el("okBox");
  box.textContent = msg || "";
  box.style.display = msg ? "block" : "none";
}

function clearMessages() {
  showWarn("");
  showOk("");
}

function numVal(id) {
  const raw = String(el(id)?.value || "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid number in ${id}.`);
  return n;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForAuth(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (window.AUTH && window.AUTH.ensureSupabase) return true;
    await sleep(50);
  }
  return false;
}

function profiles() {
  return state.config?.profiles || [];
}

function versions() {
  return state.config?.versions || [];
}

function activeVersionForProfile(profileId) {
  return versions()
    .filter((v) => String(v.profile_id) === String(profileId))
    .sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return Number(b.version_no || 0) - Number(a.version_no || 0);
    })[0] || null;
}

function selectedProfile() {
  return profiles().find((p) => String(p.id) === String(state.selectedProfileId)) || null;
}

function selectedVersion() {
  return versions().find((v) => String(v.id) === String(state.selectedVersionId)) || null;
}

function rowsFor(key) {
  return state.config?.[key] || [];
}

function selectedRows(key) {
  return rowsFor(key).filter((r) => String(r.profile_version_id) === String(state.selectedVersionId));
}

function scoreInputId(prefix, parts) {
  return `${prefix}_${parts.map((p) => String(p || "").replace(/[^a-zA-Z0-9_-]/g, "_")).join("_")}`;
}

async function rpc(name, args = {}) {
  const { data, error } = await state.sb.rpc(name, args);
  if (error) throw error;
  return data;
}

async function loadConfig() {
  clearMessages();
  state.config = await rpc("csvb_admin_risk_rating_config");

  if (!state.selectedProfileId) {
    const defaultProfile = profiles().find((p) => p.is_default) || profiles()[0] || null;
    state.selectedProfileId = defaultProfile?.id || null;
  }

  const v = activeVersionForProfile(state.selectedProfileId);
  state.selectedVersionId = v?.id || null;

  renderAll();
}

function renderProfileList() {
  const body = el("profileList");
  const list = profiles();

  if (!list.length) {
    body.innerHTML = `<div class="muted">No risk profiles found.</div>`;
    return;
  }

  body.innerHTML = list.map((p) => {
    const v = activeVersionForProfile(p.id);
    const active = String(p.id) === String(state.selectedProfileId) ? "active" : "";
    return `
      <button class="profile-btn ${active}" type="button" data-profile-id="${esc(p.id)}">
        <div class="profile-name">${esc(p.profile_name)}</div>
        <div class="profile-meta">
          ${esc(p.profile_code)} • ${p.is_default ? "Default" : "Custom"} • ${p.is_active ? "Active" : "Inactive"}
          ${v ? `• ${esc(v.version_label)} / ${esc(v.status)}` : ""}
        </div>
      </button>
    `;
  }).join("");

  body.querySelectorAll(".profile-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedProfileId = btn.getAttribute("data-profile-id");
      const v = activeVersionForProfile(state.selectedProfileId);
      state.selectedVersionId = v?.id || null;
      renderAll();
    });
  });
}

function renderProfileForm() {
  const p = selectedProfile();
  const v = selectedVersion();

  el("profileName").value = p?.profile_name || "";
  el("profileCode").value = p?.profile_code || "";
  el("profileDescription").value = p?.description || "";

  el("versionLabel").value = v ? `${v.version_label || ""} / ${v.status || ""}` : "";
  el("includeLargely").value = String(!!v?.include_largely_as_expected);
  el("repetitionScope").value = v?.repetition_scope || "company";
  el("lookbackMonths").value = v?.repetition_lookback_months || 12;
  el("selectedIds").value = p && v ? `${p.id} / ${v.id}` : "";
}

function renderQuestionWeights() {
  const rows = selectedRows("question_type_weights");
  const body = el("questionWeightsBody");

  body.innerHTML = rows.map((r) => {
    const id = scoreInputId("qw", [r.question_type_code]);
    return `
      <tr>
        <td>${esc(r.question_type_label)}</td>
        <td>${esc(r.question_type_code)}</td>
        <td class="score-cell"><input id="${esc(id)}" type="number" min="0" step="0.01" value="${esc(r.weight)}" /></td>
        <td><button class="btn" type="button" data-action="save-qw" data-code="${esc(r.question_type_code)}" data-input="${esc(id)}">Save</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="muted">No question type weights.</td></tr>`;

  body.querySelectorAll("[data-action='save-qw']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        clearMessages();
        await rpc("csvb_admin_risk_update_question_weight", {
          p_profile_version_id: state.selectedVersionId,
          p_question_type_code: btn.getAttribute("data-code"),
          p_weight: numVal(btn.getAttribute("data-input")),
        });
        showOk("Question type weight saved.");
        await loadConfig();
      } catch (e) {
        showWarn(e?.message || String(e));
      }
    });
  });
}

function renderNocScores() {
  const filter = el("nocDesignationFilter").value || "";
  const rows = selectedRows("noc_scores")
    .filter((r) => !filter || r.designation === filter)
    .sort((a, b) => (a.designation || "").localeCompare(b.designation || "") || Number(a.sort_order || 0) - Number(b.sort_order || 0));

  const body = el("nocScoresBody");

  body.innerHTML = rows.map((r, idx) => {
    const id = scoreInputId("noc", [idx, r.designation, r.sort_order]);
    return `
      <tr>
        <td>${esc(r.designation)}</td>
        <td>${esc(r.noc_text)}</td>
        <td class="score-cell"><input id="${esc(id)}" type="number" min="0" step="0.01" value="${esc(r.score)}" /></td>
        <td>
          <button class="btn" type="button"
            data-action="save-noc"
            data-designation="${esc(r.designation)}"
            data-noc="${esc(r.noc_text)}"
            data-input="${esc(id)}">Save</button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="muted">No NOC scores.</td></tr>`;

  body.querySelectorAll("[data-action='save-noc']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        clearMessages();
        await rpc("csvb_admin_risk_update_noc_score", {
          p_profile_version_id: state.selectedVersionId,
          p_designation: btn.getAttribute("data-designation"),
          p_noc_text: btn.getAttribute("data-noc"),
          p_score: numVal(btn.getAttribute("data-input")),
        });
        showOk("NOC score saved.");
        await loadConfig();
      } catch (e) {
        showWarn(e?.message || String(e));
      }
    });
  });
}

function renderAgeFactors() {
  const rows = selectedRows("vessel_age_factors");
  const body = el("ageFactorsBody");

  body.innerHTML = rows.map((r) => {
    const id = scoreInputId("age", [r.id]);
    const range = `${r.age_min_inclusive ? "≥" : ">"} ${r.age_min_years}${r.age_max_years == null ? "" : ` and ${r.age_max_inclusive ? "≤" : "<"} ${r.age_max_years}`}`;
    return `
      <tr>
        <td>${esc(r.designation)}</td>
        <td>${esc(r.band_label)}</td>
        <td>${esc(range)}</td>
        <td class="score-cell"><input id="${esc(id)}" type="number" min="0" step="0.01" value="${esc(r.factor)}" /></td>
        <td><button class="btn" type="button" data-action="save-age" data-id="${esc(r.id)}" data-input="${esc(id)}">Save</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5" class="muted">No vessel age factors.</td></tr>`;

  body.querySelectorAll("[data-action='save-age']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        clearMessages();
        await rpc("csvb_admin_risk_update_age_factor", {
          p_age_factor_id: btn.getAttribute("data-id"),
          p_factor: numVal(btn.getAttribute("data-input")),
        });
        showOk("Vessel age factor saved.");
        await loadConfig();
      } catch (e) {
        showWarn(e?.message || String(e));
      }
    });
  });
}

function renderRepetitionFactors() {
  const rows = selectedRows("repetition_factors");
  const body = el("repetitionFactorsBody");

  body.innerHTML = rows.map((r) => {
    const id = scoreInputId("rep", [r.id]);
    const range = r.max_count == null ? `${r.min_count}+` : `${r.min_count}–${r.max_count}`;
    return `
      <tr>
        <td>${esc(r.band_label)}</td>
        <td>${esc(range)}</td>
        <td class="score-cell"><input id="${esc(id)}" type="number" min="0" step="0.01" value="${esc(r.factor)}" /></td>
        <td><button class="btn" type="button" data-action="save-rep" data-id="${esc(r.id)}" data-input="${esc(id)}">Save</button></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="muted">No repetition factors.</td></tr>`;

  body.querySelectorAll("[data-action='save-rep']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        clearMessages();
        await rpc("csvb_admin_risk_update_repetition_factor", {
          p_repetition_factor_id: btn.getAttribute("data-id"),
          p_factor: numVal(btn.getAttribute("data-input")),
        });
        showOk("Repetition factor saved.");
        await loadConfig();
      } catch (e) {
        showWarn(e?.message || String(e));
      }
    });
  });
}

function renderAll() {
  renderProfileList();
  renderProfileForm();
  renderQuestionWeights();
  renderNocScores();
  renderAgeFactors();
  renderRepetitionFactors();
}

async function saveProfile() {
  const p = selectedProfile();
  if (!p) throw new Error("No profile selected.");

  await rpc("csvb_admin_risk_update_profile", {
    p_profile_id: p.id,
    p_profile_name: el("profileName").value.trim(),
    p_description: el("profileDescription").value.trim() || null,
  });

  showOk("Profile saved.");
  await loadConfig();
}

async function saveVersionSettings() {
  const v = selectedVersion();
  if (!v) throw new Error("No profile version selected.");

  await rpc("csvb_admin_risk_update_version_settings", {
    p_profile_version_id: v.id,
    p_include_largely_as_expected: el("includeLargely").value === "true",
    p_repetition_scope: el("repetitionScope").value,
    p_repetition_lookback_months: Number(el("lookbackMonths").value || 12),
  });

  showOk("Version settings saved.");
  await loadConfig();
}

function codeFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function cloneProfile() {
  const v = selectedVersion();
  if (!v) throw new Error("No source profile version selected.");

  const name = el("cloneName").value.trim();
  let code = el("cloneCode").value.trim();

  if (!name) throw new Error("New profile name is required.");
  if (!code) code = codeFromName(name);

  const resp = await rpc("csvb_admin_risk_clone_profile", {
    p_source_profile_version_id: v.id,
    p_new_profile_code: code,
    p_new_profile_name: name,
    p_description: el("cloneDescription").value.trim() || null,
  });

  showOk("Profile cloned.");
  el("cloneName").value = "";
  el("cloneCode").value = "";
  el("cloneDescription").value = "";

  state.selectedProfileId = resp?.profile_id || state.selectedProfileId;
  state.selectedVersionId = resp?.profile_version_id || state.selectedVersionId;

  await loadConfig();
}

async function init() {
  el("buildPill").textContent = `build: ${BUILD}`;

  const ok = await waitForAuth(5000);
  if (!ok) throw new Error("AUTH not loaded.");

  state.sb = window.AUTH.ensureSupabase();

  const R = window.AUTH.ROLES || {};
  state.me = await window.AUTH.requireAuth([R.SUPER_ADMIN, "super_admin", "platform_owner"].filter(Boolean));
  if (!state.me) return;

  window.AUTH.fillUserBadge(state.me, "userBadge");

  el("logoutBtn").addEventListener("click", window.AUTH.logoutAndGoLogin);
  el("dashboardBtn").addEventListener("click", () => location.href = "./q-dashboard.html");
  el("modeBtn").addEventListener("click", () => location.href = "./index.html");

  el("reloadBtn").addEventListener("click", async () => {
    try { await loadConfig(); showOk("Reloaded."); }
    catch (e) { showWarn(e?.message || String(e)); }
  });

  el("saveProfileBtn").addEventListener("click", async () => {
    try { clearMessages(); await saveProfile(); }
    catch (e) { showWarn(e?.message || String(e)); }
  });

  el("saveVersionBtn").addEventListener("click", async () => {
    try { clearMessages(); await saveVersionSettings(); }
    catch (e) { showWarn(e?.message || String(e)); }
  });

  el("cloneBtn").addEventListener("click", async () => {
    try { clearMessages(); await cloneProfile(); }
    catch (e) { showWarn(e?.message || String(e)); }
  });

  el("cloneName").addEventListener("input", () => {
    if (!el("cloneCode").value.trim()) {
      el("cloneCode").value = codeFromName(el("cloneName").value);
    }
  });

  el("nocDesignationFilter").addEventListener("change", renderNocScores);

  await loadConfig();
}

init().catch((e) => {
  console.error(e);
  showWarn("Risk Rating Profiles page failed to load:\n\n" + (e?.message || String(e)));
});
