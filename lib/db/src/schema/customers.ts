import { mysqlTable, text, int, datetime } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  // How often the mobile app records and uploads a location ping, in seconds.
  // The tenant-wide counterpart to vendor_accounts.poll_interval_seconds.
  mobilePingIntervalSeconds: int("mobile_ping_interval_seconds").notNull().default(5),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
