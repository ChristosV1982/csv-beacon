// public/questions-source.js
// Loader abstraction for questions.
// - json mode: loads ./sire_questions_all_columns_named.json
// - db mode: loads from Supabase (public.questions_master) and returns payload objects
//
// Key goal: do not change UI/filters. Return the same question objects either way.

(function () {
  const cfg = window.APP_CONFIG || {};
  const mode = String(cfg.QUESTIONS_SOURCE || "json").toLowerCase().trim();

  function jsonFilename() {
    return cfg.QUESTIONS_JSON_FILE || "sire_questions_all_columns_named.json";
  }

  function requireSupabase() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error("DB mode enabled but SUPABASE_URL / SUPABASE_ANON_KEY are not set in app-config.js.");
    }
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("DB mode enabled but Supabase JS library is not loaded (supabase-js CDN missing).");
    }
  }

  function sbClient() {
    requireSupabase();
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  async function loadFromJsonArray() {
    const res = await fetch(`./${jsonFilename()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${jsonFilename()}: ${res.status} ${res.statusText}`);
    const data = await res.json();

    // expected: an array of question objects
    if (Array.isArray(data)) return data;

    // optional fallback if shape ever changes
    if (data && Array.isArray(data.questions)) return data.questions;
    if (data && Array.isArray(data.items)) return data.items;

    throw new Error("JSON root is not an array and no .questions/.items array found.");
  }

  async function loadFromDbArray() {
    const sb = sbClient();

    const table = cfg.DB?.TABLE || "questions_master";
    const sourceType = cfg.DB?.SOURCE_TYPE || "SIRE";
    const status = cfg.DB?.STATUS || "active";
    const version = String(cfg.DB?.VERSION ?? "").trim();

    let q = sb
      .from(table)
      .select("payload")
      .eq("source_type", sourceType)
      .eq("status", status);

    if (version) q = q.eq("version", version);

    // Pagination (safe)
    const pageSize = 1000;
    let from = 0;
    let out = [];

    while (true) {
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) throw error;

      const rows = data || [];
      for (const r of rows) out.push(r.payload);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return out;
  }

  // Compatibility with your current app.js call:
  // window.QUESTIONS_SOURCE.loadQuestions().then(resp=>resp.json()).then(data=>...)
  async function loadQuestions() {
    if (mode === "db") {
      const arr = await loadFromDbArray();
      return {
        ok: true,
        status: 200,
        async json() {
          return arr;
        }
      };
    }

    // default json mode returns a real Response
    return fetch(`./${jsonFilename()}`, { cache: "no-store" });
  }

  window.QUESTIONS_SOURCE = {
    mode,
    loadQuestions,
    // optional direct array API (not required by your app.js)
    getAll: async function () {
      return mode === "db" ? loadFromDbArray() : loadFromJsonArray();
    }
  };
})();
