/**
 * Device category CRUD.
 * GET    /device-categories
 * POST   /device-categories
 * PATCH  /device-categories/:id
 * DELETE /device-categories/:id
 */
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, insertReturning, updateReturning } from "@workspace/db";
import { deviceCategoriesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod/v4";

const router: IRouter = Router();

async function getCustomerId(adminId: number) {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminId));
  return u?.customerId ?? null;
}

router.get("/device-categories", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(deviceCategoriesTable)
    .where(eq(deviceCategoriesTable.customerId, customerId))
    .orderBy(deviceCategoriesTable.sortOrder);
  res.json(rows);
});

const CategoryBody = z.object({
  key: z.string().min(1).optional(),
  label: z.string().min(1),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  iconKey: z.string().min(1),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

router.post("/device-categories", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const row = await insertReturning(deviceCategoriesTable, {
    customerId,
    key: parsed.data.key ?? parsed.data.label.toUpperCase().replace(/\s+/g, "_"),
    label: parsed.data.label,
    colorHex: parsed.data.colorHex,
    iconKey: parsed.data.iconKey,
    sortOrder: parsed.data.sortOrder,
    active: parsed.data.active,
  });

  res.status(201).json(row);
});

router.patch("/device-categories/:id", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CategoryBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const updated = await updateReturning(
    deviceCategoriesTable,
    parsed.data,
    and(eq(deviceCategoriesTable.id, parseInt(String(req.params.id))), eq(deviceCategoriesTable.customerId, customerId)),
  );

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/device-categories/:id", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.delete(deviceCategoriesTable)
    .where(and(eq(deviceCategoriesTable.id, parseInt(String(req.params.id))), eq(deviceCategoriesTable.customerId, customerId)));
  res.status(204).end();
});

export default router;
