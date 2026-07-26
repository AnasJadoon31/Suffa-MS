import { chromium } from "@playwright/test";
import { ensureViteServer } from "./lib/vite-server.mjs";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4192";
const viewport = process.env.TEST_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };

const classes = [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true }];
const sections = [{ id: "section-1", class_id: "class-1", name: "Alif" }, { id: "section-2", class_id: "class-1", name: "Bay" }];
const courses = [{ id: "course-1", name: "Nazra" }];
const teachers = [{ id: "teacher-1", user_id: "user-teacher-1", employee_code: "TCH-0001", name: "Ustad Ahmad", whatsapp_number: "+923001111111", qualifications: null, join_date: "2026-01-01", status: "active", notes: null, created_at: "2026-01-01T00:00:00Z" }];
const students = [
  { id: "student-1", user_id: "user-student-1", admission_number: "ADM-0001", name: "Ali Noor", date_of_birth: "2017-12-01", status: "active", notes: null, portal_enabled: true, username: "ali.noor", class_name: "Hifz Level 1", created_at: "2026-01-01T00:00:00Z" },
  { id: "student-2", user_id: "user-student-2", admission_number: "ADM-0002", name: "Demo Student", date_of_birth: "2017-12-02", status: "active", notes: null, portal_enabled: true, username: "demo.student", class_name: "Hifz Level 1", created_at: "2026-01-01T00:00:00Z" },
];
const guardians = [{ id: "guardian-1", user_id: "user-guardian-1", name: "Sara Guardian", relationship: "mother", phone_numbers: "+923001111112", preferred_language: "en", created_at: "2026-01-01T00:00:00Z" }];
const forms = [
  { id: "form-1", title: "Daily check", description: "", category: "survey", fields_definition: [{ key: "mood", label: "Mood", type: "text", required: false, options: [] }], visibility_scope: { all: true }, open_from: null, open_until: null, allow_multiple: true, created_by_id: "principal-1", created_at: "2026-01-01T00:00:00Z" },
  { id: "form-2", title: "Guardian feedback", description: "", category: "feedback", fields_definition: [{ key: "notes", label: "Notes", type: "text", required: false, options: [] }], visibility_scope: { roles: ["parent"], classes: ["class-1"] }, open_from: null, open_until: null, allow_multiple: true, created_by_id: "principal-1", created_at: "2026-01-01T00:00:00Z" },
];
const responses = [
  { id: "response-1", form_id: "form-1", student_id: "student-1", student_name: "Ali Noor", teacher_id: null, teacher_name: null, guardian_id: null, guardian_name: null, ward_id: null, ward_name: null, submitted_by_id: "user-student-1", submitted_by_name: "Ali Noor", submitted_by_role: "student", response_data: { mood: "Ready" }, created_at: "2026-07-26T09:00:00Z" },
  { id: "response-2", form_id: "form-2", student_id: null, student_name: null, teacher_id: null, teacher_name: null, guardian_id: "guardian-1", guardian_name: "Sara Guardian", ward_id: "student-1", ward_name: "Ali Noor", submitted_by_id: "user-guardian-1", submitted_by_name: "Sara Guardian", submitted_by_role: "parent", response_data: { notes: "Needs transport" }, created_at: "2026-07-26T10:00:00Z" },
];

const formQueries = [];
const responseQueries = [];

await ensureViteServer({ baseUrl, port: 4192 });

function paramsObject(searchParams) {
  return Object.fromEntries([...searchParams.entries()].filter(([key]) => !["limit", "offset"].includes(key)));
}

function matchesFilters(row, searchParams) {
  const form = forms.find((item) => item.id === row.form_id);
  const scope = form?.visibility_scope ?? {};
  const classId = searchParams.get("class_id");
  const sectionId = searchParams.get("section_id");
  const courseId = searchParams.get("course_id");
  const studentId = searchParams.get("student_id");
  const respondentUserId = searchParams.get("respondent_user_id");
  const respondentRole = searchParams.get("respondent_role");
  if (searchParams.get("form_id") && row.form_id !== searchParams.get("form_id")) return false;
  if (respondentUserId && row.submitted_by_id !== respondentUserId) return false;
  if (studentId && row.student_id !== studentId && row.ward_id !== studentId) return false;
  if (respondentRole && row.submitted_by_role !== respondentRole) return false;
  if (classId && !(scope.all || scope.classes?.includes(classId))) return false;
  if (sectionId && !(scope.all || scope.sections?.includes(sectionId) || scope.classes?.includes("class-1"))) return false;
  if (courseId && !(scope.all || scope.courses?.includes(courseId) || scope.classes?.includes("class-1"))) return false;
  return true;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "forms-responses-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const pathname = url.pathname;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["forms.create", "forms.manage_all", "forms.responses.view"],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/academics/classes") {
    body = classes;
  } else if (pathname === "/api/v1/academics/classes/class-1/sections") {
    body = sections;
  } else if (pathname === "/api/v1/academics/classes/class-1/courses") {
    body = courses;
  } else if (pathname === "/api/v1/people/students") {
    body = students;
  } else if (pathname === "/api/v1/people/teachers") {
    body = teachers;
  } else if (pathname === "/api/v1/people/guardians") {
    body = guardians;
  } else if (pathname === "/api/v1/operations/forms") {
    formQueries.push(paramsObject(url.searchParams));
    body = forms.filter((form) => {
      const userId = url.searchParams.get("user_id");
      const isSaraGuardian = userId === "user-guardian-1";
      if (url.searchParams.get("category") && form.category !== url.searchParams.get("category")) return false;
      if (url.searchParams.get("audience_role") && !(form.visibility_scope.all || form.visibility_scope.roles?.includes(url.searchParams.get("audience_role")))) return false;
      if (url.searchParams.get("class_id") && !(form.visibility_scope.all || form.visibility_scope.classes?.includes(url.searchParams.get("class_id")))) return false;
      if (url.searchParams.get("course_id") && !(form.visibility_scope.all || form.visibility_scope.courses?.includes(url.searchParams.get("course_id")) || form.visibility_scope.classes?.includes("class-1"))) return false;
      if (userId && !(
        form.visibility_scope.all ||
        form.visibility_scope.users?.includes(userId) ||
        (isSaraGuardian && (!form.visibility_scope.roles || form.visibility_scope.roles.includes("parent")) && form.visibility_scope.classes?.includes("class-1"))
      )) return false;
      return true;
    });
  } else if (pathname === "/api/v1/operations/form-responses") {
    responseQueries.push(paramsObject(url.searchParams));
    body = responses.filter((row) => matchesFilters(row, url.searchParams));
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: {
      "Access-Control-Expose-Headers": "X-Total-Count",
      "X-Total-Count": Array.isArray(body) ? String(body.length) : "0",
    },
    body: JSON.stringify(body),
  });
});

try {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/forms`, { waitUntil: "domcontentloaded" });
  await page.getByText("Daily check").waitFor();

  await page.getByLabel("All roles").selectOption("parent");
  await page.getByLabel("All classes").selectOption("class-1");
  await page.getByLabel("All courses").selectOption("course-1");
  await page.getByLabel("Specific person").fill("Sara");
  await page.getByRole("button", { name: /Sara Guardian/ }).click();
  await page.waitForFunction(() => document.body.textContent?.includes("Guardian feedback"));

  const latestFormQuery = formQueries.at(-1) ?? {};
  for (const [key, value] of Object.entries({ audience_role: "parent", class_id: "class-1", course_id: "course-1", user_id: "user-guardian-1" })) {
    if (latestFormQuery[key] !== value) {
      throw new Error(`forms filter did not send ${key}=${value}; saw ${JSON.stringify(latestFormQuery)}`);
    }
  }

  if (await page.getByRole("button", { name: /Ali Noor/ }).isVisible().catch(() => false)) {
    throw new Error("search dropdown did not filter typed people query down to Sara Guardian");
  }

  await page.getByRole("tab", { name: "Responses" }).click();
  await page.getByText("Sara Guardian").waitFor();
  await page.getByLabel("Respondent").fill("Sara");
  await page.getByRole("button", { name: /Sara Guardian/ }).click();
  await page.getByLabel("Student / ward").fill("Ali");
  await page.getByRole("button", { name: /Ali Noor/ }).click();
  await page.getByLabel("All classes").selectOption("class-1");
  await page.getByLabel("All courses").selectOption("course-1");
  await page.getByText("Sara Guardian").waitFor();
  await page.getByText("Ali Noor").waitFor();

  const latestResponseQuery = responseQueries.at(-1) ?? {};
  for (const [key, value] of Object.entries({ respondent_user_id: "user-guardian-1", student_id: "student-1", class_id: "class-1", course_id: "course-1" })) {
    if (latestResponseQuery[key] !== value) {
      throw new Error(`responses filter did not send ${key}=${value}; saw ${JSON.stringify(latestResponseQuery)}`);
    }
  }

  await page.getByRole("button", { name: "Actions" }).first().click();
  await page.getByRole("menuitem", { name: "View response" }).click();
  await page.getByText("Needs transport").waitFor();

  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    rawStudentIdInputs: [...document.querySelectorAll("input")].filter((input) => /student id/i.test(input.placeholder ?? "")).length,
    searchDropdowns: document.querySelectorAll(".searchDropdown").length,
  }));
  if (geometry.scrollWidth > geometry.width) {
    throw new Error(`forms/responses page overflowed: ${JSON.stringify(geometry)}`);
  }
  if (geometry.rawStudentIdInputs > 0) {
    throw new Error("responses filters still render a raw Student ID input");
  }
  if (geometry.searchDropdowns < 2) {
    throw new Error(`forms/responses filters did not render searchable dropdowns: ${JSON.stringify(geometry)}`);
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("forms responses: searchable audience/response filters and guardian ward query wiring passed");
} finally {
  await context.close();
  await browser.close();
}
