/**
 * One ingestion sweep: read matching report emails, extract the download link
 * from each, fetch the file, and record the result.
 *
 * A sweep is idempotent. Every message is written to `email_reports` keyed by
 * Message-ID before anything is downloaded, so a crash mid-download leaves a
 * FAILED row to retry rather than a silently missing report.
 *
 * The pipeline deliberately stops at DOWNLOADED. Turning a stored file into
 * attendance and delivery counts is the next stage and is not decided here.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, insertReturning, emailReportsTable, emailReportFilesTable } from "@workspace/db";
import { logger } from "../logger.js";
import { loadEmailReportsConfig, configurationProblem, type EmailReportsConfig } from "./config.js";
import { fetchReportMessages, mailboxErrorMessage, markMessagesSeen, reportTypeForSubject, type FetchedMessage } from "./mailbox.js";
import { extractLinkCandidates } from "./extractLink.js";
import { downloadReport, storeReportAttachment } from "./download.js";
import { processDownloadedReport } from "./processReport.js";

export type SweepResult = {
  ran: boolean;
  reason: string | null;
  matched: number;
  downloaded: number;
  imported: number;
  skipped: number;
  failed: number;
  reports: Array<{ messageId: string; subject: string; status: string; files?: Array<{ fileName?: string; status: string; error?: string; summary?: unknown }> }>; 
};

/** Timestamp prefix for stored files — sortable and filesystem-safe. */
function fileStamp(date: Date | null): string {
  return (date ?? new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

async function knownMessageIds(customerId: number): Promise<Set<string>> {
  // Only settled rows count as known. A FAILED row is left out on purpose so
  // the next sweep retries a link that was temporarily unreachable.
  const rows = await db
    .select({ messageId: emailReportsTable.messageId, status: emailReportsTable.status })
    .from(emailReportsTable)
    .where(eq(emailReportsTable.customerId, customerId));
  return new Set(rows.filter(row => row.status !== "FAILED").map(row => row.messageId));
}

async function ingestMessage(
  message: FetchedMessage,
  config: EmailReportsConfig,
  customerId: number,
  uploadedByUserId: number | null,
): Promise<{ status: "IMPORTED" | "SKIPPED" | "FAILED"; files: Array<{ fileName?: string; status: string; error?: string; summary?: unknown }> }> {
  const reportType = reportTypeForSubject(message.subject);
  if (!reportType) return { status: "SKIPPED", files: [{ status: "SKIPPED", error: "Subject did not match a configured report type" }] };
  const candidates = extractLinkCandidates(message.html, message.text);
  // Scores below 10 are normally navigation/footer links. If no link reaches
  // that threshold, retain the single best candidate so unusual signed report
  // URLs can still be attempted without crawling the whole email footer.
  const reportLinks = candidates.filter(candidate => candidate.score >= 10).slice(0, 10);
  if (reportLinks.length === 0 && message.attachments.length === 0 && candidates[0]) reportLinks.push(candidates[0]);
  const best = reportLinks[0] ?? null;
  const metadata = {
    candidateLinks: candidates.slice(0, 10).map(candidate => ({
      url: candidate.url, label: candidate.label, score: candidate.score,
    })),
    attachments: message.attachments.map(attachment => ({ fileName: attachment.fileName, contentType: attachment.contentType })),
  };

  // A FAILED row from an earlier sweep is reused so retries do not accumulate
  // duplicate rows for the same message.
  const [existing] = await db.select().from(emailReportsTable).where(and(
    eq(emailReportsTable.customerId, customerId),
    eq(emailReportsTable.messageId, message.messageId),
  )).limit(1);

  const base = {
    customerId,
    messageId: message.messageId,
    mailbox: config.mailbox,
    messageUid: message.uid,
    subject: message.subject,
    fromName: message.fromName,
    fromAddress: message.from,
    receivedAt: message.receivedAt,
    reportType,
    downloadUrl: best?.url ?? null,
    metadata,
  };

  const row = existing
    ? (await db.update(emailReportsTable)
        .set({ ...base, status: "PENDING", attempts: existing.attempts + 1, lastError: null })
        .where(eq(emailReportsTable.id, existing.id)), existing)
    : await insertReturning(emailReportsTable, { ...base, status: "PENDING", attempts: 1 });

  if (reportLinks.length === 0 && message.attachments.length === 0) {
    await db.update(emailReportsTable)
      .set({ status: "SKIPPED", lastError: "No download link found in the message body", processedAt: new Date() })
      .where(eq(emailReportsTable.id, row.id));
    return { status: "SKIPPED", files: [{ status: "SKIPPED", error: "No download link found in the message body" }] };
  }

  const files: Array<{ fileName?: string; status: string; error?: string; summary?: unknown }> = [];
  let firstImported: { fileName: string; storedPath: string; sizeBytes: number; sha256: string; jobId: number } | null = null;
  const sources = [
    ...message.attachments.map((attachment, index) => ({
      key: `attachment:${message.messageId}:${index}:${attachment.fileName}`,
      load: () => storeReportAttachment(attachment.content, attachment.fileName, attachment.contentType, config.storageDir, `${fileStamp(message.receivedAt)}_attachment_${index + 1}`),
    })),
    ...reportLinks.map((candidate, index) => ({
      key: candidate.url,
      load: () => downloadReport(candidate.url, config.storageDir, `${fileStamp(message.receivedAt)}_link_${index + 1}`),
    })),
  ];
  for (const source of sources) {
    const urlSha256 = createHash("sha256").update(source.key).digest("hex");
    const [existingFile] = await db.select().from(emailReportFilesTable).where(and(
      eq(emailReportFilesTable.emailReportId, row.id), eq(emailReportFilesTable.downloadUrlSha256, urlSha256),
    )).limit(1);
    const fileRow = existingFile ?? await insertReturning(emailReportFilesTable, {
      emailReportId: row.id, downloadUrl: source.key, downloadUrlSha256: urlSha256, status: "PENDING",
    });
    try {
      const report = await source.load();
      const summary = await processDownloadedReport({
        customerId, uploadedByUserId, reportType, fileName: report.fileName, storedPath: report.storedPath,
      });
      await db.update(emailReportFilesTable).set({
        fileName: report.fileName, storedPath: report.storedPath, fileSizeBytes: report.sizeBytes,
        contentSha256: report.sha256, status: "IMPORTED", importJobId: summary.jobId,
        lastError: null, summary, processedAt: new Date(),
      }).where(eq(emailReportFilesTable.id, fileRow.id));
      firstImported ??= { ...report, jobId: summary.jobId };
      files.push({ fileName: report.fileName, status: "IMPORTED", summary });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await db.update(emailReportFilesTable).set({ status: "FAILED", lastError: reason.slice(0, 1000), processedAt: new Date() })
        .where(eq(emailReportFilesTable.id, fileRow.id));
      files.push({ status: "FAILED", error: reason });
    }
  }
  const importedCount = files.filter(file => file.status === "IMPORTED").length;
  const status = importedCount > 0 ? "IMPORTED" as const : "FAILED" as const;
  const error = status === "FAILED" ? "None of the report links could be downloaded and imported" : null;
  await db.update(emailReportsTable).set({
    status,
    ...(firstImported ? {
      fileName: firstImported.fileName, storedPath: firstImported.storedPath,
      fileSizeBytes: firstImported.sizeBytes, contentSha256: firstImported.sha256, importJobId: firstImported.jobId,
    } : {}),
    metadata: { ...metadata, attemptedReportLinks: reportLinks.length, attemptedAttachments: message.attachments.length, importedFiles: importedCount },
    lastError: error, processedAt: new Date(),
  }).where(eq(emailReportsTable.id, row.id));
  return { status, files };
}

/** Runs a single sweep of the report mailbox. Never throws. */
export async function runIngestSweep(
  overrides?: Partial<EmailReportsConfig>,
  options?: { from: Date; to: Date; uploadedByUserId: number | null },
): Promise<SweepResult> {
  const config = { ...loadEmailReportsConfig(), ...overrides };
  const empty: SweepResult = { ran: false, reason: null, matched: 0, downloaded: 0, imported: 0, skipped: 0, failed: 0, reports: [] };

  const problem = configurationProblem(config);
  if (problem) return { ...empty, reason: problem };
  if (!config.enabled) return { ...empty, reason: "Report ingestion is disabled (EMAIL_REPORTS_ENABLED)." };

  const customerId = config.customerId!;
  const result: SweepResult = { ...empty, ran: true, reports: [] };

  let messages: FetchedMessage[];
  try {
    messages = await fetchReportMessages(config, await knownMessageIds(customerId), 100, options ? { from: options.from, to: options.to } : undefined);
  } catch (error) {
    const reason = mailboxErrorMessage(error);
    logger.error({ err: reason, host: config.host, user: config.user }, "Report mailbox could not be read");
    return { ...empty, ran: true, reason: reason.slice(0, 500) };
  }

  result.matched = messages.length;
  const handledUids: number[] = [];

  for (const message of messages) {
    const outcome = await ingestMessage(message, config, customerId, options?.uploadedByUserId ?? null);
    const importedFiles = outcome.files.filter(file => file.status === "IMPORTED").length;
    const failedFiles = outcome.files.filter(file => file.status === "FAILED").length;
    if (outcome.status === "IMPORTED") { result.downloaded += importedFiles; result.imported += importedFiles; result.failed += failedFiles; handledUids.push(message.uid); }
    else if (outcome.status === "SKIPPED") { result.skipped++; handledUids.push(message.uid); }
    else result.failed++;

    result.reports.push({
      messageId: message.messageId,
      subject: message.subject,
      status: outcome.status,
      files: outcome.files,
    });
  }

  if (config.markSeen && handledUids.length > 0) {
    // Losing the read-flag update must not fail an otherwise good sweep.
    await markMessagesSeen(config, handledUids)
      .catch(err => logger.warn({ err }, "Could not flag report messages as read"));
  }

  if (result.matched > 0) {
    logger.info({
      matched: result.matched, downloaded: result.downloaded,
      skipped: result.skipped, failed: result.failed,
    }, "Report mailbox sweep finished");
  }
  return result;
}

/** Most recent ingestion rows, newest first — backs the status endpoint. */
export async function recentReports(customerId: number, limit = 50) {
  const reports = await db.select().from(emailReportsTable)
    .where(eq(emailReportsTable.customerId, customerId))
    .orderBy(desc(emailReportsTable.id))
    .limit(limit);
  return Promise.all(reports.map(async report => ({
    ...report,
    files: await db.select().from(emailReportFilesTable)
      .where(eq(emailReportFilesTable.emailReportId, report.id))
      .orderBy(emailReportFilesTable.id),
  })));
}

/** Absolute path of a stored report, for the stage that will parse it. */
export function absoluteStoredPath(storedPath: string): string {
  return path.isAbsolute(storedPath) ? storedPath : path.resolve(process.cwd(), storedPath);
}

export async function reportsByStatus(customerId: number, statuses: Array<typeof emailReportsTable.$inferSelect["status"]>) {
  return db.select().from(emailReportsTable).where(and(
    eq(emailReportsTable.customerId, customerId),
    inArray(emailReportsTable.status, statuses),
  ));
}
