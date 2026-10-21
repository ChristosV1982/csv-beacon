// Pure round classification shared by review and tests. No database/DOM writes.
export const ROUND_FIELDS = ["immediate_cause", "root_cause", "corrective_action", "preventative_action"];
export const normalizeCommentText = (value) => String(value ?? "").replace(/\u00a0/g, " ")
  .replace(/\s+/g, " ").trim().toLowerCase();

export async function contentFingerprint(entry) {
  const source = ROUND_FIELDS.map((key) => {
    const value = normalizeCommentText(entry[key]);
    return `${Array.from(value).length}:${value}`;
  }).join("");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// OCIMF timestamps have no timezone. Return a sortable local wall-clock string.
export function parseOcimfTimestamp(value) {
  const m = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, day, month, year, hour, minute, seconds = "00"] = m;
  const d = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +seconds));
  if (d.getUTCFullYear() !== +year || d.getUTCMonth() !== +month - 1 || d.getUTCDate() !== +day ||
      +hour > 23 || +minute > 59 || +seconds > 59) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:${seconds}`;
}

const metadataKey = (entry) => {
  const author = normalizeCommentText(entry.ocimf_author_raw ?? entry.comment_byline);
  const raw = entry.ocimf_timestamp_raw ?? entry.comment_timestamp;
  const timestamp = parseOcimfTimestamp(raw) || normalizeCommentText(raw);
  return author && timestamp ? `${author}\u001f${timestamp}` : null;
};
const hasContent = (entry) => ROUND_FIELDS.some((key) => String(entry?.[key] ?? "").trim());

export async function prepareCommentRounds(entries, rows, history) {
  const prepared = await Promise.all(entries.map(async (entry, index) => ({
    ...entry, content_fingerprint: await contentFingerprint(entry),
    source_order: Number(entry.comment_source_order ?? index),
    parsed_timestamp: parseOcimfTimestamp(entry.comment_timestamp),
  })));
  const mainFingerprints = new Map(await Promise.all(rows.map(async (row) => [String(row.id), await contentFingerprint(row)])));
  return { entries: prepared, mainFingerprints, history: history || [] };
}

export function classifyMatchedRounds(models, prepared) {
  let processingOrder = 0;
  const result = models.map((model) => ({
    ...model, action: null, classification: model.matchStatus === "ambiguous" ? "Ambiguous" : "Unmatched",
    revision: false, supersedes_id: null,
  }));
  const groups = new Map();
  for (const model of result) {
    if (!model.row) continue;
    const id = String(model.row.id);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(model);
  }
  for (const [id, group] of groups) {
    const known = prepared.history.filter((r) => String(r.observation_item_id) === id);
    const allDated = group.every((m) => m.entry.parsed_timestamp);
    group.sort((a, b) => allDated
      ? a.entry.parsed_timestamp.localeCompare(b.entry.parsed_timestamp) || a.entry.source_order - b.entry.source_order
      : a.entry.source_order - b.entry.source_order);
    let initialExists = known.length > 0 || hasContent(group[0].row);
    let receiptExists = known.some((r) => r.round_kind === "initial");
    for (const model of group) {
      model.processing_order = processingOrder++;
      const { entry, row } = model;
      if (!hasContent(entry)) { model.classification = "Unmatched"; model.reason = "No response text extracted"; continue; }
      const duplicate = known.find((r) => r.content_fingerprint === entry.content_fingerprint);
      if (duplicate) { model.classification = "Already imported"; continue; }
      const mainMatches = hasContent(row) && prepared.mainFingerprints.get(id) === entry.content_fingerprint;
      if (mainMatches) {
        model.classification = "Already imported";
        if (!receiptExists) {
          model.action = "initial_receipt";
          receiptExists = true;
          model.reason = "Record initial source metadata only; main response is unchanged";
        }
      } else if (!initialExists) {
        model.classification = "Initial response"; model.action = "initial"; initialExists = true; receiptExists = true;
      } else {
        const key = metadataKey(entry);
        const revision = key && known.filter((r) => metadataKey(r) === key).at(-1);
        model.classification = revision ? "Possible revision" : "New subsequent comment";
        model.action = "subsequent";
        model.revision = Boolean(revision);
        model.supersedes_id = revision?.id || null;
      }
      known.push({ ...entry, observation_item_id: id,
        ocimf_author_raw: entry.comment_byline, ocimf_timestamp_raw: entry.comment_timestamp,
        round_kind: model.action === "initial" || model.action === "initial_receipt" ? "initial" : "subsequent" });
    }
  }
  return result;
}
