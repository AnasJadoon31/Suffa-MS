import {
  BookOpen,
  Boxes,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  UserRoundCog,
  UsersRound
} from "lucide-react";

export type AttendanceStatus = "present" | "absent" | "leave";
export type ViewId =
  | "dashboard"
  | "attendance"
  | "academics"
  | "people"
  | "assessments";

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
  { id: "assessments", labelKey: "assessments", icon: ClipboardList, permission: "assignments.create" }
];

export const peopleIcons = { teachers: UserRoundCog, students: GraduationCap, guardians: UsersRound };
export const assessmentIcons = { assignments: ClipboardList, results: BookOpen };
