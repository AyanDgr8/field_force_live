import { mysqlTable, text, int, datetime } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`(now(3))`),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
