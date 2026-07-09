import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  loginAt: timestamp("login_at", { withTimezone: true }).notNull(),
  loginLat: doublePrecision("login_lat").notNull(),
  loginLng: doublePrecision("login_lng").notNull(),
  logoutAt: timestamp("logout_at", { withTimezone: true }),
  logoutLat: doublePrecision("logout_lat"),
  logoutLng: doublePrecision("logout_lng"),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type SessionRow = typeof sessionsTable.$inferSelect;

export const locationPingsTable = pgTable("location_pings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  speedKph: doublePrecision("speed_kph"),
  accuracyM: doublePrecision("accuracy_m"),
  batteryLevel: integer("battery_level"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
});

export const insertLocationPingSchema = createInsertSchema(locationPingsTable).omit({ id: true });
export type InsertLocationPing = z.infer<typeof insertLocationPingSchema>;
export type LocationPingRow = typeof locationPingsTable.$inferSelect;

export const dwellSegmentsTable = pgTable("dwell_segments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  placeLabel: text("place_label"),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull(),
  exitedAt: timestamp("exited_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds").notNull().default(0),
});

export const insertDwellSegmentSchema = createInsertSchema(dwellSegmentsTable).omit({ id: true });
export type InsertDwellSegment = z.infer<typeof insertDwellSegmentSchema>;
export type DwellSegmentRow = typeof dwellSegmentsTable.$inferSelect;

export const emergencyAlertsTable = pgTable("emergency_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  triggeredByAdminId: integer("triggered_by_admin_id").notNull().references(() => usersTable.id),
  message: text("message"),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

export const insertEmergencyAlertSchema = createInsertSchema(emergencyAlertsTable).omit({
  id: true,
  triggeredAt: true,
});
export type InsertEmergencyAlert = z.infer<typeof insertEmergencyAlertSchema>;
export type EmergencyAlertRow = typeof emergencyAlertsTable.$inferSelect;
