---
name: Rights Matrix inheritance
description: Preserve actual permission inheritance and explicit-save semantics in future Rights Matrix work.
---

A missing rank/position override means live inheritance from the role default. Resetting overrides must restore that relationship, not save a one-time copy of today's defaults. A missing grant is not an explicit denial, and merely loading or filtering rights must never create one. Changing a selector stages changes; only an explicit Save applies them.

**Why:** Role defaults may change later, and copying them into each rank would silently freeze permissions. The earlier all-cell save behavior could turn absent rows into explicit denials simply because a user saved another permission.

**How to apply:** Distinguish absent grant rows, explicit denials, and grants in every permissions UI and calculation. Show backend vessel-rank policy limits separately from matrix grants. Use the existing audited path to remove overrides when restoring inheritance; do not change effective permissions during preview or reload.
