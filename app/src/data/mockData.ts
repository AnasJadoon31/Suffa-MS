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
  LayoutDashboard,
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
  descKey: string;
  icon: typeof ClipboardCheck;
  permission?: string;
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
      { id: "attendance", labelKey: "attendance", descKey: "descAttendance", icon: CalendarDays, permission: "attendance.take" },
      { id: "timetable", labelKey: "timetable", descKey: "descTimetable", icon: CalendarClock },
      { id: "announcements", labelKey: "announcements", descKey: "descAnnouncements", icon: Megaphone }
    ]
  },
  {
    labelKey: "groupTeaching",
    items: [
      { id: "academics", labelKey: "academics", descKey: "descAcademics", icon: Boxes, permission: "academics.manage" },
      { id: "assessments", labelKey: "assessments", descKey: "descAssessments", icon: ClipboardList, permission: "assignments.create" },
      { id: "resources", labelKey: "resources", descKey: "descResources", icon: FolderOpen },
      { id: "forms", labelKey: "forms", descKey: "descForms", icon: FileText }
    ]
  },
  {
    labelKey: "groupPeople",
    items: [
      { id: "people", labelKey: "people", descKey: "descPeople", icon: UsersRound, permission: "students.view" },
      { id: "admissions", labelKey: "admissions", descKey: "descAdmissions", icon: ClipboardCheck }
    ]
  },
  {
    labelKey: "groupFinance",
    items: [
      { id: "finance", labelKey: "finance", descKey: "descFinance", icon: Landmark, permission: "finance.reports.view" },
      { id: "salary", labelKey: "salary", descKey: "descSalary", icon: Banknote, permission: "teachers.salary.manage" },
      { id: "reports", labelKey: "reports", descKey: "descReports", icon: FileDown, permission: "attendance.take" }
    ]
  },
  {
    labelKey: "groupSite",
    items: [
      { id: "blog", labelKey: "blog", descKey: "descBlog", icon: Newspaper },
      { id: "settings", labelKey: "settings", descKey: "descSettings", icon: Settings, permission: "academics.manage" }
    ]
  }
];

export const navItems: readonly NavItem[] = navGroups.flatMap((group) => group.items);

export const peopleIcons = { teachers: UserRoundCog, students: GraduationCap };
export const assessmentIcons = { assignments: ClipboardList, results: BookOpen };
