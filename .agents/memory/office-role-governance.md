---
name: Office role catalogue governance
description: Preparation-only Office categories must not change live authorization or assignment before a separately approved resolver phase.
---

Role catalogue work is preparation only. New Office categories remain draft and unassignable until the user separately approves the future Office permission/resolver implementation.

**Why:** The user wants to review and prepare categories before rebuilding Office permissions, without changing current effective access.

**How to apply:** Do not activate a new authorization identity, grant rights, or add categories to account-assignment lists merely because their catalogue entry is marked Active.

The current Super Admin, Company Admin, Vessel and Inspector categories are protected system roles. Company Superintendent is a protected legacy operational role under review, not an unused role available for deletion.

**Why:** Existing users and backend checks depend on the current role identities.

**How to apply:** Preserve stable codes and existing behavior until an explicitly approved migration replaces those dependencies.

Organizational role identity is separate from reusable Access Profiles. Fleet Manager, DPA, General Manager and Technical Director must not be classified as Superintendent roles merely because permissions may be shared. Marine Coordinator remains a distinct Company Administration category.

**Why:** The user explicitly requires organizational identity to survive shared initial permissions.

**How to apply:** Keep classifications separate from profile bindings in future resolver and Rights Matrix work.

Demo User is intended as a normal assignable demonstration/training role, not Demo Mode. Until the resolver safely supports it, retain draft/unassignable status and conservative view-only proposals; do not introduce a demonstration bypass or infer edit/admin rights.

**Why:** The user explicitly distinguished Demo User from Demo Mode and required conservative defaults.

**How to apply:** Implement future assignment through ordinary account/permission enforcement, not a mode switch.
