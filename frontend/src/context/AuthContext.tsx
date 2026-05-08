import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  AuthUser,
  getStoredUser,
  getToken,
  storeSession,
  clearSession,
  loginApi,
  registerApi,
  googleAuthApi,
  updateProfileApi,
  authHeaders,
} from "@/lib/auth";

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  showWelcome: boolean;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  signup: (name: string, email: string, password: string) => Promise<AuthUser>;
  googleLogin: (credential: string) => Promise<AuthUser>;
  updateProfile: (name: string, avatarUrl: string) => Promise<void>;
  logout: () => void;
  dismissWelcome: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(getStoredUser);
  const [token, setToken]             = useState<string | null>(getToken);
  const [showWelcome, setShowWelcome] = useState(false);

  const isAdmin   = user?.role === "admin";
  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const isStudent = user?.role === "student";

  // Refresh user from server on startup so role / avatar_url are always current
  useEffect(() => {
    const storedToken = getToken();
    if (!storedToken) return;
    fetch(`${BASE_URL}/auth/me`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() as Promise<AuthUser> : null)
      .then(fresh => {
        if (fresh) {
          storeSession(storedToken, fresh);
          setUser(fresh);
        }
      })
      .catch(() => {});
  }, []);

  function _applySession(data: { token: string; user: AuthUser }, isNew = false) {
    storeSession(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    setShowWelcome(true);
  }

  async function login(email: string, password: string): Promise<AuthUser> {
    const data = await loginApi(email, password);
    _applySession(data);
    return data.user;
  }

  async function signup(name: string, email: string, password: string): Promise<AuthUser> {
    const data = await registerApi(name, email, password);
    _applySession(data, true);
    return data.user;
  }

  async function googleLogin(credential: string): Promise<AuthUser> {
    const data = await googleAuthApi(credential);
    _applySession(data);
    return data.user;
  }

  async function updateProfile(name: string, avatarUrl: string) {
    if (!token) throw new Error("Not authenticated");
    const updated = await updateProfileApi(name, avatarUrl, token);
    storeSession(token, updated);
    setUser(updated);
  }

  function logout() {
    clearSession();
    setToken(null);
    setUser(null);
    setShowWelcome(false);
  }

  function dismissWelcome() {
    setShowWelcome(false);
  }

  return (
    <AuthContext.Provider value={{
      user, token, showWelcome,
      isAdmin, isTeacher, isStudent,
      login, signup, googleLogin, updateProfile,
      logout, dismissWelcome,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
