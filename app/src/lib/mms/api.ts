import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import { isTenantWorkspace } from "./workspace";
import { enqueueMutation, isMutationRequest } from "./mutationQueue";
import { isOnline } from "./useOnlineStatus";

export const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "http://localhost:8001";

export const TOKEN_KEY = "mms_token";
export const REFRESH_TOKEN_KEY = "mms_refresh_token";
export const TENANT_KEY = "mms_tenant";
export const DEFAULT_TENANT =
  (import.meta.env["VITE_DEFAULT_TENANT"] as string | undefined) ?? "default";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  // Without this, a request over a genuinely degraded connection (weak
  // signal, a stalled tunnel/proxy, a DNS lookup that never resolves) can
  // sit pending indefinitely instead of failing — unlike a clean
  // disconnect, which fails fast. That leaves any await on it (a mutation's
  // loading state, the offline-queue fallback in the response interceptor
  // below) hung forever with no error to recover from.
  timeout: 30_000,
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

export async function signupInitiate(payload: {
  email: string;
  phone: string;
  school_name: string;
  with_demo_data: boolean;
}): Promise<void> {
  await api.post("/api/v1/auth/signup/initiate", payload);
}

export async function signupVerify(payload: {
  email: string;
  otp: string;
}): Promise<{ madrasa_id: string; set_password_url: string }> {
  const res = await api.post("/api/v1/auth/signup/verify", payload);
  return res.data;
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
    const payload = JSON.parse(
      atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
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

// Auth requests (login, refresh, signup) must never be queued for later —
// they need a live round trip *now* to produce a token, not a replayed
// `{queued: true}` stand-in. Without this, submitting the login form while
// navigator.onLine reports false (a real drop, or just an unreliable read
// right at page load) silently "succeeds" with no session, which reads to a
// user as the app being stuck.
function isQueueExempt(url: string): boolean {
  return url.includes("/api/v1/auth/");
}

api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (isMutationRequest(method)) {
    // Stash the original (pre-serialization) request body. By the time a
    // failed request reaches the response interceptor below, axios has
    // already turned object bodies into a JSON string on `config.data` —
    // capturing it here keeps whatever later queues this mutation storing
    // the same shape `flushMutations` expects to replay.
    (config as { __offlineReplayData?: unknown }).__offlineReplayData = config.data ?? null;
  }
  if (isMutationRequest(method) && !isOnline() && !isQueueExempt(config.url ?? "")) {
    // Offline: queue the mutation instead of making the network request
    const url = config.url ?? "";
    const data = config.data ?? null;
    void enqueueMutation(method!, url, data).then(() => {
      toast.success("Saved offline — will sync when online");
    });
    // Abort the request by rejecting with a special marker
    return Promise.reject({ __OFFLINE_QUEUED__: true, url });
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError & { __OFFLINE_QUEUED__?: boolean }) => {
    if (error.__OFFLINE_QUEUED__) {
      // Mutation was queued offline — not a real error
      return Promise.resolve({ data: { queued: true } }) as unknown;
    }

    const method = error.config?.method?.toLowerCase();
    const url = error.config?.url ?? "";
    const isQuiet = QUIET_PATHS.some((path) => url.includes(path));

    // navigator.onLine only reflects the network adapter, not real
    // reachability — a weak signal, VPN hiccup, or unreachable server all
    // leave it `true` while requests genuinely fail. error.response is only
    // set once a server actually answered, so its absence here means the
    // request never got a response at all: queue it the same way the
    // request interceptor does for the "known offline" case, instead of
    // silently dropping the change.
    if (!error.response && isMutationRequest(method) && !isQueueExempt(url)) {
      const data =
        (error.config as { __offlineReplayData?: unknown } | undefined)?.__offlineReplayData ??
        null;
      void enqueueMutation(method!, url, data).then(() => {
        toast.success("Saved offline — will sync when online");
      });
      return Promise.resolve({ data: { queued: true } }) as unknown;
    }

    if (error.response?.status === 401 && typeof window !== "undefined") {
      const originalRequest = error.config as any;
      if (originalRequest && !originalRequest._retry && !url.includes("/api/v1/auth/refresh")) {
        const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
        if (refreshToken) {
          originalRequest._retry = true;
          try {
            const refreshResponse = await axios.post(
              `${API_BASE}/api/v1/auth/refresh`,
              { refresh_token: refreshToken },
              { headers: { "Content-Type": "application/json" } },
            );
            const { access_token, refresh_token: new_refresh_token } = refreshResponse.data;
            window.localStorage.setItem(TOKEN_KEY, access_token);
            if (new_refresh_token) {
              window.localStorage.setItem(REFRESH_TOKEN_KEY, new_refresh_token);
            }
            originalRequest.headers["Authorization"] = `Bearer ${access_token}`;
            return await api(originalRequest);
          } catch (refreshError) {
            window.localStorage.removeItem(TOKEN_KEY);
            window.localStorage.removeItem(REFRESH_TOKEN_KEY);
            window.dispatchEvent(new Event("mms:unauthorized"));
            return Promise.reject(refreshError);
          }
        }
      }

      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      window.dispatchEvent(new Event("mms:unauthorized"));
    }

    if (!isQuiet && method && MUTATION_METHODS.has(method)) {
      toast.error(apiErrorMessage(error, "Couldn't save changes"));
    }

    return Promise.reject(error);
  },
);
