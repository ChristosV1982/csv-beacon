export const config = {
  verify_jwt: false,
};

const FUNCTION_VERSION = "mscat-ai-suggest-v01-20260617";
const MSCAT_SOURCE_REF = "DNV M-SCAT 8.2";

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "*";
  const allowed =
    origin.includes(".replit.app") ||
    origin.includes(".replit.dev") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1");

  return {
    "Access-Control-Allow-Origin": allowed ? origin : "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function noContent(req: Request, status = 204) {
  return new Response(null, {
    status,
    headers: buildCorsHeaders(req),
  });
}

function normSpaces(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function getUserFromJwt(supabaseUrl: string, serviceRoleKey: string, jwt: string) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Unauthorized: auth user fetch failed (${r.status}) ${t}`);
  }

  return await r.json();
}

async function getProfile(supabaseAdmin: any, uid: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,role,company_id")
    .eq("id", uid)
    .maybeSingle();

  if (error) throw new Error("Profile lookup failed: " + (error.message || String(error)));
  if (!data) throw new Error("Forbidden: user profile not found");

  return data;
}

function canAccessObservation(profile: any, item: any) {
  const role = String(profile?.role || "").trim();
  if (role === "super_admin") return true;

  const profileCompany = String(profile?.company_id || "").trim();
  const itemCompany = String(item?.company_id || "").trim();

  if (profileCompany && itemCompany && profileCompany === itemCompany) return true;

  return false;
}

function itemNeedsMscat(item: any) {
  const k = String(item?.obs_type || item?.kind || "").trim().toLowerCase();
  return k === "negative" || k === "largely";
}

function getOpenAiKey() {
  return Deno.env.get("OPENAI_API_KEY_2") || Deno.env.get("OPENAI_API_KEY") || "";
}

function getOpenAiModel() {
  return Deno.env.get("OPENAI_MSCAT_MODEL") || "gpt-4o-mini";
}

function buildObservationContext(item: any) {
  return {
    observation_item_id: item?.id || "",
    report_id: item?.report_id || "",
    question_no: item?.question_no || "",
    question_base: item?.question_base || "",
    obs_type: item?.obs_type || "",
    designation: item?.designation || "",
    nature_of_concern: item?.nature_of_concern || "",
    classification_coding: item?.classification_coding || "",
    observation_text: normSpaces(item?.observation_text || ""),
  };
}

function buildTaxonomyPromptRows(rows: any[]) {
  return rows.map((r) => ({
    item_code: r.item_code,
    section_label: r.section_label,
    subsection_label: r.subsection_label,
    item_no: r.item_no,
    item_label: r.item_label,
  }));
}

function extractOpenAiText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of data?.output || []) {
    if (Array.isArray(item?.content)) {
      for (const c of item.content) {
        if (typeof c?.text === "string") chunks.push(c.text);
        if (typeof c?.output_text === "string") chunks.push(c.output_text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON.");
  }
}

function normalizeSuggestion(raw: any) {
  return {
    item_code: String(raw?.item_code || "").trim(),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence || 0))),
    reason: normSpaces(raw?.reason || ""),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return noContent(req, 204);

  try {
    if (req.method !== "POST") {
      return json(req, { ok: false, error: "Use POST" }, 405);
    }

    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) {
      return json(req, { ok: false, error: "Missing Authorization Bearer token" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")?.default;

    const OPENAI_API_KEY = getOpenAiKey();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(req, {
        ok: false,
        error: "Missing function secrets: SUPABASE_URL / service role key",
      }, 500);
    }

    if (!OPENAI_API_KEY) {
      return json(req, {
        ok: false,
        error: "Missing OpenAI secret. Expected OPENAI_API_KEY_2 or OPENAI_API_KEY.",
      }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const user = await getUserFromJwt(SUPABASE_URL, SERVICE_ROLE_KEY, jwt);
    const uid = user?.id;
    if (!uid) throw new Error("Unauthorized");

    const profile = await getProfile(supabaseAdmin, uid);

    const payload = await req.json();
    const report_id = String(payload?.report_id || "").trim();
    const observation_item_id = String(payload?.observation_item_id || "").trim();

    if (!report_id) return json(req, { ok: false, error: "report_id is required" }, 400);
    if (!observation_item_id) {
      return json(req, { ok: false, error: "observation_item_id is required" }, 400);
    }

    const { data: item, error: itemErr } = await supabaseAdmin
      .from("post_inspection_observation_items")
      .select("id,report_id,company_id,obs_type,question_no,question_base,designation,nature_of_concern,classification_coding,observation_text")
      .eq("id", observation_item_id)
      .eq("report_id", report_id)
      .maybeSingle();

    if (itemErr) throw new Error("Observation lookup failed: " + (itemErr.message || String(itemErr)));
    if (!item) return json(req, { ok: false, error: "Observation item not found" }, 404);

    if (!canAccessObservation(profile, item)) {
      return json(req, { ok: false, error: "Forbidden" }, 403);
    }

    if (!itemNeedsMscat(item)) {
      return json(req, {
        ok: false,
        error: "M-SCAT AI suggestion is available for Negative and Largely as Expected observations only.",
      }, 400);
    }

    const { data: taxonomy, error: taxErr } = await supabaseAdmin
      .from("post_inspection_mscat_taxonomy")
      .select("id,section_key,section_label,subsection_key,subsection_label,item_code,item_no,item_label,sort_order")
      .eq("source_ref", MSCAT_SOURCE_REF)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (taxErr) throw new Error("M-SCAT taxonomy lookup failed: " + (taxErr.message || String(taxErr)));

    const taxonomyRows = Array.isArray(taxonomy) ? taxonomy : [];
    if (!taxonomyRows.length) {
      return json(req, { ok: false, error: "No active M-SCAT taxonomy rows found." }, 500);
    }

    const codeMap = new Map(taxonomyRows.map((r: any) => [String(r.item_code), r]));
    const observation = buildObservationContext(item);

    const responseSchema = {
      type: "object",
      additionalProperties: false,
      required: ["overall_note", "suggestions"],
      properties: {
        overall_note: {
          type: "string",
          description: "One short note explaining the overall reasoning.",
        },
        suggestions: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["item_code", "confidence", "reason"],
            properties: {
              item_code: {
                type: "string",
                description: "Exact M-SCAT item_code from the provided taxonomy only.",
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1,
              },
              reason: {
                type: "string",
                description: "Short operational reason why this M-SCAT item fits the observation.",
              },
            },
          },
        },
      },
    };

    const aiPayload = {
      model: getOpenAiModel(),
      store: false,
      max_output_tokens: 1200,
      temperature: 0.1,
      text: {
        format: {
          type: "json_schema",
          name: "mscat_ai_suggestions",
          strict: true,
          schema: responseSchema,
        },
      },
      input: [
        {
          role: "system",
          content:
            "You are a maritime safety, tanker vetting, and DNV M-SCAT 8.2 cause analysis assistant. " +
            "Suggest M-SCAT causes/actions only from the provided taxonomy. Do not invent item codes. " +
            "Return only high-relevance suggestions. Prefer a balanced set: immediate cause(s), basic cause(s), and control area(s) when supported by the observation. " +
            "This is advisory only; the human user will confirm before saving.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Suggest M-SCAT item codes for this SIRE 2.0 post-inspection observation.",
            observation,
            taxonomy: buildTaxonomyPromptRows(taxonomyRows),
            constraints: [
              "Use exact item_code values only from the supplied taxonomy.",
              "Do not select positive-observation causes.",
              "Do not infer facts not supported by the observation text.",
              "Return 2 to 6 strong suggestions unless fewer are justified.",
              "Keep each reason concise.",
            ],
          }),
        },
      ],
    };

    const openAiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiPayload),
    });

    const openAiData = await openAiResp.json().catch(() => null);

    if (!openAiResp.ok) {
      return json(req, {
        ok: false,
        error: "OpenAI request failed",
        status: openAiResp.status,
        details: openAiData,
        function_version: FUNCTION_VERSION,
      }, 502);
    }

    const outputText = extractOpenAiText(openAiData);
    const parsed = safeParseJson(outputText);

    const ignored_item_codes: string[] = [];
    const seen = new Set<string>();

    const suggestions = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : [])
      .map(normalizeSuggestion)
      .filter((s: any) => {
        if (!s.item_code || seen.has(s.item_code)) return false;
        seen.add(s.item_code);
        if (!codeMap.has(s.item_code)) {
          ignored_item_codes.push(s.item_code);
          return false;
        }
        return true;
      })
      .slice(0, 8)
      .map((s: any) => {
        const row: any = codeMap.get(s.item_code);
        return {
          taxonomy_id: row.id,
          item_code: row.item_code,
          section_key: row.section_key,
          section_label: row.section_label,
          subsection_key: row.subsection_key,
          subsection_label: row.subsection_label,
          item_no: row.item_no,
          item_label: row.item_label,
          confidence: s.confidence,
          reason: s.reason,
        };
      });

    return json(req, {
      ok: true,
      function_version: FUNCTION_VERSION,
      model: getOpenAiModel(),
      secret_name_used: Deno.env.get("OPENAI_API_KEY_2") ? "OPENAI_API_KEY_2" : "OPENAI_API_KEY",
      observation_item_id,
      report_id,
      overall_note: normSpaces(parsed?.overall_note || ""),
      suggestions,
      ignored_item_codes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith("Unauthorized") ? 401 : msg === "Forbidden" ? 403 : 500;

    return json(req, {
      ok: false,
      error: msg,
      function_version: FUNCTION_VERSION,
    }, status);
  }
});
