import { mysqlTable, text, varchar, int, datetime, double, boolean, mysqlEnum, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";
import { usersTable } from "./users";

export const hubsTable = mysqlTable("hubs", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  stateId: int("state_id"),
  name: text("name").notNull(),
  code: varchar("code", { length: 64 }).notNull(),
  city: text("city"),
  zone: text("zone"),
  cluster: text("cluster"),
  metroType: varchar("metro_type", { length: 32 }),
  category: text("category"),
  qrToken: varchar("qr_token", { length: 128 }).notNull().unique(),
  address: text("address"),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  radiusM: int("radius_m").notNull().default(200),
  maxGpsAccuracyM: int("max_gps_accuracy_m").notNull().default(75),
  active: boolean("active").notNull().default(true),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const riderHubAssignmentsTable = mysqlTable("rider_hub_assignments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  hubId: int("hub_id").notNull().references(() => hubsTable.id),
  assignedAt: datetime("assigned_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  unassignedAt: datetime("unassigned_at", { mode: "date", fsp: 3 }),
});

export const accessPoliciesTable = mysqlTable("vehicle_access_policies", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  hubId: int("hub_id").references(() => hubsTable.id),
  workStartMinute: int("work_start_minute").notNull().default(300),
  workEndMinute: int("work_end_minute").notNull().default(1140),
  restrictedEndMinute: int("restricted_end_minute").notNull().default(1440),
  freeRideCount: int("free_ride_count").notNull().default(2),
  freeRideMinutes: int("free_ride_minutes").notNull().default(15),
  packages: json("packages").$type<Array<{ minutes: number; pricePaise: number }>>().notNull(),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  active: boolean("active").notNull().default(true),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const attendanceAttemptStatusValues = ["ACCEPTED", "OUTSIDE_GEOFENCE", "GPS_INACCURATE", "INVALID_QR", "NO_HUB"] as const;
export const attendanceAttemptsTable = mysqlTable("attendance_attempts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  hubId: int("hub_id").references(() => hubsTable.id),
  status: mysqlEnum("status", attendanceAttemptStatusValues).notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  accuracyM: double("accuracy_m"),
  distanceM: double("distance_m"),
  configuredRadiusM: int("configured_radius_m"),
  attemptedAt: datetime("attempted_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  metadata: json("metadata"),
});

export const vehicleAccessEventTypeValues = ["AUTHORIZED", "DENIED", "EXPIRED", "EMERGENCY", "OVERRIDE", "PAYMENT_PENDING"] as const;
export const vehicleAccessEventsTable = mysqlTable("vehicle_access_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  hubId: int("hub_id").references(() => hubsTable.id),
  type: mysqlEnum("type", vehicleAccessEventTypeValues).notNull(),
  reason: text("reason").notNull(),
  validUntil: datetime("valid_until", { mode: "date", fsp: 3 }),
  commandIntent: text("command_intent"),
  latitude: double("latitude"),
  longitude: double("longitude"),
  details: json("details"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});
