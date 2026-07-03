import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface User {
  id: string;
  username: string;
  role: string;
  status: string;
  preferred_language: string;
}

export interface Madrasa {
  id: string;
  slug: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  madrasa: Madrasa | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, tenant: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [madrasa, setMadrasa] = useState<Madrasa | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      const res = await api.get("/api/v1/auth/me");
      setUser(res.data.user);
      setMadrasa(res.data.madrasa);
    } catch (err) {
      setUser(null);
      setMadrasa(null);
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
  };

  return (
    <AuthContext.Provider value={{ user, madrasa, isAuthenticated: !!user, isLoading, login, logout }}>
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
