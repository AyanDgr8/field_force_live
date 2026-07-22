import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
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

export default function SosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getCoords } = useLocation();

  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastPing, setLastPing] = useState<Date | null>(null);

  // Pulse animation
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  const pulse1Opacity = useRef(new Animated.Value(0.6)).current;
  const pulse2Opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!active) {
      pulse1.setValue(1);
      pulse2.setValue(1);
      return;
    }
    const anim1 = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse1, {
            toValue: 1.8,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulse1, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulse1Opacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulse1Opacity, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    const anim2 = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.delay(350),
          Animated.timing(pulse2, {
            toValue: 1.8,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulse2, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(350),
          Animated.timing(pulse2Opacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulse2Opacity, {
            toValue: 0.4,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    anim1.start();
    anim2.start();
    return () => {
      anim1.stop();
      anim2.stop();
    };
  }, [active, pulse1, pulse2, pulse1Opacity, pulse2Opacity]);

  const toggle = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const coords = await getCoords();
      await apiPost('/api/user/emergency', {
        userId: user.id,
        active: !active,
        lat: coords?.latitude ?? 0,
        lng: coords?.longitude ?? 0,
      });
      setActive((v) => !v);
      setLastPing(new Date());
      if (!active) {
        // activating SOS — strong haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }, [user, active, getCoords]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const btnSize = 160;

  return (
    <View
      style={[
        s.root,
        {
          backgroundColor: active ? '#1a0a0a' : colors.navy,
          paddingTop: topPad,
          paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0),
        },
      ]}
    >
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Emergency SOS</Text>
        <Text style={s.headerSub}>
          {active
            ? 'SOS signal active — admin has been alerted'
            : 'Tap to send an emergency alert to your manager'}
        </Text>
      </View>

      {/* Status */}
      <View style={[s.statusChip, { backgroundColor: active ? '#ef444430' : '#ffffff15' }]}>
        <View style={[s.dot, { backgroundColor: active ? '#ef4444' : '#94a3b8' }]} />
        <Text style={[s.statusText, { color: active ? '#ef4444' : '#94a3b8' }]}>
          {active ? 'SOS ACTIVE' : 'STANDBY'}
        </Text>
      </View>

      {/* Button area */}
      <View style={s.btnWrap}>
        {/* Pulse rings */}
        {active && (
          <>
            <Animated.View
              style={[
                s.pulse,
                {
                  width: btnSize,
                  height: btnSize,
                  borderRadius: btnSize / 2,
                  backgroundColor: '#ef444440',
                  transform: [{ scale: pulse1 }],
                  opacity: pulse1Opacity,
                },
              ]}
            />
            <Animated.View
              style={[
                s.pulse,
                {
                  width: btnSize,
                  height: btnSize,
                  borderRadius: btnSize / 2,
                  backgroundColor: '#ef444430',
                  transform: [{ scale: pulse2 }],
                  opacity: pulse2Opacity,
                },
              ]}
            />
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            s.btn,
            {
              width: btnSize,
              height: btnSize,
              borderRadius: btnSize / 2,
              backgroundColor: active ? '#ef4444' : '#ef444420',
              borderColor: active ? '#ef4444' : '#ef444460',
              opacity: pressed ? 0.88 : 1,
            },
          ]}
          onPress={toggle}
          disabled={loading}
          testID="sos-btn"
        >
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              <Feather
                name={active ? 'x' : 'alert-triangle'}
                size={44}
                color="#fff"
              />
              <Text style={s.btnLabel}>{active ? 'CANCEL' : 'SOS'}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Last ping */}
      {lastPing && (
        <Text style={s.lastPing}>
          {active ? 'Alert sent at ' : 'Cancelled at '}
          {lastPing.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}

      {/* Info cards */}
      <View style={[s.infoCard, { borderColor: '#ffffff20', backgroundColor: '#ffffff08' }]}>
        <Feather name="info" size={16} color="rgba(255,255,255,0.5)" />
        <Text style={s.infoText}>
          Your GPS location is sent immediately to your manager. Use only in genuine emergencies.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  header: { paddingHorizontal: 32, paddingTop: 40, paddingBottom: 20, alignItems: 'center' },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 40,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 1 },
  btnWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  pulse: {
    position: 'absolute',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    gap: 4,
  },
  btnLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900' as const,
    letterSpacing: 2,
  },
  lastPing: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginBottom: 32,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 'auto',
    marginBottom: 16,
  },
  infoText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
  },
});
