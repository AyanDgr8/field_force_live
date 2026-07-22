/**
 * Vendor account management routes.
 *
 * SECURITY:
 *  - credentials_enc is WRITE-ONLY — never returned in any response.
 *  - Responses include a masked hint (e.g. "user***") but never the plaintext.
 *  - All log output from this file is already credential-free.
 *
 * GET    /vendor-accounts            — list (health panel data)
 * POST   /vendor-accounts            — create
 * PATCH  /vendor-accounts/:id        — update (credentials optional)
 * DELETE /vendor-accounts/:id        — delete
 * POST   /vendor-accounts/:id/test   — test connection
 * POST   /vendor-accounts/:id/poll-now — trigger immediate poll
 */
import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, insertReturning, updateReturning } from "@workspace/db";
import { vendorAccountsTable, trackedDevicesTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { boltConnector } from "../lib/gps/boltConnector.js";
import { mockBoltConnector } from "../lib/gps/mockBoltConnector.js";
import { scheduleAccountPoller } from "../lib/devicePoller.js";
import { z } from "zod/v4";

const router: IRouter = Router();

const CONNECTORS: Record<string, { testConnection: (c: any) => Promise<{ ok: boolean; message: string; deviceCount?: number }> }> = {
  BOLT: boltConnector,
  MOCK_BOLT: mockBoltConnector,
};

async function getCustomerId(adminId: number) {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminId));
  return u?.customerId ?? null;
}

/** Strip credentials — never return them. Show a masked username hint only. */
function sanitize(row: typeof vendorAccountsTable.$inferSelect) {
  let usernameHint = "—";
  try {
    const creds = JSON.parse(decrypt(row.credentialsEnc)) as { username?: string };
    if (creds.username) {
      usernameHint = creds.username.length > 3
        ? creds.username.slice(0, 3) + "***"
        : "***";
    }
  } catch { /* ignore decrypt errors */ }

  const { credentialsEnc: _omit, ...safe } = row;
  return { ...safe, usernameHint };
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/vendor-accounts", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(vendorAccountsTable)
    .where(eq(vendorAccountsTable.customerId, customerId))
    .orderBy(vendorAccountsTable.displayName);

  res.json(rows.map(sanitize));
});

// ── Create ────────────────────────────────────────────────────────────────────
const CreateBody = z.object({
  vendorKey: z.enum(["BOLT", "MOCK_BOLT"]),
  displayName: z.string().min(1),
  credentials: z.object({ username: z.string(), password: z.string(), apiKey: z.string().optional(), baseUrl: z.string().optional() }),
  pollIntervalSeconds: z.number().int().min(10).max(300).default(30),
  enabled: z.boolean().default(true),
});

router.post("/vendor-accounts", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const credentialsEnc = encrypt(JSON.stringify(parsed.data.credentials));
  const row = await insertReturning(vendorAccountsTable, {
    customerId,
    vendorKey: parsed.data.vendorKey,
    displayName: parsed.data.displayName,
    credentialsEnc,
    pollIntervalSeconds: parsed.data.pollIntervalSeconds,
    enabled: parsed.data.enabled,
  });

  // Start polling immediately
  scheduleAccountPoller(row.id, row.pollIntervalSeconds * 1000);

  res.status(201).json(sanitize(row));
});

// ── Update ────────────────────────────────────────────────────────────────────
const UpdateBody = z.object({
  displayName: z.string().min(1).optional(),
  credentials: z.object({ username: z.string(), password: z.string(), apiKey: z.string().optional(), baseUrl: z.string().optional() }).optional(),
  pollIntervalSeconds: z.number().int().min(10).max(300).optional(),
  enabled: z.boolean().optional(),
});

router.patch("/vendor-accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const id = parseInt(String(req.params.id));
  const updates: Partial<typeof vendorAccountsTable.$inferInsert> = {};
  if (parsed.data.displayName) updates.displayName = parsed.data.displayName;
  if (parsed.data.credentials) updates.credentialsEnc = encrypt(JSON.stringify(parsed.data.credentials));
  if (parsed.data.pollIntervalSeconds !== undefined) updates.pollIntervalSeconds = parsed.data.pollIntervalSeconds;
  if (parsed.data.enabled !== undefined) {
    updates.enabled = parsed.data.enabled;
    if (!parsed.data.enabled) updates.status = "DISABLED";
  }

  const updated = await updateReturning(
    vendorAccountsTable,
    updates,
    and(eq(vendorAccountsTable.id, id), eq(vendorAccountsTable.customerId, customerId)),
  );

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Reschedule poller with new interval if changed
  if (parsed.data.pollIntervalSeconds || parsed.data.enabled !== undefined) {
    if (updated.enabled) {
      scheduleAccountPoller(updated.id, updated.pollIntervalSeconds * 1000);
    }
  }

  res.json(sanitize(updated));
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/vendor-accounts/:id", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id));
  const deviceCount = await db.select({ id: trackedDevicesTable.id }).from(trackedDevicesTable)
    .where(eq(trackedDevicesTable.vendorAccountId, id));
  if (deviceCount.length > 0) {
    res.status(409).json({ error: `Cannot delete: ${deviceCount.length} device(s) registered. Reassign or remove devices first.` });
    return;
  }

  await db.delete(vendorAccountsTable)
    .where(and(eq(vendorAccountsTable.id, id), eq(vendorAccountsTable.customerId, customerId)));
  res.status(204).end();
});

// ── Test connection ───────────────────────────────────────────────────────────
router.post("/vendor-accounts/:id/test", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id));
  const [account] = await db.select().from(vendorAccountsTable)
    .where(and(eq(vendorAccountsTable.id, id), eq(vendorAccountsTable.customerId, customerId)));
  if (!account) { res.status(404).json({ error: "Not found" }); return; }

  const connector = CONNECTORS[account.vendorKey];
  if (!connector) { res.status(400).json({ error: `No connector for vendor ${account.vendorKey}` }); return; }

  let config: any;
  try { config = JSON.parse(decrypt(account.credentialsEnc)); }
  catch { res.status(500).json({ error: "Failed to decrypt credentials" }); return; }

  const result = await connector.testConnection(config);
  res.json(result);
});

// ── Poll now ──────────────────────────────────────────────────────────────────
router.post("/vendor-accounts/:id/poll-now", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id));
  const [account] = await db.select({ id: vendorAccountsTable.id, customerId: vendorAccountsTable.customerId })
    .from(vendorAccountsTable)
    .where(and(eq(vendorAccountsTable.id, id), eq(vendorAccountsTable.customerId, customerId)));
  if (!account) { res.status(404).json({ error: "Not found" }); return; }

  // Fire poll immediately (non-blocking)
  scheduleAccountPoller(id, 0);
  res.json({ triggered: true });
});

export default router;
