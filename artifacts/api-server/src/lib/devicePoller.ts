/**
 * Device Poller — background scheduler per VendorAccount.
 *
 * Responsibilities:
 *  - Poll fetchAll() on a configurable interval + jitter.
 *  - Dedup pings by (vendorKey, vendorPosId) — unique index in DB.
 *  - Auto-register TrackedDevice rows on first sight.
 *  - Update device state (lastFixAt, ignition, alarm, …).
 *  - Exponential backoff on failure; mark account DEGRADED after N failures.
 *
 * SECURITY: credentials never logged. All outbound vendor calls are here only.
 */
import { db, insertReturning } from "@workspace/db";
import {
  vendorAccountsTable,
  trackedDevicesTable,
  deviceCategoriesTable,
  locationPingsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { decrypt, isUsingDevFallbackKey } from "./crypto.js";
import { boltConnector } from "./gps/boltConnector.js";
import { mockBoltConnector } from "./gps/mockBoltConnector.js";
import type { GpsConnector, NormalizedPing } from "./gps/connector.js";
import { logger } from "./logger.js";

// ─── Connector registry — add new vendors here ────────────────────────────────
const CONNECTORS: Record<string, GpsConnector> = {
  BOLT: boltConnector,
  MOCK_BOLT: mockBoltConnector,
};

const MAX_CONSECUTIVE_FAILURES = 5;
const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 300_000;

const timers = new Map<number, ReturnType<typeof setTimeout>>();
let started = false;

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export async function startDevicePoller(): Promise<void> {
  if (started) return;
  started = true;

  if (isUsingDevFallbackKey()) {
    logger.warn(
      "CREDENTIALS_ENCRYPTION_KEY not set — using dev fallback key. " +
      "Set this secret before adding real vendor credentials."
    );
  }

  logger.info("Device poller starting");
  await scheduleAllAccounts();
}

export function stopDevicePoller(): void {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  started = false;
  logger.info("Device poller stopped");
}

// Called externally to schedule a specific account (e.g. after creation/edit).
export function scheduleAccountPoller(accountId: number, intervalMs: number): void {
  clearAccountTimer(accountId);
  const jitter = Math.random() * 10_000;
  const effective = Math.min(Math.max(intervalMs, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
  const t = setTimeout(() => runAndReschedule(accountId), effective + jitter);
  timers.set(accountId, t);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function scheduleAllAccounts(): Promise<void> {
  try {
    const accounts = await db
      .select({ id: vendorAccountsTable.id, pollIntervalSeconds: vendorAccountsTable.pollIntervalSeconds })
      .from(vendorAccountsTable)
      .where(eq(vendorAccountsTable.enabled, true));

    for (const a of accounts) {
      scheduleAccountPoller(a.id, a.pollIntervalSeconds * 1000);
    }
    logger.info({ count: accounts.length }, "Scheduled device account pollers");
  } catch (err) {
    logger.error({ err }, "Failed to load vendor accounts for poller");
  }
}

function clearAccountTimer(id: number): void {
  if (timers.has(id)) {
    clearTimeout(timers.get(id));
    timers.delete(id);
  }
}

async function runAndReschedule(accountId: number): Promise<void> {
  await pollAccount(accountId);

  // Re-fetch interval in case it was edited
  const [a] = await db
    .select({ pollIntervalSeconds: vendorAccountsTable.pollIntervalSeconds, enabled: vendorAccountsTable.enabled })
    .from(vendorAccountsTable)
    .where(eq(vendorAccountsTable.id, accountId));

  if (a?.enabled) {
    scheduleAccountPoller(accountId, a.pollIntervalSeconds * 1000);
  }
}

async function pollAccount(accountId: number): Promise<void> {
  const [account] = await db
    .select()
    .from(vendorAccountsTable)
    .where(eq(vendorAccountsTable.id, accountId));

  if (!account || !account.enabled) return;

  const connector = CONNECTORS[account.vendorKey];
  if (!connector) {
    logger.warn({ vendorKey: account.vendorKey, accountId }, "No connector registered for vendor");
    return;
  }

  const t0 = Date.now();

  try {
    let config: { username: string; password: string; apiKey?: string; baseUrl?: string };
    try {
      config = JSON.parse(decrypt(account.credentialsEnc));
    } catch (err) {
      logger.error({ accountId, vendor: account.vendorKey }, "Failed to decrypt credentials — skipping poll");
      return;
    }

    const pings = await connector.fetchAll(config);
    const pollMs = Date.now() - t0;

    let inserted = 0;
    for (const ping of pings) {
      try {
        const ok = await processOnePing(account, ping);
        if (ok) inserted++;
      } catch (err) {
        logger.warn({ err, vendorDeviceId: ping.vendorDeviceId }, "Failed to process device ping (skipping)");
      }
    }

    await db
      .update(vendorAccountsTable)
      .set({
        lastPolledAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        lastDeviceCount: pings.length,
        consecutiveFailures: 0,
        status: "ACTIVE",
      })
      .where(eq(vendorAccountsTable.id, accountId));

    logger.debug(
      { accountId, vendor: account.vendorKey, total: pings.length, inserted, pollMs },
      "Device poll complete"
    );
  } catch (err: any) {
    const failures = (account.consecutiveFailures ?? 0) + 1;
    const newStatus = failures >= MAX_CONSECUTIVE_FAILURES ? "DEGRADED" : "ACTIVE";

    await db
      .update(vendorAccountsTable)
      .set({
        lastPolledAt: new Date(),
        lastError: err.message ?? "Unknown error",
        consecutiveFailures: failures,
        status: newStatus,
      })
      .where(eq(vendorAccountsTable.id, accountId));

    logger.error({ accountId, vendor: account.vendorKey, failures, err: err.message }, "Device poll failed");
  }
}

/** Public — called by simulator to inject mock device pings. */
export async function processDevicePings(
  account: typeof vendorAccountsTable.$inferSelect,
  pings: NormalizedPing[],
): Promise<void> {
  for (const ping of pings) {
    try {
      await processOnePing(account, ping);
    } catch (err) {
      logger.warn({ err, vendorDeviceId: ping.vendorDeviceId }, "processDevicePings: skipping ping");
    }
  }
}

async function processOnePing(
  account: typeof vendorAccountsTable.$inferSelect,
  ping: NormalizedPing,
): Promise<boolean> {
  // ── 1. Upsert TrackedDevice (auto-register on first sight) ─────────────────
  const [existing] = await db
    .select()
    .from(trackedDevicesTable)
    .where(
      and(
        eq(trackedDevicesTable.vendorKey, ping.vendorKey),
        eq(trackedDevicesTable.vendorDeviceId, ping.vendorDeviceId),
      )
    )
    .limit(1);

  let device = existing;

  if (!device) {
    // Find default Vehicle Tracker category for this customer
    const [cat] = await db
      .select({ id: deviceCategoriesTable.id })
      .from(deviceCategoriesTable)
      .where(
        and(
          eq(deviceCategoriesTable.customerId, account.customerId),
          eq(deviceCategoriesTable.key, "VEHICLE_TRACKER"),
        )
      )
      .limit(1);

    const newDev = await insertReturning(trackedDevicesTable, {
        customerId: account.customerId,
        vendorAccountId: account.id,
        deviceCategoryId: cat?.id ?? null,
        vendorKey: ping.vendorKey,
        vendorDeviceId: ping.vendorDeviceId,
        imei: ping.imei ?? null,
        name: ping.name ?? null,
        simPhone: ping.simPhone ?? null,
        vendorType: ping.vendorType ?? null,
        status: "ONLINE",
      });

    device = newDev;
    logger.info({ device: device.id, name: ping.name, vendorKey: ping.vendorKey }, "Auto-registered new tracked device");
  }

  // ── 2. Dedup: skip if posId already recorded ───────────────────────────────
  const [dupPing] = await db
    .select({ id: locationPingsTable.id })
    .from(locationPingsTable)
    .where(
      sql`vendor_key = ${ping.vendorKey} AND vendor_pos_id = ${ping.vendorPosId}`
    )
    .limit(1);

  if (dupPing) return false; // already ingested

  // ── 3. Insert normalized ping ──────────────────────────────────────────────
  await db.insert(locationPingsTable).values({
    userId: device.assignedUserId ?? null,
    latitude: ping.latitude,
    longitude: ping.longitude,
    speedKph: ping.speedKph ?? null,
    accuracyM: null,
    batteryLevel: null,
    recordedAt: ping.recordedAt,
    sourceType: "GPS_DEVICE",
    trackedDeviceId: device.id,
    deviceCategoryId: device.deviceCategoryId ?? null,
    vendorKey: ping.vendorKey,
    vendorPosId: ping.vendorPosId,
    courseDeg: ping.courseDeg ?? null,
    ignition: ping.ignition ?? null,
    alarm: ping.alarm ?? null,
    totalDistanceRaw: ping.totalDistanceRaw ?? null,
    speedSource: "DEVICE",
    vendorReportedAt: ping.vendorReportedAt,
    deviceTelemetry: ping.rawPayload,
  } as any);

  // ── 4. Update device state ─────────────────────────────────────────────────
  const ageMs = Date.now() - ping.recordedAt.getTime();
  const isOnline = ageMs < 10 * 60 * 1000; // online if fix < 10 min ago

  await db
    .update(trackedDevicesTable)
    .set({
      lastFixAt: ping.recordedAt,
      lastLat: ping.latitude,
      lastLng: ping.longitude,
      lastSpeedKph: ping.speedKph ?? null,
      lastIgnition: ping.ignition ?? null,
      lastAlarm: ping.alarm ?? null,
      totalDistanceRaw: ping.totalDistanceRaw ?? null,
      status: isOnline ? "ONLINE" : "OFFLINE",
    })
    .where(eq(trackedDevicesTable.id, device.id));

  return true;
}
