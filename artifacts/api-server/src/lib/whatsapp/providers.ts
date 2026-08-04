/**
 * Credential specification for every supported WhatsApp provider.
 *
 * This module is the single source of truth for "which credentials are needed":
 * the settings route validates against it, and the admin dashboard renders its
 * credentials tab straight from GET /notifications/whatsapp/providers, so the
 * form and the validator can never drift apart.
 *
 * Adding a provider means adding an entry here plus a sender in ./index.ts.
 */
import type { WhatsappProviderKey } from "@workspace/db";

export type CredentialField = {
  key: string;
  label: string;
  /** `secret` fields are write-only: stored encrypted, returned only as a hint. */
  type: "text" | "secret" | "url";
  required: boolean;
  placeholder: string;
  /** Shown under the input in the dashboard. */
  help: string;
  /** Where the value comes from, for the "how do I get this" panel. */
  where?: string;
};

export type ProviderSpec = {
  key: WhatsappProviderKey;
  label: string;
  summary: string;
  docsUrl: string;
  /** Default message mode; Meta requires approved templates for the first message. */
  defaultMessageMode: "TEMPLATE" | "TEXT";
  fields: CredentialField[];
  /** Ordered account-setup steps rendered in the credentials guide. */
  setupSteps: string[];
};

export const PROVIDER_SPECS: ProviderSpec[] = [
  {
    key: "META_CLOUD",
    label: "Meta WhatsApp Cloud API",
    summary:
      "Official WhatsApp Business Platform hosted by Meta. Cheapest per message and no reseller in the middle, but every business-initiated message must use a template you got approved beforehand.",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    defaultMessageMode: "TEMPLATE",
    fields: [
      {
        key: "phoneNumberId",
        label: "Phone Number ID",
        type: "text",
        required: true,
        placeholder: "123456789012345",
        help: "Numeric ID of the WhatsApp sender number. This is not the phone number itself.",
        where: "Meta for Developers → your app → WhatsApp → API Setup → “From” phone number ID",
      },
      {
        key: "businessAccountId",
        label: "WhatsApp Business Account ID",
        type: "text",
        required: true,
        placeholder: "987654321098765",
        help: "The WABA that owns the number. Used to look up your approved templates.",
        where: "Meta for Developers → WhatsApp → API Setup, or Business Manager → WhatsApp Accounts",
      },
      {
        key: "accessToken",
        label: "Access Token",
        type: "secret",
        required: true,
        placeholder: "EAAG...",
        help: "Use a permanent System User token. The 24-hour test token in the dashboard will break delivery the next day.",
        where: "Business Manager → Business Settings → Users → System Users → Generate token (whatsapp_business_messaging + whatsapp_business_management)",
      },
      {
        key: "apiVersion",
        label: "Graph API version",
        type: "text",
        required: false,
        placeholder: "v23.0",
        help: "Optional. Defaults to v23.0 when left blank.",
      },
    ],
    setupSteps: [
      "Create a Meta Business account and verify your business at business.facebook.com.",
      "Create an app at developers.facebook.com and add the WhatsApp product to it.",
      "Add and verify the phone number you will send from. It must not be registered to the WhatsApp consumer or Business app.",
      "Copy the Phone Number ID and WhatsApp Business Account ID from the API Setup screen.",
      "Create a System User in Business Settings, assign it the app and the WhatsApp account, then generate a permanent token with whatsapp_business_messaging and whatsapp_business_management.",
      "Submit the five message templates listed in the Templates tab and wait for approval (usually minutes, sometimes a few hours).",
      "Paste the credentials here, save, then use Send test message to confirm delivery.",
    ],
  },
  {
    key: "TWILIO",
    label: "Twilio WhatsApp",
    summary:
      "Twilio resells the WhatsApp Business Platform. Quickest to get working thanks to the sandbox, and freeform text is allowed inside the 24-hour service window, at a higher per-message price.",
    docsUrl: "https://www.twilio.com/docs/whatsapp/quickstart",
    defaultMessageMode: "TEXT",
    fields: [
      {
        key: "accountSid",
        label: "Account SID",
        type: "text",
        required: true,
        placeholder: "AC00000000000000000000000000000000",
        help: "Starts with AC. Identifies your Twilio account.",
        where: "Twilio Console → Account Info panel on the dashboard home",
      },
      {
        key: "authToken",
        label: "Auth Token",
        type: "secret",
        required: true,
        placeholder: "your-twilio-auth-token",
        help: "Paired with the Account SID for HTTP basic auth. An API Key secret works too.",
        where: "Twilio Console → Account Info → Auth Token (click to reveal)",
      },
      {
        key: "fromNumber",
        label: "WhatsApp sender number",
        type: "text",
        required: true,
        placeholder: "+14155238886",
        help: "In E.164 format. The whatsapp: prefix is added automatically. +14155238886 is the shared sandbox number.",
        where: "Twilio Console → Messaging → Senders → WhatsApp senders",
      },
      {
        key: "messagingServiceSid",
        label: "Messaging Service SID",
        type: "text",
        required: false,
        placeholder: "MG00000000000000000000000000000000",
        help: "Optional. When set it is used instead of the sender number.",
      },
    ],
    setupSteps: [
      "Create a Twilio account and open Messaging → Try it out → Send a WhatsApp message.",
      "For testing, join the sandbox by sending the shown join code from your phone; sandbox messages only reach numbers that joined.",
      "For production, submit a WhatsApp sender for approval under Messaging → Senders → WhatsApp senders.",
      "Copy the Account SID and Auth Token from the console home page.",
      "Paste them here with the sender number in E.164 format, save, then send a test message.",
      "Switch Message mode to Template and fill in Content SIDs once you have approved content templates for out-of-window sends.",
    ],
  },
  {
    key: "CUSTOM",
    label: "Custom provider / BSP",
    summary:
      "Any HTTP WhatsApp gateway — Gupshup, WATI, AiSensy, 360dialog, Interakt, or an in-house one. You supply the endpoint and a JSON body with placeholders and this server posts to it.",
    docsUrl: "",
    defaultMessageMode: "TEXT",
    fields: [
      {
        key: "endpointUrl",
        label: "Send endpoint URL",
        type: "url",
        required: true,
        placeholder: "https://api.gupshup.io/wa/api/v1/msg",
        help: "Full URL this server POSTs each message to.",
        where: "Your provider's send-message API documentation",
      },
      {
        key: "apiKey",
        label: "API key / token",
        type: "secret",
        required: true,
        placeholder: "your-provider-api-key",
        help: "Substituted into the auth header and the body wherever {{apiKey}} appears.",
        where: "Your provider's dashboard, usually under Developer or API settings",
      },
      {
        key: "authHeaderName",
        label: "Auth header name",
        type: "text",
        required: false,
        placeholder: "Authorization",
        help: "Optional. Defaults to Authorization. Use apikey for Gupshup, or leave blank if the key only goes in the body.",
      },
      {
        key: "authHeaderValue",
        label: "Auth header value",
        type: "text",
        required: false,
        placeholder: "Bearer {{apiKey}}",
        help: "Optional. Defaults to Bearer {{apiKey}}. {{apiKey}} is replaced with the key above.",
      },
      {
        key: "senderId",
        label: "Sender ID / source number",
        type: "text",
        required: false,
        placeholder: "919876543210",
        help: "Optional. Available in the body template as {{from}}.",
      },
      {
        key: "bodyTemplate",
        label: "Request body template (JSON)",
        type: "text",
        required: false,
        placeholder: '{"channel":"whatsapp","source":"{{from}}","destination":"{{to}}","message":{"type":"text","text":"{{text}}"}}',
        help: "Optional JSON body. Placeholders: {{to}} recipient in E.164 without +, {{text}} message body, {{from}} sender ID, {{apiKey}}. Defaults to a {to, type, text} shape.",
      },
      {
        key: "contentType",
        label: "Content type",
        type: "text",
        required: false,
        placeholder: "application/json",
        help: "Optional. Use application/x-www-form-urlencoded for providers such as Gupshup that expect form posts.",
      },
    ],
    setupSteps: [
      "Open your provider's send-message API reference and find the endpoint URL and auth header.",
      "Generate an API key in the provider dashboard.",
      "Paste the endpoint and key here. Set the auth header name and value if the provider does not use Authorization: Bearer.",
      "Copy the provider's example request body into Request body template and swap the recipient and message fields for {{to}} and {{text}}.",
      "Save, then send a test message and check the delivery log for the raw provider response if it fails.",
    ],
  },
];

export function providerSpec(key: WhatsappProviderKey): ProviderSpec {
  const spec = PROVIDER_SPECS.find((candidate) => candidate.key === key);
  if (!spec) throw new Error(`Unknown WhatsApp provider: ${key}`);
  return spec;
}

/** Field keys that must never be echoed back to a client in full. */
export function secretFieldKeys(key: WhatsappProviderKey): string[] {
  return providerSpec(key).fields.filter((field) => field.type === "secret").map((field) => field.key);
}

/** Returns the names of required fields that are missing or blank. */
export function missingRequiredFields(
  key: WhatsappProviderKey,
  credentials: Record<string, string>,
): string[] {
  return providerSpec(key)
    .fields.filter((field) => field.required && !String(credentials[field.key] ?? "").trim())
    .map((field) => field.label);
}
