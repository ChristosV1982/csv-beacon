#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc3b2_companies_tab

cp public/su-admin.html backup_before_mc3b2_companies_tab/su-admin.html
cp public/su-admin.js backup_before_mc3b2_companies_tab/su-admin.js

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc3b2_companies_tab/service-worker.js
fi

node <<'NODE'
const fs = require("fs");

const htmlPath = "public/su-admin.html";
let html = fs.readFileSync(htmlPath, "utf8");

/* ------------------------------------------------------------
   1. Add Companies tab button
------------------------------------------------------------ */

if (!html.includes('data-tab="companies"')) {
  html = html.replace(
    '<button class="tab active" type="button" data-tab="users">Users</button>',
    '<button class="tab" type="button" data-tab="companies">Companies</button>\n          <button class="tab active" type="button" data-tab="users">Users</button>'
  );
}

/* ------------------------------------------------------------
   2. Add Companies tab CSS
------------------------------------------------------------ */

if (!html.includes(".companyLayout")) {
  html = html.replace(
    "</style>",
    `
    /* Companies tab */
    .companyLayout{
      display:grid;
      grid-template-columns: 1.05fr 1.35fr;
      gap:12px;
      align-items:start;
    }
    @media(max-width:1100px){
      .companyLayout{grid-template-columns:1fr;}
    }
    .companySummary{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:8px;
      margin-top:10px;
    }
    @media(max-width:700px){
      .companySummary{grid-template-columns:1fr;}
    }
    .summaryBox{
      background:#F4F8FC;
      border:1px solid #D6E4F5;
      border-radius:12px;
      padding:10px;
    }
    .summaryBox .n{
      font-size:1.25rem;
      font-weight:950;
      color:#062A5E;
    }
    .summaryBox .t{
      font-size:.85rem;
      color:#5E6F86;
      font-weight:800;
    }
    .moduleToggle{
      display:flex;
      align-items:center;
      gap:10px;
      padding:8px 0;
    }
    .moduleToggle input{
      width:auto;
    }
    .companySelectedRow{
      outline:2px solid #0097A7;
      outline-offset:-2px;
      background:#F0FBFC !important;
    }
  </style>`
  );
}

/* ------------------------------------------------------------
   3. Add Companies tab body before Users tab
------------------------------------------------------------ */

if (!html.includes('id="tab-companies"')) {
  const companiesTab = `
    <!-- COMPANIES TAB -->
    <div class="card" id="tab-companies" style="display:none;">
      <div style="font-weight:950;font-size:1.05rem;">Companies</div>
      <div class="muted" style="margin-top:6px;">
        Manage companies/tenants, module access, and view vessels/users grouped by company.
      </div>

      <div style="height:12px;"></div>

      <div class="companyLayout">
        <div class="card" style="box-shadow:none;">
          <div class="row">
            <div style="font-weight:950;">Company list</div>
            <div class="right">
              <button class="btn2 btnSmall" type="button" id="co_refreshBtn">Refresh</button>
            </div>
          </div>

          <div style="height:10px;"></div>

          <input id="co_search" placeholder="Search company / code…" />

          <div style="height:10px;"></div>

          <div style="overflow:auto; max-height:520px;">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Code</th>
                  <th>Status</th>
                  <th>Counts</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="companiesBody">
                <tr><td colspan="5" class="muted small">Loading…</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="box-shadow:none;">
          <div class="row">
            <div>
              <div id="selectedCompanyTitle" style="font-weight:950;">Create / Edit company</div>
              <div class="muted small">Company separation foundation for C.S.V. BEACON.</div>
            </div>
            <div class="right actions">
              <button class="btn2 btnSmall" type="button" id="co_newBtn">New company</button>
              <button class="btn btnSmall" type="button" id="co_saveBtn">Save company</button>
            </div>
          </div>

          <input type="hidden" id="co_company_id" />

          <div style="height:12px;"></div>

          <div class="grid2">
            <div class="field">
              <label>Company name</label>
              <input id="co_company_name" placeholder="e.g. Example Shipping Co." />
            </div>

            <div class="field">
              <label>Short name</label>
              <input id="co_short_name" placeholder="e.g. EXAMPLE" />
            </div>
          </div>

          <div style="height:10px;"></div>

          <div class="grid2">
            <div class="field">
              <label>Company code</label>
              <input id="co_company_code" placeholder="e.g. EXAMPLE-SHIPPING" />
              <div class="muted small">If blank, Supabase will generate it from company name.</div>
            </div>

            <div class="field">
              <label>Status</label>
              <select id="co_is_active">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div style="height:10px;"></div>

          <div class="field">
            <label>Notes</label>
            <textarea id="co_notes" placeholder="Optional notes"></textarea>
          </div>

          <div class="companySummary">
            <div class="summaryBox">
              <div class="n" id="co_vessel_count">0</div>
              <div class="t">Vessels</div>
            </div>
            <div class="summaryBox">
              <div class="n" id="co_user_count">0</div>
              <div class="t">Users</div>
            </div>
            <div class="summaryBox">
              <div class="n" id="co_module_count">0</div>
              <div class="t">Enabled modules</div>
            </div>
          </div>

          <div style="height:16px;"></div>

          <div class="grid2">
            <div class="card" style="box-shadow:none;">
              <div style="font-weight:950;">Company modules</div>
              <div class="muted small" style="margin-top:6px;">Toggle module access for the selected company.</div>
              <div style="height:8px;"></div>
              <div id="companyModulesBody" class="muted small">Select a company.</div>
            </div>

            <div class="card" style="box-shadow:none;">
              <div style="font-weight:950;">Company vessels</div>
              <div class="muted small" style="margin-top:6px;">Read-only list for now. Vessel creation will be connected to company in the next step.</div>
              <div style="height:8px;"></div>
              <div style="overflow:auto; max-height:260px;">
                <table>
                  <thead>
                    <tr>
                      <th>Vessel</th>
                      <th>IMO</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="companyVesselsBody">
                    <tr><td colspan="3" class="muted small">Select a company.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style="height:12px;"></div>

          <div class="card" style="box-shadow:none;">
            <div style="font-weight:950;">Company users</div>
            <div class="muted small" style="margin-top:6px;">Read-only list for now. User creation will be connected to company in the next step.</div>
            <div style="height:8px;"></div>
            <div style="overflow:auto; max-height:260px;">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Position</th>
                    <th>Vessel</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="companyUsersBody">
                  <tr><td colspan="5" class="muted small">Select a company.</td></tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>

`;

  html = html.replace("    <!-- USERS TAB -->", companiesTab + "    <!-- USERS TAB -->");
}

fs.writeFileSync(htmlPath, html, "utf8");
NODE

node <<'NODE'
const fs = require("fs");

const jsPath = "public/su-admin.js";
let js = fs.readFileSync(jsPath, "utf8");

/* ------------------------------------------------------------
   1. Add companies state
------------------------------------------------------------ */

if (!js.includes("companies: []")) {
  js = js.replace(
    "const state = {",
    `const state = {
  companies: [],
  selectedCompanyId: null,
  companyModules: [],
  companyVessels: [],
  companyUsers: [],
  companiesLoaded: false,`
  );
}

/* ------------------------------------------------------------
   2. Add tab display + lazy loading
------------------------------------------------------------ */

if (!js.includes('document.getElementById("tab-companies")')) {
  js = js.replace(
    'document.getElementById("tab-users").style.display = t === "users" ? "" : "none";',
    `const companiesTab = document.getElementById("tab-companies");
      if (companiesTab) companiesTab.style.display = t === "companies" ? "" : "none";
      document.getElementById("tab-users").style.display = t === "users" ? "" : "none";`
  );
}

if (!js.includes('if (t === "companies")')) {
  js = js.replace(
    '      // Lazy-load Rights Matrix when tab first opened',
    `      // Lazy-load Companies when tab first opened
      if (t === "companies") {
        try {
          await ensureCompaniesLoaded();
        } catch (e) {
          showWarn(String(e?.message || e));
        }
      }

      // Lazy-load Rights Matrix when tab first opened`
  );
}

/* ------------------------------------------------------------
   3. Wire Companies handlers in init()
------------------------------------------------------------ */

if (!js.includes("initCompaniesHandlers();")) {
  js = js.replace(
    "initRightsMatrixHandlers();",
    "initRightsMatrixHandlers();\n  initCompaniesHandlers();"
  );
}

fs.writeFileSync(jsPath, js, "utf8");
NODE

if ! grep -q "MC-3B2 Companies Tab" public/su-admin.js; then
cat >> public/su-admin.js <<'JSAPPEND'


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
JSAPPEND
fi

# Bump service worker cache version
if [ -f "public/service-worker.js" ]; then
  node <<'NODE'
const fs = require("fs");
const p = "public/service-worker.js";
let s = fs.readFileSync(p, "utf8");

if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
  s = s.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "v7-mc3b2-companies-tab";');
}

fs.writeFileSync(p, s);
NODE
fi

cat > public/MC3B2_COMPANIES_TAB_APPLIED.txt <<'TXT'
MC-3B2 applied:
- Added Companies tab to Superuser Administration.
- Added company list/create/edit form.
- Added company module toggles.
- Added read-only company vessels/users panels.
- No auth.js changes.
- No Supabase key changes.
- No SQL changes.
TXT

echo "DONE: MC-3B2 Companies tab applied."
echo "Next: open Superuser Administration and hard refresh with Ctrl + Shift + R."
