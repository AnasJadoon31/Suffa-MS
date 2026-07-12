import { api } from "./api";

// ---------------------------------------------------------------- Academics

export interface Program { id: string; name: string; created_at: string }
export interface AcademicClass { id: string; program_id: string; name: string; default_portal_enabled: boolean }
export interface Section { id: string; class_id: string; name: string }
export interface Course { id: string; name: string }
export interface AcademicSession {
  id: string; name: string; gregorian_start: string; gregorian_end: string; hijri_span: string; is_active: boolean;
}
export interface TeacherAssignment { id: string; teacher_id: string; session_id: string; class_id: string; course_id: string }

export const academicsApi = {
  today: () => api.get<{ gregorian: string; hijri: string }>("/api/v1/academics/today").then((r) => r.data),
  listPrograms: () => api.get<Program[]>("/api/v1/academics/programs").then((r) => r.data),
  createProgram: (name: string) => api.post<Program>("/api/v1/academics/programs", { name }).then((r) => r.data),
  updateProgram: (id: string, payload: { name: string }) => api.put<Program>(`/api/v1/academics/programs/${id}`, payload).then((r) => r.data),
  deleteProgram: (id: string) => api.delete(`/api/v1/academics/programs/${id}`).then((r) => r.data),

  listClasses: () => api.get<AcademicClass[]>("/api/v1/academics/classes").then((r) => r.data),
  createClass: (program_id: string, name: string) =>
    api.post<AcademicClass>("/api/v1/academics/classes", { program_id, name }).then((r) => r.data),
  updateClass: (id: string, payload: { program_id?: string; name?: string; default_portal_enabled?: boolean }) =>
    api.put<AcademicClass>(`/api/v1/academics/classes/${id}`, payload).then((r) => r.data),
  deleteClass: (id: string) => api.delete(`/api/v1/academics/classes/${id}`).then((r) => r.data),

  listSections: (classId: string) =>
    api.get<Section[]>(`/api/v1/academics/classes/${classId}/sections`).then((r) => r.data),
  createSection: (classId: string, name: string) =>
    api.post<Section>(`/api/v1/academics/classes/${classId}/sections`, { name }).then((r) => r.data),
  updateSection: (classId: string, id: string, payload: { name: string }) =>
    api.put<Section>(`/api/v1/academics/classes/${classId}/sections/${id}`, payload).then((r) => r.data),
  deleteSection: (classId: string, id: string) =>
    api.delete(`/api/v1/academics/classes/${classId}/sections/${id}`).then((r) => r.data),

  listAllCourses: () =>
    api.get<Course[]>("/api/v1/academics/courses").then((r) => r.data),
  listCourses: (classId: string) =>
    api.get<Course[]>(`/api/v1/academics/classes/${classId}/courses`).then((r) => r.data),
  createCourse: (name: string) =>
    api.post<Course>("/api/v1/academics/courses", { name }).then((r) => r.data),
  updateCourse: (id: string, payload: { name: string }) =>
    api.put<Course>(`/api/v1/academics/courses/${id}`, payload).then((r) => r.data),
  deleteCourse: (id: string) =>
    api.delete(`/api/v1/academics/courses/${id}`).then((r) => r.data),

  assignCourseToClass: (classId: string, courseId: string) =>
    api.post(`/api/v1/academics/classes/${classId}/courses/assign`, { course_id: courseId }).then((r) => r.data),
  unassignCourseFromClass: (classId: string, courseId: string) =>
    api.delete(`/api/v1/academics/classes/${classId}/courses/${courseId}`).then((r) => r.data),
  listSessions: () => api.get<AcademicSession[]>("/api/v1/academics/sessions").then((r) => r.data),
  createSession: (payload: {
    name: string; gregorian_start: string; gregorian_end: string; hijri_span: string; is_active?: boolean;
  }) => api.post<AcademicSession>("/api/v1/academics/sessions", payload).then((r) => r.data),
  updateSession: (id: string, payload: {
    name?: string; gregorian_start?: string; gregorian_end?: string; hijri_span?: string; is_active?: boolean;
  }) => api.put<AcademicSession>(`/api/v1/academics/sessions/${id}`, payload).then((r) => r.data),
  deleteSession: (id: string) => api.delete(`/api/v1/academics/sessions/${id}`).then((r) => r.data),
  rolloverSession: (id: string, payload: {
    name: string; gregorian_start: string; gregorian_end: string; hijri_span: string;
    class_mappings: { current_class_id: string; next_class_id: string | null }[];
    copy_teacher_assignments: boolean; copy_timetable?: boolean; copy_holidays?: boolean; shift_holiday_dates?: boolean;
  }) => api.post<AcademicSession>(`/api/v1/academics/sessions/${id}/rollover`, payload).then((r) => r.data),
  activateSession: (id: string) =>
    api.post<AcademicSession>(`/api/v1/academics/sessions/${id}/activate`).then((r) => r.data),
  listTeacherAssignments: () =>
    api.get<TeacherAssignment[]>("/api/v1/academics/teacher-assignments").then((r) => r.data),
  createTeacherAssignment: (payload: { teacher_id: string; session_id: string; class_id: string; course_id: string }) =>
    api.post<TeacherAssignment>("/api/v1/academics/teacher-assignments", payload).then((r) => r.data),
  enrollStudent: (payload: {
    student_id: string; session_id: string; program_id: string; class_id: string; section_id: string;
  }) => api.post("/api/v1/academics/students/enroll", payload).then((r) => r.data),
};

// -------------------------------------------------------------------- People

export interface Teacher {
  id: string; user_id: string; employee_code: string; name: string; whatsapp_number: string; qualifications: string | null;
  join_date: string | null; status: string; notes: string | null; created_at: string; set_password_url?: string;
}
export interface Student {
  id: string; user_id: string; admission_number: string; name: string; date_of_birth: string; status: string;
  portal_enabled: boolean; notes: string | null; created_at: string; set_password_url?: string;
}
export interface Guardian {
  id: string; user_id: string | null; name: string; relationship: string; phone_numbers: string;
  cnic: string | null; address: string | null; preferred_language: string; created_at: string;
}

export interface PermissionDef { code: string; label: string; module: string; scoped: boolean }
export interface PermissionGrant {
  permission_code: string; scope_type: string | null; scope_id: string | null;
  granted_by_id: string; created_at: string;
}

export interface PlatformMadrasa { id: string; slug: string; name: string; content_language: string; created_at: string }
export interface FeatureFlag { key: string; label: string; enabled: boolean }

export const platformApi = {
  listMadaris: () => api.get<PlatformMadrasa[]>("/api/v1/platform/madaris").then((r) => r.data),
  createMadrasa: (payload: {
    name: string; slug: string; content_language?: string; principal_username: string; disabled_features?: string[];
  }) =>
    api.post<{ madrasa_id: string; slug: string; principal_user_id: string; set_password_url: string }>(
      "/api/v1/platform/madaris", payload
    ).then((r) => r.data),
  getFeatures: (madrasaId: string) =>
    api.get<FeatureFlag[]>(`/api/v1/platform/madaris/${madrasaId}/features`).then((r) => r.data),
  setFeatures: (madrasaId: string, features: Record<string, boolean>) =>
    api.put<FeatureFlag[]>(`/api/v1/platform/madaris/${madrasaId}/features`, { features }).then((r) => r.data),
};

export const authApi = {
  permissionCatalog: () => api.get<PermissionDef[]>("/api/v1/auth/permissions").then((r) => r.data),
  userPermissions: (userId: string) =>
    api.get<PermissionGrant[]>(`/api/v1/auth/users/${userId}/permissions`).then((r) => r.data),
  setGrants: (userId: string, grants: { code: string; scope_type?: "class" | "section"; scope_id?: string }[]) =>
    api.put("/api/v1/auth/permissions/grants", { user_id: userId, grants }).then((r) => r.data),
};

export const peopleApi = {
  listTeachers: (search?: string) =>
    api.get<Teacher[]>("/api/v1/people/teachers", { params: { search } }).then((r) => r.data),
  createTeacher: (payload: {
    username: string; name: string; whatsapp_number?: string; qualifications?: string; join_date?: string;
    cnic?: string; address?: string; emergency_contact?: string;
  }) =>
    api.post<Teacher>("/api/v1/people/teachers", payload).then((r) => r.data),
  deactivateTeacher: (id: string) => api.post(`/api/v1/people/teachers/${id}/deactivate`).then((r) => r.data),

  listStudents: (search?: string) =>
    api.get<Student[]>("/api/v1/people/students", { params: { search } }).then((r) => r.data),
  createStudent: (payload: {
    username: string; name: string; date_of_birth: string; guardian_ids?: string[];
    b_form_number?: string; address?: string;
  }) =>
    api.post<Student>("/api/v1/people/students", payload).then((r) => r.data),
  deactivateStudent: (id: string) => api.post(`/api/v1/people/students/${id}/deactivate`).then((r) => r.data),

  listGuardians: (search?: string) =>
    api.get<Guardian[]>("/api/v1/people/guardians", { params: { search } }).then((r) => r.data),
  createGuardian: (payload: {
    name: string; relationship: string; phone_numbers: string; student_ids?: string[]; cnic?: string; address?: string;
  }) =>
    api.post<Guardian>("/api/v1/people/guardians", payload).then((r) => r.data),
  guardianCredentialsLink: (guardianId: string, username?: string) =>
    api.post<{ username: string; set_password_url: string }>(
      `/api/v1/people/guardians/${guardianId}/credentials-link`, { username }
    ).then((r) => r.data),
  studentGuardians: (studentId: string) =>
    api.get<Guardian[]>(`/api/v1/people/students/${studentId}/guardians`).then((r) => r.data),

  reissueTeacherCredentials: (teacherId: string) =>
    api.post<{ username: string; set_password_url: string }>(`/api/v1/people/teachers/${teacherId}/credentials-link`).then((r) => r.data),
  reissueStudentCredentials: (studentId: string) =>
    api.post<{ username: string; set_password_url: string }>(`/api/v1/people/students/${studentId}/credentials-link`).then((r) => r.data),
};

// -------------------------------------------------------------------- Messaging

export interface WhatsAppLink { normalised_number: string; url: string }

export const messagingApi = {
  sendCredentials: (payload: { subject_type: "student" | "teacher"; subject_id: string; set_password_url: string }) =>
    api.post<WhatsAppLink>("/api/v1/messaging/send-credentials", payload).then((r) => r.data),
  sendReport: (payload: { student_id: string; result_link?: string }) =>
    api.post<WhatsAppLink>("/api/v1/messaging/send-report", payload).then((r) => r.data),
};

// ---------------------------------------------------------------- Attendance

export interface AttendanceClassOption {
  id: string;
  name: string;
  course_names: string[];
  student_count: number;
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
  status: "present" | "absent" | "leave";
  marked_at: string;
  synced_at: string;
  marked_by: AttendanceMarker;
  overridden: boolean;
  source: "manual" | "approved_leave";
  locked_reason: "approved_leave" | null;
  leave_id: string | null;
}
export interface TeacherAttendanceLogEntry {
  id: string;
  teacher_id: string;
  teacher_name: string;
  employee_code: string;
  attendance_date: string;
  status: "present" | "absent" | "leave";
  check_in: string | null;
  check_out: string | null;
  marked_at: string;
  synced_at: string;
  marked_by: AttendanceMarker;
  overridden: boolean;
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

export interface AttendanceDateRange {
  start_date?: string;
  end_date?: string;
}
export interface TeacherAttendanceToday {
  session_id: string;
  teacher_id: string;
  teacher_name: string;
  attendance_date: string;
  id: string | null;
  status: "present" | "absent" | "leave" | null;
  check_in: string | null;
  check_out: string | null;
}

export const attendanceApi = {
  listClasses: () => api.get<AttendanceClassOption[]>("/api/v1/attendance/classes").then((r) => r.data),
  classRoster: (classId: string) =>
    api.get<AttendanceRoster>(`/api/v1/attendance/classes/${classId}/roster`).then((r) => r.data),
  classHistory: (classId: string, range?: AttendanceDateRange) =>
    api
      .get<ClassAttendanceHistory>(`/api/v1/attendance/classes/${classId}/history`, { params: range })
      .then((r) => r.data),
  studentHistory: (classId: string, studentId: string, range?: AttendanceDateRange) =>
    api
      .get<StudentAttendanceHistory>(`/api/v1/attendance/classes/${classId}/students/${studentId}/history`, {
        params: range,
      })
      .then((r) => r.data),
  myTeacherAttendanceToday: () =>
    api.get<TeacherAttendanceToday>("/api/v1/attendance/teachers/me/today").then((r) => r.data),
  teacherCheckIn: () =>
    api.post<TeacherAttendanceToday>("/api/v1/attendance/teachers/me/check-in").then((r) => r.data),
  teacherCheckOut: () =>
    api.post<TeacherAttendanceToday>("/api/v1/attendance/teachers/me/check-out").then((r) => r.data),
  teacherHistory: (params?: AttendanceDateRange & { teacher_id?: string }) =>
    api.get<TeacherAttendanceLogEntry[]>("/api/v1/attendance/teachers/history", { params }).then((r) => r.data),
};

// --------------------------------------------------------------- Assessments

export interface Assignment {
  id: string; class_id: string; section_id: string | null; course_id: string; title: string;
  category: string | null; instructions: string;
  attachment_key: string | null; due_date: string; target_student_ids: string[] | null;
  created_by_id: string | null; batch_id: string | null; created_at: string;
  class_name: string | null; section_name: string | null; course_name: string | null; teacher_name: string | null;
}

// ---------------------------------------------------- Results matrix (§5)
export interface MatrixExamType { id: string; name: string; weightage: number }
export interface MatrixCourse {
  course_id: string; course_name: string; teacher_name: string | null; exam_types: MatrixExamType[];
}
export interface MatrixMark { exam_type_id: string; score: number | null }
export interface MatrixCourseCell { course_id: string; raw_score: number | null; band: string | null; marks: MatrixMark[] }
export interface MatrixStudentRow {
  student_id: string; name: string; admission_number: string; courses: MatrixCourseCell[]; overall_score: number | null;
}
export interface SectionResultMatrix {
  class_id: string; class_name: string; section_id: string; section_name: string;
  courses: MatrixCourse[]; students: MatrixStudentRow[];
}
export interface ResultsMatrixResponse { session_id: string; sections: SectionResultMatrix[] }
export interface Submission {
  id: string; assignment_id: string; student_id: string; submitted_at: string; file_key: string;
  mark: number | null; feedback: string | null; is_late: boolean;
}
export interface GradingScheme { id: string; name: string; bands: { label: string; min_score: number; max_score: number }[] }
export interface ExamType { id: string; course_id: string; name: string; weightage: number; grading_scheme_id: string }
export interface CourseResult { course_id: string; raw_score: number | null; band: string | null; exam_count: number }
export interface SessionResult {
  session_id: string; student_id: string; course_results: CourseResult[]; overall_score: number | null; published: boolean;
}

export const assessmentsApi = {
  listAssignments: (params?: {
    class_id?: string; section_id?: string; course_id?: string; category?: string; created_by_id?: string; sort?: string;
  }) =>
    api.get<Assignment[]>("/api/v1/assessments/assignments", { params }).then((r) => r.data),
  createAssignment: (payload: {
    class_id: string; course_id: string; section_ids?: string[]; title: string; category?: string;
    instructions: string; due_date: string; attachment_key?: string;
  }) => api.post<Assignment[]>("/api/v1/assessments/assignments", payload).then((r) => r.data),
  updateAssignment: (id: string, payload: {
    title?: string; category?: string; instructions?: string; due_date?: string; apply_to_batch?: boolean;
  }) => api.put<Assignment>(`/api/v1/assessments/assignments/${id}`, payload).then((r) => r.data),
  deleteAssignment: (id: string, wholeBatch = false) =>
    api.delete(`/api/v1/assessments/assignments/${id}`, { params: { whole_batch: wholeBatch } }).then((r) => r.data),
  resultsMatrix: (params: { section_id?: string; class_id?: string }) =>
    api.get<ResultsMatrixResponse>("/api/v1/assessments/results/matrix", { params }).then((r) => r.data),
  exportResults: (params: { section_id?: string; class_id?: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/assessments/results/export", params as Record<string, string>, format),
  listSubmissions: (assignmentId: string) =>
    api.get<Submission[]>(`/api/v1/assessments/assignments/${assignmentId}/submissions`).then((r) => r.data),
  submitAssignment: (assignmentId: string, fileKey: string) =>
    api.post<Submission>(`/api/v1/assessments/assignments/${assignmentId}/submissions`, { file_key: fileKey }).then((r) => r.data),
  gradeSubmission: (submissionId: string, payload: { mark?: number; feedback?: string }) =>
    api.put<Submission>(`/api/v1/assessments/submissions/${submissionId}/grade`, payload).then((r) => r.data),

  listGradingSchemes: () => api.get<GradingScheme[]>("/api/v1/assessments/grading-schemes").then((r) => r.data),
  createGradingScheme: (payload: { name: string; bands: GradingScheme["bands"] }) =>
    api.post<GradingScheme>("/api/v1/assessments/grading-schemes", payload).then((r) => r.data),

  listExamTypes: (courseId?: string) =>
    api.get<ExamType[]>("/api/v1/assessments/exam-types", { params: { course_id: courseId } }).then((r) => r.data),
  createExamType: (payload: { course_id: string; name: string; weightage: number; grading_scheme_id: string }) =>
    api.post<ExamType>("/api/v1/assessments/exam-types", payload).then((r) => r.data),

  enterMark: (payload: { exam_type_id: string; student_id: string; score: number }) =>
    api.put("/api/v1/assessments/marks", payload).then((r) => r.data),

  courseResult: (studentId: string, courseId: string) =>
    api
      .get<CourseResult>("/api/v1/assessments/results/course", { params: { student_id: studentId, course_id: courseId } })
      .then((r) => r.data),
  sessionResult: (studentId: string, sessionId: string) =>
    api
      .get<SessionResult>("/api/v1/assessments/results/session", { params: { student_id: studentId, session_id: sessionId } })
      .then((r) => r.data),
  publishResults: (sessionId: string, studentIds: string[]) =>
    api.post("/api/v1/assessments/results/publish", { session_id: sessionId, student_ids: studentIds }).then((r) => r.data),
  downloadResultCard: (studentId: string, sessionId: string) =>
    downloadReport("/api/v1/assessments/results/card", { student_id: studentId, session_id: sessionId }, "pdf"),
  downloadMyResultCard: (sessionId: string) =>
    downloadReport("/api/v1/assessments/results/card/me", { session_id: sessionId }, "pdf"),
};

// ---------------------------------------------------------------- Reporting

export interface PrincipalDashboard {
  role: "principal";
  counts: { students: number; teachers: number; classes: number };
  attendance: {
    present: number; absent: number; leave: number; total_students: number;
    missing_sync_teachers: number; missing_sync_teacher_list: { id: string; name: string }[];
  };
  finance: { month_total: number; currency: string };
  activity: string[];
}
export interface TimetableEntry { course_id: string; period: number; start_time: string; end_time: string }
export interface TeacherDashboard {
  role: "teacher";
  my_classes: {
    class_id: string; course_id: string; class_name: string; course_name: string;
    section_id: string | null; section_name: string | null;
  }[];
  pending_submissions: number;
  today_timetable: TimetableEntry[];
  today_attendance: TeacherAttendanceToday | null;
}
export interface StudentDashboard {
  role: "student";
  my_attendance: Record<string, "present" | "absent" | "leave">;
  today_timetable: TimetableEntry[];
  latest_result: SessionResult | null;
  due_assignments: { id: string; title: string; due_date: string; course_id: string }[];
  resources: { id: string; title: string }[];
  announcements: { id: string; title: string; body: string }[];
}
export type DashboardData = PrincipalDashboard | TeacherDashboard | StudentDashboard;

async function downloadReport(path: string, params: Record<string, string>, format: "csv" | "pdf"): Promise<void> {
  const response = await api.get(path, { params: { ...params, format }, responseType: "blob" });
  const disposition: string = response.headers["content-disposition"] ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match ? match[1] : `report.${format}`;
  const url = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export const reportingApi = {
  dashboard: () => api.get<DashboardData>("/api/v1/reporting/dashboard").then((r) => r.data),
  downloadAttendanceReport: (params: { class_id: string; section_id?: string; start_date: string; end_date: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/attendance", params as Record<string, string>, format),
  downloadFinanceReport: (params: { start_date: string; end_date: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/finance", params, format),
  downloadSalaryReport: (params: { start_date: string; end_date: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/salary", params, format),
  downloadDonationsReport: (params: { start_date: string; end_date: string; donor_id?: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/donations", params as Record<string, string>, format),
  downloadResultsReport: (params: { class_id: string; session_id: string; section_id?: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/results", params as Record<string, string>, format),
};

// -------------------------------------------------------------- Operations

export interface Scope {
  all: boolean; roles?: string[]; classes?: string[]; sections?: string[]; courses?: string[]; users?: string[];
}
export interface TimetableSlot {
  id: string; session_id: string | null;
  class_id: string; section_id: string; course_id: string; teacher_id: string;
  day_of_week: number; period: number; start_time: string; end_time: string;
  class_name: string | null; section_name: string | null; course_name: string | null; teacher_name: string | null;
}
export interface TimetableImportRow {
  class_name: string; section_name: string; course_name: string; teacher_code: string;
  day_of_week: number; start_time: string; end_time: string;
}
export interface TimetableImportResponse {
  dry_run: boolean; created: number;
  results: { row: number; ok: boolean; error: string | null }[];
}
export interface Holiday {
  id: string; name: string; category: string | null; start_date: string; end_date: string;
  class_ids: string[] | null;
}
export interface Leave {
  id: string; user_id: string; person_name: string | null; person_type: string | null;
  start_date: string; end_date: string; reason: string | null; status: string;
}
export interface ResourceCategory { id: string; name: string }
export interface ResourceItem {
  id: string; category_id: string; title: string; description: string | null;
  file_key: string | null; video_url: string | null; visibility_scope: Scope; created_at: string;
}
export interface FormFieldDefinition { key: string; label: string; type: string; required: boolean; options: string[] }
export interface FormDef {
  id: string; title: string; description: string; fields_definition: FormFieldDefinition[];
  visibility_scope: Scope; open_from: string | null; open_until: string | null; allow_multiple: boolean; created_at: string;
}
export interface FormResponse {
  id: string; form_id: string; student_id: string; submitted_by_id: string; response_data: Record<string, unknown>; created_at: string;
}
export interface Announcement {
  id: string; title: string; body: string; attachment_link: string | null; audience_scope: Scope;
  publish_at: string | null; expires_at: string | null; created_at: string;
}

export interface TypedSetting { key: string; category: string; type: string; label: string; value: string }

export interface AdmissionForm {
  id: string; program_id: string; title: string; description: string;
  fields_definition: unknown[]; public_token: string; is_open: boolean;
  created_at: string; program_name: string | null;
}

export const operationsApi = {
  listTimetable: (params?: {
    class_id?: string; section_id?: string; teacher_id?: string; course_id?: string; day_of_week?: number;
  }) =>
    api.get<TimetableSlot[]>("/api/v1/operations/timetable", { params }).then((r) => r.data),
  createTimetableSlot: (payload: {
    class_id: string; section_id: string; course_id: string; teacher_id: string;
    day_of_week: number; period?: number; start_time: string; end_time: string;
  }) => api.post<TimetableSlot>("/api/v1/operations/timetable", payload).then((r) => r.data),
  exportTimetablePdf: (classId?: string) =>
    downloadReport("/api/v1/operations/timetable/export", classId ? { class_id: classId } : {}, "pdf"),
  importTimetable: (rows: TimetableImportRow[], dryRun: boolean) =>
    api.post<TimetableImportResponse>("/api/v1/operations/timetable/import", { rows, dry_run: dryRun }).then((r) => r.data),
  deleteTimetableSlot: (id: string) => api.delete(`/api/v1/operations/timetable/${id}`).then((r) => r.data),

  listHolidays: (params?: { category?: string; class_id?: string; date_from?: string; date_to?: string }) =>
    api.get<Holiday[]>("/api/v1/operations/holidays", { params }).then((r) => r.data),
  createHoliday: (payload: { name: string; category?: string; start_date: string; end_date: string; class_ids?: string[] }) =>
    api.post<Holiday>("/api/v1/operations/holidays", payload).then((r) => r.data),
  updateHoliday: (id: string, payload: { name: string; category?: string; start_date: string; end_date: string; class_ids?: string[] }) =>
    api.put<Holiday>(`/api/v1/operations/holidays/${id}`, payload).then((r) => r.data),
  deleteHoliday: (id: string) => api.delete(`/api/v1/operations/holidays/${id}`).then((r) => r.data),

  listLeave: (params?: {
    user_id?: string; person_type?: "teacher" | "student"; status?: string;
    class_id?: string; date_from?: string; date_to?: string; q?: string;
  }) =>
    api.get<Leave[]>("/api/v1/operations/leave", { params }).then((r) => r.data),
  createLeave: (payload: { user_id?: string; start_date: string; end_date: string; reason?: string }) =>
    api.post<Leave>("/api/v1/operations/leave", payload).then((r) => r.data),
  setLeaveStatus: (id: string, status: string) =>
    api.post<Leave>(`/api/v1/operations/leave/${id}/status`, null, { params: { status_value: status } }).then((r) => r.data),

  listResourceCategories: () => api.get<ResourceCategory[]>("/api/v1/operations/resource-categories").then((r) => r.data),
  createResourceCategory: (name: string) =>
    api.post<ResourceCategory>("/api/v1/operations/resource-categories", { name }).then((r) => r.data),
  listResources: (categoryId?: string) =>
    api.get<ResourceItem[]>("/api/v1/operations/resources", { params: { category_id: categoryId } }).then((r) => r.data),
  createResource: (payload: {
    category_id: string; title: string; description?: string; file_key?: string; video_url?: string; visibility_scope?: Scope;
  }) => api.post<ResourceItem>("/api/v1/operations/resources", payload).then((r) => r.data),

  listForms: () => api.get<FormDef[]>("/api/v1/operations/forms").then((r) => r.data),
  getForm: (id: string) => api.get<FormDef>(`/api/v1/operations/forms/${id}`).then((r) => r.data),
  createForm: (payload: {
    title: string; description?: string; fields: FormFieldDefinition[]; visibility_scope?: Scope;
    open_from?: string; open_until?: string; allow_multiple?: boolean;
  }) => api.post<FormDef>("/api/v1/operations/forms", payload).then((r) => r.data),
  submitFormResponse: (formId: string, responseData: Record<string, unknown>) =>
    api.post<FormResponse>(`/api/v1/operations/forms/${formId}/responses`, { response_data: responseData }).then((r) => r.data),
  listFormResponses: (formId: string) =>
    api.get<FormResponse[]>(`/api/v1/operations/forms/${formId}/responses`).then((r) => r.data),

  listAnnouncements: (params?: { audience?: "teachers" | "students" | "all"; q?: string; date_from?: string; date_to?: string }) =>
    api.get<Announcement[]>("/api/v1/operations/announcements", { params }).then((r) => r.data),
  createAnnouncement: (payload: {
    title: string; body: string; attachment_link?: string; audience_scope?: Scope; publish_at?: string; expires_at?: string;
  }) => api.post<Announcement>("/api/v1/operations/announcements", payload).then((r) => r.data),
  updateAnnouncement: (id: string, payload: {
    title?: string; body?: string; attachment_link?: string; audience_scope?: Scope; publish_at?: string; expires_at?: string;
  }) => api.put<Announcement>(`/api/v1/operations/announcements/${id}`, payload).then((r) => r.data),
  deleteAnnouncement: (id: string) => api.delete(`/api/v1/operations/announcements/${id}`).then((r) => r.data),

  listBlogPosts: (publishedOnly?: boolean) =>
    api.get<BlogPost[]>("/api/v1/operations/blog", { params: { published_only: publishedOnly } }).then((r) => r.data),
  createBlogPost: (payload: { title: string; body: string; published?: boolean; publish_at?: string }) =>
    api.post<BlogPost>("/api/v1/operations/blog", payload).then((r) => r.data),
  updateBlogPost: (id: string, payload: { title?: string; body?: string }) =>
    api.put<BlogPost>(`/api/v1/operations/blog/${id}`, payload).then((r) => r.data),
  deleteBlogPost: (id: string) => api.delete(`/api/v1/operations/blog/${id}`).then((r) => r.data),
  publishBlogPost: (id: string) => api.post<BlogPost>(`/api/v1/operations/blog/${id}/publish`).then((r) => r.data),

  listAdmissions: () => api.get<AdmissionApplication[]>("/api/v1/operations/admissions").then((r) => r.data),
  listAdmissionForms: () => api.get<AdmissionForm[]>("/api/v1/operations/admission-forms").then((r) => r.data),
  createAdmissionForm: (payload: { program_id: string; title: string; description?: string }) =>
    api.post<AdmissionForm>("/api/v1/operations/admission-forms", payload).then((r) => r.data),
  updateAdmissionForm: (id: string, payload: { title?: string; description?: string; is_open?: boolean }) =>
    api.put<AdmissionForm>(`/api/v1/operations/admission-forms/${id}`, payload).then((r) => r.data),
  createAdmission: (payload: {
    applicant_name: string; guardian_contact: string; program_id?: string; date_of_birth?: string; notes?: string;
  }) => api.post<AdmissionApplication>("/api/v1/operations/admissions", payload).then((r) => r.data),
  setAdmissionStatus: (id: string, status: string) =>
    api.post<AdmissionApplication>(`/api/v1/operations/admissions/${id}/status`, null, { params: { status_value: status } }).then((r) => r.data),

  listEnquiries: () => api.get<ContactEnquiry[]>("/api/v1/operations/enquiries").then((r) => r.data),
  setEnquiryStatus: (id: string, status: string) =>
    api.post<ContactEnquiry>(`/api/v1/operations/enquiries/${id}/status`, null, { params: { status_value: status } }).then((r) => r.data),

  listSettings: () => api.get<MadrasaSetting[]>("/api/v1/operations/settings").then((r) => r.data),
  settingsCatalog: () => api.get<TypedSetting[]>("/api/v1/operations/settings/catalog").then((r) => r.data),
  upsertSetting: (key: string, value: string) =>
    api.put<MadrasaSetting>("/api/v1/operations/settings", { key, value }).then((r) => r.data),
};

export interface MadrasaSetting { id: string; key: string; value: string; updated_at: string }

export interface BlogPost {
  id: string; title: string; body: string; published: boolean; publish_at: string | null; author_id: string; created_at: string;
}
export interface AdmissionApplication {
  id: string; applicant_name: string; guardian_contact: string; program_id: string | null;
  date_of_birth: string | null; notes: string | null; status: string;
  form_id: string | null; extra_data: Record<string, unknown> | null; created_at: string;
}
export interface ContactEnquiry {
  id: string; name: string; contact: string; message: string; status: string; created_at: string;
}

// ------------------------------------------------------------------ Files

export const filesApi = {
  presignUpload: (payload: { category: string; filename: string; content_type?: string }) =>
    api.post<{ object_key: string; upload_url: string }>("/api/v1/files/presign-upload", payload).then((r) => r.data),
  presignDownload: (objectKey: string) =>
    api.get<{ url: string }>("/api/v1/files/presign-download", { params: { object_key: objectKey } }).then((r) => r.data),
};

// ---------------------------------------------------------------- Finance

export interface PaymentCategory { id: string; name: string }
export interface Payment {
  id: string; student_id: string; category_id: string; amount: number; currency: string;
  payment_date: string; note: string | null; recorded_by_id: string;
}
export interface Donor { id: string; name: string; contact: string }
export interface Donation {
  id: string; donor_id: string; category_id: string; amount: number; currency: string;
  donation_date: string; note: string | null; recorded_by_id: string;
}
export interface FinanceSummary { total_contributions: number; total_donations: number; total: number; by_category: Record<string, number> }
export interface SalaryRecord { id: string; teacher_id: string; amount: number; currency: string; effective_from: string }
export interface SalaryPayment {
  id: string; teacher_id: string; amount: number; currency: string; payment_date: string;
  period_covered: string; method: string; note: string; recorded_by_id: string; created_at: string;
}

export const financeApi = {
  listCategories: () => api.get<PaymentCategory[]>("/api/v1/finance/categories").then((r) => r.data),
  createCategory: (name: string) => api.post<PaymentCategory>("/api/v1/finance/categories", { name }).then((r) => r.data),

  listPayments: (params?: { student_id?: string; class_id?: string; category_id?: string; date_from?: string; date_to?: string }) =>
    api.get<Payment[]>("/api/v1/finance/payments", { params }).then((r) => r.data),
  createPayment: (payload: {
    student_id: string; category_id: string; amount: number; currency?: string; payment_date: string; note?: string;
  }) => api.post<Payment>("/api/v1/finance/payments", payload).then((r) => r.data),

  listDonors: () => api.get<Donor[]>("/api/v1/finance/donors").then((r) => r.data),
  createDonor: (payload: { name: string; contact: string }) => api.post<Donor>("/api/v1/finance/donors", payload).then((r) => r.data),
  listDonations: (donorId?: string) =>
    api.get<Donation[]>("/api/v1/finance/donations", { params: { donor_id: donorId } }).then((r) => r.data),
  createDonation: (payload: {
    donor_id: string; category_id: string; amount: number; currency?: string; donation_date: string; note?: string;
  }) => api.post<Donation>("/api/v1/finance/donations", payload).then((r) => r.data),

  summary: (params?: { date_from?: string; date_to?: string }) =>
    api.get<FinanceSummary>("/api/v1/finance/summary", { params }).then((r) => r.data),

  downloadPaymentReceipt: (paymentId: string) =>
    downloadReport(`/api/v1/finance/payments/${paymentId}/receipt`, {}, "pdf"),
  sharePaymentReceipt: (paymentId: string) =>
    api.post<WhatsAppLink>(`/api/v1/finance/payments/${paymentId}/receipt-share`).then((r) => r.data),
  downloadDonationReceipt: (donationId: string) =>
    downloadReport(`/api/v1/finance/donations/${donationId}/receipt`, {}, "pdf"),
  shareDonationReceipt: (donationId: string) =>
    api.post<WhatsAppLink>(`/api/v1/finance/donations/${donationId}/receipt-share`).then((r) => r.data),

  getSalary: (teacherId: string) => api.get<SalaryRecord>(`/api/v1/finance/salary/${teacherId}`).then((r) => r.data),
  setSalary: (teacherId: string, payload: { amount: number; currency?: string; effective_from: string }) =>
    api.put<SalaryRecord>(`/api/v1/finance/salary/${teacherId}`, payload).then((r) => r.data),
  listSalaryPayments: (teacherId: string) =>
    api.get<SalaryPayment[]>(`/api/v1/finance/salary/${teacherId}/payments`).then((r) => r.data),
  recordSalaryPayment: (teacherId: string, payload: {
    amount: number; currency?: string; payment_date: string; period_covered: string; method: string; note?: string;
  }) => api.post<SalaryPayment>(`/api/v1/finance/salary/${teacherId}/payments`, payload).then((r) => r.data),
};
