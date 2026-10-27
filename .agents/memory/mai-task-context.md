---
name: Mooring inventory task context
description: Task-entry scope and vessel-context continuity constraints for the Mooring and Anchoring module.
---

Keep Mooring and Anchoring entry task-oriented while retaining the existing inventory, registration and operations workflows. Treat an office vessel selection as navigation context only, not authorization; multiple or no selected vessels must not silently choose a vessel for a new registration.

**Why:** The user wants a simpler entry experience without changing operational calculations, governance or permissions, and explicitly requires vessel users to remain restricted to their assigned vessel.

**How to apply:** Validate carried vessel hints against the current user's accessible vessel list. Preserve in-page filter selections, including an intentionally empty selection, across task navigation and refresh. Keep component-detail, checklist, evidence and lifecycle logic outside entry-only refinements unless explicitly requested.
