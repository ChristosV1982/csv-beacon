// scripts/bulk_create_vessel_users.mjs
// Bulk-provision vessel users (Master / Chief Officer / Chief Engineer) for every vessel in public.vessels.
//
// Creates/ensures:
// 1) Supabase Auth user: email = <username>@csvtest.local
// 2) public.profiles row: role='vessel', position in ('master','chief_officer','chief_engineer'), vessel_id=<vessel uuid>, username=<username>
//
// IMPORTANT: Requires SUPABASE_SERVICE_ROLE_KEY (server-side only). Do NOT expose it in /public.
//
// Env vars:
// - SUPABASE_URL (required)
// - SUPABASE_SERVICE_ROLE_KEY (required)
// - VESSEL_DEFAULT_PASSWORD (optional; if absent random passwords are generated)
// - DRY_RUN=1 (optional)

import fs from "node:fs";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.VESSEL_DEFAULT_PASSWORD || null;
const DRY_RUN = String(process.env.DRY_RUN || "").trim() === "1";

const USERNAME_DOMAIN = "csvtest.local";
const OUT_CSV = path.join(process.cwd(), "vessel_users_credentials.csv");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function headersJson() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function http(method, urlPath, body = null, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}${urlPath}`, {
    method,
    headers: { ...headersJson(), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = json?.msg || json?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(`${method} ${urlPath} failed: ${msg}`);
  }

  return json;
}

function vesselSlug(name) {
  // Example: "Olympic Fighter" -> "olympicfighter"
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

function makeUsername(positionToken, vesselName) {
  const slug = vesselSlug(vesselName);
  if (!slug) throw new Error(`Could not slug vessel name: "${vesselName}"`);

  if (positionToken === "master") return `master_${slug}`;
  if (positionToken === "chief_officer") return `chiefofficer_${slug}`;
  if (positionToken === "chief_engineer") return `chiefengineer_${slug}`;

  throw new Error("Unknown positionToken: " + positionToken);
}

function randomPassword() {
  // Reasonably strong, memorable-ish
  const part = crypto.getRandomValues(new Uint32Array(2));
  return `Vsl!${part[0].toString(16)}${part[1].toString(16)}A9`;
}

async function listAllAuthUsersByEmail() {
  // Supabase Auth Admin list users: paginated
  // Endpoint: /auth/v1/admin/users?page=1&per_page=...
  const map = new Map();

  let page = 1;
  const perPage = 1000;

  while (true) {
    const data = await http("GET", `/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
    const users = data?.users || [];

    for (const u of users) {
      if (u?.email) map.set(u.email, u.id);
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return map;
}

async function fetchVessels() {
  // Fetch all vessels (active + inactive) unless you prefer filtering.
  // Adjust if your vessels table column names differ.
  const data = await http("GET", `/rest/v1/vessels?select=id,name&order=name.asc`);
  if (!Array.isArray(data)) return [];
  return data;
}

async function createAuthUser(email, password, meta) {
  // POST /auth/v1/admin/users
  // email_confirm = true allows immediate login.
  const body = {
    email,
    password,
    email_confirm: true,
    user_metadata: meta || {},
  };
  const data = await http("POST", `/auth/v1/admin/users`, body);
  return data?.id;
}

async function upsertProfile(profileRow) {
  // Upsert by primary key id
  // POST /rest/v1/profiles?on_conflict=id
  const data = await http(
    "POST",
    `/rest/v1/profiles?on_conflict=id`,
    [profileRow],
    { Prefer: "resolution=merge-duplicates,return=representation" }
  );
  return data;
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  console.log(`DRY_RUN = ${DRY_RUN}`);
  console.log("Loading vessels…");
  const vessels = await fetchVessels();

  if (!vessels.length) {
    console.error("No vessels returned from public.vessels. Aborting.");
    process.exit(1);
  }

  console.log(`Found ${vessels.length} vessel(s).`);
  console.log("Loading existing auth users (for idempotency) …");
  const emailToId = await listAllAuthUsersByEmail();

  const positions = ["master", "chief_officer", "chief_engineer"];

  let created = 0;
  let existing = 0;
  let profUpserts = 0;

  const csvLines = [];
  csvLines.push("vessel_name,vessel_id,position,username,email,password,status");

  for (const v of vessels) {
    const vesselId = v.id;
    const vesselName = v.name;

    for (const pos of positions) {
      const username = makeUsername(pos, vesselName);
      const email = `${username}@${USERNAME_DOMAIN}`;

      const password = DEFAULT_PASSWORD || randomPassword();

      let userId = emailToId.get(email);
      let status = "";

      if (userId) {
        existing += 1;
        status = "EXISTS";
      } else {
        if (DRY_RUN) {
          status = "WOULD_CREATE";
        } else {
          userId = await createAuthUser(email, password, {
            username,
            role: "vessel",
            position: pos,
            vessel_id: vesselId,
            vessel_name: vesselName,
          });
          emailToId.set(email, userId);
          created += 1;
          status = "CREATED";
        }
      }

      // Upsert profile (even if auth user already existed)
      if (!DRY_RUN && userId) {
        await upsertProfile({
          id: userId,
          username,
          role: "vessel",
          position: pos,
          vessel_id: vesselId,
        });
        profUpserts += 1;
      }

      // For existing users, password is unknown (unless you used DEFAULT_PASSWORD and just created them now).
      // We only write the password for CREATED/WOULD_CREATE. For EXISTS we write blank to avoid misleading output.
      const pwOut = (status === "CREATED" || status === "WOULD_CREATE") ? password : "";

      csvLines.push([
        csvEscape(vesselName),
        csvEscape(vesselId),
        csvEscape(pos),
        csvEscape(username),
        csvEscape(email),
        csvEscape(pwOut),
        csvEscape(status),
      ].join(","));
    }
  }

  fs.writeFileSync(OUT_CSV, csvLines.join("\n"), "utf8");

  console.log("--------------------------------------------------");
  console.log(`Created auth users: ${created}`);
  console.log(`Already existed:    ${existing}`);
  console.log(`Profiles upserted:  ${profUpserts}`);
  console.log(`CSV written:        ${OUT_CSV}`);
  console.log("--------------------------------------------------");
  console.log("Next: login using username + password (from CSV for CREATED users).");
  console.log("Recommendation: delete the CSV after distributing credentials.");
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
