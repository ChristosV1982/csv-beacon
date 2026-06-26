export const config = {
  verify_jwt: false,
};

const FUNCTION_VERSION = "audit-mscat-ai-backfill-v02-learning-assisted-20260626";
const MSCAT_SOURCE_REF = "DNV M-SCAT 8.2";
const MAX_BATCH_ITEMS = 10;
const DEFAULT_BATCH_ITEMS = 5;
const MAX_CONCURRENCY = 3;
const REPORT_ID_CHUNK_SIZE = 75;


class MinimalPostgrestQuery {
  private baseUrl: string;
  private serviceKey: string;
  private table: string;
  private method = "GET";
  private selectColumns = "";
  private filters: Array<[string, string]> = [];
  private orderParts: string[] = [];
  private rangeHeader = "";
  private limitValue: number | null = null;
  private bodyValue: unknown = null;
  private maybeSingleMode = false;
  private preferParts: string[] = [];

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

  like(column: string, value: unknown) {
    this.filters.push([column, `like.${String(value ?? "")}`]);
    return this;
  }

  in(column: string, values: unknown[]) {
    const clean = (values || [])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .map((v) => v.replaceAll('"', '\\"'));

    this.filters.push([column, `in.(${clean.join(",")})`]);
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

  range(from: number, to: number) {
    this.rangeHeader = `${from}-${to}`;
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

  upsert(rows: unknown[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.method = "POST";
    this.bodyValue = rows || [];

    if (opts.onConflict) {
      this.filters.push(["on_conflict", String(opts.onConflict)]);
    }

    if (opts.ignoreDuplicates) {
      this.preferParts.push("resolution=ignore-duplicates");
    } else {
      this.preferParts.push("resolution=merge-duplicates");
    }

    this.preferParts.push("return=minimal");
    return this;
  }

  then(resolve: any, reject: any) {
    return this.execute().then(resolve, reject);
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

    const headers: Record<string, string> = {
      apikey: this.serviceKey,
      Authorization: `Bearer ${this.serviceKey}`,
    };

    if (this.method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    if (this.rangeHeader) {
      headers.Range = this.rangeHeader;
    }

    if (this.preferParts.length) {
      headers.Prefer = this.preferParts.join(",");
    }

    const resp = await fetch(url.toString(), {
      method: this.method,
      headers,
      body: this.method === "GET" ? undefined : JSON.stringify(this.bodyValue),
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

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
    audit_observation_item_id: item?.id || "",
    report_id: item?.report_id || "",
    vessel_name: item?.vessel_name || "",
    audit_date: item?.audit_date || "",
    audit_source: item?.audit_source || "",
    audit_type: item?.audit_type_name || "",
    report_reference: item?.report_reference || "",
    question_no: item?.question_no || "",
    question_base: item?.question_base || "",
    obs_type: item?.obs_type || "",
    designation: item?.designation || "",
    soc: item?.soc || "",
    noc: item?.noc || "",
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
            "audit","observation","observed","vessel","ship","during","found"
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

function buildLearningPromptRows(examples: any[]) {
  return (examples || []).slice(0, 6).map((e: any) => ({
    similarity_score: e.similarity_score || 0,
    match_summary: e.match_summary || "",
    audit_type_name: e.audit_type_name || "",
    audit_source: e.audit_source || "",
    sire_question_no: e.sire_question_no || e.question_base || "",
    obs_type: e.obs_type || "",
    designation: e.designation || "",
    observation_text: previewText(e.observation_text || e.observation_remarks || "", 360),
    reviewed_mscat_item_codes: learningSelectionCodes(e),
    review_comment: previewText(e.review_comment || "", 220),
  }));
}

function scoreLearningExample(example: any, item: any, tokens: string[]) {
  let score = 0;
  const itemQuestion = String(item?.question_no || item?.question_base || "").trim();

  if (example?.sire_question_no && itemQuestion && String(example.sire_question_no) === itemQuestion) score += 50;
  if (example?.audit_type_id && item?.audit_type_id && String(example.audit_type_id) === String(item.audit_type_id)) score += 25;
  if (example?.audit_source && item?.audit_source && String(example.audit_source) === String(item.audit_source)) score += 15;
  if (example?.obs_type && item?.obs_type && String(example.obs_type) === String(item.obs_type)) score += 10;
  if (example?.designation && item?.designation && String(example.designation) === String(item.designation)) score += 8;

  const haystack = normSpaces([
    example?.question_base,
    example?.sire_question_no,
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
  if (example?.sire_question_no && itemQuestion && String(example.sire_question_no) === itemQuestion) parts.push("same SIRE reference");
  if (example?.audit_type_id && item?.audit_type_id && String(example.audit_type_id) === String(item.audit_type_id)) parts.push("same audit type");
  if (example?.audit_source && item?.audit_source && String(example.audit_source) === String(item.audit_source)) parts.push("same audit source");
  if (example?.obs_type && item?.obs_type && String(example.obs_type) === String(item.obs_type)) parts.push("same observation type");
  if (example?.designation && item?.designation && String(example.designation) === String(item.designation)) parts.push("same designation");
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
    .from("audit_observation_mscat_learning_examples")
    .select("id,company_id,source_report_id,source_audit_observation_item_id,audit_type_id,audit_type_name,audit_source,sire_question_no,question_base,obs_type,designation,soc,noc,observation_text,observation_remarks,review_comment,final_taxonomy_ids,final_manual_selections,reviewed_at")
    .neq("source_audit_observation_item_id", item.id)
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

  if (error) throw new Error("Learning examples lookup failed: " + (error.message || String(error)));

  const itemText = [
    item?.question_no,
    item?.question_base,
    item?.designation,
    item?.soc,
    item?.noc,
    item?.observation_text,
    item?.remarks
  ].filter(Boolean).join(" ");

  const tokens = tokenizeLearningText(itemText);

  return (data || [])
    .map((e: any) => scoreLearningExample(e, item, tokens))
    .filter((e: any) => Number(e.similarity_score || 0) > 0)
    .sort((a: any, b: any) => {
      const scoreDiff = Number(b.similarity_score || 0) - Number(a.similarity_score || 0);
      if (scoreDiff) return scoreDiff;
      return String(b.reviewed_at || "").localeCompare(String(a.reviewed_at || ""));
    })
    .slice(0, Math.max(0, Math.min(Number(limit || 6), 10)));
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

async function loadReportContext(supabaseAdmin: any, reportIds: string[]) {
  const uniqueReportIds = Array.from(new Set(reportIds.filter(Boolean)));
  const reportMap = new Map<string, any>();

  if (!uniqueReportIds.length) return reportMap;

  const { data: reports, error: reportErr } = await supabaseAdmin
    .from("audit_reports")
    .select("id,company_id,vessel_id,audit_date,audit_source,audit_type_id,report_reference,remarks,report_file_name,report_storage_path")
    .in("id", uniqueReportIds);

  if (reportErr) throw new Error("Audit report context lookup failed: " + (reportErr.message || String(reportErr)));

  const reportRows = reports || [];
  const vesselIds = Array.from(new Set(reportRows.map((r: any) => r.vessel_id).filter(Boolean)));
  const auditTypeIds = Array.from(new Set(reportRows.map((r: any) => r.audit_type_id).filter(Boolean)));

  const vesselMap = new Map<string, any>();
  const typeMap = new Map<string, any>();

  if (vesselIds.length) {
    const { data: vessels, error: vesselErr } = await supabaseAdmin
      .from("vessels")
      .select("id,name,company_id")
      .in("id", vesselIds);

    if (vesselErr) throw new Error("Vessel lookup failed: " + (vesselErr.message || String(vesselErr)));

    for (const v of vessels || []) vesselMap.set(String(v.id), v);
  }

  if (auditTypeIds.length) {
    const { data: auditTypes, error: typeErr } = await supabaseAdmin
      .from("audit_types")
      .select("id,audit_type_name")
      .in("id", auditTypeIds);

    if (typeErr) throw new Error("Audit type lookup failed: " + (typeErr.message || String(typeErr)));

    for (const t of auditTypes || []) typeMap.set(String(t.id), t);
  }

  for (const r of reportRows) {
    const vessel = vesselMap.get(String(r.vessel_id)) || {};
    const auditType = typeMap.get(String(r.audit_type_id)) || {};

    reportMap.set(String(r.id), {
      ...r,
      vessel_name: vessel.name || "",
      vessel_company_id: vessel.company_id || "",
      audit_type_name: auditType.audit_type_name || "",
      effective_company_id: r.company_id || vessel.company_id || null,
    });
  }

  return reportMap;
}

async function getScopedReportIds(supabaseAdmin: any, scope: string, reportId: string, batchId: string) {
  if (scope === "current_report") {
    return reportId ? [reportId] : [];
  }

  if (scope === "batch") {
    if (!batchId) throw new Error("batch_id is required when scope=batch.");

    const ids: string[] = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("audit_reports")
        .select("id")
        .like("report_storage_path", `manual_import_batches/${batchId}/%`)
        .order("audit_date", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw new Error("Batch audit report lookup failed: " + (error.message || String(error)));

      const rows = Array.isArray(data) ? data : [];
      ids.push(...rows.map((r: any) => String(r.id)).filter(Boolean));

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return ids;
  }

  return null;
}

async function loadExistingMscatIds(supabaseAdmin: any, itemIds: string[]) {
  const existingIds = new Set<string>();
  const cleanIds = itemIds.filter(Boolean);

  for (const idChunk of chunkArray(cleanIds, 25)) {
    const { data, error } = await supabaseAdmin
      .from("audit_observation_mscat")
      .select("audit_observation_item_id")
      .in("audit_observation_item_id", idChunk);

    if (error) throw new Error("Existing audit M-SCAT lookup failed: " + (error.message || String(error)));

    for (const row of data || []) {
      existingIds.add(String(row.audit_observation_item_id));
    }
  }

  return existingIds;
}

async function scanObservationPage(
  supabaseAdmin: any,
  profile: any,
  rows: any[],
  skipExisting: boolean,
  selectedPending: any[],
  allPendingSample: any[],
  counters: any
) {
  counters.scanned_items += rows.length;

  const reportIds = Array.from(new Set(rows.map((x: any) => String(x.report_id || "")).filter(Boolean)));
  const reportMap = await loadReportContext(supabaseAdmin, reportIds);

  const accessibleApplicable: any[] = [];

  for (const row of rows) {
    const report = reportMap.get(String(row.report_id)) || {};
    const companyId = row.company_id || report.effective_company_id || report.company_id || null;

    const enriched = {
      ...row,
      company_id: companyId,
      vessel_name: report.vessel_name || "",
      audit_date: report.audit_date || "",
      audit_source: report.audit_source || "",
      audit_type_name: report.audit_type_name || "",
      report_reference: report.report_reference || "",
      report_storage_path: report.report_storage_path || "",
    };

    if (!itemNeedsMscat(enriched)) {
      counters.skipped_not_applicable++;
      continue;
    }

    counters.applicable_items++;

    if (!canAccessCompany(profile, companyId)) {
      counters.skipped_no_access++;
      continue;
    }

    accessibleApplicable.push(enriched);
  }

  const ids = accessibleApplicable.map((x) => x.id).filter(Boolean);
  const existingIds = skipExisting ? await loadExistingMscatIds(supabaseAdmin, ids) : new Set<string>();

  for (const item of accessibleApplicable) {
    if (skipExisting && existingIds.has(String(item.id))) {
      counters.skipped_existing++;
      continue;
    }

    counters.pending_items++;

    const sample = {
      id: item.id,
      report_id: item.report_id,
      question_base: item.question_base,
      obs_type: item.obs_type,
      vessel_name: item.vessel_name,
      audit_date: item.audit_date,
      audit_type_name: item.audit_type_name,
      text_preview: previewText(item.observation_text, 220),
    };

    if (allPendingSample.length < 20) allPendingSample.push(sample);
    selectedPending.push(item);
  }
}

async function collectPendingItems(
  supabaseAdmin: any,
  profile: any,
  scope: string,
  reportId: string,
  batchId: string,
  itemId: string,
  skipExisting: boolean
) {
  const pageSize = 200;
  const selectedPending: any[] = [];
  const allPendingSample: any[] = [];

  const counters = {
    scanned_items: 0,
    applicable_items: 0,
    skipped_not_applicable: 0,
    skipped_no_access: 0,
    skipped_existing: 0,
    pending_items: 0,
  };

  if (scope === "current_item") {
    if (!itemId) throw new Error("item_id is required when scope=current_item.");

    const { data, error } = await supabaseAdmin
      .from("audit_observation_items")
      .select("id,company_id,report_id,question_no,question_base,obs_type,designation,soc,noc,observation_text,remarks,sort_index")
      .eq("id", itemId)
      .maybeSingle();

    if (error) throw new Error("Current audit observation lookup failed: " + (error.message || String(error)));
    if (!data) throw new Error("Audit observation item not found: " + itemId);

    await scanObservationPage(
      supabaseAdmin,
      profile,
      [data],
      skipExisting,
      selectedPending,
      allPendingSample,
      counters
    );

    return {
      counts: counters,
      selectedPending,
      allPendingSample,
      scoped_report_count: reportId ? 1 : null,
    };
  }

  const scopedReportIds = await getScopedReportIds(supabaseAdmin, scope, reportId, batchId);

  if (Array.isArray(scopedReportIds)) {
    for (const reportChunk of chunkArray(scopedReportIds, REPORT_ID_CHUNK_SIZE)) {
      let from = 0;

      while (true) {
        const { data, error } = await supabaseAdmin
          .from("audit_observation_items")
          .select("id,company_id,report_id,question_no,question_base,obs_type,designation,soc,noc,observation_text,remarks,sort_index")
          .in("report_id", reportChunk)
          .order("report_id", { ascending: true })
          .order("sort_index", { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw new Error("Audit observation scan failed: " + (error.message || String(error)));

        const rows = Array.isArray(data) ? data : [];
        if (!rows.length) break;

        await scanObservationPage(
          supabaseAdmin,
          profile,
          rows,
          skipExisting,
          selectedPending,
          allPendingSample,
          counters
        );

        if (rows.length < pageSize) break;
        from += pageSize;
      }
    }
  } else {
    let from = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("audit_observation_items")
        .select("id,company_id,report_id,question_no,question_base,obs_type,designation,soc,noc,observation_text,remarks,sort_index")
        .order("report_id", { ascending: true })
        .order("sort_index", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw new Error("Audit observation scan failed: " + (error.message || String(error)));

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) break;

      await scanObservationPage(
        supabaseAdmin,
        profile,
        rows,
        skipExisting,
        selectedPending,
        allPendingSample,
        counters
      );

      if (rows.length < pageSize) break;
      from += pageSize;
    }
  }

  return {
    counts: counters,
    selectedPending,
    allPendingSample,
    scoped_report_count: Array.isArray(scopedReportIds) ? scopedReportIds.length : null,
  };
}

async function suggestForItem(openAiKey: string, model: string, item: any, taxonomyRows: any[], codeMap: Map<string, any>, learningExamples: any[] = []) {
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
              description: "Short operational reason why this M-SCAT item fits the audit observation.",
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
        name: "audit_mscat_ai_suggestions",
        strict: true,
        schema: responseSchema,
      },
    },
    input: [
      {
        role: "system",
        content:
          "You are a maritime safety, tanker audit, SIRE 2.0, and DNV M-SCAT 8.2 cause analysis assistant. " +
          "Suggest M-SCAT causes/actions only from the provided taxonomy. Do not invent item codes. " +
          "Return only high-relevance suggestions. Prefer a balanced set: immediate cause(s), basic cause(s), and control area(s) when supported by the audit observation. " +
          "When reviewed company examples are supplied, treat them as company preference signals. Do not copy them blindly; use them only when factually relevant to the current observation. " +
          "This is advisory only; final selections are saved as AI-suggested and remain reviewable by the user.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Suggest M-SCAT item codes for this vessel audit observation.",
          observation: buildObservationContext(item),
          reviewed_company_examples: buildLearningPromptRows(learningExamples),
          taxonomy: buildTaxonomyPromptRows(taxonomyRows),
          constraints: [
            "Use exact item_code values only from the supplied taxonomy.",
            "Do not infer facts not supported by the observation text.",
            "Return 2 to 6 strong suggestions unless fewer are justified.",
            "Never return more than 8 suggestions.",
            "Keep each reason concise.",
            "If reviewed_company_examples are relevant, align with the reviewed company pattern and mention that alignment in the reason.",
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
    const scope = String(payload?.scope || "batch").trim();
    const report_id = String(payload?.report_id || "").trim();
    const batch_id = String(payload?.batch_id || "").trim();
    const item_id = String(payload?.item_id || payload?.audit_observation_item_id || "").trim();
    const suggest_only = payload?.suggest_only === true;
    const use_learning = payload?.use_learning !== false;
    const dry_run = payload?.dry_run !== false;
    const skip_existing = payload?.skip_existing !== false;
    const max_items = clampInt(payload?.max_items, DEFAULT_BATCH_ITEMS, 1, MAX_BATCH_ITEMS);
    const concurrency = clampInt(payload?.concurrency, 2, 1, MAX_CONCURRENCY);

    if (scope !== "current_item" && scope !== "current_report" && scope !== "batch" && scope !== "all_reports") {
      return json(req, { ok: false, error: "scope must be current_item, current_report, batch, or all_reports" }, 400);
    }

    if (scope === "current_item" && !item_id) {
      return json(req, { ok: false, error: "item_id is required when scope=current_item" }, 400);
    }

    if (scope === "current_report" && !report_id) {
      return json(req, { ok: false, error: "report_id is required when scope=current_report" }, 400);
    }

    if (scope === "batch" && !batch_id) {
      return json(req, { ok: false, error: "batch_id is required when scope=batch" }, 400);
    }

    if (scope === "all_reports" && dry_run === false && payload?.confirm_all_reports !== true) {
      return json(req, {
        ok: false,
        error: "confirm_all_reports=true is required when applying AI backfill to all audit reports.",
      }, 400);
    }

    if (scope === "batch" && dry_run === false && payload?.confirm_batch !== true) {
      return json(req, {
        ok: false,
        error: "confirm_batch=true is required when applying AI backfill to a batch.",
      }, 400);
    }

    if (!dry_run && !OPENAI_API_KEY) {
      return json(req, {
        ok: false,
        error: "Missing OpenAI secret. Expected OPENAI_API_KEY_2 or OPENAI_API_KEY.",
      }, 500);
    }

    const pending = await collectPendingItems(
      supabaseAdmin,
      profile,
      scope,
      report_id,
      batch_id,
      item_id,
      skip_existing
    );

    const selected = pending.selectedPending.slice(0, max_items);

    if (dry_run) {
      return json(req, {
        ok: true,
        function_version: FUNCTION_VERSION,
        mode: "dry_run",
        role,
        scope,
        report_id: report_id || null,
        batch_id: batch_id || null,
        item_id: item_id || null,
        suggest_only,
        use_learning,
        skip_existing,
        max_items,
        scoped_report_count: pending.scoped_report_count,
        counts: {
          ...pending.counts,
          selected_for_processing: selected.length,
          remaining_pending_after_batch: Math.max(0, pending.counts.pending_items - selected.length),
        },
        selected_items_sample: selected.map((item) => ({
          id: item.id,
          report_id: item.report_id,
          vessel_name: item.vessel_name,
          audit_date: item.audit_date,
          audit_type_name: item.audit_type_name,
          question_base: item.question_base,
          obs_type: item.obs_type,
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
      const learningExamples = use_learning
        ? await loadLearningExamplesForItem(supabaseAdmin, profile, item, 6)
        : [];

      const ai = await suggestForItem(OPENAI_API_KEY, getOpenAiModel(), item, taxonomyRows, codeMap, learningExamples);

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
          learning_examples_used: learningExamples.length,
        };
      }

      if (suggest_only) {
        return {
          ok: true,
          item_id: item.id,
          report_id: item.report_id,
          question_base: item.question_base,
          inserted_rows: 0,
          skipped_duplicate_rows: 0,
          suggestions: ai.suggestions.map((s: any) => ({
            taxonomy_id: s.taxonomy_id,
            item_code: s.item_code,
            section_label: s.section_label,
            subsection_label: s.subsection_label,
            item_label: s.item_label,
            confidence: s.confidence,
            reason: s.reason,
          })),
          overall_note: ai.overall_note,
          ignored_item_codes: ai.ignored_item_codes,
          learning_examples_used: learningExamples.length,
        };
      }

      const rows: any[] = [];
      const rowTaxonomyIds = new Set<string>();

      for (const s of ai.suggestions) {
        const taxonomyId = String(s.taxonomy_id || "").trim();
        if (!taxonomyId || rowTaxonomyIds.has(taxonomyId)) continue;

        rowTaxonomyIds.add(taxonomyId);

        rows.push({
          audit_observation_item_id: item.id,
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
          .from("audit_observation_mscat")
          .select("taxonomy_id")
          .eq("audit_observation_item_id", item.id)
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
          .from("audit_observation_mscat")
          .upsert(rowsToInsert, {
            onConflict: "audit_observation_item_id,taxonomy_id",
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
          taxonomy_id: s.taxonomy_id,
          item_code: s.item_code,
          section_label: s.section_label,
          subsection_label: s.subsection_label,
          item_label: s.item_label,
          confidence: s.confidence,
          reason: s.reason,
        })),
        overall_note: ai.overall_note,
        ignored_item_codes: ai.ignored_item_codes,
        learning_examples_used: learningExamples.length,
      };
    });

    const failed = processed.filter((x: any) => !x?.ok);
    const succeeded = processed.filter((x: any) => x?.ok);
    const inserted_rows = succeeded.reduce((sum: number, x: any) => sum + Number(x.inserted_rows || 0), 0);

    return json(req, {
      ok: true,
      function_version: FUNCTION_VERSION,
      mode: suggest_only ? "suggest_only" : "apply",
      model: getOpenAiModel(),
      secret_name_used: Deno.env.get("OPENAI_API_KEY_2") ? "OPENAI_API_KEY_2" : "OPENAI_API_KEY",
      role,
      scope,
      report_id: report_id || null,
      batch_id: batch_id || null,
      item_id: item_id || null,
      suggest_only,
      use_learning,
      skip_existing,
      max_items,
      concurrency,
      scoped_report_count: pending.scoped_report_count,
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
