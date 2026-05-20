// public/risq-questions-editor-change-event-bridge.js
// C.S.V. BEACON — RISQ Editor change-event bridge
// Records RISQ change-log events after successful RISQ Editor write RPCs.
// Does not block original saves if logging fails.

(() => {
  "use strict";

  const BUILD = "RISQ-EDITOR-CHANGE-EVENT-BRIDGE-20260520_2";
  window.CSVB_RISQ_EDITOR_CHANGE_EVENT_BRIDGE_BUILD = BUILD;

  const WRITE_RPC_CONFIG = {
    risq_save_question_mapping: {
      eventType: "mapping_update",
      scope: "mapping",
      title: (ctx) => `RISQ eSMS mapping updated${ctx.questionNo ? " — " + ctx.questionNo : ""}`,
      summary: (ctx) => [
        "RISQ eSMS mapping was updated.",
        ctx.args.p_esms_references ? `eSMS references: ${ctx.args.p_esms_references}` : "",
        ctx.args.p_esms_forms ? `eSMS forms: ${ctx.args.p_esms_forms}` : "",
        ctx.args.p_remarks ? `Remarks: ${ctx.args.p_remarks}` : ""
      ].filter(Boolean).join("\n")
    },
    risq_update_standard_question: {
      eventType: "standard_question_update",
      scope: "standard_question",
      title: (ctx) => `Standard RISQ question updated${ctx.questionNo ? " — " + ctx.questionNo : ""}`,
      summary: (ctx) => ctx.args.p_change_reason || "Standard RISQ question updated."
    },
    risq_create_company_question: {
      eventType: "company_question_create",
      scope: "company_question",
      title: (ctx) => `Company-specific RISQ question created${ctx.questionNo ? " — " + ctx.questionNo : ""}`,
      summary: (ctx) => ctx.args.p_question_text || "Company-specific RISQ question created."
    },
    risq_update_company_question: {
      eventType: "company_question_update",
      scope: "company_question",
      title: (ctx) => `Company-specific RISQ question updated${ctx.questionNo ? " — " + ctx.questionNo : ""}`,
      summary: (ctx) => ctx.args.p_change_reason || "Company-specific RISQ question updated."
    },
    risq_soft_delete_company_question: {
      eventType: "company_question_delete",
      scope: "company_question",
      title: (ctx) => `Company-specific RISQ question deleted${ctx.questionNo ? " — " + ctx.questionNo : ""}`,
      summary: (ctx) => ctx.args.p_delete_reason || "Company-specific RISQ question deleted."
    }
  };

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function ensureCompactDetailLoaded() {
    if (window.CSVB_RISQ_COMPACT_DETAIL_BUILD) return;
    if (document.querySelector('script[data-csvb-risq-compact-detail-loader="1"]')) return;

    const script = document.createElement("script");
    script.src = "./risq-questions-compact-detail.js?v=20260520_1";
    script.defer = true;
    script.dataset.csvbRisqCompactDetailLoader = "1";
    document.body.appendChild(script);
  }

  function currentQuestionNo() {
    const detail = document.querySelector(".detail-number");
    const list = document.querySelector(".q-item.active .q-no");
    const raw = safeStr(detail?.textContent || list?.textContent || "").trim();
    if (!raw) return "";
    return raw.replace(/\s*\(printed.*$/i, "").trim();
  }

  function currentQuestionId(args, result) {
    return (
      args?.p_question_id ||
      result?.question_id ||
      result?.id ||
      null
    );
  }

  function currentCompanyId(args, result) {
    return (
      args?.p_company_id ||
      result?.company_id ||
      null
    );
  }

  function questionNoFrom(args, result) {
    return safeStr(
      result?.internal_question_no ||
      result?.question_no ||
      args?.p_question_no ||
      currentQuestionNo()
    ).trim();
  }

  function trimPayloadValue(value) {
    if (typeof value !== "string") return value;
    if (value.length <= 2000) return value;
    return value.slice(0, 2000) + "…";
  }

  function compactObject(obj) {
    if (!obj || typeof obj !== "object") return obj || null;
    const out = Array.isArray(obj) ? [] : {};
    Object.entries(obj).forEach(([key, value]) => {
      if (value && typeof value === "object") {
        out[key] = compactObject(value);
      } else {
        out[key] = trimPayloadValue(value);
      }
    });
    return out;
  }

  async function recordChangeEvent(client, originalRpc, rpcName, args, result) {
    const cfg = WRITE_RPC_CONFIG[rpcName];
    if (!cfg) return;

    const context = {
      rpcName,
      args: args || {},
      result: result || {},
      questionNo: questionNoFrom(args, result),
    };

    const questionId = currentQuestionId(args, result);
    const companyId = currentCompanyId(args, result);

    const payload = {
      source_rpc: rpcName,
      args: compactObject(args || {}),
      result: compactObject(result || {}),
      page: "risq-questions-editor.html",
      bridge_build: BUILD
    };

    try {
      await originalRpc.call(client, "csvb_risq_record_change_event", {
        p_event_type: cfg.eventType,
        p_change_scope: cfg.scope,
        p_question_id: questionId,
        p_question_no: context.questionNo || null,
        p_title: cfg.title(context),
        p_summary: cfg.summary(context),
        p_source_record_id: questionId,
        p_company_id: companyId,
        p_payload: payload
      });

      console.log("C.S.V. BEACON: RISQ change event recorded", {
        rpcName,
        questionNo: context.questionNo || null,
        questionId: questionId || null,
        companyId: companyId || null
      });
    } catch (error) {
      console.warn("C.S.V. BEACON: RISQ change event recording failed; original save was not blocked", {
        rpcName,
        error
      });
    }
  }

  function patchClient(client) {
    if (!client || client.__csvbRisqChangeEventBridgePatched) return client;
    if (typeof client.rpc !== "function") return client;

    const originalRpc = client.rpc.bind(client);

    client.rpc = async function patchedRpc(name, args = {}, options) {
      const result = await originalRpc(name, args, options);

      if (
        WRITE_RPC_CONFIG[name] &&
        result &&
        !result.error
      ) {
        const data = result.data;
        setTimeout(() => {
          recordChangeEvent(client, originalRpc, name, args, data).catch((error) => {
            console.warn("C.S.V. BEACON: deferred RISQ change event bridge failed", error);
          });
        }, 0);
      }

      return result;
    };

    Object.defineProperty(client, "__csvbRisqChangeEventBridgePatched", {
      value: true,
      enumerable: false,
      configurable: false,
    });

    return client;
  }

  function patchAuthEnsureSupabase() {
    if (!window.AUTH || typeof window.AUTH.ensureSupabase !== "function") return false;
    if (window.AUTH.__csvbRisqChangeEventBridgePatched) return true;

    const originalEnsure = window.AUTH.ensureSupabase.bind(window.AUTH);

    window.AUTH.ensureSupabase = function patchedEnsureSupabase(...args) {
      const client = originalEnsure(...args);
      return patchClient(client);
    };

    Object.defineProperty(window.AUTH, "__csvbRisqChangeEventBridgePatched", {
      value: true,
      enumerable: false,
      configurable: false,
    });

    try {
      patchClient(originalEnsure());
    } catch (_) {}

    return true;
  }

  function boot() {
    ensureCompactDetailLoaded();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (patchAuthEnsureSupabase() || tries >= 30) clearInterval(timer);
    }, 100);

    window.CSVB_RISQ_EDITOR_CHANGE_EVENT_BRIDGE = {
      build: BUILD,
      patch: patchAuthEnsureSupabase,
    };
  }

  boot();
})();
