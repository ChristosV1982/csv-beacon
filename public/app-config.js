// public/app-config.js
// Feature flags / runtime config.
//
// SAFE DEFAULT: keep Read-Only module exactly as today by using "json".
// Later you can switch to "db" without changing app.js or filters/UI.

window.APP_CONFIG = {
  // "json" or "db"
  QUESTIONS_SOURCE: "json",

  // JSON file used when QUESTIONS_SOURCE === "json"
  QUESTIONS_JSON_FILE: "sire_questions_all_columns_named.json",

  // Supabase connection (ONLY required when QUESTIONS_SOURCE === "db")
  // Fill these only when you switch to DB mode.
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  DB: {
    TABLE: "questions_master",
    SOURCE_TYPE: "SIRE",
    STATUS: "active",

    // Optional. Set to "" to disable version filtering.
    VERSION: "SIRE_2.0_QL"
  }
};
