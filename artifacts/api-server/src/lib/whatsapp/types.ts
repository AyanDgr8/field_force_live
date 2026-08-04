import type { TemplateConfig } from "./messages.js";

export type SendRequest = {
  /** Recipient as bare E.164 digits, no leading plus. */
  to: string;
  mode: "TEMPLATE" | "TEXT";
  /** Body used in TEXT mode, and kept as the human-readable log preview. */
  text: string;
  template: TemplateConfig;
  parameters: string[];
  /** Present only for authentication templates that carry a copy-code button. */
  otpCode: string | null;
};

export type TransportContext = {
  credentials: Record<string, string>;
};

export type SendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
};
