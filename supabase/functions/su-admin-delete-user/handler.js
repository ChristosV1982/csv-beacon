const VERSION = "CSVB_SU_DELETE_USER_20261028_2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function decode(text) {
  return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
}
export function createDeleteUserHandler({ sbAdmin, signingSecret, now = () => Date.now() }) {
  let key;
  const signingKey = () => key ||= crypto.subtle.importKey(
    "raw", encoder.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
  async function signJob(actor, jobId) {
    const payload = encode(encoder.encode(JSON.stringify({
      actor, job_id: jobId, expires: now() + 10 * 60 * 1000, purpose: VERSION,
    })));
    return `${payload}.${encode(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload))))}`;
  }
  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);
    try {
      // Identical authority to existing su-admin, not browser simulation/context.
      const auth = req.headers.get("authorization") || "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
      if (!token) return json({ error: "Missing bearer token" }, 401);
      const { data, error } = await sbAdmin.auth.getUser(token);
      if (error || !data?.user) return json({ error: "Invalid JWT" }, 401);
      const actor = data.user.id;
      const { data: caller, error: callerError } = await sbAdmin.from("profiles")
        .select("id,role,is_active,is_disabled").eq("id", actor).single();
      if (callerError || !caller || caller.is_active === false || caller.is_disabled === true ||
          caller.role !== "super_admin") return json({ error: "Active Super Admin access required" }, 403);

      let body;
      try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
      if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "Invalid request" }, 400);
      const contracts = {
        prepare_user_deletion: ["action", "user_id"],
        prepare_user_deletions: ["action", "user_ids"],
        confirm_user_deletions: ["action", "job_id", "confirmation_token"],
        get_user_deletion_job: ["action", "job_id"],
        delete_user: ["action", "job_id", "user_id"],
      };
      const allowed = contracts[body.action];
      if (!allowed || Object.keys(body).some(k => !allowed.includes(k))) {
        return json({ error: "Invalid deletion request. Reload the Users workspace." }, 400);
      }
      const rpcFailure = error => json({ error: error.message }, error.code === "42501" ? 403 : 409);
      if (body.action.startsWith("prepare_")) {
        const bulk = body.action === "prepare_user_deletions";
        const ids = bulk ? body.user_ids : [body.user_id];
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
            ids.some(id => typeof id !== "string" || !uuid.test(id)) ||
            new Set(ids.map(id => id.toLowerCase())).size !== ids.length) {
          return json({ error: "Select 1-100 distinct accounts explicitly." }, 400);
        }
        if (ids.some(id => id.toLowerCase() === actor.toLowerCase())) {
          return json({ error: "You cannot delete your signed-in Super Admin account." }, 409);
        }
        // Transaction re-fetches every selected profile, validates role/company/
        // vessel identity, and rolls back the whole selection if any is invalid.
        const { data: job, error } = await sbAdmin.rpc("csvb_su_cleanup_prepare", {
          p_user_ids: ids, p_actor_id: actor, p_mode: bulk ? "vessel_cleanup" : "individual",
        });
        if (error) return rpcFailure(error);
        const users = job.items.map(item => item.identity);
        return json({ ok: true, version: VERSION, job_id: job.id, users,
          user: users.length === 1 ? users[0] : undefined, confirmation_token: await signJob(actor, job.id) });
      }
      if (typeof body.job_id !== "string" || !uuid.test(body.job_id)) {
        return json({ error: "Select a valid cleanup job." }, 400);
      }
      if (body.action === "get_user_deletion_job") {
        const { data: job, error } = await sbAdmin.rpc("csvb_su_cleanup_job", { p_job_id: body.job_id, p_actor_id: actor });
        if (error) return rpcFailure(error);
        return json({ ok: true, version: VERSION, job,
          confirmation_token: !job.confirmed_at ? await signJob(actor, job.id) : undefined });
      }
      if (body.action === "confirm_user_deletions") {
        let confirmation;
        try {
          if (typeof body.confirmation_token !== "string" || body.confirmation_token.length > 8192) throw Error();
          const parts = body.confirmation_token.split(".");
          if (parts.length !== 2 || !await crypto.subtle.verify("HMAC", await signingKey(), decode(parts[1]), encoder.encode(parts[0]))) throw Error();
          confirmation = JSON.parse(new TextDecoder().decode(decode(parts[0])));
        } catch { return json({ error: "Invalid selected-user confirmation. Review the selection again." }, 403); }
        if (confirmation.actor !== actor || confirmation.purpose !== VERSION || confirmation.expires <= now() ||
            confirmation.job_id !== body.job_id) {
          return json({ error: "Selection confirmation changed or expired. Review it again." }, 409);
        }
        const { error } = await sbAdmin.rpc("csvb_su_cleanup_confirm", { p_job_id: body.job_id, p_actor_id: actor });
        return error ? rpcFailure(error) : json({ ok: true, version: VERSION });
      }
      if (typeof body.user_id !== "string" || !uuid.test(body.user_id) || body.user_id.toLowerCase() === actor.toLowerCase()) {
        return json({ error: "Invalid selected user; self-deletion is forbidden." }, 409);
      }
      const args = { p_job_id: body.job_id, p_user_id: body.user_id, p_actor_id: actor };
      const { data: claim, error: claimError } = await sbAdmin.rpc("csvb_su_cleanup_claim", args);
      async function failed(error, lease = null) {
        const message = error?.message || String(error);
        await sbAdmin.rpc("csvb_su_cleanup_failed", { ...args, p_lease_token: lease, p_error: message });
        return json({ ok: true, user_id: body.user_id, status: "failed", error: message });
      }
      if (claimError) {
        if (claimError.code === "42501") return rpcFailure(claimError);
        return await failed(claimError);
      }
      if (claim.state === "completed" || claim.state === "busy") {
        return json({ ok: true, user_id: body.user_id, username: claim.identity.username,
          status: claim.state === "completed" ? "already_deleted" : "busy" });
      }
      let deletionError;
      if (claim.state !== "auth_missing") {
        try {
          const result = await sbAdmin.auth.admin.deleteUser(body.user_id, false);
          deletionError = result.error;
        } catch (error) { deletionError = error; }
      }
      // Authoritative DB check handles an ambiguous Admin-API/network response.
      // If Auth already disappeared, retry only cache/final-status cleanup.
      const { error: finishError } = await sbAdmin.rpc("csvb_su_cleanup_finish", { ...args, p_lease_token: claim.lease_token });
      if (finishError) return await failed(deletionError || finishError, claim.lease_token);
      return json({ ok: true, version: VERSION, user_id: body.user_id, deleted_user_id: body.user_id,
        username: claim.identity.username, status: "completed" });
    } catch {
      return json({ error: "User deletion could not be completed. Reload the user list before trying again." }, 500);
    }
  };
}
