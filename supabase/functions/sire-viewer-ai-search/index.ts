// supabase/functions/sire-viewer-ai-search/index.ts
// C.S.V. BEACON — Viewer AI Search
// Server-side OpenAI Responses API integration for SIRE and RISQ source packs.
// The OPENAI_API_KEY must be stored as a Supabase Edge Function secret.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ViewerType = "SIRE" | "RISQ";

type ProfileRow = {
  id: string;
  role: string | null;
  company_id: string | null;
  is_active?: boolean | null;
  is_disabled?: boolean | null;
};

type JsonResponseBody = Record<string, unknown>;

type AiUsageLogParams = {
  supabaseUrl: string;
  serviceRoleKey: string;
  profile?: ProfileRow | null;
  query: string;
  sourcePack: string;
  sourceQuestionCount: number;
  model: string;
  success: boolean;
  errorMessage?: string | null;
  responseChars?: number;
  durationMs?: number;
  usage?: unknown;
  context?: Record<string, unknown>;
};

type AiUsageControls = {
  max_query_chars: number;
  daily_user_limit: number;
  daily_company_limit: number;
  user_count_today: number | null;
  company_count_today: number | null;
  utc_day_start: string;
};

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

function normalizeViewerType(value: unknown): ViewerType {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "RISQ" || raw === "RISQ_3_2" || raw === "RIGHTSHIP") return "RISQ";
  return "SIRE";
}

function getPositiveIntegerSecret(name: string, fallback: number): number {
  const raw = Deno.env.get(name) || "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function utcDayStartIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function compactSourcePack(value: unknown): string {
  const raw = String(value ?? "").trim();
  return raw.length > 42000 ? raw.slice(0, 42000) : raw;
}

function estimateSourceQuestionCount(sourcePack: string): number {
  const headerMatch = sourcePack.match(/Source count:\s*(\d+)/i);
  if (headerMatch?.[1]) return Number(headerMatch[1]) || 0;

  const sourceMatches = sourcePack.match(/^SOURCE\s+\d+:/gim);
  return sourceMatches ? sourceMatches.length : 0;
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

async function logAiUsage(params: AiUsageLogParams): Promise<void> {
  try {
    if (!params.supabaseUrl || !params.serviceRoleKey) return;

    const payload = {
      user_id: params.profile?.id || null,
      company_id: params.profile?.company_id || null,
      user_role: params.profile?.role || null,
      query_text: params.query || "",
      source_question_count: params.sourceQuestionCount || 0,
      source_pack_chars: params.sourcePack?.length || 0,
      model: params.model || null,
      success: !!params.success,
      error_message: params.errorMessage || null,
      response_chars: params.responseChars || 0,
      duration_ms: params.durationMs || null,
      usage: params.usage || null,
      request_context: params.context || {},
    };

    const resp = await fetch(`${params.supabaseUrl}/rest/v1/sire_viewer_ai_usage_log`, {
      method: "POST",
      headers: {
        apikey: params.serviceRoleKey,
        Authorization: `Bearer ${params.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn("Viewer AI usage log insert failed:", resp.status, text);
    }
  } catch (error) {
    console.warn("Viewer AI usage log insert failed:", error);
  }
}

async function countAiUsageRows(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  sinceIso: string;
  userId?: string | null;
  companyId?: string | null;
}): Promise<number | null> {
  try {
    const url = new URL(`${params.supabaseUrl}/rest/v1/sire_viewer_ai_usage_log`);
    url.searchParams.set("select", "id");
    url.searchParams.set("created_at", `gte.${params.sinceIso}`);

    if (params.userId) url.searchParams.set("user_id", `eq.${params.userId}`);
    if (params.companyId) url.searchParams.set("company_id", `eq.${params.companyId}`);

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: params.serviceRoleKey,
        Authorization: `Bearer ${params.serviceRoleKey}`,
        Prefer: "count=exact",
        Range: "0-0",
        "Range-Unit": "items",
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn("Viewer AI usage count failed:", resp.status, text);
      return null;
    }

    const contentRange = resp.headers.get("content-range") || "";
    const totalRaw = contentRange.includes("/") ? contentRange.split("/").pop() : "";
    const total = Number(totalRaw);

    if (Number.isFinite(total)) return total;

    const rows = await resp.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : null;
  } catch (error) {
    console.warn("Viewer AI usage count failed:", error);
    return null;
  }
}

async function assertAiUsageControls(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  profile: ProfileRow;
  query: string;
}): Promise<AiUsageControls> {
  const maxQueryChars = getPositiveIntegerSecret("OPENAI_MAX_QUERY_CHARS", 800);
  const dailyUserLimit = getPositiveIntegerSecret("OPENAI_DAILY_USER_LIMIT", 50);
  const dailyCompanyLimit = getPositiveIntegerSecret("OPENAI_DAILY_COMPANY_LIMIT", 500);
  const sinceIso = utcDayStartIso();

  if (params.query.length > maxQueryChars) {
    throw new Error(`AI query is too long (${params.query.length}/${maxQueryChars} characters).`);
  }

  const userCount = await countAiUsageRows({
    supabaseUrl: params.supabaseUrl,
    serviceRoleKey: params.serviceRoleKey,
    sinceIso,
    userId: params.profile.id,
  });

  if (userCount !== null && userCount >= dailyUserLimit) {
    throw new Error(`Daily AI usage limit reached for this user (${userCount}/${dailyUserLimit}).`);
  }

  let companyCount: number | null = null;

  if (params.profile.company_id) {
    companyCount = await countAiUsageRows({
      supabaseUrl: params.supabaseUrl,
      serviceRoleKey: params.serviceRoleKey,
      sinceIso,
      companyId: params.profile.company_id,
    });

    if (companyCount !== null && companyCount >= dailyCompanyLimit) {
      throw new Error(`Daily AI usage limit reached for this company (${companyCount}/${dailyCompanyLimit}).`);
    }
  }

  return {
    max_query_chars: maxQueryChars,
    daily_user_limit: dailyUserLimit,
    daily_company_limit: dailyCompanyLimit,
    user_count_today: userCount,
    company_count_today: companyCount,
    utc_day_start: sinceIso,
  };
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

function buildInstructions(viewerType: ViewerType): string {
  if (viewerType === "RISQ") {
    return [
      "You are the C.S.V. BEACON RISQ Questions Viewer AI assistant.",
      "Answer only from the provided RightShip RISQ 3.2 source pack.",
      "Do not use outside knowledge. Do not invent RightShip/RISQ requirements, question numbers, guide text, eSMS references, or forms.",
      "If the source pack is insufficient, say exactly what is missing.",
      "Cite every substantive statement with the relevant RISQ question number in square brackets, for example [RISQ 05A.001].",
      "Keep the answer practical for RISQ preparation and dry cargo / bulk carrier vetting.",
      "Use this structure: Answer; Relevant RISQ references; Limitations.",
    ].join("\n");
  }

  return [
    "You are the C.S.V. BEACON SIRE 2.0 Questions Viewer AI assistant.",
    "Answer only from the provided SIRE 2.0 source pack.",
    "Do not use outside knowledge. Do not invent OCIMF/SIRE requirements, question numbers, publications, or industry guidance.",
    "If the source pack is insufficient, say exactly what is missing.",
    "Cite every substantive statement with the relevant SIRE question number in square brackets, for example [Q 09.04.01].",
    "Keep the answer practical for tanker vetting / SIRE preparation.",
    "Use this structure: Answer; Relevant SIRE 2.0 references; Limitations.",
  ].join("\n");
}

async function callOpenAI(params: {
  openaiKey: string;
  model: string;
  query: string;
  sourcePack: string;
  role: string;
  viewerType: ViewerType;
}): Promise<{ answer: string; raw: unknown; model: string }> {
  const instructions = buildInstructions(params.viewerType);

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `Viewer type: ${params.viewerType}`,
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

  const startedAt = Date.now();
  let supabaseUrl = "";
  let serviceRoleKey = "";
  let model = "gpt-4.1";
  let profile: ProfileRow | null = null;
  let query = "";
  let sourcePack = "";
  let sourceQuestionCount = 0;
  let usageControls: AiUsageControls | null = null;
  let viewerType: ViewerType = "SIRE";

  try {
    supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Supabase server configuration is missing." }, 500);
    }

    if (!openaiKey) {
      return jsonResponse({ ok: false, error: "OPENAI_API_KEY secret is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const userId = await getAuthenticatedUserId(supabaseUrl, serviceRoleKey, authHeader);
    profile = await getProfile(supabaseUrl, serviceRoleKey, userId);
    assertAllowedProfile(profile);

    const body = await req.json().catch(() => ({}));
    viewerType = normalizeViewerType(body.viewer_type || body.viewerType || body.source_kind || body.sourceKind);
    query = cleanText(body.query);
    sourcePack = compactSourcePack(body.source_pack);
    sourceQuestionCount = estimateSourceQuestionCount(sourcePack);

    if (!query) {
      throw new Error("Query is required.");
    }

    if (!sourcePack || sourcePack.length < 40) {
      throw new Error("Source pack is required.");
    }

    usageControls = await assertAiUsageControls({
      supabaseUrl,
      serviceRoleKey,
      profile,
      query,
    });

    const result = await callOpenAI({
      openaiKey,
      model,
      query,
      sourcePack,
      role: String(profile.role || ""),
      viewerType,
    });

    const answerText = result.answer || "";

    await logAiUsage({
      supabaseUrl,
      serviceRoleKey,
      profile,
      query,
      sourcePack,
      sourceQuestionCount,
      model: result.model,
      success: true,
      responseChars: answerText.length,
      durationMs: Date.now() - startedAt,
      usage: (result.raw as any)?.usage || null,
      context: {
        endpoint: "sire-viewer-ai-search",
        viewer_type: viewerType,
        usage_controls: usageControls,
      },
    });

    return jsonResponse({
      ok: true,
      answer: answerText,
      model: result.model,
      viewer_type: viewerType,
      source_pack_chars: sourcePack.length,
      source_question_count: sourceQuestionCount,
      usage: (result.raw as any)?.usage || null,
      usage_controls: usageControls,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (query || sourcePack || profile?.id) {
      await logAiUsage({
        supabaseUrl,
        serviceRoleKey,
        profile,
        query: query || "[not parsed]",
        sourcePack,
        sourceQuestionCount,
        model,
        success: false,
        errorMessage: message,
        responseChars: 0,
        durationMs: Date.now() - startedAt,
        usage: null,
        context: {
          endpoint: "sire-viewer-ai-search",
          viewer_type: viewerType,
          failure_stage: "handler_catch",
          usage_controls: usageControls,
        },
      });
    }

    return jsonResponse({
      ok: false,
      error: message,
      viewer_type: viewerType,
    }, 400);
  }
});
