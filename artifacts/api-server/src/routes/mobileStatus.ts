import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, updateReturning } from "@workspace/db";
import {
  usersTable,
  visitStopsTable,
  statusEventsTable,
  emergencyAlertsTable,
} from "@workspace/db";
import {
  PostUserStatusBody,
  PostUserStatusResponse,
  PostUserEmergencyBody,
  PostUserEmergencyResponse,
  CloseVisitStopParams,
  CloseVisitStopBody,
  CloseVisitStopResponse,
  RegisterPushTokenBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// POST /user/status
router.post("/user/status", async (req, res): Promise<void> => {
  const parsed = PostUserStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { userId, status, visitStopId, lat, lng, at } = parsed.data;
  const atDate = at instanceof Date ? at : new Date(at);

  if (status === "BUSY") {
    // Set user liveStatus = BUSY, liveStatusSince = at, currentVisitStopId = visitStopId
    await db.update(usersTable).set({
      liveStatus: "BUSY",
      liveStatusSince: atDate,
      currentVisitStopId: visitStopId ?? null,
    }).where(eq(usersTable.id, userId));

    // Insert BUSY status event
    await db.insert(statusEventsTable).values({
      userId,
      visitStopId: visitStopId ?? null,
      status: "BUSY",
      lat,
      lng,
      at: atDate,
      durationSeconds: null,
    });

    // Set visitStop startedAt if not already set
    if (visitStopId) {
      await db.update(visitStopsTable)
        .set({ startedAt: atDate })
        .where(and(eq(visitStopsTable.id, visitStopId), isNull(visitStopsTable.startedAt)));
    }
  } else {
    // IDLE: find open BUSY status event (most recent with null durationSeconds)
    const [openBusy] = await db.select().from(statusEventsTable)
      .where(and(
        eq(statusEventsTable.userId, userId),
        eq(statusEventsTable.status, "BUSY"),
        isNull(statusEventsTable.durationSeconds),
      ))
      .orderBy(desc(statusEventsTable.at))
      .limit(1);

    if (openBusy) {
      const durationSeconds = Math.round((atDate.getTime() - openBusy.at.getTime()) / 1000);
      await db.update(statusEventsTable)
        .set({ durationSeconds })
        .where(eq(statusEventsTable.id, openBusy.id));
    }

    // Set user liveStatus = ON_SHIFT_IDLE, clear currentVisitStopId
    await db.update(usersTable).set({
      liveStatus: "ON_SHIFT_IDLE",
      liveStatusSince: atDate,
      currentVisitStopId: null,
    }).where(eq(usersTable.id, userId));

    // Insert IDLE status event
    await db.insert(statusEventsTable).values({
      userId,
      visitStopId: visitStopId ?? null,
      status: "IDLE",
      lat,
      lng,
      at: atDate,
      durationSeconds: null,
    });
  }

  res.json(PostUserStatusResponse.parse({ userId, status }));
});

// POST /user/emergency
router.post("/user/emergency", async (req, res): Promise<void> => {
  const parsed = PostUserEmergencyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { userId, active, lat, lng } = parsed.data;

  if (active) {
    await db.update(usersTable).set({ emergencyActive: true }).where(eq(usersTable.id, userId));
    await db.insert(emergencyAlertsTable).values({
      userId,
      triggeredByAdminId: null,
      direction: "USER_TO_ADMIN",
      lat,
      lng,
      acknowledgedAt: null,
    });
  } else {
    await db.update(usersTable).set({ emergencyActive: false }).where(eq(usersTable.id, userId));
    // Acknowledge all outstanding USER_TO_ADMIN alerts for this user, not just the latest,
    // so alert feeds/counts never desync from the cleared emergencyActive flag.
    await db.update(emergencyAlertsTable)
      .set({ acknowledgedAt: new Date() })
      .where(and(
        eq(emergencyAlertsTable.userId, userId),
        eq(emergencyAlertsTable.direction, "USER_TO_ADMIN"),
        isNull(emergencyAlertsTable.acknowledgedAt),
      ));
  }

  res.json(PostUserEmergencyResponse.parse({ userId, emergencyActive: active }));
});

// POST /user/visit/:visitStopId/disposition
router.post("/user/visit/:visitStopId/disposition", async (req, res): Promise<void> => {
  const params = CloseVisitStopParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const parsed = CloseVisitStopBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { dispositionId, notes, reachedAt, startedAt, closedAt } = parsed.data;

  if (notes && notes.length > 250) {
    res.status(400).json({ error: "Notes must be 250 characters or less" });
    return;
  }

  const toDate = (v: Date | string | null | undefined) =>
    v == null ? null : v instanceof Date ? v : new Date(v);

  const stop = await updateReturning(
    visitStopsTable,
    {
      status: "COMPLETED",
      dispositionId,
      notes: notes ?? null,
      reachedAt: toDate(reachedAt),
      startedAt: toDate(startedAt),
      closedAt: toDate(closedAt),
    },
    eq(visitStopsTable.id, params.data.visitStopId),
  );

  if (!stop) { res.status(404).json({ error: "Visit stop not found" }); return; }

  res.json(CloseVisitStopResponse.parse(stop));
});

// POST /user/push-token -- stub, logs only
router.post("/user/push-token", async (req, res): Promise<void> => {
  const parsed = RegisterPushTokenBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  req.log.info({ userId: parsed.data.userId, platform: parsed.data.platform }, "Push token registration (stub — not stored)");
  res.sendStatus(204);
});

export default router;
