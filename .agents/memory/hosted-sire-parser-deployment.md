---
name: Hosted SIRE parser deployment
description: Deployment/version coordination for the Post-Inspection PDF importer.
---

The Post-Inspection PDF importer in Preview calls the hosted Supabase Edge Function; editing the local function source does not change what Preview executes. Keep the frontend's required `function_version` and the deployed function marker in lockstep, and verify the returned version before claiming parser changes are live.

**Why:** A prior multi-finding parser update remained local because Supabase CLI authorization was invalid, so Preview could continue running the older parser.

**How to apply:** Deploy only to the C.S.V. Beacon development/testing project, then verify the response marker before testing extraction. Publishing the Replit app does not deploy the Edge Function.
