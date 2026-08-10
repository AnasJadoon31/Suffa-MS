import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setAcademicSessionId, DEFAULT_TENANT, TENANT_KEY, TOKEN_KEY, readToken } from "./api";
import { setSuperAdminWorkspace } from "./workspace";
import i18n from "@/i18n";

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
  logo_file_key?: string | null;
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
  const queryClient = useQueryClient();
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
    
    if (payload.user?.preferred_language) {
      const lang = payload.user.preferred_language;
      localStorage.setItem("mms_lang", lang);
      void i18n.changeLanguage(lang);
      const dir = lang === "ur" || lang === "ar" ? "rtl" : "ltr";
      document.documentElement.dir = dir;
      document.documentElement.lang = lang;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!readToken()) {
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
    queryClient.clear();
    applyProfile({});
    setIsLoading(false);
  }, [applyProfile, queryClient]);

  const login = useCallback(
    async (username: string, password: string, tenant: string) => {
      queryClient.clear();
      // A new sign-in always starts from the platform boundary. This flag only
      // affects super-admin accounts; tenant workspaces are entered explicitly
      // from the Platform screen after authentication.
      setSuperAdminWorkspace("platform");
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
    [queryClient, refresh],
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
        user?.role === "principal" || user?.role === "super_admin" || user?.is_principal_delegate || permissions.includes(code),
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
