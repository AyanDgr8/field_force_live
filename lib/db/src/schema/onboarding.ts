import { mysqlTable, text, varchar, int, datetime, mysqlEnum } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const onboardingChannelValues = ["WHATSAPP", "EMAIL"] as const;

export const onboardingInvitesTable = mysqlTable("onboarding_invites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id).unique(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  channel: mysqlEnum("channel", onboardingChannelValues).notNull(),
  deepLink: text("deep_link").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  usedAt: datetime("used_at", { mode: "date", fsp: 3 }),
});

export const insertOnboardingInviteSchema = createInsertSchema(onboardingInvitesTable).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});
export type InsertOnboardingInvite = z.infer<typeof insertOnboardingInviteSchema>;
export type OnboardingInviteRow = typeof onboardingInvitesTable.$inferSelect;
