import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!identifier.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { backgroundColor: colors.navy }]}>
      {/* Top brand area */}
      <View style={[s.brand, { paddingTop: insets.top + 48 }]}>
        <View style={s.logoRing}>
          <Feather name="map-pin" size={32} color={colors.amber} />
        </View>
        <Text style={s.appName}>FieldForce Live</Text>
        <Text style={s.tagline}>Field Agent Portal</Text>
      </View>

      {/* Form card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.formWrapper}
      >
        <ScrollView
          contentContainerStyle={[s.formCard, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.heading}>Sign In</Text>
          <Text style={s.subheading}>
            Use your email or employee ID to continue
          </Text>

          {error ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={16} color="#ef4444" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Identifier */}
          <Text style={s.label}>Email / Employee ID</Text>
          <View style={s.inputWrap}>
            <Feather name="user" size={18} color={colors.mutedForeground} style={s.inputIcon} />
            <TextInput
              style={s.input}
              placeholder="e.g. john.doe@company.com"
              placeholderTextColor={colors.mutedForeground}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              editable={!loading}
              testID="identifier-input"
            />
          </View>

          {/* Password */}
          <Text style={s.label}>Password</Text>
          <View style={s.inputWrap}>
            <Feather name="lock" size={18} color={colors.mutedForeground} style={s.inputIcon} />
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
              testID="password-input"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={12}>
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={18}
                color={colors.mutedForeground}
              />
            </Pressable>
          </View>

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [s.btn, pressed && s.btnPressed, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            testID="login-btn"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>Sign In</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    root: { flex: 1 },
    brand: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 32,
    },
    logoRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(249,146,7,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    appName: {
      fontSize: 26,
      fontWeight: '700' as const,
      color: '#ffffff',
      letterSpacing: 0.3,
    },
    tagline: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.55)',
      marginTop: 4,
    },
    formWrapper: { flex: 1 },
    formCard: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 24,
      paddingTop: 32,
    },
    heading: {
      fontSize: 22,
      fontWeight: '700' as const,
      color: colors.foreground,
      marginBottom: 4,
    },
    subheading: {
      fontSize: 14,
      color: colors.mutedForeground,
      marginBottom: 24,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fef2f2',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    errorText: { fontSize: 14, color: '#ef4444', flex: 1 },
    label: {
      fontSize: 13,
      fontWeight: '600' as const,
      color: colors.foreground,
      marginBottom: 6,
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 14 : 10,
      marginBottom: 16,
      gap: 8,
    },
    inputIcon: { marginRight: 2 },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
    },
    btn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    btnPressed: { opacity: 0.85 },
    btnDisabled: { opacity: 0.6 },
    btnText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700' as const,
    },
  });
