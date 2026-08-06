/**
 * Operator endpoints for the report-mailbox watcher.
 *
 * SECURITY: the mailbox password is never returned. `/status` reports only
 * whether credentials are present, alongside the non-secret connection
 * settings, so an operator can diagnose a misconfiguration without seeing it.
 */
import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, emailReportsTable, emailReportFilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { loadEmailReportsConfig, configurationProblem } from "../lib/emailReports/config.js";
import { mailboxErrorMessage, verifyMailbox } from "../lib/emailReports/mailbox.js";
import { recentReports, absoluteStoredPath, runIngestSweep } from "../lib/emailReports/ingest.js";
import { pollerState } from "../lib/emailReports/poller.js";

const router: IRouter = Router();

async function adminActor(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return !user || user.role === "USER" ? null : user;
}

router.get("/email-reports/status", requireAuth, async (req, res): Promise<void> => {
  const admin = await adminActor(req.adminUserId!);
  if (!admin) { res.status(403).json({ error: "Admin access required" }); return; }

  const config = loadEmailReportsConfig();
  res.json({
    configured: configurationProblem(config) === null,
    problem: configurationProblem(config),
    enabled: config.enabled,
    host: config.host,
    port: config.port,
    mailbox: config.mailbox,
    user: config.user || null,
    hasPassword: Boolean(config.password),
    subjectMatch: config.subjectMatch,
    pollSeconds: config.pollSeconds,
    lookbackDays: config.lookbackDays,
    storageDir: config.storageDir,
    customerId: config.customerId,
    poller: pollerState(),
  });
});

/** Connects to the mailbox and reports success without ingesting anything. */
router.post("/email-reports/test-connection", requireAuth, async (req, res): Promise<void> => {
  const admin = await adminActor(req.adminUserId!);
  if (!admin || admin.role !== "SUPER_ADMIN") { res.status(403).json({ error: "Only a Super Admin can test the mailbox" }); return; }

  const config = loadEmailReportsConfig();
  const problem = configurationProblem(config);
  if (problem) { res.status(400).json({ error: problem }); return; }

  try {
    const result = await verifyMailbox(config);
    res.json({ ok: true, ...result });
  } catch (error) {
    const reason = mailboxErrorMessage(error);
    // Gmail's rejection of a plain account password is the single most common
    // failure here, so the hint is surfaced rather than left to the logs.
    const hint = /invalid credentials|authenticationfailed|application-specific/i.test(reason)
      ? "Gmail rejects the ordinary account password over IMAP. Generate an app password at myaccount.google.com/apppasswords with 2-Step Verification enabled and set it as EMAIL_REPORTS_PASSWORD."
      : null;
    res.status(502).json({ ok: false, error: reason, hint });
  }
});

router.get("/email-reports", requireAuth, async (req, res): Promise<void> => {
  const admin = await adminActor(req.adminUserId!);
  if (!admin) { res.status(403).json({ error: "Admin access required" }); return; }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(await recentReports(admin.customerId, limit));
});

/** Runs a sweep immediately instead of waiting for the next poll. */
router.post("/email-reports/run", requireAuth, async (req, res): Promise<void> => {
  const admin = await adminActor(req.adminUserId!);
  if (!admin || admin.role !== "SUPER_ADMIN") { res.status(403).json({ error: "Only a Super Admin can run the ingestion" }); return; }
  const body = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Enter a valid start and end date/time" }); return; }
  if (body.data.from >= body.data.to) { res.status(400).json({ error: "End date/time must be after start date/time" }); return; }
  if (body.data.to.getTime() - body.data.from.getTime() > 31 * 24 * 60 * 60 * 1000) {
    res.status(400).json({ error: "A single fetch can cover at most 31 days" }); return;
  }
  const result = await runIngestSweep(
    { customerId: admin.customerId, enabled: true },
    { from: body.data.from, to: body.data.to, uploadedByUserId: admin.id },
  );
  if (result.reason) { res.status(502).json({ error: result.reason, ...result }); return; }
  res.json(result);
});

/** Downloads the stored copy of an ingested report. */
router.get("/email-reports/:id/file", requireAuth, async (req, res): Promise<void> => {
  const admin = await adminActor(req.adminUserId!);
  if (!admin) { res.status(403).json({ error: "Admin access required" }); return; }

  const [report] = await db.select().from(emailReportsTable)
    .where(eq(emailReportsTable.id, Number(req.params.id))).limit(1);
  if (!report || report.customerId !== admin.customerId || !report.storedPath) {
    res.status(404).json({ error: "Report file not found" }); return;
  }

  const storageRoot = absoluteStoredPath(loadEmailReportsConfig().storageDir);
  const filePath = absoluteStoredPath(report.storedPath);
  // Defence in depth: the stored path is server-generated, but a path that
  // escapes the report store is never served.
  if (path.relative(storageRoot, filePath).startsWith("..")) {
    res.status(400).json({ error: "Report file is outside the report store" }); return;
  }
  if (!(await stat(filePath).catch(() => null))) {
    res.status(410).json({ error: "Report file is no longer on disk" }); return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${report.fileName ?? "report"}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  createReadStream(filePath).pipe(res);
});

/** Downloads one file when a single email contains multiple report links. */
router.get("/email-report-files/:id/file", requireAuth, async (req, res): Promise<void> => {
  const admin = await adminActor(req.adminUserId!);
  if (!admin) { res.status(403).json({ error: "Admin access required" }); return; }
  const [row] = await db.select({ file: emailReportFilesTable, report: emailReportsTable })
    .from(emailReportFilesTable)
    .innerJoin(emailReportsTable, eq(emailReportsTable.id, emailReportFilesTable.emailReportId))
    .where(eq(emailReportFilesTable.id, Number(req.params.id))).limit(1);
  if (!row || row.report.customerId !== admin.customerId || !row.file.storedPath) {
    res.status(404).json({ error: "Report file not found" }); return;
  }
  const storageRoot = absoluteStoredPath(loadEmailReportsConfig().storageDir);
  const filePath = absoluteStoredPath(row.file.storedPath);
  if (path.relative(storageRoot, filePath).startsWith("..")) { res.status(400).json({ error: "Report file is outside the report store" }); return; }
  if (!(await stat(filePath).catch(() => null))) { res.status(410).json({ error: "Report file is no longer on disk" }); return; }
  const originalName = row.file.fileName ?? "report";
  if (/\.gz$/i.test(originalName)) {
    res.setHeader("Content-Disposition", `attachment; filename="${originalName.replace(/\.gz$/i, "")}"`);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    await pipeline(createReadStream(filePath), createGunzip(), res);
    return;
  }
  res.setHeader("Content-Disposition", `attachment; filename="${originalName}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  createReadStream(filePath).pipe(res);
});

export default router;
