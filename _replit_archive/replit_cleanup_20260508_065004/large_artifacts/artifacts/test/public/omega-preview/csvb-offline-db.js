// public/csvb-offline-db.js
// C.S.V. BEACON — Offline IndexedDB Foundation
// Phase 1 foundation only.
// Inactive helper library. No module business logic. No Supabase writes.

(() => {
  "use strict";

  const BUILD = "OFFLINE-DB-2026-05-22-PHASE1-INACTIVE";
  const DB_NAME = "csvb_offline_foundation";
  const DB_VERSION = 1;

  const STORES = {
    PACKAGES: "offline_packages",
    RECORDS: "offline_records",
    PENDING_OPERATIONS: "pending_operations",
    ATTACHMENTS: "offline_attachments",
    SYNC_LOG: "sync_log",
    CONFLICTS: "sync_conflicts",
    DEVICE_CONTEXT: "device_context",
  };

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }

      const req = window.indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORES.PACKAGES)) {
          const store = db.createObjectStore(STORES.PACKAGES, { keyPath: "package_id" });
          store.createIndex("module_code", "module_code", { unique: false });
          store.createIndex("company_id", "company_id", { unique: false });
          store.createIndex("vessel_id", "vessel_id", { unique: false });
          store.createIndex("downloaded_at", "downloaded_at", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.RECORDS)) {
          const store = db.createObjectStore(STORES.RECORDS, { keyPath: "local_id" });
          store.createIndex("server_id", "server_id", { unique: false });
          store.createIndex("module_code", "module_code", { unique: false });
          store.createIndex("record_type", "record_type", { unique: false });
          store.createIndex("sync_status", "sync_status", { unique: false });
          store.createIndex("company_id", "company_id", { unique: false });
          store.createIndex("vessel_id", "vessel_id", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.PENDING_OPERATIONS)) {
          const store = db.createObjectStore(STORES.PENDING_OPERATIONS, { keyPath: "operation_id" });
          store.createIndex("module_code", "module_code", { unique: false });
          store.createIndex("operation_type", "operation_type", { unique: false });
          store.createIndex("sync_status", "sync_status", { unique: false });
          store.createIndex("created_at", "created_at", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.ATTACHMENTS)) {
          const store = db.createObjectStore(STORES.ATTACHMENTS, { keyPath: "local_attachment_id" });
          store.createIndex("module_code", "module_code", { unique: false });
          store.createIndex("record_local_id", "record_local_id", { unique: false });
          store.createIndex("sync_status", "sync_status", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.SYNC_LOG)) {
          const store = db.createObjectStore(STORES.SYNC_LOG, { keyPath: "log_id" });
          store.createIndex("module_code", "module_code", { unique: false });
          store.createIndex("created_at", "created_at", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.CONFLICTS)) {
          const store = db.createObjectStore(STORES.CONFLICTS, { keyPath: "conflict_id" });
          store.createIndex("module_code", "module_code", { unique: false });
          store.createIndex("record_local_id", "record_local_id", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.DEVICE_CONTEXT)) {
          db.createObjectStore(STORES.DEVICE_CONTEXT, { keyPath: "key" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed."));
      req.onblocked = () => reject(new Error("IndexedDB upgrade blocked by another open tab."));
    });
  }

  function tx(db, storeName, mode = "readonly") {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function requestToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB request failed."));
    });
  }

  async function put(storeName, value) {
    const db = await openDb();
    try {
      return await requestToPromise(tx(db, storeName, "readwrite").put(value));
    } finally {
      db.close();
    }
  }

  async function get(storeName, key) {
    const db = await openDb();
    try {
      return await requestToPromise(tx(db, storeName, "readonly").get(key));
    } finally {
      db.close();
    }
  }

  async function remove(storeName, key) {
    const db = await openDb();
    try {
      return await requestToPromise(tx(db, storeName, "readwrite").delete(key));
    } finally {
      db.close();
    }
  }

  async function getAll(storeName) {
    const db = await openDb();
    try {
      return await requestToPromise(tx(db, storeName, "readonly").getAll());
    } finally {
      db.close();
    }
  }

  async function clearStore(storeName) {
    const db = await openDb();
    try {
      return await requestToPromise(tx(db, storeName, "readwrite").clear());
    } finally {
      db.close();
    }
  }

  async function healthCheck() {
    const db = await openDb();
    const storeNames = Array.from(db.objectStoreNames || []);
    db.close();

    return {
      ok: true,
      build: BUILD,
      db_name: DB_NAME,
      db_version: DB_VERSION,
      stores: storeNames,
    };
  }

  window.CSVB_OFFLINE_DB = {
    BUILD,
    DB_NAME,
    DB_VERSION,
    STORES,
    openDb,
    put,
    get,
    remove,
    getAll,
    clearStore,
    healthCheck,
  };
})();
