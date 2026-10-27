const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = value => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function createOfficeUserHandler({ admin, rpcAsActor }) {
  return async req => {
    if (req.method === "OPTIONS") return reply({ ok: true });
    if (req.method !== "POST") return reply({ error: "Use POST" }, 405);
    let request, authId = null, profileReady = false, prepared = false;
    const authorization = req.headers.get("authorization") || "";
    try {
      if (!/^bearer\s+\S+$/i.test(authorization)) return reply({ error: "Missing bearer token" }, 401);
      const { data: identity, error: authError } = await admin.auth.getUser(authorization.replace(/^bearer\s+/i, ""));
      if (authError || !identity?.user) return reply({ error: "Invalid JWT" }, 401);
      const { data: caller, error: callerError } = await admin.from("profiles")
        .select("id,role,is_active,is_disabled").eq("id", identity.user.id).single();
      if (callerError || caller?.role !== "super_admin" || caller.is_active !== true || caller.is_disabled)
        return reply({ error: "Active Super Admin access required" }, 403);
      try { request = await req.json(); } catch { return reply({ error: "Invalid request" }, 400); }
      const allowed = new Set(["action", "request_id", "username", "password", "company_id",
        "office_role_code", "access_profile_code", "first_name", "last_name", "position", "force_password_reset"]);
      if (!request || Array.isArray(request) || Object.keys(request).some(k => !allowed.has(k)) ||
        request.action !== "create_office_user") return reply({ error: "Invalid Office creation contract" }, 400);
      if (!uuid(request.request_id) || !uuid(request.company_id) ||
        typeof request.username !== "string" || typeof request.password !== "string" ||
        !request.password.length || request.password.length > 1024 ||
        typeof request.office_role_code !== "string" ||
        (request.access_profile_code != null && typeof request.access_profile_code !== "string") ||
        ["first_name", "last_name", "position"].some(k => request[k] != null &&
          (typeof request[k] !== "string" || request[k].length > 1000)) ||
        (request.force_password_reset != null && typeof request.force_password_reset !== "boolean"))
        return reply({ error: "Check username, company, Office Role and initial password." }, 400);
      const rpc = (name, args) => rpcAsActor(authorization, `rpc/${name}`, args);
      let state = await rpc("csvb_admin_office_creation_prepare", {
        p_request_id: request.request_id, p_username: request.username, p_company_id: request.company_id,
        p_office_role_code: request.office_role_code, p_access_profile_code: request.access_profile_code || null,
        p_first_name: request.first_name || null, p_last_name: request.last_name || null,
        p_position: request.position || null, p_force_reset: request.force_password_reset === true
      });
      prepared = true;
      authId = state.auth_user_id || null;
      if (state.status !== "completed") {
        profileReady = state.status === "profile_ready";
        if (!profileReady) {
          authId ||= await rpc("csvb_admin_office_creation_identity", { p_request_id: request.request_id });
          if (!authId) {
            const created = await admin.auth.admin.createUser({
              email: `${state.username.toLowerCase()}@csvtest.local`,
              password: request.password, email_confirm: true,
              ban_duration: "876000h",
              app_metadata: { csvb_office_creation_request: request.request_id,
                csvb_office_creation_actor: identity.user.id }
            });
            authId = created.data?.user?.id || null;
            if (created.error || !authId) {
              authId = await rpc("csvb_admin_office_creation_identity", { p_request_id: request.request_id });
              if (!authId) throw new Error(created.error?.message || "Auth account creation failed.");
            }
          }
          state = await rpc("csvb_admin_office_creation_finalize", {
            p_request_id: request.request_id, p_auth_user_id: authId
          });
          profileReady = true;
        }
        if (!state.requires_enforcement) {
          const unlocked = await admin.auth.admin.updateUserById(authId, { ban_duration: "none" });
          if (unlocked.error) throw new Error("Profile prepared, but Auth activation failed. Administrator review is required.");
        }
        state = await rpc("csvb_admin_office_creation_complete", { p_request_id: request.request_id });
      }
      return reply({ ok: true, user_id: state.auth_user_id, username: state.username,
        inactive_pending_enforcement: state.requires_enforcement,
        message: state.requires_enforcement
          ? "Office user created inactive. View-only Access Profile enforcement is pending; login remains locked."
          : "Office user created with the selected prepared role/profile and its compatible legacy access baseline." });
    } catch (error) {
      let cleaned = false, cleanupRequired = profileReady;
      if (authId && !profileReady) {
        try {
          const deleted = await admin.auth.admin.deleteUser(authId);
          cleaned = !deleted.error;
          cleanupRequired = !cleaned;
        } catch { cleanupRequired = true; }
      } else if (authId && profileReady) {
        // Never leave a failed completion unlocked or delete audited profiles.
        try { await admin.auth.admin.updateUserById(authId, { ban_duration: "876000h" }); } catch { /* profile remains disabled */ }
      }
      if (prepared) {
        try {
          await rpcAsActor(authorization, "rpc/csvb_admin_office_creation_failed", {
            p_request_id: request.request_id, p_auth_user_id: authId, p_cleanup_confirmed: cleaned
          });
        } catch { cleanupRequired = true; }
      }
      // No request logging or password echo, including provider exceptions.
      const message = error?.message || "Office user creation failed.";
      return reply({ error: message.includes(request?.password) && request?.password
          ? "Office user creation failed." : message,
        request_id: prepared ? request.request_id : undefined,
        cleanup_required: cleanupRequired }, 400);
    }
  };
}
