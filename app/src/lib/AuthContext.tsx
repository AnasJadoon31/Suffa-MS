import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setAcademicSessionId } from "./api";

export interface User {
  id: string;
  username: string;
  role: string;
  status: string;
  preferred_language: string;
  selected_session_id: string | null;
}

export interface Madrasa {
  id: string;
  slug: string;
  name: string;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [madrasa, setMadrasa] = useState<Madrasa | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/api/v1/auth/me");
      setUser(res.data.user);
      setMadrasa(res.data.madrasa);
      setPermissions(res.data.permissions ?? []);
      setFeatures(res.data.features ?? {});
      setAcademicSessionId(res.data.user?.selected_session_id ?? null);
    } catch (err) {
      setUser(null);
      setMadrasa(null);
      setPermissions([]);
      setFeatures({});
      setAcademicSessionId(null);
      localStorage.removeItem("mms_token");
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
      setUser(null);
      setMadrasa(null);
      setPermissions([]);
    };

    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, []);

  const login = async (token: string, tenant: string) => {
    localStorage.setItem("mms_token", token);
    localStorage.setItem("mms_tenant", tenant);
    await fetchProfile();
  };

  const logout = () => {
    localStorage.removeItem("mms_token");
    setUser(null);
    setMadrasa(null);
    setPermissions([]);
    setAcademicSessionId(null);
  };

  const updateSelectedSession = async (sessionId: string | null) => {
    const payload = sessionId
      ? { selected_session_id: sessionId }
      : { clear_selected_session: true };
    const res = await api.patch("/api/v1/auth/me", payload);
    setUser(res.data.user);
    setAcademicSessionId(res.data.user?.selected_session_id ?? null);
  };

  const updateProfile = async (payload: { preferred_language?: string }) => {
    const res = await api.patch("/api/v1/auth/me", payload);
    setUser(res.data.user);
    setAcademicSessionId(res.data.user?.selected_session_id ?? null);
  };

  const hasPermission = (code: string) => user?.role === "principal" || permissions.includes(code);
  // Missing key = enabled: flags are subtractive, set only by the super admin.
  const hasFeature = (key: string) => features[key] !== false;

  return (
    <AuthContext.Provider
      value={{ user, madrasa, permissions, isAuthenticated: !!user, isLoading, hasPermission, hasFeature, login, logout, updateSelectedSession, updateProfile }}
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
