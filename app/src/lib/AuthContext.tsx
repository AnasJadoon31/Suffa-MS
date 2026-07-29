import React, { createContext, useContext, useEffect, useState } from "react";
import i18n from "../i18n";
import { api, setAcademicSessionId } from "./api";
import { clearLegacyApiCache, setOfflineAccountKey } from "./offlineCache";

export interface User {
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
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
}

interface AuthContextType {
  user: User | null;
  madrasa: Madrasa | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (code: string) => boolean;
  hasFeature: (key: string) => boolean;
  login: (token: string, tenant: string) => Promise<void>;
  logout: () => void;
  updateSelectedSession: (sessionId: string | null) => Promise<void>;
  updateProfile: (payload: { preferred_language?: string }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type ProfilePayload = {
  user?: User;
  madrasa?: Madrasa;
  branding?: Record<string, string>;
  permissions?: string[];
  features?: Record<string, boolean>;
  has_teaching_assignment?: boolean;
};

const PROFILE_CACHE_PREFIX = "mms_profile_cache_v1";

function profileCacheKey(): string | null {
  const token = localStorage.getItem("mms_token");
  const tenant = localStorage.getItem("mms_tenant") || "suffa";
  if (!token) return null;
  return `${PROFILE_CACHE_PREFIX}:${tenant}:${token.slice(0, 12)}`;
}

function readCachedProfile(): ProfilePayload | null {
  const key = profileCacheKey();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as ProfilePayload : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(payload: ProfilePayload): void {
  const key = profileCacheKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(payload));
}

function clearCachedProfile(): void {
  const key = profileCacheKey();
  if (key) localStorage.removeItem(key);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [madrasa, setMadrasa] = useState<Madrasa | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const applyProfile = async (payload: ProfilePayload, options: { cache?: boolean; resolveLogo?: boolean } = {}) => {
    const language = payload.user?.preferred_language === "ur" ? "ur" : "en";
    await i18n.changeLanguage(language);
    document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    setOfflineAccountKey(payload.madrasa?.id ?? null, payload.user?.id ?? null);
    setUser(payload.user ? { ...payload.user, has_teaching_assignment: payload.has_teaching_assignment ?? false } : null);
    const branding = payload.branding ?? {};
    let logoUrl: string | undefined;
    if (options.resolveLogo !== false && branding["madrasa.logo_file_id"]) {
      try {
        const logo = await api.get("/api/v1/files/presign-download", { params: { object_key: branding["madrasa.logo_file_id"] } });
        logoUrl = logo.data.url;
      } catch {
        logoUrl = undefined;
      }
    }
    setMadrasa(payload.madrasa ? {
      ...payload.madrasa,
      name_en: branding["madrasa.name_en"] || payload.madrasa.name,
      name_ur: branding["madrasa.name_ur"] || payload.madrasa.name,
      address: branding["madrasa.address"],
      phone: branding["madrasa.phone"],
      email: branding["madrasa.email"],
      website: branding["madrasa.website"],
      logo_url: logoUrl,
    } : null);
    setPermissions(payload.permissions ?? []);
    setFeatures(payload.features ?? {});
    setAcademicSessionId(payload.user?.selected_session_id ?? null);
    if (options.cache !== false) writeCachedProfile(payload);
  };

  const clearProfileState = () => {
    setUser(null);
    setMadrasa(null);
    setPermissions([]);
    setFeatures({});
    setAcademicSessionId(null);
    setOfflineAccountKey(null, null);
  };

  const fetchProfile = async () => {
    try {
      await clearLegacyApiCache();
      const res = await api.get("/api/v1/auth/me");
      await applyProfile(res.data);
    } catch (err) {
      const cachedProfile = navigator.onLine === false ? readCachedProfile() : null;
      if (cachedProfile?.user) {
        await applyProfile(cachedProfile, { cache: false, resolveLogo: false });
      } else {
        clearProfileState();
        clearCachedProfile();
        localStorage.removeItem("mms_token");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("mms_token");
    if (token) {
      fetchProfile();
    } else {
      setIsLoading(false);
    }

    const handleUnauthorized = () => {
      clearProfileState();
    };

    const refreshDelegatedAccess = () => {
      if (localStorage.getItem("mms_token")) void fetchProfile();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshDelegatedAccess();
    };

    window.addEventListener("unauthorized", handleUnauthorized);
    window.addEventListener("focus", refreshDelegatedAccess);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("unauthorized", handleUnauthorized);
      window.removeEventListener("focus", refreshDelegatedAccess);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const login = async (token: string, tenant: string) => {
    localStorage.setItem("mms_token", token);
    localStorage.setItem("mms_tenant", tenant);
    await fetchProfile();
  };

  const logout = () => {
    clearCachedProfile();
    localStorage.removeItem("mms_token");
    localStorage.removeItem("mms_tenant");
    clearProfileState();
    void clearLegacyApiCache();
  };

  const updateSelectedSession = async (sessionId: string | null) => {
    const payload = sessionId
      ? { selected_session_id: sessionId }
      : { clear_selected_session: true };
    const res = await api.patch("/api/v1/auth/me", payload);
    setUser({ ...res.data.user, has_teaching_assignment: res.data.has_teaching_assignment ?? false });
    setAcademicSessionId(res.data.user?.selected_session_id ?? null);
  };

  const updateProfile = async (payload: { preferred_language?: string }) => {
    const res = await api.patch("/api/v1/auth/me", payload);
    setUser({ ...res.data.user, has_teaching_assignment: res.data.has_teaching_assignment ?? false });
    setAcademicSessionId(res.data.user?.selected_session_id ?? null);
  };

  const hasPermission = (code: string) => user?.role === "principal" || permissions.includes(code);
  // Missing key = enabled: flags are subtractive, set only by the super admin.
  const hasFeature = (key: string) => features[key] !== false;

  return (
    <AuthContext.Provider
      value={{ user, madrasa, permissions, isAuthenticated: !!user, isLoading, hasPermission, hasFeature, login, logout, updateSelectedSession, updateProfile, refreshProfile: fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
