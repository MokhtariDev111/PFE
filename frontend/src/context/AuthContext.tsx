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
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  updateProfile: (name: string, avatarUrl: string) => Promise<void>;
  logout: () => void;
  dismissWelcome: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(getStoredUser);
  const [token, setToken]             = useState<string | null>(getToken);
  const [showWelcome, setShowWelcome] = useState(false);

  // Refresh user from server on startup so is_admin / avatar_url are always current
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

  async function login(email: string, password: string) {
    _applySession(await loginApi(email, password));
  }

  async function signup(name: string, email: string, password: string) {
    _applySession(await registerApi(name, email, password), true);
  }

  async function googleLogin(credential: string) {
    _applySession(await googleAuthApi(credential));
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
