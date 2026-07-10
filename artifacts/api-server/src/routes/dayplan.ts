import { Router, type IRouter } from "express";
import { eq, and, asc, isNull } from "drizzle-orm";
import { db, insertReturning, updateReturning } from "@workspace/db";
import {
  usersTable,
  addressesTable,
  dayPlansTable,
  visitStopsTable,
  publicTrackLinksTable,
} from "@workspace/db";
import {
  GetUserDayPlanQueryParams,
  GetUserDayPlanResponse,
  CreateVisitStopParams,
  CreateVisitStopBody,
  CreateVisitStopResponse,
  UpdateVisitStopParams,
  UpdateVisitStopBody,
  UpdateVisitStopResponse,
  DeleteVisitStopParams,
  PlanRouteParams,
  PlanRouteResponse,
  PublishDayPlanParams,
  PublishDayPlanResponse,
  CreateTrackLinkParams,
  CreateTrackLinkResponse,
  RevokeTrackLinkParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { randomDelhiNcrCoord, haversineMeters, estimateTravelTime } from "../lib/geo.js";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

async function getAdminCustomerId(adminUserId: number): Promise<number | null> {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminUserId));
  return u?.customerId ?? null;
}

async function findOrCreateDayPlan(userId: number, dateStr: string) {
  const [existing] = await db.select().from(dayPlansTable)
    .where(and(eq(dayPlansTable.userId, userId), eq(dayPlansTable.visitDate, dateStr)));
  if (existing) return existing;
  return insertReturning(dayPlansTable, { userId, visitDate: dateStr });
}

async function getDayPlanDetail(planId: number) {
  const [plan] = await db.select().from(dayPlansTable).where(eq(dayPlansTable.id, planId));
  if (!plan) return null;
  const stops = await db.select().from(visitStopsTable)
    .where(eq(visitStopsTable.dayPlanId, planId))
    .orderBy(asc(visitStopsTable.sequence));
  return { ...plan, stops };
}

// GET /day-plan?userId=&date=
router.get("/day-plan", requireAuth, async (req, res): Promise<void> => {
  const q = GetUserDayPlanQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, q.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const dateStr = q.data.date instanceof Date ? q.data.date.toISOString().slice(0, 10) : String(q.data.date);
  const plan = await findOrCreateDayPlan(user.id, dateStr);
  const detail = await getDayPlanDetail(plan.id);
  res.json(GetUserDayPlanResponse.parse(detail));
});

// POST /users/:id/visit-stops
router.post("/users/:id/visit-stops", requireAuth, async (req, res): Promise<void> => {
  const params = CreateVisitStopParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = CreateVisitStopBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const visitDate = body.data.visitDate instanceof Date
    ? body.data.visitDate.toISOString().slice(0, 10)
    : String(body.data.visitDate);

  const plan = await findOrCreateDayPlan(user.id, visitDate);

  req.log.warn("Geocoding is stubbed — using random Delhi NCR coordinates until GOOGLE_MAPS_SERVER_KEY is configured");
  const { lat, lng } = randomDelhiNcrCoord();

  const stop = await insertReturning(visitStopsTable, {
    userId: user.id,
    dayPlanId: plan.id,
    visitDate,
    priority: body.data.priority,
    customerCode: body.data.customerCode,
    label: body.data.label ?? null,
    inputType: body.data.inputType,
    rawInput: body.data.rawInput,
    latitude: lat,
    longitude: lng,
    contactName: body.data.contactName ?? null,
    contactPhone: body.data.contactPhone ?? null,
  });

  res.status(201).json(CreateVisitStopResponse.parse(stop));
});

// PATCH /visit-stops/:stopId
router.patch("/visit-stops/:stopId", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateVisitStopParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = UpdateVisitStopBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  // Verify ownership
  const [stop] = await db.select().from(visitStopsTable).where(eq(visitStopsTable.id, params.data.stopId));
  if (!stop) { res.status(404).json({ error: "Stop not found" }); return; }

  const [owner] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, stop.userId), eq(usersTable.customerId, customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  const updated = await updateReturning(
    visitStopsTable,
    body.data,
    eq(visitStopsTable.id, params.data.stopId),
  );

  res.json(UpdateVisitStopResponse.parse(updated));
});

// DELETE /visit-stops/:stopId
router.delete("/visit-stops/:stopId", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteVisitStopParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [stop] = await db.select().from(visitStopsTable).where(eq(visitStopsTable.id, params.data.stopId));
  if (!stop) { res.status(404).json({ error: "Stop not found" }); return; }

  const [owner] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, stop.userId), eq(usersTable.customerId, customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(visitStopsTable).where(eq(visitStopsTable.id, params.data.stopId));
  res.sendStatus(204);
});

// POST /day-plans/:dayPlanId/plan-route
router.post("/day-plans/:dayPlanId/plan-route", requireAuth, async (req, res): Promise<void> => {
  const params = PlanRouteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [plan] = await db.select().from(dayPlansTable).where(eq(dayPlansTable.id, params.data.dayPlanId));
  if (!plan) { res.status(404).json({ error: "Day plan not found" }); return; }

  const [owner] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, plan.userId), eq(usersTable.customerId, customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  const stops = await db.select().from(visitStopsTable)
    .where(eq(visitStopsTable.dayPlanId, plan.id));

  if (stops.length === 0) {
    const detail = await getDayPlanDetail(plan.id);
    res.json(PlanRouteResponse.parse(detail));
    return;
  }

  // Get user's base address for starting point
  const [baseAddr] = await db.select().from(addressesTable)
    .where(eq(addressesTable.userId, plan.userId))
    .limit(1);

  let currentLat = baseAddr?.latitude ?? 28.65;
  let currentLng = baseAddr?.longitude ?? 77.0;

  // Group by priority
  const groups: Record<string, typeof stops> = { P1: [], P2: [], P3: [] };
  for (const s of stops) groups[s.priority].push(s);

  const ordered: typeof stops = [];
  for (const priority of ["P1", "P2", "P3"] as const) {
    const group = [...groups[priority]];
    // Greedy nearest-neighbor
    while (group.length > 0) {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < group.length; i++) {
        const d = haversineMeters(currentLat, currentLng, group[i].latitude, group[i].longitude);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
      }
      const chosen = group.splice(nearestIdx, 1)[0];
      ordered.push(chosen);
      currentLat = chosen.latitude;
      currentLng = chosen.longitude;
    }
  }

  // Compute totals
  let totalDistanceMeters = 0;
  let prevLat = baseAddr?.latitude ?? 28.65;
  let prevLng = baseAddr?.longitude ?? 77.0;

  for (let i = 0; i < ordered.length; i++) {
    const d = haversineMeters(prevLat, prevLng, ordered[i].latitude, ordered[i].longitude);
    totalDistanceMeters += d;
    prevLat = ordered[i].latitude;
    prevLng = ordered[i].longitude;
    // Update sequence
    await db.update(visitStopsTable).set({ sequence: i + 1 }).where(eq(visitStopsTable.id, ordered[i].id));
  }

  const totalEtaSeconds = estimateTravelTime(totalDistanceMeters);

  await db.update(dayPlansTable).set({ totalDistanceMeters, totalEtaSeconds }).where(eq(dayPlansTable.id, plan.id));

  const detail = await getDayPlanDetail(plan.id);
  res.json(PlanRouteResponse.parse(detail));
});

// POST /day-plans/:dayPlanId/publish
router.post("/day-plans/:dayPlanId/publish", requireAuth, async (req, res): Promise<void> => {
  const params = PublishDayPlanParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [plan] = await db.select().from(dayPlansTable).where(eq(dayPlansTable.id, params.data.dayPlanId));
  if (!plan) { res.status(404).json({ error: "Day plan not found" }); return; }

  const [owner] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, plan.userId), eq(usersTable.customerId, customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(dayPlansTable).set({ status: "PUBLISHED", publishedAt: new Date() })
    .where(eq(dayPlansTable.id, plan.id));

  const detail = await getDayPlanDetail(plan.id);
  res.json(PublishDayPlanResponse.parse(detail));
});

// POST /visit-stops/:stopId/track-link
router.post("/visit-stops/:stopId/track-link", requireAuth, async (req, res): Promise<void> => {
  const params = CreateTrackLinkParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [stop] = await db.select().from(visitStopsTable).where(eq(visitStopsTable.id, params.data.stopId));
  if (!stop) { res.status(404).json({ error: "Stop not found" }); return; }

  const [owner] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, stop.userId), eq(usersTable.customerId, customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  // Check for existing non-revoked, non-expired link
  const now = new Date();
  const [existing] = await db.select().from(publicTrackLinksTable)
    .where(and(
      eq(publicTrackLinksTable.visitStopId, stop.id),
      isNull(publicTrackLinksTable.revokedAt),
    ));

  if (existing && existing.expiresAt > now) {
    res.json(CreateTrackLinkResponse.parse({
      token: existing.token,
      url: `/track/${existing.token}`,
      expiresAt: existing.expiresAt,
      revokedAt: existing.revokedAt,
    }));
    return;
  }

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const link = await insertReturning(publicTrackLinksTable, {
    visitStopId: stop.id,
    token,
    expiresAt,
  });

  res.status(201).json(CreateTrackLinkResponse.parse({
    token: link.token,
    url: `/track/${link.token}`,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
  }));
});

// POST /visit-stops/:stopId/track-link/revoke
router.post("/visit-stops/:stopId/track-link/revoke", requireAuth, async (req, res): Promise<void> => {
  const params = RevokeTrackLinkParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [stop] = await db.select().from(visitStopsTable).where(eq(visitStopsTable.id, params.data.stopId));
  if (!stop) { res.status(404).json({ error: "Stop not found" }); return; }

  const [owner] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, stop.userId), eq(usersTable.customerId, customerId)));
  if (!owner) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(publicTrackLinksTable)
    .set({ revokedAt: new Date() })
    .where(and(eq(publicTrackLinksTable.visitStopId, stop.id), isNull(publicTrackLinksTable.revokedAt)));

  res.sendStatus(204);
});

export default router;
