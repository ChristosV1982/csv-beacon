// public/app-config.js
// Runtime configuration / feature flags.
// This file MUST define window.APP_CONFIG (questions-source.js reads from it).

window.APP_CONFIG = {
  // Data source:
  // - "json": load ./sire_questions_all_columns_named.json
  // - "db"  : load from Supabase public.questions_master (payload column)
  QUESTIONS_SOURCE: "db",

  // Used ONLY when QUESTIONS_SOURCE === "json"
  QUESTIONS_JSON_FILE: "sire_questions_all_columns_named.json",

  // Supabase connection (required ONLY when QUESTIONS_SOURCE === "db")
  SUPABASE_URL: "https://bdidrcyufazskpuwmfca.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaWRyY3l1ZmF6c2twdXdtZmNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NDI4ODMsImV4cCI6MjA4MzUxODg4M30.Uqj4WCzoNS9wnlzI-xew6iTFzTUi77dcGeBjUgFjZbQ",

  // DB query settings used by public/questions-source.js in DB mode
  DB: {
    TABLE: "questions_master",

    // Filters
    SOURCE_TYPE: "SIRE",       // e.g. "SIRE" or "COMPANY"
    STATUS: "active",          // e.g. "active" or "inactive"
    VERSION: "SIRE_2.0_QL",    // set "" to disable version filtering

    // ✅ COLUMN MAPPING (THIS REMOVES THE NEED FOR YOU TO “ANSWER #4”)
    // If your real DB columns differ, you only change these values.
    COLS: {
      ID: "id",
      PAYLOAD: "payload",
      SOURCE: "source_type",
      STATUS: "status",
      VERSION: "version",
      UPDATED_AT: "updated_at" // optional; can be "" if not present
    }
  },

  // ✅ Photos (we will proceed with this now)
  PHOTOS: {
    BUCKET: "question-photos",   // create this bucket in Supabase Storage
    PUBLIC: true                 // simplest to start; later we can switch to private + signed URLs
  }
};
