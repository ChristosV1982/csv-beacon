---
name: Vessel and account governance
description: Agreed vessel lifecycle boundaries, administrative reason privacy and staged account governance.
---

User-account deletion must never delete vessel records. Delete only explicitly selected accounts after confirmation showing usernames, roles, vessels and count. Bulk cleanup is vessel-role only; exclude Office/platform accounts and the signed-in administrator.

**Why:** The user approved practical bulk vessel-account cleanup while preserving every vessel, Office account and business record.

**How to apply:** Archive minimal identity and exact onboard-access history before Auth deletion. Only recipient-owned thread notifications are disposable; preserve messages and business actor UUIDs. Keep resumable results. Use dedicated temporary development-test accounts, not automatically selected legacy users, for destructive verification.

Vessel lifecycle has only Active / Inactive. Commercial reasons and internal remarks belong only in restricted administration, never normal vessel selectors or vessel-facing modules.

**Why:** The user explicitly agreed a simple operational status separate from the actual administrative reason for inactivity.

**How to apply:** Extend the existing Superuser Administration foundation, not a second registry. Treat company transfer and hard deletion as separate operations, and preserve history when status changes.

Vessel particulars editing must preserve the vessel UUID, company assignment and current lifecycle status. Keep company transfer and activation/deactivation outside the particulars editor.

**Why:** The general Add/Update path also writes status and invokes transfer logic. Passing a status copied when the editor opened can undo a later lifecycle transition even if no status input is shown.

**How to apply:** Use an update-only particulars operation with no company/status parameters. Read-only form controls alone are not sufficient protection against those server-side effects.

Step 1 changes vessel lifecycle status only. It must not automatically disable accounts, change onboard/embarkation state, revoke sessions, reset passwords or alter historical module data.

**Why:** The user requires vessel/account governance to be built step-by-step, with account consequences agreed in a later step.

**How to apply:** Do not infer account suspension from vessel inactivity. Keep existing active-vessel operational selection behavior separate from historical/reporting access and later account-governance rules.

The approved vessel-role policy is deny-by-default. All vessel ranks get SIRE Questions Viewer view-only. Master and Chief Officer additionally get Fleet Vetting Experience, Mooring & Anchoring, Port Call Intelligence and Portable Lifting view/edit. Chief Engineer and 2nd Engineer additionally get Fleet Vetting Experience view/edit only. No other module or export/admin/delete right is implied by edit.

**Why:** The user approved this final vessel-user policy while explicitly preserving Office/Super Admin permissions and prohibiting account, assignment and vessel changes during implementation.

**How to apply:** Use canonical onboard rank identity, never username prefixes. Preserve assigned-vessel operational scope and the intentionally limited company-fleet awareness exception. Keep RPC/storage enforcement aligned with dashboard and direct-route checks when promoting core updates.
