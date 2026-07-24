import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const pendingPingsRef = useRef<object[]>([]);

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

  // Hand the batch to the durable queue, which persists it before attempting the
  // network and retries later if the agent is out of signal. No re-buffering
  // here — losing the app process no longer loses the pings.
  const flushPings = useCallback(async () => {
    if (!user || pendingPingsRef.current.length === 0) return;
    const toSend = [...pendingPingsRef.current];
    pendingPingsRef.current = [];
    await enqueue('/api/ingest/location', { pings: toSend });
  }, [user]);

  // Collect one ping and buffer it
  const collectPing = useCallback(async () => {
    if (!user) return;
    const c = await getCoords();
    if (!c) return;
    pendingPingsRef.current.push({
      userId: user.id,
      latitude: c.latitude,
      longitude: c.longitude,
      accuracyM: c.accuracy ?? undefined,
      recordedAt: new Date().toISOString(),
    });
    // flush every 3 pings or if buffer grows too large
    if (pendingPingsRef.current.length >= 3) {
      await flushPings();
    }
  }, [user, getCoords, flushPings]);

  // Start/stop the polling interval based on user auth + app foreground
  useEffect(() => {
    if (!user || !permissionGranted) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // poll every 30 s
    collectPing();
    intervalRef.current = setInterval(collectPing, 30_000);

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        flushPings();
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else if (nextState === 'active' && !intervalRef.current) {
        collectPing();
        // Coming back to foreground is the cheapest signal that connectivity may
        // have returned, so retry anything stranded while backgrounded.
        void flushQueue();
        intervalRef.current = setInterval(collectPing, 30_000);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      sub.remove();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      flushPings();
    };
  }, [user, permissionGranted, collectPing, flushPings]);

  return (
    <LocationContext.Provider
      value={{
        coords,
        permissionGranted,
        requestPermission,
        getCoords,
        pendingSync,
      }}
    >
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
