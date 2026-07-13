import {
  Banknote,
  BookOpen,
  Boxes,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX,
  ClipboardCheck,
  ClipboardList,
  FileDown,
  FileText,
  FolderOpen,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Settings,
  User,
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
  | "holidays"
  | "leave"
  | "resources"
  | "forms"
  | "announcements"
  | "finance"
  | "salary"
  | "blog"
  | "admissions"
  | "admission_forms"
  | "settings"
  | "profile"
  | "reports";

export type NavItem = Readonly<{
  id: ViewId;
  labelKey: string;
  descKey: string;
  icon: typeof ClipboardCheck;
  permission?: string;
  permissionsAny?: readonly string[];
  /** Per-madrasa feature flag key (super-admin controlled); unset = always on. */
  feature?: string;
  /** Roles allowed to see this item; unset = every role. */
  roles?: readonly string[];
}>;

export type NavGroup = Readonly<{
  labelKey: string;
  items: readonly NavItem[];
}>;

export const navGroups: readonly NavGroup[] = [
  {
    labelKey: "groupOverview",
    items: [{ id: "dashboard", labelKey: "dashboard", descKey: "descDashboard", icon: LayoutDashboard }]
  },
  {
    labelKey: "groupDaily",
    items: [
      { id: "attendance", labelKey: "attendance", descKey: "descAttendance", icon: CalendarDays, permission: "attendance.take", feature: "attendance" },
      { id: "timetable", labelKey: "timetable", descKey: "descTimetable", icon: CalendarClock, feature: "timetable" },
      { id: "holidays", labelKey: "holidays", descKey: "descHolidays", icon: CalendarX, feature: "holidays" },
      { id: "leave", labelKey: "leave", descKey: "descLeave", icon: CalendarCheck, feature: "leave" },
      { id: "announcements", labelKey: "announcements", descKey: "descAnnouncements", icon: Megaphone, feature: "announcements" }
    ]
  },
  {
    labelKey: "groupTeaching",
    items: [
      { id: "academics", labelKey: "academics", descKey: "descAcademics", icon: Boxes, permission: "academics.manage" },
      { id: "assessments", labelKey: "assessments", descKey: "descAssessments", icon: ClipboardList, permission: "assignments.create", feature: "assessments" },
      { id: "resources", labelKey: "resources", descKey: "descResources", icon: FolderOpen, feature: "resources" },
      { id: "forms", labelKey: "forms", descKey: "descForms", icon: FileText, feature: "forms" }
    ]
  },
  {
    labelKey: "groupPeople",
    items: [
      { id: "people", labelKey: "people", descKey: "descPeople", icon: UsersRound, permission: "students.view" },
      { id: "admissions", labelKey: "walkInAdmissions", descKey: "walkInAdmissionsDesc", icon: ClipboardCheck, permission: "admissions.manage", feature: "admissions", roles: ["principal", "teacher"] },
      { id: "admission_forms", labelKey: "admissionFormsTab", descKey: "admissionFormsHint", icon: FileText, permissionsAny: ["admissions.manage", "contact.enquiries.view"], feature: "admissions", roles: ["principal", "teacher"] }
    ]
  },
  {
    labelKey: "groupFinance",
    items: [
      { id: "finance", labelKey: "finance", descKey: "descFinance", icon: Landmark, permission: "finance.reports.view", feature: "finance", roles: ["principal", "teacher"] },
      // No permission gate: every teacher gets a read-only self-view here even
      // without teachers.salary.manage (SalaryView branches on that permission).
      { id: "salary", labelKey: "salary", descKey: "descSalary", icon: Banknote, feature: "salary", roles: ["principal", "teacher"] },
      { id: "reports", labelKey: "reports", descKey: "descReports", icon: FileDown, permission: "attendance.take", feature: "reports", roles: ["principal", "teacher"] }
    ]
  },
  {
    labelKey: "groupSite",
    items: [
      { id: "blog", labelKey: "blog", descKey: "descBlog", icon: Newspaper, feature: "blog", roles: ["principal", "teacher"] },
      { id: "settings", labelKey: "settings", descKey: "descSettings", icon: Settings, permission: "academics.manage" }
    ]
  },
  {
    labelKey: "groupAccount",
    items: [
      // Personal settings (§C/§D) — every teacher/student gets their own
      // profile + change-password page; principals already have the full
      // madrasa Settings screen above.
      { id: "profile", labelKey: "myProfile", descKey: "descProfile", icon: User, roles: ["teacher", "student"] }
    ]
  }
];

export const navItems: readonly NavItem[] = navGroups.flatMap((group) => group.items);

export const peopleIcons = { teachers: UserRoundCog, students: GraduationCap };
export const assessmentIcons = { assignments: ClipboardList, results: BookOpen };
