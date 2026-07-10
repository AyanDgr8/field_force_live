import { Router, type IRouter } from "express";
import { eq, and, gte, lte, lt, asc, desc, isNotNull } from "drizzle-orm";
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
  GetUserAttendanceReportQueryParams,
  GetUserAttendanceReportResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth.js";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

async function getAdminCustomerId(adminUserId: number): Promise<number | null> {
  const [u] = await db.select({ customerId: usersTable.customerId }).from(usersTable).where(eq(usersTable.id, adminUserId));
  return u?.customerId ?? null;
}

/** Half-open [start, end) bounds of the UTC calendar day `dateStr` ("YYYY-MM-DD"). */
function utcDayRange(dateStr: string): { start: Date; end: Date } {
  const start = new Date(`${dateStr}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
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
  const { start, end } = utcDayRange(dateStr);

  const pings = await db.select().from(locationPingsTable)
    .where(and(
      eq(locationPingsTable.userId, q.data.userId),
      gte(locationPingsTable.recordedAt, start),
      lt(locationPingsTable.recordedAt, end),
    ))
    .orderBy(asc(locationPingsTable.recordedAt));

  res.json(GetUserBreadcrumbResponse.parse(pings));
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

  // The session time zone is pinned to UTC (see lib/db client), so DATE() on a
  // datetime column yields the UTC calendar day.
  const day = sql<string>`DATE(${dwellSegmentsTable.enteredAt})`;

  const rows = await db.select({
    day,
    placeLabel: dwellSegmentsTable.placeLabel,
    // SUM() over an INT column comes back as DECIMAL, which mysql2 hands over as a string.
    totalDwell: sql<string>`SUM(${dwellSegmentsTable.durationSeconds})`,
  })
    .from(dwellSegmentsTable)
    .where(and(
      eq(dwellSegmentsTable.userId, params.data.id),
      isNotNull(dwellSegmentsTable.placeLabel),
      gte(dwellSegmentsTable.enteredAt, thirtyDaysAgo),
    ))
    .groupBy(day, dwellSegmentsTable.placeLabel)
    .orderBy(desc(day));

  // Group by day
  const byDay = new Map<string, { label: string; totalDwellSeconds: number }[]>();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day)!.push({ label: r.placeLabel!, totalDwellSeconds: Number(r.totalDwell) });
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
  const { start, end } = utcDayRange(dateStr);

  const segs = await db.select().from(dwellSegmentsTable)
    .where(and(
      eq(dwellSegmentsTable.userId, q.data.userId),
      gte(dwellSegmentsTable.enteredAt, start),
      lt(dwellSegmentsTable.enteredAt, end),
    ))
    .orderBy(asc(dwellSegmentsTable.enteredAt));

  res.json(GetUserDwellSegmentsResponse.parse(segs));
});

// GET /attendance?userId=&from=&to=
router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const q = GetUserAttendanceReportQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, q.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const conditions = [eq(sessionsTable.userId, q.data.userId)];
  if (q.data.from) conditions.push(gte(sessionsTable.loginAt, q.data.from));
  if (q.data.to) conditions.push(lte(sessionsTable.loginAt, q.data.to));

  const sessions = await db.select().from(sessionsTable)
    .where(and(...conditions))
    .orderBy(sessionsTable.loginAt);

  const records = sessions.map(s => {
    const totalHours = s.logoutAt
      ? Math.round((s.logoutAt.getTime() - s.loginAt.getTime()) / 36000) / 100
      : null;
    return {
      date: s.loginAt.toISOString().slice(0, 10),
      loginAt: s.loginAt,
      loginLat: s.loginLat,
      loginLng: s.loginLng,
      logoutAt: s.logoutAt ?? null,
      logoutLat: s.logoutLat ?? null,
      logoutLng: s.logoutLng ?? null,
      totalHours,
    };
  });

  res.json(GetUserAttendanceReportResponse.parse(records));
});

// GET /attendance/export -- plain Express route, returns CSV
router.get("/attendance/export", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const fromParam = req.query.from as string | undefined;
  const toParam = req.query.to as string | undefined;

  const users = await db.select().from(usersTable)
    .where(and(eq(usersTable.customerId, customerId), eq(usersTable.role, "USER")));

  const rows: string[] = ["employeeCode,firstName,lastName,date,loginAt,logoutAt,totalHours"];

  for (const u of users) {
    const conditions = [eq(sessionsTable.userId, u.id)];
    if (fromParam) conditions.push(gte(sessionsTable.loginAt, new Date(fromParam)));
    if (toParam) conditions.push(lte(sessionsTable.loginAt, new Date(toParam)));

    const sessions = await db.select().from(sessionsTable)
      .where(and(...conditions))
      .orderBy(sessionsTable.loginAt);

    for (const s of sessions) {
      const totalHours = s.logoutAt
        ? Math.round((s.logoutAt.getTime() - s.loginAt.getTime()) / 36000) / 100
        : "";
      const date = s.loginAt.toISOString().slice(0, 10);
      rows.push([
        u.employeeCode,
        u.firstName,
        u.lastName,
        date,
        s.loginAt.toISOString(),
        s.logoutAt ? s.logoutAt.toISOString() : "",
        String(totalHours),
      ].join(","));
    }
  }

  res.type("text/csv");
  res.attachment(`attendance-export-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(rows.join("\n"));
});

export default router;
