const fs = require("fs");

const AUTH_FILE = "public/auth.js";
const SW_FILE = "public/service-worker.js";

const CORRECT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ";

if (!fs.existsSync(AUTH_FILE)) {
  console.error("ERROR: public/auth.js not found.");
  process.exit(1);
}

fs.mkdirSync("backup_before_auth_key_repair", { recursive: true });
fs.copyFileSync(AUTH_FILE, "backup_before_auth_key_repair/auth.js");

let auth = fs.readFileSync(AUTH_FILE, "utf8");

// Replace any current Supabase anon key assignment with the correct original public anon key.
auth = auth.replace(
  /const SUPABASE_ANON_KEY\s*=\s*[\s\S]*?;\n/,
  `const SUPABASE_ANON_KEY =\n    "${CORRECT_SUPABASE_ANON_KEY}";\n`
);

// Bump auth build if present.
auth = auth.replace(
  /const AUTH_BUILD = "[^"]+";/,
  'const AUTH_BUILD = "AUTH-2026-04-29-KEY-REPAIR";'
);

fs.writeFileSync(AUTH_FILE, auth, "utf8");

if (fs.existsSync(SW_FILE)) {
  fs.copyFileSync(SW_FILE, "backup_before_auth_key_repair/service-worker.js");

  let sw = fs.readFileSync(SW_FILE, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v6-auth-key-repair";'
    );
  }

  fs.writeFileSync(SW_FILE, sw, "utf8");
}

fs.writeFileSync(
  "public/AUTH_KEY_REPAIR_APPLIED.txt",
  "Auth key repaired. Supabase anon key restored to original working public anon key. Service worker cache version bumped if present.\n",
  "utf8"
);

console.log("DONE: public/auth.js Supabase anon key repaired.");
console.log("DONE: service worker cache version bumped if service-worker.js exists.");
