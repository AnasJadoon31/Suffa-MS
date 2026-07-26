import { chromium } from "@playwright/test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const viewport = process.env.TEST_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };

const classes = [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true }];
const sections = [{ id: "section-1", class_id: "class-1", name: "Alif" }, { id: "section-2", class_id: "class-1", name: "Bay" }];
const courses = [{ id: "course-1", name: "Quran Memorization" }];
const teachers = [{ id: "teacher-1", user_id: "teacher-user-1", employee_code: "TCH-0001", name: "Ustad Ahmad", whatsapp_number: "+923001111111", qualifications: null, join_date: null, status: "active", notes: null, created_at: "2026-07-26T00:00:00Z" }];
let assignments = [];

function readAssignment(row) {
  return {
    ...row,
    class_name: "Hifz Level 1",
    course_name: "Quran Memorization",
    teacher_name: "Ustad Ahmad",
    submission_file_key: null,
    submission_mark: null,
    submission_feedback: null,
    submitted_at: null,
  };
}

function listAssignments(searchParams) {
  const sectionId = searchParams.get("section_id");
  const rows = sectionId
    ? assignments.filter((assignment) => assignment.section_id === sectionId)
    : assignments.filter((assignment, index, arr) => (
      !assignment.batch_id || arr.findIndex((row) => row.batch_id === assignment.batch_id) === index
    ));
  return rows.map((assignment) => readAssignment({
    ...assignment,
    section_name: sectionId
      ? sections.find((section) => section.id === assignment.section_id)?.name ?? null
      : assignment.batch_id
        ? sections
          .filter((section) => assignments.some((row) => row.batch_id === assignment.batch_id && row.section_id === section.id))
          .map((section) => section.name)
          .join(", ")
        : null,
  }));
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "assignment-batch-test-token");
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
      permissions: ["assignments.create", "assignments.manage_all", "students.view"],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/academics/classes") {
    body = classes;
  } else if (pathname === "/api/v1/academics/classes/class-1/courses") {
    body = courses;
  } else if (pathname === "/api/v1/academics/classes/class-1/sections") {
    body = sections;
  } else if (pathname === "/api/v1/people/students") {
    body = [];
  } else if (pathname === "/api/v1/people/teachers") {
    body = teachers;
  } else if (pathname === "/api/v1/assessments/assignments" && request.method() === "GET") {
    body = listAssignments(url.searchParams);
  } else if (pathname === "/api/v1/assessments/assignments" && request.method() === "POST") {
    const payload = request.postDataJSON();
    const batchId = "batch-1";
    assignments = payload.section_ids.map((sectionId, index) => ({
      id: `assignment-${index + 1}`,
      class_id: payload.class_id,
      section_id: sectionId,
      course_id: payload.course_id,
      title: payload.title,
      category: payload.category ?? null,
      instructions: payload.instructions,
      attachment_key: payload.attachment_key ?? null,
      due_date: payload.due_date,
      max_marks: payload.max_marks ?? null,
      weightage: payload.weightage ?? null,
      target_student_ids: null,
      created_by_id: "teacher-1",
      batch_id: batchId,
      created_at: "2026-07-26T00:00:00Z",
    }));
    body = assignments.map((assignment) => readAssignment({
      ...assignment,
      section_name: sections.find((section) => section.id === assignment.section_id)?.name ?? null,
    }));
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
  await page.goto(`${baseUrl}/assessments/assignments`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create assignment" }).click();
  const dialog = page.getByRole("dialog", { name: "Create assignment" });
  await dialog.locator("select").nth(0).selectOption("class-1");
  await dialog.locator("select").nth(1).selectOption("course-1");
  await dialog.getByLabel("Alif").check();
  await dialog.getByLabel("Bay").check();
  await dialog.getByLabel("Title").fill("Shared section homework");
  await dialog.getByLabel("Category").fill("Homework");
  await dialog.getByLabel("Instructions").fill("One logical assignment for both sections.");
  await dialog.getByLabel("Due date").fill("2027-01-15");
  await dialog.getByRole("button", { name: "Create assignment" }).click();
  await dialog.waitFor({ state: "hidden" });

  const sharedRows = page.locator(".dataRow", { hasText: "Shared section homework" });
  await sharedRows.first().waitFor();
  if (await sharedRows.count() !== 1) {
    throw new Error(`multi-section batch rendered duplicate overview rows: ${await sharedRows.count()}`);
  }
  await page.getByText("Alif, Bay").waitFor();

  await page.locator("select").nth(0).selectOption("class-1");
  await page.locator("select").nth(1).selectOption("section-2");
  await page.locator(".dataRow", { hasText: "Hifz Level 1 / Bay" }).waitFor();
  const filteredRows = page.locator(".dataRow", { hasText: "Shared section homework" });
  if (await filteredRows.count() !== 1) {
    throw new Error(`section-filtered view did not show exactly one section copy: ${await filteredRows.count()}`);
  }
  if (await page.getByText("Alif, Bay").isVisible().catch(() => false)) {
    throw new Error("section-filtered view still showed the combined batch label");
  }

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (geometry.scrollWidth > geometry.clientWidth) {
    throw new Error(`assignment batch page overflowed: ${JSON.stringify(geometry)}`);
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("assignment batch: multi-section create collapses overview and preserves section filter passed");
} finally {
  await context.close();
  await browser.close();
}
