// Additive companion to su-admin: same project secrets, JWT/profile checks and CORS.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createDeleteUserHandler } from "./handler.js";
function mustEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge secret: ${name}`);
  return value;
}
const secret = mustEnv("SERVICE_ROLE_KEY");
const sbAdmin = createClient(mustEnv("PROJECT_URL"), secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
serve(createDeleteUserHandler({ sbAdmin, signingSecret: secret }));
