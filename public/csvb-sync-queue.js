// public/csvb-sync-queue.js
// C.S.V. BEACON — Sync Queue Foundation
// Phase 1 inactive helper only. No automatic sync. No Supabase writes.

(() => {
  "use strict";

  const BUILD = "SYNC-QUEUE-2026-05-22-PHASE1-INACTIVE";

  function db() {
    if (!window.CSVB_OFFLINE_DB) {
      throw new Error("CSVB_OFFLINE_DB must be loaded before CSVB_SYNC_QUEUE.");
    }
    return window.CSVB_OFFLINE_DB;
  }

  function id(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function now() {
    return new Date().toISOString();
  }

  async function addPendingOperation(input) {
    const offlineDb = db();
    const op = {
      operation_id: input.operation_id || id("syncop"),
      module_code: String(input.module_code || "").trim(),
      operation_type: String(input.operation_type || "").trim(),
      record_type: String(input.record_type || "").trim(),
      record_local_id: input.record_local_id || null,
      server_id: input.server_id || null,
      company_id: input.company_id || null,
      vessel_id: input.vessel_id || null,
      user_id: input.user_id || null,
      device_id: input.device_id || null,
      payload_json: input.payload_json || {},
      sync_status: "pending",
      attempt_count: 0,
      last_error: null,
      created_at: now(),
      updated_at: now()
    };

    if (!op.module_code) throw new Error("module_code is required.");
    if (!op.operation_type) throw new Error("operation_type is required.");
    if (!op.record_type) throw new Error("record_type is required.");

    await offlineDb.put(offlineDb.STORES.PENDING_OPERATIONS, op);
    return op;
  }

  async function getAllOperations() {
    const offlineDb = db();
    return await offlineDb.getAll(offlineDb.STORES.PENDING_OPERATIONS);
  }

  async function getPendingOperations() {
    const rows = await getAllOperations();
    return (rows || []).filter((row) => String(row.sync_status || "") === "pending");
  }

  async function updateOperationStatus(operationId, status, extra = {}) {
    const offlineDb = db();
    const op = await offlineDb.get(offlineDb.STORES.PENDING_OPERATIONS, operationId);
    if (!op) return null;

    const updated = {
      ...op,
      ...extra,
      sync_status: status,
      updated_at: now()
    };

    await offlineDb.put(offlineDb.STORES.PENDING_OPERATIONS, updated);
    return updated;
  }

  async function healthCheck() {
    const offlineDb = db();
    const pending = await getPendingOperations();
    const all = await getAllOperations();

    return {
      ok: true,
      build: BUILD,
      offline_db_build: offlineDb.BUILD,
      pending_count: pending.length,
      total_operations: all.length
    };
  }

  window.CSVB_SYNC_QUEUE = {
    BUILD,
    addPendingOperation,
    getAllOperations,
    getPendingOperations,
    updateOperationStatus,
    healthCheck
  };
})();
