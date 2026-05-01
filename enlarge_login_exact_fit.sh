#!/usr/bin/env bash
set -euo pipefail

if [ ! -f "public/csvb-login-exact-fit.css" ]; then
  echo "ERROR: public/csvb-login-exact-fit.css not found."
  exit 1
fi

cp public/csvb-login-exact-fit.css "public/csvb-login-exact-fit.css.bak_$(date +%Y%m%d_%H%M%S)"
[ -f public/service-worker.js ] && cp public/service-worker.js "public/service-worker.js.bak_login_enlarge_$(date +%Y%m%d_%H%M%S)"

cat >> public/csvb-login-exact-fit.css <<'CSS'

/* === LOGIN SIZE ADJUSTMENT — 2026-05-01 ===
   Exact login selectors only.
   Purpose: make login page larger while still fitting at 100% zoom.
*/

body.csvb-login-page .login-shell {
  width: min(920px, calc(100vw - 48px)) !important;
  max-width: 920px !important;
  max-height: calc(100vh - 32px) !important;
  padding: 22px 24px 22px 24px !important;
}

body.csvb-login-page .login-shell > div:first-child {
  max-height: 120px !important;
  margin-bottom: 10px !important;
}

body.csvb-login-page .csvb-brand-logo-full {
  max-width: 320px !important;
  max-height: 115px !important;
}

body.csvb-login-page .title {
  font-size: 1.5rem !important;
  margin-bottom: 6px !important;
}

body.csvb-login-page .subtitle {
  font-size: 1rem !important;
  line-height: 1.3 !important;
  margin-bottom: 12px !important;
}

body.csvb-login-page .build {
  font-size: 0.86rem !important;
}

body.csvb-login-page .card {
  padding: 18px 18px !important;
}

body.csvb-login-page label {
  font-size: 0.95rem !important;
  margin: 10px 0 5px 0 !important;
}

body.csvb-login-page input {
  height: 40px !important;
  min-height: 40px !important;
  font-size: 1rem !important;
  padding: 8px 11px !important;
}

body.csvb-login-page .actions {
  margin-top: 13px !important;
}

body.csvb-login-page .btn-primary,
body.csvb-login-page .btn-muted,
body.csvb-login-page .btn-outline {
  min-height: 38px !important;
  padding: 8px 15px !important;
  font-size: 0.98rem !important;
}

body.csvb-login-page .hint {
  font-size: 0.9rem !important;
  margin-top: 11px !important;
}
CSS

node <<'NODE'
const fs = require("fs");

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v54-login-exact-fit-enlarged";'
    );
  }
  fs.writeFileSync(sw, s, "utf8");
}

console.log("DONE: login exact-fit enlarged.");
NODE

echo "DONE. Hard refresh login.html with Ctrl + Shift + R."
