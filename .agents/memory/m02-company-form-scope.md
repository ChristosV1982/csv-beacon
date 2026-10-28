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

Company attendance wording is Company-defined and must remain exactly as supplied, separate from SIRE content. Unanswered checks stay distinct from N/S and N/A.

**Why:** The user supplied exactly 51 attendance items and requested faithful save/reopen semantics, not inferred answers or additional Company requirements.

**How to apply:** Preserve the supplied wording, separate Company/SIRE progress, and blank values during saves. Supporting evidence is optional and private, with at most five files and 10 MB combined per individual question/item; deletion requires an editable Draft.

Use “Question Remarks” for the M02 SIRE free-text field. “Not checked” is derived from no selected response, never a selectable SIRE answer. Display Yes/No/Not Applicable/Not Seen while retaining Yes/No/N/A/N/S internally.

**Why:** The user explicitly refined this terminology and response distinction.

**How to apply:** Keep blank/null unanswered independently of explicit N/S (“Not Seen”), including Appendix 3 and progress. Auto-growing remarks must not transform saved text.

The controlled Company form is **M02 · Ship Inspection Report · Version 09 · 23.06.2026**.

**Why:** The user explicitly supplied the current controlled identity; the completed 2025 sample is not the source of the current form version.

**How to apply:** Keep the controlled identity centrally configurable and reuse it in module/report footers and future print/PDF/export footers. Do not confuse it with software build markers, report dates or the SIRE library version; change it only when instructed.

M02 is View-allowed by default for all Office roles, including legacy Office users and new Office categories. This adds M02 View to the earlier nine-module Office/Demo view-only baseline.

**Why:** The user explicitly broadened M02 visibility after its initial Super-Admin-only rollout, without broadly granting Edit, Export or Admin.

**How to apply:** Use ordinary Rights Matrix/Access Profile grants, preserving explicit denials, personal overrides, company enablement and normal vessel scope. Keep Super Admin access and Vessel/Inspector access unchanged.

Completion requires explicit answers in every implemented response-based section. Part 3 requires Yes/No/N/S; Part 4 requires Yes/No/N/A/N/S. N/S and N/A are answered, while blank/null is Remaining. Draft saves must remain available with missing answers.

**Why:** The user requires completion tracking and a hard completion gate, not a new approval workflow.

**How to apply:** Keep section/chapter counters live and Appendix 3 derived. Add future response-based sections to frontend and server completion registries only when implemented; do not require unimplemented Appendix 2 placeholders. Validate the final transaction state because versioned saves persist different sections in multiple steps. Do not rewrite existing Completed records.
