import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { dispositionsTable } from "@workspace/db";
import {
  GetConfigDispositionsQueryParams,
  GetConfigDispositionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /config/dispositions -- no auth (mobile-facing)
router.get("/config/dispositions", async (req, res): Promise<void> => {
  const q = GetConfigDispositionsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const rows = await db.select().from(dispositionsTable)
    .where(and(
      eq(dispositionsTable.customerId, q.data.customerId),
      eq(dispositionsTable.active, true),
    ));

  res.json(GetConfigDispositionsResponse.parse(rows));
});

export default router;
