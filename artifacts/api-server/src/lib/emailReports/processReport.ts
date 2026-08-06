import { readFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import * as XLSX from "xlsx";
import { and, eq, isNull } from "drizzle-orm";
import {
  db, insertReturning, importJobsTable, deliveryRecordsTable,
  backgroundVerificationsTable, dropoutRecordsTable, usersTable,
} from "@workspace/db";
import type { ReportType } from "./mailbox.js";

const gunzipAsync = promisify(gunzip);
const MAX_UNCOMPRESSED_BYTES = 256 * 1024 * 1024;

function key(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function value(row: Record<string, unknown>, aliases: string[]) {
  const wanted = new Set(aliases.map(key));
  const entry = Object.entries(row).find(([header]) => wanted.has(key(header)));
  return String(entry?.[1] ?? "").trim().replace(/\.0+$/, "");
}
function bgStatus(raw: unknown) {
  const status = String(raw ?? "").toUpperCase();
  if (status.includes("PASS") || status === "GREEN") return "PASSED" as const;
  if (status.includes("FAIL") || status === "RED") return "FAILED" as const;
  if (status.includes("PROGRESS")) return "IN_PROGRESS" as const;
  if (status.includes("REVIEW") || status === "AMBER") return "REVIEW_REQUIRED" as const;
  return "PENDING" as const;
}
function parsedDate(raw: string): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
async function workbookRows(path: string) {
  const stored = await readFile(path);
  const isGzip = stored.length >= 2 && stored[0] === 0x1f && stored[1] === 0x8b;
  const contents = isGzip
    ? await gunzipAsync(stored, { maxOutputLength: MAX_UNCOMPRESSED_BYTES })
    : stored;
  if (contents.byteLength > MAX_UNCOMPRESSED_BYTES) throw new Error("Uncompressed report exceeds the 256 MB safety limit");
  const workbook = XLSX.read(contents, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The downloaded report contains no worksheet");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}
async function riders(customerId: number) {
  return db.select().from(usersTable).where(and(
    eq(usersTable.customerId, customerId), eq(usersTable.role, "USER"), isNull(usersTable.deletedAt),
  ));
}
function matchingRider(all: Awaited<ReturnType<typeof riders>>, id: string) {
  const normalized = key(id);
  return all.find(user => key(user.flipkartId) === normalized || key(user.employeeCode) === normalized);
}

export async function processDownloadedReport(input: {
  customerId: number; uploadedByUserId: number | null; reportType: ReportType; fileName: string; storedPath: string;
}) {
  const rows = await workbookRows(input.storedPath);
  const job = await insertReturning(importJobsTable, {
    customerId: input.customerId, uploadedByUserId: input.uploadedByUserId,
    type: input.reportType, fileName: input.fileName, source: "EMAIL", status: "PROCESSING", totalRows: rows.length,
  });
  const allRiders = await riders(input.customerId);
  const warnings: string[] = [];
  let successfulRows = 0, failedRows = 0, matchedRiders = 0, excludedDuplicates = 0;

  try {
    if (input.reportType === "DELIVERY") {
      const seen = new Set<string>();
      for (const row of rows) {
        const runSheetStatus = value(row, ["RunSheetStatus", "Run Sheet Status"]).toUpperCase();
        if (runSheetStatus !== "ACTIVE" && runSheetStatus !== "INACTIVE") { excludedDuplicates++; continue; }
        const fhrId = value(row, ["FHRID", "Employee ID", "Flipkart ID"]);
        const shipmentId = value(row, ["ShipmentId", "Shipment ID"]);
        if (!fhrId || !shipmentId) { failedRows++; continue; }
        const duplicateKey = `${key(fhrId)}:${key(shipmentId)}:${runSheetStatus}`;
        if (seen.has(duplicateKey)) { excludedDuplicates++; continue; }
        seen.add(duplicateKey);
        const user = matchingRider(allRiders, fhrId);
        if (user) matchedRiders++;
        await db.insert(deliveryRecordsTable).values({
          customerId: input.customerId, importJobId: job.id, userId: user?.id, fhrId,
          runsheetId: value(row, ["RunsheetId", "Runsheet ID"]) || null,
          shipmentId, agentName: value(row, ["AgentName", "Agent Name"]) || null,
          deliveryHub: value(row, ["DeliveryHub", "Delivery Hub"]) || null,
          city: value(row, ["City"]) || null, zone: value(row, ["Zone"]) || null, state: value(row, ["State"]) || null,
          shipmentStatus: value(row, ["ShipmentStatus", "Shipment Status"]) || null,
          runsheetShipmentStatus: value(row, ["RunsheetShipmentStatus", "Runsheet Shipment Status"]) || null,
          shipmentType: value(row, ["ShipmentType", "Shipment Type"]) || null,
          shipmentPrice: Number(value(row, ["ShipmentPrice", "Shipment Price"])) || null,
          shipmentWeight: Number(value(row, ["ShipmentWeight", "Shipment Weight"])) || null,
          shipmentUpdatedAt: parsedDate(value(row, ["ShipmentUpdateDateTime", "Shipment Update Date Time"])),
          rawData: row,
        });
        successfulRows++;
      }
    } else if (input.reportType === "BGV") {
      for (const row of rows) {
        const employeeId = value(row, ["Employee ID", "FHRID", "Flipkart ID"]);
        if (!employeeId) { failedRows++; continue; }
        const user = matchingRider(allRiders, employeeId);
        if (user) matchedRiders++;
        const record = {
          customerId: input.customerId, userId: user?.id, employeeId,
          profileId: value(row, ["Profile_id", "Profile ID"]) || null,
          vendorName: value(row, ["VENDOR NAME", "Vendor Name"]) || null,
          hubName: value(row, ["Hub", "Hub Name"]) || null, stateName: value(row, ["State"]) || null,
          nidStatus: value(row, ["NID Status"]) || null, crcStatus: value(row, ["CRC Status"]) || null,
          nidRemarks: value(row, ["NID Remarks"]) || null, crcRemarks: value(row, ["CRC Remarks"]) || null,
          status: bgStatus(value(row, ["Status"])), source: "SHEET" as const, rawData: row, updatedAt: new Date(),
        };
        const [existing] = await db.select().from(backgroundVerificationsTable).where(and(
          eq(backgroundVerificationsTable.customerId, input.customerId), eq(backgroundVerificationsTable.employeeId, employeeId),
        )).limit(1);
        if (existing) await db.update(backgroundVerificationsTable).set(record).where(eq(backgroundVerificationsTable.id, existing.id));
        else await db.insert(backgroundVerificationsTable).values(record);
        successfulRows++;
      }
    } else {
      for (const row of rows) {
        const fhrId = value(row, ["CasperFHRID", "FHRID", "Employee ID"]);
        if (!fhrId) { failedRows++; continue; }
        const user = matchingRider(allRiders, fhrId);
        if (user) matchedRiders++;
        await db.insert(dropoutRecordsTable).values({
          customerId: input.customerId, importJobId: job.id, userId: user?.id, fhrId,
          fullName: value(row, ["Full_Name", "Full Name", "Name"]) || null,
          hubName: value(row, ["HubName", "Hub name", "Hub"]) || null,
          city: value(row, ["City"]) || null, state: value(row, ["State"]) || null, zone: value(row, ["Zone"]) || null,
          status: value(row, ["Status"]) || null, dropoutDate: parsedDate(value(row, ["Date", "Dropout Date"])), rawData: row,
        });
        successfulRows++;
      }
    }
    if (matchedRiders < successfulRows) warnings.push(`${successfulRows - matchedRiders} rows were not matched to a biker`);
    if (excludedDuplicates) warnings.push(`${excludedDuplicates} blank/invalid or duplicate RunSheetStatus rows excluded`);
    await db.update(importJobsTable).set({
      status: warnings.length || failedRows ? "COMPLETED_WITH_WARNINGS" : "COMPLETED",
      successfulRows, failedRows, warnings, completedAt: new Date(),
    }).where(eq(importJobsTable.id, job.id));
    return { jobId: job.id, totalRows: rows.length, successfulRows, failedRows, matchedRiders, excludedDuplicates, warnings };
  } catch (error) {
    await db.update(importJobsTable).set({ status: "FAILED", failedRows: rows.length, warnings: [String(error)], completedAt: new Date() }).where(eq(importJobsTable.id, job.id));
    throw error;
  }
}
