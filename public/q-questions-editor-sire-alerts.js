// public/q-questions-editor-sire-alerts.js
// C.S.V. BEACON — SIRE Questions Editor → SIRE Viewer update alert bridge
// Editor-only helper. Records a SIRE library change event after successful SIRE question changes.
// Does not alter SIRE question data.

(() => {
  "use strict";

  const BUILD = "QEDITOR-SIRE-ALERT-BRIDGE-20260517_2";
  window.CSVB_QEDITOR_SIRE_ALERT_BRIDGE_BUILD = BUILD;

  let sb = null;
  let lastSignature = "";
  let lastAt = 0;
  let patchApplied = false;
  let recordingEvent = false;

  const SUCCESS_PATTERNS = [
    /^Saved new question\.?/i,
    /^Saved changes\.?/i,
    /^Deactivated\s+/i,
    /^Activated\s+/i,
    /^Deleted\s+/i
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function textOf(id) {
    return safeStr($(id)?.textContent).trim();
  }

  function valueOf(id) {
    return safeStr($(id)?.value).trim();
  }

  function isSuccessMessage(text) {
    const clean = safeStr(text).trim();
    if (!clean) return false;
    return SUCCESS_PATTERNS.some((rx) => rx.test(clean));
  }

  function sourceTypeFromDom() {
    const editSource = valueOf("dbSourceType");
    if (editSource) return editSource;

    const pill = textOf("pillSource") || textOf("vSourcePill");
    const m = pill.match(/source:\s*(.+)$/i);
    return m ? safeStr(m[1]).trim() : "";
  }

  function questionNumberFromDom(message) {
    const hdr = textOf("hdrNumber");
    if (hdr && hdr !== "—") return hdr;

    const viewHdr = textOf("vhdrNumber");
    if (viewHdr && viewHdr !== "—") return viewHdr;

    const m = safeStr(message).match(/(?:Saved|Deleted|Activated|Deactivated)\s+([0-9]{2}\.[0-9]{2}\.[0-9]{2})/i);
    return m ? m[1] : "";
  }

  function shortTextFromDom() {
    return valueOf("pShortText") || textOf("vShortText") || "";
  }

  function changeReasonFromDom() {
    return valueOf("dbChangeReason") || "";
  }

  function eventTypeFromMessage(message) {
    const clean = safeStr(message).trim();

    if (/^Saved new question/i.test(clean)) return "sire_question_created_or_updated";
    if (/^Saved changes/i.test(clean)) return "sire_question_updated";
    if (/^Deactivated\s+/i.test(clean)) return "sire_question_deactivated";
    if (/^Activated\s+/i.test(clean)) return "sire_question_activated";
    if (/^Deleted\s+/i.test(clean)) return "sire_question_deleted";

    return "sire_library_update";
  }

  function eventTypeFromUpsertArgs(args) {
    const status = safeStr(args?.p_status).trim().toLowerCase();
    const prevStatus = safeStr(textOf("pillStatus").replace(/^status:\s*/i, "")).trim().toLowerCase();

    if (status === "inactive" && prevStatus && prevStatus !== "inactive") return "sire_question_deactivated";
    if (status === "active" && prevStatus === "inactive") return "sire_question_activated";

    return args?.p_question_id ? "sire_question_updated" : "sire_question_created_or_updated";
  }

  function titleFromEvent(eventType, qno) {
    const suffix = qno ? ` — Q ${qno}` : "";

    if (eventType === "sire_question_created_or_updated") return `SIRE 2.0 question saved${suffix}`;
    if (eventType === "sire_question_updated") return `SIRE 2.0 question updated${suffix}`;
    if (eventType === "sire_question_deactivated") return `SIRE 2.0 question deactivated${suffix}`;
    if (eventType === "sire_question_activated") return `SIRE 2.0 question activated${suffix}`;
    if (eventType === "sire_question_deleted") return `SIRE 2.0 question deleted${suffix}`;

    return `SIRE 2.0 Questions Viewer updated${suffix}`;
  }

  function summaryFromEvent(eventType, qno, shortText, reason) {
    const parts = [];

    if (qno) parts.push(`Question ${qno}`);
    if (shortText) parts.push(shortText);

    const lead = parts.length ? parts.join(" — ") : "The SIRE 2.0 question library";

    let action = "was updated";
    if (eventType === "sire_question_deactivated") action = "was deactivated";
    if (eventType === "sire_question_activated") action = "was activated";
    if (eventType === "sire_question_deleted") action = "was deleted";
    if (eventType === "sire_question_created_or_updated") action = "was saved";

    return `${lead} ${action}.${reason ? ` Change reason: ${reason}` : ""}`;
  }

  async function ensureSupabase() {
    if (sb) return sb;
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not available.");
    sb = window.AUTH.ensureSupabase();
    return sb;
  }

  function questionNoFromUpsertArgs(args) {
    const nb = safeStr(args?.p_number_base).trim();
    const sx = safeStr(args?.p_number_suffix).trim();
    return sx ? `${nb}-${sx}` : nb;
  }

  async function recordSireAlertEvent(payload) {
    const sourceType = safeStr(payload.sourceType).trim();
    if (sourceType !== "SIRE") return;

    const eventType = payload.eventType || "sire_library_update";
    const qno = payload.qno || "";
    const shortText = payload.shortText || "";
    const reason = payload.reason || "";
    const title = titleFromEvent(eventType, qno);
    const summary = summaryFromEvent(eventType, qno, shortText, reason);

    const signature = [eventType, qno, shortText, reason, payload.origin || ""].join("|");
    const now = Date.now();

    if (signature === lastSignature && now - lastAt < 10000) return;

    lastSignature = signature;
    lastAt = now;

    const client = await ensureSupabase();

    recordingEvent = true;
    try {
      const { error } = await client.rpc("csvb_record_sire_library_change_event", {
        p_event_type: eventType,
        p_source_module: "sire_questions_editor",
        p_source_record_id: payload.sourceRecordId || null,
        p_question_id: payload.questionId || null,
        p_question_no: qno || null,
        p_change_scope: payload.changeScope || "question",
        p_title: title,
        p_summary: summary,
        p_details: {
          bridge_build: BUILD,
          origin: payload.origin || null,
          source_type: sourceType,
          question_no: qno || null,
          short_text: shortText || null,
          change_reason: reason || null,
          url: window.location.pathname
        }
      });

      if (error) throw error;
    } finally {
      recordingEvent = false;
    }

    console.info("C.S.V. BEACON: SIRE Viewer update alert event recorded.", {
      eventType,
      qno,
      title,
      origin: payload.origin
    });
  }

  async function recordAlertFromSuccess(message) {
    await recordSireAlertEvent({
      origin: "okBox_observer",
      sourceType: sourceTypeFromDom(),
      eventType: eventTypeFromMessage(message),
      qno: questionNumberFromDom(message),
      shortText: shortTextFromDom(),
      reason: changeReasonFromDom(),
      questionId: null,
      sourceRecordId: null,
      changeScope: "question"
    });
  }

  function patchRpcClient() {
    if (patchApplied) return;
    if (!window.AUTH?.ensureSupabase) return;

    const client = window.AUTH.ensureSupabase();
    if (!client || typeof client.rpc !== "function") return;
    if (client.__csvbSireAlertBridgePatched) {
      patchApplied = true;
      return;
    }

    const originalRpc = client.rpc.bind(client);

    client.rpc = async function patchedRpc(name, args = {}, options) {
      const result = await originalRpc(name, args, options);

      try {
        if (!recordingEvent && name === "csvb_upsert_question_master_for_me" && !result?.error) {
          const sourceType = safeStr(args?.p_source_type).trim();

          if (sourceType === "SIRE") {
            const dataRow = Array.isArray(result?.data) ? result.data[0] : result?.data;
            const qno = questionNoFromUpsertArgs(args) || questionNumberFromDom("");
            const payload = args?.p_payload || {};
            const shortText = safeStr(payload.short_text || payload["Short Text"] || shortTextFromDom()).trim();
            const reason = safeStr(args?.p_change_reason || changeReasonFromDom()).trim();

            setTimeout(() => {
              recordSireAlertEvent({
                origin: "rpc_upsert_intercept",
                sourceType,
                eventType: eventTypeFromUpsertArgs(args),
                qno,
                shortText,
                reason,
                questionId: dataRow?.id || args?.p_question_id || null,
                sourceRecordId: dataRow?.id || args?.p_question_id || null,
                changeScope: "question"
              }).catch((error) => {
                console.warn("C.S.V. BEACON: could not record SIRE Viewer update alert event:", error);
              });
            }, 250);
          }
        }
      } catch (error) {
        console.warn("C.S.V. BEACON: SIRE alert bridge RPC interception warning:", error);
      }

      return result;
    };

    client.__csvbSireAlertBridgePatched = true;
    sb = client;
    patchApplied = true;

    console.info("C.S.V. BEACON: SIRE editor alert bridge RPC interception active.", { build: BUILD });
  }

  function observeOkBox() {
    const okBox = $("okBox");
    if (!okBox) return;

    const check = () => {
      const text = safeStr(okBox.textContent).trim();
      if (!isSuccessMessage(text)) return;

      setTimeout(() => {
        recordAlertFromSuccess(text).catch((error) => {
          console.warn("C.S.V. BEACON: could not record SIRE Viewer update alert event:", error);
        });
      }, 650);
    };

    const observer = new MutationObserver(check);
    observer.observe(okBox, {
      childList: true,
      characterData: true,
      subtree: true
    });

    check();
  }

  function boot() {
    observeOkBox();
    patchRpcClient();
    setTimeout(patchRpcClient, 700);
    setTimeout(patchRpcClient, 1800);

    window.CSVB_QEDITOR_SIRE_ALERT_BRIDGE = {
      build: BUILD,
      patchRpcClient,
      isPatched: () => patchApplied
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
