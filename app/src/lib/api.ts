import axios, { AxiosError } from "axios";
import { API_BASE } from "./config";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json"
  }
});

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
    if (error.response?.status === 401) {
      // Clear local storage and redirect to login
      localStorage.removeItem("mms_token");
      // In a real app we'd dispatch an event or use a router redirect
      window.dispatchEvent(new Event("unauthorized"));
    }
    return Promise.reject(error);
  }
);
