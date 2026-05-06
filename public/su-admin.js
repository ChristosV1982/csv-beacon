

/* ======================== MC-3B7 Company-aware User Creation Helpers ======================== */

function isPlatformUserRole(role) {
  return String(role || "") === "super_admin" || String(role || "") === "platform_owner";
}

function renderUserCompanyDropdown() {
  const sel = document.getElementById("cu_company");
  if (!sel) return;

  const companies = Array.isArray(state.companies) ? state.companies : [];

  if (!companies.length) {
    sel.innerHTML = '<option value="">No companies loaded</option>';
    return;
  }

  const current = sel.value || state.selectedCompanyId || companies[0]?.id || "";

  sel.innerHTML = [
    '<option value="">Select company…</option>',
    ...companies
      .filter((c) => c.is_active !== false)
      .map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return '<option value="' + esc(c.id) + '">' + esc(label) + '</option>';
      })
  ].join("");

  if (current && companies.some((c) => String(c.id) === String(current))) {
    sel.value = current;
  } else if (companies[0]?.id) {
    sel.value = companies[0].id;
  }

  updateCreateUserCompanyControls();
}

function currentCreateUserCompanyId() {
  const role = document.getElementById("cu_role")?.value || "";
  if (isPlatformUserRole(role)) return null;

  return (document.getElementById("cu_company")?.value || "").trim() || null;
}

function updateCreateUserCompanyControls() {
  const role = document.getElementById("cu_role")?.value || "";
  const companySel = document.getElementById("cu_company");
  const vesselSel = document.getElementById("cu_vessel");

  const isPlatform = isPlatformUserRole(role);

  if (companySel) companySel.disabled = isPlatform;
  if (vesselSel) vesselSel.disabled = isPlatform;

  if (isPlatform) {
    if (companySel) companySel.value = "";
    if (vesselSel) vesselSel.value = "";
  }
}

async function findUserIdByUsername(username) {
  const target = String(username || "").trim().toLowerCase();
  if (!target) return null;

  const existing = (state.users || []).find((u) => String(u.username || "").toLowerCase() === target);
  if (existing?.id) return existing.id;

  const rpcUsers = await csvbRpc("csvb_admin_list_users_by_company", { p_company_id: null });
  const found = (rpcUsers || []).find((u) => String(u.username || "").toLowerCase() === target);

  return found?.id || null;
}

function extractCreatedUserId(resp) {
  if (!resp || typeof resp !== "object") return null;

  const candidates = [
    resp.user_id,
    resp.id,
    resp.profile_id,
    resp?.user?.id,
    resp?.profile?.id,
    resp?.data?.user?.id,
    resp?.data?.profile?.id,
  ];

  const found = candidates.find((x) => x && isUUID(x));
  return found || null;
}

// public/su-admin.js
const sb = window.AUTH.ensureSupabase();

/* ======================== Debug Mode ======================== */
const DEBUG = {
  key: "SU_ADMIN_DEBUG",
  enabled: false,
  maxLines: 250,
  lines: [],
};

function dbgInit() {
  DEBUG.enabled = localStorage.getItem(DEBUG.key) === "1";

  const toggle = document.getElementById("dbgToggle");
  const wrap = document.getElementById("debugWrap");
  const pill = document.getElementById("dbgStatePill");
  const box = document.getElementById("debugBox");
  const copyBtn = document.getElementById("dbgCopyBtn");
  const clearBtn = document.getElementById("dbgClearBtn");
  const collapseBtn = document.getElementById("dbgCollapseBtn");

  function applyUI() {
    if (toggle) toggle.checked = DEBUG.enabled;
    if (wrap) wrap.style.display = DEBUG.enabled ? "block" : "none";
    if (pill) {
      pill.textContent = DEBUG.enabled ? "ON" : "OFF";
      pill.classList.toggle("dbgOn", DEBUG.enabled);
      pill.classList.toggle("dbgOff", !DEBUG.enabled);
    }
    dbgRender();
  }

  if (toggle) {
    toggle.addEventListener("change", () => {
      DEBUG.enabled = !!toggle.checked;
      localStorage.setItem(DEBUG.key, DEBUG.enabled ? "1" : "0");
      applyUI();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        const text = dbgGetText();
        await navigator.clipboard.writeText(text);
        showOk("Debug log copied to clipboard.");
      } catch (e) {
        showWarn("Copy failed. Your browser may block clipboard access.\n\n" + String(e?.message || e));
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      DEBUG.lines = [];
      dbgRender();
      showOk("Debug log cleared.");
    });
  }

  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      if (wrap) wrap.style.display = "none";
      if (toggle) toggle.checked = false;
      DEBUG.enabled = false;
      localStorage.setItem(DEBUG.key, "0");
      applyUI();
    });
  }

  // Load stored (optional)
  const stored = localStorage.getItem("SU_ADMIN_DEBUG_LOG");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) DEBUG.lines = parsed.slice(0, DEBUG.maxLines);
    } catch {}
  }

  applyUI();

  // Expose helper for emergency
  window.__SU_ADMIN_DEBUG__ = {
    on() { DEBUG.enabled = true; localStorage.setItem(DEBUG.key, "1"); applyUI(); },
    off() { DEBUG.enabled = false; localStorage.setItem(DEBUG.key, "0"); applyUI(); },
    dump() { return dbgGetText(); },
    clear() { DEBUG.lines = []; dbgRender(); },
  };

  function dbgPersist() {
    try {
      localStorage.setItem("SU_ADMIN_DEBUG_LOG", JSON.stringify(DEBUG.lines.slice(0, DEBUG.maxLines)));
    } catch {}
  }

  function dbgRender() {
    if (!box) return;
    if (!DEBUG.enabled) return;

    const text = dbgGetText();
    box.textContent = text || "(no logs yet)";
    dbgPersist();
  }

  function dbgGetText() {
    // newest first
    const arr = DEBUG.lines.slice(0, DEBUG.maxLines);
    return arr.join("\n");
  }
}

function dbgRedact(obj) {
  // Deep clone with password redaction
  const seen = new WeakSet();

  function walk(x) {
    if (x === null || x === undefined) return x;
    if (typeof x !== "object") return x;
    if (seen.has(x)) return "[Circular]";
    seen.add(x);

    if (Array.isArray(x)) return x.map(walk);

    const out = {};
    for (const [k, v] of Object.entries(x)) {
      const lk = k.toLowerCase();
      if (lk.includes("password")) {
        out[k] = "***REDACTED***";
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  }

  try {
    return walk(obj);
  } catch {
    return { _redact_error: true };
  }
}

function dbgLog(entry) {
  if (!DEBUG.enabled) return;

  const ts = new Date().toISOString();
  const line = `[${ts}] ${entry}`;
  DEBUG.lines.unshift(line);
  if (DEBUG.lines.length > DEBUG.maxLines) DEBUG.lines.length = DEBUG.maxLines;

  const box = document.getElementById("debugBox");
  if (box) {
    box.textContent = DEBUG.lines.join("\n") || "(no logs yet)";
    // Keep scrolled to top since newest is first
    box.scrollTop = 0;
  }

  try {
    localStorage.setItem("SU_ADMIN_DEBUG_LOG", JSON.stringify(DEBUG.lines.slice(0, DEBUG.maxLines)));
  } catch {}
}

/* ======================== UI helpers ======================== */
function showWarn(msg) {
  const w = document.getElementById("warnBox");
  const ok = document.getElementById("okBox");
  if (ok) ok.style.display = "none";
  if (!w) return alert(msg);
  w.textContent = msg;
  w.style.display = "block";
}
function clearWarn() {
  const w = document.getElementById("warnBox");
  if (!w) return;
  w.textContent = "";
  w.style.display = "none";
}
function showOk(msg) {
  const ok = document.getElementById("okBox");
  const w = document.getElementById("warnBox");
  if (w) w.style.display = "none";
  if (!ok) return;
  ok.textContent = msg;
  ok.style.display = "block";
}
function clearOk() {
  const ok = document.getElementById("okBox");
  if (!ok) return;
  ok.textContent = "";
  ok.style.display = "none";
}
function setStatus(text) {
  const el = document.getElementById("statusLine");
  if (el) el.textContent = text || "";
}
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function isUUID(x) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(x || ""));
}

/* ======================== Supabase call ======================== */
async function getAccessToken() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error("No session token. Please login again.");
  return token;
}

async function callSuAdmin(body) {
  const token = await getAccessToken();
  const url = `${window.AUTH.SUPABASE_URL}/functions/v1/su-admin`;

  const safeBody = dbgRedact(body);
  dbgLog(`REQ ${safeBody?.action || "unknown"}\nbody=${JSON.stringify(safeBody, null, 2)}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: window.AUTH.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  dbgLog(`RES ${safeBody?.action || "unknown"}\nstatus=${res.status} ${res.statusText}\nraw=${text || "(empty)"}`);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}\n\n${text || "(empty response body)"}`);
  }

  // parse JSON when possible
  try {
    const data = JSON.parse(text || "{}");
    if (data?.error) {
      dbgLog(`ERR ${safeBody?.action || "unknown"}\n${typeof data.error === "string" ? data.error : JSON.stringify(data.error)}`);
      throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
    }
    return data;
  } catch {
    return { raw: text };
  }
}

/* ======================== State ======================== */
const state = {
  companies: [],
  selectedCompanyId: null,
  companyModules: [],
  companyVessels: [],
  companyUsers: [],
  companyAllVessels: [],
  companyAllUsers: [],
  companiesLoaded: false,
  vessels: [],
  users: [],
  roles: ["super_admin", "company_admin", "company_superintendent", "vessel", "inspector"],

  // Rights Matrix
  rm: {
    loadedMeta: false,
    modules: [],
    permissions: [],
    roles: [],
    positions: [],
    grants: [],
  },
};


/* ======================== MC-3B5B Repair: Vessel Company Dropdown ======================== */

function renderVesselCompanyDropdown() {
  const sel = document.getElementById("v_company");
  if (!sel) return;

  const companies = Array.isArray(state.companies) ? state.companies : [];

  if (!companies.length) {
    sel.innerHTML = '<option value="">No companies loaded</option>';
    return;
  }

  const current = sel.value || state.selectedCompanyId || companies[0]?.id || "";

  sel.innerHTML = [
    '<option value="">Select company…</option>',
    ...companies
      .filter((c) => c.is_active !== false)
      .map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return '<option value="' + esc(c.id) + '">' + esc(label) + '</option>';
      })
  ].join("");

  if (current && companies.some((c) => String(c.id) === String(current))) {
    sel.value = current;
  } else if (companies[0]?.id) {
    sel.value = companies[0].id;
  }
}

/* Compatibility alias in case a previous patch inserted a misspelled call */
function renderVeselCompanyDropdown() {
  return renderVesselCompanyDropdown();
}


/* ======================== Tabs ======================== */
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((btn) => {
    btn.addEventListener("click", async () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const t = btn.getAttribute("data-tab");
      const companiesTab = document.getElementById("tab-companies");
      if (companiesTab) companiesTab.style.display = t === "companies" ? "" : "none";
      document.getElementById("tab-users").style.display = t === "users" ? "" : "none";
      document.getElementById("tab-vessels").style.display = t === "vessels" ? "" : "none";
      document.getElementById("tab-rights").style.display = t === "rights" ? "" : "none";

      // Lazy-load Companies when tab first opened
      if (t === "companies") {
        try {
          await ensureCompaniesLoaded();
        } catch (e) {
          showWarn(String(e?.message || e));
        }
      }

      // Lazy-load Rights Matrix when tab first opened
      if (t === "rights") {
        try {
          await ensureRightsMatrixLoaded();
        } catch (e) {
          showWarn(String(e?.message || e));
        }
      }
    });
  });
}

/* ======================== Render: dropdowns ======================== */
function renderRoleDropdown() {
  const sel = document.getElementById("cu_role");
  if (!sel) return;

  const current = sel.value;

  sel.innerHTML = state.roles.map((r) => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join("");

  if (current && state.roles.includes(current)) {
    sel.value = current;
  }

  updateCreateUserCompanyControls();
}

function renderVesselDropdown() {
  const sel = document.getElementById("cu_vessel");
  if (!sel) return;

  const current = sel.value;
  const companyId = currentCreateUserCompanyId();

  const opts = [];
  opts.push('<option value="">(No vessel)</option>');

  for (const v of state.vessels) {
    if (companyId && String(v.company_id || "") !== String(companyId)) continue;

    const vesselName = v.name || v.vessel_name || v.title || v.id;
    const company = v.company_name ? " — " + v.company_name : "";
    opts.push('<option value="' + esc(v.id) + '">' + esc(vesselName + company) + '</option>');
  }

  sel.innerHTML = opts.join("");

  if (current && Array.from(sel.options).some((o) => String(o.value) === String(current))) {
    sel.value = current;
  }

  updateCreateUserCompanyControls();
}



/* ======================== MC-3B8 User List Filters ======================== */

function userRoleValue(u) {
  return String(u?.role || u?.role_name || "");
}

function userPositionValue(u) {
  return String(u?.position || u?.user_position || "");
}

function userCompanyValue(u) {
  return u?.company_id ? String(u.company_id) : "__platform";
}

function userVesselValue(u) {
  return u?.vessel_id ? String(u.vessel_id) : "__none";
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function setSelectOptionsPreserve(sel, options, previousValue) {
  if (!sel) return;

  sel.innerHTML = options.map((o) => {
    return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
  }).join("");

  if (previousValue && Array.from(sel.options).some((o) => String(o.value) === String(previousValue))) {
    sel.value = previousValue;
  }
}

function ensureUserFiltersBar() {
  const search = document.getElementById("u_search");
  if (!search) return;

  if (document.getElementById("u_filters_bar")) return;

  const hostRow = search.closest(".row") || search.parentElement;

  const bar = document.createElement("div");
  bar.id = "u_filters_bar";
  bar.style.marginTop = "10px";
  bar.style.marginBottom = "10px";
  bar.style.padding = "10px";
  bar.style.border = "1px solid #D6E4F5";
  bar.style.borderRadius = "12px";
  bar.style.background = "#F4F8FC";

  bar.innerHTML =
    '<div style="font-weight:950;color:#062A5E;margin-bottom:8px;">User filters</div>' +
    '<div style="display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:8px;align-items:end;">' +
      '<div class="field"><label>Company</label><select id="u_filter_company"><option value="">All companies</option></select></div>' +
      '<div class="field"><label>Role</label><select id="u_filter_role"><option value="">All roles</option></select></div>' +
      '<div class="field"><label>Status</label><select id="u_filter_status">' +
        '<option value="">All statuses</option>' +
        '<option value="active">Active</option>' +
        '<option value="disabled">Disabled / inactive</option>' +
      '</select></div>' +
      '<div class="field"><label>Vessel</label><select id="u_filter_vessel"><option value="">All vessels</option></select></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn2 btnSmall" type="button" id="u_filter_clear">Clear filters</button></div>' +
    '</div>';

  hostRow.insertAdjacentElement("afterend", bar);

  ["u_filter_company", "u_filter_role", "u_filter_status", "u_filter_vessel"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderUsers);
  });

  const clearBtn = document.getElementById("u_filter_clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const q = document.getElementById("u_search");
      if (q) q.value = "";

      ["u_filter_company", "u_filter_role", "u_filter_status", "u_filter_vessel"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
      });

      renderUsers();
    });
  }
}

function renderUserFilterDropdowns() {
  ensureUserFiltersBar();

  const users = Array.isArray(state.users) ? state.users : [];

  const companySel = document.getElementById("u_filter_company");
  const roleSel = document.getElementById("u_filter_role");
  const vesselSel = document.getElementById("u_filter_vessel");

  const prevCompany = companySel?.value || "";
  const prevRole = roleSel?.value || "";
  const prevVessel = vesselSel?.value || "";

  const companies = [];

  companies.push({ value: "", label: "All companies" });

  const activeCompanies = Array.isArray(state.companies) ? state.companies : [];

  activeCompanies.forEach((c) => {
    companies.push({
      value: String(c.id),
      label: c.company_name || c.short_name || c.company_code || c.id,
    });
  });

  if (users.some((u) => !u.company_id)) {
    companies.push({ value: "__platform", label: "Platform / no company" });
  }

  setSelectOptionsPreserve(companySel, companies, prevCompany);

  const roles = uniqueSorted(users.map((u) => userRoleValue(u)));

  setSelectOptionsPreserve(
    roleSel,
    [{ value: "", label: "All roles" }, ...roles.map((r) => ({ value: r, label: r }))],
    prevRole
  );

  const vesselOptions = [{ value: "", label: "All vessels" }];

  if (users.some((u) => !u.vessel_id)) {
    vesselOptions.push({ value: "__none", label: "No vessel" });
  }

  const vesselMap = new Map();

  (Array.isArray(state.vessels) ? state.vessels : []).forEach((v) => {
    vesselMap.set(String(v.id), v.name || v.vessel_name || v.id);
  });

  users.forEach((u) => {
    if (u.vessel_id && !vesselMap.has(String(u.vessel_id))) {
      vesselMap.set(String(u.vessel_id), u.vessel_name || String(u.vessel_id));
    }
  });

  Array.from(vesselMap.entries())
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
    .forEach(([id, name]) => {
      vesselOptions.push({ value: id, label: name });
    });

  setSelectOptionsPreserve(vesselSel, vesselOptions, prevVessel);
}


/* ======================== Render: users ======================== */
function publicDefaultCompanyId() {
  return state.selectedCompanyId || state.companies?.[0]?.id || null;
}

function vesselNameById(id) {
  if (!id) return "";
  const v = state.vessels.find((x) => String(x.id) === String(id));
  return v?.name || v?.vessel_name || "";
}

function renderUsers() {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;

  ensureUserFiltersBar();
  renderUserFilterDropdowns();

  const q = (document.getElementById("u_search")?.value || "").trim().toLowerCase();

  const fCompany = document.getElementById("u_filter_company")?.value || "";
  const fRole = document.getElementById("u_filter_role")?.value || "";
  const fStatus = document.getElementById("u_filter_status")?.value || "";
  const fVessel = document.getElementById("u_filter_vessel")?.value || "";

  const users = Array.isArray(state.users) ? state.users : [];

  const filtered = users.filter((u) => {
    const roleName = userRoleValue(u);
    const positionName = userPositionValue(u);
    const companyValue = userCompanyValue(u);
    const vesselValue = userVesselValue(u);

    const disabled = !!u.is_disabled || u.is_active === false;
    const statusValue = disabled ? "disabled" : "active";

    if (fCompany && companyValue !== fCompany) return false;
    if (fRole && roleName !== fRole) return false;
    if (fStatus && statusValue !== fStatus) return false;
    if (fVessel && vesselValue !== fVessel) return false;

    if (q) {
      const hay = [
        u.company_name,
        u.username,
        roleName,
        positionName,
        vesselNameById(u.vessel_id),
        u.vessel_name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!hay.includes(q)) return false;
    }

    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted small">No users match the selected filters.</td></tr>';
    return;
  }

  const rows = [];

  for (const u of filtered) {
    const disabled = !!u.is_disabled;
    const active = u.is_active === false ? false : true;

    const statusPill =
      disabled || !active
        ? '<span class="pill bad">Disabled</span>'
        : '<span class="pill ok">Active</span>';

    const forceReset = u.force_password_reset
      ? '<span class="pill bad">Yes</span>'
      : '<span class="pill ok">No</span>';

    const uid = u.id;
    const roleName = u.role || u.role_name || "";
    const positionName = u.position || u.user_position || "";

    const actionBtns = [];

    if (disabled || !active) {
      actionBtns.push(
        '<button class="btnSmall btn" data-act="enable_user" data-id="' + esc(uid) + '" type="button">Enable</button>'
      );
    } else {
      actionBtns.push(
        '<button class="btnSmall btnDanger" data-act="disable_user" data-id="' + esc(uid) + '" type="button">Disable</button>'
      );
    }

    actionBtns.push(
      '<button class="btnSmall btn2" data-act="reset_password" data-id="' + esc(uid) + '" type="button">Reset password</button>'
    );

    rows.push(
      '<tr>' +
        '<td>' + esc(u.company_name || "") + '</td>' +
        '<td class="mono">' + esc(u.username || "") + '</td>' +
        '<td>' + esc(roleName) + '</td>' +
        '<td>' + esc(positionName) + '</td>' +
        '<td>' + esc(u.vessel_name || vesselNameById(u.vessel_id) || "") + '</td>' +
        '<td>' + statusPill + '</td>' +
        '<td>' + forceReset + '</td>' +
        '<td><div class="actions">' + actionBtns.join("") + '</div></td>' +
      '</tr>'
    );
  }

  tbody.innerHTML = rows.join("");

  tbody.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearWarn();
      clearOk();

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");

      try {
        if (!id || !isUUID(id)) throw new Error("Invalid user id in row.");

        if (act === "disable_user") {
          const reason = prompt("Disable reason (optional):") || "";
          await callSuAdmin({ action: "disable_user", user_id: id, reason });
          showOk("User disabled.");
          await refreshUsers();
        } else if (act === "enable_user") {
          await callSuAdmin({ action: "enable_user", user_id: id });
          showOk("User enabled.");
          await refreshUsers();
        } else if (act === "reset_password") {
          const newPass = prompt("Enter new password for this user:");
          if (!newPass) return;
          const force = confirm("Force password change on next login?");
          await callSuAdmin({ action: "reset_password", user_id: id, new_password: newPass, force_password_reset: force });
          showOk("Password reset completed.");
          await refreshUsers();
        }
      } catch (e) {
        showWarn(String(e?.message || e));
      }
    });
  });
}

/* ======================== Render: vessels ======================== */
function renderVessels() {
  const tbody = document.getElementById("vesselsBody");
  if (!tbody) return;

  const q = (document.getElementById("v_search")?.value || "").trim().toLowerCase();
  const vessels = Array.isArray(state.vessels) ? state.vessels : [];

  const filtered = vessels.filter((v) => {
    if (!q) return true;

    const hay = [
      v.company_name,
      v.name,
      v.imo_number,
      v.hull_number,
      v.call_sign
    ].filter(Boolean).join(" ").toLowerCase();

    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted small">No vessels found.</td></tr>';
    return;
  }

  const rows = [];

  for (const v of filtered) {
    const active = v.is_active === false ? false : true;

    const statusPill = active
      ? '<span class="pill ok">Active</span>'
      : '<span class="pill bad">Inactive</span>';

    const activeBtn = active
      ? '<button class="btnSmall btnDanger" data-act="deactivate" data-id="' + esc(v.id) + '" type="button">Deactivate</button>'
      : '<button class="btnSmall btn" data-act="activate" data-id="' + esc(v.id) + '" type="button">Activate</button>';

    const deleteBtn =
      '<button class="btnSmall btnDanger" data-act="delete" data-id="' + esc(v.id) + '" type="button">Delete</button>';

    rows.push(`
      <tr>
        <td>${esc(v.company_name || "")}</td>
        <td>${esc(v.name || "")}</td>
        <td>${esc(v.hull_number || "")}</td>
        <td>${esc(v.imo_number || "")}</td>
        <td>${esc(v.call_sign || "")}</td>
        <td>${statusPill}</td>
        <td><div class="actions">${activeBtn}${deleteBtn}</div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("");

  tbody.querySelectorAll("button[data-act]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearWarn();
      clearOk();

      try {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const v = state.vessels.find((x) => String(x.id) === String(id));

        if (!v) throw new Error("Vessel not found in state.");

        if (act === "delete") {
          const message =
            "Delete vessel?\n\n" +
            "Vessel: " + (v.name || id) + "\n" +
            "Company: " + (v.company_name || "") + "\n\n" +
            "This will only work if the vessel has no linked users, questionnaires, inspections, audits, or other operational records.\n\n" +
            "If linked records exist, deletion will be blocked and you should deactivate the vessel instead.";

          if (!confirm(message)) return;

          const typeConfirm = prompt('Type DELETE to confirm vessel deletion:');

          if (typeConfirm !== "DELETE") {
            showWarn("Delete cancelled. Confirmation text did not match DELETE.");
            return;
          }

          setStatus("Deleting vessel…");

          const result = await csvbRpc("csvb_admin_delete_vessel_if_unused", {
            p_vessel_id: id
          });

          showOk("Vessel deleted.\n\n" + JSON.stringify(result, null, 2));

          await refreshVessels();

          if (typeof refreshCompanies === "function") {
            await refreshCompanies();
          }

          if (typeof refreshSelectedCompanyDetails === "function") {
            await refreshSelectedCompanyDetails();
          }

          setStatus("Ready");
          return;
        }

        const nextActive = act === "activate";

        setStatus(nextActive ? "Activating vessel…" : "Deactivating vessel…");

        await csvbRpc("csvb_admin_upsert_vessel", {
          p_vessel_id: v.id,
          p_company_id: v.company_id || publicDefaultCompanyId(),
          p_name: v.name || "",
          p_hull_number: v.hull_number || null,
          p_imo_number: v.imo_number ? String(v.imo_number) : null,
          p_call_sign: v.call_sign || null,
          p_is_active: nextActive,
          p_move_related: false
        });

        showOk(nextActive ? "Vessel activated." : "Vessel deactivated.");

        await refreshVessels();
        renderVesselDropdown();

        if (typeof refreshCompanies === "function") {
          await refreshCompanies();
        }

        if (typeof refreshSelectedCompanyDetails === "function") {
          await refreshSelectedCompanyDetails();
        }

        setStatus("Ready");
      } catch (e) {
        setStatus("Ready");
        showWarn(String(e?.message || e));
      }
    });
  });
}

/* ======================== Refresh data ======================== */
function normalizeListResponse(resp) {
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.users)) return resp.users;
  if (Array.isArray(resp?.vessels)) return resp.vessels;
  if (Array.isArray(resp?.items)) return resp.items;
  return [];
}

async function refreshUsers() {
  setStatus("Loading users…");

  if (typeof ensureCompaniesLoaded === "function") {
    await ensureCompaniesLoaded();
  }

  const rows = await csvbRpc("csvb_admin_list_users_by_company", {
    p_company_id: null
  });

  state.users = (rows || []).map((u) => ({
    ...u,
    role: u.role || u.role_name,
    position: u.position || u.user_position
  }));

  renderUsers();
  renderUserCompanyDropdown();
  renderVesselDropdown();

  setStatus("Ready");
}

async function refreshVessels() {
  setStatus("Loading vessels…");

  if (typeof ensureCompaniesLoaded === "function") {
    await ensureCompaniesLoaded();
  }

  renderVesselCompanyDropdown();

  state.vessels = await csvbRpc("csvb_admin_list_vessels_by_company", {
    p_company_id: null
  });

  renderUserCompanyDropdown();

  renderVessels();
  renderVesselDropdown();

  setStatus("Ready");
}

/* ======================== Create user ======================== */
function initCreateUser() {
  const btn = document.getElementById("cu_createBtn");
  const clearBtn = document.getElementById("cu_clearBtn");
  const companySel = document.getElementById("cu_company");
  const roleSel = document.getElementById("cu_role");

  const posPick = document.getElementById("cu_position_pick");

  if (posPick) {
    posPick.addEventListener("change", () => {
      const v = posPick.value || "";
      const free = document.getElementById("cu_position");
      if (v && free) free.value = v;
    });
  }

  if (companySel) {
    companySel.addEventListener("change", () => {
      renderVesselDropdown();
    });
  }

  if (roleSel) {
    roleSel.addEventListener("change", () => {
      updateCreateUserCompanyControls();
      renderVesselDropdown();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearWarn();
      clearOk();

      document.getElementById("cu_username").value = "";
      document.getElementById("cu_password").value = "";
      document.getElementById("cu_position").value = "";
      document.getElementById("cu_position_pick").value = "";
      document.getElementById("cu_vessel").value = "";
      document.getElementById("cu_force_reset").checked = false;

      renderUserCompanyDropdown();
      renderVesselDropdown();
    });
  }

  renderUserCompanyDropdown();
  renderVesselDropdown();

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      if (typeof ensureCompaniesLoaded === "function") {
        await ensureCompaniesLoaded();
      }

      renderUserCompanyDropdown();
      renderVesselDropdown();

      const username = (document.getElementById("cu_username").value || "").trim();
      const password = (document.getElementById("cu_password").value || "").trim();
      const role = document.getElementById("cu_role").value;
      const position = (document.getElementById("cu_position").value || "").trim();
      const company_id = currentCreateUserCompanyId();
      const vessel_id = (document.getElementById("cu_vessel").value || "").trim();
      const force_password_reset = !!document.getElementById("cu_force_reset").checked;

      if (!username) throw new Error("Username is required.");
      if (!password) throw new Error("Password is required.");
      if (!role) throw new Error("Role is required.");

      if (!isPlatformUserRole(role) && !company_id) {
        throw new Error("Company is required for non-platform users.");
      }

      if (isPlatformUserRole(role) && vessel_id) {
        throw new Error("Platform users cannot be assigned to vessels.");
      }

      setStatus("Creating user…");

      const resp = await callSuAdmin({
        action: "create_user",
        username,
        password,
        role,
        position: position || null,
        vessel_id: vessel_id || null,
        force_password_reset,
      });

      let userId = extractCreatedUserId(resp);

      await refreshUsers();

      if (!userId) {
        userId = await findUserIdByUsername(username);
      }

      if (!userId) {
        throw new Error(
          "User was created, but the new profile id could not be found for company assignment. Refresh the page and verify the user."
        );
      }

      if (!isPlatformUserRole(role)) {
        if (vessel_id) {
          await csvbRpc("csvb_admin_set_profile_vessel", {
            p_user_id: userId,
            p_vessel_id: vessel_id,
          });
        } else {
          await csvbRpc("csvb_admin_set_profile_company", {
            p_user_id: userId,
            p_company_id: company_id,
          });
        }
      }

      showOk("User created and company context assigned.\n\n" + JSON.stringify(resp, null, 2));

      document.getElementById("cu_username").value = "";
      document.getElementById("cu_password").value = "";
      document.getElementById("cu_position").value = "";
      document.getElementById("cu_position_pick").value = "";
      document.getElementById("cu_vessel").value = "";
      document.getElementById("cu_force_reset").checked = false;

      state.selectedCompanyId = company_id || state.selectedCompanyId;

      await refreshUsers();

      if (typeof refreshCompanies === "function") {
        await refreshCompanies();
      }

      if (typeof refreshSelectedCompanyDetails === "function") {
        await refreshSelectedCompanyDetails();
      }

      renderUserCompanyDropdown();
      renderVesselDropdown();

      setStatus("Ready");
    } catch (e) {
      setStatus("Ready");
      showWarn(String(e?.message || e));
    }
  });
}

/* ======================== Vessel create ======================== */
function initAddVessel() {
  const btn = document.getElementById("v_addBtn");
  const clearBtn = document.getElementById("v_clearBtn");

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearWarn();
      clearOk();

      document.getElementById("v_name").value = "";
      document.getElementById("v_hull").value = "";
      document.getElementById("v_imo").value = "";
      document.getElementById("v_call").value = "";

      renderVesselCompanyDropdown();
    });
  }

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      if (typeof ensureCompaniesLoaded === "function") {
        await ensureCompaniesLoaded();
      }

      renderVesselCompanyDropdown();

      const company_id = (document.getElementById("v_company")?.value || "").trim();
      const name = (document.getElementById("v_name").value || "").trim();
      const hull_number = (document.getElementById("v_hull").value || "").trim();
      const imo_number_raw = (document.getElementById("v_imo").value || "").trim();
      const call_sign = (document.getElementById("v_call").value || "").trim();

      if (!company_id) throw new Error("Company is required.");
      if (!name) throw new Error("Vessel name is required.");

      if (imo_number_raw && !/^[0-9]+$/.test(imo_number_raw)) {
        throw new Error("IMO number must contain digits only, or remain blank.");
      }

      setStatus("Adding vessel…");

      const resp = await csvbRpc("csvb_admin_upsert_vessel", {
        p_vessel_id: null,
        p_company_id: company_id,
        p_name: name,
        p_hull_number: hull_number || null,
        p_imo_number: imo_number_raw || null,
        p_call_sign: call_sign || null,
        p_is_active: true,
        p_move_related: true
      });

      showOk("Vessel saved.\n\n" + JSON.stringify(resp, null, 2));

      document.getElementById("v_name").value = "";
      document.getElementById("v_hull").value = "";
      document.getElementById("v_imo").value = "";
      document.getElementById("v_call").value = "";

      state.selectedCompanyId = company_id;

      await refreshVessels();

      if (typeof refreshCompanies === "function") {
        await refreshCompanies();
        const c = companyById(company_id);
        if (c) fillCompanyForm(c);
        if (typeof refreshSelectedCompanyDetails === "function") {
          await refreshSelectedCompanyDetails();
        }
      }

      setStatus("Ready");
    } catch (e) {
      setStatus("Ready");
      showWarn(String(e?.message || e));
    }
  });
}

/* ======================== Search inputs ======================== */
function initSearch() {
  const u = document.getElementById("u_search");
  if (u) u.addEventListener("input", () => renderUsers());

  const v = document.getElementById("v_search");
  if (v) v.addEventListener("input", () => renderVessels());
}

/* ======================== Rights Matrix ======================== */
const RM_ACTIONS = ["view", "edit", "admin", "export"];
const RM_SCOPES = [
  { value: "", label: "Off" },
  { value: "vessel_assigned", label: "Own vessel" },
  { value: "vessel_any", label: "Any vessel" },
  { value: "company", label: "Company-wide" },
  { value: "global", label: "Platform-wide" },
];

const RM_SCOPE_HELP = {
  "": "Off — no access.",
  vessel_assigned: "Own vessel — access only to the user's assigned vessel.",
  vessel_any: "Any vessel — access to permitted vessels within the company scope.",
  company: "Company-wide — access within the user's own company.",
  global: "Platform-wide — access across companies. Normally only for Super Admin."
};

function rmSetStatus(msg) {
  const el = document.getElementById("rmStatus");
  if (el) el.textContent = msg || "—";
}

function rmBuildRoleOptions() {
  const sel = document.getElementById("rmRole");
  if (!sel) return;
  const roles = state.rm.roles?.length ? state.rm.roles : state.roles;
  sel.innerHTML = roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
}

function rmBuildPositionOptions() {
  const sel = document.getElementById("rmPosition");
  if (!sel) return;

  const opts = [];
  opts.push(`<option value="">(No position / NULL)</option>`);
  for (const p of (state.rm.positions || [])) {
    opts.push(`<option value="${esc(p)}">${esc(p)}</option>`);
  }
  sel.innerHTML = opts.join("");
}

function rmPermissionIdFor(module_id, action) {
  const p = (state.rm.permissions || []).find(
    (x) => String(x.module_id) === String(module_id) && String(x.action) === String(action)
  );
  return p ? p.id : null;
}

function rmGrantsMap(grants) {
  const m = new Map();
  (grants || []).forEach((g) => {
    m.set(String(g.permission_id), { scope: g.scope, is_granted: !!g.is_granted });
  });
  return m;
}

function rmCellSelect(currentValue, permission_id) {
  const sel = document.createElement("select");
  sel.className = "rmCellSel";
  sel.dataset.permissionId = String(permission_id);

  RM_SCOPES.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.value;
    opt.textContent = s.label;
    opt.title = RM_SCOPE_HELP[s.value] || s.label;
    sel.appendChild(opt);
  });

  sel.value = currentValue || "";
  return sel;
}

function rmRenderTable() {
  const tbody = document.getElementById("rmTbody");
  if (!tbody) return;

  const grantsByPerm = rmGrantsMap(state.rm.grants);
  const mods = state.rm.modules || [];

  if (!mods.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted small" style="padding:14px;">No modules found.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  for (const mod of mods) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.className = "rmSticky";
    tdName.style.minWidth = "240px";
    tdName.textContent = mod.name || mod.code || mod.id;
    tr.appendChild(tdName);

    for (const action of RM_ACTIONS) {
      const td = document.createElement("td");

      const permId = rmPermissionIdFor(mod.id, action);
      if (!permId) {
        td.textContent = "—";
        tr.appendChild(td);
        continue;
      }

      const g = grantsByPerm.get(String(permId));
      const currentScope = g && g.is_granted ? g.scope : "";

      const sel = rmCellSelect(currentScope, permId);
      td.appendChild(sel);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

async function rmLoadMeta() {
  rmSetStatus("Loading meta…");

  const mp = await callSuAdmin({ action: "list_modules_permissions" });
  state.rm.modules = mp.modules || [];
  state.rm.permissions = mp.permissions || [];

  const rp = await callSuAdmin({ action: "list_roles_positions" });
  state.rm.roles = rp.roles || [];
  state.rm.positions = rp.positions || [];

  // Sync create-user role dropdown with DB roles when provided
  if (state.rm.roles?.length) {
    state.roles = state.rm.roles.slice();
    renderRoleDropdown();
  }

  rmBuildRoleOptions();
  rmBuildPositionOptions();

  state.rm.loadedMeta = true;
  rmSetStatus("Ready");
}

async function rmLoadGrants() {
  const roleSel = document.getElementById("rmRole");
  const posSel = document.getElementById("rmPosition");
  if (!roleSel || !posSel) return;

  const role = roleSel.value;
  const position = posSel.value ? posSel.value : null;

  rmSetStatus("Loading grants…");
  const res = await callSuAdmin({ action: "get_role_permissions", role, position });
  state.rm.grants = res.grants || [];

  rmRenderTable();
  rmSetStatus("Ready");
}

async function rmSaveGrants() {
  const roleSel = document.getElementById("rmRole");
  const posSel = document.getElementById("rmPosition");
  const tbody = document.getElementById("rmTbody");
  if (!roleSel || !posSel || !tbody) return;

  const role = roleSel.value;
  const position = posSel.value ? posSel.value : null;

  const selects = tbody.querySelectorAll("select[data-permission-id]");
  const grants = [];

  selects.forEach((sel) => {
    const permission_id = sel.dataset.permissionId;
    const scope = sel.value;

    if (!permission_id) return;

    if (!scope) {
      grants.push({ permission_id, scope: "global", is_granted: false });
    } else {
      grants.push({ permission_id, scope, is_granted: true });
    }
  });

  rmSetStatus("Saving with audit trail…");

  const { data, error } = await sb.rpc("csvb_set_role_permissions_audited", {
    p_role: role,
    p_position: position,
    p_grants: grants
  });

  if (error) throw error;

  const saved = data || {};
  rmSetStatus(`Saved with audit trail (${saved.updated ?? 0} updated, ${saved.inserted ?? 0} inserted)`);
  await rmLoadGrants();
}

function initRightsMatrixHandlers() {
  const reloadBtn = document.getElementById("rmReload");
  const saveBtn = document.getElementById("rmSave");
  const roleSel = document.getElementById("rmRole");
  const posSel = document.getElementById("rmPosition");

  if (reloadBtn) reloadBtn.addEventListener("click", rmLoadGrants);
  if (saveBtn) saveBtn.addEventListener("click", rmSaveGrants);

  if (roleSel) roleSel.addEventListener("change", rmLoadGrants);
  if (posSel) posSel.addEventListener("change", rmLoadGrants);
}

async function ensureRightsMatrixLoaded() {
  if (!state.rm.loadedMeta) {
    await rmLoadMeta();
    await rmLoadGrants();
  }
}

/* ======================== Init ======================== */
async function init() {
  clearWarn();
  clearOk();
  setStatus("Loading…");

  dbgInit();
  initTabs();

  const me = await window.AUTH.requireAuth(["super_admin"], {
    unauthorizedRedirect: "./q-dashboard.html",
  });
  if (!me) return;

  const badge = document.getElementById("userBadge");
  if (badge) badge.textContent = `Logged in`;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "./login.html";
  });

  // Connectivity test
  await callSuAdmin({ action: "ping" });

  // Initialize UI wiring
  renderRoleDropdown();
  initCreateUser();
  initAddVessel();
  initSearch();
  if (typeof initUserFilters === "function") initUserFilters();
  initRightsMatrixHandlers();
  initCompaniesHandlers();
  initCompanyAssignmentHandlers();

  // Load data
  await refreshVessels();
  renderVesselDropdown();
  await refreshUsers();

  setStatus("Ready");
}

init().catch((e) => showWarn(String(e?.message || e)));


/* ======================== MC-3B2 Companies Tab ======================== */

async function csvbRpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}

function companyById(id) {
  return (state.companies || []).find((c) => String(c.id) === String(id)) || null;
}

function selectedCompany() {
  return companyById(state.selectedCompanyId);
}

function boolFromSelectValue(v) {
  return String(v) === "true";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function getValue(id) {
  return (document.getElementById(id)?.value || "").trim();
}

function clearCompanyForm() {
  state.selectedCompanyId = null;

  setValue("co_company_id", "");
  setValue("co_company_name", "");
  setValue("co_short_name", "");
  setValue("co_company_code", "");
  setValue("co_is_active", "true");
  setValue("co_notes", "");

  setText("selectedCompanyTitle", "Create / Edit company");
  setText("co_vessel_count", "0");
  setText("co_user_count", "0");
  setText("co_module_count", "0");

  const mb = document.getElementById("companyModulesBody");
  if (mb) mb.innerHTML = `<div class="muted small">Save or select a company first.</div>`;

  const vb = document.getElementById("companyVesselsBody");
  if (vb) vb.innerHTML = `<tr><td colspan="3" class="muted small">Select a company.</td></tr>`;

  const ub = document.getElementById("companyUsersBody");
  if (ub) ub.innerHTML = `<tr><td colspan="5" class="muted small">Select a company.</td></tr>`;

  renderCompanies();
}

function fillCompanyForm(c) {
  if (!c) {
    clearCompanyForm();
    return;
  }

  state.selectedCompanyId = c.id;

  setValue("co_company_id", c.id);
  setValue("co_company_name", c.company_name || "");
  setValue("co_short_name", c.short_name || "");
  setValue("co_company_code", c.company_code || "");
  setValue("co_is_active", c.is_active === false ? "false" : "true");
  setValue("co_notes", c.notes || "");

  setText("selectedCompanyTitle", `Edit company: ${c.company_name || c.company_code || c.id}`);
  setText("co_vessel_count", c.vessel_count ?? 0);
  setText("co_user_count", c.user_count ?? 0);
  setText("co_module_count", c.enabled_module_count ?? 0);

  renderCompanies();
}

function renderCompanies() {
  const tbody = document.getElementById("companiesBody");
  if (!tbody) return;

  const q = (document.getElementById("co_search")?.value || "").trim().toLowerCase();
  const companies = Array.isArray(state.companies) ? state.companies : [];

  const filtered = companies.filter((c) => {
    if (!q) return true;
    return [
      c.company_name,
      c.short_name,
      c.company_code,
      c.notes
    ].filter(Boolean).join(" ").toLowerCase().includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted small">No companies found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((c) => {
    const selected = String(c.id) === String(state.selectedCompanyId);
    const status = c.is_active === false
      ? `<span class="pill bad">Inactive</span>`
      : `<span class="pill ok">Active</span>`;

    return `
      <tr class="${selected ? "companySelectedRow" : ""}">
        <td>
          <div style="font-weight:950;">${esc(c.company_name || "")}</div>
          <div class="muted small">${esc(c.short_name || "")}</div>
        </td>
        <td class="mono">${esc(c.company_code || "")}</td>
        <td>${status}</td>
        <td class="small">
          <div>Vessels: <b>${esc(c.vessel_count ?? 0)}</b></div>
          <div>Users: <b>${esc(c.user_count ?? 0)}</b></div>
          <div>Modules: <b>${esc(c.enabled_module_count ?? 0)}</b></div>
        </td>
        <td>
          <button class="btn2 btnSmall" type="button" data-company-id="${esc(c.id)}">Open</button>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("button[data-company-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      clearWarn();
      clearOk();

      try {
        const id = btn.getAttribute("data-company-id");
        const c = companyById(id);
        if (!c) throw new Error("Company not found in page state.");

        fillCompanyForm(c);
        await refreshSelectedCompanyDetails();
      } catch (e) {
        showWarn(String(e?.message || e));
      }
    });
  });
}

async function refreshCompanies() {
  setStatus("Loading companies…");
  state.companies = await csvbRpc("csvb_admin_list_companies", {});
  state.companiesLoaded = true;

  renderVesselCompanyDropdown();

  renderCompanies();

  if (!state.selectedCompanyId && state.companies.length) {
    fillCompanyForm(state.companies[0]);
    await refreshSelectedCompanyDetails();
  } else if (state.selectedCompanyId) {
    const c = companyById(state.selectedCompanyId);
    if (c) fillCompanyForm(c);
  }

  setStatus("Ready");
}

async function ensureCompaniesLoaded() {
  if (!state.companiesLoaded) {
    await refreshCompanies();
  }
}

async function saveCompany() {
  clearWarn();
  clearOk();

  const company_id = getValue("co_company_id") || null;
  const company_name = getValue("co_company_name");
  const short_name = getValue("co_short_name") || null;
  const company_code = getValue("co_company_code") || null;
  const is_active = boolFromSelectValue(getValue("co_is_active") || "true");
  const notes = getValue("co_notes") || null;

  if (!company_name) throw new Error("Company name is required.");

  setStatus("Saving company…");

  const saved = await csvbRpc("csvb_admin_upsert_company", {
    p_company_id: company_id,
    p_company_name: company_name,
    p_short_name: short_name,
    p_company_code: company_code,
    p_is_active: is_active,
    p_notes: notes,
  });

  showOk("Company saved.");
  state.selectedCompanyId = saved.id;

  await refreshCompanies();
  fillCompanyForm(companyById(saved.id) || saved);
  await refreshSelectedCompanyDetails();

  setStatus("Ready");
}

async function refreshSelectedCompanyDetails() {
  const c = selectedCompany();
  if (!c?.id) {
    if (typeof renderCompanyAssignmentControls === "function") {
      renderCompanyAssignmentControls();
    }
    return;
  }

  setStatus("Loading company details…");

  const hasAssignmentControls = typeof renderCompanyAssignmentControls === "function";

  const calls = [
    csvbRpc("csvb_admin_list_company_modules", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_vessels_by_company", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_users_by_company", { p_company_id: c.id }),
  ];

  if (hasAssignmentControls) {
    calls.push(csvbRpc("csvb_admin_list_vessels_by_company", { p_company_id: null }));
    calls.push(csvbRpc("csvb_admin_list_users_by_company", { p_company_id: null }));
  }

  const results = await Promise.all(calls);

  state.companyModules = results[0] || [];
  state.companyVessels = results[1] || [];
  state.companyUsers = results[2] || [];

  if (hasAssignmentControls) {
    state.companyAllVessels = results[3] || [];
    state.companyAllUsers = results[4] || [];
  }

  renderCompanyModules();
  renderCompanyVessels();
  renderCompanyUsers();

  if (hasAssignmentControls) {
    renderCompanyAssignmentControls();
  }

  setStatus("Ready");
}

function renderCompanyModules() {
  const wrap = document.getElementById("companyModulesBody");
  if (!wrap) return;

  const modules = Array.isArray(state.companyModules) ? state.companyModules : [];

  if (!modules.length) {
    wrap.innerHTML = `<div class="muted small">No module records found.</div>`;
    return;
  }

  wrap.innerHTML = modules.map((m) => `
    <label class="moduleToggle">
      <input type="checkbox"
             data-module-key="${esc(m.module_key)}"
             ${m.is_enabled ? "checked" : ""} />
      <span>
        <span style="font-weight:950;color:#062A5E;">${esc(m.module_label || m.module_key)}</span>
        <span class="muted small"> — ${esc(m.module_group || "")}</span>
      </span>
    </label>
  `).join("");

  wrap.querySelectorAll("input[data-module-key]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      clearWarn();
      clearOk();

      const c = selectedCompany();
      if (!c?.id) {
        showWarn("Select a company first.");
        return;
      }

      const moduleKey = cb.getAttribute("data-module-key");
      const enabled = !!cb.checked;

      try {
        await csvbRpc("csvb_admin_set_company_module", {
          p_company_id: c.id,
          p_module_key: moduleKey,
          p_is_enabled: enabled,
        });

        showOk(`Module ${enabled ? "enabled" : "disabled"}: ${moduleKey}`);

        await refreshSelectedCompanyDetails();
        await refreshCompanies();
      } catch (e) {
        cb.checked = !enabled;
        showWarn(String(e?.message || e));
      }
    });
  });
}

function renderCompanyVessels() {
  const tbody = document.getElementById("companyVesselsBody");
  if (!tbody) return;

  const rows = Array.isArray(state.companyVessels) ? state.companyVessels : [];

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="muted small">No vessels for this company.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((v) => {
    const status = v.is_active === false
      ? `<span class="pill bad">Inactive</span>`
      : `<span class="pill ok">Active</span>`;

    return `
      <tr>
        <td>${esc(v.name || "")}</td>
        <td class="mono">${esc(v.imo_number || "")}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");
}

function renderCompanyUsers() {
  const tbody = document.getElementById("companyUsersBody");
  if (!tbody) return;

  const rows = Array.isArray(state.companyUsers) ? state.companyUsers : [];

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted small">No users for this company.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((u) => {
    const disabled = !!u.is_disabled || u.is_active === false;
    const status = disabled
      ? `<span class="pill bad">Disabled</span>`
      : `<span class="pill ok">Active</span>`;

    return `
      <tr>
        <td class="mono">${esc(u.username || "")}</td>
        <td>${esc(u.role_name || u.role || "")}</td>
        <td>${esc(u.user_position || u.position || "")}</td>
        <td>${esc(u.vessel_name || "")}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");
}

function initCompaniesHandlers() {
  const refreshBtn = document.getElementById("co_refreshBtn");
  const newBtn = document.getElementById("co_newBtn");
  const saveBtn = document.getElementById("co_saveBtn");
  const search = document.getElementById("co_search");

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      clearWarn();
      clearOk();
      try {
        await refreshCompanies();
        showOk("Companies refreshed.");
      } catch (e) {
        showWarn(String(e?.message || e));
      }
    });
  }

  if (newBtn) {
    newBtn.addEventListener("click", () => {
      clearWarn();
      clearOk();
      clearCompanyForm();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      try {
        await saveCompany();
      } catch (e) {
        showWarn(String(e?.message || e));
      }
    });
  }

  if (search) {
    search.addEventListener("input", renderCompanies);
  }
}


/* ======================== MC-3B4 Company Assignment Controls ======================== */

/*
  These controls use the MC-3B3 RPCs:
  - csvb_admin_set_vessel_company
  - csvb_admin_set_profile_company
  - csvb_admin_set_profile_vessel
*/

function renderCompanyAssignmentControls() {
  const c = selectedCompany();

  const vesselSel = document.getElementById("co_assign_vessel_select");
  const userSel = document.getElementById("co_assign_user_select");
  const userVesselSel = document.getElementById("co_assign_user_vessel_select");

  if (!vesselSel || !userSel || !userVesselSel) return;

  if (!c?.id) {
    vesselSel.innerHTML = `<option value="">Select company first…</option>`;
    userSel.innerHTML = `<option value="">Select company first…</option>`;
    userVesselSel.innerHTML = `<option value="">Select company first…</option>`;
    return;
  }

  const allVessels = Array.isArray(state.companyAllVessels) ? state.companyAllVessels : [];
  const allUsers = Array.isArray(state.companyAllUsers) ? state.companyAllUsers : [];
  const companyVessels = Array.isArray(state.companyVessels) ? state.companyVessels : [];

  vesselSel.innerHTML = [
    `<option value="">Select vessel…</option>`,
    ...allVessels.map((v) => {
      const current = String(v.company_id || "") === String(c.id) ? " — already in this company" : "";
      const companyName = v.company_name ? ` — ${v.company_name}` : "";
      return `<option value="${esc(v.id)}">${esc(v.name || v.id)}${esc(companyName)}${esc(current)}</option>`;
    })
  ].join("");

  userSel.innerHTML = [
    `<option value="">Select user…</option>`,
    ...allUsers
      .filter((u) => !["super_admin", "platform_owner"].includes(String(u.role_name || u.role || "")))
      .map((u) => {
        const companyName = u.company_name ? ` — ${u.company_name}` : " — no company";
        const role = u.role_name || u.role || "";
        return `<option value="${esc(u.id)}">${esc(u.username || u.id)} — ${esc(role)}${esc(companyName)}</option>`;
      })
  ].join("");

  userVesselSel.innerHTML = [
    `<option value="">(Clear vessel assignment)</option>`,
    ...companyVessels.map((v) => {
      return `<option value="${esc(v.id)}">${esc(v.name || v.id)}${v.imo_number ? " — IMO " + esc(v.imo_number) : ""}</option>`;
    })
  ].join("");
}



/* Duplicate refreshSelectedCompanyDetails removed by MC-3B4 repair. */



async function assignSelectedVesselToCompany() {
  clearWarn();
  clearOk();

  const c = selectedCompany();
  if (!c?.id) throw new Error("Select a company first.");

  const vesselId = getValue("co_assign_vessel_select");
  if (!vesselId) throw new Error("Select a vessel first.");

  const vessel = (state.companyAllVessels || []).find((v) => String(v.id) === String(vesselId));
  const moveRelated = !!document.getElementById("co_move_related")?.checked;

  const message =
    `Assign vessel to company?\n\n` +
    `Vessel: ${vessel?.name || vesselId}\n` +
    `Company: ${c.company_name || c.company_code}\n\n` +
    `Move related data: ${moveRelated ? "YES" : "NO"}`;

  if (!confirm(message)) return;

  setStatus("Assigning vessel…");

  const result = await csvbRpc("csvb_admin_set_vessel_company", {
    p_vessel_id: vesselId,
    p_company_id: c.id,
    p_move_related: moveRelated,
  });

  showOk(`Vessel assigned.\n\n${JSON.stringify(result, null, 2)}`);

  await refreshCompanies();
  fillCompanyForm(companyById(c.id) || c);
  await refreshSelectedCompanyDetails();

  if (typeof refreshVessels === "function") {
    await refreshVessels();
  }
  if (typeof renderVesselDropdown === "function") {
    renderVesselDropdown();
  }

  setStatus("Ready");
}

async function assignSelectedUserToCompany() {
  clearWarn();
  clearOk();

  const c = selectedCompany();
  if (!c?.id) throw new Error("Select a company first.");

  const userId = getValue("co_assign_user_select");
  if (!userId) throw new Error("Select a user first.");

  const user = (state.companyAllUsers || []).find((u) => String(u.id) === String(userId));

  const message =
    `Assign user to company?\n\n` +
    `User: ${user?.username || userId}\n` +
    `Company: ${c.company_name || c.company_code}`;

  if (!confirm(message)) return;

  setStatus("Assigning user…");

  const result = await csvbRpc("csvb_admin_set_profile_company", {
    p_user_id: userId,
    p_company_id: c.id,
  });

  showOk(`User assigned to company.\n\n${JSON.stringify(result, null, 2)}`);

  await refreshCompanies();
  fillCompanyForm(companyById(c.id) || c);
  await refreshSelectedCompanyDetails();

  if (typeof refreshUsers === "function") {
    await refreshUsers();
  }

  setStatus("Ready");
}

async function assignSelectedUserToVessel() {
  clearWarn();
  clearOk();

  const c = selectedCompany();
  if (!c?.id) throw new Error("Select a company first.");

  const userId = getValue("co_assign_user_select");
  if (!userId) throw new Error("Select a user first.");

  const vesselIdRaw = getValue("co_assign_user_vessel_select");
  const vesselId = vesselIdRaw || null;

  const user = (state.companyAllUsers || []).find((u) => String(u.id) === String(userId));
  const vessel = vesselId
    ? (state.companyVessels || []).find((v) => String(v.id) === String(vesselId))
    : null;

  const message =
    `Assign user to vessel?\n\n` +
    `User: ${user?.username || userId}\n` +
    `Vessel: ${vessel ? vessel.name : "(clear vessel assignment)"}\n\n` +
    `The user's company will follow the vessel company.`;

  if (!confirm(message)) return;

  setStatus("Assigning user vessel…");

  const result = await csvbRpc("csvb_admin_set_profile_vessel", {
    p_user_id: userId,
    p_vessel_id: vesselId,
  });

  showOk(`User vessel assignment updated.\n\n${JSON.stringify(result, null, 2)}`);

  await refreshCompanies();
  fillCompanyForm(companyById(c.id) || c);
  await refreshSelectedCompanyDetails();

  if (typeof refreshUsers === "function") {
    await refreshUsers();
  }

  setStatus("Ready");
}

function initCompanyAssignmentHandlers() {
  const vesselBtn = document.getElementById("co_assign_vessel_btn");
  const userCompanyBtn = document.getElementById("co_assign_user_company_btn");
  const userVesselBtn = document.getElementById("co_assign_user_vessel_btn");

  if (vesselBtn) {
    vesselBtn.addEventListener("click", async () => {
      try {
        await assignSelectedVesselToCompany();
      } catch (e) {
        setStatus("Ready");
        showWarn(String(e?.message || e));
      }
    });
  }

  if (userCompanyBtn) {
    userCompanyBtn.addEventListener("click", async () => {
      try {
        await assignSelectedUserToCompany();
      } catch (e) {
        setStatus("Ready");
        showWarn(String(e?.message || e));
      }
    });
  }

  if (userVesselBtn) {
    userVesselBtn.addEventListener("click", async () => {
      try {
        await assignSelectedUserToVessel();
      } catch (e) {
        setStatus("Ready");
        showWarn(String(e?.message || e));
      }
    });
  }
}


function initUserFilters() {
  ensureUserFiltersBar();
  renderUserFilterDropdowns();
}
