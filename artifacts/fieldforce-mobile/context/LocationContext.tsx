import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingPingsRef = useRef<object[]>([]);

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

  // Flush buffered pings to the server
  const flushPings = useCallback(async () => {
    if (!user || pendingPingsRef.current.length === 0) return;
    const toSend = [...pendingPingsRef.current];
    pendingPingsRef.current = [];
    try {
      await apiPost('/api/ingest/location', { pings: toSend });
    } catch {
      // re-buffer on failure
      pendingPingsRef.current = [...toSend, ...pendingPingsRef.current];
    }
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
      value={{ coords, permissionGranted, requestPermission, getCoords }}
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
