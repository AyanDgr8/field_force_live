import { mysqlTable, text, varchar, int, datetime, mysqlEnum, json, index, uniqueIndex } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";
import { importJobsTable } from "./organization";

/**
 * Daily runsheet reports arrive by email rather than as a direct upload: the
 * message carries a download link, not an attachment. One row is written per
 * matching message so a report is downloaded and parsed exactly once, and so a
 * failed download can be retried without losing the link.
 */
export const emailReportStatusValues = [
  "PENDING",     // message matched, link not extracted yet
  "DOWNLOADED",  // report file fetched and stored on disk
  "IMPORTED",    // file handed to the delivery importer
  "FAILED",      // link extraction, download, or import failed
  "SKIPPED",     // matched the subject but carried no usable link
] as const;

export const emailReportTypeValues = ["DELIVERY", "BGV", "DROPOUT"] as const;

export const emailReportsTable = mysqlTable("email_reports", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),

  // RFC 5322 Message-ID. The unique index is what makes polling idempotent —
  // re-reading the same mailbox can never enqueue a report twice.
  messageId: varchar("message_id", { length: 255 }).notNull(),
  mailbox: varchar("mailbox", { length: 128 }).notNull().default("INBOX"),
  messageUid: int("message_uid"),
  subject: text("subject"),
  fromName: text("from_name"),
  fromAddress: varchar("from_address", { length: 320 }),
  receivedAt: datetime("received_at", { mode: "date", fsp: 3 }),
  reportType: mysqlEnum("report_type", emailReportTypeValues).notNull(),

  status: mysqlEnum("status", emailReportStatusValues).notNull().default("PENDING"),
  downloadUrl: text("download_url"),
  fileName: text("file_name"),
  storedPath: text("stored_path"),
  fileSizeBytes: int("file_size_bytes"),
  contentSha256: varchar("content_sha256", { length: 64 }),

  // Set once the stored file has been run through the delivery importer.
  importJobId: int("import_job_id").references(() => importJobsTable.id),

  attempts: int("attempts").notNull().default(0),
  lastError: text("last_error"),
  metadata: json("metadata"),

  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  processedAt: datetime("processed_at", { mode: "date", fsp: 3 }),
}, table => [
  uniqueIndex("email_reports_message_id_idx").on(table.customerId, table.messageId),
  index("email_reports_status_idx").on(table.status),
]);

export const emailReportFilesTable = mysqlTable("email_report_files", {
  id: int("id").autoincrement().primaryKey(),
  emailReportId: int("email_report_id").notNull().references(() => emailReportsTable.id),
  downloadUrl: text("download_url").notNull(),
  downloadUrlSha256: varchar("download_url_sha256", { length: 64 }).notNull(),
  fileName: text("file_name"),
  storedPath: text("stored_path"),
  fileSizeBytes: int("file_size_bytes"),
  contentSha256: varchar("content_sha256", { length: 64 }),
  status: mysqlEnum("status", ["PENDING", "IMPORTED", "FAILED"]).notNull().default("PENDING"),
  importJobId: int("import_job_id").references(() => importJobsTable.id),
  lastError: text("last_error"),
  summary: json("summary"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  processedAt: datetime("processed_at", { mode: "date", fsp: 3 }),
}, table => [
  uniqueIndex("email_report_files_url_idx").on(table.emailReportId, table.downloadUrlSha256),
  index("email_report_files_report_idx").on(table.emailReportId),
]);
