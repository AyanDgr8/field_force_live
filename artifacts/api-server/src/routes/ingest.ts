import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { sessionsTable, dayPlansTable, visitStopsTable } from "@workspace/db";
import {
  IngestLocationBody,
  IngestLocationResponse,
  IngestSessionBody,
  IngestSessionResponse,
  GetMobileDayPlanQueryParams,
  GetMobileDayPlanResponse,
} from "@workspace/api-zod";
import { ingestPings } from "../lib/ingest.js";

const router: IRouter = Router();

// POST /ingest/location -- no auth required (mobile devices)
router.post("/ingest/location", async (req, res): Promise<void> => {
  const parsed = IngestLocationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const inserted = await ingestPings(
    parsed.data.pings.map(p => ({
      userId: p.userId,
      latitude: p.latitude,
      longitude: p.longitude,
      speedKph: undefined,
      accuracyM: p.accuracyM,
      batteryLevel: p.batteryLevel,
      recordedAt: p.recordedAt,
    }))
  );

  res.status(201).json(IngestLocationResponse.parse(inserted));
});

// POST /ingest/session -- no auth required
router.post("/ingest/session", async (req, res): Promise<void> => {
  const parsed = IngestSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { userId, event, latitude, longitude, at } = parsed.data;

  if (event === "LOGIN") {
    const [session] = await db.insert(sessionsTable).values({
      userId,
      loginAt: at,
      loginLat: latitude,
      loginLng: longitude,
      logoutAt: null,
      logoutLat: null,
      logoutLng: null,
    }).returning();
    res.status(201).json(IngestSessionResponse.parse(session));
  } else {
    // LOGOUT: find most recent open session
    const [open] = await db.select().from(sessionsTable)
      .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.logoutAt)))
      .orderBy(desc(sessionsTable.loginAt))
      .limit(1);

    if (!open) { res.status(404).json({ error: "No open session found" }); return; }

    const [session] = await db.update(sessionsTable)
      .set({ logoutAt: at, logoutLat: latitude, logoutLng: longitude })
      .where(eq(sessionsTable.id, open.id))
      .returning();

    res.json(IngestSessionResponse.parse(session));
  }
});

// GET /user/dayplan?userId=&date= -- no auth required (mobile)
router.get("/user/dayplan", async (req, res): Promise<void> => {
  const q = GetMobileDayPlanQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }

  const dateStr = q.data.date instanceof Date ? q.data.date.toISOString().slice(0, 10) : String(q.data.date);

  const [plan] = await db.select().from(dayPlansTable)
    .where(and(
      eq(dayPlansTable.userId, q.data.userId),
      eq(dayPlansTable.visitDate, dateStr),
      eq(dayPlansTable.status, "PUBLISHED"),
    ));

  if (!plan) { res.status(404).json({ error: "No published day plan found" }); return; }

  const stops = await db.select().from(visitStopsTable)
    .where(eq(visitStopsTable.dayPlanId, plan.id));

  stops.sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999));

  res.json(GetMobileDayPlanResponse.parse({ ...plan, stops }));
});

export default router;
