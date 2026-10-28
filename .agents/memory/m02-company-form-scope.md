---
name: M02 Company form scope
description: Product constraints for evolving the electronic Company M02 inspection report.
---

M02 replaces Company Form M02; do not invent Company requirements, approval rules, generated narratives or score formulas.

**Why:** The user explicitly requested an electronic Company form rather than a new inspection standard.

**How to apply:** Extend only confirmed Company fields and workflows. Reuse the existing SIRE library, with Oil applicability including mixed-token questions and Photo Response=Y excluded. Keep M02 answers separate from the library and from read-only fleet historical observations; never copy those observations into an answer automatically.

The M02 Company Fleet Record defaults to a fixed rolling 18-month inspection-date window, not all available history. Use the saved report's context date (report date, inspection end/start fallback), or the current date for a new report. Keep the awareness-only projection and collapsed-by-default panels.

**Why:** The user explicitly changed the M02 fleet-history requirement to the last 18 months; wider selectable history is not required.

**How to apply:** Apply the same inclusive date window to displayed rows and totals. Do not broaden the shared Fleet Vetting Experience module's filters or copy history into M02 answers.
