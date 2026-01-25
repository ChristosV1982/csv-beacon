// public/app-config.js
// Feature flags / runtime config.
//
// Goal:
// - Keep Read-Only module behavior unchanged.
// - Allow switching the questions source between the existing JSON file and Supabase DB
//   without touching app.js or any UI/filter logic.
//
// IMPORTANT:
// - Use "json" to preserve current behavior exactly.
// - Use "db" only after you have verified DB loading end-to-end.

window.APP_CONFIG = {
  // Allowed values: "json" | "db"
  // SAFEST DEFAULT (keeps existing Read-Only module exactly as today):
  QUESTIONS_SOURCE: "json",

  // JSON file used when QUESTIONS_SOURCE === "json"
  QUESTIONS_JSON_FILE: "sire_questions_all_columns_named.json",

  // Supabase connection (required only when QUESTIONS_SOURCE === "db")
  // Leave blank while in "json" mode.
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // DB source settings (used when QUESTIONS_SOURCE === "db")
  DB: {
    TABLE: "questions_master",

    // Filter rows in DB by these values
    SOURCE_TYPE: "SIRE",
    STATUS: "active",

    // Optional version filter. Set to "" to disable.
    VERSION: "SIRE_2.0_QL"
  }
};
