import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, addressesTable, vendorAccountsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { ingestPings } from "./ingest.js";
import { randomDelhiNcrCoord } from "./geo.js";
import { mockBoltConnector } from "./gps/mockBoltConnector.js";
import { processDevicePings } from "./devicePoller.js";

const TICK_MS = 5000;
const MAX_SPEED_KPH = 40;
const MAX_SPEED_MPS = MAX_SPEED_KPH / 3.6;
const DELTA_PER_TICK = (MAX_SPEED_MPS * TICK_MS) / 1000 / 111_000;

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
  // ── Mobile agents ──────────────────────────────────────────────────────────
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "USER"));

  const activeUsers = users.filter(u => u.status === "ACTIVE");

  const mobilePings = await Promise.all(
    activeUsers.map(async (u) => {
      if (!positions.has(u.id)) {
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
      const delta = DELTA_PER_TICK;
      const dLat = (Math.random() - 0.5) * 2 * delta;
      const dLng = (Math.random() - 0.5) * 2 * delta;
      const newLat = pos.lat + dLat;
      const newLng = pos.lng + dLng;
      positions.set(u.id, { lat: newLat, lng: newLng });

      return {
        userId: u.id,
        latitude: newLat,
        longitude: newLng,
        speedKph: Math.random() * MAX_SPEED_KPH,
        recordedAt: new Date(),
      };
    })
  );

  if (mobilePings.length > 0) {
    await ingestPings(mobilePings);
  }

  // ── Mock GPS devices (MOCK_BOLT) ───────────────────────────────────────────
  try {
    // Find a MOCK_BOLT vendor account to get the customerId
    const [mockAccount] = await db
      .select()
      .from(vendorAccountsTable)
      .where(eq(vendorAccountsTable.vendorKey, "MOCK_BOLT"))
      .limit(1);

    if (mockAccount) {
      const pings = await mockBoltConnector.fetchAll({
        username: "mock",
        password: "mock",
      });
      await processDevicePings(mockAccount, pings);
    }
  } catch (err) {
    logger.warn({ err }, "Mock device tick error (non-fatal)");
  }
}
