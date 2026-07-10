import { Router, type IRouter } from "express";
import { eq, and, desc, gte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  locationPingsTable,
  markedPlacesTable,
  dwellSegmentsTable,
  visitStopsTable,
  dayPlansTable,
} from "@workspace/db";
import {
  GetLiveSummaryResponse,
  GetLivePositionsResponse,
  GetUserSpeedHistoryParams,
  GetUserSpeedHistoryResponse,
  GetUserProximityParams,
  GetUserProximityResponse,
  GetUserCurrentStopParams,
  GetUserCurrentStopResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { haversineMeters, estimateTravelTime } from "../lib/geo.js";
import { isNull } from "drizzle-orm";
import { count } from "drizzle-orm";
import { emergencyAlertsTable } from "@workspace/db";

const router: IRouter = Router();

function deriveStatus(
  ping: { speedKph: number | null; recordedAt: Date },
  user: { liveStatus: "OFFLINE" | "ON_SHIFT_IDLE" | "BUSY" },
): "MOVING" | "STATIONARY" | "OFFLINE" | "ON_SHIFT_IDLE" | "BUSY" {
  const ageMs = Date.now() - ping.recordedAt.getTime();
  const within2min = ageMs <= 2 * 60 * 1000;
  if (!within2min) return "OFFLINE";
  if ((ping.speedKph ?? 0) > 3) return "MOVING";
  // Fall back to stored liveStatus for BUSY/IDLE, otherwise STATIONARY
  if (user.liveStatus === "BUSY") return "BUSY";
  if (user.liveStatus === "ON_SHIFT_IDLE") return "ON_SHIFT_IDLE";
  return "STATIONARY";
}

async function getAdminCustomerId(adminUserId: number): Promise<number | null> {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminUserId));
  return u?.customerId ?? null;
}

// GET /live/summary
router.get("/live/summary", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const users = await db.select({ id: usersTable.id, liveStatus: usersTable.liveStatus }).from(usersTable)
    .where(and(eq(usersTable.customerId, customerId), eq(usersTable.status, "ACTIVE")));

  let movingCount = 0, stationaryCount = 0, offlineCount = 0;

  for (const u of users) {
    const [ping] = await db.select().from(locationPingsTable)
      .where(eq(locationPingsTable.userId, u.id))
      .orderBy(desc(locationPingsTable.recordedAt)).limit(1);
    if (!ping) { offlineCount++; continue; }
    const st = deriveStatus(ping, u);
    if (st === "MOVING") movingCount++;
    else if (st === "STATIONARY" || st === "ON_SHIFT_IDLE" || st === "BUSY") stationaryCount++;
    else offlineCount++;
  }

  // Alert count: count emergency alerts not acknowledged
  const [alerts] = await db
    .select({ cnt: count() })
    .from(emergencyAlertsTable)
    .innerJoin(usersTable, eq(usersTable.id, emergencyAlertsTable.userId))
    .where(and(eq(usersTable.customerId, customerId), isNull(emergencyAlertsTable.acknowledgedAt)));
  const alertCount = alerts?.cnt ?? 0;

  res.json(GetLiveSummaryResponse.parse({
    activeCount: movingCount + stationaryCount,
    movingCount,
    stationaryCount,
    offlineCount,
    alertCount,
  }));
});

// GET /live/positions
router.get("/live/positions", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const users = await db.select().from(usersTable)
    .where(and(eq(usersTable.customerId, customerId), eq(usersTable.role, "USER")));

  const positions = [];
  for (const u of users) {
    if (u.status === "SUSPENDED") continue;
    const [ping] = await db.select().from(locationPingsTable)
      .where(eq(locationPingsTable.userId, u.id))
      .orderBy(desc(locationPingsTable.recordedAt)).limit(1);
    if (!ping) continue;
    positions.push({
      userId: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      employeeCode: u.employeeCode,
      latitude: ping.latitude,
      longitude: ping.longitude,
      status: deriveStatus(ping, u),
      liveStatus: u.liveStatus,
      liveStatusSince: u.liveStatusSince ?? null,
      emergencyActive: u.emergencyActive,
      currentVisitStopId: u.currentVisitStopId ?? null,
      speedKph: ping.speedKph ?? null,
      recordedAt: ping.recordedAt,
    });
  }

  res.json(GetLivePositionsResponse.parse(positions));
});

// GET /users/:id/speed-history
router.get("/users/:id/speed-history", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserSpeedHistoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const pings = await db.select().from(locationPingsTable)
    .where(and(eq(locationPingsTable.userId, user.id), gte(locationPingsTable.recordedAt, oneHourAgo)))
    .orderBy(locationPingsTable.recordedAt);

  res.json(GetUserSpeedHistoryResponse.parse(
    pings.map(p => ({ recordedAt: p.recordedAt, speedKph: p.speedKph ?? 0 }))
  ));
});

// GET /users/:id/proximity
router.get("/users/:id/proximity", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserProximityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [latestPing] = await db.select().from(locationPingsTable)
    .where(eq(locationPingsTable.userId, user.id))
    .orderBy(desc(locationPingsTable.recordedAt)).limit(1);

  const places = await db.select().from(markedPlacesTable)
    .where(eq(markedPlacesTable.userId, user.id));

  const result = places.map(p => {
    const dist = latestPing
      ? haversineMeters(latestPing.latitude, latestPing.longitude, p.latitude, p.longitude)
      : 999999;
    return {
      placeId: p.id,
      label: p.label,
      distanceMeters: dist,
      durationSeconds: estimateTravelTime(dist),
      isCurrentlyHere: dist < 100,
    };
  }).sort((a, b) => a.distanceMeters - b.distanceMeters);

  res.json(GetUserProximityResponse.parse(result));
});

// GET /users/:id/current-stop
router.get("/users/:id/current-stop", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserCurrentStopParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const today = new Date().toISOString().slice(0, 10);

  // Find today's published plan
  const [plan] = await db.select().from(dayPlansTable)
    .where(and(eq(dayPlansTable.userId, user.id), eq(dayPlansTable.visitDate, today), eq(dayPlansTable.status, "PUBLISHED")));

  if (!plan) { res.status(404).json({ error: "No published day plan for today" }); return; }

  // Find nearest PENDING or EN_ROUTE stop
  const stops = await db.select().from(visitStopsTable)
    .where(and(eq(visitStopsTable.dayPlanId, plan.id)));

  const pending = stops
    .filter(s => s.status === "PENDING" || s.status === "EN_ROUTE")
    .sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999));

  if (pending.length === 0) { res.status(404).json({ error: "No pending stops" }); return; }

  const stop = pending[0];

  const [latestPing] = await db.select().from(locationPingsTable)
    .where(eq(locationPingsTable.userId, user.id))
    .orderBy(desc(locationPingsTable.recordedAt)).limit(1);

  const dist = latestPing
    ? haversineMeters(latestPing.latitude, latestPing.longitude, stop.latitude, stop.longitude)
    : 0;

  const [openDwell] = await db.select().from(dwellSegmentsTable)
    .where(and(eq(dwellSegmentsTable.userId, user.id), isNull(dwellSegmentsTable.exitedAt)))
    .orderBy(desc(dwellSegmentsTable.enteredAt)).limit(1);

  res.json(GetUserCurrentStopResponse.parse({
    stopId: stop.id,
    customerCode: stop.customerCode,
    label: stop.label ?? null,
    latitude: stop.latitude,
    longitude: stop.longitude,
    status: stop.status,
    distanceMeters: dist,
    etaSeconds: estimateTravelTime(dist),
    dwellSeconds: openDwell ? openDwell.durationSeconds : null,
    dwellPlaceLabel: openDwell ? openDwell.placeLabel : null,
  }));
});

export default router;
