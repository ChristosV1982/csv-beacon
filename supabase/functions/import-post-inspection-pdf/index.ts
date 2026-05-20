export const config = {
  verify_jwt: false
};
const FUNCTION_VERSION = "cors-jwt-off-v37_process_alphanumeric_soc_codes";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as pdfjsLib from "npm:pdfjs-dist@4.2.67/legacy/build/pdf.mjs";
/**
 * CORS
 */ function buildCorsHeaders(req) {
  const origin = req.headers.get("Origin") ?? "*";
  const allowed = origin.includes(".replit.app") || origin.includes(".replit.dev") || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
function json(req, resBody, status = 200) {
  const cors = buildCorsHeaders(req);
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json"
    }
  });
}
function noContent(req, status = 204) {
  const cors = buildCorsHeaders(req);
  return new Response(null, {
    status,
    headers: cors
  });
}
async function getUserFromJwt(SUPABASE_URL, apikey, jwt) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey,
      Authorization: `Bearer ${jwt}`
    }
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>"");
    throw new Error(`Unauthorized: auth user fetch failed (${r.status}) ${t}`);
  }
  return await r.json();
}
async function requireAdminRole(supabaseAdmin, uid) {
  const { data: prof, error: profErr } = await supabaseAdmin.from("profiles").select("role").eq("id", uid).maybeSingle();
  if (profErr) throw new Error("Profile lookup failed");
  const role = prof?.role;
  if (
    role !== "super_admin" &&
    role !== "company_admin" &&
    role !== "company_superintendent"
  ) {
    throw new Error("Forbidden");
  }
  return {
    uid,
    role
  };
}
function normSpaces(s) {
  return s.replace(/\s+/g, " ").trim();
}
function monthToNum(mon) {
  const m = mon.toLowerCase();
  const map = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12"
  };
  return map[m] ?? "";
}
/**
 * PDF -> page texts with line breaks (reconstructed)
 */ async function extractPagesAsLines(pdfBytes) {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes,
    disableWorker: true
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  for(let pageNo = 1; pageNo <= pdf.numPages; pageNo++){
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    // deno-lint-ignore no-explicit-any
    const items = content.items;
    const rows = [];
    for (const it of items){
      const str = typeof it?.str === "string" ? it.str : "";
      if (!str) continue;
      const tr = it.transform;
      const x = Array.isArray(tr) ? tr[4] : 0;
      const y = Array.isArray(tr) ? tr[5] : 0;
      rows.push({
        x,
        y,
        str
      });
    }
    const byY = new Map();
    for (const r of rows){
      const yKey = Math.round(r.y * 2) / 2; // 0.5 precision
      const arr = byY.get(yKey) ?? [];
      arr.push({
        x: r.x,
        str: r.str
      });
      byY.set(yKey, arr);
    }
    const yKeys = Array.from(byY.keys()).sort((a, b)=>b - a);
    const lines = [];
    for (const y of yKeys){
      const parts = byY.get(y) ?? [];
      parts.sort((a, b)=>a.x - b.x);
      const line = parts.map((p)=>p.str).join(" ");
      const cleaned = normSpaces(line);
      if (!cleaned) continue;
      lines.push(cleaned);
    }
    pages.push(lines.join("\n"));
  }
  return pages;
}
function extractHeaderFromText(headerText) {
  const t = headerText;
  const reportRef = t.match(/[A-Z]{3,6}-\d{4}-\d{4}-\d{4}/)?.[0] ?? null;
  let vessel = null;
  const mV2 = t.match(/Report for\s+([A-Za-z0-9][A-Za-z0-9 .,'\-\/]{2,80})\s*\[/i);
  if (mV2?.[1]) vessel = normSpaces(mV2[1]);
  const mV1 = t.match(/Name of the vessel\s+([A-Za-z0-9][A-Za-z0-9 .,'\-\/]{2,80})/i);
  if (!vessel && mV1?.[1]) vessel = normSpaces(mV1[1]);
  let inspectionDate = null;
  const mD1 = t.match(/Date and time the inspector boarded the vessel\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (mD1) {
    const dd = String(mD1[1]).padStart(2, "0");
    const mm = monthToNum(mD1[2]);
    const yy = mD1[3];
    if (mm) inspectionDate = `${dd}.${mm}.${yy}`;
  }
  if (!inspectionDate) {
    const mD2 = t.match(/Inspection date\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i);
    if (mD2) {
      const dd = String(mD2[1]).padStart(2, "0");
      const mm = String(mD2[2]).padStart(2, "0");
      const yy = mD2[3];
      inspectionDate = `${dd}.${mm}.${yy}`;
    }
  }
  let portName = null;
  const mP1 = t.match(/Port of inspection\s+([^\n]{3,140})/i);
  if (mP1?.[1]) portName = normSpaces(mP1[1]);
  let portCode = null;
  const mPCb = portName?.match(/\[([A-Z]{2}[A-Z0-9]{3})\]/);
  if (mPCb?.[1]) portCode = mPCb[1].toUpperCase();
  if (!portCode) {
    const mPC1 = t.match(/Port code\s+([A-Z]{2}[A-Z0-9]{3})/i);
    if (mPC1?.[1]) portCode = mPC1[1].toUpperCase();
  }
  let ocimf = null;
  const mC1 = t.match(/Name of the OCIMF inspecting company\s+([A-Za-z0-9][A-Za-z0-9 .,'\-\/()&]{2,120})/i);
  if (mC1?.[1]) ocimf = normSpaces(mC1[1]);
  return {
    report_reference: reportRef,
    vessel_name: vessel,
    inspection_date: inspectionDate,
    port_name: portName,
    port_code: portCode,
    ocimf_inspecting_company: ocimf,
    inspector_name: null
  };
}
function normalizeThreeSeg(q) {
  const parts = q.split(".").map((p)=>{
    const n = Number(p);
    return Number.isFinite(n) ? String(n) : p;
  });
  if (parts.length !== 3) return q;
  return `${parts[0]}.${parts[1]}.${parts[2]}`;
}
function flattenPages(pages) {
  const out = [];
  for(let i = 0; i < pages.length; i++){
    const pageNo = i + 1;
    const lines = pages[i].split("\n").map(normSpaces).filter(Boolean);
    for (const line of lines){
      out.push({
        page: pageNo,
        text: line
      });
    }
  }
  return out;
}
function isReportHeaderOrFooter(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^Report for .+\[[A-Z]{3,6}-\d{4}-\d{4}-\d{4}\]$/i.test(t)) return true;
  if (/^©\s*\d{4}\s+Oil Companies International Marine Forum/i.test(t)) return true;
  if (/^Page\s+\d+\s+of\s+\d+$/i.test(t)) return true;
  if (/^Operator uploaded photos$/i.test(t)) return true;
  return false;
}
function isQuestionHeaderStart(line) {
  const t = line.trim();
  if (isReportHeaderOrFooter(t)) return null;
  if (/^PIQ additional data$/i.test(t)) return null;
  const m = t.match(/^(\d{1,2}\.\d{1,2}\.\d{1,2})\.\s+(.+)$/);
  if (!m?.[1] || !m?.[2]) return null;
  const qno = normalizeThreeSeg(m[1]);
  const qtext = normSpaces(m[2]);
  if (/^\d{1,2}\.\d{1,2}\.\d{1,2}\.\d+/.test(t)) return null;
  return {
    qno,
    qtext
  };
}
function parseResponsePhrase(phrase) {
  const p = normSpaces(phrase);
  if (/^Exceeded normal expectation\.$/i.test(p)) {
    return {
      response_type: "positive",
      nature_of_concern: "Exceeded normal expectation."
    };
  }
  if (/^Largely as expected\.$/i.test(p)) {
    return {
      response_type: "largely",
      nature_of_concern: "Largely as expected."
    };
  }
  if (/^Largely as expected\s*[-–]\s*(.+)$/i.test(p)) {
    return {
      response_type: "largely",
      nature_of_concern: p
    };
  }
  if (/^Observable or detectable deficiency\.$/i.test(p)) {
    return {
      response_type: "negative",
      nature_of_concern: "Observable or detectable deficiency."
    };
  }
  if (/^Not as expected\.$/i.test(p)) {
    return {
      response_type: "negative",
      nature_of_concern: "Not as expected."
    };
  }
  if (/^Not as expected\s*[-–]\s*(.+)$/i.test(p)) {
    return {
      response_type: "negative",
      nature_of_concern: p
    };
  }
  if (/^Free from obvious deterioration or deficiency\.$/i.test(p)) {
    return {
      response_type: "as_expected",
      nature_of_concern: "Free from obvious deterioration or deficiency."
    };
  }
  if (/^Photo provided representative\.$/i.test(p)) {
    return {
      response_type: "as_expected",
      nature_of_concern: "Photo provided representative."
    };
  }
  if (/^As expected\.$/i.test(p)) {
    return {
      response_type: "as_expected",
      nature_of_concern: "As expected."
    };
  }
  if (/^As expected\s*[-–]\s*(.+)$/i.test(p)) {
    return {
      response_type: "as_expected",
      nature_of_concern: p
    };
  }
  if (/^Not answerable\.$/i.test(p)) {
    return {
      response_type: "not_answerable",
      nature_of_concern: "Not answerable."
    };
  }
  if (/^Not applicable\.$/i.test(p)) {
    return {
      response_type: "not_applicable",
      nature_of_concern: "Not applicable."
    };
  }
  return null;
}
function parseResponseStart(line) {
  const t = line.trim();
  const designMatch = t.match(/^(Hardware|Process|Human|Photo|Photograph)\s+(.+)$/i);
  if (!designMatch?.[1] || !designMatch?.[2]) return null;
  const rawDesignation = designMatch[1].toLowerCase();
  const designation = rawDesignation === "hardware" ? "Hardware" : rawDesignation === "process" ? "Process" : rawDesignation === "human" ? "Human" : "Photo";
  const rest = normSpaces(designMatch[2]);
  if (designation === "Human") {
    const hm = rest.match(/^(.+?):\s*(.+)$/);
    if (hm?.[1] && hm?.[2]) {
      const rank = normSpaces(hm[1]);
      const phrase = normSpaces(hm[2]);
      const parsed = parseResponsePhrase(phrase);
      if (!parsed) return null;
      return {
        designation,
        response_type: parsed.response_type,
        nature_of_concern: parsed.nature_of_concern,
        rank
      };
    }
    const parsed = parseResponsePhrase(rest);
    if (!parsed) return null;
    return {
      designation,
      response_type: parsed.response_type,
      nature_of_concern: parsed.nature_of_concern,
      rank: null
    };
  }
  const parsed = parseResponsePhrase(rest);
  if (!parsed) return null;
  return {
    designation,
    response_type: parsed.response_type,
    nature_of_concern: parsed.nature_of_concern,
    rank: null
  };
}
function isQuestionSectionBreakLine(line) {
  const t = line.trim();
  if (!t) return true;
  if (isReportHeaderOrFooter(t)) return true;
  if (/^PIQ additional data$/i.test(t)) return true;
  if (/^Unvalidated PIQ Responses$/i.test(t)) return true;
  if (parseResponseStart(t)) return true;
  if (isQuestionHeaderStart(t)) return true;
  return false;
}
function buildQuestionSections(flatLines) {
  const starts = [];
  for(let i = 0; i < flatLines.length; i++){
    const hit = isQuestionHeaderStart(flatLines[i].text);
    if (!hit) continue;
    starts.push({
      idx: i,
      qno: hit.qno,
      page: flatLines[i].page
    });
  }
  const sections = [];
  for(let i = 0; i < starts.length; i++){
    const s = starts[i];
    const end = i < starts.length - 1 ? starts[i + 1].idx - 1 : flatLines.length - 1;
    const lines = flatLines.slice(s.idx, end + 1);
    // NEW IN v31:
    // Capture the full wrapped question text from the start line onward
    // until the first response row / PIQ line / next question / footer
    const qParts = [];
    for(let j = 0; j < lines.length; j++){
      const txt = lines[j].text.trim();
      if (!txt) continue;
      if (j === 0) {
        const hit = isQuestionHeaderStart(txt);
        if (hit) {
          qParts.push(hit.qtext);
          continue;
        }
      }
      if (isQuestionSectionBreakLine(txt)) break;
      qParts.push(txt);
    }
    sections.push({
      question_base: s.qno,
      question_full: normSpaces(qParts.join(" ")) || null,
      start_idx: s.idx,
      end_idx: end,
      page_hint: s.page,
      lines
    });
  }
  return sections;
}
function buildResponseBlocks(section) {
  const blocks = [];
  let current = null;
  for(let i = 0; i < section.lines.length; i++){
    const line = section.lines[i];
    const t = line.text.trim();
    if (isReportHeaderOrFooter(t)) continue;
    if (i === 0 && isQuestionHeaderStart(t)) continue;
    const rs = parseResponseStart(t);
    if (rs) {
      if (current) blocks.push(current);
      current = {
        question_base: section.question_base,
        question_full: section.question_full,
        designation: rs.designation,
        response_type: rs.response_type,
        nature_of_concern: rs.nature_of_concern,
        rank: rs.rank,
        page_hint: line.page,
        lines: [
          line
        ]
      };
      continue;
    }
    if (!current) continue;
    if (/^Unvalidated PIQ Responses$/i.test(t)) {
      blocks.push(current);
      current = null;
      break;
    }
    if (isQuestionHeaderStart(t)) {
      blocks.push(current);
      current = null;
      continue;
    }
    current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}
function isExtractableResponseType(t) {
  return t === "negative" || t === "positive" || t === "largely";
}
function isLikelyProcessCodeLine(line) {
  return /^\d{1,2}[A-Z]?(?:\.\d{1,2}){2,5}\s*-\s*.+$/i.test(line);
}
function isLikelyHumanPifLine(line) {
  return /^\d{1,2}\.\s+.+$/.test(line);
}
function isLikelyHardwareCodeLine(line) {
  if (/^(Hardware|Process|Human|Photo|Photograph)\b/i.test(line)) return false;
  if (isLikelyProcessCodeLine(line)) return false;
  if (isLikelyHumanPifLine(line)) return false;
  if (/^[A-Za-z0-9/&(),'\- ]{5,}:\s+.{4,}$/.test(line)) return true;
  return false;
}
// NEW IN v31
function isOperatorCommentsStart(line) {
  const t = line.trim();
  if (/^Operator Comments\b/i.test(t)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+by\b/i.test(t)) return true;
  if (/^Immediate Cause\b/i.test(t)) return true;
  if (/^Root Cause\b/i.test(t)) return true;
  if (/^Corrective Action\b/i.test(t)) return true;
  if (/^Preventative Action\b/i.test(t)) return true;
  if (/^Preventive Action\b/i.test(t)) return true;
  if (/^Operator Attachments\b/i.test(t)) return true;
  if (/^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{2}:\d{2}\s+uploaded by\b/i.test(t)) return true;
  return false;
}
function parseResponseBlock(block) {
  if (!isExtractableResponseType(block.response_type)) return null;
  const headerLine = block.lines[0]?.text ?? "";
  const tailLines = block.lines.slice(1).map((x)=>x.text).filter(Boolean);
  let classification_coding = null;
  const commentParts = [];
  for (const line of tailLines){
    const t = normSpaces(line);
    if (!t) continue;
    if (isReportHeaderOrFooter(t)) continue;
    if (/^PIQ additional data$/i.test(t)) continue;
    // NEW IN v31:
    // hard stop before operator comments / corrective-action workflow
    if (isOperatorCommentsStart(t)) break;
    if (block.designation === "Process" && isLikelyProcessCodeLine(t)) {
      classification_coding = classification_coding ?? t;
      continue;
    }
    if (block.designation === "Human" && isLikelyHumanPifLine(t)) {
      classification_coding = classification_coding ?? t;
      continue;
    }
    if (block.designation === "Hardware" && isLikelyHardwareCodeLine(t)) {
      classification_coding = classification_coding ?? t;
      continue;
    }
    commentParts.push(t);
  }
  const observation_text = normSpaces(commentParts.join(" "));
  const positive_rank = block.response_type === "positive" && block.designation === "Human" ? block.rank : null;
  const finding_kind = block.response_type === "negative" ? "negative_observation" : block.response_type === "positive" ? "positive_observation" : "note_improvement";
  const counts_as_observation = block.response_type !== "largely";
  const confidence = block.designation === "Human" ? 0.95 : block.designation === "Process" ? 0.93 : 0.93;
  return {
    obs_type: block.response_type,
    finding_kind,
    counts_as_observation,
    question_base: block.question_base,
    question_full: block.question_full,
    designation: block.designation,
    nature_of_concern: block.nature_of_concern,
    classification_coding,
    positive_rank,
    observation_text,
    page_hint: block.page_hint,
    confidence,
    source_excerpt: headerLine || null
  };
}
function dedupeObservations(observations) {
  const seen = new Set();
  const out = [];
  for (const o of observations){
    const key = [
      o.question_base,
      o.obs_type,
      o.designation ?? "",
      o.nature_of_concern ?? "",
      o.classification_coding ?? "",
      (o.observation_text ?? "").slice(0, 160)
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

function previewText(value, max = 240) {
  const s = normSpaces(String(value ?? ""));
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function buildImportQaDebug(pages, header, observations, question_sections_count, response_blocks_count) {
  const flatLines = flattenPages(pages);
  const questionSections = buildQuestionSections(flatLines);
  const warnings = [];
  const response_blocks = [];
  const unparsed_response_lines = [];
  const operator_comment_stops = [];

  if (!header?.report_reference) warnings.push("Header: report_reference not detected.");
  if (!header?.vessel_name) warnings.push("Header: vessel_name not detected.");
  if (!header?.inspection_date) warnings.push("Header: inspection_date not detected.");
  if (!header?.port_name) warnings.push("Header: port_name not detected.");
  if (!header?.ocimf_inspecting_company) warnings.push("Header: ocimf_inspecting_company not detected.");

  for (const line of flatLines) {
    const t = String(line.text || "").trim();
    if (!t) continue;

    if (isOperatorCommentsStart(t)) {
      operator_comment_stops.push({
        page: line.page,
        text: previewText(t, 180)
      });
    }

    if (/^(Hardware|Process|Human|Photo|Photograph)\b/i.test(t) && !parseResponseStart(t)) {
      unparsed_response_lines.push({
        page: line.page,
        text: previewText(t, 220)
      });
    }
  }

  for (const section of questionSections) {
    const blocks = buildResponseBlocks(section);
    for (const block of blocks) {
      const tailPreview = block.lines
        .slice(1, 6)
        .map((x) => previewText(x.text, 160))
        .filter(Boolean);

      response_blocks.push({
        question_base: block.question_base,
        page_hint: block.page_hint,
        designation: block.designation,
        response_type: block.response_type,
        extractable: isExtractableResponseType(block.response_type),
        nature_of_concern: block.nature_of_concern,
        rank: block.rank || null,
        header_line: previewText(block.lines[0]?.text || "", 220),
        lines_count: block.lines.length,
        tail_preview: tailPreview
      });
    }
  }

  for (const obs of observations || []) {
    const q = obs.question_base || "unknown question";
    const label = `${q} / ${obs.obs_type || "unknown"} / ${obs.designation || "unknown"}`;

    if (!obs.question_full) {
      warnings.push(`${label}: question_full was not captured.`);
    }

    if (obs.obs_type !== "largely" && !String(obs.observation_text || "").trim()) {
      warnings.push(`${label}: observation_text is empty.`);
    }

    if ((obs.designation === "Process" || obs.designation === "Hardware") && !String(obs.classification_coding || "").trim()) {
      warnings.push(`${label}: classification_coding was not detected.`);
    }

    if (obs.designation === "Human" && obs.obs_type !== "positive" && !String(obs.classification_coding || "").trim()) {
      warnings.push(`${label}: Human PIF/classification line was not detected.`);
    }
  }

  const page_line_counts = pages.map((p, idx) => ({
    page: idx + 1,
    lines: p.split("\n").map(normSpaces).filter(Boolean).length
  }));

  const duplicate_findings_removed = Math.max(0, Number(response_blocks_count || 0) - Number((observations || []).length || 0));

  return {
    schema_version: "post_inspection_import_qa_debug_v1",
    generated_at: new Date().toISOString(),
    function_version: FUNCTION_VERSION,
    page_count: pages.length,
    page_line_counts,
    counts: {
      question_sections_count,
      response_blocks_count,
      observations_after_dedupe: Array.isArray(observations) ? observations.length : 0,
      duplicate_findings_removed,
      warnings_count: warnings.length,
      unparsed_response_lines_count: unparsed_response_lines.length,
      operator_comment_stops_count: operator_comment_stops.length
    },
    header,
    question_sections: questionSections.slice(0, 300).map((s) => ({
      question_base: s.question_base,
      page_hint: s.page_hint,
      question_full_preview: previewText(s.question_full || "", 260),
      start_idx: s.start_idx,
      end_idx: s.end_idx,
      lines_count: Array.isArray(s.lines) ? s.lines.length : 0
    })),
    response_blocks: response_blocks.slice(0, 600),
    unparsed_response_lines: unparsed_response_lines.slice(0, 300),
    operator_comment_stops: operator_comment_stops.slice(0, 300),
    warnings: warnings.slice(0, 500)
  };
}


function extractFindingsFromPages(pages) {
  const flatLines = flattenPages(pages);
  const questionSections = buildQuestionSections(flatLines);
  const examined_questions = questionSections.map((s)=>s.question_base);
  const observations = [];
  for (const section of questionSections){
    const blocks = buildResponseBlocks(section);
    for (const block of blocks){
      const obs = parseResponseBlock(block);
      if (obs) observations.push(obs);
    }
  }
  const dedup = dedupeObservations(observations);
  return {
    observations: dedup,
    examined_questions,
    question_sections_count: questionSections.length,
    response_blocks_count: observations.length
  };
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return noContent(req, 204);
  try {
    if (req.method !== "POST") return json(req, {
      error: "Use POST"
    }, 405);
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) {
      return json(req, {
        ok: false,
        error: "Missing Authorization Bearer token"
      }, 401);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PDF_BUCKET = Deno.env.get("POST_INSPECTION_PDF_BUCKET");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PDF_BUCKET) {
      return json(req, {
        ok: false,
        error: "Missing function secrets (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / POST_INSPECTION_PDF_BUCKET)"
      }, 500);
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    // 1) Validate token -> uid
    const user = await getUserFromJwt(SUPABASE_URL, SERVICE_ROLE_KEY, jwt);
    const uid = user?.id;
    if (!uid) throw new Error("Unauthorized");
    // 2) Role check
    await requireAdminRole(supabaseAdmin, uid);
    // 3) Read payload
    const payload = await req.json();
    const want_debug = payload?.debug === true || payload?.debug === "true";
    const report_id = payload?.report_id;
    const pdf_storage_path = payload?.pdf_storage_path;
    if (!report_id) return json(req, {
      ok: false,
      error: "report_id is required"
    }, 400);
    if (!pdf_storage_path) return json(req, {
      ok: false,
      error: "pdf_storage_path is required"
    }, 400);
    // 4) Download PDF
    const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage.from(PDF_BUCKET).download(pdf_storage_path);
    if (dlErr || !pdfBlob) {
      const details = dlErr ? JSON.stringify(dlErr, Object.getOwnPropertyNames(dlErr)) : "no blob";
      throw new Error(`Storage download failed: bucket=${PDF_BUCKET} path=${pdf_storage_path} err=${details}`);
    }
    const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
    // 5) Extract pages with line breaks
    const pages = await extractPagesAsLines(pdfBytes);
    // 6) Header
    const headerWindow = pages.slice(0, 8).join("\n\n");
    const header = extractHeaderFromText(headerWindow);
    // 7) Structured findings + examined questions
    const { observations, examined_questions, question_sections_count, response_blocks_count } = extractFindingsFromPages(pages);
    const extracted = {
      header,
      observations,
      examined_questions,
      examined_count: examined_questions.length
    };
    const responseBody = {
      ok: true,
      extracted,
      function_version: FUNCTION_VERSION,
      debug: {
        pages: pages.length,
        question_sections_count,
        response_blocks_count,
        raw_findings: observations.length,
        examined_count: examined_questions.length,
        examined_sample: examined_questions.slice(0, 20)
      }
    };
    if (want_debug) {
      responseBody.qa_debug = buildImportQaDebug(
        pages,
        header,
        observations,
        question_sections_count,
        response_blocks_count
      );
    }
    return json(req, responseBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.startsWith("Unauthorized") ? 401 : msg === "Forbidden" ? 403 : 500;
    return json(req, {
      ok: false,
      error: msg
    }, status);
  }
});
