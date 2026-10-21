---
name: Hosted SIRE parser deployment
description: Deployment/version coordination for the Post-Inspection PDF importer.
---

The Post-Inspection PDF importer in Preview calls the hosted Supabase Edge Function; editing the local function source does not change what Preview executes. Keep the frontend's required `function_version` and the deployed function marker in lockstep, and verify the returned version before claiming parser changes are live.

**Why:** A prior multi-finding parser update remained local because Supabase CLI authorization was invalid, so Preview could continue running the older parser.

**How to apply:** Deploy only to the C.S.V. Beacon development/testing project, then verify the response marker before testing extraction. Publishing the Replit app does not deploy the Edge Function.

For an additive extraction mode, retain the existing general version contract and use a separate mode/capability marker unless the old and new frontends are being released together.

**Why:** Existing clients enforce an exact general marker. Changing it during a hosted-function-only rollout would disable their otherwise-compatible PDF actions before the frontend is published.

**How to apply:** Require the new capability marker in the new action; do not invalidate existing initial-import, findings-replacement or photo actions merely to identify an additive mode.
