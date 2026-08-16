import { api, getAllPages, getPage } from "./api";

/* Types and paths mirror the existing FastAPI backend exactly — no backend changes. */

// ------------------------------------------------------------------ Academics
export interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  gregorian_start?: string;
  gregorian_end?: string;
  hijri_span?: string;
  is_active: boolean;
}

interface AcademicSessionApi {
  id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  gregorian_start?: string;
  gregorian_end?: string;
  hijri_span?: string;
  is_active: boolean;
}

function normalizeSession(session: AcademicSessionApi): AcademicSession {
  return {
    ...session,
    start_date: session.start_date ?? session.gregorian_start ?? "",
    end_date: session.end_date ?? session.gregorian_end ?? "",
  };
}
export interface AcademicClass {
  id: string;
  program_id: string;
  name: string;
  default_portal_enabled?: boolean;
  assignment_limit?: number | null;
  section_count?: number;
}

export const academicsApi = {
  today: (date?: string) =>
    api
      .get<{ gregorian: string; hijri: string }>("/api/v1/academics/today", {
        params: date ? { date } : {},
      })
      .then((r) => r.data),
  listSessions: () =>
    getAllPages<AcademicSessionApi>("/api/v1/academics/sessions").then((rows) => rows.map(normalizeSession)),
  listClasses: () => getAllPages<AcademicClass>("/api/v1/academics/classes"),
};

// --------------------------------------------------------------------- People
export interface Student {
  id: string;
  user_id: string | null;
  admission_number: string;
  name: string;
  status: string;
  phone?: string | null;
  phone_list?: string[];
  default_phone_number?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  portal_enabled?: boolean;
  photo_file_id?: string | null;
  current_class?: string | null;
  b_form_number?: string | null;
  is_independent?: boolean;
  admission_record?: { fields_definition: import("./more-endpoints").FormFieldDefinition[]; answers: Record<string, unknown> } | null;
}
export interface Teacher {
  id: string;
  user_id: string | null;
  employee_code: string;
  name: string;
  status: string;
  whatsapp_number?: string | null;
  phone_list?: string[];
  default_phone_number?: string | null;
  qualifications?: string | null;
  join_date?: string | null;
  is_principal_delegate?: boolean;
}
export interface Guardian {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string;
  relationship: string;
  phone_numbers: string;
  phone_list?: string[];
  default_phone_number?: string | null;
  status?: string;
}

export const peopleApi = {
  getStudent: (studentId: string) => api.get<Student>(`/api/v1/people/students/${studentId}`).then((r) => r.data),
  listStudentsPage: (params: { search?: string; limit: number; offset: number; section_id?: string }) =>
    getPage<Student>("/api/v1/people/students", params),
  listTeachers: () => getAllPages<Teacher>("/api/v1/people/teachers"),
  listTeachersPage: (params: { search?: string; limit: number; offset: number }) =>
    getPage<Teacher>("/api/v1/people/teachers", params),

  listGuardiansPage: (params: { search?: string; limit: number; offset: number }) =>
    getPage<Guardian>("/api/v1/people/guardians", params),
  myProfile: () => api.get<MyPersonProfile>("/api/v1/people/me/profile").then((r) => r.data),
  updateMyProfile: (payload: Record<string, unknown>) => api.patch<MyPersonProfile>("/api/v1/people/me/profile", payload).then((r) => r.data),
};

export interface MyPersonProfile { profile_type: "student" | "guardian"; profile: Student | Guardian; }

// ----------------------------------------------------------------- Attendance
export type AttendanceStatus = "present" | "absent" | "leave";

export interface AttendanceClassOption {
  id: string;
  name: string;
  program_id?: string | null;
  self_contained?: boolean;
  courses: { id: string; name: string }[];
  student_count: number;
  sections: { id: string; name: string; student_count: number }[];
}
export interface AttendanceRosterStudent {
  id: string;
  admission_number: string;
  name: string;
  section_id: string | null;
  section_name: string | null;
}
export interface AttendanceRoster {
  session_id: string;
  session_name: string;
  class_id: string;
  class_name: string;
  section_id: string | null;
  section_name: string | null;
  course: { id: string; name: string } | null;
  timetable_slot: {
    id: string;
    period: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
  } | null;
  students: AttendanceRosterStudent[];
}
export interface AttendanceMarker {
  id: string;
  username: string;
  display_name: string;
  role: string;
}
export interface AttendanceLogEntry {
  id: string;
  attendance_date: string;
  student_id: string;
  student_name: string;
  admission_number: string;
  status: AttendanceStatus;
  marked_at: string;
  synced_at: string;
  marked_by: AttendanceMarker;
  overridden: boolean;
  source: "manual" | "approved_leave";
  locked_reason: "approved_leave" | null;
  leave_id: string | null;
  course: { id: string; name: string } | null;
  timetable_slot: {
    id: string;
    period: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
  } | null;
  legacy_general: boolean;
}
export interface ClassAttendanceHistory {
  session_id: string;
  session_name: string;
  class_id: string;
  class_name: string;
  entries: AttendanceLogEntry[];
}
export interface StudentAttendanceHistory extends ClassAttendanceHistory {
  student: AttendanceRosterStudent;
}
export interface TeacherAttendanceLogEntry {
  id: string;
  session_id: string;
  teacher_id: string;
  teacher_name: string;
  employee_code: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  marked_at: string;
  synced_at: string;
  marked_by: AttendanceMarker;
  overridden: boolean;
}
export interface AttendanceDateRange {
  start_date?: string;
  end_date?: string;
  section_id?: string;
  course_id?: string;
}
export interface TeacherAttendanceToday {
  session_id: string;
  teacher_id: string;
  teacher_name: string;
  attendance_date: string;
  id: string | null;
  status: AttendanceStatus | null;
  check_in: string | null;
  check_out: string | null;
}
export interface AttendanceSyncEntry {
  subject_type: "student" | "teacher";
  subject_id: string;
  session_id: string;
  course_id?: string;
  timetable_slot_id?: string;
  attendance_date: string;
  status: AttendanceStatus;
  captured_at?: string;
  idempotency_key: string;
  check_in?: string;
  check_out?: string;
}

export const attendanceApi = {
  listClasses: (params?: {
    attendance_date?: string;
    start_date?: string;
    end_date?: string;
    attendance_status?: AttendanceStatus;
  }) =>
    getAllPages<AttendanceClassOption>("/api/v1/attendance/classes", params),
  classRoster: (classId: string, sectionId?: string, courseId?: string, timetableSlotId?: string) =>
    api
      .get<AttendanceRoster>(`/api/v1/attendance/classes/${classId}/roster`, {
        params: {
          section_id: sectionId || undefined,
          course_id: courseId || undefined,
          timetable_slot_id: timetableSlotId || undefined,
        },
      })
      .then((r) => r.data),
  classHistory: (classId: string, range?: AttendanceDateRange) =>
    api
      .get<ClassAttendanceHistory>(`/api/v1/attendance/classes/${classId}/history`, {
        params: range,
      })
      .then((r) => r.data),
  studentHistory: (classId: string, studentId: string, range?: AttendanceDateRange, courseId?: string) =>
    api
      .get<StudentAttendanceHistory>(
        `/api/v1/attendance/classes/${classId}/students/${studentId}/history`,
        { params: { ...range, ...(courseId ? { course_id: courseId } : {}) } },
      )
      .then((r) => r.data),
  sync: (entries: AttendanceSyncEntry[]) =>
    api
      .post<{ idempotency_keys: string[]; locked?: string[] }>("/api/v1/attendance/sync", {
        entries,
      })
      .then((r) => r.data),
  override: (entry: AttendanceSyncEntry, reason: string) =>
    api
      .post<{ idempotency_key: string; subject_id: string }>("/api/v1/attendance/override", {
        entry,
        reason,
      })
      .then((r) => r.data),
  myStudentHistory: (range?: AttendanceDateRange) =>
    api
      .get<StudentAttendanceHistory>("/api/v1/attendance/students/me/history", { params: range })
      .then((r) => r.data),
  myTeacherAttendanceToday: () =>
    api.get<TeacherAttendanceToday>("/api/v1/attendance/teachers/me/today").then((r) => r.data),
  teacherCheckIn: () =>
    api.post<TeacherAttendanceToday>("/api/v1/attendance/teachers/me/check-in").then((r) => r.data),
  teacherCheckOut: () =>
    api
      .post<TeacherAttendanceToday>("/api/v1/attendance/teachers/me/check-out")
      .then((r) => r.data),
  teacherHistory: (params?: AttendanceDateRange & { teacher_id?: string }) =>
    getAllPages<TeacherAttendanceLogEntry>("/api/v1/attendance/teachers/history", params),
  myTeacherHistory: (params?: AttendanceDateRange) =>
    getAllPages<TeacherAttendanceLogEntry>("/api/v1/attendance/teachers/me/history", params),
};

// ------------------------------------------------------------------ Timetable
export interface TimetableSlot {
  id: string;
  class_id: string;
  section_id: string | null;
  course_id: string;
  teacher_id: string | null;
  day_of_week: number;
  period: number;
  start_time: string;
  end_time: string;
  class_name?: string | null;
  section_name?: string | null;
  course_name?: string | null;
  teacher_name?: string | null;
  student_id?: string | null;
  student_name?: string | null;
}

export const operationsApi = {
  listMyTimetable: () => getAllPages<TimetableSlot>("/api/v1/operations/timetable/me"),
  listTimetable: (params?: { class_id?: string; section_id?: string }) =>
    getAllPages<TimetableSlot>("/api/v1/operations/timetable", params),
  listHolidays: () =>
    getAllPages<{ id: string; name: string; start_date: string; end_date: string }>(
      "/api/v1/operations/holidays",
    ),
};

// ------------------------------------------------------------------ Reporting
export interface TimetableEntry {
  course_id: string;
  period: number;
  start_time: string;
  end_time: string;
}
export interface PrincipalDashboard {
  role: "principal";
  counts: { students: number; teachers: number; classes: number };
  attendance: {
    present: number;
    absent: number;
    leave: number;
    total_students: number;
    missing_sync_teachers: number;
    missing_sync_teacher_list: { id: string; name: string }[];
  };
  finance: { month_total: number; currency: string };
  incomplete_profiles: { students: number; guardians: number };
}
export interface TeacherDashboard {
  role: "teacher";
  my_classes: {
    class_id: string;
    course_id: string;
    class_name: string;
    course_name: string;
    section_id: string | null;
    section_name: string | null;
  }[];
  pending_submissions: number;
  today_timetable: TimetableEntry[];
  today_attendance: TeacherAttendanceToday | null;
}
export interface StudentDashboard {
  role: "student";
  my_attendance: Record<string, AttendanceStatus>;
  today_timetable: TimetableEntry[];
  due_assignments: {
    id: string;
    title: string;
    due_date: string;
    course_id: string;
    submitted?: boolean;
  }[];
  resources: { id: string; title: string }[];
  announcements?: { id: string; title: string; body: string }[];
}
export interface ParentDashboardChild {
  id: string;
  name: string;
  admission_number: string | null;
  current_class: { id: string; name: string; section_id: string | null; section_name: string | null } | null;
  my_attendance: Record<string, string>;
  today_timetable: { period: number; start_time: string; end_time: string }[];
  due_assignments: { id: string; title: string; due_date: string; submitted?: boolean }[];
  latest_result: { course_results: { course_id: string; course_name: string; grade: string }[] } | null;
  fee_summary: { totals: { currency: string; amount: number }[] };
  payments: { id: string; category: string; amount: number; currency: string; payment_date: string }[];
  profile_complete: boolean;
  missing_fields: string[];
}
export interface ParentDashboard {
  role: "parent";
  children: ParentDashboardChild[];
}
export type DashboardData =
  | PrincipalDashboard
  | TeacherDashboard
  | StudentDashboard
  | ParentDashboard;

export const reportingApi = {
  dashboard: () => api.get<DashboardData>("/api/v1/reporting/dashboard").then((r) => r.data),
  incompleteProfiles: (profileType?: "student" | "guardian") => api.get<IncompleteProfile[]>("/api/v1/reporting/incomplete-profiles", { params: profileType ? { profile_type: profileType } : undefined }).then((r) => r.data),
  remindIncompleteProfiles: (profile_type: "student" | "guardian", profile_ids: string[]) => api.post<{ sent: number }>("/api/v1/reporting/incomplete-profiles/remind", { profile_type, profile_ids }).then((r) => r.data),
};

export interface IncompleteProfile {
  id: string;
  profile_type: "student" | "guardian";
  name: string;
  missing_fields: string[];
  phone: string | null;
}

// ----------------------------------------------------------------------- Auth
export const authApi = {
  token: (username: string, password: string, tenant: string) =>
    api
      .post<{ access_token: string }>(
        "/api/v1/auth/token",
        { username, password },
        { headers: { "X-Madrasa": tenant } },
      )
      .then((r) => r.data),
  me: () => api.get("/api/v1/auth/me").then((r) => r.data),
  updateMe: (payload: {
    username?: string;
    preferred_language?: string;
    selected_session_id?: string | null;
    clear_selected_session?: boolean;
  }) => api.patch("/api/v1/auth/me", payload).then((r) => r.data),
  changePassword: (payload: { current_password: string; new_password: string }) =>
    api.post("/api/v1/auth/change-password", payload).then((r) => r.data),
};
