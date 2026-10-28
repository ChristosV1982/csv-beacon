import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const footers = [{ textContent: "" }, { textContent: "" }];
const context = {
  window: {},
  document: { querySelectorAll: (selector) => {
    assert.equal(selector, "[data-m02-form-reference]");
    return footers;
  } }
};
vm.runInNewContext(readFileSync("public/m02-form-identity.js", "utf8"), context);
const identity = context.window.CSVB_M02_FORM_IDENTITY;
assert.equal(identity.code, "M02");
assert.equal(identity.name, "Ship Inspection Report");
assert.equal(identity.version, "09");
assert.equal(identity.revisionDate, "23.06.2026");
assert.ok(Object.isFrozen(identity));
for (const footer of footers) {
  assert.equal(footer.textContent, "M02 · Ship Inspection Report · Version 09 · 23.06.2026");
}
const html = readFileSync("public/m02-ship-inspection-report.html", "utf8");
assert.equal((html.match(/data-m02-form-reference/g) || []).length, 1);
assert.match(html, /<\/section>\s*<footer[^>]*data-m02-form-reference[^>]*><\/footer>\s*<\/main>/);
assert.ok(html.indexOf("m02-form-identity.js") < html.indexOf('src="./m02-ship-inspection-report.js'));
console.log("PASS: exact controlled identity, shared footer outside individual views, central configuration and future-output reference.");
