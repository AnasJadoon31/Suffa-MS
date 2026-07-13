import axios, { AxiosError } from "axios";
import { API_BASE } from "./config";
import i18next from "../i18n";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json"
  }
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

// Academic-session context header. Held in memory (not localStorage) so two
// logins on the same browser can't clobber each other; the server-side
// preference (users.selected_session_id) is the durable source of truth.
let academicSessionId: string | null = null;

export function setAcademicSessionId(id: string | null): void {
  academicSessionId = id;
}

// Request Interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("mms_token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    const tenant = localStorage.getItem("mms_tenant") || "suffa";
    config.headers["X-Madrasa"] = tenant;

    if (academicSessionId) {
      config.headers["X-Academic-Session-Id"] = academicSessionId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.data && typeof error.response.data === "object" && "detail" in error.response.data) {
      const body = error.response.data as { detail?: unknown };
      if (body.detail === "session_view_only") body.detail = i18next.t("sessionViewOnlyError");
    }
    if (error.response?.status === 401) {
      // Clear local storage and redirect to login
      localStorage.removeItem("mms_token");
      // In a real app we'd dispatch an event or use a router redirect
      window.dispatchEvent(new Event("unauthorized"));
    }
    return Promise.reject(error);
  }
);
