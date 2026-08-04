/**
 * Loading, saving, and redacting the per-tenant WhatsApp configuration.
 *
 * Resolution order is database row → environment variables → unconfigured.
 * The environment layer exists so a deployment can be wired up from .env
 * before anyone signs in to the dashboard, and so the credentials survive a
 * database restore that predates the notification tables.
 */
import { eq } from "drizzle-orm";
import { db, whatsappSettingsTable } from "@workspace/db";
import type {
  NotificationKind,
  WhatsappProviderKey,
  WhatsappSettingsRow,
} from "@workspace/db";
import { decrypt, encrypt } from "../crypto.js";
import { logger } from "../logger.js";
import { DEFAULT_TEMPLATES, type TemplateConfig } from "./messages.js";
import { PROVIDER_SPECS, providerSpec, secretFieldKeys } from "./providers.js";

export type ChannelMode = "BOTH" | "WHATSAPP_ONLY" | "EMAIL_ONLY";
export type MessageMode = "TEMPLATE" | "TEXT";

export type ResolvedWhatsappSettings = {
  source: "DATABASE" | "ENVIRONMENT" | "NONE";
  configured: boolean;
  enabled: boolean;
  provider: WhatsappProviderKey;
  channelMode: ChannelMode;
  messageMode: MessageMode;
  defaultCountryCode: string;
  otpRecipients: string[];
  templates: Record<NotificationKind, TemplateConfig>;
  credentials: Record<string, string>;
};

/** Environment variable that supplies each provider credential as a fallback. */
const ENV_KEYS: Record<WhatsappProviderKey, Record<string, string>> = {
  META_CLOUD: {
    phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
    businessAccountId: "WHATSAPP_BUSINESS_ACCOUNT_ID",
    accessToken: "WHATSAPP_ACCESS_TOKEN",
    apiVersion: "WHATSAPP_API_VERSION",
  },
  TWILIO: {
    accountSid: "TWILIO_ACCOUNT_SID",
    authToken: "TWILIO_AUTH_TOKEN",
    fromNumber: "TWILIO_WHATSAPP_FROM",
    messagingServiceSid: "TWILIO_MESSAGING_SERVICE_SID",
  },
  CUSTOM: {
    endpointUrl: "WHATSAPP_CUSTOM_ENDPOINT_URL",
    apiKey: "WHATSAPP_CUSTOM_API_KEY",
    authHeaderName: "WHATSAPP_CUSTOM_AUTH_HEADER_NAME",
    authHeaderValue: "WHATSAPP_CUSTOM_AUTH_HEADER_VALUE",
    senderId: "WHATSAPP_CUSTOM_SENDER_ID",
    bodyTemplate: "WHATSAPP_CUSTOM_BODY_TEMPLATE",
    contentType: "WHATSAPP_CUSTOM_CONTENT_TYPE",
  },
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<number, { at: number; value: ResolvedWhatsappSettings }>();

export function invalidateWhatsappSettingsCache(customerId?: number): void {
  if (customerId === undefined) cache.clear();
  else cache.delete(customerId);
}

function parseRecipients(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isProviderKey(value: string | undefined): value is WhatsappProviderKey {
  return PROVIDER_SPECS.some((spec) => spec.key === value);
}

function mergeTemplates(
  stored: Partial<Record<NotificationKind, TemplateConfig>> | null | undefined,
): Record<NotificationKind, TemplateConfig> {
  const merged = { ...DEFAULT_TEMPLATES };
  for (const [kind, config] of Object.entries(stored ?? {})) {
    if (!config?.name) continue;
    const key = kind as NotificationKind;
    merged[key] = {
      name: config.name,
      language: config.language || DEFAULT_TEMPLATES[key].language,
      category: config.category || DEFAULT_TEMPLATES[key].category,
    };
  }
  return merged;
}

function credentialsFromEnv(provider: WhatsappProviderKey): Record<string, string> {
  const credentials: Record<string, string> = {};
  for (const [field, envKey] of Object.entries(ENV_KEYS[provider])) {
    const value = process.env[envKey];
    if (value) credentials[field] = value;
  }
  return credentials;
}

function hasAllRequired(
  provider: WhatsappProviderKey,
  credentials: Record<string, string>,
): boolean {
  return providerSpec(provider)
    .fields.filter((field) => field.required)
    .every((field) => String(credentials[field.key] ?? "").trim().length > 0);
}

function fromEnvironment(): ResolvedWhatsappSettings {
  const envProvider = process.env.WHATSAPP_PROVIDER;
  const provider: WhatsappProviderKey = isProviderKey(envProvider) ? envProvider : "META_CLOUD";
  const credentials = credentialsFromEnv(provider);
  const configured = hasAllRequired(provider, credentials);
  const channelMode = process.env.WHATSAPP_CHANNEL_MODE;
  const messageMode = process.env.WHATSAPP_MESSAGE_MODE;

  return {
    source: configured ? "ENVIRONMENT" : "NONE",
    configured,
    // An env-only setup is on as soon as it is complete; there is no dashboard
    // toggle backing it. WHATSAPP_ENABLED=false turns it off explicitly.
    enabled: configured && process.env.WHATSAPP_ENABLED !== "false",
    provider,
    channelMode:
      channelMode === "WHATSAPP_ONLY" || channelMode === "EMAIL_ONLY" ? channelMode : "BOTH",
    messageMode:
      messageMode === "TEXT" || messageMode === "TEMPLATE"
        ? messageMode
        : providerSpec(provider).defaultMessageMode,
    defaultCountryCode: (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91").replace(/\D/g, "") || "91",
    otpRecipients: parseRecipients(process.env.WHATSAPP_OTP_RECIPIENTS),
    templates: DEFAULT_TEMPLATES,
    credentials,
  };
}

function fromRow(row: WhatsappSettingsRow): ResolvedWhatsappSettings {
  let credentials: Record<string, string> = {};
  if (row.credentialsEnc) {
    try {
      credentials = JSON.parse(decrypt(row.credentialsEnc)) as Record<string, string>;
    } catch (error) {
      // A key rotation or a tampered row must not take the whole notification
      // path down: fall through to an unconfigured channel and keep email.
      logger.error(
        { err: error, customerId: row.customerId },
        "Failed to decrypt WhatsApp credentials",
      );
    }
  }

  const configured = hasAllRequired(row.provider, credentials);
  return {
    source: "DATABASE",
    configured,
    enabled: row.enabled && configured,
    provider: row.provider,
    channelMode: row.channelMode,
    messageMode: row.messageMode,
    defaultCountryCode: row.defaultCountryCode || "91",
    otpRecipients: parseRecipients(row.otpRecipients),
    templates: mergeTemplates(row.templates),
    credentials,
  };
}

export async function findWhatsappSettingsRow(
  customerId: number,
): Promise<WhatsappSettingsRow | null> {
  const [row] = await db
    .select()
    .from(whatsappSettingsTable)
    .where(eq(whatsappSettingsTable.customerId, customerId));
  return row ?? null;
}

export async function loadWhatsappSettings(
  customerId: number,
): Promise<ResolvedWhatsappSettings> {
  const cached = cache.get(customerId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  let value: ResolvedWhatsappSettings;
  try {
    const row = await findWhatsappSettingsRow(customerId);
    value = row ? fromRow(row) : fromEnvironment();
  } catch (error) {
    // The table may not exist yet on a deployment that has not run the schema
    // push. Env credentials still work, and email is unaffected either way.
    logger.error({ err: error, customerId }, "Failed to read WhatsApp settings");
    value = fromEnvironment();
  }

  cache.set(customerId, { at: Date.now(), value });
  return value;
}

/**
 * Produces the credential set that a save would persist.
 *
 * Secrets arrive blank when the operator did not retype them, so a blank secret
 * keeps its stored value; every other blank clears the field. Old secrets are
 * only reusable while the provider is unchanged — switching providers starts
 * from nothing.
 *
 * Exported so the settings route can validate exactly what will be written
 * rather than a near-copy of it.
 */
export function mergeCredentialUpdate(options: {
  provider: WhatsappProviderKey;
  incoming: Record<string, string>;
  previous: Record<string, string>;
  previousProvider: WhatsappProviderKey | null;
}): Record<string, string> {
  const merged: Record<string, string> = { ...options.incoming };

  if (options.previousProvider === options.provider) {
    for (const key of secretFieldKeys(options.provider)) {
      if (!String(merged[key] ?? "").trim() && options.previous[key]) {
        merged[key] = options.previous[key];
      }
    }
  }

  for (const key of Object.keys(merged)) {
    if (!String(merged[key] ?? "").trim()) delete merged[key];
  }
  return merged;
}

export async function saveWhatsappSettings(options: {
  customerId: number;
  provider: WhatsappProviderKey;
  enabled: boolean;
  channelMode: ChannelMode;
  messageMode: MessageMode;
  defaultCountryCode: string;
  otpRecipients: string[];
  templates: Record<NotificationKind, TemplateConfig>;
  /** Merged over the stored set, so blank secret fields keep their old value. */
  credentials: Record<string, string>;
}): Promise<WhatsappSettingsRow> {
  const existing = await findWhatsappSettingsRow(options.customerId);
  // With no row yet, the environment is the previous state, so a first save
  // from the dashboard promotes .env credentials into the database instead of
  // silently dropping them.
  const previous = existing ? fromRow(existing) : fromEnvironment();

  const merged = mergeCredentialUpdate({
    provider: options.provider,
    incoming: options.credentials,
    previous: previous.credentials,
    previousProvider: previous.provider,
  });

  const values = {
    customerId: options.customerId,
    provider: options.provider,
    credentialsEnc: Object.keys(merged).length ? encrypt(JSON.stringify(merged)) : null,
    enabled: options.enabled,
    channelMode: options.channelMode,
    messageMode: options.messageMode,
    defaultCountryCode: options.defaultCountryCode || "91",
    otpRecipients: options.otpRecipients.join(","),
    templates: options.templates,
    status: options.enabled ? ("ACTIVE" as const) : ("DISABLED" as const),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(whatsappSettingsTable)
      .set(values)
      .where(eq(whatsappSettingsTable.id, existing.id));
  } else {
    await db.insert(whatsappSettingsTable).values(values);
  }

  invalidateWhatsappSettingsCache(options.customerId);
  const saved = await findWhatsappSettingsRow(options.customerId);
  if (!saved) throw new Error("WhatsApp settings row disappeared immediately after save");
  return saved;
}

export async function recordChannelHealth(
  customerId: number,
  outcome: { ok: boolean; error?: string; tested?: boolean },
): Promise<void> {
  const row = await findWhatsappSettingsRow(customerId).catch(() => null);
  if (!row) return;

  const failures = outcome.ok ? 0 : row.consecutiveFailures + 1;
  await db
    .update(whatsappSettingsTable)
    .set({
      consecutiveFailures: failures,
      status: !row.enabled ? "DISABLED" : failures >= 3 ? "DEGRADED" : "ACTIVE",
      lastError: outcome.ok ? null : (outcome.error ?? "Unknown error").slice(0, 1000),
      ...(outcome.ok ? { lastSuccessAt: new Date() } : {}),
      ...(outcome.tested ? { lastTestedAt: new Date() } : {}),
    })
    .where(eq(whatsappSettingsTable.id, row.id))
    .catch((error: unknown) => {
      logger.error({ err: error, customerId }, "Failed to record WhatsApp channel health");
    });

  invalidateWhatsappSettingsCache(customerId);
}

/**
 * Normalises a stored phone number to bare E.164 digits (no leading +).
 *
 * Field agents are usually stored as local ten-digit numbers, so a default
 * country code is applied unless the value already carries one.
 */
export function toE164Digits(raw: string, defaultCountryCode: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  const cc = (defaultCountryCode || "91").replace(/\D/g, "") || "91";
  let digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    const international = digits.slice(1).replace(/\D/g, "");
    return international.length >= 8 && international.length <= 15 ? international : null;
  }

  digits = digits.replace(/\D/g, "");
  // A single national trunk zero, as often typed into Indian forms.
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length <= 10) digits = `${cc}${digits}`;

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function maskPhone(e164Digits: string): string {
  if (e164Digits.length <= 4) return "***";
  return `+${e164Digits.slice(0, e164Digits.length - 6)}****${e164Digits.slice(-2)}`;
}

/** API-safe view of the stored settings: secrets become presence + hint only. */
export function sanitizeSettings(resolved: ResolvedWhatsappSettings) {
  const spec = providerSpec(resolved.provider);
  const secrets = new Set(spec.fields.filter((f) => f.type === "secret").map((f) => f.key));

  const credentials: Record<string, string> = {};
  const secretHints: Record<string, string> = {};
  for (const field of spec.fields) {
    const value = resolved.credentials[field.key];
    if (!value) continue;
    if (secrets.has(field.key)) {
      secretHints[field.key] =
        value.length > 8 ? `${value.slice(0, 4)}…${value.slice(-4)}` : "••••••••";
    } else {
      credentials[field.key] = value;
    }
  }

  return {
    source: resolved.source,
    configured: resolved.configured,
    enabled: resolved.enabled,
    provider: resolved.provider,
    channelMode: resolved.channelMode,
    messageMode: resolved.messageMode,
    defaultCountryCode: resolved.defaultCountryCode,
    otpRecipients: resolved.otpRecipients,
    templates: resolved.templates,
    credentials,
    secretHints,
    missingFields: spec.fields
      .filter((field) => field.required && !String(resolved.credentials[field.key] ?? "").trim())
      .map((field) => field.key),
  };
}
