import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import { isTenantWorkspace } from "./workspace";

export const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "http://localhost:8001";

export const TOKEN_KEY = "mms_token";
export const TENANT_KEY = "mms_tenant";
export const DEFAULT_TENANT = (import.meta.env["VITE_DEFAULT_TENANT"] as string | undefined) ?? "default";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

export interface PageResult<T> {
  items: T[];
  total: number;
}

export async function getPage<T>(url: string, params?: object): Promise<PageResult<T>> {
  const response = await api.get<T[]>(url, { params });
  const headerTotal = Number(response.headers["x-total-count"]);
  return {
    items: response.data,
    total: Number.isFinite(headerTotal) ? headerTotal : response.data.length,
  };
}

export async function getAllPages<T>(url: string, params?: object): Promise<T[]> {
  const pageSize = 100;
  const items: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await getPage<T>(url, { ...params, limit: pageSize, offset });
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) return items;
  }
}

let academicSessionId: string | null = null;
export function setAcademicSessionId(id: string | null): void {
  academicSessionId = id;
}

export function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  } catch {
    window.localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return token;
}

export function readTenant(): string {
  if (typeof window === "undefined") return DEFAULT_TENANT;
  return window.localStorage.getItem(TENANT_KEY) || DEFAULT_TENANT;
}

api.interceptors.request.use((config) => {
  if (config.params) {
    for (const key of Object.keys(config.params)) {
      const value = config.params[key];
      if (value === "" || value === null || value === undefined) delete config.params[key];
    }
  }

  const token = readToken();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  // Authentication may explicitly target a madrasa before it is saved as the
  // active workspace. Preserve that header instead of reviving a stale tenant
  // from local storage.
  if (!config.headers["X-Madrasa"]) config.headers["X-Madrasa"] = readTenant();
  if (isTenantWorkspace("super_admin")) config.headers["X-Platform-Workspace"] = "tenant";
  if (academicSessionId) config.headers["X-Academic-Session-Id"] = academicSessionId;

  return config;
});

export function apiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const axiosError = error as AxiosError<{ detail?: unknown }>;
  const detail = axiosError?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((issue) =>
        issue && typeof issue === "object" && "msg" in issue
          ? String((issue as { msg?: unknown }).msg)
          : typeof issue === "string"
            ? issue
            : null,
      )
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const MUTATION_METHODS = new Set(["post", "put", "patch", "delete"]);
const QUIET_PATHS = ["/api/v1/auth/token"];

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const method = error.config?.method?.toLowerCase();
    const url = error.config?.url ?? "";
    const isQuiet = QUIET_PATHS.some((path) => url.includes(path));

    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("mms:unauthorized"));
    }

    if (!isQuiet && method && MUTATION_METHODS.has(method)) {
      toast.error(apiErrorMessage(error, "Couldn't save changes"));
    }

    return Promise.reject(error);
  },
);
