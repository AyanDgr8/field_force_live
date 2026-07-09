/**
 * Geo utilities. All distance/ETA estimates use haversine + constant-speed assumptions
 * as a stand-in until the Google Distance Matrix API (GOOGLE_MAPS_SERVER_KEY) is configured.
 * Replace `estimateTravelTime` callers only — no other changes needed.
 */

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

const AVG_SPEED_KPH = 25;
const AVG_SPEED_MPS = AVG_SPEED_KPH / 3.6;

/**
 * Estimate travel time in seconds given straight-line distance in metres.
 * Swap this function body for a real Distance Matrix API call when
 * GOOGLE_MAPS_SERVER_KEY is available without changing any caller.
 */
export function estimateTravelTime(distanceMeters: number): number {
  return distanceMeters / AVG_SPEED_MPS;
}

/** Return a random plausible Delhi NCR coordinate */
export function randomDelhiNcrCoord(): { lat: number; lng: number } {
  const lat = 28.4 + Math.random() * 0.5; // 28.4–28.9
  const lng = 76.8 + Math.random() * 0.5; // 76.8–77.3
  return { lat, lng };
}
