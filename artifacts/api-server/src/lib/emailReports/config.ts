/**
 * Configuration for the runsheet-report mailbox watcher.
 *
 * SECURITY: the mailbox password is read from the environment and never logged
 * or returned from an API route. Gmail and Google Workspace reject the ordinary
 * account password over IMAP — EMAIL_REPORTS_PASSWORD has to be a 16-character
 * app password generated at https://myaccount.google.com/apppasswords with
 * 2-Step Verification switched on.
 */

export type EmailReportsConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailbox: string;
  /** Case-insensitive substring every report subject starts with. */
  subjectMatch: string;
  pollSeconds: number;
  /** Only look at messages newer than this many days on the first sweep. */
  lookbackDays: number;
  storageDir: string;
  /** Owning organization for the reports this mailbox delivers. */
  customerId: number | null;
  /** Mark handled messages as read so the mailbox shows what has been ingested. */
  markSeen: boolean;
};

const DEFAULT_SUBJECT_MATCH =
  "ADM shipments for Daily Reports for New RunSheet Service ECOSETUPRIVATELIMITED";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadEmailReportsConfig(): EmailReportsConfig {
  const user = process.env.EMAIL_REPORTS_USER?.trim() ?? "";
  const password = process.env.EMAIL_REPORTS_PASSWORD ?? "";
  const customerId = Number(process.env.EMAIL_REPORTS_CUSTOMER_ID);

  return {
    // Credentials are what actually gate the watcher: without them there is
    // nothing to connect to, so an unconfigured deployment stays silent.
    enabled: bool(process.env.EMAIL_REPORTS_ENABLED, true) && Boolean(user && password),
    host: process.env.EMAIL_REPORTS_HOST?.trim() || "imap.gmail.com",
    port: num(process.env.EMAIL_REPORTS_PORT, 993),
    secure: bool(process.env.EMAIL_REPORTS_SECURE, true),
    user,
    password,
    mailbox: process.env.EMAIL_REPORTS_MAILBOX?.trim() || "INBOX",
    subjectMatch: process.env.EMAIL_REPORTS_SUBJECT_MATCH?.trim() || DEFAULT_SUBJECT_MATCH,
    pollSeconds: num(process.env.EMAIL_REPORTS_POLL_SECONDS, 300),
    lookbackDays: num(process.env.EMAIL_REPORTS_LOOKBACK_DAYS, 7),
    storageDir: process.env.EMAIL_REPORTS_STORAGE_DIR?.trim() || "storage/email-reports",
    customerId: Number.isInteger(customerId) && customerId > 0 ? customerId : null,
    markSeen: bool(process.env.EMAIL_REPORTS_MARK_SEEN, true),
  };
}

/** Human-readable reason the watcher is idle, or null when it is ready to run. */
export function configurationProblem(config: EmailReportsConfig): string | null {
  if (!config.user || !config.password) {
    return "Set EMAIL_REPORTS_USER and EMAIL_REPORTS_PASSWORD (a Google app password, not the account password).";
  }
  if (!config.customerId) {
    return "Set EMAIL_REPORTS_CUSTOMER_ID to the organization that owns these reports.";
  }
  return null;
}
