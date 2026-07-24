import nodemailer from "nodemailer";

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
  auth: {
    user: required("EMAIL_USER"),
    // Google displays app passwords in four-character groups; SMTP expects
    // the underlying 16-character value.
    pass: required("EMAIL_PASSWORD").replace(/\s/g, ""),
  },
});

export async function verifyEmailConnection(): Promise<void> {
  await transporter.verify();
}

export async function sendLoginOtpEmail(options: {
  to: string;
  code: string;
  recipientName?: string;
}): Promise<string[]> {
  const greeting = options.recipientName
    ? `Hi ${options.recipientName},`
    : "Hello,";
  const configuredRecipients = (process.env.OTP_RECIPIENTS ?? "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);
  const recipients = configuredRecipients.length
    ? configuredRecipients
    : [options.to];

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
