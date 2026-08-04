/**
 * Mobile app configuration — tenant-wide settings the rider app reads at runtime.
 *
 * GET   /config/mobile?customerId= — mobile-facing, no auth (same contract as
 *                                    /config/dispositions). Returns the values
 *                                    the app needs to configure itself.
 * GET   /mobile-config             — admin read
 * PATCH /mobile-config             — admin update
 */
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, updateReturning } from "@workspace/db";
import { customersTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod";

const router: IRouter = Router();

/**
 * Five seconds is the floor: every ping is a GPS read plus an upload, so a
 * shorter cycle drains rider batteries and floods location_pings for no
 * visible gain on a map that refreshes every five seconds.
 */
export const MIN_PING_INTERVAL_SECONDS = 5;
export const MAX_PING_INTERVAL_SECONDS = 300;
export const DEFAULT_PING_INTERVAL_SECONDS = 5;

async function getCustomerId(adminId: number): Promise<number | null> {
  const [u] = await db.select({ customerId: usersTable.customerId })
    .from(usersTable).where(eq(usersTable.id, adminId));
  return u?.customerId ?? null;
}

// ── Mobile-facing ─────────────────────────────────────────────────────────────
router.get("/config/mobile", async (req, res): Promise<void> => {
  const parsed = z.object({ customerId: z.coerce.number().int().positive() }).safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "customerId required" }); return; }

  const [customer] = await db
    .select({ pingIntervalSeconds: customersTable.mobilePingIntervalSeconds })
    .from(customersTable)
    .where(eq(customersTable.id, parsed.data.customerId));

  // An unknown tenant still gets a usable default — the app must never be left
  // without an interval to run on.
  res.json({ pingIntervalSeconds: customer?.pingIntervalSeconds ?? DEFAULT_PING_INTERVAL_SECONDS });
});

// ── Admin read ────────────────────────────────────────────────────────────────
router.get("/mobile-config", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [customer] = await db
    .select({ id: customersTable.id, name: customersTable.name, pingIntervalSeconds: customersTable.mobilePingIntervalSeconds })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));

  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  res.json({
    ...customer,
    minPingIntervalSeconds: MIN_PING_INTERVAL_SECONDS,
    maxPingIntervalSeconds: MAX_PING_INTERVAL_SECONDS,
  });
});

// ── Admin update ──────────────────────────────────────────────────────────────
const UpdateBody = z.object({
  pingIntervalSeconds: z.number().int()
    .min(MIN_PING_INTERVAL_SECONDS)
    .max(MAX_PING_INTERVAL_SECONDS),
});

router.patch("/mobile-config", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: `pingIntervalSeconds must be a whole number between ${MIN_PING_INTERVAL_SECONDS} and ${MAX_PING_INTERVAL_SECONDS}`,
    });
    return;
  }

  const updated = await updateReturning(
    customersTable,
    { mobilePingIntervalSeconds: parsed.data.pingIntervalSeconds },
    eq(customersTable.id, customerId),
  );

  if (!updated) { res.status(404).json({ error: "Customer not found" }); return; }

  res.json({
    id: updated.id,
    name: updated.name,
    pingIntervalSeconds: updated.mobilePingIntervalSeconds,
    minPingIntervalSeconds: MIN_PING_INTERVAL_SECONDS,
    maxPingIntervalSeconds: MAX_PING_INTERVAL_SECONDS,
  });
});

export default router;
