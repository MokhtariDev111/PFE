const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  `${window.location.protocol}//${window.location.hostname}:8000`;

export interface AuthUser {
  user_id: string;
  name: string;
  email: string;
  is_admin?: boolean;
  avatar_url?: string;
}

const TOKEN_KEY = "eduai_token";
const USER_KEY  = "eduai_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function loginApi(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const form = new FormData();
  form.append("email", email);
  form.append("password", password);
  const res = await fetch(`${BASE_URL}/auth/login`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error((err as { detail?: string }).detail ?? "Login failed");
  }
  return res.json() as Promise<{ token: string; user: AuthUser }>;
}

export async function registerApi(
  name: string,
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const form = new FormData();
  form.append("name", name);
  form.append("email", email);
  form.append("password", password);
  const res = await fetch(`${BASE_URL}/auth/register`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error((err as { detail?: string }).detail ?? "Registration failed");
  }
  return res.json() as Promise<{ token: string; user: AuthUser }>;
}

export async function updateProfileApi(
  name: string,
  avatarUrl: string,
  token: string,
): Promise<AuthUser> {
  const form = new FormData();
  form.append("name", name);
  form.append("avatar_url", avatarUrl);
  const res = await fetch(`${BASE_URL}/auth/profile`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Update failed" }));
    throw new Error((err as { detail?: string }).detail ?? "Update failed");
  }
  return res.json() as Promise<AuthUser>;
}

export async function googleAuthApi(
  credential: string,
): Promise<{ token: string; user: AuthUser }> {
  const form = new FormData();
  form.append("credential", credential);
  const res = await fetch(`${BASE_URL}/auth/google`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Google sign-in failed" }));
    throw new Error((err as { detail?: string }).detail ?? "Google sign-in failed");
  }
  return res.json() as Promise<{ token: string; user: AuthUser }>;
}
