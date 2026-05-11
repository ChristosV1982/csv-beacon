#!/usr/bin/env node
// scripts/import-unlocode-ports.mjs
// C.S.V. BEACON – MAI UN/LOCODE Port Importer
//
// Imports official UN/LOCODE CodeList CSV data into Supabase.
// Handles the UNECE ZIP format where CodeListPart CSV files are headerless.
//
// Fixed UN/LOCODE CodeList columns used:
//   Change, Country, Location, Name, NameWoDiacritics, SubDiv,
//   Function, Status, Date, IATA, Coordinates, Remarks
//
// Filter:
//   Function contains "1" = maritime port / sea port.
//
// Usage:
//   npm run import:unlocode -- ./data/unlocode.zip

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import AdmZip from "adm-zip";
import WebSocket from "ws";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = process.argv[2] || process.env.UNLOCODE_FILE;
const BATCH_SIZE = Number(process.env.UNLOCODE_IMPORT_BATCH_SIZE || 500);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CODELIST_COLUMNS = [
  "change_indicator",
  "country_code",
  "location_code",
  "port_name",
  "name_without_diacritics",
  "subdivision",
  "function_code",
  "status",
  "date",
  "iata",
  "coordinates",
  "remarks"
];

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.");
}

if (!INPUT_FILE) {
  fail("Missing input file. Use: npm run import:unlocode -- ./data/unlocode.zip");
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

function displayRegionName(countryCode) {
  const code = upper(countryCode);
  if (!/^[A-Z]{2}$/.test(code)) return "";

  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) || "";
  } catch (_) {
    return "";
  }
}

function parseCoordinatePair(raw) {
  const value = upper(raw);
  if (!value) return { latitude: null, longitude: null };

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { latitude: null, longitude: null };

  return {
    latitude: parseCoordinatePart(parts[0]),
    longitude: parseCoordinatePart(parts[1])
  };
}

function parseCoordinatePart(part) {
  const value = upper(part);
  const match = value.match(/^(\d+)([NSEW])$/);
  if (!match) return null;

  const digits = match[1];
  const direction = match[2];

  if (digits.length < 4) return null;

  const minutes = Number(digits.slice(-2));
  const degrees = Number(digits.slice(0, -2));

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes >= 60) return null;

  let decimal = degrees + minutes / 60;

  if (direction === "S" || direction === "W") {
    decimal *= -1;
  }

  return Number(decimal.toFixed(6));
}

function parseCodelistCsv(text, sourceName) {
  const delimiters = [",", ";", "\t"];
  let best = null;

  for (const delimiter of delimiters) {
    try {
      const rows = parse(text, {
        bom: true,
        columns: CODELIST_COLUMNS,
        delimiter,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        trim: true
      });

      const usableScore = rows.slice(0, 200).reduce((sum, row) => {
        let score = 0;

        if (/^[A-Z]{2}$/i.test(clean(row.country_code))) score += 3;
        if (/^[A-Z0-9]{3}$/i.test(clean(row.location_code))) score += 4;
        if (clean(row.port_name)) score += 2;
        if (clean(row.function_code)) score += 2;

        return sum + score;
      }, 0);

      if (!best || usableScore > best.score) {
        best = { delimiter, rows, score: usableScore };
      }
    } catch (_) {
      // Try next delimiter.
    }
  }

  if (!best || !best.rows.length) {
    console.warn(`No parseable rows found in ${sourceName}.`);
    return [];
  }

  console.log(
    `Parsed ${best.rows.length} row(s) from ${sourceName} ` +
    `using delimiter ${JSON.stringify(best.delimiter)}.`
  );

  return best.rows;
}

function readCsvRows(inputFile) {
  const ext = path.extname(inputFile).toLowerCase();

  if (ext === ".zip") {
    const zip = new AdmZip(inputFile);

    const entries = zip.getEntries()
      .filter((entry) => {
        const name = entry.entryName.toLowerCase();

        if (entry.isDirectory) return false;
        if (!name.endsWith(".csv")) return false;

        // Import only CodeList parts.
        // Do not import SubdivisionCodes.csv.
        if (name.includes("subdivision")) return false;
        if (name.includes("codelist")) return true;
        if (name.includes("unlocode")) return true;

        return false;
      });

    if (!entries.length) {
      fail("ZIP file contains no UN/LOCODE CodeList CSV files.");
    }

    console.log("CSV files selected from ZIP:");
    for (const entry of entries) {
      console.log(`- ${entry.entryName}`);
    }

    let rows = [];

    for (const entry of entries) {
      const text = entry.getData().toString("utf8");
      rows = rows.concat(parseCodelistCsv(text, entry.entryName));
    }

    return rows;
  }

  const text = fs.readFileSync(inputFile, "utf8");
  return parseCodelistCsv(text, inputFile);
}

function buildPortRows(rawRows) {
  const seen = new Set();
  const output = [];

  let skippedCountryHeading = 0;
  let skippedNoFunction1 = 0;
  let skippedNoCode = 0;
  let skippedNoName = 0;

  for (const row of rawRows) {
    const countryCode = upper(row.country_code);
    const locationCode = upper(row.location_code);
    const portName = clean(row.port_name);
    const functionCode = clean(row.function_code).replace(/\s+/g, "");

    // UNECE CodeList files include country-heading rows such as:
    //   ,AD,ANDORRA
    // These are not actual locations.
    if (
      /^[A-Z]{2}$/.test(countryCode) &&
      locationCode.length > 3 &&
      !portName &&
      !functionCode
    ) {
      skippedCountryHeading += 1;
      continue;
    }

    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z0-9]{3}$/.test(locationCode)) {
      skippedNoCode += 1;
      continue;
    }

    if (!portName) {
      skippedNoName += 1;
      continue;
    }

    if (!functionCode.includes("1")) {
      skippedNoFunction1 += 1;
      continue;
    }

    const unlocode = `${countryCode}${locationCode}`;

    if (seen.has(unlocode)) continue;
    seen.add(unlocode);

    const coordinates = clean(row.coordinates);
    const parsedCoords = parseCoordinatePair(coordinates);

    output.push({
      unlocode,
      country_code: countryCode,
      location_code: locationCode,
      country_name: displayRegionName(countryCode),
      port_name: portName,
      name_without_diacritics: clean(row.name_without_diacritics),
      subdivision: clean(row.subdivision),
      status: clean(row.status),
      function_code: functionCode,
      iata: clean(row.iata),
      coordinates,
      latitude: parsedCoords.latitude,
      longitude: parsedCoords.longitude,
      remarks: clean(row.remarks),
      source: "UNLOCODE"
    });
  }

  return {
    rows: output,
    skippedCountryHeading,
    skippedNoFunction1,
    skippedNoCode,
    skippedNoName
  };
}

async function importBatch(batch, batchNo, totalBatches) {
  const { data, error } = await supabase.rpc("mai_import_unlocode_ports_json", {
    p_rows: batch
  });

  if (error) {
    throw new Error(
      `Supabase RPC failed on batch ${batchNo}/${totalBatches}: ${error.message}\n` +
      `Hint: confirm SQL 09-C2 has been run in Supabase.`
    );
  }

  return data || {};
}

async function main() {
  console.log("C.S.V. BEACON – MAI UN/LOCODE Port Importer");
  console.log(`Input: ${INPUT_FILE}`);

  const rawRows = readCsvRows(INPUT_FILE);
  const prepared = buildPortRows(rawRows);
  const rows = prepared.rows;

  console.log(`Raw rows read: ${rawRows.length}`);
  console.log(`Country heading rows skipped: ${prepared.skippedCountryHeading}`);
  console.log(`Rows kept where Function contains "1": ${rows.length}`);
  console.log(`Skipped because Function did not contain "1": ${prepared.skippedNoFunction1}`);
  console.log(`Skipped because UN/LOCODE could not be built: ${prepared.skippedNoCode}`);
  console.log(`Skipped because port name was empty: ${prepared.skippedNoName}`);

  if (!rows.length) {
    fail("No port rows were prepared. The CodeList format is still not matching the importer.");
  }

  console.log("\nSample prepared rows:");
  console.log(JSON.stringify(rows.slice(0, 5), null, 2));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchNo = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await importBatch(batch, batchNo, totalBatches);

    inserted += Number(result.inserted || 0);
    updated += Number(result.updated || 0);
    skipped += Number(result.skipped || 0);

    console.log(
      `Batch ${batchNo}/${totalBatches}: ` +
      `inserted ${result.inserted || 0}, updated ${result.updated || 0}, skipped ${result.skipped || 0}`
    );
  }

  console.log("\nImport completed.");
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped by RPC: ${skipped}`);
}

main().catch((error) => {
  console.error("\nIMPORT FAILED");
  console.error(error?.message || error);
  process.exit(1);
});
