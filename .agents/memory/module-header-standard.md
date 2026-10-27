---
name: Module header standard
description: Scope and compatibility decision for consistent C.S.V. module ribbon controls.
---

Use an opt-in, header-only presentation convention when standardizing additional C.S.V. module ribbons; do not normalize all buttons across an entire page.

**Why:** The user explicitly wants consistent top-ribbon dimensions while preserving form/table/dialog/secondary-toolbar controls and existing mobile behavior. Existing modules mix legacy sizing layers, including high-specificity important rules.

**How to apply:** Keep existing control IDs, handlers, visibility conditions and semantic badge styles. Check the final computed styles with page-marker-dependent polish active, and compare non-header controls against baseline. Use desktop and narrow-screen layout checks rather than assuming stylesheet order alone resolves competing specificity.
