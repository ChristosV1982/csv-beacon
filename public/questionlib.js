// public/questionlib.js

export const QUESTION_LIBRARY_CANDIDATES = [
  "./questions.json",
  "./question_library.json",
  "./library.json",
  "./sire2_questions.json",
  "./data/questions.json",
  "./data/question_library.json",
  "./data/library.json"
];

export function parseDottedNumber(str) {
  return String(str ?? "")
    .split(".")
    .map(s => parseInt(s, 10))
    .filter(n => Number.isFinite(n));
}

export function compareDotted(a, b) {
  const A = parseDottedNumber(a);
  const B = parseDottedNumber(b);
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function tryFetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  return { url, data };
}

export async function loadQuestionLibrary() {
  for (const candidate of QUESTION_LIBRARY_CANDIDATES) {
    try {
      const r = await tryFetchJson(candidate);
      if (!r) continue;

      const raw = r.data;
      let questions = null;

      if (Array.isArray(raw)) {
        questions = raw;
      } else if (raw && Array.isArray(raw.questions)) {
        questions = raw.questions;
      } else if (raw && typeof raw === "object") {
        const values = Object.values(raw);
        if (values.length && typeof values[0] === "object") questions = values;
      }

      if (Array.isArray(questions) && questions.length) {
        const norm = questions
          .map(q => {
            const question_no =
              q["No."] ?? q.no ?? q.question_no ?? q.questionNo ?? q.question_number;
            return { ...q, question_no: String(question_no ?? "") };
          })
          .filter(q => q.question_no);

        return { url: r.url, questions: norm };
      }
    } catch {
      // try next
    }
  }

  throw new Error(
    "Could not load question library JSON. Expected one of: " +
      QUESTION_LIBRARY_CANDIDATES.join(", ")
  );
}

export function buildFilterOptions(questions) {
  const uniq = arr =>
    Array.from(new Set(arr.filter(Boolean).map(String))).sort((a, b) =>
      a.localeCompare(b)
    );

  return {
    chapters: uniq(questions.map(q => q.Chap ?? q.chapter ?? q.chap)),
    sections: uniq(questions.map(q => q["Section Name"] ?? q.section_name ?? q.section)),
    types: uniq(questions.map(q => q["Question Type"] ?? q.question_type ?? q.type)),
    riskLevels: uniq(questions.map(q => q["Risk Level"] ?? q.risk_level ?? q.risk)),
    roviq: uniq(questions.map(q => q["ROVIQ List"] ?? q.roviq_list ?? q.roviq)),
    vesselTypes: uniq(questions.map(q => q["Vessel Type"] ?? q.vessel_type)),
    companyRanks: uniq(
      questions.map(q => q["Company Rank Allocation"] ?? q.company_rank_allocation)
    )
  };
}

export function applyFilters(questions, filters) {
  const term = String(filters.term ?? "").trim().toLowerCase();

  return questions.filter(q => {
    const chap = String(q.Chap ?? q.chapter ?? q.chap ?? "");
    const section = String(q["Section Name"] ?? q.section_name ?? q.section ?? "");
    const type = String(q["Question Type"] ?? q.question_type ?? q.type ?? "");
    const risk = String(q["Risk Level"] ?? q.risk_level ?? q.risk ?? "");
    const roviq = String(q["ROVIQ List"] ?? q.roviq_list ?? q.roviq ?? "");
    const vesselType = String(q["Vessel Type"] ?? q.vessel_type ?? "");
    const companyRank = String(q["Company Rank Allocation"] ?? q.company_rank_allocation ?? "");

    if (filters.chapter && chap !== String(filters.chapter)) return false;
    if (filters.section && section !== String(filters.section)) return false;
    if (filters.type && type !== String(filters.type)) return false;
    if (filters.risk && risk !== String(filters.risk)) return false;
    if (filters.roviq && !roviq.includes(String(filters.roviq))) return false;
    if (filters.vesselType && !vesselType.includes(String(filters.vesselType))) return false;
    if (filters.companyRank && companyRank !== String(filters.companyRank)) return false;

    if (term) {
      const hay = (
        q.question_no +
        " " +
        (q["Short Text"] ?? "") +
        " " +
        (q.Question ?? q.question ?? "") +
        " " +
        section +
        " " +
        roviq
      ).toLowerCase();
      if (!hay.includes(term)) return false;
    }

    return true;
  });
}

export function getPgnoBullets(question) {
  if (!question) return [];
  if (Array.isArray(question.NegObs_Bullets) && question.NegObs_Bullets.length)
    return question.NegObs_Bullets;

  const raw =
    question["Potential Grounds for Negative Observations"] ?? question.pgno ?? "";
  if (!raw) return [];

  return String(raw)
    .split(/\n|\r|•/g)
    .map(s => s.trim())
    .filter(s => s);
}
