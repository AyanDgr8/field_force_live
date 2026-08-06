/**
 * Reads matching report emails over IMAP.
 *
 * SECURITY: the connection password is passed straight from configuration to
 * ImapFlow and is never logged. ImapFlow's own logger is disabled so message
 * bodies and credentials cannot reach the application log.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailReportsConfig } from "./config.js";

export type FetchedMessage = {
  uid: number;
  messageId: string;
  subject: string;
  fromName: string | null;
  from: string | null;
  receivedAt: Date | null;
  html: string | null;
  text: string | null;
  attachments: Array<{ fileName: string; contentType: string; content: Buffer }>;
};

type ImapFailure = Error & {
  responseText?: string;
  response?: string;
  authenticationFailed?: boolean;
  serverResponseCode?: string;
};

/** Converts ImapFlow's generic "Command failed" into a safe operator message. */
export function mailboxErrorMessage(error: unknown): string {
  const failure = error as ImapFailure;
  if (failure?.authenticationFailed || failure?.serverResponseCode === "AUTHENTICATIONFAILED") {
    return "Gmail authentication failed. Use a 16-character Google App Password in EMAIL_REPORTS_PASSWORD; the normal Gmail password cannot be used for IMAP.";
  }
  const detail = failure?.responseText?.trim();
  if (detail && detail.length <= 300) return detail;
  return failure instanceof Error ? failure.message : String(error);
}

function normalizeSubject(value: string | undefined | null): string {
  // Report subjects end in a varying date/run suffix and often arrive folded
  // across header lines, so comparison collapses whitespace and case.
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function subjectMatches(subject: string | undefined | null, match: string): boolean {
  return normalizeSubject(subject).includes(normalizeSubject(match));
}

export const REPORT_SUBJECTS = {
  DELIVERY: "ADM shipments for Daily Reports for New RunSheet Service ECOSETUPRIVATELIMITED",
  BGV: "BGV Pendency Due to Document Insufficiency LMA (2026) || ECO SETU PRIVATE LIMITED LCM",
  DROPOUT: "Dropout Data | ECO SETU PRIVATE LIMITED",
} as const;

export type ReportType = keyof typeof REPORT_SUBJECTS;

export function reportTypeForSubject(subject: string | undefined | null): ReportType | null {
  if (
    subjectMatches(subject, "BGV Pendency Due to Document Insufficiency LMA (2026) || ECO SETU PRIVATE LIMITED") ||
    subjectMatches(subject, "BGV (Employees List)")
  ) return "BGV";
  for (const [type, match] of Object.entries(REPORT_SUBJECTS) as Array<[ReportType, string]>) {
    if (subjectMatches(subject, match)) return type;
  }
  return null;
}

function connect(config: EmailReportsConfig): ImapFlow {
  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
    // Fail fast instead of hanging the poll when the host is unreachable.
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  });
}

/** Verifies credentials and mailbox access without downloading anything. */
export async function verifyMailbox(config: EmailReportsConfig): Promise<{ mailbox: string; total: number }> {
  const client = connect(config);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const total = typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      return { mailbox: config.mailbox, total };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/**
 * Returns report messages received within the lookback window whose subject
 * matches, excluding any message id in `knownMessageIds`.
 *
 * IMAP SEARCH on Gmail matches subject substrings server-side, but the filter
 * is repeated locally because servers differ on folding and encoded words.
 */
export async function fetchReportMessages(
  config: EmailReportsConfig,
  knownMessageIds: Set<string>,
  limit = 50,
  window?: { from: Date; to: Date },
): Promise<FetchedMessage[]> {
  const since = window?.from ?? new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
  const client = connect(config);
  await client.connect();

  const messages: FetchedMessage[] = [];
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      // IMAP dates have day precision. Exact time filtering is repeated after
      // message headers are fetched.
      const uids = await client.search({ since, ...(window ? { before: new Date(window.to.getTime() + 86_400_000) } : {}) }, { uid: true });
      if (!uids || uids.length === 0) return [];

      // Newest first, so a backlog larger than the limit still makes progress
      // on the reports that matter most.
      const ordered = [...uids].sort((a, b) => b - a).slice(0, limit * 4);

      for await (const message of client.fetch(
        ordered,
        { uid: true, envelope: true, source: true, internalDate: true },
        { uid: true },
      )) {
        if (messages.length >= limit) break;

        const envelopeId = message.envelope?.messageId?.trim();
        // A message with no Message-ID cannot be deduplicated by header, so the
        // mailbox UID stands in for it.
        const messageId = envelopeId || `uid:${config.mailbox}:${message.uid}`;
        if (knownMessageIds.has(messageId)) continue;
        if (!reportTypeForSubject(message.envelope?.subject)) continue;

        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const rawReceivedAt = message.internalDate ?? parsed.date ?? null;
        const receivedAt = rawReceivedAt ? new Date(rawReceivedAt) : null;
        if (window && (!receivedAt || receivedAt < window.from || receivedAt > window.to)) continue;
        messages.push({
          uid: message.uid,
          messageId,
          subject: (message.envelope?.subject ?? parsed.subject ?? "").trim(),
          fromName: parsed.from?.value?.[0]?.name?.trim() || null,
          from: parsed.from?.value?.[0]?.address ?? null,
          receivedAt,
          html: typeof parsed.html === "string" ? parsed.html : null,
          text: parsed.text ?? null,
          attachments: parsed.attachments
            .filter(attachment => /\.(xlsx?|csv|csv\.gz|gz)$/i.test(attachment.filename ?? "") && attachment.size <= 64 * 1024 * 1024)
            .map(attachment => ({
              fileName: attachment.filename || "attachment",
              contentType: attachment.contentType,
              content: attachment.content,
            })),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  return messages;
}

/** Flags handled messages as read so the mailbox reflects ingestion progress. */
export async function markMessagesSeen(config: EmailReportsConfig, uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  const client = connect(config);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      await client.messageFlagsAdd(uids, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}
