import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5173";
const label = process.argv[2] ?? "current";
const outputDir = path.resolve("artifacts/ui-audit", label);
let server;

async function ensureServer() {
  if (process.env.VISUAL_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "5173"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting whole-app visual audit server");
}

const principalDashboard = {
  role: "principal",
  counts: { students: 184, teachers: 16, classes: 9 },
  attendance: {
    present: 151,
    absent: 11,
    leave: 4,
    total_students: 184,
    missing_sync_teachers: 2,
    missing_sync_teacher_list: [
      { id: "teacher-1", name: "Ustad Ahmad" },
      { id: "teacher-2", name: "Ustad Bilal" },
    ],
  },
  finance: { month_total: 428500, currency: "PKR" },
  activity: [
    "Attendance completed for Hifz A",
    "New admission received for Nazra",
    "Monthly fee receipt recorded",
  ],
};

const programs = [{ id: "program-1", name: "Hifz Program", created_at: "2026-01-01T00:00:00Z" }];
const classes = [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true, assignment_limit: 8 }];
const sections = [{ id: "section-1", class_id: "class-1", name: "A" }];
const courses = [{ id: "course-1", name: "Quran Memorization" }, { id: "course-2", name: "Tajweed" }];
const sessions = [{ id: "session-1", name: "2026-27", gregorian_start: "2026-07-01", gregorian_end: "2027-06-30", hijri_span: "1448-1449 AH", is_active: true }];
const student = {
  id: "student-1", user_id: "student-user-1", username: "ali.noor", admission_number: "ADM-0008", name: "Ali Noor",
  date_of_birth: "2017-01-12", status: "active", portal_enabled: true, notes: "Needs afternoon transport",
  created_at: "2026-07-01T00:00:00Z", current_class: "Hifz Level 1 / A",
};
const teacher = { id: "teacher-1", user_id: "teacher-user-1", username: "ustad.ahmad", employee_code: "T-001", name: "Ustad Ahmad", phone: "0300 2223344", status: "active", created_at: "2026-07-01T00:00:00Z" };
const guardian = { id: "guardian-1", user_id: "guardian-user-1", name: "Shaikh Noor", relationship: "Father", phone_numbers: "0321 1234505", cnic: "35202-1234567-1", address: "Model Town, Lahore", created_at: "2026-07-01T00:00:00Z" };
const donor = { id: "donor-1", name: "Abdul Kareem", contact: "0300 1234567", created_at: "2026-07-01T00:00:00Z" };
const paymentCategory = { id: "category-1", name: "Sadaqah" };
const assignment = { id: "assignment-1", title: "Weekly memorization", class_id: "class-1", section_id: "section-1", course_id: "course-1", category: "Homework", instructions: "Revise sabaq and prepare oral check.", due_date: "2026-07-25", status: "published", teacher_name: "Ustad Ahmad", class_name: "Hifz Level 1", section_name: "A", course_name: "Quran Memorization", max_marks: 100, weightage: 20, attachment_key: null, target_student_ids: null, created_by_id: "principal-1", batch_id: null, created_at: "2026-07-20T00:00:00Z" };
const form = { id: "form-1", title: "Parent consent", description: "Annual trip permission", category: "Consent", fields_definition: [], allow_multiple: false, visibility_scope: { all: true }, created_by_id: "principal-1", created_at: "2026-07-01T00:00:00Z" };
const formResponse = { id: "response-1", form_id: form.id, student_id: student.id, student_name: student.name, response_data: { consent: "Yes" }, created_at: "2026-07-22T00:00:00Z" };
const resourceCategory = { id: "resource-category-1", name: "Handouts", description: "", is_global: true, owner_id: null, is_mine: false };
const resource = { id: "resource-1", category_id: resourceCategory.id, owner_id: "principal-1", owner_name: "admin", title: "Week 1 packet", description: "Introductory lesson notes.", file_key: "resources/week-1.pdf", video_url: null, visibility_scope: { all: true }, created_at: "2026-07-22T00:00:00Z" };
const timetableSlot = { id: "slot-1", session_id: "session-1", class_id: "class-1", section_id: "section-1", course_id: "course-1", teacher_id: "teacher-1", day_of_week: 1, period: 1, start_time: "08:00:00", end_time: "09:00:00", class_name: "Hifz Level 1", section_name: "A", course_name: "Quran Memorization", teacher_name: "Ustad Ahmad" };
const payment = { id: "payment-1", student_id: student.id, category_id: paymentCategory.id, amount: 12500, currency: "PKR", payment_date: "2026-07-22", period_covered: "July 2026", method: "cash", note: "Monthly fee", student_name: student.name, category_name: paymentCategory.name };
const donation = { id: "donation-1", donor_id: donor.id, category_id: paymentCategory.id, amount: 7500, currency: "PKR", donation_date: "2026-07-22", note: "General fund", donor_name: donor.name, category_name: paymentCategory.name };
const attendanceClasses = [{
  id: "class-1", name: "Hifz Level 1", course_names: courses.map((course) => course.name), courses, student_count: 1,
  sections: [{ id: "section-1", name: "A", student_count: 1 }],
}];
const roster = {
  session_id: "session-1", session_name: "2026-27", class_id: "class-1", class_name: "Hifz Level 1", section_id: "section-1", section_name: "A",
  course: courses[0], timetable_slot: { id: "slot-1", period: 1, day_of_week: 1, start_time: "08:00:00", end_time: "09:00:00" },
  students: [{ id: student.id, admission_number: student.admission_number, name: student.name, section_id: "section-1", section_name: "A" }],
};
const holiday = { id: "holiday-1", name: "Annual break", category: "General", start_date: "2026-08-01", end_date: "2026-08-03", class_ids: [classes[0].id] };
const leave = { id: "leave-1", user_id: "teacher-user-1", person_name: teacher.name, person_type: "teacher", start_date: "2026-07-24", end_date: "2026-07-25", reason: "Family commitment", status: "pending" };
const admissionForm = { id: "admission-form-1", program_id: "program-1", title: "2027 Hifz admission", description: "Complete learner profile.", fields_definition: [], public_token: "public-1", is_open: true, created_at: "2026-07-01T00:00:00Z", program_name: "Hifz Program", category: "General" };
const admission = { id: "admission-1", applicant_name: "Ali Noor", guardian_contact: "0321 1234505", program_id: "program-1", date_of_birth: "2017-01-12", notes: "Needs afternoon transport", status: "pending", status_history: [], form_id: admissionForm.id, extra_data: {}, created_at: "2026-07-20T00:00:00Z", converted_student_id: null, converted_guardian_id: null, converted_by_id: null, converted_at: null };
const enquiry = { id: "enquiry-1", name: "Shaikh Noor", contact: "0321 1234505", message: "Please share admission details.", status: "new", created_at: "2026-07-23T00:00:00Z" };
const salaryRecord = { id: "salary-1", teacher_id: teacher.id, amount: 55000, currency: "PKR", effective_from: "2026-07-01" };
const salaryPayment = { id: "salary-payment-1", teacher_id: teacher.id, amount: 55000, currency: "PKR", payment_date: "2026-07-28", period_covered: "July 2026", method: "bank", note: "Monthly salary", recorded_by_id: "principal-1", created_at: "2026-07-28T00:00:00Z" };
const gradingPlan = {
  id: "plan-1", course_id: "course-1", class_id: null, name: "Quran Memorization grading plan", assignment_weightage: 20,
  components: [{ id: "component-1", name: "Term exam", weightage: 50 }, { id: "component-2", name: "Oral assessment", weightage: 30 }],
  bands: [{ label: "A", min_score: 80, max_score: 100 }, { label: "B", min_score: 60, max_score: 79.99 }],
};
const resultsMatrix = {
  session_id: "session-1",
  sections: [{
    class_id: "class-1", class_name: "Hifz Level 1", section_id: "section-1", section_name: "A",
    courses: [{ course_id: "course-1", course_name: "Quran Memorization", teacher_name: teacher.name, exam_types: [{ id: "exam-type-1", name: "Term exam", weightage: 50 }] }],
    students: [{ student_id: student.id, name: student.name, admission_number: student.admission_number, overall_score: 86, courses: [{ course_id: "course-1", raw_score: 86, band: "A", marks: [{ exam_type_id: "exam-type-1", score: 86 }] }] }],
  }],
};
const settings = [{ id: "setting-1", key: "madrasa.name_en", value: "Suffa Madrasa", updated_at: "2026-07-01T00:00:00Z" }];
const settingsCatalog = [{ key: "madrasa.name_en", category: "branding", type: "text", label: "English name", value: "Suffa Madrasa" }];
const blogPost = { id: "blog-1", title: "Welcome note", body: "Admissions are open for the new academic year.", published: true, publish_at: "2026-07-22T00:00:00Z", author_id: "principal-1", created_at: "2026-07-22T00:00:00Z" };
const attendanceEntry = {
  id: "attendance-1", attendance_date: "2026-07-17", student_id: student.id, student_name: student.name,
  admission_number: student.admission_number, status: "present", marked_at: "2026-07-17T08:05:00Z", synced_at: "2026-07-17T08:05:00Z",
  marked_by: { id: "teacher-user-1", username: "ustad.ahmad", display_name: teacher.name, role: "teacher" },
  overridden: false, source: "manual", locked_reason: null, leave_id: null, course: courses[0],
  timetable_slot: { id: "slot-1", period: 1, day_of_week: 1, start_time: "08:00:00", end_time: "09:00:00" },
  legacy_general: false,
};
const teacherAttendanceToday = {
  session_id: "session-1", teacher_id: teacher.id, teacher_name: teacher.name, attendance_date: "2026-07-17",
  id: "teacher-attendance-1", status: "present", check_in: "08:00:00", check_out: null,
};
const teacherAttendanceLog = {
  id: "teacher-log-1", teacher_id: teacher.id, teacher_name: teacher.name, employee_code: teacher.employee_code,
  attendance_date: "2026-07-17", status: "present", check_in: "08:00:00", check_out: "13:00:00",
  marked_at: "2026-07-17T08:00:00Z", synced_at: "2026-07-17T08:00:00Z",
  marked_by: { id: "teacher-user-1", username: "ustad.ahmad", display_name: teacher.name, role: "teacher" },
  overridden: false,
};
const studentResult = {
  session_id: "session-1", student_id: student.id, overall_score: 86, published: true,
  course_results: [{ course_id: "course-1", raw_score: 86, band: "A", exam_count: 1, course_name: "Quran Memorization" }],
};
const studentDashboard = {
  role: "student",
  my_attendance: { "2026-07-17": "present", "2026-07-18": "absent", "2026-07-19": "leave" },
  my_attendance_periods: [{ date: "2026-07-17", status: "present", course_id: "course-1", course_name: "Quran Memorization", timetable_slot_id: "slot-1", period: 1, legacy_general: false }],
  today_timetable: [{ course_id: "course-1", period: 1, start_time: "08:00", end_time: "09:00" }],
  latest_result: studentResult,
  due_assignments: [{ id: assignment.id, title: assignment.title, due_date: assignment.due_date, course_id: assignment.course_id, submitted: false, file_key: null, mark: null, max_marks: 100, feedback: null }],
  resources: [{ id: resource.id, title: resource.title }],
  announcements: [{ id: "announcement-1", title: "Parent meeting", body: "Meeting after Asr prayer." }],
  forms: [{ id: form.id, title: form.title, description: form.description, category: form.category, open_until: null }],
};
const teacherDashboard = {
  role: "teacher",
  my_classes: [{ class_id: "class-1", section_id: "section-1", course_id: "course-1", class_name: "Hifz Level 1", section_name: "A", course_name: "Quran Memorization" }],
  pending_submissions: 2,
  today_timetable: [{ course_id: "course-1", period: 1, start_time: "08:00", end_time: "09:00" }],
  today_attendance: teacherAttendanceToday,
};
const parentDashboard = {
  role: "parent",
  children: [{
    id: student.id, name: student.name, admission_number: student.admission_number, current_class: student.current_class,
    ...studentDashboard,
    role: undefined,
    latest_result: studentResult,
    fee_summary: { totals: [{ amount: 12500, currency: "PKR" }] },
    payments: [{ id: payment.id, category: payment.category_name, amount: payment.amount, currency: payment.currency, payment_date: payment.payment_date, note: payment.note }],
  }],
};
const platformMadrasa = { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa", content_language: "ur", created_at: "2026-07-01T00:00:00Z" };
const platformFeatures = [
  { key: "attendance", label: "Attendance", enabled: true },
  { key: "finance", label: "Finance", enabled: true },
  { key: "admissions", label: "Admissions", enabled: true },
];

const principalRoutes = [
  "/dashboard",
  "/attendance",
  "/timetable/grid",
  "/timetable/list",
  "/timetable/teachers",
  "/timetable/import",
  "/holidays",
  "/leave",
  "/announcements",
  "/academics/programs",
  "/academics/classes",
  "/academics/courses",
  "/academics/sessions",
  "/assessments/assignments",
  "/assessments/grading",
  "/assessments/setup",
  "/assessments/results",
  "/resources",
  "/forms",
  "/people/students",
  "/people/teachers",
  "/people/guardians",
  "/people/donators",
  "/admissions",
  "/admission-forms",
  "/enquiries",
  "/finance/contributions",
  "/finance/donations",
  "/finance/summary",
  "/salary",
  "/reports",
  "/blog",
  "/settings",
  "/my-profile",
];

const roleScenarios = [
  { persona: "principal", routes: principalRoutes },
  { persona: "teacher", routes: ["/dashboard", "/my-attendance", "/my-timetable", "/my-leave", "/my-salary", "/announcements", "/resources", "/forms", "/my-profile"] },
  { persona: "student", routes: ["/dashboard", "/my-attendance", "/my-timetable", "/my-leave", "/my-assessments", "/announcements", "/resources", "/forms", "/my-profile"] },
  { persona: "parent", routes: ["/dashboard", "/announcements", "/resources", "/forms", "/my-profile"] },
  { persona: "super_admin", routes: ["/platform"] },
  { persona: "public", routes: ["/admission/public-1"], publicPage: true },
];

const personaUser = (persona, preferredLanguage) => {
  if (persona === "super_admin") return { id: "super-admin-1", username: "platform", role: "super_admin", status: "active", preferred_language: preferredLanguage, is_principal_delegate: false, selected_session_id: null, has_teaching_assignment: false };
  if (persona === "teacher") return { id: "teacher-user-1", username: "ustad.ahmad", role: "teacher", status: "active", preferred_language: preferredLanguage, is_principal_delegate: false, selected_session_id: null, has_teaching_assignment: true };
  if (persona === "student") return { id: "student-user-1", username: "ali.noor", role: "student", status: "active", preferred_language: preferredLanguage, is_principal_delegate: false, selected_session_id: null, has_teaching_assignment: false };
  if (persona === "parent") return { id: "guardian-user-1", username: "shaikh.noor", role: "parent", status: "active", preferred_language: preferredLanguage, is_principal_delegate: false, selected_session_id: null, has_teaching_assignment: false };
  return { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: preferredLanguage, is_principal_delegate: false, selected_session_id: null, has_teaching_assignment: true };
};

async function mockApi(context, preferredLanguage = "en", persona = "principal") {
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body = [];

    if (pathname === "/api/v1/auth/me" && request.method() === "PATCH") {
      const user = personaUser(persona, preferredLanguage);
      body = { user, has_teaching_assignment: user.has_teaching_assignment };
    } else if (pathname === "/api/v1/auth/me") {
      const user = personaUser(persona, preferredLanguage);
      body = {
        user,
        madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
        permissions: persona === "teacher" ? ["attendance.take", "assignments.create", "assessments.marks.enter"] : [],
        features: {},
        has_teaching_assignment: user.has_teaching_assignment,
      };
    } else if (pathname === "/api/v1/academics/today") {
      body = { gregorian: "17 Jul 2026", hijri: "2 Safar 1448 AH" };
    } else if (pathname === "/api/v1/reporting/dashboard") {
      body = persona === "teacher" ? teacherDashboard : persona === "student" ? studentDashboard : persona === "parent" ? parentDashboard : principalDashboard;
    } else if (pathname === "/api/v1/public/admission-forms/public-1") {
      body = {
        title: admissionForm.title,
        description: admissionForm.description,
        program_name: "Hifz Program",
        is_open: true,
        fields_definition: [
          { key: "student_name", label: "Student name", type: "text", required: true, options: [], built_in: true, enabled: true },
          { key: "guardian_phone_numbers", label: "Guardian phone", type: "phone", required: true, options: [], built_in: true, enabled: true },
          { key: "previous_madrasa", label: "Previous madrasa", type: "text", required: false, options: [] },
        ],
      };
    } else if (pathname === "/api/v1/platform/madaris") {
      body = [platformMadrasa];
    } else if (pathname === "/api/v1/platform/madaris/madrasa-1/features") {
      body = platformFeatures;
    } else if (pathname === "/api/v1/attendance/classes") {
      body = attendanceClasses;
    } else if (pathname === "/api/v1/attendance/classes/class-1/roster") {
      body = roster;
    } else if (pathname.includes("/api/v1/attendance/classes/class-1") && pathname.endsWith("/history")) {
      body = { ...roster, entries: [attendanceEntry] };
    } else if (pathname === "/api/v1/attendance/students/me/history") {
      body = { ...roster, student: roster.students[0], entries: [attendanceEntry] };
    } else if (pathname === "/api/v1/attendance/teachers/me/today") {
      body = teacherAttendanceToday;
    } else if (pathname === "/api/v1/attendance/teachers/me/history") {
      body = [teacherAttendanceLog];
    } else if (pathname === "/api/v1/academics/programs") {
      body = programs;
    } else if (pathname === "/api/v1/academics/classes") {
      body = classes;
    } else if (pathname === "/api/v1/academics/classes/class-1/sections") {
      body = sections;
    } else if (pathname === "/api/v1/academics/classes/class-1/courses" || pathname === "/api/v1/academics/courses") {
      body = courses;
    } else if (pathname === "/api/v1/academics/sessions") {
      body = sessions;
    } else if (pathname === "/api/v1/people/students") {
      body = [student];
    } else if (pathname === "/api/v1/people/teachers") {
      body = [teacher];
    } else if (pathname === "/api/v1/people/guardians") {
      body = [guardian];
    } else if (pathname === "/api/v1/people/students/student-1/guardians") {
      body = [guardian];
    } else if (pathname === "/api/v1/people/guardians/guardian-1/students") {
      body = [student];
    } else if (pathname === "/api/v1/finance/donors") {
      body = [donor];
    } else if (pathname === "/api/v1/operations/holidays") {
      body = [holiday];
    } else if (pathname === "/api/v1/operations/leave") {
      body = [leave];
    } else if (pathname === "/api/v1/operations/admission-forms") {
      body = [admissionForm];
    } else if (pathname === "/api/v1/operations/admissions") {
      body = [admission];
    } else if (pathname === "/api/v1/operations/enquiries") {
      body = [enquiry];
    } else if (pathname === "/api/v1/operations/admin-notifications") {
      body = [{ id: "notification-1", event_type: "admission.created", title: "New admission", message: admission.applicant_name, entity_type: "admission_application", entity_id: admission.id, is_read: false, created_at: "2026-07-22T00:00:00Z" }];
    } else if (pathname === "/api/v1/operations/timetable") {
      body = [timetableSlot];
    } else if (pathname === "/api/v1/operations/timetable/me") {
      body = [timetableSlot];
    } else if (pathname === "/api/v1/operations/announcements") {
      body = [{ id: "announcement-1", title: "Parent meeting", body: "Meeting after Asr prayer.", category: "General", attachment_link: null, audience_scope: { all: true }, publish_at: "2026-07-22T00:00:00Z", expires_at: null, created_at: "2026-07-20T00:00:00Z" }];
    } else if (pathname === "/api/v1/operations/forms") {
      body = [form];
    } else if (pathname === "/api/v1/operations/form-responses" || pathname === `/api/v1/operations/forms/${form.id}/responses`) {
      body = [formResponse];
    } else if (pathname === "/api/v1/operations/resource-categories") {
      body = [resourceCategory];
    } else if (pathname === "/api/v1/operations/resources") {
      body = [resource];
    } else if (pathname === "/api/v1/assessments/assignments") {
      body = [assignment];
    } else if (pathname === "/api/v1/assessments/grading-plan") {
      body = gradingPlan;
    } else if (pathname === "/api/v1/assessments/grading-schemes") {
      body = [{ id: "scheme-1", name: "Standard grading", bands: gradingPlan.bands, include_assignments: true }];
    } else if (pathname === "/api/v1/assessments/exam-types") {
      body = [{ id: "exam-type-1", course_id: "course-1", class_id: null, name: "Term exam", weightage: 50, grading_scheme_id: "scheme-1" }];
    } else if (pathname === "/api/v1/assessments/results/matrix") {
      body = resultsMatrix;
    } else if (pathname === "/api/v1/assessments/results/me") {
      body = studentResult;
    } else if (pathname === "/api/v1/finance/categories" || pathname === "/api/v1/finance/payment-categories") {
      body = [paymentCategory];
    } else if (pathname === "/api/v1/finance/payments") {
      body = [payment];
    } else if (pathname === "/api/v1/finance/donations") {
      body = [donation];
    } else if (pathname === "/api/v1/finance/summary") {
      body = { total_contributions: 342000, total_donations: 86500, total: 428500, by_category: { Fees: 342000, Donations: 86500 } };
    } else if (pathname === "/api/v1/finance/salary/teacher-1") {
      body = salaryRecord;
    } else if (pathname === "/api/v1/finance/salary/teacher-1/payments") {
      body = [salaryPayment];
    } else if (pathname === "/api/v1/finance/salary-history") {
      body = [{ ...salaryPayment, teacher_name: teacher.name, employee_code: teacher.employee_code, status: "paid" }];
    } else if (pathname === "/api/v1/finance/salary/me") {
      body = { record: salaryRecord, payments: [salaryPayment] };
    } else if (pathname === "/api/v1/operations/settings") {
      body = settings;
    } else if (pathname === "/api/v1/operations/settings/catalog") {
      body = settingsCatalog;
    } else if (pathname === "/api/v1/operations/blog") {
      body = [blogPost];
    } else if (pathname.endsWith("/summary") || pathname.endsWith("/matrix")) {
      body = {};
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "X-Total-Count", "X-Total-Count": Array.isArray(body) ? String(body.length) : "0" },
      body: JSON.stringify(body),
    });
  });
}

function attachErrorListeners(page, errors) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
}

async function newAuditContext(browser, viewport, preferredLanguage, persona = "principal") {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "visual-audit-token");
    localStorage.setItem("mms_tenant", "suffa");
  });
  await mockApi(context, preferredLanguage, persona);
  return context;
}

async function auditLoadedPage(page, route, viewport, scenarioName, name, errors) {
  await page.locator(".workspace, .platformRoot, .publicFormPage").first().waitFor({ state: "visible", timeout: 10_000 });
  if (await page.locator(".notFoundView").isVisible().catch(() => false)) {
    errors.push(`${name} ${scenarioName} ${route}: rendered not found view`);
  }
  await page.locator(".emptyState", { hasText: "Loading" }).waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.locator(".emptyState", { hasText: "لوڈ ہو رہا ہے" }).waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(150);
  const slug = route.replace(/^\//, "").replaceAll("/", "-");
  await page.screenshot({ path: path.join(outputDir, `${scenarioName}-${slug}-${name}.png`), fullPage: false, animations: "disabled" });
  console.log(`captured ${name} ${scenarioName} ${route}`);
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  if (overflow.content > overflow.viewport + 1) {
    errors.push(`${name} ${scenarioName} ${route}: horizontal overflow ${overflow.content - overflow.viewport}px`);
  }
  const controlIssues = await page.evaluate(() => {
    const isVisible = (element) => {
      if (element.closest(".visuallyHidden, [hidden], [aria-hidden='true']")) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden"
        && style.display !== "none"
        && rect.width > 1
        && rect.height > 1;
    };
    const viewportWidth = document.documentElement.clientWidth;
    const issues = [];
    const controls = document.querySelectorAll([
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      ".MuiInputBase-root",
      ".MuiNativeSelect-root",
      ".MuiCheckbox-root",
      ".MuiRadio-root",
    ].join(","));
    for (const control of controls) {
      if (!isVisible(control)) continue;
      const rect = control.getBoundingClientRect();
      const tag = control.tagName.toLowerCase();
      const label = control.getAttribute("aria-label")
        || control.textContent?.trim()
        || control.getAttribute("placeholder")
        || control.getAttribute("type")
        || tag;
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        issues.push(`${label}: leaves viewport (${Math.round(rect.left)}-${Math.round(rect.right)} of ${viewportWidth})`);
      }
      if (control.scrollWidth > control.clientWidth + 1) {
        issues.push(`${label}: clipped horizontally (${control.scrollWidth}/${control.clientWidth})`);
      }
      if (control.scrollHeight > control.clientHeight + 1 && !["textarea"].includes(tag)) {
        issues.push(`${label}: clipped vertically (${control.scrollHeight}/${control.clientHeight})`);
      }
      if (viewportWidth <= 960 && !control.closest(".actionMenuDropdown")) {
        if (rect.height < 44 || rect.width < 44) {
          issues.push(`${label}: touch target too small (${Math.round(rect.width)}x${Math.round(rect.height)})`);
        }
      }
    }
    if (viewportWidth <= 960) {
      const visibleControls = [...controls]
        .filter((control) => isVisible(control) && !control.closest(".actionMenuDropdown, .peopleMultiSelectMenu, .searchDropdownMenu"))
        .map((control) => {
          const rect = control.getBoundingClientRect();
          const label = control.getAttribute("aria-label")
            || control.textContent?.trim()
            || control.getAttribute("placeholder")
            || control.getAttribute("type")
            || control.tagName.toLowerCase();
          return { control, rect, label: label.replace(/\s+/g, " ").slice(0, 48) };
        });
      for (let i = 0; i < visibleControls.length; i += 1) {
        for (let j = i + 1; j < visibleControls.length; j += 1) {
          const a = visibleControls[i];
          const b = visibleControls[j];
          if (a.control.contains(b.control) || b.control.contains(a.control)) continue;
          if (a.control.closest("label") && a.control.closest("label") === b.control.closest("label")) continue;
          if (a.control.closest(".dateChip") && a.control.closest(".dateChip") === b.control.closest(".dateChip")) continue;
          if (a.control.closest(".profileChip") && a.control.closest(".profileChip") === b.control.closest(".profileChip")) continue;
          const inlineOverlap = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
          const blockOverlap = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
          if (inlineOverlap > 6 && blockOverlap > 6) {
            issues.push(`${a.label} overlaps ${b.label} (${Math.round(inlineOverlap)}x${Math.round(blockOverlap)})`);
          }
        }
      }
    }
    for (const label of document.querySelectorAll(".checkboxLabel, .choiceLabel")) {
      if (!isVisible(label)) continue;
      const control = label.querySelector(".MuiCheckbox-root, .MuiRadio-root, input[type='checkbox'], input[type='radio']");
      const text = label.querySelector(".checkboxFieldText, .choiceFieldText, span:last-child");
      const labelText = label.textContent?.trim() || "choice";
      if (!control || !isVisible(control)) {
        issues.push(`${labelText}: missing visible choice control`);
        continue;
      }
      const labelRect = label.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();
      const textRect = text?.getBoundingClientRect();
      const labelStyle = getComputedStyle(label);
      const verticalOverlap = textRect
        ? Math.min(controlRect.bottom, textRect.bottom) - Math.max(controlRect.top, textRect.top)
        : null;
      if (!["flex", "inline-flex"].includes(labelStyle.display) || labelStyle.alignItems !== "center") {
        issues.push(`${labelText}: choice row is not centered flex layout`);
      }
      if (controlRect.width < 44 || controlRect.height < 44) {
        issues.push(`${labelText}: choice touch target too small (${Math.round(controlRect.width)}x${Math.round(controlRect.height)})`);
      }
      if (
        controlRect.left < labelRect.left - 1
        || controlRect.right > labelRect.right + 1
        || controlRect.top < labelRect.top - 1
        || controlRect.bottom > labelRect.bottom + 1
      ) {
        issues.push(`${labelText}: choice control leaves label bounds`);
      }
      if (!textRect) {
        issues.push(`${labelText}: missing visible choice label text`);
      } else if (
        textRect.left < labelRect.left - 1
        || textRect.right > labelRect.right + 1
        || verticalOverlap === null
        || verticalOverlap < Math.min(textRect.height, controlRect.height) * 0.5
      ) {
        issues.push(`${labelText}: choice text is clipped or misaligned`);
      }
    }
    return issues;
  });
  for (const issue of controlIssues) {
    errors.push(`${name} ${scenarioName} ${route}: ${issue}`);
  }
  if (viewport.width <= 960) {
    const tableIssues = await page.evaluate(() => {
      const isVisible = (element) => {
        if (element.closest(".visuallyHidden, [hidden], [aria-hidden='true']")) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden"
          && style.display !== "none"
          && rect.width > 1
          && rect.height > 1;
      };
      const issues = [];
      for (const table of document.querySelectorAll("table")) {
        if (!isVisible(table)) continue;
        const rect = table.getBoundingClientRect();
        const label = table.getAttribute("aria-label") || table.className?.toString().trim().replace(/\s+/g, ".") || table.tagName.toLowerCase();
        issues.push(`visible mobile table (${label} ${Math.round(rect.width)}x${Math.round(rect.height)})`);
      }
      for (const row of document.querySelectorAll(".dataTable .dataRow:not(.header), .muiDataTable .mobileDataCard")) {
        if (!isVisible(row)) continue;
        const style = getComputedStyle(row);
        if (!["flex", "grid"].includes(style.display)) {
          issues.push(`mobile record is not card layout (${style.display})`);
        }
        if (row.matches(".dataTable .dataRow:not(.header)") && style.display === "flex" && style.flexDirection !== "column") {
          issues.push(`mobile record is still row layout (${style.flexDirection})`);
        }
      }
      for (const table of document.querySelectorAll(".dataTable")) {
        if (!isVisible(table) || !table.querySelector(".dataRow.header")) continue;
        for (const field of table.querySelectorAll(".dataRow:not(.header) > :where(span, div)")) {
          if (!isVisible(field)) continue;
          const label = field.getAttribute("data-label")?.trim() ?? "";
          const text = field.textContent?.trim() ?? "";
          if (!label && text) {
            issues.push(`mobile card field missing label (${text.slice(0, 32)})`);
          }
          const renderedLabel = getComputedStyle(field, "::before").content.replace(/^["']|["']$/g, "").trim();
          if (label && text && (!renderedLabel || renderedLabel === "none")) {
            issues.push(`mobile card field label not rendered (${label})`);
          }
        }
      }
      for (const field of document.querySelectorAll(".sheet tbody td:not(.sheetEmpty)")) {
        if (!isVisible(field)) continue;
        const label = field.getAttribute("data-label")?.trim() ?? "";
        const text = field.textContent?.trim() ?? "";
        if (!label && text) {
          issues.push(`mobile sheet field missing label (${text.slice(0, 32)})`);
        }
      }
      for (const container of document.querySelectorAll([
        ".attendanceCalendarGrid",
        ".attendanceCalendarWeekdays",
        ".filterBar",
        ".formActions",
        ".inlineFilter",
        ".moduleToolbar",
        ".resourceHeaderActions",
        ".tabList",
        ".tableResponsive",
        ".timetableGrid",
      ].join(","))) {
        if (!isVisible(container)) continue;
        const style = getComputedStyle(container);
        if (!["auto", "scroll"].includes(style.overflowX)) continue;
        if (container.scrollWidth > container.clientWidth + 1) {
          const label = container.className?.toString().trim().replace(/\s+/g, ".") || container.tagName.toLowerCase();
          issues.push(`mobile scrollable container (${label} ${container.scrollWidth}/${container.clientWidth})`);
        }
      }
      const textSelectors = [
        "button",
        "a",
        "label",
        "legend",
        "p",
        "small",
        "span",
        "strong",
        "dt",
        "dd",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        ".emptyState",
        ".inlineFilterField",
        ".mobileDataField",
        ".tabButton",
        ".viewDescription",
      ].join(",");
      for (const text of document.querySelectorAll(textSelectors)) {
        if (!isVisible(text)) continue;
        if (text.closest(".dateChip, .profileChipButton, .visuallyHidden, [aria-hidden='true']")) continue;
        if (text.querySelector(":scope > svg")) continue;
        const ownText = [...text.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim() ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        const hasOnlyElementText = !ownText && text.children.length > 0;
        if (hasOnlyElementText && !["BUTTON", "A", "LABEL"].includes(text.tagName)) continue;
        const visibleText = (ownText || text.textContent?.trim() || "").replace(/\s+/g, " ").trim();
        if (!visibleText || visibleText.length < 2) continue;
        const style = getComputedStyle(text);
        const label = visibleText.slice(0, 48) || text.tagName.toLowerCase();
        const clipsInline = style.overflowX === "hidden" && text.scrollWidth > text.clientWidth + 1;
        const clipsBlock = style.overflowY === "hidden" && text.scrollHeight > text.clientHeight + 1;
        if (clipsInline || clipsBlock || (style.whiteSpace === "nowrap" && text.scrollWidth > text.clientWidth + 1)) {
          issues.push(`mobile text clipped (${label})`);
        }
      }
      return issues;
    });
    for (const issue of tableIssues) {
      errors.push(`${name} ${scenarioName} ${route}: ${issue}`);
    }
  }
}

async function capture(browser, viewport, name, preferredLanguage = "en") {
  const errors = [];
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  attachErrorListeners(page, errors);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".login-container").waitFor({ state: "visible" });
  await page.screenshot({ path: path.join(outputDir, `login-${name}.png`), fullPage: true, animations: "disabled" });
  await context.close();

  for (const scenario of roleScenarios) {
    const scenarioContext = await newAuditContext(browser, viewport, preferredLanguage, scenario.persona);
    const scenarioPage = await scenarioContext.newPage();
    attachErrorListeners(scenarioPage, errors);
    for (const route of scenario.routes) {
      await scenarioPage.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 10_000 });
      await auditLoadedPage(scenarioPage, route, viewport, scenario.persona, name, errors);
    }
    await scenarioContext.close();
  }

  return errors;
}

await mkdir(outputDir, { recursive: true });
await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  const auditMatrix = [
    { viewport: { width: 320, height: 740 }, name: "phone-320", language: "en" },
    { viewport: { width: 320, height: 740 }, name: "phone-320-urdu", language: "ur" },
    { viewport: { width: 390, height: 844 }, name: "phone-390", language: "en" },
    { viewport: { width: 390, height: 844 }, name: "phone-390-urdu", language: "ur" },
    { viewport: { width: 768, height: 1024 }, name: "tablet-768", language: "en" },
    { viewport: { width: 768, height: 1024 }, name: "tablet-768-urdu", language: "ur" },
    { viewport: { width: 920, height: 900 }, name: "tablet-920", language: "en" },
    { viewport: { width: 920, height: 900 }, name: "tablet-920-urdu", language: "ur" },
    { viewport: { width: 1440, height: 1000 }, name: "desktop-1440", language: "en" },
  ];
  const errors = [];
  for (const entry of auditMatrix) {
    errors.push(...await capture(browser, entry.viewport, entry.name, entry.language));
  }
  if (errors.length) {
    console.log(JSON.stringify({ label, errors }, null, 2));
  } else {
    console.log(JSON.stringify({ label, errors: [] }));
  }
} finally {
  await browser.close();
  server?.kill();
}
