// Uses the actual served pages in a disposable browser with synthetic AUTH/data.
// No real sign-in, hosted parser calls, or database writes.
import assert from "node:assert/strict";
import WebSocket from "ws";
import { writeFileSync } from "node:fs";
const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000";
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.once("open", resolve));
let next = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
function fixture() {
  const pif1 = "1. Recognition of Safety criticality of the task or associated steps";
  const pif2 = "2. Custom and practice surrounding use of procedures";
  window.fixturePifs = [pif1, pif2, "11. Unrecognized PIF <retained>"];
  window.fixtureWrites = [];
  window.fixtureAlerts = [];
  window.alert = (message) => fixtureAlerts.push(message);
  const profile = { id: "fixture-user", role: "company_admin", company_id: "fixture-company" };
  const report = {
    id: "fixture-report", company_id: profile.company_id, report_ref: "FIXTURE-001",
    vessel_id: "fixture-vessel", vessel_name: "Fixture Vessel", inspection_date: "2026-10-01",
    pdf_storage_path: "post_inspections/fixture.pdf",
  };
  const item = {
    id: "fixture-item", report_id: report.id, question_no: "5.6.1", question_base: "5.6.1",
    obs_type: "negative", observation_type: "negative_observation", designation: "Human",
    source_excerpt: "Human Senior Deck Officer: Not as expected.",
    nature_of_concern: "Not as expected.", observation_text: "Fixture finding.",
    classification_coding: fixturePifs.join(" | "), pgno_selected: [], sort_index: 0,
    created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
  };
  window.fixtureItem = item;
  function query(table) {
    let payload = null;
    const result = (single = false) => {
      if (payload) {
        fixtureWrites.push({ table, payload });
        if (table === "post_inspection_observation_items") Object.assign(item, payload);
      }
      const data = table === "post_inspection_observation_items" ? [item]
        : table === "post_inspection_reports" ? [report]
        : table === "profiles" ? [profile] : [];
      return { data: single ? data[0] || null : data, error: null };
    };
    const builder = {
      select() { return this; }, eq() { return this; }, is() { return this; },
      in() { return this; }, order() { return this; }, limit() { return this; },
      neq() { return this; }, not() { return this; }, ilike() { return this; },
      update(value) { payload = value; return this; },
      single() { return Promise.resolve(result(true)); },
      maybeSingle() { return Promise.resolve(result(true)); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return builder;
  }
  const sb = {
    from: query,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: profile.id } } } }),
      getUser: async () => ({ data: { user: { id: profile.id } } }),
    },
    rpc: async (name) => ({ data: name === "csvb_post_inspection_report_by_id_for_me" ? report
      : name === "csvb_accessible_vessels_for_me" ? [{ id: report.vessel_id, name: report.vessel_name }] : [], error: null }),
    functions: { invoke: async () => ({ data: {
      ok: true, human_pif_version: "human-multi-pifs-v1",
      extracted: { header: { report_reference: report.report_ref }, observations: [{ ...item, classification_coding: `${pif1} | ${pif2}` }] },
    }, error: null }) },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  };
  window.AUTH = {
    ROLES: { SUPER_ADMIN: "super_admin", COMPANY_ADMIN: "company_admin", COMPANY_SUPERINTENDENT: "company_superintendent" },
    ensureSupabase: () => sb,
    requireAuth: async () => ({ profile, user: { id: profile.id } }),
    getSessionUserProfile: async () => ({ profile, user: { id: profile.id } }),
    fillUserBadge() {}, logoutAndGoLogin() {},
  };
  window.__supabaseClient = sb;
}
socket.on("message", async (raw) => {
  const message = JSON.parse(raw);
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  const path = new URL(request.url).pathname;
  let body = null;
  if (path.endsWith("/auth.js")) body = "";
  if (path.endsWith("/csvb-module-guard.js")) body = "window.CSVB_MODULE_GUARD={ensureModuleAccess:async()=>({allowed:true})};";
  if (path.endsWith("/question_library_loader.js")) body = "export async function loadLockedLibraryJson(){return []}";
  if (request.url.includes("supabase.co") || request.url.includes("cdn.jsdelivr.net")) body = "";
  if (body == null) await call("Fetch.continueRequest", { requestId });
  else await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/javascript" }], body: Buffer.from(body).toString("base64") });
});
async function waitFor(expression) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("UI readiness timeout: " + await evaluate("JSON.stringify({url:location.href,alerts:window.fixtureAlerts,body:document.body.innerText.slice(-1200)})"));
}
try {
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await call("Page.addScriptToEvaluateOnNewDocument", { source: `(${fixture.toString()})()` });
  await call("Page.navigate", { url: `${base}/post_inspection_observation_detail.html?report_id=fixture-report&item_id=fixture-item` });
  await waitFor("document.querySelectorAll('#humanPifDisplay li').length===3");
  assert.equal(await evaluate("document.getElementById('nocField').hidden"), true);
  await evaluate("document.getElementById('nocManualToggle').click()");
  await waitFor("document.querySelectorAll('#humanPifCheckboxes input:checked').length===3");
  const selected = await evaluate(`Array.from(document.querySelectorAll('#humanPifCheckboxes input:checked')).map(x=>x.value)`);
  assert.equal(selected.length, 3);
  assert.ok(selected[2].includes("<retained>"));
  const checkboxSize = await evaluate("document.querySelector('#humanPifCheckboxes input').getBoundingClientRect().width");
  assert.ok(checkboxSize <= 18, `Compact checkbox width: ${checkboxSize}`);
  assert.equal(await evaluate("document.getElementById('humanPifCheckboxes').scrollWidth <= document.getElementById('humanPifCheckboxes').clientWidth"), true);
  await evaluate("document.getElementById('humanPifEditor').scrollIntoView({block:'center'})");
  const editorImage = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
  writeFileSync("/tmp/csvb-human-pif-editor.jpg", Buffer.from(editorImage.data, "base64"));
  await evaluate("document.getElementById('csvbManualObsSaveRefreshBtn').click()");
  await waitFor("fixtureWrites.length>0");
  const write = await evaluate("fixtureWrites[0]");
  assert.equal(write.payload.classification_coding, selected.join(" | "));
  assert.equal(write.payload.nature_of_concern, "Not as expected.");
  console.log("PASS: served Observation Detail renders three PIFs, keeps unknown raw text, checks all selected entries and saves all without changing NOC semantics.");

  await call("Page.navigate", { url: `${base}/post_inspection_detail.html?report_id=fixture-report` });
  await waitFor("document.querySelectorAll('#obsTableBody .csvb-human-pif-list li').length===3");
  assert.equal(await evaluate("document.getElementById('repairHumanPifsBtn').disabled"), false);
  await evaluate("fixtureItem.classification_coding=fixturePifs[0];document.getElementById('repairHumanPifsBtn').click()");
  await waitFor("!!document.querySelector('dialog.csvb-pif-review[open]')");
  assert.equal(await evaluate("fixtureWrites.length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('dialog input:checked').length"), 1);
  const reviewImage = await call("Page.captureScreenshot", { format: "jpeg", quality: 75 });
  writeFileSync("/tmp/csvb-human-pif-review.jpg", Buffer.from(reviewImage.data, "base64"));
  await evaluate("document.querySelector('dialog .csvb-pif-review-actions button').click()");
  await waitFor("!document.querySelector('dialog.csvb-pif-review')");
  assert.equal(await evaluate("fixtureWrites.length"), 0);
  await evaluate("document.getElementById('repairHumanPifsBtn').click()");
  await waitFor("!!document.querySelector('dialog.csvb-pif-review[open]')");
  await evaluate("document.querySelector('dialog .csvb-pif-review-actions button:last-child').click()");
  await waitFor("fixtureWrites.length===1");
  assert.deepEqual(Object.keys(await evaluate("fixtureWrites[0].payload")), ["classification_coding"]);
  console.log("PASS: served Report Detail lists all PIFs; repair reaches review, cancel performs no writes, explicit apply updates classification only.");

  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.querySelector('#obsTableBody .csvb-human-pif-list li').textContent.includes('1.')"), true);
  console.log("PASS: PIF entries remain available at a mobile viewport.");
} finally {
  await call("Page.close").catch(() => {});
  socket.close();
}
