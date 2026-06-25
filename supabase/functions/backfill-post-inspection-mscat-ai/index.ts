export const config = {
  verify_jwt: false,
};

const FUNCTION_VERSION = "mscat-ai-backfill-v03_chunked_existing_lookup_20260617";
const MSCAT_SOURCE_REF = "DNV M-SCAT 8.2";
const MAX_BATCH_ITEMS = 10;
const DEFAULT_BATCH_ITEMS = 5;
const MAX_CONCURRENCY = 3;

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

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function previewText(value: unknown, max = 260) {
  const s = normSpaces(value);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
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

function requireBackfillRole(profile: any) {
  const role = String(profile?.role || "").trim();

  if (
    role !== "super_admin" &&
    role !== "company_admin" &&
    role !== "company_superintendent"
  ) {
    throw new Error("Forbidden");
  }

  return role;
}

function canAccessCompany(profile: any, companyId: unknown) {
  const role = String(profile?.role || "").trim();
  if (role === "super_admin") return true;

  const profileCompany = String(profile?.company_id || "").trim();
  const itemCompany = String(companyId || "").trim();

  return Boolean(profileCompany && itemCompany && profileCompany === itemCompany);
}

function itemNeedsMscat(item: any) {
  const k = String(item?.obs_type || "").trim().toLowerCase();
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

async function suggestForItem(openAiKey: string, model: string, item: any, taxonomyRows: any[], codeMap: Map<string, any>) {
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
    model,
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
          "This is advisory only; final selections are saved as AI-suggested and remain reviewable by the user.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Suggest M-SCAT item codes for this SIRE 2.0 post-inspection observation.",
          observation: buildObservationContext(item),
          taxonomy: buildTaxonomyPromptRows(taxonomyRows),
          constraints: [
            "Use exact item_code values only from the supplied taxonomy.",
            "Do not infer facts not supported by the observation text.",
            "Return 2 to 6 strong suggestions unless fewer are justified.",
            "Never return more than 8 suggestions.",
            "Keep each reason concise.",
          ],
        }),
      },
    ],
  };

  const openAiResp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(aiPayload),
  });

  const openAiData = await openAiResp.json().catch(() => null);

  if (!openAiResp.ok) {
    throw new Error(`OpenAI request failed (${openAiResp.status}): ${JSON.stringify(openAiData)}`);
  }

  const parsed = safeParseJson(extractOpenAiText(openAiData));
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

  return {
    overall_note: normSpaces(parsed?.overall_note || ""),
    suggestions,
    ignored_item_codes,
  };
}

async function collectPendingItems(supabaseAdmin: any, profile: any, scope: string, reportId: string, skipExisting: boolean) {
  const pageSize = 200;
  let from = 0;

  const selectedPending: any[] = [];
  const allPendingSample: any[] = [];
  let scanned_items = 0;
  let applicable_items = 0;
  let skipped_not_applicable = 0;
  let skipped_no_access = 0;
  let skipped_existing = 0;
  let pending_items = 0;

  while (true) {
    let query = supabaseAdmin
      .from("post_inspection_observation_items")
      .select("id,report_id,company_id,obs_type,question_no,question_base,designation,nature_of_concern,classification_coding,observation_text")
      .order("report_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (scope === "current_report") {
      query = query.eq("report_id", reportId);
    }

    const { data, error } = await query;
    if (error) throw new Error("Observation scan failed: " + (error.message || String(error)));

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;

    scanned_items += rows.length;

    const accessibleApplicable = [];
    for (const row of rows) {
      if (!itemNeedsMscat(row)) {
        skipped_not_applicable++;
        continue;
      }

      applicable_items++;

      if (!canAccessCompany(profile, row.company_id)) {
        skipped_no_access++;
        continue;
      }

      accessibleApplicable.push(row);
    }

    const ids = accessibleApplicable.map((x) => x.id).filter(Boolean);
    const existingIds = new Set<string>();

    if (ids.length) {
      const existingLookupChunkSize = 25;

      for (let i = 0; i < ids.length; i += existingLookupChunkSize) {
        const idChunk = ids.slice(i, i + existingLookupChunkSize);

        const { data: existing, error: existingErr } = await supabaseAdmin
          .from("post_inspection_observation_mscat")
          .select("observation_item_id")
          .in("observation_item_id", idChunk);

        if (existingErr) throw new Error("Existing M-SCAT lookup failed: " + (existingErr.message || String(existingErr)));

        for (const row of existing || []) {
          existingIds.add(String(row.observation_item_id));
        }
      }
    }

    for (const item of accessibleApplicable) {
      if (skipExisting && existingIds.has(String(item.id))) {
        skipped_existing++;
        continue;
      }

      pending_items++;

      const sample = {
        id: item.id,
        report_id: item.report_id,
        question_base: item.question_base,
        obs_type: item.obs_type,
        designation: item.designation,
        text_preview: previewText(item.observation_text, 220),
      };

      if (allPendingSample.length < 20) allPendingSample.push(sample);
      selectedPending.push(item);
    }

    from += pageSize;
    if (rows.length < pageSize) break;
  }

  return {
    counts: {
      scanned_items,
      applicable_items,
      skipped_not_applicable,
      skipped_no_access,
      skipped_existing,
      pending_items,
    },
    selectedPending,
    allPendingSample,
  };
}

async function runWithConcurrency(items: any[], limit: number, worker: (item: any, index: number) => Promise<any>) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = await worker(items[index], index);
      } catch (e) {
        results[index] = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          item: items[index],
        };
      }
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);

  return results;
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

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const user = await getUserFromJwt(SUPABASE_URL, SERVICE_ROLE_KEY, jwt);
    const uid = user?.id;
    if (!uid) throw new Error("Unauthorized");

    const profile = await getProfile(supabaseAdmin, uid);
    const role = requireBackfillRole(profile);

    const payload = await req.json().catch(() => ({}));
    const scope = String(payload?.scope || "current_report").trim();
    const report_id = String(payload?.report_id || "").trim();
    const dry_run = payload?.dry_run !== false;
    const skip_existing = payload?.skip_existing !== false;
    const max_items = clampInt(payload?.max_items, DEFAULT_BATCH_ITEMS, 1, MAX_BATCH_ITEMS);
    const concurrency = clampInt(payload?.concurrency, 2, 1, MAX_CONCURRENCY);

    if (scope !== "current_report" && scope !== "all_reports") {
      return json(req, { ok: false, error: "scope must be current_report or all_reports" }, 400);
    }

    if (scope === "current_report" && !report_id) {
      return json(req, { ok: false, error: "report_id is required when scope is current_report" }, 400);
    }

    if (scope === "all_reports" && dry_run === false && payload?.confirm_all_reports !== true) {
      return json(req, {
        ok: false,
        error: "confirm_all_reports=true is required when applying AI backfill to all reports.",
      }, 400);
    }

    if (!dry_run && !OPENAI_API_KEY) {
      return json(req, {
        ok: false,
        error: "Missing OpenAI secret. Expected OPENAI_API_KEY_2 or OPENAI_API_KEY.",
      }, 500);
    }

    const pending = await collectPendingItems(supabaseAdmin, profile, scope, report_id, skip_existing);
    const selected = pending.selectedPending.slice(0, max_items);

    if (dry_run) {
      return json(req, {
        ok: true,
        function_version: FUNCTION_VERSION,
        mode: "dry_run",
        role,
        scope,
        report_id: report_id || null,
        skip_existing,
        max_items,
        counts: {
          ...pending.counts,
          selected_for_processing: selected.length,
          remaining_pending_after_batch: Math.max(0, pending.counts.pending_items - selected.length),
        },
        selected_items_sample: selected.map((item) => ({
          id: item.id,
          report_id: item.report_id,
          question_base: item.question_base,
          obs_type: item.obs_type,
          designation: item.designation,
          text_preview: previewText(item.observation_text, 260),
        })),
        pending_sample: pending.allPendingSample,
      });
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

    const processed = await runWithConcurrency(selected, concurrency, async (item) => {
      const ai = await suggestForItem(OPENAI_API_KEY, getOpenAiModel(), item, taxonomyRows, codeMap);

      if (!ai.suggestions.length) {
        return {
          ok: true,
          item_id: item.id,
          report_id: item.report_id,
          question_base: item.question_base,
          inserted_rows: 0,
          suggestions: [],
          overall_note: ai.overall_note,
          ignored_item_codes: ai.ignored_item_codes,
        };
      }

      const rows: any[] = [];
      const rowTaxonomyIds = new Set<string>();

      for (const s of ai.suggestions) {
        const taxonomyId = String(s.taxonomy_id || "").trim();
        if (!taxonomyId || rowTaxonomyIds.has(taxonomyId)) continue;

        rowTaxonomyIds.add(taxonomyId);

        rows.push({
          observation_item_id: item.id,
          report_id: item.report_id,
          company_id: item.company_id || null,
          taxonomy_id: taxonomyId,
          selection_source: "ai_suggested",
          notes: s.reason || null,
        });
      }

      let rowsToInsert = rows;
      let skipped_duplicate_rows = 0;

      if (rowTaxonomyIds.size) {
        const { data: existingForItem, error: existingItemErr } = await supabaseAdmin
          .from("post_inspection_observation_mscat")
          .select("taxonomy_id")
          .eq("observation_item_id", item.id)
          .in("taxonomy_id", Array.from(rowTaxonomyIds));

        if (existingItemErr) {
          throw new Error("Existing row check failed: " + (existingItemErr.message || String(existingItemErr)));
        }

        const existingTaxonomyIds = new Set(
          (existingForItem || []).map((x: any) => String(x.taxonomy_id))
        );

        rowsToInsert = rows.filter((row) => !existingTaxonomyIds.has(String(row.taxonomy_id)));
        skipped_duplicate_rows = rows.length - rowsToInsert.length;
      }

      if (rowsToInsert.length) {
        const { error: insertErr } = await supabaseAdmin
          .from("post_inspection_observation_mscat")
          .upsert(rowsToInsert, {
            onConflict: "observation_item_id,taxonomy_id",
            ignoreDuplicates: true,
          });

        if (insertErr) {
          throw new Error("Insert failed: " + (insertErr.message || String(insertErr)));
        }
      }

      return {
        ok: true,
        item_id: item.id,
        report_id: item.report_id,
        question_base: item.question_base,
        inserted_rows: rowsToInsert.length,
        skipped_duplicate_rows,
        suggestions: ai.suggestions.map((s: any) => ({
          item_code: s.item_code,
          section_label: s.section_label,
          subsection_label: s.subsection_label,
          item_label: s.item_label,
          confidence: s.confidence,
          reason: s.reason,
        })),
        overall_note: ai.overall_note,
        ignored_item_codes: ai.ignored_item_codes,
      };
    });

    const failed = processed.filter((x: any) => !x?.ok);
    const succeeded = processed.filter((x: any) => x?.ok);
    const inserted_rows = succeeded.reduce((sum: number, x: any) => sum + Number(x.inserted_rows || 0), 0);

    return json(req, {
      ok: true,
      function_version: FUNCTION_VERSION,
      mode: "apply",
      model: getOpenAiModel(),
      secret_name_used: Deno.env.get("OPENAI_API_KEY_2") ? "OPENAI_API_KEY_2" : "OPENAI_API_KEY",
      role,
      scope,
      report_id: report_id || null,
      skip_existing,
      max_items,
      concurrency,
      counts: {
        ...pending.counts,
        selected_for_processing: selected.length,
        processed_items: processed.length,
        succeeded_items: succeeded.length,
        failed_items: failed.length,
        inserted_rows,
        remaining_pending_after_batch: Math.max(0, pending.counts.pending_items - succeeded.length),
      },
      processed,
      failed,
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
