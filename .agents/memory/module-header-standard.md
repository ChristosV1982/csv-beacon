---
name: Module header standard
description: Scope and compatibility decision for consistent C.S.V. module ribbon controls.
---

Use an opt-in, header-only presentation convention when standardizing additional C.S.V. module ribbons; do not normalize all buttons across an entire page.

**Why:** The user explicitly wants consistent top-ribbon dimensions while preserving form/table/dialog/secondary-toolbar controls and existing mobile behavior. Existing modules mix legacy sizing layers, including high-specificity important rules.

**How to apply:** Keep existing control IDs, handlers, visibility conditions and semantic badge styles. Check the final computed styles with page-marker-dependent polish active, and compare non-header controls against baseline. Use desktop and narrow-screen layout checks rather than assuming stylesheet order alone resolves competing specificity.

The legacy library's combined version/search strip is intentionally excluded from the ribbon convention.

**Why:** It combines search navigation with mode controls rather than providing a dedicated application header; treating it as a ribbon would also restyle the search toolbar, outside the user's header-only scope.

**How to apply:** Do not opt in that mixed toolbar without an explicit request to standardize it. This does not exclude dedicated module ribbons on modern library viewers.
