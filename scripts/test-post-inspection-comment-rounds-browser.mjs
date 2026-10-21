// Synthetic UI checks in an isolated Chromium context. No sign-in or real writes.
// Start a disposable Chromium on local debugging port 9222 before running.
import assert from "node:assert/strict";
import WebSocket from "ws";

const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:3000";
const target = await (await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(`${base}/index.html`)}`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.once("open", resolve));
let nextId = 0;
const pending = new Map();
socket.on("message", (raw) => {
  const message = JSON.parse(raw);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
};
try {
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setBypassServiceWorker", { bypass: true });
  await evaluate(`new Promise((resolve,reject)=>{
    let count=0; const t=setInterval(()=>{
      if(document.readyState==="complete"){clearInterval(t);resolve(true);}
      if(++count>100){clearInterval(t);reject(Error("Page load timed out"));}
    },100);
  })`);
  await evaluate(`(async()=>{
    document.body.replaceChildren();
    window.alerts=[]; window.alert=(value)=>window.alerts.push(value);
    window.importer=await import(${JSON.stringify(`${base}/post_inspection_operator_comments.mjs?v=20261021_ocimf_rounds_v1`)});
    window.helpers=await import(${JSON.stringify(`${base}/post_inspection_comment_rounds.mjs?v=20261021_ocimf_rounds_v1`)});
    window.historyUi=await import(${JSON.stringify(`${base}/post_inspection_comment_round_history.mjs?v=20261021_ocimf_rounds_v1`)});
    window.finding={id:"11111111-1111-4111-8111-111111111111",report_id:"22222222-2222-4222-8222-222222222222",
      obs_type:"negative",observation_type:"negative_observation",question_no:"05.08.01",designation:"Hardware",
      classification_coding:"Lighting - Deck",nature_of_concern:"Sudden failure",
      observation_text:"Two deck lights were not functioning.",
      immediate_cause:null,root_cause:null,corrective_action:null,preventative_action:null};
    window.makeEntry=(day,label)=>({...window.finding,question_base:"5.8.1",
      parser_identity_status:"unique_finding_identity",comment_timestamp:day+"/10/2026 09:42:16",comment_byline:"Synthetic Operator",
      immediate_cause:label+" cause",root_cause:label+" root",corrective_action:label+" correction",
      preventative_action:label+" prevention",comments_page_hint:1,comment_section:2});
    window.startReview=(entries,rows,history)=>{
      window.writes=[];window.cleanups=0;window.refreshes=0;window.finished=false;window.failure=null;
      const client={
        storage:{from:()=>({upload:async()=>({error:null})})},
        functions:{invoke:async()=>({data:{ok:true,operator_comments_version:"operator-comments-v1",
          operator_comments_rounds_version:"operator-comment-rounds-v1",
          extracted:{header:{report_reference:"SYNTHETIC-REPORT"},operator_comments:entries}}})},
        from:()=>({select:()=>({eq:async()=>({data:rows})})}),
        rpc:async(name,args)=>{
          if(name==="csvb_post_inspection_comment_rounds_for_me")return {data:history};
          window.writes.push({name,args});
          return {data:{applied:args.p_rounds.length,
            initial_applied:args.p_rounds.filter(r=>r.action==="initial").length,
            appended:args.p_rounds.filter(r=>r.action==="subsequent").length}};
        }
      };
      window.reviewPromise=window.importer.importOperatorCommentsFromPdf({
        file:new File(["Synthetic PDF test bytes"],"synthetic.pdf",{type:"application/pdf"}),
        report:{id:window.finding.report_id,report_ref:"SYNTHETIC-REPORT"},supabase:client,
        pdfBucket:"inspection-reports",pdfFolderPrefix:"post_inspections",assertFunctionVersion:()=>{},
        formatEdgeFunctionError:async(e)=>String(e),
        cleanupTemporaryPdfSource:async()=>{window.cleanups++;return null;},
        setSaveStatus:()=>{},getActiveReportId:()=>window.finding.report_id,onApplied:async()=>{window.refreshes++;}
      }).then(()=>{window.finished=true;}).catch(e=>{window.failure=e.message;window.finished=true;});
    };
    window.waitDialog=async()=>{
      for(let n=0;n<100;n++){
        if(document.querySelector("dialog[open]"))return true;
        if(window.failure)throw Error(window.failure);
        await new Promise(r=>setTimeout(r,30));
      }throw Error("Review did not open");
    };
    window.confirmReview=()=>Array.from(document.querySelectorAll("dialog button"))
      .find(b=>b.textContent==="Apply selected Operator Comments").click();
    return true;
  })()`);
  const first = await evaluate(`(async()=>{
    window.entries=[makeEntry("01","Original"),makeEntry("05","Second"),makeEntry("10","Third")];
    startReview(window.entries,[finding],[]);
    await waitDialog();
    const text=document.querySelector("dialog").textContent;
    if(!text.includes("Initial response")||!text.includes("New subsequent comment"))throw Error("Round labels absent");
    if(window.cleanups!==1)throw Error("Temporary PDF must be removed before review");
    confirmReview();await reviewPromise;
    return {failure,actions:writes[0]?.args.p_rounds.map(r=>r.action),cleanups,refreshes};
  })()`);
  assert.equal(first.failure, null);
  assert.deepEqual(first.actions, ["initial", "subsequent", "subsequent"]);
  assert.equal(first.cleanups, 1);
  assert.equal(first.refreshes, 1);
  console.log("PASS: cumulative three-round review applies initial + two appends; temp cleaned before review.");
  const revision = await evaluate(`(async()=>{
    const saved={...finding,...entries[0]};
    window.savedHistory=await Promise.all(entries.map(async(e,n)=>({...e,
      id:"round-"+n,observation_item_id:finding.id,round_kind:n?"subsequent":"initial",
      ocimf_timestamp_raw:e.comment_timestamp,ocimf_timestamp:helpers.parseOcimfTimestamp(e.comment_timestamp),
      ocimf_author_raw:e.comment_byline,source_order:n,imported_at:"2026-10-21T10:00:00Z",
      content_fingerprint:await helpers.contentFingerprint(e)})));
    startReview([makeEntry("05","Revised")],[saved],savedHistory);
    await waitDialog();
    confirmReview();
    const blocked=document.querySelector("dialog[open]")?.textContent.includes("Confirm each selected Possible revision");
    const writesBefore=writes.length;
    const approval=Array.from(document.querySelectorAll("dialog label"))
      .find(l=>l.textContent.includes("I explicitly confirm")).querySelector("input");
    approval.checked=true;confirmReview();await reviewPromise;
    return {blocked,writesBefore,failure,action:writes[0]?.args.p_rounds[0]?.action,
      approved:writes[0]?.args.p_rounds[0]?.revision_approved};
  })()`);
  assert.equal(revision.blocked, true);
  assert.equal(revision.writesBefore, 0);
  assert.equal(revision.failure, null);
  assert.equal(revision.action, "subsequent");
  assert.equal(revision.approved, true);
  console.log("PASS: possible revision cannot apply until explicitly approved; append-only payload.");
  const duplicate = await evaluate(`(async()=>{
    startReview(entries,[{...finding,...entries[0]}],savedHistory);
    await waitDialog();const label=document.querySelector("dialog").textContent;
    confirmReview();await reviewPromise;
    return {labels:(label.match(/Already imported/g)||[]).length,writes:writes.length,failure};
  })()`);
  assert.equal(duplicate.labels, 3);
  assert.equal(duplicate.writes, 0);
  assert.equal(duplicate.failure, null);
  console.log("PASS: exact cumulative re-import performs no writes.");
  const ambiguous = await evaluate(`(async()=>{
    startReview([entries[0]],[finding,{...finding,id:"33333333-3333-4333-8333-333333333333"}],[]);
    await waitDialog();const label=document.querySelector("dialog").textContent;
    confirmReview();await reviewPromise;return {ambiguous:label.includes("Ambiguous"),writes:writes.length,failure};
  })()`);
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.writes, 0);
  console.log("PASS: ambiguous finding is not written.");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const history = await evaluate(`(async()=>{
    const container=document.createElement("section");document.body.append(container);
    await historyUi.renderOcimfCommentRoundHistory({container,reportId:finding.report_id,itemId:finding.id,
      supabase:{rpc:async()=>({data:savedHistory})}});
    return {rounds:container.querySelectorAll(".ocimf-round-history__round").length,
      originalHidden:!container.textContent.includes("Original cause"),
      secondVisible:container.textContent.includes("Second cause"),
      byline:container.textContent.includes("Synthetic Operator")};
  })()`);
  assert.equal(history.rounds, 2);
  assert.equal(history.originalHidden, true);
  assert.equal(history.secondVisible, true);
  assert.equal(history.byline, true);
  console.log("PASS: compact history displays only subsequent rounds with byline and four fields.");
} finally {
  await call("Page.close").catch(() => {});
  socket.close();
}
