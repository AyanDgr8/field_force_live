import { mysqlTable, text, varchar, int, datetime, boolean, mysqlEnum, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { usersTable } from "./users";

export const whatsappProviderValues = ["META_CLOUD", "TWILIO", "CUSTOM"] as const;
export const notificationChannelModeValues = ["BOTH", "WHATSAPP_ONLY", "EMAIL_ONLY"] as const;
export const whatsappMessageModeValues = ["TEMPLATE", "TEXT"] as const;
export const whatsappStatusValues = ["ACTIVE", "DEGRADED", "DISABLED"] as const;
export const notificationKindValues = [
  "LOGIN_OTP",
  "PASSWORD_RESET_CODE",
  "PASSWORD_RESET_LINK",
  "PASSWORD_CHANGED",
  "WELCOME",
  "TEST",
] as const;
export const notificationDeliveryStatusValues = ["SENT", "FAILED", "SKIPPED"] as const;

export type WhatsappProviderKey = (typeof whatsappProviderValues)[number];
export type NotificationKind = (typeof notificationKindValues)[number];

/**
 * Per-tenant WhatsApp channel configuration.
 *
 * credentials_enc holds an AES-256-GCM encrypted JSON blob whose shape depends
 * on `provider` (see lib/whatsapp/providers.ts). It follows the same rules as
 * vendor_accounts.credentials_enc: write-only, never returned by the API,
 * never logged.
 */
export const whatsappSettingsTable = mysqlTable("whatsapp_settings", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id).unique(),
  provider: mysqlEnum("provider", whatsappProviderValues).notNull().default("META_CLOUD"),
  credentialsEnc: text("credentials_enc"),
  enabled: boolean("enabled").notNull().default(false),
  // How each notification is delivered. Email stays on by default so a
  // misconfigured WhatsApp account can never lock an admin out of login OTPs.
  channelMode: mysqlEnum("channel_mode", notificationChannelModeValues).notNull().default("BOTH"),
  messageMode: mysqlEnum("message_mode", whatsappMessageModeValues).notNull().default("TEMPLATE"),
  // Prefixed onto local numbers that carry no country code (India = 91).
  defaultCountryCode: varchar("default_country_code", { length: 8 }).notNull().default("91"),
  // Mirrors OTP_RECIPIENTS for email: when set, login OTPs go to these numbers
  // instead of the account holder's own.
  otpRecipients: text("otp_recipients"),
  templates: json("templates").$type<Record<string, { name: string; language: string; category: "AUTHENTICATION" | "UTILITY" }>>(),
  status: mysqlEnum("status", whatsappStatusValues).notNull().default("DISABLED"),
  lastError: text("last_error"),
  lastSuccessAt: datetime("last_success_at", { mode: "date", fsp: 3 }),
  lastTestedAt: datetime("last_tested_at", { mode: "date", fsp: 3 }),
  consecutiveFailures: int("consecutive_failures").notNull().default(0),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertWhatsappSettingsSchema = createInsertSchema(whatsappSettingsTable).omit({
  id: true, createdAt: true, updatedAt: true, status: true,
  lastError: true, lastSuccessAt: true, lastTestedAt: true, consecutiveFailures: true,
});
export type InsertWhatsappSettings = z.infer<typeof insertWhatsappSettingsSchema>;
export type WhatsappSettingsRow = typeof whatsappSettingsTable.$inferSelect;

/**
 * Delivery audit trail for both channels. Recipients are stored masked so the
 * log can be shown in the dashboard without exposing full contact details.
 */
export const notificationLogTable = mysqlTable("notification_log", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  userId: int("user_id").references(() => usersTable.id),
  kind: mysqlEnum("kind", notificationKindValues).notNull(),
  channel: mysqlEnum("channel", ["WHATSAPP", "EMAIL"] as const).notNull(),
  provider: varchar("provider", { length: 32 }),
  recipient: varchar("recipient", { length: 128 }).notNull(),
  status: mysqlEnum("status", notificationDeliveryStatusValues).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 191 }),
  errorMessage: text("error_message"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export type NotificationLogRow = typeof notificationLogTable.$inferSelect;
