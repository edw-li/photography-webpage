import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type AuthUser, login as apiLogin, register as apiRegister, getCurrentUser, apiLogout, logout as apiLogoutSync } from '../api/auth';
import { getAccessToken } from '../api/client';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  logoutKey: number;
  login: (email: string, password: string, options?: { turnstileToken?: string | null }) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string, options?: { hp?: string; turnstileToken?: string | null }) => Promise<{ message: string }>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutKey, setLogoutKey] = useState(0);

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      getCurrentUser()
        .then(setUser)
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string, options?: { turnstileToken?: string | null }) => {
    const u = await apiLogin(email, password, options);
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string, firstName: string, lastName: string, options?: { hp?: string; turnstileToken?: string | null }) => {
    return apiRegister(email, password, firstName, lastName, options);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await getCurrentUser();
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    // Fire server-side logout (best-effort), then clear local state
    apiLogout().catch(() => {});
    // Also clear synchronously for immediate UI response
    apiLogoutSync();
    setUser(null);
    setLogoutKey(k => k + 1);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: user !== null,
        isAdmin: user?.role === 'admin',
        logoutKey,
        login,
        register,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
