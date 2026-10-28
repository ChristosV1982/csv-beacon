---
name: Port Call task navigation
description: Keep report-register navigation independent from the saved location needed by the call editor.
---

Port Call register filters/location restrictions and report-editor location are separate UI contexts. Clearing the register must not clear or rewrite the editor's port/terminal context. Opening an existing draft must initialise from the saved report, not require the user to choose its port again.

**Why:** The user requires truly clearable register filters and stable return-to-list navigation while preserving the existing draft editor and its saved-location safety fix. A shared page-level location otherwise makes editing silently narrow the register.

**How to apply:** Keep register scope, filters, page, selection and scroll across detail navigation. Account for the legacy save flow resetting the loaded page: restore navigation on return rather than changing save/validation semantics. Published Office Information remains readable to authorised view-only/vessel users; grouping it with Office Review must not accidentally hide that existing read access.

Call-report editing is a dedicated full-width workspace; other terminal/office dialogs must retain their separate presentation. Leaving it must protect unsaved inputs. Attachment upload/deletion refreshes the form/detail, so require saving edited report fields before those refreshes.

**Why:** The user requested a call-editor presentation/navigation change without rewriting the existing save sequence or losing form data.
