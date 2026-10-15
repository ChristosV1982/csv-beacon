---
name: Post-inspection officer field read-back
description: Compatibility note about officer-name fields and narrow report RPC return shapes.
---

The live `post_inspection_reports` table contains `master_name_at_inspection` and `chief_engineer_name_at_inspection`, but the access-controlled report-by-ID and report-list RPC results were observed omitting both fields. Direct table inserts/updates can therefore succeed while RPC-based page reloads show blanks.

**Why:** A later header save or full PDF import can send `null` from blank inputs and erase values that were successfully stored, making a read-contract mismatch look like a write failure.

**How to apply:** When these fields appear missing, verify the access-controlled RPC output shape in addition to the table schema. A frontend compatibility read should select only the two columns, scoped to an already-authorized report ID, and omit unverified officer fields from updates unless the user explicitly edits them.
