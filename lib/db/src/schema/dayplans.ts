import { mysqlTable, text, varchar, int, datetime, double, date, mysqlEnum } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dayPlanStatusValues = ["DRAFT", "PUBLISHED"] as const;
export const visitStopPriorityValues = ["P1", "P2", "P3"] as const;
export const visitStopStatusValues = [
  "PENDING",
  "EN_ROUTE",
  "REACHED",
  "COMPLETED",
  "SKIPPED",
] as const;
export const visitStopInputTypeValues = ["ADDRESS", "PIN", "LATLNG"] as const;

export const dayPlansTable = mysqlTable("day_plans", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  status: mysqlEnum("status", dayPlanStatusValues).notNull().default("DRAFT"),
  publishedAt: datetime("published_at", { mode: "date", fsp: 3 }),
  totalDistanceMeters: double("total_distance_meters").notNull().default(0),
  totalEtaSeconds: double("total_eta_seconds").notNull().default(0),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertDayPlanSchema = createInsertSchema(dayPlansTable).omit({
  id: true,
  createdAt: true,
  publishedAt: true,
  status: true,
  totalDistanceMeters: true,
  totalEtaSeconds: true,
});
export type InsertDayPlan = z.infer<typeof insertDayPlanSchema>;
export type DayPlanRow = typeof dayPlansTable.$inferSelect;

export const visitStopsTable = mysqlTable("visit_stops", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  dayPlanId: int("day_plan_id").notNull().references(() => dayPlansTable.id),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  sequence: int("sequence"),
  priority: mysqlEnum("priority", visitStopPriorityValues).notNull(),
  customerCode: text("customer_code").notNull(),
  label: text("label"),
  inputType: mysqlEnum("input_type", visitStopInputTypeValues).notNull(),
  rawInput: text("raw_input").notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  status: mysqlEnum("status", visitStopStatusValues).notNull().default("PENDING"),
  plannedArrivalAt: datetime("planned_arrival_at", { mode: "date", fsp: 3 }),
  actualArrivalAt: datetime("actual_arrival_at", { mode: "date", fsp: 3 }),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  reachedAt: datetime("reached_at", { mode: "date", fsp: 3 }),
  startedAt: datetime("started_at", { mode: "date", fsp: 3 }),
  closedAt: datetime("closed_at", { mode: "date", fsp: 3 }),
  dispositionId: int("disposition_id"),
  notes: text("notes"),
});

export const insertVisitStopSchema = createInsertSchema(visitStopsTable).omit({
  id: true,
  sequence: true,
  status: true,
  plannedArrivalAt: true,
  actualArrivalAt: true,
  latitude: true,
  longitude: true,
  reachedAt: true,
  startedAt: true,
  closedAt: true,
  dispositionId: true,
  notes: true,
});
export type InsertVisitStop = z.infer<typeof insertVisitStopSchema>;
export type VisitStopRow = typeof visitStopsTable.$inferSelect;

export const publicTrackLinksTable = mysqlTable("public_track_links", {
  id: int("id").autoincrement().primaryKey(),
  visitStopId: int("visit_stop_id").notNull().references(() => visitStopsTable.id),
  token: varchar("token", { length: 64 }).notNull().unique(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertPublicTrackLinkSchema = createInsertSchema(publicTrackLinksTable).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});
export type InsertPublicTrackLink = z.infer<typeof insertPublicTrackLinkSchema>;
export type PublicTrackLinkRow = typeof publicTrackLinksTable.$inferSelect;
