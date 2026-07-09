import { pgTable, text, serial, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const onboardingChannelEnum = pgEnum("onboarding_channel", ["WHATSAPP", "EMAIL"]);

export const onboardingInvitesTable = pgTable("onboarding_invites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  token: text("token").notNull().unique(),
  channel: onboardingChannelEnum("channel").notNull(),
  deepLink: text("deep_link").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvitesTable).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});
export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;
export type OnboardingInviteRow = typeof onboardingInvitesTable.$inferSelect;
