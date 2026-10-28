// Additive gate only. Existing identity, tenancy and workflow checks still run.
export async function officeAuthorizationGate(
  req: Request, moduleCode: string, action: string,
): Promise<Response | null> {
  if (req.method === "OPTIONS") return null;
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL") || Deno.env.get("PROJECT_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (!url || !key) return new Response(JSON.stringify({
    error: "Office authorization configuration unavailable",
  }), { status: 503, headers });
  try {
    const response = await fetch(`${url}/rest/v1/rpc/csvb_office_authorize_module`, {
      method: "POST",
      headers: { authorization, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_module: moduleCode, p_action: action }),
    });
    if (!response.ok || await response.json() !== true)
      return new Response(JSON.stringify({
        error: "Office Access Profile denies this module/action",
        module: moduleCode, action,
      }), { status: response.status === 401 ? 401 : 403, headers });
    return null;
  } catch {
    return new Response(JSON.stringify({ error: "Office authorization check unavailable" }),
      { status: 503, headers });
  }
}
