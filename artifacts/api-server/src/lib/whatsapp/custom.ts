/**
 * Generic HTTP transport for any BSP (Gupshup, WATI, AiSensy, 360dialog, an
 * in-house gateway…).
 *
 * The operator supplies the endpoint, the auth header, and a request-body
 * template with {{to}} / {{text}} / {{from}} / {{apiKey}} placeholders, so a
 * new provider is a settings change rather than a code change.
 */
import type { SendRequest, SendResult, TransportContext } from "./types.js";

const TIMEOUT_MS = 15_000;

const DEFAULT_BODY_TEMPLATE = '{"to":"{{to}}","type":"text","text":"{{text}}"}';

/**
 * Substitutes placeholders. Values are JSON-escaped first because the common
 * case is a JSON body and message text routinely contains quotes and newlines.
 */
function render(template: string, values: Record<string, string>, jsonEscape: boolean): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key] ?? "";
    if (!jsonEscape) return value;
    const quoted = JSON.stringify(value);
    return quoted.slice(1, -1);
  });
}

async function readError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  return raw.slice(0, 500) || `HTTP ${response.status}`;
}

function extractMessageId(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ["messageId", "message_id", "id", "sid", "messageid"]) {
      const value = parsed[key];
      if (typeof value === "string" && value) return value;
    }
  } catch {
    // Providers that answer with plain text have no id to extract.
  }
  return undefined;
}

export async function sendViaCustom(
  request: SendRequest,
  { credentials }: TransportContext,
): Promise<SendResult> {
  const contentType = (credentials.contentType || "application/json").trim();
  const isJson = contentType.includes("json");
  const bodyTemplate = credentials.bodyTemplate?.trim() || DEFAULT_BODY_TEMPLATE;

  const values = {
    to: request.to,
    text: request.text,
    from: credentials.senderId ?? "",
    apiKey: credentials.apiKey ?? "",
    template: request.template.name,
    language: request.template.language,
  };

  const headerName = credentials.authHeaderName?.trim() || "Authorization";
  const headerValue = render(
    credentials.authHeaderValue?.trim() || "Bearer {{apiKey}}",
    values,
    false,
  );

  const body = isJson
    ? render(bodyTemplate, values, true)
    : render(bodyTemplate, values, false);

  const response = await fetch(credentials.endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      ...(headerValue ? { [headerName]: headerValue } : {}),
    },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) return { ok: false, error: await readError(response) };

  const raw = await response.text().catch(() => "");
  return { ok: true, providerMessageId: extractMessageId(raw) };
}

/**
 * There is no universal health endpoint for a custom gateway, so the only
 * honest check is a real send. The caller falls back to that.
 */
export async function testCustom({
  credentials,
}: TransportContext): Promise<SendResult & { detail?: string }> {
  if (!credentials.endpointUrl) return { ok: false, error: "Send endpoint URL is not set" };
  try {
    new URL(credentials.endpointUrl);
  } catch {
    return { ok: false, error: "Send endpoint URL is not a valid URL" };
  }
  return {
    ok: true,
    detail: "Endpoint looks valid. Send a test message to confirm the provider accepts it.",
  };
}
