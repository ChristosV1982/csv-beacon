export const config = {
  verify_jwt: false,
};

const FUNCTION_VERSION = "mscat-ai-suggest-v02-shared-learning-20260629";
const MSCAT_SOURCE_REF = "DNV M-SCAT 8.2";


class MinimalPostgrestQuery {
  private baseUrl: string;
  private serviceKey: string;
  private table: string;
  private method = "GET";
  private selectColumns = "";
  private filters: Array<[string, string]> = [];
  private orderParts: string[] = [];
  private limitValue: number | null = null;
  private maybeSingleMode = false;

  constructor(baseUrl: string, serviceKey: string, table: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.serviceKey = serviceKey;
    this.table = table;
  }

  select(columns = "*") {
    this.method = "GET";
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, `eq.${this.formatValue(value)}`]);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push([column, `neq.${this.formatValue(value)}`]);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    const v = value === null ? "null" : this.formatValue(value);
    this.filters.push([column, `not.${operator}.${v}`]);
    return this;
  }

  order(column: string, opts: { ascending?: boolean } = {}) {
    const direction = opts.ascending === false ? "desc" : "asc";
    this.orderParts.push(`${column}.${direction}`);
    return this;
  }

  limit(count: number) {
    this.limitValue = Math.max(0, Math.floor(Number(count || 0)));
    return this;
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private formatValue(value: unknown) {
    if (value === null) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value ?? "");
  }

  private async execute() {
    const url = new URL(`${this.baseUrl}/rest/v1/${encodeURIComponent(this.table)}`);

    if (this.selectColumns) {
      url.searchParams.set("select", this.selectColumns);
    }

    for (const [key, value] of this.filters) {
      url.searchParams.append(key, value);
    }

    if (this.orderParts.length) {
      url.searchParams.set("order", this.orderParts.join(","));
    }

    if (this.limitValue !== null) {
      url.searchParams.set("limit", String(this.limitValue));
    }

    const resp = await fetch(url.toString(), {
      method: this.method,
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
      },
    });

    const text = await resp.text().catch(() => "");

    if (!resp.ok) {
      return {
        data: null,
        error: {
          message: text || `${resp.status} ${resp.statusText}`,
          status: resp.status,
        },
      };
    }

    let data: any = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (this.maybeSingleMode) {
      if (Array.isArray(data)) {
        if (data.length === 0) data = null;
        else if (data.length === 1) data = data[0];
        else {
          return {
            data: null,
            error: {
              message: `Expected single row, got ${data.length}`,
              status: 406,
            },
          };
        }
      }
    }

    return { data, error: null };
  }
}

function createClient(baseUrl: string, serviceKey: string) {
  return {
    from(table: string) {
      return new MinimalPostgrestQuery(baseUrl, serviceKey, table);
    },
  };
}


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
    remarks: normSpaces(item?.remarks || ""),
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

function previewText(value: unknown, max = 320) {
  const s = normSpaces(value);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function tokenizeLearningText(value: unknown) {
  return Array.from(
    new Set(
      normSpaces(String(value || "").toLowerCase())
        .split(/[^a-z0-9]+/g)
        .map((x) => x.trim())
        .filter((x) =>
          x.length >= 4 &&
          ![
            "this","that","with","from","have","were","been","being","into","onto",
            "they","their","there","where","which","when","then","than","such",
            "audit","inspection","observation","observed","vessel","ship","during","found"
          ].includes(x)
        )
    )
  );
}

function learningSelectionCodes(example: any) {
  const rows = Array.isArray(example?.final_manual_selections)
    ? example.final_manual_selections
    : [];

  return rows
    .map((x: any) => String(x?.item_code || x?.item_no || "").trim())
    .filter(Boolean);
}

function learningQuestionNo(example: any) {
  return String(example?.question_no || example?.sire_question_no || example?.question_base || "").trim();
}

function buildLearningPromptRows(examples: any[]) {
  return (examples || [])
    .filter((e: any) => learningSelectionCodes(e).length > 0)
    .slice(0, 6)
    .map((e: any) => ({
      source_module: e.source_module || "",
      source_label: e.source_module === "audit_observation" ? "Audit observation" : "Vetting/Post-Inspection observation",
      similarity_score: e.similarity_score || 0,
      match_summary: e.match_summary || "",
      audit_type_name: e.audit_type_name || "",
      source_type: e.source_type || "",
      source_reference: e.source_reference || "",
      question_no: learningQuestionNo(e),
      obs_type: e.obs_type || "",
      designation: e.designation || "",
      soc: e.soc || "",
      noc: e.noc || "",
      observation_text: previewText(e.observation_text || e.observation_remarks || "", 360),
      reviewed_mscat_item_codes: learningSelectionCodes(e),
      review_comment: previewText(e.review_comment || "", 220),
    }));
}

function scoreLearningExample(example: any, item: any, tokens: string[]) {
  let score = 0;

  const itemQuestion = String(item?.question_no || item?.question_base || "").trim();
  const exampleQuestion = learningQuestionNo(example);

  if (exampleQuestion && itemQuestion && exampleQuestion === itemQuestion) score += 50;
  if (example?.obs_type && item?.obs_type && String(example.obs_type) === String(item.obs_type)) score += 10;
  if (example?.designation && item?.designation && String(example.designation) === String(item.designation)) score += 8;
  if (example?.noc && item?.nature_of_concern && String(example.noc) === String(item.nature_of_concern)) score += 8;
  if (example?.soc && item?.classification_coding && String(example.soc) === String(item.classification_coding)) score += 6;
  if (String(example?.source_module || "") === "post_inspection") score += 4;

  const haystack = normSpaces([
    example?.question_base,
    exampleQuestion,
    example?.designation,
    example?.soc,
    example?.noc,
    example?.observation_text,
    example?.observation_remarks
  ].filter(Boolean).join(" ")).toLowerCase();

  let tokenHits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) tokenHits++;
  }

  score += Math.min(40, tokenHits * 4);

  const parts: string[] = [];
  if (exampleQuestion && itemQuestion && exampleQuestion === itemQuestion) parts.push("same question reference");
  if (example?.obs_type && item?.obs_type && String(example.obs_type) === String(item.obs_type)) parts.push("same observation type");
  if (example?.designation && item?.designation && String(example.designation) === String(item.designation)) parts.push("same designation");
  if (String(example?.source_module || "") === "audit_observation") parts.push("shared audit learning");
  if (String(example?.source_module || "") === "post_inspection") parts.push("shared vetting learning");
  if (tokenHits > 0) parts.push("keyword overlap");

  return {
    ...example,
    similarity_score: score,
    match_summary: parts.join("; "),
  };
}

async function loadLearningExamplesForItem(supabaseAdmin: any, profile: any, item: any, limit = 6) {
  const role = String(profile?.role || "").trim();
  const companyId = String(item?.company_id || profile?.company_id || "").trim();

  let query = supabaseAdmin
    .from("mscat_learning_examples")
    .select("id,source_module,company_id,source_report_id,source_observation_item_id,vessel_id,event_date,source_type,source_reference,audit_type_id,audit_type_name,question_no,question_base,obs_type,designation,soc,noc,observation_text,observation_remarks,review_comment,final_taxonomy_ids,final_manual_selections,reviewed_at")
    .not("final_taxonomy_ids", "is", null)
    .order("reviewed_at", { ascending: false })
    .limit(200);

  if (role !== "super_admin") {
    if (!companyId) return [];
    query = query.eq("company_id", companyId);
  } else if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;

  if (error) throw new Error("Shared learning examples lookup failed: " + (error.message || String(error)));

  const itemText = [
    item?.question_no,
    item?.question_base,
    item?.designation,
    item?.classification_coding,
    item?.nature_of_concern,
    item?.observation_text,
    item?.remarks
  ].filter(Boolean).join(" ");

  const tokens = tokenizeLearningText(itemText);
  const currentItemId = String(item?.id || "");

  return (data || [])
    .filter((e: any) => String(e?.source_observation_item_id || "") !== currentItemId)
    .filter((e: any) => learningSelectionCodes(e).length > 0)
    .map((e: any) => scoreLearningExample(e, item, tokens))
    .filter((e: any) => Number(e.similarity_score || 0) > 0)
    .sort((a: any, b: any) => {
      const scoreDiff = Number(b.similarity_score || 0) - Number(a.similarity_score || 0);
      if (scoreDiff) return scoreDiff;
      return String(b.reviewed_at || "").localeCompare(String(a.reviewed_at || ""));
    })
    .slice(0, Math.max(0, Math.min(Number(limit || 6), 10)));
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
      .select("id,report_id,company_id,obs_type,question_no,question_base,designation,nature_of_concern,classification_coding,observation_text,remarks")
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
    const learningExamples = await loadLearningExamplesForItem(supabaseAdmin, profile, item, 6);

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
            "You are a maritime safety, tanker vetting, audit, SIRE 2.0, and DNV M-SCAT 8.2 cause analysis assistant. " +
            "Suggest M-SCAT causes/actions only from the provided taxonomy. Do not invent item codes. " +
            "Return only high-relevance suggestions. Prefer a balanced set: immediate cause(s), basic cause(s), and control area(s) when supported by the observation. " +
            "When reviewed company examples from Audit or Vetting/Post-Inspection are supplied, treat them as company preference signals. Do not copy them blindly; use them only when factually relevant to the current observation. " +
            "This is advisory only; the human user will confirm before saving.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Suggest M-SCAT item codes for this SIRE 2.0 post-inspection observation.",
            observation,
            reviewed_company_examples: buildLearningPromptRows(learningExamples),
            taxonomy: buildTaxonomyPromptRows(taxonomyRows),
            constraints: [
              "Use exact item_code values only from the supplied taxonomy.",
              "Do not select positive-observation causes.",
              "Do not infer facts not supported by the observation text.",
              "Return 2 to 6 strong suggestions unless fewer are justified.",
              "Keep each reason concise.",
              "If reviewed_company_examples from Audit or Vetting/Post-Inspection are relevant, align with the reviewed company pattern and mention that alignment in the reason.",
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
      shared_learning: true,
      learning_examples_used: learningExamples.length,
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
