import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  locationPingsTable,
  dwellSegmentsTable,
} from "@workspace/db";
import {
  ListUserSessionsQueryParams,
  ListUserSessionsResponse,
  GetUserBreadcrumbQueryParams,
  GetUserBreadcrumbResponse,
  GetUserPlacesCalendarParams,
  GetUserPlacesCalendarResponse,
  GetUserDwellSegmentsQueryParams,
  GetUserDwellSegmentsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function getAdminCustomerId(adminUserId: number): Promise<number | null> {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminUserId));
  return u?.customerId ?? null;
}

// GET /sessions?userId=&from=&to=
router.get("/sessions", requireAuth, async (req, res): Promise<void> => {
  const q = ListUserSessionsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  // Verify user belongs to admin's customer
  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, q.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const conditions = [eq(sessionsTable.userId, q.data.userId)];
  if (q.data.from) conditions.push(gte(sessionsTable.loginAt, q.data.from));
  if (q.data.to) conditions.push(lte(sessionsTable.loginAt, q.data.to));

  const sessions = await db.select().from(sessionsTable)
    .where(and(...conditions))
    .orderBy(desc(sessionsTable.loginAt));

  res.json(ListUserSessionsResponse.parse(sessions));
});

// GET /breadcrumb?userId=&date=
router.get("/breadcrumb", requireAuth, async (req, res): Promise<void> => {
  const q = GetUserBreadcrumbQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, q.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const dateStr = q.data.date instanceof Date ? q.data.date.toISOString().slice(0, 10) : q.data.date;

  const pings = await db.execute(
    sql`SELECT * FROM location_pings
        WHERE user_id = ${q.data.userId}
        AND DATE(recorded_at AT TIME ZONE 'UTC') = ${dateStr}::date
        ORDER BY recorded_at ASC`
  );

  res.json(GetUserBreadcrumbResponse.parse(pings.rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    latitude: r.latitude,
    longitude: r.longitude,
    speedKph: r.speed_kph,
    accuracyM: r.accuracy_m,
    batteryLevel: r.battery_level,
    recordedAt: r.recorded_at,
  }))));
});

// GET /users/:id/places-calendar
router.get("/users/:id/places-calendar", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserPlacesCalendarParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, params.data.id), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(
    sql`SELECT DATE(entered_at AT TIME ZONE 'UTC') as day,
               place_label,
               SUM(duration_seconds) as total_dwell
        FROM dwell_segments
        WHERE user_id = ${params.data.id}
          AND place_label IS NOT NULL
          AND entered_at >= ${thirtyDaysAgo}
        GROUP BY day, place_label
        ORDER BY day DESC`
  );

  // Group by day
  const byDay = new Map<string, { label: string; totalDwellSeconds: number }[]>();
  for (const r of rows.rows as any[]) {
    const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({ label: r.place_label, totalDwellSeconds: Number(r.total_dwell) });
  }

  const result = Array.from(byDay.entries()).map(([date, places]) => ({ date: new Date(date + "T00:00:00Z"), places }));
  res.json(GetUserPlacesCalendarResponse.parse(result));
});

// GET /dwell-segments?userId=&date=
router.get("/dwell-segments", requireAuth, async (req, res): Promise<void> => {
  const q = GetUserDwellSegmentsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, q.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const dateStr = q.data.date instanceof Date ? q.data.date.toISOString().slice(0, 10) : q.data.date;

  const segs = await db.execute(
    sql`SELECT * FROM dwell_segments
        WHERE user_id = ${q.data.userId}
        AND DATE(entered_at AT TIME ZONE 'UTC') = ${dateStr}::date
        ORDER BY entered_at ASC`
  );

  res.json(GetUserDwellSegmentsResponse.parse(segs.rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    latitude: r.latitude,
    longitude: r.longitude,
    placeLabel: r.place_label,
    enteredAt: r.entered_at,
    exitedAt: r.exited_at,
    durationSeconds: r.duration_seconds,
  }))));
});

export default router;
