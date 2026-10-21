const STYLE_ID = "ocimf-comment-round-history-styles";
const RPC_NAME = "csvb_post_inspection_comment_rounds_for_me";

const ROUND_FIELDS = [
  ["Immediate cause", "immediate_cause"],
  ["Root cause", "root_cause"],
  ["Corrective action", "corrective_action"],
  ["Preventative action", "preventative_action"],
];

const renderTokens = new WeakMap();

function parsedTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  // Database column is a timezone-free OCIMF wall clock; UTC here is only a
  // comparison coordinate, not a claim about the source's timezone.
  const time = Date.parse(`${value.replace(/Z$/, "")}Z`);
  return Number.isFinite(time) ? time : null;
}

function importedTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function finiteOrder(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareNullableNumbers(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Sort rounds chronologically when every row has a usable OCIMF timestamp.
 * If any timestamp is missing or malformed, use import time and source order.
 * The input array and its rows are never modified.
 */
export function sortCommentRounds(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const indexed = source.map((row, index) => ({ row, index }));
  const allChronological = indexed.length > 0 &&
    indexed.every(({ row }) => parsedTimestamp(row?.ocimf_timestamp) !== null);

  indexed.sort((a, b) => {
    if (allChronological) {
      const byCommentDate = parsedTimestamp(a.row.ocimf_timestamp) -
        parsedTimestamp(b.row.ocimf_timestamp);
      if (byCommentDate !== 0) return byCommentDate;
    } else {
      const importedA = importedTimestamp(a.row?.imported_at);
      const importedB = importedTimestamp(b.row?.imported_at);
      const byImportDate = compareNullableNumbers(importedA, importedB);
      if (byImportDate !== 0) return byImportDate;

      const orderA = finiteOrder(a.row?.source_order);
      const orderB = finiteOrder(b.row?.source_order);
      const bySourceOrder = compareNullableNumbers(orderA, orderB);
      if (bySourceOrder !== 0) return bySourceOrder;
    }
    return a.index - b.index;
  });

  return indexed.map(({ row }) => row);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ocimf-round-history {
      --orh-ink: #163b5c;
      --orh-muted: #5d7184;
      --orh-line: #d5e0e9;
      --orh-paper: #f5f8fb;
      --orh-accent: #28719a;
      color: var(--orh-ink);
      font-family: inherit;
      font-size: 13px;
      line-height: 1.45;
      margin: 12px 0 4px;
      width: 100%;
    }
    .ocimf-round-history, .ocimf-round-history * { box-sizing: border-box; }
    .ocimf-round-history__heading {
      align-items: baseline;
      border-bottom: 1px solid var(--orh-line);
      display: flex;
      gap: 8px;
      justify-content: space-between;
      margin: 0 0 8px;
      padding: 0 0 6px;
    }
    .ocimf-round-history__title {
      color: var(--orh-ink);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: .01em;
      margin: 0;
    }
    .ocimf-round-history__hint {
      color: var(--orh-muted);
      font-size: 11px;
      margin: 0;
      text-align: right;
    }
    .ocimf-round-history__state {
      background: var(--orh-paper);
      border: 1px solid var(--orh-line);
      border-radius: 4px;
      color: var(--orh-muted);
      margin: 0;
      padding: 9px 10px;
    }
    .ocimf-round-history__state--error {
      border-left: 3px solid #a54444;
      color: #743d3d;
    }
    .ocimf-round-history__retry {
      background: #e8f0f6;
      border: 1px solid #c6d7e4;
      border-radius: 3px;
      color: var(--orh-ink);
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      margin: 8px 0 0;
      min-height: 34px;
      padding: 6px 10px;
    }
    .ocimf-round-history__retry:hover { background: #dce9f2; }
    .ocimf-round-history__retry:focus-visible {
      outline: 2px solid var(--orh-accent);
      outline-offset: 2px;
    }
    .ocimf-round-history__list {
      display: grid;
      gap: 8px;
    }
    .ocimf-round-history__round {
      background: #f8fafc;
      border: 1px solid var(--orh-line);
      border-left: 3px solid #789bb5;
      border-radius: 4px;
      min-width: 0;
      padding: 8px 10px 9px;
    }
    .ocimf-round-history__meta {
      align-items: baseline;
      display: flex;
      flex-wrap: wrap;
      gap: 3px 8px;
      margin-bottom: 7px;
    }
    .ocimf-round-history__date {
      color: var(--orh-ink);
      font-size: 12px;
      font-weight: 700;
    }
    .ocimf-round-history__author {
      color: var(--orh-muted);
      font-size: 12px;
    }
    .ocimf-round-history__revision {
      background: #e9f0f5;
      border-radius: 2px;
      color: #355873;
      font-size: 10px;
      margin-left: auto;
      padding: 2px 5px;
    }
    .ocimf-round-history__responses {
      display: grid;
      gap: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
    }
    .ocimf-round-history__response { min-width: 0; }
    .ocimf-round-history__response dt {
      color: var(--orh-muted);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .045em;
      margin: 0 0 1px;
      text-transform: uppercase;
    }
    .ocimf-round-history__response dd {
      color: #263e53;
      font-size: 12px;
      margin: 0;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .ocimf-round-history__response dd.is-empty { color: #8292a0; font-style: italic; }
    @media (max-width: 520px) {
      .ocimf-round-history__heading { align-items: flex-start; flex-direction: column; gap: 1px; }
      .ocimf-round-history__hint { text-align: left; }
      .ocimf-round-history__responses { grid-template-columns: minmax(0, 1fr); gap: 7px; }
      .ocimf-round-history__revision { margin-left: 0; }
    }
  `;
  document.head.append(style);
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function ensureRoot(container) {
  ensureStyles();
  const root = makeElement("section", "ocimf-round-history");
  root.setAttribute("aria-live", "polite");
  root.setAttribute("aria-label", "Subsequent OCIMF Comments history");
  container.replaceChildren(root);

  const heading = makeElement("div", "ocimf-round-history__heading");
  heading.append(makeElement("h3", "ocimf-round-history__title", "Subsequent OCIMF Comments history"));
  root.append(heading);
  return { root, heading };
}

function displayTimestamp(row) {
  const raw = row?.ocimf_timestamp_raw;
  if (typeof raw === "string" && raw.trim()) return raw;
  const time = parsedTimestamp(row?.ocimf_timestamp);
  if (time !== null) {
    return row.ocimf_timestamp.replace("T", " ");
  }
  return "Date not recorded";
}

function renderRounds(root, rounds, chronological) {
  const heading = root.firstElementChild;
  if (!chronological) {
    heading.append(makeElement(
      "p",
      "ocimf-round-history__hint",
      "Date order unavailable; shown in import/source order.",
    ));
  }

  const list = makeElement("div", "ocimf-round-history__list");
  for (const round of rounds) {
    const article = makeElement("article", "ocimf-round-history__round");
    const meta = makeElement("div", "ocimf-round-history__meta");
    meta.append(makeElement("time", "ocimf-round-history__date", displayTimestamp(round)));
    const author = typeof round?.ocimf_author_raw === "string" && round.ocimf_author_raw.trim()
      ? round.ocimf_author_raw
      : "Author not recorded";
    meta.append(makeElement("span", "ocimf-round-history__author", `By ${author}`));
    if (round?.supersedes_id !== null && round?.supersedes_id !== undefined && round.supersedes_id !== "") {
      meta.append(makeElement("span", "ocimf-round-history__revision", `Revises round ${String(round.supersedes_id)}`));
    }
    article.append(meta);

    const responses = makeElement("dl", "ocimf-round-history__responses");
    for (const [label, field] of ROUND_FIELDS) {
      const item = makeElement("div", "ocimf-round-history__response");
      item.append(makeElement("dt", "", label));
      const value = typeof round?.[field] === "string" && round[field].trim()
        ? round[field]
        : "No text recorded";
      const text = makeElement("dd", value === "No text recorded" ? "is-empty" : "", value);
      item.append(text);
      responses.append(item);
    }
    article.append(responses);
    list.append(article);
  }
  root.append(list);
}

function renderError(container, message, retry) {
  const { root } = ensureRoot(container);
  const state = makeElement("div", "ocimf-round-history__state ocimf-round-history__state--error");
  state.setAttribute("role", "alert");
  state.append(makeElement("p", "", message));
  const button = makeElement("button", "ocimf-round-history__retry", "Try again");
  button.type = "button";
  button.addEventListener("click", retry, { once: true });
  state.append(button);
  root.append(state);
}

/**
 * Read and render subsequent imported OCIMF comment rounds for one observation item.
 * This renderer is strictly read-only; it never changes a response or legacy note.
 */
export async function renderOcimfCommentRoundHistory({ supabase, reportId, itemId, container }) {
  if (!container || typeof container.replaceChildren !== "function") {
    throw new TypeError("A valid history container element is required.");
  }

  const token = {};
  renderTokens.set(container, token);
  const { root } = ensureRoot(container);
  root.append(makeElement("p", "ocimf-round-history__state", "Loading subsequent OCIMF comments…"));

  const retry = () => renderOcimfCommentRoundHistory({ supabase, reportId, itemId, container });
  if (!supabase || typeof supabase.rpc !== "function") {
    renderError(container, "Comment history is unavailable: the read-only service is not configured.", retry);
    return;
  }

  try {
    const { data, error } = await supabase.rpc(RPC_NAME, { p_report_id: reportId });
    if (renderTokens.get(container) !== token) return;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("The comment history response was not a list.");

    const itemRounds = data.filter((row) =>
      row &&
      String(row.observation_item_id) === String(itemId) &&
      row.round_kind === "subsequent"
    );
    const chronological = itemRounds.length > 0 &&
      itemRounds.every((row) => parsedTimestamp(row.ocimf_timestamp) !== null);
    const sorted = sortCommentRounds(itemRounds);
    const { root: resultRoot } = ensureRoot(container);

    if (sorted.length === 0) {
      resultRoot.append(makeElement(
        "p",
        "ocimf-round-history__state",
        "No subsequent OCIMF comments have been imported for this observation item.",
      ));
      return;
    }
    renderRounds(resultRoot, sorted, chronological);
  } catch (error) {
    if (renderTokens.get(container) !== token) return;
    const detail = error && typeof error.message === "string" && error.message.trim()
      ? ` ${error.message.trim()}`
      : "";
    renderError(container, `Could not load OCIMF comment history.${detail}`, retry);
  }
}
