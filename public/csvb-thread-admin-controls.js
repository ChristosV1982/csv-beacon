// public/csvb-thread-admin-controls.js
// C.S.V. BEACON — T-7B Thread privacy control for Superuser Administration.
// Exact IDs only. Does not modify su-admin.js.

(() => {
  "use strict";

  const BUILD = "T7B-THREAD-ADMIN-CONTROLS-2026-05-05";

  let sb = null;
  let lastCompanyId = null;
  let loading = false;

  function el(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function injectStyles() {
    if (document.getElementById("csvbThreadAdminControlsStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbThreadAdminControlsStyles";
    style.textContent = `
      #csvbThreadPrivacyCard {
        box-shadow: none;
        margin-top: 10px;
        border: 1px solid #D6E4F5;
        background: #F7FAFE;
      }

      #csvbThreadPrivacyCard .csvb-thread-card-title {
        font-weight: 700;
        color: #062A5E;
        margin-bottom: 4px;
      }

      #csvbThreadPrivacyCard .csvb-thread-help {
        color: #5E6F86;
        font-size: .88rem;
        line-height: 1.3;
        margin-bottom: 8px;
      }

      #csvbThreadPrivacyCard .csvb-thread-row {
        display: flex;
        align-items: end;
        gap: 8px;
        flex-wrap: wrap;
      }

      #csvbThreadPrivacyCard .csvb-thread-field {
        flex: 1 1 260px;
      }

      #csvbThreadPrivacyCard label {
        display: block;
        margin-bottom: 4px;
        font-weight: 600;
        color: #062A5E;
      }

      #csvbThreadPrivacyCard select {
        width: 100%;
        min-height: 34px;
        padding: 6px 9px;
        border: 1px solid #C8DAEF;
        border-radius: 8px;
        background: #fff;
        color: #163457;
      }

      #csvbThreadPrivacyCard .csvb-thread-status {
        margin-top: 7px;
        font-size: .86rem;
        color: #5E6F86;
        white-space: pre-wrap;
      }

      #csvbThreadPrivacyCard .csvb-thread-status.ok {
        color: #087334;
      }

      #csvbThreadPrivacyCard .csvb-thread-status.err {
        color: #9B1C1C;
      }
    `;

    document.head.appendChild(style);
  }

  function createPanel() {
    if (el("csvbThreadPrivacyCard")) return;

    injectStyles();

    const modulesBody = el("companyModulesBody");
    const anchorCard = modulesBody?.closest(".card");
    const parent = anchorCard?.parentElement || el("tab-companies");

    if (!parent) return;

    const card = document.createElement("div");
    card.id = "csvbThreadPrivacyCard";
    card.className = "card";
    card.innerHTML = `
      <div class="csvb-thread-card-title">Thread privacy / platform access</div>
      <div class="csvb-thread-help">
        Controls whether platform/superuser accounts may view this company’s Threads content.
        This does not enable or disable the Threads module itself; module access is controlled above in Company modules.
      </div>

      <div class="csvb-thread-row">
        <div class="csvb-thread-field">
          <label for="threadPlatformAccessMode">Thread platform access mode</label>
          <select id="threadPlatformAccessMode" disabled>
            <option value="platform_visible">platform_visible — platform/superuser may access company threads</option>
            <option value="company_private">company_private — company thread content is private from platform users</option>
            <option value="support_only">support_only — reserved for future temporary support access</option>
          </select>
        </div>

        <button
          class="btn btnSmall"
          type="button"
          id="threadPlatformAccessSaveBtn"
          data-csvb-help="Save the selected thread platform access mode for this company."
          disabled
        >
          Save thread privacy
        </button>
      </div>

      <div class="csvb-thread-status" id="threadPlatformAccessStatus">
        Select a company.
      </div>
    `;

    if (anchorCard) {
      anchorCard.insertAdjacentElement("afterend", card);
    } else {
      parent.appendChild(card);
    }

    el("threadPlatformAccessSaveBtn")?.addEventListener("click", saveMode);
  }

  function selectedCompanyId() {
    return (el("co_company_id")?.value || "").trim();
  }

  function setStatus(text, kind = "") {
    const s = el("threadPlatformAccessStatus");
    if (!s) return;
    s.textContent = text || "";
    s.className = "csvb-thread-status " + kind;
  }

  function setControlsEnabled(enabled) {
    const sel = el("threadPlatformAccessMode");
    const btn = el("threadPlatformAccessSaveBtn");

    if (sel) sel.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
  }

  async function loadMode(companyId) {
    if (!companyId || loading) return;

    loading = true;
    setControlsEnabled(false);
    setStatus("Loading thread privacy setting…");

    try {
      let mode = "";

      const direct = await sb
        .from("companies")
        .select("id, company_name, thread_platform_access_mode")
        .eq("id", companyId)
        .single();

      if (!direct.error && direct.data) {
        mode = direct.data.thread_platform_access_mode || "platform_visible";
      } else {
        const { data, error } = await sb.rpc("csvb_admin_list_companies", {});
        if (error) throw error;

        const row = (data || []).find((c) => String(c.id) === String(companyId));
        mode = row?.thread_platform_access_mode || "platform_visible";
      }

      const sel = el("threadPlatformAccessMode");
      if (sel) sel.value = mode;

      setControlsEnabled(true);
      setStatus("Current mode: " + mode, "ok");
    } catch (e) {
      setControlsEnabled(false);
      setStatus("Could not load thread privacy setting:\n" + String(e?.message || e), "err");
    } finally {
      loading = false;
    }
  }

  async function saveMode() {
    const companyId = selectedCompanyId();
    const mode = el("threadPlatformAccessMode")?.value || "platform_visible";

    if (!companyId) {
      setStatus("Select a company first.", "err");
      return;
    }

    setControlsEnabled(false);
    setStatus("Saving thread privacy setting…");

    try {
      const { error } = await sb.rpc("csvb_admin_set_company_thread_access_mode", {
        p_company_id: companyId,
        p_mode: mode
      });

      if (error) throw error;

      setStatus("Saved thread privacy mode: " + mode, "ok");
    } catch (e) {
      setStatus("Save failed:\n" + String(e?.message || e), "err");
    } finally {
      setControlsEnabled(true);
    }
  }

  function watchCompanySelection() {
    setInterval(() => {
      const id = selectedCompanyId();

      if (id === lastCompanyId) return;

      lastCompanyId = id;

      if (!id) {
        setControlsEnabled(false);
        setStatus("Select a company.");
        return;
      }

      loadMode(id);
    }, 500);
  }

  async function init() {
    window.CSVB_THREAD_ADMIN_CONTROLS_BUILD = BUILD;

    if (!window.AUTH?.ensureSupabase) return;

    sb = window.AUTH.ensureSupabase();

    createPanel();
    watchCompanySelection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
