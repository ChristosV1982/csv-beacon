---
name: Post-Inspection analytics view isolation
description: Why analytics navigation uses one guarded route and retains hidden legacy source DOM in Phase 1.
---

Keep Post-Inspection analytics as independent views of the existing analytics, not separately copied calculation implementations.

**Why:** The user wants analytics opened side-by-side with parameters inside each view, without changing calculations, datasets, filters, RPCs, permissions, or drilldown semantics. One guarded route avoids authorization and calculation drift between copied pages.

**How to apply:** Treat hidden legacy tables and chart rows as potential data dependencies, not obsolete markup. Some newer charts read rendered sources. Audit consumers before deleting source DOM or replacing it with new aggregation logic. Bypass legacy whole-page regrouping in dedicated views rather than allowing competing layout repair routines.
