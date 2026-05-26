# C.S.V. BEACON — PWA / Offline Readiness Audit

**Date:** 2026-05-22  
**Scope:** Initial non-invasive audit and implementation plan for smartphone/tablet friendliness, PWA installation, offline packages, and later synchronization.  
**Status:** Planning baseline only. No application behaviour change.

---

## 1. Purpose

The purpose of this document is to define a controlled, low-risk path for making C.S.V. BEACON usable on approved smartphones/tablets and, where appropriate, operational without internet connectivity.

The offline target is not to make the whole platform offline. The target is to make selected modules offline-capable while keeping sensitive, administrative, collaborative, or server-heavy modules online-only.

---

## 2. Safety Principle

The existing production-like functionality must not be damaged.

For the offline/mobile project:

1. Do not modify business logic until the PWA/offline foundation is isolated and tested.
2. Do not replace the existing service worker without a rollback point.
3. Do not make database schema changes until the offline data model is agreed.
4. Do not activate offline write/sync globally at first.
5. Use feature flags and module-by-module activation.
6. Use Git branches / controlled commits for each phase.

Recommended branch for future work:

```text
pwa-offline-foundation
```

---

## 3. Current PWA Status

### Existing assets

The application already has the minimum basic PWA components:

- `public/manifest.json`
- `public/service-worker.js`
- PWA icons:
  - `public/icon-192.png`
  - `public/icon-512.png`

### Current manifest

Current `manifest.json` defines:

- app name: `C.S.V. BEACON`
- display mode: `standalone`
- background color
- theme color
- app icons
- start URL

This is a good base for installability.

### Current service worker

Current `service-worker.js` is mainly used to avoid stale pages/scripts and support basic cached app shell behaviour.

Current strategy:

- HTML/navigation: network-first
- static assets: stale-while-revalidate
- cache version cleanup during activation
- `CORE_ASSETS` pre-cache list

This is useful, but it is not yet a full offline data/sync engine.

---

## 4. What Is Missing for Real Offline Operation

The current implementation does not yet include:

1. IndexedDB offline data stores.
2. Offline package download logic.
3. Local draft/write storage.
4. Pending sync queue.
5. Conflict detection and resolution.
6. Approved-device control.
7. Per-module offline permissions.
8. Offline/online/sync status UI.
9. Attachment queueing for later upload.
10. Server-side sync acceptance/rejection audit trail.

---

## 5. Recommended Offline Architecture

### 5.1 PWA shell

The PWA shell should include:

- manifest
- service worker
- offline fallback page
- offline/online indicator
- install/update notification
- cache version display
- safe service-worker update path

Recommended additional files:

```text
public/offline.html
public/csvb-offline-status.js
public/csvb-offline-db.js
public/csvb-sync-queue.js
public/csvb-device-context.js
```

Initially these should be non-invasive and feature-flagged.

---

### 5.2 IndexedDB local data store

Use IndexedDB for structured offline data. Do not use `localStorage` for operational records.

Proposed object stores:

```text
csvb_offline_packages
csvb_offline_records
csvb_offline_pending_operations
csvb_offline_attachments
csvb_offline_sync_log
csvb_offline_conflicts
csvb_offline_device_context
```

Every offline record should carry:

```text
local_id
server_id
module_code
company_id
vessel_id
record_type
record_version
last_server_updated_at
local_updated_at
sync_status
created_by_user_id
device_id
payload_json
```

---

### 5.3 Sync queue

Offline write-capable modules should not write directly to Supabase when offline. They should create local pending operations:

```text
create
update
delete/soft-delete
attach_file
submit
close
```

When the app comes online, the sync engine should:

1. verify current user session;
2. verify device approval;
3. upload pending operations;
4. compare server version;
5. accept safe operations;
6. reject or flag conflicts;
7. update local status;
8. download latest server data;
9. write sync audit records.

---

## 6. Conflict Control

Do not use blind last-write-wins for operational/safety records.

Recommended rules:

```text
If server version unchanged:
  auto-sync local change.

If server version changed:
  create conflict.
  show local version and server version.
  require authorised user resolution.
```

Conflict handling is especially important for:

- mooring component records;
- inventory condition changes;
- close-out / verification status;
- post-inspection response actions;
- any record touched by both vessel and office users.

---

## 7. Approved Device Model

Offline access should be limited to approved devices.

Suggested table concept:

```text
approved_devices
- id
- company_id
- vessel_id
- user_id
- device_label
- platform
- device_public_id
- approved_by
- approved_at
- revoked_at
- last_seen_at
- offline_allowed_modules
```

Suggested workflow:

```text
1. User logs in on device.
2. Device requests offline approval.
3. Company admin / superadmin approves.
4. Device can download allowed offline packages.
5. If device is revoked, sync/download is blocked.
```

---

## 8. Module Offline Classification

### High suitability: offline-read-only first

| Module | Offline mode | Notes |
|---|---|---|
| SIRE Questions Viewer | offline_readonly | Best first pilot. Low conflict risk. |
| RISQ Questions Viewer | offline_readonly | Later, same pattern as SIRE viewer. |
| Company Policy Viewer | offline_readonly | Needs controlled document versioning. |

### High suitability: later write/sync

| Module | Offline mode | Notes |
|---|---|---|
| Vessel Questionnaires / Self Assessment | offline_sync_enabled | Good first write-capable pilot. |
| Mooring & Anchoring Inventories | offline_sync_enabled | Requires conflict handling. |
| Portable Lifting Appliances / Wires | offline_sync_enabled | Similar to inventory records. |
| Audit/checklist modules | offline_sync_enabled | Suitable after sync queue exists. |

### Online-only initially

| Module | Reason |
|---|---|
| Superuser Administration | High-risk admin actions. |
| Risk Rating Profiles | Configuration/control module. |
| SIRE / RISQ Questions Editors | Master library editing should stay online. |
| Post-Inspection PDF Import | Requires server-side PDF parsing and upload. |
| Threads | Collaborative state; later may support offline drafts only. |
| Inspector Intelligence | Shared / collaborative intelligence data. |

---

## 9. Mobile / Tablet UI Requirements

Every module targeted for smartphone/tablet use should support:

1. responsive topbar;
2. touch-friendly buttons;
3. table-to-card transformation on narrow screens;
4. sticky save/sync controls;
5. visible online/offline indicator;
6. visible sync status;
7. large readable text areas;
8. no critical information hidden in horizontal overflow;
9. confirmation before submitting/closing records;
10. safe attachment handling.

Highest-risk UI elements:

- wide tables;
- dense filter ribbons;
- multi-column forms;
- long side-by-side cards;
- detail pages with many fields.

---

## 10. Suggested Implementation Phases

### Phase 0 — Baseline lock

- Confirm current `main` is stable.
- Create branch `pwa-offline-foundation`.
- Do not change module logic.

### Phase 1 — Audit and non-invasive PWA foundation

Add or inspect:

```text
public/offline.html
public/csvb-offline-status.js
public/csvb-offline-db.js
public/csvb-sync-queue.js
public/csvb-device-context.js
```

Keep inactive/feature-flagged.

### Phase 2 — Offline status UI

Add global indicator:

```text
Online
Offline
Sync pending
Sync failed
Last sync time
```

No module data sync yet.

### Phase 3 — SIRE Questions Viewer offline pilot

- Download current question library package.
- Store in IndexedDB.
- Search/read offline.
- Show package version/date.
- No write conflict risk.

### Phase 4 — Vessel Questionnaire offline pilot

- Download assigned questionnaire.
- Store answers locally.
- Sync answers when online.
- Use version checks.
- Flag conflicts.

### Phase 5 — Inventory offline pilot

- Mooring & Anchoring Inventories.
- Component records.
- Operation logs.
- Attachment queue.
- Conflict resolution.

---

## 11. Feature Flags

Suggested local/server flags:

```text
csvb_offline_enabled
csvb_offline_status_ui_enabled
csvb_offline_sire_viewer_enabled
csvb_offline_questionnaires_enabled
csvb_offline_mooring_enabled
csvb_offline_pla_enabled
```

Initial values should all be false except possibly offline status UI during testing.

---

## 12. Service Worker Caution

The current service worker is important for cache/version behaviour. It should not be radically changed in one step.

Safe approach:

1. bump version intentionally;
2. preserve network-first navigation;
3. preserve stale-while-revalidate assets;
4. add offline fallback carefully;
5. test cache clearing and update flow;
6. avoid caching sensitive user data in Cache Storage.

Structured user data belongs in IndexedDB, not Cache Storage.

---

## 13. Immediate Next Recommended Technical Task

Create a non-invasive offline status indicator:

```text
public/csvb-offline-status.js
```

Purpose:

- show online/offline state;
- show that no module offline sync is active yet;
- no database writes;
- no service-worker logic change;
- no module business logic change.

This gives a safe first visible step without risking existing modules.

---

## 14. Current Decision

Proceed carefully with an incremental PWA/offline foundation. Do not convert any existing module to offline write/sync until the offline shell, IndexedDB wrapper, sync queue model, and conflict rules are implemented and tested.
