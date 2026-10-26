// Read-only browser fixtures: served analytics, no account or database writes.
import assert from "node:assert/strict";
import WebSocket from "ws";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000";
let baseline = false;
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let nextId = 0;
const pending = new Map(), errors = [], openedWindows = [];
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function fixture() {
  const date = new Date().toISOString().slice(0, 10);
  const profile = { role: "super_admin", company_id: "fixture-company" };
  const report = { id: "fixture-report", vessel_id: "fixture-vessel", vessel_name: "Fixture Vessel",
    inspection_date: date, report_ref: "FIXTURE-001", ocimf_inspecting_company: "Fixture Major",
    inspector_name: "Fixture Inspector", inspector_company: "Fixture Company" };
  const rows = ["negative", "largely", "positive"].map((observation_type, i) => ({
    ...report, id: `obs-${i}`, report_id: report.id, observation_type, question_no: "4.1.1",
    designation: "Hardware", soc: "Fixture SOC", noc: "Fixture NOC",
    remarks: `Fixture observation ${i}`, observation_text: `Fixture observation ${i}`,
    pgno_selected: i === 0 ? [1] : []
  }));
  window.fixtureCalls = [];
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "fixture-user" } } } }) },
    rpc: async (name, args) => {
      window.fixtureCalls.push({ name, args });
      const data = name === "csvb_accessible_vessels_for_me"
        ? [{ id: "fixture-vessel", name: "Fixture Vessel", is_active: true }]
        : name === "csvb_post_inspection_reports_for_me" ? [report]
        : name === "post_insp_export_observations" ? rows
        : name === "fleet_obs_analytics_export" ? rows.map(row => ({ ...row, record_source: "vetting_inspection",
          event_date: date, obs_type: row.observation_type, report_reference: report.report_ref,
          inspecting_company: report.ocimf_inspecting_company }))
        : [];
      return { data, error: null };
    }
  };
  window.AUTH = {
    ROLES: { SUPER_ADMIN: "super_admin", COMPANY_ADMIN: "company_admin", COMPANY_SUPERINTENDENT: "company_superintendent" },
    requireAuth: async () => ({ profile }), getSessionUserProfile: async () => ({ profile }),
    ensureSupabase: () => sb, fillUserBadge() {}, logoutAndGoLogin() {}
  };
  window.__supabaseClient = sb;
}
socket.on("message", async raw => {
  const message = JSON.parse(raw);
  if (pending.has(message.id)) {
    const p = pending.get(message.id); pending.delete(message.id);
    message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method === "Page.windowOpen") openedWindows.push(message.params.url);
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  const path = new URL(request.url).pathname;
  let body = null, type = "application/javascript";
  if (path.endsWith("/auth.js")) body = `(${fixture.toString()})()`;
  else if (request.url.includes("cdn.jsdelivr.net")) body = "";
  else if (baseline && /\/(post_inspection_stats.html|csvb-post-stats-(cause-category-analysis|pgno-analytics)-v01.js|csvb-post-inspection-stats-(section-layout-v02|dashboard-layout-v03).js)$/.test(path)) {
    body = execFileSync("git", ["show", `HEAD:public/${path.split("/").pop()}`], { encoding: "utf8" });
    if (path.endsWith(".html")) type = "text/html";
  }
  if (body === null) return call("Fetch.continueRequest", { requestId });
  await call("Fetch.fulfillRequest", { requestId, responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: type }], body: Buffer.from(body).toString("base64") });
});
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
const delay = ms => new Promise(r => setTimeout(r, ms));
async function load(path, legacy = false) {
  baseline = legacy;
  await call("Page.navigate", { url: `${base}${path}` });
  for (let i = 0; i < 150; i++) {
    await delay(100);
    if (await evaluate("!!window.CSVB_POST_STATS_SNAPSHOT && document.getElementById('statusPill')?.textContent === 'Ready'")) break;
    if (i === 149) throw Error(`Readiness timeout ${path}`);
  }
  await delay(600);
}
const metrics = `JSON.stringify({
  summary: ['sumReports','sumObs','sumMissing','sumDistinct'].map(id=>document.getElementById(id).textContent),
  tables: ['byVesselTbody','avgFleetTbody','byTypeTbody','topQnsTbody','byCategoryTbody','topSocTbody',
    'topNocTbody','monthlyTbody','byOcimfTbody','byInspectorTbody','byInspectorCompanyTbody','pgnoTableTbody']
    .map(id=>[id,document.getElementById(id)?.textContent.replace(/\\s+/g,' ').trim()]),
  charts: ['chartNegCategory','chartNegMonthly','chartNegQuarterly','chartNegAnnual','chartLargelyCategory',
    'chartLargelyMonthly','chartLargelyQuarterly','chartLargelyAnnual','chartPositiveMonthly','chartPositiveQuarterly',
    'chartPositiveAnnual'].map(id=>[id,document.getElementById(id)?.textContent.replace(/\\s+/g,' ').trim()]),
  enhancedKpis: [...document.querySelectorAll('[id^="csvbQcpKpi"],[id^="csvbCauseCatKpi"],[id^="csvbSectorKpi"],[id^="mscatKpi"]')]
    .map(node=>[node.id,node.textContent.trim()]).sort((a,b)=>a[0].localeCompare(b[0]))
})`;
try {
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  if (!process.env.TABS_ONLY) {
  await load("/post_inspection_stats.html", true);
  const original = await evaluate(metrics);
  await load("/post_inspection_stats.html");
  assert.equal(await evaluate("document.querySelectorAll('.csvb-analytics-card').length"), 11);
  assert.equal(await evaluate("[...document.querySelectorAll('.csvb-analytics-open')].every(a=>a.target==='_blank' && a.rel.includes('noopener') && a.rel.includes('noreferrer'))"), true);
  assert.equal(await evaluate("document.getElementById('statsMode').getBoundingClientRect().height"), 0);
  assert.equal(await evaluate("document.querySelector('#csvbAnalyticsLanding').getBoundingClientRect().height > 0"), true);
  assert.equal(await evaluate("[...document.querySelectorAll('[data-csvb-stats-source]')].every(n=>n.getBoundingClientRect().height===0)"), true, "landing must not leak hidden helper sections");
  assert.equal(await evaluate(metrics), original, "landing keeps source values unchanged");
  console.log("PASS landing: 11 safe new-tab links, no visible global filters; unchanged source metrics");
  await call("Page.captureScreenshot", { format: "jpeg" }).then(r => writeFileSync("/tmp/stats-landing.jpg", Buffer.from(r.data, "base64")));
  const keys = ["overview","visual","comparison","fleet","question-chapter","cause-category","party","trend","pgno","mscat","sector"];
  const controls = {
    overview: ["viewSummaryObsBtn"], visual: ["chartNegMonthly"], comparison: ["csvbStatsCompareCardGridV03"],
    fleet: ["byVesselTbody"], "question-chapter": ["csvbQcpMode"], "cause-category": ["csvbCauseCatDimension"],
    party: ["byInspectorTbody"], trend: ["trendYearFilter"], pgno: ["csvbPgnoGrouping"],
    mscat: ["mscatGrouping"], sector: ["csvbSectorSelect"]
  };
  for (const key of keys) {
    await load(`/post_inspection_stats.html?view=${key}`);
    assert.equal(await evaluate("document.getElementById('csvbAnalyticsLanding').getBoundingClientRect().height"), 0);
    assert.equal(await evaluate("document.getElementById('statsMode').getBoundingClientRect().height > 0"), true);
    assert.equal(await evaluate("document.getElementById('csvbAnalyticsViewContent').children.length > 0"), true, key);
    assert.equal(await evaluate("[...document.querySelectorAll('[data-csvb-stats-source]')].every(n=>n.getBoundingClientRect().height===0)"), true, `${key}: no unrelated source sections visible`);
    assert.equal(await evaluate(metrics), original, `${key}: existing metrics must match baseline`);
    assert.equal(await evaluate("!!document.getElementById('csvbStatsDashboardLayoutV03')"), false, "long-page regrouper bypassed");
    assert.equal(await evaluate("document.getElementById('csvbBackToAnalytics').getAttribute('href')"), "./post_inspection_stats.html");
    for (const control of controls[key]) {
      assert.equal(await evaluate(`document.getElementById(${JSON.stringify(control)})?.getBoundingClientRect().height > 0`), true, `${key}: ${control} visible`);
    }
    console.log(`PASS ${key}: isolated view + filters + unchanged tables/charts`);
    if (key === "fleet" || key === "cause-category") {
      await call("Page.captureScreenshot", { format: "jpeg" }).then(r => writeFileSync(`/tmp/stats-${key}.jpg`, Buffer.from(r.data, "base64")));
    }
  }
  await load("/post_inspection_stats.html?view=overview");
  await evaluate(`document.querySelectorAll('#typeCheckList input').forEach(input=>{input.checked=input.value==='negative'});
    document.querySelector('#typeCheckList input').dispatchEvent(new Event('change',{bubbles:true}));`);
  await delay(300);
  assert.equal(await evaluate("window.CSVB_POST_STATS_SNAPSHOT.rows.length"), 1);
  await evaluate("document.getElementById('viewSummaryObsBtn').click()");
  assert.equal(await evaluate("document.getElementById('drillDialog').open"), true);
  assert.equal(await evaluate("document.querySelectorAll('#drillTbody tr').length"), 1);
  await evaluate(`window.fixtureCsv=[];URL.createObjectURL=blob=>{blob.text().then(text=>window.fixtureCsv.push(text));return 'blob:fixture'};
    HTMLAnchorElement.prototype.click=function(){};
    document.getElementById('drillExportBtn').click();document.getElementById('exportCsvBtn').click();`);
  await delay(150);
  assert.equal(await evaluate("window.fixtureCsv.length"), 2);
  assert.equal(await evaluate("window.fixtureCsv.every(text=>text.includes('Fixture Vessel') && !text.includes('Fixture observation 1'))"), true);
  console.log("PASS dedicated filtering, record drilldown and both CSV exports retain filtered scope");
  }
  await load("/post_inspection_stats.html");
  const beforeTabs = new Set((await call("Target.getTargets")).targetInfos.map(t => t.targetId));
  for (const index of [0, 1]) {
    await call("Page.bringToFront");
    const point = await evaluate(`(()=>{const r=document.querySelectorAll('.csvb-analytics-open')[${index}].getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await call("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    await delay(150);
  }
  await delay(400);
  // New targets do not inherit this target's AUTH fixture; their real auth may redirect to login.
  const openViews = (await call("Target.getTargets")).targetInfos.filter(t => t.type === "page" && !beforeTabs.has(t.targetId));
  assert.equal(openViews.length, 2, "two separate analytics tabs coexist");
  assert.equal(openedWindows.some(url => url.endsWith("?view=overview")), true);
  assert.equal(openedWindows.some(url => url.endsWith("?view=visual")), true);
  for (const tab of openViews) await call("Target.closeTarget", { targetId: tab.targetId });
  console.log("PASS Open actions create two simultaneous dedicated browser tabs");
  await load("/post_inspection_stats.html?view=not-real");
  assert.equal(await evaluate("document.documentElement.dataset.csvbStatsView"), "landing");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await load("/post_inspection_stats.html");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth+1"), true);
  console.log("PASS invalid view returns landing; mobile landing has no horizontal overflow");
  assert.deepEqual(errors, []);
} finally {
  await call("Page.close").catch(() => {});
  socket.close();
}
