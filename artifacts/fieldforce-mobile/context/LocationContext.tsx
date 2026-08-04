import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import {
  enqueue,
  flush as flushQueue,
  loadQueue,
  subscribe,
} from '@/lib/offlineQueue';
import { apiGet } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Coords {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

interface LocationContextValue {
  coords: Coords | null;
  permissionGranted: boolean;
  requestPermission: () => Promise<boolean>;
  getCoords: () => Promise<Coords | null>;
  /** Requests still waiting on connectivity — surfaced as an offline badge. */
  pendingSync: number;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const LocationContext = createContext<LocationContextValue | null>(null);

/**
 * Ping cadence is set per tenant from the admin panel (Mobile App Config) and
 * served by GET /config/mobile. These bounds mirror the server's so a bad or
 * stale value can never leave the app hammering the API or effectively idle.
 */
const DEFAULT_PING_INTERVAL_MS = 5_000;
const MIN_PING_INTERVAL_MS = 5_000;
const MAX_PING_INTERVAL_MS = 300_000;
/** How often to re-read the setting, so a change reaches phones already running. */
const CONFIG_REFRESH_MS = 5 * 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Minimal web geolocation wrapper — returns a promise with coords
function getWebPosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(new Error('Geolocation not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const collectingRef = useRef(false);
  const [pingIntervalMs, setPingIntervalMs] = useState(DEFAULT_PING_INTERVAL_MS);

  // Pull the tenant's configured cadence, then re-check periodically so a change
  // made in the admin panel reaches phones that are already signed in.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      try {
        const cfg = await apiGet<{ pingIntervalSeconds: number }>(
          '/api/config/mobile',
          { customerId: String(user.customerId) },
        );
        const ms = Number(cfg?.pingIntervalSeconds) * 1_000;
        if (cancelled || !Number.isFinite(ms)) return;
        setPingIntervalMs(Math.min(Math.max(ms, MIN_PING_INTERVAL_MS), MAX_PING_INTERVAL_MS));
      } catch {
        // Offline or the endpoint is unavailable — keep the current cadence.
      }
    };

    void load();
    const timer = setInterval(() => void load(), CONFIG_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  // Load the durable queue and surface its size immediately. Delivery waits
  // until AuthContext has restored the signed-in user.
  useEffect(() => {
    const unsubscribe = subscribe(setPendingSync);
    void loadQueue();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) void flushQueue();
  }, [user]);

  // Request location permission (native) or check web availability
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      try {
        await getWebPosition();
        setPermissionGranted(true);
        return true;
      } catch {
        return false;
      }
    }
    // Native — lazy-import expo-location to avoid web bundling issues
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionGranted(granted);
      return granted;
    } catch {
      return false;
    }
  }, []);

  // Ask once after sign-in so the home map, attendance scanner and background
  // sync are ready immediately instead of waiting for the user to visit Profile.
  useEffect(() => {
    if (user && !permissionGranted) void requestPermission();
  }, [user, permissionGranted, requestPermission]);

  // Get current position once
  const getCoords = useCallback(async (): Promise<Coords | null> => {
    if (Platform.OS === 'web') {
      try {
        const c = await getWebPosition();
        setCoords(c);
        return c;
      } catch {
        return null;
      }
    }
    try {
      const Location = await import('expo-location');
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const c = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      setCoords(c);
      return c;
    } catch {
      return null;
    }
  }, []);

  // Persist and send every reading immediately. The admin map polls every five
  // seconds, so batching three 30-second readings made a moving rider appear
  // frozen for up to a minute. enqueue remains durable when connectivity drops.
  const collectPing = useCallback(async () => {
    if (!user || collectingRef.current) return;
    collectingRef.current = true;
    try {
      const c = await getCoords();
      if (!c) return;
      await enqueue('/api/ingest/location', {
        pings: [{
          userId: user.id,
          latitude: c.latitude,
          longitude: c.longitude,
          accuracyM: c.accuracy ?? undefined,
          recordedAt: new Date().toISOString(),
        }],
      });
    } finally {
      collectingRef.current = false;
    }
  }, [user, getCoords]);

  // Start/stop the polling interval based on user auth + app foreground
  useEffect(() => {
    if (!user || !permissionGranted) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Cadence comes from the tenant's Mobile App Config; the default matches
    // the admin map's refresh closely enough for visibly live movement.
    void collectPing();
    intervalRef.current = setInterval(() => void collectPing(), pingIntervalMs);

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void flushQueue();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else if (nextState === 'active' && !intervalRef.current) {
        void collectPing();
        // Coming back to foreground is the cheapest signal that connectivity may
        // have returned, so retry anything stranded while backgrounded.
        void flushQueue();
        intervalRef.current = setInterval(() => void collectPing(), pingIntervalMs);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      sub.remove();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      void flushQueue();
    };
    // pingIntervalMs is a dependency so a cadence change restarts the timer
    // instead of waiting for the next sign-in.
  }, [user, permissionGranted, collectPing, pingIntervalMs]);

  const value = useMemo(() => ({
    coords,
    permissionGranted,
    requestPermission,
    getCoords,
    pendingSync,
  }), [coords, permissionGranted, requestPermission, getCoords, pendingSync]);

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx)
    throw new Error('useLocation must be used within <LocationProvider>');
  return ctx;
}
