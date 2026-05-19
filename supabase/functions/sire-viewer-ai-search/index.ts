// supabase/functions/sire-viewer-ai-search/index.ts
// C.S.V. BEACON — SIRE 2.0 Questions Viewer AI Search
// Server-side OpenAI Responses API integration.
// The OPENAI_API_KEY must be stored as a Supabase Edge Function secret.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProfileRow = {
  id: string;
  role: string | null;
  company_id: string | null;
  is_active?: boolean | null;
  is_disabled?: boolean | null;
};

type JsonResponseBody = Record<string, unknown>;

function jsonResponse(body: JsonResponseBody, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function compactSourcePack(value: unknown): string {
  const raw = String(value ?? "").trim();
  // Keep the source pack bounded. The frontend already limits the number of sources.
  // This protects the function against accidental huge requests.
  return raw.length > 42000 ? raw.slice(0, 42000) : raw;
}

function extractOpenAIText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks: string[] = [];

  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

async function getAuthenticatedUserId(
  supabaseUrl: string,
  serviceRoleKey: string,
  authHeader: string,
): Promise<string> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw new Error("Missing Authorization bearer token.");
  }

  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: authHeader,
    },
  });

  if (!userResp.ok) {
    throw new Error(`Authentication failed (${userResp.status}).`);
  }

  const user = await userResp.json();
  if (!user?.id) {
    throw new Error("Authentication failed: user id was not returned.");
  }

  return user.id;
}

async function getProfile(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
): Promise<ProfileRow> {
  const url = new URL(`${supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set("select", "id,role,company_id,is_active,is_disabled");
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set("limit", "1");

  const profileResp = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
  });

  if (!profileResp.ok) {
    throw new Error(`Could not read user profile (${profileResp.status}).`);
  }

  const rows = await profileResp.json();
  const profile = Array.isArray(rows) ? rows[0] : null;

  if (!profile?.id) {
    throw new Error("User profile was not found.");
  }

  return profile as ProfileRow;
}

function assertAllowedProfile(profile: ProfileRow): void {
  const role = String(profile.role || "");
  const allowedRoles = new Set([
    "super_admin",
    "platform_owner",
    "company_admin",
    "company_superintendent",
  ]);

  if (!allowedRoles.has(role)) {
    throw new Error("AI Search is not enabled for this user role.");
  }

  if (profile.is_active === false || profile.is_disabled === true) {
    throw new Error("User profile is inactive or disabled.");
  }
}

async function callOpenAI(params: {
  openaiKey: string;
  model: string;
  query: string;
  sourcePack: string;
  role: string;
}): Promise<{ answer: string; raw: unknown; model: string }> {
  const instructions = [
    "You are the C.S.V. BEACON SIRE 2.0 Questions Viewer AI assistant.",
    "Answer only from the provided SIRE 2.0 source pack.",
    "Do not use outside knowledge. Do not invent OCIMF/SIRE requirements, question numbers, publications, or industry guidance.",
    "If the source pack is insufficient, say exactly what is missing.",
    "Cite every substantive statement with the relevant SIRE question number in square brackets, for example [Q 09.04.01].",
    "Keep the answer practical for tanker vetting / SIRE preparation.",
    "Use this structure: Answer; Relevant SIRE 2.0 references; Limitations.",
  ].join("\n");

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `User role: ${params.role}`,
            `User query: ${params.query}`,
            "",
            "SOURCE PACK:",
            params.sourcePack,
          ].join("\n"),
        },
      ],
    },
  ];

  const openaiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.openaiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      instructions,
      input,
      temperature: 0.2,
      max_output_tokens: 1200,
      store: false,
    }),
  });

  const raw = await openaiResp.json().catch(() => ({}));

  if (!openaiResp.ok) {
    const msg = raw?.error?.message || `OpenAI request failed (${openaiResp.status}).`;
    throw new Error(msg);
  }

  const answer = extractOpenAIText(raw);

  if (!answer) {
    throw new Error("OpenAI returned no answer text.");
  }

  return {
    answer,
    raw,
    model: raw?.model || params.model,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Supabase server configuration is missing." }, 500);
    }

    if (!openaiKey) {
      return jsonResponse({ ok: false, error: "OPENAI_API_KEY secret is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const userId = await getAuthenticatedUserId(supabaseUrl, serviceRoleKey, authHeader);
    const profile = await getProfile(supabaseUrl, serviceRoleKey, userId);
    assertAllowedProfile(profile);

    const body = await req.json().catch(() => ({}));
    const query = cleanText(body.query);
    const sourcePack = compactSourcePack(body.source_pack);

    if (!query) {
      return jsonResponse({ ok: false, error: "Query is required." }, 400);
    }

    if (!sourcePack || sourcePack.length < 40) {
      return jsonResponse({ ok: false, error: "Source pack is required." }, 400);
    }

    const result = await callOpenAI({
      openaiKey,
      model,
      query,
      sourcePack,
      role: String(profile.role || ""),
    });

    return jsonResponse({
      ok: true,
      answer: result.answer,
      model: result.model,
      source_pack_chars: sourcePack.length,
      usage: (result.raw as any)?.usage || null,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
