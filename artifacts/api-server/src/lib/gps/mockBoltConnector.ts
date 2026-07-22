/**
 * Mock BOLT connector — vendorKey "MOCK_BOLT"
 * Returns the exact Bolt JSON envelope/shape (string lat/lng, camelCase, incrementing posId,
 * occasional null ignition/alarm) so the real parsing path is exercised end-to-end.
 * ~10 vehicle trackers moving along roads, ignition toggling, Vibration alarms, rising odometer.
 */
import { GpsConnector, NormalizedPing, ConnectorConfig } from "./connector.js";

const NUM_DEVICES = 10;

// Delhi-NCR seed positions
const SEEDS: { lat: number; lng: number }[] = [
  { lat: 28.6139, lng: 77.2090 }, { lat: 28.5355, lng: 77.3910 },
  { lat: 28.4595, lng: 77.0266 }, { lat: 28.7041, lng: 77.1025 },
  { lat: 28.6280, lng: 77.3649 }, { lat: 28.5244, lng: 77.1855 },
  { lat: 28.6430, lng: 77.0880 }, { lat: 28.5921, lng: 77.2295 },
  { lat: 28.6562, lng: 77.2410 }, { lat: 28.5700, lng: 77.3210 },
];

const VEHICLE_NAMES = [
  "DL1AB1234", "DL2CD5678", "UP1EF9012", "HR3GH3456", "DL4IJ7890",
  "RJ5KL1234", "MH6MN5678", "GJ7OP9012", "TN8QR3456", "MP9ST7890",
];

interface MockDeviceState {
  lat: number; lng: number;
  posId: number; ignition: boolean;
  totalDistance: number; alarm: string | null;
  courseDeg: number;
}

const state = new Map<number, MockDeviceState>();

function getState(i: number): MockDeviceState {
  if (!state.has(i)) {
    state.set(i, {
      lat: SEEDS[i].lat + (Math.random() - 0.5) * 0.05,
      lng: SEEDS[i].lng + (Math.random() - 0.5) * 0.05,
      posId: 2_000_000 + i * 10_000,
      ignition: Math.random() > 0.3,
      totalDistance: Math.random() * 9_000_000,
      alarm: null,
      courseDeg: Math.random() * 360,
    });
  }
  return state.get(i)!;
}

export const mockBoltConnector: GpsConnector = {
  vendorKey: "MOCK_BOLT",

  async fetchAll(_config: ConnectorConfig): Promise<NormalizedPing[]> {
    const now = new Date();
    const pings: NormalizedPing[] = [];

    for (let i = 0; i < NUM_DEVICES; i++) {
      const s = getState(i);
      const speed = s.ignition ? 5 + Math.random() * 55 : 0;
      const angleDelta = ((Math.random() - 0.5) * 30 * Math.PI) / 180;
      s.courseDeg = (s.courseDeg + (angleDelta * 180) / Math.PI + 360) % 360;
      const angleRad = (s.courseDeg * Math.PI) / 180;
      const delta = (speed / 3_600 / 111_000) * 5; // 5-second movement
      s.lat += Math.cos(angleRad) * delta;
      s.lng += Math.sin(angleRad) * delta;
      s.posId++;
      s.totalDistance += speed * (5 / 3_600) * 1_000; // meters
      if (Math.random() < 0.04) s.ignition = !s.ignition;
      s.alarm = Math.random() < 0.03 ? "Vibration" : null;

      // Produce raw BOLT-shape payload (string values where BOLT uses strings)
      const rawPayload: Record<string, unknown> = {
        deviceId: 18_000 + i,
        name: VEHICLE_NAMES[i],
        deviceImei: `MOCK${18_000 + i}IMEI000`,
        status: "online",
        latitude: String(s.lat.toFixed(7)),
        longitude: String(s.lng.toFixed(7)),
        lastUpdate: now.toISOString().replace("T", " ").slice(0, 19) + "+0000",
        posId: s.posId,
        phone: `9${String(i + 1).padStart(9, "0")}`,
        type: "car",
        deviceFixTime: now.toISOString().replace("T", " ").slice(0, 19),
        ignition: Math.random() < 0.05 ? null : s.ignition,
        speed: String(speed.toFixed(1)),
        course: String(s.courseDeg.toFixed(0)),
        totalDistance: String(s.totalDistance.toFixed(2)),
        alarm: s.alarm,
      };

      pings.push({
        vendorKey: "MOCK_BOLT",
        vendorDeviceId: String(18_000 + i),
        vendorPosId: String(s.posId),
        imei: `MOCK${18_000 + i}IMEI000`,
        name: VEHICLE_NAMES[i],
        simPhone: `9${String(i + 1).padStart(9, "0")}`,
        vendorType: "car",
        latitude: s.lat,
        longitude: s.lng,
        speedKph: speed,
        courseDeg: s.courseDeg,
        ignition: (rawPayload.ignition as boolean | null),
        alarm: s.alarm,
        totalDistanceRaw: s.totalDistance,
        recordedAt: now,
        vendorReportedAt: now,
        rawPayload,
      });
    }
    return pings;
  },

  async fetchOne(_config, _opts) {
    throw new Error("fetchOne not implemented for MOCK_BOLT");
  },

  async testConnection(_config) {
    return { ok: true, message: "Mock connection OK. 10 simulated devices available.", deviceCount: 10 };
  },
};
