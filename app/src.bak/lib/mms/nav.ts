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
  Newspaper,
  Settings,
  Trophy,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home, description: "Today at a glance" },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarCheck2,
    description: "Mark and review rosters",
  },
  { to: "/people", label: "People", icon: Users, description: "Students, teachers, guardians" },
  { to: "/timetable", label: "Timetable", icon: CalendarClock, description: "Your weekly periods" },
];

export const academicNav: NavItem[] = [
  {
    to: "/assignments",
    label: "Assignments",
    icon: ClipboardList,
    description: "Tasks and submissions",
  },
  { to: "/results", label: "Results", icon: Trophy, description: "Marks and grade bands" },
  {
    to: "/academics",
    label: "Academics",
    icon: Layers,
    description: "Sessions, programs, classes",
  },
  { to: "/resources", label: "Resources", icon: Library, description: "Shared study material" },
];

export const operationsNav: NavItem[] = [
  {
    to: "/announcements",
    label: "Announcements",
    icon: Megaphone,
    description: "Notices for your audience",
  },
  { to: "/leave", label: "Leave", icon: CalendarDays, description: "Requests and approvals" },
  { to: "/holidays", label: "Holidays", icon: BookOpen, description: "Academic calendar breaks" },
  { to: "/admissions", label: "Admissions", icon: UserPlus, description: "Applications pipeline" },
  { to: "/blog", label: "Blog", icon: Newspaper, description: "Published madrasa posts" },
  { to: "/forms", label: "Forms", icon: FileText, description: "Custom forms and responses" },
];

export const adminNav: NavItem[] = [
  { to: "/finance", label: "Finance", icon: Wallet, description: "Fees, donations, salary" },
  { to: "/reports", label: "Reports", icon: FileBarChart2, description: "Export CSV and PDF" },
  { to: "/settings", label: "Settings", icon: Settings, description: "Madrasa configuration" },
  { to: "/me", label: "My Profile", icon: UserRound, description: "Account and session" },
];

export const navGroups: { title: string; items: NavItem[] }[] = [
  { title: "Daily", items: primaryNav },
  { title: "Academics", items: academicNav },
  { title: "Operations", items: operationsNav },
  { title: "Admin", items: adminNav },
];

export const allNavItems: NavItem[] = [
  ...primaryNav,
  ...academicNav,
  ...operationsNav,
  ...adminNav,
];

export const gradIcon = GraduationCap;
