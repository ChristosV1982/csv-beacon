// Human PIFs remain attributes of one finding, never extra observation rows.
const text = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const key = (value) => text(value).normalize("NFKC").toLowerCase();
const responsePhrase = /^(?:not as expected|largely as expected|as expected|exceeded normal expectation)\.?$/i;

export function uniquePifs(values) {
  const seen = new Set();
  return values.map(text).filter((value) => {
    if (!value || seen.has(key(value))) return false;
    seen.add(key(value));
    return true;
  });
}

export function humanPifsFromItem(item) {
  const values = String(item?.classification_coding || "").split("|");
  // Older manual saves also placed PIFs in nature_of_concern. Do not mistake
  // the normal imported Human response phrase for a PIF.
  values.push(...String(item?.nature_of_concern || "").split("|")
    .filter((value) => !responsePhrase.test(text(value))));
  return uniquePifs(values);
}

const escape = (value) => String(value ?? "").replace(/[&<>"']/g,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function renderHumanPifList(item) {
  const values = humanPifsFromItem(item);
  if (!values.length) return "—";
  return `<ul class="csvb-human-pif-list">${values.map((value) =>
    `<li>${escape(value)}</li>`).join("")}</ul>`;
}
