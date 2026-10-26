---
name: Dashboard navigation contract
description: User-required two-level dashboard hierarchy and permission-preservation boundary
---

The plain dashboard must start at authorized Platform Areas, never automatically reopen the previously selected area. Area contents are a separate navigation level.

**Why:** The user explicitly requested a strict areas-first hierarchy while retaining existing module visibility and behavior.

**How to apply:** Treat future dashboard redesigns as navigation-only unless otherwise authorized. Preserve company simulation, special viewer/extension rules, role/position filters, onboard restrictions, and direct-link/backend guards; do not infer new access rights from area membership.

The Post-Inspection Human counting policy panel must inherit an already-selected dashboard company instead of asking Super Admin to choose it again. Keep deliberate company switching available.

**Why:** The user expects the central company selection to carry into that policy control while retaining backend authorization.

**How to apply:** Treat inherited company context as a preselected policy target only. Validate it against server-provided choices; it must neither grant edit rights nor implicitly change report-list or bulk-refresh scope.
