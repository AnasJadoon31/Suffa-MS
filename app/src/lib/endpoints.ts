import { api } from "./api";

// ---------------------------------------------------------------- Academics

export interface Program { id: string; name: string; created_at: string }
export interface AcademicClass { id: string; program_id: string; name: string; default_portal_enabled: boolean }
export interface Section { id: string; class_id: string; name: string }
export interface Course { id: string; class_id: string; name: string }
export interface AcademicSession {
  id: string; name: string; gregorian_start: string; gregorian_end: string; hijri_span: string; is_active: boolean;
}
export interface TeacherAssignment { id: string; teacher_id: string; session_id: string; class_id: string; course_id: string }

export const academicsApi = {
  listPrograms: () => api.get<Program[]>("/api/v1/academics/programs").then((r) => r.data),
  createProgram: (name: string) => api.post<Program>("/api/v1/academics/programs", { name }).then((r) => r.data),
  listClasses: () => api.get<AcademicClass[]>("/api/v1/academics/classes").then((r) => r.data),
  createClass: (program_id: string, name: string) =>
    api.post<AcademicClass>("/api/v1/academics/classes", { program_id, name }).then((r) => r.data),
  listSections: (classId: string) =>
    api.get<Section[]>(`/api/v1/academics/classes/${classId}/sections`).then((r) => r.data),
  createSection: (classId: string, name: string) =>
    api.post<Section>(`/api/v1/academics/classes/${classId}/sections`, { name }).then((r) => r.data),
  listCourses: (classId: string) =>
    api.get<Course[]>(`/api/v1/academics/classes/${classId}/courses`).then((r) => r.data),
  createCourse: (classId: string, name: string) =>
    api.post<Course>(`/api/v1/academics/classes/${classId}/courses`, { name }).then((r) => r.data),
  listSessions: () => api.get<AcademicSession[]>("/api/v1/academics/sessions").then((r) => r.data),
  createSession: (payload: {
    name: string; gregorian_start: string; gregorian_end: string; hijri_span: string; is_active?: boolean;
  }) => api.post<AcademicSession>("/api/v1/academics/sessions", payload).then((r) => r.data),
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
  id: string; employee_code: string; name: string; whatsapp_number: string; qualifications: string | null;
  join_date: string | null; status: string; notes: string | null; created_at: string; set_password_url?: string;
}
export interface Student {
  id: string; admission_number: string; name: string; date_of_birth: string; status: string;
  portal_enabled: boolean; notes: string | null; created_at: string; set_password_url?: string;
}
export interface Guardian {
  id: string; name: string; relationship: string; phone_numbers: string; preferred_language: string; created_at: string;
}

export const peopleApi = {
  listTeachers: (search?: string) =>
    api.get<Teacher[]>("/api/v1/people/teachers", { params: { search } }).then((r) => r.data),
  createTeacher: (payload: { username: string; name: string; whatsapp_number?: string }) =>
    api.post<Teacher>("/api/v1/people/teachers", payload).then((r) => r.data),
  deactivateTeacher: (id: string) => api.post(`/api/v1/people/teachers/${id}/deactivate`).then((r) => r.data),

  listStudents: (search?: string) =>
    api.get<Student[]>("/api/v1/people/students", { params: { search } }).then((r) => r.data),
  createStudent: (payload: { username: string; name: string; date_of_birth: string; guardian_ids?: string[] }) =>
    api.post<Student>("/api/v1/people/students", payload).then((r) => r.data),
  deactivateStudent: (id: string) => api.post(`/api/v1/people/students/${id}/deactivate`).then((r) => r.data),

  listGuardians: (search?: string) =>
    api.get<Guardian[]>("/api/v1/people/guardians", { params: { search } }).then((r) => r.data),
  createGuardian: (payload: { name: string; relationship: string; phone_numbers: string; student_ids?: string[] }) =>
    api.post<Guardian>("/api/v1/people/guardians", payload).then((r) => r.data),
  studentGuardians: (studentId: string) =>
    api.get<Guardian[]>(`/api/v1/people/students/${studentId}/guardians`).then((r) => r.data),
};

// --------------------------------------------------------------- Assessments

export interface Assignment {
  id: string; class_id: string; course_id: string; title: string; instructions: string;
  attachment_key: string | null; due_date: string; target_student_ids: string[] | null;
  created_by_id: string; created_at: string;
}
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
  listAssignments: (params?: { class_id?: string; course_id?: string }) =>
    api.get<Assignment[]>("/api/v1/assessments/assignments", { params }).then((r) => r.data),
  createAssignment: (payload: {
    class_id: string; course_id: string; title: string; instructions: string; due_date: string;
  }) => api.post<Assignment>("/api/v1/assessments/assignments", payload).then((r) => r.data),
  listSubmissions: (assignmentId: string) =>
    api.get<Submission[]>(`/api/v1/assessments/assignments/${assignmentId}/submissions`).then((r) => r.data),
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
};

// ---------------------------------------------------------------- Reporting

export interface DashboardData {
  counts: { students: number; teachers: number; classes: number };
  attendance: { present: number; absent: number; leave: number; missing_sync_teachers: number };
  finance: { month_total: number; currency: string };
  activity: string[];
}

export const reportingApi = {
  dashboard: () => api.get<DashboardData>("/api/v1/reporting/dashboard").then((r) => r.data),
};
