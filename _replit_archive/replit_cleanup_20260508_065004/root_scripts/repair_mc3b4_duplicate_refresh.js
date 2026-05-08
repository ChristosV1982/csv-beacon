const fs = require("fs");
const path = require("path");

const file = "public/su-admin.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/su-admin.js not found.");
  process.exit(1);
}

fs.mkdirSync("backup_before_mc3b4_duplicate_refresh_repair", { recursive: true });
fs.copyFileSync(file, "backup_before_mc3b4_duplicate_refresh_repair/su-admin.js");

let s = fs.readFileSync(file, "utf8");

const marker = "async function refreshSelectedCompanyDetails()";

function positionsOf(str, needle) {
  const out = [];
  let i = -1;
  while ((i = str.indexOf(needle, i + 1)) !== -1) out.push(i);
  return out;
}

function findBlockEnd(str, start) {
  const open = str.indexOf("{", start);
  if (open < 0) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

let positions = positionsOf(s, marker);
console.log("refreshSelectedCompanyDetails occurrences before repair:", positions.length);

// Remove duplicate occurrences after the first one.
if (positions.length > 1) {
  for (let n = positions.length - 1; n >= 1; n--) {
    const start = positions[n];
    const end = findBlockEnd(s, start);
    if (end < 0) {
      console.error("ERROR: Could not find end of duplicate function block.");
      process.exit(1);
    }
    s = s.slice(0, start) + "\n\n/* Duplicate refreshSelectedCompanyDetails removed by MC-3B4 repair. */\n\n" + s.slice(end);
  }
}

// Replace the remaining function with the corrected extended version.
positions = positionsOf(s, marker);

if (positions.length !== 1) {
  console.error("ERROR: Expected exactly one refreshSelectedCompanyDetails function after duplicate removal, found:", positions.length);
  process.exit(1);
}

const start = positions[0];
const end = findBlockEnd(s, start);

if (end < 0) {
  console.error("ERROR: Could not find end of remaining refreshSelectedCompanyDetails function.");
  process.exit(1);
}

const replacement = `async function refreshSelectedCompanyDetails() {
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
}`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s, "utf8");

// Bump service worker cache version.
const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v9-mc3b4-duplicate-refresh-repair";'
    );
    fs.writeFileSync(swFile, sw, "utf8");
  }
}

fs.writeFileSync(
  "public/MC3B4_DUPLICATE_REFRESH_REPAIR_APPLIED.txt",
  "Repaired duplicate refreshSelectedCompanyDetails function in su-admin.js. No database/auth/Supabase key changes.\\n",
  "utf8"
);

const after = positionsOf(fs.readFileSync(file, "utf8"), marker).length;
console.log("refreshSelectedCompanyDetails occurrences after repair:", after);
console.log("DONE: MC-3B4 duplicate function repair applied.");
