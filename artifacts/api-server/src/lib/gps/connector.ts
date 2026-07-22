/**
 * GPS Connector interface.
 * Adding a new vendor = implement this interface + register in devicePoller.ts.
 *
 * SECURITY: ConnectorConfig carries decrypted credentials.
 * Only pass to connector methods; never log, never serialize back to a response.
 */

export interface ConnectorConfig {
  username: string;
  password: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Normalized telemetry from any GPS vendor.
 * All connectors must produce this shape — core logic only touches these fields.
 */
export interface NormalizedPing {
  vendorKey: string;
  /** Vendor's internal device id (string-coerced for uniformity). */
  vendorDeviceId: string;
  /** Unique position id for dedup. New ping only when this changes. */
  vendorPosId: string;

  imei?: string;
  name?: string;
  simPhone?: string;
  vendorType?: string;

  latitude: number;
  longitude: number;
  /** km/h — device-reported; do NOT recompute from coordinates. */
  speedKph?: number;
  /** Heading in degrees 0-359. */
  courseDeg?: number;
  ignition?: boolean | null;
  alarm?: string | null;
  /** Raw cumulative distance from device (unit = meters per BOLT spec). */
  totalDistanceRaw?: number;

  /** deviceFixTime — authoritative GPS fix timestamp (UTC). */
  recordedAt: Date;
  /** lastUpdate — when vendor server last heard from device (UTC). */
  vendorReportedAt: Date;

  /** Full vendor payload for deviceTelemetry JSONB column. */
  rawPayload: Record<string, unknown>;
}

export interface GpsConnector {
  readonly vendorKey: string;
  fetchAll(config: ConnectorConfig): Promise<NormalizedPing[]>;
  fetchOne(config: ConnectorConfig, opts: { name?: string; imei?: string }): Promise<NormalizedPing>;
  testConnection(config: ConnectorConfig): Promise<{ ok: boolean; message: string; deviceCount?: number }>;
}
