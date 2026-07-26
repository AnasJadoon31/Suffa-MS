import { chromium } from "@playwright/test";
import { ensureViteServer } from "./lib/vite-server.mjs";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4197";
const viewport = process.env.TEST_VIEWPORT === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };

await ensureViteServer({ baseUrl, port: 4197 });

let replacePosts = 0;
let removePosts = 0;
let presignPosts = 0;
let uploadPuts = 0;
let submittedKey = "submissions/original-homework.pdf";

function assignment(overrides) {
  return {
    id: "assignment-1",
    class_id: "class-1",
    section_id: "section-1",
    course_id: "course-1",
    title: "Memorisation recording",
    category: "Homework",
    instructions: "Upload the completed recitation.",
    attachment_key: null,
    due_date: "2027-01-15T12:00:00Z",
    max_marks: 20,
    weightage: 20,
    target_student_ids: null,
    created_by_id: "teacher-1",
    batch_id: null,
    created_at: "2026-07-26T00:00:00Z",
    class_name: "Hifz Level 1",
    section_name: "A",
    course_name: "Quran Memorization",
    teacher_name: "Ustad Ahmad",
    submission_file_key: submittedKey,
    submission_mark: null,
    submission_feedback: null,
    submitted_at: "2026-07-26T09:00:00Z",
    ...overrides,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block", viewport });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "my-assessments-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/mock-upload/**", async (route) => {
  if (route.request().method() === "PUT") uploadPuts += 1;
  await route.fulfill({ status: 200, body: "" });
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  let body = [];
  if (pathname === "/api/v1/auth/me") {
    body = {
      user: {
        id: "student-user-1",
        username: "ali.noor",
        role: "student",
        status: "active",
        preferred_language: "en",
        is_principal_delegate: false,
        selected_session_id: null,
      },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: [],
      features: {},
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "26 Jul 2026", hijri: "11 Safar 1448 AH" };
  } else if (pathname === "/api/v1/academics/sessions") {
    body = [{ id: "session-1", name: "2026–27", gregorian_start: "2026-01-01", gregorian_end: "2027-12-31", hijri_span: "1448", is_active: true }];
  } else if (pathname === "/api/v1/assessments/results/me") {
    body = { session_id: "session-1", student_id: "student-1", published: false, overall_score: null, course_results: [] };
  } else if (pathname === "/api/v1/assessments/assignments") {
    body = [
      assignment({}),
      assignment({
        id: "assignment-2",
        title: "Past deadline worksheet",
        due_date: "2025-01-15T12:00:00Z",
        submission_file_key: "submissions/past.pdf",
      }),
    ];
  } else if (pathname === "/api/v1/files/presign-upload") {
    presignPosts += 1;
    body = { object_key: "submissions/replacement-homework.pdf", upload_url: `${baseUrl}/mock-upload/replacement-homework.pdf` };
  } else if (pathname === "/api/v1/files/presign-download") {
    body = { url: `${baseUrl}/mock-download/original-homework.pdf` };
  } else if (pathname === "/api/v1/assessments/assignments/assignment-1/submissions" && request.method() === "POST") {
    replacePosts += 1;
    submittedKey = request.postDataJSON().file_key;
    body = {
      id: "submission-1",
      assignment_id: "assignment-1",
      student_id: "student-1",
      submitted_at: "2026-07-26T10:00:00Z",
      file_key: submittedKey,
      mark: null,
      feedback: null,
      is_late: false,
    };
  } else if (pathname === "/api/v1/assessments/assignments/assignment-1/submissions/me" && request.method() === "DELETE") {
    removePosts += 1;
    submittedKey = null;
    body = { status: "deleted" };
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
  await page.goto(`${baseUrl}/my-assessments`, { waitUntil: "domcontentloaded" });
  await page.getByText("Memorisation recording").waitFor();

  const headers = (await page.locator(".dataRow.header").first().innerText()).toLowerCase();
  for (const header of ["assignment", "due date", "instructions", "submission / actions"]) {
    if (!headers.includes(header)) throw new Error(`missing My Assessments header ${header}: ${headers}`);
  }

  const activeAssignmentRow = page.locator(".dataRow", { hasText: "Memorisation recording" });
  await activeAssignmentRow.getByLabel("Replacement file").setInputFiles({
    name: "replacement-homework.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("replacement"),
  });
  const replaceButton = activeAssignmentRow.getByRole("button", { name: "Replace", exact: true });
  await page.waitForFunction(() => [...document.querySelectorAll("button")]
    .some((button) => button.textContent?.trim() === "Replace" && !button.disabled));
  await Promise.all([
    page.waitForRequest((request) => request.method() === "POST" && request.url().includes("/api/v1/assessments/assignments/assignment-1/submissions")),
    replaceButton.click(),
  ]);
  await page.waitForTimeout(100);
  if (replacePosts !== 1) {
    throw new Error(`replacement upload was not submitted once: ${JSON.stringify({ replacePosts, presignPosts, uploadPuts })}`);
  }

  if (await page.locator(".dataRow", { hasText: "Past deadline worksheet" }).getByRole("button", { name: "Remove" }).count()) {
    throw new Error("past-deadline assignment still exposes Remove submission");
  }
  if (await page.locator(".dataRow", { hasText: "Past deadline worksheet" }).getByRole("button", { name: "Replace", exact: true }).count()) {
    throw new Error("past-deadline assignment still exposes Replace submission");
  }

  await activeAssignmentRow.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("dialog", { name: "Confirm" }).getByRole("button", { name: "OK" }).click();
  await page.getByRole("button", { name: "Submit" }).waitFor();
  if (removePosts !== 1) {
    throw new Error(`remove submission was not called once: ${removePosts}`);
  }

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    labels: [...document.querySelectorAll(".assessmentStudentRow:not(.header) > span")].map((span) => span.getAttribute("data-label")),
  }));
  if (geometry.scrollWidth > geometry.clientWidth) {
    throw new Error(`My Assessments overflowed: ${JSON.stringify(geometry)}`);
  }
  for (const label of ["Assignment / course", "Due date", "Instructions", "Submission / actions"]) {
    if (!geometry.labels.includes(label)) throw new Error(`missing card label ${label}: ${JSON.stringify(geometry)}`);
  }

  if (process.env.TEST_SCREENSHOT) {
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true, animations: "disabled" });
  }

  console.log("my assessments: headers, replacement, removal, and deadline-hidden actions passed");
} finally {
  await context.close();
  await browser.close();
}
