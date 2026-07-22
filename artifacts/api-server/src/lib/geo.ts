/**
 * Geo utilities.
 * Geocoding uses Google Geocoding API when GOOGLE_MAPS_SERVER_KEY is set,
 * and falls back to random Delhi NCR coordinates in development without a key.
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
 * Uses haversine + constant speed (no Distance Matrix call needed for now).
 */
export function estimateTravelTime(distanceMeters: number): number {
  return distanceMeters / AVG_SPEED_MPS;
}

/** Return a random plausible Delhi NCR coordinate (fallback only) */
export function randomDelhiNcrCoord(): { lat: number; lng: number } {
  const lat = 28.4 + Math.random() * 0.5;
  const lng = 76.8 + Math.random() * 0.5;
  return { lat, lng };
}

/**
 * Geocode an address string to {lat, lng}.
 * Uses Google Geocoding API if GOOGLE_MAPS_SERVER_KEY is set,
 * otherwise falls back to a random Delhi NCR stub.
 * Returns null if geocoding fails (caller should handle gracefully).
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  if (!apiKey) {
    return randomDelhiNcrCoord();
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const data = (await response.json()) as {
    status: string;
    results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
  };

  if (data.status !== "OK" || data.results.length === 0) return null;

  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}
