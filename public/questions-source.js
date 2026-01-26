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

    if (Array.isArray(data)) return data;
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

    // Column mapping (so we don't need you to confirm schema now)
    const C = cfg.DB?.COLS || {};
    const colId = C.ID || "id";
    const colPayload = C.PAYLOAD || "payload";
    const colSource = C.SOURCE || "source_type";
    const colStatus = C.STATUS || "status";
    const colVersion = C.VERSION || "version";

    // We always return only the payload objects for compatibility
    const selectCols = `${colPayload}`;

    let q = sb.from(table).select(selectCols);

    // Apply filters only if the mapped columns exist in your DB
    // (If a column name is wrong, Supabase will throw; then you adjust DB.COLS.* in app-config.js.)
    q = q.eq(colSource, sourceType).eq(colStatus, status);
    if (version) q = q.eq(colVersion, version);

    // Pagination
    const pageSize = 1000;
    let from = 0;
    let out = [];

    while (true) {
      const { data, error } = await q.range(from, from + pageSize - 1);
      if (error) throw error;

      const rows = data || [];
      for (const r of rows) out.push(r[colPayload]);

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return out;
  }

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

    return fetch(`./${jsonFilename()}`, { cache: "no-store" });
  }

  window.QUESTIONS_SOURCE = {
    mode,
    loadQuestions,
    getAll: async function () {
      return mode === "db" ? loadFromDbArray() : loadFromJsonArray();
    }
  };
})();
