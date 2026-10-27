// Render the real served Rights Matrix using read-only role/permission fixtures.
// Authentication and write requests are stubbed inside this disposable browser;
// this test NEVER sends a permission change to Supabase.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import WebSocket from "ws";

const fixture = JSON.parse(readFileSync(process.argv[2] || "/tmp/rights-live-fixture.json", "utf8"));
const target = await (await fetch("http://127.0.0.1:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let seq = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on("message", message => {
  const data = JSON.parse(message);
  if (data.id && pending.has(data.id)) {
    const job = pending.get(data.id);
    pending.delete(data.id);
    data.error ? job.reject(Error(JSON.stringify(data.error))) : job.resolve(data.result);
  }
  if (data.method === "Fetch.requestPaused") {
    const { requestId, resourceType, request } = data.params;
    if (resourceType !== "Script") {
      void call("Fetch.continueRequest", { requestId });
      return;
    }
    const allowed = new URL(request.url).pathname === "/csvb-rights-workspace.js";
    if (allowed) void call("Fetch.continueRequest", { requestId });
    else void call("Fetch.fulfillRequest", { requestId, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/javascript" }],
      body: Buffer.from("").toString("base64") });
  }
});
async function evaluate(expression) {
  const res = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw Error(JSON.stringify(res.exceptionDetails));
  return res.result.value;
}
try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Fetch.enable", { patterns: [{ urlPattern: "*", resourceType: "Script", requestStage: "Request" }] });
  await call("Page.navigate", { url: "http://127.0.0.1:3000/su-admin.html" });
  await call("Emulation.setDeviceMetricsOverride", {width:1440,height:900,deviceScaleFactor:1,mobile:false});
  for (let i = 0; i < 30; i++) {
    if (await evaluate("!!(document.querySelector('#rmGroups') && window.CSVBRightsWorkspace)")) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(await evaluate("!!window.CSVBRightsWorkspace"), true);
  const data = Buffer.from(JSON.stringify(fixture)).toString("base64");
  await evaluate(`(async () => {
    const f = JSON.parse(atob("${data}"));
    const grants = f.grants.map(g => ({...g}));
    window.__writes = [];
    const roles = ["super_admin","company_admin","company_superintendent","vessel","inspector"];
    const api = {
      from: () => ({select: () => ({eq: () => ({order: async () => ({data: f.ranks, error: null})})})}),
      rpc: async (name, args) => {
        if (name === "csvb_dashboard_list_platform_areas") return {data: f.areas, error: null};
        if (name === "csvb_set_role_permissions_audited") {
          window.__writes.push(args);
          for (const change of args.p_grants) {
            const index = grants.findIndex(g => g.role === args.p_role &&
              g.position === args.p_position && g.permission_id === change.permission_id);
            if (change.inherit) {
              if (index >= 0) grants.splice(index, 1);
            } else if (index >= 0) Object.assign(grants[index], change);
            else grants.push({ ...change, role: args.p_role, position: args.p_position });
          }
          return {data: {ok: true}, error: null};
        }
        throw Error("Unexpected RPC " + name);
      }
    };
    document.querySelectorAll('[id^="tab-"]').forEach(tab => { tab.style.display = "none"; });
    document.querySelector("#tab-rights").style.display = "block";
    document.querySelector('[data-tab="users"]').classList.remove("active");
    document.querySelector('[data-tab="rights"]').classList.add("active");
    window.__rights = CSVBrights();
    function CSVBrights() {
      const controller = CSVBRightsWorkspace.create({
        getClient: () => api,
        callAdmin: async ({action,role,position}) => {
          if (action === "list_modules_permissions") return {modules:f.modules,permissions:f.permissions};
          if (action === "list_roles_positions") return {roles,positions:[]};
          if (action === "get_role_permissions") return {grants:grants.filter(g =>
            g.role === role && g.position === position)};
          throw Error("Unexpected admin call " + action);
        },
        onRoles: () => {}
      });
      controller.bind();
      return controller;
    }
    await window.__rights.load();
    return true;
  })()`);
  async function select(role, rank = "") {
    return evaluate(`(async () => {
      const wait = () => new Promise(r => setTimeout(r, 40));
      const role = document.querySelector("#rmRole");
      role.value = "${role}"; role.dispatchEvent(new Event("change"));
      await wait();
      const rank = document.querySelector("#rmPosition");
      rank.value = "${rank}"; rank.dispatchEvent(new Event("change"));
      await wait();
      return {
        context: document.querySelector("#rmContext").textContent,
        modules: document.querySelectorAll(".rm-module").length,
        areaNames: [...document.querySelectorAll(".rm-area-heading")].map(x => x.textContent.trim()),
        disabled: [...document.querySelectorAll(".rm-action.is-blocked select")].every(x => x.disabled),
        summary: document.querySelector("#rmPolicyNote").textContent
      };
    })()`);
  }
  let master = await select("vessel", "Master");
  assert(master.modules >= 25);
  assert(master.areaNames.some(a => a.includes("Inspection Libraries")));
  assert(master.disabled && master.context.includes("Master"));
  assert(master.summary.includes("cannot be bypassed"));
  const masterState = await evaluate(`(() => {
    const mod = [...document.querySelectorAll(".rm-module")].find(x => x.querySelector(".rm-module-title")?.textContent.includes("SIRE 2.0"));
    return {hasEffective: !!mod?.querySelector(".rm-effective"), hasRoleDefault: !!mod?.querySelector(".rm-default"),
      saveDisabled: document.querySelector("#rmSave").disabled};
  })()`);
  assert(masterState.hasEffective && masterState.hasRoleDefault && masterState.saveDisabled);
  await evaluate("document.querySelector('#tab-rights').scrollIntoView()");
  const image = (await call("Page.captureScreenshot", {format:"png",captureBeyondViewport:false})).data;
  writeFileSync("/tmp/csvb-rights-workspace-desktop.png", Buffer.from(image,"base64"));
  const chief = await select("vessel", "Chief Engineer");
  assert(chief.context.includes("Chief Engineer") && chief.disabled);
  const admin = await select("company_admin");
  assert(admin.context.includes("Company Admin") && admin.modules >= 25);
  const saveCheck = await evaluate(`(async () => {
    const entry = [...document.querySelectorAll(".rm-action")]
      .find(x => x.closest(".rm-module")?.querySelector(".rm-module-title")?.textContent.includes("SIRE 2.0") &&
        x.querySelector(".rm-action-label")?.textContent === "View" &&
        !x.querySelector("select[data-right]").disabled);
    if (!entry) throw Error("Editable SIRE row missing");
    const select = entry.querySelector("select[data-right]");
    select.value = select.value === "allow" ? "deny" : "allow";
    select.dispatchEvent(new Event("change", {bubbles:true}));
    const dirty = document.querySelector("#rmDirty").textContent;
    const enabled = !document.querySelector("#rmSave").disabled;
    await window.__rights.save();
    return {dirty, enabled, writes: window.__writes.map(w => w.p_grants.length),
      clean: document.querySelector("#rmSave").disabled};
  })()`);
  assert(saveCheck.enabled && saveCheck.dirty.includes("1 unsaved"), "single change not tracked");
  assert.deepEqual(saveCheck.writes, [1], "save touched more than the changed cell");
  assert(saveCheck.clean);
  master = await select("vessel", "Master");
  const resetCheck = await evaluate(`(() => {
    window.confirm = () => true;
    document.querySelector("#rmReset").click();
    return {dirty:document.querySelector("#rmDirty").textContent,
      enabled:!document.querySelector("#rmSave").disabled,
      inherited:[...document.querySelectorAll("select[data-right]")].some(s => s.value === "inherit")};
  })()`);
  assert(resetCheck.enabled && resetCheck.dirty.includes("unsaved") && resetCheck.inherited);
  const resetSave = await evaluate(`(async () => {
    const previous = window.__writes.length;
    await window.__rights.save();
    const call = window.__writes[previous];
    return {count:call?.p_grants.length || 0, inherited:call?.p_grants.every(g => g.inherit === true),
      clean:document.querySelector("#rmSave").disabled};
  })()`);
  assert(resetSave.count > 0 && resetSave.inherited && resetSave.clean);
  const superuser = await select("super_admin");
  assert(superuser.context.includes("Super Admin"));
  assert.equal(await evaluate("document.querySelector('#rmSave').disabled"), true);
  const sizes = await evaluate(`(() => {
    const rect = document.querySelector("#tab-rights").getBoundingClientRect();
    const wrap = document.querySelector(".wrap").getBoundingClientRect();
    return {viewport:innerWidth,rights:rect.width,wrap:wrap.width};
  })()`);
  assert(sizes.rights > sizes.viewport * .75, `Rights workspace not full width: ${JSON.stringify(sizes)}`);
  await call("Emulation.setDeviceMetricsOverride", {width:850,height:900,deviceScaleFactor:1,mobile:false});
  const tablet = await evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    cards: document.querySelectorAll(".rm-module").length,
    rights:document.querySelector("#tab-rights").getBoundingClientRect().width
  }))()`);
  assert(!tablet.overflow && tablet.cards >= 25, `Tablet layout: ${JSON.stringify(tablet)}`);
  console.log("Rendered workspace PASS",JSON.stringify({master,chief,admin,saveCheck,resetCheck,resetSave,superuser,sizes,tablet}));
} finally {
  ws.close();
}
