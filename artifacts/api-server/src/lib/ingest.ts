/**
 * Shared ingest logic used by both /ingest/location route and the simulator.
 * Centralised here so no logic is duplicated.
 */
import { db } from "@workspace/db";
import {
  locationPingsTable,
  dwellSegmentsTable,
} from "@workspace/db";
import { eq, desc, and, isNull } from "drizzle-orm";
import { haversineMeters } from "./geo.js";
import { logger } from "./logger.js";

export interface PingInput {
  userId: number;
  latitude: number;
  longitude: number;
  speedKph?: number;
  accuracyM?: number;
  batteryLevel?: number;
  recordedAt: Date;
}

/** Insert pings and run simple dwell-detection. Returns inserted rows. */
export async function ingestPings(pings: PingInput[]) {
  if (pings.length === 0) return [];

  const inserted = await db
    .insert(locationPingsTable)
    .values(
      pings.map((p) => ({
        userId: p.userId,
        latitude: p.latitude,
        longitude: p.longitude,
        speedKph: p.speedKph ?? null,
        accuracyM: p.accuracyM ?? null,
        batteryLevel: p.batteryLevel ?? null,
        recordedAt: p.recordedAt,
      })),
    )
    .returning();

  // Dwell detection: group by userId and check per-user
  const byUser = new Map<number, PingInput[]>();
  for (const p of pings) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId)!.push(p);
  }

  for (const [userId, userPings] of byUser) {
    try {
      await detectDwell(userId, userPings);
    } catch (err) {
      logger.warn({ err, userId }, "Dwell detection error (non-fatal)");
    }
  }

  return inserted;
}

const DWELL_RADIUS_M = 50;
const DWELL_MIN_SECONDS = 5 * 60;

async function detectDwell(userId: number, newPings: PingInput[]) {
  // Get the second-to-last known ping (before these new ones)
  const [prevPing] = await db
    .select()
    .from(locationPingsTable)
    .where(eq(locationPingsTable.userId, userId))
    .orderBy(desc(locationPingsTable.recordedAt))
    .limit(2)
    .offset(1);

  if (!prevPing) return;

  const latestNew = newPings[newPings.length - 1];
  const dist = haversineMeters(
    prevPing.latitude,
    prevPing.longitude,
    latestNew.latitude,
    latestNew.longitude,
  );

  const timeDiffSeconds =
    (latestNew.recordedAt.getTime() - prevPing.recordedAt.getTime()) / 1000;

  if (dist <= DWELL_RADIUS_M && timeDiffSeconds >= DWELL_MIN_SECONDS) {
    // Check if there's already an open dwell segment
    const [openSegment] = await db
      .select()
      .from(dwellSegmentsTable)
      .where(
        and(
          eq(dwellSegmentsTable.userId, userId),
          isNull(dwellSegmentsTable.exitedAt),
        ),
      )
      .limit(1);

    if (!openSegment) {
      await db.insert(dwellSegmentsTable).values({
        userId,
        latitude: latestNew.latitude,
        longitude: latestNew.longitude,
        placeLabel: null,
        enteredAt: prevPing.recordedAt,
        exitedAt: null,
        durationSeconds: Math.round(timeDiffSeconds),
      });
    }
    // else: already open, leave it as-is
  }
}
