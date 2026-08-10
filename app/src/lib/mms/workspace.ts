export const SUPER_ADMIN_VIEW_KEY = "mms_super_admin_view";

export function isTenantWorkspace(role?: string): boolean {
  return role === "super_admin" && typeof window !== "undefined" && window.localStorage.getItem(SUPER_ADMIN_VIEW_KEY) === "tenant";
}

export function setSuperAdminWorkspace(mode: "platform" | "tenant"): void {
  if (typeof window !== "undefined") window.localStorage.setItem(SUPER_ADMIN_VIEW_KEY, mode);
}
