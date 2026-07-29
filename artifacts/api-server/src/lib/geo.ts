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

/** A single place candidate returned by the hub-location search box. */
export interface PlaceMatch {
  label: string;
  latitude: number;
  longitude: number;
}

/** Optional map-viewport bias, so "Sector 62" resolves near the visible area. */
export interface ViewportBias {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

const NOMINATIM_HEADERS = { "User-Agent": "field-force-monitor/1.0 (hub configuration)" };

/**
 * Free-text place search for the admin hub-location picker.
 * Uses Google Geocoding when GOOGLE_MAPS_SERVER_KEY is set, and OpenStreetMap
 * Nominatim (keyless) otherwise, so the picker also works on a bare install.
 */
export async function searchPlaces(
  query: string,
  limit = 6,
  bias?: ViewportBias,
): Promise<PlaceMatch[]> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  if (apiKey) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", query);
    url.searchParams.set("key", apiKey);
    if (bias) {
      url.searchParams.set("bounds", `${bias.swLat},${bias.swLng}|${bias.neLat},${bias.neLng}`);
    }

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = (await response.json()) as {
      status: string;
      results: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    if (data.status !== "OK") return [];

    return data.results.slice(0, limit).map(result => ({
      label: result.formatted_address,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    }));
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", String(limit));
  if (bias) {
    url.searchParams.set("viewbox", `${bias.swLng},${bias.neLat},${bias.neLng},${bias.swLat}`);
  }

  const response = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!response.ok) return [];

  const data = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return data.map(result => ({
    label: result.display_name,
    latitude: Number(result.lat),
    longitude: Number(result.lon),
  }));
}

/**
 * Turn a map coordinate into a postal address.
 * Same provider rules as searchPlaces. Returns null when nothing matches, in
 * which case the caller keeps whatever address the admin typed by hand.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;

  if (apiKey) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = (await response.json()) as {
      status: string;
      results: Array<{ formatted_address: string }>;
    };
    if (data.status !== "OK" || data.results.length === 0) return null;
    return data.results[0].formatted_address;
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");

  const response = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!response.ok) return null;

  const data = (await response.json()) as { display_name?: string };
  return data.display_name ?? null;
}
