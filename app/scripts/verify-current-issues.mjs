import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.VISUAL_ISSUES_BASE_URL ?? "http://127.0.0.1:4174";
const outputDir = path.resolve("artifacts/issue-verification");
let server;

const programs = [{ id: "program-1", name: "Hifz Program", created_at: "2026-01-01T00:00:00Z" }];
const classes = [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true, assignment_limit: 8 }];
const sections = [{ id: "section-1", class_id: "class-1", name: "A" }];
const courses = [{ id: "course-1", name: "Quran Memorization" }, { id: "course-2", name: "Tajweed" }];
const sessions = [{ id: "session-1", name: "2026–27", gregorian_start: "2026-07-01", gregorian_end: "2027-06-30", hijri_span: "1448–1449 AH", is_active: true }];
const admissionFields = [
  { key: "student_name", label: "Student name", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: "student_date_of_birth", label: "Date of birth", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: "student_b_form_number", label: "B-Form number", type: "text", required: false, options: [], built_in: true, enabled: true },
  { key: "student_address", label: "Student address", type: "textarea", required: false, options: [], built_in: true, enabled: true },
  { key: "student_phone", label: "Student phone", type: "phone", required: false, options: [], built_in: true, enabled: true },
  { key: "student_portal_enabled", label: "Student portal", type: "dropdown", required: true, options: ["enabled", "disabled"], built_in: true, enabled: true },
  { key: "guardian_name", label: "Guardian name", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: "guardian_relationship", label: "Guardian relationship", type: "text", required: true, options: [], built_in: true, enabled: true },
  { key: "guardian_phone_numbers", label: "Guardian phone number", type: "phone", required: true, options: [], built_in: true, enabled: true },
  { key: "previous_madrasa", label: "Previous madrasa", type: "text", required: true, options: [] },
  { key: "preferred_campus", label: "Preferred campus", type: "radio", required: true, options: ["North", "South"] },
];
const admissionForm = {
  id: "form-1", program_id: "program-1", title: "2027 Hifz admission", description: "Complete the learner profile.",
  category: "General", public_token: "public-1", is_open: false, created_at: "2026-07-01T00:00:00Z", program_name: "Hifz Program",
  fields_definition: admissionFields,
};
const student = {
  id: "student-1", user_id: "student-user-1", username: "ali.noor", admission_number: "ADM-0008", name: "Ali Noor",
  date_of_birth: "2017-01-12", status: "active", portal_enabled: true, notes: "Needs afternoon transport",
  created_at: "2026-07-01T00:00:00Z", b_form_number: "61101-1234567-3", address: "Model Town, Lahore", current_class: "Hifz Level 1 / A",
  active_enrollment: {
    id: "enrollment-1", session_id: "session-1", session_name: "2026–27", program_id: "program-1", program_name: "Hifz Program",
    class_id: "class-1", class_name: "Hifz Level 1", section_id: "section-1", section_name: "A", started_on: "2026-07-01",
  },
  admission_record: {
    id: "record-1", form_id: "form-1", application_id: "application-1", form_title: "2027 Hifz admission", created_at: "2026-07-01T00:00:00Z",
    fields_definition: admissionForm.fields_definition,
    answers: {
      student_name: "Ali Noor",
      student_date_of_birth: "2017-01-12",
      student_b_form_number: "61101-1234567-3",
      student_address: "Model Town, Lahore",
      student_phone: "0300 1112233",
      student_portal_enabled: "enabled",
      guardian_name: "Shaikh Noor",
      guardian_relationship: "Father",
      guardian_phone_numbers: "0321 1234505",
      previous_madrasa: "Dar-ul-Ilm",
      preferred_campus: "North",
    },
  },
};
const guardian = {
  id: "guardian-1", user_id: "guardian-user-1", name: "Shaikh Noor", relationship: "Father", phone_numbers: "0321 1234505",
  cnic: "35202-1234567-1", address: "Model Town, Lahore", preferred_language: "en", created_at: "2026-07-01T00:00:00Z",
};
const application = {
  id: "application-1", applicant_name: "Ali Noor", guardian_contact: "0321 1234505", program_id: "program-1",
  date_of_birth: "2017-01-12", notes: "Review transport requirement", status: "pending", form_id: "form-1",
  extra_data: {
    student_phone: "0300 1112233",
    guardian_name: "Shaikh Noor",
    guardian_relationship: "Father",
    guardian_phone_numbers: "0321 1234505; 0321 1234506",
    guardian_cnic: "35202-1234567-1",
    guardian_address: "Model Town, Lahore",
  },
  created_at: "2026-07-20T00:00:00Z", converted_student_id: null, converted_guardian_id: null, converted_by_id: null, converted_at: null,
};
const attendanceClasses = [{
  id: "class-1", name: "Hifz Level 1", course_names: courses.map((item) => item.name), courses, student_count: 1,
  sections: [{ id: "section-1", name: "A", student_count: 1 }],
}];
const timetableSlots = [
  { id: "slot-1", session_id: "session-1", class_id: "class-1", section_id: "section-1", course_id: "course-1", teacher_id: "teacher-1", day_of_week: 1, period: 1, start_time: "08:00:00", end_time: "09:00:00", class_name: "Hifz Level 1", section_name: "A", course_name: "Quran Memorization", teacher_name: "Ustad Ahmad" },
  { id: "slot-2", session_id: "session-1", class_id: "class-1", section_id: "section-1", course_id: "course-2", teacher_id: "teacher-1", day_of_week: 1, period: 2, start_time: "09:15:00", end_time: "10:00:00", class_name: "Hifz Level 1", section_name: "A", course_name: "Tajweed", teacher_name: "Ustad Ahmad" },
];
const donor = { id: "donor-1", name: "Abdul Kareem", contact: "0300 1234567", created_at: "2026-07-01T00:00:00Z" };
const paymentCategory = { id: "category-1", name: "Sadaqah" };
const donation = {
  id: "donation-1", donor_id: donor.id, category_id: paymentCategory.id, amount: 7500, currency: "PKR",
  donation_date: "2026-07-22", note: "General fund", recorded_by_id: "principal-1",
  donor_name: donor.name, category_name: paymentCategory.name,
};
const portalForm = {
  id: "portal-form-1", title: "Parent consent", description: "Annual trip permission", category: "Consent",
  fields_definition: [{ key: "consent", label: "I give consent", type: "radio", required: true, options: ["Yes", "No"] }],
  allow_multiple: false, visibility_scope: { all: true }, created_by_id: "principal-1", created_at: "2026-07-01T00:00:00Z",
};
const portalResponse = { id: "response-1", form_id: portalForm.id, student_id: student.id, student_name: student.name, response_data: { consent: "Yes" }, created_at: "2026-07-22T00:00:00Z" };
const credentialSendPayloads = [];
const studentUpdatePayloads = [];

async function ensureServer() {
  if (process.env.VISUAL_ISSUES_BASE_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "4174"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting the visual verification server");
}

function responseFor(pathname, request, persona = "principal") {
  if (pathname === "/api/v1/auth/me") return {
    user: persona === "teacher"
      ? { id: "teacher-user-1", username: "ustad.ahmed", role: "teacher", status: "active", preferred_language: "en", is_principal_delegate: true, selected_session_id: null }
      : { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
    madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
    permissions: persona === "teacher" ? ["academics.manage", "assignments.assign_teacher", "attendance.take", "assessments.marks.enter"] : [],
    features: {}, has_teaching_assignment: true,
  };
  if (pathname === "/api/v1/academics/today") return { gregorian: "22 Jul 2026", hijri: "7 Safar 1448 AH" };
  if (pathname === "/api/v1/academics/programs") return programs;
  if (pathname === "/api/v1/academics/classes") return classes;
  if (pathname === "/api/v1/academics/classes/class-1/sections") return sections;
  if (pathname === "/api/v1/academics/classes/class-1/courses" || pathname === "/api/v1/academics/courses") return courses;
  if (pathname === "/api/v1/academics/sessions") return sessions;
  if (pathname === "/api/v1/people/students") return [student];
  if (pathname === "/api/v1/people/students/student-1" && request.method() === "PUT") {
    const payload = JSON.parse(request.postData() ?? "{}");
    studentUpdatePayloads.push(payload);
    return {
      ...student,
      name: payload.admission_answers?.student_name ?? payload.name ?? student.name,
      admission_record: {
        ...student.admission_record,
        answers: { ...student.admission_record.answers, ...(payload.admission_answers ?? {}) },
      },
    };
  }
  if (pathname === "/api/v1/people/guardians") return [guardian];
  if (pathname === "/api/v1/people/students/student-1/guardians") return [guardian];
  if (pathname === "/api/v1/people/guardians/guardian-1/students") return [student];
  if (pathname === "/api/v1/people/teachers") return [];
  if (pathname === "/api/v1/attendance/classes") return attendanceClasses;
  if (pathname === "/api/v1/attendance/classes/class-1/roster") return {
    session_id: "session-1", session_name: "2026–27", class_id: "class-1", class_name: "Hifz Level 1", section_id: "section-1", section_name: "A",
    course: courses[0], timetable_slot: { id: "slot-1", period: 1, day_of_week: 1, start_time: "08:00:00", end_time: "09:00:00" },
    students: [{ id: student.id, admission_number: student.admission_number, name: student.name, section_id: "section-1", section_name: "A" }],
  };
  if (pathname.includes("/api/v1/attendance/classes/class-1") && pathname.endsWith("/history")) return { session_id: "session-1", session_name: "2026–27", class_id: "class-1", class_name: "Hifz Level 1", entries: [] };
  if (pathname === "/api/v1/operations/timetable") return timetableSlots;
  if (pathname === "/api/v1/operations/holidays") return [];
  if (pathname === "/api/v1/operations/admission-forms") return [admissionForm];
  if (pathname === "/api/v1/operations/admissions") return [application];
  if (pathname === "/api/v1/operations/admissions/application-1/convert" && request.method() === "POST") return {
    application: { ...application, status: "accepted", converted_student_id: student.id, converted_guardian_id: guardian.id, converted_by_id: "principal-1", converted_at: "2026-07-22T08:00:00Z" },
    student: { ...student, phone: "0300 1112233" },
    guardian,
    student_set_password_url: "/set-password?token=SECRET-CONVERT-STUDENT",
    guardian_set_password_url: "/set-password?token=SECRET-CONVERT-GUARDIAN",
    already_converted: false,
  };
  if (pathname === "/api/v1/operations/admin-notifications") return [{ id: "notification-1", event_type: "admission.converted", title: "Admission ready for review", message: "Ali Noor can now be converted to Student and Guardian records.", entity_type: "admission_application", entity_id: application.id, is_read: false, created_at: "2026-07-22T07:00:00Z" }];
  if (pathname === "/api/v1/messaging/send-credentials" && request.method() === "POST") {
    credentialSendPayloads.push(JSON.parse(request.postData() ?? "{}"));
    return { url: "https://wa.me/923211234505?text=credentials" };
  }
  if (pathname === "/api/v1/operations/announcements") return [{ id: "announcement-1", title: "Parent meeting", body: "Meeting after Asr prayer.", category: "General", attachment_link: null, audience_scope: { all: true }, publish_at: "2026-07-22T00:00:00Z", expires_at: null, created_at: "2026-07-20T00:00:00Z" }];
  if (pathname === "/api/v1/operations/forms") return [portalForm];
  if (pathname === "/api/v1/operations/form-responses") return [portalResponse];
  if (pathname === `/api/v1/operations/forms/${portalForm.id}/responses`) return [portalResponse];
  if (pathname === "/api/v1/finance/donors") return [donor];
  if (pathname === "/api/v1/finance/donations") return [donation];
  if (pathname === "/api/v1/finance/categories" || pathname === "/api/v1/finance/payment-categories") return [paymentCategory];
  if (pathname === "/api/v1/reporting/dashboard" && persona === "teacher") return {
    role: "teacher", my_classes: [{ class_id: "class-1", section_id: "section-1", course_id: "course-1", class_name: "Hifz Level 1", section_name: "A", course_name: "Quran Memorization" }],
    pending_submissions: 2, today_timetable: [{ course_id: "course-1", period: 1, start_time: "08:00", end_time: "09:00" }], today_attendance: null,
  };
  if (pathname === "/api/v1/assessments/grading-plan") return {
    id: "plan-1", course_id: "course-1", class_id: null, name: "Quran Memorization grading plan", assignment_weightage: 20,
    components: [{ id: "component-1", name: "Term exam", weightage: 50 }, { id: "component-2", name: "Oral assessment", weightage: 30 }],
    bands: [{ label: "A", min_score: 80, max_score: 100 }, { label: "B", min_score: 60, max_score: 79.99 }, { label: "C", min_score: 0, max_score: 59.99 }],
  };
  if (pathname === "/api/v1/finance/payments") return [];
  if (request.method() === "PATCH" && pathname === "/api/v1/auth/me") return responseFor("/api/v1/auth/me", request, persona).user;
  return [];
}

async function mockApi(context, preferredLanguage = "en", persona = "principal", seedToken = true) {
  await context.addInitScript(({ language }) => {
    localStorage.setItem("mms_tenant", "suffa");
    localStorage.setItem("i18nextLng", language);
  }, { language: preferredLanguage });
  if (seedToken) {
    await context.addInitScript(() => localStorage.setItem("mms_token", "visual-issues-token"));
  }
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body = pathname === "/api/v1/auth/token"
      ? { access_token: "visual-issues-token", token_type: "bearer" }
      : responseFor(pathname, request, persona);
    if (pathname === "/api/v1/auth/me" && request.method() === "GET") body = { ...body, user: { ...body.user, preferred_language: preferredLanguage } };
    await route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "X-Total-Count", "X-Total-Count": Array.isArray(body) ? String(body.length) : "0" },
      body: JSON.stringify(body),
    });
  });
}

async function newPage(browser, viewport, language = "en", persona = "principal") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "block" });
  await mockApi(context, language, persona);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return { context, page, errors };
}

async function open(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace").waitFor();
  await page.locator(".loading-screen").waitFor({ state: "hidden" }).catch(() => {});
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}

async function shot(page, name, locator = null) {
  const target = locator ?? page;
  await target.screenshot({ path: path.join(outputDir, name), animations: "disabled", ...(locator ? {} : { fullPage: false }) });
  console.log(`captured ${name}`);
}

async function desktopJourneys(browser) {
  const { context, page, errors } = await newPage(browser, { width: 1440, height: 1000 });
  await open(page, "/announcements");
  await page.locator(".inlineFilter").waitFor();
  await shot(page, "CURRENT-02_shared-inline-filter_desktop.png", page.locator(".modulePanel").first());

  await open(page, "/admission-forms");
  await page.locator(".inlineFilter").waitFor();
  await shot(page, "CURRENT-07_admission-inline-filter_desktop.png", page.locator(".modulePanel").first());
  await page.getByRole("button", { name: "Create form" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose admission form type" });
  await chooser.waitFor();
  await shot(page, "CURRENT-08_admission-form-type-chooser_desktop.png", chooser);
  await chooser.getByRole("button", { name: "General form" }).click();
  const builder = page.getByRole("dialog", { name: "Create form" });
  await builder.getByRole("button", { name: "Add field" }).click();
  await builder.locator('label:has-text("Type") select:not(:disabled)').last().selectOption("radio");
  await builder.getByRole("textbox", { name: "Option 1" }).last().fill("North campus");
  await builder.getByRole("textbox", { name: "Option 2" }).last().fill("South campus");
  await builder.getByRole("button", { name: "Add option" }).last().click();
  await builder.getByRole("textbox", { name: "Option 3" }).last().fill("Online");
  await shot(page, "CURRENT-09_CURRENT-14_spaced-option-repeater-modal_desktop.png", builder);

  await open(page, "/assessments/setup");
  await page.getByLabel("Course").selectOption("course-1");
  await page.getByLabel("Scheme name").waitFor();
  await page.getByLabel("Scheme name").evaluate((input) => {
    if (input.value !== "Quran Memorization grading plan") throw new Error(`Unexpected grading plan name: ${input.value}`);
  });
  await shot(page, "CURRENT-13_grading-plan_desktop.png", page.locator(".gradingSetupLayout"));

  await open(page, "/attendance");
  await page.locator(".attendanceClassButton").first().click();
  await page.locator(".attendancePeriodFilter").waitFor();
  await page.getByLabel("Course").selectOption("course-1");
  await page.getByLabel("Period").selectOption("slot-1");
  await page.getByText("Ali Noor").waitFor();
  await shot(page, "CURRENT-10_CURRENT-15_teacher-attendance-course-period_desktop.png", page.locator(".attendancePanel").first());

  await open(page, "/people/students");
  await page.getByRole("button", { name: "Add student" }).click();
  let dialog = page.getByRole("dialog", { name: "Add student" });
  await dialog.getByLabel("Admission form").selectOption("form-1");
  await dialog.getByLabel("Previous madrasa").waitFor();
  await shot(page, "CURRENT-20_add-student-admission-template_desktop.png", dialog);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Actions: Ali Noor" }).click();
  await page.getByRole("menuitem", { name: "View" }).click();
  dialog = page.getByRole("dialog", { name: "Student details" });
  await dialog.getByText("Hifz Level 1 / A").waitFor();
  if (await dialog.getByRole("button", { name: /^Assign class$/i }).count()) throw new Error("Active enrollment still exposes Assign class in Student details");
  await dialog.getByRole("button", { name: /Unassign class/i }).waitFor();
  await shot(page, "CURRENT-03_CURRENT-04_CURRENT-19_student-details-enrollment_desktop.png", dialog);
  studentUpdatePayloads.length = 0;
  await dialog.getByRole("button", { name: "Edit" }).click();
  const editStudentDialog = page.getByRole("dialog", { name: "Edit Student" });
  await editStudentDialog.getByText("2027 Hifz admission").waitFor();
  await editStudentDialog.getByLabel("Student name").waitFor();
  await editStudentDialog.getByLabel("Guardian name").waitFor();
  await editStudentDialog.getByLabel("Previous madrasa").fill("Updated Dar-ul-Ilm");
  await shot(page, "CURRENT-19_student-edit-admission-fields_desktop.png", editStudentDialog);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/v1/people/students/student-1") && response.request().method() === "PUT"),
    editStudentDialog.getByRole("button", { name: "Save" }).click(),
  ]);
  const [studentUpdate] = studentUpdatePayloads;
  if (studentUpdate?.admission_answers?.previous_madrasa !== "Updated Dar-ul-Ilm") {
    throw new Error(`Student edit did not submit admission answers: ${JSON.stringify(studentUpdate)}`);
  }
  if (studentUpdate.admission_answers.student_name !== "Ali Noor" || studentUpdate.admission_answers.guardian_name !== "Shaikh Noor") {
    throw new Error(`Student edit dropped built-in admission fields: ${JSON.stringify(studentUpdate.admission_answers)}`);
  }
  await open(page, "/people/guardians");
  await page.getByRole("button", { name: "Actions: Shaikh Noor" }).click();
  await page.getByRole("menuitem", { name: "View" }).click();
  dialog = page.getByRole("dialog", { name: "Shaikh Noor" });
  await dialog.getByText("Linked Students").waitFor();
  await shot(page, "CURRENT-05_guardian-details_desktop.png", dialog);

  await open(page, "/admissions");
  await page.getByText("Admission ready for review").waitFor();
  await shot(page, "CURRENT-18_application-actions-notification_desktop.png", page.locator(".modulePanel").first());
  await page.getByRole("button", { name: "Actions: Ali Noor" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit application" });
  await shot(page, "CURRENT-18_application-edit-modal_desktop.png", dialog);
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Actions: Ali Noor" }).click();
  await page.getByRole("menuitem", { name: "Accept and create people" }).click();
  dialog = page.getByRole("dialog", { name: "Accept application" });
  credentialSendPayloads.length = 0;
  await dialog.getByLabel("Student username").fill("ali.converted");
  await dialog.getByLabel("Guardian username").fill("shaikh.converted");
  await dialog.getByLabel("Student delivery target").selectOption("0300 1112233");
  await dialog.getByLabel("Guardian delivery target").selectOption("0321 1234506");
  await dialog.getByLabel("Session").selectOption("session-1");
  await dialog.getByLabel("Class").selectOption("class-1");
  await dialog.getByLabel("Section").selectOption("section-1");
  await shot(page, "CURRENT-18_conversion-review-wizard_desktop.png", dialog);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/v1/operations/admissions/application-1/convert") && response.request().method() === "POST"),
    page.waitForResponse((response) => response.url().endsWith("/api/v1/messaging/send-credentials") && response.request().method() === "POST"),
    dialog.getByRole("button", { name: "Accept and create people" }).click(),
  ]);
  await dialog.getByText("Credential delivery").waitFor();
  await dialog.getByText("Login link sent successfully").first().waitFor();
  if (credentialSendPayloads.length !== 2) throw new Error(`Expected two credential sends after conversion, saw ${credentialSendPayloads.length}`);
  const studentSend = credentialSendPayloads.find((payload) => payload.subject_type === "student");
  const guardianSend = credentialSendPayloads.find((payload) => payload.subject_type === "guardian");
  if (studentSend?.phone_number !== "0300 1112233") throw new Error(`Student delivery target was not preserved: ${JSON.stringify(studentSend)}`);
  if (guardianSend?.phone_number !== "0321 1234506") throw new Error(`Guardian delivery target was not preserved: ${JSON.stringify(guardianSend)}`);
  const conversionText = await dialog.innerText();
  if (conversionText.includes("SECRET-CONVERT")) throw new Error("Conversion setup token leaked into visible UI text");
  await shot(page, "CURRENT-18_conversion-credential-delivery_desktop.png", dialog);
  await dialog.getByRole("button", { name: "Done" }).click();

  await open(page, "/people/donators");
  await page.getByPlaceholder("Search donor name or contact").fill("0300");
  await page.getByText("Abdul Kareem").waitFor();
  await shot(page, "CURRENT-06_donor-search_desktop.png", page.locator(".modulePanel").first());

  await open(page, "/finance/donations");
  await page.getByLabel("Search donations").waitFor();
  await page.getByLabel("Donor").selectOption(donor.id);
  await page.getByLabel("Category").selectOption(paymentCategory.id);
  await page.getByLabel("From").fill("2026-07-01");
  const filteredResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/v1/finance/donations"
      && url.searchParams.get("donor_id") === donor.id
      && url.searchParams.get("category_id") === paymentCategory.id
      && url.searchParams.get("date_from") === "2026-07-01"
      && url.searchParams.get("date_to") === "2026-07-31";
  });
  await page.getByLabel("To").fill("2026-07-31");
  await filteredResponse;
  await page.getByRole("button", { name: "Clear filters" }).waitFor();
  const donorCell = page.locator('.financeTable .dataRow:not(.header) span[data-label="Donor"]');
  await page.getByLabel("Search donations").fill("not present");
  await donorCell.waitFor({ state: "hidden" });
  await page.getByLabel("Search donations").fill("Abdul");
  await donorCell.waitFor();
  const financePanel = page.locator(".modulePanel").first();
  const financeOverflow = await financePanel.evaluate((element) => element.scrollWidth - element.clientWidth);
  if (financeOverflow > 1) throw new Error(`Finance desktop panel overflows by ${financeOverflow}px`);
  await shot(page, "CURRENT-21_finance-filters_desktop.png", financePanel);
  await page.getByRole("button", { name: "Clear filters" }).click();
  for (const label of ["Search donations", "Donor", "Category", "From", "To"]) {
    const value = await page.getByLabel(label).inputValue();
    if (value !== "") throw new Error(`Clear filters left ${label} set to ${value}`);
  }

  await open(page, "/forms");
  await page.getByRole("tab", { name: "Responses" }).click();
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "View response" }).click();
  const responseDialog = page.getByRole("dialog", { name: "Submitted response" });
  await responseDialog.getByText("I give consent").waitFor();
  await shot(page, "CURRENT-16_form-response-actions-viewer_desktop.png", responseDialog);

  await context.close();
  return errors;
}

async function teacherJourneys(browser) {
  const { context, page, errors } = await newPage(browser, { width: 1440, height: 1000 }, "en", "teacher");
  await open(page, "/dashboard");
  await page.getByText("Hifz Level 1 / A").waitFor();
  await shot(page, "CURRENT-01_teacher-dashboard_desktop.png");
  await open(page, "/academics/courses");
  await page.getByText("Quran Memorization").waitFor();
  if (await page.getByText("permission_required").count()) throw new Error("Delegated Academics still renders permission_required");
  await shot(page, "CURRENT-11_delegated-academics_desktop.png", page.locator(".modulePanel").first());
  await context.close();
  return errors;
}

async function mobileUrduJourneys(browser) {
  const { context, page, errors } = await newPage(browser, { width: 390, height: 844 }, "ur");
  await open(page, "/announcements");
  await page.locator(".inlineFilter").waitFor();
  await shot(page, "CURRENT-02_shared-inline-filter_mobile-urdu.png");
  await open(page, "/admission-forms");
  await page.getByRole("button", { name: /فارم/ }).filter({ has: page.locator("svg") }).first().click();
  const chooser = page.getByRole("dialog");
  await chooser.waitFor();
  const modalCard = chooser.locator(".modalCard");
  await shot(page, "CURRENT-08_rounded-modal_mobile-urdu.png", modalCard);
  const geometry = await modalCard.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, radius: style.borderRadius, overflow: style.overflow };
  });
  if (geometry.left < 0 || geometry.right > 390 || geometry.radius === "0px" || geometry.overflow !== "hidden") {
    throw new Error(`Mobile modal geometry failed: ${JSON.stringify(geometry)}`);
  }
  await context.close();
  return errors;
}

async function mobileFinanceJourney(browser) {
  const { context, page, errors } = await newPage(browser, { width: 390, height: 844 });
  await open(page, "/finance/donations");
  await page.getByLabel("Search donations").waitFor();
  const toolbar = page.locator(".financeRecordToolbar");
  const geometry = await toolbar.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  if (geometry.left < 0 || geometry.right > 390 || geometry.scrollWidth > geometry.clientWidth + 1) {
    throw new Error(`Finance mobile toolbar geometry failed: ${JSON.stringify(geometry)}`);
  }
  await page.locator('.financeTable .dataRow:not(.header) span[data-label="Donor"]').waitFor();
  await shot(page, "CURRENT-21_finance-filters_mobile.png");
  await context.close();
  return errors;
}

async function tabletFinanceJourney(browser) {
  const { context, page, errors } = await newPage(browser, { width: 700, height: 900 });
  await open(page, "/finance/donations");
  await page.getByLabel("Search donations").waitFor();
  const geometry = await page.locator(".tableResponsive").evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  if (geometry.scrollWidth > geometry.clientWidth + 1) {
    throw new Error(`Finance tablet table clips: ${JSON.stringify(geometry)}`);
  }
  await context.close();
  return errors;
}

async function loginRedirectJourney(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  await mockApi(context, "en", "principal", false);
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Madrasa ID").fill("suffa");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("diagnostic-password");
  await page.locator('form.login-form button[type="submit"]').click();
  await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 10_000 });
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await context.close();
  return [];
}

await mkdir(outputDir, { recursive: true });
await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  const errors = [...await desktopJourneys(browser), ...await teacherJourneys(browser), ...await mobileUrduJourneys(browser), ...await mobileFinanceJourney(browser), ...await tabletFinanceJourney(browser), ...await loginRedirectJourney(browser)];
  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log("visual issue verification: all scripted journeys passed");
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
