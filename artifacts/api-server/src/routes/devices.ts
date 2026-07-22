/**
 * Device management routes.
 * GET  /devices              — list all tracked devices (filterable)
 * GET  /devices/:id          — device detail
 * GET  /devices/:id/history  — ping history
 * POST /devices/:id/assign   — assign to a user
 * POST /devices/:id/unassign — unassign from current user
 * PATCH /devices/:id/category — change device category
 */
import { Router, type IRouter } from "express";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { db, updateReturning } from "@workspace/db";
import {
  trackedDevicesTable, deviceCategoriesTable, deviceAssignmentsTable,
  usersTable, locationPingsTable, vendorAccountsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { z } from "zod";

const router: IRouter = Router();

async function getCustomerId(adminId: number) {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminId));
  return u?.customerId ?? null;
}

// ── List devices ──────────────────────────────────────────────────────────────
router.get("/devices", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { categoryId, vendorKey, status, assignedUserId } = req.query as Record<string, string>;

  const rows = await db
    .select({
      device: trackedDevicesTable,
      category: deviceCategoriesTable,
      assignedUser: {
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        employeeCode: usersTable.employeeCode,
      },
    })
    .from(trackedDevicesTable)
    .leftJoin(deviceCategoriesTable, eq(trackedDevicesTable.deviceCategoryId, deviceCategoriesTable.id))
    .leftJoin(usersTable, eq(trackedDevicesTable.assignedUserId, usersTable.id))
    .where(
      and(
        eq(trackedDevicesTable.customerId, customerId),
        categoryId ? eq(trackedDevicesTable.deviceCategoryId, parseInt(categoryId)) : undefined,
        vendorKey ? eq(trackedDevicesTable.vendorKey, vendorKey) : undefined,
        status ? eq(trackedDevicesTable.status, status as any) : undefined,
        assignedUserId ? eq(trackedDevicesTable.assignedUserId, parseInt(assignedUserId)) : undefined,
      )
    )
    .orderBy(desc(trackedDevicesTable.lastFixAt));

  res.json(rows.map(r => ({
    ...r.device,
    category: r.category,
    assignedUser: r.assignedUser?.id ? r.assignedUser : null,
  })));
});

// ── Device detail ─────────────────────────────────────────────────────────────
router.get("/devices/:id", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id));
  const [row] = await db
    .select({ device: trackedDevicesTable, category: deviceCategoriesTable, user: usersTable })
    .from(trackedDevicesTable)
    .leftJoin(deviceCategoriesTable, eq(trackedDevicesTable.deviceCategoryId, deviceCategoriesTable.id))
    .leftJoin(usersTable, eq(trackedDevicesTable.assignedUserId, usersTable.id))
    .where(and(eq(trackedDevicesTable.id, id), eq(trackedDevicesTable.customerId, customerId)));

  if (!row) { res.status(404).json({ error: "Device not found" }); return; }
  res.json({ ...row.device, category: row.category, assignedUser: row.user?.id ? row.user : null });
});

// ── Ping history ──────────────────────────────────────────────────────────────
router.get("/devices/:id/history", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(String(req.params.id));
  const fromMs = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 24 * 3600 * 1000);
  const toMs = req.query.to ? new Date(req.query.to as string) : new Date();

  const [device] = await db.select({ id: trackedDevicesTable.id })
    .from(trackedDevicesTable)
    .where(and(eq(trackedDevicesTable.id, id), eq(trackedDevicesTable.customerId, customerId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const pings = await db
    .select({
      id: locationPingsTable.id,
      latitude: locationPingsTable.latitude,
      longitude: locationPingsTable.longitude,
      speedKph: locationPingsTable.speedKph,
      courseDeg: locationPingsTable.courseDeg,
      ignition: locationPingsTable.ignition,
      alarm: locationPingsTable.alarm,
      recordedAt: locationPingsTable.recordedAt,
    })
    .from(locationPingsTable)
    .where(
      and(
        sql`tracked_device_id = ${id}`,
        gte(locationPingsTable.recordedAt, fromMs),
        lte(locationPingsTable.recordedAt, toMs),
      )
    )
    .orderBy(locationPingsTable.recordedAt)
    .limit(2000);

  res.json(pings);
});

// ── Assign device to user ─────────────────────────────────────────────────────
router.post("/devices/:id/assign", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = z.object({ userId: z.number().int() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "userId required" }); return; }

  const deviceId = parseInt(String(req.params.id));
  const [device] = await db.select().from(trackedDevicesTable)
    .where(and(eq(trackedDevicesTable.id, deviceId), eq(trackedDevicesTable.customerId, customerId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, parsed.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Close any existing open assignment
  if (device.assignedUserId) {
    await db.update(deviceAssignmentsTable)
      .set({ unassignedAt: new Date() })
      .where(
        and(
          eq(deviceAssignmentsTable.trackedDeviceId, deviceId),
          sql`unassigned_at IS NULL`,
        )
      );
  }

  // New assignment
  await db.insert(deviceAssignmentsTable).values({
    trackedDeviceId: deviceId,
    userId: parsed.data.userId,
    assignedByAdminId: req.adminUserId!,
  });

  const updated = await updateReturning(
    trackedDevicesTable,
    { assignedUserId: parsed.data.userId },
    eq(trackedDevicesTable.id, deviceId),
  );

  res.json(updated);
});

// ── Unassign device ───────────────────────────────────────────────────────────
router.post("/devices/:id/unassign", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const deviceId = parseInt(String(req.params.id));
  const [device] = await db.select().from(trackedDevicesTable)
    .where(and(eq(trackedDevicesTable.id, deviceId), eq(trackedDevicesTable.customerId, customerId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  await db.update(deviceAssignmentsTable)
    .set({ unassignedAt: new Date() })
    .where(and(eq(deviceAssignmentsTable.trackedDeviceId, deviceId), sql`unassigned_at IS NULL`));

  const updated = await updateReturning(
    trackedDevicesTable,
    { assignedUserId: null },
    eq(trackedDevicesTable.id, deviceId),
  );

  res.json(updated);
});

// ── Update device category ────────────────────────────────────────────────────
router.patch("/devices/:id/category", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = z.object({ deviceCategoryId: z.number().int().nullable() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "deviceCategoryId required" }); return; }

  const deviceId = parseInt(String(req.params.id));
  const updated = await updateReturning(
    trackedDevicesTable,
    { deviceCategoryId: parsed.data.deviceCategoryId },
    and(eq(trackedDevicesTable.id, deviceId), eq(trackedDevicesTable.customerId, customerId)),
  );

  if (!updated) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(updated);
});

export default router;
