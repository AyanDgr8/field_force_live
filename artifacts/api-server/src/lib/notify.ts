/**
 * Single entry point for every user-facing notification.
 *
 * Routes are expected to call the notify* helpers here rather than the mailer
 * directly, so that adding or reordering a channel never means touching a
 * request handler again. Each notification goes out over WhatsApp and email
 * according to the tenant's channel mode (both, by default).
 *
 * Nothing here throws. Callers get a per-channel result and decide what to
 * report; the notification itself is never allowed to fail the request that
 * produced it.
 */
import {
  loginOtpRecipients,
  sendLoginOtpEmail,
  sendPasswordChangedEmail,
  sendPasswordResetCodeEmail,
  sendPasswordResetLinkEmail,
  sendWelcomeEmail,
} from "./mailer.js";
import { logger } from "./logger.js";
import {
  loadWhatsappSettings,
  logNotificationAttempt,
  maskPhone,
  sendWhatsAppNotification,
  toE164Digits,
  type WhatsappDispatchResult,
} from "./whatsapp/index.js";
import type { NotificationPayload } from "./whatsapp/messages.js";

export type NotifyTarget = {
  customerId: number;
  userId?: number | null;
  email: string;
  phoneNumber?: string | null;
  recipientName?: string;
};

export type EmailDispatchResult = {
  attempted: boolean;
  ok: boolean;
  recipients: string[];
  error?: string;
  skippedReason?: string;
};

export type NotifyResult = {
  /** True when at least one channel delivered the notification. */
  ok: boolean;
  whatsapp: WhatsappDispatchResult;
  email: EmailDispatchResult;
};

function maskEmail(address: string): string {
  const [local, domain] = address.split("@");
  if (!local || !domain) return address;
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Runs both channels concurrently. WhatsApp settings are loaded once and
 * handed to the WhatsApp side so the channel mode and the send agree even if
 * the configuration is edited mid-flight.
 */
async function dispatch(
  target: NotifyTarget,
  payload: NotificationPayload,
  sendEmail: () => Promise<string[]>,
): Promise<NotifyResult> {
  const settings = await loadWhatsappSettings(target.customerId).catch((error: unknown) => {
    logger.error({ err: error, customerId: target.customerId }, "Failed to load WhatsApp settings");
    return null;
  });

  const emailAllowed = !settings || settings.channelMode !== "WHATSAPP_ONLY";

  const [whatsapp, email] = await Promise.all([
    sendWhatsAppNotification({
      customerId: target.customerId,
      userId: target.userId,
      phoneNumber: target.phoneNumber,
      payload,
      ...(settings ? { settings } : {}),
    }).catch((error: unknown) => ({
      attempted: true,
      ok: false,
      sentTo: [],
      errors: [error instanceof Error ? error.message : "Unknown WhatsApp error"],
    })),
    dispatchEmail(target, payload, sendEmail, emailAllowed),
  ]);

  return { ok: whatsapp.ok || email.ok, whatsapp, email };
}

async function dispatchEmail(
  target: NotifyTarget,
  payload: NotificationPayload,
  sendEmail: () => Promise<string[]>,
  allowed: boolean,
): Promise<EmailDispatchResult> {
  if (!allowed) {
    return {
      attempted: false,
      ok: false,
      recipients: [],
      skippedReason: "Channel set to WhatsApp only",
    };
  }

  try {
    const recipients = await sendEmail();
    const masked = recipients.map(maskEmail);
    await Promise.all(
      masked.map((recipient) =>
        logNotificationAttempt({
          customerId: target.customerId,
          userId: target.userId,
          kind: payload.kind,
          channel: "EMAIL",
          provider: "SMTP",
          recipient,
          status: "SENT",
        }),
      ),
    );
    return { attempted: true, ok: true, recipients: masked };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email error";
    logger.error({ err: error, kind: payload.kind, userId: target.userId }, "Email notification failed");
    await logNotificationAttempt({
      customerId: target.customerId,
      userId: target.userId,
      kind: payload.kind,
      channel: "EMAIL",
      provider: "SMTP",
      recipient: maskEmail(target.email),
      status: "FAILED",
      errorMessage: message,
    });
    return { attempted: true, ok: false, recipients: [], error: message };
  }
}

export function notifyLoginOtp(
  target: NotifyTarget,
  options: { code: string },
): Promise<NotifyResult> {
  return dispatch(
    target,
    { kind: "LOGIN_OTP", code: options.code, recipientName: target.recipientName },
    () =>
      sendLoginOtpEmail({
        to: target.email,
        code: options.code,
        recipientName: target.recipientName,
      }),
  );
}

export function notifyPasswordResetCode(
  target: NotifyTarget,
  options: { code: string },
): Promise<NotifyResult> {
  return dispatch(
    target,
    { kind: "PASSWORD_RESET_CODE", code: options.code, recipientName: target.recipientName },
    async () => {
      await sendPasswordResetCodeEmail({
        to: target.email,
        code: options.code,
        recipientName: target.recipientName,
      });
      return [target.email];
    },
  );
}

export function notifyPasswordResetLink(
  target: NotifyTarget,
  options: { resetUrl: string; expiresInMinutes: number },
): Promise<NotifyResult> {
  return dispatch(
    target,
    {
      kind: "PASSWORD_RESET_LINK",
      resetUrl: options.resetUrl,
      expiresInMinutes: options.expiresInMinutes,
      recipientName: target.recipientName,
    },
    async () => {
      await sendPasswordResetLinkEmail({
        to: target.email,
        resetUrl: options.resetUrl,
        expiresInMinutes: options.expiresInMinutes,
        recipientName: target.recipientName,
      });
      return [target.email];
    },
  );
}

export function notifyPasswordChanged(
  target: NotifyTarget,
  options: { changedByAdmin?: boolean } = {},
): Promise<NotifyResult> {
  return dispatch(
    target,
    {
      kind: "PASSWORD_CHANGED",
      changedByAdmin: options.changedByAdmin,
      recipientName: target.recipientName,
    },
    async () => {
      await sendPasswordChangedEmail({
        to: target.email,
        recipientName: target.recipientName,
        changedByAdmin: options.changedByAdmin,
      });
      return [target.email];
    },
  );
}

export function notifyWelcome(
  target: NotifyTarget,
  options: {
    loginEmail: string;
    password: string;
    loginUrl: string;
    resetUrl: string;
    role?: string;
    mobileAppUrl?: string;
  },
): Promise<NotifyResult> {
  return dispatch(
    target,
    { kind: "WELCOME", recipientName: target.recipientName, ...options },
    async () => {
      await sendWelcomeEmail({
        to: target.email,
        recipientName: target.recipientName,
        ...options,
      });
      return [target.email];
    },
  );
}

/**
 * Masked list of everyone a login OTP will reach, for the "code sent to …"
 * line on the sign-in screen. Computed before the send so the response can go
 * out without waiting on either provider.
 */
export async function loginOtpDestinations(target: NotifyTarget): Promise<string[]> {
  const settings = await loadWhatsappSettings(target.customerId).catch(() => null);
  const destinations: string[] = [];

  if (settings?.enabled && settings.channelMode !== "EMAIL_ONLY") {
    const numbers = settings.otpRecipients.length
      ? settings.otpRecipients
      : target.phoneNumber
        ? [target.phoneNumber]
        : [];
    for (const number of numbers) {
      const normalised = toE164Digits(number, settings.defaultCountryCode);
      if (normalised) destinations.push(maskPhone(normalised));
    }
  }

  if (!settings || settings.channelMode !== "WHATSAPP_ONLY") {
    destinations.push(...loginOtpRecipients(target.email).map(maskEmail));
  }

  return destinations.length ? destinations : [maskEmail(target.email)];
}
