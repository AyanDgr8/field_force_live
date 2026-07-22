/**
 * Route screen — the agent's ordered stop list for the day.
 *
 * Features:
 *  • Rich stop cards: address, status, priority, contact, planned time
 *  • Proximity detection: pops an Alert when within 10 m of a pending stop
 *  • Pull-to-refresh
 *  • Tap any stop → full stop-detail screen (disposition / close visit)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from '@/context/LocationContext';
import { useColors } from '@/hooks/useColors';
import { apiGet } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type StopStatus = 'PENDING' | 'EN_ROUTE' | 'REACHED' | 'COMPLETED' | 'SKIPPED';
type Priority   = 'P1' | 'P2' | 'P3';

export interface VisitStop {
  id: number;
  sequence: number | null;
  priority: Priority;
  customerCode: string;
  label: string | null;
  rawInput: string;
  latitude: number | null;
  longitude: number | null;
  status: StopStatus;
  contactName: string | null;
  contactPhone: string | null;
  plannedArrivalAt: string | null;
  reachedAt: string | null;
  closedAt: string | null;
  notes: string | null;
}

export interface DayPlan {
  id: number;
  userId: number;
  visitDate: string;
  status: 'DRAFT' | 'PUBLISHED';
  totalDistanceMeters: number;
  totalEtaSeconds: number;
  stops: VisitStop[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Haversine distance in metres between two lat/lng points */
function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function statusMeta(status: StopStatus) {
  switch (status) {
    case 'COMPLETED':
    case 'REACHED':  return { label: 'Closed',   color: '#22c55e', bg: '#f0fdf4' };
    case 'EN_ROUTE': return { label: 'En Route', color: '#f99207', bg: '#fff7ed' };
    case 'SKIPPED':  return { label: 'Skipped',  color: '#94a3b8', bg: '#f8fafc' };
    default:         return { label: 'Pending',  color: '#ef4444', bg: '#fef2f2' };
  }
}

function priorityMeta(p: Priority) {
  switch (p) {
    case 'P1': return { color: '#ef4444', bg: '#fef2f2', label: 'HIGH' };
    case 'P2': return { color: '#f59e0b', bg: '#fffbeb', label: 'NORMAL' };
    default:   return { color: '#6b7280', bg: '#f9fafb', label: 'LOW' };
  }
}

// ─── Proximity hook ───────────────────────────────────────────────────────────

function useProximityAlert(stops: VisitStop[]) {
  const { coords } = useLocation();
  const alertedIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!coords) return;
    const pending = stops.filter(
      (s) =>
        s.status === 'PENDING' &&
        s.latitude != null &&
        s.longitude != null &&
        !alertedIds.current.has(s.id),
    );
    for (const stop of pending) {
      const dist = haversineM(
        coords.latitude, coords.longitude,
        stop.latitude!, stop.longitude!,
      );
      if (dist <= 10) {
        alertedIds.current.add(stop.id);
        Alert.alert(
          '📍 You\'ve arrived!',
          `You are within 10 m of:\n${stop.customerCode}${stop.label ? ` — ${stop.label}` : ''}\n${stop.rawInput}`,
          [
            { text: 'Dismiss', style: 'cancel' },
            {
              text: 'Open Stop',
              onPress: () => router.push(`/stop/${stop.id}`),
            },
          ],
        );
        break; // one alert at a time
      }
    }
  }, [coords, stops]);
}

// ─── Stop Card ────────────────────────────────────────────────────────────────

function StopCard({
  stop,
  colors,
  onPress,
}: {
  stop: VisitStop;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const sm = statusMeta(stop.status);
  const pm = priorityMeta(stop.priority);
  const isDone = stop.status === 'COMPLETED' || stop.status === 'SKIPPED';

  return (
    <Pressable
      style={({ pressed }) => [
        c.card,
        { borderLeftColor: sm.color, backgroundColor: colors.card, opacity: pressed ? 0.9 : isDone ? 0.6 : 1 },
      ]}
      onPress={onPress}
    >
      {/* Sequence disc */}
      <View style={[c.seq, { backgroundColor: sm.color }]}>
        <Text style={c.seqText}>{stop.sequence ?? '—'}</Text>
      </View>

      <View style={c.body}>
        {/* Row 1: code + priority + status */}
        <View style={c.row}>
          <Text style={[c.code, { color: colors.foreground }]}>{stop.customerCode}</Text>

          <View style={[c.pill, { backgroundColor: pm.bg }]}>
            <Text style={[c.pillText, { color: pm.color }]}>{pm.label}</Text>
          </View>

          <View style={[c.pill, { backgroundColor: sm.bg }]}>
            <Text style={[c.pillText, { color: sm.color }]}>{sm.label}</Text>
          </View>
        </View>

        {/* Address */}
        <Text style={[c.addr, { color: colors.foreground }]} numberOfLines={2}>
          {stop.rawInput}
        </Text>
        {stop.label ? (
          <Text style={[c.label, { color: colors.mutedForeground }]}>{stop.label}</Text>
        ) : null}

        {/* Contact */}
        {stop.contactName || stop.contactPhone ? (
          <View style={c.row}>
            <Feather name="user" size={12} color={colors.mutedForeground} />
            <Text style={[c.meta, { color: colors.mutedForeground }]}>
              {[stop.contactName, stop.contactPhone].filter(Boolean).join('  ·  ')}
            </Text>
            {stop.contactPhone ? (
              <Pressable
                onPress={() => Linking.openURL(`tel:${stop.contactPhone}`)}
                style={c.callBtn}
                hitSlop={8}
              >
                <Feather name="phone" size={12} color={colors.primary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Planned time */}
        {stop.plannedArrivalAt ? (
          <View style={c.row}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[c.meta, { color: colors.mutedForeground }]}>
              ETA {new Date(stop.plannedArrivalAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : null}

        {/* Closed note */}
        {stop.closedAt ? (
          <View style={c.row}>
            <Feather name="check-circle" size={12} color={sm.color} />
            <Text style={[c.meta, { color: sm.color }]}>
              Closed {new Date(stop.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : null}
      </View>

      <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RouteScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const today = todayISO();

  const { data: plan, isLoading, error, refetch } = useQuery<DayPlan>({
    queryKey: ['mobile-day-plan', user?.id, today],
    queryFn: () => apiGet('/api/user/dayplan', { userId: user!.id, date: today }),
    enabled: !!user,
    staleTime: 30_000,
    retry: 1,
  });

  const stops = plan?.stops ?? [];
  useProximityAlert(stops);

  const completed = stops.filter(
    (s) => s.status === 'COMPLETED' || s.status === 'REACHED',
  ).length;
  const total = stops.length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 12, backgroundColor: colors.navy }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerSub}>
            {plan
              ? new Date(plan.visitDate + 'T12:00:00').toLocaleDateString([], {
                  weekday: 'long', month: 'long', day: 'numeric',
                })
              : new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
          <Text style={s.headerTitle}>Today's Stops</Text>
        </View>
        {total > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeNum}>{completed}/{total}</Text>
            <Text style={s.badgeLbl}>done</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      {total > 0 && (
        <View style={{ height: 4, backgroundColor: 'rgba(0,0,0,0.06)' }}>
          <View style={{ height: 4, width: `${Math.round((completed / total) * 100)}%` as `${number}%`, backgroundColor: colors.success }} />
        </View>
      )}

      {/* List */}
      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[s.msg, { color: colors.mutedForeground }]}>Loading stops…</Text>
        </View>
      ) : error ? (
        <View style={s.center}>
          <Feather name="wifi-off" size={40} color={colors.mutedForeground} />
          <Text style={[s.msg, { color: colors.mutedForeground }]}>
            {(error as Error).message?.includes('404')
              ? 'No route published for today.\nCheck with your manager.'
              : "Couldn't load your route. Pull to retry."}
          </Text>
          <Pressable style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <StopCard
              stop={item}
              colors={colors}
              onPress={() => router.push(`/stop/${item.id}`)}
            />
          )}
          contentContainerStyle={[{ padding: 16 }, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Feather name="check-circle" size={44} color={colors.success} />
              <Text style={[s.msg, { color: colors.mutedForeground }]}>No stops assigned for today.</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 2 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' as const },
  badge: { alignItems: 'center' },
  badgeNum: { color: '#fff', fontSize: 22, fontWeight: '700' as const },
  badgeLbl: { color: 'rgba(255,255,255,0.6)', fontSize: 11 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, paddingTop: 80 },
  msg: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' as const },
});

const c = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  seq: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  seqText: { color: '#fff', fontSize: 12, fontWeight: '700' as const },
  body: { flex: 1, gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  code: { fontSize: 15, fontWeight: '700' as const },
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  pillText: { fontSize: 10, fontWeight: '700' as const },
  addr: { fontSize: 13, lineHeight: 19, opacity: 0.9 },
  label: { fontSize: 11, fontStyle: 'italic' },
  meta: { fontSize: 12 },
  callBtn: { marginLeft: 2 },
});
