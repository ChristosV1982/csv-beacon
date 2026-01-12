/**
 * Seed vessels + create vessel crew accounts (Master / Chief Officer / Chief Engineer) in Supabase Auth,
 * then create matching public.profiles rows.
 *
 * Usage (from your Replit shell):
 *   1) Put this file at: scripts/seed_vessels_users.mjs
 *   2) Create two Replit Secrets:
 *        SUPABASE_URL = https://bdidrcyufazskpuwmfca.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY = <your Supabase "service_role" key (SECRET)>
 *   3) Ensure you ran the SQL "seed_vessels_step0.sql" first to insert vessels.
 *   4) Run:
 *        node scripts/seed_vessels_users.mjs
 *
 * Notes:
 * - Password for each account = Vessel Call Sign (as requested).
 * - Email format = <username>@csvtest.local
 * - Username format = <vessel_slug>_(master|chiefofficer|chiefengineer)
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Replit Secrets.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(csvText) {
  // Minimal CSV parser (no embedded newlines)
  const lines = csvText.trim().split(/\r?\n/);
  const header = lines.shift().split(",");
  return lines.map((line) => {
    const cols = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    const obj = {};
    header.forEach((h, idx) => (obj[h] = cols[idx] ?? ""));
    return obj;
  });
}

async function upsertVessels(vessels) {
  // Upsert by call_sign (unique index in SQL step)
  const payload = vessels.map((v) => ({
    name: v.vessel_name?.trim(),
    hull_number: v.hull_number?.trim(),
    call_sign: v.call_sign?.trim(),
    imo_number: v.imo_number ? Number(v.imo_number) : null,
    is_active: true,
  }));

  const { error } = await supabase.from("vessels").upsert(payload, { onConflict: "call_sign" });
  if (error) throw error;
}

async function vesselIdByCallSign(callSign) {
  const { data, error } = await supabase
    .from("vessels")
    .select("id")
    .eq("call_sign", callSign)
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureUserAndProfile({ email, password, username, role, position, call_sign }) {
  // 1) Ensure Auth user exists
  let userId = null;

  const { data: existing, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;

  const found = existing.users.find((u) => String(u.email).toLowerCase() === String(email).toLowerCase());

  if (found) {
    userId = found.id;
    // Update password + confirm (optional)
    const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) throw updErr;
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, role, position, call_sign },
    });
    if (createErr) throw createErr;
    userId = created.user.id;
  }

  // 2) Ensure profiles row exists and points to correct vessel
  const vessel_id = await vesselIdByCallSign(call_sign);

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) throw profErr;

  if (prof) {
    const { error: upErr } = await supabase
      .from("profiles")
      .update({ username, role, vessel_id, position })
      .eq("id", userId);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await supabase.from("profiles").insert({
      id: userId,
      username,
      role,
      vessel_id,
      position,
    });
    if (insErr) throw insErr;
  }

  return userId;
}

async function main() {
  const baseDir = process.cwd();
  const vesselsCsvPath = path.join(baseDir, "vessels_seed.csv");
  const usersCsvPath = path.join(baseDir, "vessel_users_seed.csv");

  if (!fs.existsSync(vesselsCsvPath) || !fs.existsSync(usersCsvPath)) {
    console.error(
      "Missing vessels_seed.csv or vessel_users_seed.csv in project root.\n" +
        "Copy them from the generated files into your Replit project root."
    );
    process.exit(1);
  }

  const vessels = parseCsv(fs.readFileSync(vesselsCsvPath, "utf8"));
  const users = parseCsv(fs.readFileSync(usersCsvPath, "utf8"));

  console.log(`Vessels: ${vessels.length}`);
  console.log(`Users:   ${users.length}`);

  console.log("Upserting vessels...");
  await upsertVessels(vessels);
  console.log("Vessels upserted.");

  console.log("Creating/updating users + profiles...");
  let ok = 0;
  for (const u of users) {
    try {
      await ensureUserAndProfile({
        email: u.email,
        password: u.password,
        username: u.username,
        role: u.role || "vessel",
        position: u.position,
        call_sign: u.call_sign,
      });
      ok++;
      if (ok % 10 === 0) console.log(`... ${ok}/${users.length} done`);
    } catch (e) {
      console.error(`FAILED for ${u.email}:`, e?.message || e);
    }
  }
  console.log(`Done. OK: ${ok}/${users.length}`);
}

main().catch((e) => {
  console.error("Fatal:", e?.message || e);
  process.exit(1);
});
