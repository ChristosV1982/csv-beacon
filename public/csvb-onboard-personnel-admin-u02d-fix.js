/* public/csvb-onboard-personnel-admin-u02d-fix.js */
/* C.S.V. BEACON – U-02D Onboard Personnel Creation Verification Fix */

(() => {
  "use strict";

  const BUILD = "CSVBEACON-ONBOARD-PERSONNEL-U02D-FIX-20260512-1";

  const local = {
    sb: null,
    busy: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showOkSafe(message) {
    if (typeof showOk === "function") showOk(message);
    else alert(message);
  }

  function showWarnSafe(message) {
    if (typeof showWarn === "function") showWarn(message);
    else alert(message);
  }

  function clearMessagesSafe() {
    if (typeof clearWarn === "function") clearWarn();
    if (typeof clearOk === "function") clearOk();
  }

  function sb() {
    if (!local.sb) local.sb = window.AUTH.ensureSupabase();
    return local.sb;
  }

  function isOnboardMode() {
    return $("cu_creation_mode")?.value === "onboard";
  }

  function companyId() {
    return $("cu_company")?.value || "";
  }

  function vesselId() {
    return $("cu_vessel")?.value || "";
  }

  function selectedRankId() {
    return $("cu_onboard_rank")?.value || "";
  }

  function selectedRankName() {
    const sel = $("cu_onboard_rank");
    const opt = sel?.options?.[sel.selectedIndex];
    return opt?.getAttribute("data-rank-name") || opt?.textContent?.split("—")?.[0]?.trim() || "";
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function getFormDanaos() {
    return ($("cu_username")?.value || "").trim();
  }

  async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function refreshUsersSafe() {
    if (typeof refreshUsers === "function") {
      await refreshUsers();
    }
  }

  async function findProfileByDanaosOrUsername(value) {
    const target = String(value || "").trim();
    if (!target) return null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (typeof state !== "undefined" && Array.isArray(state.users)) {
        const foundState = state.users.find((u) =>
          String(u.username || "") === target ||
          String(u.danaos_credential || "") === target
        );
        if (foundState?.id) return foundState;
      }

      try {
        const { data, error } = await sb()
          .from("profiles")
          .select("*")
          .or(`username.eq.${target},danaos_credential.eq.${target}`)
          .limit(1)
          .maybeSingle();

        if (!error && data?.id) return data;
      } catch (_) {}

      try {
        await refreshUsersSafe();
      } catch (_) {}

      await wait(500);
    }

    return null;
  }

  async function verifyOnboardConfigured(profileId, danaos) {
    const { data, error } = await sb()
      .from("profiles")
      .select("id, username, danaos_credential, position, onboard_rank_id, onboard_status, onboard_access_enabled, vessel_id")
      .eq("id", profileId)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("Verification failed: profile could not be read after onboard configuration.");
    }

    if (String(data.danaos_credential || "") !== String(danaos)) {
      throw new Error("Verification failed: DANAOS credential was not stored.");
    }

    if (!data.onboard_rank_id || !data.position) {
      throw new Error("Verification failed: onboard rank / position was not stored.");
    }

    if (data.onboard_status === "not_applicable") {
      throw new Error("Verification failed: onboard status remained not_applicable.");
    }

    return data;
  }

  async function createOnboardPersonnelVerified() {
    if (local.busy) return;
    local.busy = true;

    try {
      clearMessagesSafe();

      const danaos = getFormDanaos();
      const password = $("cu_password")?.value || "";
      const cid = companyId();
      const vid = vesselId();
      const rankId = selectedRankId();
      const rankName = selectedRankName();

      if (!/^[0-9]{3,5}$/.test(danaos)) {
        throw new Error("DANAOS credential must be numerical and 3 to 5 digits.");
      }

      if (!password) throw new Error("Initial password is required.");
      if (!cid) throw new Error("Company is required.");
      if (!vid) throw new Error("Vessel is required.");
      if (!rankId) throw new Error("Onboard rank is required.");

      if (typeof callSuAdmin !== "function") {
        throw new Error("Superuser Edge Function call helper is not available.");
      }

      const createPayload = {
        action: "create_user",
        username: danaos,
        password,
        role: "vessel",
        position: rankName,
        company_id: cid,
        vessel_id: vid,
        force_password_reset: $("cu_force_reset")?.checked !== false
      };

      const createResp = await callSuAdmin(createPayload);

      let profileId = null;

      if (typeof extractCreatedUserId === "function") {
        profileId = extractCreatedUserId(createResp);
      }

      if (!profileId) {
        const found = await findProfileByDanaosOrUsername(danaos);
        profileId = found?.id || null;
      }

      if (!profileId) {
        throw new Error("User was created, but the profile ID could not be located. Do not create another duplicate. Refresh users and use Apply Onboard Setup.");
      }

      const { error: configError } = await sb().rpc("csvb_configure_onboard_personnel", {
        p_profile_id: profileId,
        p_danaos_credential: danaos,
        p_rank_id: rankId,
        p_vessel_id: vid,
        p_onboard_status: $("cu_onboard_status")?.value || "onboard",
        p_onboard_access_enabled: $("cu_onboard_access_enabled")?.checked === true,
        p_read_only_after_disembarkation: $("cu_read_only_after_disembarkation")?.checked === true,
        p_embarkation_date: $("cu_embarkation_date")?.value || todayIso(),
        p_disembarkation_date: $("cu_disembarkation_date")?.value || null,
        p_reason: $("cu_onboard_notes")?.value || "Onboard personnel created from Superuser Administration."
      });

      if (configError) throw configError;

      await verifyOnboardConfigured(profileId, danaos);

      showOkSafe(`Onboard personnel created and verified: ${danaos} / ${rankName}.`);

      if ($("cu_username")) $("cu_username").value = "";
      if ($("cu_password")) $("cu_password").value = "";
      if ($("cu_onboard_notes")) $("cu_onboard_notes").value = "";
      if ($("cu_disembarkation_date")) $("cu_disembarkation_date").value = "";

      await refreshUsersSafe();
      window.setTimeout(enhanceRows, 600);
    } finally {
      local.busy = false;
    }
  }

  async function createOfficeUserPassthrough() {
    if (typeof callSuAdmin !== "function") {
      throw new Error("Superuser Edge Function call helper is not available.");
    }

    const username = ($("cu_username")?.value || "").trim();
    const password = $("cu_password")?.value || "";
    const role = $("cu_role")?.value || "";
    const position = ($("cu_position")?.value || $("cu_position_pick")?.value || "").trim() || null;

    if (!username) throw new Error("Username is required.");
    if (!password) throw new Error("Password is required.");
    if (!role) throw new Error("Role is required.");

    await callSuAdmin({
      action: "create_user",
      username,
      password,
      role,
      position,
      company_id: $("cu_company")?.value || null,
      vessel_id: $("cu_vessel")?.value || null,
      force_password_reset: $("cu_force_reset")?.checked === true
    });

    showOkSafe("User created.");
    await refreshUsersSafe();
  }

  function takeOverCreateButton() {
    const btn = $("cu_createBtn");
    if (!btn) return false;

    if (btn.getAttribute("data-u02d-fixed") === "1") return true;

    const clone = btn.cloneNode(true);
    clone.setAttribute("data-u02d-fixed", "1");
    clone.textContent = "Create user";
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener("click", () => {
      const run = isOnboardMode() ? createOnboardPersonnelVerified : createOfficeUserPassthrough;
      run().catch((error) => {
        console.error(error);
        showWarnSafe(String(error?.message || error || "Create user failed."));
      });
    });

    return true;
  }

  async function applyCurrentOnboardSetupToProfile(profileId) {
    const danaosDefault = getFormDanaos() || "";
    const danaos = prompt("DANAOS credential for this profile:", danaosDefault);

    if (danaos === null) return;

    if (!/^[0-9]{3,5}$/.test(danaos.trim())) {
      throw new Error("DANAOS credential must be numerical and 3 to 5 digits.");
    }

    const vid = vesselId();
    const rankId = selectedRankId();

    if (!vid) throw new Error("Select vessel in the Create user form first.");
    if (!rankId) throw new Error("Select onboard rank in the Create user form first.");

    const { error } = await sb().rpc("csvb_configure_onboard_personnel", {
      p_profile_id: profileId,
      p_danaos_credential: danaos.trim(),
      p_rank_id: rankId,
      p_vessel_id: vid,
      p_onboard_status: $("cu_onboard_status")?.value || "onboard",
      p_onboard_access_enabled: $("cu_onboard_access_enabled")?.checked === true,
      p_read_only_after_disembarkation: $("cu_read_only_after_disembarkation")?.checked === true,
      p_embarkation_date: $("cu_embarkation_date")?.value || todayIso(),
      p_disembarkation_date: $("cu_disembarkation_date")?.value || null,
      p_reason: $("cu_onboard_notes")?.value || "Onboard setup applied from Superuser Administration."
    });

    if (error) throw error;

    await verifyOnboardConfigured(profileId, danaos.trim());

    showOkSafe("Onboard setup applied and verified.");
    await refreshUsersSafe();
    window.setTimeout(enhanceRows, 600);
  }

  function enhanceRows() {
    const tbody = $("usersBody");
    if (!tbody) return;

    tbody.querySelectorAll("tr").forEach((tr) => {
      if (tr.getAttribute("data-u02d-row-enhanced") === "1") return;

      const firstButton = tr.querySelector("button[data-id]");
      const profileId = firstButton?.getAttribute("data-id");

      if (!profileId) return;

      const actions = tr.querySelector(".actions");
      if (!actions) return;

      const btn = document.createElement("button");
      btn.className = "btnSmall btn2";
      btn.type = "button";
      btn.textContent = "Apply Onboard Setup";
      btn.addEventListener("click", () => {
        applyCurrentOnboardSetupToProfile(profileId).catch((error) => {
          console.error(error);
          showWarnSafe(String(error?.message || error || "Could not apply onboard setup."));
        });
      });

      actions.appendChild(btn);
      tr.setAttribute("data-u02d-row-enhanced", "1");
    });
  }

  function observeRows() {
    const tbody = $("usersBody");
    if (!tbody) return;

    const observer = new MutationObserver(() => {
      window.setTimeout(enhanceRows, 100);
    });

    observer.observe(tbody, { childList: true, subtree: true });
    enhanceRows();
  }

  function install() {
    if (!takeOverCreateButton()) {
      window.setTimeout(install, 400);
      return;
    }

    observeRows();

    window.CSVB_ONBOARD_PERSONNEL_ADMIN_U02D_FIX_BUILD = BUILD;
  }

  function start() {
    window.setTimeout(install, 1200);
    window.setTimeout(install, 2400);
    window.setTimeout(enhanceRows, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
