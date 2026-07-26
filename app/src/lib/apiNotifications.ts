export type ApiNotificationVariant = "success" | "error" | "warning" | "info";

export interface ApiNotificationDetail {
  messageKey?: string;
  message?: string;
  variant: ApiNotificationVariant;
}

export const API_NOTIFICATION_EVENT = "suffa:api-notification";

export function emitApiNotification(detail: ApiNotificationDetail): void {
  window.dispatchEvent(new CustomEvent<ApiNotificationDetail>(API_NOTIFICATION_EVENT, { detail }));
}
