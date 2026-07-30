import nodemailer from "nodemailer";
import QRCode from "qrcode";

function required(name: "EMAIL_USER" | "EMAIL_PASSWORD"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

const port = Number(process.env.EMAIL_PORT ?? 465);

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST ?? "smtp.gmail.com",
  port,
  secure: port === 465,
  connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS ?? 10_000),
  greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS ?? 10_000),
  socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS ?? 15_000),
  auth: {
    user: required("EMAIL_USER"),
    // Google displays app passwords in four-character groups; SMTP expects
    // the underlying 16-character value.
    pass: required("EMAIL_PASSWORD").replace(/\s/g, ""),
  },
});

export function loginOtpRecipients(fallbackAddress: string): string[] {
  const configuredRecipients = (process.env.OTP_RECIPIENTS ?? "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  return configuredRecipients.length ? configuredRecipients : [fallbackAddress];
}

export async function verifyEmailConnection(): Promise<void> {
  await transporter.verify();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SHELL_OPEN =
  `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f6fb;padding:28px">` +
  `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f0">` +
  `<div style="background:#07111f;padding:22px 28px">` +
  `<span style="color:#fcd34d;font-size:18px;font-weight:800;letter-spacing:-0.4px">FieldForce Live</span>` +
  `</div><div style="padding:28px">`;
const SHELL_CLOSE = `</div></div></div>`;

const BUTTON = (href: string, label: string) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:#f59e0b;color:#07111f;font-weight:700;` +
  `text-decoration:none;padding:12px 22px;border-radius:10px">${escapeHtml(label)}</a>`;

/**
 * Sent the moment an account is created. Carries the sign-in credentials, so
 * the recipient can reach the dashboard without an administrator relaying them.
 */
export async function sendWelcomeEmail(options: {
  to: string;
  recipientName?: string;
  loginEmail: string;
  password: string;
  loginUrl: string;
  resetUrl: string;
  role?: string;
  mobileAppUrl?: string;
}): Promise<void> {
  const greeting = options.recipientName ? `Hi ${options.recipientName},` : "Hello,";
  const roleLine = options.role
    ? `<p style="margin:0 0 18px;color:#475569">Your account has been set up with the <b>${escapeHtml(options.role)}</b> role.</p>`
    : "";
  const mobileSetupText = options.mobileAppUrl
    ? `\n\nMobile app setup:\nAndroid users: Expo Go\niOS users: Expo Go\n` +
      `1. Install Expo Go from your phone's app store.\n` +
      `2. Scan the QR code in this email with your phone camera.\n` +
      `3. Open the link in Expo Go, allow the requested permissions, and sign in with the credentials above.\n` +
      `App link: ${options.mobileAppUrl}\n`
    : "";
  const qrCode = options.mobileAppUrl
    ? await QRCode.toBuffer(options.mobileAppUrl, {
        type: "png", width: 300, margin: 2, errorCorrectionLevel: "M",
      })
    : null;
  const mobileSetupHtml = options.mobileAppUrl
    ? `<div style="border-top:1px solid #e2e8f0;margin-top:24px;padding-top:22px">` +
      `<h3 style="margin:0 0 12px;color:#0f172a">Install and connect the mobile app</h3>` +
      `<p style="margin:0 0 5px;color:#0f172a"><b>Android users:</b> Expo Go</p>` +
      `<p style="margin:0 0 16px;color:#0f172a"><b>iOS users:</b> Expo Go</p>` +
      `<ol style="margin:0 0 18px;padding-left:22px;color:#475569;line-height:1.7">` +
      `<li>Install <b>Expo Go</b> from Google Play or the Apple App Store.</li>` +
      `<li>Scan the QR code below using your phone camera.</li>` +
      `<li>Open the link in Expo Go and allow the requested permissions.</li>` +
      `<li>Sign in using the email and temporary password shown above.</li>` +
      `</ol>` +
      `<p style="margin:0 0 12px;text-align:center"><img src="cid:fieldforce-mobile-qr" width="260" height="260" ` +
      `alt="QR code for the FieldForce Live mobile app" style="display:inline-block;width:260px;height:260px;max-width:100%;` +
      `border:1px solid #e2e8f0;border-radius:12px" /></p>` +
      `<p style="margin:0;text-align:center">${BUTTON(options.mobileAppUrl, "Open the mobile app")}</p></div>`
    : "";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? `Field Force Monitor <${required("EMAIL_USER")}>`,
    to: options.to,
    subject: "Welcome to FieldForce Live — your account is ready",
    text:
      `${greeting}\n\nYour FieldForce Live account is ready.\n\n` +
      `Sign in at: ${options.loginUrl}\n` +
      `Email: ${options.loginEmail}\n` +
      `Temporary password: ${options.password}\n\n` +
      `For your security, change this password after your first sign-in: ${options.resetUrl}\n` +
      mobileSetupText,
    html:
      SHELL_OPEN +
      `<h2 style="margin:0 0 10px;font-size:22px;color:#0f172a">${escapeHtml(greeting)}</h2>` +
      `<p style="margin:0 0 18px;color:#475569">Your FieldForce Live account is ready to use.</p>` +
      roleLine +
      `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:0 0 22px">` +
      `<p style="margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b">Your credentials</p>` +
      `<p style="margin:0 0 6px;color:#0f172a">Email: <b>${escapeHtml(options.loginEmail)}</b></p>` +
      `<p style="margin:0;color:#0f172a">Temporary password: <b style="font-family:monospace;font-size:16px">${escapeHtml(options.password)}</b></p>` +
      `</div>` +
      `<p style="margin:0 0 22px">${BUTTON(options.loginUrl, "Sign in to FieldForce")}</p>` +
      `<p style="margin:0;color:#64748b;font-size:13px">This password is shared with everyone who joins, so please ` +
      `<a href="${escapeHtml(options.resetUrl)}" style="color:#b45309">change it</a> right after your first sign-in.</p>` +
      mobileSetupHtml +
      SHELL_CLOSE,
    attachments: qrCode
      ? [{
          filename: "fieldforce-mobile-qr.png",
          content: qrCode,
          cid: "fieldforce-mobile-qr",
          contentType: "image/png",
        }]
      : [],
  });
}

/**
 * Password reset for the admin dashboard. Unlike the mobile flow (6-digit
 * code), this sends a one-time link that opens the reset form directly.
 */
export async function sendPasswordResetLinkEmail(options: {
  to: string;
  resetUrl: string;
  recipientName?: string;
  expiresInMinutes: number;
}): Promise<void> {
  const greeting = options.recipientName ? `Hi ${options.recipientName},` : "Hello,";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? `Field Force Monitor <${required("EMAIL_USER")}>`,
    to: options.to,
    subject: "Reset your FieldForce password",
    text:
      `${greeting}\n\nUse this link to choose a new FieldForce password:\n${options.resetUrl}\n\n` +
      `The link expires in ${options.expiresInMinutes} minutes and can only be used once.\n\n` +
      `If you did not request a password reset, ignore this email and your password stays unchanged.`,
    html:
      SHELL_OPEN +
      `<h2 style="margin:0 0 10px;font-size:22px;color:#0f172a">${escapeHtml(greeting)}</h2>` +
      `<p style="margin:0 0 22px;color:#475569">Use the button below to choose a new FieldForce password.</p>` +
      `<p style="margin:0 0 22px">${BUTTON(options.resetUrl, "Set a new password")}</p>` +
      `<p style="margin:0 0 8px;color:#64748b;font-size:13px">The link expires in ${options.expiresInMinutes} minutes and can only be used once.</p>` +
      `<p style="margin:0;color:#64748b;font-size:13px">If you did not request this, ignore this email — your password stays unchanged.</p>` +
      SHELL_CLOSE,
  });
}

export async function sendLoginOtpEmail(options: {
  to: string;
  code: string;
  recipientName?: string;
}): Promise<string[]> {
  const greeting = options.recipientName
    ? `Hi ${options.recipientName},`
    : "Hello,";
  const recipients = loginOtpRecipients(options.to);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? `Field Force Monitor <${required("EMAIL_USER")}>`,
    to: recipients,
    subject: "Your Field Force Monitor verification code",
    text: `${greeting}\n\nYour verification code is ${options.code}. It expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
    html: `<p>${greeting}</p><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${options.code}</p><p>This code expires in 10 minutes.</p><p>If you did not request this code, you can ignore this email.</p>`,
  });

  return recipients;
}

export async function sendPasswordResetCodeEmail(options: {
  to: string;
  code: string;
  recipientName?: string;
}): Promise<void> {
  const greeting = options.recipientName
    ? `Hi ${options.recipientName},`
    : "Hello,";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? `Field Force Monitor <${required("EMAIL_USER")}>`,
    to: options.to,
    subject: "Reset your FieldForce password",
    text: `${greeting}\n\nYour password reset code is ${options.code}. It expires in 10 minutes.\n\nIf you did not request a password reset, ignore this email and your password will remain unchanged.`,
    html: `<p>${greeting}</p><p>Use this code to reset your FieldForce password:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${options.code}</p><p>This code expires in 10 minutes.</p><p>If you did not request a password reset, ignore this email and your password will remain unchanged.</p>`,
  });
}

export async function sendPasswordChangedEmail(options: {
  to: string;
  recipientName?: string;
  changedByAdmin?: boolean;
}): Promise<void> {
  const greeting = options.recipientName
    ? `Hi ${options.recipientName},`
    : "Hello,";
  const actor = options.changedByAdmin
    ? "an administrator"
    : "a password reset request";

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? `Field Force Monitor <${required("EMAIL_USER")}>`,
    to: options.to,
    subject: "Your FieldForce password was changed",
    text: `${greeting}\n\nYour FieldForce password was changed through ${actor}.\n\nIf you did not expect this change, contact your administrator immediately.`,
    html: `<p>${greeting}</p><p>Your FieldForce password was changed through ${actor}.</p><p>If you did not expect this change, contact your administrator immediately.</p>`,
  });
}
