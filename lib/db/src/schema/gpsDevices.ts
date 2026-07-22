import {
  mysqlTable, text, int, datetime,
  double, boolean, mysqlEnum,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { usersTable } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const vendorAccountStatusValues = ["ACTIVE", "DEGRADED", "DISABLED"] as const;
export const deviceStatusValues = ["ONLINE", "OFFLINE", "UNKNOWN"] as const;

// ─── VendorAccount ────────────────────────────────────────────────────────────
// One row per vendor credential set per tenant.
// credentials_enc: AES-256-GCM encrypted JSON (username/password/apiKey).
// Never returned in API responses; always redacted from logs.

export const vendorAccountsTable = mysqlTable("vendor_accounts", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  vendorKey: text("vendor_key").notNull(),           // "BOLT" | "MOCK_BOLT"
  displayName: text("display_name").notNull(),
  credentialsEnc: text("credentials_enc").notNull(), // encrypted, write-only
  pollIntervalSeconds: int("poll_interval_seconds").notNull().default(30),
  enabled: boolean("enabled").notNull().default(true),
  status: mysqlEnum("status", vendorAccountStatusValues).notNull().default("ACTIVE"),
  lastPolledAt: datetime("last_polled_at", { mode: "date", fsp: 3 }),
  lastSuccessAt: datetime("last_success_at", { mode: "date", fsp: 3 }),
  lastError: text("last_error"),
  lastDeviceCount: int("last_device_count"),
  consecutiveFailures: int("consecutive_failures").notNull().default(0),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertVendorAccountSchema = createInsertSchema(vendorAccountsTable).omit({
  id: true, createdAt: true, lastPolledAt: true, lastSuccessAt: true,
  lastError: true, lastDeviceCount: true, consecutiveFailures: true, status: true,
});
export type InsertVendorAccount = z.infer<typeof insertVendorAccountSchema>;
export type VendorAccountRow = typeof vendorAccountsTable.$inferSelect;

// ─── DeviceCategory ───────────────────────────────────────────────────────────
// Drives tabs, colors, and symbols on the dashboard.
// key = "MOBILE_APP" | "VEHICLE_TRACKER" | "PERSONAL_TRACKER" | "ASSET_TAG"

export const deviceCategoriesTable = mysqlTable("device_categories", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  key: text("key").notNull(),
  label: text("label").notNull(),
  colorHex: text("color_hex").notNull(),
  iconKey: text("icon_key").notNull(), // "smartphone" | "car" | "user" | "package"
  sortOrder: int("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const insertDeviceCategorySchema = createInsertSchema(deviceCategoriesTable).omit({ id: true });
export type InsertDeviceCategory = z.infer<typeof insertDeviceCategorySchema>;
export type DeviceCategoryRow = typeof deviceCategoriesTable.$inferSelect;

// ─── TrackedDevice ────────────────────────────────────────────────────────────
// One row per physical GPS tracker, auto-created on first poll.

export const trackedDevicesTable = mysqlTable("tracked_devices", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  vendorAccountId: int("vendor_account_id").notNull().references(() => vendorAccountsTable.id),
  deviceCategoryId: int("device_category_id").references(() => deviceCategoriesTable.id),
  vendorKey: text("vendor_key").notNull(),
  vendorDeviceId: text("vendor_device_id").notNull(),
  imei: text("imei"),
  name: text("name"),
  simPhone: text("sim_phone"),
  vendorType: text("vendor_type"),
  assignedUserId: int("assigned_user_id").references(() => usersTable.id),
  assignedVehicleReg: text("assigned_vehicle_reg"),
  status: mysqlEnum("status", deviceStatusValues).notNull().default("UNKNOWN"),
  lastFixAt: datetime("last_fix_at", { mode: "date", fsp: 3 }),
  lastLat: double("last_lat"),
  lastLng: double("last_lng"),
  lastSpeedKph: double("last_speed_kph"),
  lastIgnition: boolean("last_ignition"),
  lastAlarm: text("last_alarm"),
  totalDistanceRaw: double("total_distance_raw"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertTrackedDeviceSchema = createInsertSchema(trackedDevicesTable).omit({
  id: true, createdAt: true, status: true,
});
export type InsertTrackedDevice = z.infer<typeof insertTrackedDeviceSchema>;
export type TrackedDeviceRow = typeof trackedDevicesTable.$inferSelect;

// ─── DeviceAssignment ─────────────────────────────────────────────────────────
// History table — keeps assignment records so reports stay accurate over time.

export const deviceAssignmentsTable = mysqlTable("device_assignments", {
  id: int("id").autoincrement().primaryKey(),
  trackedDeviceId: int("tracked_device_id").notNull().references(() => trackedDevicesTable.id),
  userId: int("user_id").notNull().references(() => usersTable.id),
  assignedAt: datetime("assigned_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  unassignedAt: datetime("unassigned_at", { mode: "date", fsp: 3 }),
  assignedByAdminId: int("assigned_by_admin_id").references(() => usersTable.id),
});

export const insertDeviceAssignmentSchema = createInsertSchema(deviceAssignmentsTable).omit({
  id: true, assignedAt: true,
});
export type InsertDeviceAssignment = z.infer<typeof insertDeviceAssignmentSchema>;
export type DeviceAssignmentRow = typeof deviceAssignmentsTable.$inferSelect;
