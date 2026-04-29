const fs = require("fs");

const file = "public/su-admin.html";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/su-admin.html not found.");
  process.exit(1);
}

fs.mkdirSync("backup_before_mc3b7_user_company_html_repair", { recursive: true });
fs.copyFileSync(file, "backup_before_mc3b7_user_company_html_repair/su-admin.html");

let html = fs.readFileSync(file, "utf8");

/* ------------------------------------------------------------
   1. Insert Company dropdown before Username field
------------------------------------------------------------ */

if (!html.includes('id="cu_company"')) {
  const usernameInputIdx = html.indexOf('id="cu_username"');

  if (usernameInputIdx < 0) {
    throw new Error('Could not find id="cu_username" in su-admin.html');
  }

  const fieldStart = html.lastIndexOf('<div class="field"', usernameInputIdx);

  if (fieldStart < 0) {
    throw new Error('Could not find containing <div class="field"> before cu_username');
  }

  const companyField = `
            <div class="field">
              <label>Company</label>
              <select id="cu_company">
                <option value="">Loading companies…</option>
              </select>
              <div class="muted small">Required for all non-platform users. Vessel list is filtered by selected company.</div>
            </div>

            <div style="height:10px;"></div>

`;

  html = html.slice(0, fieldStart) + companyField + html.slice(fieldStart);
}

/* ------------------------------------------------------------
   2. Insert Company header in Users table
------------------------------------------------------------ */

const usersBodyIdx = html.indexOf('id="usersBody"');

if (usersBodyIdx < 0) {
  throw new Error('Could not find id="usersBody" in su-admin.html');
}

const theadStart = html.lastIndexOf("<thead", usersBodyIdx);
const theadEnd = html.indexOf("</thead>", theadStart);

if (theadStart < 0 || theadEnd < 0) {
  throw new Error("Could not find Users table thead.");
}

let beforeHead = html.slice(0, theadStart);
let head = html.slice(theadStart, theadEnd);
let afterHead = html.slice(theadEnd);

if (!head.includes("<th>Company</th>")) {
  head = head.replace("<th>Username</th>", "<th>Company</th>\n                    <th>Username</th>");
}

html = beforeHead + head + afterHead;

/* ------------------------------------------------------------
   3. Increase Users loading colspan from 7 to 8
------------------------------------------------------------ */

const tbodyStart = html.indexOf('<tbody id="usersBody"', 0);
const tbodyEnd = html.indexOf("</tbody>", tbodyStart);

if (tbodyStart >= 0 && tbodyEnd >= 0) {
  const beforeTbody = html.slice(0, tbodyStart);
  let tbody = html.slice(tbodyStart, tbodyEnd);
  const afterTbody = html.slice(tbodyEnd);

  tbody = tbody.replace('colspan="7"', 'colspan="8"');

  html = beforeTbody + tbody + afterTbody;
}

fs.writeFileSync(file, html, "utf8");

/* ------------------------------------------------------------
   4. Bump service worker cache
------------------------------------------------------------ */

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v15-mc3b7-user-company-html-repair";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC3B7_USER_COMPANY_HTML_REPAIR_APPLIED.txt",
  "Repaired missing Company dropdown and Company table header in Superuser Administration > Users. No DB/auth/Supabase key changes.\\n",
  "utf8"
);

console.log("DONE: MC-3B7 user company HTML repair applied.");
