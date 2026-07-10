import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, insertReturning, updateReturning, deleteReturning } from "@workspace/db";
import { dispositionsTable, usersTable } from "@workspace/db";
import {
  ListDispositionsResponse,
  CreateDispositionBody,
  CreateDispositionResponse,
  UpdateDispositionParams,
  UpdateDispositionBody,
  UpdateDispositionResponse,
  DeleteDispositionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

async function getAdminCustomerId(adminUserId: number): Promise<number | null> {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminUserId));
  return u?.customerId ?? null;
}

// GET /dispositions
router.get("/dispositions", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const rows = await db.select().from(dispositionsTable)
    .where(eq(dispositionsTable.customerId, customerId));

  res.json(ListDispositionsResponse.parse(rows));
});

// POST /dispositions
router.post("/dispositions", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const parsed = CreateDispositionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const row = await insertReturning(dispositionsTable, {
    customerId,
    label: parsed.data.label,
    active: parsed.data.active ?? true,
    sortOrder: parsed.data.sortOrder ?? 0,
  });

  res.status(201).json(CreateDispositionResponse.parse(row));
});

// PATCH /dispositions/:id
router.patch("/dispositions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateDispositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = UpdateDispositionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const row = await updateReturning(
    dispositionsTable,
    parsed.data,
    and(eq(dispositionsTable.id, params.data.id), eq(dispositionsTable.customerId, customerId)),
  );

  if (!row) { res.status(404).json({ error: "Disposition not found" }); return; }

  res.json(UpdateDispositionResponse.parse(row));
});

// DELETE /dispositions/:id
router.delete("/dispositions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDispositionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const row = await deleteReturning(
    dispositionsTable,
    and(eq(dispositionsTable.id, params.data.id), eq(dispositionsTable.customerId, customerId)),
  );

  if (!row) { res.status(404).json({ error: "Disposition not found" }); return; }

  res.sendStatus(204);
});

export default router;
