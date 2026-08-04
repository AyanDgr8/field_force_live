/**
 * WhatsApp delivery entry point.
 *
 * Resolves the tenant configuration, picks the transport, sends, and writes an
 * audit row for every attempt. Nothing in here throws to the caller: a failed
 * WhatsApp send is reported in the return value and logged, never allowed to
 * break the request that triggered the notification.
 */
import { db, notificationLogTable } from "@workspace/db";
import type { NotificationKind, WhatsappProviderKey } from "@workspace/db";
import { logger } from "../logger.js";
import { sendViaCustom, testCustom } from "./custom.js";
import { listMetaTemplates, sendViaMetaCloud, testMetaCloud } from "./metaCloud.js";
import {
  otpCode,
  templateParameters,
  whatsappText,
  type NotificationPayload,
} from "./messages.js";
import { sendViaTwilio, testTwilio } from "./twilio.js";
import {
  loadWhatsappSettings,
  maskPhone,
  recordChannelHealth,
  toE164Digits,
  type ResolvedWhatsappSettings,
} from "./settings.js";
import type { SendRequest, SendResult, TransportContext } from "./types.js";

export type WhatsappDispatchResult = {
  attempted: boolean;
  ok: boolean;
  /** Masked numbers that accepted the message. */
  sentTo: string[];
  errors: string[];
  /** Why nothing was attempted, when `attempted` is false. */
  skippedReason?: string;
};

const TRANSPORTS: Record<
  WhatsappProviderKey,
  (request: SendRequest, context: TransportContext) => Promise<SendResult>
> = {
  META_CLOUD: sendViaMetaCloud,
  TWILIO: sendViaTwilio,
  CUSTOM: sendViaCustom,
};

async function writeLog(entry: {
  customerId: number;
  userId?: number | null;
  kind: NotificationKind;
  channel: "WHATSAPP" | "EMAIL";
  provider?: string | null;
  recipient: string;
  status: "SENT" | "FAILED" | "SKIPPED";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await db.insert(notificationLogTable).values({
      customerId: entry.customerId,
      userId: entry.userId ?? null,
      kind: entry.kind,
      channel: entry.channel,
      provider: entry.provider ?? null,
      recipient: entry.recipient.slice(0, 128),
      status: entry.status,
      providerMessageId: entry.providerMessageId?.slice(0, 191) ?? null,
      errorMessage: entry.errorMessage?.slice(0, 1000) ?? null,
    });
  } catch (error) {
    // The audit table must never be the reason a notification path fails.
    logger.error({ err: error, kind: entry.kind }, "Failed to write notification log");
  }
}

/** Exposed so the email side of the dispatcher shares one audit trail. */
export const logNotificationAttempt = writeLog;

function buildRequest(
  payload: NotificationPayload,
  settings: ResolvedWhatsappSettings,
  to: string,
): SendRequest {
  return {
    to,
    mode: settings.messageMode,
    text: whatsappText(payload),
    template: settings.templates[payload.kind],
    parameters: templateParameters(payload),
    otpCode: otpCode(payload),
  };
}

export async function sendWhatsAppNotification(options: {
  customerId: number;
  userId?: number | null;
  /** Raw stored phone number; normalised with the tenant's country code. */
  phoneNumber?: string | null;
  payload: NotificationPayload;
  settings?: ResolvedWhatsappSettings;
  /** Overrides the recipient entirely, e.g. the Send test message button. */
  toOverride?: string[];
}): Promise<WhatsappDispatchResult> {
  const settings = options.settings ?? (await loadWhatsappSettings(options.customerId));
  const kind = options.payload.kind;

  if (settings.channelMode === "EMAIL_ONLY") {
    return { attempted: false, ok: false, sentTo: [], errors: [], skippedReason: "Channel set to email only" };
  }
  if (!settings.enabled || !settings.configured) {
    return {
      attempted: false,
      ok: false,
      sentTo: [],
      errors: [],
      skippedReason: settings.configured
        ? "WhatsApp notifications are switched off"
        : "WhatsApp credentials are not configured",
    };
  }

  // Login OTPs can be routed to a fixed security desk, mirroring OTP_RECIPIENTS
  // on the email side.
  const rawRecipients =
    options.toOverride?.length
      ? options.toOverride
      : kind === "LOGIN_OTP" && settings.otpRecipients.length
        ? settings.otpRecipients
        : options.phoneNumber
          ? [options.phoneNumber]
          : [];

  const recipients = rawRecipients
    .map((value) => toE164Digits(value, settings.defaultCountryCode))
    .filter((value): value is string => Boolean(value));

  if (!recipients.length) {
    const reason = rawRecipients.length
      ? "No valid WhatsApp number after normalisation"
      : "No phone number on file";
    await writeLog({
      customerId: options.customerId,
      userId: options.userId,
      kind,
      channel: "WHATSAPP",
      provider: settings.provider,
      recipient: rawRecipients[0]?.slice(0, 128) || "—",
      status: "SKIPPED",
      errorMessage: reason,
    });
    return { attempted: false, ok: false, sentTo: [], errors: [], skippedReason: reason };
  }

  const transport = TRANSPORTS[settings.provider];
  const context: TransportContext = { credentials: settings.credentials };
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const recipient of recipients) {
    const masked = maskPhone(recipient);
    let result: SendResult;
    try {
      result = await transport(buildRequest(options.payload, settings, recipient), context);
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown transport error",
      };
    }

    await writeLog({
      customerId: options.customerId,
      userId: options.userId,
      kind,
      channel: "WHATSAPP",
      provider: settings.provider,
      recipient: masked,
      status: result.ok ? "SENT" : "FAILED",
      providerMessageId: result.providerMessageId,
      errorMessage: result.error,
    });

    if (result.ok) sentTo.push(masked);
    else errors.push(result.error ?? "Unknown error");
  }

  const ok = sentTo.length > 0;
  if (settings.source === "DATABASE") {
    await recordChannelHealth(options.customerId, { ok, error: errors[0] });
  }
  if (!ok) {
    logger.error({ customerId: options.customerId, kind, errors }, "WhatsApp notification failed");
  }

  return { attempted: true, ok, sentTo, errors };
}

/** Credential check for the dashboard's Test connection button. */
export async function testWhatsAppConnection(
  customerId: number,
): Promise<{ ok: boolean; detail?: string; error?: string }> {
  const settings = await loadWhatsappSettings(customerId);
  if (!settings.configured) {
    return { ok: false, error: "Fill in every required credential first" };
  }

  const context: TransportContext = { credentials: settings.credentials };
  try {
    const result =
      settings.provider === "META_CLOUD"
        ? await testMetaCloud(context)
        : settings.provider === "TWILIO"
          ? await testTwilio(context)
          : await testCustom(context);

    if (settings.source === "DATABASE") {
      await recordChannelHealth(customerId, { ok: result.ok, error: result.error, tested: true });
    }
    return result.ok
      ? { ok: true, detail: result.detail }
      : { ok: false, error: result.error ?? "Connection test failed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    if (settings.source === "DATABASE") {
      await recordChannelHealth(customerId, { ok: false, error: message, tested: true });
    }
    return { ok: false, error: message };
  }
}

/** Approved-template inventory; only Meta exposes one. */
export async function fetchApprovedTemplates(customerId: number) {
  const settings = await loadWhatsappSettings(customerId);
  if (settings.provider !== "META_CLOUD") {
    return {
      ok: false,
      templates: [],
      error: "Template listing is only available for the Meta Cloud API",
    };
  }
  if (!settings.configured) {
    return { ok: false, templates: [], error: "Fill in every required credential first" };
  }
  try {
    return await listMetaTemplates({ credentials: settings.credentials });
  } catch (error) {
    return {
      ok: false,
      templates: [],
      error: error instanceof Error ? error.message : "Failed to list templates",
    };
  }
}

export { loadWhatsappSettings, maskPhone, toE164Digits } from "./settings.js";
export type { NotificationPayload } from "./messages.js";
