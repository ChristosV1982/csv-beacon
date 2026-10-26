---
name: Dashboard navigation contract
description: User-required two-level dashboard hierarchy and permission-preservation boundary
---

The plain dashboard must start at authorized Platform Areas, never automatically reopen the previously selected area. Area contents are a separate navigation level.

**Why:** The user explicitly requested a strict areas-first hierarchy while retaining existing module visibility and behavior.

**How to apply:** Treat future dashboard redesigns as navigation-only unless otherwise authorized. Preserve company simulation, special viewer/extension rules, role/position filters, onboard restrictions, and direct-link/backend guards; do not infer new access rights from area membership.
