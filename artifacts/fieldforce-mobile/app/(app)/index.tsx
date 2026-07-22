/**
 * Home screen — map view with stop pins + shift Login/Logout bar.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from '@/context/LocationContext';
import { useShift } from '@/context/ShiftContext';
import { useColors } from '@/hooks/useColors';
import { apiGet } from '@/lib/api';
import type { DayPlan, VisitStop } from './route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function statusColor(_status: string) {
  // All customer stops use red — the blue dot from showsUserLocation
  // already marks the agent's own position.
  return '#ef4444';
}

// ─── Map view (native only) ───────────────────────────────────────────────────

function MapPane({
  stops,
  agentCoords,
  onStopPress,
}: {
  stops: VisitStop[];
  agentCoords: { latitude: number; longitude: number } | null;
  onStopPress: (stop: VisitStop) => void;
}) {
  // Lazy-import so web bundle doesn't break
  const [MapModule, setMapModule] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      import('react-native-maps').then((mod) => setMapModule(mod));
    }
  }, []);

  if (Platform.OS === 'web') {
    return (
      <View style={mp.webFallback}>
        <Feather name="map" size={36} color="#94a3b8" />
        <Text style={mp.webText}>Map view available on device</Text>
        <Text style={mp.webSub}>Open in Expo Go to see stop pins on the map</Text>
      </View>
    );
  }

  if (!MapModule) {
    return (
      <View style={mp.webFallback}>
        <ActivityIndicator color="#f99207" />
      </View>
    );
  }

  const { default: MapView, Marker, PROVIDER_DEFAULT } = MapModule;

  // Don't render until we have the agent's real position — avoids jumping to
  // a fallback location on startup.
  if (!agentCoords) {
    return (
      <View style={[mp.webFallback, { backgroundColor: '#e5e7eb' }]}>
        <ActivityIndicator color="#f99207" size="large" />
        <Text style={[mp.webSub, { marginTop: 8 }]}>Getting your location…</Text>
      </View>
    );
  }

  const validStops = stops.filter((s) => s.latitude != null && s.longitude != null);

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={{
        latitude: agentCoords.latitude,
        longitude: agentCoords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
      showsUserLocation
      showsMyLocationButton
    >
      {validStops.map((stop) => (
        <Marker
          key={stop.id}
          coordinate={{ latitude: stop.latitude!, longitude: stop.longitude! }}
          onPress={() => onStopPress(stop)}
          pinColor={statusColor(stop.status)}
          title={`#${stop.sequence ?? '?'} ${stop.customerCode}`}
          description={stop.rawInput}
        />
      ))}
    </MapView>
  );
}

const mp = StyleSheet.create({
  webFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
    gap: 10,
  },
  webText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  webSub: { fontSize: 13, color: '#6b7280', textAlign: 'center', paddingHorizontal: 32 },
});

// ─── Shift bar ────────────────────────────────────────────────────────────────

function ShiftBar({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { status, loading, clockedInAt, clockIn, clockOut, setBusy, setIdle } = useShift();

  const clockedInTime = clockedInAt
    ? new Date(clockedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const handleClockIn = async () => {
    try {
      await clockIn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Clock-in failed', (e as Error).message);
    }
  };

  const handleClockOut = () => {
    Alert.alert('Clock Out', 'End your shift now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await clockOut();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert('Clock-out failed', (e as Error).message);
          }
        },
      },
    ]);
  };

  const handleBusy = async () => {
    try { await setBusy(); Haptics.selectionAsync(); }
    catch (e) { Alert.alert('Error', (e as Error).message); }
  };

  const handleIdle = async () => {
    try { await setIdle(); Haptics.selectionAsync(); }
    catch (e) { Alert.alert('Error', (e as Error).message); }
  };

  return (
    <View style={[sb.wrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      {/* Status pill */}
      <View style={sb.left}>
        <View style={[sb.dot, {
          backgroundColor:
            status === 'CLOCKED_OUT' ? colors.neutral :
            status === 'BUSY'        ? colors.warning  : colors.success,
        }]} />
        <Text style={[sb.statusTxt, { color: colors.foreground }]}>
          {status === 'CLOCKED_OUT' ? 'Off Shift' : status === 'BUSY' ? 'Busy' : 'Idle'}
        </Text>
        {clockedInTime && (
          <Text style={[sb.since, { color: colors.mutedForeground }]}>· since {clockedInTime}</Text>
        )}
      </View>

      <View style={sb.right}>
        {status === 'CLOCKED_OUT' ? (
          /* ── Clock In ── */
          <Pressable
            style={({ pressed }) => [sb.btn, { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 }]}
            onPress={handleClockIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Feather name="log-in" size={14} color="#fff" /><Text style={sb.btnTxt}>Login / Clock In</Text></>}
          </Pressable>
        ) : (
          <>
            {/* Busy / Idle toggle */}
            {status === 'IDLE' ? (
              <Pressable
                style={({ pressed }) => [sb.btn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleBusy}
                disabled={loading}
              >
                <Feather name="navigation" size={14} color="#fff" />
                <Text style={sb.btnTxt}>Go Busy</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [sb.btn, { backgroundColor: colors.navy, opacity: pressed ? 0.85 : 1 }]}
                onPress={handleIdle}
                disabled={loading}
              >
                <Feather name="pause-circle" size={14} color="#fff" />
                <Text style={sb.btnTxt}>Go Idle</Text>
              </Pressable>
            )}

            {/* Clock Out */}
            <Pressable
              style={({ pressed }) => [
                sb.btn,
                { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.destructive, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={handleClockOut}
              disabled={loading}
            >
              <Feather name="log-out" size={14} color={colors.destructive} />
              <Text style={[sb.btnTxt, { color: colors.destructive }]}>Logout / Clock Out</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
    flexWrap: 'wrap',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  statusTxt: { fontSize: 13, fontWeight: '600' as const },
  since: { fontSize: 12 },
  right: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnTxt: { color: '#fff', fontSize: 12, fontWeight: '700' as const },
});

// ─── Stop callout card (tapped pin) ──────────────────────────────────────────

function StopCallout({
  stop,
  colors,
  onDismiss,
  onOpen,
}: {
  stop: VisitStop;
  colors: ReturnType<typeof useColors>;
  onDismiss: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={[sc.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[sc.code, { color: colors.foreground }]}>
          #{stop.sequence ?? '—'}  {stop.customerCode}
        </Text>
        <Text style={[sc.addr, { color: colors.mutedForeground }]} numberOfLines={2}>
          {stop.rawInput}
        </Text>
        {stop.contactName ? (
          <Text style={[sc.contact, { color: colors.mutedForeground }]}>
            {stop.contactName}{stop.contactPhone ? ` · ${stop.contactPhone}` : ''}
          </Text>
        ) : null}
      </View>
      <View style={sc.btns}>
        <Pressable onPress={onOpen} style={[sc.openBtn, { backgroundColor: colors.primary }]}>
          <Text style={sc.openTxt}>Open</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const sc = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  code: { fontSize: 15, fontWeight: '700' as const, marginBottom: 3 },
  addr: { fontSize: 12, lineHeight: 17 },
  contact: { fontSize: 12, marginTop: 2 },
  btns: { alignItems: 'center', gap: 8 },
  openBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  openTxt: { color: '#fff', fontWeight: '700' as const, fontSize: 13 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { coords, getCoords } = useLocation();
  const [selectedStop, setSelectedStop] = useState<VisitStop | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Fetch current position immediately on mount so the map centres on the
  // agent right away rather than waiting for the 30-second polling interval.
  useEffect(() => {
    getCoords();
  }, [getCoords]);

  const today = todayISO();

  const { data: plan, isLoading } = useQuery<DayPlan>({
    queryKey: ['mobile-day-plan', user?.id, today],
    queryFn: () => apiGet('/api/user/dayplan', { userId: user!.id, date: today }),
    enabled: !!user,
    staleTime: 30_000,
    retry: 1,
  });

  const stops = plan?.stops ?? [];

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Navy header */}
      <View style={[s.header, { paddingTop: topPad + 8, backgroundColor: colors.navy }]}>
        <Text style={s.title}>FieldForce Live</Text>
        {plan && (
          <Text style={s.sub}>
            {stops.length} stop{stops.length !== 1 ? 's' : ''} ·{' '}
            {new Date(plan.visitDate + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </View>

      {/* Shift bar — Login / Busy / Logout */}
      <ShiftBar colors={colors} />

      {/* Map fills remaining space */}
      <View style={s.mapContainer}>
        {isLoading ? (
          <View style={mp.webFallback}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <MapPane
            stops={stops}
            agentCoords={coords}
            onStopPress={(stop) => setSelectedStop(stop)}
          />
        )}

        {/* Stop callout card */}
        {selectedStop && (
          <StopCallout
            stop={selectedStop}
            colors={colors}
            onDismiss={() => setSelectedStop(null)}
            onOpen={() => {
              setSelectedStop(null);
              router.push(`/stop/${selectedStop.id}`);
            }}
          />
        )}

        {/* No-plan overlay */}
        {!isLoading && stops.length === 0 && (
          <View style={s.noPlanOverlay}>
            <Feather name="map" size={28} color="#6b7280" />
            <Text style={s.noPlanText}>No stops published for today</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' as const },
  sub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  mapContainer: { flex: 1 },
  noPlanOverlay: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  noPlanText: { fontSize: 14, color: '#374151', fontWeight: '600' as const },
});
