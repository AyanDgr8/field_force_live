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
const DEFAULT_COMMAND_BASE_URL = "https://prod-s2.track360.net.in/api/v1/auth";
const TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 20_000;

// ─── Field parsers ────────────────────────────────────────────────────────────

/**
 * Timestamps arrive in more than one shape depending on the BOLT deployment:
 *   "2020-02-20 08:02:06"             — documented format, no zone, is UTC
 *   "2026-08-04T05:52:54.000+0000"    — ISO-8601 with an explicit offset
 *   "2026-08-04T07:10:59.000000+0000" — same, with microsecond precision
 *
 * Only the zone-less form may have `Z` appended; doing that to the others
 * yields an Invalid Date. Microseconds are trimmed to milliseconds because
 * the ECMAScript date format specifies exactly three fractional digits.
 */
function parseVendorTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.toLowerCase() === "null") return null;

  const trimmedFraction = raw.replace(/(\.\d{3})\d+/, "$1");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmedFraction);
  const normalized = hasZone ? trimmedFraction : trimmedFraction.replace(" ", "T") + "Z";

  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * `ignition` and friends are documented as booleans but ship as the strings
 * `"true"` / `"false"`, so a bare `Boolean()` reads every "false" as ON.
 */
function parseTriState(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;

  const s = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(s)) return true;
  if (["false", "0", "off", "no"].includes(s)) return false;
  return null;
}

/** `alarm` is sent as the *string* "null" when there is no alarm. */
function parseAlarm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || ["null", "none", "undefined"].includes(s.toLowerCase())) return null;
  return s;
}

// ─── Single device normalizer ─────────────────────────────────────────────────

function normalize(raw: Record<string, unknown>): NormalizedPing | null {
  // `valid: 0` marks a unit that has never produced a usable fix — its
  // coordinates and timestamps come back null.
  if (raw.valid === 0 || raw.valid === "0") return null;

  const lat = parseFloat(raw.latitude as string);
  const lng = parseFloat(raw.longitude as string);

  // Reject invalid / no-fix positions
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;

  // deviceFixTime is the authoritative position time — a ping without one
  // cannot be placed on a timeline, so drop it rather than store an epoch.
  const recordedAt = parseVendorTime(raw.deviceFixTime);
  if (!recordedAt) return null;

  if (raw.posId === null || raw.posId === undefined) return null;

  const ignition = parseTriState(raw.ignition);
  const alarm = parseAlarm(raw.alarm);

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
    recordedAt,
    vendorReportedAt: parseVendorTime(raw.lastUpdate) ?? recordedAt,
    rawPayload: raw,
  };
}

// ─── Error-body reader ────────────────────────────────────────────────────────

/**
 * BOLT answers auth failures with a 4xx *and* a JSON body carrying the real
 * reason (`{"status":"failed","message":"User not found"}`). The status code
 * alone is not actionable, so pull the message out.
 *
 * The result lands in `vendor_accounts.last_error` and is shown in the admin
 * health panel, so redact the credentials before returning it.
 */
async function readFailureReason(res: Response, config: ConnectorConfig): Promise<string | null> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return null;
  }

  let message = text.trim();
  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) message = body.message.trim();
  } catch {
    // Not JSON (e.g. an HTML error page) — fall through to the raw text.
  }

  if (!message) return null;

  for (const secret of [config.username, config.password, config.apiKey]) {
    if (secret) message = message.split(secret).join("***");
  }
  return message.slice(0, 200);
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
      const reason = await readFailureReason(res, config);
      throw new Error(reason ? `BOLT HTTP ${res.status}: ${reason}` : `BOLT HTTP ${res.status}`);
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

export type BoltEngineCommand = "engineStop" | "engineResume";

/**
 * Submit a Track360 Owl-mode engine command and wait for its async task.
 * Track360 sometimes returns HTTP 400 for a completed task while the JSON body
 * says `state: SUCCESS`, so task state—not HTTP status—is authoritative.
 */
export async function sendBoltEngineCommand(
  config: ConnectorConfig,
  deviceId: string,
  type: BoltEngineCommand,
): Promise<{ taskId: string; state: "SUCCESS"; message: string }> {
  if (!config.selectedUserId?.trim()) {
    throw new Error("Track360 selected user ID is not configured for this vendor account");
  }
  if (!/^\d+$/.test(deviceId)) throw new Error("Track360 device ID is invalid");

  const base = (config.commandBaseUrl ?? DEFAULT_COMMAND_BASE_URL).replace(/\/$/, "");
  const selectedUserId = config.selectedUserId.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);

  try {
    const submit = await fetch(`${base}/set_owl_mode?selectedUserId=${encodeURIComponent(selectedUserId)}`, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ type, device_id: Number(deviceId) }),
    });
    const submitted = await submit.json().catch(() => null) as { success?: boolean; task_id?: string; message?: string } | null;
    if (!submit.ok || !submitted?.success || !submitted.task_id) {
      throw new Error(submitted?.message || `Track360 command submission failed (HTTP ${submit.status})`);
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1_000));
      const statusResponse = await fetch(
        `${base}/get_task_status?task_id=${encodeURIComponent(submitted.task_id)}&selectedUserId=${encodeURIComponent(selectedUserId)}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      const status = await statusResponse.json().catch(() => null) as {
        state?: string;
        message?: string;
        data?: { message?: string; status?: string };
      } | null;
      if (status?.state === "SUCCESS") {
        return {
          taskId: submitted.task_id,
          state: "SUCCESS",
          message: status.data?.message || status.message || "Vehicle command completed",
        };
      }
      if (status?.state && !["PENDING", "STARTED", "RETRY"].includes(status.state)) {
        throw new Error(status.data?.message || status.message || `Track360 task ${status.state}`);
      }
    }
    throw new Error("Track360 command timed out while waiting for device acknowledgement");
  } finally {
    clearTimeout(timer);
  }
}
