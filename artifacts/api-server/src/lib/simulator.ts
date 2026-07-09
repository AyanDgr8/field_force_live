import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, addressesTable } from "@workspace/db";
import { logger } from "./logger.js";
import { ingestPings } from "./ingest.js";
import { randomDelhiNcrCoord } from "./geo.js";

const TICK_MS = 5000;
const MAX_SPEED_KPH = 40;
const MAX_SPEED_MPS = MAX_SPEED_KPH / 3.6;
const DELTA_PER_TICK = (MAX_SPEED_MPS * TICK_MS) / 1000 / 111_000; // degrees per tick

// In-memory state
const positions = new Map<number, { lat: number; lng: number }>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function isRunning(): boolean {
  return intervalId !== null;
}

export async function startSimulator(): Promise<void> {
  if (intervalId !== null) return;
  logger.info("Simulator starting");

  intervalId = setInterval(async () => {
    try {
      await tick();
    } catch (err) {
      logger.error({ err }, "Simulator tick error");
    }
  }, TICK_MS);
}

export function stopSimulator(): void {
  if (intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
  logger.info("Simulator stopped");
}

async function tick(): Promise<void> {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "USER"));

  const activeUsers = users.filter(u => u.status === "ACTIVE");

  const pings = await Promise.all(
    activeUsers.map(async (u) => {
      if (!positions.has(u.id)) {
        // Seed from first address or random
        const [addr] = await db
          .select()
          .from(addressesTable)
          .where(eq(addressesTable.userId, u.id))
          .limit(1);
        const lat = addr?.latitude ?? randomDelhiNcrCoord().lat;
        const lng = addr?.longitude ?? randomDelhiNcrCoord().lng;
        positions.set(u.id, { lat, lng });
      }

      const pos = positions.get(u.id)!;
      // Small random delta bounded to realistic speed
      const delta = DELTA_PER_TICK;
      const dLat = (Math.random() - 0.5) * 2 * delta;
      const dLng = (Math.random() - 0.5) * 2 * delta;
      const newLat = pos.lat + dLat;
      const newLng = pos.lng + dLng;
      positions.set(u.id, { lat: newLat, lng: newLng });

      const speedKph = Math.random() * MAX_SPEED_KPH;

      return {
        userId: u.id,
        latitude: newLat,
        longitude: newLng,
        speedKph,
        recordedAt: new Date(),
      };
    })
  );

  if (pings.length > 0) {
    await ingestPings(pings);
  }
}
