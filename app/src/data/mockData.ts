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
  | "my_attendance"
  | "academics"
  | "people"
  | "assessments"
  | "my_assessments"
  | "timetable"
  | "my_timetable"
  | "holidays"
  | "leave"
  | "my_leave"
  | "resources"
  | "forms"
  | "announcements"
  | "finance"
  | "salary"
  | "my_salary"
  | "blog"
  | "admissions"
  | "admission_forms"
  | "enquiries"
  | "settings"
  | "profile"
  | "reports";

export type NavItem = Readonly<{
  id: ViewId;
  labelKey: string;
  descKey: string;
  icon: typeof ClipboardCheck;
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
      { id: "attendance", labelKey: "attendance", descKey: "descAttendance", icon: CalendarDays },
      { id: "my_attendance", labelKey: "myAttendance", descKey: "descMyAttendance", icon: CalendarDays },
      { id: "timetable", labelKey: "timetable", descKey: "descTimetable", icon: CalendarClock },
      { id: "my_timetable", labelKey: "myTimetable", descKey: "descMyTimetable", icon: CalendarClock },
      { id: "holidays", labelKey: "holidays", descKey: "descHolidays", icon: CalendarX },
      { id: "leave", labelKey: "leave", descKey: "descLeave", icon: CalendarCheck },
      { id: "my_leave", labelKey: "myLeave", descKey: "descMyLeave", icon: CalendarCheck },
      { id: "announcements", labelKey: "announcements", descKey: "descAnnouncements", icon: Megaphone }
    ]
  },
  {
    labelKey: "groupTeaching",
    items: [
      { id: "academics", labelKey: "academics", descKey: "descAcademics", icon: Boxes },
      { id: "assessments", labelKey: "assessments", descKey: "descAssessments", icon: ClipboardList },
      { id: "my_assessments", labelKey: "myAssessments", descKey: "descMyAssessments", icon: ClipboardList },
      { id: "resources", labelKey: "resources", descKey: "descResources", icon: FolderOpen },
      { id: "forms", labelKey: "forms", descKey: "descForms", icon: FileText }
    ]
  },
  {
    labelKey: "groupPeople",
    items: [
      { id: "people", labelKey: "people", descKey: "descPeople", icon: UsersRound },
      { id: "admissions", labelKey: "walkInAdmissions", descKey: "walkInAdmissionsDesc", icon: ClipboardCheck },
      { id: "admission_forms", labelKey: "admissionFormsTab", descKey: "admissionFormsHint", icon: FileText },
      { id: "enquiries", labelKey: "enquiriesTab", descKey: "enquiriesDesc", icon: FileText }
    ]
  },
  {
    labelKey: "groupFinance",
    items: [
      { id: "finance", labelKey: "finance", descKey: "descFinance", icon: Landmark },
      { id: "salary", labelKey: "salary", descKey: "descSalary", icon: Banknote },
      { id: "my_salary", labelKey: "mySalary", descKey: "descMySalary", icon: Banknote },
      { id: "reports", labelKey: "reports", descKey: "descReports", icon: FileDown }
    ]
  },
  {
    labelKey: "groupSite",
    items: [
      { id: "blog", labelKey: "blog", descKey: "descBlog", icon: Newspaper },
      { id: "settings", labelKey: "settings", descKey: "descSettings", icon: Settings }
    ]
  },
  {
    labelKey: "groupAccount",
    items: [
      // Personal settings (§C/§D) — every teacher/student gets their own
      // profile + change-password page; principals already have the full
      // madrasa Settings screen above.
      { id: "profile", labelKey: "myProfile", descKey: "descProfile", icon: User }
    ]
  }
];

export const navItems: readonly NavItem[] = navGroups.flatMap((group) => group.items);

export type PortalRoute = Readonly<{
  key: string;
  path: string;
  view: ViewId;
  permission?: string;
  permissionsAny?: readonly string[];
  feature?: string;
  roles?: readonly string[];
}>;

export const portalRoutes: readonly PortalRoute[] = [
  { key: "dashboard", path: "/dashboard", view: "dashboard" },
  { key: "attendance", path: "/attendance", view: "attendance", permission: "attendance.take", feature: "attendance" },
  { key: "myAttendance", path: "/my-attendance", view: "my_attendance", feature: "attendance", roles: ["teacher", "student"] },
  { key: "timetableGrid", path: "/timetable/grid", view: "timetable", permission: "timetable.manage", feature: "timetable", roles: ["principal", "teacher"] },
  { key: "timetableList", path: "/timetable/list", view: "timetable", permission: "timetable.manage", feature: "timetable", roles: ["principal", "teacher"] },
  { key: "timetableTeachers", path: "/timetable/teachers", view: "timetable", permission: "timetable.manage", feature: "timetable", roles: ["principal", "teacher"] },
  { key: "timetableImport", path: "/timetable/import", view: "timetable", permission: "timetable.manage", feature: "timetable", roles: ["principal", "teacher"] },
  { key: "myTimetable", path: "/my-timetable", view: "my_timetable", feature: "timetable", roles: ["teacher", "student"] },
  { key: "holidays", path: "/holidays", view: "holidays", feature: "holidays" },
  { key: "leave", path: "/leave", view: "leave", permission: "leave.manage", feature: "leave", roles: ["principal", "teacher"] },
  { key: "myLeave", path: "/my-leave", view: "my_leave", feature: "leave", roles: ["teacher", "student"] },
  { key: "announcements", path: "/announcements", view: "announcements", feature: "announcements" },
  { key: "academicPrograms", path: "/academics/programs", view: "academics", permission: "academics.manage" },
  { key: "academicClasses", path: "/academics/classes", view: "academics", permission: "academics.manage" },
  { key: "academicCourses", path: "/academics/courses", view: "academics", permission: "academics.manage" },
  { key: "academicSessions", path: "/academics/sessions", view: "academics", permission: "academics.manage" },
  { key: "assessmentAssignments", path: "/assessments/assignments", view: "assessments", permission: "assignments.create", feature: "assessments" },
  { key: "assessmentGrading", path: "/assessments/grading", view: "assessments", permission: "assessments.marks.enter", feature: "assessments" },
  { key: "assessmentSetup", path: "/assessments/setup", view: "assessments", permissionsAny: ["grading.schemes.manage", "assessments.exam_types.manage"], feature: "assessments" },
  { key: "assessmentResults", path: "/assessments/results", view: "assessments", permission: "assessments.marks.enter", feature: "assessments" },
  { key: "myAssessments", path: "/my-assessments", view: "my_assessments", feature: "assessments", roles: ["student"] },
  { key: "resources", path: "/resources", view: "resources", feature: "resources" },
  { key: "forms", path: "/forms", view: "forms", feature: "forms" },
  { key: "peopleStudents", path: "/people/students", view: "people", permission: "students.view" },
  { key: "peopleTeachers", path: "/people/teachers", view: "people", permission: "teachers.view" },
  { key: "peopleGuardians", path: "/people/guardians", view: "people", permission: "students.view" },
  { key: "peopleDonators", path: "/people/donators", view: "people", permission: "finance.manage", feature: "finance", roles: ["principal", "teacher"] },
  { key: "admissions", path: "/admissions", view: "admissions", permission: "admissions.manage", feature: "admissions", roles: ["principal", "teacher"] },
  { key: "admissionForms", path: "/admission-forms", view: "admission_forms", permission: "admissions.manage", feature: "admissions", roles: ["principal", "teacher"] },
  { key: "enquiries", path: "/enquiries", view: "enquiries", permission: "contact.enquiries.view", feature: "admissions", roles: ["principal", "teacher"] },
  { key: "financeContributions", path: "/finance/contributions", view: "finance", permission: "finance.reports.view", feature: "finance", roles: ["principal", "teacher"] },
  { key: "financeDonations", path: "/finance/donations", view: "finance", permission: "finance.reports.view", feature: "finance", roles: ["principal", "teacher"] },
  { key: "financeSummary", path: "/finance/summary", view: "finance", permission: "finance.reports.view", feature: "finance", roles: ["principal", "teacher"] },
  { key: "salary", path: "/salary", view: "salary", permission: "teachers.salary.manage", feature: "salary", roles: ["principal", "teacher"] },
  { key: "mySalary", path: "/my-salary", view: "my_salary", feature: "salary", roles: ["teacher"] },
  { key: "reports", path: "/reports", view: "reports", permission: "attendance.take", feature: "reports", roles: ["principal", "teacher"] },
  { key: "blog", path: "/blog", view: "blog", feature: "blog", roles: ["principal", "teacher"] },
  { key: "settings", path: "/settings", view: "settings", permission: "academics.manage" },
  { key: "profile", path: "/my-profile", view: "profile", roles: ["teacher", "student"] },
];

export function isPortalRouteAccessible(
  route: PortalRoute,
  userRole: string | null | undefined,
  hasPermission: (permission: string) => boolean,
  hasFeature: (feature: string) => boolean,
): boolean {
  return Boolean(
    userRole &&
    (!route.permission || hasPermission(route.permission)) &&
    (!route.permissionsAny || route.permissionsAny.some(hasPermission)) &&
    (!route.feature || hasFeature(route.feature)) &&
    (!route.roles || route.roles.includes(userRole)),
  );
}

export function isNavItemAccessible(
  item: NavItem,
  userRole: string | null | undefined,
  hasPermission: (permission: string) => boolean,
  hasFeature: (feature: string) => boolean,
): boolean {
  return portalRoutes.some(
    (route) => route.view === item.id && isPortalRouteAccessible(route, userRole, hasPermission, hasFeature),
  );
}

export function resolveNavItemPath(
  item: NavItem,
  userRole: string | null | undefined,
  hasPermission: (permission: string) => boolean,
  hasFeature: (feature: string) => boolean,
): string {
  return portalRoutes.find(
    (route) => route.view === item.id && isPortalRouteAccessible(route, userRole, hasPermission, hasFeature),
  )?.path ?? "/dashboard";
}

export const peopleIcons = { teachers: UserRoundCog, students: GraduationCap };
export const assessmentIcons = { assignments: ClipboardList, results: BookOpen };
