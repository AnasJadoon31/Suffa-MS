import { api, getAllPages } from "./api";

/* Additional read-focused endpoints — paths mirror the existing FastAPI backend exactly. */

export interface Scope {
  all: boolean;
  roles?: string[];
  classes?: string[];
  sections?: string[];
  courses?: string[];
  users?: string[];
}

export interface Program {
  id: string;
  name: string;
  created_at?: string;
}
export interface Course {
  id: string;
  name: string;
}
export interface Section {
  id: string;
  class_id: string;
  name: string;
  student_count: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string | null;
  attachment_link: string | null;
  audience_scope: Scope;
  publish_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface Leave {
  id: string;
  user_id: string;
  person_name: string | null;
  person_type: string | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
}

export interface Holiday {
  id: string;
  name: string;
  category: string | null;
  start_date: string;
  end_date: string;
  class_ids: string[] | null;
}

export interface ResourceCategory {
  id: string;
  name: string;
  owner_id: string | null;
  is_mine: boolean;
}
export interface ResourceItem {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  file_key: string | null;
  video_url: string | null;
  created_by_id: string;
  owner_name: string | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  class_id: string;
  section_id: string | null;
  course_id: string;
  title: string;
  category: string | null;
  description?: string | null;
  instructions: string;
  attachment_key: string | null;
  due_date: string;
  max_marks?: number | null;
  created_at: string;
  class_name: string | null;
  section_name: string | null;
  course_name: string | null;
  teacher_name: string | null;
  submission_file_key?: string | null;
  submission_mark?: number | null;
  submission_feedback?: string | null;
  submitted_at?: string | null;
}

export interface CourseResult {
  course_id: string;
  raw_score: number | null;
  band: string | null;
  exam_count: number;
  marks: { exam_type_id: string; name: string; weightage: number; score: number | null }[];
}
export interface SessionResult {
  session_id: string;
  student_id: string;
  course_results: CourseResult[];
  overall_score: number | null;
  published: boolean;
}

interface ResultsMatrixCourse {
  course_id: string;
  course_name: string;
  teacher_name: string | null;
  exam_types: { id: string; name: string; weightage: number }[];
}

export interface GradingScheme {
  id: string;
  name: string;
  bands: { label: string; min_score: number; max_score: number }[];
  include_assignments: boolean;
}

export interface ExamType {
  id: string;
  course_id: string | null;
  class_id: string | null;
  parent_exam_type_id: string | null;
  name: string;
  weightage: number;
  grading_scheme_id: string;
  course_name?: string;
  class_name?: string;
  scheme_name?: string;
  children: ExamType[];
}

export interface MarkEntry {
  id: string;
  exam_type_id: string;
  student_id: string;
  score: number;
  entered_by_id?: string | null;
  student_name?: string;
}

export interface GradingPlanComponent {
  id?: string | null;
  name: string;
  weightage: number;
}

export interface GradingPlan {
  id: string;
  course_id: string;
  class_id: string | null;
  name: string;
  bands: { label: string; min_score: number; max_score: number }[];
  assignment_weightage: number;
  components: GradingPlanComponent[];
}

export interface ResultsMatrix {
  session_id: string;
  sections: {
    class_id: string;
    class_name: string;
    section_id: string;
    section_name: string;
    courses: {
      course_id: string;
      course_name: string;
      teacher_name: string | null;
      exam_types: { id: string; name: string; weightage: number }[];
    }[];
    students: {
      student_id: string;
      name: string;
      admission_number: string;
      courses: {
        course_id: string;
        raw_score: number | null;
        band: string | null;
        marks: { exam_type_id: string; score: number | null }[];
      }[];
      overall_score: number | null;
    }[];
  }[];
}

export interface Payment {
  id: string;
  student_id: string;
  category_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  note: string | null;
  student_name: string | null;
  category_name: string | null;
}
export interface Donation {
  id: string;
  donor_id: string;
  category_id: string;
  amount: number;
  currency: string;
  donation_date: string;
  note: string | null;
  donor_name: string | null;
  category_name: string | null;
}
export interface FinanceSummary {
  total_contributions: number;
  total_donations: number;
  total: number;
  by_category: Record<string, number>;
}
export interface MySalary {
  teacher_id?: string;
  base_amount?: number | null;
  currency?: string | null;
  payments?: { id: string; amount: number; paid_on: string; note?: string | null }[];
}

export interface AdmissionApplication {
  id: string;
  applicant_name: string;
  guardian_contact: string;
  program_id: string | null;
  date_of_birth: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  status_history?: { status: string; changed_at: string; changed_by_id?: string }[];
  form_id?: string | null;
  extra_data?: Record<string, unknown> | null;
  form_title_snapshot?: string | null;
  fields_definition_snapshot?: FormFieldDefinition[];
  converted_student_id?: string | null;
  converted_guardian_id?: string | null;
  converted_by_id?: string | null;
  converted_at?: string | null;
}

export interface MadrasaSetting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface TypedMadrasaSetting {
  key: string;
  category: string;
  type: "string" | "int" | "bool" | "file" | "secret" | "weekday_multi" | "language";
  label: string;
  value: string;
}

export type WhatsAppConnectionState = "open" | "close" | "connecting" | "refused" | "not_created" | "unknown";

export interface WhatsAppConnectionStatus {
  instance_name: string;
  state: WhatsAppConnectionState;
  connected: boolean;
  connected_jid: string | null;
  connected_phone_number: string | null;
}

export interface WhatsAppQrResponse {
  instance_name: string;
  state: WhatsAppConnectionState;
  qr_code_base64: string;
}

export interface WhatsAppPairingResponse {
  instance_name: string;
  state: WhatsAppConnectionState;
  pairing_code: string;
}

export interface WhatsAppLinkResponse {
  normalised_number: string;
  url: string;
  direct_sent: boolean;
}

export interface BlogPost {
  id: string;
  title: string;
  body: string;
  published: boolean;
  publish_at: string | null;
  created_at: string;
}

export const academicsExtraApi = {
  listPrograms: () => getAllPages<Program>("/api/v1/academics/programs"),
  listCourses: () => getAllPages<Course>("/api/v1/academics/courses"),
  listSections: (classId: string) =>
    getAllPages<Section>(`/api/v1/academics/classes/${classId}/sections`),
  listClassCourses: (classId: string) =>
    getAllPages<Course>(`/api/v1/academics/classes/${classId}/courses`),
};

export interface FormFieldDefinition {
  key: string;
  label: string;
  type: "label" | "text" | "textarea" | "radio" | "checkbox_group" | "dropdown" | "phone" | "file" | "image" | "boolean";
  required: boolean;
  options: string[];
  built_in?: boolean;
  enabled?: boolean;
}
export interface FormDef {
  id: string;
  title: string;
  description: string;
  category: string | null;
  fields_definition: FormFieldDefinition[];
  visibility_scope: Scope;
  open_from: string | null;
  open_until: string | null;
  allow_multiple: boolean;
  created_by_id: string;
  created_at: string;
}
export interface FormResponse {
  id: string;
  form_id: string;
  student_id: string | null;
  student_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  guardian_id: string | null;
  guardian_name: string | null;
  ward_id: string | null;
  ward_name: string | null;
  submitted_by_id: string;
  submitted_by_name: string | null;
  submitted_by_role: string | null;
  response_data: Record<string, unknown>;
  created_at: string;
}

export interface AdmissionForm {
  id: string;
  program_id: string | null;
  title: string;
  category: string;
  description: string;
  fields_definition: FormFieldDefinition[];
  public_token: string;
  is_open: boolean;
  created_at: string;
  program_name: string | null;
}

export interface AdmissionConversion {
  application: AdmissionApplication;
  student: {
    id: string;
    name: string;
    admission_number: string;
    current_class?: string | null;
  };
  guardian: {
    id: string;
    name: string;
    relationship: string;
    phone_numbers: string;
  };
  student_set_password_url?: string | null;
  guardian_set_password_url?: string | null;
  already_converted: boolean;
}

export const opsApi = {
  listTimetable: (params?: { class_id?: string; section_id?: string }) =>
    getAllPages<Record<string, unknown>>("/api/v1/operations/timetable", params),
  listHolidays: (params?: {
    category?: string;
    class_id?: string;
    date_from?: string;
    date_to?: string;
  }) => getAllPages<Holiday>("/api/v1/operations/holidays", params),
  listLeave: (params?: {
    status?: string;
    person_type?: "teacher" | "student";
    class_id?: string;
    date_from?: string;
    date_to?: string;
    q?: string;
  }) => getAllPages<Leave>("/api/v1/operations/leave", params),
  listMyLeave: () => getAllPages<Leave>("/api/v1/operations/leave", { self_only: true }),
  createLeave: (payload: { start_date: string; end_date: string; reason: string }) =>
    api.post<Leave>("/api/v1/operations/leave", payload).then((r) => r.data),
  setLeaveStatus: (id: string, status: string) =>
    api
      .post<Leave>(`/api/v1/operations/leave/${id}/status`, null, {
        params: { status_value: status },
      })
      .then((r) => r.data),
  listResourceCategories: () =>
    getAllPages<ResourceCategory>("/api/v1/operations/resource-categories"),
  listResources: (params?: {
    category_id?: string;
    class_id?: string;
    section_id?: string;
    mine_only?: boolean;
  }) => getAllPages<ResourceItem>("/api/v1/operations/resources", params),
  listAnnouncements: (params?: {
    audience?: "teachers" | "students" | "all";
    category?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
  }) => getAllPages<Announcement>("/api/v1/operations/announcements", params),
  listAdmissions: (params?: { status?: string; q?: string }) =>
    getAllPages<AdmissionApplication>("/api/v1/operations/admissions", params),
  getAdmission: (id: string) =>
    api.get<AdmissionApplication>(`/api/v1/operations/admissions/${id}`).then((response) => response.data),
  getAdmissionStatusHistory: (id: string) =>
    getAllPages<{ status: string; changed_at: string; changed_by_id?: string }>(
      `/api/v1/operations/admissions/${id}/status-history`,
    ),
  setAdmissionStatus: (id: string, status: string) =>
    api
      .post<AdmissionApplication>(`/api/v1/operations/admissions/${id}/status`, null, {
        params: { status_value: status },
      })
      .then((r) => r.data),
  listSettings: () => getAllPages<MadrasaSetting>("/api/v1/operations/settings"),
  listSettingsCatalog: () => getAllPages<TypedMadrasaSetting>("/api/v1/operations/settings/catalog"),
  whatsappConnection: () =>
    api.get<WhatsAppConnectionStatus>("/api/v1/messaging/whatsapp/connection").then((r) => r.data),
  whatsappQrCode: (replaceExisting = false) =>
    api
      .post<WhatsAppQrResponse>("/api/v1/messaging/whatsapp/connection/qr-code", null, {
        params: { replace_existing: replaceExisting },
      })
      .then((r) => r.data),
  whatsappPairingCode: (phoneNumber: string, replaceExisting = false) =>
    api
      .post<WhatsAppPairingResponse>("/api/v1/messaging/whatsapp/connection/pairing-code", {
        phone_number: phoneNumber,
        replace_existing: replaceExisting,
      })
      .then((r) => r.data),
  whatsappDisconnect: () =>
    api.delete<WhatsAppConnectionStatus>("/api/v1/messaging/whatsapp/connection").then((r) => r.data),
  listBlog: (publishedOnly = true) =>
    getAllPages<BlogPost>("/api/v1/operations/blog", { published_only: publishedOnly }),
  listAdmissionForms: (params?: { category?: string; program_id?: string }) =>
    getAllPages<AdmissionForm>("/api/v1/operations/admission-forms", params),
  createAdmissionForm: (payload: {
    title: string;
    category?: string;
    description?: string;
    program_id?: string;
    fields: FormFieldDefinition[];
  }) => api.post<AdmissionForm>("/api/v1/operations/admission-forms", payload).then((r) => r.data),
  updateAdmissionForm: (id: string, payload: {
    title?: string;
    category?: string;
    description?: string;
    fields?: FormFieldDefinition[];
    is_open?: boolean;
  }) => api.put<AdmissionForm>(`/api/v1/operations/admission-forms/${id}`, payload).then((r) => r.data),
  deleteAdmissionForm: (id: string) => api.delete(`/api/v1/operations/admission-forms/${id}`),
};

export const formsApi = {
  listForms: (params?: { category?: string; mine_only?: boolean; audience_role?: string }) =>
    getAllPages<FormDef>("/api/v1/operations/forms", params),
  getForm: (id: string) => api.get<FormDef>(`/api/v1/operations/forms/${id}`).then((r) => r.data),
  createForm: (payload: {
    title: string;
    description?: string;
    category?: string;
    fields: FormFieldDefinition[];
    visibility_scope?: Scope;
    open_from?: string;
    open_until?: string;
    allow_multiple?: boolean;
  }) => api.post<FormDef>("/api/v1/operations/forms", payload).then((r) => r.data),
  updateForm: (
    id: string,
    payload: {
      title?: string;
      description?: string;
      category?: string;
      fields?: FormFieldDefinition[];
      open_from?: string;
      open_until?: string;
      allow_multiple?: boolean;
    },
  ) => api.put<FormDef>(`/api/v1/operations/forms/${id}`, payload).then((r) => r.data),
  deleteForm: (id: string) => api.delete(`/api/v1/operations/forms/${id}`).then((r) => r.data),
  submitResponse: (formId: string, responseData: Record<string, unknown>, wardId?: string) =>
    api
      .post<FormResponse>(`/api/v1/operations/forms/${formId}/responses`, {
        response_data: responseData,
        ward_id: wardId,
      })
      .then((r) => r.data),
  listResponses: (formId: string) =>
    getAllPages<FormResponse>(`/api/v1/operations/forms/${formId}/responses`),
  listAllResponses: (params?: {
    form_id?: string;
    respondent_role?: string;
    class_id?: string;
    date_from?: string;
    date_to?: string;
  }) => getAllPages<FormResponse>("/api/v1/operations/form-responses", params),
};

export const assessmentsApi = {
  listAssignments: (params?: {
    class_id?: string;
    section_id?: string;
    course_id?: string;
    category?: string;
    mine_only?: boolean;
    date_from?: string;
    date_to?: string;
    sort?: "due_date" | "created_at" | "title" | "teacher";
  }) => getAllPages<Assignment>("/api/v1/assessments/assignments", params as Record<string, unknown>),
  myResult: (sessionId: string) =>
    api.get<SessionResult>("/api/v1/assessments/results/me", { params: { session_id: sessionId } }).then((r) => r.data),
  resultsMatrix: (params: { class_id?: string; section_id?: string; session_id?: string }) =>
    api.get<ResultsMatrix>("/api/v1/assessments/results/matrix", { params }).then((r) => r.data),

  listGradingSchemes: () =>
    api.get<GradingScheme[]>("/api/v1/assessments/grading-schemes").then((r) => r.data),
  listExamTypes: (params?: { class_id?: string; course_id?: string }) =>
    api.get<ExamType[]>("/api/v1/assessments/exam-types", { params }).then((r) => r.data),
  listMarks: (params: { exam_type_id: string; class_id?: string; section_id?: string }) =>
    api.get<MarkEntry[]>("/api/v1/assessments/marks", { params }).then((r) => r.data),
  getGradingPlan: (params: { course_id: string; class_id?: string }) =>
    api.get<GradingPlan>("/api/v1/assessments/grading-plan", { params }).then((r) => r.data),
};

export interface StudentFinanceProfile {
  id: string;
  name: string;
  admission_number: string;
  phone: string | null;
  address: string | null;
  payments: Payment[];
}
export interface DonorFinanceProfile {
  id: string;
  name: string;
  contact: string;
  donations: Donation[];
}

export const financeApi = {
  summary: (params?: { start_date?: string; end_date?: string }) =>
    api.get<FinanceSummary>("/api/v1/finance/summary", { params }).then((r) => r.data),
  listPayments: (params?: {
    student_id?: string;
    class_id?: string;
    category_id?: string;
    date_from?: string;
    date_to?: string;
  }) => getAllPages<Payment>("/api/v1/finance/payments", params),
  listDonations: (params?: {
    donor_id?: string;
    category_id?: string;
    date_from?: string;
    date_to?: string;
  }) => getAllPages<Donation>("/api/v1/finance/donations", params),
  studentProfile: (id: string) =>
    api.get<StudentFinanceProfile>(`/api/v1/finance/profiles/students/${id}`).then((r) => r.data),
  donorProfile: (id: string) =>
    api.get<DonorFinanceProfile>(`/api/v1/finance/profiles/donors/${id}`).then((r) => r.data),
  mySalary: () => api.get<MySalary>("/api/v1/finance/salary/me").then((r) => r.data),
};

export async function downloadReport(
  url: string,
  params: Record<string, string>,
  format: "csv" | "pdf",
  filename: string,
): Promise<void> {
  const response = await api.get<Blob>(url, {
    params: { ...params, format },
    responseType: "blob",
  });
  const href = URL.createObjectURL(response.data as unknown as Blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${filename}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export const reportsApi = {
  attendance: (
    params: { class_id: string; section_id?: string; start_date: string; end_date: string },
    format: "csv" | "pdf",
  ) =>
    downloadReport(
      "/api/v1/reporting/reports/attendance",
      params as Record<string, string>,
      format,
      "attendance-report",
    ),
  finance: (params: { start_date: string; end_date: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/finance", params, format, "finance-report"),
  salary: (params: { start_date: string; end_date: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/salary", params, format, "salary-report"),
  donations: (params: { start_date: string; end_date: string }, format: "csv" | "pdf") =>
    downloadReport("/api/v1/reporting/reports/donations", params, format, "donations-report"),
  results: (params: { class_id: string; session_id: string }, format: "csv" | "pdf") =>
    downloadReport(
      "/api/v1/reporting/reports/results",
      params as Record<string, string>,
      format,
      "results-report",
    ),
};

/* ------------------------------------------------------- Mutations (same backend paths) */

export interface PaymentCategory {
  id: string;
  name: string;
}
export interface Donor {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string;
  contact: string;
  phone_list?: string[];
  default_phone_number?: string | null;
}
export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string | null;
  file_key: string | null;
  mark: number | null;
  feedback: string | null;
  submitted_at: string;
  is_late: boolean;
}

export interface AssignmentSubmissionStatus {
  student_id: string;
  student_name: string;
  admission_number: string;
  submitted_at: string | null;
  file_key: string | null;
  mark: number | null;
  feedback: string | null;
  is_late: boolean;
}

export const opsMutations = {
  createAnnouncement: (payload: {
    title: string;
    body: string;
    category?: string;
    attachment_link?: string;
    audience_scope?: Scope;
  }) => api.post<Announcement>("/api/v1/operations/announcements", payload).then((r) => r.data),
  updateAnnouncement: (
    id: string,
    payload: {
      title?: string;
      body?: string;
      category?: string;
      attachment_link?: string;
      audience_scope?: Scope;
      publish_at?: string | null;
      expires_at?: string | null;
    },
  ) => api.put<Announcement>(`/api/v1/operations/announcements/${id}`, payload).then((r) => r.data),
  deleteAnnouncement: (id: string) =>
    api.delete(`/api/v1/operations/announcements/${id}`).then((r) => r.data),

  createHoliday: (payload: {
    name: string;
    category?: string;
    start_date: string;
    end_date: string;
    class_ids?: string[] | null;
  }) => api.post<Holiday>("/api/v1/operations/holidays", payload).then((r) => r.data),
  updateHoliday: (
    id: string,
    payload: {
      name?: string;
      category?: string | null;
      start_date?: string;
      end_date?: string;
      class_ids?: string[] | null;
    },
  ) => api.put<Holiday>(`/api/v1/operations/holidays/${id}`, payload).then((r) => r.data),
  deleteHoliday: (id: string) =>
    api.delete(`/api/v1/operations/holidays/${id}`).then((r) => r.data),

  createBlogPost: (payload: { title: string; body: string; published?: boolean }) =>
    api.post<BlogPost>("/api/v1/operations/blog", payload).then((r) => r.data),
  publishBlogPost: (id: string) =>
    api.post<BlogPost>(`/api/v1/operations/blog/${id}/publish`).then((r) => r.data),
  updateBlogPost: (
    id: string,
    payload: { title?: string; body?: string; published?: boolean; publish_at?: string | null },
  ) => api.put<BlogPost>(`/api/v1/operations/blog/${id}`, payload).then((r) => r.data),
  deleteBlogPost: (id: string) => api.delete(`/api/v1/operations/blog/${id}`).then((r) => r.data),

  createResourceCategory: (name: string, isGlobal = false) =>
    api
      .post<ResourceCategory>("/api/v1/operations/resource-categories", {
        name,
        is_global: isGlobal,
      })
      .then((r) => r.data),
  createResource: (payload: {
    category_id: string;
    title: string;
    description?: string;
    video_url?: string;
    file_key?: string;
    visibility_scope?: Scope;
  }) => api.post<ResourceItem>("/api/v1/operations/resources", payload).then((r) => r.data),
  updateResource: (
    id: string,
    payload: {
      category_id?: string;
      title?: string;
      description?: string;
      video_url?: string;
      file_key?: string;
      visibility_scope?: Scope;
    },
  ) => api.put<ResourceItem>(`/api/v1/operations/resources/${id}`, payload).then((r) => r.data),
  deleteResource: (id: string) =>
    api.delete(`/api/v1/operations/resources/${id}`).then((r) => r.data),

  updateSetting: (key: string, value: string) =>
    api.put<MadrasaSetting>("/api/v1/operations/settings", { key, value }).then((r) => r.data),
};

export const assessmentsMutations = {
  createAssignment: (payload: {
    class_id?: string;
    section_ids?: string[];
    course_id: string;
    mine_only?: boolean;
    title: string;
    category?: string;
    instructions: string;
    attachment_key?: string;
    due_date: string;
    max_marks?: number;
  }) => api.post<Assignment[]>("/api/v1/assessments/assignments", payload).then((r) => r.data),
  updateAssignment: (
    id: string,
    payload: { title?: string; instructions?: string; attachment_key?: string | null; due_date?: string; max_marks?: number },
  ) => api.put<Assignment>(`/api/v1/assessments/assignments/${id}`, payload).then((r) => r.data),
  deleteAssignment: (id: string) =>
    api.delete(`/api/v1/assessments/assignments/${id}`).then((r) => r.data),
  listSubmissions: (assignmentId: string) =>
    getAllPages<Submission>(`/api/v1/assessments/assignments/${assignmentId}/submissions`),
  listSubmissionStatus: (assignmentId: string) =>
    getAllPages<AssignmentSubmissionStatus>(`/api/v1/assessments/assignments/submission-status/${assignmentId}`),
  submitAssignment: (assignmentId: string, fileKey: string) =>
    api
      .post<Submission>(`/api/v1/assessments/assignments/${assignmentId}/submissions`, {
        file_key: fileKey,
      })
      .then((r) => r.data),
  removeOwnSubmission: (assignmentId: string) =>
    api
      .delete(`/api/v1/assessments/assignments/${assignmentId}/submissions/me`)
      .then((r) => r.data),
  gradeSubmission: (submissionId: string, payload: { mark?: number; feedback?: string }) =>
    api
      .put<Submission>(`/api/v1/assessments/submissions/${submissionId}/grade`, payload)
      .then((r) => r.data),
  sessionResult: (studentId: string, sessionId: string) =>
    api
      .get<SessionResult>("/api/v1/assessments/results/session", {
        params: { student_id: studentId, session_id: sessionId },
      })
      .then((r) => r.data),
  publishResults: (sessionId: string, studentIds: string[]) =>
    api
      .post("/api/v1/assessments/results/publish", {
        session_id: sessionId,
        student_ids: studentIds,
      })
      .then((r) => r.data),
  submitResultsForReview: (payload: {
    session_id: string;
    class_id: string;
    section_id: string;
    course_id: string;
  }) =>
    api.post("/api/v1/assessments/results/submit-for-review", payload).then((r) => r.data),
  downloadMyResultCard: (sessionId: string) =>
    downloadReport(
      "/api/v1/assessments/results/card/me",
      { session_id: sessionId },
      "pdf",
      "result-card",
    ),
  createGradingScheme: (payload: { name: string; bands: { label: string; min_score: number; max_score: number }[]; include_assignments?: boolean }) =>
    api.post<GradingScheme>("/api/v1/assessments/grading-schemes", payload).then((r) => r.data),
  updateGradingScheme: (id: string, payload: { name?: string; bands?: { label: string; min_score: number; max_score: number }[]; include_assignments?: boolean }) =>
    api.put<GradingScheme>(`/api/v1/assessments/grading-schemes/${id}`, payload).then((r) => r.data),
  deleteGradingScheme: (id: string) =>
    api.delete(`/api/v1/assessments/grading-schemes/${id}`).then((r) => r.data),
  createExamType: (payload: { course_id: string; class_id?: string; name: string; weightage: number; grading_scheme_id: string; parent_exam_type_id?: string }) =>
    api.post<ExamType>("/api/v1/assessments/exam-types", payload).then((r) => r.data),
  updateExamType: (id: string, payload: { course_id?: string; class_id?: string; name?: string; weightage?: number; grading_scheme_id?: string }) =>
    api.put<ExamType>(`/api/v1/assessments/exam-types/${id}`, payload).then((r) => r.data),
  deleteExamType: (id: string) =>
    api.delete(`/api/v1/assessments/exam-types/${id}`).then((r) => r.data),
  enterMark: (payload: { exam_type_id: string; student_id: string; score: number }) =>
    api.put<MarkEntry>("/api/v1/assessments/marks", payload).then((r) => r.data),
  putGradingPlan: (payload: { course_id: string; class_id?: string; name: string; bands: { label: string; min_score: number; max_score: number }[]; assignment_weightage?: number; components: { id?: string; name: string; weightage: number }[] }) =>
    api.put<GradingPlan>("/api/v1/assessments/grading-plan", payload).then((r) => r.data),
  downloadResultCard: (params: { student_id: string; session_id: string }) =>
    downloadReport("/api/v1/assessments/results/card", params, "pdf", "result-card"),
};

export const financeMutations = {
  listCategories: () => getAllPages<PaymentCategory>("/api/v1/finance/categories"),
  createCategory: (name: string) =>
    api.post<PaymentCategory>("/api/v1/finance/categories", { name }).then((r) => r.data),
  listDonors: (params?: { q?: string }) => getAllPages<Donor>("/api/v1/finance/donors", params),
  createDonor: (payload: { name: string; contact: string; phone_list?: string[]; default_phone_number?: string }) =>
    api.post<Donor>("/api/v1/finance/donors", payload).then((r) => r.data),
  updateDonor: (id: string, payload: { name?: string; contact?: string; phone_list?: string[]; default_phone_number?: string }) =>
    api.put<Donor>(`/api/v1/finance/donors/${id}`, payload).then((r) => r.data),
  createPayment: (payload: {
    student_id: string;
    category_id: string;
    amount: number;
    currency?: string;
    payment_date: string;
    note?: string;
  }) => api.post<Payment>("/api/v1/finance/payments", payload).then((r) => r.data),
  createDonation: (payload: {
    donor_id: string;
    category_id: string;
    amount: number;
    currency?: string;
    donation_date: string;
    note?: string;
  }) => api.post<Donation>("/api/v1/finance/donations", payload).then((r) => r.data),
  paymentReceipt: (paymentId: string) =>
    downloadReport(`/api/v1/finance/payments/${paymentId}/receipt`, {}, "pdf", "receipt"),
  sendPaymentReceipt: (paymentId: string) =>
    api.post<WhatsAppLinkResponse>(`/api/v1/finance/payments/${paymentId}/receipt-share`).then((r) => r.data),
  donationReceipt: (donationId: string) =>
    downloadReport(`/api/v1/finance/donations/${donationId}/receipt`, {}, "pdf", "receipt"),
  sendDonationReceipt: (donationId: string) =>
    api.post<WhatsAppLinkResponse>(`/api/v1/finance/donations/${donationId}/receipt-share`).then((r) => r.data),
};

export const academicsMutations = {
  createProgram: (name: string) =>
    api.post<Program>("/api/v1/academics/programs", { name }).then((r) => r.data),
  createClass: (payload: { program_id: string; name: string }) =>
    api.post("/api/v1/academics/classes", payload).then((r) => r.data),
  createSection: (classId: string, name: string) =>
    api
      .post<Section>(`/api/v1/academics/classes/${classId}/sections`, { name })
      .then((r) => r.data),
  deleteSection: (classId: string, sectionId: string) =>
    api.delete(`/api/v1/academics/classes/${classId}/sections/${sectionId}`).then((r) => r.data),
  createCourse: (name: string) =>
    api.post<Course>("/api/v1/academics/courses", { name }).then((r) => r.data),
  updateCourse: (id: string, name: string) =>
    api.put<Course>(`/api/v1/academics/courses/${id}`, { name }).then((r) => r.data),
  deleteCourse: (id: string) =>
    api.delete(`/api/v1/academics/courses/${id}`).then((r) => r.data),
  assignCourse: (classId: string, courseId: string) =>
    api
      .post(`/api/v1/academics/classes/${classId}/courses/assign`, { course_id: courseId })
      .then((r) => r.data),
  unassignCourse: (classId: string, courseId: string) =>
    api.delete(`/api/v1/academics/classes/${classId}/courses/${courseId}`).then((r) => r.data),
  activateSession: (id: string) =>
    api.post(`/api/v1/academics/sessions/${id}/activate`).then((r) => r.data),
  updateSession: (id: string, payload: { name: string; start_date: string; end_date: string }) =>
    api
      .put(`/api/v1/academics/sessions/${id}`, {
        name: payload.name,
        gregorian_start: payload.start_date,
        gregorian_end: payload.end_date,
        hijri_span: `${payload.start_date} - ${payload.end_date}`,
      })
      .then((r) => r.data),
  deleteSession: (id: string) =>
    api.delete(`/api/v1/academics/sessions/${id}`).then((r) => r.data),
  createSession: (payload: {
    name: string;
    start_date: string;
    end_date: string;
    is_active?: boolean;
  }) =>
    api.post("/api/v1/academics/sessions", {
      name: payload.name,
      gregorian_start: payload.start_date,
      gregorian_end: payload.end_date,
      hijri_span: `${payload.start_date} - ${payload.end_date}`,
      is_active: payload.is_active ?? false,
    }).then((r) => r.data),
  rolloverSession: (
    sourceSessionId: string,
    payload: {
      name: string;
      start_date: string;
      end_date: string;
      class_mappings: { current_class_id: string; next_class_id: string | null }[];
      copy_timetable?: boolean;
      copy_holidays?: boolean;
      shift_holiday_dates?: boolean;
    },
  ) =>
    api.post(`/api/v1/academics/sessions/${sourceSessionId}/rollover`, {
      name: payload.name,
      gregorian_start: payload.start_date,
      gregorian_end: payload.end_date,
      hijri_span: `${payload.start_date} - ${payload.end_date}`,
      class_mappings: payload.class_mappings,
      copy_timetable: payload.copy_timetable ?? false,
      copy_holidays: payload.copy_holidays ?? false,
      shift_holiday_dates: payload.shift_holiday_dates ?? true,
    }).then((r) => r.data),
};

export interface StudentDetail {
  id: string;
  user_id: string | null;
  admission_number: string;
  name: string;
  status: string;
  username?: string | null;
  date_of_birth?: string | null;
  portal_enabled?: boolean;
  b_form_number?: string | null;
  address?: string | null;
  phone?: string | null;
  is_independent?: boolean;
  preferred_language?: string;
  notes?: string | null;
  photo_file_id?: string | null;
  current_class?: string | null;
  active_enrollment?: {
    id: string;
    session_name: string;
    program_name: string;
    class_name: string;
    section_name: string;
    started_on: string;
  } | null;
  admission_record?: {
    id: string;
    form_id?: string | null;
    application_id?: string | null;
    form_title?: string | null;
    fields_definition: FormFieldDefinition[];
    answers: Record<string, unknown>;
    created_at: string;
  } | null;
}
export interface TeacherDetail {
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
  cnic?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  is_principal_delegate?: boolean;
  notes?: string | null;
}
export interface GuardianDetail {
  id: string;
  user_id: string | null;
  name: string;
  relationship: string;
  phone_numbers: string;
  phone_list?: string[];
  default_phone_number?: string | null;
  cnic?: string | null;
  address?: string | null;
  preferred_language?: string;
}

export const peopleMutations = {
  getStudent: (studentId: string) => api.get<StudentDetail>(`/api/v1/people/students/${studentId}`).then((r) => r.data),
  usernameProposal: (name: string) =>
    api
      .get<{ username: string }>("/api/v1/people/username-proposal", { params: { name } })
      .then((r) => r.data.username),

  createStudent: (payload: {
    username?: string;
    name?: string;
    date_of_birth?: string;
    portal_enabled?: boolean;
    guardian_ids?: string[];
    preferred_language?: string;
    b_form_number?: string;
    address?: string;
    phone?: string;
    phone_list?: string[];
    default_phone_number?: string;
    is_independent?: boolean;
    photo_file_id?: string;
    admission_form_id?: string;
    admission_answers?: Record<string, unknown>;
  }) => api.post<StudentDetail>("/api/v1/people/students", payload).then((r) => r.data),
  updateStudent: (
    id: string,
    payload: {
      name?: string;
      date_of_birth?: string;
      portal_enabled?: boolean;
      b_form_number?: string;
      address?: string;
      phone?: string | null;
      phone_list?: string[];
      default_phone_number?: string | null;
      is_independent?: boolean;
      notes?: string;
      status?: string;
    },
  ) => api.put<StudentDetail>(`/api/v1/people/students/${id}`, payload).then((r) => r.data),
  deactivateStudent: (id: string) =>
    api.post(`/api/v1/people/students/${id}/deactivate`).then((r) => r.data),

  createTeacher: (payload: {
    username: string;
    name: string;
    whatsapp_number: string;
    phone_list?: string[];
    default_phone_number?: string;
    qualifications?: string;
    join_date?: string;
    cnic?: string;
    address?: string;
    emergency_contact?: string;
    is_principal_delegate?: boolean;
  }) => api.post<TeacherDetail>("/api/v1/people/teachers", payload).then((r) => r.data),
  updateTeacher: (
    id: string,
    payload: {
      name?: string;
      whatsapp_number?: string;
      phone_list?: string[];
      default_phone_number?: string;
      qualifications?: string;
      join_date?: string;
      cnic?: string;
      address?: string;
      emergency_contact?: string;
      is_principal_delegate?: boolean;
      notes?: string;
      status?: string;
    },
  ) => api.put<TeacherDetail>(`/api/v1/people/teachers/${id}`, payload).then((r) => r.data),
  deactivateTeacher: (id: string) =>
    api.post(`/api/v1/people/teachers/${id}/deactivate`).then((r) => r.data),

  createGuardian: (payload: {
    name: string;
    relationship: string;
    phone_numbers: string;
    phone_list?: string[];
    default_phone_number?: string;
    student_ids?: string[];
    cnic?: string;
    address?: string;
    preferred_language?: string;
  }) => api.post<GuardianDetail>("/api/v1/people/guardians", payload).then((r) => r.data),
  updateGuardian: (
    id: string,
    payload: {
      name?: string;
      relationship?: string;
      phone_numbers?: string;
      phone_list?: string[];
      default_phone_number?: string;
      cnic?: string;
      address?: string;
      preferred_language?: string;
    },
  ) => api.put<GuardianDetail>(`/api/v1/people/guardians/${id}`, payload).then((r) => r.data),

  guardianStudents: (guardianId: string) =>
    getAllPages<StudentDetail>(`/api/v1/people/guardians/${guardianId}/students`),
  studentGuardians: (studentId: string) =>
    getAllPages<GuardianDetail>(`/api/v1/people/students/${studentId}/guardians`),
  linkStudentToGuardian: (guardianId: string, studentId: string) =>
    api.post(`/api/v1/people/guardians/${guardianId}/students/${studentId}`).then((r) => r.data),
  unlinkStudentFromGuardian: (guardianId: string, studentId: string) =>
    api.delete(`/api/v1/people/guardians/${guardianId}/students/${studentId}`).then((r) => r.data),

  studentCredentialsLink: (studentId: string) =>
    api
      .post<{ username: string; set_password_url: string }>(
        `/api/v1/people/students/${studentId}/credentials-link`,
      )
      .then((r) => r.data),
  teacherCredentialsLink: (teacherId: string) =>
    api
      .post<{ username: string; set_password_url: string }>(
        `/api/v1/people/teachers/${teacherId}/credentials-link`,
      )
      .then((r) => r.data),
  guardianCredentialsLink: (guardianId: string, username?: string) =>
    api
      .post<{ username: string; set_password_url: string }>(
        `/api/v1/people/guardians/${guardianId}/credentials-link`,
        { username },
      )
      .then((r) => r.data),
  donorCredentialsLink: (donorId: string) =>
    api
      .post<{ username: string; set_password_url: string }>(
        `/api/v1/finance/donors/${donorId}/credentials-link`,
      )
      .then((r) => r.data),
  sendCredentialsToWhatsApp: (payload: {
    subject_type: "student" | "teacher" | "guardian" | "donor";
    subject_id: string;
    set_password_url: string;
    phone_number?: string;
  }) => api.post<WhatsAppLinkResponse>("/api/v1/messaging/send-credentials", payload).then((r) => r.data),
};

export const admissionsMutations = {
  updateAdmission: (
    id: string,
    payload: {
      applicant_name?: string;
      guardian_contact?: string;
      program_id?: string;
      date_of_birth?: string;
      notes?: string;
      extra_data?: Record<string, unknown>;
    },
  ) => api.put<AdmissionApplication>(`/api/v1/operations/admissions/${id}`, payload).then((r) => r.data),
  createAdmission: (payload: {
    applicant_name: string;
    guardian_contact: string;
    form_id: string;
    program_id?: string;
    date_of_birth?: string;
    notes?: string;
    extra_data?: Record<string, unknown>;
  }) =>
    api.post<AdmissionApplication>("/api/v1/operations/admissions", payload).then((r) => r.data),
  convertAdmission: (id: string, payload: Record<string, never> = {}) =>
    api.post<AdmissionConversion>(`/api/v1/operations/admissions/${id}/convert`, payload).then((r) => r.data),
};

export interface PresignUpload {
  object_key: string;
  upload_url: string;
  file_id: string;
}

export const filesApi = {
  presignUpload: (payload: {
    category: string;
    filename: string;
    content_type: string;
    size_bytes: number;
  }) => api.post<PresignUpload>("/api/v1/files/presign-upload", payload).then((r) => r.data),
  presignDownload: (objectKey: string) =>
    api.get<{ url: string }>("/api/v1/files/presign-download", { params: { object_key: objectKey } }).then((r) => r.data.url),
  presignDownloadById: (fileId: string) =>
    api.get<{ url: string }>(`/api/v1/files/${fileId}/presign-download`).then((r) => r.data.url),
};

export async function uploadFile(file: File, category: string): Promise<string> {
  const { object_key, upload_url } = await filesApi.presignUpload({
    category,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  });
  const response = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) {
    throw new Error("File upload failed");
  }
  return object_key;
}

export async function uploadFileObject(file: File, category: string): Promise<string> {
  const { object_key, upload_url, file_id } = await filesApi.presignUpload({
    category, filename: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size,
  });
  const response = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!response.ok) throw new Error("File upload failed");
  return file_id;
}

export interface PublicAdmissionForm {
  id: string;
  title: string;
  description: string | null;
  program_name: string | null;
  programs: { id: string; name: string }[];
  fields_definition: FormFieldDefinition[];
  is_open: boolean;
}

export const publicApi = {
  admissionForm: (token: string) =>
    api.get<PublicAdmissionForm>(`/api/v1/public/admission-forms/${token}`).then((r) => r.data),
  submitAdmission: (
    token: string,
    payload: {
      applicant_name: string;
      guardian_contact: string;
      date_of_birth?: string;
      program_id: string;
      extra_data?: Record<string, unknown>;
      website?: string;
    },
  ) =>
    api
      .post<AdmissionApplication>(`/api/v1/public/admission-forms/${token}`, payload)
      .then((r) => r.data),
  uploadAdmissionFile: async (token: string, file: File): Promise<string> => {
    const upload = await api
      .post<{ object_key: string; upload_url: string }>(`/api/v1/public/admission-forms/${token}/uploads`, {
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      })
      .then((response) => response.data);
    const response = await fetch(upload.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!response.ok) throw new Error("File upload failed");
    return upload.object_key;
  },
};

// ------------------------------------------------------------------ Timetable
export interface TimetableImportRow {
  class_name: string;
  section_name: string;
  course_name: string;
  teacher_code: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}
export interface TimetableImportResponse {
  dry_run: boolean;
  created: number;
  results: { row: number; ok: boolean; error: string | null }[];
}

export const timetableApi = {
  listClassCourses: (classId: string) =>
    getAllPages<Course>(`/api/v1/academics/classes/${classId}/courses`),
  createSlot: (payload: {
    class_id: string;
    section_id: string;
    course_id: string;
    teacher_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
  }) => api.post("/api/v1/operations/timetable", payload).then((r) => r.data),
  deleteSlot: (id: string) => api.delete(`/api/v1/operations/timetable/${id}`).then((r) => r.data),
  importRows: (rows: TimetableImportRow[], dryRun: boolean) =>
    api
      .post<TimetableImportResponse>("/api/v1/operations/timetable/import", {
        rows,
        dry_run: dryRun,
      })
      .then((r) => r.data),
  exportPdf: (classId?: string) =>
    downloadReport(
      "/api/v1/operations/timetable/export",
      classId ? { class_id: classId } : {},
      "pdf",
      "timetable",
    ),
};

export interface PermissionRole {
  id: string;
  name: string;
  permission_codes: string[];
  user_count: number;
}

export const rolesApi = {
  list: () => getAllPages<PermissionRole>("/api/v1/auth/roles"),
  create: (payload: { name: string; permission_codes: string[] }) =>
    api.post<PermissionRole>("/api/v1/auth/roles", payload).then((r) => r.data),
  update: (id: string, payload: { name?: string; permission_codes?: string[] }) =>
    api.put<PermissionRole>(`/api/v1/auth/roles/${id}`, payload).then((r) => r.data),
  delete: (id: string) => api.delete(`/api/v1/auth/roles/${id}`).then((r) => r.data),
  assign: (userId: string, roleId: string) =>
    api.post("/api/v1/auth/roles/assign", { user_id: userId, role_id: roleId }).then((r) => r.data),
  unassign: (userId: string, roleId: string) =>
    api.post("/api/v1/auth/roles/unassign", { user_id: userId, role_id: roleId }).then((r) => r.data),
  listUserRoles: (userId: string) =>
    api.get<PermissionRole[]>(`/api/v1/auth/users/${userId}/roles`).then((r) => r.data),
};

export const permissionsApi = {
  list: () =>
    api.get<{ code: string; label: string; module: string; scoped: boolean }[]>("/api/v1/auth/permissions").then((r) => r.data),
};
