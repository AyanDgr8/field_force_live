import React, { useCallback, useEffect } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from '@/context/LocationContext';
import { useColors } from '@/hooks/useColors';
import { apiPost } from '@/lib/api';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { permissionGranted, requestPermission, getCoords, pendingSync } = useLocation();

  // Request location permission if not granted
  useEffect(() => {
    if (!permissionGranted) {
      requestPermission();
    }
  }, [permissionGranted, requestPermission]);

  const handleLogout = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            const coords = await getCoords();
            if (user && coords) {
              await apiPost('/api/ingest/session', {
                userId: user.id,
                event: 'LOGOUT',
                latitude: coords.latitude,
                longitude: coords.longitude,
                at: new Date().toISOString(),
              });
            }
          } catch {
            // swallow — logout anyway
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await logout();
        },
      },
    ]);
  }, [user, getCoords, logout]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!user) return null;

  const initials =
    (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[
        s.container,
        { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 90), paddingTop: topPad },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar + name */}
      <View style={[s.avatarSection, { backgroundColor: colors.navy }]}>
        <View style={[s.avatar, { backgroundColor: colors.primary }]}>
          <Text style={s.avatarText}>{initials.toUpperCase()}</Text>
        </View>
        <Text style={s.name}>
          {user.firstName} {user.lastName}
        </Text>
        <Text style={s.employeeCode}>{user.employeeCode}</Text>
        <View style={s.roleBadge}>
          <Text style={s.roleText}>{user.role}</Text>
        </View>
      </View>

      {/* Info cards */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
        <Row icon="mail" label="Email" value={user.email} colors={colors} />
        <Row icon="briefcase" label="Employee ID" value={user.employeeCode} colors={colors} />
        <Row icon="shield" label="Role" value={user.role} colors={colors} />
      </View>

      {/* Location permission */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>PERMISSIONS</Text>
        <View style={s.row}>
          <View style={s.rowLeft}>
            <Feather
              name="map-pin"
              size={18}
              color={permissionGranted ? colors.success : colors.mutedForeground}
            />
            <Text style={[s.rowLabel, { color: colors.foreground }]}>Location Access</Text>
          </View>
          {permissionGranted ? (
            <View style={[s.permBadge, { backgroundColor: '#22c55e20' }]}>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: '600' as const }}>
                Granted
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={requestPermission}
              style={[s.permBadge, { backgroundColor: colors.primary + '20' }]}
            >
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' as const }}>
                Enable
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* About */}
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>APP</Text>
        <Row icon="info" label="Version" value="1.0.0" colors={colors} />
        <Row icon="server" label="Build" value="FieldForce Live" colors={colors} />
        <Row
          icon={pendingSync > 0 ? 'cloud-off' : 'cloud'}
          label="Offline sync"
          value={pendingSync > 0 ? `${pendingSync} pending` : 'Up to date'}
          colors={colors}
        />
      </View>

      {/* Logout */}
      <Pressable
        style={({ pressed }) => [
          s.logoutBtn,
          { borderColor: colors.destructive, opacity: pressed ? 0.8 : 1 },
        ]}
        onPress={handleLogout}
        testID="logout-btn"
      >
        <Feather name="log-out" size={18} color={colors.destructive} />
        <Text style={[s.logoutText, { color: colors.destructive }]}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
  colors,
}: {
  icon: string;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={s.row}>
      <View style={s.rowLeft}>
        <Feather name={icon as never} size={18} color={colors.mutedForeground} />
        <Text style={[s.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[s.rowValue, { color: colors.foreground }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 12 },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 6,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700' as const,
  },
  name: { color: '#ffffff', fontSize: 20, fontWeight: '700' as const },
  employeeCode: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(249,146,7,0.2)',
    marginTop: 4,
  },
  roleText: {
    color: '#f99207',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  card: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500' as const, flexShrink: 1, marginLeft: 12, textAlign: 'right' },
  permBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  logoutText: { fontSize: 15, fontWeight: '700' as const },
});
