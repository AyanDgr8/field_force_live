import { pgTable, text, serial, timestamp, integer, pgEnum, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "USER"]);
export const userStatusEnum = pgEnum("user_status", ["INVITED", "ACTIVE", "SUSPENDED"]);
export const genderEnum = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);
export const addressTypeEnum = pgEnum("address_type", ["OFFICE", "BASE_OFFICE", "SITE_OFFICE", "HOME"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gender: genderEnum("gender").notNull(),
  employeeCode: text("employee_code").notNull(),
  phoneNumber: text("phone_number").notNull(),
  email: text("email").notNull(),
  role: userRoleEnum("role").notNull(),
  status: userStatusEnum("status").notNull().default("INVITED"),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  consentGivenAt: true,
  status: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const addressesTable = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: addressTypeEnum("type").notNull(),
  rawAddress: text("raw_address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAddressSchema = createInsertSchema(addressesTable).omit({ id: true, createdAt: true });
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type AddressRow = typeof addressesTable.$inferSelect;

export const markedPlacesTable = pgTable("marked_places", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  label: text("label").notNull(),
  rawAddress: text("raw_address").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMarkedPlaceSchema = createInsertSchema(markedPlacesTable).omit({ id: true, createdAt: true });
export type InsertMarkedPlace = z.infer<typeof insertMarkedPlaceSchema>;
export type MarkedPlaceRow = typeof markedPlacesTable.$inferSelect;

export const credentialsTable = pgTable("credentials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCredentialSchema = createInsertSchema(credentialsTable).omit({ id: true, createdAt: true });
export type InsertCredential = z.infer<typeof insertCredentialSchema>;
export type CredentialRow = typeof credentialsTable.$inferSelect;

export const otpTokensTable = pgTable("otp_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  loginToken: text("login_token").notNull().unique(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOtpTokenSchema = createInsertSchema(otpTokensTable).omit({ id: true, createdAt: true });
export type InsertOtpToken = z.infer<typeof insertOtpTokenSchema>;
export type OtpTokenRow = typeof otpTokensTable.$inferSelect;
