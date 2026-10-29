---
name: C.S.V. Beacon Supabase environment
description: User confirmation about the C.S.V. Beacon project's linked Supabase environment.
---

The user confirmed on October 15, 2026 that the linked Supabase project is isolated development/testing, not production.

The user explicitly clarified the environment identities on October 29, 2026:
- Testing application: `https://sire-2-0-questionnaire-2026.replit.app`, using testing Supabase project `bdidrcyufazskpuwmfca`.
- Separate protected production application: `https://sire-platform-christosv1982v163.replit.app/`.
- Changes authorized for the named testing database are intended to affect the published testing application. Do not treat its published URL as the separate protected production application or raise unrelated project-isolation questions.

**Why:** the project display name does not identify its environment, so a direct confirmation was needed before database changes.

**How to apply:** Before applying migrations, verify the current linked project still corresponds to this development/testing environment. Do not assume another linked project or environment is safe.
