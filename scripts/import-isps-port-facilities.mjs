#!/usr/bin/env node
// scripts/import-isps-port-facilities.mjs
// C.S.V. BEACON – MAI IMO GISIS Maritime Security Port Facility Importer
//
// Handles the official IMO GISIS Maritime Security CSV export columns:
// Country Code, Country Name, Port Name, Facility Name,
// IMO Port Facility Number, Description, Longitude, Latitude,
// Plan Approved?, Initial Approval Date, Review Date, SoC Issue Date,
// Security Plan Withdrawn?, Withdrawn Date, Last Updated
//
// Default filter:
// - import only Plan Approved? = True
// - skip Security Plan Withdrawn? = True
//
// UN/LOCODE is derived from the first 5 characters of the IMO Port Facility Number:
// AEFJR-0001 -> AEFJR

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import AdmZip from "adm-zip";
import WebSocket from "ws";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = process.argv[2] || process.env.ISPS_FACILITIES_FILE;
const BATCH_SIZE = Number(process.env.ISPS_IMPORT_BATCH_SIZE || 500);
const IMPORT_WITHDRAWN = String(process.env.ISPS_IMPORT_WITHDRAWN || "false").toLowerCase() === "true";
const IMPORT_NOT_APPROVED = String(process.env.ISPS_IMPORT_NOT_APPROVED || "false").toLowerCase() === "true";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.");
}

if (!INPUT_FILE) {
  fail("Missing input file. Use: npm run import:isps-facilities -- ./data/isps-port-facilities.csv");
}

if (!fs.existsSync(INPUT_FILE)) {
  fail(`Input file not found: ${INPUT_FILE}`);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket }
});

function fail(message) {
  console.error(`\nERROR: ${message}\n`);
  process.exit(1);
}

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function boolFromText(value) {
  const raw = upper(value);
  return ["TRUE", "YES", "Y", "1"].includes(raw);
}

function cleanHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRow(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    out[cleanHeader(key)] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

function first(row, aliases) {
  for (const alias of aliases) {
    const key = cleanHeader(alias);
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeFacilityCode(value) {
  return upper(value).replace(/\s+/g, "");
}

function deriveUnlocode(row) {
  const explicit = upper(first(row, [
    "unlocode",
    "un_locode",
    "un locode",
    "port_unlocode",
    "port unlocode",
    "locode",
    "lo_code",
    "lo code"
  ])).replace(/[^A-Z0-9]/g, "");

  if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(explicit)) return explicit;

  const facilityCode = normalizeFacilityCode(first(row, [
    "IMO Port Facility Number",
    "imo_port_facility_number",
    "Port Facility Number",
    "port_facility_number",
    "preferred_facility_code",
    "isps_code",
    "facility_code"
  ]));

  const compact = facilityCode.replace(/[^A-Z0-9]/g, "");
  const candidate = compact.slice(0, 5);

  if (/^[A-Z]{2}[A-Z0-9]{3}$/.test(candidate)) return candidate;

  return "";
}

function parseCsvText(text, sourceName) {
  const delimiters = [",", ";", "\t"];
  let best = null;

  for (const delimiter of delimiters) {
    try {
      const rows = parse(text, {
        bom: true,
        columns: true,
        delimiter,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true
      });

      const normalized = rows.map(normalizeRow).filter((r) => Object.keys(r).length > 1);

      const score = normalized.slice(0, 100).reduce((sum, row) => {
        let local = Object.keys(row).length;

        if (first(row, ["IMO Port Facility Number", "imo_port_facility_number", "port_facility_number"])) local += 60;
        if (first(row, ["Facility Name", "facility_name", "port_facility_name"])) local += 40;
        if (first(row, ["Port Name", "port_name"])) local += 20;
        if (first(row, ["Security Plan Withdrawn?", "security_plan_withdrawn"])) local += 10;

        return sum + local;
      }, 0);

      if (!best || score > best.score) {
        best = { delimiter, rows: normalized, score };
      }
    } catch (_) {
      // Try next delimiter.
    }
  }

  if (!best || !best.rows.length) {
    console.warn(`No parseable rows found in ${sourceName}.`);
    return [];
  }

  console.log(`Parsed ${best.rows.length} row(s) from ${sourceName} using delimiter ${JSON.stringify(best.delimiter)}.`);
  console.log(`Detected columns: ${Object.keys(best.rows[0] || {}).join(", ")}`);

  return best.rows;
}

function readRows(inputFile) {
  const ext = path.extname(inputFile).toLowerCase();

  if (ext === ".zip") {
    const zip = new AdmZip(inputFile);
    const entries = zip.getEntries()
      .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".csv"));

    if (!entries.length) {
      fail("ZIP file contains no CSV files.");
    }

    let rows = [];

    for (const entry of entries) {
      const text = entry.getData().toString("utf8");
      rows = rows.concat(parseCsvText(text, entry.entryName));
    }

    return rows;
  }

  const text = fs.readFileSync(inputFile, "utf8");
  return parseCsvText(text, inputFile);
}

function parseCoordinateValue(value, expectedAxis) {
  const raw = upper(value);
  if (!raw) return null;

  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;

  const match = raw.match(/^(\d+)([NSEW])$/);
  if (!match) return null;

  const digits = match[1];
  const direction = match[2];

  if (expectedAxis === "lat" && !["N", "S"].includes(direction)) return null;
  if (expectedAxis === "lon" && !["E", "W"].includes(direction)) return null;

  let degrees;
  let minutes;
  let seconds;

  if (digits.length >= 6) {
    seconds = Number(digits.slice(-2));
    minutes = Number(digits.slice(-4, -2));
    degrees = Number(digits.slice(0, -4));
  } else if (digits.length >= 4) {
    seconds = 0;
    minutes = Number(digits.slice(-2));
    degrees = Number(digits.slice(0, -2));
  } else {
    return null;
  }

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || minutes >= 60) return null;
  if (seconds < 0 || seconds >= 60) return null;

  let decimal = degrees + (minutes / 60) + (seconds / 3600);

  if (direction === "S" || direction === "W") {
    decimal *= -1;
  }

  return Number(decimal.toFixed(6));
}

function buildRemarks(row) {
  const parts = [];

  const countryName = first(row, ["Country Name", "country_name"]);
  const countryCode = first(row, ["Country Code", "country_code"]);
  const portName = first(row, ["Port Name", "port_name"]);
  const description = first(row, ["Description", "description"]);
  const planApproved = first(row, ["Plan Approved?", "plan_approved"]);
  const initialApproval = first(row, ["Initial Approval Date", "initial_approval_date"]);
  const reviewDate = first(row, ["Review Date", "review_date"]);
  const socIssueDate = first(row, ["SoC Issue Date", "soc_issue_date"]);
  const withdrawn = first(row, ["Security Plan Withdrawn?", "security_plan_withdrawn"]);
  const withdrawnDate = first(row, ["Withdrawn Date", "withdrawn_date"]);
  const lastUpdated = first(row, ["Last Updated", "last_updated"]);

  if (countryName || countryCode) parts.push(`Country: ${countryName || countryCode}`);
  if (portName) parts.push(`GISIS port name: ${portName}`);
  if (description) parts.push(`Description: ${description}`);
  if (planApproved) parts.push(`Plan approved: ${planApproved}`);
  if (initialApproval) parts.push(`Initial approval date: ${initialApproval}`);
  if (reviewDate) parts.push(`Review date: ${reviewDate}`);
  if (socIssueDate) parts.push(`SoC issue date: ${socIssueDate}`);
  if (withdrawn) parts.push(`Security plan withdrawn: ${withdrawn}`);
  if (withdrawnDate) parts.push(`Withdrawn date: ${withdrawnDate}`);
  if (lastUpdated) parts.push(`GISIS last updated: ${lastUpdated}`);

  parts.push("Source: IMO GISIS Maritime Security CSV export");

  return parts.join(" | ");
}

function buildFacilityRows(rawRows) {
  const output = [];
  const seen = new Set();

  let skippedNoUnlocode = 0;
  let skippedNoFacilityName = 0;
  let skippedNoCode = 0;
  let skippedWithdrawn = 0;
  let skippedNotApproved = 0;
  let skippedDuplicate = 0;

  for (const row of rawRows) {
    const unlocode = deriveUnlocode(row);

    if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(unlocode)) {
      skippedNoUnlocode += 1;
      continue;
    }

    const facilityName = first(row, [
      "Facility Name",
      "facility_name",
      "Port Facility Name",
      "port_facility_name",
      "Terminal Name",
      "terminal_name",
      "Berth or Terminal Name",
      "berth_or_terminal_name"
    ]);

    if (!facilityName) {
      skippedNoFacilityName += 1;
      continue;
    }

    const facilityCode = normalizeFacilityCode(first(row, [
      "IMO Port Facility Number",
      "imo_port_facility_number",
      "Port Facility Number",
      "port_facility_number",
      "Preferred Facility Code",
      "preferred_facility_code",
      "ISPS Code",
      "isps_code",
      "Facility Code",
      "facility_code"
    ]));

    if (!facilityCode) {
      skippedNoCode += 1;
      continue;
    }

    const isWithdrawn = boolFromText(first(row, [
      "Security Plan Withdrawn?",
      "security_plan_withdrawn"
    ]));

    if (isWithdrawn && !IMPORT_WITHDRAWN) {
      skippedWithdrawn += 1;
      continue;
    }

    const planApprovedRaw = first(row, [
      "Plan Approved?",
      "plan_approved"
    ]);

    const isApproved = boolFromText(planApprovedRaw);

    if (planApprovedRaw && !isApproved && !IMPORT_NOT_APPROVED) {
      skippedNotApproved += 1;
      continue;
    }

    const duplicateKey = `${unlocode}|${facilityCode}`;
    if (seen.has(duplicateKey)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(duplicateKey);

    const latitude = parseCoordinateValue(first(row, ["Latitude", "latitude", "lat"]), "lat");
    const longitude = parseCoordinateValue(first(row, ["Longitude", "longitude", "lon", "lng"]), "lon");

    const description = first(row, ["Description", "description"]);
    const displayName = description && description.toLowerCase() !== facilityName.toLowerCase()
      ? `${facilityName} — ${description}`
      : facilityName;

    output.push({
      unlocode,
      port_unlocode: unlocode,

      facility_name: facilityName,
      berth_or_terminal_name: displayName,

      preferred_facility_code: facilityCode,
      isps_code: facilityCode,
      imo_port_facility_number: facilityCode,

      latitude,
      longitude,

      remarks: buildRemarks(row),
      source: "IMO_GISIS_MARITIME_SECURITY"
    });
  }

  return {
    rows: output,
    skippedNoUnlocode,
    skippedNoFacilityName,
    skippedNoCode,
    skippedWithdrawn,
    skippedNotApproved,
    skippedDuplicate
  };
}

async function importBatch(batch, batchNo, totalBatches) {
  const { data, error } = await supabase.rpc("mai_import_port_facilities_json", {
    p_rows: batch
  });

  if (error) {
    throw new Error(
      `Supabase RPC failed on batch ${batchNo}/${totalBatches}: ${error.message}\n` +
      `Hint: confirm SQL 09-C2 has been run in Supabase and UN/LOCODE ports were imported first.`
    );
  }

  return data || {};
}

async function main() {
  console.log("C.S.V. BEACON – MAI IMO GISIS Maritime Security Port Facility Importer");
  console.log(`Input: ${INPUT_FILE}`);
  console.log(`Import withdrawn facilities: ${IMPORT_WITHDRAWN}`);
  console.log(`Import not-approved facilities: ${IMPORT_NOT_APPROVED}`);

  const rawRows = readRows(INPUT_FILE);
  const prepared = buildFacilityRows(rawRows);
  const rows = prepared.rows;

  console.log(`Raw rows read: ${rawRows.length}`);
  console.log(`Rows prepared for import: ${rows.length}`);
  console.log(`Skipped because UN/LOCODE could not be derived: ${prepared.skippedNoUnlocode}`);
  console.log(`Skipped because facility name missing: ${prepared.skippedNoFacilityName}`);
  console.log(`Skipped because IMO/facility code missing: ${prepared.skippedNoCode}`);
  console.log(`Skipped because security plan withdrawn: ${prepared.skippedWithdrawn}`);
  console.log(`Skipped because plan not approved: ${prepared.skippedNotApproved}`);
  console.log(`Skipped duplicate rows: ${prepared.skippedDuplicate}`);

  if (!rows.length) {
    fail("No facility rows were prepared. Check the CSV file headers/content.");
  }

  console.log("\nSample prepared rows:");
  console.log(JSON.stringify(rows.slice(0, 5), null, 2));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let skippedMissingPort = 0;

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await importBatch(batch, batchNo, totalBatches);

    inserted += Number(result.inserted || 0);
    updated += Number(result.updated || 0);
    skipped += Number(result.skipped || 0);
    skippedMissingPort += Number(result.skipped_missing_port || 0);

    console.log(
      `Batch ${batchNo}/${totalBatches}: ` +
      `inserted ${result.inserted || 0}, updated ${result.updated || 0}, ` +
      `skipped ${result.skipped || 0}, missing port ${result.skipped_missing_port || 0}`
    );
  }

  console.log("\nFacility import completed.");
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped by RPC: ${skipped}`);
  console.log(`Skipped because linked UN/LOCODE port was missing: ${skippedMissingPort}`);
}

main().catch((error) => {
  console.error("\nIMPORT FAILED");
  console.error(error?.message || error);
  process.exit(1);
});
