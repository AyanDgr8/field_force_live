import { Router, type IRouter } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  publicTrackLinksTable,
  visitStopsTable,
  locationPingsTable,
  usersTable,
} from "@workspace/db";
import {
  GetPublicTrackParams,
  GetPublicTrackResponse,
} from "@workspace/api-zod";
import { haversineMeters, estimateTravelTime } from "../lib/geo.js";

const router: IRouter = Router();

// GET /public/track/:token -- no auth required
router.get("/public/track/:token", async (req, res): Promise<void> => {
  const params = GetPublicTrackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const now = new Date();

  const [link] = await db.select().from(publicTrackLinksTable)
    .where(eq(publicTrackLinksTable.token, params.data.token));

  if (!link) { res.status(404).json({ error: "Tracking link not found" }); return; }
  if (link.revokedAt && link.revokedAt <= now) { res.status(404).json({ error: "Tracking link has been revoked" }); return; }
  if (link.expiresAt <= now) { res.status(404).json({ error: "Tracking link has expired" }); return; }

  const [stop] = await db.select().from(visitStopsTable)
    .where(eq(visitStopsTable.id, link.visitStopId));
  if (!stop) { res.status(404).json({ error: "Visit stop not found" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, stop.userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [latestPing] = await db.select().from(locationPingsTable)
    .where(eq(locationPingsTable.userId, user.id))
    .orderBy(desc(locationPingsTable.recordedAt)).limit(1);

  const agentLat = latestPing?.latitude ?? stop.latitude;
  const agentLng = latestPing?.longitude ?? stop.longitude;
  const dist = haversineMeters(agentLat, agentLng, stop.latitude, stop.longitude);

  res.json(GetPublicTrackResponse.parse({
    agentFirstName: user.firstName,
    agentLat,
    agentLng,
    destLat: stop.latitude,
    destLng: stop.longitude,
    distanceMeters: dist,
    etaSeconds: estimateTravelTime(dist),
    status: stop.status,
    updatedAt: latestPing?.recordedAt ?? new Date(),
  }));
});

export default router;
