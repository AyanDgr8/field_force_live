/**
 * Shared account-provisioning rules.
 *
 * Every account is created with the same starter password and is told to
 * change it from the reset page on first sign-in. Because that password is
 * public knowledge, an account is only as safe as how quickly the owner
 * replaces it — see the reset flow in routes/auth.ts.
 */
export const DEFAULT_USER_PASSWORD = "12345678";

/** Minutes a password-reset link stays usable. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/**
 * Marks an otp_tokens row as a dashboard reset *link* rather than a numeric
 * code. The mobile reset endpoint only accepts /^\d{6}$/, so a link token can
 * never be replayed there, and vice versa.
 */
export const PASSWORD_RESET_LINK_CODE = "PASSWORD_RESET_LINK";

/**
 * Public origin of the admin dashboard, used to build links inside emails.
 *
 * Deliberately not derived from the request Host/Origin header: those are
 * attacker-controlled, and a poisoned header would send reset links to a
 * domain of their choosing. In development APP_URL usually still points at the
 * production domain, so local runs fall back to the dev server instead.
 */
export function adminBaseUrl(): string {
  const basePath = (process.env.BASE_PATH ?? "/").replace(/\/+$/, "");

  const origin =
    process.env.NODE_ENV === "production"
      ? (process.env.APP_URL ?? "").replace(/\/+$/, "")
      : `http://localhost:${process.env.FRONTEND_PORT ?? "7075"}`;

  return `${origin}${basePath}`;
}

export function loginUrl(): string {
  return `${adminBaseUrl()}/login`;
}

export function passwordResetRequestUrl(): string {
  return `${adminBaseUrl()}/reset-password`;
}

/** Public URL encoded in the QR code sent to newly created field agents. */
export function mobileAppUrl(): string {
  const configured = (process.env.MOBILE_APP_URL ?? "").replace(/\/+$/, "");
  if (configured) return configured;

  const publicOrigin = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return publicOrigin ? `${publicOrigin}/mobile-app` : `${adminBaseUrl()}/mobile-app`;
}

export function passwordResetLinkUrl(userId: number, token: string): string {
  return `${adminBaseUrl()}/reset-password/${userId}/${token}`;
}
