import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setAcademicSessionId, DEFAULT_TENANT, TENANT_KEY, TOKEN_KEY } from "./api";

export interface MmsUser {
  id: string;
  username: string;
  role: string;
  status: string;
  preferred_language: string;
  is_principal_delegate: boolean;
  selected_session_id: string | null;
  has_teaching_assignment: boolean;
}

export interface Madrasa {
  id: string;
  slug: string;
  name: string;
  name_en?: string;
  name_ur?: string;
  logo_url?: string;
}

interface ProfilePayload {
  user?: MmsUser;
  madrasa?: Madrasa;
  permissions?: string[];
  features?: Record<string, boolean>;
  has_teaching_assignment?: boolean;
}

interface AuthState {
  user: MmsUser | null;
  madrasa: Madrasa | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (code: string) => boolean;
  hasFeature: (key: string) => boolean;
  login: (username: string, password: string, tenant: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MmsUser | null>(null);
  const [madrasa, setMadrasa] = useState<Madrasa | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const applyProfile = useCallback((payload: ProfilePayload) => {
    setUser(
      payload.user
        ? { ...payload.user, has_teaching_assignment: payload.has_teaching_assignment ?? false }
        : null,
    );
    setMadrasa(payload.madrasa ?? null);
    setPermissions(payload.permissions ?? []);
    setFeatures(payload.features ?? {});
    setAcademicSessionId(payload.user?.selected_session_id ?? null);
  }, []);

  const refresh = useCallback(async () => {
    if (!window.localStorage.getItem(TOKEN_KEY)) {
      applyProfile({});
      setIsLoading(false);
      return;
    }
    try {
      const data = (await api.get("/api/v1/auth/me")).data as ProfilePayload;
      applyProfile(data);
    } catch {
      applyProfile({});
    } finally {
      setIsLoading(false);
    }
  }, [applyProfile]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    applyProfile({});
    setIsLoading(false);
  }, [applyProfile]);

  const login = useCallback(
    async (username: string, password: string, tenant: string) => {
      const response = await api.post<{ access_token: string }>(
        "/api/v1/auth/token",
        { username, password },
        { headers: { "X-Madrasa": tenant } },
      );
      window.localStorage.setItem(TOKEN_KEY, response.data.access_token);
      window.localStorage.setItem(TENANT_KEY, tenant || DEFAULT_TENANT);
      setIsLoading(true);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => {
      applyProfile({});
      setIsLoading(false);
    };
    window.addEventListener("mms:unauthorized", onUnauthorized);
    return () => window.removeEventListener("mms:unauthorized", onUnauthorized);
  }, [applyProfile, refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      madrasa,
      permissions,
      isAuthenticated: Boolean(user),
      isLoading,
      hasPermission: (code: string) =>
        user?.role === "principal" || user?.role === "super_admin" || permissions.includes(code),
      hasFeature: (key: string) => features[key] !== false,
      login,
      logout,
      refresh,
    }),
    [features, isLoading, login, logout, madrasa, permissions, refresh, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
