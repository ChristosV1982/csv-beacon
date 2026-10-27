import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createOfficeUserHandler } from "./handler.js";
const url = Deno.env.get("PROJECT_URL");
const key = Deno.env.get("SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("Office creation requires existing project credentials.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
// The caller JWT, never the service-role JWT, authorizes the SQL transaction.
async function rpcAsActor(authorization: string, name: string, args: unknown) {
  const response = await fetch(`${url}/rest/v1/${name}`, {
    method: "POST", headers: { apikey: key!, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error(`Office account transaction returned HTTP ${response.status}.`); }
  }
  if (!response.ok) throw new Error(data?.message || "Office account transaction failed.");
  return data;
}
serve(createOfficeUserHandler({ admin, rpcAsActor }));
