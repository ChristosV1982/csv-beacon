// public/app-config.js
// Runtime config / feature flags for the front-end.
//
// IMPORTANT:
// - "json" mode: loads questions from a local JSON file in /public.
// - "db" mode: loads questions from Supabase table public.questions_master (payload objects).
//
// Your UI/filters do NOT change because app.js always receives the same question objects array.

window.APP_CONFIG = {
  // ---------------------------------------------------------------------------
  // Feature flag: choose where questions are loaded from
  //   "json"  -> ./sire_questions_all_columns_named.json
  //   "db"    -> Supabase public.questions_master (payload)
  // ---------------------------------------------------------------------------
  QUESTIONS_SOURCE: "db",

  // JSON file used when QUESTIONS_SOURCE === "json"
  QUESTIONS_JSON_FILE: "sire_questions_all_columns_named.json",

  // ---------------------------------------------------------------------------
  // Supabase connection (ONLY required when QUESTIONS_SOURCE === "db")
  //
  // You MUST fill these with your project's values:
  // - SUPABASE_URL looks like: https://xxxxxxxxxxxxxxxxxxxx.supabase.co
  // - SUPABASE_ANON_KEY is the long JWT-like string from Supabase project settings
  // ---------------------------------------------------------------------------
  SUPABASE_URL: "https://bdidrcyufazskpuwmfca.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ",

  // ---------------------------------------------------------------------------
  // DB query settings used by public/questions-source.js when in DB mode
  // ---------------------------------------------------------------------------
  DB: {
    // Table that stores master questions (your importer inserts here)
    TABLE: "questions_master",

    // Filter the correct source set
    SOURCE_TYPE: "SIRE",

    // Filter active rows only
    STATUS: "active",

    // Optional version tag filter (recommended).
    // If you want to disable version filtering completely, set VERSION: ""
    VERSION: "SIRE_2.0_QL"
  }
};
