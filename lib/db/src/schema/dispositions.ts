import { mysqlTable, text, int, boolean } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";

export const dispositionsTable = mysqlTable("dispositions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull().references(() => customersTable.id),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
});

export const insertDispositionSchema = createInsertSchema(dispositionsTable).omit({ id: true });
export type InsertDisposition = z.infer<typeof insertDispositionSchema>;
export type DispositionRow = typeof dispositionsTable.$inferSelect;
