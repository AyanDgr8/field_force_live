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
  vehiclesTable,
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
const MIN_INTERVAL_MS = 3_000;
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
  const effective = Math.min(Math.max(intervalMs, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
  // Jitter is proportional so it still de-synchronises accounts on long
  // intervals without swamping a short one — a flat 0-10s spread would turn a
  // 3s interval into anything from 3s to 13s.
  const jitter = Math.random() * Math.min(effective * 0.2, 10_000);
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

/** Map the vendor's free-text `type` onto the fleet registry's vehicle types. */
function toVehicleType(vendorType: string | null | undefined): string {
  const t = (vendorType ?? "").toLowerCase();
  if (/bike|bicycle|motorcycle|motorbike|scooter|two.?wheeler/.test(t)) return "TWO_WHEELER";
  if (/auto|rickshaw|three.?wheeler|tuk/.test(t)) return "THREE_WHEELER";
  if (/car|truck|van|bus|lorry|taxi|jeep|tempo|four.?wheeler/.test(t)) return "FOUR_WHEELER";
  return "TWO_WHEELER";
}

/**
 * Mirror a freshly-seen tracker into the vehicle registry so /vehicle-configuration
 * lists it without anyone typing it in, and link the two via
 * `tracked_devices.assigned_vehicle_reg`.
 *
 * Runs only while a device is still unlinked — once `assignedVehicleReg` is set
 * this is skipped, so a steady-state poll costs no extra queries.
 *
 * Existing rows are only ever *backfilled*: a registration number or vehicle
 * type an admin has corrected by hand is never overwritten by vendor data.
 */
async function linkVehicleRecord(
  customerId: number,
  device: typeof trackedDevicesTable.$inferSelect,
  ping: NormalizedPing,
): Promise<void> {
  // The vendor's `name` is the vehicle's CHASSIS number (e.g. R6VA013L0SL186456)
  // and `deviceImei` is the tracker's unique id — neither is a number plate.
  // The registry still needs a non-null registrationNumber, so the chassis
  // stands in as a placeholder until an admin enters the real plate.
  const chassisNumber = ping.name?.trim() || null;
  const registration = (chassisNumber ?? ping.imei ?? `${ping.vendorKey}-${ping.vendorDeviceId}`).trim();
  if (!registration) return;

  // Match on the most durable identifier first so an admin who has already
  // entered this vehicle by hand gets it enriched rather than duplicated:
  // tracker IMEI → chassis number → whatever is in registrationNumber.
  const findBy = async (where: ReturnType<typeof eq>) => {
    const [row] = await db.select().from(vehiclesTable)
      .where(and(eq(vehiclesTable.customerId, customerId), where))
      .limit(1);
    return row;
  };

  let vehicle =
    (ping.imei ? await findBy(eq(vehiclesTable.imei, ping.imei)) : undefined) ??
    (chassisNumber ? await findBy(eq(vehiclesTable.chassisNumber, chassisNumber)) : undefined) ??
    await findBy(eq(vehiclesTable.registrationNumber, registration));

  const existing = vehicle;

  if (!vehicle) {
    vehicle = await insertReturning(vehiclesTable, {
      customerId,
      hubId: null,
      registrationNumber: registration,
      chassisNumber,
      vehicleType: toVehicleType(ping.vendorType),
      imei: ping.imei ?? null,
      iotVendor: ping.vendorKey,
      metadata: {
        source: "GPS_POLL",
        vendorKey: ping.vendorKey,
        vendorDeviceId: ping.vendorDeviceId,
        vendorType: ping.vendorType ?? null,
        simPhone: ping.simPhone ?? null,
        trackedDeviceId: device.id,
        // Flags that registrationNumber is the chassis standing in for a plate
        // nobody has entered yet, so the UI can prompt for the real one.
        registrationPending: true,
      },
    });
    logger.info(
      { vehicle: vehicle.id, chassisNumber, imei: ping.imei, device: device.id },
      "Auto-registered vehicle from GPS tracker",
    );
  } else {
    // Fill gaps only — never clobber values an admin has set.
    const backfill: Partial<typeof vehiclesTable.$inferInsert> = {};
    if (!vehicle.imei && ping.imei) backfill.imei = ping.imei;
    if (!vehicle.chassisNumber && chassisNumber) backfill.chassisNumber = chassisNumber;
    if (!vehicle.iotVendor) backfill.iotVendor = ping.vendorKey;
    if (Object.keys(backfill).length > 0) {
      await db.update(vehiclesTable).set(backfill).where(eq(vehiclesTable.id, vehicle.id));
    }
  }

  await db.update(trackedDevicesTable)
    .set({ assignedVehicleReg: vehicle.registrationNumber })
    .where(eq(trackedDevicesTable.id, device.id));
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

  // ── 1b. Mirror into the vehicle registry, once per device ──────────────────
  // A failure here must not cost us the position, so it is contained.
  if (!device.assignedVehicleReg) {
    try {
      await linkVehicleRecord(account.customerId, device, ping);
    } catch (err) {
      logger.warn({ err, device: device.id }, "Failed to link vehicle record for tracked device");
    }
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
      // Refreshed every poll: the marker shape on the live map is keyed off it,
      // so a tracker re-typed at the vendor must not stay stale here.
      vendorType: ping.vendorType ?? null,
      lastFixAt: ping.recordedAt,
      lastLat: ping.latitude,
      lastLng: ping.longitude,
      lastSpeedKph: ping.speedKph ?? null,
      lastCourseDeg: ping.courseDeg ?? null,
      lastIgnition: ping.ignition ?? null,
      lastAlarm: ping.alarm ?? null,
      totalDistanceRaw: ping.totalDistanceRaw ?? null,
      status: isOnline ? "ONLINE" : "OFFLINE",
    })
    .where(eq(trackedDevicesTable.id, device.id));

  return true;
}
