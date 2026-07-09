import { pgTable, text, serial, timestamp, integer, doublePrecision, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const dayPlanStatusEnum = pgEnum("day_plan_status", ["DRAFT", "PUBLISHED"]);
export const visitStopPriorityEnum = pgEnum("visit_stop_priority", ["P1", "P2", "P3"]);
export const visitStopStatusEnum = pgEnum("visit_stop_status", [
  "PENDING",
  "EN_ROUTE",
  "REACHED",
  "COMPLETED",
  "SKIPPED",
]);
export const visitStopInputTypeEnum = pgEnum("visit_stop_input_type", ["ADDRESS", "PIN", "LATLNG"]);

export const dayPlansTable = pgTable("day_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  status: dayPlanStatusEnum("status").notNull().default("DRAFT"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  totalDistanceMeters: doublePrecision("total_distance_meters").notNull().default(0),
  totalEtaSeconds: doublePrecision("total_eta_seconds").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

export const visitStopsTable = pgTable("visit_stops", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  dayPlanId: integer("day_plan_id").notNull().references(() => dayPlansTable.id),
  visitDate: date("visit_date", { mode: "string" }).notNull(),
  sequence: integer("sequence"),
  priority: visitStopPriorityEnum("priority").notNull(),
  customerCode: text("customer_code").notNull(),
  label: text("label"),
  inputType: visitStopInputTypeEnum("input_type").notNull(),
  rawInput: text("raw_input").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  status: visitStopStatusEnum("status").notNull().default("PENDING"),
  plannedArrivalAt: timestamp("planned_arrival_at", { withTimezone: true }),
  actualArrivalAt: timestamp("actual_arrival_at", { withTimezone: true }),
});

export const insertVisitStopSchema = createInsertSchema(visitStopsTable).omit({
  id: true,
  sequence: true,
  status: true,
  plannedArrivalAt: true,
  actualArrivalAt: true,
  latitude: true,
  longitude: true,
});
export type InsertVisitStop = z.infer<typeof insertVisitStopSchema>;
export type VisitStopRow = typeof visitStopsTable.$inferSelect;

export const publicTrackLinksTable = pgTable("public_track_links", {
  id: serial("id").primaryKey(),
  visitStopId: integer("visit_stop_id").notNull().references(() => visitStopsTable.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPublicTrackLinkSchema = createInsertSchema(publicTrackLinksTable).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});
export type InsertPublicTrackLink = z.infer<typeof insertPublicTrackLinkSchema>;
export type PublicTrackLinkRow = typeof publicTrackLinksTable.$inferSelect;
