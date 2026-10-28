// Authenticated disposable-account verification. Credentials arrive over stdin
// only and live in an ephemeral Chromium profile, removed on exit.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
const input = [];
for await (const c of process.stdin) input.push(c);
const { session, project } = JSON.parse(Buffer.concat(input).toString());
const profile = await mkdtemp(path.join(tmpdir(), "csvb-office-browser-"));
const chrome = spawn("/repl/tools/bin/chromium", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });
const results = [], errors = new Set();
let socket;
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n"); break; }
    catch { await wait(100); }
  }
  if (!port) throw Error("Chromium did not open");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  let counter = 0;
  const pending = new Map();
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++counter;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.on("message", raw => {
    const data = JSON.parse(raw);
    if (data.id) {
      const task = pending.get(data.id);
      if (!task) return;
      pending.delete(data.id);
      if (data.error) task.reject(Error(data.error.message)); else task.resolve(data.result);
    }
    if (data.method === "Page.javascriptDialogOpening")
      call("Page.handleJavaScriptDialog", { accept: true }, data.sessionId).catch(() => {});
    if (data.method === "Network.responseReceived" && data.params.response.status >= 400) {
      const url = new URL(data.params.response.url);
      if (url.hostname.endsWith(".supabase.co"))
        errors.add(`${data.params.response.status} ${url.pathname}`);
    }
  });
  const context = await call("Target.createBrowserContext", { disposeOnDetach: true });
  const target = await call("Target.createTarget", { url: "about:blank", browserContextId: context.browserContextId });
  const attached = await call("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sid = attached.sessionId;
  await call("Page.enable", {}, sid);
  await call("Network.enable", {}, sid);
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem(${JSON.stringify("sb-" + project + "-auth-token")},${JSON.stringify(JSON.stringify(session))}); } catch {}`,
  }, sid);
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sid);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  async function open(route, condition) {
    await call("Page.navigate", { url: "http://127.0.0.1:3000/" + route }, sid);
    for (let i = 0; i < 180; i++) {
      await wait(150);
      try { if (await evaluate(condition)) return; } catch {}
    }
    throw Error("Preview did not become ready: " + route + "; API errors: " + [...errors].join(", "));
  }
  const visible = `n => !!n && n.getClientRects().length > 0 && getComputedStyle(n).display !== "none"`;
  await open("q-dashboard.html?area=inspection_libraries_vetting",
    `document.readyState==="complete" && [...document.querySelectorAll('a')].some(n => n.href.includes("post_inspection.html") && (${visible})(n))`);
  const inspection = await evaluate(`[...new Set([...document.querySelectorAll('a')].filter(${visible}).map(n => new URL(n.href).pathname.split('/').pop()))]`);
  const expected = ["q-sire-questions-viewer.html", "sire-fleet-vetting-experience.html",
    "vetting-inspection-planner.html", "post_inspection.html", "post_inspection_stats.html",
    "inspector_intelligence.html"];
  results.push({ test: "Inspection area shows six approved modules", passed: expected.every(p => inspection.includes(p)) });
  await open("q-dashboard.html?area=marine_applications_vessel_interaction",
    `document.readyState==="complete" && [...document.querySelectorAll('a')].some(n => n.href.includes("port-call-intelligence.html") && (${visible})(n))`);
  const marine = await evaluate(`[...new Set([...document.querySelectorAll('a')].filter(${visible}).map(n => new URL(n.href).pathname.split('/').pop()))]`);
  results.push({ test: "Marine area shows three approved modules", passed:
    ["mooring-anchoring-inventories-v4.html", "port-call-intelligence.html",
      "portable-lifting-appliances-wires.html"].every(p => marine.includes(p)) });
  await open("post_inspection.html", `window.CSVB_OFFICE_AUTHORIZATION?.enforced===true`);
  results.push({ test: "Entry New Report hidden for view-only user",
    passed: await evaluate(`!(${visible})(document.getElementById("newReportBtn"))`) });
  await open("inspector_intelligence.html", `window.CSVB_OFFICE_AUTHORIZATION?.enforced===true`);
  results.push({ test: "Inspector Edit and CSV/PDF actions hidden",
    passed: await evaluate(`["syncInspectorsBtn","exportCsvBtn","exportPdfBtn"].every(id => !(${visible})(document.getElementById(id)))`) });
  await open("vetting-inspection-planner.html", `window.CSVB_OFFICE_AUTHORIZATION?.enforced===true`);
  results.push({ test: "Planner loads with enforced profile", passed: true });
  for (const page of ["q-sire-questions-viewer.html", "sire-fleet-vetting-experience.html",
    "post_inspection_stats.html", "mooring-anchoring-inventories-v4.html",
    "port-call-intelligence.html", "portable-lifting-appliances-wires.html"]) {
    await open(page, `window.CSVB_OFFICE_AUTHORIZATION?.enforced===true`);
    await wait(1800);
    results.push({ test: "View-only Preview loads " + page, passed: true });
  }
  await open("q-questions-editor.html",
    `location.pathname.includes("q-dashboard.html") || /access denied|not authorized|not permitted/i.test(document.body.textContent)`);
  results.push({ test: "Denied direct editor route blocked", passed: true });
  await call("Target.disposeBrowserContext", { browserContextId: context.browserContextId });
  console.log(JSON.stringify({ preview_results: results, api_errors: [...errors] }));
  if (results.some(r => !r.passed) || errors.size) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ preview_results: results, error: error.message, api_errors: [...errors] }));
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
  await wait(400);
  await rm(profile, { recursive: true, force: true });
}
