import { mysqlTable, text, int, datetime, double, mysqlEnum } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sessionsTable = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  loginAt: datetime("login_at", { mode: "date", fsp: 3 }).notNull(),
  loginLat: double("login_lat").notNull(),
  loginLng: double("login_lng").notNull(),
  logoutAt: datetime("logout_at", { mode: "date", fsp: 3 }),
  logoutLat: double("logout_lat"),
  logoutLng: double("logout_lng"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionRow = typeof sessionsTable.$inferSelect;

export const locationPingsTable = mysqlTable("location_pings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  speedKph: double("speed_kph"),
  accuracyM: double("accuracy_m"),
  batteryLevel: int("battery_level"),
  recordedAt: datetime("recorded_at", { mode: "date", fsp: 3 }).notNull(),
});

export const insertLocationPingSchema = createInsertSchema(locationPingsTable).omit({ id: true });
export type InsertLocationPing = z.infer<typeof insertLocationPingSchema>;
export type LocationPingRow = typeof locationPingsTable.$inferSelect;

export const dwellSegmentsTable = mysqlTable("dwell_segments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  placeLabel: text("place_label"),
  enteredAt: datetime("entered_at", { mode: "date", fsp: 3 }).notNull(),
  exitedAt: datetime("exited_at", { mode: "date", fsp: 3 }),
  durationSeconds: int("duration_seconds").notNull().default(0),
});

export const insertDwellSegmentSchema = createInsertSchema(dwellSegmentsTable).omit({ id: true });
export type InsertDwellSegment = z.infer<typeof insertDwellSegmentSchema>;
export type DwellSegmentRow = typeof dwellSegmentsTable.$inferSelect;

export const emergencyAlertDirectionValues = ["ADMIN_TO_USER", "USER_TO_ADMIN"] as const;

export const emergencyAlertsTable = mysqlTable("emergency_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  triggeredByAdminId: int("triggered_by_admin_id").references(() => usersTable.id),
  message: text("message"),
  triggeredAt: datetime("triggered_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  acknowledgedAt: datetime("acknowledged_at", { mode: "date", fsp: 3 }),
  direction: mysqlEnum("direction", emergencyAlertDirectionValues).notNull().default("ADMIN_TO_USER"),
  lat: double("lat"),
  lng: double("lng"),
});

export const insertEmergencyAlertSchema = createInsertSchema(emergencyAlertsTable).omit({
  id: true,
  triggeredAt: true,
});
export type InsertEmergencyAlert = z.infer<typeof insertEmergencyAlertSchema>;
export type EmergencyAlertRow = typeof emergencyAlertsTable.$inferSelect;
