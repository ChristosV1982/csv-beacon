---
name: Vessel and account governance
description: Agreed vessel lifecycle boundaries, administrative reason privacy and staged account governance.
---

Vessel lifecycle has only Active / Inactive. Commercial reasons and internal remarks belong only in restricted administration, never normal vessel selectors or vessel-facing modules.

**Why:** The user explicitly agreed a simple operational status separate from the actual administrative reason for inactivity.

**How to apply:** Extend the existing Superuser Administration foundation, not a second registry. Treat company transfer and hard deletion as separate operations, and preserve history when status changes.

Step 1 changes vessel lifecycle status only. It must not automatically disable accounts, change onboard/embarkation state, revoke sessions, reset passwords or alter historical module data.

**Why:** The user requires vessel/account governance to be built step-by-step, with account consequences agreed in a later step.

**How to apply:** Do not infer account suspension from vessel inactivity. Keep existing active-vessel operational selection behavior separate from historical/reporting access and later account-governance rules.
