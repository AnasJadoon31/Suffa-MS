import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:5173";
const artifactDir = path.join("artifacts", "issue-verification");
let server;

const classes = [{ id: "class-1", program_id: "program-1", name: "Hifz Level 1", default_portal_enabled: true, assignment_limit: 8 }];
const courses = [{ id: "course-1", name: "Quran Memorization" }, { id: "course-2", name: "Tajweed" }];
const teacher = { id: "teacher-1", user_id: "teacher-user-1", employee_code: "T-001", name: "Ustad Ahmad", whatsapp_number: "0300 0000000", qualifications: null, join_date: null, status: "active", notes: null, created_at: "2026-07-01T00:00:00Z" };
const student = { id: "student-1", user_id: "student-user-1", admission_number: "ADM-001", name: "Ali Noor", date_of_birth: "2014-02-01", status: "active", portal_enabled: true, notes: null, created_at: "2026-07-01T00:00:00Z", is_independent: false };
const assignment = {
  id: "assignment-1",
  class_id: "class-1",
  section_id: "section-1",
  course_id: "course-1",
  title: "Weekly memorization",
  category: "Homework",
  instructions: "Revise sabaq and prepare oral check.",
  attachment_key: "assignments/week-1.pdf",
  due_date: "2026-07-25",
  max_marks: 100,
  weightage: 20,
  target_student_ids: null,
  created_by_id: "principal-1",
  batch_id: null,
  created_at: "2026-07-20T00:00:00Z",
  class_name: "Hifz Level 1",
  section_name: "A",
  course_name: "Quran Memorization",
  teacher_name: teacher.name,
};
const submission = {
  id: "submission-1",
  assignment_id: assignment.id,
  student_id: student.id,
  student_name: student.name,
  submitted_at: "2026-07-24T09:30:00Z",
  file_key: "submissions/ali-week-1.pdf",
  mark: 88,
  feedback: "Strong recitation; revise pauses.",
  is_late: false,
};
const resultsMatrix = {
  session_id: "session-1",
  sections: [{
    class_id: "class-1",
    class_name: "Hifz Level 1",
    section_id: "section-1",
    section_name: "A",
    courses: [
      {
        course_id: "course-1",
        course_name: "Quran Memorization",
        teacher_name: teacher.name,
        exam_types: [{ id: "exam-type-1", name: "Term exam", weightage: 50 }, { id: "exam-type-2", name: "Oral assessment", weightage: 50 }],
      },
      {
        course_id: "course-2",
        course_name: "Tajweed",
        teacher_name: teacher.name,
        exam_types: [{ id: "exam-type-3", name: "Makharij", weightage: 100 }],
      },
    ],
    students: [{
      student_id: student.id,
      name: student.name,
      admission_number: student.admission_number,
      overall_score: 86,
      courses: [
        { course_id: "course-1", raw_score: 86, band: "A", marks: [{ exam_type_id: "exam-type-1", score: 42 }, { exam_type_id: "exam-type-2", score: 44 }] },
        { course_id: "course-2", raw_score: 91, band: "A", marks: [{ exam_type_id: "exam-type-3", score: 91 }] },
      ],
    }],
  }],
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function ensureServer() {
  if (process.env.APP_URL) return;
  server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", "5173"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting assessment mobile cards verification server");
}

async function mockApi(context) {
  await context.addInitScript(() => {
    localStorage.setItem("mms_token", "assessment-mobile-card-token");
    localStorage.setItem("mms_tenant", "suffa");
  });
  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let body = [];
    if (pathname === "/api/v1/auth/me") {
      body = {
        user: { id: "principal-1", username: "admin", role: "principal", status: "active", preferred_language: "en", is_principal_delegate: false, selected_session_id: null, has_teaching_assignment: true },
        madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
        permissions: [],
        features: {},
        has_teaching_assignment: true,
      };
    } else if (pathname === "/api/v1/academics/today") {
      body = { gregorian: "17 Jul 2026", hijri: "2 Safar 1448 AH" };
    } else if (pathname === "/api/v1/academics/classes") {
      body = classes;
    } else if (pathname === "/api/v1/academics/classes/class-1/courses" || pathname === "/api/v1/academics/courses") {
      body = courses;
    } else if (pathname === "/api/v1/academics/sessions") {
      body = [{ id: "session-1", name: "2026-27", is_active: true }];
    } else if (pathname === "/api/v1/people/students") {
      body = [student];
    } else if (pathname === "/api/v1/operations/timetable") {
      body = [];
    } else if (pathname === "/api/v1/assessments/assignments") {
      body = [assignment];
    } else if (pathname === "/api/v1/assessments/assignments/assignment-1/submissions") {
      body = [submission];
    } else if (pathname === "/api/v1/files/presign-download") {
      body = { url: "https://example.test/submission.pdf" };
    } else if (pathname === "/api/v1/assessments/grading-schemes") {
      body = [];
    } else if (pathname === "/api/v1/assessments/exam-types") {
      body = [];
    } else if (pathname === "/api/v1/assessments/results/matrix") {
      body = resultsMatrix;
    } else if (pathname === "/api/v1/assessments/marks" && request.method() === "PUT") {
      body = { ok: true };
    } else if (pathname === "/api/v1/assessments/submissions/submission-1/grade" && request.method() === "PUT") {
      body = { ...submission, mark: 89 };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Expose-Headers": "X-Total-Count", "X-Total-Count": Array.isArray(body) ? String(body.length) : "0" },
      body: JSON.stringify(body),
    });
  });
}

async function openAssessmentRoute(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.getByLabel("Class").selectOption("class-1");
  await page.locator(".assessmentMobileCard").first().waitFor({ state: "visible", timeout: 10_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function assertMobileAssessmentCards(page, label) {
  const state = await page.evaluate(() => {
    const doc = document.documentElement;
    const visibleTables = [...document.querySelectorAll("table")].filter((table) => {
      const rect = table.getBoundingClientRect();
      const style = getComputedStyle(table);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    });
    const clippedCards = [...document.querySelectorAll(".assessmentMobileCard, .assessmentMobileCard *")].filter((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(element);
      return style.overflowX === "hidden" && element.scrollWidth > element.clientWidth + 1;
    });
    const smallTargets = [...document.querySelectorAll(".assessmentMobileCard button, .assessmentMobileCard input, .assessmentMobileCard select")].filter((element) => {
      const style = getComputedStyle(element);
      if (element.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    });
    return {
      cards: document.querySelectorAll(".assessmentMobileCard").length,
      tables: visibleTables.length,
      clipped: clippedCards.length,
      smallTargets: smallTargets.length,
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
    };
  });
  requireValue(state.cards > 0, `${label}: no mobile assessment cards rendered`);
  requireValue(state.tables === 0, `${label}: visible table rendered on mobile`);
  requireValue(state.clipped === 0, `${label}: clipped card content ${JSON.stringify(state)}`);
  requireValue(state.smallTargets === 0, `${label}: touch target under 44px ${JSON.stringify(state)}`);
  requireValue(state.scrollWidth <= state.clientWidth + 1, `${label}: horizontal overflow ${JSON.stringify(state)}`);
}

async function openSubmissionPanel(page) {
  await page.goto(`${baseUrl}/assessments/assignments`, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace").waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".loading-screen").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.getByText(assignment.title).waitFor({ state: "visible", timeout: 10_000 });
  await page.getByRole("button", { name: `Actions: ${assignment.title}` }).click();
  await page.getByRole("menuitem", { name: "Submissions" }).click();
  await page.getByText(`Submissions — ${assignment.title}`).waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(".submissionGradeField").waitFor({ state: "visible", timeout: 10_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function assertSubmissionMobileCard(page) {
  const state = await page.evaluate(() => {
    const doc = document.documentElement;
    const row = document.querySelector(".submissionGradeField")?.closest(".dataRow");
    if (!row) return { missing: true };
    const visibleTables = [...document.querySelectorAll("table")].filter((table) => {
      const rect = table.getBoundingClientRect();
      const style = getComputedStyle(table);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden";
    });
    const fields = [...row.querySelectorAll(":scope > span, :scope > div")].map((field) => ({
      text: field.textContent?.trim() ?? "",
      label: field.getAttribute("data-label")?.trim() ?? "",
      width: field.getBoundingClientRect().width,
      scrollWidth: field.scrollWidth,
      clientWidth: field.clientWidth,
    }));
    const smallTargets = [...row.querySelectorAll("button, input, textarea, select, .MuiInputBase-root")].filter((element) => {
      const style = getComputedStyle(element);
      if (element.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    });
    return {
      missing: false,
      display: getComputedStyle(row).display,
      fields,
      tables: visibleTables.length,
      smallTargets: smallTargets.length,
      clientWidth: doc.clientWidth,
      scrollWidth: doc.scrollWidth,
      markWidth: row.querySelector(".submissionGradeField input")?.getBoundingClientRect().width ?? 0,
      feedbackWidth: row.querySelector(".submissionGradeField textarea")?.getBoundingClientRect().width ?? 0,
    };
  });
  requireValue(!state.missing, "submissions: mobile submission row missing");
  requireValue(state.display === "flex", `submissions: row is not a mobile card (${state.display})`);
  requireValue(state.tables === 0, "submissions: visible table rendered on mobile");
  requireValue(state.fields.every((field) => field.label || !field.text), `submissions: field missing data-label ${JSON.stringify(state.fields)}`);
  requireValue(state.fields.every((field) => field.scrollWidth <= field.clientWidth + 1), `submissions: clipped field ${JSON.stringify(state.fields)}`);
  requireValue(state.smallTargets === 0, `submissions: touch target under 44px ${JSON.stringify(state)}`);
  requireValue(state.markWidth >= 120 && state.feedbackWidth >= 120, `submissions: grading controls are cramped ${JSON.stringify(state)}`);
  requireValue(state.scrollWidth <= state.clientWidth + 1, `submissions: horizontal overflow ${JSON.stringify(state)}`);
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
try {
  await fs.mkdir(artifactDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await mockApi(context);
  const page = await context.newPage();

  await openAssessmentRoute(page, "/assessments/grading");
  await assertMobileAssessmentCards(page, "grading");
  await page.screenshot({ path: path.join(artifactDir, "CURRENT-PWA_assessment-grading-cards_mobile.png"), fullPage: false, animations: "disabled" });

  await openAssessmentRoute(page, "/assessments/results");
  await assertMobileAssessmentCards(page, "results");
  await page.screenshot({ path: path.join(artifactDir, "CURRENT-PWA_assessment-results-cards_mobile.png"), fullPage: false, animations: "disabled" });

  await openSubmissionPanel(page);
  await assertSubmissionMobileCard(page);
  await page.screenshot({ path: path.join(artifactDir, "CURRENT-PWA_assessment-submissions-card_mobile.png"), fullPage: false, animations: "disabled" });

  await context.close();
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}

console.log("assessment mobile cards: grading, results, and submissions render cards without visible tables, clipping, or overflow");
