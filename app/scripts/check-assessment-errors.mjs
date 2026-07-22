import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4176";
let viteServer;

async function ensureServer() {
  if (process.env.TEST_BASE_URL) return;
  viteServer = spawn(
    "node_modules/.bin/vite",
    ["--host", "127.0.0.1", "--port", "4176"],
    { stdio: "ignore" },
  );
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out starting the assessment error test server");
}

await ensureServer();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "block" });

await context.addInitScript(() => {
  localStorage.setItem("mms_token", "assessment-error-test-token");
  localStorage.setItem("mms_tenant", "suffa");
});

await context.route("**/api/v1/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  let status = 200;
  let body = [];

  if (pathname === "/api/v1/auth/me") {
    body = {
      user: {
        id: "principal-1",
        username: "admin",
        role: "principal",
        status: "active",
        preferred_language: "en",
        selected_session_id: null,
      },
      madrasa: { id: "madrasa-1", slug: "suffa", name: "Suffa Madrasa" },
      permissions: ["grading.schemes.manage", "assessments.exam_types.manage"],
      features: { assessments: true },
    };
  } else if (pathname === "/api/v1/academics/today") {
    body = { gregorian: "22 Jul 2026", hijri: "7 Safar 1448 AH" };
  } else if (pathname === "/api/v1/academics/classes") {
    body = [{ id: "class-1", program_id: "program-1", name: "Class 1", default_portal_enabled: true }];
  } else if (pathname === "/api/v1/academics/classes/class-1/courses") {
    body = [{ id: "course-1", name: "Nazra" }];
  } else if (pathname === "/api/v1/assessments/grading-plan" && request.method() === "GET") {
    body = {
      id: "plan-1",
      course_id: "course-1",
      class_id: null,
      name: "Nazra grading",
      assignment_weightage: 0,
      components: [{ id: "component-1", name: "Final exam", weightage: 100 }],
      bands: [{ label: "Pass", min_score: 0, max_score: 100 }],
    };
  } else if (pathname === "/api/v1/assessments/grading-plan" && request.method() === "PUT") {
    status = 422;
    body = {
      detail: [{
        type: "greater_than",
        loc: ["body", "components", 0, "weightage"],
        msg: "Input should be greater than 0",
        input: 0,
        ctx: { gt: 0 },
      }],
    };
  }

  await route.fulfill({
    status,
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
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/assessments/setup`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Course").selectOption("course-1");
  await page.getByLabel("Scheme name").waitFor();
  if (await page.getByLabel("Scheme name").inputValue() !== "Nazra grading") {
    throw new Error("The grading plan did not load before the save check");
  }

  const response = page.waitForResponse((candidate) => (
    new URL(candidate.url()).pathname === "/api/v1/assessments/grading-plan"
      && candidate.request().method() === "PUT"
  ));
  await page.getByRole("button", { name: "Save grading plan" }).click();
  if ((await response).status() !== 422) throw new Error("The mocked save did not return 422");

  await page.waitForTimeout(100);
  if (pageErrors.length) throw new Error(`The 422 response crashed React: ${pageErrors.join(" | ")}`);
  await page.getByText("components.0.weightage: Input should be greater than 0", { exact: true }).waitFor({ timeout: 2_000 });

  console.log("assessment errors: FastAPI 422 details render as text without crashing React");
} finally {
  await context.close();
  await browser.close();
  viteServer?.kill("SIGTERM");
}
