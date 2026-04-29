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
  sel.innerHTML = state.roles.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
}

function renderVesselDropdown() {
  const sel = document.getElementById("cu_vessel");
  if (!sel) return;

  const opts = [];
  opts.push(`<option value="">(No vessel)</option>`);
  for (const v of state.vessels) {
    opts.push(`<option value="${esc(v.id)}">${esc(v.name || v.vessel_name || v.title || v.id)}</option>`);
  }
  sel.innerHTML = opts.join("");
}

/* ======================== Render: users ======================== */
function vesselNameById(id) {
  if (!id) return "";
  const v = state.vessels.find((x) => String(x.id) === String(id));
  return v?.name || v?.vessel_name || "";
}

function renderUsers() {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;

  const q = (document.getElementById("u_search")?.value || "").trim().toLowerCase();
  const users = Array.isArray(state.users) ? state.users : [];

  const filtered = users.filter((u) => {
    if (!q) return true;
    const hay = [u.username, u.role, u.position, vesselNameById(u.vessel_id), u.vessel_name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted small">No users found.</td></tr>`;
    return;
  }

  const rows = [];
  for (const u of filtered) {
    const disabled = !!u.is_disabled;
    const active = u.is_active === false ? false : true;
    const statusPill =
      disabled || !active ? `<span class="pill bad">Disabled</span>` : `<span class="pill ok">Active</span>`;

    const forceReset = u.force_password_reset ? `<span class="pill bad">Yes</span>` : `<span class="pill ok">No</span>`;
    const uid = u.id;

    const actionBtns = [];
    if (disabled || !active) {
      actionBtns.push(
        `<button class="btnSmall btn" data-act="enable_user" data-id="${esc(uid)}" type="button">Enable</button>`
      );
    } else {
      actionBtns.push(
        `<button class="btnSmall btnDanger" data-act="disable_user" data-id="${esc(uid)}" type="button">Disable</button>`
      );
    }
    actionBtns.push(
      `<button class="btnSmall btn2" data-act="reset_password" data-id="${esc(uid)}" type="button">Reset password</button>`
    );

    rows.push(`
      <tr>
        <td class="mono">${esc(u.username || "")}</td>
        <td>${esc(u.role || "")}</td>
        <td>${esc(u.position || "")}</td>
        <td>${esc(u.vessel_name || vesselNameById(u.vessel_id) || "")}</td>
        <td>${statusPill}</td>
        <td>${forceReset}</td>
        <td><div class="actions">${actionBtns.join("")}</div></td>
      </tr>
    `);
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
    const hay = [v.name, v.imo_number, v.hull_number, v.call_sign].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted small">No vessels found.</td></tr>`;
    return;
  }

  const rows = [];
  for (const v of filtered) {
    const active = v.is_active === false ? false : true;
    const statusPill = active ? `<span class="pill ok">Active</span>` : `<span class="pill bad">Inactive</span>`;

    const btn = active
      ? `<button class="btnSmall btnDanger" data-act="deactivate" data-id="${esc(v.id)}" type="button">Deactivate</button>`
      : `<button class="btnSmall btn" data-act="activate" data-id="${esc(v.id)}" type="button">Activate</button>`;

    rows.push(`
      <tr>
        <td>${esc(v.name || "")}</td>
        <td>${esc(v.hull_number || "")}</td>
        <td>${esc(v.imo_number || "")}</td>
        <td>${esc(v.call_sign || "")}</td>
        <td>${statusPill}</td>
        <td><div class="actions">${btn}</div></td>
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

        const nextActive = act === "activate";

        // IMPORTANT: your Edge Function expects top-level fields, not nested "vessel:{...}".
        await callSuAdmin({
          action: "upsert_vessel",
          vessel_id: v.id,
          name: v.name,
          is_active: nextActive,
          hull_number: v.hull_number ?? null,
          call_sign: v.call_sign ?? null,
          imo_number: v.imo_number ?? null,
        });

        showOk(nextActive ? "Vessel activated." : "Vessel deactivated.");
        await refreshVessels();
        renderVesselDropdown();
      } catch (e) {
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
  const resp = await callSuAdmin({ action: "list_users" });
  state.users = normalizeListResponse(resp);
  renderUsers();
  setStatus("Ready");
}

async function refreshVessels() {
  setStatus("Loading vessels…");
  const resp = await callSuAdmin({ action: "list_vessels" });
  state.vessels = normalizeListResponse(resp);
  renderVessels();
  setStatus("Ready");
}

/* ======================== Create user ======================== */
function initCreateUser() {
  const btn = document.getElementById("cu_createBtn");
  const clearBtn = document.getElementById("cu_clearBtn");

  const posPick = document.getElementById("cu_position_pick");
  if (posPick) {
    posPick.addEventListener("change", () => {
      const v = posPick.value || "";
      const free = document.getElementById("cu_position");
      if (v && free) free.value = v;
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
    });
  }

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      const username = (document.getElementById("cu_username").value || "").trim();
      const password = (document.getElementById("cu_password").value || "").trim();
      const role = document.getElementById("cu_role").value;
      const position = (document.getElementById("cu_position").value || "").trim();
      const vessel_id = (document.getElementById("cu_vessel").value || "").trim();
      const force_password_reset = !!document.getElementById("cu_force_reset").checked;

      if (!username) throw new Error("Username is required.");
      if (!password) throw new Error("Password is required.");
      if (!role) throw new Error("Role is required.");

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

      showOk(`User created successfully.\n\nResponse:\n${JSON.stringify(resp, null, 2)}`);

      await refreshUsers();
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
    });
  }

  if (!btn) return;

  btn.addEventListener("click", async () => {
    clearWarn();
    clearOk();

    try {
      const name = (document.getElementById("v_name").value || "").trim();
      const hull_number = (document.getElementById("v_hull").value || "").trim();
      const imo_number_raw = (document.getElementById("v_imo").value || "").trim();
      const call_sign = (document.getElementById("v_call").value || "").trim();

      if (!name) throw new Error("Vessel name is required.");

      // Your Edge Function expects imo_number as number|null
      const imo_number = imo_number_raw ? Number(imo_number_raw) : null;
      if (imo_number_raw && (!Number.isFinite(imo_number) || imo_number <= 0)) {
        throw new Error("IMO number must be a valid positive number (or blank).");
      }

      setStatus("Adding vessel…");
      const resp = await callSuAdmin({
        action: "upsert_vessel",
        name,
        is_active: true,
        hull_number: hull_number || null,
        call_sign: call_sign || null,
        imo_number,
      });

      showOk(`Vessel saved.\n\nResponse:\n${JSON.stringify(resp, null, 2)}`);

      await refreshVessels();
      renderVesselDropdown();
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
  { value: "", label: "No access" },
  { value: "global", label: "global" },
  { value: "company", label: "company" },
  { value: "vessel_assigned", label: "vessel_assigned" },
  { value: "vessel_any", label: "vessel_any" },
];

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

  rmSetStatus("Saving…");
  const res = await callSuAdmin({ action: "set_role_permissions", role, position, grants });

  rmSetStatus(`Saved (${res.updated ?? "ok"})`);
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
  initRightsMatrixHandlers();
  initCompaniesHandlers();

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
  if (!c?.id) return;

  setStatus("Loading company details…");

  const [modules, vessels, users] = await Promise.all([
    csvbRpc("csvb_admin_list_company_modules", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_vessels_by_company", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_users_by_company", { p_company_id: c.id }),
  ]);

  state.companyModules = modules || [];
  state.companyVessels = vessels || [];
  state.companyUsers = users || [];

  renderCompanyModules();
  renderCompanyVessels();
  renderCompanyUsers();

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
