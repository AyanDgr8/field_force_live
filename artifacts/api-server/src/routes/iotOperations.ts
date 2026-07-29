import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import {
  db, hubsTable, riderHubAssignmentsTable, accessPoliciesTable,
  attendanceAttemptsTable, vehicleAccessEventsTable, emergencyAlertsTable,
  sessionsTable, usersTable,
  adminStateScopesTable, adminHubScopesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
const packagesDefault = [
  { minutes: 30, pricePaise: 3000 }, { minutes: 60, pricePaise: 5000 },
  { minutes: 120, pricePaise: 10000 }, { minutes: 240, pricePaise: 20000 },
];

const hubBody = z.object({
  name: z.string().min(1), code: z.string().min(1).max(64),
  stateId: z.number().int().positive().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(25).max(10000),
  maxGpsAccuracyM: z.number().int().min(5).max(1000).default(75),
  active: z.boolean().default(true),
});
const policyBody = z.object({
  hubId: z.number().int().positive().nullable().optional(),
  workStartMinute: z.number().int().min(0).max(1439),
  workEndMinute: z.number().int().min(1).max(1440),
  restrictedEndMinute: z.number().int().min(1).max(1440),
  freeRideCount: z.number().int().min(0).max(100),
  freeRideMinutes: z.number().int().min(1).max(1440),
  packages: z.array(z.object({ minutes: z.number().int().positive(), pricePaise: z.number().int().nonnegative() })).max(20),
  timezone: z.string().min(1).default("Asia/Kolkata"),
});

async function customerIdForAdmin(adminId: number) {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
  return admin?.customerId;
}
async function scopedAdmin(adminId: number) {
  const [admin] = await db.select().from(usersTable).where(eq(usersTable.id, adminId));
  if (!admin || admin.role === "USER") return null;
  const states = await db.select().from(adminStateScopesTable).where(eq(adminStateScopesTable.userId, adminId));
  const hubs = await db.select().from(adminHubScopesTable).where(eq(adminHubScopesTable.userId, adminId));
  return { ...admin, stateIds: states.map(x => x.stateId), hubIds: hubs.map(x => x.hubId) };
}
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
async function activeAssignment(userId: number) {
  const [assignment] = await db.select().from(riderHubAssignmentsTable)
    .where(and(eq(riderHubAssignmentsTable.userId, userId), isNull(riderHubAssignmentsTable.unassignedAt)))
    .orderBy(desc(riderHubAssignmentsTable.assignedAt)).limit(1);
  if (!assignment) return null;
  const [hub] = await db.select().from(hubsTable).where(eq(hubsTable.id, assignment.hubId));
  return hub ?? null;
}

router.get("/iot/hubs", requireAuth, async (req, res): Promise<void> => {
  const admin = await scopedAdmin(req.adminUserId!);
  if (!admin) { res.status(401).json({ error: "Admin not found" }); return; }
  let hubs = await db.select().from(hubsTable).where(eq(hubsTable.customerId, admin.customerId));
  if (admin.role === "STATE_ADMIN") hubs = hubs.filter(h => h.stateId != null && admin.stateIds.includes(h.stateId));
  if (admin.role === "HUB_ADMIN") hubs = hubs.filter(h => admin.hubIds.includes(h.id));
  res.json(hubs);
});
router.post("/iot/hubs", requireAuth, async (req, res): Promise<void> => {
  const parsed = hubBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const admin = await scopedAdmin(req.adminUserId!);
  if (!admin || admin.role === "HUB_ADMIN") { res.status(403).json({ error: "Only Super Admin or State Admin can create hubs" }); return; }
  if (admin.role === "STATE_ADMIN" && (!parsed.data.stateId || !admin.stateIds.includes(parsed.data.stateId))) { res.status(403).json({ error: "State is outside your scope" }); return; }
  const customerId = admin.customerId;
  await db.insert(hubsTable).values({ ...parsed.data, customerId, qrToken: uuidv4() });
  const [created] = await db.select().from(hubsTable)
    .where(and(eq(hubsTable.customerId, customerId), eq(hubsTable.code, parsed.data.code)))
    .orderBy(desc(hubsTable.id)).limit(1);
  res.status(201).json(created);
});
router.patch("/iot/hubs/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = hubBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const admin = await scopedAdmin(req.adminUserId!);
  if (!admin) { res.status(403).json({ error: "Admin access required" }); return; }
  const [hub] = await db.select().from(hubsTable).where(and(eq(hubsTable.id, Number(req.params.id)), eq(hubsTable.customerId, admin.customerId)));
  const allowed = hub && (admin.role === "SUPER_ADMIN" || (admin.role === "STATE_ADMIN" && hub.stateId != null && admin.stateIds.includes(hub.stateId)) || (admin.role === "HUB_ADMIN" && admin.hubIds.includes(hub.id)));
  if (!allowed) { res.status(403).json({ error: "Hub is outside your scope" }); return; }
  await db.update(hubsTable).set(parsed.data).where(eq(hubsTable.id, hub.id));
  res.sendStatus(204);
});
router.post("/iot/hubs/:id/assign", requireAuth, async (req, res): Promise<void> => {
  const body = z.object({ userId: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const customerId = await customerIdForAdmin(req.adminUserId!);
  const [hub] = await db.select().from(hubsTable).where(and(eq(hubsTable.id, Number(req.params.id)), eq(hubsTable.customerId, customerId!)));
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, body.data.userId), eq(usersTable.customerId, customerId!)));
  if (!hub || !user) { res.status(404).json({ error: "Hub or rider not found" }); return; }
  await db.update(riderHubAssignmentsTable).set({ unassignedAt: new Date() })
    .where(and(eq(riderHubAssignmentsTable.userId, user.id), isNull(riderHubAssignmentsTable.unassignedAt)));
  await db.insert(riderHubAssignmentsTable).values({ userId: user.id, hubId: hub.id });
  res.sendStatus(204);
});

router.get("/iot/policy", requireAuth, async (req, res): Promise<void> => {
  const customerId = await customerIdForAdmin(req.adminUserId!);
  const rows = await db.select().from(accessPoliciesTable).where(eq(accessPoliciesTable.customerId, customerId!));
  res.json(rows[0] ?? { workStartMinute: 300, workEndMinute: 1140, restrictedEndMinute: 1440, freeRideCount: 2, freeRideMinutes: 15, packages: packagesDefault, timezone: "Asia/Kolkata" });
});
router.put("/iot/policy", requireAuth, async (req, res): Promise<void> => {
  const parsed = policyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.workStartMinute >= parsed.data.workEndMinute || parsed.data.workEndMinute >= parsed.data.restrictedEndMinute) {
    res.status(400).json({ error: "Time windows must be in increasing order" }); return;
  }
  const customerId = await customerIdForAdmin(req.adminUserId!);
  const [existing] = await db.select().from(accessPoliciesTable).where(and(eq(accessPoliciesTable.customerId, customerId!), eq(accessPoliciesTable.active, true))).limit(1);
  if (existing) await db.update(accessPoliciesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(accessPoliciesTable.id, existing.id));
  else await db.insert(accessPoliciesTable).values({ ...parsed.data, customerId: customerId!, packages: parsed.data.packages });
  res.sendStatus(204);
});

router.post("/user/attendance/scan", async (req, res): Promise<void> => {
  const parsed = z.object({
    userId: z.number().int().positive(), qrToken: z.string().min(1),
    latitude: z.number(), longitude: z.number(), accuracyM: z.number().nonnegative().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { userId, qrToken, latitude, longitude, accuracyM } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({
      error: "This rider account no longer exists. Sign in again with an active account.",
      code: "STALE_MOBILE_SESSION",
    });
    return;
  }
  if (user.role !== "USER" || user.status !== "ACTIVE") {
    res.status(403).json({
      error: user.status !== "ACTIVE"
        ? "This rider account is not active. Contact your administrator."
        : "Attendance is only available to rider accounts.",
    });
    return;
  }
  const hub = await activeAssignment(userId);
  let status: typeof attendanceAttemptsTable.$inferInsert.status = "NO_HUB";
  let distance: number | null = null;
  if (hub) {
    distance = distanceM(latitude, longitude, hub.latitude, hub.longitude);
    status = qrToken !== hub.qrToken ? "INVALID_QR"
      : accuracyM != null && accuracyM > hub.maxGpsAccuracyM ? "GPS_INACCURATE"
      : distance > hub.radiusM ? "OUTSIDE_GEOFENCE" : "ACCEPTED";
  }
  await db.insert(attendanceAttemptsTable).values({
    userId, hubId: hub?.id, status, latitude, longitude, accuracyM,
    distanceM: distance, configuredRadiusM: hub?.radiusM,
  });
  if (status !== "ACCEPTED") {
    if (status === "OUTSIDE_GEOFENCE") await db.insert(emergencyAlertsTable).values({
      userId, direction: "USER_TO_ADMIN", lat: latitude, lng: longitude,
      message: `Attendance rejected: rider is ${Math.round(distance!)}m from ${hub!.name} (allowed ${hub!.radiusM}m)`,
    });
    res.status(422).json({ accepted: false, status, distanceM: distance, allowedRadiusM: hub?.radiusM, message: status === "GPS_INACCURATE" ? "GPS accuracy is too low. Move outdoors and retry." : "Attendance rejected. Reach your assigned hub and scan again." }); return;
  }
  const now = new Date();
  const [open] = await db.select().from(sessionsTable).where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.logoutAt))).limit(1);
  if (!open) await db.insert(sessionsTable).values({ userId, loginAt: now, loginLat: latitude, loginLng: longitude });
  await db.update(usersTable).set({ liveStatus: "ON_SHIFT_IDLE", liveStatusSince: now }).where(eq(usersTable.id, userId));
  res.json({ accepted: true, status, hub: { id: hub!.id, name: hub!.name }, distanceM: distance, allowedRadiusM: hub!.radiusM, clockedInAt: now });
});

router.post("/user/vehicle-access/request", async (req, res): Promise<void> => {
  const parsed = z.object({ userId: z.number().int().positive(), packageMinutes: z.number().int().positive().optional(), latitude: z.number().optional(), longitude: z.number().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId));
  if (!user) { res.status(404).json({ error: "Rider not found" }); return; }
  const hub = await activeAssignment(user.id);
  const [policy] = await db.select().from(accessPoliciesTable).where(and(eq(accessPoliciesTable.customerId, user.customerId), eq(accessPoliciesTable.active, true))).limit(1);
  const p = policy ?? { workStartMinute: 300, workEndMinute: 1140, restrictedEndMinute: 1440, freeRideCount: 2, freeRideMinutes: 15, packages: packagesDefault };
  const local = new Date(new Date().toLocaleString("en-US", { timeZone: policy?.timezone ?? "Asia/Kolkata" }));
  const minute = local.getHours() * 60 + local.getMinutes();
  let authorizedMinutes: number | null = null, reason = "";
  if (minute >= p.workStartMinute && minute < p.workEndMinute) { authorizedMinutes = p.workEndMinute - minute; reason = "WORK_HOURS"; }
  else if (minute >= p.restrictedEndMinute || minute < p.workStartMinute) reason = "RESTRICTED_HOURS";
  else if (parsed.data.packageMinutes) {
    const pkg = p.packages.find(x => x.minutes === parsed.data.packageMinutes);
    if (!pkg) { res.status(400).json({ error: "Unknown package" }); return; }
    await db.insert(vehicleAccessEventsTable).values({ userId: user.id, hubId: hub?.id, type: "PAYMENT_PENDING", reason: "PAYMENT_PROVIDER_NOT_CONFIGURED", details: pkg });
    res.status(503).json({ authorized: false, reason: "PAYMENT_PROVIDER_NOT_CONFIGURED", package: pkg }); return;
  } else {
    const dayStart = new Date(local); dayStart.setHours(0, 0, 0, 0);
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(vehicleAccessEventsTable)
      .where(and(eq(vehicleAccessEventsTable.userId, user.id), eq(vehicleAccessEventsTable.reason, "FREE_RIDE"), gte(vehicleAccessEventsTable.createdAt, dayStart)));
    if (Number(count) < p.freeRideCount) { authorizedMinutes = p.freeRideMinutes; reason = "FREE_RIDE"; }
    else reason = "PAYMENT_REQUIRED";
  }
  const validUntil = authorizedMinutes ? new Date(Date.now() + authorizedMinutes * 60000) : null;
  await db.insert(vehicleAccessEventsTable).values({ userId: user.id, hubId: hub?.id, type: authorizedMinutes ? "AUTHORIZED" : "DENIED", reason, validUntil, commandIntent: authorizedMinutes ? "ENABLE_IGNITION" : "BLOCK_NEXT_IGNITION_WHEN_STATIONARY", latitude: parsed.data.latitude, longitude: parsed.data.longitude });
  res.status(authorizedMinutes ? 200 : 403).json({ authorized: !!authorizedMinutes, reason, validUntil, packages: p.packages });
});

router.post("/user/vehicle-access/expired", async (req, res): Promise<void> => {
  const parsed = z.object({ userId: z.number().int().positive(), latitude: z.number().optional(), longitude: z.number().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.insert(vehicleAccessEventsTable).values({ userId: parsed.data.userId, type: "EXPIRED", reason: "ACCESS_WINDOW_EXPIRED", commandIntent: "BLOCK_NEXT_IGNITION_WHEN_STATIONARY", latitude: parsed.data.latitude, longitude: parsed.data.longitude });
  await db.insert(emergencyAlertsTable).values({ userId: parsed.data.userId, direction: "USER_TO_ADMIN", message: "Vehicle access expired. Next ignition is blocked; rider assistance may be required.", lat: parsed.data.latitude, lng: parsed.data.longitude });
  await db.update(usersTable).set({ emergencyActive: true }).where(eq(usersTable.id, parsed.data.userId));
  res.json({ emergency: true, commandIntent: "BLOCK_NEXT_IGNITION_WHEN_STATIONARY" });
});

export default router;
