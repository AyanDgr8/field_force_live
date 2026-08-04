/**
 * Meta WhatsApp Cloud API transport (graph.facebook.com).
 *
 * Business-initiated messages must use a template that Meta has approved, so
 * TEMPLATE mode is the default here. TEXT mode only reaches users who messaged
 * the business within the last 24 hours and is offered for that case alone.
 */
import type { SendRequest, SendResult, TransportContext } from "./types.js";

const DEFAULT_API_VERSION = "v23.0";
const TIMEOUT_MS = 15_000;

function apiBase(credentials: Record<string, string>): string {
  const version = (credentials.apiVersion || DEFAULT_API_VERSION).trim();
  return `https://graph.facebook.com/${version.startsWith("v") ? version : `v${version}`}`;
}

/** Meta reports failures inside a 200-shaped envelope as often as via status. */
async function readError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
    };
    if (parsed.error) {
      const details = parsed.error.error_data?.details;
      const code = parsed.error.code ? ` (code ${parsed.error.code})` : "";
      return `${details || parsed.error.message || "Unknown Graph API error"}${code}`;
    }
  } catch {
    // Fall through to the raw body — HTML error pages land here.
  }
  return raw.slice(0, 500) || `HTTP ${response.status}`;
}

function buildBody(request: SendRequest): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: request.to,
  };

  if (request.mode === "TEXT") {
    return { ...base, type: "text", text: { preview_url: true, body: request.text } };
  }

  const components: Array<Record<string, unknown>> = [];
  if (request.parameters.length) {
    components.push({
      type: "body",
      parameters: request.parameters.map((value) => ({ type: "text", text: value })),
    });
  }
  // Authentication templates always carry a copy-code / one-tap button whose
  // parameter repeats the code. Omitting it makes Meta reject the send.
  if (request.template.category === "AUTHENTICATION" && request.otpCode) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: request.otpCode }],
    });
  }

  return {
    ...base,
    type: "template",
    template: {
      name: request.template.name,
      language: { code: request.template.language },
      ...(components.length ? { components } : {}),
    },
  };
}

export async function sendViaMetaCloud(
  request: SendRequest,
  { credentials }: TransportContext,
): Promise<SendResult> {
  const url = `${apiBase(credentials)}/${credentials.phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildBody(request)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) return { ok: false, error: await readError(response) };

  const payload = (await response.json().catch(() => null)) as {
    messages?: Array<{ id?: string }>;
  } | null;
  return { ok: true, providerMessageId: payload?.messages?.[0]?.id };
}

/** Validates the token and phone number ID without spending a message. */
export async function testMetaCloud({
  credentials,
}: TransportContext): Promise<SendResult & { detail?: string }> {
  const url = `${apiBase(credentials)}/${credentials.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) return { ok: false, error: await readError(response) };

  const payload = (await response.json().catch(() => null)) as {
    verified_name?: string;
    display_phone_number?: string;
    quality_rating?: string;
  } | null;

  return {
    ok: true,
    detail: payload
      ? `Connected to ${payload.verified_name ?? "sender"} (${payload.display_phone_number ?? "unknown number"}), quality ${payload.quality_rating ?? "n/a"}`
      : "Credentials accepted",
  };
}

export type RemoteTemplate = {
  name: string;
  status: string;
  language: string;
  category: string;
};

/** Approved-template inventory, shown next to the expected names in the UI. */
export async function listMetaTemplates({
  credentials,
}: TransportContext): Promise<{ ok: boolean; templates: RemoteTemplate[]; error?: string }> {
  if (!credentials.businessAccountId) {
    return { ok: false, templates: [], error: "WhatsApp Business Account ID is not set" };
  }

  const url =
    `${apiBase(credentials)}/${credentials.businessAccountId}/message_templates` +
    `?fields=name,status,language,category&limit=200`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) return { ok: false, templates: [], error: await readError(response) };

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ name?: string; status?: string; language?: string; category?: string }>;
  } | null;

  return {
    ok: true,
    templates: (payload?.data ?? []).map((entry) => ({
      name: entry.name ?? "",
      status: entry.status ?? "UNKNOWN",
      language: entry.language ?? "",
      category: entry.category ?? "",
    })),
  };
}
