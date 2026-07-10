/**
 * MySQL has no `RETURNING`, so Drizzle's `.returning()` is unavailable on the
 * mysql2 driver. These helpers reproduce the Postgres semantics the routes were
 * written against, using `insertId` for inserts and an id round-trip for
 * updates/deletes.
 */
import { asc, inArray, eq, type SQL } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "./client";

/** Every table in this schema uses an auto-increment `id` primary key. */
type TableWithId = MySqlTable & { id: MySqlColumn };

/** Insert one row and return it, as `.returning()` did on Postgres. */
export async function insertReturning<T extends TableWithId>(
  table: T,
  values: T["$inferInsert"],
): Promise<T["$inferSelect"]> {
  const [header] = await db.insert(table).values(values as never);
  const [row] = await db
    .select()
    .from(table as MySqlTable)
    .where(eq(table.id, header.insertId));
  return row as T["$inferSelect"];
}

/**
 * Insert many rows and return them in insertion order.
 *
 * InnoDB allocates a contiguous block of auto-increment values for a "simple
 * insert" (one whose row count is known up front), so the generated ids are
 * `insertId .. insertId + n - 1`. This does NOT hold for `INSERT ... SELECT`.
 */
export async function insertManyReturning<T extends TableWithId>(
  table: T,
  values: T["$inferInsert"][],
): Promise<T["$inferSelect"][]> {
  if (values.length === 0) return [];

  const [header] = await db.insert(table).values(values as never);
  const ids = Array.from({ length: values.length }, (_, i) => header.insertId + i);

  const rows = await db
    .select()
    .from(table as MySqlTable)
    .where(inArray(table.id, ids))
    .orderBy(asc(table.id));
  return rows as T["$inferSelect"][];
}

/**
 * Update rows matching `where` and return the first updated row, or `undefined`
 * when nothing matched — mirroring `const [row] = await ...returning()`.
 *
 * The matching ids are resolved *before* the update so that the re-select stays
 * correct even when `values` overwrites a column that `where` filters on.
 */
export async function updateReturning<T extends TableWithId>(
  table: T,
  values: Partial<T["$inferInsert"]>,
  where: SQL | undefined,
): Promise<T["$inferSelect"] | undefined> {
  const targets = await db.select({ id: table.id }).from(table as MySqlTable).where(where);
  if (targets.length === 0) return undefined;

  const ids = targets.map((t) => t.id as number);
  await db.update(table).set(values as never).where(inArray(table.id, ids));

  const [row] = await db
    .select()
    .from(table as MySqlTable)
    .where(inArray(table.id, ids))
    .orderBy(asc(table.id));
  return row as T["$inferSelect"];
}

/**
 * Delete rows matching `where` and return the first deleted row, or `undefined`
 * when nothing matched. The row is read before the delete removes it.
 */
export async function deleteReturning<T extends TableWithId>(
  table: T,
  where: SQL | undefined,
): Promise<T["$inferSelect"] | undefined> {
  const rows = await db
    .select()
    .from(table as MySqlTable)
    .where(where)
    .orderBy(asc(table.id));
  if (rows.length === 0) return undefined;

  const ids = rows.map((r) => (r as { id: number }).id);
  await db.delete(table).where(inArray(table.id, ids));
  return rows[0] as T["$inferSelect"];
}
