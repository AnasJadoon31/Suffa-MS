import {
  Banknote,
  BookOpen,
  Boxes,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileDown,
  FileText,
  FolderOpen,
  GraduationCap,
  Landmark,
  Megaphone,
  Newspaper,
  Settings,
  UserRoundCog,
  UsersRound
} from "lucide-react";

export type AttendanceStatus = "present" | "absent" | "leave";
export type ViewId =
  | "dashboard"
  | "attendance"
  | "academics"
  | "people"
  | "assessments"
  | "timetable"
  | "resources"
  | "forms"
  | "announcements"
  | "finance"
  | "salary"
  | "blog"
  | "admissions"
  | "settings"
  | "reports";

export type NavItem = Readonly<{
  id: ViewId;
  labelKey: string;
  icon: typeof ClipboardCheck;
  permission?: string;
}>;

export const navItems: readonly NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: ClipboardCheck },
  { id: "attendance", labelKey: "attendance", icon: CalendarDays, permission: "attendance.take" },
  { id: "academics", labelKey: "academics", icon: Boxes, permission: "academics.manage" },
  { id: "people", labelKey: "people", icon: UsersRound, permission: "students.view" },
  { id: "assessments", labelKey: "assessments", icon: ClipboardList, permission: "assignments.create" },
  { id: "timetable", labelKey: "timetable", icon: CalendarClock },
  { id: "resources", labelKey: "resources", icon: FolderOpen },
  { id: "forms", labelKey: "forms", icon: FileText },
  { id: "announcements", labelKey: "announcements", icon: Megaphone },
  { id: "finance", labelKey: "finance", icon: Landmark, permission: "finance.reports.view" },
  { id: "salary", labelKey: "salary", icon: Banknote, permission: "teachers.salary.manage" },
  { id: "blog", labelKey: "blog", icon: Newspaper },
  { id: "admissions", labelKey: "admissions", icon: ClipboardList },
  { id: "settings", labelKey: "settings", icon: Settings, permission: "academics.manage" },
  { id: "reports", labelKey: "reports", icon: FileDown, permission: "attendance.take" }
];

export const peopleIcons = { teachers: UserRoundCog, students: GraduationCap, guardians: UsersRound };
export const assessmentIcons = { assignments: ClipboardList, results: BookOpen };
