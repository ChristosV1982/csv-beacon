#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc3b4_company_assignment_controls

cp public/su-admin.html backup_before_mc3b4_company_assignment_controls/su-admin.html
cp public/su-admin.js backup_before_mc3b4_company_assignment_controls/su-admin.js

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc3b4_company_assignment_controls/service-worker.js
fi

node <<'NODE'
const fs = require("fs");

const htmlPath = "public/su-admin.html";
let html = fs.readFileSync(htmlPath, "utf8");

/* ------------------------------------------------------------
   1. Add assignment CSS
------------------------------------------------------------ */

if (!html.includes(".assignmentGrid")) {
  html = html.replace(
    "</style>",
    `
    /* MC-3B4 company assignment controls */
    .assignmentGrid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
      align-items:start;
    }
    @media(max-width:900px){
      .assignmentGrid{grid-template-columns:1fr;}
    }
    .assignmentBox{
      background:#F4F8FC;
      border:1px solid #D6E4F5;
      border-radius:12px;
      padding:12px;
    }
    .assignmentBoxTitle{
      font-weight:950;
      color:#062A5E;
      margin-bottom:6px;
    }
    .assignmentHelp{
      color:#5E6F86;
      font-size:.88rem;
      font-weight:750;
      line-height:1.35;
      margin-bottom:10px;
    }
    .assignmentLine{
      display:flex;
      gap:8px;
      align-items:center;
      flex-wrap:wrap;
      margin-top:8px;
    }
    .assignmentLine input[type="checkbox"]{
      width:auto;
    }
  </style>`
  );
}

/* ------------------------------------------------------------
   2. Add assignment card inside Companies tab
------------------------------------------------------------ */

if (!html.includes('id="co_assignmentCard"')) {
  const assignmentHtml = `
          <div style="height:12px;"></div>

          <div class="card" id="co_assignmentCard" style="box-shadow:none;">
            <div style="font-weight:950;">Company assignment controls</div>
            <div class="muted small" style="margin-top:6px;">
              Assign existing vessels/users to the selected company. This is the multi-company foundation control area.
            </div>

            <div style="height:12px;"></div>

            <div class="assignmentGrid">
              <div class="assignmentBox">
                <div class="assignmentBoxTitle">Assign vessel to this company</div>
                <div class="assignmentHelp">
                  Moves the selected vessel under the selected company. If “move related data” is checked, linked operational records are moved with the vessel.
                </div>

                <label>Vessel</label>
                <select id="co_assign_vessel_select">
                  <option value="">Select company first…</option>
                </select>

                <div class="assignmentLine">
                  <label style="display:flex;align-items:center;gap:8px;margin:0;">
                    <input type="checkbox" id="co_move_related" checked />
                    Move related vessel data
                  </label>
                </div>

                <div style="height:10px;"></div>
                <button class="btn btnSmall" type="button" id="co_assign_vessel_btn">
                  Assign vessel to selected company
                </button>
              </div>

              <div class="assignmentBox">
                <div class="assignmentBoxTitle">Assign user to this company / vessel</div>
                <div class="assignmentHelp">
                  Assigns the user to the selected company. Vessel assignment automatically uses the vessel’s company.
                </div>

                <label>User</label>
                <select id="co_assign_user_select">
                  <option value="">Select company first…</option>
                </select>

                <div style="height:10px;"></div>

                <button class="btn2 btnSmall" type="button" id="co_assign_user_company_btn">
                  Assign user to selected company
                </button>

                <div style="height:12px;"></div>

                <label>Vessel under selected company</label>
                <select id="co_assign_user_vessel_select">
                  <option value="">Select company first…</option>
                </select>

                <div style="height:10px;"></div>

                <button class="btn btnSmall" type="button" id="co_assign_user_vessel_btn">
                  Assign user to selected vessel
                </button>
              </div>
            </div>
          </div>
`;

  const marker = `        </div>
      </div>
    </div>

    <!-- USERS TAB -->`;

  if (html.includes(marker)) {
    html = html.replace(marker, assignmentHtml + marker);
  } else {
    html = html.replace("    <!-- USERS TAB -->", assignmentHtml + "\n    <!-- USERS TAB -->");
  }
}

fs.writeFileSync(htmlPath, html, "utf8");
NODE

node <<'NODE'
const fs = require("fs");

const jsPath = "public/su-admin.js";
let js = fs.readFileSync(jsPath, "utf8");

/* ------------------------------------------------------------
   1. Extend state
------------------------------------------------------------ */

if (!js.includes("companyAllVessels")) {
  js = js.replace(
    "companyUsers: [],",
    `companyUsers: [],
  companyAllVessels: [],
  companyAllUsers: [],`
  );
}

/* ------------------------------------------------------------
   2. Call assignment handler initializer
------------------------------------------------------------ */

if (!js.includes("initCompanyAssignmentHandlers();")) {
  js = js.replace(
    "initCompaniesHandlers();",
    `initCompaniesHandlers();
  initCompanyAssignmentHandlers();`
  );
}

fs.writeFileSync(jsPath, js, "utf8");
NODE

if ! grep -q "MC-3B4 Company Assignment Controls" public/su-admin.js; then
cat >> public/su-admin.js <<'JSAPPEND'


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

async function refreshSelectedCompanyDetails() {
  const c = selectedCompany();
  if (!c?.id) return;

  setStatus("Loading company details…");

  const [modules, vessels, users, allVessels, allUsers] = await Promise.all([
    csvbRpc("csvb_admin_list_company_modules", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_vessels_by_company", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_users_by_company", { p_company_id: c.id }),
    csvbRpc("csvb_admin_list_vessels_by_company", { p_company_id: null }),
    csvbRpc("csvb_admin_list_users_by_company", { p_company_id: null }),
  ]);

  state.companyModules = modules || [];
  state.companyVessels = vessels || [];
  state.companyUsers = users || [];
  state.companyAllVessels = allVessels || [];
  state.companyAllUsers = allUsers || [];

  renderCompanyModules();
  renderCompanyVessels();
  renderCompanyUsers();
  renderCompanyAssignmentControls();

  setStatus("Ready");
}

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
JSAPPEND
fi

# Bump service worker cache version
if [ -f "public/service-worker.js" ]; then
  node <<'NODE'
const fs = require("fs");
const p = "public/service-worker.js";
let s = fs.readFileSync(p, "utf8");

if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
  s = s.replace(/const CACHE_VERSION = "[^"]+";/, 'const CACHE_VERSION = "v8-mc3b4-company-assignment-controls";');
}

fs.writeFileSync(p, s);
NODE
fi

cat > public/MC3B4_COMPANY_ASSIGNMENT_CONTROLS_APPLIED.txt <<'TXT'
MC-3B4 applied:
- Added company assignment controls to Superuser Administration > Companies.
- Can assign existing vessel to selected company.
- Can assign existing user to selected company.
- Can assign existing user to selected vessel.
- No auth.js changes.
- No Supabase key changes.
- No SQL changes.
TXT

echo "DONE: MC-3B4 Company assignment controls applied."
echo "Next: open Superuser Administration > Companies and hard refresh with Ctrl + Shift + R."
