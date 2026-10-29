---
name: Supabase function migration checks
description: Avoid partial SQL-definition transformations and test caller-visible risk reads under real RLS.
---

Normalize line endings before transforming SQL obtained from PostgreSQL function definitions, assert that each intended replacement occurred, and execute every affected function body after DDL validation.

**Why:** Hosted definitions can contain CRLF. A partial text replacement can change an outer aggregate while missing the corresponding inner projection; PostgreSQL may accept the function definition and fail only when the RPC executes.

**How to apply:** Test authenticated readback as well as preview calculation and snapshot creation. Do not infer browser access from successful management-role queries. Risk snapshot tables intentionally have no direct authenticated SELECT visibility; supplement existing access-controlled readers with narrow report-authorized RPCs, not broader table permissions.

Management API `read_only: true` executes as `supabase_read_only_user`, not necessarily the function owner or migration executor.

**Why:** Comparing that inspection identity with the `postgres` function owner incorrectly rejected an otherwise valid ownership preflight.

**How to apply:** Keep ownership checks separate from read-only inspection identity. If authorized to verify the normal executor, use an explicitly `BEGIN ... READ ONLY` transaction through the normal execution mode; never infer write authorization or browser permissions from the read-only identity.
