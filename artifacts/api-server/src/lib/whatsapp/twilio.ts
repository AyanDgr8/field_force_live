/**
 * Twilio WhatsApp transport (api.twilio.com REST v2010).
 *
 * In TEMPLATE mode the configured template "name" is treated as a Twilio
 * Content SID (HX…) and the ordered parameters become ContentVariables, which
 * is how Twilio models approved WhatsApp templates.
 */
import type { SendRequest, SendResult, TransportContext } from "./types.js";

const API_ROOT = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 15_000;

function authHeader(credentials: Record<string, string>): string {
  const token = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64");
  return `Basic ${token}`;
}

async function readError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { message?: string; code?: number; more_info?: string };
    if (parsed.message) {
      return `${parsed.message}${parsed.code ? ` (code ${parsed.code})` : ""}`;
    }
  } catch {
    // Non-JSON body; fall through.
  }
  return raw.slice(0, 500) || `HTTP ${response.status}`;
}

function whatsappAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  return `whatsapp:${trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/\D/g, "")}`}`;
}

export async function sendViaTwilio(
  request: SendRequest,
  { credentials }: TransportContext,
): Promise<SendResult> {
  const form = new URLSearchParams();
  form.set("To", whatsappAddress(request.to));

  if (credentials.messagingServiceSid) {
    form.set("MessagingServiceSid", credentials.messagingServiceSid);
  } else {
    form.set("From", whatsappAddress(credentials.fromNumber ?? ""));
  }

  if (request.mode === "TEMPLATE") {
    form.set("ContentSid", request.template.name);
    if (request.parameters.length) {
      form.set(
        "ContentVariables",
        JSON.stringify(
          Object.fromEntries(request.parameters.map((value, index) => [String(index + 1), value])),
        ),
      );
    }
  } else {
    form.set("Body", request.text);
  }

  const response = await fetch(`${API_ROOT}/Accounts/${credentials.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: authHeader(credentials),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) return { ok: false, error: await readError(response) };

  const payload = (await response.json().catch(() => null)) as { sid?: string } | null;
  return { ok: true, providerMessageId: payload?.sid };
}

export async function testTwilio({
  credentials,
}: TransportContext): Promise<SendResult & { detail?: string }> {
  const response = await fetch(`${API_ROOT}/Accounts/${credentials.accountSid}.json`, {
    headers: { Authorization: authHeader(credentials) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) return { ok: false, error: await readError(response) };

  const payload = (await response.json().catch(() => null)) as {
    friendly_name?: string;
    status?: string;
  } | null;

  return {
    ok: true,
    detail: `Twilio account ${payload?.friendly_name ?? credentials.accountSid} is ${payload?.status ?? "reachable"}`,
  };
}
