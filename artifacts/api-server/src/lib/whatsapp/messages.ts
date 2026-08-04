/**
 * Notification content, shared by both delivery channels.
 *
 * Every notification exists in two forms:
 *  - a plain-text body used for freeform WhatsApp sends (TEXT mode), and
 *  - an ordered parameter list used to fill an approved template (TEMPLATE mode).
 *
 * Meta rejects template parameters containing newlines, tabs, or runs of four
 * or more spaces, so parameters are always short single-line values and any
 * multi-line formatting lives in the approved template body instead.
 */
import type { NotificationKind } from "@workspace/db";

export type TemplateConfig = {
  name: string;
  language: string;
  category: "AUTHENTICATION" | "UTILITY";
};

export type NotificationPayload =
  | { kind: "LOGIN_OTP"; recipientName?: string; code: string }
  | { kind: "PASSWORD_RESET_CODE"; recipientName?: string; code: string }
  | {
      kind: "PASSWORD_RESET_LINK";
      recipientName?: string;
      resetUrl: string;
      expiresInMinutes: number;
    }
  | { kind: "PASSWORD_CHANGED"; recipientName?: string; changedByAdmin?: boolean }
  | {
      kind: "WELCOME";
      recipientName?: string;
      loginEmail: string;
      password: string;
      loginUrl: string;
      resetUrl: string;
      role?: string;
      mobileAppUrl?: string;
    }
  | { kind: "TEST"; recipientName?: string };

/**
 * Default template names and the exact body text to submit to Meta for
 * approval. `sampleBody` is rendered in the dashboard Templates tab so an
 * administrator can copy it into the template editor verbatim.
 */
export const TEMPLATE_DEFINITIONS: Record<
  NotificationKind,
  TemplateConfig & { description: string; sampleBody: string; parameterLabels: string[] }
> = {
  LOGIN_OTP: {
    name: "ff_login_otp",
    language: "en",
    category: "AUTHENTICATION",
    description: "Six-digit code for signing in to the admin dashboard.",
    sampleBody: "*{{1}}* is your FieldForce verification code. It expires in 10 minutes.",
    parameterLabels: ["Verification code"],
  },
  PASSWORD_RESET_CODE: {
    name: "ff_password_reset_code",
    language: "en",
    category: "AUTHENTICATION",
    description: "Six-digit code used by field agents resetting a password in the mobile app.",
    sampleBody: "*{{1}}* is your FieldForce password reset code. It expires in 10 minutes.",
    parameterLabels: ["Reset code"],
  },
  PASSWORD_RESET_LINK: {
    name: "ff_password_reset_link",
    language: "en",
    category: "UTILITY",
    description: "One-time password reset link for the admin dashboard.",
    sampleBody:
      "Hi {{1}}, use this link to choose a new FieldForce password: {{2}} It expires in {{3}} minutes and can only be used once. If you did not request this, ignore this message.",
    parameterLabels: ["Recipient first name", "Reset link", "Minutes until expiry"],
  },
  PASSWORD_CHANGED: {
    name: "ff_password_changed",
    language: "en",
    category: "UTILITY",
    description: "Security confirmation sent after a password changes.",
    sampleBody:
      "Hi {{1}}, your FieldForce password was changed through {{2}}. If you did not expect this, contact your administrator immediately.",
    parameterLabels: ["Recipient first name", "Who made the change"],
  },
  WELCOME: {
    name: "ff_welcome_account",
    language: "en",
    category: "UTILITY",
    description: "New account handover with sign-in credentials.",
    sampleBody:
      "Hi {{1}}, your FieldForce Live account is ready. Sign in at {{2}} with email {{3}} and temporary password {{4}}. Please change it right after your first sign-in.",
    parameterLabels: ["Recipient first name", "Sign-in URL", "Login email", "Temporary password"],
  },
  TEST: {
    name: "ff_test_message",
    language: "en",
    category: "UTILITY",
    description: "Used only by the Send test message button on this page.",
    sampleBody: "Hi {{1}}, this is a FieldForce Live test message. Your WhatsApp channel is working.",
    parameterLabels: ["Recipient first name"],
  },
};

export const DEFAULT_TEMPLATES: Record<NotificationKind, TemplateConfig> = Object.fromEntries(
  Object.entries(TEMPLATE_DEFINITIONS).map(([kind, definition]) => [
    kind,
    { name: definition.name, language: definition.language, category: definition.category },
  ]),
) as Record<NotificationKind, TemplateConfig>;

function greetingName(payload: NotificationPayload): string {
  return payload.recipientName?.trim() || "there";
}

/** Plain-text body used in TEXT mode and as the fallback preview in the UI. */
export function whatsappText(payload: NotificationPayload): string {
  switch (payload.kind) {
    case "LOGIN_OTP":
      return (
        `Hi ${greetingName(payload)}, your FieldForce Live verification code is *${payload.code}*.\n\n` +
        `It expires in 10 minutes. If you did not try to sign in, ignore this message.`
      );
    case "PASSWORD_RESET_CODE":
      return (
        `Hi ${greetingName(payload)}, your FieldForce password reset code is *${payload.code}*.\n\n` +
        `It expires in 10 minutes. If you did not request a reset, ignore this message and your password stays unchanged.`
      );
    case "PASSWORD_RESET_LINK":
      return (
        `Hi ${greetingName(payload)}, use this link to choose a new FieldForce password:\n${payload.resetUrl}\n\n` +
        `The link expires in ${payload.expiresInMinutes} minutes and can only be used once. ` +
        `If you did not request this, ignore this message and your password stays unchanged.`
      );
    case "PASSWORD_CHANGED":
      return (
        `Hi ${greetingName(payload)}, your FieldForce password was changed through ` +
        `${payload.changedByAdmin ? "an administrator" : "a password reset request"}.\n\n` +
        `If you did not expect this change, contact your administrator immediately.`
      );
    case "WELCOME": {
      const roleLine = payload.role ? `Role: ${payload.role}\n` : "";
      const mobileLines = payload.mobileAppUrl
        ? `\n\nMobile app setup:\n1. Install *Expo Go* from Google Play or the App Store.\n` +
          `2. Open this link on your phone: ${payload.mobileAppUrl}\n` +
          `3. Allow the requested permissions and sign in with the details above.`
        : "";
      return (
        `Hi ${greetingName(payload)}, your FieldForce Live account is ready.\n\n` +
        roleLine +
        `Sign in: ${payload.loginUrl}\n` +
        `Email: ${payload.loginEmail}\n` +
        `Temporary password: ${payload.password}\n\n` +
        `Please change this password right after your first sign-in: ${payload.resetUrl}` +
        mobileLines
      );
    }
    case "TEST":
      return (
        `Hi ${greetingName(payload)}, this is a test message from FieldForce Live.\n\n` +
        `If you can read this, your WhatsApp notification channel is configured correctly.`
      );
  }
}

/** Ordered {{1}}, {{2}}, … substitutions for the approved template body. */
export function templateParameters(payload: NotificationPayload): string[] {
  switch (payload.kind) {
    case "LOGIN_OTP":
    case "PASSWORD_RESET_CODE":
      return [payload.code];
    case "PASSWORD_RESET_LINK":
      return [greetingName(payload), payload.resetUrl, String(payload.expiresInMinutes)];
    case "PASSWORD_CHANGED":
      return [
        greetingName(payload),
        payload.changedByAdmin ? "an administrator" : "a password reset request",
      ];
    case "WELCOME":
      return [greetingName(payload), payload.loginUrl, payload.loginEmail, payload.password];
    case "TEST":
      return [greetingName(payload)];
  }
}

/**
 * Authentication-category templates carry a copy-code button whose parameter
 * repeats the code, so they need the raw code alongside the body parameters.
 */
export function otpCode(payload: NotificationPayload): string | null {
  return payload.kind === "LOGIN_OTP" || payload.kind === "PASSWORD_RESET_CODE"
    ? payload.code
    : null;
}
