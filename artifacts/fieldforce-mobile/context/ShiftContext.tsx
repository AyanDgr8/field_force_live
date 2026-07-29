/**
 * ShiftContext — tracks the agent's current shift and live status.
 *
 * States:
 *   CLOCKED_OUT  → agent has not started their shift
 *   IDLE         → clocked in, waiting at a location
 *   BUSY         → clocked in, travelling to / working at a stop
 *
 * Persisted in AsyncStorage so state survives app restarts.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueue } from '@/lib/offlineQueue';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from '@/context/LocationContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShiftStatus = 'CLOCKED_OUT' | 'IDLE' | 'BUSY';

interface ShiftState {
  status: ShiftStatus;
  clockedInAt: string | null;   // ISO timestamp
  loading: boolean;
  error: string | null;
}

interface ShiftContextValue extends ShiftState {
  clockIn: (qrToken: string) => Promise<void>;
  clockOut: () => Promise<void>;
  setBusy: () => Promise<void>;
  setIdle: () => Promise<void>;
}

// ─── Storage key ─────────────────────────────────────────────────────────────

const SHIFT_KEY = 'ff_shift_status';
const CLOCKED_AT_KEY = 'ff_clocked_in_at';

// ─── Context ──────────────────────────────────────────────────────────────────

const ShiftContext = createContext<ShiftContextValue | null>(null);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { getCoords } = useLocation();

  const [state, setState] = useState<ShiftState>({
    status: 'CLOCKED_OUT',
    clockedInAt: null,
    loading: true,
    error: null,
  });

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const [[, storedStatus], [, storedAt]] = await AsyncStorage.multiGet([
          SHIFT_KEY,
          CLOCKED_AT_KEY,
        ]);
        setState({
          status: (storedStatus as ShiftStatus | null) ?? 'CLOCKED_OUT',
          clockedInAt: storedAt,
          loading: false,
          error: null,
        });
      } catch {
        setState((s) => ({ ...s, loading: false }));
      }
    })();
  }, []);

  const persist = useCallback(async (status: ShiftStatus, at: string | null) => {
    const pairs: [string, string][] = [[SHIFT_KEY, status]];
    if (at) pairs.push([CLOCKED_AT_KEY, at]);
    await AsyncStorage.multiSet(pairs);
    if (!at) await AsyncStorage.removeItem(CLOCKED_AT_KEY);
  }, []);

  // ── Clock In ──────────────────────────────────────────────────────────────

  const clockIn = useCallback(async (qrToken: string) => {
    if (!user) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const coords = await getCoords();
      if (!coords) throw new Error('A fresh GPS location is required for attendance.');
      const result = await apiPost<{ accepted: boolean; clockedInAt: string; message?: string }>(
        '/api/user/attendance/scan', {
        userId: user.id,
        qrToken,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracyM: coords.accuracy ?? null,
      });
      if (!result.accepted) throw new Error(result.message ?? 'Attendance was not accepted.');
      const now = result.clockedInAt;
      // Also set status to IDLE on server
      await enqueue('/api/user/status', {
        userId: user.id,
        status: 'IDLE',
        lat: coords.latitude,
        lng: coords.longitude,
        at: now,
      });
      await persist('IDLE', now);
      setState({ status: 'IDLE', clockedInAt: now, loading: false, error: null });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Clock-in failed',
      }));
      throw e;
    }
  }, [user, getCoords, persist]);

  // ── Clock Out ─────────────────────────────────────────────────────────────

  const clockOut = useCallback(async () => {
    if (!user) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const coords = await getCoords();
      const now = new Date().toISOString();
      await enqueue('/api/ingest/session', {
        userId: user.id,
        event: 'LOGOUT',
        latitude: coords?.latitude ?? 0,
        longitude: coords?.longitude ?? 0,
        at: now,
      });
      // Set status back to IDLE before clocking out
      if (coords) {
        await enqueue('/api/user/status', {
          userId: user.id,
          status: 'IDLE',
          lat: coords.latitude,
          lng: coords.longitude,
          at: now,
        });
      }
      await persist('CLOCKED_OUT', null);
      await AsyncStorage.removeItem(CLOCKED_AT_KEY);
      setState({ status: 'CLOCKED_OUT', clockedInAt: null, loading: false, error: null });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Clock-out failed',
      }));
      throw e;
    }
  }, [user, getCoords, persist]);

  // ── Go Busy ───────────────────────────────────────────────────────────────

  const setBusy = useCallback(async () => {
    if (!user) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const coords = await getCoords();
      await enqueue('/api/user/status', {
        userId: user.id,
        status: 'BUSY',
        lat: coords?.latitude ?? 0,
        lng: coords?.longitude ?? 0,
        at: new Date().toISOString(),
      });
      await AsyncStorage.setItem(SHIFT_KEY, 'BUSY');
      setState((s) => ({ ...s, status: 'BUSY', loading: false }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Status update failed',
      }));
      throw e;
    }
  }, [user, getCoords]);

  // ── Go Idle ───────────────────────────────────────────────────────────────

  const setIdle = useCallback(async () => {
    if (!user) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const coords = await getCoords();
      await enqueue('/api/user/status', {
        userId: user.id,
        status: 'IDLE',
        lat: coords?.latitude ?? 0,
        lng: coords?.longitude ?? 0,
        at: new Date().toISOString(),
      });
      await AsyncStorage.setItem(SHIFT_KEY, 'IDLE');
      setState((s) => ({ ...s, status: 'IDLE', loading: false }));
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : 'Status update failed',
      }));
      throw e;
    }
  }, [user, getCoords]);

  return (
    <ShiftContext.Provider value={{ ...state, clockIn, clockOut, setBusy, setIdle }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift(): ShiftContextValue {
  const ctx = useContext(ShiftContext);
  if (!ctx) throw new Error('useShift must be used within <ShiftProvider>');
  return ctx;
}
