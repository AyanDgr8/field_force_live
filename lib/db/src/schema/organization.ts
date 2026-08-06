import { mysqlTable, text, varchar, int, datetime, boolean, mysqlEnum, json, double } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { customersTable } from "./customers";
import { usersTable } from "./users";
import { hubsTable } from "./iotOperations";

export const statesTable = mysqlTable("organization_states", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  name: text("name").notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const adminStateScopesTable = mysqlTable("admin_state_scopes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  stateId: int("state_id").notNull().references(() => statesTable.id),
});

export const adminHubScopesTable = mysqlTable("admin_hub_scopes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  hubId: int("hub_id").notNull().references(() => hubsTable.id),
});

export const vehiclesTable = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  hubId: int("hub_id").references(() => hubsTable.id),
  registrationNumber: varchar("registration_number", { length: 64 }).notNull(),
  vehicleType: text("vehicle_type").notNull().default("TWO_WHEELER"),
  make: text("make"), model: text("model"), color: text("color"),
  chassisNumber: text("chassis_number"), engineNumber: text("engine_number"),
  imei: text("imei"), iotVendor: text("iot_vendor"),
  status: mysqlEnum("status", ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "INACTIVE"]).notNull().default("AVAILABLE"),
  metadata: json("metadata"),
  active: boolean("active").notNull().default(true),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const verificationStatusValues = ["NOT_STARTED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "REVIEW_REQUIRED"] as const;
export const backgroundVerificationsTable = mysqlTable("background_verifications", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  userId: int("user_id").references(() => usersTable.id),
  employeeId: varchar("employee_id", { length: 64 }).notNull(),
  profileId: text("profile_id"), vendorName: text("vendor_name"),
  stateName: text("state_name"), hubName: text("hub_name"),
  nidStatus: text("nid_status"), crcStatus: text("crc_status"),
  nidRemarks: text("nid_remarks"), crcRemarks: text("crc_remarks"),
  status: mysqlEnum("status", verificationStatusValues).notNull().default("PENDING"),
  vehicleStatus: text("vehicle_status"), vehicleProvider: text("vehicle_provider"),
  source: mysqlEnum("source", ["SHEET", "API", "MANUAL"]).notNull(),
  externalReference: text("external_reference"),
  rawData: json("raw_data"),
  verifiedAt: datetime("verified_at", { mode: "date", fsp: 3 }),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const importJobsTable = mysqlTable("import_jobs", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  uploadedByUserId: int("uploaded_by_user_id").references(() => usersTable.id),
  type: mysqlEnum("type", ["BGV", "DELIVERY", "DROPOUT"]).notNull(),
  fileName: text("file_name"), source: mysqlEnum("source", ["SHEET", "API", "EMAIL"]).notNull(),
  status: mysqlEnum("status", ["PROCESSING", "COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED"]).notNull(),
  totalRows: int("total_rows").notNull().default(0), successfulRows: int("successful_rows").notNull().default(0),
  failedRows: int("failed_rows").notNull().default(0), warnings: json("warnings"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
  completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
});

export const deliveryRecordsTable = mysqlTable("delivery_records", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  importJobId: int("import_job_id").references(() => importJobsTable.id),
  userId: int("user_id").references(() => usersTable.id),
  fhrId: varchar("fhr_id", { length: 64 }).notNull(),
  runsheetId: text("runsheet_id"), shipmentId: varchar("shipment_id", { length: 128 }),
  agentName: text("agent_name"), deliveryHub: text("delivery_hub"),
  city: text("city"), zone: text("zone"), state: text("state"),
  shipmentStatus: text("shipment_status"), runsheetShipmentStatus: text("runsheet_shipment_status"),
  shipmentType: text("shipment_type"), shipmentPrice: double("shipment_price"), shipmentWeight: double("shipment_weight"),
  shipmentUpdatedAt: datetime("shipment_updated_at", { mode: "date", fsp: 3 }),
  rawData: json("raw_data"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const dropoutRecordsTable = mysqlTable("dropout_records", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  importJobId: int("import_job_id").references(() => importJobsTable.id),
  userId: int("user_id").references(() => usersTable.id),
  fhrId: varchar("fhr_id", { length: 64 }).notNull(),
  fullName: text("full_name"),
  hubName: text("hub_name"),
  city: text("city"),
  state: text("state"),
  zone: text("zone"),
  status: text("status"),
  dropoutDate: datetime("dropout_date", { mode: "date" }),
  rawData: json("raw_data"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});
