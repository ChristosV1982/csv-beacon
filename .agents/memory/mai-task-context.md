---
name: Mooring inventory task context
description: Task-entry scope and vessel-context continuity constraints for the Mooring and Anchoring module.
---

Keep Mooring and Anchoring entry task-oriented while retaining the existing inventory, registration and operations workflows. Treat an office vessel selection as navigation context only, not authorization; multiple or no selected vessels must not silently choose a vessel for a new registration.

**Why:** The user wants a simpler entry experience without changing operational calculations, governance or permissions, and explicitly requires vessel users to remain restricted to their assigned vessel.

**How to apply:** Validate carried vessel hints against the current user's accessible vessel list. Preserve in-page filter selections, including an intentionally empty selection, across task navigation and refresh. Keep component-detail, checklist, evidence and lifecycle logic outside entry-only refinements unless explicitly requested.

Office entry first offers By Vessel or By Component Type, then the relevant context before task selection. All/multiple scope is for combined inventory and due-action review; registration and recording use must resolve an explicit single-vessel context first. Vessel users automatically use their assigned vessel without perspective or context selectors.

**Why:** The user explicitly refined the flow to make the acting vessel clear before starting tasks, and requested restoration of the last office context when returning.

**How to apply:** Restore office context only within the module session, scoped to the account/company and revalidated against a fresh authorized vessel lookup. Keep the current scope visible and do not let reset-search/filter controls silently change the vessel context.

By Component Type is a fleet-review perspective using existing component types, not a new equipment categorization or registration workflow. Its selected type must remain enforced through filter resets. Vessel-specific actions from this perspective must not silently replace the saved fleet-review scope.

**Why:** The user wants to compare one equipment type across the accessible fleet while retaining the separate By Vessel workflow and unchanged record-creation rules.

**How to apply:** Keep type constraints distinct from optional filters, validate restored type IDs against current accessible definitions, and preserve the office perspective/context on return without treating saved state as authorization.

Register Usage Hours is a distinct manual/non-operation workflow. Actual operational events must continue through Record Mooring / Anchoring Use; manual bulk crediting must remain all-or-nothing for one authorized vessel, with distinct component usage records and no operation record.

**Why:** The user explicitly separates controlled manual/bulk hour registration from actual operations that credit multiple components, while requiring the existing ledger and lifecycle rules to remain intact.

**How to apply:** Keep both tasks clearly labelled, preserve vessel-context gating, and reuse the manual workflow from component detail without conflating entry with Usage History or redesigning component-detail tabs.

Task-dialog tests must verify rendered visibility and focus, not just an `open` flag or successful programmatic clicks.

**Why:** An open native dialog can still be invisible under a hidden ancestor, including when the browser repairs mismatched HTML section tags. Programmatic interactions can conceal this failure.

**How to apply:** Keep task prompts outside hidden subviews and assert nonzero dialog geometry in desktop/mobile browser checks before accepting the flow.
