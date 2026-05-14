// scripts/extract-sire-reference-preview.mjs
// C.S.V. BEACON — SIRE 2.0 Publications / Industry Guidance extraction preview.
// READ-ONLY: does not connect to Supabase and does not write SQL.
// Output: CSV + JSON preview for manual review before staging/import.

import fs from "node:fs";
import path from "node:path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function argInt(name, fallback = 0) {
  const v = Number(arg(name, ""));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function csvCell(value) {
  const s = String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}

function normalizeQuestionNumber(raw) {
  const s = String(raw ?? "").trim().replace(/^Q\s*/i, "");
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{1,3})$/);
  if (!m) return "";
  return `${String(Number(m[1])).padStart(2, "0")}.${String(Number(m[2])).padStart(2, "0")}.${String(Number(m[3])).padStart(2, "0")}`;
}

function normalizeKey(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

function cleanLine(line) {
  return String(line ?? "")
    .replace(/\s+/g, " ")
    .replace(/\uFFFE/g, "-")
    .trim();
}

function isPdfNoiseLine(line) {
  const t = cleanLine(line);
  if (!t) return true;
  if (/^Page\s+\d+\s+of\s+\d+\s+[–-]\s+SIRE\s+2\.0\s+Question Library:/i.test(t)) return true;
  if (/^SIRE\s+2\.0\s+Question Library$/i.test(t)) return true;
  return false;
}

function refineReferenceTitle(text) {
  let t = cleanLine(text);

  t = t
    .replace("Classification societies – what why and how?", "Classification societies – what, why and how?")
    .replace("Classification societies - what why and how?", "Classification societies - what, why and how?")
    .replace(/^IMO:\s*MSC\.\/Circ\.1598/i, "IMO: MSC.1/Circ.1598")
    .replace(/\s+’/g, "’")
    .replace(/Seafarers\s+’/g, "Seafarers’")
    .replace(/Ships\s+’/g, "Ships’");

  t = t.replace(/\s+\./g, ".");
  t = t.replace(/^IMO\s+SOLAS$/i, "IMO: SOLAS");
  t = t.replace(/^IMO\s*:\s*ISM Code(?:\s+Company\.?)?$/i, "IMO: ISM Code");
  t = t.replace(/^IMO\s*:\s*SOLAS(?:\s+MSC\.47\(66\)\.?)?$/i, "IMO: SOLAS");
  t = t.replace(/^IMO\s+Resolution\s+/i, "IMO: Resolution ");

  if (/^IACS:\s*Rec\.\s*2001\/Rev\.2\s+2018\s+A guide to managing maintenance in accordance with the requirements of the/i.test(t)) {
    t = "IACS: Rec. 2001/Rev.2 2018 A guide to managing maintenance in accordance with the requirements of the ISM Code";
  }

  return t;
}

function parseGuidanceEntryStart(text) {
  const t = refineReferenceTitle(text);

  let m = t.match(/^(TMSA\s+KP[AI]\s+\d+[A-Z]?(?:\.\d+)*)(?:\.)?(?:\s+(.+))?$/i);
  if (m) {
    return {
      title: cleanLine(m[1]),
      content: t
    };
  }

  m = t.match(/^(IMO:\s+ISM Code)\b(.*)$/i);
  if (m) {
    return {
      title: cleanLine(m[1]),
      content: t
    };
  }

  return {
    title: t,
    content: t
  };
}

function isCompleteShortSourceTitle(title) {
  const t = refineReferenceTitle(title);

  return /^(IMO:\s+ISM Code|IMO\s+SOLAS|IMO:\s+SOLAS|IMO:\s+MARPOL|IMO:\s+STCW Code|IMO:\s+FSS Code|IMO:\s+IGF Code)$/i.test(t);
}

function titleLooksIncomplete(title) {
  const t = cleanLine(title);

  return (
    /\b(All|all|in|of|for|and|or|with|without|under|from|to|the|double-side|dedicated|protective|ballast|seawater)$/i.test(t)
    || /\(revised edition$/i.test(t)
  );
}

function looksLikeWrappedSourceTitle(text, current) {
  const t = cleanLine(text);
  if (!t || !current) return false;

  if (/^\d+(?:\.\d+)*\b/.test(t)) return false;
  if (/^[•\-–—]/.test(t)) return false;
  if (/^(The|This|These|Where|When|If|Shipowners|Operators|Crews|Each|A|An|In-service|Maintenance|Thickness|Guidance|Chapter)\b/i.test(t)) return false;

  const currentTitle = refineReferenceTitle(current.title);

  if (isCompleteShortSourceTitle(currentTitle)) return false;

  const titleFamily = /^(IMO:|IMO\/ILO:|IACS:|OCIMF|OCIMF\/ICS|ICS:|INTERTANKO:|UK MCA:|SIGTTO:|CDI:|ISO:|Nautical Institute:)/i.test(currentTitle);

  if (!titleFamily) return false;

  if (!titleLooksIncomplete(currentTitle)) return false;

  const titleContinuationStart = /^(and|or|of|for|to|in|on|with|without|by|under|from|Types?|Ships?|Carriers?|Tanks?|Spaces?|Documents?|Guidelines?|Code|Regulation|Systems?|Equipment|Tankers?|Survey|Surveys|Rev|Edition|Standard|Standards|Procedures|Certificates?|Management|Programme|Program|Formats?|Records?|Arrangements?|January|February|March|April|May|June|July|August|September|October|November|December)\b/i;

  return titleContinuationStart.test(t);
}

function cleanExtractedBlock(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line && !isPdfNoiseLine(line))
    .join("\n")
    .trim();
}

function isQuestionStart(line) {
  return cleanLine(line).match(/^(\d{1,2}\.\d{1,2}\.\d{1,3})\.\s+(.+)$/);
}

function isHardSection(line) {
  return /^(Short Question Text|Vessel Types|ROVIQ Sequence|Publications|Objective|Industry Guidance:?|Industry guidance:?|Industry Guidelines:?|Inspection Guidance\.?|Suggested Inspector Actions|Expected Evidence|Potential Grounds for a Negative Observation)$/i.test(cleanLine(line));
}


function isSourceStart(text) {
  const s = cleanLine(text);
  if (!s) return false;

  if (/^(TMSA\s+KP[AI]\s+\d+[A-Z]?(?:\.\d+)*)\b/i.test(s)) return true;

  if (/^(IMO\/ILO|IMO|ILO|IACS|OCIMF\/ICS|OCIMF\/INTERTANKO|OCIMF|ICS|INTERTANKO|UK MCA|SIGTTO|CDI|ISO|Nautical Institute)\s*:/i.test(s)) return true;

  if (/^(IMO Model Course|IMO Resolution|OCIMF A Guide|OCIMF Anchoring|OCIMF Guidance|OCIMF Recommendations|IACS Information Paper|IACS Recommendation)\b/i.test(s)) return true;

  return false;
}

function splitInlineSourceEntries(text) {
  const t = cleanLine(text);
  if (!t) return [];

  const sourceRx = /(TMSA\s+KP[AI]\s+\d+[A-Z]?(?:\.\d+)*\b|IMO\/ILO\s*:|IMO\s*:|ILO\s*:|IACS\s*:|OCIMF\/ICS\s*:|OCIMF\/INTERTANKO\s*:|OCIMF\s*:|ICS\s*:|INTERTANKO\s*:|UK MCA\s*:|SIGTTO\s*:|CDI\s*:|ISO\s*:|Nautical Institute\s*:|IMO Model Course\b|IMO Resolution\b|OCIMF A Guide\b|OCIMF Anchoring\b|OCIMF Guidance\b|OCIMF Recommendations\b|IACS Information Paper\b|IACS Recommendation\b)/ig;

  const positions = [];
  let m;

  while ((m = sourceRx.exec(t)) !== null) {
    const pos = m.index;
    const prev = pos > 0 ? t[pos - 1] : "";
    if (pos === 0 || /\s|[;:,.()]/.test(prev)) {
      positions.push(pos);
    }
  }

  const unique = Array.from(new Set(positions)).sort((a, b) => a - b);

  if (unique.length <= 1) return [t];

  const parts = [];

  for (let i = 0; i < unique.length; i++) {
    const start = unique[i];
    const end = unique[i + 1] ?? t.length;
    const part = cleanLine(t.slice(start, end));
    if (part) parts.push(part);
  }

  return parts;
}

function publicationStart(line) {
  return isSourceStart(line);
}

function guidanceStart(line) {
  const s = cleanLine(line);

  // Do not treat body text as a new guidance source.
  if (/^MARPOL\s+Annex\b/i.test(s)) return false;
  if (/^SOLAS\s+Chapter\b/i.test(s)) return false;
  if (/^Annex\s+[IVX]+\b/i.test(s)) return false;
  if (/^OCIMF\s+recommends\b/i.test(s)) return false;

  return isSourceStart(s);
}

function sectionLines(question, startRx, endRxList) {
  const lines = question.lines;
  const start = lines.findIndex((x) => startRx.test(cleanLine(x.text)));
  if (start < 0) return [];

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const t = cleanLine(lines[i].text);
    if (endRxList.some((rx) => rx.test(t))) {
      end = i;
      break;
    }
  }

  return lines.slice(start + 1, end).filter((x) => cleanLine(x.text));
}

function guidanceLinesForQuestion(question) {
  const explicit = sectionLines(
    question,
    /^Industry Guidance:?$/i,
    [/^Inspection Guidance\.?$/i, /^Suggested Inspector Actions$/i, /^Expected Evidence$/i, /^Potential Grounds for a Negative Observation$/i]
  );

  if (explicit.length) return explicit;

  const objectiveBlock = sectionLines(
    question,
    /^Objective$/i,
    [/^Inspection Guidance\.?$/i, /^Suggested Inspector Actions$/i, /^Expected Evidence$/i, /^Potential Grounds for a Negative Observation$/i]
  );

  const firstGuidanceLine = objectiveBlock.findIndex((row) => guidanceStart(row.text));

  if (firstGuidanceLine < 0) return [];

  return objectiveBlock.slice(firstGuidanceLine);
}

function mergeTitleEntries(lines, startDetector) {
  const entries = [];
  let current = null;

  for (const row of lines) {
    const baseText = cleanLine(row.text);
    if (!baseText) continue;
    if (/^None$/i.test(baseText)) continue;

    const parts = splitInlineSourceEntries(baseText);

    for (const partRaw of parts) {
      const text = refineReferenceTitle(partRaw);
      if (!text) continue;

      if (startDetector(text) || !current || parts.length > 1) {
        current = {
          text,
          pageStart: row.page,
          pageEnd: row.page
        };
        entries.push(current);
      } else {
        current.text = refineReferenceTitle(`${current.text} ${text}`);
        current.pageEnd = row.page;
      }
    }
  }

  return entries;
}

function splitGuidanceEntries(lines) {
  const entries = [];
  let current = null;

  for (const row of lines) {
    const baseText = cleanLine(row.text);
    if (!baseText || isPdfNoiseLine(baseText)) continue;

    const parts = splitInlineSourceEntries(baseText);

    for (const partRaw of parts) {
      const text = cleanLine(partRaw);
      if (!text) continue;

      if (guidanceStart(text) || !current || (parts.length > 1 && isSourceStart(text))) {
        const parsed = parseGuidanceEntryStart(text);

        current = {
          title: parsed.title,
          content: parsed.content,
          pageStart: row.page,
          pageEnd: row.page
        };

        entries.push(current);
        continue;
      }

      if (looksLikeWrappedSourceTitle(text, current)) {
        current.title = refineReferenceTitle(`${current.title} ${text}`);
      }

      current.content = cleanExtractedBlock(`${current.content}\n${text}`);
      current.pageEnd = row.page;
    }
  }

  return entries.map((entry) => ({
    ...entry,
    title: refineReferenceTitle(entry.title),
    content: cleanExtractedBlock(entry.content)
  }));
}

async function pageToLines(pdf, pageNo) {
  const page = await pdf.getPage(pageNo);
  const content = await page.getTextContent({ disableCombineTextItems: false });

  const items = content.items
    .map((it) => ({
      text: cleanLine(it.str),
      x: Number(it.transform?.[4] ?? 0),
      y: Number(it.transform?.[5] ?? 0)
    }))
    .filter((it) => it.text);

  items.sort((a, b) => {
    const y = b.y - a.y;
    if (Math.abs(y) > 2) return y;
    return a.x - b.x;
  });

  const lines = [];
  let current = null;

  for (const it of items) {
    if (!current || Math.abs(current.y - it.y) > 2.5) {
      current = {
        y: it.y,
        parts: [it.text]
      };
      lines.push(current);
    } else {
      current.parts.push(it.text);
    }
  }

  return lines
    .map((line) => cleanLine(line.parts.join(" ")))
    .filter((text) => text && !isPdfNoiseLine(text))
    .map((text) => ({ page: pageNo, text }));
}

async function main() {
  const pdfPath = arg("pdf", "");
  const outBase = arg("out", "tmp/sire-reference-preview");
  const from = normalizeQuestionNumber(arg("from", ""));
  const to = normalizeQuestionNumber(arg("to", ""));
  const limit = argInt("limit", 25);
  const maxPages = argInt("max-pages", 0);

  if (!pdfPath) {
    throw new Error('Missing --pdf path. Example: --pdf "data/SIRE 2.0 Question Library.pdf"');
  }

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({
    data: pdfBytes,
    disableWorker: true,
    useSystemFonts: true
  }).promise;

  const totalPages = maxPages ? Math.min(maxPages, pdf.numPages) : pdf.numPages;

  console.log(`PDF loaded: ${pdfPath}`);
  console.log(`Pages to scan: ${totalPages} / ${pdf.numPages}`);

  const allLines = [];
  for (let pageNo = 1; pageNo <= totalPages; pageNo++) {
    const pageLines = await pageToLines(pdf, pageNo);
    allLines.push(...pageLines);

    if (pageNo % 50 === 0) console.log(`Scanned page ${pageNo}/${totalPages}`);
  }

  const questions = [];
  let current = null;

  for (const row of allLines) {
    const q = isQuestionStart(row.text);

    if (q) {
      if (current) questions.push(current);

      current = {
        rawNumber: q[1],
        normalizedNumber: normalizeQuestionNumber(q[1]),
        firstLine: cleanLine(row.text),
        startPage: row.page,
        endPage: row.page,
        lines: [row]
      };
      continue;
    }

    if (current) {
      current.lines.push(row);
      current.endPage = row.page;
    }
  }

  if (current) questions.push(current);

  let filtered = questions;

  if (from) {
    filtered = filtered.filter((q) => q.normalizedNumber >= from);
  }

  if (to) {
    filtered = filtered.filter((q) => q.normalizedNumber <= to);
  }

  if (limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  const rows = [];

  for (const q of filtered) {
    const pubLines = sectionLines(
      q,
      /^Publications$/i,
      [/^Objective$/i, /^Industry Guidance:?$/i, /^Inspection Guidance\.?$/i]
    );

    const guideLines = guidanceLinesForQuestion(q);

    const publications = mergeTitleEntries(pubLines, publicationStart);
    const guidance = splitGuidanceEntries(guideLines);

    publications.forEach((entry, idx) => {
      rows.push({
        question_number: q.rawNumber,
        normalized_question_number: q.normalizedNumber,
        reference_type: "applicable_publication",
        sort_order: idx + 1,
        extracted_title: refineReferenceTitle(entry.text),
        extracted_section: "",
        extracted_subsection: "",
        extracted_content: "",
        raw_text: refineReferenceTitle(entry.text),
        normalized_key: normalizeKey(refineReferenceTitle(entry.text)),
        source_page_start: entry.pageStart,
        source_page_end: entry.pageEnd,
        confidence_score: "0.9000",
        extraction_notes: "Preview extraction only. Manual review required before staging."
      });
    });

    guidance.forEach((entry, idx) => {
      rows.push({
        question_number: q.rawNumber,
        normalized_question_number: q.normalizedNumber,
        reference_type: "industry_guidance",
        sort_order: idx + 1,
        extracted_title: refineReferenceTitle(entry.title),
        extracted_section: "",
        extracted_subsection: "",
        extracted_content: cleanExtractedBlock(entry.content),
        raw_text: cleanExtractedBlock(entry.content),
        normalized_key: normalizeKey(`industry_${entry.title}`),
        source_page_start: entry.pageStart,
        source_page_end: entry.pageEnd,
        confidence_score: "0.8500",
        extraction_notes: "Preview extraction only. Manual review required before staging."
      });
    });
  }

  fs.mkdirSync(path.dirname(outBase), { recursive: true });

  const jsonPath = `${outBase}.json`;
  const csvPath = `${outBase}.csv`;

  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  const headers = [
    "question_number",
    "normalized_question_number",
    "reference_type",
    "sort_order",
    "extracted_title",
    "extracted_section",
    "extracted_subsection",
    "extracted_content",
    "raw_text",
    "normalized_key",
    "source_page_start",
    "source_page_end",
    "confidence_score",
    "extraction_notes"
  ];

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))
  ].join("\n");

  fs.writeFileSync(csvPath, csv, "utf8");

  console.log(`Questions found in scanned pages: ${questions.length}`);
  console.log(`Questions included in preview: ${filtered.length}`);
  console.log(`Reference rows extracted: ${rows.length}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`CSV:  ${csvPath}`);
}

main().catch((err) => {
  console.error("Extraction preview failed:");
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
