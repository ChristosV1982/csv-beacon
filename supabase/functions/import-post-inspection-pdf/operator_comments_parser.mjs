const FIELD_HEADINGS = [
  ["immediate_cause", /^Immediate Cause\b/i],
  ["root_cause", /^Root Cause\b/i],
  ["corrective_action", /^Corrective Action\b/i],
  ["preventative_action", /^Preventative Action\b/i],
];

function textOf(line) {
  return typeof line === "string" ? line : String(line?.text || "");
}

function parseByline(line) {
  const text = String(line || "").trim();
  const ocimfTimestamp = text.match(
    /^(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s+by\s+(.+)$/i,
  );
  if (ocimfTimestamp) {
    return {
      timestamp: ocimfTimestamp[1].trim(),
      byline: ocimfTimestamp[2].trim(),
    };
  }

  const longTimestamp = text.match(
    /^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{2}:\d{2})\s+by\s+(.+)$/i,
  );
  if (longTimestamp) {
    return {
      timestamp: longTimestamp[1].trim(),
      byline: longTimestamp[2].trim(),
    };
  }

  return null;
}

function parseHeading(line) {
  const text = String(line || "").trim();
  for (const [field, heading] of FIELD_HEADINGS) {
    const match = text.match(heading);
    if (!match) continue;
    const suffix = text.slice(match[0].length);
    if (suffix.trim() && !/^\s*:/.test(suffix)) continue;
    const rest = suffix.replace(/^\s*:\s*/, "").trim();
    return { field, inlineText: rest };
  }
  return null;
}

function joinedValue(lines) {
  const value = lines
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
  return value || null;
}

function roundMetadata(text) {
  const combined = parseByline(text);
  if (combined) return combined;
  if (/^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
    return { timestamp: text, byline: null };
  }
  if (/^by\s+\S/i.test(text)) return { timestamp: null, byline: text.replace(/^by\s+/i, "").trim() };
  return null;
}

function isRoundMetadataStart(source, index) {
  if (!roundMetadata(textOf(source[index]).trim())) return false;
  // A standalone date in prose is not enough: a new round must lead to a heading.
  const following = source.slice(index + 1, index + 5).map(textOf).map((s) => s.trim()).filter(Boolean);
  return following.some((s, i) => parseHeading(s) && following.slice(0, i).every((v) => roundMetadata(v)));
}

/**
 * Parse all Operator Comments sections inside one already-bounded OCIMF
 * response block. The caller supplies response/question/report boundary rules.
 */
export function parseOperatorCommentSections(
  lines,
  { isBoundary = () => false } = {},
) {
  const source = Array.isArray(lines) ? lines : [];
  const sections = [];
  let continuation = -1;

  for (let i = 0; i < source.length; i++) {
    const markerText = textOf(source[i]).trim();
    const hasMarker = /^(?:Subsequent\s+)?Operator Comments\b/i.test(markerText);
    if (!hasMarker && i !== continuation) continue;

    const collected = {
      immediate_cause: [],
      root_cause: [],
      corrective_action: [],
      preventative_action: [],
    };
    let currentField = null;
    let timestamp = null;
    let byline = null;
    let j = hasMarker ? i + 1 : i;

    for (; j < source.length; j++) {
      const line = source[j];
      const text = textOf(line).trim();
      if (!text) continue;
      if (/^(?:Subsequent\s+)?Operator Comments\b/i.test(text)) break;
      if (currentField && isRoundMetadataStart(source, j)) {
        continuation = j;
        break;
      }
      if (isBoundary(line, j, source)) break;
      if (/^Operator Attachments\b/i.test(text)) break;
      if (/^(Inspector|Operator) uploaded photos$/i.test(text)) break;
      if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+\d{2}:\d{2}\s+uploaded by\b/i.test(text)) {
        break;
      }

      const parsedByline = parseByline(text);
      if (parsedByline && !currentField) {
        timestamp = parsedByline.timestamp;
        byline = parsedByline.byline;
        continue;
      }
      if (!currentField && /^\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) {
        timestamp = text;
        continue;
      }
      if (!currentField && /^by\s+\S/i.test(text)) {
        byline = text.replace(/^by\s+/i, "").trim();
        continue;
      }

      const heading = parseHeading(text);
      if (heading) {
        currentField = heading.field;
        if (heading.inlineText) collected[currentField].push(heading.inlineText);
        continue;
      }

      if (currentField) collected[currentField].push(text);
    }

    sections.push({
      immediate_cause: joinedValue(collected.immediate_cause),
      root_cause: joinedValue(collected.root_cause),
      corrective_action: joinedValue(collected.corrective_action),
      preventative_action: joinedValue(collected.preventative_action),
      timestamp,
      byline,
      page: Number(source[i]?.page || 0) || null,
      start_index: i,
      end_index: j,
    });

    i = Math.max(i, j - 1);
  }

  return sections;
}
