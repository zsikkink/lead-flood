'use client';

import type { LoginResponse } from '@lead-flood/contracts';
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiClient } from './api-client.js';
import { getWebEnv } from './env.js';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  apiClient: ApiClient;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'lf_access_token';
const USER_KEY = 'lf_user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser) as AuthUser);
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }

    setIsLoading(false);
  }, []);

  const apiClient = useMemo(() => {
    const env = getWebEnv();
    return new ApiClient(env.NEXT_PUBLIC_API_BASE_URL, () => token);
  }, [token]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response: LoginResponse = await apiClient.login({ email, password });
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      setToken(response.accessToken);
      setUser(response.user);
    },
    [apiClient],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!token,
      isLoading,
      login,
      logout,
      apiClient,
    }),
    [user, token, isLoading, login, logout, apiClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
