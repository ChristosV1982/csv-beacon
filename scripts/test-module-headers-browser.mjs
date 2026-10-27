// Read-only layout fixtures against served pages. Scripts are blocked in this
// disposable browser, so no authentication or backend requests/writes occur.
import assert from "node:assert/strict";
import WebSocket from "ws";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const base = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000";
const pages = process.argv.slice(2).length ? process.argv.slice(2) :
  readdirSync("public").filter(file => file.endsWith(".html") &&
    readFileSync(`public/${file}`, "utf8").includes("csvb-module-header.css")).sort();
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.once("open", resolve));
let id = 0, baseline = false, rootSelector = "";
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
socket.on("message", async raw => {
  const message = JSON.parse(raw);
  if (pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error ? request.reject(Error(JSON.stringify(message.error))) : request.resolve(message.result);
  }
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, resourceType, request } = message.params;
  let body = null, mime = "application/javascript";
  if (resourceType === "Script") body = "";
  if (resourceType === "Document") {
    const file = new URL(request.url).pathname.split("/").pop();
    body = baseline ? execFileSync("git", ["show", `HEAD:public/${file}`], { encoding: "utf8" }) :
      await (await fetch(request.url)).text();
    mime = "text/html";
  }
  if (baseline && new URL(request.url).pathname.endsWith("/csvb-module-header.css")) {
    body = execFileSync("git", ["show", "HEAD:public/csvb-module-header.css"], { encoding: "utf8" });
    mime = "text/css";
  }
  if (body === null) await call("Fetch.continueRequest", { requestId });
  else await call("Fetch.fulfillRequest", {
    requestId, responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: mime },
      ...(resourceType === "Document" ? [{ name: "Content-Security-Policy", value: "script-src 'none'" }] : [])],
    body: Buffer.from(body).toString("base64")
  });
});
async function evaluate(expression) {
  const response = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw Error(response.exceptionDetails.text);
  return response.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function load(file, width, old) {
  baseline = old;
  await call("Emulation.setDeviceMetricsOverride", {
    width, height: 900, deviceScaleFactor: 1, mobile: false
  });
  await call("Page.navigate", { url: `${base}/${file}?header-layout-check=1` });
  for (let i = 0; i < 100; i++) {
    await delay(80);
    if (await evaluate(`document.readyState === "complete"`)) break;
  }
  // Existing polish files use this page marker in normal runtime.
  await evaluate(`document.documentElement.dataset.csvbPage=${JSON.stringify(file)}`);
  await delay(150);
}
const outsideStyles = () => `(() => [...document.querySelectorAll("button,input,select,textarea,a.btn,a.btn2")]
  .filter(el=>!document.querySelector(${JSON.stringify(rootSelector)}).contains(el))
  .map(el=>{const s=getComputedStyle(el);return [el.id,el.className,
    ...["fontFamily","fontSize","fontWeight","lineHeight","padding","minHeight","borderRadius","display"].map(k=>s[k])]}))()`;
const controlsContract = `(() => [...document.querySelectorAll("button,input,select,textarea,a,[id],[onclick],[data-card],[data-module]")]
  .map(el=>[el.tagName,[...el.attributes].map(a=>[a.name,a.name==="class"?
    a.value.split(/\\s+/).filter(c=>!c.startsWith("csvb-module-header")).join(" ").trim():a.value])
    .filter(([name,value])=>name!=="class"||value).sort((a,b)=>a[0].localeCompare(b[0])),
    ["BUTTON","SELECT","A"].includes(el.tagName)?el.textContent.replace(/\\s+/g," ").trim():null]))()`;
const unchangedPages = new Set(["vetting-inspection-planner.html", "q-sire-questions-viewer.html",
  "mooring-anchoring-inventories-v4.html", "mooring-anchoring-operations.html", "post_inspection.html"]);
const headerStyles = () => `(() => {
  const header=document.querySelector(${JSON.stringify(rootSelector)});
  return [header,...header.querySelectorAll("*")].map(el=>{
    const s=getComputedStyle(el);return ["display","alignItems","justifyContent","gap","padding",
      "fontFamily","fontSize","fontWeight","lineHeight","borderRadius","minHeight"].map(k=>s[k])
  });
})()`;
try {
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Network.setBypassServiceWorker", { bypass: true });
  await call("Fetch.enable", { patterns: [
    { urlPattern: "*", resourceType: "Script" },
    { urlPattern: "*", resourceType: "Document" },
    { urlPattern: "*/csvb-module-header.css*", resourceType: "Stylesheet" }
  ] });
  let checks = 0;
  const failures = [];
  for (const file of pages) {
    for (const width of [1440, 768, 390]) {
      try {
      await load(file, width, false);
      rootSelector = await evaluate(`(() => {
        let el=document.querySelector(".csvb-module-header"),parts=[];
        if(!el)throw Error("Missing header");
        while(el && el!==document.body){parts.unshift(el.tagName.toLowerCase()+":nth-child("+
          ([...el.parentElement.children].indexOf(el)+1)+")");el=el.parentElement}
        return "body>"+parts.join(">");
      })()`);
      await load(file, width, true);
      const before = await evaluate(outsideStyles());
      const contract = await evaluate(controlsContract);
      const oldHeader = unchangedPages.has(file) ? await evaluate(headerStyles()) : null;
      await load(file, width, false);
      assert.deepEqual(await evaluate(outsideStyles()), before, `${file}: content controls changed at ${width}`);
      assert.deepEqual(await evaluate(controlsContract), contract, `${file}: IDs/handlers/navigation/control contract changed`);
      if (oldHeader) assert.deepEqual(await evaluate(headerStyles()), oldHeader,
        `${file}: existing standardized header appearance changed`);
      // Read-only browser fixture: stress actual header groups with the states
      // normally revealed by auth, without running auth or making data writes.
      await evaluate(`(() => {
        const header=document.querySelector(".csvb-module-header");
        for(const id of ["loginBtn","logoutBtn","switchUserBtn"]){
          const el=header.querySelector("#"+id);if(el)el.style.removeProperty("display");
        }
        const wrap=header.querySelector("#csvbCompanyViewWrap");
        if(wrap){
          wrap.style.display="flex";
          const select=wrap.querySelector("select");
          if(select)select.add(new Option("C.S.V. BEACON Internal / Testing Company","fixture"));
        }
      })()`);
      const metrics = await evaluate(`(() => {
        const header=document.querySelector(".csvb-module-header");
        if(!header) throw Error("Missing opt-in header");
        return [...header.querySelectorAll("button,a,select")].filter(el=>el.getClientRects().length &&
          getComputedStyle(el).visibility!=="hidden" && !el.matches('input[type="checkbox"],input[type="radio"]'))
          .map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {
            text:el.textContent.trim(),height:r.height,font:s.fontSize,minHeight:s.minHeight,
            left:r.left,right:r.right,clipped:el.scrollWidth>el.clientWidth+2
          }});
      })()`);
      // A few pages intentionally expose only hidden auth controls until ready.
      for (const control of metrics) {
        assert.equal(control.font, "14px", `${file}: font ${JSON.stringify(control)}`);
        assert.ok(control.height >= (width <= 768 ? 44 : 34), `${file}: short ${JSON.stringify(control)}`);
        assert.ok(control.left >= -1 && control.right <= width + 1, `${file}: overflow ${JSON.stringify(control)}`);
        assert.equal(control.clipped, false, `${file}: clipped ${JSON.stringify(control)}`);
      }
      if (width === 1440 || width === 390) {
        const capture = await call("Page.captureScreenshot", { format: "jpeg", quality: 80 });
        writeFileSync(`/tmp/header-${file}-${width}.jpg`, Buffer.from(capture.data, "base64"));
      }
      console.log(`PASS ${file} ${width}px: header controls aligned/readable; content control styles unchanged`);
      checks++;
      } catch (error) {
        failures.push(`${file} ${width}px: ${error.message}`);
        console.error(`FAIL ${failures.at(-1)}`);
      }
    }
  }
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log(`PASS ${pages.length} pages / ${checks} layouts; IDs, control attributes and navigation unchanged.`);
} finally {
  await call("Page.close");
  socket.close();
}
