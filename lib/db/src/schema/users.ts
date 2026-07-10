import { mysqlTable, text, varchar, int, datetime, mysqlEnum, double, boolean } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const userRoleValues = ["ADMIN", "USER"] as const;
export const userStatusValues = ["INVITED", "ACTIVE", "SUSPENDED"] as const;
export const genderValues = ["MALE", "FEMALE", "OTHER"] as const;
export const addressTypeValues = ["OFFICE", "BASE_OFFICE", "SITE_OFFICE", "HOME"] as const;
export const liveStatusValues = ["OFFLINE", "ON_SHIFT_IDLE", "BUSY"] as const;

export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: mysqlEnum("gender", genderValues).notNull(),
  employeeCode: text("employee_code").notNull(),
  phoneNumber: text("phone_number").notNull(),
  email: text("email").notNull(),
  role: mysqlEnum("role", userRoleValues).notNull(),
  status: mysqlEnum("status", userStatusValues).notNull().default("INVITED"),
  consentGivenAt: datetime("consent_given_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  liveStatus: mysqlEnum("live_status", liveStatusValues).notNull().default("OFFLINE"),
  liveStatusSince: datetime("live_status_since", { mode: "date", fsp: 3 }),
  emergencyActive: boolean("emergency_active").notNull().default(false),
  currentVisitStopId: int("current_visit_stop_id"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  consentGivenAt: true,
  status: true,
  liveStatus: true,
  liveStatusSince: true,
  emergencyActive: true,
  currentVisitStopId: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const addressesTable = mysqlTable("addresses", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  type: mysqlEnum("type", addressTypeValues).notNull(),
  rawAddress: text("raw_address").notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertAddressSchema = createInsertSchema(addressesTable).omit({ id: true, createdAt: true });
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type AddressRow = typeof addressesTable.$inferSelect;

export const markedPlacesTable = mysqlTable("marked_places", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  label: text("label").notNull(),
  rawAddress: text("raw_address").notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertMarkedPlaceSchema = createInsertSchema(markedPlacesTable).omit({ id: true, createdAt: true });
export type InsertMarkedPlace = z.infer<typeof insertMarkedPlaceSchema>;
export type MarkedPlaceRow = typeof markedPlacesTable.$inferSelect;

// `username` is varchar rather than text: MySQL cannot build a unique index on a
// TEXT column without an explicit key prefix length.
export const credentialsTable = mysqlTable("credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id).unique(),
  username: varchar("username", { length: 128 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertCredentialSchema = createInsertSchema(credentialsTable).omit({ id: true, createdAt: true });
export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type CredentialRow = typeof credentialsTable.$inferSelect;

export const otpTokensTable = mysqlTable("otp_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  loginToken: varchar("login_token", { length: 64 }).notNull().unique(),
  code: text("code").notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  consumedAt: datetime("consumed_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertOtpTokenSchema = createInsertSchema(otpTokensTable).omit({ id: true, createdAt: true });
export type InsertOtpToken = z.infer<typeof insertOtpTokenSchema>;
export type OtpTokenRow = typeof otpTokensTable.$inferSelect;
