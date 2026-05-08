const fs = require("fs");

const file = "public/su-admin.js";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/su-admin.js not found.");
  process.exit(1);
}

fs.mkdirSync("backup_before_mc3b5b_imo_regex_repair", { recursive: true });
fs.copyFileSync(file, "backup_before_mc3b5b_imo_regex_repair/su-admin.js");

let s = fs.readFileSync(file, "utf8");

// Replace wrongly escaped regex variants with a simple clear digit-only regex.
s = s.replace(/!\s*\/\^\\\\d\+\$\/\.test\(imo_number_raw\)/g, "!/^[0-9]+$/.test(imo_number_raw)");
s = s.replace(/!\s*\/\^\\d\+\$\/\.test\(imo_number_raw\)/g, "!/^[0-9]+$/.test(imo_number_raw)");
s = s.replace(/!\s*\/\^d\+\$\/\.test\(imo_number_raw\)/g, "!/^[0-9]+$/.test(imo_number_raw)");

// If none of the above matched, do a targeted fallback around the error text.
s = s.replace(
  /if \(imo_number_raw && !\/[^/]+\/\.test\(imo_number_raw\)\) \{\s*throw new Error\("IMO number must contain digits only, or remain blank\."\);\s*\}/,
  `if (imo_number_raw && !/^[0-9]+$/.test(imo_number_raw)) {
        throw new Error("IMO number must contain digits only, or remain blank.");
      }`
);

fs.writeFileSync(file, s, "utf8");

// Bump service worker cache version.
const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let x = fs.readFileSync(sw, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(x)) {
    x = x.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v12-mc3b5b-imo-regex-repair";'
    );
    fs.writeFileSync(sw, x, "utf8");
  }
}

fs.writeFileSync(
  "public/MC3B5B_IMO_REGEX_REPAIR_APPLIED.txt",
  "Repaired IMO number frontend digit validation in su-admin.js. No DB/auth/Supabase key changes.\\n",
  "utf8"
);

console.log("DONE: IMO regex repair applied.");
