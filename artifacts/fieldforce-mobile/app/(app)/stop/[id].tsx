import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from '@/context/LocationContext';
import { useColors } from '@/hooks/useColors';
import { apiGet, apiPost } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type StopStatus = 'PENDING' | 'EN_ROUTE' | 'REACHED' | 'COMPLETED' | 'SKIPPED';

interface VisitStop {
  id: number;
  sequence: number | null;
  priority: string;
  customerCode: string;
  label: string | null;
  rawInput: string;
  latitude: number;
  longitude: number;
  status: StopStatus;
  contactName: string | null;
  contactPhone: string | null;
  plannedArrivalAt: string | null;
  reachedAt: string | null;
  startedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  dispositionId: number | null;
}

interface DayPlan {
  id: number;
  userId: number;
  visitDate: string;
  stops: VisitStop[];
}

interface Disposition {
  id: number;
  label: string;
  active: boolean;
  sortOrder: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function openMaps(
  destLat: number,
  destLng: number,
  label: string,
  originLat?: number | null,
  originLng?: number | null,
) {
  const encoded = encodeURIComponent(label);
  if (Platform.OS === 'ios') {
    const origin = originLat != null && originLng != null
      ? `&saddr=${originLat},${originLng}`
      : '';
    Linking.openURL(`maps://?daddr=${destLat},${destLng}${origin}&q=${encoded}`);
  } else {
    const origin = originLat != null && originLng != null
      ? `&origin=${originLat},${originLng}`
      : '';
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}${origin}`,
    );
  }
}

function statusColor(status: StopStatus) {
  switch (status) {
    case 'COMPLETED':
    case 'REACHED':   return '#22c55e';
    case 'EN_ROUTE':  return '#f99207';
    case 'SKIPPED':   return '#94a3b8';
    default:          return '#ef4444';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StopDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { getCoords, coords: liveCoords } = useLocation();
  const queryClient = useQueryClient();

  const [actionLoading, setActionLoading] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  const today = todayISO();

  // Fetch day plan and find this stop
  const { data: plan, isLoading } = useQuery<DayPlan>({
    queryKey: ['mobile-day-plan', user?.id, today],
    queryFn: () => apiGet('/api/user/dayplan', { userId: user!.id, date: today }),
    enabled: !!user,
    staleTime: 30_000,
  });

  // Fetch dispositions for close form
  const { data: dispositions } = useQuery<Disposition[]>({
    queryKey: ['dispositions', user?.customerId],
    queryFn: () =>
      apiGet('/api/config/dispositions', { customerId: user!.customerId }),
    enabled: !!user && showCloseForm,
    staleTime: 300_000,
  });

  const stop = plan?.stops.find((s) => String(s.id) === id);

  const invalidatePlan = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mobile-day-plan', user?.id, today] });
  }, [queryClient, user?.id, today]);

  // Mark stop as EN_ROUTE + update agent status
  const handleImHere = useCallback(async () => {
    if (!stop || !user) return;
    setActionLoading(true);
    try {
      const coords = await getCoords();
      const now = new Date().toISOString();

      // Update agent status to BUSY at this stop
      if (coords) {
        await apiPost('/api/user/status', {
          userId: user.id,
          status: 'BUSY',
          visitStopId: stop.id,
          lat: coords.latitude,
          lng: coords.longitude,
          at: now,
        });
      }

      // Mark stop EN_ROUTE via admin endpoint (same DB)
      await apiPost(`/api/visit-stops/${stop.id}`, null).catch(() => null); // graceful

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidatePlan();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [stop, user, getCoords, invalidatePlan]);

  // Close visit with disposition
  const handleClose = useCallback(async () => {
    if (!stop || !user || !selectedDisposition) {
      Alert.alert('Select a disposition first');
      return;
    }
    setActionLoading(true);
    try {
      const coords = await getCoords();
      const now = new Date().toISOString();
      await apiPost(`/api/user/visit/${stop.id}/disposition`, {
        dispositionId: selectedDisposition,
        notes: notes.trim() || undefined,
        reachedAt: stop.reachedAt ?? now,
        startedAt: stop.startedAt ?? now,
        closedAt: now,
        lat: coords?.latitude,
        lng: coords?.longitude,
      });

      // Set status back to IDLE
      if (coords) {
        await apiPost('/api/user/status', {
          userId: user.id,
          status: 'IDLE',
          lat: coords.latitude,
          lng: coords.longitude,
          at: now,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidatePlan();
      router.back();
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setActionLoading(false);
    }
  }, [stop, user, selectedDisposition, notes, getCoords, invalidatePlan]);

  if (isLoading || !stop) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <Text style={{ color: colors.mutedForeground }}>Stop not found</Text>
        )}
      </View>
    );
  }

  const accent = statusColor(stop.status);
  const isDone = stop.status === 'COMPLETED' || stop.status === 'SKIPPED';
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: stop.customerCode,
          headerBackTitle: 'Route',
          headerTintColor: '#ffffff',
          headerStyle: { backgroundColor: colors.navy } as never,
          headerTitleStyle: { color: '#ffffff' },
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          s.container,
          { paddingBottom: insets.bottom + 32, paddingTop: Platform.OS === 'web' ? topPad : 0 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status pill */}
        <View style={[s.statusRow, { backgroundColor: accent + '18', borderColor: accent + '55' }]}>
          <View style={[s.statusDot, { backgroundColor: accent }]} />
          <Text style={[s.statusLabel, { color: accent }]}>
            {stop.status.replace('_', ' ')}
          </Text>
          {stop.sequence !== null && (
            <Text style={[s.seqLabel, { color: colors.mutedForeground }]}>
              Stop #{stop.sequence}
            </Text>
          )}
        </View>

        {/* Address card */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ADDRESS</Text>
          <Text style={[s.addressText, { color: colors.foreground }]}>{stop.rawInput}</Text>
          {stop.label ? (
            <Text style={[s.addressSub, { color: colors.mutedForeground }]}>{stop.label}</Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              s.mapsBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={() => openMaps(stop.latitude, stop.longitude, stop.rawInput, liveCoords?.latitude, liveCoords?.longitude)}
          >
            <Feather name="navigation" size={16} color="#fff" />
            <Text style={s.mapsBtnText}>Navigate</Text>
          </Pressable>
        </View>

        {/* Contact card */}
        {(stop.contactName || stop.contactPhone) ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>CONTACT</Text>
            {stop.contactName && (
              <View style={s.row}>
                <Feather name="user" size={16} color={colors.mutedForeground} />
                <Text style={[s.contactValue, { color: colors.foreground }]}>{stop.contactName}</Text>
              </View>
            )}
            {stop.contactPhone && (
              <Pressable
                style={s.row}
                onPress={() => Linking.openURL(`tel:${stop.contactPhone}`)}
              >
                <Feather name="phone" size={16} color={colors.primary} />
                <Text style={[s.contactValue, { color: colors.primary }]}>{stop.contactPhone}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {/* Notes (if any) */}
        {stop.notes ? (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>NOTES</Text>
            <Text style={[s.addressText, { color: colors.foreground }]}>{stop.notes}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={s.actions}>
            {/* Navigate — always visible */}
            <Pressable
              style={({ pressed }) => [
                s.actionBtn,
                {
                  backgroundColor: 'transparent',
                  borderWidth: 1.5,
                  borderColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={() => openMaps(stop.latitude, stop.longitude, stop.rawInput, liveCoords?.latitude, liveCoords?.longitude)}
            >
              <Feather name="navigation" size={18} color={colors.primary} />
              <Text style={[s.actionBtnText, { color: colors.primary }]}>Navigate</Text>
            </Pressable>

            {!isDone && (
              <>
                {/* I'm Here — set status BUSY */}
                {stop.status === 'PENDING' && (
                  <Pressable
                    style={({ pressed }) => [
                      s.actionBtn,
                      { backgroundColor: colors.navyMid, opacity: pressed ? 0.85 : 1 },
                    ]}
                    onPress={handleImHere}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Feather name="map-pin" size={18} color="#fff" />
                        <Text style={s.actionBtnText}>I'm Here</Text>
                      </>
                    )}
                  </Pressable>
                )}

                {/* Close Visit */}
                <Pressable
                  style={({ pressed }) => [
                    s.actionBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                  ]}
                  onPress={() => setShowCloseForm((v) => !v)}
                  disabled={actionLoading}
                >
                  <Feather name="check-circle" size={18} color="#fff" />
                  <Text style={s.actionBtnText}>Close Visit</Text>
                </Pressable>
              </>
            )}
          </View>

        {/* Close visit form */}
        {showCloseForm && !isDone && (
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>OUTCOME</Text>

            {!dispositions ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={s.dispositionGrid}>
                {dispositions
                  .filter((d) => d.active)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((d) => (
                    <Pressable
                      key={d.id}
                      style={[
                        s.dispChip,
                        {
                          backgroundColor:
                            selectedDisposition === d.id
                              ? colors.primary
                              : colors.muted,
                          borderColor:
                            selectedDisposition === d.id
                              ? colors.primary
                              : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedDisposition(d.id);
                        Haptics.selectionAsync();
                      }}
                    >
                      <Text
                        style={[
                          s.dispChipText,
                          {
                            color:
                              selectedDisposition === d.id
                                ? '#fff'
                                : colors.foreground,
                          },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            )}

            <TextInput
              style={[
                s.notesInput,
                {
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              placeholder="Add notes (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              maxLength={250}
            />

            <Pressable
              style={({ pressed }) => [
                s.submitBtn,
                {
                  backgroundColor: selectedDisposition
                    ? colors.success
                    : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={handleClose}
              disabled={actionLoading || !selectedDisposition}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.submitBtnText}>Confirm & Close</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, gap: 12 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontWeight: '700' as const, flex: 1 },
  seqLabel: { fontSize: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
  addressText: { fontSize: 15, lineHeight: 22, fontWeight: '500' as const },
  addressSub: { fontSize: 13 },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  mapsBtnText: { color: '#fff', fontWeight: '600' as const, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactValue: { fontSize: 15, fontWeight: '500' as const },
  actions: { gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  dispositionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  dispChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dispChipText: { fontSize: 14, fontWeight: '500' as const },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' as const },
});
