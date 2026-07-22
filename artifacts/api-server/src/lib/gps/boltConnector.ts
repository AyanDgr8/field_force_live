/**
 * BOLT connector — vendorKey "BOLT"
 * Pull API: GET https://pullapi-s2.track360.co.in/api/v1/auth/pull_api
 *
 * SECURITY:
 *  - This API passes credentials as query params (vendor design, not ours).
 *  - The fetch is server-side ONLY.
 *  - URL is built here; pinoHttp serializer strips query strings — but we also
 *    catch any unexpected log leakage by masking before passing to logger.
 *  - Credentials NEVER appear in logger output from this module.
 */
import { GpsConnector, NormalizedPing, ConnectorConfig } from "./connector.js";
import { logger } from "../logger.js";

const DEFAULT_BASE_URL = "https://pullapi-s2.track360.co.in/api/v1/auth/pull_api";
const TIMEOUT_MS = 10_000;

// ─── Timestamp parsers ────────────────────────────────────────────────────────

/** Parse "2020-02-20 08:02:06" as UTC (no offset in string — explicit Z). */
function parseFixTime(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z");
}

/** Parse "2020-02-20T08:02:07.470+0000" — standard ISO-8601, already UTC. */
function parseUpdateTime(s: string): Date {
  return new Date(s);
}

// ─── Single device normalizer ─────────────────────────────────────────────────

function normalize(raw: Record<string, unknown>): NormalizedPing | null {
  const lat = parseFloat(raw.latitude as string);
  const lng = parseFloat(raw.longitude as string);

  // Reject invalid / no-fix positions
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;

  const ignitionRaw = raw.ignition;
  const ignition =
    ignitionRaw === null || ignitionRaw === undefined
      ? null
      : Boolean(ignitionRaw);

  const alarm = typeof raw.alarm === "string" && raw.alarm.length > 0 ? raw.alarm : null;

  const speed = parseFloat(raw.speed as string);
  const course = parseFloat(raw.course as string);
  const totalDistance = parseFloat(raw.totalDistance as string);

  return {
    vendorKey: "BOLT",
    vendorDeviceId: String(raw.deviceId),
    vendorPosId: String(raw.posId),
    imei: typeof raw.deviceImei === "string" ? raw.deviceImei : undefined,
    name: typeof raw.name === "string" ? raw.name : undefined,
    simPhone: typeof raw.phone === "string" ? raw.phone : undefined,
    vendorType: typeof raw.type === "string" ? raw.type : undefined,
    latitude: lat,
    longitude: lng,
    speedKph: isFinite(speed) ? speed : undefined,
    courseDeg: isFinite(course) ? course : undefined,
    ignition,
    alarm,
    totalDistanceRaw: isFinite(totalDistance) ? totalDistance : undefined,
    recordedAt: parseFixTime(raw.deviceFixTime as string),
    vendorReportedAt: parseUpdateTime(raw.lastUpdate as string),
    rawPayload: raw,
  };
}

// ─── HTTP helper (credentials stay in this function, never logged) ────────────

async function callBolt(
  config: ConnectorConfig,
  extra?: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const base = config.baseUrl ?? DEFAULT_BASE_URL;
  const params = new URLSearchParams({
    username: config.username,
    password: config.password,
    ...(extra ?? {}),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${base}?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`BOLT HTTP ${res.status}`);
    }

    const body = (await res.json()) as { status: string; data: unknown; message: string };

    if (body.status !== "success") {
      throw new Error(`BOLT API: ${body.message ?? "non-success status"}`);
    }

    if (Array.isArray(body.data)) return body.data as Record<string, unknown>[];
    if (body.data && typeof body.data === "object") {
      return [body.data as Record<string, unknown>];
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── Connector implementation ─────────────────────────────────────────────────

export const boltConnector: GpsConnector = {
  vendorKey: "BOLT",

  async fetchAll(config) {
    logger.debug({ vendor: "BOLT" }, "Fetching all devices");
    const devices = await callBolt(config);
    return devices.map(normalize).filter((p): p is NormalizedPing => p !== null);
  },

  async fetchOne(config, opts) {
    const extra: Record<string, string> = {};
    if (opts.name) extra.name = opts.name;
    if (opts.imei) extra.deviceImei = opts.imei;
    const devices = await callBolt(config, extra);
    const ping = devices.map(normalize).find((p): p is NormalizedPing => p !== null);
    if (!ping) throw new Error("Device not found or no valid GPS fix");
    return ping;
  },

  async testConnection(config) {
    try {
      const devices = await callBolt(config);
      const valid = devices.map(normalize).filter(Boolean).length;
      return {
        ok: true,
        message: `Connected. ${devices.length} device(s) returned, ${valid} with valid GPS fix.`,
        deviceCount: devices.length,
      };
    } catch (err: any) {
      return { ok: false, message: err.message ?? "Connection failed" };
    }
  },
};
