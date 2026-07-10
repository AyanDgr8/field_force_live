import { mysqlTable, int, double, datetime, mysqlEnum } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const statusEventTypeValues = ["IDLE", "BUSY"] as const;

export const statusEventsTable = mysqlTable("status_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  visitStopId: int("visit_stop_id"),
  status: mysqlEnum("status", statusEventTypeValues).notNull(),
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  at: datetime("at", { mode: "date", fsp: 3 }).notNull(),
  durationSeconds: int("duration_seconds"),
});

export const insertStatusEventSchema = createInsertSchema(statusEventsTable).omit({ id: true });
export type InsertStatusEvent = z.infer<typeof insertStatusEventSchema>;
export type StatusEventRow = typeof statusEventsTable.$inferSelect;
