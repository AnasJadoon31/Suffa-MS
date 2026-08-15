import {
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileBarChart2,
  FileText,
  GraduationCap,
  Home,
  Layers,
  Library,
  Megaphone,
  Monitor,
  Newspaper,
  Settings,
  ShieldCheck,
  Table2,
  Trophy,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isTenantWorkspace } from "./workspace";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  feature?: string;
}

export const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home, description: "Today at a glance" },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarCheck2,
    description: "Mark and review rosters",
    feature: "attendance",
  },
  { to: "/people", label: "People", icon: Users, description: "Students, teachers, guardians" },
  { to: "/timetable", label: "Timetable", icon: CalendarClock, description: "Your weekly periods", feature: "timetable" },
];

export const academicNav: NavItem[] = [
  {
    to: "/assignments",
    label: "Assignments",
    icon: ClipboardList,
    description: "Madrasa assignments and submissions",
    feature: "assessments",
  },
  { to: "/results", label: "Results", icon: Trophy, description: "Marks and grade bands", feature: "assessments" },
  {
    to: "/examination",
    label: "Examination",
    icon: ClipboardList,
    description: "Grading, exams and results",
    feature: "assessments",
  },
  {
    to: "/academics",
    label: "Academics",
    icon: BookOpen,
    description: "Classes, courses and sessions",
  },
  { to: "/resources", label: "Resources", icon: Library, description: "Shared study material", feature: "resources" },
];

export const operationsNav: NavItem[] = [
  {
    to: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    description: "Notices for your audience",
    feature: "announcements",
  },
  { to: "/leave", label: "Leave", icon: CalendarDays, description: "Requests and approvals", feature: "leave" },
  { to: "/holidays", label: "Holidays", icon: BookOpen, description: "Academic calendar breaks", feature: "holidays" },
  { to: "/admissions", label: "Admissions", icon: UserPlus, description: "Applications pipeline", feature: "admissions" },
  { to: "/blog", label: "Blog", icon: Newspaper, description: "Published madrasa posts", feature: "blog" },
  { to: "/forms", label: "Forms", icon: FileText, description: "Custom forms and responses", feature: "forms" },
];

export const myNav: NavItem[] = [
  {
    to: "/my-attendance",
    label: "My Attendance",
    icon: UserCheck,
    description: "Your attendance history and check-in",
  },
  {
    to: "/my-assessments",
    label: "My Assessments",
    icon: ClipboardList,
    description: "Your assignments and results",
  },
  {
    to: "/my-timetable",
    label: "My Timetable",
    icon: Table2,
    description: "Your weekly class schedule",
  },
];

export const adminNav: NavItem[] = [
  { to: "/finance", label: "Finance", icon: Wallet, description: "Fees, donations, salary", feature: "finance" },
  { to: "/reports", label: "Reports", icon: FileBarChart2, description: "Export CSV and PDF", feature: "reports" },
  { to: "/settings", label: "Settings", icon: Settings, description: "Madrasa configuration" },
  { to: "/roles", label: "Roles", icon: ShieldCheck, description: "Permission roles" },
  { to: "/platform", label: "Platform", icon: Monitor, description: "Super admin console" },
  { to: "/me", label: "My Profile", icon: UserRound, description: "Account and session" },
];

export const navGroups: { title: string; items: NavItem[] }[] = [
  { title: "Daily", items: primaryNav },
  { title: "My", items: myNav },
  { title: "Academics", items: academicNav },
  { title: "Operations", items: operationsNav },
  { title: "Admin", items: adminNav },
];

export const allNavItems: NavItem[] = [
  ...primaryNav,
  ...myNav,
  ...academicNav,
  ...operationsNav,
  ...adminNav,
];

const teacherVisiblePaths = new Set([
  "/dashboard",
  "/my-attendance",
  "/my-assessments",
  "/my-timetable",
  "/resources",
  "/announcements",
  "/leave",
  "/me",
]);

const donorVisiblePaths = new Set([
  "/dashboard",
  "/me",
]);

const guardianVisiblePaths = new Set([
  "/dashboard",
  "/timetable",
  "/resources",
  "/assignments",
  "/attendance",
  "/finance",
  "/announcements",
  "/me",
]);

const teacherRouteRedirects: Record<string, string> = {
  "/attendance": "/my-attendance",
  "/timetable": "/my-timetable",
  "/assignments": "/my-assessments",
  "/results": "/my-assessments",
  "/examination": "/my-assessments",
};

export function isNavItemVisible(
  item: Pick<NavItem, "feature" | "to">,
  role: string | undefined,
  hasFeature: (key: string) => boolean,
): boolean {
  if (item.to === "/platform") return role === "super_admin" && !isTenantWorkspace(role);
  if (role === "teacher") {
    return teacherVisiblePaths.has(item.to) && (!item.feature || hasFeature(item.feature));
  }
  if (role === "donor") {
    return donorVisiblePaths.has(item.to);
  }
  if (role === "parent") {
    return guardianVisiblePaths.has(item.to) && (!item.feature || hasFeature(item.feature));
  }
  return !item.feature || (role === "super_admin" && !isTenantWorkspace(role)) || hasFeature(item.feature);
}

export function teacherRouteRedirect(pathname: string, role: string | undefined): string | null {
  if (role !== "teacher" || teacherVisiblePaths.has(pathname)) return null;
  return teacherRouteRedirects[pathname] ?? "/dashboard";
}

export function guardianRouteRedirect(pathname: string, role: string | undefined): string | null {
  if (role !== "parent" || guardianVisiblePaths.has(pathname)) return null;
  return "/dashboard";
}

export function featureForPath(pathname: string): string | undefined {
  return allNavItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.feature;
}

export const gradIcon = GraduationCap;
