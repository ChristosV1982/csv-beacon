const VERSION = "CSVB_SU_DELETE_USER_20261027_1";
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
function identity(profile) {
  return { id: profile.id, username: profile.username, role: profile.role,
    vessel_id: profile.vessel_id ?? null, updated_at: profile.updated_at ?? null };
}

export function createDeleteUserHandler({ sbAdmin, signingSecret, now = () => Date.now() }) {
  let key;
  const signingKey = () => key ||= crypto.subtle.importKey(
    "raw", encoder.encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
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
      const preparing = body.action === "prepare_user_deletion";
      if (!preparing && body.action !== "delete_user") return json({ error: "Unsupported action" }, 400);
      const allowed = preparing ? ["action", "user_id"] : ["action", "user_id", "confirmation_token", "confirm_username"];
      if (Object.keys(body).some(k => !allowed.includes(k)) ||
          typeof body.user_id !== "string" || !uuid.test(body.user_id)) {
        return json({ error: "Select exactly one user. Bulk or additional targets are not accepted." }, 400);
      }
      if (body.user_id.toLowerCase() === actor.toLowerCase()) {
        return json({ error: "You cannot delete your own signed-in Super Admin account." }, 409);
      }
      const { data: target, error: targetError } = await sbAdmin.from("profiles")
        .select("id,username,role,vessel_id,updated_at").eq("id", body.user_id).single();
      if (targetError || !target) return json({ error: "Selected user no longer exists. Reload the user list." }, 404);
      if (!target.username) return json({ error: "Selected user has no username; deletion needs administrative review." }, 409);
      if (preparing) {
        let vesselName = null;
        if (target.vessel_id) {
          const { data: vessel, error: vesselError } = await sbAdmin.from("vessels")
            .select("id,name").eq("id", target.vessel_id).single();
          if (vesselError || !vessel) return json({ error: "Cannot verify the user's linked vessel. No deletion is allowed." }, 409);
          vesselName = vessel.name;
        }
        const payload = encode(encoder.encode(JSON.stringify({
          actor, target: identity(target), expires: now() + 5 * 60 * 1000, purpose: VERSION,
        })));
        const signature = encode(new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload))));
        return json({ ok: true, version: VERSION, user: { ...identity(target), vessel_name: vesselName },
          confirmation_token: `${payload}.${signature}` });
      }
      let confirmation;
      try {
        if (typeof body.confirmation_token !== "string" || body.confirmation_token.length > 8192) throw Error();
        const parts = body.confirmation_token.split(".");
        if (parts.length !== 2 || !await crypto.subtle.verify("HMAC", await signingKey(), decode(parts[1]), encoder.encode(parts[0]))) throw Error();
        confirmation = JSON.parse(new TextDecoder().decode(decode(parts[0])));
      } catch { return json({ error: "Missing or invalid selected-user confirmation. Select the user again." }, 403); }
      if (confirmation.actor !== actor || confirmation.purpose !== VERSION || confirmation.expires <= now() ||
          JSON.stringify(confirmation.target) !== JSON.stringify(identity(target)) ||
          body.confirm_username !== target.username) {
        return json({ error: "The selection/confirmation changed or expired. No account was deleted. Select the user again." }, 409);
      }
      // Read-only preflight plus database DELETE triggers prevent cascading into
      // audit/business records, including vessels, even if references change later.
      const { error: dependencyError } = await sbAdmin.rpc("csvb_assert_user_deletion_safe", { p_user_id: target.id });
      if (dependencyError) return json({ error: dependencyError.message }, 409);
      const { error: deleteError } = await sbAdmin.auth.admin.deleteUser(target.id, false);
      if (deleteError) return json({ error: `Account deletion was blocked: ${deleteError.message}` }, 409);
      return json({ ok: true, version: VERSION, deleted_user_id: target.id,
        message: "Selected user account deleted. Vessel records were not changed." });
    } catch {
      return json({ error: "User deletion could not be completed. Reload the user list before trying again." }, 500);
    }
  };
}
