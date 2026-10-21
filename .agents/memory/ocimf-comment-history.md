---
name: OCIMF comment history boundaries
description: Preserve original operator responses and manual notes separately from imported future comment rounds.
---

The original four OCIMF response fields are the first/main response. Existing plain-text subcomments are manual legacy follow-up notes and must not be repurposed, serialized, or overwritten by imported later rounds.

**Why:** The user explicitly requires preservation of both while supporting multiple chronological OCIMF comment rounds and safe cumulative PDF re-imports.

**How to apply:** Append later imported rounds separately, retain previous content when recording a revision, and keep duplicate detection observation-specific rather than tied only to the source PDF file.
