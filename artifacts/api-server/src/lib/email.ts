import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./logger.js";

// Once a domain is verified at resend.com/domains, set EMAIL_FROM_ADDRESS
// (e.g. "FieldForce Live <no-reply@yourdomain.com>") to send from it.
const FROM_ADDRESS =
  process.env.EMAIL_FROM_ADDRESS ?? "FieldForce Live <onboarding@resend.dev>";

/**
 * Sends a transactional email via the Resend connector.
 * Never cache the connectors client -- tokens expire.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const connectors = new ReplitConnectors();

  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error({ status: response.status, body }, "Failed to send email via Resend");
    throw new Error(`Failed to send email: ${response.status}`);
  }
}

export function otpEmailHtml(code: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>FieldForce Live</h2>
      <p>Your admin login verification code is:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p style="color: #666;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
    </div>
  `;
}
