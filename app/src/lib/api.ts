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

function validationIssueMessage(issue: unknown): string | null {
  if (typeof issue === "string") return issue;
  if (!issue || typeof issue !== "object") return null;

  const candidate = issue as { loc?: unknown; msg?: unknown };
  if (typeof candidate.msg !== "string") return null;
  if (!Array.isArray(candidate.loc)) return candidate.msg;

  const location = candidate.loc
    .filter((part, index) => index > 0 || !["body", "query", "path"].includes(String(part)))
    .filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    .join(".");
  return location ? `${location}: ${candidate.msg}` : candidate.msg;
}

export function formatApiErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(validationIssueMessage).filter((message): message is string => Boolean(message));
    if (messages.length) return messages.join("; ");
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
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
      const localizedErrors: Record<string, string> = {
        session_view_only: "sessionViewOnlyError",
        student_self_attendance_only: "studentSelfAttendanceOnlyError",
        student_not_enrolled: "studentNotEnrolledError",
        class_not_found: "classNotFoundError",
        timetable_self_service_only: "timetableSelfServiceOnlyError",
        assignment_not_assigned: "assignmentNotAssignedError",
        teachers_self_attendance_only: "teachersSelfAttendanceOnlyError",
        whatsapp_delivery_not_configured: "whatsappDeliveryNotConfiguredError",
        whatsapp_instance_unavailable: "whatsappInstanceUnavailableError",
        whatsapp_instance_already_connected: "whatsappInstanceAlreadyConnectedError",
        whatsapp_pairing_code_failed: "whatsappPairingCodeFailedError",
        whatsapp_pairing_replace_required: "whatsappPairingReplaceRequiredError",
        whatsapp_phone_invalid: "whatsappPhoneInvalidError",
        whatsapp_media_delivery_failed: "whatsappMediaDeliveryFailedError",
      };
      if (typeof body.detail === "string" && localizedErrors[body.detail]) {
        body.detail = i18next.t(localizedErrors[body.detail]);
      } else if (typeof body.detail !== "string") {
        body.detail = formatApiErrorDetail(body.detail, String(i18next.t("genericError")));
      }
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
