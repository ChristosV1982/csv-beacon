// public/question_library_loader.js
// Loads the question library JSON from ONE locked filename (no multi-candidate guessing).

export async function loadLockedLibraryJson(lockedPath) {
  if (!lockedPath || typeof lockedPath !== "string") {
    throw new Error("Locked JSON path is missing. Set LOCKED_LIBRARY_JSON in q-company.js.");
  }

  const res = await fetch(lockedPath, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Could not load question library JSON at: ${lockedPath} (HTTP ${res.status}).`
    );
  }

  const data = await res.json();

  // Accept either:
  // 1) Array of question objects
  // 2) { questions: [...] }
  const questions = Array.isArray(data) ? data : (Array.isArray(data?.questions) ? data.questions : null);

  if (!Array.isArray(questions)) {
    throw new Error(
      `Unexpected JSON format in ${lockedPath}. Expected an array or { questions: [...] }.`
    );
  }

  return questions;
}
