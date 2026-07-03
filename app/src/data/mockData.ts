import {
  Bell,
  BookOpen,
  Boxes,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileInput,
  FileText,
  GraduationCap,
  KeyRound,
  Megaphone,
  MessageCircle,
  Newspaper,
  ScrollText,
  Settings,
  UserRoundCog,
  UsersRound,
  WalletCards
} from "lucide-react";

export type AttendanceStatus = "present" | "absent" | "leave";
export type ViewId =
  | "dashboard"
  | "attendance"
  | "auth"
  | "academics"
  | "teachers"
  | "salary"
  | "students"
  | "guardians"
  | "assignments"
  | "results"
  | "timetable"
  | "resources"
  | "forms"
  | "announcements"
  | "finance"
  | "messaging"
  | "reports"
  | "blog"
  | "admissions"
  | "settings";

export type Student = Readonly<{
  id: string;
  admissionNumber: string;
  name: string;
  className: string;
  status: AttendanceStatus | "unmarked";
}>;

export type NavItem = Readonly<{
  id: ViewId;
  labelKey: string;
  icon: typeof ClipboardCheck;
  permission?: string;
}>;

export const navItems: readonly NavItem[] = [
  { id: "dashboard", labelKey: "dashboard", icon: ClipboardCheck },
  { id: "attendance", labelKey: "attendance", icon: CalendarDays, permission: "attendance.mark" },
  { id: "auth", labelKey: "auth", icon: KeyRound, permission: "users.manage" },
  { id: "academics", labelKey: "academics", icon: Boxes, permission: "academics.manage" },
  { id: "students", labelKey: "students", icon: GraduationCap, permission: "students.add" },
  { id: "guardians", labelKey: "guardians", icon: UsersRound, permission: "students.add" },
  { id: "teachers", labelKey: "teachers", icon: UserRoundCog, permission: "teachers.add" },
  { id: "salary", labelKey: "salary", icon: WalletCards, permission: "salary.manage" },
  { id: "assignments", labelKey: "assignments", icon: ClipboardList, permission: "assignments.manage_all" },
  { id: "results", labelKey: "results", icon: BookOpen, permission: "results.publish" },
  { id: "timetable", labelKey: "timetable", icon: CalendarCheck, permission: "timetable.manage" },
  { id: "resources", labelKey: "resources", icon: FileText, permission: "resources.manage" },
  { id: "forms", labelKey: "forms", icon: FileInput, permission: "forms.manage" },
  { id: "announcements", labelKey: "announcements", icon: Bell, permission: "announcements.manage" },
  { id: "finance", labelKey: "finance", icon: CircleDollarSign, permission: "finance.manage" },
  { id: "messaging", labelKey: "messaging", icon: MessageCircle, permission: "messaging.send" },
  { id: "reports", labelKey: "reports", icon: ScrollText, permission: "reports.view" },
  { id: "blog", labelKey: "blog.manage", icon: Newspaper, permission: "blog.manage" },
  { id: "admissions", labelKey: "admissions", icon: Megaphone, permission: "admissions.review" },
  { id: "settings", labelKey: "settings", icon: Settings }
];

export const students: readonly Student[] = [
  { id: "13c1cbf0-5be1-4647-bb27-5d97f3debdba", admissionNumber: "ADM-0001", name: "Ahmad Ali", className: "Darja 1", status: "unmarked" },
  { id: "4be8120e-97f3-4bf4-ab46-add3341aa52b", admissionNumber: "ADM-0002", name: "Hamza Khan", className: "Darja 1", status: "unmarked" },
  { id: "821caaa1-1e36-4093-b2f8-29f06ed5eaf5", admissionNumber: "ADM-0003", name: "Bilal Usman", className: "Darja 1", status: "unmarked" },
  { id: "3f400a0a-af52-463c-b25b-a6b981d71260", admissionNumber: "ADM-0004", name: "Saad Noor", className: "Darja 1", status: "unmarked" }
];

export type ModuleRecord = Record<string, string> & { id: string };

export const moduleSeeds: Record<string, ModuleRecord[]> = {
  auth: [
    { id: "usr-1", username: "principal", role: "Principal", language: "English", state: "Active" },
    { id: "usr-2", username: "tch-yusuf", role: "Teacher", language: "Urdu", state: "Invited" }
  ],
  academics: [
    { id: "acad-1", program: "Hifz", className: "Darja 1", section: "A", course: "Quran", session: "1448 / 2026" },
    { id: "acad-2", program: "Dars-e-Nizami", className: "Sanat 1", section: "A", course: "Fiqh", session: "1448 / 2026" }
  ],
  students: students.map((student) => ({
    id: student.id,
    admissionNumber: student.admissionNumber,
    name: student.name,
    className: student.className,
    portal: "Enabled",
    state: "Active"
  })),
  guardians: [
    { id: "grd-1", name: "Abdul Ali", relationship: "Father", phone: "923001234567", language: "Urdu", students: "Ahmad Ali" },
    { id: "grd-2", name: "Usman Khan", relationship: "Father", phone: "923331112222", language: "English", students: "Bilal Usman" }
  ],
  teachers: [
    { id: "tch-1", code: "TCH-0001", name: "Maulana Yusuf", assignment: "Darja 1 · Quran", status: "Active" },
    { id: "tch-2", code: "TCH-0002", name: "Qari Bilal", assignment: "Darja 2 · Tajweed", status: "Active" },
    { id: "tch-3", code: "TCH-0003", name: "Mufti Hassan", assignment: "Dars-e-Nizami · Fiqh", status: "Leave" }
  ],
  salary: [
    { id: "sal-1", teacher: "Maulana Yusuf", amount: "65000", period: "June 2026", method: "Cash", state: "Paid" },
    { id: "sal-2", teacher: "Qari Bilal", amount: "55000", period: "June 2026", method: "Bank", state: "Pending" }
  ],
  assignments: [
    { id: "asg-1", title: "Sabaq revision", className: "Darja 1", course: "Quran", dueDate: "2026-06-30", state: "Open" },
    { id: "asg-2", title: "Tajweed worksheet", className: "Darja 2", course: "Tajweed", dueDate: "2026-07-02", state: "Open" }
  ],
  results: [
    { id: "res-1", student: "Ahmad Ali", course: "Quran", score: "92", grade: "Mumtaz", state: "Published" },
    { id: "res-2", student: "Hamza Khan", course: "Quran", score: "84", grade: "Jayyid Jiddan", state: "Draft" },
    { id: "res-3", student: "Bilal Usman", course: "Quran", score: "73", grade: "Jayyid", state: "Draft" }
  ],
  timetable: [
    { id: "tt-1", day: "Monday", period: "08:00-09:00", className: "Darja 1", course: "Quran", teacher: "Maulana Yusuf" },
    { id: "tt-2", day: "Tuesday", period: "09:00-10:00", className: "Darja 2", course: "Tajweed", teacher: "Qari Bilal" }
  ],
  resources: [
    { id: "rsc-1", title: "Hifz revision notes", category: "Notes", visibility: "Darja 1", type: "PDF" },
    { id: "rsc-2", title: "Tajweed video", category: "Video", visibility: "Darja 2", type: "Link" }
  ],
  forms: [
    { id: "frm-1", title: "Leave request", audience: "Students", fields: "Reason, Dates", state: "Open" },
    { id: "frm-2", title: "Parent feedback", audience: "Guardians", fields: "Comments, Rating", state: "Draft" }
  ],
  announcements: [
    { id: "ann-1", title: "Holiday notice", audience: "All", expiry: "2026-07-01", state: "Published" },
    { id: "ann-2", title: "Exam schedule", audience: "Darja 1", expiry: "2026-07-10", state: "Draft" }
  ],
  finance: [
    { id: "fin-1", source: "Student contribution · ADM-0001", category: "Monthly support", amount: "12000", state: "Receipted" },
    { id: "fin-2", source: "Community donor · Abdul Rehman", category: "Library", amount: "50000", state: "Recorded" },
    { id: "fin-3", source: "Student contribution · ADM-0002", category: "Meals", amount: "8500", state: "Recorded" }
  ],
  messaging: [
    { id: "msg-1", recipient: "Abdul Ali", phone: "923001234567", template: "Performance report", language: "Urdu", state: "Ready" },
    { id: "msg-2", recipient: "Usman Khan", phone: "923331112222", template: "Credentials", language: "English", state: "Ready" }
  ],
  reports: [
    { id: "rpt-1", title: "Attendance summary", scope: "Darja 1", period: "June 2026", format: "CSV/PDF", state: "Ready" },
    { id: "rpt-2", title: "Finance breakdown", scope: "All", period: "June 2026", format: "CSV/PDF", state: "Ready" }
  ],
  blog: [
    { id: "post-1", title: "Attendance with accountability", author: "Maulana Yusuf", category: "Operations", state: "Draft" },
    { id: "post-2", title: "Hifz progress reports", author: "Qari Bilal", category: "Academics", state: "Published" }
  ],
  admissions: [
    { id: "adm-app-1", student: "Muhammad Umar", guardian: "Faisal", program: "Hifz", phone: "923004445555", state: "Pending" },
    { id: "adm-app-2", student: "Abdullah Noor", guardian: "Naveed", program: "Nazira", phone: "923226667777", state: "Pending" }
  ],
  settings: [
    { id: "set-1", key: "Content language", value: "Urdu", state: "Saved" },
    { id: "set-2", key: "Default portal access", value: "Class default", state: "Saved" },
    { id: "set-3", key: "Attendance lock", value: "23:59", state: "Saved" }
  ]
};
