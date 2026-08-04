import { Router, type IRouter } from "express";
import { eq, and, gte, lte, lt, asc, desc, isNotNull, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  locationPingsTable,
  dwellSegmentsTable,
  deliveryRecordsTable,
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

function normalizeDateQuery(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Date-only query parameters must be parsed explicitly. z.date() accepts
  // Date instances, while Express always supplies query values as strings.
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeEmployeeId(value: unknown) {
  const raw = String(value ?? "").trim().replace(/\.0+$/, "");
  if (!raw) return "";
  if (/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && Number.isSafeInteger(numeric)) return numeric.toFixed(0);
  }
  return raw;
}

function sheetDate(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const value = String((rawData as Record<string, unknown>).SheetCreateDateTime ?? "").trim();
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

async function sheetAttendance(customerId: number, from?: string, to?: string) {
  const users = await db.select().from(usersTable).where(and(
    eq(usersTable.customerId, customerId), eq(usersTable.role, "USER"), isNull(usersTable.deletedAt),
  ));
  const deliveries = await db.select({
    fhrId: deliveryRecordsTable.fhrId,
    agentName: deliveryRecordsTable.agentName,
    rawData: deliveryRecordsTable.rawData,
  }).from(deliveryRecordsTable).where(eq(deliveryRecordsTable.customerId, customerId));
  const datedRows = deliveries.map(row => ({ ...row, date: sheetDate(row.rawData) }))
    .filter((row): row is typeof row & { date: string } => Boolean(row.date))
    .filter(row => (!from || row.date >= from) && (!to || row.date <= to));
  const dates = [...new Set(datedRows.map(row => row.date))].sort();

  return dates.flatMap(date => users.map(user => {
    const ids = new Set([normalizeEmployeeId(user.employeeCode), normalizeEmployeeId(user.flipkartId)].filter(Boolean));
    const match = datedRows.find(row =>
      row.date === date && Boolean(row.agentName?.trim()) && ids.has(normalizeEmployeeId(row.fhrId))
    );
    return {
      date, userId: user.id, employeeId: user.flipkartId || user.employeeCode,
      bikerName: `${user.firstName} ${user.lastName}`.trim(),
      status: match ? "PRESENT" as const : "ABSENT" as const,
      sheetAgentName: match?.agentName ?? null,
    };
  }));
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
  if (q.data.to) {
    const toExclusive = new Date(q.data.to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    conditions.push(lt(sessionsTable.loginAt, toExclusive));
  }

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

// GET /attendance/sheet?from=&to= -- daily presence from uploaded BigQuery sheets
router.get("/attendance/sheet", requireAuth, async (req, res): Promise<void> => {
  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
    res.status(400).json({ error: "Dates must use YYYY-MM-DD" }); return;
  }
  res.json(await sheetAttendance(customerId, from, to));
});

// GET /attendance?userId=&from=&to= (legacy app-session report)
router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const q = GetUserAttendanceReportQueryParams.safeParse({
    ...req.query,
    from: normalizeDateQuery(req.query.from),
    to: normalizeDateQuery(req.query.to),
  });
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const customerId = await getAdminCustomerId(req.adminUserId!);
  if (!customerId) { res.status(401).json({ error: "Admin not found" }); return; }

  const [user] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, q.data.userId), eq(usersTable.customerId, customerId)));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const conditions = [eq(sessionsTable.userId, q.data.userId)];
  if (q.data.from) conditions.push(gte(sessionsTable.loginAt, q.data.from));
  if (q.data.to) {
    const toExclusive = new Date(q.data.to);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    conditions.push(lt(sessionsTable.loginAt, toExclusive));
  }

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

  const attendance = await sheetAttendance(customerId, fromParam, toParam);
  const csv = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows: string[] = ["date,employeeId,bikerName,status,sheetAgentName"];
  for (const record of attendance) rows.push([
    record.date, record.employeeId, record.bikerName, record.status, record.sheetAgentName ?? "",
  ].map(csv).join(","));

  res.type("text/csv");
  res.attachment(`attendance-export-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(rows.join("\n"));
});

export default router;
