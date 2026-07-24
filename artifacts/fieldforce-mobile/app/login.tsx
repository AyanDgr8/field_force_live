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
import { apiPost } from '@/lib/api';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<'none' | 'request' | 'confirm'>('none');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

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

  const requestReset = async () => {
    if (!resetEmail.trim()) {
      setError('Enter the email address for your agent account.');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await apiPost<{ resetToken: string; message: string }>(
        '/api/user/auth/password-reset/request',
        { email: resetEmail.trim().toLowerCase() },
        null,
      );
      setResetToken(data.resetToken);
      setMessage(data.message);
      setResetStep('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!/^\d{6}$/.test(resetCode)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must contain at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ message: string }>(
        '/api/user/auth/password-reset/confirm',
        { resetToken, code: resetCode, newPassword },
        null,
      );
      setResetStep('none');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResetCode('');
      setMessage(data.message);
      setIdentifier(resetEmail.trim().toLowerCase());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reset password');
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
          <Text style={s.heading}>
            {resetStep === 'none' ? 'Sign In' : 'Reset Password'}
          </Text>
          <Text style={s.subheading}>
            {resetStep === 'none'
              ? 'Use your email or employee ID to continue'
              : resetStep === 'request'
                ? 'We will email a 6-digit code to your registered address'
                : 'Enter the code from your email and choose a new password'}
          </Text>

          {error ? (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={16} color="#ef4444" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          {message ? (
            <View style={s.successBox}>
              <Feather name="check-circle" size={16} color="#16a34a" />
              <Text style={s.successText}>{message}</Text>
            </View>
          ) : null}

          {resetStep === 'none' ? (
            <>
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
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Pressable onPress={() => {
                setResetEmail(identifier.includes('@') ? identifier : '');
                setResetStep('request');
                setError(null);
                setMessage(null);
              }}>
                <Text style={s.linkText}>Forgot password?</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [s.btn, pressed && s.btnPressed, loading && s.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                testID="login-btn"
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
              </Pressable>
            </>
          ) : resetStep === 'request' ? (
            <>
              <Text style={s.label}>Registered email</Text>
              <View style={s.inputWrap}>
                <Feather name="mail" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.input}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!loading}
                  placeholder="agent@company.com"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Pressable style={s.btn} onPress={requestReset} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Email Reset Code</Text>}
              </Pressable>
              <Pressable onPress={() => setResetStep('none')} disabled={loading}>
                <Text style={s.linkText}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.label}>6-digit reset code</Text>
              <View style={s.inputWrap}>
                <Feather name="hash" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.input}
                  value={resetCode}
                  onChangeText={(value) => setResetCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  placeholder="000000"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Text style={s.label}>New password</Text>
              <View style={s.inputWrap}>
                <Feather name="lock" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Text style={s.label}>Confirm new password</Text>
              <View style={s.inputWrap}>
                <Feather name="lock" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                  placeholder="Repeat new password"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <Pressable onPress={() => setShowPassword((value) => !value)}>
                <Text style={s.linkText}>{showPassword ? 'Hide passwords' : 'Show passwords'}</Text>
              </Pressable>
              <Pressable style={s.btn} onPress={confirmReset} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Update Password</Text>}
              </Pressable>
              <Pressable onPress={() => setResetStep('request')} disabled={loading}>
                <Text style={s.linkText}>Request another code</Text>
              </Pressable>
            </>
          )}
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
    successBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#f0fdf4',
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    successText: { fontSize: 14, color: '#166534', flex: 1 },
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
    linkText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600' as const,
      textAlign: 'center',
      marginVertical: 10,
    },
  });
