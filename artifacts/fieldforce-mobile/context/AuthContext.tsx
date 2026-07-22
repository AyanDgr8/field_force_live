import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost, setApiToken } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MobileUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  customerId: number;
  role: 'ADMIN' | 'USER';
}

interface AuthState {
  token: string | null;
  user: MobileUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'ff_device_token';
const USER_KEY  = 'ff_user';

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    loading: true,
  });

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await AsyncStorage.multiGet([
          TOKEN_KEY,
          USER_KEY,
        ]);
        const token = storedToken[1];
        const user: MobileUser | null = storedUser[1]
          ? JSON.parse(storedUser[1])
          : null;
        if (token) setApiToken(token);
        setState({ token, user, loading: false });
      } catch {
        setState({ token: null, user: null, loading: false });
      }
    })();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await apiPost<{ deviceToken: string; user: MobileUser }>(
      '/api/user/auth/login',
      { identifier, password },
      null, // no existing token during login
    );
    setApiToken(data.deviceToken);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, data.deviceToken],
      [USER_KEY, JSON.stringify(data.user)],
    ]);
    setState({ token: data.deviceToken, user: data.user, loading: false });
  }, []);

  const logout = useCallback(async () => {
    setApiToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setState({ token: null, user: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
